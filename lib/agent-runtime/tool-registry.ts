/**
 * lib/agent-runtime/tool-registry.ts
 *
 * Agentik Agent Runtime — Tool Registry
 *
 * Catalog of all declared AgentTools organized by domain.
 * This file declares TYPES and CATALOG only — no handlers, no Prisma, no execution logic.
 *
 * Handlers live in domain-specific lib/ modules and are referenced via `handlerRef`.
 * When Mastra is adopted, it reads this registry to bind tools to agents.
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-ARCHITECTURE-01
 */

import type { AgentTool, AgentRuntimeId } from "./agent-types";

// ── Tool catalog ──────────────────────────────────────────────────────────────

// ── Finance tools (diego_finance) ─────────────────────────────────────────────

const FINANCE_TOOLS: AgentTool[] = [
  {
    id:              "finance.getRuntimeSnapshot",
    name:            "Get Financial Runtime Snapshot",
    domain:          "finance",
    description:     "Returns the full financial operational snapshot for the current period: income, expenses, treasury, close status.",
    inputSchema:     { type: "object", properties: { period: { type: "string" } } },
    outputSchema:    null,
    permission:      "read",
    executionMode:   "instant",
    requiresApproval: false,
    handlerRef:      "lib/finance/runtime#getFinancialRuntimeSnapshot",
  },
  {
    id:              "finance.explainCashFlowRisk",
    name:            "Explain Cash Flow Risk",
    domain:          "finance",
    description:     "Diagnoses treasury coverage risk: coverage days, pending inflows, open obligations.",
    inputSchema:     null,
    outputSchema:    null,
    permission:      "read",
    executionMode:   "instant",
    requiresApproval: false,
    handlerRef:      "lib/finance/treasury#explainCashFlowRisk",
  },
  {
    id:              "finance.getReconciliationStatus",
    name:            "Get Reconciliation Status",
    domain:          "finance",
    description:     "Returns reconciliation status per source: matched, unmatched, pending critical items.",
    inputSchema:     null,
    outputSchema:    null,
    permission:      "read",
    executionMode:   "instant",
    requiresApproval: false,
    handlerRef:      "lib/finance/reconciliation#getReconciliationStatus",
  },
  {
    id:              "finance.createCollectionAction",
    name:            "Create Collection Action",
    domain:          "finance",
    description:     "Creates a collection follow-up action for a critical overdue client.",
    inputSchema:     { type: "object", required: ["clientId", "balanceDue"], properties: { clientId: { type: "string" }, balanceDue: { type: "number" } } },
    outputSchema:    null,
    permission:      "write",
    executionMode:   "supervised",
    requiresApproval: true,
    handlerRef:      "lib/agentik/action-registry#salesCreateCollectionFollowup",
  },
  {
    id:              "finance.reconcilePaymentCandidate",
    name:            "Reconcile Payment Candidate",
    domain:          "finance",
    description:     "Marks a transaction as a reconciliation candidate and creates an audit entry.",
    inputSchema:     { type: "object", required: ["transactionId"], properties: { transactionId: { type: "string" } } },
    outputSchema:    null,
    permission:      "write",
    executionMode:   "supervised",
    requiresApproval: true,
    handlerRef:      "lib/finance/reconciliation#reconcilePaymentCandidate",
  },
];

// ── Commercial tools (david_commercial) ───────────────────────────────────────

const COMMERCIAL_TOOLS: AgentTool[] = [
  {
    id:              "commercial.getCoverageSnapshot",
    name:            "Get Coverage Snapshot",
    domain:          "commercial",
    description:     "Returns the full Maletas operational context: reference coverage, PD pressure, production recommendations.",
    inputSchema:     null,
    outputSchema:    null,
    permission:      "read",
    executionMode:   "instant",
    requiresApproval: false,
    handlerRef:      "lib/comercial/maletas/maletas-runtime#buildMaletasRuntime",
  },
  {
    id:              "commercial.getReferenceDecision",
    name:            "Get Reference Decision",
    domain:          "commercial",
    description:     "Returns the operational state and decision for a specific reference: opState, disponible, PD pending, suggested qty.",
    inputSchema:     { type: "object", required: ["reference"], properties: { reference: { type: "string" } } },
    outputSchema:    null,
    permission:      "read",
    executionMode:   "instant",
    requiresApproval: false,
    handlerRef:      "lib/comercial/maletas/reference-decision-engine#buildReferenceDecisions",
  },
  {
    id:              "commercial.getTopCriticalReferences",
    name:            "Get Top Critical References",
    domain:          "commercial",
    description:     "Returns top 5 references in agotado/producir_urgente/riesgo_pd states sorted by operational score.",
    inputSchema:     null,
    outputSchema:    null,
    permission:      "read",
    executionMode:   "instant",
    requiresApproval: false,
    handlerRef:      "lib/comercial/maletas/reference-decision-engine#buildReferenceDecisions",
  },
  {
    id:              "commercial.createProductionRequestDraft",
    name:            "Create Production Request Draft",
    domain:          "commercial",
    description:     "Creates a draft production request for a reference with insufficient coverage.",
    inputSchema:     { type: "object", required: ["reference", "quantity", "reason"], properties: { reference: { type: "string" }, quantity: { type: "number" }, reason: { type: "string" } } },
    outputSchema:    null,
    permission:      "write",
    executionMode:   "supervised",
    requiresApproval: true,
    handlerRef:      "lib/comercial/maletas/production-requests#createProductionRequestDraft",
  },
  {
    id:              "commercial.markReferenceAsPaused",
    name:            "Mark Reference as Paused",
    domain:          "commercial",
    description:     "Flags a reference as paused — stops replenishment recommendations until stock arrives.",
    inputSchema:     { type: "object", required: ["reference"], properties: { reference: { type: "string" }, reason: { type: "string" } } },
    outputSchema:    null,
    permission:      "write",
    executionMode:   "supervised",
    requiresApproval: true,
    handlerRef:      "lib/comercial/maletas/reference-flags#markReferenceAsPaused",
  },
  {
    id:              "commercial.triggerReplenishmentAlert",
    name:            "Trigger Replenishment Alert",
    domain:          "commercial",
    description:     "Notifies assigned sales reps that a reference needs to be replenished from warehouse stock.",
    inputSchema:     { type: "object", required: ["reference", "repIds"], properties: { reference: { type: "string" }, repIds: { type: "array", items: { type: "string" } } } },
    outputSchema:    null,
    permission:      "write",
    executionMode:   "supervised",
    requiresApproval: true,
    handlerRef:      "lib/comercial/maletas/replenishment#triggerReplenishmentAlert",
  },
];

// ── Marketing tools (luca_marketing) ──────────────────────────────────────────

const MARKETING_TOOLS: AgentTool[] = [
  {
    id:              "marketing.getCampaignStatus",
    name:            "Get Campaign Status",
    domain:          "marketing",
    description:     "Returns status of active campaigns: reach, budget consumption, performance vs target.",
    inputSchema:     null,
    outputSchema:    null,
    permission:      "read",
    executionMode:   "instant",
    requiresApproval: false,
    handlerRef:      "lib/marketing-studio/orchestrator/runtime#getOrchestratorStatus",
  },
  {
    id:              "marketing.analyzeCatalogHealth",
    name:            "Analyze Catalog Health",
    domain:          "marketing",
    description:     "Analyzes Shopify catalog health: missing images, price gaps, unpublished products.",
    inputSchema:     null,
    outputSchema:    null,
    permission:      "read",
    executionMode:   "instant",
    requiresApproval: false,
    handlerRef:      "lib/marketing-studio/shopify/catalog#analyzeCatalogHealth",
  },
  {
    id:              "marketing.generateCampaignBrief",
    name:            "Generate Campaign Brief",
    domain:          "marketing",
    description:     "Generates a campaign brief from detected catalog signals and performance data.",
    inputSchema:     { type: "object", properties: { focus: { type: "string" }, channel: { type: "string" } } },
    outputSchema:    null,
    permission:      "write",
    executionMode:   "supervised",
    requiresApproval: true,
    handlerRef:      "lib/marketing-studio/campaigns/brief#generateCampaignBrief",
  },
  {
    id:              "marketing.createCreativeTask",
    name:            "Create Creative Task",
    domain:          "marketing",
    description:     "Creates a content creation task in the Marketing Studio task queue.",
    inputSchema:     { type: "object", required: ["title", "channel"], properties: { title: { type: "string" }, channel: { type: "string" }, brief: { type: "string" } } },
    outputSchema:    null,
    permission:      "write",
    executionMode:   "supervised",
    requiresApproval: true,
    handlerRef:      "lib/marketing-studio/tasks#createCreativeTask",
  },
];

// ── Collections tools (mila_collections) ──────────────────────────────────────

const COLLECTIONS_TOOLS: AgentTool[] = [
  {
    id:              "collections.getAgingPortfolio",
    name:            "Get Aging Portfolio",
    domain:          "collections",
    description:     "Returns accounts receivable bucketed by age: 0-30, 31-60, 61-90, 90+ days.",
    inputSchema:     null,
    outputSchema:    null,
    permission:      "read",
    executionMode:   "instant",
    requiresApproval: false,
    handlerRef:      "lib/collections/portfolio#getAgingPortfolio",
  },
  {
    id:              "collections.getOverdueClients",
    name:            "Get Overdue Clients",
    domain:          "collections",
    description:     "Returns clients with critical overdue balances sorted by amount due.",
    inputSchema:     { type: "object", properties: { minDaysPastDue: { type: "number" } } },
    outputSchema:    null,
    permission:      "read",
    executionMode:   "instant",
    requiresApproval: false,
    handlerRef:      "lib/collections/portfolio#getOverdueClients",
  },
  {
    id:              "collections.createFollowupAction",
    name:            "Create Collection Follow-up Action",
    domain:          "collections",
    description:     "Creates a collection management task for an overdue client.",
    inputSchema:     { type: "object", required: ["clientId", "balanceDue"], properties: { clientId: { type: "string" }, balanceDue: { type: "number" }, channel: { type: "string" } } },
    outputSchema:    null,
    permission:      "write",
    executionMode:   "supervised",
    requiresApproval: true,
    handlerRef:      "lib/agentik/action-registry#salesCreateCollectionFollowup",
  },
  {
    id:              "collections.escalateToManager",
    name:            "Escalate to Manager",
    domain:          "collections",
    description:     "Escalates a critical overdue client to management with full balance context.",
    inputSchema:     { type: "object", required: ["clientId"], properties: { clientId: { type: "string" }, notes: { type: "string" } } },
    outputSchema:    null,
    permission:      "write",
    executionMode:   "supervised",
    requiresApproval: true,
    handlerRef:      "lib/agentik/action-registry#alertsEscalateCritical",
  },
];

// ── Registry lookup ───────────────────────────────────────────────────────────

const ALL_TOOLS: AgentTool[] = [
  ...FINANCE_TOOLS,
  ...COMMERCIAL_TOOLS,
  ...MARKETING_TOOLS,
  ...COLLECTIONS_TOOLS,
];

const BY_ID = new Map<string, AgentTool>(ALL_TOOLS.map(t => [t.id, t]));

/** Get a tool by its ID. Returns null when not found. */
export function getToolById(id: string): AgentTool | null {
  return BY_ID.get(id) ?? null;
}

/** Get all tools for a given AgentRuntimeId. */
export function getToolsForAgent(agentId: AgentRuntimeId): AgentTool[] {
  const domainMap: Record<AgentRuntimeId, AgentTool[]> = {
    diego_finance:    FINANCE_TOOLS,
    david_commercial: COMMERCIAL_TOOLS,
    luca_marketing:   MARKETING_TOOLS,
    mila_collections: COLLECTIONS_TOOLS,
    agentik_copilot:  ALL_TOOLS,  // executive copilot can reference all tools (read-only)
  };
  return domainMap[agentId] ?? [];
}

export { FINANCE_TOOLS, COMMERCIAL_TOOLS, MARKETING_TOOLS, COLLECTIONS_TOOLS, ALL_TOOLS };
