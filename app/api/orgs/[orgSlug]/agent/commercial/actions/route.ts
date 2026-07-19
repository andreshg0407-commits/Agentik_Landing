/**
 * POST /api/orgs/[orgSlug]/agent/commercial/actions
 *
 * David Commercial Copilot — Action proposal endpoint.
 *
 * David PROPOSES. The user APPROVES. The runtime EXECUTES.
 * This endpoint creates a production action proposal in state "pending_approval".
 * It does NOT execute production. Execution requires a separate approval step.
 *
 * The proposal is persisted as an ActionTask (status=PENDING) with:
 *   agentActionStatus: "pending_approval"
 *   sourceAgentId:     "david_commercial"
 *   requiresApproval:  true
 *
 * GET /api/orgs/[orgSlug]/agent/commercial/actions
 * Returns the serialized David commercial summary for a given org.
 *
 * Sprint: AGENTIK-AGENT-ACTION-LIFECYCLE-01
 */

import { NextResponse }                  from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import {
  createActionTask,
  ActionTaskType,
  ActionTaskPriority,
}                                        from "@/lib/actions/service";
import { buildDavidCommercialSummary, serializeDavidSummary } from "@/lib/copilot/david";
import { createAgentActionDraft, markActionPendingApproval }  from "@/lib/agent-runtime/action-lifecycle";
import { enqueueAgentAction }            from "@/lib/agent-runtime/action-queue";
import { emitAgentRuntimeEvent }         from "@/lib/agent-runtime/runtime-events";
import type { ActionStatusEvent }        from "@/lib/agent-runtime/runtime-events";

export const runtime = "nodejs";

function handleError(err: unknown, label: string) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error(`[${label}]`, err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

// ── GET — David commercial summary ────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const summary = await buildDavidCommercialSummary(organization.id);
    return NextResponse.json({ summary: serializeDavidSummary(summary) });
  } catch (err) {
    return handleError(err, "agent/commercial/actions/GET");
  }
}

// ── POST — propose production action (pending_approval) ───────────────────────

interface CommercialActionBody {
  /** Reference code — e.g. "LT-PNB-001" */
  reference:    string;
  description:  string;
  /** Suggested production quantity from David */
  qty:          number;
  /** David signal reason string */
  reason:       string;
  /** "LT" | "CS" */
  line:         string;
}

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { user, organization } = await requireOrgAccess(params.orgSlug);
    const body = await req.json() as Partial<CommercialActionBody>;

    if (!body.reference?.trim()) {
      return NextResponse.json({ error: "reference is required" }, { status: 400 });
    }
    if (!body.qty || body.qty < 1) {
      return NextResponse.json({ error: "qty must be >= 1" }, { status: 400 });
    }

    const reference   = body.reference.trim().toUpperCase();
    const description = body.description?.trim() ?? reference;
    const qty         = body.qty;
    const reason      = body.reason?.trim() ?? "Propuesta de producción desde David";

    // ── 1. Create agent action draft via lifecycle ─────────────────────────────
    const draft = createAgentActionDraft({
      type:             "create_production_request",
      title:            `Producción ${reference} — ${qty} uds`,
      description:      `${description}. Motivo: ${reason}`,
      domain:           "commercial",
      severity:         "high",
      sourceAgentId:    "david_commercial",
      moduleKey:        "comercial.maletas",
      requiresApproval: true,
      payload: {
        organizationId: organization.id,
        reference,
        description,
        qty,
        reason,
        line:           body.line ?? null,
        proposedBy:     user.email ?? user.id,
      },
    });

    // ── 2. Advance to pending_approval ────────────────────────────────────────
    const pendingAction = markActionPendingApproval(draft, "rail.david");

    // ── 3. Enqueue in runtime queue (in-memory V1) ────────────────────────────
    const queued = await enqueueAgentAction(pendingAction);

    // ── 4. Persist as ActionTask (PENDING = awaiting coordinator decision) ────
    const task = await createActionTask(
      organization.id,
      user.email ?? user.id,
      {
        title:        `[PROPUESTA] Producción ${reference} — ${qty} uds`,
        description:  `${description}. Motivo: ${reason}. Propuesto por David — requiere aprobación del coordinador.`,
        actionType:   ActionTaskType.CREAR_TAREA_COMERCIAL,
        targetType:   "commercial_reference",
        targetId:     reference,
        targetLabel:  description,
        sourceModule: "commercial.maletas.david",
        priority:     ActionTaskPriority.HIGH,
        payloadJson: {
          // Agent runtime identifiers
          agentActionId:     queued.id,
          agentActionStatus: "pending_approval",
          sourceAgentId:     "david_commercial",
          requiresApproval:  true,
          // Action payload
          reference,
          description,
          qty,
          reason,
          line:              body.line ?? null,
          proposedBy:        user.email ?? user.id,
        },
      },
    );

    // ── 5. Emit runtime event ─────────────────────────────────────────────────
    emitAgentRuntimeEvent<ActionStatusEvent>({
      type:           "action.pending_approval",
      organizationId: organization.id,
      agentId:        "david_commercial",
      domain:         "commercial",
      moduleKey:      "comercial.maletas",
      metadata: {
        actionId:   queued.id,
        actionType: "create_production_request",
        prevStatus: "suggested",
        newStatus:  "pending_approval",
        userId:     user.email ?? user.id,
      },
    });

    return NextResponse.json({
      agentAction:       queued,
      task,
      status:            "pending_approval",
      message:           "Propuesta de producción enviada. Requiere aprobación del coordinador.",
    }, { status: 201 });

  } catch (err) {
    return handleError(err, "agent/commercial/actions/POST");
  }
}
