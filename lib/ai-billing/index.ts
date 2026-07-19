/**
 * lib/ai-billing/index.ts
 *
 * Agentik — AI Billing Foundation — Client-Safe Barrel
 * Sprint: AGENTIK-AI-BILLING-FOUNDATION-01
 *
 * CLIENT-SAFE: exports only pure domain symbols.
 * Do NOT export anything that imports server-only, Prisma, or agent-runtime.
 *
 * Server-side service:
 *   import { aiBillingService } from "@/lib/ai-billing/server";
 */

// ── Core types ────────────────────────────────────────────────────────────────
export type {
  AiUsageId,
  AiCreditLedgerId,
  AiBillingScope,
  AiBillingSource,
  AiBillingStatus,
  AiUsageKind,
  AiCostMode,
} from "./ai-billing-types";
export { toAiUsageId, toAiCreditLedgerId } from "./ai-billing-types";

// ── Usage types ───────────────────────────────────────────────────────────────
export type {
  AiUsageRecord,
  AiUsageFilters,
  AiUsageSummary,
  AiUsageBucket,
} from "./ai-usage-types";

// ── Credit types ──────────────────────────────────────────────────────────────
export type {
  AiCreditLedgerEntryType,
  AiCreditLedgerEntry,
  AiCreditBalance,
} from "./ai-credit-types";

// ── Pricing types ─────────────────────────────────────────────────────────────
export type {
  AiCreditRate,
  AiPlanCreditAllowance,
} from "./ai-pricing-types";
export { DEFAULT_CREDIT_RATES } from "./ai-pricing-types";

// ── Calculator ────────────────────────────────────────────────────────────────
export type {
  TokenTotals,
  EstimateCostParams,
  CalculateCreditsParams,
  GrossMarginParams,
  GrossMarginResult,
} from "./ai-billing-calculator";
export {
  calculateTokenTotals,
  calculateEstimatedCostUsd,
  calculateCreditsUsed,
  calculateGrossMargin,
  normalizeUsageKind,
  determineCostMode,
} from "./ai-billing-calculator";

// ── Aggregator ────────────────────────────────────────────────────────────────
export {
  aggregateUsageByTenant,
  aggregateUsageByModule,
  aggregateUsageByAgent,
  aggregateUsageByFeature,
  summarizeUsage,
} from "./ai-usage-aggregator";

// ── Credit ledger helpers ─────────────────────────────────────────────────────
export type {
  CreateLedgerEntryInput,
  DebitResult,
  GrantResult,
} from "./ai-credit-ledger";
export {
  createCreditLedgerEntry,
  applyCreditDebit,
  applyCreditGrant,
  calculateCreditBalance,
  isCreditBalanceLow,
} from "./ai-credit-ledger";

// ── Audit ─────────────────────────────────────────────────────────────────────
export type {
  AiBillingAuditEventType,
  AiBillingAuditEvent,
  ValidationResult,
  DomainAuditResult,
} from "./ai-billing-audit";
export {
  createAiBillingAuditEvent,
  validateAiUsageRecord,
  validateCreditLedgerEntry,
  auditAiBillingDomain,
} from "./ai-billing-audit";

// ── Result types ──────────────────────────────────────────────────────────────
export type { AiBillingResult } from "./ai-billing-result";
export { successBillingResult, failedBillingResult } from "./ai-billing-result";

// ── Usage factories ───────────────────────────────────────────────────────────
export type {
  AiCallParams,
  AgentRuntimeUsageParams,
  CopilotUsageParams,
  MarketingStudioUsageParams,
} from "./ai-usage-factory";
export {
  createUsageRecordFromAiCall,
  createUsageRecordFromAgentRuntime,
  createUsageRecordFromCopilot,
  createUsageRecordFromMarketingStudio,
} from "./ai-usage-factory";

// ── Fixtures ──────────────────────────────────────────────────────────────────
export {
  castillitosDiegoFinanceUsage,
  castillitosLucaMarketingUsage,
  castillitosCopilotUsage,
  castillitosImageGenerationUsage,
  arketopsDocumentAnalysisUsage,
  castillitosVideoGenerationUsage,
  castillitosAutonomousOperationUsage,
  lowBalanceLedgerFixture,
  monthlyGrantFixture,
  usageDebitFixture,
} from "./ai-billing-fixtures";

// ── Credit transaction types (hardening) ──────────────────────────────────────
export type {
  CreditTransactionType,
  OveragePolicy,
  CreditTransactionRequest,
  CreditTransactionResult,
  CreditTransaction,
} from "./ai-credit-transaction";
export {
  DEFAULT_OVERAGE_POLICY,
  isBalanceChangeAllowed,
  transactionTypeToLedgerType,
} from "./ai-credit-transaction";

// ── Ledger integrity (hardening) ──────────────────────────────────────────────
export type {
  LedgerSummary,
  LedgerIntegrityResult,
} from "./ai-ledger-integrity";
export {
  reconstructBalance,
  verifyLedgerIntegrity,
  detectDuplicateCorrelationIds,
  buildLedgerSummary,
  isBalanceConsistent,
} from "./ai-ledger-integrity";
