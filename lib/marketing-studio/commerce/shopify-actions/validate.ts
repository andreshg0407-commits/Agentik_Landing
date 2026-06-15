/**
 * lib/marketing-studio/commerce/shopify-actions/validate.ts
 *
 * SHOPIFY-COPILOT-ACTIONS-01C — Smoke check for the action registry.
 * SERVER ONLY — no React imports.
 * @server-only
 *
 * This file is NOT executed at runtime. It is a compile-time contract check
 * that verifies the registry and action bundle are correctly wired.
 *
 * Usage (startup or CI):
 *   import { runShopifyActionsSmokeCheck } from "@/lib/marketing-studio/commerce/shopify-actions/validate";
 *   const report = runShopifyActionsSmokeCheck();
 *   if (!report.ok) console.error("Shopify action registry errors:", report.errors);
 */
import "server-only";

import {
  shopifyActions,
  SHOPIFY_ACTION_REGISTRY,
  validateShopifyActionRegistry,
} from "./index";

import type { ShopifyActionRegistryReport } from "./index";

/**
 * Smoke check — validates the Shopify action registry and surface API.
 *
 * Returns a structured report. Never throws.
 */
export function runShopifyActionsSmokeCheck(): ShopifyActionRegistryReport {
  const report = validateShopifyActionRegistry();

  // Verify the top-level shopifyActions object is present and has all expected domains
  const expectedDomains = [
    "catalog",
    "promotions",
    "collections",
    "operations",
    "statistics",
    "enrichment",
    "search",
  ] as const;

  for (const domain of expectedDomains) {
    if (!shopifyActions[domain] || typeof shopifyActions[domain] !== "object") {
      report.errors.push(`shopifyActions.${domain} is missing or not an object`);
    }
  }

  // Verify the registry is non-empty
  if (Object.keys(SHOPIFY_ACTION_REGISTRY).length === 0) {
    report.errors.push("SHOPIFY_ACTION_REGISTRY is empty");
  }

  return {
    ...report,
    ok: report.errors.length === 0,
  };
}
