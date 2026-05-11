/**
 * /[orgSlug]/agentik/marketing-studio
 *
 * Marketing Studio hub.
 *
 * Two completely separate views rendered server-side based on role:
 *
 *   isInternalRole (SUPER_ADMIN / AGENTIK_ADMIN)
 *     → Admin hub: global KPIs, preset registry link, tenant config table.
 *
 *   client roles (ORG_ADMIN / MANAGER / etc.)
 *     → Tenant workspace: production modules only — no internal data, no admin links.
 *
 * Access gate: canAccessMarketingStudio → SUPER_ADMIN | AGENTIK_ADMIN | ORG_ADMIN | MANAGER.
 */

import Link                          from "next/link";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { canAccessMarketingStudio, isInternalRole } from "@/lib/auth/module-access";
import { redirect }                  from "next/navigation";
import { C, T, S, R, E }            from "@/lib/ui/tokens";
import { Badge, Panel, PanelHeader, KpiCard } from "@/components/shell/primitives";
import {
  ALL_PRESETS,
  ALL_TENANT_CONFIGS,
  getActiveTenantConfigs,
  getTenantPresets,
} from "@/lib/marketing-studio";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function MarketingStudioHubPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }    = await params;
  const { membership } = await requireOrgAccess(orgSlug);

  if (!canAccessMarketingStudio(membership.role)) redirect(`/${orgSlug}/dashboard`);

  // Route to the correct view based on role context
  if (isInternalRole(membership.role)) {
    return <AdminHubView orgSlug={orgSlug} />;
  }

  return <TenantWorkspaceView orgSlug={orgSlug} />;
}

// ── Admin Hub View (SUPER_ADMIN / AGENTIK_ADMIN) ──────────────────────────────

function AdminHubView({ orgSlug }: { orgSlug: string }) {
  const activeTenants     = getActiveTenantConfigs();
  const totalPresets      = ALL_PRESETS.length;
  const totalTenants      = ALL_TENANT_CONFIGS.length;
  const activeTenantCount = activeTenants.length;

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 1000 }}>

      {/* ── Breadcrumb ── */}
      <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[2],
        textTransform: "uppercase", letterSpacing: "0.04em" }}>
        <Link href={`/${orgSlug}/agentik`} style={{ color: C.inkFaint, textDecoration: "none" }}>
          Consola Interna
        </Link>
        {" "} › Marketing Studio
      </div>

      {/* ── Header ── */}
      <div style={{ marginBottom: S[5], paddingBottom: S[3], borderBottom: `1.5px solid ${C.ink}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[3], flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: T.sz["3xl"], fontWeight: T.wt.black,
              color: C.ink, letterSpacing: "-0.02em" }}>
              📸 Marketing Studio
            </h1>
            <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginTop: 3 }}>
              Motor de producción fotográfica y publicación social. Vista de administración.
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: S[2], flexWrap: "wrap" }}>
            <Badge variant="dark">ADMIN</Badge>
            <Badge variant="success">ACTIVO</Badge>
          </div>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
        gap: S[3], marginBottom: S[5] }}>
        <KpiCard label="Presets globales"     value={String(totalPresets)}     sublabel="en el registro"          dotColor={C.brand} />
        <KpiCard label="Tenants configurados" value={String(totalTenants)}     sublabel={`${activeTenantCount} activos`} dotColor={C.green} />
        <KpiCard label="Do Jeans"             value={String(getTenantPresets(ALL_TENANT_CONFIGS.find(t => t.tenantId === "do-jeans")?.allowedPresets ?? []).length)}   sublabel="presets habilitados" dotColor="#f59e0b" />
        <KpiCard label="Castillitos"          value={String(getTenantPresets(ALL_TENANT_CONFIGS.find(t => t.tenantId === "castillitos")?.allowedPresets ?? []).length)} sublabel="presets habilitados" dotColor="#6366f1" />
      </div>

      {/* ── Módulos de producción ── */}
      <Panel style={{ marginBottom: S[5] }}>
        <PanelHeader title="Módulos de producción" icon="🗂" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3],
          padding: `${S[3]}px ${S[4]}px ${S[4]}px` }}>
          {PRODUCTION_MODULE_CARDS.map(card => (
            <Link key={card.title} href={`/${orgSlug}/agentik/marketing-studio${card.href}`}
              style={{ textDecoration: "none" }}>
              <div style={{
                border:       `1px solid ${card.active ? C.line : C.lineSubtle}`,
                borderRadius: R.md,
                padding:      `${S[4]}px`,
                background:   card.active ? C.white : C.surface,
                cursor:       "pointer",
                opacity:      card.active ? 1 : 0.6,
                boxShadow:    card.active ? E.xs : "none",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: S[3] }}>
                  <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{card.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: T.wt.bold, fontSize: T.sz.base, color: C.ink, marginBottom: 4 }}>
                      {card.title}
                    </div>
                    <div style={{ fontSize: T.sz.xs, color: C.inkLight, lineHeight: 1.5, marginBottom: S[3] }}>
                      {card.desc}
                    </div>
                    {card.active && card.cta !== null ? (
                      <span style={{ display: "inline-block", padding: `${S[1]}px ${S[3]}px`,
                        background: C.brand, color: C.white, borderRadius: R.sm,
                        fontSize: T.sz.xs, fontWeight: T.wt.bold }}>
                        {card.cta} →
                      </span>
                    ) : (
                      <Badge variant="neutral">Próximamente</Badge>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Panel>

      {/* ── Configuración interna ── */}
      <Panel style={{ marginBottom: S[5] }}>
        <PanelHeader title="Configuración interna" icon="⚙️" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[3],
          padding: `${S[3]}px ${S[4]}px ${S[4]}px` }}>
          {ADMIN_CONFIG_CARDS.map(card => (
            <Link key={card.href} href={`/${orgSlug}/agentik/marketing-studio${card.href}`}
              style={{ textDecoration: "none" }}>
              <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md,
                padding: `${S[3]}px ${S[4]}px`, background: C.surface, cursor: "pointer" }}>
                <div style={{ fontSize: 18, marginBottom: S[1] }}>{card.icon}</div>
                <div style={{ fontWeight: T.wt.bold, fontSize: T.sz.sm, color: C.ink, marginBottom: 3 }}>{card.title}</div>
                <div style={{ fontSize: T.sz.xs, color: C.inkLight }}>{card.desc}</div>
                {card.badge && (
                  <div style={{ marginTop: S[2] }}>
                    <Badge variant={card.badge.variant as "neutral" | "success"}>{card.badge.label}</Badge>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      </Panel>

      {/* ── Tenants activos ── */}
      <Panel style={{ marginBottom: S[5] }}>
        <PanelHeader
          title="Tenants activos"
          icon="🏢"
          badge={<Badge variant="success">{activeTenantCount} activos</Badge>}
        />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse",
            fontFamily: "monospace", fontSize: T.sz.sm }}>
            <thead>
              <tr style={{ background: C.surfaceAlt }}>
                {["Tenant", "Slug", "Preset por defecto", "Presets", "Objetivo", "Estado"].map(h => (
                  <th key={h} style={{ padding: `${S[2]}px ${S[3]}px`, textAlign: "left",
                    fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkLight,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    borderBottom: `1px solid ${C.lineSubtle}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_TENANT_CONFIGS.map((t, i) => (
                <tr key={t.tenantId} style={{ background: i % 2 === 0 ? C.white : C.surface }}>
                  <td style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}` }}>
                    <Link href={`/${orgSlug}/agentik/marketing-studio/tenants`}
                      style={{ color: C.brand, textDecoration: "none", fontWeight: T.wt.semibold }}>
                      {t.tenantName}
                    </Link>
                  </td>
                  <td style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`,
                    color: C.inkFaint, fontSize: T.sz.xs }}>{t.tenantSlug}</td>
                  <td style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`,
                    color: C.inkMid }}>{t.defaultPresetId}</td>
                  <td style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}` }}>
                    <Badge variant="neutral">{t.allowedPresets.length}</Badge>
                  </td>
                  <td style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`,
                    color: C.inkMid, fontSize: T.sz.xs }}>{t.luca.defaultObjective}</td>
                  <td style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}` }}>
                    <Badge variant={t.active ? "success" : "neutral"}>{t.active ? "ACTIVO" : "INACTIVO"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

    </div>
  );
}

// ── Tenant Workspace View (ORG_ADMIN / MANAGER / client roles) ────────────────

function TenantWorkspaceView({ orgSlug }: { orgSlug: string }) {
  return (
    <div style={{ fontFamily: "monospace", maxWidth: 900 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: S[6] }}>
        <h1 style={{ margin: 0, fontSize: T.sz["4xl"], fontWeight: T.wt.black,
          color: C.ink, letterSpacing: "-0.025em", lineHeight: 1 }}>
          📸 Marketing Studio
        </h1>
        <div style={{ fontSize: T.sz.md, color: C.inkLight, marginTop: S[1] + 2 }}>
          Motor de producción fotográfica y publicación.
        </div>
      </div>

      {/* ── Módulos de producción ── */}
      <div style={{ marginBottom: S[3] }}>
        <div style={{ fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkGhost,
          textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: S[3] }}>
          Módulos disponibles
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[4] }}>
          {TENANT_MODULE_CARDS.map(card => {
            const inner = (
              <div style={{
                border:        `1px solid ${card.active ? "#e9d5ff" : C.lineSubtle}`,
                borderRadius:  R.xl,
                padding:       `${S[5]}px`,
                background:    card.active ? "#fdf4ff" : C.surface,
                cursor:        card.active ? "pointer" : "default",
                opacity:       card.active ? 1 : 0.55,
                boxShadow:     card.active ? E.sm : "none",
                height:        "100%",
              }}>
                <div style={{ fontSize: 32, lineHeight: 1, marginBottom: S[3] }}>{card.icon}</div>
                <div style={{ fontWeight: T.wt.bold, fontSize: T.sz.lg, color: card.active ? "#7c2d92" : C.ink, marginBottom: S[1] + 2 }}>
                  {card.title}
                </div>
                <div style={{ fontSize: T.sz.sm, color: C.inkMid, lineHeight: 1.6, marginBottom: S[4] }}>
                  {card.desc}
                </div>
                {card.active ? (
                  <span style={{ display: "inline-block", padding: `${S[1] + 2}px ${S[4]}px`,
                    background: "#7c2d92", color: C.white, borderRadius: R.md,
                    fontSize: T.sz.sm, fontWeight: T.wt.bold }}>
                    {card.cta} →
                  </span>
                ) : (
                  <Badge variant="neutral">Próximamente</Badge>
                )}
              </div>
            );

            return card.active ? (
              <Link key={card.title} href={`/${orgSlug}/agentik/marketing-studio${card.href}`}
                style={{ textDecoration: "none" }}>
                {inner}
              </Link>
            ) : (
              <div key={card.title}>{inner}</div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

// ── Module card definitions ───────────────────────────────────────────────────

/** Production modules — shown in both admin and tenant workspace views. */
const PRODUCTION_MODULE_CARDS: Array<{
  icon: string; title: string; desc: string; href: string; cta: string | null; active: boolean;
}> = [
  { icon: "📸", title: "Foto Estudio",         desc: "Produce fotos, videos y piezas visuales desde productos reales.",                       href: "/foto-estudio/new", cta: "Crear contenido",    active: true  },
  { icon: "🖼️", title: "Biblioteca Creativa",  desc: "Centraliza productos, fotos, videos, catálogos y activos aprobados.",                   href: "/biblioteca",       cta: "Ver biblioteca",  active: true  },
  { icon: "📱", title: "Redes Sociales",        desc: "Programa y publica contenido desde activos aprobados.",                                 href: "/redes",            cta: null,              active: false },
  { icon: "🛍️", title: "Shopify",              desc: "Publica productos, imágenes, videos y banners en tu tienda.",                           href: "/shopify",          cta: null,              active: false },
  { icon: "📣", title: "Ads / Pauta con IA",   desc: "Crea, analiza y optimiza campañas con asistencia inteligente.",                         href: "/ads",              cta: null,              active: false },
  { icon: "🤖", title: "IA Marketing Copilot", desc: "Detecta tareas pendientes, productos sin publicar y oportunidades de campaña.",          href: "/copilot",          cta: null,              active: false },
];

/** Tenant workspace cards — production surface only, no admin links. */
const TENANT_MODULE_CARDS: Array<{
  icon: string; title: string; desc: string; href: string; cta: string; active: boolean;
}> = [
  { icon: "📸", title: "Foto Estudio",         desc: "Produce fotos, videos y piezas visuales desde productos reales.",                      href: "/foto-estudio/new", cta: "Crear contenido",   active: true  },
  { icon: "🖼️", title: "Biblioteca Creativa",  desc: "Centraliza productos, fotos, videos, catálogos y activos aprobados.",                  href: "/biblioteca",       cta: "Ver biblioteca", active: true  },
  { icon: "📱", title: "Redes Sociales",        desc: "Programa y publica contenido desde activos aprobados.",                                href: "/redes",            cta: "Publicar",       active: false },
  { icon: "🛍️", title: "Shopify",              desc: "Publica productos, imágenes, videos y banners en tu tienda.",                          href: "/shopify",          cta: "Conectar",       active: false },
  { icon: "📣", title: "Ads / Pauta con IA",   desc: "Crea, analiza y optimiza campañas con asistencia inteligente.",                        href: "/ads",              cta: "Explorar",       active: false },
  { icon: "🤖", title: "IA Marketing Copilot", desc: "Detecta tareas pendientes, productos sin publicar y oportunidades de campaña.",         href: "/copilot",          cta: "Abrir Copilot",  active: false },
];

/** Admin-only config cards — never shown in tenant workspace. */
const ADMIN_CONFIG_CARDS = [
  { href: "/presets", icon: "🎨", title: "Registro de presets",      desc: "Presets globales de iluminación, ángulo y estilo.", badge: { label: `${ALL_PRESETS.length} presets`, variant: "neutral" as const } },
  { href: "/tenants", icon: "🏢", title: "Configuración de tenants", desc: "Voz de marca, presets habilitados y config de Luca.", badge: { label: `${ALL_TENANT_CONFIGS.length} tenants`, variant: "success" as const } },
  { href: "/intake",  icon: "📋", title: "Esquema de intake",        desc: "Referencia del esquema canónico de sesiones fotográficas.", badge: undefined },
];
