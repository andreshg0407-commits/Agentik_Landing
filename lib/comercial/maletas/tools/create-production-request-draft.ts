/**
 * lib/comercial/maletas/tools/create-production-request-draft.ts
 *
 * Agentik Tool — Create Production Request Draft
 *
 * Safe, controlled tool for David (commercial agent) to create
 * a structured draft of a production request.
 *
 * SAFETY CONTRACT:
 * - Does NOT write to SAG
 * - Does NOT create real production orders
 * - Does NOT call any external factory system
 * - Creates an in-memory structured draft only
 * - nextStep is always "review_by_operations"
 *
 * Sprint: AGENTIK-AGENT-TOOL-EXECUTION-KERNEL-01
 */

import type { ToolHandlerContext } from "@/lib/agent-runtime/tool-handler-registry";

// ── Output type ───────────────────────────────────────────────────────────────

export interface ProductionRequestDraft {
  draftId:       string;
  title:         string;
  reference:     string;
  qty:           number;
  line:          string;
  description:   string;
  reason:        string;
  status:        "draft";
  sourceActionId: string | null;
  requestedBy:   string;
  createdAt:     string;
  nextStep:      "review_by_operations";
  metadata: {
    generatedBy:   "agentik_tool_kernel";
    toolId:        "commercial.createProductionRequestDraft";
    orgId:         string;
    correlationId: string | null;
  };
}

// ── ID generator ──────────────────────────────────────────────────────────────

let _seq = 0;
function draftId(): string { return `prd_draft_${Date.now()}_${++_seq}`; }

// ── Handler ───────────────────────────────────────────────────────────────────

export async function createProductionRequestDraftHandler(
  input:   Record<string, unknown>,
  context: ToolHandlerContext,
): Promise<Record<string, unknown>> {
  const reference    = String(input.reference ?? "");
  const qty          = typeof input.qty === "number" ? input.qty : Number(input.qty ?? 0);
  const line         = String(input.line ?? "general");
  const description  = String(input.description ?? "");
  const reason       = String(input.reason ?? "");
  const sourceActionId = String(input.sourceActionId ?? context.actionId);

  if (!reference) {
    throw new Error("createProductionRequestDraft: reference is required");
  }
  if (qty <= 0) {
    throw new Error("createProductionRequestDraft: qty must be a positive number");
  }

  const draft: ProductionRequestDraft = {
    draftId:        draftId(),
    title:          `Solicitud de producción — ${reference} x${qty}`,
    reference,
    qty,
    line,
    description:    description || `Solicitud de producción para la referencia ${reference}.`,
    reason:         reason     || "Cobertura insuficiente detectada por David.",
    status:         "draft",
    sourceActionId: sourceActionId || null,
    requestedBy:    context.requestedBy,
    createdAt:      new Date().toISOString(),
    nextStep:       "review_by_operations",
    metadata: {
      generatedBy:   "agentik_tool_kernel",
      toolId:        "commercial.createProductionRequestDraft",
      orgId:         context.orgId,
      correlationId: context.correlationId,
    },
  };

  return draft as unknown as Record<string, unknown>;
}
