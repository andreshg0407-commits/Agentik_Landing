/**
 * components/shell/operational-primitives.tsx
 *
 * AGENTIK-UX-SYSTEM-LOCK-01 — Task 3
 * Operational UX Primitives
 *
 * Formal component library for the Agentik Enterprise OS.
 * Every module must compose from these primitives — never invent new layouts.
 *
 * Exports:
 *   StatusChip          — inline operational status badge (uses ag-op-status classes)
 *   AttentionBadge      — count badge for exceptions requiring review
 *   WorkspaceSection    — section container: title + action slot + divider
 *   EmptyOperationalState — full-surface empty state with contextual message
 *   OperationalMetric   — compact metric row (label + value + optional delta)
 *   CopilotReadinessSlot — placeholder for progressive AI suggestion layer
 *   ModulePulseHeader   — convenience wrapper: OperationalWorkspaceHeader + optional pulse bar
 *
 * Rules:
 *   - All tokens come from lib/ui/tokens.ts (C, T, S, R, E)
 *   - No Tailwind classes — this file is for the enterprise shell only
 *   - No business logic, no data fetching, no side effects
 *   - No raw hex colors — always use C.*
 *
 * IMPORTANT: Backend-safe. Can import in server and client components.
 * Do NOT import Prisma or any server-only modules from this file.
 */

import type { ReactNode }    from "react";
import Link                  from "next/link";
import { C, T, S, R, E }    from "@/lib/ui/tokens";
import {
  OperationalWorkspaceHeader,
  type BreadcrumbItem,
  type StatusSignal,
} from "@/components/workspace/operational-workspace-header";

// ── StatusChip ────────────────────────────────────────────────────────────────

type StatusChipVariant = "ok" | "pending" | "warning" | "critical" | "info";

/**
 * Inline operational status badge.
 *
 * Maps to ag-op-status CSS classes from design-system.css §13.
 * Use for status columns in tables, session states, run states.
 *
 * @example
 * <StatusChip variant="ok">Conciliado</StatusChip>
 * <StatusChip variant="warning">Requiere revisión</StatusChip>
 * <StatusChip variant="critical">Fallido</StatusChip>
 */
export function StatusChip({
  children,
  variant = "info",
}: {
  children: ReactNode;
  variant?: StatusChipVariant;
}) {
  return (
    <span className={`ag-op-status ag-op-status--${variant}`}>
      {children}
    </span>
  );
}

// ── AttentionBadge ────────────────────────────────────────────────────────────

/**
 * Count badge communicating items that require operator attention.
 *
 * Use in: nav item badges, section headings next to exception counts,
 * panel titles when exceptions exist.
 *
 * @example
 * <AttentionBadge count={3} />         // amber — watch
 * <AttentionBadge count={7} critical /> // red — critical
 */
export function AttentionBadge({
  count,
  critical = false,
}: {
  count:     number;
  critical?: boolean;
}) {
  if (count <= 0) return null;
  return (
    <span style={{
      display:        "inline-flex",
      alignItems:     "center",
      justifyContent: "center",
      fontFamily:     T.mono,
      fontSize:       T.sz["2xs"],
      fontWeight:     T.wt.bold,
      minWidth:       16,
      height:         16,
      padding:        "0 4px",
      borderRadius:   R.pill,
      background:     critical ? C.redLight  : C.amberLight,
      color:          critical ? C.red       : C.amber,
      border:         `1px solid ${critical ? C.redBorder : C.amberBorder}`,
      letterSpacing:  "0.02em",
      flexShrink:     0,
      lineHeight:     1,
    }}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

// ── WorkspaceSection ──────────────────────────────────────────────────────────

/**
 * Standard workspace section container.
 *
 * Provides consistent title typography, optional action slot, and a
 * top divider for visual separation between blueprint layers.
 *
 * @example
 * <WorkspaceSection title="Sesiones recientes" action={<button>Nueva sesión</button>}>
 *   {table}
 * </WorkspaceSection>
 */
export function WorkspaceSection({
  title,
  subtitle,
  action,
  children,
  divider = true,
  style,
}: {
  title:     string;
  subtitle?: string;
  action?:   ReactNode;
  children:  ReactNode;
  divider?:  boolean;
  style?:    React.CSSProperties;
}) {
  return (
    <div style={{
      marginTop:  divider ? S[6] : 0,
      paddingTop: divider ? S[5] : 0,
      borderTop:  divider ? `1px solid ${C.line}` : undefined,
      ...style,
    }}>
      {/* Section title row */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        gap:            S[2],
        marginBottom:   S[4],
      }}>
        <div>
          <div style={{
            fontFamily:  T.mono,
            fontSize:    T.sz.lg,
            fontWeight:  T.wt.bold,
            color:       C.ink,
            lineHeight:  1.2,
          }}>
            {title}
          </div>
          {subtitle && (
            <div style={{
              fontFamily: T.mono,
              fontSize:   T.sz.xs,
              color:      C.inkLight,
              marginTop:  2,
            }}>
              {subtitle}
            </div>
          )}
        </div>
        {action && (
          <div style={{ flexShrink: 0 }}>
            {action}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

// ── EmptyOperationalState ─────────────────────────────────────────────────────

/**
 * Full-surface empty state with operational context.
 *
 * Use inside any table container or workspace panel when there is no data.
 * Never use a plain "No hay datos" div — always use this component.
 *
 * @example
 * <EmptyOperationalState
 *   message="Sin movimientos para este período"
 *   action={{ label: "Cambiar período", onClick: () => {} }}
 * />
 */
export function EmptyOperationalState({
  message,
  detail,
  action,
  style,
}: {
  message:  string;
  detail?:  string;
  action?:  { label: string; href?: string; onClick?: () => void };
  style?:   React.CSSProperties;
}) {
  return (
    <div style={{
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      padding:        `${S[10]}px ${S[6]}px`,
      gap:            S[2],
      ...style,
    }}>
      {/* Operational empty indicator */}
      <div style={{
        width:        40,
        height:       40,
        borderRadius: R.card,
        background:   C.surface,
        border:       `1px solid ${C.line}`,
        display:      "flex",
        alignItems:   "center",
        justifyContent: "center",
        marginBottom: S[1],
        boxShadow:    E.sm,
      }}>
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xl,
          color:      C.inkGhost,
          lineHeight: 1,
        }}>—</span>
      </div>

      <div style={{
        fontFamily:  T.mono,
        fontSize:    T.sz.base,
        fontWeight:  T.wt.semibold,
        color:       C.inkLight,
        textAlign:   "center" as const,
        lineHeight:  1.5,
      }}>
        {message}
      </div>

      {detail && (
        <div style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          color:      C.inkFaint,
          textAlign:  "center" as const,
          maxWidth:   320,
          lineHeight: 1.6,
        }}>
          {detail}
        </div>
      )}

      {action && (
        action.href ? (
          <Link href={action.href} className="ag-action-secondary" style={{ marginTop: S[2] }}>
            {action.label}
          </Link>
        ) : (
          <button onClick={action.onClick} className="ag-action-secondary" style={{ marginTop: S[2] }}>
            {action.label}
          </button>
        )
      )}
    </div>
  );
}

// ── OperationalMetric ─────────────────────────────────────────────────────────

/**
 * Compact inline metric row: label + value + optional delta.
 *
 * Use in summary panels, tooltips, supplementary data rows —
 * wherever a full KpiCard is too large but raw text is too plain.
 *
 * @example
 * <OperationalMetric label="Tasa de coincidencia" value="94.2%" delta="+2.1%" positive />
 */
export function OperationalMetric({
  label,
  value,
  delta,
  positive,
  source,
}: {
  label:     string;
  value:     string | number;
  delta?:    string;
  positive?: boolean;
  source?:   string;
}) {
  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          S[2],
      padding:      `${S[1]}px 0`,
      borderBottom: `1px solid ${C.lineSubtle}`,
    }}>
      <div style={{
        flex:       1,
        fontFamily: T.mono,
        fontSize:   T.sz.sm,
        color:      C.inkLight,
        whiteSpace: "nowrap" as const,
        overflow:   "hidden",
        textOverflow: "ellipsis",
      }}>
        {label}
      </div>
      {source && (
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          fontWeight:    T.wt.bold,
          color:         C.blue,
          background:    C.blueLight,
          border:        `1px solid ${C.blueBorder}`,
          borderRadius:  R.xs,
          padding:       "1px 4px",
          whiteSpace:    "nowrap" as const,
          flexShrink:    0,
          letterSpacing: "0.04em",
          textTransform: "uppercase" as const,
        }}>
          {source}
        </span>
      )}
      {delta && (
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz["2xs"],
          fontWeight: T.wt.semibold,
          color:      positive ? C.green : C.red,
          flexShrink: 0,
        }}>
          {delta}
        </span>
      )}
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.base,
        fontWeight:    T.wt.bold,
        color:         C.ink,
        whiteSpace:    "nowrap" as const,
        fontVariantNumeric: "tabular-nums",
        flexShrink:    0,
      }}>
        {value}
      </div>
    </div>
  );
}

// ── CopilotReadinessSlot ──────────────────────────────────────────────────────

/**
 * Progressive placeholder for the AI copilot suggestion layer.
 *
 * Renders a styled "coming soon" slot that:
 * - signals the AI layer is architecturally present but not yet active
 * - uses ag-copilot-zone separator + ag-surface-ai styling
 * - is replaced by real copilot content when RECON-COPILOT-01 ships
 *
 * @example
 * <CopilotReadinessSlot moduleId="reconciliation" label="Agentik Reconciliation Copilot" />
 */
export function CopilotReadinessSlot({
  label = "Agentik Copilot",
  moduleId,
}: {
  label?:    string;
  moduleId?: string;
}) {
  return (
    <div className="ag-copilot-zone">
      <div style={{
        background:    "var(--ag-grad-ai, linear-gradient(135deg, #001E4A 0%, #003A8A 100%))",
        borderRadius:  R.card,
        padding:       `${S[4]}px ${S[5]}px`,
        display:       "flex",
        alignItems:    "center",
        gap:           S[3],
        opacity:       0.72,
      }}>
        {/* AI indicator dot */}
        <div
          className="ag-copilot-thinking"
          style={{
            width:        8,
            height:       8,
            borderRadius: "50%",
            background:   "rgba(255,255,255,.40)",
            flexShrink:   0,
          }}
        />
        <div>
          <div style={{
            fontFamily:  T.mono,
            fontSize:    T.sz.sm,
            fontWeight:  T.wt.bold,
            color:       "rgba(255,255,255,.85)",
            lineHeight:  1.3,
          }}>
            {label}
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            color:      "rgba(255,255,255,.45)",
            marginTop:  2,
          }}>
            {moduleId ? `Disponible próximamente · ${moduleId}` : "Disponible próximamente"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ModulePulseHeader ─────────────────────────────────────────────────────────

/**
 * Convenience wrapper: OperationalWorkspaceHeader + optional situational pulse bar.
 *
 * Combines the standard workspace header (breadcrumbs + title + status badge)
 * with an optional one-line pulse bar for immediate executive orientation.
 *
 * Use for modules that need a quick situational summary above the KPI strip.
 * For simple modules, use OperationalWorkspaceHeader directly.
 *
 * @example
 * <ModulePulseHeader
 *   breadcrumbs={[{ label: "Finanzas", href: "/finanzas" }, { label: "Conciliación" }]}
 *   title="Conciliación Inteligente"
 *   status="warning"
 *   statusLabel="3 excepciones pendientes"
 *   pulse={{ signal: "warn", text: "Hay diferencias que requieren revisión antes del cierre." }}
 * />
 */
export function ModulePulseHeader({
  breadcrumbs,
  title,
  subtitle,
  status,
  statusLabel,
  contextualBackHref,
  contextualBackLabel,
  pulse,
}: {
  breadcrumbs:          BreadcrumbItem[];
  title:                string;
  subtitle?:            string;
  status?:              StatusSignal;
  statusLabel?:         string;
  contextualBackHref?:  string;
  contextualBackLabel?: string;
  /** Optional one-line situational bar above the KPI strip. */
  pulse?: {
    signal: "ok" | "warn" | "critical";
    text:   string;
  };
}) {
  const PULSE_DOT: Record<string, string> = {
    ok:       "#22c55e",
    warn:     "#f59e0b",
    critical: "#ef4444",
  };

  return (
    <>
      <OperationalWorkspaceHeader
        breadcrumbs={breadcrumbs}
        title={title}
        subtitle={subtitle}
        status={status}
        statusLabel={statusLabel}
        contextualBackHref={contextualBackHref}
        contextualBackLabel={contextualBackLabel}
      />
      {pulse && (
        <div className={`ag-op-pulse ag-op-pulse--${pulse.signal}`} style={{ marginBottom: S[5] }}>
          <div style={{
            width:        7,
            height:       7,
            borderRadius: "50%",
            background:   PULSE_DOT[pulse.signal],
            flexShrink:   0,
          }} />
          <span style={{
            fontFamily: T.mono,
            fontSize:   T.sz.sm,
            color:      C.inkMid,
            lineHeight: 1.4,
          }}>
            {pulse.text}
          </span>
        </div>
      )}
    </>
  );
}
