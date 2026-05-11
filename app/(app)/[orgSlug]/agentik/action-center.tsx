"use client";

/**
 * Centro de Acciones — Agentik Action Layer · Sprint 3
 *
 * Execution layer: accountability, aging, audit trail, filter panel, quick-close.
 *
 * Views:  Todas · Mis acciones · Vencen hoy · Vencidas · Sin responsable · Críticas · Completadas
 * KPIs:   Pendientes · Vencidas · Completadas semana · Sin responsable · Críticas · Tasa de cierre
 * Row:    Aging badge · Due-date countdown · Overdue indicator · Priority stripe · Audit trail
 * Quick:  Completar · Cancelar · Reasignar · Reprogramar — all inline, no modal
 */

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { formatDateCol } from "@/lib/utils/formatDate";
import type { CSSProperties } from "react";
import {
  serverCreateAction,
  serverListActions,
  serverCompleteAction,
  serverCancelAction,
  serverAssignAction,
  serverRescheduleAction,
  serverListNotifications,
  serverMarkNotifRead,
  serverMarkAllNotifsRead,
  serverListScheduledReports,
  serverToggleScheduledReport,
} from "./action-tasks";
import {
  ActionTaskStatus,
  ActionTaskType,
  ActionTaskPriority,
} from "@prisma/client";
import type { ActionTask, ActionTaskStats } from "@/lib/actions/service";
import type { Notification }    from "@prisma/client";
import type { ScheduledReport } from "@prisma/client";

// ── Label maps ────────────────────────────────────────────────────────────────

const STATUS_META: Record<ActionTaskStatus, { label: string; bg: string; color: string; dot: string }> = {
  PENDING:   { label: "Pendiente",  bg: "#fef9c3", color: "#92400e", dot: "#f59e0b" },
  SCHEDULED: { label: "Programada", bg: "#dbeafe", color: "#1d4ed8", dot: "#3b82f6" },
  RUNNING:   { label: "Ejecutando", bg: "#d1fae5", color: "#065f46", dot: "#22c55e" },
  COMPLETED: { label: "Completada", bg: "#f0fdf4", color: "#15803d", dot: "#22c55e" },
  FAILED:    { label: "Fallida",    bg: "#fee2e2", color: "#dc2626", dot: "#ef4444" },
  CANCELED:  { label: "Cancelada",  bg: "#f5f5f5", color: "#6b7280", dot: "#9ca3af" },
};

const PRIORITY_META: Record<ActionTaskPriority, { label: string; color: string; bg: string; stripe: string }> = {
  LOW:    { label: "Baja",    color: "#9ca3af", bg: "#f9fafb", stripe: "#d1d5db" },
  MEDIUM: { label: "Media",   color: "#f59e0b", bg: "#fffbeb", stripe: "#f59e0b" },
  HIGH:   { label: "Alta",    color: "#f97316", bg: "#fff7ed", stripe: "#f97316" },
  URGENT: { label: "Urgente", color: "#ef4444", bg: "#fef2f2", stripe: "#ef4444" },
};

const TYPE_LABELS: Record<ActionTaskType, string> = {
  CREAR_TAREA_COMERCIAL:        "Tarea Comercial",
  ASIGNAR_SEGUIMIENTO_VENDEDOR: "Seguimiento Vendedor",
  MARCAR_CLIENTE_RECUPERACION:  "Recuperación Cliente",
  GENERAR_INFORME:              "Generar Informe",
  PROGRAMAR_INFORME:            "Programar Informe",
  ABRIR_ALERTA_OPERATIVA:       "Alerta Operativa",
  CREAR_ACCION_COBRANZA:        "Acción de Cobranza",
  ESCALAR_A_GERENCIA:           "Escalar a Gerencia",
};

const SOURCE_LABELS: Record<string, string> = {
  agentik_copilot:   "Copiloto",
  bandeja_acciones:  "Bandeja IA",
  customer_360:      "Cliente 360",
  informes:          "Informes",
  control_comercial: "Comercial",
  torre_de_control:  "Torre Control",
  manual:            "Manual",
};

// ── Date / aging helpers ──────────────────────────────────────────────────────

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return formatDateCol(dt);
}

function fmtRelTime(d: Date | string): string {
  const dt   = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - dt.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)   return "ahora";
  if (mins < 60)  return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function daysOpen(createdAt: Date | string): number {
  const dt = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  return Math.floor((Date.now() - dt.getTime()) / 86_400_000);
}

function taskIsOverdue(t: ActionTask): boolean {
  if (!t.dueAt) return false;
  if (t.status === ActionTaskStatus.COMPLETED || t.status === ActionTaskStatus.CANCELED) return false;
  return new Date(t.dueAt) < new Date();
}

function taskDueToday(t: ActionTask): boolean {
  if (!t.dueAt) return false;
  if (t.status === ActionTaskStatus.COMPLETED || t.status === ActionTaskStatus.CANCELED) return false;
  return new Date(t.dueAt).toDateString() === new Date().toDateString();
}

function taskIsActive(t: ActionTask): boolean {
  return t.status !== ActionTaskStatus.COMPLETED && t.status !== ActionTaskStatus.CANCELED;
}

function taskCompletedThisWeek(t: ActionTask): boolean {
  if (t.status !== ActionTaskStatus.COMPLETED || !t.completedAt) return false;
  return new Date(t.completedAt) > new Date(Date.now() - 7 * 86_400_000);
}

function dueCountdown(dueAt: Date | string | null | undefined): string {
  if (!dueAt) return "";
  const dt   = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const diff = dt.getTime() - Date.now();
  const days = Math.ceil(diff / 86_400_000);
  if (days < -1)  return `vencida hace ${Math.abs(days)}d`;
  if (days === -1) return "vencida ayer";
  if (days === 0)  return "vence hoy";
  if (days === 1)  return "vence mañana";
  return `vence en ${days}d`;
}

// ── Accountability KPI computation ────────────────────────────────────────────

interface Kpis {
  pending:       number;
  overdue:       number;
  completedWeek: number;
  unassigned:    number;
  critical:      number;
  closeRate:     number;
}

function computeKpis(tasks: ActionTask[]): Kpis {
  const active   = tasks.filter(taskIsActive);
  const closed   = tasks.filter(t =>
    t.status === ActionTaskStatus.COMPLETED ||
    t.status === ActionTaskStatus.CANCELED  ||
    t.status === ActionTaskStatus.FAILED
  );
  const completed = tasks.filter(t => t.status === ActionTaskStatus.COMPLETED);

  return {
    pending:       tasks.filter(t => t.status === ActionTaskStatus.PENDING).length,
    overdue:       active.filter(taskIsOverdue).length,
    completedWeek: tasks.filter(taskCompletedThisWeek).length,
    unassigned:    active.filter(t => !t.assignedTo).length,
    critical:      active.filter(t => t.priority === ActionTaskPriority.URGENT || t.priority === ActionTaskPriority.HIGH).length,
    closeRate:     closed.length > 0 ? Math.round((completed.length / closed.length) * 100) : 0,
  };
}

// ── Execution views ───────────────────────────────────────────────────────────

type ExecView =
  | "ALL"
  | "MINE"
  | "DUE_TODAY"
  | "OVERDUE"
  | "UNASSIGNED"
  | "CRITICAL"
  | "COMPLETED_RECENT"
  | "NOTIFICATIONS"
  | "SCHEDULED";

const EXEC_VIEWS: { id: ExecView; label: string; icon: string }[] = [
  { id: "ALL",              label: "Todas",           icon: "📋" },
  { id: "MINE",             label: "Mis acciones",    icon: "👤" },
  { id: "DUE_TODAY",        label: "Vencen hoy",      icon: "📅" },
  { id: "OVERDUE",          label: "Vencidas",        icon: "🔴" },
  { id: "UNASSIGNED",       label: "Sin responsable", icon: "⚠"  },
  { id: "CRITICAL",         label: "Críticas",        icon: "🚨" },
  { id: "COMPLETED_RECENT", label: "Completadas",     icon: "✅" },
  { id: "NOTIFICATIONS",    label: "Notificaciones",  icon: "🔔" },
  { id: "SCHEDULED",        label: "Programadas",     icon: "⏰" },
];

function applyView(tasks: ActionTask[], view: ExecView, userEmail: string): ActionTask[] {
  switch (view) {
    case "ALL":              return tasks.filter(taskIsActive);
    case "MINE":             return tasks.filter(t => taskIsActive(t) && t.assignedTo === userEmail);
    case "DUE_TODAY":        return tasks.filter(taskDueToday);
    case "OVERDUE":          return tasks.filter(taskIsOverdue);
    case "UNASSIGNED":       return tasks.filter(t => taskIsActive(t) && !t.assignedTo);
    case "CRITICAL":         return tasks.filter(t => taskIsActive(t) && (t.priority === ActionTaskPriority.URGENT || t.priority === ActionTaskPriority.HIGH));
    case "COMPLETED_RECENT": return tasks.filter(taskCompletedThisWeek);
    default:                 return tasks;
  }
}

function viewCount(tasks: ActionTask[], view: ExecView, userEmail: string): number {
  return applyView(tasks, view, userEmail).length;
}

const VIEW_EMPTY: Record<ExecView, string> = {
  ALL:              "No hay acciones activas. Crea la primera.",
  MINE:             "No tienes acciones asignadas.",
  DUE_TODAY:        "No hay acciones que venzan hoy.",
  OVERDUE:          "No hay acciones vencidas. ¡Todo al día! ✅",
  UNASSIGNED:       "Todas las acciones tienen responsable asignado.",
  CRITICAL:         "No hay acciones críticas activas.",
  COMPLETED_RECENT: "No hay completadas esta semana.",
  NOTIFICATIONS:    "No tienes notificaciones.",
  SCHEDULED:        "No hay informes programados.",
};

// ── Filter state ──────────────────────────────────────────────────────────────

interface FilterState {
  assignedTo:   string;
  sourceModule: string;
  actionType:   string;
  priority:     string;
}

const EMPTY_FILTER: FilterState = { assignedTo: "", sourceModule: "", actionType: "", priority: "" };

function applyFilter(tasks: ActionTask[], f: FilterState): ActionTask[] {
  return tasks.filter(t => {
    if (f.assignedTo   && t.assignedTo   !== f.assignedTo)   return false;
    if (f.sourceModule && t.sourceModule  !== f.sourceModule) return false;
    if (f.actionType   && t.actionType    !== f.actionType)   return false;
    if (f.priority     && t.priority      !== f.priority)     return false;
    return true;
  });
}

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  title: string; description: string; actionType: ActionTaskType;
  targetType: string; targetLabel: string; priority: ActionTaskPriority;
  assignedTo: string; dueAt: string; sourceModule: string;
}

const EMPTY_FORM: FormState = {
  title: "", description: "", actionType: ActionTaskType.CREAR_TAREA_COMERCIAL,
  targetType: "", targetLabel: "", priority: ActionTaskPriority.MEDIUM,
  assignedTo: "", dueAt: "", sourceModule: "manual",
};

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, dot, highlight, onClick, active,
}: {
  label: string; value: string | number; sub?: string;
  dot?: string; highlight?: boolean; onClick?: () => void; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: "1 1 110px", minWidth: 100,
        background: active ? "#111" : highlight ? "#fef2f2" : "#fff",
        border: `1px solid ${active ? "#111" : highlight ? "#fca5a5" : "#e5e7eb"}`,
        borderRadius: 8, padding: "10px 12px",
        cursor: onClick ? "pointer" : "default",
        textAlign: "left", transition: "all 0.12s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
        {dot && <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: dot }} />}
        <span style={{
          fontSize: 9, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.06em", fontFamily: "monospace",
          color: active ? "#9ca3af" : highlight ? "#dc2626" : "#9ca3af",
        }}>
          {label}
        </span>
      </div>
      <div style={{
        fontSize: 22, fontWeight: 900, fontFamily: "monospace", lineHeight: 1,
        color: active ? "#fff" : highlight ? "#dc2626" : "#111",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 9, color: active ? "#6b7280" : "#9ca3af", marginTop: 2, fontFamily: "monospace" }}>
          {sub}
        </div>
      )}
    </button>
  );
}

// ── Audit trail row helper ────────────────────────────────────────────────────

function AuditRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <span style={{ color: "#9ca3af", fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}:{" "}
      </span>
      <span style={{ color: highlight ? "#dc2626" : "#374151", fontWeight: highlight ? 700 : 400, fontSize: 10 }}>
        {value}
      </span>
    </div>
  );
}

// ── ActionRow ─────────────────────────────────────────────────────────────────

function ActionRow({
  task, orgSlug, onUpdate,
}: { task: ActionTask; orgSlug: string; onUpdate: () => void }) {
  const [busy,          setBusy]          = useState(false);
  const [expanded,      setExpanded]      = useState(false);
  const [assigning,     setAssigning]     = useState(false);
  const [assignVal,     setAssignVal]     = useState(task.assignedTo ?? "");
  const [rescheduling,  setRescheduling]  = useState(false);
  const [rescheduleVal, setRescheduleVal] = useState(
    task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : ""
  );

  const statusM    = STATUS_META[task.status];
  const priorityM  = PRIORITY_META[task.priority];
  const typeLabel  = TYPE_LABELS[task.actionType] ?? task.actionType;
  const srcLabel   = task.sourceModule ? (SOURCE_LABELS[task.sourceModule] ?? task.sourceModule) : "Manual";
  const overdue    = taskIsOverdue(task);
  const dueLabel   = task.dueAt ? dueCountdown(task.dueAt) : "";
  const openDays   = daysOpen(task.createdAt);
  const canAct     = taskIsActive(task);

  async function doComplete() {
    setBusy(true);
    await serverCompleteAction(orgSlug, task.id);
    onUpdate(); setBusy(false);
  }
  async function doCancel() {
    if (!confirm("¿Cancelar esta acción?")) return;
    setBusy(true);
    await serverCancelAction(orgSlug, task.id);
    onUpdate(); setBusy(false);
  }
  async function doAssign() {
    if (!assignVal.trim()) return;
    setBusy(true);
    await serverAssignAction(orgSlug, task.id, assignVal.trim());
    setAssigning(false); onUpdate(); setBusy(false);
  }
  async function doReschedule() {
    setBusy(true);
    const dueAt = rescheduleVal ? new Date(rescheduleVal) : null;
    await serverRescheduleAction(orgSlug, task.id, dueAt);
    setRescheduling(false); onUpdate(); setBusy(false);
  }

  return (
    <div style={{
      borderBottom: "1px solid #f5f5f5",
      background:   overdue ? "#fffbfb" : "#fff",
      borderLeft:   `3px solid ${overdue ? "#ef4444" : priorityM.stripe}`,
    }}>
      <div style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>

          {/* ── Content ── */}
          <div style={{ flex: 1, minWidth: 220 }}>

            {/* Badge strip */}
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 5 }}>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "#f5f5f5", color: "#6b7280" }}>
                {typeLabel}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "#ede9fe", color: "#6d28d9" }}>
                {srcLabel}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: statusM.bg, color: statusM.color }}>
                {statusM.label}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: priorityM.bg, color: priorityM.color }}>
                ▲ {priorityM.label}
              </span>
              {openDays >= 3 && canAct && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
                  background: openDays >= 7 ? "#fff7ed" : "#fafafa",
                  color: openDays >= 7 ? "#c2410c" : "#9ca3af",
                }}>
                  ⏱ {openDays}d abierta
                </span>
              )}
              {overdue && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5" }}>
                  ⏰ VENCIDA
                </span>
              )}
            </div>

            {/* Title */}
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 3, lineHeight: 1.3 }}>
              {task.title}
            </div>

            {/* Description */}
            {task.description && (
              <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.4, marginBottom: 6 }}>
                {task.description}
              </div>
            )}

            {/* Traceability strip */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 10, color: "#9ca3af", marginBottom: 6 }}>
              <span>
                Hace <b style={{ color: "#555" }}>{fmtRelTime(task.createdAt)}</b>
              </span>
              {task.targetLabel && (
                <span>
                  Afecta <b style={{ color: "#555" }}>{task.targetLabel}</b>
                  {task.targetType ? ` (${task.targetType})` : ""}
                </span>
              )}
              {dueLabel && (
                <span style={{
                  color:      overdue ? "#dc2626" : dueLabel.includes("hoy") ? "#f59e0b" : "#9ca3af",
                  fontWeight: overdue ? 700 : 400,
                }}>
                  {dueLabel}
                </span>
              )}
            </div>

            {/* ── Quick-close: Reasignar + Reprogramar ── */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>

              {/* Reasignar */}
              {assigning ? (
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    autoFocus
                    type="text"
                    value={assignVal}
                    onChange={e => setAssignVal(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter")  doAssign();
                      if (e.key === "Escape") setAssigning(false);
                    }}
                    placeholder="Nombre o email"
                    style={{ ...INPUT_MINI, width: 175 }}
                    disabled={busy}
                  />
                  <button onClick={doAssign} disabled={busy || !assignVal.trim()} style={BTN_XS_PRIMARY}>
                    OK
                  </button>
                  <button onClick={() => setAssigning(false)} style={BTN_XS_GHOST}>✕</button>
                </div>
              ) : (
                <button
                  onClick={() => canAct && setAssigning(true)}
                  disabled={!canAct}
                  style={{
                    fontSize: 10, background: "none", border: "none",
                    cursor: canAct ? "pointer" : "default",
                    color: task.assignedTo ? "#7c3aed" : "#d1d5db",
                    padding: 0, fontFamily: "monospace",
                  }}
                  title={canAct ? "Hacer clic para reasignar" : undefined}
                >
                  {task.assignedTo ? `👤 ${task.assignedTo}` : "— sin asignar"}
                </button>
              )}

              {/* Reprogramar */}
              {canAct && (
                rescheduling ? (
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input
                      autoFocus
                      type="date"
                      value={rescheduleVal}
                      onChange={e => setRescheduleVal(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter")  doReschedule();
                        if (e.key === "Escape") setRescheduling(false);
                      }}
                      style={{ ...INPUT_MINI, width: 130 }}
                      disabled={busy}
                    />
                    <button onClick={doReschedule} disabled={busy} style={BTN_XS_PRIMARY}>OK</button>
                    <button onClick={() => setRescheduling(false)} style={BTN_XS_GHOST}>✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setRescheduling(true)}
                    style={{
                      fontSize: 9, background: "none", border: "none",
                      cursor: "pointer",
                      color: task.dueAt
                        ? overdue ? "#dc2626" : "#9ca3af"
                        : "#d1d5db",
                      padding: 0, fontFamily: "monospace",
                    }}
                    title="Reprogramar fecha límite"
                  >
                    {task.dueAt ? `📅 ${fmtDate(task.dueAt)}` : "📅 sin fecha"}
                  </button>
                )
              )}
            </div>

            {/* Result / error chips */}
            {task.status === ActionTaskStatus.COMPLETED && task.resultJson && (
              <div style={{ marginTop: 5, fontSize: 10, color: "#065f46", background: "#f0fdf4", borderRadius: 4, padding: "3px 8px" }}>
                ✓ {JSON.stringify(task.resultJson)}
              </div>
            )}
            {task.status === ActionTaskStatus.FAILED && task.errorMessage && (
              <div style={{ marginTop: 5, fontSize: 10, color: "#dc2626", background: "#fef2f2", borderRadius: 4, padding: "3px 8px" }}>
                ✗ {task.errorMessage}
              </div>
            )}
          </div>

          {/* ── Right: quick-close + expand ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0, alignItems: "flex-end" }}>
            {canAct ? (
              <>
                <button onClick={doComplete} disabled={busy} style={BTN_SM_PRIMARY}>
                  ✓ Completar
                </button>
                <button onClick={doCancel} disabled={busy} style={BTN_SM_DANGER}>
                  ✕ Cancelar
                </button>
              </>
            ) : task.completedAt ? (
              <span style={{ fontSize: 10, color: "#9ca3af", textAlign: "right" }}>
                {fmtDate(task.completedAt)}
              </span>
            ) : null}
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                fontSize: 9, background: "none", border: "none",
                cursor: "pointer", color: "#9ca3af",
                fontFamily: "monospace", padding: 0, marginTop: 2,
              }}
            >
              {expanded ? "▲ cerrar" : "▼ detalle"}
            </button>
          </div>
        </div>

        {/* ── Audit trail (expanded) ── */}
        {expanded && (
          <div style={{
            marginTop: 10, padding: "10px 12px",
            background: "#f8fafc", borderRadius: 6,
            border: "1px solid #e5e7eb",
          }}>
            <div style={{
              fontWeight: 700, fontSize: 9, textTransform: "uppercase",
              letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 8,
            }}>
              Trazabilidad completa
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "5px 20px",
            }}>
              <AuditRow label="ID"                  value={`${task.id.slice(0, 8)}…`} />
              <AuditRow label="Creada por"           value={task.createdBy} />
              <AuditRow label="Creada desde"         value={task.sourceModule ? (SOURCE_LABELS[task.sourceModule] ?? task.sourceModule) : "Manual"} />
              <AuditRow label="Asignada a"           value={task.assignedTo ?? "— sin asignar"} />
              <AuditRow label="Tipo de acción"       value={TYPE_LABELS[task.actionType] ?? task.actionType} />
              <AuditRow label="Prioridad"            value={PRIORITY_META[task.priority].label} />
              <AuditRow label="Estado"               value={STATUS_META[task.status].label} />
              {task.targetLabel && (
                <AuditRow
                  label="Afecta"
                  value={`${task.targetLabel}${task.targetType ? ` (${task.targetType})` : ""}`}
                />
              )}
              <AuditRow label="Creada"               value={fmtDate(task.createdAt)} />
              <AuditRow label="Última actualización" value={fmtDate(task.updatedAt)} />
              {task.dueAt && (
                <AuditRow label="Fecha límite" value={fmtDate(task.dueAt)} highlight={overdue} />
              )}
              {task.completedAt && (
                <AuditRow label="Completada" value={fmtDate(task.completedAt)} />
              )}
              {task.errorMessage && (
                <AuditRow label="Error" value={task.errorMessage} highlight />
              )}
            </div>
            {task.resultJson && (
              <div style={{ marginTop: 8 }}>
                <span style={{ color: "#9ca3af", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Resultado
                </span>
                <div style={{
                  marginTop: 3, fontFamily: "monospace", fontSize: 10,
                  color: "#065f46", background: "#f0fdf4",
                  padding: "5px 8px", borderRadius: 4,
                  whiteSpace: "pre-wrap", wordBreak: "break-all",
                }}>
                  {JSON.stringify(task.resultJson, null, 2)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Filter panel ──────────────────────────────────────────────────────────────

function FilterPanel({
  filter, onChange, onReset, tasks,
}: {
  filter: FilterState;
  onChange: (k: keyof FilterState, v: string) => void;
  onReset: () => void;
  tasks: ActionTask[];
}) {
  const owners  = [...new Set(tasks.map(t => t.assignedTo).filter(Boolean) as string[])].sort();
  const modules = [...new Set(tasks.map(t => t.sourceModule).filter(Boolean) as string[])].sort();
  const hasFilter = Object.values(filter).some(Boolean);

  return (
    <div style={{
      padding: "12px 14px", background: "#fafafa",
      border: "1px solid #e5e7eb", borderRadius: 7, marginBottom: 12,
    }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>

        {/* Asignado a */}
        <div>
          <FL>Asignado a</FL>
          <select value={filter.assignedTo} onChange={e => onChange("assignedTo", e.target.value)} style={SEL}>
            <option value="">Todos</option>
            {owners.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        {/* Módulo */}
        <div>
          <FL>Módulo</FL>
          <select value={filter.sourceModule} onChange={e => onChange("sourceModule", e.target.value)} style={SEL}>
            <option value="">Todos</option>
            {modules.map(m => <option key={m} value={m}>{SOURCE_LABELS[m] ?? m}</option>)}
          </select>
        </div>

        {/* Tipo */}
        <div>
          <FL>Tipo de acción</FL>
          <select value={filter.actionType} onChange={e => onChange("actionType", e.target.value)} style={SEL}>
            <option value="">Todos</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {/* Prioridad */}
        <div>
          <FL>Prioridad</FL>
          <select value={filter.priority} onChange={e => onChange("priority", e.target.value)} style={SEL}>
            <option value="">Todas</option>
            {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {hasFilter && (
          <button onClick={onReset} style={{
            fontSize: 10, background: "none", border: "1px solid #e5e7eb",
            borderRadius: 4, cursor: "pointer", color: "#6b7280",
            padding: "5px 10px", fontFamily: "monospace", alignSelf: "flex-end",
          }}>
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
}

function FL({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
      {children}
    </div>
  );
}

// ── Nueva Acción form ─────────────────────────────────────────────────────────

function NuevaAccionForm({
  orgSlug, onCreated, onClose,
}: { orgSlug: string; onCreated: () => void; onClose: () => void }) {
  const [form,  setForm]  = useState<FormState>(EMPTY_FORM);
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError("El título es obligatorio."); return; }
    setBusy(true); setError(null);
    const res = await serverCreateAction(orgSlug, {
      title:        form.title.trim(),
      description:  form.description.trim() || undefined,
      actionType:   form.actionType,
      targetType:   form.targetType.trim()  || undefined,
      targetLabel:  form.targetLabel.trim() || undefined,
      sourceModule: form.sourceModule || "manual",
      priority:     form.priority,
      assignedTo:   form.assignedTo.trim()  || undefined,
      dueAt:        form.dueAt ? new Date(form.dueAt) : undefined,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    onCreated();
  }

  return (
    <div style={{
      border: "1px solid #c4b5fd", borderTop: "3px solid #7c3aed",
      borderRadius: 8, padding: "16px 18px 14px", marginBottom: 14, background: "#fafafa",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#111" }}>Nueva Acción</div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#9ca3af" }}>✕</button>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <FormLabel>Título *</FormLabel>
            <input type="text" value={form.title} onChange={e => set("title", e.target.value)} placeholder="¿Qué hay que hacer?" style={{ ...INPUT_STYLE, width: "100%", boxSizing: "border-box" }} disabled={busy} required />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <FormLabel>Descripción</FormLabel>
            <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} style={{ ...INPUT_STYLE, width: "100%", boxSizing: "border-box", resize: "vertical" }} disabled={busy} />
          </div>
          <div>
            <FormLabel>Tipo *</FormLabel>
            <select value={form.actionType} onChange={e => set("actionType", e.target.value as ActionTaskType)} style={{ ...INPUT_STYLE, width: "100%" }} disabled={busy}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <FormLabel>Prioridad</FormLabel>
            <select value={form.priority} onChange={e => set("priority", e.target.value as ActionTaskPriority)} style={{ ...INPUT_STYLE, width: "100%" }} disabled={busy}>
              {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <FormLabel>Asignar a</FormLabel>
            <input type="text" value={form.assignedTo} onChange={e => set("assignedTo", e.target.value)} placeholder="Nombre o email" style={{ ...INPUT_STYLE, width: "100%", boxSizing: "border-box" }} disabled={busy} />
          </div>
          <div>
            <FormLabel>Fecha límite</FormLabel>
            <input type="date" value={form.dueAt} onChange={e => set("dueAt", e.target.value)} style={{ ...INPUT_STYLE, width: "100%", boxSizing: "border-box" }} disabled={busy} />
          </div>
          <div>
            <FormLabel>Objetivo</FormLabel>
            <input type="text" value={form.targetLabel} onChange={e => set("targetLabel", e.target.value)} placeholder="Ej: Distribuciones López" style={{ ...INPUT_STYLE, width: "100%", boxSizing: "border-box" }} disabled={busy} />
          </div>
          <div>
            <FormLabel>Módulo origen</FormLabel>
            <select value={form.sourceModule} onChange={e => set("sourceModule", e.target.value)} style={{ ...INPUT_STYLE, width: "100%" }} disabled={busy}>
              <option value="manual">Manual</option>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        {error && (
          <div style={{ marginTop: 10, fontSize: 11, color: "#dc2626", background: "#fef2f2", borderRadius: 4, padding: "6px 10px" }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="submit" disabled={busy || !form.title.trim()} style={{
            background: busy ? "#c4b5fd" : "#7c3aed", color: "#fff",
            border: "none", borderRadius: 6, padding: "8px 18px",
            fontSize: 12, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontFamily: "monospace",
          }}>
            {busy ? "Creando…" : "Crear acción →"}
          </button>
          <button type="button" onClick={onClose} disabled={busy} style={BTN_SM_GHOST}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

// ── Notifications panel ───────────────────────────────────────────────────────

const NOTIF_TYPE_ICONS: Record<string, string> = {
  ACTION_ASSIGNED:        "👤",
  ACTION_REASSIGNED:      "🔄",
  ACTION_DUE_TODAY:       "📅",
  ACTION_OVERDUE:         "⚠",
  ACTION_COMPLETED:       "✅",
  SCHEDULED_REPORT_READY: "📊",
  SCHEDULED_REPORT_FAILED:"❌",
  SYSTEM:                 "🔔",
};
const NOTIF_TYPE_LABELS: Record<string, string> = {
  ACTION_ASSIGNED:        "Asignación",
  ACTION_REASSIGNED:      "Reasignación",
  ACTION_DUE_TODAY:       "Vence hoy",
  ACTION_OVERDUE:         "Vencida",
  ACTION_COMPLETED:       "Completada",
  SCHEDULED_REPORT_READY: "Informe listo",
  SCHEDULED_REPORT_FAILED:"Error en informe",
  SYSTEM:                 "Sistema",
};

function NotificationsPanel({
  orgSlug, notifications, onMarkRead, onMarkAll, loading,
}: {
  orgSlug:       string;
  notifications: Notification[];
  onMarkRead:    (id: string) => Promise<void>;
  onMarkAll:     () => Promise<void>;
  loading:       boolean;
}) {
  const unread = notifications.filter(n => !n.isRead).length;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          {loading ? "Cargando…" : `${notifications.length} notificación${notifications.length !== 1 ? "es" : ""}${unread > 0 ? ` · ${unread} sin leer` : ""}`}
        </div>
        {unread > 0 && (
          <button onClick={onMarkAll} style={{ fontSize: 10, color: "#7c3aed", background: "none", border: "none", cursor: "pointer", fontFamily: "monospace", fontWeight: 700 }}>
            Marcar todas leídas
          </button>
        )}
      </div>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        {notifications.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", fontSize: 12, color: "#9ca3af" }}>
            No hay notificaciones.
          </div>
        ) : notifications.map(n => (
          <div
            key={n.id}
            onClick={() => !n.isRead && onMarkRead(n.id)}
            style={{
              padding: "11px 16px", borderBottom: "1px solid #f5f5f5",
              background: n.isRead ? "#fff" : "#faf5ff",
              cursor: n.isRead ? "default" : "pointer",
              display: "flex", gap: 10, alignItems: "flex-start",
              borderLeft: `3px solid ${n.isRead ? "#f5f5f5" : "#7c3aed"}`,
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{NOTIF_TYPE_ICONS[n.type] ?? "🔔"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: n.isRead ? 400 : 700, fontSize: 12, color: "#111", marginBottom: 2 }}>
                {n.title}
              </div>
              {n.body && <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.4, marginBottom: 3 }}>{n.body}</div>}
              <div style={{ fontSize: 9, color: "#bbb" }}>
                {NOTIF_TYPE_LABELS[n.type] ?? n.type} · {fmtDate(new Date(n.createdAt))}
              </div>
            </div>
            {!n.isRead && (
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#7c3aed", flexShrink: 0, marginTop: 4 }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Scheduled reports panel ───────────────────────────────────────────────────

const FREQ_LABELS: Record<string, string> = {
  ONCE:    "Una vez",
  WEEKLY:  "Semanal",
  MONTHLY: "Mensual",
};

function ScheduledPanel({
  orgSlug, reports, onToggle, loading,
}: {
  orgSlug:   string;
  reports:   ScheduledReport[];
  onToggle:  (id: string, active: boolean) => Promise<void>;
  loading:   boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
        {loading ? "Cargando…" : `${reports.length} informe${reports.length !== 1 ? "s" : ""} programado${reports.length !== 1 ? "s" : ""}`}
      </div>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        {reports.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", fontSize: 12, color: "#9ca3af" }}>
            No hay informes programados.<br />
            <span style={{ fontSize: 11 }}>Usa "Programar seguimiento" en Informes o la Torre de Control.</span>
          </div>
        ) : reports.map(r => (
          <div key={r.id} style={{ padding: "12px 16px", borderBottom: "1px solid #f5f5f5", background: "#fff" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "#ede9fe", color: "#6d28d9" }}>
                    {FREQ_LABELS[r.frequency] ?? r.frequency}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: r.isActive ? "#f0fdf4" : "#f5f5f5", color: r.isActive ? "#15803d" : "#9ca3af" }}>
                    {r.isActive ? "Activo" : "Pausado"}
                  </span>
                  {r.runCount > 0 && (
                    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "#f5f5f5", color: "#6b7280" }}>
                      {r.runCount} ejecución{r.runCount !== 1 ? "es" : ""}
                    </span>
                  )}
                </div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#111", marginBottom: 2 }}>{r.title}</div>
                <div style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic", marginBottom: 4 }}>"{r.query}"</div>
                <div style={{ display: "flex", gap: 14, fontSize: 10, color: "#9ca3af", flexWrap: "wrap" }}>
                  {r.nextRunAt && (
                    <span>Próxima: <b style={{ color: "#555" }}>{fmtDate(r.nextRunAt)}</b></span>
                  )}
                  {r.lastRunAt && (
                    <span>Última: <b style={{ color: "#555" }}>{fmtDate(r.lastRunAt)}</b></span>
                  )}
                  <span>Por: <b style={{ color: "#555" }}>{r.createdBy}</b></span>
                </div>
                {r.lastError && (
                  <div style={{ marginTop: 5, fontSize: 10, color: "#dc2626", background: "#fef2f2", borderRadius: 4, padding: "3px 8px" }}>
                    ✗ {r.lastError}
                  </div>
                )}
              </div>
              <button
                onClick={() => onToggle(r.id, !r.isActive)}
                style={{
                  fontSize: 9, fontWeight: 700, padding: "4px 10px", borderRadius: 4,
                  border: r.isActive ? "1px solid #fca5a5" : "1px solid #bbf7d0",
                  background: r.isActive ? "#fef2f2" : "#f0fdf4",
                  color: r.isActive ? "#dc2626" : "#15803d",
                  cursor: "pointer", fontFamily: "monospace", flexShrink: 0,
                }}
              >
                {r.isActive ? "Pausar" : "Activar"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ActionCenter({
  orgSlug,
  userEmail,
}: {
  orgSlug:   string;
  userEmail: string;
}) {
  const [tasks,         setTasks]         = useState<ActionTask[]>([]);
  const [stats,         setStats]         = useState<ActionTaskStats | null>(null);
  const [execView,      setExecView]      = useState<ExecView>("ALL");
  const [filter,        setFilter]        = useState<FilterState>(EMPTY_FILTER);
  const [showFilter,    setShowFilter]    = useState(false);
  const [showForm,      setShowForm]      = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  // Sprint 4 state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifsLoading, setNotifsLoading] = useState(false);
  const [schedReports,  setSchedReports]  = useState<ScheduledReport[]>([]);
  const [schedLoading,  setSchedLoading]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const res = await serverListActions(orgSlug);
    if (res.ok) { setTasks(res.data.tasks); setStats(res.data.stats); }
    else        { setError(res.error); }
    setLoading(false);
  }, [orgSlug]);

  const loadNotifs = useCallback(async () => {
    setNotifsLoading(true);
    const res = await serverListNotifications(orgSlug, false);
    if (res.ok) setNotifications(res.data);
    setNotifsLoading(false);
  }, [orgSlug]);

  const loadSched = useCallback(async () => {
    setSchedLoading(true);
    const res = await serverListScheduledReports(orgSlug, false);
    if (res.ok) setSchedReports(res.data);
    setSchedLoading(false);
  }, [orgSlug]);

  useEffect(() => { load(); }, [load]);

  // Load Sprint 4 data when their view becomes active
  useEffect(() => {
    if (execView === "NOTIFICATIONS") loadNotifs();
    if (execView === "SCHEDULED")     loadSched();
  }, [execView, loadNotifs, loadSched]);

  // Two-stage filter: exec view → attribute filters
  const viewTasks    = applyView(tasks, execView, userEmail);
  const visibleTasks = applyFilter(viewTasks, filter);
  const kpis         = computeKpis(tasks);
  const hasFilter    = Object.values(filter).some(Boolean);

  function changeFilter(k: keyof FilterState, v: string) {
    setFilter(f => ({ ...f, [k]: v }));
  }

  const switchView = (v: ExecView) => {
    setExecView(v);
    setShowFilter(false);
  };

  return (
    <div>

      {/* ════════ ACCOUNTABILITY KPIs ════════ */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <KpiCard
          label="Pendientes"       value={kpis.pending}
          dot="#f59e0b"
          onClick={() => switchView("ALL")}
          active={execView === "ALL"}
        />
        <KpiCard
          label="Vencidas"         value={kpis.overdue}
          dot="#ef4444"           highlight={kpis.overdue > 0}
          onClick={() => switchView("OVERDUE")}
          active={execView === "OVERDUE"}
        />
        <KpiCard
          label="Completadas / 7d" value={kpis.completedWeek}
          dot="#22c55e"
          onClick={() => switchView("COMPLETED_RECENT")}
          active={execView === "COMPLETED_RECENT"}
        />
        <KpiCard
          label="Sin responsable"  value={kpis.unassigned}
          dot="#9ca3af"           highlight={kpis.unassigned > 0}
          onClick={() => switchView("UNASSIGNED")}
          active={execView === "UNASSIGNED"}
        />
        <KpiCard
          label="Críticas"         value={kpis.critical}
          dot="#f97316"           highlight={kpis.critical > 0}
          onClick={() => switchView("CRITICAL")}
          active={execView === "CRITICAL"}
        />
        <KpiCard
          label="Tasa de cierre"   value={`${kpis.closeRate}%`}
          sub="completadas / cerradas"
        />
      </div>

      {/* ════════ EXECUTION VIEW TABS ════════ */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        {EXEC_VIEWS.map(v => {
          const count    = v.id === "NOTIFICATIONS"
            ? notifications.filter(n => !n.isRead).length
            : v.id === "SCHEDULED"
            ? schedReports.filter(r => r.isActive).length
            : viewCount(tasks, v.id, userEmail);
          const isActive = execView === v.id;
          const isAlert  = (v.id === "OVERDUE" || v.id === "UNASSIGNED" || v.id === "NOTIFICATIONS") && count > 0;
          return (
            <button
              key={v.id}
              onClick={() => setExecView(v.id)}
              style={{
                fontSize: 10, fontWeight: 700, padding: "5px 10px",
                borderRadius: 5, cursor: "pointer", fontFamily: "monospace",
                background: isActive ? "#111" : isAlert ? "#fef2f2" : "#f9fafb",
                color:      isActive ? "#fff"  : isAlert ? "#dc2626" : "#6b7280",
                border:     isActive ? "1px solid #111" : isAlert ? "1px solid #fca5a5" : "1px solid #e5e7eb",
                display: "flex", alignItems: "center", gap: 5,
              }}
            >
              <span>{v.icon}</span>
              <span>{v.label}</span>
              {count > 0 && (
                <span style={{
                  background: isActive ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.07)",
                  borderRadius: 10, padding: "0 5px", fontSize: 9,
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}

        {/* Toolbar: Filtros · + Nueva · ↺ */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            onClick={() => setShowFilter(f => !f)}
            style={{
              fontSize: 10, fontWeight: 700, padding: "5px 11px",
              borderRadius: 5, cursor: "pointer", fontFamily: "monospace",
              background: showFilter ? "#ede9fe" : "#f9fafb",
              color:      showFilter ? "#7c3aed" : "#6b7280",
              border:     showFilter ? "1px solid #c4b5fd" : "1px solid #e5e7eb",
            }}
          >
            ⚙ Filtros{hasFilter ? " ●" : ""}
          </button>
          <button
            onClick={() => setShowForm(f => !f)}
            style={{
              background: "#111", color: "#fff", border: "none",
              borderRadius: 5, padding: "5px 12px",
              fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "monospace",
            }}
          >
            {showForm ? "✕" : "+ Nueva"}
          </button>
          <button
            onClick={load}
            disabled={loading}
            style={{
              fontSize: 12, background: "none", border: "1px solid #e5e7eb",
              borderRadius: 5, cursor: "pointer", color: "#9ca3af",
              padding: "5px 10px", fontFamily: "monospace",
            }}
            title="Actualizar"
          >
            {loading ? "↻" : "↺"}
          </button>
        </div>
      </div>

      {/* ════════ FILTER PANEL ════════ */}
      {showFilter && (
        <FilterPanel
          filter={filter}
          onChange={changeFilter}
          onReset={() => setFilter(EMPTY_FILTER)}
          tasks={tasks}
        />
      )}

      {/* ════════ NUEVA ACCIÓN FORM ════════ */}
      {showForm && (
        <NuevaAccionForm
          orgSlug={orgSlug}
          onCreated={() => { setShowForm(false); load(); }}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* ════════ ERROR ════════ */}
      {error && (
        <div style={{ padding: "10px 14px", background: "#fef2f2", color: "#dc2626", borderRadius: 6, fontSize: 11, marginBottom: 12 }}>
          Error: {error}
        </div>
      )}

      {/* ════════ NOTIFICATIONS VIEW ════════ */}
      {execView === "NOTIFICATIONS" && (
        <NotificationsPanel
          orgSlug={orgSlug}
          notifications={notifications}
          loading={notifsLoading}
          onMarkRead={async (id) => {
            await serverMarkNotifRead(orgSlug, id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
          }}
          onMarkAll={async () => {
            await serverMarkAllNotifsRead(orgSlug);
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
          }}
        />
      )}

      {/* ════════ SCHEDULED REPORTS VIEW ════════ */}
      {execView === "SCHEDULED" && (
        <ScheduledPanel
          orgSlug={orgSlug}
          reports={schedReports}
          loading={schedLoading}
          onToggle={async (id, active) => {
            await serverToggleScheduledReport(orgSlug, id, active);
            setSchedReports(prev => prev.map(r => r.id === id ? { ...r, isActive: active } : r));
          }}
        />
      )}

      {/* ════════ COUNT ROW ════════ */}
      {!error && execView !== "NOTIFICATIONS" && execView !== "SCHEDULED" && (
        <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>
            {loading
              ? "Cargando…"
              : `${visibleTasks.length} acción${visibleTasks.length !== 1 ? "es" : ""}${hasFilter ? " (filtradas)" : ""}`}
          </span>
          {execView !== "ALL" && (
            <button
              onClick={() => setExecView("ALL")}
              style={{ fontSize: 9, color: "#7c3aed", background: "none", border: "none", cursor: "pointer", fontFamily: "monospace" }}
            >
              Ver todas →
            </button>
          )}
        </div>
      )}

      {/* ════════ TASK LIST ════════ */}
      {execView !== "NOTIFICATIONS" && execView !== "SCHEDULED" && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          {loading && !tasks.length ? (
            <div style={{ padding: "32px", textAlign: "center", fontSize: 12, color: "#9ca3af" }}>
              Cargando acciones…
            </div>
          ) : visibleTasks.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>
                {execView === "OVERDUE" || execView === "UNASSIGNED" ? "✅" : "🎯"}
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 12 }}>
                {VIEW_EMPTY[execView]}
              </div>
              {execView === "ALL" && !showForm && (
                <button
                  onClick={() => setShowForm(true)}
                  style={{
                    background: "#7c3aed", color: "#fff", border: "none",
                    borderRadius: 6, padding: "8px 18px", fontSize: 11,
                    fontWeight: 700, cursor: "pointer", fontFamily: "monospace",
                  }}
                >
                  + Crear primera acción
                </button>
              )}
            </div>
          ) : (
            visibleTasks.map(task => (
              <ActionRow key={task.id} task={task} orgSlug={orgSlug} onUpdate={load} />
            ))
          )}
        </div>
      )}

      {/* ════════ FOOTER ════════ */}
      <div style={{ fontSize: 10, color: "#9ca3af", textAlign: "right", marginTop: 6 }}>
        {tasks.filter(t => t.status === ActionTaskStatus.RUNNING).length > 0 && (
          <>
            <span style={{
              display: "inline-block", width: 6, height: 6, borderRadius: "50%",
              background: "#22c55e", marginRight: 4, verticalAlign: "middle",
            }} />
            {tasks.filter(t => t.status === ActionTaskStatus.RUNNING).length} ejecutándose ·{" "}
          </>
        )}
        {stats?.total ?? tasks.length} acciones en total · actualización manual
      </div>
    </div>
  );
}

// ── Style atoms ───────────────────────────────────────────────────────────────

const INPUT_STYLE: CSSProperties = {
  border: "1px solid #e5e7eb", borderRadius: 5, padding: "7px 9px",
  fontSize: 11, fontFamily: "monospace", outline: "none", background: "#fff",
};

const INPUT_MINI: CSSProperties = {
  border: "1px solid #c4b5fd", borderRadius: 4, padding: "3px 7px",
  fontSize: 11, fontFamily: "monospace", outline: "none", background: "#fff",
};

const SEL: CSSProperties = {
  border: "1px solid #e5e7eb", borderRadius: 5, padding: "5px 8px",
  fontSize: 11, fontFamily: "monospace", background: "#fff",
  outline: "none", minWidth: 120,
};

const BTN_XS_PRIMARY: CSSProperties = {
  fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 3,
  border: "none", background: "#7c3aed", color: "#fff",
  cursor: "pointer", fontFamily: "monospace",
};
const BTN_XS_GHOST: CSSProperties = {
  fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 3,
  border: "1px solid #e5e7eb", background: "#fff", color: "#6b7280",
  cursor: "pointer", fontFamily: "monospace",
};
const BTN_SM_PRIMARY: CSSProperties = {
  fontSize: 10, fontWeight: 700, padding: "5px 10px", borderRadius: 4,
  border: "none", background: "#7c3aed", color: "#fff",
  cursor: "pointer", fontFamily: "monospace", whiteSpace: "nowrap",
};
const BTN_SM_DANGER: CSSProperties = {
  fontSize: 10, fontWeight: 700, padding: "5px 10px", borderRadius: 4,
  border: "1px solid #fca5a5", background: "#fef2f2", color: "#dc2626",
  cursor: "pointer", fontFamily: "monospace", whiteSpace: "nowrap",
};
const BTN_SM_GHOST: CSSProperties = {
  fontSize: 10, fontWeight: 600, padding: "5px 10px", borderRadius: 4,
  border: "1px solid #e5e7eb", background: "#fff", color: "#6b7280",
  cursor: "pointer", fontFamily: "monospace", whiteSpace: "nowrap",
};

function FormLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, color: "#6b7280",
      textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4,
    }}>
      {children}
    </div>
  );
}
