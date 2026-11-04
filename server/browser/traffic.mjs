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
  lane.run("beta", () => withProviderConfigs(configs, task));
export const isBrowserTraffic = () => lane.getStore() === "beta";

export const runInDiagnosticLane = (task) => lane.run("beta", task);
