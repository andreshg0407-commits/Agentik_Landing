/**
 * lib/marketing-studio/commerce/shopify-runtime/index.ts
 *
 * AGENTIK-RUNTIME-INTEGRATION-01 — Public barrel for the Shopify runtime adapter.
 * SERVER ONLY — no React imports, no UI dependencies.
 * @server-only
 *
 * This is the ONLY import point for the Shopify runtime adapter.
 * The Action Runtime (lib/copilot/runtime/) NEVER imports from here.
 * Only the registration site (API route, server action, or test harness)
 * imports from this barrel to wire the provider into the dispatcher.
 *
 * Usage:
 *   import {
 *     ShopifyActionProvider,
 *     stubShopifyContextResolver,
 *     staticShopifyContextResolver,
 *     envShopifyContextResolver,
 *   } from "@/lib/marketing-studio/commerce/shopify-runtime";
 *
 *   const provider = new ShopifyActionProvider(
 *     envShopifyContextResolver({ warnOnMissing: true }),
 *   );
 *   dispatcher.registerProvider(provider);
 */
import "server-only";

export { ShopifyActionProvider }                    from "./shopify-action-provider";

export type { ShopifyContextResolver }              from "./shopify-context-resolver";

export {
  staticShopifyContextResolver,
  envShopifyContextResolver,
  nullShopifyContextResolver,
  stubShopifyContextResolver,
}                                                   from "./shopify-context-resolver";
