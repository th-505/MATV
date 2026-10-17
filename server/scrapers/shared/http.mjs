// server/scrapers/shared/http.mjs
// SSRF-safe HTTP client with redirect validation, IPv6/IPv4 normalization, DNS rebinding protection, rate limiting, and anti-ban headers
import net from 'node:net';
import dns from 'node:dns';
import { Agent } from 'undici';
import { buildAntiBanHeaders } from '../anti-ban.mjs';
import {
  SCRAPER_ERROR_CODES,
  ScraperError,
  classifyNetworkError,
  isCloudflareOrAccessBlock
} from './errors.mjs';

const HOST_SEMAPHORES = new Map();
const MAX_CONCURRENT_PER_HOST = 4;
const MIN_DELAY_BETWEEN_REQ_MS = 60;

export function isPrivateIPv4(ip) {
  const parts = String(ip || '').split('.').map((n) => parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // Link-local / Cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF protocol / TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // Benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // Multicast / reserved / broadcast
  return false;
}

/**
 * Expands any valid IPv6 string into 8 16-bit integer groups (0..65535) for comprehensive SSRF inspection.
 */
function parseIPv6Groups(rawIp) {
  let ip = String(rawIp || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  const zoneIdx = ip.indexOf('%');
  if (zoneIdx !== -1) ip = ip.slice(0, zoneIdx);

  // Handle embedded dotted-quad IPv4 at the end of IPv6 (e.g., ::ffff:127.0.0.1)
  if (ip.includes('.')) {
    const lastColon = ip.lastIndexOf(':');
    if (lastColon === -1) return null;
    const v4Part = ip.slice(lastColon + 1);
    const v4Nums = v4Part.split('.').map((n) => parseInt(n, 10));
    if (v4Nums.length !== 4 || v4Nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
    const high = ((v4Nums[0] << 8) | v4Nums[1]).toString(16);
    const low = ((v4Nums[2] << 8) | v4Nums[3]).toString(16);
    ip = `${ip.slice(0, lastColon)}:${high}:${low}`;
  }

  const dblParts = ip.split('::');
  if (dblParts.length > 2) return null;

  const left = dblParts[0] ? dblParts[0].split(':') : [];
  const right = dblParts.length === 2 && dblParts[1] ? dblParts[1].split(':') : [];

  const missing = 8 - (left.length + right.length);
  if ((dblParts.length === 1 && missing !== 0) || missing < 0) return null;

  const fullHex = dblParts.length === 2 ? [...left, ...Array(missing).fill('0'), ...right] : left;
  if (fullHex.length !== 8) return null;

  const groups = [];
  for (const g of fullHex) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    groups.push(parseInt(g, 16));
  }
  return groups;
}

function groupsToIPv4(hi16, lo16) {
  return `${(hi16 >> 8) & 0xff}.${hi16 & 0xff}.${(lo16 >> 8) & 0xff}.${lo16 & 0xff}`;
}

export function isPrivateIPv6(ip) {
  const groups = parseIPv6Groups(ip);
  if (!groups) return true; // Malformed IPv6 is treated as unsafe

  const allZeroPrefix = groups.slice(0, 5).every((g) => g === 0);

  // Unspecified ::/128 or Loopback ::1/128
  if (allZeroPrefix && groups[5] === 0 && groups[6] === 0 && (groups[7] === 0 || groups[7] === 1)) {
    return true;
  }

  // IPv4-mapped ::ffff:0:0/96 or IPv4-compatible ::/96 or SIIT ::ffff:0:0:0/96
  if (allZeroPrefix && (groups[5] === 0xffff || groups[5] === 0)) {
    const v4 = groupsToIPv4(groups[6], groups[7]);
    if (isPrivateIPv4(v4)) return true;
  }
  if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0xffff && groups[5] === 0) {
    const v4 = groupsToIPv4(groups[6], groups[7]);
    if (isPrivateIPv4(v4)) return true;
  }

  // NAT64 well-known prefix 64:ff9b::/96 or 64:ff9b:1::/48
  if (groups[0] === 0x0064 && groups[1] === 0xff9b) {
    const v4 = groupsToIPv4(groups[6], groups[7]);
    if (isPrivateIPv4(v4)) return true;
  }

  // 6to4 2002::/16 embeds IPv4 in groups[1] and groups[2]
  if (groups[0] === 0x2002) {
    const v4 = groupsToIPv4(groups[1], groups[2]);
    if (isPrivateIPv4(v4)) return true;
  }

  // Teredo 2001:0000::/32 embeds obfuscated IPv4 in groups[6]^0xffff and groups[7]^0xffff
  if (groups[0] === 0x2001 && groups[1] === 0x0000) {
    const v4 = groupsToIPv4(groups[6] ^ 0xffff, groups[7] ^ 0xffff);
    if (isPrivateIPv4(v4)) return true;
  }

  // Documentation 2001:db8::/32
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true;

  // Unique Local fc00::/7 (fc00..fdff)
  if ((groups[0] & 0xfe00) === 0xfc00) return true;

  // Link-Local fe80::/10 (fe80..febf) and Site-Local fec0::/10
  if ((groups[0] & 0xffc0) === 0xfe80 || (groups[0] & 0xffc0) === 0xfec0) return true;

  // Multicast ff00::/8
  if ((groups[0] & 0xff00) === 0xff00) return true;

  return false;
}

export function isUnsafeIpAddress(ip = '') {
  const clean = String(ip || '').trim().replace(/^\[|\]$/g, '');
  const version = net.isIP(clean);
  if (version === 4) return isPrivateIPv4(clean);
  if (version === 6) return isPrivateIPv6(clean);
  if (clean.includes(':')) return isPrivateIPv6(clean);
  return true;
}

export function isUnsafeHostname(hostname = '') {
  const raw = String(hostname || '').trim().toLowerCase();
  const host = raw.replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.invalid') ||
    host.endsWith('.arpa') ||
    host === '0.0.0.0'
  ) {
    return true;
  }

  if (raw.startsWith('[') || host.includes(':')) {
    return isPrivateIPv6(host);
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) return isPrivateIPv4(host);
  if (ipVersion === 6) return isPrivateIPv6(host);

  // Block octal/hex/integer IPv4 representations (e.g. 2130706433, 0x7f000001, 0177.0.0.1)
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) return true;
  if (/^[0-9x.]+$/i.test(host)) return true;

  return false;
}

export function assertSafeScraperUrl(rawUrl, options = {}) {
  const { allowHttp = false, allowedHosts = null } = options;
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'URL_REQUIRED');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, `INVALID_URL: ${rawUrl}`, { url: rawUrl });
  }

  const allowedProtocols = allowHttp ? ['https:', 'http:'] : ['https:'];
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new ScraperError(
      SCRAPER_ERROR_CODES.UNSAFE_URL,
      `PROTOCOL_NOT_ALLOWED: ${parsed.protocol}`,
      { url: rawUrl }
    );
  }

  if (parsed.username || parsed.password) {
    throw new ScraperError(
      SCRAPER_ERROR_CODES.UNSAFE_URL,
      'CREDENTIALS_NOT_ALLOWED_IN_URL',
      { url: rawUrl }
    );
  }

  if (isUnsafeHostname(parsed.hostname)) {
    throw new ScraperError(
      SCRAPER_ERROR_CODES.UNSAFE_URL,
      `SSRF_PRIVATE_OR_LOCAL_HOST_BLOCKED: ${parsed.hostname}`,
      { url: rawUrl }
    );
  }

  if (Array.isArray(allowedHosts) && allowedHosts.length > 0) {
    const hostLower = parsed.hostname.toLowerCase();
    const matched = allowedHosts.some((allowed) => {
      const clean = String(allowed || '').toLowerCase();
      return hostLower === clean || hostLower.endsWith(`.${clean}`);
    });
    if (!matched) {
      throw new ScraperError(
        SCRAPER_ERROR_CODES.UNSAFE_URL,
        `HOST_NOT_IN_ALLOWLIST: ${parsed.hostname}`,
        { url: rawUrl }
      );
    }
  }

  return parsed;
}

/**
 * Resolves DNS records for a hostname and blocks any domain that resolves to a private,
 * loopback, link-local, or reserved IPv4/IPv6 address (preventing DNS rebinding / nip.io SSRF).
 */
export async function assertSafeResolvedHost(hostname, options = {}) {
  const cleanHost = String(hostname || '').trim().replace(/^\[|\]$/g, '');
  if (isUnsafeHostname(cleanHost)) {
    throw new ScraperError(
      SCRAPER_ERROR_CODES.UNSAFE_URL,
      `SSRF_PRIVATE_OR_LOCAL_HOST_BLOCKED: ${hostname}`
    );
  }

  // If already a validated literal public IP, no DNS lookup required
  if (net.isIP(cleanHost) !== 0) {
    return [cleanHost];
  }

  if (options.skipDnsResolution === true) {
    return [];
  }

  const lookupFn = options.dnsLookupImpl || ((host) => dns.promises.lookup(host, { all: true, verbatim: true }));
  let records;
  try {
    records = await lookupFn(cleanHost);
  } catch (err) {
    // DNS failure (ENOTFOUND / EAI_AGAIN) is a network/access error, not an SSRF bypass
    throw classifyNetworkError(err, { url: `https://${cleanHost}` });
  }

  const list = Array.isArray(records) ? records : records ? [records] : [];
  if (list.length === 0) {
    throw new ScraperError(SCRAPER_ERROR_CODES.ACCESS_BLOCKED, `DNS_EMPTY_RECORDS: ${cleanHost}`);
  }

  const addresses = [];
  for (const rec of list) {
    const addr = typeof rec === 'string' ? rec : rec?.address;
    if (!addr || isUnsafeIpAddress(addr)) {
      throw new ScraperError(
        SCRAPER_ERROR_CODES.UNSAFE_URL,
        `SSRF_DNS_RESOLVED_TO_PRIVATE_IP: ${cleanHost} -> ${addr || 'unknown'}`
      );
    }
    addresses.push(addr);
  }

  return addresses;
}

export function createPinnedDnsLookup(hostname, address) {
  const expectedHost = String(hostname || '').toLowerCase();
  const pinnedAddress = String(address || '');
  const family = net.isIP(pinnedAddress);
  if (!expectedHost || !family || isUnsafeIpAddress(pinnedAddress)) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'INVALID_PINNED_DNS_ADDRESS');
  }
  return (requestedHost, options, callback) => {
    if (String(requestedHost || '').toLowerCase() !== expectedHost) {
      callback(new Error('PINNED_DNS_HOST_MISMATCH'));
      return;
    }
    if (options?.all) callback(null, [{ address: pinnedAddress, family }]);
    else callback(null, pinnedAddress, family);
  };
}

export function resolveSafeUrl(href, baseUrl, options = {}) {
  if (!href || typeof href !== 'string') return '';
  const trimmed = href.trim();
  if (!trimmed || /^(javascript|data|mailto|tel|vbscript|file|about):/i.test(trimmed)) {
    return '';
  }
  try {
    const resolved = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
    if (resolved.protocol === 'http:' && !options.allowHttp) {
      resolved.protocol = 'https:';
    }
    assertSafeScraperUrl(resolved.toString(), options);
    return resolved.toString();
  } catch {
    return '';
  }
}

async function acquireHostSlot(hostname) {
  let state = HOST_SEMAPHORES.get(hostname);
  if (!state) {
    state = { active: 0, lastAt: 0, queue: [] };
    HOST_SEMAPHORES.set(hostname, state);
  }

  if (state.active >= MAX_CONCURRENT_PER_HOST) {
    await new Promise((resolve) => state.queue.push(resolve));
  }

  state.active += 1;
  const now = Date.now();
  const waitMs = Math.max(0, state.lastAt + MIN_DELAY_BETWEEN_REQ_MS - now);
  state.lastAt = now + waitMs;
  if (waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs));
  }

  return () => {
    state.active = Math.max(0, state.active - 1);
    const next = state.queue.shift();
    if (next) next();
  };
}

export async function fetchSafeResponse(targetUrl, options = {}) {
  const {
    method = 'GET',
    headers: customHeaders = {},
    body = undefined,
    referer = '',
    cookies = '',
    timeoutMs = 10000,
    maxRedirects = 5,
    maxRetries = 1,
    allowHttp = true,
    allowedHosts = null,
    providerId = null,
    fetchImpl = globalThis.fetch,
    signal: externalSignal = null,
    dnsLookupImpl = null,
    skipDnsResolution = false
  } = options;

  let currentUrl = assertSafeScraperUrl(targetUrl, { allowHttp, allowedHosts }).toString();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let redirects = 0;
    let hopUrl = currentUrl;

    try {
      while (redirects <= maxRedirects) {
        const parsedHop = assertSafeScraperUrl(hopUrl, { allowHttp, allowedHosts });
        // Enforce DNS resolution SSRF check at initial request and every redirect hop
        // (unless a custom mock fetchImpl is injected without dnsLookupImpl in offline unit tests)
        if (fetchImpl === globalThis.fetch && skipDnsResolution) {
          throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'DNS_VALIDATION_CANNOT_BE_SKIPPED_FOR_NETWORK_FETCH', { url: hopUrl });
        }
        const shouldCheckDns = dnsLookupImpl !== null || (fetchImpl === globalThis.fetch && !skipDnsResolution);
        let resolvedAddresses = [];
        if (shouldCheckDns) {
          resolvedAddresses = await assertSafeResolvedHost(parsedHop.hostname, { dnsLookupImpl, skipDnsResolution });
        }
        if (externalSignal?.aborted) throw externalSignal.reason || new Error('REQUEST_ABORTED');

        const releaseSlot = await acquireHostSlot(parsedHop.hostname);
        const literalHost = parsedHop.hostname.replace(/^\[|\]$/g, '');
        const dispatcher = fetchImpl === globalThis.fetch && net.isIP(literalHost) === 0
          ? new Agent({ connect: { lookup: createPinnedDnsLookup(parsedHop.hostname, resolvedAddresses[0]) } })
          : null;

        const controller = new AbortController();
        const abortFromCaller = () => controller.abort(externalSignal?.reason || new Error('REQUEST_ABORTED'));
        if (externalSignal?.aborted) abortFromCaller();
        else externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const reqHeaders = {
            ...buildAntiBanHeaders(hopUrl, referer),
            ...customHeaders
          };
          if (cookies) reqHeaders['Cookie'] = cookies;

          const res = await fetchImpl(hopUrl, {
            method: redirects > 0 && method === 'POST' ? 'GET' : method,
            headers: reqHeaders,
            body: redirects > 0 ? undefined : body,
            redirect: 'manual',
            signal: controller.signal,
            ...(dispatcher ? { dispatcher } : {})
          });

          if ([301, 302, 303, 307, 308].includes(res.status)) {
            const location = res.headers?.get?.('location') || '';
            if (!location) {
              throw new ScraperError(SCRAPER_ERROR_CODES.ACCESS_BLOCKED, `REDIRECT_WITHOUT_LOCATION_${res.status}`, {
                providerId,
                url: hopUrl,
                status: res.status
              });
            }
            const nextParsed = new URL(location, hopUrl);
            assertSafeScraperUrl(nextParsed.toString(), { allowHttp, allowedHosts });
            try { await res.body?.cancel(); } catch {}
            hopUrl = nextParsed.toString();
            redirects += 1;
            continue;
          }

          const text = await res.text();

          if (isCloudflareOrAccessBlock(res.status, text, res.headers)) {
            throw new ScraperError(
              SCRAPER_ERROR_CODES.ACCESS_BLOCKED,
              `CLOUDFLARE_OR_WAF_CHALLENGE_HTTP_${res.status}`,
              { providerId, url: hopUrl, status: res.status }
            );
          }

          if (!res.ok) {
            if (res.status === 404 || res.status === 410) {
              return { ok: false, status: res.status, html: text, url: hopUrl, headers: res.headers };
            }
            throw new ScraperError(
              res.status === 403 || res.status === 429 || res.status >= 520
                ? SCRAPER_ERROR_CODES.ACCESS_BLOCKED
                : SCRAPER_ERROR_CODES.NETWORK_TIMEOUT,
              `HTTP_${res.status}_FETCHING_${hopUrl}`,
              { providerId, url: hopUrl, status: res.status }
            );
          }

          return {
            ok: true,
            status: res.status,
            html: text,
            url: hopUrl,
            headers: res.headers
          };
        } finally {
          clearTimeout(timer);
          externalSignal?.removeEventListener('abort', abortFromCaller);
          try { if (dispatcher) await dispatcher.close(); }
          finally { releaseSlot(); }
        }
      }

      throw new ScraperError(SCRAPER_ERROR_CODES.ACCESS_BLOCKED, 'TOO_MANY_REDIRECTS', {
        providerId,
        url: hopUrl
      });
    } catch (err) {
      const classified = classifyNetworkError(err, { providerId, url: hopUrl });
      const isRetryable =
        attempt < maxRetries &&
        classified.code === SCRAPER_ERROR_CODES.NETWORK_TIMEOUT &&
        classified.status !== 403 &&
        classified.status !== 404;

      if (!isRetryable) {
        throw classified;
      }

      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }

  throw new ScraperError(SCRAPER_ERROR_CODES.NETWORK_TIMEOUT, 'MAX_RETRIES_EXCEEDED', {
    providerId,
    url: currentUrl
  });
}

export async function fetchProviderHtml(targetUrl, options = {}) {
  // Always validate URL safety even when fixtureHtml is supplied
  assertSafeScraperUrl(targetUrl, {
    allowHttp: options.allowHttp ?? true,
    allowedHosts: options.allowedHosts ?? null
  });

  // Support offline fixture HTML injection for deterministic testing
  if (typeof options.fixtureHtml === 'string') {
    if (isCloudflareOrAccessBlock(options.fixtureStatus || 200, options.fixtureHtml, options.fixtureHeaders)) {
      throw new ScraperError(SCRAPER_ERROR_CODES.ACCESS_BLOCKED, 'CLOUDFLARE_CHALLENGE_IN_FIXTURE', {
        providerId: options.providerId,
        url: targetUrl,
        status: options.fixtureStatus || 403
      });
    }
    return {
      ok: (options.fixtureStatus || 200) < 400,
      status: options.fixtureStatus || 200,
      html: options.fixtureHtml,
      url: targetUrl,
      headers: new Map()
    };
  }

  return fetchSafeResponse(targetUrl, options);
}
