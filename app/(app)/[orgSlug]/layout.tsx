import Link        from "next/link";
import { headers } from "next/headers";
import { requireTenant }                          from "@/lib/tenant";
import { getEnabledModules, resolveModuleForPath } from "@/lib/tenant/modules";
import { filterModulesByRole, isInternalRole }    from "@/lib/auth/module-access";
import RightOpsRail                               from "@/components/layout/right-ops-rail";
import { Badge }                                  from "@/components/shell/primitives";
import { C, T, S, R }                             from "@/lib/ui/tokens";

// ── Role → badge variant ───────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, "dark" | "brand" | "info" | "warning" | "neutral"> = {
  SUPER_ADMIN:   "dark",
  AGENTIK_ADMIN: "dark",
  ORG_ADMIN:     "brand",
  MANAGER:       "info",
  BILLING:       "warning",
};

// ── Nav helpers ────────────────────────────────────────────────────────────────

const navLink: React.CSSProperties = {
  fontFamily:     T.mono,
  fontSize:       T.sz.sm,
  fontWeight:     T.wt.semibold,
  color:          C.inkMid,
  textDecoration: "none",
  lineHeight:     1.4,
  display:        "block",
  padding:        `5px ${S[2]}px`,
  borderRadius:   R.md,
};

const navLinkAccent: React.CSSProperties = {
  ...navLink,
  color:      C.brand,
  fontWeight: T.wt.bold,
};

const navLinkExec: React.CSSProperties = {
  ...navLink,
  color:      C.exec,
  fontWeight: T.wt.bold,
};

const navLinkCollections: React.CSSProperties = {
  ...navLink,
  color:      "#7c3aed",
  fontWeight: T.wt.bold,
};

const navLinkInternal: React.CSSProperties = {
  ...navLink,
  color:      C.inkLight,
  fontWeight: T.wt.medium,
};

const subLink  = (extra?: React.CSSProperties): React.CSSProperties => ({
  ...navLink,
  paddingLeft: S[4],
  fontSize:    T.sz.xs,
  color:       C.inkLight,
  fontWeight:  T.wt.medium,
  ...extra,
});

const subLink2 = (): React.CSSProperties => ({
  ...subLink(),
  paddingLeft: S[6],
});

// Card wrapper for each nav section group
const navCard: React.CSSProperties = {
  background:   C.white,
  border:       `1px solid ${C.sidebarLine}`,
  borderRadius: R.xl,
  overflow:     "hidden" as const,
  marginBottom: S[2],
};

// Tonal header inside each nav card
const navCardHeader = (label: string, accent?: string): React.ReactElement => (
  <div style={{
    background:    accent ? `${accent}18` : C.surface,
    padding:       `${S[1] + 1}px ${S[2]}px`,
    borderBottom:  `1px solid ${accent ? `${accent}30` : C.sidebarLine}`,
    fontFamily:    T.sans,
    fontSize:      T.sz["2xs"],
    fontWeight:    T.wt.bold,
    color:         accent ?? C.inkGhost,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  }}>
    {label}
  </div>
);

// Body padding wrapper inside nav card
const navCardBody: React.CSSProperties = {
  padding:       `${S[1]}px ${S[1] + 2}px`,
  display:       "flex",
  flexDirection: "column" as const,
};

// ── Layout ─────────────────────────────────────────────────────────────────────

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params:   Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx  = await requireTenant(orgSlug);
  const orgMods = await getEnabledModules(ctx.orgId);

  // Intersect org-level feature flags with role-based visibility
  const mods = filterModulesByRole(orgMods, ctx.role);

  // Capability flags
  const showInternal = isInternalRole(ctx.role);

  // ── Route guard ──────────────────────────────────────────────────────────────
  const pathname    = headers().get("x-invoke-path") ?? "";
  const routeModule = resolveModuleForPath(ctx.orgSlug, pathname);
  const isBlocked   = routeModule !== null && !mods.has(routeModule);
  // ────────────────────────────────────────────────────────────────────────────

  const roleBadgeVariant = ROLE_BADGE[ctx.role] ?? "neutral";

  return (
    <>
      <style>{`
        .org-shell {
          display: grid;
          grid-template-columns: 272px 1fr 240px;
          min-height: 100vh;
        }
        .org-rail { display: block; border-left: 1px solid ${C.sidebarLine}; }
        @media (max-width: 1024px) {
          .org-shell { grid-template-columns: 272px 1fr; }
          .org-rail  { display: none !important; }
        }
        .nav-link:hover {
          color: ${C.brand} !important;
          background: ${C.surfaceAlt} !important;
        }
      `}</style>

      <div className="org-shell">

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside style={{
          background: C.sidebarBg,
          boxShadow:  `inset -1px 0 0 ${C.sidebarLine}`,
          padding:    `${S[4]}px ${S[3]}px`,
          display:    "flex",
          flexDirection: "column",
          minHeight:  "100vh",
        }}>

          {/* Org header — card */}
          <div style={{
            background:   C.surface,
            border:       `1px solid ${C.sidebarLine}`,
            borderRadius: R.xl,
            padding:      `${S[2] + 4}px ${S[3]}px`,
            marginBottom: S[3],
          }}>
            <div style={{
              fontFamily:    T.sans,
              fontSize:      T.sz["2xs"],
              fontWeight:    T.wt.bold,
              color:         C.inkFaint,
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
              marginBottom:  S[1],
            }}>
              Agentik Enterprise
            </div>
            <div style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.lg,
              fontWeight:   T.wt.black,
              color:        C.ink,
              lineHeight:   1.2,
              marginBottom: S[1],
            }}>
              {ctx.orgSlug}
            </div>
            <span style={{
              fontFamily:   T.mono,
              fontSize:     T.sz["2xs"],
              color:        C.inkFaint,
              background:   C.surfaceAlt,
              border:       `1px solid ${C.line}`,
              borderRadius: R.xs,
              padding:      "1px 6px",
            }}>
              {ctx.projectKey}
            </span>
          </div>

          {/* Nav */}
          <nav style={{ display: "flex", flexDirection: "column", flex: 1 }}>

            {/* ── Gestión ── */}
            {(mods.has("dashboard") || mods.has("torre_control") || mods.has("finance")) && (
              <div style={navCard}>
                {navCardHeader("Gestión")}
                <div style={navCardBody}>
                  {mods.has("dashboard") && (
                    <Link className="nav-link" href={`/${ctx.orgSlug}/dashboard`} style={navLink}>
                      Centro de Operaciones
                    </Link>
                  )}
                  {mods.has("torre_control") && (
                    <Link className="nav-link" href={`/${ctx.orgSlug}/executive`} style={navLinkExec}>
                      Torre de Control ↗
                    </Link>
                  )}
                  {mods.has("finance") && (
                    <Link className="nav-link" href={`/${ctx.orgSlug}/finance`} style={navLink}>
                      Finanzas
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* ── Cobranza ── */}
            {mods.has("collections") && (
              <div style={navCard}>
                {navCardHeader("Cobranza", "#7c3aed")}
                <div style={navCardBody}>
                  <Link className="nav-link" href={`/${ctx.orgSlug}/collections`} style={navLinkCollections}>
                    Cola de Cobranza ↗
                  </Link>
                  <Link className="nav-link" href={`/${ctx.orgSlug}/collections/campaigns`} style={subLink({ color: "#7c3aed" })}>
                    Campañas
                  </Link>
                  <Link className="nav-link" href={`/${ctx.orgSlug}/collections/performance`} style={subLink()}>
                    Rendimiento
                  </Link>
                  <Link className="nav-link" href={`/${ctx.orgSlug}/customer-360?hasOverdue=true`} style={subLink()}>
                    Clientes en mora
                  </Link>
                </div>
              </div>
            )}

            {/* ── Comercial ── */}
            {mods.has("sales") && (
              <div style={navCard}>
                {navCardHeader("Comercial")}
                <div style={navCardBody}>
                  <Link className="nav-link" href={`/${ctx.orgSlug}/sales`} style={navLinkAccent}>
                    Control Comercial ↗
                  </Link>
                  <Link className="nav-link" href={`/${ctx.orgSlug}/data-explorer`}  style={subLink()}>Explorador de Datos</Link>
                  <Link className="nav-link" href={`/${ctx.orgSlug}/reconciliation`} style={subLink()}>Centro de Conciliación</Link>
                  <Link className="nav-link" href={`/${ctx.orgSlug}/customer-360`}   style={subLink()}>Cliente 360</Link>
                  <Link className="nav-link" href={`/${ctx.orgSlug}/pipeline`}       style={subLink()}>Embudo Comercial</Link>
                  <Link className="nav-link" href={`/${ctx.orgSlug}/reports`}        style={subLink({ color: C.brand, fontWeight: T.wt.bold })}>
                    Informes Inteligentes ✨
                  </Link>
                  <Link className="nav-link" href={`/${ctx.orgSlug}/sales/vendors`}  style={subLink()}>Vendedores</Link>
                  <Link className="nav-link" href={`/${ctx.orgSlug}/sales/lines`}    style={subLink()}>Líneas</Link>
                  <Link className="nav-link" href={`/${ctx.orgSlug}/sales/branches`} style={subLink()}>Sucursales</Link>
                  <Link className="nav-link" href={`/${ctx.orgSlug}/sales/channels`} style={subLink()}>Canales</Link>
                </div>
              </div>
            )}

            {/* ── Operaciones ── */}
            {(mods.has("workforce") || mods.has("alerts") || mods.has("documents") || mods.has("knowledge")) && (
              <div style={navCard}>
                {navCardHeader("Operaciones")}
                <div style={navCardBody}>
                  {mods.has("workforce") && (
                    <Link className="nav-link" href={`/${ctx.orgSlug}/workforce`} style={{ ...navLink, color: C.amber }}>
                      Workforce · RRHH
                    </Link>
                  )}
                  {mods.has("alerts") && (
                    <Link className="nav-link" href={`/${ctx.orgSlug}/alerts`} style={navLink}>Alertas</Link>
                  )}
                  {mods.has("documents") && (
                    <Link className="nav-link" href={`/${ctx.orgSlug}/documents`} style={navLink}>Documentos</Link>
                  )}
                  {mods.has("knowledge") && (
                    <Link className="nav-link" href={`/${ctx.orgSlug}/knowledge`} style={navLink}>Conocimiento</Link>
                  )}
                </div>
              </div>
            )}

            {/* ── Consola Interna — SUPER_ADMIN / ORG_ADMIN only ── */}
            {showInternal && (
              <div style={{ ...navCard, border: `1px solid #e0e7ff` }}>
                {navCardHeader("Consola Interna", "#4f46e5")}
                <div style={navCardBody}>
                  {mods.has("agentik") && (
                    <Link className="nav-link" href={`/${ctx.orgSlug}/agentik`} style={{ ...navLinkInternal, color: "#4f46e5", fontWeight: T.wt.bold }}>
                      Agentik ↗
                    </Link>
                  )}
                  {mods.has("runs") && (
                    <Link className="nav-link" href={`/${ctx.orgSlug}/runs`} style={navLinkInternal}>Ejecuciones</Link>
                  )}
                  {mods.has("events") && (
                    <Link className="nav-link" href={`/${ctx.orgSlug}/events`} style={navLinkInternal}>Eventos</Link>
                  )}
                  {mods.has("agents") && (
                    <Link className="nav-link" href={`/${ctx.orgSlug}/agents`} style={navLinkInternal}>Agentes</Link>
                  )}
                  {mods.has("integrations") && (
                    <>
                      <Link className="nav-link" href={`/${ctx.orgSlug}/integrations`} style={navLinkInternal}>Integraciones</Link>
                      <Link className="nav-link" href={`/${ctx.orgSlug}/sag/write`}           style={subLink()}>Aprobaciones SAG</Link>
                      <Link className="nav-link" href={`/${ctx.orgSlug}/sag/clientes/nuevo`}  style={subLink2()}>Nuevo Cliente SAG</Link>
                      <Link className="nav-link" href={`/${ctx.orgSlug}/sag/articulos/nuevo`} style={subLink2()}>Nuevo Artículo SAG</Link>
                    </>
                  )}
                  {mods.has("settings") && (
                    <Link className="nav-link" href={`/${ctx.orgSlug}/settings`} style={navLinkInternal}>Configuración</Link>
                  )}
                </div>
              </div>
            )}

          </nav>

          {/* Role badge — footer card */}
          <div style={{
            background:   C.surface,
            border:       `1px solid ${C.sidebarLine}`,
            borderRadius: R.xl,
            padding:      `${S[2]}px ${S[3]}px`,
            marginTop:    S[2],
            display:      "flex",
            alignItems:   "center",
            gap:          S[2],
          }}>
            <Badge variant={roleBadgeVariant} size="xs">{ctx.role}</Badge>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
              {ctx.orgSlug}
            </span>
          </div>

        </aside>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <main style={{ padding: S[6], background: C.white, minWidth: 0 }}>
          {isBlocked ? (
            <div style={{ padding: S[10], textAlign: "center", color: C.inkLight }}>
              <div style={{ fontSize: T.sz["2xl"], fontWeight: T.wt.bold, marginBottom: S[2] }}>
                Módulo no habilitado
              </div>
              <div style={{ fontSize: T.sz.lg, color: C.inkFaint, maxWidth: 360, margin: "0 auto" }}>
                Este módulo no está disponible para tu organización o tu rol.
                Contacta a tu administrador si crees que es un error.
              </div>
            </div>
          ) : children}
        </main>

        {/* ── Right operations rail — desktop only ───────────────────────── */}
        <div className="org-rail">
          <RightOpsRail orgSlug={ctx.orgSlug} orgId={ctx.orgId} pathname={pathname} />
        </div>

      </div>
    </>
  );
}
