/**
 * app/api/orgs/[orgSlug]/collections/outcome/route.ts
 *
 * POST — record a collection task outcome.
 *
 * Body:
 *   {
 *     taskId:         string;
 *     customerSlug:   string;
 *     customerName:   string;
 *     currentDpd:     number;
 *     overdueAmount:  number;
 *     outcome: {
 *       outcomeType:    OutcomeType;
 *       channel:        ContactChannel;
 *       notes?:         string;
 *       promiseDate?:   string;   // ISO date
 *       promiseAmount?: number;
 *       partialAmount?: number;
 *     }
 *   }
 *
 * Response:
 *   { ok: true }  |  { error: string }
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireOrgAccess }                         from "@/lib/auth/org-access";
import { recordOutcome }                            from "@/lib/collections/outcomes";
import { createActionTask }                         from "@/lib/actions/service";
import { ActionTaskType, ActionTaskPriority }       from "@prisma/client";
import type { CollectionOutcomeData, OutcomeType }  from "@/lib/collections/outcomes";

const VALID_OUTCOMES: OutcomeType[] = [
  "PAID", "PARTIAL_PAYMENT", "PROMISE_TO_PAY", "IN_NEGOTIATION",
  "NO_CONTACT", "BROKEN_PROMISE", "DISPUTE", "ESCALATED",
];

export async function POST(
  req:    NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
): Promise<NextResponse> {
  try {
    const { orgSlug } = await params;
    const { user, organization } = await requireOrgAccess(orgSlug);

    const body = await req.json() as {
      taskId?:       string;   // optional: if omitted, a task is auto-created
      customerSlug:  string;
      customerName:  string;
      currentDpd:    number;
      overdueAmount: number;
      outcome:       Partial<CollectionOutcomeData>;
    };

    // Validate required fields
    if (!body.customerSlug || !body.customerName) {
      return NextResponse.json({ error: "customerSlug, customerName required" }, { status: 400 });
    }

    // If no taskId, create a transient collection task now
    let resolvedTaskId = body.taskId ?? "";
    if (!resolvedTaskId) {
      const newTask = await createActionTask(organization.id, user.email ?? "system", {
        title:        `Contacto de cobranza — ${body.customerName}`,
        actionType:   ActionTaskType.CREAR_ACCION_COBRANZA,
        targetType:   "customer",
        targetId:     body.customerSlug,
        targetLabel:  body.customerName,
        sourceModule: "collections_queue",
        priority:     ActionTaskPriority.HIGH,
        payloadJson: {
          quickContact:  true,
          overdueAmount: body.overdueAmount,
          currentDpd:    body.currentDpd,
        },
      });
      resolvedTaskId = newTask.id;
    }

    const outcomeType = body.outcome?.outcomeType;
    if (!outcomeType || !VALID_OUTCOMES.includes(outcomeType)) {
      return NextResponse.json({ error: `outcomeType must be one of: ${VALID_OUTCOMES.join(", ")}` }, { status: 400 });
    }

    const channel = body.outcome?.channel ?? "call";
    if (!["call", "whatsapp", "email", "in_person"].includes(channel)) {
      return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
    }

    const outcome: CollectionOutcomeData = {
      outcomeType,
      channel,
      contactedAt:   new Date().toISOString(),
      notes:         body.outcome?.notes,
      promiseDate:   body.outcome?.promiseDate,
      promiseAmount: body.outcome?.promiseAmount,
      partialAmount: body.outcome?.partialAmount,
      contactedBy:   user.email ?? user.name ?? "unknown",
    };

    await recordOutcome({
      orgId:         organization.id,
      taskId:        resolvedTaskId,
      outcome,
      userEmail:     user.email ?? "unknown",
      customerSlug:  body.customerSlug,
      customerName:  body.customerName,
      currentDpd:    Number(body.currentDpd ?? 0),
      overdueAmount: Number(body.overdueAmount ?? 0),
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[collections/outcome] error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
