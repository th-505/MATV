import { AsyncLocalStorage } from "node:async_hooks";
import {
  withProviderConfigs,
  validateProviderConfig,
} from "../scrapers/shared/provider-config.mjs";
const lane = new AsyncLocalStorage();
let configs = [];
export function installBrowserConfigs(rows) {
  configs = (rows || []).map((row) => ({
    ...row,
    config: validateProviderConfig(row.config || {}),
  }));
}
export const browserConfigs = () => structuredClone(configs);
export const runInBrowserLane = (task) =>
  lane.getStore() === "beta" ? task() : lane.run("beta", () => withProviderConfigs(configs, task, "beta"));
export const isBrowserTraffic = () => ["beta", "diagnostic"].includes(lane.getStore());

export const runInDiagnosticLane = (task) => lane.run("diagnostic", task);
