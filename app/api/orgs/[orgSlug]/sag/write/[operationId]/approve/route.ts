/**
 * POST /api/orgs/[orgSlug]/sag/write/[operationId]/approve
 *
 * Approves a PENDING write operation: PENDING → APPROVED.
 * Does NOT execute the operation. Execution requires a separate call to
 * POST .../execute by a MANAGER+ user who has reviewed the generatedXml.
 *
 * This separation is intentional:
 *   - Approval = human sign-off that the XML payload is correct
 *   - Execution = explicit trigger of the live SAG SOAP write
 *   - Two distinct HTTP requests → two distinct audit timestamps
 *
 * Requires at least MANAGER role (enforced via membership check).
 */

import { NextResponse }     from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { approve }          from "@/lib/sag/write/queue";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: { orgSlug: string; operationId: string } },
) {
  try {
    const { user, organization, membership } = await requireOrgAccess(params.orgSlug);

    // Only MANAGER, ORG_ADMIN, or SUPER_ADMIN can approve write operations
    const allowedRoles = ["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"];
    if (!allowedRoles.includes(membership.role)) {
      return NextResponse.json(
        { error: "Se requiere rol MANAGER o superior para aprobar operaciones SAG." },
        { status: 403 },
      );
    }

    // PENDING → APPROVED (state transition only — no SAG SOAP call)
    const result = await approve(params.operationId, organization.id, user.id);
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
    console.error("[sag/write/:id/approve POST]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
