/**
 * lib/agents/runtime/agent-runtime-fixtures.ts
 *
 * Agentik — Agent Runtime Test Fixtures
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Realistic fixtures for testing and local demos.
 * All data refers to Castillitos tenant.
 *
 * Pure. No Prisma. No React. No Next.
 */

import type { AgentRuntimeContext } from "./agent-context";

import {
  DIEGO_FINANCE_AGENT,
  LUCA_MARKETING_AGENT,
  MILA_COMMERCIAL_AGENT,
} from "./agent-profile";
import { createEmptyAgentMemory } from "./agent-memory";
import {
  castillitosDecisionContext,
  financeConciliationSignal,
  financeCashflowRiskSignal,
  collectionsOverdueSignal,
  marketingCampaignReadySignal,
  commercialMarginDropSignal,
  operationsInventoryTransferSignal,
} from "../../decisions/decision-fixtures";
import { buildAgentContextFromDecisionContext } from "./agent-context";

// ── Diego — Finance Runtime Context ──────────────────────────────────────────

export const castillitosDiegoRuntimeContext: AgentRuntimeContext = buildAgentContextFromDecisionContext(
  {
    ...castillitosDecisionContext,
    signals: [financeConciliationSignal, financeCashflowRiskSignal, collectionsOverdueSignal],
    module:  "finanzas",
    agentId: "diego",
    agentName: "Diego",
  },
  DIEGO_FINANCE_AGENT,
  createEmptyAgentMemory("diego"),
  "APPROVAL_REQUIRED",
);

// ── Luca — Marketing Runtime Context ─────────────────────────────────────────

export const castillitosLucaRuntimeContext: AgentRuntimeContext = buildAgentContextFromDecisionContext(
  {
    ...castillitosDecisionContext,
    signals:   [marketingCampaignReadySignal],
    module:    "marketing",
    agentId:   "luca",
    agentName: "Luca",
    currentRoute: "/castillitos/agentik/marketing-studio/redes",
  },
  LUCA_MARKETING_AGENT,
  createEmptyAgentMemory("luca"),
  "ASSISTED",
);

// ── Mila — Commercial Runtime Context ────────────────────────────────────────

export const castillitosMilaRuntimeContext: AgentRuntimeContext = buildAgentContextFromDecisionContext(
  {
    ...castillitosDecisionContext,
    signals:   [commercialMarginDropSignal, collectionsOverdueSignal],
    module:    "comercial",
    agentId:   "mila",
    agentName: "Mila",
    currentRoute: "/castillitos/comercial/inteligencia",
  },
  MILA_COMMERCIAL_AGENT,
  createEmptyAgentMemory("mila"),
  "ASSISTED",
);

// ── Diego — Preview mode (restricted) ────────────────────────────────────────

export const diegoPreviewContext: AgentRuntimeContext = buildAgentContextFromDecisionContext(
  {
    ...castillitosDecisionContext,
    signals:  [financeConciliationSignal],
    module:   "finanzas",
    agentId:  "diego",
    agentName: "Diego",
  },
  DIEGO_FINANCE_AGENT,
  createEmptyAgentMemory("diego"),
  "PREVIEW",
);

// ── Diego — Full signals context (all 6) ─────────────────────────────────────

export const diegoFullSignalsContext: AgentRuntimeContext = buildAgentContextFromDecisionContext(
  castillitosDecisionContext,
  DIEGO_FINANCE_AGENT,
  createEmptyAgentMemory("diego"),
  "APPROVAL_REQUIRED",
);
