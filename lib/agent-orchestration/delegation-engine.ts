/**
 * lib/agent-orchestration/delegation-engine.ts
 *
 * Agentik Agent Orchestration — Delegation Engine
 *
 * Deterministic engine that converts coordination recommendations and
 * domain-specific signals into AgentDelegation proposals.
 *
 * Rules:
 *   1. David → Diego: commercial production with high/critical severity
 *   2. David → Luca: reference at stock risk + active campaigns detected
 *   3. Luca → David: campaign demand signal + low inventory
 *   4. Mila → Diego: collection liquidity pressure
 *   5. Diego → David: cash flow limiting production capacity
 *
 * Deduplication: never creates a delegation if one already exists
 * (same sourceAgentId + targetAgentId + reason + parentActionId, non-terminal).
 *
 * Sprint: AGENTIK-AGENT-DELEGATION-ORCHESTRATION-01
 */

import type { ActionEnvelope }              from "@/lib/agent-runtime/action-envelope";
import type { RuntimeMemoryNode }            from "@/lib/agent-memory/runtime-memory-types";
import type { AgentObservation }             from "@/lib/agent-memory/runtime-memory-types";
import type { RuntimeIntelligenceReport }    from "@/lib/agent-intelligence/runtime-intelligence-types";
import type { AgentDelegation, DelegationReason, DelegationPriority } from "./delegation-types";
import {
  createDelegationProposal,
  markDelegationPendingApproval,
} from "./delegation-lifecycle";
import {
  enqueueDelegation,
  delegationExists,
} from "./delegation-queue";
import { emitDelegationEvent } from "./delegation-events";

// ── Agent module map ──────────────────────────────────────────────────────────

const AGENT_MODULE: Record<string, string> = {
  david_commercial: "comercial.maletas",
  diego_finance:    "finanzas.conciliacion",
  luca_marketing:   "marketing.studio",
  mila_collections: "comercial.cobranza",
  agentik_copilot:  "agentik.control",
};

function agentModule(agentId: string): string {
  return AGENT_MODULE[agentId] ?? agentId;
}

// ── Severity → priority mapping ───────────────────────────────────────────────

function severityToPriority(severity: string): DelegationPriority {
  if (severity === "critical") return "critical";
  if (severity === "high")     return "high";
  if (severity === "medium")   return "medium";
  return "low";
}

// ── Deduplication guard ───────────────────────────────────────────────────────

async function shouldCreate(
  sourceAgentId:  string,
  targetAgentId:  string,
  reason:         DelegationReason,
  parentActionId: string | null,
): Promise<boolean> {
  return !(await delegationExists(sourceAgentId, targetAgentId, reason, parentActionId));
}

// ── Proposal builder + enqueue ────────────────────────────────────────────────

async function propose(
  orgId:          string,
  sourceAgentId:  string,
  targetAgentId:  string,
  reason:         DelegationReason,
  contextSummary: string,
  payload:        Record<string, unknown>,
  priority:       DelegationPriority,
  parentActionId: string | null,
  causationId:    string | null,
  requiresApproval = true,
): Promise<AgentDelegation | null> {
  if (!(await shouldCreate(sourceAgentId, targetAgentId, reason, parentActionId))) {
    return null; // Already exists — no duplicate
  }

  const proposal = createDelegationProposal({
    orgId,
    sourceAgentId,
    targetAgentId,
    sourceModuleId:  agentModule(sourceAgentId),
    targetModuleId:  agentModule(targetAgentId),
    parentActionId,
    reason,
    contextSummary,
    payload,
    priority,
    requiresApproval,
    correlationId:   `dcorr_${sourceAgentId}_${Date.now()}`,
    causationId,
  });

  const pending = requiresApproval
    ? markDelegationPendingApproval(proposal)
    : proposal;

  const enqueued = await enqueueDelegation(pending);

  emitDelegationEvent("delegation.proposed", enqueued);

  return enqueued;
}

// ── Rule 1: David → Diego — financial impact review ─────────────────────────

async function ruleDavidDiegoFinancial(
  envelopes: ActionEnvelope[],
  orgId:     string,
): Promise<(AgentDelegation | null)[]> {
  const davidHighSeverity = envelopes.filter(e =>
    String(e.sourceAgentId) === "david_commercial" &&
    e.agentStatus === "pending_approval" &&
    (e.severity === "high" || e.severity === "critical"),
  );

  return Promise.all(
    davidHighSeverity.map(e => {
      const qty = typeof e.payloadSummary?.qty === "number" ? e.payloadSummary.qty : null;
      if (qty === null || qty === 0) return null; // No quantity context — skip
      return propose(
        orgId,
        "david_commercial",
        "diego_finance",
        "financial_impact_review",
        `Propuesta de producción "${e.title}" de ${qty} unidades. Severidad: ${e.severity}. Requiere evaluación de impacto en flujo de caja antes de aprobar.`,
        {
          sourceActionId:  e.agentActionId ?? e.actionTaskId,
          reference:       e.payloadSummary?.reference ?? null,
          qty,
          severity:        e.severity,
          moduleKey:       e.moduleKey,
        },
        severityToPriority(e.severity),
        e.agentActionId ?? e.actionTaskId,
        null,
        true,
      );
    }),
  );
}

// ── Rule 2: David → Luca — campaign pause review ─────────────────────────────

async function ruleDavidLucaCampaign(
  envelopes:   ActionEnvelope[],
  memoryNodes: RuntimeMemoryNode[],
  orgId:       string,
): Promise<(AgentDelegation | null)[]> {
  // Only trigger when David has rejected or failed actions (stock depletion signal)
  const davidRisk = envelopes.filter(e =>
    String(e.sourceAgentId) === "david_commercial" &&
    (e.agentStatus === "failed" || e.agentStatus === "rejected"),
  );
  if (davidRisk.length === 0) return [];

  // And when there are critical memory signals in comercial
  const criticalSignals = memoryNodes.filter(n =>
    n.moduleId.startsWith("comercial") &&
    n.severity === "critical",
  );
  if (criticalSignals.length === 0) return [];

  const result = await propose(
    orgId,
    "david_commercial",
    "luca_marketing",
    "campaign_pause_review",
    `David detecta ${davidRisk.length} acción${davidRisk.length !== 1 ? "es" : ""} fallida${davidRisk.length !== 1 ? "s" : ""} o rechazada${davidRisk.length !== 1 ? "s" : ""} con ${criticalSignals.length} señal${criticalSignals.length !== 1 ? "es" : ""} crítica${criticalSignals.length !== 1 ? "s" : ""} de inventario. Las campañas activas pueden estar generando demanda en productos sin cobertura.`,
    {
      davidRiskCount:   davidRisk.length,
      criticalSignals:  criticalSignals.length,
      affectedModules:  [...new Set(criticalSignals.map(n => n.moduleId))],
    },
    "high",
    davidRisk[0]?.agentActionId ?? davidRisk[0]?.actionTaskId ?? null,
    null,
    true,
  );
  return [result];
}

// ── Rule 3: Luca → David — inventory risk review ─────────────────────────────

async function ruleLucaDavidInventory(
  envelopes: ActionEnvelope[],
  orgId:     string,
): Promise<(AgentDelegation | null)[]> {
  const lucaActive = envelopes.filter(e =>
    String(e.sourceAgentId) === "luca_marketing" &&
    (e.agentStatus === "approved" || e.agentStatus === "executing"),
  );
  if (lucaActive.length === 0) return [];

  const result = await propose(
    orgId,
    "luca_marketing",
    "david_commercial",
    "inventory_risk_review",
    `${lucaActive.length} campaña${lucaActive.length !== 1 ? "s" : ""} activa${lucaActive.length !== 1 ? "s" : ""} de Luca pueden estar generando incremento de demanda. David debe verificar niveles de inventario y proponer cobertura si es necesario.`,
    { activeCampaignCount: lucaActive.length },
    "medium",
    lucaActive[0]?.agentActionId ?? lucaActive[0]?.actionTaskId ?? null,
    null,
    false, // No approval needed — informational delegation
  );
  return [result];
}

// ── Rule 4: Mila → Diego — collection liquidity pressure ─────────────────────

async function ruleMilaDiegoLiquidity(
  envelopes: ActionEnvelope[],
  orgId:     string,
): Promise<(AgentDelegation | null)[]> {
  const milaFailed = envelopes.filter(e =>
    String(e.sourceAgentId) === "mila_collections" &&
    e.agentStatus === "failed",
  );
  if (milaFailed.length === 0) return [];

  const result = await propose(
    orgId,
    "mila_collections",
    "diego_finance",
    "collection_risk_review",
    `Mila detecta ${milaFailed.length} gestión${milaFailed.length !== 1 ? "es" : ""} de cobranza fallida${milaFailed.length !== 1 ? "s" : ""}. Diego debe actualizar el modelo de liquidez con el impacto real en cartera.`,
    { failedCollectionCount: milaFailed.length },
    milaFailed.length >= 3 ? "high" : "medium",
    milaFailed[0]?.agentActionId ?? milaFailed[0]?.actionTaskId ?? null,
    null,
    true,
  );
  return [result];
}

// ── Rule 5: Diego → David — production dependency ────────────────────────────

async function ruleDiegoDavidProduction(
  memoryNodes: RuntimeMemoryNode[],
  orgId:       string,
): Promise<(AgentDelegation | null)[]> {
  const diegoCritical = memoryNodes.filter(n =>
    n.agentId === "diego_finance" &&
    n.severity === "critical" &&
    n.moduleId.startsWith("finanzas"),
  );
  if (diegoCritical.length === 0) return [];

  const result = await propose(
    orgId,
    "diego_finance",
    "david_commercial",
    "production_dependency",
    `Diego registra ${diegoCritical.length} señal${diegoCritical.length !== 1 ? "es" : ""} financiera${diegoCritical.length !== 1 ? "s" : ""} crítica${diegoCritical.length !== 1 ? "s" : ""}. Las restricciones de flujo de caja limitan la capacidad de nuevas órdenes de producción. David debe revisar su backlog de propuestas.`,
    {
      criticalFinanceSignals: diegoCritical.length,
      affectedModules:        [...new Set(diegoCritical.map(n => n.moduleId))],
    },
    "high",
    null,
    null,
    true,
  );
  return [result];
}

// ── Rule 6: Intelligence report → delegations ─────────────────────────────────
// Converts coordination recommendations from the intelligence engine
// into formal delegation proposals (if they don't already exist)

async function ruleFromIntelligenceReport(
  report: RuntimeIntelligenceReport,
  orgId:  string,
): Promise<(AgentDelegation | null)[]> {
  return Promise.all(
    report.coordinationRecommendations.map(rec => {
      const reason: DelegationReason = (() => {
        const src = rec.sourceAgentId;
        const tgt = rec.targetAgentId;
        if (src === "david_commercial" && tgt === "diego_finance") return "financial_impact_review";
        if (src === "david_commercial" && tgt === "luca_marketing") return "campaign_pause_review";
        if (src === "luca_marketing"   && tgt === "david_commercial") return "inventory_risk_review";
        if (src === "mila_collections" && tgt === "diego_finance")    return "collection_risk_review";
        if (src === "diego_finance"    && tgt === "david_commercial") return "production_dependency";
        return "cross_module_dependency";
      })();

      return propose(
        orgId,
        rec.sourceAgentId,
        rec.targetAgentId,
        reason,
        rec.reason,
        { recommendedAction: rec.recommendedAction, sourceActionId: rec.sourceActionId },
        severityToPriority(rec.priority),
        rec.sourceActionId,
        null,
        rec.requiresHumanApproval,
      );
    }),
  );
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runDelegationEngine(
  orgId:        string,
  envelopes:    ActionEnvelope[],
  memoryNodes:  RuntimeMemoryNode[],
  observations: AgentObservation[],
  report?:      RuntimeIntelligenceReport,
): Promise<AgentDelegation[]> {
  void observations; // Reserved for future observation-driven delegation rules

  const results = await Promise.all([
    ruleDavidDiegoFinancial(envelopes, orgId),
    ruleDavidLucaCampaign(envelopes, memoryNodes, orgId),
    ruleLucaDavidInventory(envelopes, orgId),
    ruleMilaDiegoLiquidity(envelopes, orgId),
    ruleDiegoDavidProduction(memoryNodes, orgId),
    ...(report ? [ruleFromIntelligenceReport(report, orgId)] : [[]]),
  ]);

  return results
    .flat()
    .filter((d): d is AgentDelegation => d !== null);
}
