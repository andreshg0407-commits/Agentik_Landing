/**
 * domains/sales/index.ts — Barrel export for Sales Domain.
 */

// Canonical entities
export type {
  SalesDocument,
  SalesDocumentFinancials,
  SalesDocumentType,
  SalesDocumentStatus,
  SaleLine,
  SalesReturn,
  SalesReturnReason,
  SalesAttribution,
} from "./sales-entities";
export { deriveSalesDocumentStatus } from "./sales-entities";

// Normalizer
export type {
  SalesDocumentRawInput,
  SaleLineRawInput,
  SalesNormalizationContext,
  SalesNormalizationOutput,
} from "./sales-normalizer";
export { normalizeSalesDocument } from "./sales-normalizer";

// Quality rules
export {
  evaluateSalesQuality,
  evaluateSalesFreshness,
  isValidSale,
} from "./sales-quality-rules";
export type { ValidSaleDecision } from "./sales-quality-rules";

// Adapter
export { SAG_SALES_ADAPTER_ID, SAG_SALES_ADAPTER_VERSION, createSagSalesAdapter } from "./sales-adapter";
export type { SagSalesAdapterDeps } from "./sales-adapter";

// Registration
export { registerSalesAdapter } from "./sales-registration";
