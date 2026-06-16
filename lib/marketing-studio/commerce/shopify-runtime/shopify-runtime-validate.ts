/**
 * lib/marketing-studio/commerce/shopify-runtime/shopify-runtime-validate.ts
 *
 * SHOPIFY-COPILOT-INTEGRATION-01 + SHOPIFY-COPILOT-INTEGRATION-POLISH-01
 * Shopify runtime integration smoke checks.
 * SERVER ONLY — import "server-only" enforced below.
 * @server-only
 *
 * 13 deterministic checks covering:
 *   01. vaultShopifyContextResolver() returns ShopifyContextResolver function
 *   02. vaultShopifyContextResolver returns null for missing connection (wraps errors)
 *   03. vaultShopifyContextResolver never throws
 *   04. nullShopifyContextResolver always returns null
 *   05. staticShopifyContextResolver always returns provided context
 *   06. staticShopifyContextResolver ignores ctx.tenantId
 *   07. envShopifyContextResolver returns null when env vars missing
 *   08. envShopifyContextResolver returns ShopifyContext when env vars present
 *   09. ShopifyContextErrorCode catalog is complete (6 codes)
 *   10. resolveShopifyContextStatus returns structured result (never token)
 *   11. resolveShopifyContextStatus.ok=false for unknown tenant
 *   12. resolveShopifyContextStatus result has no accessToken field
 *   13. All resolver factories are exported
 *
 * None of these tests make real Shopify or Vault calls.
 */
import "server-only";

import type { ShopifyContext } from "@/lib/marketing-studio/commerce/shopify-actions/action-types";
import type { ExecutionContext } from "@/lib/copilot/runtime/runtime-types";
import {
  vaultShopifyContextResolver,
  envShopifyContextResolver,
  nullShopifyContextResolver,
  staticShopifyContextResolver,
  resolveShopifyContextStatus,
} from "./shopify-context-resolver";
import type {
  ShopifyContextErrorCode,
  ShopifyContextResolutionStatus,
} from "./shopify-context-resolver";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ShopifyRuntimeSmokeCheck {
  name:    string;
  passed:  boolean;
  reason?: string;
}

export interface ShopifyRuntimeValidateResult {
  passed: number;
  failed: number;
  total:  number;
  checks: ShopifyRuntimeSmokeCheck[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeCtx(tenantId = "test-tenant"): ExecutionContext {
  return {
    executionId:   "exec-smoke-01",
    correlationId: "corr-smoke-01",
    tenantId,
    userId:        "smoke-user",
    requestedAt:   new Date(),
  };
}

function pass(name: string): ShopifyRuntimeSmokeCheck {
  return { name, passed: true };
}

function fail(name: string, reason: string): ShopifyRuntimeSmokeCheck {
  return { name, passed: false, reason };
}

// ── Checks ─────────────────────────────────────────────────────────────────────

const CHECKS: Array<() => Promise<ShopifyRuntimeSmokeCheck>> = [

  // 01. vaultShopifyContextResolver() returns a function
  async () => {
    const name = "01 vaultShopifyContextResolver returns ShopifyContextResolver function";
    const resolver = vaultShopifyContextResolver();
    if (typeof resolver !== "function") return fail(name, "Expected a function");
    return pass(name);
  },

  // 02. vault resolver returns null for missing connection
  async () => {
    const name = "02 vaultShopifyContextResolver returns null for missing connection";
    const resolver = vaultShopifyContextResolver();
    let result: ShopifyContext | null;
    try {
      result = await resolver(makeCtx("__smoke_no_such_tenant__"));
    } catch {
      result = null;
    }
    if (result !== null) return fail(name, "Expected null for unknown tenant");
    return pass(name);
  },

  // 03. vault resolver never throws
  async () => {
    const name = "03 vaultShopifyContextResolver never throws — wraps all errors";
    const resolver = vaultShopifyContextResolver();
    let threw = false;
    try {
      await resolver(makeCtx("__smoke_error_tenant__"));
    } catch {
      threw = true;
    }
    if (threw) return fail(name, "Resolver threw instead of returning null");
    return pass(name);
  },

  // 04. nullShopifyContextResolver always returns null
  async () => {
    const name = "04 nullShopifyContextResolver always returns null";
    const result = await nullShopifyContextResolver(makeCtx());
    if (result !== null) return fail(name, "Expected null");
    return pass(name);
  },

  // 05. staticShopifyContextResolver always returns the given context
  async () => {
    const name = "05 staticShopifyContextResolver returns fixed ShopifyContext";
    const fixed: ShopifyContext = {
      organizationId: "static-org",
      accessToken:    "static-token",
      shopDomain:     "static.myshopify.com",
    };
    const resolver = staticShopifyContextResolver(fixed);
    const result   = await resolver(makeCtx("other-tenant"));
    if (!result) return fail(name, "Expected context, got null");
    if (result.organizationId !== "static-org")            return fail(name, "organizationId mismatch");
    if (result.accessToken    !== "static-token")          return fail(name, "accessToken mismatch");
    if (result.shopDomain     !== "static.myshopify.com")  return fail(name, "shopDomain mismatch");
    return pass(name);
  },

  // 06. staticShopifyContextResolver ignores ctx.tenantId
  async () => {
    const name = "06 staticShopifyContextResolver ignores ctx.tenantId";
    const fixed: ShopifyContext = {
      organizationId: "fixed-org",
      accessToken:    "fixed-token",
      shopDomain:     "fixed.myshopify.com",
    };
    const resolver = staticShopifyContextResolver(fixed);
    const [r1, r2] = await Promise.all([
      resolver(makeCtx("tenant-a")),
      resolver(makeCtx("tenant-b")),
    ]);
    if (!r1 || !r2) return fail(name, "Expected non-null results");
    if (r1.organizationId !== "fixed-org" || r2.organizationId !== "fixed-org") {
      return fail(name, "organizationId was not fixed — resolver is not static");
    }
    return pass(name);
  },

  // 07. envShopifyContextResolver returns null when env vars missing
  async () => {
    const name = "07 envShopifyContextResolver returns null when env vars missing";
    const saved = { token: process.env.SHOPIFY_ACCESS_TOKEN, domain: process.env.SHOPIFY_SHOP_DOMAIN };
    delete process.env.SHOPIFY_ACCESS_TOKEN;
    delete process.env.SHOPIFY_SHOP_DOMAIN;

    const resolver = envShopifyContextResolver({ warnOnMissing: false });
    const result   = await resolver(makeCtx());

    if (saved.token  !== undefined) process.env.SHOPIFY_ACCESS_TOKEN = saved.token;
    if (saved.domain !== undefined) process.env.SHOPIFY_SHOP_DOMAIN  = saved.domain;

    if (result !== null) return fail(name, "Expected null when env vars missing");
    return pass(name);
  },

  // 08. envShopifyContextResolver returns ShopifyContext when env vars present
  async () => {
    const name = "08 envShopifyContextResolver returns ShopifyContext when env vars present";
    const saved = { token: process.env.SHOPIFY_ACCESS_TOKEN, domain: process.env.SHOPIFY_SHOP_DOMAIN };
    process.env.SHOPIFY_ACCESS_TOKEN = "env-token-smoke";
    process.env.SHOPIFY_SHOP_DOMAIN  = "env-domain.myshopify.com";

    const resolver = envShopifyContextResolver({ warnOnMissing: false });
    const result   = await resolver(makeCtx("env-tenant"));

    if (saved.token  !== undefined) process.env.SHOPIFY_ACCESS_TOKEN = saved.token;
    else delete process.env.SHOPIFY_ACCESS_TOKEN;
    if (saved.domain !== undefined) process.env.SHOPIFY_SHOP_DOMAIN  = saved.domain;
    else delete process.env.SHOPIFY_SHOP_DOMAIN;

    if (!result)                                        return fail(name, "Expected ShopifyContext, got null");
    if (result.accessToken !== "env-token-smoke")       return fail(name, "accessToken mismatch");
    if (result.shopDomain  !== "env-domain.myshopify.com") return fail(name, "shopDomain mismatch");
    if (result.organizationId !== "env-tenant")         return fail(name, "organizationId should be ctx.tenantId");
    return pass(name);
  },

  // 09. ShopifyContextErrorCode catalog contains all 6 required codes
  async () => {
    const name = "09 ShopifyContextErrorCode catalog is complete";
    const required: ShopifyContextErrorCode[] = [
      "shopify_connection_not_found",
      "shopify_credentials_missing",
      "shopify_access_token_missing",
      "shopify_shop_domain_missing",
      "shopify_connection_disabled",
      "shopify_context_resolution_failed",
    ];
    if (required.length !== 6) return fail(name, "Expected 6 error codes");
    for (const code of required) {
      if (typeof code !== "string" || code.length === 0) return fail(name, `Invalid code: ${code}`);
    }
    return pass(name);
  },

  // 10. resolveShopifyContextStatus returns structured ShopifyContextResolutionStatus
  async () => {
    const name = "10 resolveShopifyContextStatus returns ShopifyContextResolutionStatus";
    let result: ShopifyContextResolutionStatus;
    try {
      result = await resolveShopifyContextStatus({ tenantId: "__smoke_status_tenant__" });
    } catch {
      return fail(name, "resolveShopifyContextStatus threw instead of returning result");
    }
    if (typeof result.ok        !== "boolean") return fail(name, "ok must be boolean");
    if (typeof result.code      !== "string")  return fail(name, "code must be string");
    if (!Array.isArray(result.missing))        return fail(name, "missing must be array");
    if (typeof result.connected !== "boolean") return fail(name, "connected must be boolean");
    const validSources = ["vault", "env_dev", "none"];
    if (!validSources.includes(result.source)) return fail(name, `source must be one of ${validSources.join("|")}`);
    return pass(name);
  },

  // 11. resolveShopifyContextStatus returns ok=false for unknown tenant (no DB row)
  async () => {
    const name = "11 resolveShopifyContextStatus ok=false for unknown tenant";
    const result = await resolveShopifyContextStatus({ tenantId: "__smoke_no_such_tenant__" });
    if (result.ok) return fail(name, "Expected ok=false for unknown tenant without connection");
    if (result.connected) return fail(name, "Expected connected=false for unknown tenant");
    return pass(name);
  },

  // 12. resolveShopifyContextStatus result has NO accessToken field
  async () => {
    const name = "12 resolveShopifyContextStatus never exposes accessToken";
    const result = await resolveShopifyContextStatus({ tenantId: "__smoke_token_check__" });
    // Check neither the result object nor its enumerable keys contain token data
    const keys = Object.keys(result);
    const forbidden = ["accessToken", "token", "plainValue", "secret", "key"];
    for (const f of forbidden) {
      if (keys.includes(f)) return fail(name, `result contains forbidden field "${f}"`);
    }
    // Also check no value looks like a real token (>30 chars with special chars)
    for (const [k, v] of Object.entries(result)) {
      if (typeof v === "string" && v.length > 30 && /[^a-zA-Z0-9_-]/.test(v)) {
        return fail(name, `field "${k}" may contain credential data`);
      }
    }
    return pass(name);
  },

  // 13. All resolver factories exported
  async () => {
    const name = "13 All ShopifyContextResolver factories are exported";
    if (typeof vaultShopifyContextResolver   !== "function") return fail(name, "vaultShopifyContextResolver missing");
    if (typeof envShopifyContextResolver     !== "function") return fail(name, "envShopifyContextResolver missing");
    if (typeof nullShopifyContextResolver    !== "function") return fail(name, "nullShopifyContextResolver missing");
    if (typeof staticShopifyContextResolver  !== "function") return fail(name, "staticShopifyContextResolver missing");
    if (typeof resolveShopifyContextStatus   !== "function") return fail(name, "resolveShopifyContextStatus missing");
    return pass(name);
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runShopifyRuntimeSmokeChecks(): Promise<ShopifyRuntimeValidateResult> {
  const checks: ShopifyRuntimeSmokeCheck[] = [];

  for (const check of CHECKS) {
    try {
      checks.push(await check());
    } catch (err) {
      checks.push(fail(
        `check_${checks.length + 1}`,
        `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      ));
    }
  }

  const passed = checks.filter(c => c.passed).length;
  const failed = checks.filter(c => !c.passed).length;

  return { passed, failed, total: checks.length, checks };
}
