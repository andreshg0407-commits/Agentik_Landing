/**
 * lib/execution/execution-registry.ts
 *
 * AGENTIK-EXECUTION-REGISTRY-01 — Cross-Module Execution Registry
 * SERVER ONLY — @server-only
 *
 * The single source of truth for all Agentik-initiated actions.
 * Every module that performs operations on external systems (Meta, TikTok,
 * Shopify, DIAN, WhatsApp, etc.) must register and update executions here.
 *
 * Design guarantees:
 *   - Multi-tenant: every operation requires tenantId.
 *   - Fail-safe: registry failures never interrupt the actual operation
 *     (never throw from createExecution, completeExecution, etc.).
 *   - No secrets: never stores tokens, passwords, or encrypted values.
 *   - Immutable audit: status transitions are append-friendly (no hard deletes).
 *
 * Uses `prisma as any` for AgentExecution model until `prisma generate` runs
 * after the 20260707000000_agent_execution migration is applied.
 *
 * ── Consumer pattern ──────────────────────────────────────────────────────────
 *
 *   const exec = await createExecution({
 *     tenantId, module: "ads", provider: "meta",
 *     operation: "CREATE_AD", createdBy: userId,
 *     intent: "Crear anuncio de conversión en Facebook",
 *   });
 *   if (!exec) { return; } // handle registry unavailable
 *
 *   // ... run the actual operation ...
 *
 *   await completeExecution(exec.id, tenantId, {
 *     summary: "Anuncio creado — ID ext_ad_789",
 *     externalReferenceIds: { meta_ad_id: "ext_ad_789" },
 *   });
 *   // OR on failure:
 *   await failExecution(exec.id, tenantId, {
 *     errorCode: "INVALID_CREDENTIALS",
 *     errorMessage: "Token Meta inválido o vencido.",
 *   });
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  AgentExecutionRecord,
  CreateExecutionInput,
  CompleteExecutionOptions,
  FailExecutionOptions,
  ListExecutionsFilter,
  ExecutionStatus,
} from "./execution-types";

// ── Row → domain mapper ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): AgentExecutionRecord {
  return {
    id:                   row.id,
    tenantId:             row.tenantId,
    module:               row.module,
    provider:             row.provider             ?? null,
    intent:               row.intent               ?? null,
    operation:            row.operation,
    status:               row.status               as ExecutionStatus,
    createdBy:            row.createdBy,
    approvedBy:           row.approvedBy            ?? null,
    approvedAt:           row.approvedAt  ? (row.approvedAt  as Date).toISOString() : null,
    externalReferenceIds: row.externalReferenceIds  ?? null,
    summary:              row.summary               ?? null,
    errorCode:            row.errorCode             ?? null,
    errorMessage:         row.errorMessage          ?? null,
    startedAt:            row.startedAt   ? (row.startedAt   as Date).toISOString() : null,
    completedAt:          row.completedAt ? (row.completedAt as Date).toISOString() : null,
    createdAt:            (row.createdAt  as Date).toISOString(),
    updatedAt:            (row.updatedAt  as Date).toISOString(),
  };
}

// ── Internal db accessor ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => (prisma as any).agentExecution;

// ── createExecution ───────────────────────────────────────────────────────────

/**
 * Register a new execution.
 * Returns the created record, or null if the registry is unavailable.
 *
 * Never throws — registry failures must not interrupt the caller's operation.
 */
export async function createExecution(
  input: CreateExecutionInput,
): Promise<AgentExecutionRecord | null> {
  if (!input.tenantId) {
    console.error("[execution-registry] createExecution: tenantId is required");
    return null;
  }
  if (!input.operation) {
    console.error("[execution-registry] createExecution: operation is required");
    return null;
  }

  try {
    const row = await db().create({
      data: {
        tenantId:              input.tenantId,
        module:                input.module,
        provider:              input.provider              ?? null,
        intent:                input.intent               ?? null,
        operation:             input.operation,
        status:                "pending",
        createdBy:             input.createdBy,
        summary:               input.summary              ?? null,
        externalReferenceIds:  input.externalReferenceIds ?? null,
        metadataJson:          input.metadata             ?? null,
      },
    });
    return toRecord(row);
  } catch (err) {
    console.error("[execution-registry] createExecution failed:", err);
    return null;
  }
}

// ── updateExecutionStatus ─────────────────────────────────────────────────────

/**
 * Transition execution to a new status.
 * Returns the updated record, or null if not found or registry unavailable.
 *
 * Automatically sets startedAt when transitioning to "executing".
 */
export async function updateExecutionStatus(
  id:       string,
  tenantId: string,
  status:   ExecutionStatus,
): Promise<AgentExecutionRecord | null> {
  if (!id || !tenantId) return null;

  try {
    const data: Record<string, unknown> = { status };
    if (status === "executing") data.startedAt = new Date();

    const row = await db().update({
      where:  { id },
      data,
    });

    // Tenant check after fetch (belt-and-suspenders)
    if (row.tenantId !== tenantId) {
      console.error("[execution-registry] tenant mismatch — update rejected");
      return null;
    }

    return toRecord(row);
  } catch (err) {
    console.error("[execution-registry] updateExecutionStatus failed:", err);
    return null;
  }
}

// ── completeExecution ─────────────────────────────────────────────────────────

/**
 * Mark execution as completed.
 * Merges externalReferenceIds and updates summary/metadata if provided.
 */
export async function completeExecution(
  id:       string,
  tenantId: string,
  opts:     CompleteExecutionOptions = {},
): Promise<AgentExecutionRecord | null> {
  if (!id || !tenantId) return null;

  try {
    const existing = await db().findUnique({ where: { id } });
    if (!existing || existing.tenantId !== tenantId) return null;

    // Merge externalReferenceIds with existing ones
    const mergedRefs = {
      ...(existing.externalReferenceIds ?? {}),
      ...(opts.externalReferenceIds     ?? {}),
    };

    const mergedMeta = {
      ...(existing.metadataJson ?? {}),
      ...(opts.metadata         ?? {}),
    };

    const row = await db().update({
      where: { id },
      data: {
        status:               "completed",
        completedAt:          new Date(),
        summary:              opts.summary              ?? existing.summary,
        externalReferenceIds: Object.keys(mergedRefs).length > 0 ? mergedRefs : existing.externalReferenceIds,
        metadataJson:         Object.keys(mergedMeta).length > 0 ? mergedMeta : existing.metadataJson,
      },
    });

    return toRecord(row);
  } catch (err) {
    console.error("[execution-registry] completeExecution failed:", err);
    return null;
  }
}

// ── failExecution ─────────────────────────────────────────────────────────────

/**
 * Mark execution as failed with structured error information.
 * Never include tokens or raw API responses in errorMessage.
 */
export async function failExecution(
  id:       string,
  tenantId: string,
  opts:     FailExecutionOptions = {},
): Promise<AgentExecutionRecord | null> {
  if (!id || !tenantId) return null;

  try {
    const existing = await db().findUnique({ where: { id } });
    if (!existing || existing.tenantId !== tenantId) return null;

    const mergedMeta = {
      ...(existing.metadataJson ?? {}),
      ...(opts.metadata         ?? {}),
    };

    const row = await db().update({
      where: { id },
      data: {
        status:       "failed",
        completedAt:  new Date(),
        errorCode:    opts.errorCode    ?? null,
        errorMessage: opts.errorMessage ?? null,
        summary:      opts.summary      ?? existing.summary,
        metadataJson: Object.keys(mergedMeta).length > 0 ? mergedMeta : existing.metadataJson,
      },
    });

    return toRecord(row);
  } catch (err) {
    console.error("[execution-registry] failExecution failed:", err);
    return null;
  }
}

// ── appendMetadata ────────────────────────────────────────────────────────────

/**
 * Shallow-merge additional metadata into an existing execution.
 * Never includes secrets. Used to attach external references after the fact.
 */
export async function appendMetadata(
  id:       string,
  tenantId: string,
  meta:     Record<string, unknown>,
): Promise<void> {
  if (!id || !tenantId || !meta) return;

  try {
    const existing = await db().findUnique({ where: { id } });
    if (!existing || existing.tenantId !== tenantId) return;

    const merged = { ...(existing.metadataJson ?? {}), ...meta };
    await db().update({ where: { id }, data: { metadataJson: merged } });
  } catch (err) {
    console.error("[execution-registry] appendMetadata failed:", err);
  }
}

// ── recordApproval ────────────────────────────────────────────────────────────

/**
 * Atomically record a human approval: sets status=approved, approvedBy, approvedAt.
 * Returns null if:
 *   - execution not found or tenant mismatch.
 *   - execution is not in awaiting_approval status (prevents double-approval).
 *
 * Never throws — registry failures must not interrupt the caller's operation.
 */
export async function recordApproval(
  id:         string,
  tenantId:   string,
  approvedBy: string,
): Promise<AgentExecutionRecord | null> {
  if (!id || !tenantId || !approvedBy) return null;

  try {
    const existing = await db().findUnique({ where: { id } });
    if (!existing || existing.tenantId !== tenantId) return null;

    // Idempotency guard — only approve from awaiting_approval
    if (existing.status !== "awaiting_approval") {
      console.error(
        `[execution-registry] recordApproval: execution ${id} is in status "${existing.status}", not "awaiting_approval".`,
      );
      return null;
    }

    const row = await db().update({
      where: { id },
      data: {
        status:     "approved",
        approvedBy,
        approvedAt: new Date(),
      },
    });

    return toRecord(row);
  } catch (err) {
    console.error("[execution-registry] recordApproval failed:", err);
    return null;
  }
}

// ── getExecution ──────────────────────────────────────────────────────────────

/**
 * Fetch a single execution by ID, scoped to tenant.
 * Returns null if not found or tenant mismatch.
 */
export async function getExecution(
  id:       string,
  tenantId: string,
): Promise<AgentExecutionRecord | null> {
  if (!id || !tenantId) return null;

  try {
    const row = await db().findUnique({ where: { id } });
    if (!row || row.tenantId !== tenantId) return null;
    return toRecord(row);
  } catch (err) {
    console.error("[execution-registry] getExecution failed:", err);
    return null;
  }
}

// ── listExecutions ────────────────────────────────────────────────────────────

/**
 * List executions for a tenant with optional filtering.
 * Returns most recent first (by createdAt DESC).
 * Never returns executions from another tenant.
 */
export async function listExecutions(
  tenantId: string,
  filter:   ListExecutionsFilter = {},
): Promise<AgentExecutionRecord[]> {
  if (!tenantId) return [];

  const limit  = Math.min(filter.limit  ?? 50, 200);
  const offset = filter.offset ?? 0;

  const where: Record<string, unknown> = { tenantId };
  if (filter.module)   where.module   = filter.module;
  if (filter.provider) where.provider = filter.provider;
  if (filter.status)   where.status   = filter.status;

  try {
    const rows = await db().findMany({
      where,
      orderBy: { createdAt: "desc" },
      take:    limit,
      skip:    offset,
    });

    return (rows as unknown[]).map(toRecord);
  } catch (err) {
    console.error("[execution-registry] listExecutions failed:", err);
    return [];
  }
}
