/**
 * lib/ai-billing/ai-billing-audit.ts
 *
 * Agentik — AI Billing Foundation — Audit Events & Validators
 * Sprint: AGENTIK-AI-BILLING-FOUNDATION-01
 *
 * Never throws — all validation returns structured results.
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 */

import type { AiUsageRecord }         from "./ai-usage-types";
import type { AiCreditLedgerEntry }   from "./ai-credit-types";

// ── Event types ───────────────────────────────────────────────────────────────

export type AiBillingAuditEventType =
  | "usage_recorded"
  | "credits_debited"
  | "credits_granted"
  | "credits_refunded"
  | "usage_voided"
  | "overage_detected"
  | "low_balance_warning"
  | "cost_estimated"
  | "cost_reconciled";

// ── Audit event ───────────────────────────────────────────────────────────────

export interface AiBillingAuditEvent {
  id:          string;
  type:        AiBillingAuditEventType;
  orgSlug:     string;
  message:     string;
  metadata?:   Record<string, unknown>;
  occurredAt:  string;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createAiBillingAuditEvent(
  type:      AiBillingAuditEventType,
  orgSlug:   string,
  message:   string,
  metadata?: Record<string, unknown>,
): AiBillingAuditEvent {
  return {
    id:         `abaudit_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type,
    orgSlug,
    message,
    metadata,
    occurredAt: new Date().toISOString(),
  };
}

// ── Validation: AiUsageRecord ─────────────────────────────────────────────────

export interface ValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

/**
 * Validate an AiUsageRecord for basic integrity.
 * Returns structured errors — never throws.
 */
export function validateAiUsageRecord(record: unknown): ValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!record || typeof record !== "object") {
    return { valid: false, errors: ["record must be a non-null object"], warnings };
  }

  const r = record as Partial<AiUsageRecord>;

  if (!r.id)            errors.push("id is required");
  if (!r.orgSlug)       errors.push("orgSlug is required");
  if (!r.featureKey)    errors.push("featureKey is required");
  if (!r.usageKind)     errors.push("usageKind is required");
  if (!r.status)        errors.push("status is required");
  if (!r.costMode)      errors.push("costMode is required");
  if (!r.createdAt)     errors.push("createdAt is required");

  if (typeof r.inputTokens  === "number" && r.inputTokens  < 0) errors.push("inputTokens must be non-negative");
  if (typeof r.outputTokens === "number" && r.outputTokens < 0) errors.push("outputTokens must be non-negative");
  if (typeof r.creditsUsed  === "number" && r.creditsUsed  < 0) errors.push("creditsUsed must be non-negative");
  if (typeof r.costUsd      === "number" && r.costUsd      < 0) errors.push("costUsd must be non-negative");
  if (typeof r.requestCount === "number" && r.requestCount < 1) errors.push("requestCount must be at least 1");

  if (r.creditsUsed === 0) warnings.push("creditsUsed is 0 — verify minimum credit floor was applied");
  if (!r.provider)         warnings.push("provider is not set — usage cannot be reconciled with a real invoice");
  if (!r.model)            warnings.push("model is not set — cost estimation may be inaccurate");

  return { valid: errors.length === 0, errors, warnings };
}

// ── Validation: AiCreditLedgerEntry ──────────────────────────────────────────

/**
 * Validate an AiCreditLedgerEntry for basic integrity.
 * Returns structured errors — never throws.
 */
export function validateCreditLedgerEntry(entry: unknown): ValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!entry || typeof entry !== "object") {
    return { valid: false, errors: ["entry must be a non-null object"], warnings };
  }

  const e = entry as Partial<AiCreditLedgerEntry>;

  if (!e.id)        errors.push("id is required");
  if (!e.orgSlug)   errors.push("orgSlug is required");
  if (!e.type)      errors.push("type is required");
  if (!e.createdAt) errors.push("createdAt is required");

  if (typeof e.credits !== "number") {
    errors.push("credits must be a number");
  } else {
    if (e.credits === 0) warnings.push("credits is 0 — is this intentional?");
  }

  if (e.type === "USAGE_DEBIT" && !e.relatedUsageId) {
    warnings.push("USAGE_DEBIT entry has no relatedUsageId — traceability is reduced");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Domain audit ──────────────────────────────────────────────────────────────

export interface DomainAuditResult {
  valid:    boolean;
  checks:   number;
  passed:   number;
  failed:   number;
  errors:   string[];
  warnings: string[];
}

/**
 * Run a full integrity audit of the AI billing domain:
 * validates usage records + ledger entries.
 */
export function auditAiBillingDomain(
  usageRecords:   AiUsageRecord[],
  ledgerEntries:  AiCreditLedgerEntry[],
): DomainAuditResult {
  const allErrors:   string[] = [];
  const allWarnings: string[] = [];
  let checks = 0, passed = 0, failed = 0;

  for (const record of usageRecords) {
    checks++;
    const r = validateAiUsageRecord(record);
    if (r.valid) { passed++; }
    else {
      failed++;
      allErrors.push(...r.errors.map(e => `usage[${record.id}]: ${e}`));
    }
    allWarnings.push(...r.warnings.map(w => `usage[${record.id}]: ${w}`));
  }

  for (const entry of ledgerEntries) {
    checks++;
    const r = validateCreditLedgerEntry(entry);
    if (r.valid) { passed++; }
    else {
      failed++;
      allErrors.push(...r.errors.map(e => `ledger[${entry.id}]: ${e}`));
    }
    allWarnings.push(...r.warnings.map(w => `ledger[${entry.id}]: ${w}`));
  }

  return {
    valid:    failed === 0,
    checks,
    passed,
    failed,
    errors:   allErrors,
    warnings: allWarnings,
  };
}
