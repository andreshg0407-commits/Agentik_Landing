/**
 * POST /api/orgs/[orgSlug]/branding
 *
 * Actions: get, upsert
 *
 * Sprint: TENANT-BRANDING-FOUNDATION-01
 * Hotfix: TENANT-BRANDING-SAVE-HOTFIX-01
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  getOrganizationBranding,
  upsertOrganizationBranding,
  type BrandingUpsertInput,
} from "@/lib/tenant/branding";

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Fields accepted by BrandingUpsertInput — whitelist to prevent unknown keys
const ALLOWED_FIELDS: (keyof BrandingUpsertInput)[] = [
  "commercialName", "legalName", "taxId",
  "address", "city", "country", "phone", "email", "website",
  "primaryColor", "secondaryColor", "accentColor",
  "logoUrl", "logoDarkUrl", "logoMonoUrl",
  "documentFooter",
  "socialInstagram", "socialFacebook", "socialWhatsapp",
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const body = await req.json();
  const action = body.action as string;

  switch (action) {
    case "get": {
      const branding = await getOrganizationBranding(orgId);
      return NextResponse.json({ branding });
    }

    case "upsert": {
      const raw = body.data as Record<string, unknown> | undefined;
      if (!raw) {
        return NextResponse.json({ error: "No se recibieron datos para guardar." }, { status: 400 });
      }

      // Sanitize: only accept known fields, skip empty strings
      const input: BrandingUpsertInput = {};
      for (const field of ALLOWED_FIELDS) {
        const val = raw[field];
        if (typeof val === "string" && val.trim().length > 0) {
          (input as any)[field] = val.trim();
        }
        // If the field is explicitly empty string, we still send it so the user
        // can clear a field (e.g., remove a phone number)
        if (typeof val === "string" && val.trim().length === 0) {
          (input as any)[field] = "";
        }
      }

      // Validate color fields
      for (const field of ["primaryColor", "secondaryColor", "accentColor"] as const) {
        const val = input[field];
        if (typeof val === "string" && val !== "" && !HEX_RE.test(val)) {
          return NextResponse.json(
            { error: `${field === "primaryColor" ? "Color principal" : field === "secondaryColor" ? "Color secundario" : "Color acento"} no tiene formato HEX valido (ej. #004AAD).` },
            { status: 422 },
          );
        }
      }

      // Validate email format if provided
      const emailVal = input.email;
      if (typeof emailVal === "string" && emailVal !== "" && !emailVal.includes("@")) {
        return NextResponse.json(
          { error: "El email no tiene un formato valido." },
          { status: 422 },
        );
      }

      // Validate URL fields if provided
      for (const field of ["website", "logoUrl", "logoDarkUrl", "logoMonoUrl"] as const) {
        const val = input[field];
        if (typeof val === "string" && val !== "") {
          try {
            new URL(val);
          } catch {
            const labels: Record<string, string> = {
              website: "Sitio web",
              logoUrl: "Logo URL",
              logoDarkUrl: "Logo oscuro URL",
              logoMonoUrl: "Logo mono URL",
            };
            return NextResponse.json(
              { error: `${labels[field]} no tiene un formato de URL valido.` },
              { status: 422 },
            );
          }
        }
      }

      try {
        const branding = await upsertOrganizationBranding(orgId, input);
        return NextResponse.json({ branding });
      } catch (err: any) {
        const code = err?.code ?? "";
        const msg  = err?.message ?? "Error desconocido";
        // eslint-disable-next-line no-console
        console.error(`[BRANDING_SAVE_ERROR] orgSlug=${orgSlug} orgId=${orgId} code=${code} message=${msg}`);

        if (code === "P2002") {
          return NextResponse.json(
            { error: "Ya existe una identidad corporativa para esta organizacion. Intenta recargar la pagina." },
            { status: 409 },
          );
        }
        if (code === "P2003") {
          return NextResponse.json(
            { error: "La organizacion no existe o fue eliminada." },
            { status: 404 },
          );
        }

        return NextResponse.json(
          { error: `Error de base de datos al guardar la identidad corporativa: ${msg}` },
          { status: 500 },
        );
      }
    }

    default:
      return NextResponse.json({ error: "Accion desconocida." }, { status: 400 });
  }
}
