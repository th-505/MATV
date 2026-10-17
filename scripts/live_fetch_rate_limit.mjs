import { EnvHttpProxyAgent } from 'undici';

const originalFetch = globalThis.fetch.bind(globalThis);
const minIntervalMs = Math.max(500, Number(process.env.MATV_LIVE_MIN_INTERVAL_MS) || 1200);
const hasEnvProxy = Boolean(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy);
const envProxyDispatcher = hasEnvProxy ? new EnvHttpProxyAgent() : null;
let queue = Promise.resolve();
let lastStartedAt = 0;

globalThis.fetch = (input, init) => {
  const slot = queue.then(async () => {
    const waitMs = Math.max(0, lastStartedAt + minIntervalMs - Date.now());
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastStartedAt = Date.now();
  });
  queue = slot.catch(() => {});
  return slot.then(async () => {
    const requestUrl = typeof input === 'string' || input instanceof URL ? String(input) : input?.url || '';
    const host = (() => { try { return new URL(requestUrl).host; } catch { return 'unknown'; } })();
    const timestamp = new Date().toISOString();
    try {
      const fetchOptions = envProxyDispatcher && !init?.dispatcher
        ? { ...(init || {}), dispatcher: envProxyDispatcher }
        : init;
      const response = await originalFetch(input, fetchOptions);
      console.log(`[LIVE_HTTP] ${timestamp} ${init?.method || 'GET'} ${host} HTTP_${response.status}`);
      return response;
    } catch (error) {
      console.log(`[LIVE_HTTP] ${timestamp} ${init?.method || 'GET'} ${host} ERROR_${error?.cause?.code || error?.code || error?.name || 'NETWORK'}`);
      throw error;
    }
  });
};

if (envProxyDispatcher) process.on('beforeExit', () => { void envProxyDispatcher.close(); });
