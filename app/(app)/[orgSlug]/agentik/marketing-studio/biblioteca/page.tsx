/**
 * /[orgSlug]/agentik/marketing-studio/biblioteca
 *
 * Biblioteca Creativa — lista de activos aprobados por la org.
 */

import Link                      from "next/link";
import { redirect }              from "next/navigation";
import { requireOrgAccess }      from "@/lib/auth/org-access";
import { isInternalRole }        from "@/lib/auth/module-access";
import { listOrgApprovedAssets } from "@/lib/marketing-studio/asset-service";
import { C, T, S, R, E }        from "@/lib/ui/tokens";
import { Badge, Panel, PanelHeader } from "@/components/shell/primitives";

export default async function BibliotecaPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }       = await params;
  const { membership, organization } = await requireOrgAccess(orgSlug);
  if (!isInternalRole(membership.role)) redirect(`/${orgSlug}/agentik`);

  const assets = await listOrgApprovedAssets(organization.id, 60);

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 1000 }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[2],
        textTransform: "uppercase", letterSpacing: "0.04em" }}>
        <Link href={`/${orgSlug}/agentik/marketing-studio`} style={{ color: C.inkFaint, textDecoration: "none" }}>
          Marketing Studio
        </Link>
        {" "} › Biblioteca creativa
      </div>

      {/* Header */}
      <div style={{ marginBottom: S[5], paddingBottom: S[3], borderBottom: `1.5px solid ${C.ink}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[3], flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: T.sz["3xl"], fontWeight: T.wt.black,
              color: C.ink, letterSpacing: "-0.02em" }}>
              🖼️ Biblioteca creativa
            </h1>
            <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginTop: 3 }}>
              Todos los activos aprobados — listos para Shopify, redes y campañas.
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: S[2] }}>
            <Badge variant="success">{assets.length} activos</Badge>
            <Link href={`/${orgSlug}/agentik/marketing-studio/foto-estudio/new`}
              style={{ padding: `${S[1]}px ${S[3]}px`, background: C.brand, color: C.white,
                borderRadius: R.md, textDecoration: "none", fontSize: T.sz.sm, fontWeight: T.wt.bold }}>
              + Crear sesión
            </Link>
          </div>
        </div>
      </div>

      {assets.length === 0 ? (
        <Panel>
          <div style={{ padding: `${S[5]}px ${S[4]}px`, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: S[3] }}>🖼️</div>
            <div style={{ fontWeight: T.wt.bold, color: C.ink, marginBottom: S[1] }}>
              Biblioteca vacía
            </div>
            <div style={{ color: C.inkLight, fontSize: T.sz.sm, marginBottom: S[4] }}>
              Los activos aprobados en el Foto Estudio aparecerán aquí.
            </div>
            <Link href={`/${orgSlug}/agentik/marketing-studio/foto-estudio/new`}
              style={{ padding: `${S[2]}px ${S[4]}px`, background: C.brand, color: C.white,
                borderRadius: R.md, textDecoration: "none", fontSize: T.sz.base, fontWeight: T.wt.bold }}>
              Ir al Foto Estudio →
            </Link>
          </div>
        </Panel>
      ) : (
        <Panel>
          <PanelHeader title="Activos aprobados" icon="✅"
            badge={<Badge variant="neutral">{assets.length} totales</Badge>} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
            gap: S[3], padding: `${S[3]}px ${S[4]}px ${S[4]}px` }}>
            {assets.map(asset => (
              <div key={asset.id} style={{
                border: `1px solid ${C.line}`, borderRadius: R.md,
                overflow: "hidden", boxShadow: E.xs, background: C.white,
              }}>
                {/* Image */}
                <div style={{ height: 160, background: C.surfaceAlt, display: "flex",
                  alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.assetUrl} alt={asset.assetType}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
                {/* Meta */}
                <div style={{ padding: `${S[2]}px ${S[3]}px` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: S[1], marginBottom: S[1] }}>
                    <Badge variant="neutral">{asset.assetType}</Badge>
                    {asset.session.productSku && (
                      <span style={{ fontSize: T.sz["2xs"], color: C.inkFaint, fontFamily: T.mono }}>
                        {asset.session.productSku}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>
                    {new Date(asset.createdAt).toLocaleDateString("es-CO")}
                    {" · "}{asset.session.tenantId}
                  </div>
                  <div style={{ display: "flex", gap: S[1], marginTop: S[2] }}>
                    <a href={asset.assetUrl} target="_blank" rel="noopener noreferrer"
                      style={{ flex: 1, padding: `3px 0`, background: C.surface, color: C.inkMid,
                        border: `1px solid ${C.line}`, borderRadius: R.sm, fontSize: T.sz["2xs"],
                        fontFamily: T.mono, textDecoration: "none", textAlign: "center" }}>
                      Ver ↗
                    </a>
                    <a href={asset.assetUrl} download
                      style={{ flex: 1, padding: `3px 0`, background: C.brand, color: C.white,
                        border: "none", borderRadius: R.sm, fontSize: T.sz["2xs"],
                        fontFamily: T.mono, textDecoration: "none", textAlign: "center" }}>
                      ↓
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
