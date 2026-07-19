/**
 * domains/inventory/index.ts — Barrel export for Inventory Domain.
 *
 * Sprint: INVENTORY-DOMAIN-01
 */

// Canonical entities
export type {
  InventoryPosition,
  InventoryLocation,
  InventoryQuantities,
  InventoryClassification,
  InventoryVariantDetail,
  InventoryPositionState,
  InventoryLocationType,
  InventoryPositionStatus,
  WarehouseProfile,
} from "./inventory-entities";
export { derivePositionStatus } from "./inventory-entities";

// Movement
export type {
  InventoryMovement,
  InventoryMovementType,
  InventoryMovementDirection,
  MovementSourceDocument,
  MovementLocation,
} from "./inventory-movement";

// Availability
export type {
  InventoryAvailability,
  AvailabilityStatus,
  AvailabilityQuery,
} from "./inventory-availability";
export { deriveAvailabilityStatus } from "./inventory-availability";

// Snapshot
export type {
  InventorySnapshot,
  SnapshotSummary,
  SnapshotPosition,
  SnapshotCaptureSource,
  SnapshotDelta,
} from "./inventory-snapshot";
export { computeSnapshotDelta } from "./inventory-snapshot";

// Age
export type {
  InventoryAge,
  InventoryAgeBracket,
  InventoryAgeSummary,
} from "./inventory-age";
export { deriveAgeBracket } from "./inventory-age";

// Evidence
export type {
  InventoryEvidence,
  InventoryEvidenceLevel,
  InventoryEvidenceSummary,
  CrossValidationResult,
  CrossValidationDiscrepancy,
} from "./inventory-evidence";

// Quality
export {
  evaluateInventoryQuality,
  evaluateInventoryFreshness,
  validateInventoryQuantities,
} from "./inventory-quality";
export type { InventoryQuantityValidation } from "./inventory-quality";

// Normalizer
export type {
  InventoryRawInput,
  InventoryNormalizationContext,
  InventoryNormalizationOutput,
} from "./inventory-normalizer";
export { normalizeInventoryRaw } from "./inventory-normalizer";

// Adapter
export { SAG_INVENTORY_ADAPTER_ID, SAG_INVENTORY_ADAPTER_VERSION, createSagInventoryAdapter } from "./inventory-adapter";
export type { SagInventoryAdapterDeps } from "./inventory-adapter";

// Registration
export { registerInventoryAdapter } from "./inventory-registration";
