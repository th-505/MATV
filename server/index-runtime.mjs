import { searchTraceEvent } from './diagnostics/search-trace.mjs';
import { pathToFileURL } from "node:url";
import { createProductionServer } from "./index.mjs";
import { createTmdbRuntime } from "./tmdb-runtime.mjs";
import { createFallbackPlaybackRuntime } from "./fallback-runtime.mjs";

const ALLOWED_ORIGINS = new Set([
  "https://th-505.github.io",
  "https://theeb1230-dot.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const TMDB_ROUTES = new Set([
  "/api/v1/tmdb/status",
  "/api/v1/tmdb/catalog",
  "/api/v1/tmdb/search",
  "/api/v1/tmdb/details",
  "/api/v1/tmdb/season",
  "/api/v1/tmdb/trending",
]);

const FALLBACK_ROUTES = new Set([
  "/api/v1/fallback/status",
  "/api/v1/fallback/resolve",
  "/api/v1/fallback/probe",
  "/api/v1/fallback/media",
  "/api/v1/fallback/next",
]);

function applyCors(req, res) {
  const origin = String(req.headers.origin || "");
  if (origin && (ALLOWED_ORIGINS.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin.endsWith(".github.io"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Type,Content-Length,Content-Range,Accept-Ranges,X-MITV-Container,X-Trace-Id");
}

function sendJson(req, res, status, payload) {
  applyCors(req, res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(payload));
}

function errorStatus(message) {
  if (message === "TMDB_NOT_CONFIGURED") return 503;
  if (message === "TMDB_TIMEOUT") return 504;
  if (["TMDB_BAD_CATALOG_PATH", "TMDB_BAD_CATALOG_PARAMS"].includes(message)) return 400;
  if (["TMDB_RATE_LIMITED", "TMDB_BUSY"].includes(message)) return 429;
  if (["TMDB_BAD_REFERENCE", "TMDB_BAD_SEASON", "TMDB_SEASON_REQUIRES_SERIES"].includes(message)) return 400;
  if (["INVALID_TMDB_ID", "INVALID_MEDIA_TYPE", "INVALID_SEASON", "INVALID_EPISODE", "BAD_FALLBACK_REFERENCE", "BAD_FALLBACK_RANGE"].includes(message)) return 400;
  if (message === "FALLBACK_REFERENCE_EXPIRED" || message === "EMBEDDED_FALLBACK_DISABLED") return 410;
  if (["FALLBACK_MEDIA_TIMEOUT"].includes(message)) return 504;
  if (["NO_FALLBACK_PROVIDER_AVAILABLE"].includes(message)) return 503;
  if (["FALLBACK_HLS_PROXY_PENDING", "FALLBACK_MEDIA_NOT_DIRECT", "FALLBACK_MEDIA_UNSUPPORTED", "FALLBACK_MEDIA_CLASSIFICATION_CHANGED"].includes(message)) return 409;
  if (["FALLBACK_MEDIA_REDIRECT_REJECTED", "FALLBACK_MEDIA_BAD_STATUS", "FALLBACK_MEDIA_NETWORK_ERROR"].includes(message)) return 502;
  return 502;
}

function fallbackIdentity(url) {
  return {
    tmdbId: url.searchParams.get("tmdb_id"),
    type: url.searchParams.get("type"),
    season: url.searchParams.get("season"),
    episode: url.searchParams.get("episode"),
  };
}

export function createMitvRuntimeServer({
  baseServer = createProductionServer(),
  tmdbRuntime = createTmdbRuntime(),
  fallbackRuntime = createFallbackPlaybackRuntime(),
} = {}) {
  const [baseHandler] = baseServer.listeners("request");
  if (typeof baseHandler !== "function") throw new Error("BASE_REQUEST_HANDLER_MISSING");
  baseServer.removeAllListeners("request");
  baseServer.on("request", async (req, res) => {
    let url;
    try {
      url = new URL(req.url || "/", "http://localhost");
    } catch {
      return baseHandler(req, res);
    }

    if (TMDB_ROUTES.has(url.pathname)) {
      applyCors(req, res);
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
      }
      if (req.method !== "GET") return sendJson(req, res, 405, { status: "error", message: "METHOD_NOT_ALLOWED" });
      try {
        if (url.pathname === "/api/v1/tmdb/catalog") {
          const params = Object.create(null);
          for (const [key, value] of url.searchParams) {
            if (url.searchParams.getAll(key).length !== 1) throw Error('TMDB_BAD_CATALOG_PARAMS');
            if (key !== 'path') params[key] = value;
          }
          return sendJson(req, res, 200, await tmdbRuntime.catalog(url.searchParams.get('path'), params));
        }
        if (url.pathname === "/api/v1/tmdb/status") return sendJson(req, res, 200, tmdbRuntime.status());
        if (url.pathname === "/api/v1/tmdb/search") {
          const query = String(url.searchParams.get("q") || "").trim();
          if (query.length < 2) return sendJson(req, res, 200, { status: "success", source: "tmdb", data: [] });
          if (query.length > 120) return sendJson(req,res,400,{status:'error',message:'INVALID_QUERY'});
          const traces = baseServer.searchTraceStore;
          if (!traces) return sendJson(req,res,200,await tmdbRuntime.search(query));
          const session=url.searchParams.get('diagnostic_session')||'';
          const supplied=url.searchParams.get('platform')||'';
          const trace=traces.start({provider:'tmdb',query,platform:['tv','mobile','ios','desktop','web'].includes(supplied)?supplied:/Dart/i.test(req.headers['user-agent']||'')?'native-unknown':req.headers.origin?'web':'unknown',session:/^[a-f0-9-]{20,64}$/i.test(session)?session:null});
          res.setHeader('X-Trace-Id',trace.id);
          let payload;
          const items=await traces.run(trace,async()=>{payload=await tmdbRuntime.search(query);searchTraceEvent('parser_result',{raw_count:payload.data?.length||0});return payload.data||[];});
          return sendJson(req,res,200,{...payload,trace_id:trace.id,search_outcome:items.length?'results':'empty_unconfirmed'});
        }
        if (url.pathname === "/api/v1/tmdb/trending") {
          const type = String(url.searchParams.get("type") || "movie").trim();
          return sendJson(req, res, 200, await tmdbRuntime.trending(type));
        }
        const ref = String(url.searchParams.get("ref") || "").trim();
        if (!ref) return sendJson(req, res, 400, { status: "error", message: "TMDB_BAD_REFERENCE" });
        if (url.pathname === "/api/v1/tmdb/details") return sendJson(req, res, 200, await tmdbRuntime.details(ref));
        const season = String(url.searchParams.get("season") || "").trim();
        return sendJson(req, res, 200, await tmdbRuntime.season(ref, season));
      } catch (error) {
        const message = String(error?.message || "TMDB_FAILED");
        return sendJson(req, res, errorStatus(message), { status: "error", message });
      }
    }

    if (url.pathname === "/api/v1/fallback/media") {
      return sendJson(req,res,410,{status:"error",message:"MEDIA_PROXY_RETIRED_USE_DIRECT_PLAYBACK",media_proxy:false});
    }

    if (FALLBACK_ROUTES.has(url.pathname)) {
      applyCors(req, res);
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
      }
      if (req.method !== "GET") return sendJson(req, res, 405, { status: "error", message: "METHOD_NOT_ALLOWED" });
      try {
        if (url.pathname === "/api/v1/fallback/status") return sendJson(req, res, 200, fallbackRuntime.status());
        if (url.pathname === "/api/v1/fallback/resolve") return sendJson(req, res, 200, await fallbackRuntime.resolve(fallbackIdentity(url)));
        const ref = String(url.searchParams.get("ref") || "").trim();
        if (url.pathname === "/api/v1/fallback/probe") return sendJson(req, res, 200, await fallbackRuntime.probe(ref));
        return sendJson(req, res, 200, fallbackRuntime.recordFailure(ref));
      } catch (error) {
        const message = String(error?.message || "FALLBACK_FAILED");
        return sendJson(req, res, errorStatus(message), { status: "error", message });
      }
    }

    return baseHandler(req, res);
  });
  return baseServer;
}

export function startMitvRuntimeServer({ port = Number(process.env.PORT || 3000) } = {}) {
  process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT_EXCEPTION]', err?.message || err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED_REJECTION]', reason?.message || reason);
  });

  const server = createMitvRuntimeServer();
  return server.listen(port, "0.0.0.0", () => {
    console.log(`MITV backend listening on ${port}`);
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath === import.meta.url) startMitvRuntimeServer();
