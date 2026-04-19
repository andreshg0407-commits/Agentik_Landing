/**
 * /[orgSlug]/agentik — Agentik · Centro IA
 *
 * The intelligence and automation nerve center of the tenant.
 * Think · Recommend · Execute.
 *
 * Sections:
 *   1. Copiloto Empresarial  — conversational AI input + quick actions
 *   2. Agentes por Rol       — Comercial · Operaciones · RRHH · Gerencia
 *   3. Centro de Automatizaciones — scheduled jobs, run history, impact
 *   4. Bandeja de Acciones   — AI-generated recommended actions
 *   5. Memoria Estratégica   — policies, SOPs, scripts, playbooks
 *   6. Laboratorio IA        — future innovation initiatives
 */

import Link                  from "next/link";
import { requireOrgAccess }  from "@/lib/auth/org-access";
import AgentikConsole        from "./agentik-console";
import ActionCenter          from "./action-center";
import ActionButton          from "../_action-button";
import NotificationBell      from "./notification-bell";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import { Badge, Panel, PanelHeader } from "@/components/shell/primitives";
import { prisma }                    from "@/lib/prisma";
import { getLatestPeriod }           from "@/lib/sales/reports";
import { getSalesAlerts }            from "@/lib/sales/alert-engine";
import type { BusinessAlertRow }     from "@/lib/sales/alert-engine";
import {
  getFpaRevenueForecast,
  getFpaCashFlow,
  getFpaVariance,
  buildFpaRecommendations,
} from "@/lib/finance/fpa-queries";
import type { FpaRecommendation, CashFlowSummary } from "@/lib/finance/fpa-queries";
import type { ActionTask }   from "@/lib/actions/service";
import { ActionTaskStatus }  from "@prisma/client";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AgentikCentroIAPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }              = await params;
  const { user, organization }   = await requireOrgAccess(orgSlug);
  const orgId                    = organization.id;
  const userEmail                = user.email ?? user.id;

  // ── Real intelligence data ─────────────────────────────────────────────────
  // All derived from existing queries — zero new DB tables.
  const latestPeriod = await getLatestPeriod(orgId).catch(() => "");
  const [salesAlerts, fpaCashFlow, fpaForecast, fpaVariance, pendingSagCount, bandejaTasksRaw] = await Promise.all([
    latestPeriod
      ? getSalesAlerts(orgId, latestPeriod).catch(() => [] as BusinessAlertRow[])
      : Promise.resolve([] as BusinessAlertRow[]),
    getFpaCashFlow(orgId).catch(() => null),
    getFpaRevenueForecast(orgId).catch(() => null),
    getFpaVariance(orgId, new Date().getFullYear()).catch(() => ({ rows: [], hasData: false })),
    (prisma as any).sagWriteOperation.count({
      where: { organizationId: orgId, status: "PENDING" },
    }).catch(() => 0) as Promise<number>,
    prisma.actionTask.findMany({
      where: { organizationId: orgId, sourceModule: "bandeja_acciones" },
      orderBy: { createdAt: "desc" },
      take: 30,
    }).catch(() => [] as ActionTask[]),
  ]);

  const fpaRecs: FpaRecommendation[] =
    fpaForecast && fpaCashFlow
      ? buildFpaRecommendations(fpaForecast, fpaVariance as any, fpaCashFlow)
      : [];

  const criticalAlerts = salesAlerts.filter(a => a.severity === "CRITICAL" && a.status === "OPEN");
  const warningAlerts  = salesAlerts.filter(a => a.severity === "WARNING"  && a.status === "OPEN");

  // Build actionType → most-relevant-task map for Bandeja de Acciones
  // Prefer active tasks (PENDING/SCHEDULED/RUNNING) over terminal ones.
  const ACTIVE_STATUSES = new Set<ActionTaskStatus>([
    ActionTaskStatus.PENDING,
    ActionTaskStatus.SCHEDULED,
    ActionTaskStatus.RUNNING,
  ]);
  const bandejaTaskMap = new Map<string, ActionTask>();
  for (const task of bandejaTasksRaw) {
    const existing = bandejaTaskMap.get(task.actionType);
    if (!existing || (ACTIVE_STATUSES.has(task.status) && !ACTIVE_STATUSES.has(existing.status))) {
      bandejaTaskMap.set(task.actionType, task);
    }
  }

  // Pre-build derived sections (server-side, no client state)
  const realActions    = buildRealActions({ orgSlug, criticalAlerts, warningAlerts, fpaCashFlow, fpaRecs, pendingSagCount, latestPeriod })
    .map(action => ({
      ...action,
      relatedTask: action.actionPrefill.actionType
        ? (bandejaTaskMap.get(action.actionPrefill.actionType) ?? undefined)
        : undefined,
    }));
  const knowledgeCards = buildIntelligenceCards(orgSlug, salesAlerts.length, fpaRecs.length, pendingSagCount);
  const labCards       = buildLabCards(fpaRecs, criticalAlerts);

  return (
    <div style={{ fontFamily: T.mono, maxWidth: 1100 }}>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 1 — COPILOTO EMPRESARIAL
      ════════════════════════════════════════════════════════════════════ */}
      <div style={{
        background: "linear-gradient(135deg, #0f0f1a 0%, #1a0533 50%, #0f172a 100%)",
        borderRadius: 12,
        padding: "28px 28px 24px",
        marginBottom: 24,
        border: "1px solid rgba(124,58,237,0.25)",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Ambient glow */}
        <div style={{
          position: "absolute", top: -60, right: -60,
          width: 220, height: 220, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
                color: "#7c3aed", textTransform: "uppercase",
                background: "rgba(124,58,237,0.15)",
                padding: "3px 8px", borderRadius: 4,
                border: "1px solid rgba(124,58,237,0.3)",
              }}>
                Centro IA
              </span>
              <span style={{
                display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                background: "#22c55e",
                boxShadow: "0 0 8px #22c55e",
              }} />
              <span style={{ fontSize: 10, color: "#4ade80", fontWeight: 600 }}>Online</span>
            </div>
            <h1 style={{
              margin: 0, fontSize: 24, fontWeight: 900, color: "#f1f5f9",
              letterSpacing: "-0.02em", lineHeight: 1.1,
            }}>
              Agentik
            </h1>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
              {organization.name} · Copiloto empresarial · IA
            </div>
          </div>

          {/* Quick-jump actions + notification bell */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
            <NotificationBell orgSlug={orgSlug} />
            {[
              { label: "✨ Informes",       href: `/${orgSlug}/reports`         },
              { label: "Cliente 360",        href: `/${orgSlug}/customer-360`    },
              { label: "Alertas",            href: `/${orgSlug}/alerts`          },
              { label: "Workforce",          href: `/${orgSlug}/workforce`       },
              { label: "Torre de Control",   href: `/${orgSlug}/executive`       },
            ].map(a => (
              <Link key={a.href} href={a.href} style={{
                fontSize: 10, fontWeight: 700, padding: "4px 10px",
                borderRadius: 5, textDecoration: "none",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#94a3b8", background: "rgba(255,255,255,0.04)",
                letterSpacing: "0.02em",
              }}>
                {a.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Interactive console */}
        <AgentikConsole organizationId={orgId} orgSlug={orgSlug} />

        {/* Quick navigation shortcuts — bottom row */}
        <div style={{
          display: "flex", gap: 8, flexWrap: "wrap",
          marginTop: 20, paddingTop: 16,
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}>
          <span style={{ fontSize: 10, color: "#475569", fontWeight: 700, alignSelf: "center", marginRight: 4 }}>
            MÓDULOS →
          </span>
          {[
            { icon: "📈", label: "Vendedores",  href: `/${orgSlug}/sales/vendors`  },
            { icon: "🏷",  label: "Líneas",      href: `/${orgSlug}/sales/lines`    },
            { icon: "👥",  label: "Clientes",    href: `/${orgSlug}/sales/customers`},
            { icon: "🏦",  label: "Sucursales",  href: `/${orgSlug}/sales/branches` },
            { icon: "🔄",  label: "Conciliación",href: `/${orgSlug}/reconciliation` },
            { icon: "🧾",  label: "Pipeline",    href: `/${orgSlug}/pipeline`       },
            { icon: "📂",  label: "Documentos",  href: `/${orgSlug}/documents`      },
            { icon: "⚙",  label: "SAG Write",   href: `/${orgSlug}/sag/write`      },
          ].map(a => (
            <Link key={a.href} href={a.href} style={{
              fontSize: 10, color: "#64748b", textDecoration: "none",
              padding: "3px 8px", borderRadius: 4,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              {a.icon} {a.label}
            </Link>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 2 — AGENTES POR ROL
      ════════════════════════════════════════════════════════════════════ */}
      <AISectionHeader
        title="Agentes por Rol"
        subtitle="Automatización especializada por área de negocio"
      />
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 12, marginBottom: 24,
      }}>
        {ROLE_AGENTS.map(agent => (
          <RoleAgentCard key={agent.role} agent={agent} orgSlug={orgSlug} />
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 2b — CENTRO DE ACCIONES
      ════════════════════════════════════════════════════════════════════ */}
      <AISectionHeader
        title="Centro de Acciones"
        subtitle="Acciones trazables · Creadas por IA o manualmente · Phase 1"
        badge="NUEVO"
      />
      <div style={{
        border: `1px solid ${C.line}`, borderRadius: R.lg,
        padding: `${S[4]}px ${S[4]}px ${S[2]}px`, marginBottom: S[6],
        background: C.white,
      }}>
        <ActionCenter orgSlug={orgSlug} userEmail={userEmail} />
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 3 — CENTRO DE AUTOMATIZACIONES
      ════════════════════════════════════════════════════════════════════ */}
      <AISectionHeader
        title="Centro de Automatizaciones"
        subtitle="Trabajos programados · Historial · Impacto"
        badge="SCHEDULED"
      />
      <div style={{
        border: `1px solid ${C.line}`, borderRadius: R.lg, overflow: "hidden", marginBottom: S[6],
      }}>
        {/* Header row */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr 60px",
          background: C.surfaceAlt, borderBottom: `1px solid ${C.line}`,
          padding: `${S[2]}px ${S[4]}px`,
        }}>
          {["Automatización", "Última ejecución", "Próxima ejecución", "Impacto", ""].map(h => (
            <div key={h} style={{ fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkLight, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {h}
            </div>
          ))}
        </div>

        {AUTOMATIONS.map((auto, i) => (
          <div key={auto.id} style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr 60px",
            padding: `${S[3]}px ${S[4]}px`,
            borderBottom: i < AUTOMATIONS.length - 1 ? `1px solid ${C.lineSubtle}` : undefined,
            background: C.white, alignItems: "center",
          }}>
            {/* Name + source */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: S[1] + 2 }}>
                <span style={{
                  display: "inline-block", width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                  background: auto.enabled ? "#22c55e" : C.inkGhost,
                  boxShadow: auto.enabled ? "0 0 6px #22c55e66" : undefined,
                }} />
                <span style={{ fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink }}>{auto.name}</span>
              </div>
              <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2, marginLeft: 13 }}>
                {auto.source}
                {auto.trigger && (
                  <span style={{
                    marginLeft: S[1] + 2, fontSize: T.sz["2xs"], background: C.surfaceAlt, color: C.inkLight,
                    padding: "0 5px", borderRadius: R.xs, fontWeight: T.wt.semibold,
                  }}>
                    {auto.trigger}
                  </span>
                )}
              </div>
            </div>
            {/* Last run */}
            <div style={{ fontSize: T.sz.sm, color: C.inkMid }}>
              <span style={{
                display: "inline-block", width: 6, height: 6, borderRadius: "50%", marginRight: 5,
                background: auto.lastStatus === "ok" ? "#22c55e" : auto.lastStatus === "error" ? C.red : C.amber,
                verticalAlign: "middle",
              }} />
              {auto.lastRun}
            </div>
            {/* Next run */}
            <div style={{ fontSize: T.sz.sm, color: C.inkLight }}>{auto.nextRun}</div>
            {/* Impact */}
            <div>
              <span style={{
                fontSize: T.sz.xs, fontWeight: T.wt.bold, padding: "2px 7px", borderRadius: R.xs,
                background: auto.impactBg, color: auto.impactColor,
              }}>
                {auto.impact}
              </span>
            </div>
            {/* Toggle */}
            <div>
              <Badge variant={auto.enabled ? "success" : "neutral"} size="xs">
                {auto.enabled ? "ON" : "OFF"}
              </Badge>
            </div>
          </div>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 4 — BANDEJA DE ACCIONES SUGERIDAS
      ════════════════════════════════════════════════════════════════════ */}
      <AISectionHeader
        title="Bandeja de Acciones"
        subtitle="Recomendaciones generadas por IA · Requieren decisión humana"
        badge="IA"
      />
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))",
        gap: 12, marginBottom: 24,
      }}>
        {realActions.map(action => (
          <SuggestedActionCard key={action.id} action={action} orgSlug={orgSlug} />
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 5 — MEMORIA ESTRATÉGICA
      ════════════════════════════════════════════════════════════════════ */}
      <AISectionHeader
        title="Memoria Estratégica"
        subtitle="Políticas · SOPs · Scripts · Playbooks · Reglas de negocio"
        badge="KNOWLEDGE"
      />
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 10, marginBottom: 24,
      }}>
        {knowledgeCards.map(card => (
          <KnowledgeCard key={card.id} card={card} />
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 6 — LABORATORIO IA
      ════════════════════════════════════════════════════════════════════ */}
      <AISectionHeader
        title="Laboratorio IA"
        subtitle="Iniciativas de innovación · Próximas capacidades"
        badge="BETA"
      />
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 12, marginBottom: 32,
      }}>
        {labCards.map(init => (
          <LabInitiativeCard key={init.id} item={init} />
        ))}
      </div>

      {/* ── Footer ── */}
      <div style={{ fontSize: T.sz.xs, color: C.inkGhost, textAlign: "right", paddingBottom: S[2] }}>
        Agentik · Centro IA · {organization.name}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  return "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

const MONTH_NAMES_SHORT = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
function fmtPeriodo(p: string): string {
  const m = Number(p.slice(4));
  return `${MONTH_NAMES_SHORT[m] ?? p.slice(4)} ${p.slice(0, 4)}`;
}

// ── Section 2: Role Agents data ────────────────────────────────────────────────

interface RoleAgent {
  role:        string;
  icon:        string;
  description: string;
  status:      "active" | "standby" | "building";
  automations: number;
  pending:     number;
  ctaLabel:    string;
  ctaHref:     (slug: string) => string;
  modules:     string[];
}

const ROLE_AGENTS: RoleAgent[] = [
  {
    role:        "Comercial",
    icon:        "📈",
    description: "Pipeline CRM, cotizaciones, clientes, alertas de ventas y análisis de tendencias.",
    status:      "active",
    automations: 4,
    pending:     2,
    ctaLabel:    "Ir a Control Comercial",
    ctaHref:     s => `/${s}/sales`,
    modules:     ["CRM", "SAG", "XML", "Alertas"],
  },
  {
    role:        "Operaciones",
    icon:        "⚙",
    description: "Importación SAG, conciliación XML, explorador de datos y aprobaciones.",
    status:      "active",
    automations: 3,
    pending:     1,
    ctaLabel:    "Ir a Conciliación",
    ctaHref:     s => `/${s}/reconciliation`,
    modules:     ["SAG", "XML", "Imports"],
  },
  {
    role:        "RRHH · Workforce",
    icon:        "👥",
    description: "Staffing, nómina, turnos y análisis de productividad por vendedor.",
    status:      "standby",
    automations: 1,
    pending:     0,
    ctaLabel:    "Ir a Workforce",
    ctaHref:     s => `/${s}/workforce`,
    modules:     ["RRHH", "Nómina"],
  },
  {
    role:        "Gerencia",
    icon:        "🏛",
    description: "Briefing ejecutivo, KPIs estratégicos, scorecard mensual y proyecciones.",
    status:      "active",
    automations: 2,
    pending:     1,
    ctaLabel:    "Torre de Control",
    ctaHref:     s => `/${s}/executive`,
    modules:     ["KPIs", "Informes", "IA"],
  },
];

const STATUS_STYLE = {
  active:   { bg: C.greenBorder,  color: C.greenDark,  label: "Activo"        },
  standby:  { bg: C.amberLight,   color: C.amberDark,  label: "Standby"       },
  building: { bg: C.brandBorder,  color: C.brandDark,  label: "En desarrollo" },
};

function RoleAgentCard({ agent, orgSlug }: { agent: RoleAgent; orgSlug: string }) {
  const st = STATUS_STYLE[agent.status];
  return (
    <div style={{
      border: `1px solid ${C.line}`, borderRadius: R.lg, padding: `${S[4]}px ${S[5] - 2}px`,
      background: C.white, display: "flex", flexDirection: "column", gap: S[2] + 2,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span style={{ fontSize: 22 }}>{agent.icon}</span>
          <div>
            <div style={{ fontSize: T.sz.md, fontWeight: T.wt.black, color: C.ink }}>{agent.role}</div>
            <Badge variant={
              agent.status === "active"   ? "success"
              : agent.status === "standby" ? "warning"
              :                             "brand"
            } size="xs">
              {st.label}
            </Badge>
          </div>
        </div>
      </div>

      {/* Description */}
      <p style={{ margin: 0, fontSize: T.sz.sm, color: C.inkLight, lineHeight: 1.5 }}>
        {agent.description}
      </p>

      {/* Stats */}
      <div style={{ display: "flex", gap: S[3], borderTop: `1px solid ${C.lineSubtle}`, paddingTop: S[2] }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: T.sz.xl + 2, fontWeight: T.wt.black, color: C.brand }}>{agent.automations}</div>
          <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint, fontWeight: T.wt.bold, textTransform: "uppercase" }}>Autom.</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: T.sz.xl + 2, fontWeight: T.wt.black, color: agent.pending > 0 ? C.amber : C.inkGhost }}>
            {agent.pending}
          </div>
          <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint, fontWeight: T.wt.bold, textTransform: "uppercase" }}>Pendientes</div>
        </div>
        <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", justifyContent: "flex-end" }}>
          {agent.modules.map(m => (
            <span key={m} style={{
              fontSize: T.sz["2xs"], background: C.surfaceAlt, color: C.inkLight,
              padding: "1px 5px", borderRadius: R.xs, fontWeight: T.wt.bold,
            }}>
              {m}
            </span>
          ))}
        </div>
      </div>

      {/* CTA */}
      <Link href={agent.ctaHref(orgSlug)} style={{
        display: "block", textAlign: "center", padding: "7px",
        background: C.ink, color: C.white, borderRadius: R.md,
        fontSize: T.sz.sm, fontWeight: T.wt.bold, textDecoration: "none",
        letterSpacing: "0.03em",
      }}>
        {agent.ctaLabel} →
      </Link>
    </div>
  );
}

// ── Section 3: Automations data ────────────────────────────────────────────────

interface Automation {
  id:          string;
  name:        string;
  source:      string;
  trigger:     string;
  lastRun:     string;
  lastStatus:  "ok" | "error" | "warning";
  nextRun:     string;
  impact:      string;
  impactBg:    string;
  impactColor: string;
  enabled:     boolean;
}

const AUTOMATIONS: Automation[] = [
  {
    id: "pipeline-sync",
    name: "Sincronización CRM → SAG",
    source: "CRM · Cotizaciones aceptadas",
    trigger: "Diario 06:00",
    lastRun: "Hoy 06:01",
    lastStatus: "ok",
    nextRun: "Mañana 06:00",
    impact: "Pipeline comercial",
    impactBg: "#ede9fe", impactColor: "#6d28d9",
    enabled: true,
  },
  {
    id: "cartera-import",
    name: "Importación Cartera SAG",
    source: "SAG · CustomerReceivable",
    trigger: "Diario 07:00",
    lastRun: "Hoy 07:03",
    lastStatus: "ok",
    nextRun: "Mañana 07:00",
    impact: "Cartera vigente",
    impactBg: "#fff7ed", impactColor: "#c2410c",
    enabled: true,
  },
  {
    id: "xml-reconciliation",
    name: "Reconciliación XML",
    source: "XML · SaleRecord",
    trigger: "Cada 4h",
    lastRun: "Hace 1h",
    lastStatus: "ok",
    nextRun: "En 3h",
    impact: "Cobros XML",
    impactBg: "#f0fdf4", impactColor: "#15803d",
    enabled: true,
  },
  {
    id: "alert-engine",
    name: "Motor de Alertas Comerciales",
    source: "SaleRecord · Todos los módulos",
    trigger: "Diario 08:00",
    lastRun: "Hoy 08:02",
    lastStatus: "ok",
    nextRun: "Mañana 08:00",
    impact: "Alertas activas",
    impactBg: "#fef2f2", impactColor: "#dc2626",
    enabled: true,
  },
  {
    id: "sales-pivot",
    name: "Importación Pivot de Ventas",
    source: "SAG · CSV Manual",
    trigger: "Manual",
    lastRun: "Hace 3d",
    lastStatus: "ok",
    nextRun: "Manual",
    impact: "Análisis comercial",
    impactBg: "#eff6ff", impactColor: "#1d4ed8",
    enabled: true,
  },
  {
    id: "customer-scoring",
    name: "Scoring de Clientes IA",
    source: "CustomerProfile · SaleRecord",
    trigger: "Semanal Lunes",
    lastRun: "Lun pasado",
    lastStatus: "warning",
    nextRun: "Próx. Lunes",
    impact: "Churn · Salud",
    impactBg: "#fef9c3", impactColor: "#92400e",
    enabled: false,
  },
];

// ── Section 4: Real prioritized actions ───────────────────────────────────────
//
// Replaces hardcoded mock cards.
// Sources: BusinessAlert (OPEN), CustomerReceivable (overdue), SagWriteOperation
// (PENDING), FpaRecommendations (forecast + cashflow + variance).
// Falls back to an informational card if no live signals are present.

interface SuggestedAction {
  id:            string;
  severity:      "HIGH" | "MEDIUM" | "INFO";
  icon:          string;
  title:         string;
  description:   string;
  ctas:          Array<{ label: string; href: string; primary?: boolean }>;
  source:        string;
  actionPrefill: import("../_action-button").ActionPrefill;
  relatedTask?:  Pick<ActionTask, "id" | "status" | "assignedTo" | "createdAt" | "completedAt">;
}

interface BuildRealActionsOpts {
  orgSlug:         string;
  criticalAlerts:  BusinessAlertRow[];
  warningAlerts:   BusinessAlertRow[];
  fpaCashFlow:     CashFlowSummary | null;
  fpaRecs:         FpaRecommendation[];
  pendingSagCount: number;
  latestPeriod:    string;
}

function buildRealActions({
  orgSlug, criticalAlerts, warningAlerts, fpaCashFlow, fpaRecs, pendingSagCount, latestPeriod,
}: BuildRealActionsOpts): SuggestedAction[] {
  const actions: SuggestedAction[] = [];

  // 1. Critical cashflow overdue — highest urgency
  if (fpaCashFlow?.hasData && fpaCashFlow.totalOverdue > 0) {
    const cashRec = fpaRecs.find(r => r.category === "cashflow");
    actions.push({
      id:       "overdue-cartera",
      severity: "HIGH",
      icon:     "💸",
      title:    `Cartera vencida · ${fmtCOP(fpaCashFlow.totalOverdue)}`,
      description: cashRec?.body
        ?? `Saldo vencido activo de ${fmtCOP(fpaCashFlow.totalOverdue)}. Revisar antigüedad y priorizar cobro.`,
      source: "SAG · CustomerReceivable · FP&A",
      ctas: [
        { label: "Ver Cliente 360",  href: `/${orgSlug}/customer-360`, primary: true },
        { label: "Torre de Control", href: `/${orgSlug}/executive`                   },
      ],
      actionPrefill: {
        actionType:   "CREAR_ACCION_COBRANZA",
        targetType:   "customer",
        sourceModule: "bandeja_acciones",
        title:        `Cobro urgente — cartera vencida ${fmtCOP(fpaCashFlow.totalOverdue)}`,
        description:  cashRec?.body ?? `Saldo vencido de ${fmtCOP(fpaCashFlow.totalOverdue)} requiere acción de cobro.`,
        priority:     "URGENT",
      },
    });
  }

  // 2. Critical business alerts (max 2)
  for (const alert of criticalAlerts.slice(0, 2)) {
    actions.push({
      id:          `alert-crit-${alert.id}`,
      severity:    "HIGH",
      icon:        "⚠",
      title:       alert.title,
      description: alert.message,
      source:      `Alertas comerciales · ${alert.entityLabel ?? alert.entityType}`,
      ctas: [
        { label: "Ver Alertas",       href: `/${orgSlug}/alerts`, primary: true },
        { label: "Control Comercial", href: `/${orgSlug}/sales`                },
      ],
      actionPrefill: {
        actionType:   "ESCALAR_A_GERENCIA",
        sourceModule: "bandeja_acciones",
        title:        `Escalar: ${alert.title}`,
        description:  alert.message,
        priority:     "URGENT",
      },
    });
  }

  // 3. Warning alerts (max 1)
  for (const alert of warningAlerts.slice(0, 1)) {
    actions.push({
      id:          `alert-warn-${alert.id}`,
      severity:    "MEDIUM",
      icon:        "📉",
      title:       alert.title,
      description: alert.message,
      source:      `Alertas comerciales · ${alert.entityLabel ?? alert.entityType}`,
      ctas: [
        { label: "Ver Alertas",       href: `/${orgSlug}/alerts`, primary: true },
        { label: "Control Comercial", href: `/${orgSlug}/sales`                },
      ],
      actionPrefill: {
        actionType:   "CREAR_TAREA_COMERCIAL",
        sourceModule: "bandeja_acciones",
        title:        `Atender: ${alert.title}`,
        description:  alert.message,
        priority:     "HIGH",
      },
    });
  }

  // 4. Pending SAG approvals
  if (pendingSagCount > 0) {
    actions.push({
      id:       "sag-pending-approvals",
      severity: "MEDIUM",
      icon:     "✍",
      title:    `${pendingSagCount} aprobación${pendingSagCount > 1 ? "es" : ""} SAG pendiente${pendingSagCount > 1 ? "s" : ""}`,
      description: "Operaciones SAG en cola esperando revisión manual. Aprobar antes del cierre del día.",
      source:   "SAG · Write Queue",
      ctas: [
        { label: "Revisar aprobaciones", href: `/${orgSlug}/sag/write`, primary: true },
      ],
      actionPrefill: {
        actionType:   "CREAR_TAREA_COMERCIAL",
        sourceModule: "bandeja_acciones",
        title:        `Aprobar ${pendingSagCount} operación${pendingSagCount > 1 ? "es" : ""} SAG`,
        description:  `${pendingSagCount} operaciones en cola requieren aprobación manual.`,
        priority:     "HIGH",
      },
    });
  }

  // 5. FPA recommendation (critical or warning, cashflow handled above — max 1)
  const fpaHighRec = fpaRecs.find(r =>
    (r.severity === "critical" || r.severity === "warning") && r.category !== "cashflow",
  );
  if (fpaHighRec) {
    actions.push({
      id:       `fpa-${fpaHighRec.id}`,
      severity: fpaHighRec.severity === "critical" ? "HIGH" : "MEDIUM",
      icon:     fpaHighRec.category === "growth" ? "📈" : fpaHighRec.category === "budget" ? "📊" : "💡",
      title:    fpaHighRec.title,
      description: fpaHighRec.body,
      source:   `FP&A · ${fpaHighRec.category === "growth" ? "Crecimiento" : fpaHighRec.category === "budget" ? "Presupuesto" : "IA"}`,
      ctas: [
        { label: "Ver Finanzas",     href: `/${orgSlug}/finance`,   primary: true },
        { label: "Torre de Control", href: `/${orgSlug}/executive`               },
      ],
      actionPrefill: {
        actionType:   "GENERAR_INFORME",
        sourceModule: "bandeja_acciones",
        title:        fpaHighRec.title,
        description:  fpaHighRec.body,
        priority:     fpaHighRec.severity === "critical" ? "URGENT" : "HIGH",
      },
    });
  }

  // 6. Fallback — no live signals
  if (actions.length === 0) {
    actions.push({
      id:       "period-available",
      severity: "INFO",
      icon:     "📊",
      title:    latestPeriod
        ? `Período ${fmtPeriodo(latestPeriod)} disponible para análisis`
        : "Centro de inteligencia activo",
      description: latestPeriod
        ? "Los datos del período están cargados. Genera el informe ejecutivo o consulta el copiloto."
        : "No se detectaron señales de acción urgente. El sistema opera con normalidad.",
      source: "Agentik · Monitoreo continuo",
      ctas: [
        { label: "✨ Generar informe", href: `/${orgSlug}/reports`,  primary: true },
        { label: "Torre de Control",  href: `/${orgSlug}/executive`              },
      ],
      actionPrefill: {
        actionType:   "GENERAR_INFORME",
        sourceModule: "bandeja_acciones",
        title:        "Generar informe ejecutivo del período",
        description:  "Datos disponibles. Informe ejecutivo listo para generar.",
        priority:     "MEDIUM",
      },
    });
  }

  return actions.slice(0, 6);
}

const SEVERITY_STYLE = {
  HIGH:   { border: C.redBorder,   badge: { bg: C.redLight,   color: C.red,      label: "URGENTE"  } },
  MEDIUM: { border: C.amberBorder, badge: { bg: C.amberLight, color: C.amberDark, label: "ATENCIÓN" } },
  INFO:   { border: C.blueBorder,  badge: { bg: C.blueLight,  color: C.blue,      label: "INFO"     } },
};

const TASK_STATUS_STYLE: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  PENDING:   { label: "Pendiente",  bg: "#fef9c3", color: "#92400e", dot: "#f59e0b" },
  SCHEDULED: { label: "Programada", bg: "#dbeafe", color: "#1d4ed8", dot: "#3b82f6" },
  RUNNING:   { label: "En curso",   bg: "#ede9fe", color: "#6d28d9", dot: "#7c3aed" },
  COMPLETED: { label: "Completada", bg: "#dcfce7", color: "#15803d", dot: "#22c55e" },
  FAILED:    { label: "Fallida",    bg: "#fee2e2", color: "#b91c1c", dot: "#ef4444" },
  CANCELED:  { label: "Cancelada",  bg: "#f3f4f6", color: "#6b7280", dot: "#9ca3af" },
};

function SuggestedActionCard({ action, orgSlug }: { action: SuggestedAction; orgSlug: string }) {
  const sv = SEVERITY_STYLE[action.severity];
  const task = action.relatedTask;
  const tStyle = task ? (TASK_STATUS_STYLE[task.status] ?? TASK_STATUS_STYLE.PENDING) : null;
  return (
    <div style={{
      border: `1px solid ${sv.border}`,
      borderTop: `3px solid ${sv.border}`,
      borderRadius: R.lg, padding: `${S[3] + 2}px ${S[4]}px`,
      background: C.white, display: "flex", flexDirection: "column", gap: S[2] + 2,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>{action.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[1] + 2, marginBottom: S[1] }}>
            <Badge variant={
              action.severity === "HIGH"   ? "danger"
              : action.severity === "MEDIUM" ? "warning"
              :                               "info"
            } size="xs">
              {sv.badge.label}
            </Badge>
            <span style={{ fontSize: T.sz["2xs"], color: C.inkFaint, fontWeight: T.wt.semibold }}>{action.source}</span>
          </div>
          <div style={{ fontSize: T.sz.base, fontWeight: T.wt.black, color: C.ink, lineHeight: 1.3 }}>
            {action.title}
          </div>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: T.sz.sm, color: C.inkLight, lineHeight: 1.5 }}>
        {action.description}
      </p>
      <div style={{ display: "flex", gap: S[1] + 2, flexWrap: "wrap" }}>
        {action.ctas.map(cta => (
          <Link key={cta.href} href={cta.href} style={{
            fontSize: T.sz.xs, fontWeight: T.wt.bold, padding: "5px 11px",
            borderRadius: R.md, textDecoration: "none",
            background: cta.primary ? C.ink : C.white,
            color: cta.primary ? C.white : C.inkMid,
            border: cta.primary ? `1px solid ${C.ink}` : `1px solid ${C.line}`,
          }}>
            {cta.label} →
          </Link>
        ))}
      </div>
      {/* ── Agentik Action Layer — three quick-action CTAs ── */}
      <div style={{
        display: "flex", gap: 5, flexWrap: "wrap",
        paddingTop: S[2], borderTop: `1px solid ${C.lineSubtle}`,
      }}>
        <ActionButton
          orgSlug={orgSlug}
          label="Convertir en acción"
          icon="🎯"
          variant="purple"
          size="xs"
          prefill={action.actionPrefill}
        />
        <ActionButton
          orgSlug={orgSlug}
          label="Asignar responsable"
          icon="👤"
          variant="ghost"
          size="xs"
          prefill={{
            ...action.actionPrefill,
            title: `[Asignar] ${action.actionPrefill.title ?? action.title}`,
          }}
        />
        <ActionButton
          orgSlug={orgSlug}
          label="Programar vencimiento"
          icon="📅"
          variant="ghost"
          size="xs"
          prefill={{
            ...action.actionPrefill,
            title: `[Programar] ${action.actionPrefill.title ?? action.title}`,
          }}
        />
      </div>

      {/* ── Related ActionTask status strip ── */}
      {task && tStyle && (
        <div style={{
          paddingTop: S[2], borderTop: `1px solid ${C.lineSubtle}`,
          display: "flex", alignItems: "center", gap: S[2], flexWrap: "wrap",
        }}>
          <span style={{
            display: "inline-block", width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: tStyle.dot,
            boxShadow: task.status === "RUNNING" ? `0 0 6px ${tStyle.dot}66` : undefined,
          }} />
          <span style={{
            fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
            padding: "2px 6px", borderRadius: R.xs,
            background: tStyle.bg, color: tStyle.color,
          }}>
            {tStyle.label}
          </span>
          {task.assignedTo && (
            <span style={{ fontSize: T.sz["2xs"], color: C.inkLight }}>
              → {task.assignedTo}
            </span>
          )}
          <Link href={`/${orgSlug}/agentik`} style={{
            fontSize: T.sz["2xs"], color: C.brand, fontWeight: T.wt.semibold,
            textDecoration: "none", marginLeft: "auto",
          }}>
            Ver en Centro de Acciones →
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Section 5: Strategic Memory — hybrid real + static ─────────────────────────
//
// First 3 cards show live counts from real data (alerts, FPA recs, SAG queue).
// Remaining cards are static knowledge-base links (no Knowledge DB table yet).

interface KnCard {
  id:       string;
  icon:     string;
  category: string;
  title:    string;
  items:    number;
  href:     string;
  accent?:  boolean;
}

function buildIntelligenceCards(
  orgSlug:         string,
  alertCount:      number,
  fpaRecCount:     number,
  sagPendingCount: number,
): KnCard[] {
  return [
    // Live intelligence cards
    {
      id:       "live-alerts",
      icon:     alertCount > 0 ? "⚠" : "✅",
      category: "Live · Alertas",
      title:    alertCount > 0
        ? `${alertCount} alerta${alertCount > 1 ? "s" : ""} activa${alertCount > 1 ? "s" : ""}`
        : "Sin alertas activas",
      items:    alertCount,
      href:     `/${orgSlug}/alerts`,
      accent:   alertCount > 0,
    },
    {
      id:       "live-fpa",
      icon:     fpaRecCount > 0 ? "💡" : "📊",
      category: "Live · FP&A",
      title:    fpaRecCount > 0
        ? `${fpaRecCount} recomendación${fpaRecCount > 1 ? "es" : ""} financiera${fpaRecCount > 1 ? "s" : ""}`
        : "FP&A al día",
      items:    fpaRecCount,
      href:     `/${orgSlug}/finance`,
      accent:   fpaRecCount > 0,
    },
    {
      id:       "live-sag",
      icon:     sagPendingCount > 0 ? "✍" : "☑",
      category: "Live · SAG",
      title:    sagPendingCount > 0
        ? `${sagPendingCount} aprobación${sagPendingCount > 1 ? "es" : ""} pendiente${sagPendingCount > 1 ? "s" : ""}`
        : "Aprobaciones SAG al día",
      items:    sagPendingCount,
      href:     `/${orgSlug}/sag/write`,
      accent:   sagPendingCount > 0,
    },
    // Static knowledge-base links (no Knowledge table yet)
    { id: "cobranza",   icon: "💰", category: "Reglas",  title: "Política de Cobranza",  items: 4,  href: `/${orgSlug}/knowledge` },
    { id: "ventas",     icon: "📝", category: "Scripts", title: "Scripts de Ventas",     items: 6,  href: `/${orgSlug}/knowledge` },
    { id: "cierre",     icon: "📅", category: "SOP",     title: "Cierre Mensual",        items: 3,  href: `/${orgSlug}/knowledge` },
    { id: "sag-sop",    icon: "⚙",  category: "SOP",     title: "SOP Integración SAG",   items: 2,  href: `/${orgSlug}/knowledge` },
    { id: "reports-ia", icon: "✨", category: "IA",      title: "Prompts de Informes",   items: 12, href: `/${orgSlug}/knowledge` },
  ];
}

function KnowledgeCard({ card }: { card: KnCard }) {
  return (
    <Link href={card.href} style={{ textDecoration: "none" }}>
      <div style={{
        border: `1px solid ${card.accent ? C.brandBorder : C.line}`,
        borderRadius: R.lg, padding: `${S[3]}px ${S[3] + 2}px`,
        background: card.accent ? C.brandLight : C.white,
        cursor: "pointer", transition: "all 0.15s",
        height: "100%", display: "flex", flexDirection: "column", gap: S[1] + 2,
      }}>
        <div style={{ fontSize: 18 }}>{card.icon}</div>
        <div style={{ fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: card.accent ? C.brand : C.inkFaint, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {card.category}
        </div>
        <div style={{ fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink, lineHeight: 1.3 }}>
          {card.title}
        </div>
        <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: "auto" }}>
          {card.items} artículo{card.items !== 1 ? "s" : ""} →
        </div>
      </div>
    </Link>
  );
}

// ── Section 6: Lab Initiatives — real-signal driven ────────────────────────────
//
// Card statuses and descriptions are enriched by live FPA recommendations and
// critical alerts. Items with matching signals are promoted from "concept" →
// "building" → "active". Descriptions cite real metrics when available.

interface LabItem {
  id:          string;
  icon:        string;
  title:       string;
  description: string;
  status:      "concept" | "building" | "active" | "research";
  area:        string;
}

function buildLabCards(
  fpaRecs:        FpaRecommendation[],
  criticalAlerts: BusinessAlertRow[],
): LabItem[] {
  const hasCashRisk    = fpaRecs.some(r => r.category === "cashflow" && (r.severity === "critical" || r.severity === "warning"));
  const hasGrowthSig   = fpaRecs.some(r => r.category === "growth");
  const hasBudgetSig   = fpaRecs.some(r => r.category === "budget");
  const hasAlertVolume = criticalAlerts.length > 0;

  const cashRec   = fpaRecs.find(r => r.category === "cashflow");
  const growthRec = fpaRecs.find(r => r.category === "growth");
  const budgetRec = fpaRecs.find(r => r.category === "budget");

  return [
    {
      id:    "anomaly",
      icon:  "🕵",
      title: "Detección de Anomalías",
      description: hasAlertVolume
        ? `${criticalAlerts.length} alerta${criticalAlerts.length > 1 ? "s" : ""} crítica${criticalAlerts.length > 1 ? "s" : ""} activa${criticalAlerts.length > 1 ? "s" : ""} hoy — señal real para el motor de detección automática.`
        : "Alertas automáticas ante caídas inusuales de ventas, comportamiento atípico de clientes o descuadres de cartera.",
      status: hasAlertVolume ? "building" : "research",
      area:   "Riesgo · IA",
    },
    {
      id:    "cashflow-intelligence",
      icon:  "💸",
      title: "Inteligencia de Cartera",
      description: hasCashRisk
        ? (cashRec?.body ?? `Riesgo de cartera detectado. Scoring de riesgo por cliente en construcción.`)
        : "Scoring de riesgo por cliente basado en antigüedad, historial y comportamiento de pago.",
      status: hasCashRisk ? "active" : "building",
      area:   "Finanzas · IA",
    },
    {
      id:    "demand-forecast",
      icon:  "🔮",
      title: "Forecasting de Demanda",
      description: hasGrowthSig
        ? (growthRec?.body ?? "Variación YoY detectada en el período activo. Modelo de proyección validado por señal real.")
        : "Modelo ML para proyectar demanda por línea de producto, sucursal y período con base en historial SAG.",
      status: hasGrowthSig ? "building" : "research",
      area:   "Ventas · IA",
    },
    {
      id:    "budget-optimization",
      icon:  "📊",
      title: "Optimización Presupuestal",
      description: hasBudgetSig
        ? (budgetRec?.body ?? "Varianza presupuestal detectada. Oportunidad de reasignación identificada.")
        : "Análisis de varianza y recomendaciones de reasignación presupuestal por dimensión.",
      status: hasBudgetSig ? "building" : "concept",
      area:   "FP&A · IA",
    },
    {
      id:    "whatsapp",
      icon:  "💬",
      title: "Automatización WhatsApp",
      description: "Recordatorios de cartera, confirmaciones de pedido y alertas comerciales por WhatsApp Business API.",
      status: "building",
      area:   "Comunicaciones",
    },
    {
      id:    "gocen",
      icon:  "🏛",
      title: "Integración GOCEN",
      description: "Consulta automática de obligaciones fiscales y comerciales ante GOCEN para clientes en onboarding.",
      status: "concept",
      area:   "Compliance",
    },
  ];
}

const LAB_STATUS_STYLE = {
  active:   { bg: C.greenBorder, color: C.greenDark, label: "Activo"       },
  building: { bg: C.blueBorder,  color: C.blueDark,  label: "Construyendo" },
  research: { bg: C.brandBorder, color: C.brandDark, label: "Investigando" },
  concept:  { bg: C.surfaceAlt,  color: C.inkLight,  label: "Concepto"     },
};

function LabInitiativeCard({ item }: { item: LabItem }) {
  const st = LAB_STATUS_STYLE[item.status];
  return (
    <div style={{
      border: `1px solid ${C.line}`, borderRadius: R.lg, padding: `${S[4]}px ${S[5] - 2}px`,
      background: C.white, display: "flex", flexDirection: "column", gap: S[2],
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: 24 }}>{item.icon}</span>
        <Badge variant={
          item.status === "active"   ? "success"
          : item.status === "building" ? "info"
          : item.status === "research" ? "brand"
          :                             "neutral"
        } size="xs">
          {st.label}
        </Badge>
      </div>
      <div>
        <div style={{ fontSize: T.sz.md, fontWeight: T.wt.black, color: C.ink, marginBottom: 2 }}>{item.title}</div>
        <span style={{ fontSize: T.sz["2xs"], background: C.surfaceAlt, color: C.inkLight, padding: "1px 6px", borderRadius: R.xs, fontWeight: T.wt.bold }}>
          {item.area}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: T.sz.sm, color: C.inkLight, lineHeight: 1.5 }}>
        {item.description}
      </p>
    </div>
  );
}

// ── Shared UI ──────────────────────────────────────────────────────────────────

function AISectionHeader({ title, subtitle, badge }: { title: string; subtitle?: string; badge?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[3] }}>
      <h2 style={{
        margin:        0,
        fontSize:      T.sz.md,
        fontWeight:    T.wt.black,
        color:         C.ink,
        letterSpacing: "-0.01em",
        fontFamily:    T.mono,
      }}>
        {title}
      </h2>
      {badge && (
        <span style={{
          fontSize:      T.sz["2xs"],
          background:    C.brandBorder,
          color:         C.brandDark,
          padding:       "2px 7px",
          borderRadius:  R.xs,
          fontWeight:    T.wt.black,
          letterSpacing: "0.06em",
          textTransform: "uppercase" as const,
        }}>
          {badge}
        </span>
      )}
      {subtitle && (
        <span style={{ fontSize: T.sz.sm, color: C.inkFaint, marginLeft: S[1] }}>
          {subtitle}
        </span>
      )}
      <div style={{ flex: 1, borderBottom: `1px solid ${C.line}`, marginLeft: S[1] + 2 }} />
    </div>
  );
}
