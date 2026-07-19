/**
 * lib/ai-billing/persistence/ai-billing-mapper.ts
 *
 * Agentik — AI Billing Foundation — DB ↔ Domain Mappers
 * Sprint: AGENTIK-AI-BILLING-FOUNDATION-01
 *
 * Converts Prisma DB rows to domain types and vice versa.
 * No server-only required — pure data transformation.
 */

import type { AiUsageRecord }       from "../ai-usage-types";
import type { AiCreditLedgerEntry } from "../ai-credit-types";
import type { AiUsageKind, AiBillingStatus, AiCostMode } from "../ai-billing-types";
import type { AiCreditLedgerEntryType }                   from "../ai-credit-types";
import { toAiUsageId, toAiCreditLedgerId }               from "../ai-billing-types";

// ── AiUsage mapper ────────────────────────────────────────────────────────────

/** Prisma row shape returned by findMany / create */
export interface DbAiUsageRow {
  id:                    string;
  organizationId:        string;
  orgSlug:               string;
  moduleSlug:            string | null;
  agentId:               string | null;
  agentDisplayName:      string | null;
  featureKey:            string;
  workflowRunId:         string | null;
  workExecutionId:       string | null;
  autonomousOperationId: string | null;
  copilotSessionId:      string | null;
  provider:              string | null;
  model:                 string | null;
  usageKind:             string;
  inputTokens:           number;
  outputTokens:          number;
  totalTokens:           number;
  imageUnits:            number | null;
  videoSeconds:          number | null;
  audioSeconds:          number | null;
  requestCount:          number;
  costUsd:               { toNumber(): number } | null; // Prisma Decimal
  costMode:              string;
  creditsUsed:           number;
  status:                string;
  metadataJson:          unknown;
  createdAt:             Date;
}

export function mapDbUsageToRecord(row: DbAiUsageRow): AiUsageRecord {
  return {
    id:                    toAiUsageId(row.id),
    organizationId:        row.organizationId,
    orgSlug:               row.orgSlug,
    moduleSlug:            row.moduleSlug    ?? undefined,
    agentId:               row.agentId       ?? undefined,
    agentDisplayName:      row.agentDisplayName ?? undefined,
    featureKey:            row.featureKey,
    workflowRunId:         row.workflowRunId         ?? undefined,
    workExecutionId:       row.workExecutionId        ?? undefined,
    autonomousOperationId: row.autonomousOperationId  ?? undefined,
    copilotSessionId:      row.copilotSessionId       ?? undefined,
    provider:              row.provider  ?? undefined,
    model:                 row.model     ?? undefined,
    usageKind:             row.usageKind  as AiUsageKind,
    inputTokens:           row.inputTokens,
    outputTokens:          row.outputTokens,
    totalTokens:           row.totalTokens,
    imageUnits:            row.imageUnits   ?? undefined,
    videoSeconds:          row.videoSeconds ?? undefined,
    audioSeconds:          row.audioSeconds ?? undefined,
    requestCount:          row.requestCount,
    costUsd:               row.costUsd ? row.costUsd.toNumber() : 0,
    costMode:              row.costMode as AiCostMode,
    creditsUsed:           row.creditsUsed,
    status:                row.status as AiBillingStatus,
    metadata:              row.metadataJson ? (row.metadataJson as Record<string, unknown>) : undefined,
    createdAt:             row.createdAt.toISOString(),
  };
}

export function mapRecordToDbCreate(record: AiUsageRecord): Record<string, unknown> {
  return {
    id:                    record.id,
    organizationId:        record.organizationId ?? "",  // resolved by service
    orgSlug:               record.orgSlug,
    moduleSlug:            record.moduleSlug            ?? null,
    agentId:               record.agentId               ?? null,
    agentDisplayName:      record.agentDisplayName      ?? null,
    featureKey:            record.featureKey,
    workflowRunId:         record.workflowRunId         ?? null,
    workExecutionId:       record.workExecutionId        ?? null,
    autonomousOperationId: record.autonomousOperationId ?? null,
    copilotSessionId:      record.copilotSessionId      ?? null,
    provider:              record.provider  ?? null,
    model:                 record.model     ?? null,
    usageKind:             record.usageKind,
    inputTokens:           record.inputTokens,
    outputTokens:          record.outputTokens,
    totalTokens:           record.totalTokens,
    imageUnits:            record.imageUnits    ?? null,
    videoSeconds:          record.videoSeconds  ?? null,
    audioSeconds:          record.audioSeconds  ?? null,
    requestCount:          record.requestCount,
    costUsd:               record.costUsd,
    costMode:              record.costMode,
    creditsUsed:           record.creditsUsed,
    status:                record.status,
    metadataJson:          record.metadata ?? null,
  };
}

// ── AiCreditLedger mapper ─────────────────────────────────────────────────────

export interface DbAiCreditLedgerRow {
  id:               string;
  organizationId:   string;
  orgSlug:          string;
  type:             string;
  credits:          number;
  balanceAfter:     number | null;
  relatedUsageId:   string | null;
  relatedInvoiceId: string | null;
  reason:           string | null;
  createdBy:        string | null;
  metadataJson:     unknown;
  createdAt:        Date;
}

export function mapDbLedgerToEntry(row: DbAiCreditLedgerRow): AiCreditLedgerEntry {
  return {
    id:               toAiCreditLedgerId(row.id),
    orgSlug:          row.orgSlug,
    organizationId:   row.organizationId,
    type:             row.type            as AiCreditLedgerEntryType,
    credits:          row.credits,
    balanceAfter:     row.balanceAfter    ?? undefined,
    relatedUsageId:   row.relatedUsageId  ?? undefined,
    relatedInvoiceId: row.relatedInvoiceId ?? undefined,
    reason:           row.reason          ?? undefined,
    createdBy:        row.createdBy       ?? undefined,
    createdAt:        row.createdAt.toISOString(),
    metadata:         row.metadataJson ? (row.metadataJson as Record<string, unknown>) : undefined,
  };
}

export function mapEntryToDbCreate(entry: AiCreditLedgerEntry, organizationId: string): Record<string, unknown> {
  return {
    id:               entry.id,
    organizationId,
    orgSlug:          entry.orgSlug,
    type:             entry.type,
    credits:          entry.credits,
    balanceAfter:     entry.balanceAfter  ?? null,
    relatedUsageId:   entry.relatedUsageId  ?? null,
    relatedInvoiceId: entry.relatedInvoiceId ?? null,
    reason:           entry.reason          ?? null,
    createdBy:        entry.createdBy        ?? null,
    metadataJson:     entry.metadata         ?? null,
  };
}
