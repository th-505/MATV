import {supportsContent} from './content-scope.mjs';
import { createConcurrencyQueue } from './shared/concurrency.mjs';

export function identityTitle(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('ar')
    .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
    .replace(/^(?:(?:مشاهدة|تحميل|فيلم|مسلسل)\s+)+/g, '')
    .replace(/(?:الموسم|موسم|season)\s*\d+|(?:الحلقة|الحلقه|حلقة|episode)\s*\d+/gi, '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\b(?:19|20)\d{2}\b/g, '')
    .replace(/\s+(?:مترجم|مدبلج|كامل|اون لاين|أون لاين|HD|WEB-DL|BluRay).*$/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function matchesIdentity(hit, title, { year, type, allowMissingYear=false } = {}) {
  if (!identityTitle(title) || identityTitle(hit?.title) !== identityTitle(title)) return false;
  const expectedYear = String(year || '').match(/(?:19|20)\d{2}/)?.[0];
  const actualYear = String(hit?.year || hit?.title || '').match(/(?:19|20)\d{2}/)?.[0];
  if (expectedYear && actualYear && actualYear !== expectedYear) return false;
  if (expectedYear && !actualYear && !allowMissingYear) return false;
  const actualType = hit?.type === 'tv' ? 'series' : hit?.type;
  if (type && actualType && actualType !== type) return false;
  return true;
}

export function selectEpisode(episodes, season, episode) {
  return (Array.isArray(episodes) ? episodes : []).find(ep =>
    Number(ep.season_number ?? ep.season) === Number(season) &&
    Number(ep.episode_number ?? ep.episodeNumber ?? ep.number) === Number(episode));
}

export function directCandidate(server) {
  if (server?.kind === 'embed' || server?.type === 'embed' || server?.streamType === 'embed') return false;
  try {
    const u = new URL(server?.url || '');
    return u.protocol === 'https:' && /\.(mp4|m3u8)$/i.test(u.pathname);
  } catch { return false; }
}

export function createContentDiscovery({ entries, concurrency = 6, maxQueued = 200 } = {}) {
  const queue = createConcurrencyQueue({ concurrency, maxQueued });
  async function runProvider(entry, title, season = 1, episode = 1, options = {}) {
    const { meta, module: provider } = entry || {};
    if (!supportsContent(meta?.id,options)) return [];
    if (!meta?.capabilities?.search || !meta?.capabilities?.details || meta.mirrorOf ||
        typeof provider?.scrapeSearch !== 'function' || typeof provider?.scrapeDetails !== 'function') return [];
    return queue.run(async () => {
      const network = { strict:true, timeoutMs:5000, maxRetries:0 };
      const titles = [...new Set([title, ...(options.titleVariants || [])].filter(Boolean))].slice(0,2);
      let hit = null;
      for (const query of titles) {
        const hits = await provider.scrapeSearch(query, 1, network);
        hit = (Array.isArray(hits) ? hits : []).find(item => titles.some(alias=>matchesIdentity(item,alias,{...options,allowMissingYear:true})));
        if(hit)break;
      }
      if (!hit) return [];
      const target = hit.url || hit.ref || hit.id;
      if (!target) return [];
      let details = await provider.scrapeDetails(target, network);
      // Missing catalog years are checked on details; conflicts never reach playback.
      const observedYear=details?.year || hit.year || null;
      if(options.year && (!observedYear || String(options.year)!==String(observedYear).slice(0,4)))return [];
      let observedEpisode = null;
      const episodic = options.type === 'series' || hit.type === 'series' || hit.type === 'tv' || details?.type === 'series';
      if (episodic) {
        const ep = selectEpisode(details?.episodes, season, episode);
        const epTarget = ep?.url || ep?.ref || ep?.id;
        if (!epTarget) return [];
        observedEpisode = ep;
        details = await provider.scrapeDetails(epTarget, network);
      }
      return (Array.isArray(details?.servers) ? details.servers : []).filter(directCandidate).map((server, i) => ({
        ...server, provider: meta.id, code: `${meta.code || meta.id}-${i + 1}`,
        kind: 'direct', content_ref: options.ref || hit.ref || hit.id || target,
        season: episodic ? Number(season) : 0, episode: episodic ? Number(episode) : 0,
        observed_identity: { title: hit.title, year: observedYear,
          season: observedEpisode?.season_number ?? observedEpisode?.season ?? null,
          episode: observedEpisode?.episode_number ?? observedEpisode?.episodeNumber ?? observedEpisode?.number ?? null },
        identity_basis: 'provider-title-year', identity_verified: false,
      }));
    });
  }
  async function discover(title, season = 1, episode = 1, options = {}) {
    if (!String(title || '').trim()) return [];
    const settled = await Promise.allSettled(entries.map(async entry => {
      const streams=await runProvider(entry,title,season,episode,options);
      if(streams.length && options.onSources)await options.onSources(streams);
      return streams;
    }));
    const seen = new Set();
    return settled.flatMap(result => result.status === 'fulfilled' ? result.value : []).filter(item => {
      const key = `${item.provider}:${item.url}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  return Object.freeze({ discover, runProvider, metrics: queue.metrics });
}
