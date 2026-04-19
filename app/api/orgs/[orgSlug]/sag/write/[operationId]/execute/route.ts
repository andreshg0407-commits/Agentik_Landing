/**
 * POST /api/orgs/[orgSlug]/sag/write/[operationId]/execute
 *
 * Executes an APPROVED write operation against the live SAG SOAP endpoint.
 * Transitions: APPROVED → SENDING → SUCCEEDED | FAILED
 *
 * Guardrails enforced by this route AND by the executor:
 *   - Only APPROVED operations can be executed (409 otherwise)
 *   - PENDING operations must be approved first (via POST .../approve)
 *   - REJECTED / SUCCEEDED operations are terminal — cannot be re-executed
 *   - FAILED operations must be re-approved via POST .../retry before execute
 *   - SENDING operations are mid-flight — concurrent execution blocked by executor
 *
 * This route is the ONLY path that triggers a live SAG SOAP write.
 * All other routes (approve, reject, retry) are state transitions only.
 *
 * Requires at least MANAGER role (same as approve).
 *
 * State machine:
 *   enqueue  → PENDING
 *   approve  → APPROVED     (no SOAP)
 *   execute  → SENDING → SUCCEEDED | FAILED   (real SOAP call here)
 *   retry    → APPROVED     (no SOAP; then execute again)
 *   reject   → REJECTED     (terminal, no SOAP)
 */

import { NextResponse }     from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { executeOperation } from "@/lib/sag/write/executor";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: { orgSlug: string; operationId: string } },
) {
  try {
    const { organization, membership } = await requireOrgAccess(params.orgSlug);

    // Only MANAGER, ORG_ADMIN, or SUPER_ADMIN can execute write operations
    const allowedRoles = ["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"];
    if (!allowedRoles.includes(membership.role)) {
      return NextResponse.json(
        { error: "Se requiere rol MANAGER o superior para ejecutar operaciones SAG." },
        { status: 403 },
      );
    }

    // APPROVED → SENDING → SUCCEEDED | FAILED (real SAG SOAP call)
    const result = await executeOperation(params.operationId, organization.id);

    return NextResponse.json(
      {
        ok:          result.ok,
        operationId: result.operationId,
        sagResponse: result.sagResponse,
        error:       result.error,
      },
      { status: result.ok ? 200 : 422 },
    );
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    console.error("[sag/write/:id/execute POST]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
