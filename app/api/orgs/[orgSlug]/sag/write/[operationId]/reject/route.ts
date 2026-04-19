/**
 * POST /api/orgs/[orgSlug]/sag/write/[operationId]/reject
 *
 * Rejects a PENDING write operation (terminal — no execution).
 *
 * Body:
 *   { reason?: string }
 */

import { NextResponse }     from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { reject }           from "@/lib/sag/write/queue";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string; operationId: string } },
) {
  try {
    const { user, organization, membership } = await requireOrgAccess(params.orgSlug);

    const allowedRoles = ["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"];
    if (!allowedRoles.includes(membership.role)) {
      return NextResponse.json(
        { error: "Se requiere rol MANAGER o superior para rechazar operaciones SAG." },
        { status: 403 },
      );
    }

    let reason = "Sin motivo indicado.";
    try {
      const body = await req.json();
      if (body?.reason) reason = String(body.reason);
    } catch { /* no body is fine */ }

    const result = await reject(params.operationId, organization.id, user.id, reason);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    console.error("[sag/write/:id/reject POST]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
