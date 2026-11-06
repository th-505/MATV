import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  installProviderConfigs,
  getProviderConfig,
} from "../server/scrapers/shared/provider-config.mjs";
import {
  installBrowserConfigs,
  runInBrowserLane,
} from "../server/browser/traffic.mjs";
import { getProvider } from "../server/scrapers/registry.mjs";
import { getProvider as getBetaProvider } from "../server/browser/registry.mjs";
import { diagnosticsAuthorized } from "../server/diagnostics/search-trace.mjs";
import { createServiceChecks } from "../server/diagnostics/service-checks.mjs";
test("beta domains/configuration remain independent through asynchronous work", async () => {
  installProviderConfigs([
    { provider: "mycima", config: { primary_domain: "https://najd.example" } },
  ]);
  installBrowserConfigs([
    {
      provider: "mycima",
      revision: 2,
      config: { primary_domain: "https://beta.example" },
    },
  ]);
  try {
    assert.equal(getProvider("mycima").meta.domains[0], "https://najd.example");
    await runInBrowserLane(async () => {
      await Promise.resolve();
      assert.equal(
        getBetaProvider("mycima").meta.domains[0],
        "https://beta.example",
      );
      assert.equal(getProvider('mycima').meta.domains[0], 'https://najd.example');
    });
    assert.equal(
      getProviderConfig("mycima").primary_domain,
      "https://najd.example",
    );
  } finally {
    installProviderConfigs([]);
    installBrowserConfigs([]);
  }
});
test("owner dashboard accepts only the configured password hash or existing long diagnostic token", () => {
  const previous = process.env.NAJD_DASHBOARD_PASSWORD_HASH;
  process.env.NAJD_DASHBOARD_PASSWORD_HASH = createHash("sha256")
    .update("owner-fixture-password")
    .digest("hex");
  try {
    assert(
      diagnosticsAuthorized(
        { headers: { authorization: "Bearer owner-fixture-password" } },
        "",
      ),
    );
    assert(
      !diagnosticsAuthorized(
        { headers: { authorization: "Bearer wrong-password" } },
        "",
      ),
    );
    assert(
      diagnosticsAuthorized(
        { headers: { authorization: "Bearer " + "t".repeat(30) } },
        "t".repeat(30),
      ),
    );
  } finally {
    if (previous === undefined) delete process.env.NAJD_DASHBOARD_PASSWORD_HASH;
    else process.env.NAJD_DASHBOARD_PASSWORD_HASH = previous;
  }
});
test("check all reports real metadata/media stages separately for Najd and beta and never hides a DB failure", async () => {
  const provider = {
    id: "one",
    name: "One",
    domains: ["https://one.example"],
    capabilities: { catalog: true, search:true },
  };
  const module = {
    scrapeCatalog: async () => [{ ref: "one:film", title: "Film" }],
    scrapeSearch: async q => q.startsWith("najd_probe_") ? [] : [{ ref: "one:film", title: "Film" }],
    scrapeDetails: async () => ({
      title: "Film",
      type: "movie",
      media_sources: [{ url: "https://cdn.example/film.mp4" }],
    }),
  };
  const checks = createServiceChecks({
    tmdb: { details: async () => ({ data: { title: "Known Film" } }) },
    database: async () => {
      throw Error("DATABASE_DOWN");
    },
    providers: () => [provider],
    lookup: () => ({ meta: provider, module }),
    fetchResponse: async () => ({ html: '{"subtitles":[]}' }),
    probe: async () => ({ playable: true, container_verified: true }),
  });
  const job = checks.start();
  let report;
  do {
    await new Promise((r) => setImmediate(r));
    report = checks.status(job.id);
  } while (report.state !== "ready");
  assert.equal(report.checks.find((c) => c.id === "database").state, "failed");
  assert.equal(
    report.checks.find((c) => c.id === "subtitles").state,
    "partial",
  );
  for (const id of ["najd:one", "beta:one"]) {
    const row = report.checks.find((c) => c.id === id);
    assert.equal(row.state, "passed");
    assert.deepEqual(
      row.stages.map((s) => s.stage),
      ["catalog", "search", "details", "media"],
    );
  }
});
