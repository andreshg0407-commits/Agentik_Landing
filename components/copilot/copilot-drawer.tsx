"use client";

/**
 * components/copilot/copilot-drawer.tsx
 *
 * Agentik Copilot — Agent Action Drawer
 * Sprint: AGENTIK-COPILOT-DRAWER-PERFECTION-01
 *
 * Diego abrió una mesa de trabajo para resolver este tema contigo.
 *
 * Layout:
 *   [Fixed]   AgentDrawerHeader    — dark office header
 *   [Fixed]   CategoryTitleRow     — what was found + close
 *   [Scroll]
 *     ├─ RecommendationBlock       — PROTAGONIST: Lo que Diego recomienda
 *     ├─ ExecutiveImpactBlock      — Impacto · Riesgo · Urgencia · Área
 *     ├─ AskAgentBlock             — 4 suggested questions (visual-only)
 *     ├─ QuickActionMiniCards      — 3 rich action cards
 *     ├─ ElementsFoundSection      — the detected items list (secondary)
 *     └─ WorkspaceTabs             — Actividad | Módulos | Plan | Estado
 *   [Fixed]   DrawerFooter         — Volver a la oficina | Cerrar
 *
 * Navigation: useRouter + useParams + buildDestinationUrl. No hardcoded routes.
 */

import { useState, useTransition }          from "react";
import { useRouter }                        from "next/navigation";
import type { ReactNode }                   from "react";
import { C, T, S, R, E }                   from "@/lib/ui/tokens";
import type { CopilotViewModel }            from "@/lib/copilot/viewmodel";
import type { AgentSectionLabels }          from "@/lib/copilot/language";
import {
  getPrimaryAction,
  type PrimaryAction,
}                                           from "@/lib/copilot/navigation/get-primary-action";
import {
  getExecutiveContext,
  type UrgencyLevel,
}                                           from "@/lib/copilot/navigation/get-executive-context";
import {
  AGENT_WORKSPACE,
}                                           from "@/lib/copilot/navigation/agent-workspace-fixtures";
import {
  NAVIGATION_META,
  useCopilotNavigation,
  type CopilotNavigationTarget,
}                                           from "@/lib/copilot/navigation/copilot-navigation";
import type {
  DrawerCategoryKey,
  QuickAction,
}                                           from "@/lib/copilot/navigation/copilot-action-map";
import type { CopilotActionKind }           from "@/lib/copilot/actions/action-types";
import { executeCopilotAction }             from "@/lib/copilot/actions/action-executor";
import { createCopilotTaskAction }          from "@/app/(app)/[orgSlug]/agentik/copilot-task-actions";
import { createCopilotApprovalAction }      from "@/app/(app)/[orgSlug]/agentik/copilot-approval-actions";
import { CopilotActiveWork }                from "./copilot-active-work";
import { CopilotPendingApprovals }          from "./copilot-pending-approvals";
import { CopilotCompletedWork }             from "./copilot-completed-work";
import { CopilotFollowups }                 from "./copilot-followups";
import { CopilotSuggestionsList }           from "./copilot-suggestions-list";
import { CopilotInsightsList }              from "./copilot-insights-list";
import { CopilotAttentionList }             from "./copilot-attention-list";
import { CopilotOpportunitiesList }         from "./copilot-opportunities-list";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DrawerCategory =
  | "activeWork"
  | "attention"
  | "opportunities"
  | "pendingApprovals"
  | "followups"
  | "recentActivity"
  | "suggestions"
  | "insights";

interface CopilotDrawerProps {
  isOpen:       boolean;
  category:     DrawerCategory | null;
  viewModel:    CopilotViewModel;
  sections:     AgentSectionLabels;
  onClose:      () => void;
  /** External navigation override — default: router.push() via useCopilotNavigation. */
  onNavigate?:  (target: CopilotNavigationTarget) => void;
  drawerWidth?: string | number;
}

// ── Accent map ────────────────────────────────────────────────────────────────

const DRAWER_ACCENT: Record<DrawerCategory, string> = {
  attention:        C.amber,
  activeWork:       C.blueDark,
  pendingApprovals: C.amber,
  suggestions:      C.brand,
  opportunities:    C.green,
  followups:        C.blue,
  recentActivity:   C.green,
  insights:         C.blue,
};

// ── Resolvers ─────────────────────────────────────────────────────────────────

function resolveTitle(c: DrawerCategory, s: AgentSectionLabels): string {
  switch (c) {
    case "activeWork":       return s.activeWork;
    case "attention":        return s.attentionItems;
    case "opportunities":    return s.opportunities;
    case "pendingApprovals": return s.pendingApprovals;
    case "followups":        return s.followups;
    case "recentActivity":   return s.completedWork;
    case "suggestions":      return s.suggestions;
    case "insights":         return s.insights;
  }
}

function resolveCount(c: DrawerCategory, vm: CopilotViewModel): number {
  switch (c) {
    case "activeWork":       return (vm.activeWork       ?? []).length;
    case "attention":        return vm.attentionItems.length;
    case "opportunities":    return vm.opportunities.length;
    case "pendingApprovals": return (vm.pendingApprovals ?? []).length;
    case "followups":        return (vm.followups        ?? []).length;
    case "recentActivity":   return (vm.completedWork    ?? []).length;
    case "suggestions":      return vm.suggestions.length;
    case "insights":         return vm.insights.length;
  }
}

const DOMAIN_LABELS: Record<string, string> = {
  bancos: "bancos", cartera: "cartera", conciliacion: "conciliación",
  pagos: "pagos", cierre: "cierre", tesoreria: "tesorería",
  planeacion: "planeación", clientes: "clientes", proveedores: "proveedores",
  inventario: "inventario", ventas: "ventas", compras: "compras",
  nomina: "nómina", fiscal: "fiscal", recaudos: "recaudos",
  productos: "productos", marketing: "marketing", produccion: "producción",
  tareas: "tareas", alertas: "alertas",
};

function buildContextLine(domains: string[]): string {
  const top = domains.slice(0, 3).map(d => DOMAIN_LABELS[d] ?? d);
  if (top.length === 0) return "Revisando contexto operativo";
  if (top.length === 1) return `Revisando ${top[0]}`;
  return `Revisando ${top.slice(0, -1).join(", ")} y ${top[top.length - 1]}`;
}

// ── Root component ────────────────────────────────────────────────────────────

export function CopilotDrawer({
  isOpen,
  category,
  viewModel,
  sections,
  onClose,
  onNavigate,
  drawerWidth = "100%",
}: CopilotDrawerProps) {
  const { navigate, orgSlug } = useCopilotNavigation();
  const router = useRouter();
  const [isTaskPending, startTaskTransition] = useTransition();

  // Generic action feedback (non-task actions)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Task creation feedback (richer — includes CTA)
  const [taskFeedback, setTaskFeedback] = useState<{
    success:  boolean;
    message:  string;
    taskId?:  string;
  } | null>(null);

  // Approval creation state
  const [isApprovalPending, startApprovalTransition] = useTransition();
  const [approvalFeedback, setApprovalFeedback] = useState<{
    success:         boolean;
    message:         string;
    approvalId?:     string;
    navigationTarget?: string;
  } | null>(null);

  const agentName   = viewModel.leadAgent?.agentName ?? "El agente";
  const count       = category ? resolveCount(category, viewModel) : 0;
  const accent      = category ? DRAWER_ACCENT[category] : C.inkGhost;
  const title       = category ? resolveTitle(category, sections) : "";
  const navKey      = category as DrawerCategoryKey | null;

  const primaryAction = navKey && count > 0
    ? getPrimaryAction(navKey, count, agentName)
    : null;
  const execContext = navKey
    ? getExecutiveContext(navKey, count)
    : null;

  const handleNavigate = (target: CopilotNavigationTarget) => {
    if (onNavigate) {
      onNavigate(target);
    } else {
      navigate(target);
      onClose();
    }
  };

  const handleAction = (kind: CopilotActionKind) => {
    // CREATE_TASK — real server-side persistence
    if (kind === "CREATE_TASK") {
      setTaskFeedback(null);
      startTaskTransition(async () => {
        const result = await createCopilotTaskAction({
          orgSlug,
          agentId:        viewModel.leadAgent?.agentId ?? "diego",
          moduleSlug:     viewModel.module ?? "",
          drawerCategory: category ?? undefined,
        });
        setTaskFeedback({
          success: result.success,
          message: result.success
            ? "Tarea creada correctamente."
            : result.message || "No se pudo crear la tarea.",
          taskId: result.taskId,
        });
      });
      return;
    }

    // REQUEST_APPROVAL — real server-side persistence
    if (kind === "REQUEST_APPROVAL") {
      setApprovalFeedback(null);
      startApprovalTransition(async () => {
        const result = await createCopilotApprovalAction({
          orgSlug,
          agentId:        viewModel.leadAgent?.agentId ?? "diego",
          moduleSlug:     viewModel.module ?? "",
          drawerCategory: category ?? undefined,
        });
        setApprovalFeedback({
          success:         result.success,
          message:         result.success
            ? "Aprobación creada correctamente."
            : result.message || "No se pudo crear la solicitud.",
          approvalId:      result.approvalId,
          navigationTarget: result.approvalId ? `/${orgSlug}/aprobaciones` : undefined,
        });
      });
      return;
    }

    // All other actions — local Work Execution (stub)
    const response = executeCopilotAction({
      kind,
      context: {
        orgSlug,
        agentId:        viewModel.leadAgent?.agentId ?? "diego",
        moduleSlug:     viewModel.module ?? "",
        drawerCategory: category ?? undefined,
      },
    });
    setActionFeedback(response.result.message);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "absolute", inset: 0,
          background: "rgba(15,15,26,0.20)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 200ms ease",
          zIndex: 10,
        }}
      />

      {/* Slide panel */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0,
          width: drawerWidth, maxWidth: "100%",
          background: C.white, boxShadow: E.lg,
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 240ms cubic-bezier(.4,0,.2,1)",
          zIndex: 11,
          display: "flex", flexDirection: "column" as const,
          overflow: "hidden",
        }}
      >
        {/* ── Fixed: Agent Header ─────────────────────────────────────── */}
        {viewModel.leadAgent && (
          <AgentDrawerHeader
            agentName={viewModel.leadAgent.agentName}
            role={viewModel.leadAgent.role}
            readiness={viewModel.summary.readiness}
            activeDomains={viewModel.summary.activeDomains}
            accentColor={accent}
          />
        )}

        {/* ── Fixed: Category Title Row ───────────────────────────────── */}
        <div style={{
          padding: `${S[2]}px ${S[4]}px`,
          borderBottom: `1px solid ${C.line}`,
          background: C.white, flexShrink: 0,
          display: "flex", alignItems: "center", gap: S[2],
        }}>
          <span style={{ width: 7, height: 7, borderRadius: R.pill, background: accent, flexShrink: 0 }} />
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.semibold,
            color: C.ink, overflow: "hidden", whiteSpace: "nowrap" as const,
            textOverflow: "ellipsis", flex: 1,
          }}>
            {title}
          </span>
          {count > 0 && (
            <span style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
              color: C.white, background: accent, borderRadius: R.pill,
              padding: "2px 8px", flexShrink: 0,
            }}>
              {count}
            </span>
          )}
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 26, height: 26, border: `1px solid ${C.line}`, borderRadius: R.sm,
              background: C.white, cursor: "pointer", color: C.inkLight,
              fontSize: T.sz.xl, lineHeight: 1, padding: 0, flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* ── Scrollable content ──────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto" as const }}>
          {/* Task creation pending */}
          {isTaskPending && (
            <div style={{
              padding:      `${S[2]}px ${S[4]}px`,
              background:   C.blueLight,
              borderBottom: `1px solid ${C.blueBorder}`,
              display:      "flex", alignItems: "center", gap: S[2],
            }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark }}>
                Creando tarea…
              </span>
            </div>
          )}

          {/* Task creation feedback */}
          {!isTaskPending && taskFeedback && (
            <div style={{
              padding:      `${S[2]}px ${S[4]}px`,
              background:   taskFeedback.success ? C.greenLight : "#fff0f0",
              borderBottom: `1px solid ${taskFeedback.success ? C.green : C.red}`,
              display:      "flex", alignItems: "center", gap: S[2],
            }}>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz.xs,
                color:      taskFeedback.success ? C.green : C.red,
                flexShrink: 0,
              }}>
                {taskFeedback.success ? "✓" : "✕"}
              </span>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz.xs,
                color:      taskFeedback.success ? C.green : C.red,
                lineHeight: 1.4, flex: 1,
              }}>
                {taskFeedback.message}
                {taskFeedback.success && " Ya puedes verla en Tareas."}
              </span>
              {taskFeedback.success && (
                <button
                  onClick={() => { navigate("TASKS"); onClose(); }}
                  style={{
                    fontFamily:   T.mono,
                    fontSize:     T.sz.xs,
                    fontWeight:   T.wt.semibold,
                    color:        C.blueDark,
                    background:   C.blueLight,
                    border:       `1px solid ${C.blueBorder}`,
                    borderRadius: R.sm,
                    padding:      `2px ${S[2]}px`,
                    cursor:       "pointer",
                    whiteSpace:   "nowrap" as const,
                    flexShrink:   0,
                  }}
                >
                  Ver en Tareas →
                </button>
              )}
            </div>
          )}

          {/* Approval creation pending */}
          {isApprovalPending && (
            <div style={{
              padding:      `${S[2]}px ${S[4]}px`,
              background:   C.blueLight,
              borderBottom: `1px solid ${C.blueBorder}`,
              display:      "flex", alignItems: "center", gap: S[2],
            }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark }}>
                Creando solicitud…
              </span>
            </div>
          )}

          {/* Approval creation feedback */}
          {!isApprovalPending && approvalFeedback && (
            <div style={{
              padding:      `${S[2]}px ${S[4]}px`,
              background:   approvalFeedback.success ? C.greenLight : "#fff0f0",
              borderBottom: `1px solid ${approvalFeedback.success ? C.green : C.red}`,
              display:      "flex", alignItems: "center", gap: S[2],
            }}>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz.xs,
                color:      approvalFeedback.success ? C.green : C.red,
                flexShrink: 0,
              }}>
                {approvalFeedback.success ? "✓" : "✕"}
              </span>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz.xs,
                color:      approvalFeedback.success ? C.green : C.red,
                lineHeight: 1.4, flex: 1,
              }}>
                {approvalFeedback.message}
                {approvalFeedback.success && " Ya puedes verla en Aprobaciones."}
              </span>
              {approvalFeedback.success && approvalFeedback.navigationTarget && (
                <button
                  onClick={() => { router.push(approvalFeedback.navigationTarget!); onClose(); }}
                  style={{
                    fontFamily:   T.mono,
                    fontSize:     T.sz.xs,
                    fontWeight:   T.wt.semibold,
                    color:        C.blueDark,
                    background:   C.blueLight,
                    border:       `1px solid ${C.blueBorder}`,
                    borderRadius: R.sm,
                    padding:      `2px ${S[2]}px`,
                    cursor:       "pointer",
                    whiteSpace:   "nowrap" as const,
                    flexShrink:   0,
                  }}
                >
                  Ver en Aprobaciones →
                </button>
              )}
            </div>
          )}

          {/* Generic action feedback banner */}
          {actionFeedback && (
            <div style={{
              padding:      `${S[2]}px ${S[4]}px`,
              background:   C.greenLight,
              borderBottom: `1px solid ${C.green}`,
              display:      "flex", alignItems: "center", gap: S[2],
            }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green, flexShrink: 0 }}>✓</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green, lineHeight: 1.4 }}>
                {actionFeedback}
              </span>
            </div>
          )}
          {category && isOpen && (
            <>
              {/* RECOMMENDATION — protagonist */}
              <div style={{ padding: `${S[4]}px ${S[4]}px ${S[3]}px`, background: C.surface, borderBottom: `1px solid ${C.line}` }}>
                {primaryAction ? (
                  <RecommendationBlock
                    agentName={agentName}
                    action={primaryAction}
                    accentColor={accent}
                    onNavigate={handleNavigate}
                  />
                ) : (
                  <EmptyRecommendation agentName={agentName} accentColor={accent} />
                )}
              </div>

              {/* EXECUTIVE IMPACT */}
              {execContext && (
                <div style={{ padding: `${S[3]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}` }}>
                  <ExecutiveImpactBlock
                    impactLabel={execContext.impactLabel}
                    riskLabel={execContext.riskLabel}
                    urgency={execContext.urgency}
                    areaLabel={execContext.areaLabel}
                  />
                </div>
              )}

              {/* ASK AGENT */}
              <div style={{ padding: `${S[3]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}` }}>
                <AskAgentBlock
                  agentName={agentName}
                  category={category as DrawerCategoryKey}
                />
              </div>

              {/* QUICK ACTION MINI-CARDS */}
              {primaryAction && primaryAction.quickActions.length > 0 && (
                <div style={{ padding: `${S[3]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}` }}>
                  <QuickActionMiniCards
                    actions={primaryAction.quickActions}
                    onNavigate={handleNavigate}
                    onAction={handleAction}
                  />
                </div>
              )}

              {/* ELEMENTS FOUND */}
              <ElementsFoundSection
                category={category}
                viewModel={viewModel}
                sections={sections}
                count={count}
              />

              {/* WORKSPACE TABS */}
              <WorkspaceTabs
                category={category as DrawerCategoryKey}
                onNavigate={handleNavigate}
              />
            </>
          )}
        </div>

        {/* ── Fixed: Drawer Footer ────────────────────────────────────── */}
        <DrawerFooter onClose={onClose} />
      </div>
    </>
  );
}

// ── Agent Drawer Header ───────────────────────────────────────────────────────

function AgentDrawerHeader({
  agentName, role, readiness, activeDomains, accentColor,
}: {
  agentName:     string;
  role:          string;
  readiness:     string;
  activeDomains: string[];
  accentColor:   string;
}) {
  const initial     = agentName.charAt(0).toUpperCase();
  const statusLabel = readiness === "ready"   ? "Operación activa"
                    : readiness === "partial"  ? "Contexto parcial"
                    : "Iniciando";
  const statusColor = readiness === "ready"   ? C.green
                    : readiness === "partial"  ? C.amber
                    : C.inkFaint;

  return (
    <div style={{
      padding: `${S[3]}px ${S[4]}px`, background: C.exec, flexShrink: 0,
      display: "flex", alignItems: "center", gap: S[3],
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: R.pill, background: accentColor,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, border: "2px solid rgba(255,255,255,0.15)",
      }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.bold, color: C.white, lineHeight: 1 }}>
          {initial}
        </span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 2 }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.bold, color: C.white }}>
            {agentName}
          </span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: statusColor }}>
            · {statusLabel}
          </span>
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: "rgba(255,255,255,0.45)", marginBottom: 2 }}>
          {role}
        </div>
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, color: "rgba(255,255,255,0.28)",
          overflow: "hidden", whiteSpace: "nowrap" as const, textOverflow: "ellipsis",
        }}>
          {buildContextLine(activeDomains)}
        </div>
      </div>
    </div>
  );
}

// ── Recommendation Block ──────────────────────────────────────────────────────

function RecommendationBlock({
  agentName, action, accentColor, onNavigate,
}: {
  agentName:   string;
  action:      PrimaryAction;
  accentColor: string;
  onNavigate:  (dest: CopilotNavigationTarget) => void;
}) {
  const [ctaHover, setCtaHover] = useState(false);
  const isPriority = action.priority !== "normal";

  return (
    <div>
      {/* Section label */}
      <div style={{ display: "flex", alignItems: "center", gap: S[1] + 2, marginBottom: S[2] }}>
        {isPriority && (
          <span style={{ width: 6, height: 6, borderRadius: R.pill, background: accentColor, flexShrink: 0 }} />
        )}
        <span style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.07em",
        }}>
          Lo que {agentName} recomienda hacer
        </span>
      </div>

      {/* Card */}
      <div style={{
        background: C.white, border: `1px solid ${C.line}`,
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: R.md, padding: S[3],
      }}>
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold,
          color: C.ink, lineHeight: 1.3, marginBottom: S[1] + 2,
        }}>
          {action.title}
        </div>
        <div style={{
          fontFamily: T.sans, fontSize: T.sz.base, color: C.inkLight,
          lineHeight: 1.55, marginBottom: S[3],
        }}>
          {action.description}
        </div>

        {/* Primary CTA — the most important action in the drawer */}
        <button
          onClick={() => onNavigate(action.target)}
          onMouseEnter={() => setCtaHover(true)}
          onMouseLeave={() => setCtaHover(false)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: S[2], width: "100%",
            fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.bold,
            color: C.white, background: accentColor,
            border: "none", borderRadius: R.md,
            padding: `${S[2] + 2}px ${S[4]}px`,
            cursor: "pointer", lineHeight: 1,
            boxShadow: ctaHover ? E.md : E.sm,
            transform: ctaHover ? "translateY(-1px)" : "translateY(0)",
            transition: "box-shadow 140ms ease, transform 140ms ease",
          }}
        >
          <span>{action.ctaLabel}</span>
          <span style={{ fontSize: T.sz.lg, lineHeight: 1 }}>→</span>
        </button>
      </div>
    </div>
  );
}

function EmptyRecommendation({ agentName, accentColor }: { agentName: string; accentColor: string }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: S[1] + 2, marginBottom: S[2] }}>
        <span style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.07em",
        }}>
          Análisis de {agentName}
        </span>
      </div>
      <div style={{
        background: C.white, border: `1px solid ${C.line}`,
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: R.md, padding: `${S[3]}px ${S[3]}px`,
      }}>
        <span style={{ fontFamily: T.sans, fontSize: T.sz.base, color: C.inkLight }}>
          {agentName} no ha detectado elementos que requieran acción inmediata en esta categoría.
        </span>
      </div>
    </div>
  );
}

// ── Executive Impact Block ────────────────────────────────────────────────────

function ExecutiveImpactBlock({
  impactLabel, riskLabel, urgency, areaLabel,
}: {
  impactLabel: string;
  riskLabel:   string;
  urgency:     UrgencyLevel;
  areaLabel:   string;
}) {
  const urgencyColor = urgency === "Alta"  ? C.amber
                     : urgency === "Media" ? C.blue
                     : C.green;

  return (
    <div>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
        color: C.inkFaint, textTransform: "uppercase" as const,
        letterSpacing: "0.07em", display: "block", marginBottom: S[2],
      }}>
        Impacto estimado
      </span>
      <div style={{
        background: C.white, border: `1px solid ${C.line}`,
        borderRadius: R.md, overflow: "hidden",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          <ImpactCell label="Impacto"  value={impactLabel} valueColor={C.ink}        hasBorderRight hasBorderBottom />
          <ImpactCell label="Riesgo"   value={riskLabel}   valueColor={C.inkMid}     hasBorderBottom />
          <ImpactCell label="Urgencia" value={urgency}     valueColor={urgencyColor} hasBorderRight />
          <ImpactCell label="Área"     value={areaLabel}   valueColor={C.inkMid} />
        </div>
      </div>
    </div>
  );
}

function ImpactCell({
  label, value, valueColor, hasBorderRight, hasBorderBottom,
}: {
  label:            string;
  value:            string;
  valueColor:       string;
  hasBorderRight?:  boolean;
  hasBorderBottom?: boolean;
}) {
  return (
    <div style={{
      padding: `${S[2]}px ${S[3]}px`,
      borderRight:  hasBorderRight  ? `1px solid ${C.lineSubtle}` : "none",
      borderBottom: hasBorderBottom ? `1px solid ${C.lineSubtle}` : "none",
    }}>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost, letterSpacing: "0.04em", marginBottom: 3,
      }}>
        {label}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: valueColor, lineHeight: 1.3 }}>
        {value}
      </div>
    </div>
  );
}

// ── Ask Agent Block ───────────────────────────────────────────────────────────

function AskAgentBlock({
  agentName, category,
}: {
  agentName: string;
  category:  DrawerCategoryKey;
}) {
  const ws = AGENT_WORKSPACE[category];

  return (
    <div>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
        color: C.inkFaint, textTransform: "uppercase" as const,
        letterSpacing: "0.07em", display: "block", marginBottom: S[2],
      }}>
        Preguntarle a {agentName}
      </span>

      <div style={{ display: "flex", flexDirection: "column" as const, gap: S[1] + 2 }}>
        {ws.suggestedQuestions.map((q, i) => (
          <div
            key={i}
            title="Próximamente · Requiere conexión al agente"
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: S[2], padding: `${S[2]}px ${S[3]}px`,
              background: C.white, border: `1px solid ${C.line}`,
              borderRadius: R.md, cursor: "default",
            }}
          >
            <span style={{
              fontFamily: T.mono, fontSize: T.sz.base, color: C.inkMid,
              lineHeight: 1.4, flex: 1,
            }}>
              {q.text}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkGhost, flexShrink: 0 }}>
              →
            </span>
          </div>
        ))}
      </div>

      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost,
        textAlign: "center" as const, marginTop: S[2],
      }}>
        Próximamente · Requiere conexión al agente
      </div>
    </div>
  );
}

// ── Quick Action Mini-Cards ───────────────────────────────────────────────────

function QuickActionMiniCards({
  actions, onNavigate, onAction,
}: {
  actions:    QuickAction[];
  onNavigate: (dest: CopilotNavigationTarget) => void;
  onAction:   (kind: CopilotActionKind) => void;
}) {
  return (
    <div>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
        color: C.inkFaint, textTransform: "uppercase" as const,
        letterSpacing: "0.07em", display: "block", marginBottom: S[2],
      }}>
        Acciones disponibles
      </span>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
        {actions.map((action, i) => (
          <QuickActionMiniCard
            key={i}
            label={action.label}
            description={action.description}
            target={action.target}
            actionKind={action.actionKind}
            onNavigate={onNavigate}
            onAction={onAction}
          />
        ))}
      </div>
    </div>
  );
}

function QuickActionMiniCard({
  label, description, target, actionKind, onNavigate, onAction,
}: {
  label:       string;
  description: string;
  target:      CopilotNavigationTarget | null;
  actionKind?: CopilotActionKind;
  onNavigate:  (dest: CopilotNavigationTarget) => void;
  onAction:    (kind: CopilotActionKind) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isActionCard = !!actionKind && actionKind !== "OPEN_MODULE";
  const meta         = target ? NAVIGATION_META[target] : null;
  const active       = !!target || isActionCard;

  const handleClick = () => {
    if (!active) return;
    if (isActionCard && actionKind) {
      onAction(actionKind);
    } else if (target) {
      onNavigate(target);
    }
  };

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "flex-start", gap: S[2],
        padding: `${S[2] + 2}px ${S[3]}px`,
        background: hovered && active ? C.surfaceAlt : C.white,
        border: `1px solid ${hovered && active ? C.inkGhost : C.line}`,
        borderRadius: R.md,
        cursor: active ? "pointer" : "default",
        transition: "background 120ms ease, border-color 120ms ease",
      }}
    >
      {/* Icon box */}
      <div style={{
        width: 30, height: 30, borderRadius: R.sm,
        background: C.surfaceAlt,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, marginTop: 1,
      }}>
        <DestinationIcon target={target} size={14} />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: S[1] }}>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold,
            color: active ? C.ink : C.inkFaint, lineHeight: 1.3,
          }}>
            {label}
          </span>
          {meta && (
            <span style={{
              fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost, flexShrink: 0,
            }}>
              {meta.module}
            </span>
          )}
        </div>
        <div style={{
          fontFamily: T.sans, fontSize: T.sz.xs, color: C.inkLight,
          lineHeight: 1.45, marginTop: 2,
        }}>
          {description}
        </div>
        {active && (
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost,
            marginTop: 3, opacity: hovered ? 1 : 0.5,
            transition: "opacity 120ms ease",
          }}>
            {isActionCard ? "Ejecutar →" : `${meta?.label ?? "Abrir"} →`}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Elements Found Section ────────────────────────────────────────────────────

function ElementsFoundSection({
  category, viewModel, sections, count,
}: {
  category:  DrawerCategory;
  viewModel: CopilotViewModel;
  sections:  AgentSectionLabels;
  count:     number;
}) {
  if (count === 0) return null;

  return (
    <div style={{ borderTop: `1px solid ${C.line}` }}>
      <div style={{
        padding: `${S[2] + 2}px ${S[4]}px`,
        borderBottom: `1px solid ${C.lineSubtle}`,
        background: C.surfaceAlt,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.07em",
        }}>
          Elementos encontrados
        </span>
        <span style={{
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost,
        }}>
          {count} elemento{count !== 1 ? "s" : ""}
        </span>
      </div>

      <DrawerContent category={category} viewModel={viewModel} sections={sections} />
    </div>
  );
}

// ── Workspace Tabs ────────────────────────────────────────────────────────────

type WorkspaceTab = "actividad" | "modulos" | "plan" | "estado";

const WORKSPACE_TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "actividad", label: "Actividad" },
  { id: "modulos",   label: "Módulos"   },
  { id: "plan",      label: "Plan"      },
  { id: "estado",    label: "Estado"    },
];

function WorkspaceTabs({
  category, onNavigate,
}: {
  category:   DrawerCategoryKey;
  onNavigate: (dest: CopilotNavigationTarget) => void;
}) {
  const [active, setActive] = useState<WorkspaceTab>("actividad");
  const ws = AGENT_WORKSPACE[category];

  return (
    <div style={{ borderTop: `1px solid ${C.line}` }}>
      {/* Tab row */}
      <div style={{
        display: "flex", background: C.surfaceAlt,
        borderBottom: `1px solid ${C.line}`,
      }}>
        {WORKSPACE_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            style={{
              flex: 1, padding: `${S[2]}px ${S[1]}px`,
              fontFamily: T.mono, fontSize: T.sz.xs,
              fontWeight: active === tab.id ? T.wt.semibold : T.wt.normal,
              color: active === tab.id ? C.ink : C.inkFaint,
              background: active === tab.id ? C.white : "transparent",
              border: "none",
              borderBottom: active === tab.id ? `2px solid ${C.blueDark}` : "2px solid transparent",
              cursor: "pointer",
              transition: "color 120ms ease, background 120ms ease",
              lineHeight: 1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: `${S[3]}px ${S[4]}px`, display: "flex", flexDirection: "column" as const, gap: S[2] }}>
        {active === "actividad" && ws.recentActivity.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: S[2], alignItems: "flex-start" }}>
            <span style={{
              fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost,
              flexShrink: 0, lineHeight: 1.5, minWidth: 64,
            }}>
              {item.timeAgo}
            </span>
            <span style={{ fontFamily: T.sans, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.5 }}>
              {item.description}
            </span>
          </div>
        ))}

        {active === "modulos" && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
            {ws.moduleCards.map((mc, i) => (
              <ModuleCard
                key={i}
                label={mc.label}
                statusLabel={mc.statusLabel}
                target={mc.target}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}

        {active === "plan" && ws.nextActions.map((action, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: S[1] + 2 }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green, flexShrink: 0, lineHeight: "17px" }}>
              ✓
            </span>
            <span style={{ fontFamily: T.sans, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.5 }}>
              {action.label}
            </span>
          </div>
        ))}

        {active === "estado" && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
            {ws.operationalStatus.map((status, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                <span style={{
                  width: 6, height: 6, borderRadius: R.pill, background: C.green,
                  flexShrink: 0, boxShadow: `0 0 0 2px ${C.greenLight}`,
                }} />
                <span style={{ fontFamily: T.sans, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.5 }}>
                  {status.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Module Card ───────────────────────────────────────────────────────────────

function ModuleCard({
  label, statusLabel, target, onNavigate,
}: {
  label:       string;
  statusLabel: string;
  target:      CopilotNavigationTarget;
  onNavigate:  (dest: CopilotNavigationTarget) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: S[2], padding: `${S[2]}px ${S[3]}px`,
        background: C.white, border: `1px solid ${hovered ? C.inkGhost : C.line}`,
        borderRadius: R.md,
        transition: "border-color 120ms ease",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold, color: C.ink,
          overflow: "hidden", whiteSpace: "nowrap" as const, textOverflow: "ellipsis",
          lineHeight: 1.3, marginBottom: 2,
        }}>
          {label}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, lineHeight: 1 }}>
          {statusLabel}
        </div>
      </div>
      <button
        onClick={() => onNavigate(target)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          color: hovered ? C.blueDark : C.inkMid,
          background: hovered ? C.blueLight : C.surfaceAlt,
          border: `1px solid ${hovered ? C.blueBorder : C.line}`,
          borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`,
          cursor: "pointer", whiteSpace: "nowrap" as const, lineHeight: 1,
          transition: "all 120ms ease",
        }}
      >
        Abrir →
      </button>
    </div>
  );
}

// ── Drawer Footer ─────────────────────────────────────────────────────────────

function DrawerFooter({ onClose }: { onClose: () => void }) {
  const [backHover, setBackHover] = useState(false);

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: S[2], padding: `${S[2] + 2}px ${S[4]}px`,
      borderTop: `1px solid ${C.line}`, background: C.surface, flexShrink: 0,
    }}>
      <button
        onClick={onClose}
        onMouseEnter={() => setBackHover(true)}
        onMouseLeave={() => setBackHover(false)}
        style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.medium,
          color: backHover ? C.ink : C.inkLight,
          background: "transparent", border: "none",
          cursor: "pointer", padding: `${S[1]}px 0`,
          display: "flex", alignItems: "center", gap: S[1],
          transition: "color 120ms ease",
        }}
      >
        ← Volver a la oficina
      </button>
      <button
        onClick={onClose}
        style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.medium,
          color: C.inkLight, background: C.white,
          border: `1px solid ${C.line}`, borderRadius: R.sm,
          padding: `${S[1]}px ${S[2]}px`, cursor: "pointer", lineHeight: 1,
        }}
      >
        Cerrar
      </button>
    </div>
  );
}

// ── Destination Icons ─────────────────────────────────────────────────────────

function DestinationIcon({ target, size = 14 }: { target: CopilotNavigationTarget | null; size?: number }) {
  const str = {
    stroke: C.inkLight, strokeWidth: 1.75,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  const base = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", display: "block" as const };

  switch (target) {
    case "TASKS":
    case "APPROVALS":
      return <svg {...base}><polyline {...str} points="9 11 12 14 22 4"/><path {...str} d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
    case "CALENDAR":
      return <svg {...base}><rect {...str} x="3" y="4" width="18" height="18" rx="2"/><line {...str} x1="16" y1="2" x2="16" y2="6"/><line {...str} x1="8" y1="2" x2="8" y2="6"/><line {...str} x1="3" y1="10" x2="21" y2="10"/></svg>;
    case "REPORTS":
      return <svg {...base}><line {...str} x1="18" y1="20" x2="18" y2="10"/><line {...str} x1="12" y1="20" x2="12" y2="4"/><line {...str} x1="6" y1="20" x2="6" y2="14"/></svg>;
    case "CONCILIATION":
      return <svg {...base}><polyline {...str} points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
    case "TREASURY":
      return <svg {...base}><polyline {...str} points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline {...str} points="17 6 23 6 23 12"/></svg>;
    case "PORTFOLIO":
    case "COLLECTIONS":
      return <svg {...base}><rect {...str} x="2" y="7" width="20" height="14" rx="2"/><path {...str} d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>;
    case "COMMERCIAL":
    case "CUSTOMERS":
      return <svg {...base}><path {...str} d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle {...str} cx="9" cy="7" r="4"/><path {...str} d="M23 21v-2a4 4 0 0 0-3-3.87"/><path {...str} d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case "CLOSING":
      return <svg {...base}><path {...str} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline {...str} points="14 2 14 8 20 8"/><line {...str} x1="16" y1="13" x2="8" y2="13"/><line {...str} x1="16" y1="17" x2="8" y2="17"/></svg>;
    case "PLANNING":
      return <svg {...base}><circle {...str} cx="12" cy="12" r="10"/><polygon {...str} points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>;
    case "DOCUMENTS":
      return <svg {...base}><path {...str} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline {...str} points="14 2 14 8 20 8"/></svg>;
    case "MARKETING_STUDIO":
    case "PHOTO_STUDIO":
      return <svg {...base}><path {...str} d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>;
    case "ALERTS":
      return <svg {...base}><path {...str} d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path {...str} d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
    default:
      return <svg {...base}><circle {...str} cx="12" cy="12" r="10"/><line {...str} x1="12" y1="8" x2="12" y2="12"/><line {...str} x1="12" y1="16" x2="12.01" y2="16"/></svg>;
  }
}

// ── Content router ────────────────────────────────────────────────────────────

function DrawerContent({
  category, viewModel, sections,
}: {
  category:  DrawerCategory;
  viewModel: CopilotViewModel;
  sections:  AgentSectionLabels;
}) {
  switch (category) {
    case "activeWork":
      return <CopilotActiveWork items={viewModel.activeWork ?? []} sectionLabel={sections.activeWork} />;
    case "attention":
      return <CopilotAttentionList items={viewModel.attentionItems} maxItems={20} />;
    case "opportunities":
      return <CopilotOpportunitiesList opportunities={viewModel.opportunities} maxItems={20} />;
    case "pendingApprovals":
      return <CopilotPendingApprovals items={viewModel.pendingApprovals ?? []} sectionLabel={sections.pendingApprovals} />;
    case "followups":
      return <CopilotFollowups items={viewModel.followups ?? []} sectionLabel={sections.followups} />;
    case "recentActivity":
      return <CopilotCompletedWork items={viewModel.completedWork ?? []} sectionLabel={sections.completedWork} />;
    case "suggestions":
      return <CopilotSuggestionsList suggestions={viewModel.suggestions} maxItems={20} sectionLabel={sections.suggestions} />;
    case "insights":
      return <CopilotInsightsList insights={viewModel.insights} maxItems={20} sectionLabel={sections.insights} />;
    default:
      return null;
  }
}
