import { findPlayerStream, playbackResult } from './contract.mjs';

// Dean Edwards substitutions, including base62 and whitespace around arguments.
// Source code is never evaluated or executed.
export function unpack3iskPlayer(html) {
  const match = html.match(/\}\s*\(\s*'((?:\\.|[^'\\])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\.|[^'\\])*)'\s*\.split\(\s*'\|'\s*\)/);
  if (!match) return html;
  const radix = Number(match[2]), count = Number(match[3]);
  if (radix < 2 || radix > 62 || count > 4096) throw new Error('3ISK_BAD_PACKER');
  const literal = value => value.replace(/\\(['\\/])/g, '$1');
  let payload = literal(match[1]);
  if (payload.length > 100_000 || match[4].length > 100_000) throw new Error('3ISK_BAD_PACKER');
  const words = literal(match[4]).split('|');
  const digits = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const encode = value => value < radix ? digits[value] : encode(Math.floor(value / radix)) + digits[value % radix];
  for (let i = count - 1; i >= 0; i--) if (words[i]) payload = payload.replace(new RegExp('\\b' + encode(i) + '\\b', 'g'), () => words[i]);
  return payload;
}

export async function resolveMiravd({ playerUrl, wrapperUrl, page, now }) {
  const html = await page(playerUrl.href, { referer: wrapperUrl.href });
  return playbackResult(findPlayerStream(unpack3iskPlayer(html)), 'miravd', now);
}
