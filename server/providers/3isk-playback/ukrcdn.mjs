import { ISK_ORIGIN, findPlayerStream, playbackResult } from './contract.mjs';

export async function resolveUkrcdn({ playerUrl, page, now }) {
  const html = await page(playerUrl.href, { referer: ISK_ORIGIN + '/' });
  const literal = html.match(/\bfetch\(\s*("(?:\\.|[^"\\])*")/);
  let stream;
  if (literal) {
    const api = new URL(JSON.parse(literal[1]), playerUrl);
    if (api.origin !== playerUrl.origin || !/^\/api\/videos\/[a-zA-Z0-9-]+\/playback$/.test(api.pathname)) throw new Error('3ISK_BAD_PLAYBACK_API');
    const payload = JSON.parse(await page(api.href, { referer: playerUrl.href, json: true }));
    stream = payload.url;
  } else {
    stream = findPlayerStream(html);
  }
  return playbackResult(stream, 'ukrcdn', now);
}
