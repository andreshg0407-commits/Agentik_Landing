/**
 * components/layout/right-ops-rail.tsx
 *
 * Desktop-only Right Operations Rail — Agentik Enterprise shell.
 *
 * Shows compact live summaries of the four daily-ops dimensions:
 *   1. Alertas críticas  — real count from BusinessAlert (OPEN + CRITICAL)
 *   2. Aprobaciones SAG  — real count from SagWriteOperation (PENDING)
 *   3. Tareas            — ActionTask count (PENDING | IN_PROGRESS)
 *   4. Copiloto IA       — static quick-link to Agentik; no real AI call
 *
 * Hidden on mobile via .org-rail CSS class (injected in layout.tsx).
 * All queries use .catch(() => fallback) so a DB failure never breaks the shell.
 *
 * Tokens: uses lib/ui/tokens for visual consistency.
 */

import Link        from "next/link";
import type { Role } from "@prisma/client";
import { prisma }  from "@/lib/prisma";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import { isInternalRole }  from "@/lib/auth/module-access";
import { getModuleContext } from "@/lib/agentik/copilot-context";
import { CopilotRail }     from "@/components/layout/copilot-rail";

// ── Types ──────────────────────────────────────────────────────────────────────

interface RightOpsRailProps {
  orgSlug:  string;
  orgId:    string;
  pathname: string;
  role:     Role;
}

// ── Rail ───────────────────────────────────────────────────────────────────────

export default async function RightOpsRail({ orgSlug, orgId, pathname, role }: RightOpsRailProps) {
  const isInternal    = isInternalRole(role);
  const moduleContext = getModuleContext(orgSlug, pathname);

  const baseQueries = [
    prisma.businessAlert.count({
      where: { organizationId: orgId, severity: "CRITICAL", status: "OPEN" },
    }).catch(() => 0),

    (prisma as any).actionTask.count({
      where: { organizationId: orgId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    }).catch(() => 0) as Promise<number>,
  ] as const;

  const [criticalAlerts, openTasks, pendingApprovals] = isInternal
    ? await Promise.all([
        ...baseQueries,
        (prisma as any).sagWriteOperation.count({
          where: { organizationId: orgId, status: "PENDING" },
        }).catch(() => 0) as Promise<number>,
      ])
    : [...(await Promise.all(baseQueries)), 0];

  const hasAlerts    = criticalAlerts   > 0;
  const hasApprovals = pendingApprovals > 0;
  const hasTasks     = openTasks        > 0;

  return (
    <aside style={{
      padding:        `0 ${S[3]}px ${S[4]}px`,
      fontFamily:     T.mono,
      fontSize:       T.sz.xs,
      display:        "flex",
      flexDirection:  "column",
      gap:            0,
      overflowY:      "auto",
      background:     "var(--ag-surface, #F7F9FF)",
      minHeight:      "100vh",
    }}>

      {/* ── Top brand accent strip — intelligence rail signal ── */}
      <div style={{
        height:      3,
        background:  "var(--ag-grad-brand, linear-gradient(90deg,#004AAD,#1E63D8,#4F8FE8))",
        marginLeft:  -S[3],
        marginRight: -S[3],
        marginBottom: S[4],
        flexShrink:  0,
      }} />

      {/* ── Rail header — card ── */}
      <div style={{
        background:   "var(--ag-grad-card, linear-gradient(135deg,#fff,#F7F9FF))",
        border:       `1px solid var(--ag-line, rgba(0,74,173,.12))`,
        borderRadius: R.card,
        padding:      `${S[2] + 4}px ${S[3]}px`,
        marginBottom: S[3],
      }}>
        <div style={{
          display:     "flex",
          alignItems:  "center",
          gap:         S[1],
          marginBottom: S[1],
        }}>
          {/* Live signal dot */}
          <div style={{
            width:        5,
            height:       5,
            borderRadius: "50%",
            background:   "rgba(34,197,94,.80)",
            boxShadow:    "0 0 4px rgba(34,197,94,.50)",
            flexShrink:   0,
          }} />
          <div style={{
            fontFamily:    T.sans,
            fontSize:      T.sz["2xs"],
            fontWeight:    T.wt.bold,
            color:         C.inkMid,
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
          }}>
            Ops · Hoy
          </div>
        </div>
        <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint, paddingLeft: S[1] + 5 }}>
          Centro operativo diario
        </div>
      </div>

      {/* ── 1. Alertas críticas ── */}
      <RailSection
        icon="⚠"
        title="Alertas"
        count={criticalAlerts}
        countColor={hasAlerts ? C.red    : C.green}
        countLabel={hasAlerts ? `${criticalAlerts} crítica${criticalAlerts > 1 ? "s" : ""}` : "Sin alertas"}
        href={`/${orgSlug}/alerts`}
        linkLabel="Ver alertas →"
        urgent={hasAlerts}
      >
        {hasAlerts ? (
          <div style={{ fontSize: T.sz["2xs"], color: C.redDark, marginTop: S[1], lineHeight: 1.4 }}>
            Atención requerida. Revisar antes de cerrar el día.
          </div>
        ) : (
          <div style={{ fontSize: T.sz["2xs"], color: C.green, marginTop: S[1] }}>
            Operación normal ✓
          </div>
        )}
      </RailSection>

      {/* ── 2. Tareas activas ── */}
      <RailSection
        icon="✅"
        title="Tareas activas"
        count={openTasks}
        countColor={hasTasks ? C.blueDark : C.inkLight}
        countLabel={hasTasks ? `${openTasks} activa${openTasks > 1 ? "s" : ""}` : "Sin tareas"}
        href={isInternal ? `/${orgSlug}/agentik` : `/${orgSlug}/reports`}
        linkLabel={isInternal ? "Centro de acciones →" : "Informes →"}
        urgent={false}
      >
        <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: S[1], lineHeight: 1.4 }}>
          {hasTasks ? "Tareas pendientes o en progreso." : "No hay tareas activas."}
        </div>
      </RailSection>

      {/* ── Context bridge — connects operational signals to the intelligence layer ── */}
      {/* Shows current module context + operational state tag — creates the
          "operational memory" feeling without fake data or logic changes.    */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        `3px ${S[2]}px`,
        marginBottom:   S[2],
      }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          color:         C.inkFaint,
          letterSpacing: "0.04em",
        }}>
          {moduleContext.moduleLabel}
        </span>
        <span className={
          hasAlerts ? "ag-intel-tag ag-intel-tag--critical"
          : hasTasks  ? "ag-intel-tag"
          :             "ag-intel-tag ag-intel-tag--ok"
        }>
          {hasAlerts ? "señales activas" : hasTasks ? "en seguimiento" : "sin urgencias"}
        </span>
      </div>

      {/* ── 3. Copilot contextual — todos los roles ── */}
      {/* El copilot es una capa transversal, no un módulo separado.
          Vive aquí como AI Dock permanente, contextual al módulo actual. */}
      <div className="ag-copilot-surface" style={{ marginBottom: S[2] }}>
        <CopilotRail orgSlug={orgSlug} moduleContext={moduleContext} />
      </div>

      {/* ── 4. Aprobaciones SAG — internal only ── */}
      {isInternal && (
        <RailSection
          icon="✍"
          title="Aprobaciones SAG"
          count={pendingApprovals}
          countColor={hasApprovals ? C.amber  : C.inkLight}
          countLabel={hasApprovals ? `${pendingApprovals} pendiente${pendingApprovals > 1 ? "s" : ""}` : "Al día"}
          href={`/${orgSlug}/sag/write`}
          linkLabel="Revisar →"
          urgent={hasApprovals}
        >
          {hasApprovals ? (
            <div style={{ fontSize: T.sz["2xs"], color: C.amberDark, marginTop: S[1], lineHeight: 1.4 }}>
              Operaciones esperando aprobación manual.
            </div>
          ) : (
            <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: S[1] }}>
              Sin aprobaciones pendientes.
            </div>
          )}
        </RailSection>
      )}

      {/* ── Footer — operational memory indicator ── */}
      <div style={{
        marginTop:    "auto",
        background:   "var(--ag-brand-50, #EEF5FF)",
        border:       `1px solid var(--ag-line, rgba(0,74,173,.10))`,
        borderRadius: R.card,
        padding:      `${S[1] + 2}px ${S[3]}px`,
        textAlign:    "center" as const,
        fontFamily:   T.mono,
      }}>
        <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint, letterSpacing: "0.04em" }}>
          Agentik Enterprise
        </div>
        <div style={{ fontSize: T.sz["2xs"], color: C.inkGhost, letterSpacing: "0.04em", marginTop: 1 }}>
          {moduleContext.moduleLabel}
        </div>
      </div>

    </aside>
  );
}

// ── RailSection ───────────────────────────────────────────────────────────────

function RailSection({
  icon,
  title,
  count,
  countColor,
  countLabel,
  href,
  linkLabel,
  urgent,
  children,
}: {
  icon:        string;
  title:       string;
  count:       number;
  countColor:  string;
  countLabel:  string;
  href:        string;
  linkLabel:   string;
  urgent:      boolean;
  children:    React.ReactNode;
}) {
  // Derive card color from urgency + countColor
  const cardBg = !urgent ? C.white
    : countColor === C.red   ? C.redLight
    : countColor === C.amber ? C.amberLight
    : C.brandLight;
  const cardBorder = !urgent ? C.line
    : countColor === C.red   ? C.redBorder
    : countColor === C.amber ? C.amberBorder
    : C.brandBorder;

  return (
    <div style={{
      background:   cardBg,
      border:       `1px solid ${cardBorder}`,
      borderRadius: R.card,
      padding:      S[3],
      marginBottom: S[2],
      boxShadow:    "var(--ag-shadow-sm, 0 1px 4px rgba(0,74,173,.06))",
    }}>
      {/* Card header row */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   S[1],
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
          <span style={{ fontSize: T.sz.sm }}>{icon}</span>
          <span style={{
            fontFamily:    T.sans,
            fontSize:      T.sz["2xs"],
            fontWeight:    T.wt.bold,
            color:         C.inkMid,
            textTransform: "uppercase" as const,
            letterSpacing: "0.05em",
          }}>
            {title}
          </span>
        </div>
        {/* Count badge */}
        <span style={{
          fontSize:     T.sz["2xs"],
          fontWeight:   T.wt.bold,
          color:        countColor,
          background:   urgent ? `${countColor}22` : C.surfaceAlt,
          border:       urgent ? `1px solid ${countColor}55` : `1px solid ${C.line}`,
          borderRadius: R.pill,
          padding:      "2px 8px",
          minWidth:     20,
          textAlign:    "center" as const,
        }}>
          {count}
        </span>
      </div>

      {/* Count label */}
      <div style={{
        fontSize:     T.sz["2xs"],
        fontWeight:   T.wt.semibold,
        color:        countColor,
        marginBottom: S[1] - 1,
      }}>
        {countLabel}
      </div>

      {/* Slot content */}
      {children}

      {/* CTA link */}
      <Link href={href} style={{
        display:        "inline-block",
        marginTop:      S[1] + 2,
        fontSize:       T.sz["2xs"],
        color:          urgent ? countColor : C.blueDark,
        fontWeight:     T.wt.bold,
        textDecoration: "none",
      }}>
        {linkLabel}
      </Link>
    </div>
  );
}
