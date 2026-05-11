/**
 * app/api/orgs/[orgSlug]/reconciliation/exceptions/[exceptionId]/notes/route.ts
 *
 * AGENTIK-RECON-EXCEPTIONS-02
 * Exception note creation endpoint.
 *
 * POST — add an immutable audit note to a ReconciliationException.
 *
 * Request body:
 *   { message: string }
 *
 * Response:
 *   201 { note: ExceptionNoteRow }
 *   400 Empty message / message too long
 *   403 Org access denied
 *   404 Exception not found
 *
 * Notes are immutable once written — no PATCH/DELETE on notes.
 * Stored in ReconciliationException.metadataJson.notes[] (no separate table).
 *
 * CRITICAL RULES:
 *   - No accounting writes
 *   - No SAG or DIAN mutations
 *   - No cross-tenant access (organizationId enforced in every DB call)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import {
  addExceptionNote,
}                                    from "@/lib/reconciliation/exception-service";

type RouteContext = { params: Promise<{ orgSlug: string; exceptionId: string }> };

export async function POST(
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

    const { message } = body as { message?: unknown };

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "El campo message es requerido y debe ser string" }, { status: 400 });
    }

    const result = await addExceptionNote({
      organizationId: organization.id,
      exceptionId,
      message,
      actorType:      "user",
      // actorId:     session.user.id  — wire when auth session is available
    });

    return NextResponse.json(result, { status: 201 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error inesperado";

    if (message.includes("no encontrada") || message.includes("acceso denegado")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("vacío") || message.includes("limitadas a") || message.includes("2000")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes("Org not found") || message.includes("Access denied")) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    console.error("[RECON-EXCEPTIONS-02] POST exception note error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
