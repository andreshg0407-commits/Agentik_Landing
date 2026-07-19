/**
 * Centro de Operaciones — tenant home page.
 *
 * Propósito: punto de entrada operativo diario.
 *   - Orientación contextual (org, usuario, rol)
 *   - Briefing y recomendaciones del día (Agentik AI)
 *   - Alertas urgentes sin resolver
 *   - Acceso rápido a módulos
 *   - Estado operativo del sistema (ejecuciones, eventos)
 *   - Acceso a espacios de trabajo
 *
 * Layout (corrected sprint — respects established shell hierarchy):
 *   Center canvas only. Left sidebar and right Copilot rail are untouched.
 *   The right rail already shows live operational counts (alerts, SAG, tasks).
 *   This page therefore does NOT duplicate those counts in a competing column.
 *
 *   Information order — based on decision flow, not data availability:
 *     1. Briefing   — AI context for the day (full-width editorial card)
 *     2. Priorities — three operational signals, horizontal strip, beneath briefing
 *     3. Alerts     — active when urgent alerts exist (actionable, left-accent)
 *     4. Modules    — quick access grid, utility zone
 *     5. Activity   — technical health bar (SUPER_ADMIN only expands to full panels)
 *
 * Contenido ejecutivo (KPIs, tendencias, mix, riesgo financiero)
 * vive en Torre de Control — /[orgSlug]/executive.
 */

import Link                          from "next/link";
import { formatDateWeekday }         from "@/lib/utils/formatDate";
import { MembershipStatus }          from "@prisma/client";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { isInternalRole }            from "@/lib/auth/module-access";
import { getEnabledModules }         from "@/lib/tenant/modules";
import { statusLabel, severityLabel } from "@/lib/ui/status-labels";
import { getAccessibleOrganizations } from "@/lib/auth/user-orgs";
import { getOrgDashboardActivity }   from "@/lib/dashboard/org-activity";
import { generateOrganizationDailyBriefing } from "@/lib/agentik/daily-briefing";
import { prisma }                    from "@/lib/prisma";
import { C, T, S, R, E }            from "@/lib/ui/tokens";
import { Panel, PanelHeader, Badge, EmptyState } from "@/components/shell/primitives";

// Roles that see full technical panels (runs + events).
const TECHNICAL_ROLES = new Set(["SUPER_ADMIN"]);

// ── Module access directory ────────────────────────────────────────────────────

/**
 * Quick-access modules grid.
 *
 * `internal: true`  → only shown to SUPER_ADMIN / AGENTIK_ADMIN.
 * `internal: false` → shown to all roles that land on this dashboard.
 */
const MODULES: ReadonlyArray<{
  label:       string;
  icon:        string;
  href:        string;
  accent:      string;
  description: string;
  internal:    boolean;
  moduleKey?:  string; // opt-in module key — only shown when enabled for the tenant
}> = [
  { label: "Torre de Control",       icon: "⚡", href: "executive",       accent: "#1e1e2e", description: "Vista ejecutiva",          internal: false },
  { label: "Control Comercial",      icon: "📊", href: "sales",           accent: "#7c3aed", description: "KPIs, vendedores, líneas", internal: false },
  { label: "Informes Inteligentes",  icon: "✨", href: "reports",         accent: "#7c3aed", description: "Reportes con IA",          internal: false },
  { label: "Marketing Studio",       icon: "📸", href: "agentik/marketing-studio", accent: "#7c2d92", description: "Foto Estudio, Biblioteca, Redes", internal: false, moduleKey: "marketing_studio" },
  { label: "Embudo Comercial",       icon: "🔁", href: "pipeline",        accent: "#0369a1", description: "Pipeline CRM → SAG",       internal: false },
  { label: "Cliente 360",            icon: "👤", href: "customer-360",    accent: "#059669", description: "Cartera y perfil",          internal: false },
  { label: "Conciliación Inteligente", icon: "🔗", href: "reconciliation",  accent: "#b45309", description: "Cartera · Banco · DIAN",     internal: false },
  { label: "Finanzas",               icon: "💰", href: "finance",         accent: "#b45309", description: "Documentos y alertas",      internal: false },
  { label: "Explorador de Datos",    icon: "🔍", href: "data-explorer",   accent: "#444",    description: "Consulta libre",           internal: false },
  { label: "Alertas",                icon: "🔔", href: "alerts",          accent: "#dc2626", description: "Alertas activas",          internal: false },
  { label: "Workforce · RRHH",       icon: "👥", href: "workforce",       accent: "#b45309", description: "Equipos",                  internal: false, moduleKey: "workforce" },
  // Internal-only entries
  { label: "Agentik",                icon: "🤖", href: "agentik",         accent: "#6d28d9", description: "Consola de operaciones",   internal: true  },
  { label: "Integraciones",          icon: "⚙️",  href: "integrations",   accent: "#374151", description: "Conectores y SAG",         internal: true  },
];

// ── Severity display ───────────────────────────────────────────────────────────

const SEV_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  CRITICAL: { bg: C.redLight,   color: C.redDark,  border: C.redBorder   },
  WARNING:  { bg: C.amberLight, color: C.amberDark, border: C.amberBorder },
  INFO:     { bg: C.blueLight,  color: C.blueDark,  border: C.blueBorder  },
};

const SEV_LABEL: Record<string, string> = {
  CRITICAL: "CRÍTICA", WARNING: "ADVERTENCIA", INFO: "INFO",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CentroDeOperacionesPage({
  params,
}: {
  params: { orgSlug: string };
}) {
  const { user, organization, membership } = await requireOrgAccess(params.orgSlug);
  const firstName  = user.name?.split(" ")[0] ?? "usuario";
  const isInternal = isInternalRole(membership.role);

  const yesterday = new Date(Date.now() - 86_400_000);

  // Fetch enabled modules to filter the quick-access grid
  const mods = await getEnabledModules(organization.id);

  // Queries that are always needed
  const [activity, briefing, totalActiveAlerts, pendingTasks] = await Promise.all([
    getOrgDashboardActivity(organization.id),
    generateOrganizationDailyBriefing({
      organizationId:   organization.id,
      organizationName: organization.name,
      firstName,
    }),
    prisma.alert.count({
      where: { organizationId: organization.id, status: { not: "RESOLVED" } },
    }).catch(() => 0),
    (prisma as any).actionTask.count({
      where: { organizationId: organization.id, status: { in: ["PENDING", "IN_PROGRESS"] } },
    }).catch(() => 0) as Promise<number>,
  ]);

  // Internal-only queries — skip entirely for client roles to avoid leaking data
  const [workspaceMemberships, organizations, pendingApprovals] = isInternal
    ? await Promise.all([
        prisma.workspaceMembership.findMany({
          where: {
            userId: user.id,
            status: MembershipStatus.ACTIVE,
            workspace: { organizationId: organization.id },
          },
          select: { workspace: { select: { id: true, name: true, slug: true } } },
        }),
        getAccessibleOrganizations(),
        (prisma as any).sagWriteOperation.count({
          where: { organizationId: organization.id, status: "PENDING" },
        }).catch(() => 0) as Promise<number>,
      ])
    : [[], [], 0];

  const urgentAlerts = activity.alerts.filter(
    a => a.severity === "CRITICAL" || a.severity === "WARNING"
  );
  const newAlertsSinceYesterday = activity.alerts.filter(a => a.createdAt >= yesterday).length;
  const isTechnical = TECHNICAL_ROLES.has(membership.role);

  // Filter quick-access modules:
  //   - internal entries only visible to isInternalRole
  //   - entries with moduleKey only visible when the module is enabled for this tenant
  const visibleModules = MODULES.filter(m =>
    (!m.internal || isInternal) &&
    (!m.moduleKey || mods.has(m.moduleKey as any)),
  );

  const today = formatDateWeekday(new Date());

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 1100 }}>

      {/* ── Header ─────────────────────────────────────────────────────────────
          Compact metadata above the title. Single right-aligned CTA.
          The left nav and right rail handle persistent navigation.           */}
      <div style={{
        display:        "flex",
        alignItems:     "flex-end",
        justifyContent: "space-between",
        gap:            S[4],
        marginBottom:   S[6],
      }}>
        <div>
          <div style={{
            fontSize:      T.sz.xs,
            color:         C.inkGhost,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom:  S[1] + 2,
          }}>
            {organization.name} · {today}
          </div>
          <h1 style={{
            margin:        0,
            fontSize:      T.sz["4xl"],
            fontWeight:    T.wt.black,
            color:         C.ink,
            letterSpacing: "-0.025em",
            lineHeight:    1,
          }}>
            Centro de Operaciones
          </h1>
          <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginTop: 5 }}>
            {user.name ?? user.email} · <b style={{ color: C.inkMid }}>{membership.role}</b>
          </div>
        </div>

        <Link
          href={`/${params.orgSlug}/executive`}
          style={{
            fontSize:       T.sz.sm,
            fontWeight:     T.wt.bold,
            color:          C.exec,
            textDecoration: "none",
            padding:        "8px 18px",
            border:         `1.5px solid ${C.exec}`,
            borderRadius:   R.sm,
            letterSpacing:  "0.02em",
            whiteSpace:     "nowrap",
            flexShrink:     0,
          }}
        >
          ⚡ Torre de Control →
        </Link>
      </div>

      {/* ── Briefing — full-width editorial hero ───────────────────────────────
          AI context for the day. Takes the full center-canvas width so it
          reads as the primary signal — not a panel competing with the rail.  */}
      <div style={{
        background:    C.white,
        border:        `1px solid ${C.line}`,
        borderRadius:  R.xl,
        padding:       `${S[8]}px ${S[6]}px`,
        boxShadow:     E.sm,
        marginBottom:  S[4],
      }}>
        {/* Module label + status */}
        <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[4] }}>
          <span style={{
            fontSize:      T.sz["2xs"],
            fontWeight:    T.wt.bold,
            color:         C.brand,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}>
            Briefing del día · Agentik IA
          </span>
          <Badge variant="brand">{briefing.status}</Badge>
        </div>

        {/* Headline — editorial weight, tight tracking */}
        <div style={{
          fontSize:      T.sz["3xl"],
          fontWeight:    T.wt.black,
          color:         C.ink,
          lineHeight:    1.25,
          letterSpacing: "-0.02em",
          marginBottom:  briefing.message ? S[3] : S[5],
          maxWidth:      640,
        }}>
          {briefing.headline}
        </div>

        {/* Body — readable, 65-char measure */}
        {briefing.message && (
          <p style={{
            fontSize:   T.sz.md,
            color:      C.inkMid,
            margin:     `0 0 ${S[5]}px`,
            lineHeight: 1.65,
            maxWidth:   600,
          }}>
            {briefing.message}
          </p>
        )}

        {/* Action links */}
        <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
          <Link
            href={`/${params.orgSlug}/reports`}
            style={{
              fontSize:       T.sz.sm,
              color:          C.brand,
              fontWeight:     T.wt.bold,
              textDecoration: "none",
              padding:        "5px 12px",
              border:         `1px solid ${C.brand}`,
              borderRadius:   R.sm,
            }}
          >
            ✨ Informes Inteligentes →
          </Link>
          {isInternal && (
            <Link
              href={`/${params.orgSlug}/agentik`}
              style={{
                fontSize:       T.sz.sm,
                color:          C.inkLight,
                fontWeight:     T.wt.bold,
                textDecoration: "none",
                padding:        "5px 12px",
                border:         `1px solid ${C.line}`,
                borderRadius:   R.sm,
              }}
            >
              🤖 Consultar Agentik →
            </Link>
          )}
        </div>
      </div>

      {/* ── Prioridades del día — horizontal strip ─────────────────────────────
          Three operational signals below the briefing, in the natural reading
          flow. Horizontal (not a competing right column) so they don't create
          a false extension of the right rail.                                */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: isInternal ? "1fr 1fr 1fr" : "1fr 1fr",
        gap:                 S[3],
        marginBottom:        S[5],
      }}>
        <DaySignal
          icon="🔔"
          label="Alertas activas"
          value={totalActiveAlerts}
          sublabel={newAlertsSinceYesterday > 0 ? `+${newAlertsSinceYesterday} desde ayer` : "sin cambios"}
          urgent={urgentAlerts.length > 0}
          href={`/${params.orgSlug}/alerts`}
        />
        <DaySignal
          icon="✅"
          label="Tareas activas"
          value={pendingTasks}
          sublabel={pendingTasks === 0 ? "sin pendientes" : "pendientes o en progreso"}
          urgent={false}
          href={`/${params.orgSlug}/reports`}
        />
        {isInternal && (
          <DaySignal
            icon="✍"
            label="Aprobaciones SAG"
            value={pendingApprovals as number}
            sublabel={(pendingApprovals as number) === 0 ? "al día" : "esperando aprobación"}
            urgent={(pendingApprovals as number) > 0}
            href={`/${params.orgSlug}/sag/write`}
          />
        )}
      </div>

      {/* ── Alertas urgentes ───────────────────────────────────────────────────
          Only rendered when urgent alerts exist. Left red accent communicates
          urgency without heavy panel chrome across the full width.           */}
      {urgentAlerts.length > 0 && (
        <div style={{
          background:    C.white,
          border:        `1.5px solid ${C.redBorder}`,
          borderLeft:    `4px solid ${C.red}`,
          borderRadius:  R.xl,
          boxShadow:     E.xs,
          marginBottom:  S[5],
          overflow:      "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding:      `${S[2] + 2}px ${S[4]}px`,
            background:   C.redLight,
            borderBottom: `1px solid ${C.redBorder}`,
            display:      "flex",
            alignItems:   "center",
            gap:          S[2],
          }}>
            <span style={{ fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.red }}>
              ⚠ Alertas urgentes sin resolver
            </span>
            <Badge variant={urgentAlerts.some(a => a.severity === "CRITICAL") ? "danger" : "warning"}>
              {urgentAlerts.length}
            </Badge>
            <Link
              href={`/${params.orgSlug}/alerts`}
              style={{
                marginLeft:     "auto",
                fontSize:       T.sz.sm,
                color:          C.red,
                fontWeight:     T.wt.bold,
                textDecoration: "none",
              }}
            >
              Ver todas →
            </Link>
          </div>

          {/* Alert rows */}
          <div style={{ padding: `${S[1]}px ${S[4]}px` }}>
            {urgentAlerts.slice(0, 5).map(alert => {
              const sty = SEV_STYLES[alert.severity] ?? SEV_STYLES.INFO;
              return (
                <div key={alert.id} style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:          S[2] + 2,
                  padding:      "7px 0",
                  borderBottom: `1px solid ${C.lineSubtle}`,
                  fontSize:     T.sz.base,
                }}>
                  <span style={{
                    fontSize:     T.sz["2xs"],
                    fontWeight:   T.wt.bold,
                    padding:      "2px 6px",
                    borderRadius: R.xs,
                    background:   sty.bg,
                    color:        sty.color,
                    border:       `1px solid ${sty.border}`,
                    flexShrink:   0,
                  }}>
                    {SEV_LABEL[alert.severity] ?? alert.severity}
                  </span>
                  <span style={{ fontWeight: T.wt.semibold, color: C.ink, flex: 1 }}>
                    {alert.title}
                  </span>
                  <span style={{ fontSize: T.sz.sm, color: C.inkLight }}>
                    {severityLabel(alert.severity)} · {statusLabel(alert.status)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Módulos — acceso rápido ────────────────────────────────────────────
          4-col grid. Cards use border-radius and subtle shadow — same items
          as before, calmer visual treatment.                                 */}
      <div style={{ marginBottom: S[6] }}>
        <div style={{
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.bold,
          color:         C.inkGhost,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom:  S[2] + 2,
        }}>
          Acceso rápido a módulos
        </div>
        <div style={{
          display:             "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap:                 S[2] + 2,
        }}>
          {visibleModules.map(mod => (
            <Link
              key={mod.href}
              href={`/${params.orgSlug}/${mod.href}`}
              style={{ textDecoration: "none" }}
            >
              <div style={{
                background:    C.white,
                border:        `1px solid ${C.line}`,
                borderRadius:  R.xl,
                padding:       `${S[3]}px ${S[3] + 2}px`,
                display:       "flex",
                flexDirection: "column",
                gap:           4,
                boxShadow:     E.xs,
              }}>
                <span style={{ fontSize: 17 }}>{mod.icon}</span>
                <span style={{
                  fontSize:   T.sz.sm,
                  fontWeight: T.wt.bold,
                  color:      mod.accent,
                  lineHeight: 1.2,
                }}>
                  {mod.label}
                </span>
                <span style={{ fontSize: T.sz.xs, color: C.inkLight }}>{mod.description}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Actividad técnica ──────────────────────────────────────────────────
          Only shown to internal roles. Client roles don't have access to
          runs/events so these links and counters are not relevant to them.  */}
      {isInternal && isTechnical ? (
        <div style={{
          display:             "grid",
          gridTemplateColumns: "1fr 1fr",
          gap:                 S[4],
          marginBottom:        S[5],
        }}>
          <Panel style={{ marginBottom: 0 }}>
            <PanelHeader
              title="Ejecuciones recientes"
              cta={{ label: "Ver todas →", href: `/${params.orgSlug}/runs` }}
            />
            {activity.runs.length === 0 ? (
              <EmptyState message="Sin ejecuciones recientes." />
            ) : (
              <div>
                {activity.runs.slice(0, 6).map(run => (
                  <div key={run.id} style={{
                    padding:      `7px ${S[4]}px`,
                    borderBottom: `1px solid ${C.lineSubtle}`,
                    fontSize:     T.sz.base,
                    display:      "flex",
                    alignItems:   "center",
                    gap:          S[2],
                  }}>
                    <span style={{ color: C.ink, fontWeight: T.wt.semibold, flex: 1 }}>{run.type}</span>
                    <StatusPill status={run.status} />
                    <span style={{ fontSize: T.sz.xs, color: C.inkGhost }}>{fmtRelTime(run.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel style={{ marginBottom: 0 }}>
            <PanelHeader
              title="Eventos recientes"
              cta={{ label: "Ver todos →", href: `/${params.orgSlug}/events` }}
            />
            {activity.events.length === 0 ? (
              <EmptyState message="Sin eventos recientes." />
            ) : (
              <div>
                {activity.events.slice(0, 6).map(event => (
                  <div key={event.id} style={{
                    padding:      `7px ${S[4]}px`,
                    borderBottom: `1px solid ${C.lineSubtle}`,
                    fontSize:     T.sz.base,
                    display:      "flex",
                    alignItems:   "center",
                    gap:          S[2],
                  }}>
                    <span style={{ color: C.ink, fontWeight: T.wt.semibold, flex: 1 }}>{event.type}</span>
                    <StatusPill status={event.status} />
                    <span style={{ fontSize: T.sz.xs, color: C.inkGhost }}>{fmtRelTime(event.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      ) : isInternal ? (
        /* Slim tonal bar — keeps access to runs/events without visual weight (non-SUPER_ADMIN internals) */
        <div style={{
          background:   C.surface,
          border:       `1px solid ${C.line}`,
          borderRadius: R.xl,
          padding:      `${S[2]}px ${S[4]}px`,
          marginBottom: S[5],
          display:      "flex",
          alignItems:   "center",
          gap:          S[4],
          fontSize:     T.sz.sm,
          color:        C.inkLight,
        }}>
          <span style={{
            fontWeight:    T.wt.bold,
            color:         C.inkGhost,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}>
            Estado técnico
          </span>
          <span>
            {activity.runs.length === 0
              ? "Sin ejecuciones recientes"
              : `${activity.runs.length} ejecución${activity.runs.length > 1 ? "es" : ""} reciente${activity.runs.length > 1 ? "s" : ""}`}
          </span>
          <span style={{ color: C.inkGhost }}>·</span>
          <span>
            {activity.events.length === 0
              ? "Sin eventos recientes"
              : `${activity.events.length} evento${activity.events.length > 1 ? "s" : ""} reciente${activity.events.length > 1 ? "s" : ""}`}
          </span>
          <Link
            href={`/${params.orgSlug}/runs`}
            style={{ color: C.brand, fontWeight: T.wt.semibold, textDecoration: "none", marginLeft: "auto" }}
          >
            Ejecuciones →
          </Link>
          <Link
            href={`/${params.orgSlug}/events`}
            style={{ color: C.brand, fontWeight: T.wt.semibold, textDecoration: "none" }}
          >
            Eventos →
          </Link>
        </div>
      ) : null}

      {/* ── Organizaciones y espacios de trabajo ── */}
      {(organizations.length > 1 || workspaceMemberships.length > 0) && (
        <div style={{
          display:             "grid",
          gridTemplateColumns: organizations.length > 1 && workspaceMemberships.length > 0 ? "1fr 1fr" : "1fr",
          gap:                 S[4],
          marginBottom:        S[5],
        }}>
          {organizations.length > 1 && (
            <Panel style={{ marginBottom: 0 }}>
              <PanelHeader title="Organizaciones disponibles" />
              <div>
                {organizations.map(org => (
                  <div key={org.id} style={{ padding: `7px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}` }}>
                    <Link href={`/${org.slug}/dashboard`} style={{
                      fontSize: T.sz.base, color: C.brand, textDecoration: "none", fontWeight: T.wt.semibold,
                    }}>
                      {org.name} ↗
                    </Link>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {workspaceMemberships.length > 0 && (
            <Panel style={{ marginBottom: 0 }}>
              <PanelHeader title="Espacios de trabajo" />
              <div>
                {workspaceMemberships.map(({ workspace }) => (
                  <div key={workspace.id} style={{ padding: `7px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}` }}>
                    <Link href={`/${params.orgSlug}/${workspace.slug}/dashboard`} style={{
                      fontSize: T.sz.base, color: C.brand, textDecoration: "none", fontWeight: T.wt.semibold,
                    }}>
                      {workspace.name} ↗
                    </Link>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}

    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/**
 * DaySignal — compact operational signal tile for the horizontal priority strip.
 *
 * Horizontal layout: large number (left) → label + sublabel (center, flex) → icon (right).
 * Used in a 3-col grid below the briefing card — in the natural reading flow,
 * not as a competing side column that conflicts with the right operations rail.
 */
function DaySignal({
  icon,
  label,
  value,
  sublabel,
  urgent,
  href,
}: {
  icon:     string;
  label:    string;
  value:    number;
  sublabel: string;
  urgent:   boolean;
  href:     string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{
        background:    urgent ? C.redLight : C.white,
        border:        urgent ? `1.5px solid ${C.redBorder}` : `1px solid ${C.line}`,
        borderRadius:  R.xl,
        padding:       `${S[3]}px ${S[4]}px`,
        boxShadow:     E.xs,
        display:       "flex",
        alignItems:    "center",
        gap:           S[3],
      }}>
        {/* Value — large, left-anchored */}
        <div style={{
          fontSize:      value === 0 ? T.sz["2xl"] : T.sz["3xl"],
          fontWeight:    T.wt.black,
          color:         urgent ? C.red : value === 0 ? C.inkGhost : C.ink,
          letterSpacing: "-0.02em",
          lineHeight:    1,
          minWidth:      32,
        }}>
          {value}
        </div>

        {/* Label + sublabel */}
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize:     T.sz.sm,
            fontWeight:   T.wt.bold,
            color:        urgent ? C.red : C.ink,
            marginBottom: 3,
          }}>
            {label}
          </div>
          <div style={{ fontSize: T.sz.xs, color: urgent ? C.redDark : C.inkFaint }}>
            {sublabel}
          </div>
        </div>

        {/* Icon — decorative, dimmed */}
        <span style={{ fontSize: T.sz.lg, flexShrink: 0, opacity: 0.55 }}>{icon}</span>
      </div>
    </Link>
  );
}

// ── Shared primitives ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  ACTIVE:    { bg: C.greenBorder, color: C.greenDark },
  DONE:      { bg: C.greenBorder, color: C.greenDark },
  COMPLETED: { bg: C.greenBorder, color: C.greenDark },
  RUNNING:   { bg: C.blueBorder,  color: C.blueDark  },
  PENDING:   { bg: C.line,        color: C.inkMid    },
  FAILED:    { bg: C.redBorder,   color: C.redDark   },
  ERROR:     { bg: C.redBorder,   color: C.redDark   },
  WARNING:   { bg: C.amberBorder, color: C.amberDark },
};

function StatusPill({ status }: { status: string }) {
  const sty = STATUS_COLORS[status] ?? { bg: C.line, color: C.inkMid };
  return (
    <span style={{
      fontSize:     T.sz["2xs"],
      fontWeight:   T.wt.bold,
      padding:      "2px 7px",
      borderRadius: R.xs,
      background:   sty.bg,
      color:        sty.color,
    }}>
      {status}
    </span>
  );
}

function fmtRelTime(date: Date): string {
  const diff  = Date.now() - date.getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return "ahora";
  if (mins < 60)  return `hace ${mins}m`;
  if (hours < 24) return `hace ${hours}h`;
  return `hace ${days}d`;
}
