"use client";

/**
 * components/executive/mobile-quick-actions.tsx
 *
 * Mobile quick execution strip — Torre de Control.
 *
 * Calls real Agentik server actions directly from mobile. Each button shows
 * loading, success (with result message), and error states.
 *
 * Real executors wired:
 *   executive.execute → executiveExportFlashReport  (creates + runs flash report)
 *   alerts.escalate   → alertsEscalateCritical      (queries live alert → URGENT task)
 *   sales.delegate    → salesCreateCollectionFollowup (highest balanceDue → COBRANZA task)
 *
 * SAG approvals: navigation only — no server-action executor exists yet.
 * "Vista completa": navigation to desktop Tower for depth analysis.
 *
 * Design: horizontal scroll strip with scroll-snap. Minimum tap target 110px wide.
 */

import { useState, useTransition }  from "react";
import Link                          from "next/link";
import {
  executeCopilotAction,
  type ExecuteActionResult,
}                                    from "@/lib/agentik/copilot-actions";
import type { CopilotActionType }    from "@/lib/agentik/copilot-context";

// ── History types (exported for page.tsx to use) ───────────────────────────────

/**
 * Serialisation-safe shape for an ActionTask fetched on the server and
 * passed to this client component. Dates are ISO strings, not Date objects.
 */
export interface RecentActionItem {
  id:           string;
  title:        string;
  /** ActionTaskStatus enum value — compared as string */
  status:       string;
  /** ActionTaskType enum value — compared as string */
  actionType:   string;
  /** ISO 8601 — safe across the server→client boundary */
  createdAtISO: string;
  /** payloadJson from Prisma — non-null for chain audit records */
  payloadJson:  Record<string, unknown> | null;
}

type DisplayMode = "executed" | "delegated" | "task" | "chain" | "failed";

const MODE_DISPLAY: Record<DisplayMode, {
  label:  string;
  color:  string;
  bg:     string;
  border: string;
}> = {
  executed:  { label: "Ejecutado",  color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  delegated: { label: "Delegado",   color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  task:      { label: "En bandeja", color: "#7c3aed", bg: "#faf5ff", border: "#ede9fe" },
  chain:     { label: "Cadena",     color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  failed:    { label: "Fallida",    color: "#dc2626", bg: "#fff0f0", border: "#fca5a5" },
};

function deriveDisplayMode(item: RecentActionItem): DisplayMode {
  if (item.status === "FAILED" || item.status === "CANCELLED") return "failed";
  if (
    item.status === "COMPLETED" &&
    item.payloadJson !== null &&
    "planKey" in item.payloadJson
  ) return "chain";
  if (item.status === "COMPLETED") return "executed";
  if (item.actionType === "ESCALAR_A_GERENCIA") return "delegated";
  return "task";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "ahora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface MobileQuickActionsProps {
  orgSlug:          string;
  criticalCount:    number;
  hasOverdue:       boolean;
  pendingApprovals: number;
  recentActions:    RecentActionItem[];
}

// ── Internal state ────────────────────────────────────────────────────────────

type ActionKey = "flash" | "escalate" | "collections";
type BtnState  =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done";  result: ExecuteActionResult }
  | { status: "error"; message: string };

// ── Component ─────────────────────────────────────────────────────────────────

export default function MobileQuickActions({
  orgSlug,
  criticalCount,
  hasOverdue,
  pendingApprovals,
  recentActions,
}: MobileQuickActionsProps) {
  const [states,    setStates]    = useState<Partial<Record<ActionKey, BtnState>>>({});
  const [isPending, startTransition] = useTransition();

  const anyLoading = Object.values(states).some(s => s?.status === "loading") || isPending;

  function getState(key: ActionKey): BtnState {
    return states[key] ?? { status: "idle" };
  }

  function setBtnState(key: ActionKey, s: BtnState) {
    setStates(prev => ({ ...prev, [key]: s }));
  }

  function execute(
    key:         ActionKey,
    moduleId:    string,
    actionType:  CopilotActionType,
    label:       string,
    description: string,
  ) {
    if (getState(key).status !== "idle" || anyLoading) return;
    setBtnState(key, { status: "loading" });

    startTransition(async () => {
      const res = await executeCopilotAction(orgSlug, moduleId, actionType, label, description);
      if (res.ok) {
        setBtnState(key, { status: "done", result: res.data });
      } else {
        setBtnState(key, { status: "error", message: res.error });
      }
    });
  }

  return (
    <div style={{ marginBottom: 20 }}>

      {/* Section label */}
      <div style={{
        fontSize:      10,
        fontWeight:    700,
        color:         "#9ca3af",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom:  10,
      }}>
        Ejecución rápida
      </div>

      {/* Horizontally scrollable execution strip */}
      <div style={{
        display:                 "flex",
        gap:                     8,
        overflowX:               "auto",
        scrollSnapType:          "x mandatory",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth:          "none",
        paddingBottom:           4,
      }}>

        {/* ── 1. Escalate alert — highest urgency, shown when alerts exist ── */}
        {criticalCount > 0 && (
          <ExecButton
            icon="⚠"
            label={`Escalar (${criticalCount})`}
            sub="Alerta crítica → gerencia"
            state={getState("escalate")}
            accentColor="#dc2626"
            accentBg="#fff0f0"
            accentBorder="#fca5a5"
            doneLabel="✓ Escalada"
            disabled={anyLoading}
            onClick={() => execute(
              "escalate",
              "alerts",
              "escalate",
              "Escalar alerta crítica",
              "Escalar la alerta más crítica y reciente a gerencia para decisión inmediata",
            )}
          />
        )}

        {/* ── 2. Collections — financial exposure, shown when overdue ── */}
        {hasOverdue && (
          <ExecButton
            icon="💳"
            label="Cobranza"
            sub="Mayor saldo vencido"
            state={getState("collections")}
            accentColor="#d97706"
            accentBg="#fffbeb"
            accentBorder="#fde68a"
            doneLabel="✓ Iniciada"
            disabled={anyLoading}
            onClick={() => execute(
              "collections",
              "sales",
              "delegate",
              "Cobranza prioritaria",
              "Iniciar acción de cobranza con el cliente de mayor saldo vencido activo",
            )}
          />
        )}

        {/* ── 3. SAG approvals — ops friction, navigation only ── */}
        {pendingApprovals > 0 && (
          <NavButton
            icon="✍"
            label={`SAG (${pendingApprovals})`}
            sub="Revisar aprobaciones"
            href={`/${orgSlug}/sag/write`}
            accentColor="#d97706"
            accentBg="#fffbeb"
            accentBorder="#fde68a"
          />
        )}

        {/* ── 4. Flash Report — always available, lower urgency ── */}
        <ExecButton
          icon="⚡"
          label="Flash Report"
          sub="Informe ejecutivo ahora"
          state={getState("flash")}
          accentColor="#7c3aed"
          accentBg="#faf5ff"
          accentBorder="#ede9fe"
          doneLabel="✓ Generado"
          disabled={anyLoading}
          onClick={() => execute(
            "flash",
            "executive",
            "execute",
            "Flash Ejecutivo",
            "Genera informe ejecutivo del período actual con KPIs F1/F2, aging de cartera y alertas",
          )}
        />

        {/* ── 5. Full desktop tower — always last ── */}
        <NavButton
          icon="◈"
          label="Vista completa"
          sub="Análisis en profundidad"
          href={`/${orgSlug}/executive`}
          accentColor="#374151"
          accentBg="#f8f9fb"
          accentBorder="#e5e7eb"
        />

      </div>

      {/* ── Action history log ─────────────────────────────────────────────────
          Shows the last 3 actions Agentik executed, delegated, or queued.
          Sourced from ActionTask (sourceModule="agentik_copilot") — server data.
          Chain audit records carry step breakdowns in payloadJson.            */}
      {recentActions.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: "#9ca3af",
            textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8,
          }}>
            Historial — últimas acciones
          </div>

          <div style={{
            background:   "#fff",
            border:       "1px solid #f0f0f0",
            borderRadius: 10,
            overflow:     "hidden",
          }}>
            {recentActions.slice(0, 3).map((item, i) => {
              const mode      = deriveDisplayMode(item);
              const display   = MODE_DISPLAY[mode];
              const isLast    = i === Math.min(recentActions.length, 3) - 1;

              // Chain audit: summarise step breakdown from payloadJson
              let chainSub: string | null = null;
              if (mode === "chain" && item.payloadJson) {
                const p     = item.payloadJson;
                const parts: string[] = [];
                if ((p.stepsExecuted  as number) > 0) parts.push(`${p.stepsExecuted} ejec.`);
                if ((p.stepsDelegated as number) > 0) parts.push(`${p.stepsDelegated} deleg.`);
                if ((p.stepsTasked    as number) > 0) parts.push(`${p.stepsTasked} bandeja`);
                if ((p.stepsFailed    as number) > 0) parts.push(`${p.stepsFailed} fallido`);
                chainSub = parts.join(", ");
              }

              return (
                <div
                  key={item.id}
                  style={{
                    display:      "flex",
                    alignItems:   "center",
                    gap:          10,
                    padding:      "10px 14px",
                    borderBottom: isLast ? "none" : "1px solid #f5f5f5",
                    // Left accent for failed items
                    borderLeft:   mode === "failed" ? "3px solid #dc2626" : "3px solid transparent",
                  }}
                >
                  {/* Status dot */}
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: display.color, flexShrink: 0,
                  }} />

                  {/* Title + chain breakdown */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize:     12,
                      fontWeight:   600,
                      color:        "#374151",
                      whiteSpace:   "nowrap",
                      overflow:     "hidden",
                      textOverflow: "ellipsis",
                    }}>
                      {item.title}
                    </div>
                    {chainSub && (
                      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>
                        {chainSub}
                      </div>
                    )}
                  </div>

                  {/* Mode badge */}
                  <div style={{
                    fontSize:     9,
                    fontWeight:   700,
                    color:        display.color,
                    background:   display.bg,
                    border:       `1px solid ${display.border}`,
                    borderRadius: 20,
                    padding:      "2px 7px",
                    whiteSpace:   "nowrap",
                    flexShrink:   0,
                  }}>
                    {display.label}
                  </div>

                  {/* Time ago */}
                  <div style={{
                    fontSize:  9,
                    color:     "#d1d5db",
                    flexShrink: 0,
                    minWidth:  22,
                    textAlign: "right",
                  }}>
                    {timeAgo(item.createdAtISO)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

// ── ExecButton ────────────────────────────────────────────────────────────────

function ExecButton({
  icon, label, sub, state, accentColor, accentBg, accentBorder, doneLabel, disabled, onClick,
}: {
  icon:         string;
  label:        string;
  sub:          string;
  state:        BtnState;
  accentColor:  string;
  accentBg:     string;
  accentBorder: string;
  doneLabel:    string;
  disabled:     boolean;
  onClick:      () => void;
}) {
  const isLoading = state.status === "loading";
  const isDone    = state.status === "done";
  const isError   = state.status === "error";
  const isIdle    = state.status === "idle";

  const bg          = isDone  ? accentBg   : isError ? "#fff0f0" : "#fff";
  const border      = isDone  ? accentBorder : isError ? "#fca5a5" : "#e5e7eb";
  const labelColor  = isDone  ? accentColor : isError ? "#991b1b" : "#111";
  const displaySub  = isDone  ? (state.result.resultMessage?.slice(0, 32) ?? sub)
                     : isError ? (state.message.slice(0, 32))
                     : sub;

  return (
    <button
      onClick={onClick}
      disabled={!isIdle || disabled}
      style={{
        background:      bg,
        border:          `1px solid ${border}`,
        borderRadius:    10,
        padding:         "13px 14px",
        minWidth:        120,
        flexShrink:      0,
        scrollSnapAlign: "start",
        textAlign:       "left",
        cursor:          isIdle && !disabled ? "pointer" : "default",
        opacity:         isLoading ? 0.65 : 1,
        transition:      "all 0.15s ease",
      }}
    >
      {/* Icon */}
      <div style={{ fontSize: 20, marginBottom: 5, lineHeight: 1 }}>
        {isLoading ? "⏳" : isDone ? "✓" : isError ? "✗" : icon}
      </div>

      {/* Label */}
      <div style={{
        fontSize:   13,
        fontWeight: 700,
        color:      labelColor,
        marginBottom: 3,
        lineHeight: 1.2,
      }}>
        {isLoading ? "Procesando…" : isDone ? doneLabel : isError ? "Error" : label}
      </div>

      {/* Sub-label / result / error */}
      <div style={{
        fontSize:   10,
        color:      isError ? "#b91c1c" : "#9ca3af",
        lineHeight: 1.3,
        overflow:   "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        maxWidth:   104,
      }}>
        {displaySub}
      </div>
    </button>
  );
}

// ── NavButton (navigation-only action) ────────────────────────────────────────

function NavButton({
  icon, label, sub, href, accentColor, accentBg, accentBorder,
}: {
  icon:         string;
  label:        string;
  sub:          string;
  href:         string;
  accentColor:  string;
  accentBg:     string;
  accentBorder: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none", flexShrink: 0 }}>
      <div style={{
        background:      accentBg,
        border:          `1px solid ${accentBorder}`,
        borderRadius:    10,
        padding:         "13px 14px",
        minWidth:        110,
        scrollSnapAlign: "start",
      }}>
        <div style={{ fontSize: 20, marginBottom: 5, lineHeight: 1 }}>{icon}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: accentColor, marginBottom: 3, lineHeight: 1.2 }}>
          {label}
        </div>
        <div style={{ fontSize: 10, color: "#9ca3af" }}>{sub}</div>
      </div>
    </Link>
  );
}
