/**
 * GET  /api/orgs/[orgSlug]/sag/write          — list operations (with filters)
 * POST /api/orgs/[orgSlug]/sag/write          — enqueue a new write operation
 *
 * Body for POST:
 *   {
 *     input:       SagWriteInput,          // discriminated union by .type
 *     description: string,                 // human label for approval UI
 *     sourceRef?:  string,                 // e.g. customerId, orderId
 *   }
 *
 * Query params for GET:
 *   status?  — filter by SagWriteStatus
 */

import { NextResponse }     from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { enqueue, listOperations, pendingCount } from "@/lib/sag/write/queue";
import type { SagWriteStatus } from "@/lib/sag/write/types";

export const runtime = "nodejs";

// ── GET — list operations ─────────────────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);

    const url    = new URL(req.url);
    const status = url.searchParams.get("status") as SagWriteStatus | null;

    const [operations, pending] = await Promise.all([
      listOperations(organization.id, status ? { status } : undefined),
      pendingCount(organization.id),
    ]);

    return NextResponse.json({ operations, pendingCount: pending });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    console.error("[sag/write GET]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// ── POST — enqueue ────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { user, organization } = await requireOrgAccess(params.orgSlug);

    const body = await req.json();
    const { input, description, sourceRef } = body as {
      input:        unknown;
      description?: string;
      sourceRef?:   string;
    };

    if (!input)       return NextResponse.json({ error: "input es obligatorio." }, { status: 400 });
    if (!description) return NextResponse.json({ error: "description es obligatorio." }, { status: 400 });

    const result = await enqueue(
      organization.id,
      user.id,
      input as never,
      { description, sourceRef },
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Validación fallida.", validation: result.validation },
        { status: 422 },
      );
    }

    return NextResponse.json({ operationId: result.operationId }, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    console.error("[sag/write POST]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
