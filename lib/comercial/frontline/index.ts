/**
 * lib/comercial/frontline/index.ts
 *
 * Client-safe barrel — types only.
 * Server modules must import from specific files.
 */

export type {
  FrontlineProvenance,
  ResolvedSellerIdentity,
  SellerMappingSource,
  SellerScope,
  ScopeLevel,
  CustomerTopProduct,
  TopProductRanking,
  CustomerPurchaseHistoryItem,
  CustomerPurchaseHistoryResult,
  CustomerTopProductsResult,
  CustomerReceivablesContext,
  CustomerCommercialContext,
  AttentionSeverity,
  FrontlineAttentionType,
  FrontlineAttentionItem,
  FrontlineAttentionResult,
} from "./frontline-types";
