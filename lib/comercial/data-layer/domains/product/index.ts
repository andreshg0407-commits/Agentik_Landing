/**
 * domains/product/index.ts — Barrel export for Product Domain.
 */

// Canonical entities
export type {
  ProductProfile,
  ProductClassification,
  ProductPricing,
  ProductOperational,
  ProductVariant,
  ProductCommercialStatus,
} from "./product-entities";
export { deriveCommercialStatus } from "./product-entities";

// Normalizer
export type {
  ProductRawInput,
  ProductNormalizationContext,
  ProductNormalizationOutput,
} from "./product-normalizer";
export { normalizeProductRaw } from "./product-normalizer";

// Quality rules
export {
  evaluateProductQuality,
  evaluateProductFreshness,
  isCommercialProduct,
} from "./product-quality-rules";
export type { CommercialArticleDecision } from "./product-quality-rules";

// Adapter
export { SAG_PRODUCT_ADAPTER_ID, SAG_PRODUCT_ADAPTER_VERSION, createSagProductAdapter } from "./product-adapter";
export type { SagProductAdapterDeps } from "./product-adapter";

// Registration
export { registerProductAdapter } from "./product-registration";
