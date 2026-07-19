/**
 * lib/integrations/integration-gateway.ts
 *
 * Agentik — Integration Gateway V1
 *
 * Block B of Sprint AGENTIK-RUNTIME-ORCHESTRATION-GATEWAY-OBSERVABILITY-01
 *
 * Acts as the unified access layer for all external integrations.
 * Validates dispatch eligibility, applies governance rules,
 * and generates dispatch drafts for human approval.
 *
 * V1: no real dispatches. Governance + draft creation only.
 * V4: gateway will send real API calls after human confirmation.
 */

import type { IntegrationContract, IntegrationDispatchDraft } from "./integration-contracts";
import { canDispatchIntegration, isIntegrationAvailable }      from "./integration-contracts";
import {
  getIntegrationsForTenant,
  getReadyIntegrations,
  getOperationalIntegrations,
}                                                               from "./integration-registry";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GatewayReadiness {
  orgSlug:              string;
  totalIntegrations:    number;
  readyCount:           number;       // Operational + healthy
  blockedCount:         number;       // Offline or unconfigured for this org
  degradedCount:        number;       // Degraded — partial availability
  dispatchAvailable:    boolean;      // Can any integration be dispatched?
  readinessPercent:     number;       // 0–100%
  summary:              string;
  topReadyIntegration?: string;       // Name of first ready integration
  topBlockedReason?:    string;
}

export interface GatewayDispatchContext {
  integration:   IntegrationContract;
  allowed:       boolean;
  reason:        string;
  requiresApproval: boolean;
  draft?:        IntegrationDispatchDraft;
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Builds the gateway readiness snapshot for a tenant.
 */
export function buildGatewayReadiness(
  orgSlug:      string,
  runtimeState: string,
): GatewayReadiness {
  const all         = getIntegrationsForTenant(orgSlug);
  const ready       = getReadyIntegrations(orgSlug);
  const operational = getOperationalIntegrations(orgSlug);
  const degraded    = operational.filter(i => i.healthState === "degraded");

  // Blocked = offline OR unconfigured OR tenant scope mismatch
  const blocked = all.filter(
    i => !i.enabled || i.healthState === "offline" || i.healthState === "unconfigured"
  );

  const dispatchAvailable = ready.some(i => canDispatchIntegration(i, runtimeState));
  const total              = Math.max(1, all.length);
  const readinessPercent   = Math.round((ready.length / total) * 100);

  const summary =
    ready.length === 0        ? "Sin integraciones listas — configuración requerida" :
    degraded.length > 0       ? `${ready.length} lista${ready.length !== 1 ? "s" : ""}, ${degraded.length} degradada${degraded.length !== 1 ? "s" : ""}` :
    blocked.length > 0        ? `${ready.length} lista${ready.length !== 1 ? "s" : ""}, ${blocked.length} sin configurar` :
    `${ready.length} integración${ready.length !== 1 ? "es" : ""} operativa${ready.length !== 1 ? "s" : ""}`;

  return {
    orgSlug,
    totalIntegrations: all.length,
    readyCount:        ready.length,
    blockedCount:      blocked.length,
    degradedCount:     degraded.length,
    dispatchAvailable,
    readinessPercent,
    summary,
    topReadyIntegration:  ready[0]?.name,
    topBlockedReason:     blocked[0] ? `${blocked[0].name}: ${blocked[0].healthState}` : undefined,
  };
}

/**
 * Evaluates dispatch eligibility for a specific integration + action.
 * Builds a draft if allowed.
 * V1: no real dispatch — draft creation only.
 */
export function evaluateDispatch(params: {
  integrationId: string;
  actionType:    string;
  payload:       Record<string, unknown>;
  agentId:       string;
  orgSlug:       string;
  runtimeState:  string;
  integration:   IntegrationContract;
}): GatewayDispatchContext {
  const { integration, agentId, orgSlug, runtimeState, actionType, payload } = params;

  if (!isIntegrationAvailable(integration, orgSlug)) {
    return {
      integration,
      allowed:          false,
      reason:           `${integration.name} no disponible para ${orgSlug}`,
      requiresApproval: false,
    };
  }

  if (!canDispatchIntegration(integration, runtimeState)) {
    return {
      integration,
      allowed:          false,
      reason:           `Despacho de ${integration.name} bloqueado — runtime ${runtimeState}`,
      requiresApproval: false,
    };
  }

  if (!integration.supportedActions.includes(actionType)) {
    return {
      integration,
      allowed:          false,
      reason:           `Acción "${actionType}" no soportada por ${integration.name}`,
      requiresApproval: false,
    };
  }

  // Build dispatch draft (V1: no real call)
  const draft: IntegrationDispatchDraft = {
    draftId:       crypto.randomUUID(),
    integrationId: integration.id,
    actionType,
    payload,
    agentId,
    orgSlug,
    preparedAt:    new Date().toISOString(),
    status:        integration.riskLevel === "low" ? "pending_approval" : "draft",
    approvalNote:  integration.riskLevel === "critical"
      ? "Integración de riesgo crítico — requiere aprobación explícita del administrador"
      : integration.riskLevel === "high"
      ? "Acción de alto riesgo — confirmación del operador requerida"
      : undefined,
  };

  return {
    integration,
    allowed:          true,
    reason:           `${integration.name} lista para despacho en modo ${integration.executionMode}`,
    requiresApproval: integration.riskLevel !== "low",
    draft,
  };
}

/**
 * Returns a compact list of dispatch drafts for the rail summary.
 */
export function summarizeGatewayDispatch(
  contexts: GatewayDispatchContext[],
): string {
  const allowed  = contexts.filter(c => c.allowed).length;
  const blocked  = contexts.filter(c => !c.allowed).length;
  const hasDraft = contexts.some(c => c.draft);

  if (allowed === 0)  return "Sin despachos disponibles en este contexto";
  if (hasDraft)       return `${allowed} despacho${allowed !== 1 ? "s" : ""} preparado${allowed !== 1 ? "s" : ""} — aprobación pendiente`;
  return `${allowed} integración${allowed !== 1 ? "es" : ""} lista${allowed !== 1 ? "s" : ""}${blocked > 0 ? `, ${blocked} bloqueada${blocked !== 1 ? "s" : ""}` : ""}`;
}
