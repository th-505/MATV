// Background discovery coordinator: bounded, deduplicated, independent of HTTP lifetime.
// A persistent queue (Supabase/worker) is required before relying on this across restarts.
export function createDiscoveryCoordinator({ discover, persist = async () => {}, load = async () => null, now = Date.now,
  ttlMs = 7 * 86400_000, maxConcurrent = 3, maxQueued = 100, maxCached = 256 } = {}) {
  if (typeof discover !== 'function') throw Error('DISCOVERY_HANDLER_REQUIRED');
  if (![ttlMs, maxConcurrent, maxQueued, maxCached].every(Number.isSafeInteger) ||
      ttlMs < 1 || maxConcurrent < 1 || maxQueued < 0 || maxCached < 1)
    throw Error('INVALID_DISCOVERY_LIMITS');
  const jobs = new Map();
  const queue = [];
  let active = 0;
  const keyOf = ({ ref, provider = '', season = 0, episode = 0 }) => {
    if (!/^tmdb:(movie|tv):\d+$/.test(String(ref || ''))) throw Error('INVALID_TMDB_REF');
    if (provider && !/^[a-z0-9][a-z0-9_-]{1,29}$/.test(provider)) throw Error('INVALID_PROVIDER');
    if (![Number(season), Number(episode)].every(n => Number.isSafeInteger(n) && n >= 0) ||
        Number(season) > 100 || Number(episode) > 100000) throw Error('INVALID_DISCOVERY_EPISODE');
    // A user's source preference is part of the shared job identity. Viewer IDs never are.
    return [ref, Number(season), Number(episode), ...(provider ? [provider] : [])].join(':');
  };
  function pump() {
    while (active < maxConcurrent && queue.length) {
      const job = queue.shift();
      if (job.state !== 'queued') continue;
      active++;
      job.state = 'running';
      Promise.resolve().then(async () => {
        const saved = await load(job.key).catch(() => null);
        if (saved?.payload && new Date(saved.expires_at).getTime() > now())
          return { result: saved.payload, expiresAt: new Date(saved.expires_at).getTime() };
        return { result: await discover(job.input), expiresAt: now() + ttlMs };
      }).then(async ({ result, expiresAt }) => {
        job.result = result;
        job.expiresAt = expiresAt;
        job.state = 'ready';
        try { await persist({ key: job.key, input: job.input, result, expiresAt: job.expiresAt }); }
        catch { /* cache persistence failure must not discard usable discovery results */ }
        evictExpired();
      }).catch(error => {
        job.state = 'failed';
        job.error = String(error?.message || error);
      }).finally(() => { active--; pump(); });
    }
  }
  function enqueue(input) {
    evictExpired();
    const key = keyOf(input);
    const previous = jobs.get(key);
    if (previous && (previous.state === 'queued' || previous.state === 'running' ||
        (previous.state === 'ready' && previous.expiresAt > now()))) return snapshot(previous);
    if (active >= maxConcurrent && queue.length >= maxQueued) return { key, state: 'busy' };
    const job = { key, input: { ref: input.ref, title: String(input.title || '').slice(0, 250),
      year: String(input.year || '').slice(0, 4), provider: String(input.provider || ''), season: Number(input.season) || 0,
      episode: Number(input.episode) || 0 }, state: 'queued', expiresAt: 0 };
    jobs.set(key, job);
    queue.push(job);
    pump();
    return snapshot(job);
  }
  function snapshot(job) {
    return { key: job.key, state: job.state, expiresAt: job.expiresAt || null,
      ...(job.state === 'failed' ? { error: job.error } : {}) };
  }
  function status(input) {
    evictExpired();
    const job = jobs.get(keyOf(input));
    return job ? { ...snapshot(job), ...(job.state === 'ready' ? { result: job.result } : {}) } : { state: 'missing' };
  }
  function evictExpired() {
    const current = now();
    for (const [key, job] of jobs) {
      if (job.state === 'ready' && job.expiresAt <= current) jobs.delete(key);
      if (job.state === 'failed' && !queue.includes(job)) jobs.delete(key);
    }
    // Bound completed results even when every request asks for a different work.
    const ready = [...jobs.values()].filter(job => job.state === 'ready');
    while (ready.length > maxCached) jobs.delete(ready.shift().key);
  }
  return { enqueue, status, evictExpired, metrics: () => ({ active, queued: queue.length, cached: jobs.size }) };
}

// Owner IDs must come from verified server authentication, never a request body.
// Adapters persist only a viewer's metadata/progress; shared discovery stores links separately.
export function createExplorationLibrary({ loadUser, saveUser, enqueue = () => {}, now = Date.now,
  idleMs = 7 * 86400_000 } = {}) {
  if (typeof loadUser !== 'function' || typeof saveUser !== 'function')
    throw Error('EXPLORATION_STORE_REQUIRED');
  if (!Number.isSafeInteger(idleMs) || idleMs < 1) throw Error('INVALID_EXPLORATION_TTL');
  const pendingOwners = new Map();
  function ownerId(owner) {
    if (typeof owner !== 'string' || !owner.trim() || owner.length > 128) throw Error('AUTH_REQUIRED');
    return owner;
  }
  function identity(input) {
    const provider = String(input.provider || '');
    const ref = String(input.ref || '');
    if (!/^[a-z0-9][a-z0-9_-]{1,29}$/.test(provider) || !ref || ref.length > 1536 || /[\u0000-\u001f]/.test(ref))
      throw Error('INVALID_EXPLORATION_REFERENCE');
    return { provider, ref, key: JSON.stringify([provider, ref]) };
  }
  function counter(value, max) {
    const number = Number(value ?? 0);
    if (!Number.isFinite(number) || number < 0 || number > max) throw Error('INVALID_WATCH_PROGRESS');
    return number;
  }
  function stale(entry) {
    return now() >= (entry.lastWatchedAt ?? entry.savedAt) + idleMs;
  }
  function publicEntry(entry) {
    return { ...structuredClone(entry), refreshNeeded: stale(entry) };
  }
  async function rows(owner) {
    const saved = await loadUser(owner);
    return Array.isArray(saved) ? structuredClone(saved) : [];
  }
  // Serialize writes for one viewer to avoid losing two simultaneous progress updates.
  async function mutate(owner, operation) {
    ownerId(owner);
    const previous = pendingOwners.get(owner) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      const entries = await rows(owner);
      const result = await operation(entries);
      await saveUser(owner, entries);
      return result;
    });
    pendingOwners.set(owner, task);
    try { return await task; }
    finally { if (pendingOwners.get(owner) === task) pendingOwners.delete(owner); }
  }
  async function list(owner) {
    ownerId(owner);
    await pendingOwners.get(owner);
    return (await rows(owner)).map(publicEntry);
  }
  async function save(owner, input) {
    const target = identity(input);
    const result = await mutate(owner, entries => {
      let entry = entries.find(row => row.key === target.key);
      if (!entry) {
        entry = { ...target, title: String(input.title || '').slice(0, 250), savedAt: now(),
          lastWatchedAt: null, season: 0, episode: 0, position: 0 };
        entries.push(entry);
      }
      return publicEntry(entry);
    });
    // Saving or opening never counts as watching. Existing stale entries stay stale.
    await enqueue({ provider: target.provider, ref: target.ref, title: result.title,
      season: result.season, episode: result.episode });
    return result;
  }
  async function recordWatch(owner, input) {
    const target = identity(input);
    const position = counter(input.position, 86400 * 7);
    const playedSeconds = counter(input.playedSeconds, 120);
    const season = counter(input.season, 100);
    const episode = counter(input.episode, 100000);
    if (!Number.isInteger(season) || !Number.isInteger(episode)) throw Error('INVALID_WATCH_PROGRESS');
    return mutate(owner, entries => {
      const entry = entries.find(row => row.key === target.key);
      if (!entry) throw Error('EXPLORATION_ITEM_NOT_SAVED');
      // Heartbeats while paused, navigation and seeking cannot renew retention.
      if (playedSeconds > 0 && input.playing === true) {
        Object.assign(entry, { season, episode, position, lastWatchedAt: now() });
      }
      return publicEntry(entry);
    });
  }
  async function remove(owner, input) {
    const target = identity(input);
    return mutate(owner, entries => {
      const index = entries.findIndex(row => row.key === target.key);
      if (index >= 0) entries.splice(index, 1);
      return index >= 0;
    });
  }
  return Object.freeze({ list, save, recordWatch, remove });
}
