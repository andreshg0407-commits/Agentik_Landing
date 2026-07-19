/**
 * POST /api/orgs/[orgSlug]/sag/write/preview-articulo
 *
 * Validates raw article form data and builds the SAG XML preview —
 * without creating any DB record.
 *
 * Identical contract to /preview (customer), but for tipo=5 (artículo).
 *
 * Body:
 *   { formData: ArticuloFormData }
 *
 * Returns:
 *   {
 *     ok:                boolean,
 *     normalizedPayload: SagProductInput,
 *     xml:               string,
 *     validation:        ValidationResult,
 *   }
 *
 * Idempotent and read-only. No SAG call, no DB write.
 */

import { NextResponse }              from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { normalizeArticuloForm }     from "@/lib/sag/articulos/normalizer";
import { validateSagWriteInput }     from "@/lib/sag/write/validators";
import { buildProductXml }           from "@/lib/sag/write/xml-builders/product";
import { validateProductMasterData } from "@/lib/sag/master-validation";
import type { ArticuloFormData }     from "@/lib/sag/articulos/normalizer";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    await requireOrgAccess(params.orgSlug);

    const body     = await req.json();
    const formData = body.formData as ArticuloFormData;

    if (!formData) {
      return NextResponse.json({ error: "formData es obligatorio." }, { status: 400 });
    }

    // 1. Normalize
    const normalizedPayload = normalizeArticuloForm(formData);

    // 2. Schema validation (required fields, types, formats)
    const validation = validateSagWriteInput({ type: 5, payload: normalizedPayload });

    // 3. Master-data validation (real SAG value compatibility)
    const masterValidation = validateProductMasterData(normalizedPayload);

    // 4. Build XML (even if invalid — helps operators see what went wrong)
    let xml = "";
    try {
      xml = buildProductXml(normalizedPayload);
    } catch {
      xml = "<!-- Error al construir XML — corrija los campos requeridos -->";
    }

    return NextResponse.json({ ok: validation.valid && masterValidation.safe, normalizedPayload, xml, validation, masterValidation });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    console.error("[sag/write/preview-articulo POST]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
