import { createRateLimiter, getClientAddress } from './hardening.mjs';
const ORIGINS = new Set(['https://th-505.github.io','https://theeb1230-dot.github.io','http://localhost:8000','http://127.0.0.1:8000']);
export function allowedOrigin(value) {
  if (ORIGINS.has(value)) return true;
  return process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(value);
}
export function protectServer(server, {max = 180} = {}) {
  const handlers = server.listeners('request');
  const limit = createRateLimiter({max});
  server.removeAllListeners('request');
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 1000;
  server.on('request', (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    if (process.env.RENDER || req.socket.encrypted) res.setHeader('Strict-Transport-Security','max-age=31536000');
    const origin = String(req.headers.origin || '');
    if (origin && !allowedOrigin(origin)) {
      res.writeHead(403,{'Content-Type':'application/json','Cache-Control':'no-store'});
      return res.end(JSON.stringify({message:'ORIGIN_NOT_ALLOWED'}));
    }
    if ((req.url || '').length > 8192) { res.writeHead(414); return res.end(); }
    const rate = limit(getClientAddress(req));
    if (!rate.ok) {
      res.writeHead(429,{'Content-Type':'application/json','Retry-After':String(rate.retryAfterSec),'Cache-Control':'no-store'});
      return res.end(JSON.stringify({message:'RATE_LIMITED'}));
    }
    for (const handler of handlers) {
      Promise.resolve().then(()=>handler(req,res)).catch(()=>{
        if (!res.headersSent) res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});
        if (!res.writableEnded) res.end(JSON.stringify({message:'INTERNAL_ERROR'}));
      });
    }
  });
  return server;
}
