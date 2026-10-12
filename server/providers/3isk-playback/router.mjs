import { load } from 'cheerio';
import { ISK_ORIGIN } from './contract.mjs';
import { resolveUkrcdn } from './ukrcdn.mjs';
import { resolveMiravd } from './miravd.mjs';

export function selectPlayerIframe(html, wrapper) {
  const wrapperUrl = new URL(wrapper);
  if (wrapperUrl.origin !== ISK_ORIGIN || wrapperUrl.username || wrapperUrl.password ||
      !/^\/embed\/\d+\/\d+\/[12]\/$/.test(wrapperUrl.pathname) || wrapperUrl.search || wrapperUrl.hash) throw new Error('3ISK_BAD_WRAPPER');
  const $ = load(html);
  for (const node of $('iframe[src]').toArray()) {
    let playerUrl;
    try { playerUrl = new URL($(node).attr('src'), wrapperUrl); } catch { continue; }
    if (playerUrl.protocol !== 'https:' || playerUrl.username || playerUrl.password || playerUrl.port || playerUrl.search || playerUrl.hash) continue;
    let extractor;
    switch (playerUrl.hostname) {
      case 'ukrcdn.club':
      case 'ukrcdn.com':
        if (/^\/e\/[a-zA-Z0-9-]+\/?$/.test(playerUrl.pathname)) extractor = 'ukrcdn';
        break;
      case 'miravd.com':
        if (/^\/embed-[a-zA-Z0-9]+\.html$/.test(playerUrl.pathname)) extractor = 'miravd';
        break;
    }
    if (extractor) return { extractor, playerUrl, wrapperUrl };
  }
  throw new Error('3ISK_PLAYER_NOT_FOUND');
}

export function resolvePlayer(route, options) {
  switch (route.extractor) {
    case 'ukrcdn': return resolveUkrcdn({ ...route, ...options });
    case 'miravd': return resolveMiravd({ ...route, ...options });
    default: throw new Error('3ISK_UNSUPPORTED_PLAYER');
  }
}
