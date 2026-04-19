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
import { prisma }  from "@/lib/prisma";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import { getModuleContext } from "@/lib/agentik/copilot-context";
import { CopilotRail }     from "@/components/layout/copilot-rail";

// ── Types ──────────────────────────────────────────────────────────────────────

interface RightOpsRailProps {
  orgSlug:  string;
  orgId:    string;
  pathname: string;
}

// ── Rail ───────────────────────────────────────────────────────────────────────

export default async function RightOpsRail({ orgSlug, orgId, pathname }: RightOpsRailProps) {
  const moduleContext = getModuleContext(orgSlug, pathname);
  const [criticalAlerts, pendingApprovals, openTasks] = await Promise.all([
    prisma.businessAlert.count({
      where: { organizationId: orgId, severity: "CRITICAL", status: "OPEN" },
    }).catch(() => 0),

    (prisma as any).sagWriteOperation.count({
      where: { organizationId: orgId, status: "PENDING" },
    }).catch(() => 0) as Promise<number>,

    (prisma as any).actionTask.count({
      where: { organizationId: orgId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    }).catch(() => 0) as Promise<number>,
  ]);

  const hasAlerts    = criticalAlerts   > 0;
  const hasApprovals = pendingApprovals > 0;
  const hasTasks     = openTasks        > 0;

  return (
    <aside style={{
      padding:        `${S[4]}px ${S[3]}px`,
      fontFamily:     T.mono,
      fontSize:       T.sz.xs,
      display:        "flex",
      flexDirection:  "column",
      gap:            0,
      overflowY:      "auto",
      background:     C.sidebarBg,
      minHeight:      "100vh",
    }}>

      {/* ── Rail header — card ── */}
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
          letterSpacing: "0.08em",
          textTransform: "uppercase" as const,
          marginBottom:  S[1],
        }}>
          Ops · Hoy
        </div>
        <div style={{ fontSize: T.sz["2xs"], color: C.inkGhost }}>
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

      {/* ── 2. Aprobaciones SAG ── */}
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

      {/* ── 3. Tareas ── */}
      <RailSection
        icon="✅"
        title="Tareas activas"
        count={openTasks}
        countColor={hasTasks ? C.brand : C.inkLight}
        countLabel={hasTasks ? `${openTasks} activa${openTasks > 1 ? "s" : ""}` : "Sin tareas"}
        href={`/${orgSlug}/agentik`}
        linkLabel="Centro de acciones →"
        urgent={false}
      >
        <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: S[1], lineHeight: 1.4 }}>
          {hasTasks ? "Tareas pendientes o en progreso." : "No hay tareas activas."}
        </div>
      </RailSection>

      {/* ── 4. Agentik Copilot — card wrapper ── */}
      <div style={{
        background:   C.brandLight,
        border:       `1px solid ${C.brandBorder}`,
        borderRadius: R.xl,
        boxShadow:    E.xs,
        marginBottom: S[2],
        overflow:     "hidden",
      }}>
        <CopilotRail orgSlug={orgSlug} moduleContext={moduleContext} />
      </div>

      {/* ── Footer ── */}
      <div style={{
        marginTop:    "auto",
        background:   C.surface,
        border:       `1px solid ${C.sidebarLine}`,
        borderRadius: R.xl,
        padding:      `${S[1] + 2}px ${S[3]}px`,
        fontSize:     T.sz["2xs"],
        color:        C.inkGhost,
        textAlign:    "center" as const,
      }}>
        Agentik Enterprise
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
      borderRadius: R.xl,
      padding:      S[3],
      marginBottom: S[2],
      boxShadow:    E.xs,
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
        color:          urgent ? countColor : C.brand,
        fontWeight:     T.wt.bold,
        textDecoration: "none",
      }}>
        {linkLabel}
      </Link>
    </div>
  );
}
