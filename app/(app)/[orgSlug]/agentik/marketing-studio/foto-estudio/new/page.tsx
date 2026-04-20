/**
 * /[orgSlug]/agentik/marketing-studio/foto-estudio/new
 *
 * Foto Estudio — sesión guiada de generación de producto.
 * Auth gate: SUPER_ADMIN / AGENTIK_ADMIN only.
 */

import Link                 from "next/link";
import { redirect }         from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { isInternalRole }   from "@/lib/auth/module-access";
import { C, T, S }          from "@/lib/ui/tokens";
import { Badge }            from "@/components/shell/primitives";
import { FotoEstudioWizard } from "./wizard";

export default async function FotoEstudioNewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }    = await params;
  const { membership } = await requireOrgAccess(orgSlug);

  if (!isInternalRole(membership.role)) redirect(`/${orgSlug}/agentik`);

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 860 }}>

      {/* ── Breadcrumb ── */}
      <div style={{
        fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[2],
        textTransform: "uppercase", letterSpacing: "0.04em",
      }}>
        <Link href={`/${orgSlug}/agentik`} style={{ color: C.inkFaint, textDecoration: "none" }}>
          Consola · Agentik
        </Link>
        {" "}›{" "}
        <Link href={`/${orgSlug}/agentik/marketing-studio`} style={{ color: C.inkFaint, textDecoration: "none" }}>
          Marketing Studio
        </Link>
        {" "}› Foto estudio
      </div>

      {/* ── Header ── */}
      <div style={{ marginBottom: S[5], paddingBottom: S[3], borderBottom: `1.5px solid ${C.ink}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[3], flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: T.sz["3xl"], fontWeight: T.wt.black,
              color: C.ink, letterSpacing: "-0.02em" }}>
              📸 Foto estudio
            </h1>
            <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginTop: 3 }}>
              Sube tu producto y Agentik generará el contenido visual listo para publicar.
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: S[2] }}>
            <Badge variant="dark">INTERNAL</Badge>
            <Badge variant="brand">MARKETING STUDIO</Badge>
          </div>
        </div>
      </div>

      {/* ── Wizard ── */}
      {/* DEMO: force do-jeans tenant config when accessed via /agentik — remove after do-jeans org is provisioned */}
      <FotoEstudioWizard
        orgSlug={orgSlug}
        tenantId={process.env.FOTO_ESTUDIO_DEMO_TENANT ?? orgSlug}
        defaultBrandLine="luxury"
        defaultGarmentType="jean"
      />

    </div>
  );
}
