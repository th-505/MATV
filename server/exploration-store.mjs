// Server-only adapter: the caller's identity is established by Supabase Auth.
// No service credentials, access tokens or playback URLs are returned to clients.
import { createHash } from 'node:crypto';
const OWNER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIX = 'tatv:exploration:';
const MAX_ITEMS = 256;
const fields = ['provider', 'ref', 'title', 'savedAt', 'lastWatchedAt', 'season', 'episode', 'position'];
function normalizeEntry(value) {
  if (!value || typeof value !== 'object' || !/^[a-z0-9][a-z0-9_-]{1,29}$/.test(value.provider || '') ||
      typeof value.ref !== 'string' || !value.ref || Buffer.byteLength(value.ref) > 1536 || /[\u0000-\u001f]/.test(value.ref))
    throw Error('EXPLORATION_STORE_INVALID_ENTRY');
  const entry = Object.fromEntries(fields.map(key => [key, value[key] ?? null]));
  entry.title = String(entry.title || '').slice(0, 250);
  for (const name of ['savedAt', 'season', 'episode', 'position']) {
    if (typeof entry[name] !== 'number' || !Number.isFinite(entry[name]) || entry[name] < 0)
      throw Error('EXPLORATION_STORE_INVALID_ENTRY');
  }
  if (entry.lastWatchedAt !== null && (typeof entry.lastWatchedAt !== 'number' || !Number.isFinite(entry.lastWatchedAt) || entry.lastWatchedAt < 0))
    throw Error('EXPLORATION_STORE_INVALID_ENTRY');
  if (!Number.isInteger(entry.season) || entry.season > 100 || !Number.isInteger(entry.episode) || entry.episode > 100000 || entry.position > 604800)
    throw Error('EXPLORATION_STORE_INVALID_ENTRY');
  entry.key = JSON.stringify([entry.provider, entry.ref]);
  return entry;
}
function itemKey(entry) {
  return PREFIX + createHash('sha256').update(entry.key).digest('hex');
}
async function readJson(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) throw Error('EXPLORATION_STORE_BAD_RESPONSE');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw Error('EXPLORATION_STORE_RESPONSE_TOO_LARGE');
      chunks.push(Buffer.from(value));
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw Error('EXPLORATION_STORE_BAD_RESPONSE'); }
  } finally { await reader.cancel().catch(() => {}); }
}
export function createSupabaseExplorationStore({ url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchImpl = globalThis.fetch, timeoutMs = 5000, now = Date.now,
  // Roll out only after an additive migration permits the new kind.
  enabled = process.env.EXPLORATION_LIBRARY_ENABLED === 'true', kind = 'exploration' } = {}) {
  if (!enabled || !url || !key) return Object.freeze({ configured: false, kind,
    authenticate: async () => { throw Error(enabled ? 'EXPLORATION_NOT_CONFIGURED' : 'EXPLORATION_DISABLED'); } });
  const base = new URL(url);
  if (base.protocol !== 'https:' || !base.hostname.endsWith('.supabase.co') || base.username || base.password ||
      base.port || base.pathname !== '/' || base.search || base.hash) throw Error('SUPABASE_BAD_URL');
  if (key.startsWith('sb_publishable_')) throw Error('SUPABASE_SERVER_KEY_REQUIRED');
  if (kind !== 'exploration') throw Error('EXPLORATION_STORE_BAD_KIND');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw Error('EXPLORATION_STORE_BAD_TIMEOUT');
  async function request(path, token, params = {}, method = 'GET', body) {
    const target = new URL(path, base);
    for (const [name, value] of Object.entries(params)) target.searchParams.set(name, value);
    let response;
    try {
      response = await fetchImpl(target, { method, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
        headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
          ...(method !== 'GET' ? { Prefer: 'return=representation' } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch (error) {
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') throw Error('EXPLORATION_STORE_TIMEOUT');
      throw Error('EXPLORATION_STORE_NETWORK_ERROR');
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (path.startsWith('/auth/')) throw Error([401, 403].includes(response.status) ? 'AUTH_REQUIRED' : 'EXPLORATION_AUTH_UNAVAILABLE');
      // Do not expose PostgREST error bodies, keys or signed references.
      throw Error(`EXPLORATION_STORE_HTTP_${response.status}`);
    }
    return readJson(response, path.startsWith('/auth/') ? 65536 : 1024 * 1024);
  }
  async function authenticate(authorization) {
    const match = typeof authorization === 'string' && authorization.match(/^Bearer ([^\s]{1,8192})$/i);
    if (!match) throw Error('AUTH_REQUIRED');
    const token = match[1];
    const user = await request('/auth/v1/user', token);
    if (!user || !OWNER.test(user.id || '')) throw Error('AUTH_REQUIRED');
    const userId = user.id.toLowerCase();
    let snapshot = null;
    const scope = { user_id: `eq.${userId}`, kind: `eq.${kind}`, item_key: `like.${PREFIX}*` };
    function assertOwner(owner) { if (owner !== userId) throw Error('EXPLORATION_OWNER_MISMATCH'); }
    async function loadUser(owner) {
      assertOwner(owner);
      const rows = await request('/rest/v1/mitv_library', token, { ...scope,
        select: 'user_id,kind,item_key,metadata,updated_at,deleted,sync_revision', order: 'item_key.asc', limit: String(MAX_ITEMS + 1) });
      if (!Array.isArray(rows)) throw Error('EXPLORATION_STORE_BAD_RESPONSE');
      if (rows.length > MAX_ITEMS) throw Error('EXPLORATION_STORE_ITEM_LIMIT');
      snapshot = new Map();
      const result = [];
      for (const row of rows) {
        if (row.user_id !== userId || row.kind !== kind || !String(row.item_key || '').startsWith(PREFIX))
          throw Error('EXPLORATION_STORE_SCOPE_MISMATCH');
        if (row.metadata?.library !== 'exploration') throw Error('EXPLORATION_STORE_BAD_RESPONSE');
        const entry = normalizeEntry(row.metadata);
        if (itemKey(entry) !== row.item_key || !Number.isSafeInteger(Number(row.sync_revision)) || Number(row.sync_revision) < 1 || !Number.isFinite(Date.parse(row.updated_at)))
          throw Error('EXPLORATION_STORE_BAD_RESPONSE');
        snapshot.set(row.item_key, { row, entry });
        if (!row.deleted) result.push(entry);
      }
      return result;
    }
    async function saveUser(owner, entries) {
      assertOwner(owner);
      if (!snapshot) throw Error('EXPLORATION_STORE_LOAD_REQUIRED');
      if (!Array.isArray(entries) || entries.length > MAX_ITEMS) throw Error('EXPLORATION_STORE_ITEM_LIMIT');
      const desired = new Map();
      for (const value of entries) {
        const entry = normalizeEntry(value); const key = itemKey(entry);
        if (desired.has(key)) throw Error('EXPLORATION_STORE_DUPLICATE_ENTRY');
        desired.set(key, entry);
      }
      // Write only differences from this request's snapshot. A concurrent insert
      // from another request must never be mistaken for a deletion.
      for (const key of new Set([...snapshot.keys(), ...desired.keys()])) {
        const previous = snapshot.get(key); const next = desired.get(key);
        if (!next && previous?.row.deleted) continue;
        if (next && previous && !previous.row.deleted && JSON.stringify(next) === JSON.stringify(previous.entry)) continue;
        const metadata = { ...(next || previous.entry), library: 'exploration' };
        const updatedAt = new Date(Math.max(now(), previous ? Date.parse(previous.row.updated_at) + 1 : 0)).toISOString();
        const body = { metadata, deleted: !next, updated_at: updatedAt };
        let saved;
        if (previous) {
          saved = await request('/rest/v1/mitv_library', token, { ...scope, item_key: `eq.${key}`,
            sync_revision: `eq.${previous.row.sync_revision}` }, 'PATCH', body);
        } else {
          try {
            saved = await request('/rest/v1/mitv_library', token, {}, 'POST', {
              user_id: userId, kind, item_key: key, ...body });
          } catch (error) {
            if (error.message === 'EXPLORATION_STORE_HTTP_409') throw Error('EXPLORATION_STORE_CONFLICT');
            throw error;
          }
        }
        if (!Array.isArray(saved) || saved.length !== 1) throw Error('EXPLORATION_STORE_CONFLICT');
        snapshot.set(key, { row: saved[0], entry: next || previous.entry });
      }
    }
    return Object.freeze({ userId, loadUser, saveUser });
  }
  return Object.freeze({ configured: true, kind, authenticate });
}
