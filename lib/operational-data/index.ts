/**
 * lib/operational-data/index.ts
 *
 * Operational Data Layer — public API.
 *
 * ─── IMPORT RULE ─────────────────────────────────────────────────────────────
 * Import from "@/lib/operational-data" for all operational entity types.
 * Do NOT import from source-specific modules (SAG, CRM, Shopify) in:
 *   - UI components
 *   - Intelligence engines
 *   - Agent runtime
 *   - Copilot
 *
 * Sprint: AGENTIK-OPERATIONAL-DATA-LAYER-01
 */

// ─── Source vocabulary ────────────────────────────────────────────────────────
export type { OperationalSource, OperationalSourceMetadata, OperationalEntityBase } from "./operational-source";
export { DEFAULT_SOURCE_METADATA } from "./operational-source";

// ─── Entities ─────────────────────────────────────────────────────────────────
export type {
  OperationalCustomer,
  OperationalOrder,
  OperationalOrderLine,
  OperationalSalesRep,
  OperationalOpportunity,
  OperationalSalesActivity,
  OperationalTask,
  OperationalDemandSignal,
  OperationalCommercialEvent,
  OperationalCommercialEventType,
  // Re-exported from lib/operational-inventory
  OperationalInventoryItem,
  OperationalInventorySource,
  OperationalAvailability,
  OperationalPressure,
} from "./operational-entities";

// ─── Context ──────────────────────────────────────────────────────────────────
export type { CommercialOperationalContext, CommercialContextBuilderInput } from "./operational-context";
export { buildCommercialOperationalContext, emptyCommercialContext } from "./operational-context";

// ─── Agent contexts ───────────────────────────────────────────────────────────
export type {
  DavidAgentContext,
  DiegoAgentContext,
  FinanzasAgentContext,
  CopilotAgentContext,
  CopilotPriorityAction,
  CopilotEscalation,
} from "./agent-context";
export { buildDavidContext, buildDiegoContext, buildFinanzasContext, buildCopilotContext } from "./agent-context";

// ─── Provider ─────────────────────────────────────────────────────────────────
export type { IOperationalDataProvider } from "./operational-provider";
export { OperationalProviderRegistry } from "./operational-provider";

// ─── Demand signals engine ────────────────────────────────────────────────────
export { computeCommercialDemandSignals } from "./engines/commercial-demand-signals";
export type { CommercialDemandSignalInput } from "./engines/commercial-demand-signals";

// ─── Event timeline ───────────────────────────────────────────────────────────
export {
  bridgeLegacyEventsToOperational,
  buildDemandSignalEvent,
  buildOrderLifecycleEvent,
  buildOperationalTimeline,
} from "./events/commercial-operational-event";

// ─── Providers ────────────────────────────────────────────────────────────────
// Concrete implementations of IOperationalDataProvider.
// Server-side only — these import Prisma.
export { CrmCommercialProvider, getCrmCommercialProvider } from "./providers/crm-commercial-provider";

// ─── CRM mappers (Prisma-backed) ──────────────────────────────────────────────
// Use these in providers and server-only code.
export type {
  PrismaCustomerProfileShape,
  PrismaCrmQuoteShape,
  PrismaCrmOpportunityShape,
  PrismaCrmActivityShape,
} from "./mappers/crm/index";
export {
  mapPrismaCustomerProfileToOperational,
  mapPrismaCrmQuoteToOperationalOrder,
  mapPrismaCrmOpportunityToOperational,
  mapPrismaCrmActivityToOperational,
} from "./mappers/crm/index";
