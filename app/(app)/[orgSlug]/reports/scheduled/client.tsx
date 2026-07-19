"use client";

/**
 * Scheduled Reports Client
 *
 * - 3 preset template cards (Resumen Ejecutivo · Cartera/Aging · Alertas Críticas)
 * - Inline create form (recipients + frequency)
 * - Existing reports list (status badge · next send · toggle · delete)
 */

import { useState, useCallback } from "react";
import { formatDateCol } from "@/lib/utils/formatDate";
import type { ScheduledReport }  from "@prisma/client";

// ── Token shorthands ──────────────────────────────────────────────────────────

const C = {
  ink:         "#111827",
  inkMid:      "#374151",
  inkLight:    "#6b7280",
  inkFaint:    "#9ca3af",
  inkGhost:    "#d1d5db",
  white:       "#ffffff",
  surface:     "#f9fafb",
  surfaceAlt:  "#f3f4f6",
  line:        "#e5e7eb",
  lineSubtle:  "#f3f4f6",
  brand:       "#7c3aed",
  brandLight:  "#ede9fe",
  brandBorder: "#c4b5fd",
  red:         "#dc2626",
  redLight:    "#fee2e2",
  redBorder:   "#fca5a5",
  green:       "#16a34a",
  greenLight:  "#dcfce7",
  greenBorder: "#86efac",
  amber:       "#d97706",
  amberLight:  "#fef3c7",
  amberBorder: "#fcd34d",
  blue:        "#2563eb",
  blueLight:   "#dbeafe",
  blueBorder:  "#93c5fd",
};

// ── Preset templates ──────────────────────────────────────────────────────────

interface Template {
  id:          string;
  icon:        string;
  title:       string;
  description: string;
  query:       string;
  defaultFreq: "WEEKLY" | "MONTHLY";
  accentColor: string;
  accentBg:    string;
  accentBorder:string;
}

const TEMPLATES: Template[] = [
  {
    id:          "executive_weekly",
    icon:        "📊",
    title:       "Resumen Ejecutivo",
    description: "Top clientes por ventas del período · KPIs de facturación · Ranking de vendedores.",
    query:       "top clientes por ventas del mes",
    defaultFreq: "WEEKLY",
    accentColor: C.brand,
    accentBg:    C.brandLight,
    accentBorder:C.brandBorder,
  },
  {
    id:          "cartera_aging",
    icon:        "💸",
    title:       "Cartera · Aging",
    description: "Clientes con saldo vencido · Antigüedad de deuda · Prioridad de cobro.",
    query:       "cartera vencida",
    defaultFreq: "WEEKLY",
    accentColor: C.red,
    accentBg:    C.redLight,
    accentBorder:C.redBorder,
  },
  {
    id:          "alertas_criticas",
    icon:        "⚠",
    title:       "Alertas Críticas",
    description: "Todas las alertas abiertas de severidad crítica · Resumen de riesgos activos.",
    query:       "alertas críticas abiertas",
    defaultFreq: "WEEKLY",
    accentColor: C.amber,
    accentBg:    C.amberLight,
    accentBorder:C.amberBorder,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return formatDateCol(d);
}

const FREQ_LABEL: Record<string, string> = {
  WEEKLY:  "Semanal",
  MONTHLY: "Mensual",
  ONCE:    "Una vez",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug:        string;
  initialReports: ScheduledReport[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScheduledClient({ orgSlug, initialReports }: Props) {
  const [reports,         setReports]         = useState<ScheduledReport[]>(initialReports);
  const [activeTemplate,  setActiveTemplate]  = useState<Template | null>(null);
  const [recipients,      setRecipients]      = useState("");
  const [frequency,       setFrequency]       = useState<"WEEKLY" | "MONTHLY">("WEEKLY");
  const [creating,        setCreating]        = useState(false);
  const [createError,     setCreateError]     = useState<string | null>(null);
  const [togglingId,      setTogglingId]      = useState<string | null>(null);
  const [deletingId,      setDeletingId]      = useState<string | null>(null);

  // ── Create from template ───────────────────────────────────────────────────

  const openTemplate = useCallback((tpl: Template) => {
    setActiveTemplate(tpl);
    setFrequency(tpl.defaultFreq);
    setRecipients("");
    setCreateError(null);
  }, []);

  const closeTemplate = useCallback(() => {
    setActiveTemplate(null);
    setCreateError(null);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!activeTemplate) return;

    const trimmed = recipients.trim();
    if (!trimmed) { setCreateError("Ingresa al menos un email destinatario."); return; }

    // Basic email validation
    const emails = trimmed.split(",").map(e => e.trim()).filter(Boolean);
    const invalid = emails.find(e => !e.includes("@"));
    if (invalid) { setCreateError(`Email inválido: ${invalid}`); return; }

    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch(`/api/orgs/${orgSlug}/scheduled-reports`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:      `${activeTemplate.title} · ${FREQ_LABEL[frequency]}`,
          query:      activeTemplate.query,
          frequency,
          recipients: emails.join(", "),
          reportType: activeTemplate.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al crear el reporte.");
      setReports(prev => [json.report as ScheduledReport, ...prev]);
      closeTemplate();
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }, [activeTemplate, recipients, frequency, orgSlug, closeTemplate]);

  // ── Toggle active ──────────────────────────────────────────────────────────

  const handleToggle = useCallback(async (report: ScheduledReport) => {
    setTogglingId(report.id);
    try {
      const res = await fetch(
        `/api/orgs/${orgSlug}/scheduled-reports/${report.id}`,
        {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ isActive: !report.isActive }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setReports(prev => prev.map(r => r.id === report.id ? json.report as ScheduledReport : r));
    } catch (e) {
      console.error("toggle error", e);
    } finally {
      setTogglingId(null);
    }
  }, [orgSlug]);

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (reportId: string) => {
    if (!confirm("¿Eliminar este reporte programado? Esta acción no se puede deshacer.")) return;
    setDeletingId(reportId);
    try {
      const res = await fetch(
        `/api/orgs/${orgSlug}/scheduled-reports/${reportId}`,
        { method: "DELETE" },
      );
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setReports(prev => prev.filter(r => r.id !== reportId));
    } catch (e) {
      console.error("delete error", e);
    } finally {
      setDeletingId(null);
    }
  }, [orgSlug]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>

      {/* ════════════════ PRESET TEMPLATES ════════════════ */}
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
        color: C.inkFaint, textTransform: "uppercase", marginBottom: 10,
      }}>
        Plantillas de reporte
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 24 }}>
        {TEMPLATES.map(tpl => {
          const isOpen    = activeTemplate?.id === tpl.id;
          const alreadyHas = reports.some(r => r.reportType === tpl.id && r.isActive);
          return (
            <div key={tpl.id} style={{
              border:       `1px solid ${isOpen ? tpl.accentBorder : C.line}`,
              borderTop:    `3px solid ${isOpen ? tpl.accentColor : C.line}`,
              borderRadius: 8,
              background:   isOpen ? tpl.accentBg : C.white,
              padding:      "14px 16px",
              cursor:       "pointer",
              transition:   "border-color 0.15s, background 0.15s",
            }}
            onClick={() => isOpen ? closeTemplate() : openTemplate(tpl)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 20 }}>{tpl.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>{tpl.title}</span>
                {alreadyHas && (
                  <span style={{
                    marginLeft: "auto", fontSize: 9, fontWeight: 700, padding: "1px 5px",
                    borderRadius: 3, background: C.greenLight, color: C.green,
                    textTransform: "uppercase",
                  }}>
                    Activo
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 11, color: C.inkLight, lineHeight: 1.5 }}>
                {tpl.description}
              </p>
              <div style={{ marginTop: 8, fontSize: 10, color: isOpen ? tpl.accentColor : C.inkFaint, fontWeight: 700 }}>
                {isOpen ? "▾ Configurando..." : "▸ Programar este reporte"}
              </div>
            </div>
          );
        })}
      </div>

      {/* ════════════════ CREATE FORM ════════════════ */}
      {activeTemplate && (
        <div style={{
          border:       `1px solid ${activeTemplate.accentBorder}`,
          borderRadius: 8,
          background:   activeTemplate.accentBg,
          padding:      "18px 20px",
          marginBottom: 24,
        }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: C.ink, marginBottom: 4 }}>
            {activeTemplate.icon} {activeTemplate.title}
          </div>
          <div style={{ fontSize: 11, color: C.inkLight, marginBottom: 14 }}>
            Query: <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 6px", borderRadius: 3 }}>{activeTemplate.query}</code>
          </div>

          {/* Frequency */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.inkLight, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 5 }}>
              Frecuencia
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["WEEKLY", "MONTHLY"] as const).map(f => (
                <button key={f} onClick={() => setFrequency(f)} style={{
                  padding:      "6px 14px",
                  borderRadius: 6,
                  border:       `1px solid ${frequency === f ? activeTemplate.accentColor : C.line}`,
                  background:   frequency === f ? C.white : "transparent",
                  color:        frequency === f ? activeTemplate.accentColor : C.inkLight,
                  fontWeight:   frequency === f ? 700 : 400,
                  fontSize:     12,
                  cursor:       "pointer",
                  fontFamily:   "monospace",
                }}>
                  {FREQ_LABEL[f]}
                </button>
              ))}
            </div>
          </div>

          {/* Recipients */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.inkLight, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 5 }}>
              Destinatarios (emails separados por coma)
            </label>
            <input
              type="text"
              value={recipients}
              onChange={e => setRecipients(e.target.value)}
              placeholder="gerente@empresa.com, comercial@empresa.com"
              style={{
                width:       "100%",
                boxSizing:   "border-box",
                padding:     "9px 12px",
                fontSize:    12,
                fontFamily:  "monospace",
                border:      `1px solid ${createError ? C.red : C.line}`,
                borderRadius: 6,
                outline:     "none",
                background:  C.white,
                color:       C.ink,
              }}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
            />
            {createError && (
              <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{createError}</div>
            )}
          </div>

          {/* Email config notice */}
          <div style={{
            fontSize: 10, color: C.amber, background: C.amberLight,
            padding: "6px 10px", borderRadius: 5, marginBottom: 12,
            border: `1px solid ${C.amberBorder}`,
          }}>
            ⚠ Email en modo stub — configura <code>RESEND_API_KEY</code> o <code>SMTP_HOST</code> para envío real.
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleCreate} disabled={creating} style={{
              padding:      "8px 18px",
              borderRadius: 6,
              border:       "none",
              background:   creating ? C.inkGhost : C.ink,
              color:        C.white,
              fontSize:     13,
              fontWeight:   700,
              cursor:       creating ? "default" : "pointer",
              fontFamily:   "monospace",
            }}>
              {creating ? "Creando..." : "✓ Crear reporte programado"}
            </button>
            <button onClick={closeTemplate} style={{
              padding:      "8px 14px",
              borderRadius: 6,
              border:       `1px solid ${C.line}`,
              background:   "transparent",
              color:        C.inkLight,
              fontSize:     12,
              cursor:       "pointer",
              fontFamily:   "monospace",
            }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ════════════════ EXISTING REPORTS LIST ════════════════ */}
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
        color: C.inkFaint, textTransform: "uppercase", marginBottom: 10,
      }}>
        Reportes configurados ({reports.length})
      </div>

      {reports.length === 0 ? (
        <div style={{
          border: `1px dashed ${C.line}`, borderRadius: 8,
          padding: "32px 24px", textAlign: "center", color: C.inkFaint, fontSize: 13,
        }}>
          No hay reportes programados aún. Selecciona una plantilla arriba para comenzar.
        </div>
      ) : (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>

          {/* Header row */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "2fr 80px 100px 1fr 80px",
            background: C.surfaceAlt,
            borderBottom: `1px solid ${C.line}`,
            padding: "8px 16px",
          }}>
            {["Reporte", "Estado", "Frecuencia", "Próximo envío", ""].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {h}
              </div>
            ))}
          </div>

          {reports.map((r, i) => {
            const tpl = TEMPLATES.find(t => t.id === r.reportType);
            return (
              <div key={r.id} style={{
                display:      "grid",
                gridTemplateColumns: "2fr 80px 100px 1fr 80px",
                padding:      "12px 16px",
                borderBottom: i < reports.length - 1 ? `1px solid ${C.lineSubtle}` : undefined,
                background:   C.white,
                alignItems:   "center",
              }}>
                {/* Title + recipients */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    {tpl && <span style={{ fontSize: 14 }}>{tpl.icon}</span>}
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{r.title}</span>
                  </div>
                  <div style={{ fontSize: 10, color: C.inkFaint }}>
                    {r.recipients
                      ? r.recipients.split(",").map(e => e.trim()).slice(0, 2).join(", ") +
                        (r.recipients.split(",").length > 2 ? ` +${r.recipients.split(",").length - 2} más` : "")
                      : "Sin destinatarios"}
                  </div>
                </div>

                {/* Status badge */}
                <div>
                  <span style={{
                    fontSize:     9,
                    fontWeight:   700,
                    padding:      "3px 7px",
                    borderRadius: 4,
                    textTransform:"uppercase",
                    background:   r.isActive ? C.greenLight  : C.surfaceAlt,
                    color:        r.isActive ? C.green       : C.inkFaint,
                    border:       `1px solid ${r.isActive ? C.greenBorder : C.line}`,
                  }}>
                    {r.isActive ? "Activo" : "Pausado"}
                  </span>
                </div>

                {/* Frequency */}
                <div style={{ fontSize: 11, color: C.inkLight }}>{FREQ_LABEL[r.frequency] ?? r.frequency}</div>

                {/* Next send */}
                <div style={{ fontSize: 11, color: r.nextRunAt ? C.inkMid : C.inkFaint }}>
                  {r.nextRunAt
                    ? fmtDate(r.nextRunAt)
                    : r.frequency === "ONCE" && !r.isActive
                    ? "Ejecutado"
                    : "—"}
                  {r.lastError && (
                    <div style={{ fontSize: 10, color: C.red, marginTop: 2 }}>
                      ✗ {r.lastError.slice(0, 40)}
                    </div>
                  )}
                  {r.lastRunAt && !r.lastError && (
                    <div style={{ fontSize: 10, color: C.inkFaint, marginTop: 2 }}>
                      Último: {fmtDate(r.lastRunAt)}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => handleToggle(r)}
                    disabled={togglingId === r.id}
                    title={r.isActive ? "Pausar" : "Activar"}
                    style={{
                      fontSize: 11, padding: "4px 8px", borderRadius: 5, cursor: "pointer", fontFamily: "monospace",
                      border: `1px solid ${C.line}`, background: "transparent", color: C.inkLight,
                    }}
                  >
                    {togglingId === r.id ? "..." : r.isActive ? "⏸" : "▶"}
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    disabled={deletingId === r.id}
                    title="Eliminar"
                    style={{
                      fontSize: 11, padding: "4px 8px", borderRadius: 5, cursor: "pointer", fontFamily: "monospace",
                      border: `1px solid ${C.redBorder}`, background: C.redLight, color: C.red,
                    }}
                  >
                    {deletingId === r.id ? "..." : "✕"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Info footer ── */}
      <div style={{
        marginTop: 24, fontSize: 10, color: C.inkGhost, lineHeight: 1.6,
        padding: "12px 0", borderTop: `1px solid ${C.lineSubtle}`,
      }}>
        Los reportes se ejecutan automáticamente según la frecuencia configurada via cron job
        ({" "}<code style={{ background: C.surfaceAlt, padding: "0 4px", borderRadius: 2 }}>POST /api/internal/run-scheduled-jobs</code>).
        {" "}Las ejecuciones se registran en Notificaciones.
      </div>

    </div>
  );
}
