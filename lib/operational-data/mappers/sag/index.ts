/**
 * lib/operational-data/mappers/sag/index.ts
 *
 * SAG → Operational mapper consolidation.
 *
 * ─── PURPOSE ─────────────────────────────────────────────────────────────────
 * This module is the single import point for all SAG→Operational mapping.
 * The rest of the system imports from HERE, never from sag-inventory-adapter.ts
 * or sag-to-operational-mapper.ts directly.
 *
 * The underlying mappers live in lib/operational-inventory/ (where they were
 * built). We bridge/re-export them here to complete the Operational Data Layer.
 *
 * Sprint: AGENTIK-OPERATIONAL-DATA-LAYER-01
 */

// ─── Inventory mapping ────────────────────────────────────────────────────────
// Re-export from the canonical mapper in lib/operational-inventory/
export {
  mapSagItemToOperational,
  mapSagInventoryToOperational,
  mapOperationalToSagItem,
  mapOperationalToSagItems,
} from "@/lib/operational-inventory/sag-to-operational-mapper";

// ─── Demand mapping ───────────────────────────────────────────────────────────
// SAG-specific demand signals (PD pressure, coverage pressure)
export {
  mapSagCoverageToOperationalDemand,
  mapSagProductionSignalToOperationalDemand,
} from "./sag-demand-mapper";

// ─── Re-export SAG adapter for legacy engine compatibility ────────────────────
// Legacy engines (buildProductionAlertsFromRules, etc.) still consume SagInventoryItem[].
// This export keeps those engines working until they are rewritten.
// NEW CODE: never import SagInventoryItem — use OperationalInventoryItem.
export type { SagInventoryItem } from "@/lib/comercial/maletas/sag-inventory-adapter";
