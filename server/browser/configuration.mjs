import { createBrowserStore } from "./store.mjs";
import {
  installBrowserConfigs,
  browserConfigs,
  runInBrowserLane,
} from "./traffic.mjs";
import { validateProviderConfig } from "../scrapers/shared/provider-config.mjs";
import { getProvider } from "../scrapers/registry.mjs";
export function createBrowserConfiguration({
  store = createBrowserStore(),
  now = Date.now,
} = {}) {
  let pending = null,
    next = 0,
    available = false;
  async function refresh() {
    if (!store) return;
    if (pending) return pending;
    if (now() < next) return;
    pending = (async () => {
      try {
        const rows = await store.configs();
        installBrowserConfigs(rows);
        available = true;
        next = now() + 30000;
      } catch {
        available = false;
        next = now() + 120000;
      } finally {
        pending = null;
      }
    })();
    return pending;
  }
  void refresh();
  const timer = setInterval(() => void refresh(), 30000);
  timer.unref?.();
  return {
    refresh,
    status: () => ({ cloud_available: available, providers: browserConfigs() }),
    async set(provider, patch, revision) {
      if (!store) throw Error("BROWSER_CLOUD_NOT_CONFIGURED");
      if (!getProvider(provider) || getProvider(provider).meta.mirrorOf)
        throw Error("SOURCE_NOT_SUPPORTED");
      if (!Number.isSafeInteger(revision) || revision < 0)
        throw Error("INVALID_REVISION");
      await refresh();
      const current = browserConfigs().find((r) => r.provider === provider);
      const config = validateProviderConfig({ ...current?.config, ...patch });
      const rows = await store.setConfig(provider, config, revision);
      if (!Array.isArray(rows) || !rows.length)
        throw Error("CONFIG_REVISION_CONFLICT");
      const fresh = rows[0];
      installBrowserConfigs([
        ...browserConfigs().filter((r) => r.provider !== provider),
        fresh,
      ]);
      available = true;
      return {
        applied: true,
        scope: "beta",
        provider,
        revision: fresh.revision,
        domain: runInBrowserLane(() => getProvider(provider).meta.domains[0]),
      };
    },
    close: () => clearInterval(timer),
  };
}
