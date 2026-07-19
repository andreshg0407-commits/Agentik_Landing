/**
 * lib/copilot/agent-collaboration.ts
 *
 * Agentik Copilot — Multi-Agent Collaboration Engine V1
 *
 * Phases 1 + 2 + 8 of Sprint AGENTIK-COPILOT-MULTI-AGENT-DELEGATION-01
 *
 * Defines the collaboration contract between agents and computes
 * active collaboration signals from the operational context.
 *
 * V1: deterministic, no DB, no side effects.
 * V2: driven by Prisma.CopilotCollaborationLog with real resolution history.
 */

import type { CopilotContextSnapshot }   from "./context-engine";
import type { ExecutiveIntent }           from "./executive-intent";
import type { CompoundOperation }         from "./compound-operations";
import type { AccountabilitySignal }      from "./accountability-engine";
import type { ContextualRecommendation }  from "./contextual-recommendation-engine";
import type { CrossModuleInsight }        from "./cross-module-intelligence";

// ── Types ──────────────────────────────────────────────────────────────────────

export type AgentCollaborationType =
  | "handoff"           // Full ownership transfer to target agent
  | "consultation"      // Source asks target for a specific read or input
  | "support_request"   // Source requests ongoing support in a domain
  | "escalation"        // Situation elevated to target for resolution authority
  | "shared_context";   // Both agents observe the same operational domain

export type AgentCollaborationStatus =
  | "proposed"   // Engine has flagged the need — not yet actioned
  | "active"     // Collaboration is in progress
  | "waiting"    // Source is awaiting a response or artifact from target
  | "resolved"   // Contribution was delivered, collaboration closed
  | "blocked";   // Target agent is unable to act (missing context, degraded)

export type CollaborationPriority = "urgent" | "high" | "medium" | "low";

export interface AgentCollaboration {
  id:                    string;
  orgSlug:               string;
  sourceAgentId:         string;
  targetAgentId:         string;
  type:                  AgentCollaborationType;
  status:                AgentCollaborationStatus;
  reason:                string;               // Why the collaboration is needed
  relatedModule:         string;               // Primary module context
  relatedIntentId?:      string;
  relatedOperationId?:   string;
  priority:              CollaborationPriority;
  contextSummary:        string;               // 1-sentence briefing for the target
  expectedContribution:  string;               // What target should deliver
  suggestedActionIds:    string[];
  createdAt:             string;               // Serializable — relative time string
}

// ── Phase 8 — Agent microcopy tables ──────────────────────────────────────────
// Each agent has distinct verbs for collaboration communication.

const AGENT_COLLAB_VERBS: Record<string, {
  requesting: string;  // What source agent says when requesting
  delivering: string;  // What target agent says when contributing
}> = {
  diego: {
    requesting: "solicita apoyo técnico",
    delivering: "mantiene control financiero",
  },
  luca: {
    requesting: "solicita lectura comercial",
    delivering: "coordina recuperación de demanda",
  },
  sofi: {
    requesting: "revisa estabilidad",
    delivering: "valida conectores y fuentes críticas",
  },
  mila: {
    requesting: "activa seguimiento comercial",
    delivering: "prioriza oportunidad y recupera conversación",
  },
};

export function getCollabVerb(agentId: string, role: "requesting" | "delivering"): string {
  return AGENT_COLLAB_VERBS[agentId]?.[role]
    ?? (role === "requesting" ? "solicita colaboración" : "contribuye al plan");
}

// ── Contribution phrase builders ───────────────────────────────────────────────

const TARGET_CONTRIBUTION: Record<string, Record<string, string>> = {
  sofi: {
    "degraded_runtime":   "revisar integraciones y sincronización SAG",
    "blocked_step":       "diagnosticar bloqueo técnico y restaurar conector",
    "stalled_operation":  "verificar fuentes de datos y estado del runtime",
    "default":            "confirmar estabilidad técnica del sistema",
  },
  diego: {
    "marketing_no_conversion": "validar impacto financiero y costo de campaña",
    "blocked_step":            "revisar flujo de aprobaciones y desbloquear paso",
    "default":                 "validar impacto financiero de la situación",
  },
  mila: {
    "protect_liquidity":  "activar seguimiento comercial y cobranza vía WhatsApp",
    "recover_commercial": "recuperar conversaciones y leads prioritarios",
    "default":            "priorizar oportunidades de venta y pipeline activo",
  },
  luca: {
    "unresolved_intent":  "revisar plan de campaña y alinear con contexto financiero",
    "default":            "proponer intervención creativa y recuperación de demanda",
  },
};

function buildExpectedContribution(targetId: string, signalType: string): string {
  const map = TARGET_CONTRIBUTION[targetId] ?? {};
  return map[signalType] ?? map["default"] ?? "contribuir según su dominio operativo";
}

// ── Collaboration rules ────────────────────────────────────────────────────────

interface CollaborationRule {
  id: string;
  evaluate: (
    context:     CopilotContextSnapshot,
    intent:      ExecutiveIntent | null,
    operation:   CompoundOperation | null,
    signals:     AccountabilitySignal[],
    _recs:       ContextualRecommendation[],
    _insights:   CrossModuleInsight[],
  ) => AgentCollaboration | null;
}

const COLLABORATION_RULES: CollaborationRule[] = [

  // Rule 1 — Runtime degraded → active agent → Sofi
  {
    id: "degraded_to_sofi",
    evaluate: (ctx, intent, op, _signals) => {
      if (ctx.runtimeState !== "DEGRADED" && ctx.runtimeState !== "STALE") return null;
      const src = ctx.activeAgentId;
      if (src === "sofi") return null; // Sofi doesn't delegate to herself
      const isDegraded = ctx.runtimeState === "DEGRADED";
      return {
        id:                   `collab-runtime-${ctx.orgSlug}`,
        orgSlug:               ctx.orgSlug,
        sourceAgentId:         src,
        targetAgentId:         "sofi",
        type:                  "support_request",
        status:                "proposed",
        reason:                isDegraded
          ? "El runtime está degradado y puede afectar la lectura operativa"
          : "Hay sincronización pendiente que puede comprometer la precisión del plan",
        relatedModule:         "integrations",
        relatedIntentId:       intent?.id,
        relatedOperationId:    op?.id,
        priority:              isDegraded ? "high" : "medium",
        contextSummary:        isDegraded
          ? "Fuentes de datos parciales — el motor de señales no tiene contexto completo."
          : "Sincronización pendiente — los datos pueden tener retraso.",
        expectedContribution:  buildExpectedContribution("sofi", "degraded_runtime"),
        suggestedActionIds:    ["review_integrations", "validate_data_sources"],
        createdAt:             "esta sesión",
      };
    },
  },

  // Rule 2 — Liquidity at risk → Diego → Mila
  {
    id: "liquidity_to_mila",
    evaluate: (ctx, intent, op) => {
      if (intent?.type !== "protect_liquidity") return null;
      if (ctx.activeAgentId !== "diego") return null;
      return {
        id:                   `collab-liquidity-${ctx.orgSlug}`,
        orgSlug:               ctx.orgSlug,
        sourceAgentId:         "diego",
        targetAgentId:         "mila",
        type:                  "handoff",
        status:                "proposed",
        reason:                "La liquidez está bajo presión — se requiere recuperación comercial y cobranza",
        relatedModule:         "collections",
        relatedIntentId:       intent.id,
        relatedOperationId:    op?.id,
        priority:              (intent as any).pressure === "urgent" ? "urgent" : "high",
        contextSummary:        "La cartera activa necesita seguimiento directo para mejorar el flujo de caja.",
        expectedContribution:  buildExpectedContribution("mila", "protect_liquidity"),
        suggestedActionIds:    ["activate_collections_followup", "send_whatsapp_reminder"],
        createdAt:             "esta sesión",
      };
    },
  },

  // Rule 3 — Commercial decline → Luca → Mila
  {
    id: "commercial_to_mila",
    evaluate: (ctx, intent, op) => {
      if (intent?.type !== "recover_commercial") return null;
      if (ctx.activeAgentId !== "luca") return null;
      return {
        id:                   `collab-commercial-${ctx.orgSlug}`,
        orgSlug:               ctx.orgSlug,
        sourceAgentId:         "luca",
        targetAgentId:         "mila",
        type:                  "consultation",
        status:                "proposed",
        reason:                "El ritmo comercial cayó — se necesita recuperar conversaciones y leads activos",
        relatedModule:         "sales",
        relatedIntentId:       intent.id,
        relatedOperationId:    op?.id,
        priority:              "high",
        contextSummary:        "El pipeline tiene oportunidades sin seguimiento activo que Mila puede recuperar.",
        expectedContribution:  buildExpectedContribution("mila", "recover_commercial"),
        suggestedActionIds:    ["recover_pipeline_conversations", "prioritize_leads"],
        createdAt:             "esta sesión",
      };
    },
  },

  // Rule 4 — Marketing no conversion → Luca → Diego
  {
    id: "marketing_to_diego",
    evaluate: (ctx, intent, op) => {
      if (ctx.activeAgentId !== "luca") return null;
      // Fire when there's a commercial intent but also a financial signal
      if (intent?.type !== "recover_commercial") return null;
      if (ctx.operationalPriority !== "critical" && ctx.operationalPriority !== "elevated") return null;
      return {
        id:                   `collab-marketing-fin-${ctx.orgSlug}`,
        orgSlug:               ctx.orgSlug,
        sourceAgentId:         "luca",
        targetAgentId:         "diego",
        type:                  "consultation",
        status:                "proposed",
        reason:                "La campaña necesita validación de impacto financiero antes de escalar inversión",
        relatedModule:         "finanzas",
        relatedIntentId:       intent.id,
        relatedOperationId:    op?.id,
        priority:              "medium",
        contextSummary:        "Luca necesita confirmar que el costo de la campaña es viable con el estado actual de tesorería.",
        expectedContribution:  buildExpectedContribution("diego", "marketing_no_conversion"),
        suggestedActionIds:    ["validate_campaign_budget", "review_cac_impact"],
        createdAt:             "esta sesión",
      };
    },
  },

  // Rule 5 — Operation blocked → active agent → Sofi or Diego by module
  {
    id: "blocked_operation_escalation",
    evaluate: (ctx, intent, op, signals) => {
      if (!op || op.status !== "blocked") return null;
      const hasBlockedSignal = signals.some(s => s.type === "blocked_step");
      if (!hasBlockedSignal) return null;
      // Route to Sofi for integration/runtime blocks, Diego for financial blocks
      const primaryModule = op.involvedModules[0] ?? ctx.activeModule;
      const isIntegrationBlock = primaryModule.includes("integrations") || ctx.runtimeState === "DEGRADED";
      const targetId = isIntegrationBlock ? "sofi" : "diego";
      if (ctx.activeAgentId === targetId) return null;
      return {
        id:                   `collab-blocked-${op.id}`,
        orgSlug:               ctx.orgSlug,
        sourceAgentId:         ctx.activeAgentId,
        targetAgentId:         targetId,
        type:                  "escalation",
        status:                "proposed",
        reason:                `"${op.title}" está bloqueado — se requiere intervención directa`,
        relatedModule:         primaryModule,
        relatedIntentId:       intent?.id,
        relatedOperationId:    op.id,
        priority:              op.riskLevel === "critical" ? "urgent" : "high",
        contextSummary:        `El plan operativo no puede avanzar sin resolver las dependencias en ${primaryModule}.`,
        expectedContribution:  buildExpectedContribution(
          targetId,
          isIntegrationBlock ? "blocked_step" : "blocked_step",
        ),
        suggestedActionIds:    ["resolve_blocker", "escalate_to_owner"],
        createdAt:             "esta sesión",
      };
    },
  },

  // Rule 6 — Cross-module signals → active agent → module owner
  {
    id: "cross_module_signal",
    evaluate: (ctx, intent, op, signals) => {
      if (signals.length === 0) return null;
      // Only fire if there's a cross-module accountability signal in a foreign module
      const crossSignal = signals.find(s =>
        s.type === "unresolved_intent" || s.type === "stalled_operation"
      );
      if (!crossSignal) return null;
      // Map module → owning agent
      const MODULE_OWNER: Record<string, string> = {
        "collections":           "mila",
        "sales":                 "mila",
        "pipeline":              "mila",
        "agentik/marketing-studio": "luca",
        "integrations":          "sofi",
        "finanzas":              "diego",
        "finanzas/tesoreria":    "diego",
        "finanzas/cierre":       "diego",
        "finanzas/conciliacion": "diego",
      };
      const opModule = op?.involvedModules[0] ?? ctx.activeModule;
      const owner = MODULE_OWNER[opModule];
      if (!owner || owner === ctx.activeAgentId) return null;
      return {
        id:                   `collab-cross-${opModule.replace(/\//g, "-")}-${ctx.orgSlug}`,
        orgSlug:               ctx.orgSlug,
        sourceAgentId:         ctx.activeAgentId,
        targetAgentId:         owner,
        type:                  "shared_context",
        status:                "proposed",
        reason:                `Señal activa en módulo de ${owner} requiere atención coordinada`,
        relatedModule:         opModule,
        relatedIntentId:       intent?.id,
        relatedOperationId:    op?.id,
        priority:              "medium",
        contextSummary:        crossSignal.description,
        expectedContribution:  buildExpectedContribution(owner, "stalled_operation"),
        suggestedActionIds:    ["share_context", "align_on_priority"],
        createdAt:             "esta sesión",
      };
    },
  },
];

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Computes active agent collaboration signals from the operational context.
 * Returns at most 3 collaborations, deduped by target agent.
 */
export function computeAgentCollaborations(params: {
  context:           CopilotContextSnapshot;
  primaryIntent:     ExecutiveIntent | null;
  primaryOperation:  CompoundOperation | null;
  accountabilitySignals: AccountabilitySignal[];
  recommendations:   ContextualRecommendation[];
  insights:          CrossModuleInsight[];
}): AgentCollaboration[] {
  const { context, primaryIntent, primaryOperation, accountabilitySignals, recommendations, insights } = params;

  const results: AgentCollaboration[] = [];
  const seenTargets = new Set<string>();

  for (const rule of COLLABORATION_RULES) {
    const collab = rule.evaluate(
      context,
      primaryIntent,
      primaryOperation,
      accountabilitySignals,
      recommendations,
      insights,
    );
    if (!collab) continue;
    // One collaboration per target agent — highest-priority rule wins
    if (seenTargets.has(collab.targetAgentId)) continue;
    seenTargets.add(collab.targetAgentId);
    results.push(collab);
    if (results.length >= 3) break;
  }

  return results;
}
