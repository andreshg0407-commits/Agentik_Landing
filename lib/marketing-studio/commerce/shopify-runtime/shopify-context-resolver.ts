/**
 * lib/marketing-studio/commerce/shopify-runtime/shopify-context-resolver.ts
 *
 * AGENTIK-RUNTIME-INTEGRATION-01 — Shopify context resolution for the Action Runtime.
 * SERVER ONLY — no React imports, no UI dependencies.
 * @server-only
 *
 * Resolves a ShopifyContext from an ExecutionContext (tenantId → credentials).
 *
 * Phase 1: static resolver (injected context or environment variables).
 * Phase 2: Vault resolver (fetch accessToken from Agentik Vault by tenantId).
 *
 * Design: The resolver is a plain function, not a class.
 * The provider receives it via constructor injection — no global state.
 *
 * Dependency direction (must never be violated):
 *   shopify-context-resolver ← shopify-action-provider ← registration site
 */
import "server-only";

import type { ExecutionContext }  from "@/lib/copilot/runtime/runtime-types";
import type { ShopifyContext }    from "@/lib/marketing-studio/commerce/shopify-actions/action-types";
import { getIntegrationConnection } from "@/lib/integrations/integration-repository";
import { getIntegrationSecret }     from "@/lib/integrations/vault/vault-service";
import { SECRET_TYPE }              from "@/lib/integrations/vault/vault-types";
import { CONNECTION_STATUS }        from "@/lib/integrations/integration-types";

// ── Resolver type ──────────────────────────────────────────────────────────────

/**
 * A function that resolves a Shopify API context from an execution context.
 *
 * Returns `null` if credentials cannot be resolved — the dispatcher will
 * mark all steps for this domain as `blocked`.
 *
 * @param ctx - The current execution context (tenantId, userId, ...)
 */
export type ShopifyContextResolver = (
  ctx: ExecutionContext,
) => Promise<ShopifyContext | null>;

// ── Error codes ────────────────────────────────────────────────────────────────

export type ShopifyContextErrorCode =
  | "shopify_connection_not_found"
  | "shopify_credentials_missing"
  | "shopify_access_token_missing"
  | "shopify_shop_domain_missing"
  | "shopify_connection_disabled"
  | "shopify_context_resolution_failed";

// ── Vault resolver ─────────────────────────────────────────────────────────────

/**
 * Create a resolver that reads Shopify credentials from the Agentik Vault
 * per tenant. This is the PRODUCTION resolver.
 *
 * Resolution steps:
 *   1. Look up IntegrationConnection by (tenantId, "shopify")
 *   2. Verify status === CONNECTED
 *   3. Verify shopDomain is set
 *   4. Fetch ACCESS_TOKEN from vault
 *   5. Return ShopifyContext
 *
 * Returns null on any failure — never throws.
 * The dispatcher will mark all steps as blocked when null is returned.
 */
export function vaultShopifyContextResolver(): ShopifyContextResolver {
  return async (ctx: ExecutionContext): Promise<ShopifyContext | null> => {
    try {
      const connection = await getIntegrationConnection(ctx.tenantId, "shopify");

      if (!connection) return null;

      if (connection.status !== CONNECTION_STATUS.CONNECTED) return null;

      if (!connection.shopDomain) return null;

      const secret = await getIntegrationSecret({
        organizationId: ctx.tenantId,
        connectionId:   connection.id,
        secretType:     SECRET_TYPE.ACCESS_TOKEN,
      });

      if (!secret) return null;

      return {
        organizationId: ctx.tenantId,
        accessToken:    secret.plainValue,
        shopDomain:     connection.shopDomain,
      };
    } catch {
      return null;
    }
  };
}

// ── Static resolver ────────────────────────────────────────────────────────────

/**
 * Create a static resolver that always returns a fixed ShopifyContext.
 * Use in:
 *   - Integration smoke tests
 *   - Development environments with fixed credentials
 *
 * This resolver IGNORES tenantId — it returns the same context for all tenants.
 * Production systems MUST use Vault-backed resolution.
 *
 * @param context - The static ShopifyContext to always return
 */
export function staticShopifyContextResolver(
  context: ShopifyContext,
): ShopifyContextResolver {
  return async (_ctx: ExecutionContext): Promise<ShopifyContext | null> => context;
}

// ── Environment resolver ───────────────────────────────────────────────────────

/**
 * Create a resolver that reads Shopify credentials from environment variables.
 *
 * Expected env vars:
 *   SHOPIFY_ACCESS_TOKEN   — Shopify Admin API access token
 *   SHOPIFY_SHOP_DOMAIN    — e.g. "my-store.myshopify.com"
 *
 * The `organizationId` comes from `ctx.tenantId`.
 *
 * Returns null if required env vars are missing.
 *
 * @param opts - Optional overrides for testing
 */
export function envShopifyContextResolver(
  opts: { warnOnMissing?: boolean } = {},
): ShopifyContextResolver {
  return async (ctx: ExecutionContext): Promise<ShopifyContext | null> => {
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    const shopDomain  = process.env.SHOPIFY_SHOP_DOMAIN;

    if (!accessToken || !shopDomain) {
      if (opts.warnOnMissing !== false) {
        console.warn(
          `[ShopifyContextResolver] Missing SHOPIFY_ACCESS_TOKEN or SHOPIFY_SHOP_DOMAIN ` +
          `for tenant "${ctx.tenantId}". Returning null.`,
        );
      }
      return null;
    }

    return {
      organizationId: ctx.tenantId,
      accessToken,
      shopDomain,
    };
  };
}

// ── Null resolver ──────────────────────────────────────────────────────────────

/**
 * A resolver that always returns null (blocks all Shopify steps).
 * Use in integration tests to verify approval-gate and blocking behavior.
 */
export const nullShopifyContextResolver: ShopifyContextResolver =
  async (): Promise<ShopifyContext | null> => null;

// ── Stub resolver ──────────────────────────────────────────────────────────────

/**
 * A resolver that returns a stub context with fake credentials.
 * Useful for smoke tests where real API calls must NOT happen.
 *
 * Actions with stub=true in the registry will succeed (they return mkStub()),
 * but non-stub actions will still be invoked with fake credentials.
 * Use ONLY in test/development environments.
 *
 * @param tenantId - Optional override for the tenant slug (default: "test-tenant")
 */
export function stubShopifyContextResolver(
  tenantId = "test-tenant",
): ShopifyContextResolver {
  return async (ctx: ExecutionContext): Promise<ShopifyContext> => ({
    organizationId: ctx.tenantId || tenantId,
    accessToken:    "STUB_TOKEN",
    shopDomain:     "stub-store.myshopify.com",
  });
}
