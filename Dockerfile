# syntax=docker/dockerfile:1
FROM node:24.22.1-bookworm-slim
ENV NODE_ENV=production PORT=8000
WORKDIR /app
# Refresh both the OS trust store and TLS libraries; Node's built-in CA fixes
# are supplied by the patched base runtime. Never disable certificate checks.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node package.json package-lock.json ./
# Optional CA mount supports local builds behind the managed environment proxy.
# Hosted builds use the normal certificate roots and do not require this mount.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --omit=dev --no-audit --no-fund
COPY --chown=node:node server/ ./server/
COPY --chown=node:node internal_web/ ./internal_web/
COPY --chown=node:node shared/ ./shared/
COPY --chown=node:node edge/src/provider.mjs edge/src/laroza.mjs ./edge/src/
# Fail the build if the production entrypoint has an uncopied dependency.
RUN node --input-type=module -e "await import('./server/index-runtime.mjs')"
USER node
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index-runtime.mjs"]
