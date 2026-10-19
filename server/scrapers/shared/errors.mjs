// server/scrapers/shared/errors.mjs
// Unified error classification and diagnostic result wrappers for MATV providers

export const SCRAPER_ERROR_CODES = Object.freeze({
  EMPTY_RESULT: 'EMPTY_RESULT',
  UNSUPPORTED_CAPABILITY: 'UNSUPPORTED_CAPABILITY',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  ACCESS_BLOCKED: 'ACCESS_BLOCKED',
  STRUCTURE_CHANGED: 'STRUCTURE_CHANGED',
  SERVER_EXTRACTION_FAILED: 'SERVER_EXTRACTION_FAILED',
  STREAM_EXPIRED: 'STREAM_EXPIRED',
  UNSAFE_URL: 'UNSAFE_URL'
});

export class ScraperError extends Error {
  constructor(code, message, details = {}) {
    const validCode = SCRAPER_ERROR_CODES[code] || SCRAPER_ERROR_CODES.STRUCTURE_CHANGED;
    super(message || validCode);
    this.name = 'ScraperError';
    this.code = validCode;
    this.providerId = details.providerId || null;
    this.url = details.url || null;
    this.status = details.status ?? null;
    this.cause = details.cause || null;
    this.details = details;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      providerId: this.providerId,
      url: this.url,
      status: this.status
    };
  }
}

export function createScraperError(code, message, details = {}) {
  return new ScraperError(code, message, details);
}

export function isCloudflareOrAccessBlock(status, html = '', headers = null) {
  const getHeader = (name) => {
    if (!headers) return '';
    if (typeof headers.get === 'function') return String(headers.get(name) || '');
    return String(headers[name] || headers[name.toLowerCase()] || '');
  };

  const cfMitigated = getHeader('cf-mitigated').toLowerCase();
  if (cfMitigated.includes('challenge') || cfMitigated.includes('block')) {
    return true;
  }

  const body = String(html || '');
  if (
    /Just a moment\.\.\.|Attention Required! \| Cloudflare|cf-browser-verification|cf_chl_opt|challenge-platform\/h\/[bg]\/orchestrate|Enable JavaScript and cookies to continue|DDoS-Guard|_Incapsula_Resource|Request unsuccessful\. Incapsula|incident_id=|alliance4creativity\.com|seized by/i.test(
      body
    )
  ) {
    return true;
  }

  if (getHeader('x-iinfo') && /_Incapsula_Resource|incident_id/i.test(body)) {
    return true;
  }

  if ((status === 403 || status === 503 || status === 429) && /cloudflare|captcha|access denied|security check|incapsula/i.test(body)) {
    return true;
  }

  return false;
}

export function classifyNetworkError(err, context = {}) {
  if (err instanceof ScraperError) return err;

  const msg = String(err?.message || err || '');
  const causeCode = String(err?.cause?.code || err?.code || '');
  const combined = `${msg} ${causeCode}`;

  if (/UNSAFE_|SSRF|PRIVATE_IP|CREDENTIALS_NOT_ALLOWED|PROTOCOL_NOT_ALLOWED/i.test(combined)) {
    return new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, msg, { ...context, cause: err });
  }

  if (/AbortError|TimeoutError|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|TIMED_OUT|timeout/i.test(combined)) {
    return new ScraperError(SCRAPER_ERROR_CODES.NETWORK_TIMEOUT, msg || 'Network request timed out', {
      ...context,
      cause: err
    });
  }

  if (
    /ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|HTTP_403|HTTP_429|HTTP_520|HTTP_521|HTTP_522|CLOUDFLARE|ACCESS_BLOCKED/i.test(
      combined
    )
  ) {
    return new ScraperError(
      SCRAPER_ERROR_CODES.ACCESS_BLOCKED,
      msg || 'Access blocked by ISP, DNS, or WAF/Cloudflare',
      { ...context, cause: err }
    );
  }

  return new ScraperError(SCRAPER_ERROR_CODES.NETWORK_TIMEOUT, msg || 'Network failure', {
    ...context,
    cause: err
  });
}

/**
 * Attaches structured diagnostic metadata to an array or object result without breaking
 * callers that expect an Array (`Array.isArray(res) === true`) while allowing verifiers,
 * supervisors, and health monitors to inspect `res._meta` (`{ status, errorCode, errorMessage, providerId }`).
 */
export function attachResultMeta(target, meta = {}) {
  if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
    return target;
  }
  const normalizedMeta = {
    ok: meta.ok ?? (!meta.errorCode || meta.errorCode === SCRAPER_ERROR_CODES.EMPTY_RESULT),
    errorCode: meta.errorCode || null,
    errorMessage: meta.errorMessage || null,
    providerId: meta.providerId || null,
    url: meta.url || null,
    timestamp: meta.timestamp || new Date().toISOString(),
    ...meta
  };
  Object.defineProperty(target, '_meta', {
    value: normalizedMeta,
    enumerable: false,
    configurable: true,
    writable: true
  });
  return target;
}

export function createEmptyArrayResult(providerId, errorCode = SCRAPER_ERROR_CODES.EMPTY_RESULT, errorMessage = '', extra = {}) {
  const arr = [];
  return attachResultMeta(arr, {
    ok: errorCode === SCRAPER_ERROR_CODES.EMPTY_RESULT,
    errorCode,
    errorMessage: errorMessage || errorCode,
    providerId,
    ...extra
  });
}
