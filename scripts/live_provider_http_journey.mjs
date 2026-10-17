import assert from 'node:assert/strict';
import { EnvHttpProxyAgent } from 'undici';
import { createServer } from '../server/app.mjs';
import { fetchSafeResponse } from '../server/scrapers/shared/http.mjs';

const providerId = String(process.argv[2] || '').trim();
const query = String(process.argv[3] || '').trim();
assert.ok(providerId && query, 'usage: node scripts/live_provider_http_journey.mjs <provider-id> <query>');
const paceMs = Math.max(1000, Number(process.env.MATV_LIVE_MIN_INTERVAL_MS) || 1500);
const nativeFetch = globalThis.fetch.bind(globalThis);
const useProxy = Boolean(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy);
const proxyDispatcher = useProxy ? new EnvHttpProxyAgent() : null;
let fetchQueue = Promise.resolve();
let lastFetch = 0;
globalThis.fetch = (input, init = {}) => {
  const slot = fetchQueue.then(async () => {
    const delay = Math.max(0, lastFetch + paceMs - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastFetch = Date.now();
  });
  fetchQueue = slot.catch(() => {});
  return slot.then(async () => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input?.url || '';
    const { host, hostname } = (() => { try { const parsed = new URL(url); return parsed; } catch { return { host: 'unknown', hostname: '' }; } })();
    try {
      const response = await nativeFetch(input, {
        ...init,
        ...(proxyDispatcher && !init.dispatcher && !['127.0.0.1', 'localhost', '::1'].includes(hostname)
          ? { dispatcher: proxyDispatcher }
          : {})
      });
      console.log(`[JOURNEY_HTTP] ${new Date().toISOString()} ${init.method || 'GET'} ${host} HTTP_${response.status}`);
      return response;
    } catch (error) {
      console.log(`[JOURNEY_HTTP] ${new Date().toISOString()} ${init.method || 'GET'} ${host} ERROR_${error?.cause?.code || error?.code || error?.name}`);
      throw error;
    }
  });
};

const server = createServer({
  catalogStore: null,
  runtimeService: {
    version: 'live-http-journey',
    async search() { return { status: 'success', data: [] }; },
    status() { return { status: 'test-runtime' }; },
    async matches() { return { status: 'success', data: [] }; }
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const base = `http://127.0.0.1:${server.address().port}`;
const record = { provider: providerId, query, checked_at: new Date().toISOString(), stages: [] };
const stage = (name, result, extra = {}) => {
  const entry = { stage: name, result, ...extra };
  record.stages.push(entry);
  console.log(`[JOURNEY_STAGE] ${name}: ${result}${extra.note ? ` — ${extra.note}` : ''}`);
  return entry;
};

try {
  const searchUrl = new URL('/api/v1/search', base);
  searchUrl.searchParams.set('provider', providerId);
  searchUrl.searchParams.set('q', query);
  const searchResponse = await fetch(searchUrl);
  const searchPayload = await searchResponse.json();
  if (searchResponse.status === 422 || searchPayload.status === 'unsupported') {
    stage('search', 'unsupported_capability', { status: searchResponse.status });
    record.classification = 'unsupported_capability';
    process.exitCode = 3;
  } else if (!searchResponse.ok || !Array.isArray(searchPayload.data) || searchPayload.data.length === 0) {
    stage('search', searchPayload.status === 'no_results' ? 'no_results' : 'search_failed', {
      status: searchResponse.status, code: searchPayload.error?.code || searchPayload.error?.message || ''
    });
    record.classification = searchPayload.status === 'no_results' ? 'no_results' : 'search_or_access_error';
    process.exitCode = 1;
  } else {
    const item = searchPayload.data.find((row) => row.ref || row.id) || searchPayload.data[0];
    const ref = item.ref || item.id;
    stage('search', 'success', { status: searchResponse.status, result_count: searchPayload.data.length, ref_type: String(ref).split(':')[0] });

    const detailsUrl = new URL('/api/cinema/details', base);
    detailsUrl.searchParams.set('ref', ref);
    const detailsResponse = await fetch(detailsUrl);
    const details = await detailsResponse.json();
    if (!detailsResponse.ok || !details || !(details.movie_title || details.title)) {
      stage('details', 'scraper_error', { status: detailsResponse.status, code: details?.message || 'DETAILS_MISSING_TITLE' });
      record.classification = 'scraper_error';
      process.exitCode = 1;
    } else {
      const episodes = Array.isArray(details.episodes) ? details.episodes : [];
      stage('details', 'success', { status: detailsResponse.status, title: details.movie_title || details.title, episode_count: episodes.length });
      let targetRef = ref;
      if (episodes.length) {
        const episode = episodes[0];
        targetRef = episode.ref || episode.episode_id || episode.url || episode.id || ref;
        stage('episode', targetRef !== ref ? 'selected' : 'episode_reference_missing', {
          episode_number: episode.number || episode.episode_number || null
        });
      } else {
        stage('episode', 'not_applicable', { note: 'selected item has no episodes' });
      }

      const resolveUrl = new URL('/api/v1/resolve', base);
      resolveUrl.searchParams.set('ref', targetRef);
      const resolveResponse = await fetch(resolveUrl);
      const resolution = await resolveResponse.json();
      const servers = Array.isArray(resolution.servers) ? resolution.servers : [];
      if (!resolveResponse.ok || !servers.length) {
        stage('server', 'scraper_error', { status: resolveResponse.status, code: resolution.message || 'NO_SERVERS' });
        record.classification = 'scraper_error';
        process.exitCode = 1;
      } else {
        const direct = servers.find((source) => /\.(?:m3u8|mp4|mpd|webm|mkv)(?:$|\?)/i.test(source.url || '') || source.kind === 'direct');
        stage('server', 'success', { status: resolveResponse.status, count: servers.length, source_kind: direct ? 'direct' : 'embed' });
        if (!direct) {
          stage('resource', 'not_checked', { note: 'only an embed URL was returned; no playback claim' });
          record.classification = 'embed_only';
        } else {
          try {
            const resource = await fetchSafeResponse(direct.url, {
              method: 'HEAD', headers: direct.headers || {}, referer: direct.headers?.Referer || '',
              timeoutMs: 10000, maxRedirects: 3, maxRetries: 0, allowHttp: false
            });
            let contentType = resource.headers?.get?.('content-type') || '';
            let resourceOk = (resource.status === 200 || resource.status === 206) &&
              /(?:video\/|mpegurl|application\/octet-stream)/i.test(contentType) && !/text\/html/i.test(contentType);
            let probeStatus = resource.status;
            // Many media hosts omit Content-Type on HEAD. Verify only a tiny byte range, never download the stream.
            if (!resourceOk && (resource.status === 200 || resource.status === 206) && !contentType) {
              const probe = await fetch(direct.url, {
                method: 'GET', headers: { ...(direct.headers || {}), Range: 'bytes=0-31' }, redirect: 'manual'
              });
              probeStatus = probe.status;
              contentType = probe.headers.get('content-type') || '';
              const reader = probe.body?.getReader();
              const chunks = [];
              let size = 0;
              while (reader && size < 32) {
                const { value, done } = await reader.read();
                if (done) break;
                const part = value.subarray(0, 32 - size);
                chunks.push(part); size += part.length;
              }
              try { await reader?.cancel(); } catch {}
              const bytes = Buffer.concat(chunks.map((part) => Buffer.from(part)));
              const looksLikeMedia = bytes.includes(Buffer.from('ftyp')) || bytes.subarray(0, 7).toString().startsWith('#EXTM3U') ||
                (bytes.length > 0 && bytes[0] === 0x1a) || (bytes.length > 0 && bytes[0] === 0x47);
              resourceOk = (probe.status === 200 || probe.status === 206) &&
                (/(?:video\/|mpegurl|application\/octet-stream)/i.test(contentType) || looksLikeMedia) && !/text\/html/i.test(contentType);
            }
            stage('resource', resourceOk ? 'head_reachable' : 'resource_not_verified_as_media', {
              status: probeStatus, content_type: contentType
            });
            record.classification = resourceOk ? 'http_resource_reachable' : 'resource_error';
            if (!resourceOk) process.exitCode = 1;
          } catch (error) {
            stage('resource', 'access_or_resource_error', { code: error.code || error.message });
            record.classification = /UNSAFE_URL|SSRF/i.test(String(error.code || error.message)) ? 'unsafe_url_rejected' : 'access_obstacle';
            process.exitCode = 1;
          }
        }
      }
    }
  }
  console.log(`LIVE_HTTP_JOURNEY_RESULT ${JSON.stringify(record)}`);
} finally {
  await new Promise((resolve) => server.close(resolve));
  if (proxyDispatcher) await proxyDispatcher.close();
}
