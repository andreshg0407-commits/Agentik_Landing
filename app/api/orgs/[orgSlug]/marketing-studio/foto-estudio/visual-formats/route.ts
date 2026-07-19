/**
 * POST /api/orgs/[orgSlug]/marketing-studio/foto-estudio/visual-formats
 *
 * Saves a custom visual format for the tenant.
 * Stored in TenantMarketingConfig.configJson.visualFormats.
 *
 * ── Auth ──────────────────────────────────────────────────────────────────────
 *   requireOrgAccess — same gate as all marketing-studio routes.
 *
 * ── Request body ──────────────────────────────────────────────────────────────
 *   { name, width, height, margins: {top,bottom,left,right}, safeArea: {width,height}, compositionNotes }
 *
 * ── Response ──────────────────────────────────────────────────────────────────
 *   201: { ok: true, format: StoredVisualFormat }
 *   400: { error: string }  — validation or duplicate
 *   401: { error: "UNAUTHENTICATED" }
 *   403: { error: "ACCESS_DENIED" }
 */

import { NextRequest, NextResponse }   from "next/server";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { saveTenantVisualFormat }     from "@/lib/marketing-studio/visual-format-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function POST(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);

    const body = await req.json() as {
      name?:             string;
      width?:            number;
      height?:           number;
      margins?:          { top?: number; bottom?: number; left?: number; right?: number };
      safeArea?:         { width?: number; height?: number };
      compositionNotes?: string;
    };

    // ── Basic type-level validation ────────────────────────────────────────
    const name   = body.name?.trim() ?? "";
    const width  = typeof body.width  === "number" ? body.width  : NaN;
    const height = typeof body.height === "number" ? body.height : NaN;

    if (!name)            return NextResponse.json({ error: "El nombre es requerido." },          { status: 400 });
    if (isNaN(width))     return NextResponse.json({ error: "Ancho debe ser un número." },        { status: 400 });
    if (isNaN(height))    return NextResponse.json({ error: "Alto debe ser un número." },         { status: 400 });
    if (!body.margins)    return NextResponse.json({ error: "Los márgenes son requeridos." },     { status: 400 });
    if (!body.safeArea)   return NextResponse.json({ error: "El área útil es requerida." },       { status: 400 });

    const margins  = {
      top:    Number(body.margins.top    ?? 0),
      bottom: Number(body.margins.bottom ?? 0),
      left:   Number(body.margins.left   ?? 0),
      right:  Number(body.margins.right  ?? 0),
    };
    const safeArea = {
      width:  Number(body.safeArea.width  ?? 0),
      height: Number(body.safeArea.height ?? 0),
    };
    const compositionNotes = body.compositionNotes?.trim() ?? "";

    // ── Delegate to service (validates + persists) ─────────────────────────
    const format = await saveTenantVisualFormat(organization.id, orgSlug, {
      name, width, height, margins, safeArea, compositionNotes,
    });

    return NextResponse.json({ ok: true, format }, { status: 201 });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error interno.";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    // User-readable service errors (validation, duplicate) → 400
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
