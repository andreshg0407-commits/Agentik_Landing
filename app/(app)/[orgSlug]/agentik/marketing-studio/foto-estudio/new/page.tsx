/**
 * /[orgSlug]/agentik/marketing-studio/foto-estudio/new
 *
 * Foto Estudio — sesión guiada de generación de producto.
 * Auth gate: SUPER_ADMIN / AGENTIK_ADMIN / ORG_ADMIN / MANAGER (canAccessMarketingStudio).
 */

import Link                 from "next/link";
import { redirect }         from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { canAccessMarketingStudio } from "@/lib/auth/module-access";
import { getTenantConfig }  from "@/lib/marketing-studio/tenant-config";
import { listTenantVisualFormats } from "@/lib/marketing-studio/visual-format-service";
import type { GarmentType, ProductCategory, BrandLine } from "@/lib/marketing-studio/foto-estudio-types";
import { C, T, S, R }       from "@/lib/ui/tokens";
import { Badge }            from "@/components/shell/primitives";
import { FotoEstudioWizard } from "./wizard";

export default async function FotoEstudioNewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }                = await params;
  const { membership, organization } = await requireOrgAccess(orgSlug);

  if (!canAccessMarketingStudio(membership.role)) redirect(`/${orgSlug}/agentik`);

  // tenantId is always the orgSlug from the URL — never a forced env var.
  const tenantId  = orgSlug;
  const tenantCfg = getTenantConfig(tenantId);

  // Load persisted custom formats for this tenant (non-blocking — empty array on error)
  const { customFormats } = await listTenantVisualFormats(organization.id, orgSlug).catch(() => ({
    systemFormats: [], customFormats: [],
  }));

  // Diagnostic: confirm which tenant config loaded (server log only).
  console.log(
    `[FotoEstudio] orgSlug=${orgSlug} tenantId=${tenantId} ` +
    `configFound=${!!tenantCfg} ` +
    `fidelityMode=${tenantCfg?.fidelityMode ?? "n/a"} ` +
    `defaultGarmentType=${tenantCfg?.fotoEstudio?.defaultGarmentType ?? "n/a"} ` +
    `presets=${tenantCfg?.allowedPresets?.slice(0,3).join(",") ?? "n/a"}...`,
  );

  const defaultBrandLine:        BrandLine       = (tenantCfg?.fotoEstudio?.defaultBrandLine        ?? "casual")    as BrandLine;
  const defaultGarmentType:     GarmentType     = (tenantCfg?.fotoEstudio?.defaultGarmentType     ?? "otro")      as GarmentType;
  const defaultProductCategory: ProductCategory = (tenantCfg?.fotoEstudio?.defaultProductCategory ?? "ropa_nino") as ProductCategory;

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
      <div style={{ marginBottom: S[5], paddingBottom: S[3], borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[3], flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: T.sz["3xl"], fontWeight: T.wt.black,
              color: C.ink, letterSpacing: "-0.02em" }}>
              Foto Estudio
            </h1>
            <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginTop: 3, fontFamily: T.mono }}>
              Generación de contenido visual con IA.
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: S[2] }}>
            <Badge variant="dark">INTERNAL</Badge>
            <Badge variant="brand">MARKETING STUDIO</Badge>
          </div>
        </div>
      </div>

      {/* ── Wizard — módulo emite contexto, NO renderiza agentes ── */}
      <FotoEstudioWizard
        orgSlug={orgSlug}
        tenantId={tenantId}
        defaultBrandLine={defaultBrandLine}
        defaultGarmentType={defaultGarmentType}
        defaultProductCategory={defaultProductCategory}
        initialCustomFormats={customFormats}
      />

    </div>
  );
}
