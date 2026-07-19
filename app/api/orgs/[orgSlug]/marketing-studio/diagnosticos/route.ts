/**
 * app/api/orgs/[orgSlug]/marketing-studio/diagnosticos/route.ts
 *
 * MARKETING-CONNECTIONS-HARDENING-01 — API de Diagnósticos Operativos
 *
 * GET  → diagnóstico completo de todas las integraciones del org
 * POST → diagnóstico + renovación de token para un provider específico
 *
 * Principios:
 * - No expone tokens, secretos ni valores cifrados.
 * - Derivado únicamente de estado en DB — sin llamadas externas en GET.
 * - POST puede disparar renovación de token (TikTok refresh flow).
 */

import { NextResponse }             from "next/server";
import { requireOrgAccess }         from "@/lib/auth/org-access";
import { canAccessMarketingStudio } from "@/lib/auth/module-access";
import {
  runOrgDiagnostics,
  runProviderDiagnostic,
}                                   from "@/lib/integrations/connection-diagnostics";
import { ensureValidProviderSession } from "@/lib/integrations/token-renewal";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug }                = await params;
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    const diagnostics = await runOrgDiagnostics(organization.id);
    return NextResponse.json(diagnostics);
  } catch (err) {
    console.error("[diagnosticos] GET error:", err);
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug }                = await params;
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    const body = await req.json() as unknown;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body inválido." }, { status: 400 });
    }

    const { action, provider } = body as { action?: string; provider?: string };

    if (!provider || typeof provider !== "string") {
      return NextResponse.json({ error: "provider requerido." }, { status: 400 });
    }

    if (action === "renew_token") {
      const renewal = await ensureValidProviderSession(organization.id, provider);
      return NextResponse.json({ renewal });
    }

    if (action === "diagnose") {
      const diagnostic = await runProviderDiagnostic(organization.id, provider);
      return NextResponse.json({ diagnostic });
    }

    return NextResponse.json({ error: "Acción no reconocida." }, { status: 400 });
  } catch (err) {
    console.error("[diagnosticos] POST error:", err);
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
}
