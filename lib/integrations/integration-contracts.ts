/**
 * lib/integrations/integration-contracts.ts
 *
 * Agentik — Integration Contract Types V1
 *
 * Block B of Sprint AGENTIK-RUNTIME-ORCHESTRATION-GATEWAY-OBSERVABILITY-01
 *
 * Defines the formal contract for every external integration.
 * No API calls — contracts, validation, dispatch drafts only.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type IntegrationType =
  | "workflow_engine"  // n8n, Zapier — orchestration
  | "messaging"        // WhatsApp, Email — communications
  | "social_media"     // TikTok, Instagram — content publishing
  | "media_gen"        // Runway, DALL-E — creative generation
  | "fiscal"           // DIAN — government compliance
  | "erp"              // SAG, ERP systems — operational data
  | "ecommerce"        // Shopify — commerce
  | "crm";             // CRM systems — relationship management

export type IntegrationHealthState =
  | "operational"   // Ready and healthy
  | "degraded"      // Partial availability
  | "offline"       // Unavailable
  | "unconfigured"  // Not yet set up for this tenant
  | "maintenance";  // Planned maintenance window

export type IntegrationExecutionMode =
  | "draft"        // Prepare for review — no real dispatch
  | "supervised"   // Human confirms each dispatch
  | "automatic";   // Fully automatic (V4+ only)

export type IntegrationRiskLevel = "low" | "medium" | "high" | "critical";

export interface IntegrationContract {
  id:               string;
  name:             string;
  type:             IntegrationType;
  tenantScope:      "all" | "castillitos" | "specific";  // Which tenants can use
  requiredSecrets:  string[];   // Secret key names needed (never values)
  supportedActions: string[];   // Action IDs this integration supports
  riskLevel:        IntegrationRiskLevel;
  healthState:      IntegrationHealthState;
  executionMode:    IntegrationExecutionMode;
  enabled:          boolean;
  description:      string;
  dispatchEndpoint?: string;   // V4: real endpoint; V1: undefined
}

// ── Dispatch draft types ───────────────────────────────────────────────────────

export interface IntegrationDispatchDraft {
  draftId:       string;
  integrationId: string;
  actionType:    string;
  payload:       Record<string, unknown>;   // Safe: no secrets, no PII
  agentId:       string;
  orgSlug:       string;
  preparedAt:    string;   // ISO string
  status:        "draft" | "pending_approval" | "approved" | "dispatched" | "cancelled";
  approvalNote?: string;
}

// ── Validation helpers ─────────────────────────────────────────────────────────

export function isIntegrationAvailable(
  integration: IntegrationContract,
  orgSlug:     string,
): boolean {
  if (!integration.enabled) return false;
  if (integration.healthState === "offline" || integration.healthState === "maintenance") return false;
  if (integration.tenantScope === "castillitos" && orgSlug !== "castillitos") return false;
  return true;
}

export function canDispatchIntegration(
  integration:  IntegrationContract,
  runtimeState: string,
): boolean {
  if (!isIntegrationAvailable(integration, "any")) return false;
  // V3: never dispatch automatically
  if (integration.executionMode === "automatic") return false;
  // Degraded runtime can only use low-risk integrations
  if (runtimeState === "DEGRADED" && integration.riskLevel !== "low") return false;
  return true;
}
