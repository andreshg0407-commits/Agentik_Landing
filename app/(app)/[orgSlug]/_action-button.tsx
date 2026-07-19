"use client";

/**
 * ActionButton — shared client component for creating ActionTasks from any module.
 *
 * Usage:
 *   <ActionButton
 *     orgSlug={orgSlug}
 *     label="Crear acción de cobranza"
 *     prefill={{
 *       actionType:   "CREAR_ACCION_COBRANZA",
 *       targetType:   "customer",
 *       targetLabel:  "Distribuciones López",
 *       sourceModule: "customer_360",
 *       title:        "Cobro pendiente — Distribuciones López",
 *     }}
 *   />
 *
 * The button renders inline; the modal floats over everything (position:fixed).
 * No global state or context required — each instance is self-contained.
 */

import { useState, useEffect, type FormEvent } from "react";
import { T }               from "@/lib/ui/tokens";
import { saCreateAction }  from "@/lib/actions/server-actions";
import {
  ActionTaskType,
  ActionTaskPriority,
}                          from "@prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActionPrefill {
  title?:        string;
  description?:  string;
  actionType?:   ActionTaskType;
  targetType?:   string;
  targetId?:     string;
  targetLabel?:  string;
  sourceModule?: string;
  priority?:     ActionTaskPriority;
  assignedTo?:   string;
}

export interface ActionButtonProps {
  orgSlug:   string;
  label:     string;
  prefill?:  ActionPrefill;
  icon?:     string;
  variant?:  "primary" | "outline" | "ghost" | "danger" | "purple";
  size?:     "xs" | "sm" | "md";
  onCreated?: (taskId: string) => void;
}

// ── Labels ────────────────────────────────────────────────────────────────────

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
  agentik_copilot:   "Copiloto IA",
  bandeja_acciones:  "Bandeja IA",
  customer_360:      "Cliente 360",
  informes:          "Informes",
  control_comercial: "Control Comercial",
  torre_de_control:  "Torre de Control",
  finanzas:          "Finanzas",
  manual:            "Manual",
};

const PRIORITY_LABELS: Record<ActionTaskPriority, string> = {
  LOW:    "Baja",
  MEDIUM: "Media",
  HIGH:   "Alta",
  URGENT: "Urgente",
};

// ── Variant styles ─────────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<NonNullable<ActionButtonProps["variant"]>, React.CSSProperties> = {
  primary: {
    background: "var(--ag-grad-hero, linear-gradient(135deg, #004AAD, #1E63D8))",
    color:  "#ffffff",
    border: "none",
  },
  outline: {
    background: "var(--ag-brand-50, #EEF5FF)",
    color:  "#004AAD",
    border: "1px solid rgba(0,74,173,.18)",
  },
  ghost: {
    background: "transparent",
    color:  "#6b7280",
    border: "1px solid transparent",
  },
  danger: {
    background: "#fef2f2",
    color:  "#dc2626",
    border: "1px solid #fca5a5",
  },
  purple: {
    background: "#faf5ff",
    color:  "#7c3aed",
    border: "1px solid #c4b5fd",
  },
};

const SIZE_STYLES: Record<NonNullable<ActionButtonProps["size"]>, React.CSSProperties> = {
  xs: { fontSize: 9,  padding: "2px 7px",  borderRadius: 4 },
  sm: { fontSize: 10, padding: "4px 10px", borderRadius: 5 },
  md: { fontSize: 11, padding: "6px 14px", borderRadius: 6 },
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function ActionButton({
  orgSlug,
  label,
  prefill = {},
  icon,
  variant = "outline",
  size = "sm",
  onCreated,
}: ActionButtonProps) {
  const [isOpen,   setOpen]   = useState(false);
  const [busy,     setBusy]   = useState(false);
  const [success,  setSuccess] = useState(false);
  const [error,    setError]   = useState<string | null>(null);

  // Form state — initialised from prefill each time modal opens
  const [title,       setTitle]       = useState(prefill.title       ?? "");
  const [description, setDescription] = useState(prefill.description ?? "");
  const [actionType,  setActionType]  = useState<ActionTaskType>(prefill.actionType ?? ActionTaskType.CREAR_TAREA_COMERCIAL);
  const [priority,    setPriority]    = useState<ActionTaskPriority>(prefill.priority ?? ActionTaskPriority.MEDIUM);
  const [assignedTo,  setAssignedTo]  = useState(prefill.assignedTo  ?? "");
  const [dueAt,       setDueAt]       = useState("");

  // Re-initialise when prefill changes (dynamic rows)
  useEffect(() => {
    if (!isOpen) {
      setTitle(prefill.title ?? "");
      setActionType(prefill.actionType ?? ActionTaskType.CREAR_TAREA_COMERCIAL);
      setPriority(prefill.priority ?? ActionTaskPriority.MEDIUM);
      setAssignedTo(prefill.assignedTo ?? "");
      setError(null);
      setSuccess(false);
    }
  }, [isOpen, prefill.title, prefill.actionType, prefill.priority, prefill.assignedTo]);

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("El título es obligatorio."); return; }
    setBusy(true);
    setError(null);

    const res = await saCreateAction(orgSlug, {
      title:        title.trim(),
      description:  description.trim() || undefined,
      actionType,
      targetType:   prefill.targetType,
      targetId:     prefill.targetId,
      targetLabel:  prefill.targetLabel,
      sourceModule: prefill.sourceModule ?? "manual",
      priority,
      assignedTo:   assignedTo.trim() || undefined,
      dueAt:        dueAt ? new Date(dueAt) : undefined,
    });

    setBusy(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    setSuccess(true);
    onCreated?.(res.data.id);
    setTimeout(() => {
      setOpen(false);
      setSuccess(false);
    }, 1800);
  }

  const btnStyle: React.CSSProperties = {
    ...VARIANT_STYLES[variant],
    ...SIZE_STYLES[size],
    fontWeight: 700,
    fontFamily: T.mono,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    letterSpacing: "0.02em",
    whiteSpace: "nowrap",
    transition: "all 0.1s",
  };

  return (
    <>
      {/* Trigger button */}
      <button onClick={() => setOpen(true)} style={btnStyle}>
        {icon && <span>{icon}</span>}
        {label}
      </button>

      {/* Modal */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => !busy && setOpen(false)}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,0.45)",
              zIndex: 1000,
              backdropFilter: "blur(2px)",
            }}
          />

          {/* Panel */}
          <div style={{
            position: "fixed",
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 1001,
            width: "min(480px, calc(100vw - 32px))",
            maxHeight: "calc(100vh - 48px)",
            overflowY: "auto",
            background: "#fff",
            borderRadius: 10,
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            fontFamily: T.mono,
          }}>
            {/* Modal header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 18px",
              borderBottom: "1px solid #f5f5f5",
              background: "#fafafa",
              borderRadius: "10px 10px 0 0",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#111" }}>Nueva Acción</span>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 3,
                  background: "#ede9fe", color: "#6d28d9", letterSpacing: "0.06em",
                }}>
                  {TYPE_LABELS[actionType]}
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 16, color: "#9ca3af", lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Context bar */}
            {(prefill.sourceModule || prefill.targetLabel) && (
              <div style={{
                padding: "8px 18px",
                background: "#f8fafc",
                borderBottom: "1px solid #f1f5f9",
                fontSize: 10, color: "#64748b",
                display: "flex", gap: 12, flexWrap: "wrap",
              }}>
                {prefill.sourceModule && (
                  <span>
                    Origen: <b style={{ color: "#374151" }}>
                      {SOURCE_LABELS[prefill.sourceModule] ?? prefill.sourceModule}
                    </b>
                  </span>
                )}
                {prefill.targetLabel && (
                  <span>
                    Afecta: <b style={{ color: "#374151" }}>
                      {prefill.targetLabel}
                    </b>
                    {prefill.targetType && <span style={{ color: "#9ca3af" }}> ({prefill.targetType})</span>}
                  </span>
                )}
              </div>
            )}

            {/* Success state */}
            {success ? (
              <div style={{
                padding: "40px 24px",
                textAlign: "center",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
              }}>
                <div style={{ fontSize: 40 }}>✅</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Acción creada</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  Visible en el Centro de Acciones de Agentik
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>

                {/* Title */}
                <div>
                  <Label>Título *</Label>
                  <input
                    autoFocus
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="¿Qué hay que hacer?"
                    style={{ ...INPUT, width: "100%", boxSizing: "border-box" }}
                    disabled={busy}
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <Label>Descripción (opcional)</Label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Contexto, instrucciones o notas adicionales…"
                    rows={2}
                    style={{ ...INPUT, width: "100%", boxSizing: "border-box", resize: "vertical" }}
                    disabled={busy}
                  />
                </div>

                {/* Type + Priority */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <Label>Tipo</Label>
                    <select
                      value={actionType}
                      onChange={e => setActionType(e.target.value as ActionTaskType)}
                      style={{ ...INPUT, width: "100%" }}
                      disabled={busy}
                    >
                      {Object.entries(TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Prioridad</Label>
                    <select
                      value={priority}
                      onChange={e => setPriority(e.target.value as ActionTaskPriority)}
                      style={{ ...INPUT, width: "100%" }}
                      disabled={busy}
                    >
                      {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Assignee + Due date */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <Label>Asignar a</Label>
                    <input
                      type="text"
                      value={assignedTo}
                      onChange={e => setAssignedTo(e.target.value)}
                      placeholder="Nombre o email"
                      style={{ ...INPUT, width: "100%", boxSizing: "border-box" }}
                      disabled={busy}
                    />
                  </div>
                  <div>
                    <Label>Fecha límite</Label>
                    <input
                      type="date"
                      value={dueAt}
                      onChange={e => setDueAt(e.target.value)}
                      style={{ ...INPUT, width: "100%", boxSizing: "border-box" }}
                      disabled={busy}
                    />
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div style={{
                    fontSize: 11, color: "#dc2626",
                    background: "#fef2f2", borderRadius: 5, padding: "7px 10px",
                    border: "1px solid #fca5a5",
                  }}>
                    {error}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                  <button
                    type="submit"
                    disabled={busy || !title.trim()}
                    style={{
                      flex: 1,
                      background: busy ? "rgba(0,74,173,.35)" : "var(--ag-grad-hero, linear-gradient(135deg, #004AAD, #1E63D8))",
                      color: "#fff", border: "none", borderRadius: 6,
                      padding: "10px", fontSize: 12, fontWeight: 700,
                      cursor: busy ? "not-allowed" : "pointer",
                      fontFamily: T.mono, letterSpacing: "0.03em",
                    }}
                  >
                    {busy ? "Creando…" : "Crear acción →"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={busy}
                    style={{
                      background: "#fff", color: "#6b7280",
                      border: "1px solid #e5e7eb", borderRadius: 6,
                      padding: "10px 16px", fontSize: 11, fontWeight: 600,
                      cursor: "pointer", fontFamily: T.mono,
                    }}
                  >
                    Cancelar
                  </button>
                </div>

                {/* Footer trace */}
                <div style={{ fontSize: 9, color: "#d1d5db", textAlign: "center", marginTop: -4 }}>
                  La acción quedará registrada en Agentik Centro de Acciones con trazabilidad completa
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </>
  );
}

// ── Tiny helpers ───────────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 5,
  padding: "8px 10px",
  fontSize: 11,
  fontFamily: T.mono,
  outline: "none",
  background: "#fff",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, color: "#6b7280",
      textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5,
    }}>
      {children}
    </div>
  );
}
