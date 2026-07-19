/**
 * lib/ai-layer/index.ts
 *
 * Agentik — AI Layer Foundation — Client-Safe Barrel
 * Sprint: AGENTIK-AI-LAYER-FOUNDATION-01
 *
 * CLIENT-SAFE: exports only pure domain symbols.
 * No Prisma. No server-only. No React.
 *
 * Server-side service:
 *   import { aiLayerService } from "@/lib/ai-layer/server";
 */

// ── Core types ────────────────────────────────────────────────────────────────
export type {
  AIProviderId,
  AIModelId,
  AICapability,
  AIRoutingStrategy,
  AIRequest,
  AIMessage,
  AIResponse,
  AIUsage,
  AIExecutionMetadata,
  AIModelDefinition,
  AIRoutingCandidate,
  AITenantPreferences,
} from "./ai-layer-types";

// ── Capabilities ──────────────────────────────────────────────────────────────
export type { AICapabilityMeta }          from "./ai-capabilities";
export {
  AI_CAPABILITY_REGISTRY,
  getCapabilityMeta,
  getPricingUsageKind,
  primaryCapability,
  satisfiesCapabilities,
} from "./ai-capabilities";

// ── Model registry ────────────────────────────────────────────────────────────
export { aiModelRegistry } from "./ai-model-registry";

// ── Routing engine ────────────────────────────────────────────────────────────
export type { AIRoutingResult } from "./ai-routing-engine";
export { routeAIRequest, _resetRoundRobin } from "./ai-routing-engine";

// ── Tenant preferences ────────────────────────────────────────────────────────
export type { TenantPreferenceValidationResult } from "./ai-tenant-preferences";
export {
  resolveTenantPreferences,
  setTenantPreferences,
  clearTenantPreferences,
  clearAllTenantPreferences,
  validateTenantPreferences,
} from "./ai-tenant-preferences";

// ── Audit ─────────────────────────────────────────────────────────────────────
export type {
  AILayerAuditEventType,
  AILayerAuditEvent,
  AIRequestValidationResult,
} from "./ai-layer-audit";
export {
  createAILayerAuditEvent,
  validateAIRequest,
  auditRequestReceived,
  auditRoutingResolved,
  auditAdapterCalled,
  auditAdapterSucceeded,
  auditAdapterFailed,
  auditBillingRecorded,
  auditRequestSucceeded,
  auditRequestFailed,
} from "./ai-layer-audit";

// ── Adapter contract ──────────────────────────────────────────────────────────
export type {
  AdapterResponse,
  AdapterIdentity,
  ProviderAdapter,
  AdapterRegistry,
} from "./adapters/provider-adapter";
export { createAdapterRegistry } from "./adapters/provider-adapter";
