/**
 * /{orgSlug}/sag/articulos/nuevo
 *
 * Nuevo artículo SAG — form to prepare an article upsert write request.
 *
 * Server component: resolves auth + org, renders warning + client form.
 * No write happens here. Creates a PENDING SagWriteOperation only.
 * SAG send happens only after approval in /{orgSlug}/sag/write/[id].
 */

import Link                from "next/link";
import { requireOrgAccess } from "@/lib/auth/org-access";
import ContextHeader        from "@/components/app/context-header";
import NuevoArticuloForm    from "./nuevo-articulo-form";

export default async function NuevoArticuloSagPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }      = await params;
  const { organization } = await requireOrgAccess(orgSlug);

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

      <h1 style={{ marginBottom: 4 }}>Nuevo artículo SAG</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>
        Prepare la solicitud de alta o actualización de artículo en el ERP SAG.
      </p>

      <div style={{
        display: "inline-block",
        padding: "8px 14px", borderRadius: 6, marginBottom: 24,
        background: "#fffbeb", border: "1px solid #fde68a",
        fontSize: 12, color: "#92400e", fontWeight: 600,
      }}>
        ⚠ El envío al ERP solo ocurrirá después de aprobación humana.
      </div>

      <NuevoArticuloForm orgSlug={orgSlug} />
    </main>
  );
}
