import { readBoundedText } from "../scrapers/shared/http.mjs";
export function createBrowserStore({
  url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!url || !key) return null;
  const base = new URL(url);
  if (
    base.protocol !== "https:" ||
    !base.hostname.endsWith(".supabase.co") ||
    base.username ||
    base.password ||
    base.port ||
    base.pathname !== "/"
  )
    throw Error("SUPABASE_BAD_URL");
  if (key.startsWith("sb_publishable_"))
    throw Error("SUPABASE_SERVER_KEY_REQUIRED");
  const headers = {
    apikey: key,
    "content-type": "application/json",
    ...(key.startsWith("sb_secret_") ? {} : { authorization: "Bearer " + key }),
  };
  async function request(table, query = {}, method = "GET", body) {
    if (
      ![
        "najd_beta_catalog",
        "najd_beta_provider_config",
        "rpc/najd_set_beta_provider_config",
      ].includes(table)
    )
      throw Error("BROWSER_TABLE_REJECTED");
    const target = new URL("/rest/v1/" + table, base);
    for (const [k, v] of Object.entries(query)) target.searchParams.set(k, v);
    const response = await fetchImpl(target, {
      method,
      headers: {
        ...headers,
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      signal: AbortSignal.timeout(2000),
      redirect: "error",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Error("BROWSER_DB_HTTP_" + response.status);
    }
    return JSON.parse(
      (await readBoundedText(response, 4 * 1024 * 1024)) || "null",
    );
  }
  return {
    get: async (ref) => {
      if (!/^source:[a-z0-9][a-z0-9_-]{1,29}:[a-f0-9]{24}$/.test(ref))
        throw Error("BROWSER_BAD_REFERENCE");
      return (
        (
          await request("najd_beta_catalog", {
            or: "(ref.eq." + ref + ",alias_refs.cs.{" + ref + "})",
            expires_at: "gt." + new Date().toISOString(),
            select: "document",
            limit: "1",
          })
        )?.[0]?.document || null
      );
    },
    save: (document) =>
      request("najd_beta_catalog", { on_conflict: "ref" }, "POST", {
        ref: document.ref,
        provider: document.provider,
        alias_refs: document.aliases,
        document,
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        updated_at: new Date().toISOString(),
      }),
    configs: () =>
      request("najd_beta_provider_config", {
        select: "provider,revision,enabled,config",
      }),
    setConfig: (provider, config, revision) =>
      request("rpc/najd_set_beta_provider_config", {}, "POST", {
        p_provider: provider,
        p_config: config,
        p_revision: revision,
      }),
  };
}
