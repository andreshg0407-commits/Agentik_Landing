/**
 * app/api/orgs/[orgSlug]/reconciliation/exceptions/[exceptionId]/route.ts
 *
 * AGENTIK-RECON-EXCEPTIONS-02
 * Exception status transition endpoint.
 *
 * PATCH — transition exception status (set_reviewing | resolve | ignore | reopen)
 *
 * Request body:
 *   { action: ExceptionStatusAction, resolution?: string }
 *
 * Response:
 *   200 { id, newStatus, prevStatus }
 *   400 Invalid transition or bad request
 *   403 Org access denied
 *   404 Exception not found
 *
 * CRITICAL RULES:
 *   - No accounting writes
 *   - No SAG or DIAN mutations
 *   - No SecureVault access
 *   - No cross-tenant access (organizationId enforced in every DB call)
 *   - Exceptions are never deleted — only status-transitioned
 */

import { NextRequest, NextResponse }  from "next/server";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import {
  updateExceptionStatus,
}                                     from "@/lib/reconciliation/exception-service";
import type { ExceptionStatusAction } from "@/lib/reconciliation/exception-service";

type RouteContext = { params: Promise<{ orgSlug: string; exceptionId: string }> };

const VALID_ACTIONS = new Set<ExceptionStatusAction>(["set_reviewing", "resolve", "ignore", "reopen"]);

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug, exceptionId } = await params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo de solicitud inválido" }, { status: 400 });
    }

    const { action, resolution } = body as {
      action:      unknown;
      resolution?: unknown;
    };

    if (!action || !VALID_ACTIONS.has(action as ExceptionStatusAction)) {
      return NextResponse.json(
        { error: `Acción inválida. Acciones permitidas: ${[...VALID_ACTIONS].join(", ")}` },
        { status: 400 },
      );
    }

    if (resolution !== undefined && resolution !== null && typeof resolution !== "string") {
      return NextResponse.json({ error: "El campo resolution debe ser string o null" }, { status: 400 });
    }

    const result = await updateExceptionStatus({
      organizationId: organization.id,
      exceptionId,
      action:         action as ExceptionStatusAction,
      resolution:     typeof resolution === "string" ? resolution : undefined,
      actorType:      "user",
      // actorId:     session.user.id  — wire when auth session is available
    });

    return NextResponse.json(result, { status: 200 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error inesperado";

    // Distinguish "not found / tenant denied" from "invalid transition"
    if (message.includes("no encontrada") || message.includes("acceso denegado")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("Transición de estado inválida")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes("Org not found") || message.includes("Access denied")) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    console.error("[RECON-EXCEPTIONS-02] PATCH exception status error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
