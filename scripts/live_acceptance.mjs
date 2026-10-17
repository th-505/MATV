import { createServer } from '../server/app.mjs';
import { listProviders } from '../server/scrapers/registry.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).filter((x) => x.startsWith('--')).map((x) => {
  const i = x.indexOf('='); return i < 0 ? [x.slice(2), 'true'] : [x.slice(2, i), x.slice(i + 1)];
}));
const latestCount = Math.max(1, Math.min(10, Number(args.latest) || 3));
const randomCount = Math.max(0, Math.min(5, Number(args.random) || 1));
const seed = Number(args.seed) >>> 0 || 0x4d415456;
const intervalMs = Math.max(1000, Math.min(10000, Number(process.env.MATV_ACCEPTANCE_INTERVAL_MS) || 1200));
const timeoutMs = 12_000;
let lastRequestAt = 0;
let randomState = seed;
const now = () => new Date().toISOString();
const rand = (max) => { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0) % max; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function pace() { const due = lastRequestAt + intervalMs - Date.now(); if (due > 0) await wait(due); lastRequestAt = Date.now(); }
const providers = listProviders();
const selectedProviders = args.provider ? providers.filter((p) => p.id === args.provider) : providers;
if (args.provider && !selectedProviders.length) throw new Error(`Unknown provider: ${args.provider}`);

const server = createServer();
await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
const base = `http://127.0.0.1:${server.address().port}`;

async function api(path) {
  await pace();
  const started = now();
  let response;
  try {
    response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (response.status === 429) {
      const retrySeconds = Number(response.headers.get('retry-after'));
      const retryMs = Number.isFinite(retrySeconds) ? Math.max(1000, Math.min(30_000, retrySeconds * 1000)) : 5000;
      await response.body?.cancel();
      await wait(retryMs);
      await pace();
      response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
    }
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = null; }
    return { response, data, text, started };
  } catch (error) { return { response: null, data: null, text: '', started, error: String(error?.message || error) }; }
}

const classify = (x) => {
  const code = String(x.data?.error?.code || '').toUpperCase();
  if (/ACCESS|NETWORK|DNS|TIMEOUT|SUSPENDED|WAF|BLOCKED/.test(code)) return 'access_obstacle';
  if (/UNSUPPORTED|NOT_IMPLEMENTED|CAPABILITY/.test(code)) return 'unsupported';
  if (x.error || [401, 403, 407, 429, 502, 503, 504].includes(x.response?.status)) return 'access_obstacle';
  if (x.response?.status === 422 || x.data?.status === 'unsupported') return 'unsupported';
  if (x.data?.status === 'no_results' || x.data?.status === 'success' && Array.isArray(x.data.data) && x.data.data.length === 0) return 'no_search_result';
  if (x.data?.status === 'error' || (x.response && !x.response.ok)) return 'scraper_error';
  return 'ok';
};
const stage = (name, started, result, detail = {}) => ({ name, started_at: started, ended_at: now(), result, ...detail });
const identity = (item) => String(item?.ref || item?.id || item?.url || item?.href || '').trim();
const sameIdentity = (a, b) => {
  const clean = (s) => String(s || '').replace(/^(?:risto|ristoanime):(?:ep:)?/i, '').replace(/\/$/, '').toLowerCase();
  return Boolean(clean(a) && clean(a) === clean(b));
};
const mediaType = (s) => {
  if (/m3u8|master\.txt/i.test(s)) return 'hls';
  if (/\.mp4(?:\?|$)/i.test(s)) return 'mp4';
  if (/embed|iframe/i.test(s)) return 'embed';
  try { if (/^https?:\/\//i.test(s)) return 'embed'; } catch {}
  return 'unknown';
};
const workQuery = (title = '') => String(title).replace(/^(?:مشاهدة\s+)?(?:انمي|أنمي|مسلسل|فيلم)\s+/i, '')
  .replace(/\s*(?:الموسم|موسم|season)\s*\d+.*$/i, '')
  .replace(/\s*(?:الحلقة|الحلقه|episode|ep)\s*\d+.*$/i, '')
  .replace(/\s*(?:مترجمة|مترجم|مدبلجة|مدبلج|اون لاين|أون لاين|اونلاين|كامل)\s*$/gi, '').trim();
const titleKey = (title = '') => workQuery(title).toLocaleLowerCase('ar').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const contentKind = (item = {}) => {
  if (item.is_series === true || item.is_movie === false) return 'series';
  const value = String(item.type || item.mediaType || item.media_type || '').toLowerCase();
  if (/movie|film|فيلم/.test(value)) return 'movie';
  if (/series|anime|tv|مسلسل|انمي|أنمي/.test(value)) return 'series';
  const title = String(item.title || item.movie_title || '');
  if (/فيلم|\bmovie\b|\bfilm\b/i.test(title)) return 'movie';
  if (/مسلسل|انمي|أنمي|\bseries\b|\banime\b/i.test(title)) return 'series';
  return '';
};

async function boundedExternal(url, headers, range) {
  let parsed; try { parsed = new URL(url); } catch { return { result: 'scraper_error', error: 'invalid_media_url' }; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { result: 'scraper_error', error: 'unsupported_scheme' };
  const controller = AbortSignal.timeout(7000);
  let res;
  await pace();
  try { res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MATV-Acceptance/1.0)', ...headers, ...(range ? { Range: range } : {}) }, signal: controller, redirect: 'follow' }); }
  catch (e) { return { result: 'access_obstacle', error: String(e.message || e) }; }
  const common = { status: res.status, final_url: res.url, content_type: res.headers.get('content-type') || '' };
  if ([401, 403, 407, 429, 503].includes(res.status)) {
    const retryAfter = res.headers.get('retry-after') || '';
    await res.body?.cancel();
    if (res.status === 429) { const secs = Number(retryAfter); await wait(Number.isFinite(secs) ? Math.max(1000, Math.min(30_000, secs * 1000)) : 5000); }
    return { result: 'access_obstacle', ...common, retry_after: retryAfter };
  }
  if (!res.ok) { await res.body?.cancel(); return { result: 'scraper_error', ...common }; }
  const reader = res.body?.getReader();
  if (!reader) return { result: 'scraper_error', ...common, error: 'empty_body' };
  const chunks = []; let size = 0; const cap = 64 * 1024;
  try { while (size < cap) { const { value, done } = await reader.read(); if (done) break; const chunk = value.subarray(0, cap - size); chunks.push(chunk); size += chunk.byteLength; if (chunk.byteLength < value.byteLength) break; } }
  finally { await reader.cancel().catch(() => {}); }
  const bytes = Buffer.concat(chunks.map((x) => Buffer.from(x)));
  if (/text\/html|application\/xhtml/i.test(common.content_type) || /^\s*(?:<!doctype html|<html|<script)/i.test(bytes.toString('utf8', 0, 300))) return { result: 'scraper_error', ...common, error: 'html_is_not_media' };
  return { result: 'read', ...common, bytes_read: bytes.length, sample_hex: bytes.subarray(0, 16).toString('hex'), text: bytes.toString('utf8', 0, Math.min(bytes.length, cap)) };
}

async function verifyMedia(serverEntry) {
  const url = serverEntry?.url || serverEntry?.stream_url || serverEntry?.embedUrl || '';
  const kind = mediaType(`${serverEntry?.type || ''} ${serverEntry?.streamType || ''} ${url}`);
  if (!url || kind === 'unknown') return { result: serverEntry?.verified === false || kind === 'embed' ? 'embed_unverified' : 'unsupported', kind, url };
  if (kind === 'embed') return { result: 'embed_unverified', kind, url };
  const headers = serverEntry.headers || {};
  if (kind === 'mp4') {
    const probe = await boundedExternal(url, headers, 'bytes=0-63');
    if (probe.result !== 'read') return { ...probe, kind, url };
    const data = Buffer.from(probe.sample_hex || '', 'hex');
    const signature = data.length >= 8 && data.toString('ascii', 4, 8) === 'ftyp';
    return { result: signature ? 'resource_verified' : 'scraper_error', kind, url, status: probe.status, bytes_read: probe.bytes_read, signature: signature ? 'mp4_ftyp' : 'unrecognized', content_type: probe.content_type };
  }
  const manifest = await boundedExternal(url, headers);
  if (manifest.result !== 'read') return { ...manifest, kind, url };
  if (!manifest.text.trimStart().startsWith('#EXTM3U')) return { result: 'scraper_error', kind, url, error: 'invalid_hls_manifest', status: manifest.status };
  const child = manifest.text.split(/\r?\n/).find((line) => line.trim() && !line.startsWith('#'));
  if (!child) return { result: 'resource_verified', kind, url, status: manifest.status, manifest: 'valid_media_playlist_no_child' };
  const childUrl = new URL(child, url).toString();
  const sub = await boundedExternal(childUrl, headers);
  if (sub.result !== 'read' || !sub.text.trimStart().startsWith('#EXTM3U')) return { result: sub.result === 'access_obstacle' ? sub.result : 'scraper_error', kind, url, status: manifest.status, subplaylist: sub.result, error: sub.error || 'invalid_subplaylist' };
  const segment = sub.text.split(/\r?\n/).find((line) => line.trim() && !line.startsWith('#'));
  if (!segment) return { result: 'resource_verified', kind, url, status: manifest.status, subplaylist: 'valid_no_segment' };
  const firstSegment = new URL(segment, childUrl).toString();
  const seg = await boundedExternal(firstSegment, headers, 'bytes=0-1023');
  if (seg.result !== 'read') return { ...seg, kind, url, manifest: 'valid', subplaylist: 'valid' };
  return { result: seg.bytes_read > 0 ? 'resource_verified' : 'scraper_error', kind, url, status: manifest.status, subplaylist: 'valid', segment_status: seg.status, segment_bytes: seg.bytes_read, segment_sample_hex: seg.sample_hex };
}

async function runProvider(provider) {
  const providerStarted = now();
  const providerResult = { provider: provider.id, name: provider.name, domains: provider.domains, checked_domains: [], started_at: providerStarted, samples: [], result: 'incomplete' };
  if (provider.capabilities?.live) {
    const liveCall = await api('/api/v1/matches');
    const raw = liveCall.data?.data || liveCall.data?.matches || (Array.isArray(liveCall.data) ? liveCall.data : []);
    const active = (Array.isArray(raw) ? raw : []).filter((m) => /live|جارية|مباشر|in.?play/i.test(`${m.status || ''} ${m.state || ''} ${m.live || ''}`) || m.is_live === true);
    providerResult.live_list = stage('active_events', liveCall.started, liveCall.response?.ok ? active.length ? 'success' : 'no_active_sample_currently' : classify(liveCall), { http_status: liveCall.response?.status || null, active_count: active.length, error: liveCall.data?.error || liveCall.data?.message || liveCall.error || null });
    for (const match of active.slice(0, 3)) {
      const matchUrl = match.servers_url || match.serversUrl || match.url || match.ref;
      const sample = { provider: provider.id, selected_by: 'active_live_event', reference: matchUrl || '', title: match.title || match.name || '', type: 'live', started_at: now(), stages: [] };
      if (!matchUrl) { sample.result = 'scraper_error'; sample.stages.push(stage('match_reference', now(), 'scraper_error', { error: 'active_match_missing_server_reference' })); }
      else {
        const servers = await api(`/api/matches/servers?url=${encodeURIComponent(matchUrl)}`);
        const serverList = servers.data?.servers || servers.data?.data || [];
        sample.stages.push(stage('live_servers', servers.started, serverList.length ? 'success' : classify(servers), { http_status: servers.response?.status || null, server_count: serverList.length, error: servers.data?.message || servers.error || null }));
        sample.stages.push(stage('live_media', servers.started, serverList.length ? 'not_checked_without_media_resource_contract' : 'no_servers', { note: 'The live API did not expose a validated direct media resource to this harness.' }));
        sample.result = serverList.length ? 'embed_unverified' : 'scraper_error';
      }
      sample.ended_at = now(); providerResult.samples.push(sample);
    }
    providerResult.result = active.length ? 'active_events_checked' : liveCall.response?.ok ? 'no_active_sample_currently' : classify(liveCall);
    providerResult.ended_at = now(); return providerResult;
  }
  if (!provider.capabilities?.catalog) { providerResult.result = 'unsupported'; providerResult.ended_at = now(); return providerResult; }
  const categoryCall = await api(`/api/v1/provider/category?provider=${encodeURIComponent(provider.id)}&category=latest&page=1`);
  const categoryData = categoryCall.data?.data || [];
  const categoryCode = String(categoryCall.data?.error?.code || '').toUpperCase();
  const categoryOutcome = categoryCall.data?.status === 'unsupported' || /NOT_IMPLEMENTED|UNSUPPORTED/.test(categoryCode) ? 'unsupported'
    : /ACCESS|NETWORK|DNS|TIMEOUT|SUSPENDED|WAF|BLOCKED/.test(categoryCode) || /\/(?:login|signin)\/?$/i.test(categoryCall.data?.source_url || '') ? 'access_obstacle'
      : categoryCall.data?.status === 'error' ? 'scraper_error'
        : categoryData.length ? 'success' : 'no_catalog_results';
  providerResult.category = stage('latest_additions', categoryCall.started, categoryOutcome, { http_status: categoryCall.response?.status || null, source_url: categoryCall.data?.source_url || provider.domains?.[0], items_found: categoryData.length, error: categoryCall.data?.error || categoryCall.error || null });
  if (!categoryCall.data || classify(categoryCall) !== 'ok' || !categoryData.length) {
    providerResult.result = categoryOutcome;
    if (categoryCall.response?.ok) { try { providerResult.checked_domains.push(new URL(categoryCall.data?.source_url).hostname); } catch {} }
    providerResult.ended_at = now(); return providerResult;
  }
  const unique = [...new Map(categoryData.filter((x) => identity(x)).map((x) => [titleKey(x.title || x.name) || identity(x), x])).values()];
  const chosen = unique.slice(0, latestCount).map((item, i) => ({ item, selected_by: 'latest_additions', rank: i + 1, page: 1 }));
  if (randomCount) {
    const older = await api(`/api/v1/provider/category?provider=${encodeURIComponent(provider.id)}&category=latest&page=2`);
    const oldData = (older.data?.data || []).filter((x) => identity(x) && !chosen.some((c) => titleKey(c.item.title || c.item.name) === titleKey(x.title || x.name)));
    providerResult.older_page = stage('older_page_for_seeded_sample', older.started, classify(older), { http_status: older.response?.status || null, page: 2, items_found: oldData.length, error: older.data?.error || older.error || null });
    for (let i = 0; i < Math.min(randomCount, oldData.length); i++) { const [picked] = oldData.splice(rand(oldData.length), 1); chosen.push({ item: picked, selected_by: 'seeded_random_older_page', page: 2, seed }); }
  }
  const chosenTypes = new Set(chosen.map((x) => String(x.item.type || '').toLowerCase()));
  const missingType = chosenTypes.has('movie') ? 'series' : 'movie';
  if (!chosenTypes.has(missingType)) {
    const anime = /anime|witanime|ristoanime/i.test(provider.id);
    const typeCategory = anime ? (missingType === 'movie' ? 'anime_movies' : 'anime_series') : (missingType === 'movie' ? 'movies' : 'series');
    const typed = await api(`/api/v1/provider/category?provider=${encodeURIComponent(provider.id)}&category=${encodeURIComponent(typeCategory)}&page=1`);
    const completion = (typed.data?.data || []).find((x) => {
      const type = String(x.type || '').toLowerCase();
      const isMovie = type === 'movie' || /movie|film|فيلم/i.test(`${type} ${x.title || ''}`);
      const isSeries = type === 'series' || type === 'tv' || type === 'anime' || /series|anime|مسلسل|انمي|أنمي/i.test(`${type} ${x.title || ''}`);
      return identity(x) && (missingType === 'movie' ? isMovie : isSeries)
        && !chosen.some((c) => titleKey(c.item.title || c.item.name) === titleKey(x.title || x.name));
    });
    providerResult.type_completion = stage('missing_type_completion', typed.started, completion ? 'success' : typed.data?.status === 'unsupported' ? 'unsupported' : typed.data?.status === 'no_results' ? 'not_available' : classify(typed), { category: typeCategory, http_status: typed.response?.status || null, selected_ref: completion ? identity(completion) : null, error: typed.data?.error || typed.error || null });
    if (completion) chosen.push({ item: completion, selected_by: 'type_completion', page: 1 });
  }
  for (const choice of chosen) {
    const sampleStart = now();
    const item = choice.item;
    const ref = identity(item);
    const sample = { provider: provider.id, selected_by: choice.selected_by, catalog_category: choice.selected_by === 'type_completion' ? providerResult.type_completion?.category : 'latest', page: choice.page, seed: choice.seed ?? null, reference: ref, title: item.title || item.name || '', poster: item.poster || item.image || '', type: item.type || '', started_at: sampleStart, stages: [] };
    const query = workQuery(sample.title);
    const search = await api(`/api/v1/search?q=${encodeURIComponent(query)}&provider=${encodeURIComponent(provider.id)}`);
    const candidates = search.data?.data || [];
    const queryTokens = titleKey(query).split(' ').filter((token) => token.length > 1);
    const found = candidates.find((x) => sameIdentity(identity(x), ref))
      || candidates.find((x) => titleKey(x.title || x.name) === titleKey(sample.title))
      || candidates.find((x) => queryTokens.length > 0 && queryTokens.every((token) => titleKey(x.title || x.name).includes(token)));
    sample.stages.push(stage('search_identity', search.started, found ? 'candidate_found_identity_pending_details' : classify(search), { http_status: search.response?.status || null, query, candidate_ref: found ? identity(found) : null, identity_match: false, error: search.data?.error || search.error || null }));
    if (!found) { sample.result = classify(search) === 'ok' ? (search.data?.status === 'no_results' ? 'no_search_result' : 'scraper_error') : classify(search); sample.ended_at = now(); providerResult.samples.push(sample); continue; }
    sample.work_reference = identity(found);
    const detailsCall = await api(`/api/cinema/details?ref=${encodeURIComponent(sample.work_reference)}&refresh=1`);
    const details = detailsCall.data;
    const detailsIdentity = identity(details || {});
    const detailEpisodes = Array.isArray(details?.episodes) ? details.episodes : [];
    const linkedEpisode = detailEpisodes.find((ep) => sameIdentity(identity(ep), ref) || sameIdentity(ep.url || ep.href, item.url || item.href));
    const expectedKind = contentKind(item);
    const actualKind = contentKind(details || {});
    const typeMatches = !expectedKind || !actualKind || expectedKind === actualKind;
    const detailsOk = detailsCall.response?.ok && details && (sameIdentity(detailsIdentity, sample.work_reference) || sameIdentity(details.url || details.sourceUrl, found.url || found.href))
      && (sameIdentity(sample.work_reference, ref) || Boolean(linkedEpisode)) && typeMatches;
    const searchStage = sample.stages.find((x) => x.name === 'search_identity');
    if (searchStage && detailsOk) { searchStage.result = 'success'; searchStage.identity_match = true; searchStage.identity_evidence = linkedEpisode ? `selected card URL is an episode in ${sample.work_reference}` : 'exact stable reference'; }
    sample.stages.push(stage('details', detailsCall.started, detailsOk ? 'success' : detailsCall.data?.status === 'unsupported' ? 'unsupported' : detailsCall.response?.ok && !typeMatches ? 'scraper_error' : classify(detailsCall), { http_status: detailsCall.response?.status || null, identity_match: Boolean(detailsOk), type_matches: typeMatches, expected_kind: expectedKind, actual_kind: actualKind, linked_episode_ref: linkedEpisode ? identity(linkedEpisode) || linkedEpisode.url : null, title: details?.title || details?.movie_title || '', type: details?.type || details?.mediaType || '', error: detailsCall.data?.message || detailsCall.error || null }));
    if (!detailsOk) { sample.result = classify(detailsCall) === 'ok' ? 'scraper_error' : classify(detailsCall); sample.ended_at = now(); providerResult.samples.push(sample); continue; }
    let episodes = detailEpisodes;
    if (/series|anime|tv/i.test(`${sample.type} ${details.type || ''}`)) {
      const episodeCall = await api(`/api/v1/provider/episodes?ref=${encodeURIComponent(ref)}`);
      if (episodeCall.data?.status === 'success' && episodeCall.data.data?.length) episodes = episodeCall.data.data;
      const originalOrder = episodes.map((e) => ({ season: Number(e.season) || 1, number: Number(e.number ?? e.episodeNumber) || 0 }));
      episodes = [...episodes].sort((a, b) => (Number(a.season) || 1) - (Number(b.season) || 1) || (Number(a.number ?? a.episodeNumber) || 0) - (Number(b.number ?? b.episodeNumber) || 0));
      const episodeCode = String(episodeCall.data?.error?.code || '').toUpperCase();
      const episodeOutcome = episodeCall.data?.status === 'success' && episodeCall.data.data?.length ? 'success' : episodeCall.data?.status === 'unsupported' || /NOT_IMPLEMENTED|UNSUPPORTED/.test(episodeCode) ? 'unsupported' : /ACCESS|NETWORK|DNS|TIMEOUT|SUSPENDED|WAF|BLOCKED/.test(episodeCode) ? 'access_obstacle' : 'scraper_error';
      sample.stages.push(stage('episode_list', episodeCall.started, episodeOutcome, { http_status: episodeCall.response?.status || null, episode_count: episodes.length, observed_order: originalOrder, tested_order: episodes.map((e) => ({ season: Number(e.season) || 1, number: Number(e.number ?? e.episodeNumber) || null })), order_normalized_ascending: true, error: episodeCall.data?.error || episodeCall.error || null }));
    }
    const checks = episodes.length ? [episodes[0], ...(episodes.length > 1 ? [episodes.at(-1)] : [])] : [null];
    let allMediaResults = [];
    for (const [episodeIndex, episode] of checks.entries()) {
      const episodeRef = episode ? identity(episode) || episode.url || episode.href : ref;
      const resolveCall = await api(`/api/v1/resolve?ref=${encodeURIComponent(episodeRef)}`);
      const servers = resolveCall.data?.servers || [];
      const resolveUnsupported = !provider.capabilities?.resolve || !provider.capabilities?.servers;
      const resolveResult = servers.length ? 'success' : resolveUnsupported ? 'unsupported' : classify(resolveCall) === 'ok' ? 'scraper_error' : classify(resolveCall);
      const record = { episode: episode?.title || 'item', episode_ref: episodeRef, episode_number: episode?.number ?? episode?.episodeNumber ?? null, resolve_stage: stage('resolve_servers', resolveCall.started, resolveResult, { http_status: resolveCall.response?.status || null, server_count: servers.length, error: resolveCall.data?.error || resolveCall.data?.message || resolveCall.error || null }), media_checks: [] };
      for (const candidate of servers.slice(0, 2)) {
        const checkedAt = now();
        const media = await verifyMedia(candidate);
        record.media_checks.push({ server: candidate.name || candidate.provider || '', server_type: candidate.type || candidate.streamType || '', started_at: checkedAt, ended_at: now(), ...media });
        allMediaResults.push(media.result);
        if (media.result === 'resource_verified') break;
      }
      record.result = record.media_checks.some((m) => m.result === 'resource_verified') ? 'resource_verified' : record.media_checks.some((m) => m.result === 'embed_unverified') ? 'embed_unverified' : record.media_checks.length ? record.media_checks.at(-1).result : resolveUnsupported ? 'unsupported' : servers.length ? 'embed_unverified' : 'scraper_error';
      sample.stages.push(record);
    }
    sample.result = allMediaResults.includes('resource_verified') ? 'resource_verified' : allMediaResults.includes('embed_unverified') ? 'embed_unverified' : allMediaResults.includes('access_obstacle') ? 'access_obstacle' : sample.stages.some((x) => x.result === 'unsupported') ? 'unsupported' : 'scraper_error';
    sample.ended_at = now(); providerResult.samples.push(sample);
  }
  providerResult.ended_at = now();
  const results = providerResult.samples.map((s) => s.result);
  providerResult.result = results.length && results.every((x) => x === 'resource_verified') ? 'resource_checks_passed'
    : results.length && results.every((x) => x === 'no_search_result') ? 'no_search_result'
      : results.some((x) => x === 'resource_verified') ? 'partial_resource_checks'
        : results.length ? 'tested_with_failures_or_unverified' : 'no_search_result';
  providerResult.result_counts = Object.fromEntries([...new Set(results)].map((x) => [x, results.filter((y) => y === x).length]));
  const checkedHosts = new Set();
  const recordHost = (value) => { try { const raw = String(value || '').replace(/^[a-z0-9_-]+:(?=https?:\/\/)/i, ''); const host = new URL(raw).hostname; if (host && !['127.0.0.1', 'localhost'].includes(host)) checkedHosts.add(host); } catch {} };
  recordHost(providerResult.category?.source_url);
  for (const sample of providerResult.samples) {
    recordHost(sample.reference); recordHost(sample.work_reference);
    for (const group of sample.stages.filter((x) => Array.isArray(x.media_checks))) for (const check of group.media_checks) recordHost(check.final_url || check.url);
  }
  providerResult.checked_domains = [...checkedHosts];
  return providerResult;
}

const run = { started_at: now(), seed, latest_count: latestCount, random_count: randomCount, pacing_ms: intervalMs, request_timeout_ms: timeoutMs, application_base: 'in-process HTTP server', providers: [] };
try {
  for (const provider of selectedProviders) {
    console.log(`Live acceptance: ${provider.id}`);
    run.providers.push(await runProvider(provider));
  }
} finally {
  await new Promise((resolveClose) => server.close(() => resolveClose()));
}
run.ended_at = now();
const date = run.started_at.slice(0, 10);
const slug = args.provider || 'all';
const reportDir = resolve('reports'); mkdirSync(reportDir, { recursive: true });
const jsonPath = resolve(reportDir, `acceptance-live-${date}-${slug}.json`);
const mdPath = resolve(reportDir, `acceptance-live-${date}-${slug}.md`);
writeFileSync(jsonPath, JSON.stringify(run, null, 2) + '\n');
const rows = [];
for (const p of run.providers) for (const s of p.samples) {
  const episodeStages = s.stages.filter((x) => x.episode_ref);
  if (episodeStages.length) for (const e of episodeStages) rows.push(`| ${p.provider} | ${s.selected_by} (page ${s.page ?? '—'}) | ${s.title.replaceAll('|', '\\|')} — ${e.episode.replaceAll('|', '\\|')} | ${s.type || 'unknown'} | ${e.resolve_stage.started_at} – ${e.resolve_stage.ended_at} | ${e.result} | ${e.resolve_stage.result}; ${e.media_checks.map((m) => `${m.kind}:${m.result}`).join(', ') || 'no candidate'} |`);
  else rows.push(`| ${p.provider} | ${s.selected_by} (page ${s.page ?? '—'}) | ${s.title.replaceAll('|', '\\|')} | ${s.type || 'unknown'} | ${s.started_at} – ${s.ended_at} | ${s.result} | ${s.stages.map((x) => `${x.name}:${x.result}`).join('<br>')} |`);
}
const md = [`# Live acceptance — ${date}`, '', `Run: ${run.started_at} – ${run.ended_at} UTC. Seed: ${seed}. Serialized app HTTP requests, minimum spacing ${intervalMs} ms, per-request timeout ${timeoutMs} ms.`, '', '| Provider | Selection | Work / episode | Type | Test time (UTC) | Outcome | Stage evidence |', '|---|---|---|---|---|---|---|', ...rows, '', '## Provider summary', '', '| Provider | Result | Configured domains | Domains actually checked | Samples | Outcome counts |', '|---|---|---|---|---:|---|', ...run.providers.map((p) => `| ${p.provider} | ${p.result} | ${(p.domains || []).join(', ')} | ${(p.checked_domains || []).join(', ') || 'none reached'} | ${p.samples.length} | ${JSON.stringify(p.result_counts || {})} |`), '', 'An `embed_unverified` result is not playback success. Resource checks read only bounded manifest/Range samples. Flutter playback was not tested by this harness.', ''].join('\n');
writeFileSync(mdPath, md);
console.log(`Reports: ${jsonPath} ; ${mdPath}`);
