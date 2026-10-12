import { resolveMiravd } from '../../../server/providers/3isk-playback/miravd.mjs';
import { ISK_UA } from '../../../server/providers/3isk-playback/contract.mjs';
import { TOKEN_SHA256 } from './auth-config.mjs';

const json = (status, body) => new Response(JSON.stringify(body), { status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export function createMetadataHandler({ fetchImpl = fetch, tokenHash = TOKEN_SHA256, now = Date.now } = {}) {
  return async request => {
    // Custom server authentication is mandatory, even with gateway JWT off.
    const token = request.headers.get('x-matv-resolver-key') || '';
    if (!token || token.length > 256) return json(401, { status: 'error', message: 'UNAUTHORIZED' });
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
    const expected = Uint8Array.from(tokenHash.match(/../g), value => parseInt(value, 16));
    let mismatch = digest.length ^ expected.length;
    for (let i = 0; i < digest.length; i++) mismatch |= digest[i] ^ expected[i];
    if (mismatch) return json(401, { status: 'error', message: 'UNAUTHORIZED' });
    if (request.method !== 'POST') return json(405, { status: 'error', message: 'METHOD_NOT_ALLOWED' });
    try {
      const text = await request.text();
      if (text.length > 4096) return json(413, { status: 'error', message: 'BODY_TOO_LARGE' });
      const body = JSON.parse(text);
      const playerUrl = new URL(body.player_url), wrapperUrl = new URL(body.wrapper_url);
      if (playerUrl.origin !== 'https://miravd.com' || playerUrl.username || playerUrl.password || playerUrl.search || playerUrl.hash ||
          !/^\/embed-[a-zA-Z0-9]+\.html$/.test(playerUrl.pathname) ||
          wrapperUrl.origin !== 'https://3iskk.xyz' || wrapperUrl.username || wrapperUrl.password || wrapperUrl.search || wrapperUrl.hash ||
          !/^\/embed\/\d+\/\d+\/[12]\/$/.test(wrapperUrl.pathname)) return json(400, { status: 'error', message: 'INVALID_SOURCE' });
      const page = async (url, { referer }) => {
        // No caller authentication header, cookies, or Supabase key reaches upstream.
        const response = await fetchImpl(url, { redirect: 'manual', referrer: referer, referrerPolicy: 'unsafe-url', signal: AbortSignal.timeout(20_000),
          headers: { Referer: referer, 'User-Agent': ISK_UA, Accept: 'text/html' } });
        if (!response.ok) {
          const reader = response.body?.getReader();
          const chunk = reader ? await reader.read() : null;
          await reader?.cancel();
          const snippet = new TextDecoder().decode(chunk?.value?.subarray(0, 8192) || new Uint8Array()).toLowerCase();
          const reason = snippet.includes('embeds disabled') ? 'embeds_disabled' : snippet.includes('you have been blocked') ? 'access_denied' : snippet.includes('just a moment') ? 'challenge' : 'http_rejected';
          throw Object.assign(new Error(`3ISK_HTTP_${response.status}`), { reason });
        }
        let html = '', size = 0;
        const decoder = new TextDecoder();
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) throw new Error('3ISK_PAGE_TOO_LARGE');
          html += decoder.decode(chunk, { stream: true });
        }
        return html + decoder.decode();
      };
      const playback = await resolveMiravd({ playerUrl, wrapperUrl, page, now });
      return json(200, { status: 'success', ...playback });
    } catch (error) {
      const message = /^3ISK_[A-Z0-9_]+$/.test(error.message) ? error.message : 'METADATA_RESOLUTION_FAILED';
      return json(502, { status: 'error', message, ...(error.reason ? { reason: error.reason } : {}) });
    }
  };
}

if (globalThis.Deno) Deno.serve(createMetadataHandler());
