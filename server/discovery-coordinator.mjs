// Background discovery coordinator: bounded, deduplicated, independent of HTTP lifetime.
// A persistent queue (Supabase/worker) is required before relying on this across restarts.
export function createDiscoveryCoordinator({ discover, persist = async () => {}, load = async () => null, now = Date.now,
  ttlMs = 7 * 86400_000, maxConcurrent = 3, maxQueued = 100 } = {}) {
  if (typeof discover !== 'function') throw Error('DISCOVERY_HANDLER_REQUIRED');
  const jobs = new Map();
  const queue = [];
  let active = 0;
  const keyOf = ({ ref, season = 0, episode = 0 }) => {
    if (!/^tmdb:(movie|tv):\d+$/.test(String(ref || ''))) throw Error('INVALID_TMDB_REF');
    return [ref, Number(season) || 0, Number(episode) || 0].join(':');
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
      }).catch(error => {
        job.state = 'failed';
        job.error = String(error?.message || error);
      }).finally(() => { active--; pump(); });
    }
  }
  function enqueue(input) {
    const key = keyOf(input);
    const previous = jobs.get(key);
    if (previous && (previous.state === 'queued' || previous.state === 'running' ||
        (previous.state === 'ready' && previous.expiresAt > now()))) return snapshot(previous);
    if (queue.length >= maxQueued) return { key, state: 'busy' };
    const job = { key, input: { ref: input.ref, title: String(input.title || '').slice(0, 250),
      year: String(input.year || '').slice(0, 4), season: Number(input.season) || 0,
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
    const job = jobs.get(keyOf(input));
    return job ? { ...snapshot(job), ...(job.state === 'ready' ? { result: job.result } : {}) } : { state: 'missing' };
  }
  return { enqueue, status, metrics: () => ({ active, queued: queue.length, cached: jobs.size }) };
}
