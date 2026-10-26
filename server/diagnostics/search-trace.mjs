import { load } from 'cheerio';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID, timingSafeEqual, createHash } from 'node:crypto';
const context = new AsyncLocalStorage();
const QUERY_KEYS = new Set(['s', 'q', 'query', 'search', 'search_query', 'keyword', 'keywords', 'search_param', 'story', 'do', 'subaction', 'page', 'p']);
export function safeSearchUrl(raw) {
  try {
    const u = new URL(raw);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return null;
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) if (!QUERY_KEYS.has(key.toLowerCase())) u.searchParams.delete(key);
    return u.href.slice(0, 1600);
  } catch { return null; }
}
export function searchTraceEvent(stage, data = {}) {
  const trace = context.getStore();
  if (!trace || trace.finished || trace.events.length >= 100) return;
  const event = { stage, at_ms: Date.now() - trace.started_ms };
  for (const key of ['method','status','attempt','bytes','raw_count','kept_count','reason','duration_ms','challenge','content_type','html_title']) {
    if (data[key] !== undefined) event[key] = typeof data[key] === 'string' ? data[key].slice(0, 180) : data[key];
  }
  if (data.url) event.url = safeSearchUrl(data.url);
  if (data.location) event.location = safeSearchUrl(data.location);
  if (Array.isArray(data.titles)) event.titles = data.titles.slice(0, 8).map(x => String(x).slice(0, 160));
  if (Array.isArray(data.fields)) event.fields=data.fields.slice(0,15).map(x=>String(x).slice(0,60));
  trace.events.push(event);
}
export function searchTraceHtml(html, pageUrl) {
  if (!context.getStore()) return;
  const $ = load(String(html).slice(0,1500000));
  $('form').slice(0,20).each((_,form)=>{
    const fields=$(form).find('input[name],select[name]').map((_,el)=>$(el).attr('name')).get();
    if (!fields.some(name=>/^(s|q|search|query|search_query|keyword|keywords|story)$/i.test(name))) return;
    try { searchTraceEvent('search_form',{url:new URL($(form).attr('action')||pageUrl,pageUrl).href,method:($(form).attr('method')||'GET').toUpperCase(),fields}); } catch {}
  });
}
export function diagnosticsAuthorized(req, token = process.env.DIAGNOSTICS_TOKEN || '') {
  if (token.length < 24) return false;
  const supplied = String(req.headers.authorization || '').replace(/^Bearer /, '');
  return timingSafeEqual(createHash('sha256').update(token).digest(), createHash('sha256').update(supplied).digest());
}
export function createSearchTraces({ maxEntries = 400, ttlMs = 3600000, now = Date.now, logger = () => {} } = {}) {
  const records = new Map();
  function prune() {
    for (const [id,t] of records) if (now() - t.started_ms > ttlMs) records.delete(id);
    while (records.size > maxEntries) records.delete(records.keys().next().value);
  }
  function start({ provider, query, platform = 'unknown', session = null }) {
    prune();
    const t = { id: randomUUID(), provider, query, platform, session, started_at: new Date(now()).toISOString(), started_ms: now(), state: 'running', events: [], result_count: null };
    records.set(t.id,t); prune();
    return t;
  }
  async function run(t, work) {
    return context.run(t, async () => {
      searchTraceEvent('server_received');
      try {
        const result = await work();
        t.state = result.length ? 'results' : 'empty_unconfirmed'; t.result_count = result.length;
        searchTraceEvent('response_ready', { kept_count: result.length });
        return result;
      } catch (error) {
        t.state = 'error'; t.reason = /^[A-Z][A-Z0-9_]{2,69}$/.test(error.code || error.message) ? error.code || error.message : 'SEARCH_FAILED';
        searchTraceEvent('search_failed', { reason: t.reason });
        throw error;
      } finally {
        t.duration_ms = now() - t.started_ms; t.finished = true;
        // Queries, result titles, cookies, IPs and credentials are not written to logs.
        logger({ event: 'search_trace', trace_id: t.id, provider: t.provider, state: t.state, reason: t.reason || null, result_count: t.result_count, duration_ms: t.duration_ms });
      }
    });
  }
  function list({ provider = '', query = '', id = '' } = {}) {
    prune(); return [...records.values()].filter(t => (!provider || t.provider === provider) && (!id || t.id === id) && (!query || t.query.includes(query))).reverse().slice(0,100).map(({started_ms,finished,...t}) => structuredClone(t));
  }
  return { start, run, list, retention_seconds: ttlMs / 1000 };
}
