/**
 * POST /api/orgs/[orgSlug]/sag/write/preview
 *
 * Validates raw customer form data and builds the SAG XML — without creating
 * any DB record. Operators see the normalized payload and generated XML before
 * they commit the operation to the approval queue.
 *
 * Body:
 *   { formData: ClienteFormData }
 *
 * Returns:
 *   {
 *     ok:               boolean,
 *     normalizedPayload: SagCustomerInput,
 *     xml:              string,
 *     validation:       ValidationResult,
 *     existingCustomer: { id, name, nit, erpId, status } | null,
 *   }
 *
 * This route is idempotent and read-only (no SAG call, no DB write).
 */

import { NextResponse }              from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { prisma }                    from "@/lib/prisma";
import { normalizeClienteForm }      from "@/lib/sag/clientes/normalizer";
import { validateSagWriteInput }     from "@/lib/sag/write/validators";
import { buildCustomerXml }          from "@/lib/sag/write/xml-builders/customer";
import { validateCustomerMasterData } from "@/lib/sag/master-validation";
import type { ClienteFormData }      from "@/lib/sag/clientes/normalizer";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);

    const body      = await req.json();
    const formData  = body.formData as ClienteFormData;

    if (!formData) {
      return NextResponse.json({ error: "formData es obligatorio." }, { status: 400 });
    }

    // 1. Normalize raw form → SagCustomerInput
    const normalizedPayload = normalizeClienteForm(formData);

    // 2. Schema validation (required fields, types, formats)
    const validation = validateSagWriteInput({ type: 1, payload: normalizedPayload });

    // 3. Master-data validation (real SAG value compatibility)
    const masterValidation = validateCustomerMasterData(normalizedPayload);

    // 4. Build XML (even if invalid — helps operators see what went wrong)
    let xml = "";
    try {
      xml = buildCustomerXml(normalizedPayload);
    } catch {
      xml = "<!-- Error al construir XML — corrija los campos requeridos -->";
    }

    // 5. Lookup existing CustomerProfile by normalized NIT
    let existingCustomer: {
      id: string; name: string; nit: string | null;
      erpId: string | null; status: string;
    } | null = null;

    if (normalizedPayload.NIT && /^\d{9}$/.test(normalizedPayload.NIT)) {
      const profile = await prisma.customerProfile.findFirst({
        where: { organizationId: organization.id, nit: normalizedPayload.NIT },
        select: { id: true, name: true, nit: true, erpId: true, status: true },
      });
      if (profile) {
        existingCustomer = {
          id:     profile.id,
          name:   profile.name,
          nit:    profile.nit,
          erpId:  profile.erpId,
          status: profile.status,
        };
      }
    }

    return NextResponse.json({
      ok:                validation.valid && masterValidation.safe,
      normalizedPayload,
      xml,
      validation,
      masterValidation,
      existingCustomer,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    console.error("[sag/write/preview POST]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
