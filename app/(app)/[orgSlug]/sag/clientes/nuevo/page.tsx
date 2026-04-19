/**
 * /{orgSlug}/sag/clientes/nuevo
 *
 * Nuevo cliente SAG — form to prepare a customer upsert write request.
 *
 * Server component:
 *  - Resolves auth + org.
 *  - Optional ?nit= param: looks up existing CustomerProfile for prefilling.
 *  - Passes context to NuevoClienteForm (client component).
 *
 * No write happens here. The form creates a PENDING SagWriteOperation only.
 * Actual SAG send happens after approval in /{orgSlug}/sag/write/[id].
 */

import Link                from "next/link";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { prisma }           from "@/lib/prisma";
import ContextHeader        from "@/components/app/context-header";
import NuevoClienteForm     from "./nuevo-cliente-form";

export default async function NuevoClienteSagPage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string }>;
  searchParams: Promise<{ nit?: string }>;
}) {
  const { orgSlug } = await params;
  const sp          = await searchParams;
  const { organization } = await requireOrgAccess(orgSlug);

  // Optional: prefill from existing CustomerProfile when ?nit= is provided
  let prefill: {
    nit:         string;
    nombre:      string;
    email:       string;
    telefono:    string;
    ciudad:      string;
    departamento:string;
    direccion:   string;
    erpId:       string | null;
    profileId:   string;
  } | null = null;

  if (sp.nit) {
    const raw        = sp.nit.trim().replace(/[.\s-]/g, "").slice(0, 10);
    const normalized = raw.length === 10 ? raw.slice(0, 9) : raw;
    if (/^\d{9}$/.test(normalized)) {
      const profile = await prisma.customerProfile.findFirst({
        where: { organizationId: organization.id, nit: normalized },
        select: {
          id: true, nit: true, name: true, email: true, phone: true,
          city: true, department: true, address: true, erpId: true,
        },
      });
      if (profile) {
        prefill = {
          nit:          profile.nit ?? normalized,
          nombre:       profile.name,
          email:        profile.email ?? "",
          telefono:     profile.phone ?? "",
          ciudad:       profile.city ?? "",
          departamento: profile.department ?? "",
          direccion:    profile.address ?? "",
          erpId:        profile.erpId,
          profileId:    profile.id,
        };
      }
    }
  }

  return (
    <main>
      <ContextHeader organization={organization} />

      <div style={{ marginBottom: 16 }}>
        <Link
          href={`/${orgSlug}/sag/write`}
          style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}
        >
          ← Cola de Aprobación SAG
        </Link>
      </div>

      <h1 style={{ marginBottom: 4 }}>
        {prefill ? "Actualizar cliente SAG" : "Nuevo cliente SAG"}
      </h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>
        {prefill
          ? `Actualizando los datos del cliente "${prefill.nombre}" en el ERP.`
          : "Prepare la solicitud de alta de cliente en SAG."}
      </p>

      {/* Warning — always visible */}
      <div style={{
        display: "inline-block",
        padding: "8px 14px", borderRadius: 6, marginBottom: 24,
        background: "#fffbeb", border: "1px solid #fde68a",
        fontSize: 12, color: "#92400e", fontWeight: 600,
      }}>
        ⚠ El envío al ERP solo ocurrirá después de aprobación humana.
      </div>

      <NuevoClienteForm
        orgSlug={orgSlug}
        prefill={prefill}
      />
    </main>
  );
}
