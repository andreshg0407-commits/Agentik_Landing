/**
 * /[orgSlug]/agentik/marketing-studio/redes
 * Publicación en redes — coming soon stub.
 */
import Link             from "next/link";
import { redirect }     from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { canAccessMarketingStudio } from "@/lib/auth/module-access";
import { C, T, S, R }       from "@/lib/ui/tokens";
import { Badge, Panel }     from "@/components/shell/primitives";

export default async function RedesStudioPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug }    = await params;
  const { membership } = await requireOrgAccess(orgSlug);
  if (!canAccessMarketingStudio(membership.role)) redirect(`/${orgSlug}/agentik`);

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 860 }}>
      <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[2],
        textTransform: "uppercase", letterSpacing: "0.04em" }}>
        <Link href={`/${orgSlug}/agentik/marketing-studio`} style={{ color: C.inkFaint, textDecoration: "none" }}>
          Marketing Studio
        </Link>{" "}› Publicación en redes
      </div>
      <div style={{ marginBottom: S[5], paddingBottom: S[3], borderBottom: `1.5px solid ${C.ink}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
          <div>
            <h1 style={{ margin: 0, fontSize: T.sz["3xl"], fontWeight: T.wt.black, color: C.ink, letterSpacing: "-0.02em" }}>
              📱 Publicación en redes
            </h1>
            <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginTop: 3 }}>
              Programa y publica contenido en TikTok, Instagram y Facebook desde la biblioteca.
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}><Badge variant="info">PRÓXIMAMENTE</Badge></div>
        </div>
      </div>
      <Panel>
        <div style={{ padding: `${S[5]}px ${S[4]}px`, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: S[3] }}>📱</div>
          <div style={{ fontWeight: T.wt.bold, color: C.ink, fontSize: T.sz.lg, marginBottom: S[2] }}>
            Módulo en desarrollo
          </div>
          <div style={{ color: C.inkLight, fontSize: T.sz.sm, maxWidth: 420, margin: "0 auto", lineHeight: 1.6, marginBottom: S[4] }}>
            Este módulo permitirá programar y publicar contenido en TikTok, Instagram y Facebook
            directamente desde activos aprobados en la Biblioteca Creativa.
          </div>
          <div style={{ display: "flex", gap: S[2], justifyContent: "center", flexWrap: "wrap" }}>
            {["Red social", "Copy y hashtags", "CTA", "Fecha de publicación", "Campaña"].map(f => (
              <span key={f} style={{ padding: `3px ${S[2]}px`, background: C.surfaceAlt,
                color: C.inkLight, borderRadius: R.pill, fontSize: T.sz.xs, border: `1px solid ${C.line}` }}>
                {f}
              </span>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}
