/**
 * index.ts
 *
 * CASTILLITOS-EXECUTIVE-REPORTS-01
 * Client-safe barrel export for Commercial Intelligence.
 *
 * No Prisma. No server-only. Pure domain types.
 */

// Types
export type {
  SagAvailabilityRecord,
  AvailabilityStatus,
  AvailabilityRow,
  AvailabilityVariant,
  AvailabilitySubGrupoSummary,
  AvailabilitySubLineaSummary,
  CommercialAvailabilityReport,
  SellerWarehouse,
  MaletaReplacementRule,
  MaletaReplacementItem,
  MaletaReplacementReport,
} from "./availability-types";

// Availability Engine
export {
  deriveAvailabilityStatus,
  buildAvailabilityReport,
} from "./availability-engine";

// Maleta Replacement Engine
export type { SellerMaletaRecord } from "./maleta-replacement-engine";
export {
  CASTILLITOS_REPLACEMENT_RULES,
  CASTILLITOS_SELLER_WAREHOUSES,
  buildMaletaReplacementReport,
} from "./maleta-replacement-engine";

// Signal Generators
export {
  buildAvailabilitySignals,
  buildMaletaReplacementSignals,
} from "./availability-signals";

// Capability Catalog
export {
  COMMERCIAL_INTELLIGENCE_CAPABILITIES,
} from "./capability-catalog";
