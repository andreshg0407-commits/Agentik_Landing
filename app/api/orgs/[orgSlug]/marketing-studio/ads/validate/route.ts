/**
 * app/api/orgs/[orgSlug]/marketing-studio/ads/validate/route.ts
 *
 * MARKETING-ADS-VALIDATION-01 — API de Validación Previa de Anuncios
 *
 * POST /api/orgs/[orgSlug]/marketing-studio/ads/validate
 *
 * Recibe el borrador del anuncio (desde el wizard), valida sus campos
 * usando el servicio de validación, registra el resultado en el
 * Execution Registry y devuelve el resultado al cliente.
 *
 * Principios:
 *   - No publica anuncios.
 *   - No crea campañas reales.
 *   - No gasta recursos.
 *   - No devuelve tokens ni secretos.
 *   - Cada validación queda registrada en AgentExecution.
 */

import { NextResponse }                from "next/server";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import { canAccessMarketingStudio }    from "@/lib/auth/module-access";
import { validateAdDraft }             from "@/lib/marketing-studio/ads/ads-validation-service";
import type { AdsValidationInput }     from "@/lib/marketing-studio/ads/ads-validation-types";

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug }                  = await params;
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    // ── Leer body ────────────────────────────────────────────────────────────

    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "El cuerpo de la solicitud no es válido." }, { status: 400 });
    }

    // ── Construir input de validación ────────────────────────────────────────

    const input: AdsValidationInput = {
      tenantId:       orgSlug,
      organizationId: organization.id,
      createdBy:      membership.id ?? "system",

      plataformas:     Array.isArray(body.plataformas)     ? (body.plataformas as string[])     : [],
      metaSubchannels: Array.isArray(body.metaSubchannels) ? (body.metaSubchannels as string[]) : [],
      objetivo:        typeof body.objetivo       === "string" ? body.objetivo       : null,
      hasAsset:        typeof body.hasAsset       === "boolean" ? body.hasAsset      : false,
      textoPrincipal:  typeof body.textoPrincipal === "string" ? body.textoPrincipal : "",
      destino:         typeof body.destino        === "string" ? body.destino        : null,
      urlDestino:      typeof body.urlDestino     === "string" ? body.urlDestino     : "",
      whatsappNumber:  typeof body.whatsappNumber === "string" ? body.whatsappNumber : "",
      monto:           typeof body.monto          === "string" ? body.monto          : "",
      inicio:          typeof body.inicio         === "string" ? body.inicio         : "",
      fin:             typeof body.fin            === "string" ? body.fin            : "",
    };

    // ── Validación rápida de tenant ──────────────────────────────────────────

    if (!orgSlug) {
      return NextResponse.json({ error: "Tenant requerido." }, { status: 400 });
    }

    // ── Ejecutar validación ──────────────────────────────────────────────────

    const validationResult = await validateAdDraft(input);

    return NextResponse.json({
      validationResult,
      executionId: validationResult.executionId,
    });
  } catch (err) {
    console.error("[ads/validate] POST error:", err);
    return NextResponse.json({ error: "Error interno. Intenta nuevamente." }, { status: 500 });
  }
}
