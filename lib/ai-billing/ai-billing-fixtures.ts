/**
 * lib/ai-billing/ai-billing-fixtures.ts
 *
 * Agentik — AI Billing Foundation — Test Fixtures
 * Sprint: AGENTIK-AI-BILLING-FOUNDATION-01
 *
 * Covers: text, JSON reasoning, documents, images, video,
 * copilot, agent, autonomous operation.
 *
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 */

import type { AiUsageRecord }       from "./ai-usage-types";
import type { AiCreditLedgerEntry } from "./ai-credit-types";
import { toAiUsageId, toAiCreditLedgerId } from "./ai-billing-types";

// ── Usage fixtures ────────────────────────────────────────────────────────────

/** Diego (finance agent) — text generation for reconciliation analysis. */
export const castillitosDiegoFinanceUsage: AiUsageRecord = {
  id:                    toAiUsageId("usage_castillitos_diego_finance_01"),
  orgSlug:               "castillitos",
  moduleSlug:            "finanzas",
  agentId:               "diego",
  agentDisplayName:      "Diego",
  featureKey:            "reconciliation:auto_match",
  provider:              "mock",
  model:                 "mock-reasoning-v1",
  usageKind:             "TEXT_GENERATION",
  inputTokens:           1200,
  outputTokens:          400,
  totalTokens:           1600,
  requestCount:          1,
  costUsd:               0.0096,
  costMode:              "ESTIMATED",
  creditsUsed:           8,
  status:                "RECORDED",
  createdAt:             "2026-06-04T10:00:00.000Z",
  metadata:              { sessionId: "recon_session_01", matchedCount: 47 },
};

/** Luca (marketing agent) — JSON reasoning for campaign planning. */
export const castillitosLucaMarketingUsage: AiUsageRecord = {
  id:                    toAiUsageId("usage_castillitos_luca_marketing_01"),
  orgSlug:               "castillitos",
  moduleSlug:            "marketing-studio",
  agentId:               "luca",
  agentDisplayName:      "Luca",
  featureKey:            "campaigns:plan_generation",
  provider:              "mock",
  model:                 "mock-reasoning-v1",
  usageKind:             "JSON_REASONING",
  inputTokens:           800,
  outputTokens:          600,
  totalTokens:           1400,
  requestCount:          1,
  costUsd:               0.0132,
  costMode:              "ESTIMATED",
  creditsUsed:           14,
  status:                "RECORDED",
  createdAt:             "2026-06-04T10:05:00.000Z",
  metadata:              { campaignId: "camp_summer_2026" },
};

/** Copilot — text generation for contextual assistant. */
export const castillitosCopilotUsage: AiUsageRecord = {
  id:                    toAiUsageId("usage_castillitos_copilot_01"),
  orgSlug:               "castillitos",
  moduleSlug:            "copilot",
  agentId:               "pablo",
  agentDisplayName:      "Pablo",
  featureKey:            "copilot:explain",
  copilotSessionId:      "copilot_sess_01",
  provider:              "mock",
  model:                 "mock-text-v1",
  usageKind:             "TEXT_GENERATION",
  inputTokens:           300,
  outputTokens:          200,
  totalTokens:           500,
  requestCount:          1,
  costUsd:               0.0045,
  costMode:              "ESTIMATED",
  creditsUsed:           3,
  status:                "RECORDED",
  createdAt:             "2026-06-04T10:10:00.000Z",
};

/** Marketing Studio — image generation for product photo shoot. */
export const castillitosImageGenerationUsage: AiUsageRecord = {
  id:                    toAiUsageId("usage_castillitos_image_01"),
  orgSlug:               "castillitos",
  moduleSlug:            "marketing-studio",
  agentId:               "luca",
  agentDisplayName:      "Luca",
  featureKey:            "foto_studio:generate",
  provider:              "mock",
  model:                 "mock-image-xl-v1",
  usageKind:             "IMAGE_GENERATION",
  inputTokens:           0,
  outputTokens:          0,
  totalTokens:           0,
  imageUnits:            3,
  requestCount:          1,
  costUsd:               0.12,
  costMode:              "ESTIMATED",
  creditsUsed:           300,
  status:                "RECORDED",
  createdAt:             "2026-06-04T10:15:00.000Z",
  metadata:              { sessionId: "foto_sess_001", productIds: ["prod_001", "prod_002", "prod_003"] },
};

/** Arketops — document analysis for SAG contract review. */
export const arketopsDocumentAnalysisUsage: AiUsageRecord = {
  id:                    toAiUsageId("usage_arketops_document_01"),
  orgSlug:               "arketops",
  moduleSlug:            "documentos",
  featureKey:            "document_analysis:sag_review",
  provider:              "mock",
  model:                 "mock-doc-v1",
  usageKind:             "DOCUMENT_ANALYSIS",
  inputTokens:           5000,
  outputTokens:          800,
  totalTokens:           5800,
  requestCount:          1,
  costUsd:               0.087,
  costMode:              "ESTIMATED",
  creditsUsed:           58,
  status:                "RECORDED",
  createdAt:             "2026-06-04T10:20:00.000Z",
  metadata:              { documentId: "doc_sag_contract_47", pageCount: 12 },
};

/** Castillitos — video generation for marketing studio. */
export const castillitosVideoGenerationUsage: AiUsageRecord = {
  id:                    toAiUsageId("usage_castillitos_video_01"),
  orgSlug:               "castillitos",
  moduleSlug:            "marketing-studio",
  featureKey:            "video_studio:generate",
  provider:              "mock",
  model:                 "mock-video-v1",
  usageKind:             "VIDEO_GENERATION",
  inputTokens:           0,
  outputTokens:          0,
  totalTokens:           0,
  videoSeconds:          30,
  requestCount:          1,
  costUsd:               7.50,
  costMode:              "ESTIMATED",
  creditsUsed:           750,
  status:                "ESTIMATED",
  createdAt:             "2026-06-04T10:25:00.000Z",
};

/** Castillitos — autonomous operation for workflow execution. */
export const castillitosAutonomousOperationUsage: AiUsageRecord = {
  id:                      toAiUsageId("usage_castillitos_autonomous_01"),
  orgSlug:                 "castillitos",
  moduleSlug:              "finanzas",
  agentId:                 "diego",
  agentDisplayName:        "Diego",
  featureKey:              "autonomous:workflow_trigger",
  autonomousOperationId:   "ao_op_finance_001",
  provider:                "mock",
  model:                   "mock-reasoning-v1",
  usageKind:               "JSON_REASONING",
  inputTokens:             600,
  outputTokens:            300,
  totalTokens:             900,
  requestCount:            1,
  costUsd:                 0.0094,
  costMode:                "ESTIMATED",
  creditsUsed:             10,
  status:                  "RECORDED",
  createdAt:               "2026-06-04T10:30:00.000Z",
  metadata:                { operationSource: "AUTONOMOUS_OPERATION", chainDepth: 1 },
};

// ── Ledger fixtures ───────────────────────────────────────────────────────────

/** Low balance scenario: only 50 credits left. */
export const lowBalanceLedgerFixture: AiCreditLedgerEntry[] = [
  {
    id:          toAiCreditLedgerId("ledger_low_01"),
    orgSlug:     "castillitos",
    type:        "MONTHLY_GRANT",
    credits:     10000,
    balanceAfter: 10000,
    reason:      "June 2026 monthly grant",
    createdBy:   "system",
    createdAt:   "2026-06-01T00:00:00.000Z",
  },
  {
    id:          toAiCreditLedgerId("ledger_low_02"),
    orgSlug:     "castillitos",
    type:        "USAGE_DEBIT",
    credits:     -9950,
    balanceAfter: 50,
    relatedUsageId: "usage_castillitos_heavy_01",
    reason:      "Heavy AI usage during reconciliation batch",
    createdBy:   "system",
    createdAt:   "2026-06-04T09:00:00.000Z",
  },
];

/** Monthly grant fixture for a new billing cycle. */
export const monthlyGrantFixture: AiCreditLedgerEntry = {
  id:          toAiCreditLedgerId("ledger_grant_june_01"),
  orgSlug:     "castillitos",
  type:        "MONTHLY_GRANT",
  credits:     10000,
  balanceAfter: 10000,
  reason:      "June 2026 — Professional Plan monthly credit grant",
  createdBy:   "system:billing_cron",
  createdAt:   "2026-06-01T00:00:00.000Z",
  metadata:    { planId: "professional", cycleStart: "2026-06-01", cycleEnd: "2026-06-30" },
};

/** Usage debit fixture for a standard AI operation. */
export const usageDebitFixture: AiCreditLedgerEntry = {
  id:             toAiCreditLedgerId("ledger_debit_01"),
  orgSlug:        "castillitos",
  type:           "USAGE_DEBIT",
  credits:        -8,
  balanceAfter:   9992,
  relatedUsageId: "usage_castillitos_diego_finance_01",
  reason:         "AI usage: reconciliation:auto_match",
  createdBy:      "system:ai_billing",
  createdAt:      "2026-06-04T10:00:01.000Z",
  metadata:       { featureKey: "reconciliation:auto_match", agentId: "diego" },
};
