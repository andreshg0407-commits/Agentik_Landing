/**
 * POST /api/orgs/[orgSlug]/sag/write/[operationId]/retry
 *
 * Re-approves a FAILED write operation: FAILED → APPROVED.
 * Max 3 retries enforced by the queue service.
 * Re-uses the same generatedXml — no input changes allowed on retry.
 *
 * Does NOT execute. After retry, call POST .../execute to send to SAG.
 * Same two-step human-in-the-loop flow as approve → execute.
 *
 * Requires at least MANAGER role.
 */

import { NextResponse }     from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { retry }            from "@/lib/sag/write/queue";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: { orgSlug: string; operationId: string } },
) {
  try {
    const { user, organization, membership } = await requireOrgAccess(params.orgSlug);

    const allowedRoles = ["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"];
    if (!allowedRoles.includes(membership.role)) {
      return NextResponse.json(
        { error: "Se requiere rol MANAGER o superior para reintentar operaciones SAG." },
        { status: 403 },
      );
    }

    // FAILED → APPROVED (state transition only — no SAG SOAP call)
    const result = await retry(params.operationId, organization.id, user.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({
      ok:          true,
      operationId: params.operationId,
      status:      "APPROVED",
      next:        "POST .../execute to send to SAG (MANAGER+ required)",
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    console.error("[sag/write/:id/retry POST]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
