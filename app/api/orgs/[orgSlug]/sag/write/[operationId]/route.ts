/**
 * GET /api/orgs/[orgSlug]/sag/write/[operationId]
 *
 * Returns full detail for a single SAG write operation.
 */

import { NextResponse }     from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { getOperation }     from "@/lib/sag/write/queue";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { orgSlug: string; operationId: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);

    const op = await getOperation(params.operationId, organization.id);
    if (!op) return NextResponse.json({ error: "Operación no encontrada." }, { status: 404 });

    return NextResponse.json({ operation: op });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    console.error("[sag/write/:id GET]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
