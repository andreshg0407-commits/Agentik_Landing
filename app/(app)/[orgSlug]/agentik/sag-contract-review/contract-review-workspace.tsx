"use client";

/**
 * app/(app)/[orgSlug]/agentik/sag-contract-review/contract-review-workspace.tsx
 *
 * SAG × Agentik Contract Review Workspace — full interactive review UI.
 *
 * Covers all 9 phases: header stats, domain tabs, editable fields,
 * KPI traceability, view requests, gap analysis, approval, export.
 *
 * Sprint: AGENTIK-SAG-CONTRACT-REVIEW-WORKSPACE-01
 */

import { useState, useCallback }                              from "react";
import { C, T, S, R, E }                                     from "@/lib/ui/tokens";
import type { SagExecutiveContract, CampoRequerido }         from "@/lib/integrations/sag/data-contract/export/sag-contract-export";
import type { ContractExecutiveSummary }                     from "@/lib/integrations/sag/data-contract/sag-field-catalog";
import { renderMarkdown, renderJsonBlob, renderEmailBody }   from "@/lib/integrations/sag/data-contract/export/sag-contract-renderer";

// ── Local types ────────────────────────────────────────────────────────────────

type MainTab        = "domains" | "traceability" | "views" | "gaps";
type ApprovalStatus = "draft" | "reviewing" | "approved";

interface EditableField extends CampoRequerido {
  id:        string;
  notas?:    string;
  isNew?:    boolean;
  editing?:  boolean;
}

type DomainEdits = Record<string, EditableField[]>;

interface NewFieldDraft {
  campo:       string;
  tipo:        string;
  obligatorio: boolean;
  descripcion: string;
  notas:       string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initDomainEdits(contract: SagExecutiveContract): DomainEdits {
  const out: DomainEdits = {};
  for (const vista of contract.vistasRequeridas) {
    out[vista.dominio] = vista.camposRequeridos.map((f, i) => ({
      ...f,
      id:      `${vista.dominio}_${i}`,
      notas:   "",
      isNew:   false,
      editing: false,
    }));
  }
  return out;
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildCsv(contract: SagExecutiveContract, edits: DomainEdits): string {
  const header = "Campo,Dominio,Vista,Tipo,Obligatorio,Estado,Notas,Módulos,KPIs";
  const rows   = contract.vistasRequeridas.flatMap(vista => {
    const fields = edits[vista.dominio] ?? vista.camposRequeridos;
    return fields.map(f => [
      f.campo, vista.dominio, vista.nombre, f.tipo,
      f.obligatorio ? "Sí" : "No",
      f.statusAcceso,
      (f as EditableField).notas ?? "",
      vista.modulosImpactados.join("; "),
      vista.kpisHabilitados.join("; "),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
  });
  return [header, ...rows].join("\n");
}

function buildEditedContract(
  contract: SagExecutiveContract,
  edits: DomainEdits,
): SagExecutiveContract {
  return {
    ...contract,
    vistasRequeridas: contract.vistasRequeridas.map(vista => ({
      ...vista,
      camposRequeridos: (edits[vista.dominio] ?? vista.camposRequeridos).map(f => ({
        campo:        f.campo,
        tipo:         f.tipo,
        obligatorio:  f.obligatorio,
        descripcion:  f.descripcion,
        statusAcceso: f.statusAcceso,
      })),
    })),
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const PRIO_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: C.redLight,   text: C.redDark,   border: C.redBorder   },
  2: { bg: C.amberLight, text: C.amberDark, border: C.amberBorder },
  3: { bg: C.blueLight,  text: C.blueDark,  border: C.blueBorder  },
};

const FIELD_STATUS_COLOR: Record<string, string> = {
  "Acordado en reunión":     C.green,
  "Confirmado":              C.green,
  "Pendiente creación de vista": C.amber,
  "Pendiente acceso":        C.amber,
  "Sin confirmar":           C.inkLight,
  "No disponible":           C.red,
};

function StatusBadge({ label }: { label: string }) {
  const color = FIELD_STATUS_COLOR[label] ?? C.inkLight;
  return (
    <span style={{
      fontFamily:    T.mono,
      fontSize:      T.sz.xs,
      fontWeight:    600,
      color,
      background:    `${color}18`,
      border:        `1px solid ${color}40`,
      borderRadius:  R.sm,
      padding:       `1px ${S[1]}px`,
      whiteSpace:    "nowrap",
    }}>
      {label}
    </span>
  );
}

function PriorityBadge({ p }: { p: 1 | 2 | 3 }) {
  const c = PRIO_COLORS[p];
  return (
    <span style={{
      fontFamily:   T.mono,
      fontSize:     T.sz.xs,
      fontWeight:   700,
      color:        c.text,
      background:   c.bg,
      border:       `1px solid ${c.border}`,
      borderRadius: R.sm,
      padding:      `1px 7px`,
    }}>
      P{p}
    </span>
  );
}

// ── Tab bar ────────────────────────────────────────────────────────────────────

const MAIN_TABS: { id: MainTab; label: string; icon: string }[] = [
  { id: "domains",      label: "Dominios",         icon: "⬡" },
  { id: "traceability", label: "Trazabilidad",      icon: "↔" },
  { id: "views",        label: "Vistas solicitadas", icon: "◈" },
  { id: "gaps",         label: "Gaps & Faltantes",  icon: "△" },
];

function TabBar({
  tabs, active, onChange,
}: {
  tabs: { id: string; label: string; icon?: string; badge?: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{
      display:       "flex",
      gap:           2,
      borderBottom:  `1px solid ${C.line}`,
      marginBottom:  S[4],
      overflowX:     "auto",
    }}>
      {tabs.map(t => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:           S[1],
              fontFamily:   T.mono,
              fontSize:     T.sz.sm,
              fontWeight:   isActive ? 700 : 500,
              color:        isActive ? C.blueDark : C.inkMid,
              background:   isActive ? C.blueLight : "transparent",
              border:       "none",
              borderBottom: isActive ? `2px solid ${C.blueDark}` : "2px solid transparent",
              borderRadius: `${R.sm}px ${R.sm}px 0 0`,
              padding:      `${S[2]}px ${S[3]}px`,
              cursor:       "pointer",
              whiteSpace:   "nowrap",
              flexShrink:   0,
            }}
          >
            {t.icon && <span style={{ fontSize: 10 }}>{t.icon}</span>}
            {t.label}
            {t.badge && (
              <span style={{
                fontFamily:   T.mono,
                fontSize:     T.sz["2xs"],
                fontWeight:   700,
                color:        C.white,
                background:   C.blueDark,
                borderRadius: R.pill,
                padding:      `0 5px`,
                marginLeft:   S[1],
              }}>{t.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Field table ────────────────────────────────────────────────────────────────

function FieldRow({
  field,
  onUpdate,
  onToggleEdit,
}: {
  field:          EditableField;
  onUpdate:       (updated: Partial<EditableField>) => void;
  onToggleEdit:   () => void;
}) {
  const isEditing = !!field.editing;

  return (
    <div style={{
      display:       "grid",
      gridTemplateColumns: "1.8fr 70px 80px 140px 1fr 60px",
      gap:           S[2],
      alignItems:    "center",
      padding:       `${S[2]}px ${S[3]}px`,
      borderBottom:  `1px solid ${C.lineSubtle}`,
      background:    field.isNew ? `${C.greenLight}` : isEditing ? C.blueLight : C.white,
    }}>
      {/* Campo */}
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>
        {field.campo}
        {field.isNew && (
          <span style={{ marginLeft: S[1], fontSize: T.sz.xs, color: C.green, fontWeight: 700 }}> NUEVO</span>
        )}
        {isEditing && (
          <div style={{ marginTop: 2 }}>
            <input
              value={field.descripcion}
              onChange={e => onUpdate({ descripcion: e.target.value })}
              placeholder="Descripción"
              style={{
                width: "100%", fontFamily: T.mono, fontSize: T.sz.xs,
                border: `1px solid ${C.blueBorder}`, borderRadius: R.sm,
                padding: `2px ${S[1]}px`, color: C.inkMid, background: C.white,
              }}
            />
            <input
              value={field.notas ?? ""}
              onChange={e => onUpdate({ notas: e.target.value })}
              placeholder="Notas adicionales…"
              style={{
                width: "100%", fontFamily: T.mono, fontSize: T.sz.xs, marginTop: 3,
                border: `1px solid ${C.line}`, borderRadius: R.sm,
                padding: `2px ${S[1]}px`, color: C.inkLight, background: C.white,
              }}
            />
          </div>
        )}
        {!isEditing && (
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginTop: 1, fontWeight: 400 }}>
            {field.descripcion}
          </div>
        )}
      </div>

      {/* Tipo */}
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{field.tipo}</div>

      {/* Obligatorio */}
      <div>
        {isEditing ? (
          <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={field.obligatorio}
              onChange={e => onUpdate({ obligatorio: e.target.checked })}
            />
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
              {field.obligatorio ? "Sí" : "No"}
            </span>
          </label>
        ) : (
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
            color: field.obligatorio ? C.green : C.inkLight,
          }}>
            {field.obligatorio ? "✓ Req." : "Opc."}
          </span>
        )}
      </div>

      {/* Estado */}
      <div>
        {isEditing ? (
          <select
            value={field.statusAcceso}
            onChange={e => onUpdate({ statusAcceso: e.target.value })}
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs,
              border: `1px solid ${C.line}`, borderRadius: R.sm, padding: "2px 4px",
            }}
          >
            {["Acordado en reunión", "Confirmado", "Pendiente creación de vista", "Pendiente acceso", "Sin confirmar", "No disponible"].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        ) : (
          <StatusBadge label={field.statusAcceso} />
        )}
      </div>

      {/* Descripción (read mode) */}
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
        {!isEditing && field.notas && (
          <span style={{ fontStyle: "italic" }}>{field.notas}</span>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: S[1] }}>
        <button
          onClick={onToggleEdit}
          style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
            color: isEditing ? C.green : C.blueDark,
            background: isEditing ? C.greenLight : C.blueLight,
            border: `1px solid ${isEditing ? C.greenBorder : C.blueBorder}`,
            borderRadius: R.sm, padding: `2px ${S[1]}px`, cursor: "pointer",
          }}
        >
          {isEditing ? "✓" : "✎"}
        </button>
      </div>
    </div>
  );
}

// ── Add field form ─────────────────────────────────────────────────────────────

const EMPTY_DRAFT: NewFieldDraft = {
  campo: "", tipo: "string", obligatorio: true, descripcion: "", notas: "",
};

function AddFieldForm({
  onAdd,
  onCancel,
}: {
  onAdd:    (f: NewFieldDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<NewFieldDraft>({ ...EMPTY_DRAFT });
  const upd = (k: keyof NewFieldDraft, v: unknown) =>
    setDraft(d => ({ ...d, [k]: v }));

  return (
    <div style={{
      display:       "grid",
      gridTemplateColumns: "1.8fr 70px 80px 140px 1fr 120px",
      gap:           S[2],
      alignItems:    "end",
      padding:       `${S[3]}px`,
      background:    `${C.greenLight}`,
      border:        `1px dashed ${C.greenBorder}`,
      borderRadius:  R.md,
      marginTop:     S[2],
    }}>
      <input
        value={draft.campo}
        onChange={e => upd("campo", e.target.value)}
        placeholder="NOMBRE_CAMPO"
        style={{
          fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600,
          border: `1px solid ${C.line}`, borderRadius: R.sm,
          padding: `${S[1]}px`, width: "100%",
        }}
      />
      <select
        value={draft.tipo}
        onChange={e => upd("tipo", e.target.value)}
        style={{
          fontFamily: T.mono, fontSize: T.sz.xs,
          border: `1px solid ${C.line}`, borderRadius: R.sm, padding: "4px",
        }}
      >
        {["string","number","decimal","date","datetime","enum","boolean","json"].map(t => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          type="checkbox"
          checked={draft.obligatorio}
          onChange={e => upd("obligatorio", e.target.checked)}
        />
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs }}>Req.</span>
      </label>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green, fontWeight: 600 }}>
        Sin confirmar
      </div>
      <input
        value={draft.descripcion}
        onChange={e => upd("descripcion", e.target.value)}
        placeholder="Descripción del campo…"
        style={{
          fontFamily: T.mono, fontSize: T.sz.xs,
          border: `1px solid ${C.line}`, borderRadius: R.sm,
          padding: `${S[1]}px`, width: "100%",
        }}
      />
      <div style={{ display: "flex", gap: S[1] }}>
        <button
          onClick={() => draft.campo.trim() && onAdd(draft)}
          style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
            color: C.white, background: C.green,
            border: "none", borderRadius: R.sm,
            padding: `${S[1]}px ${S[2]}px`, cursor: "pointer",
          }}
        >
          + Agregar
        </button>
        <button
          onClick={onCancel}
          style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
            color: C.inkMid, background: C.surfaceAlt,
            border: `1px solid ${C.line}`, borderRadius: R.sm,
            padding: `${S[1]}px ${S[2]}px`, cursor: "pointer",
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Main workspace component ───────────────────────────────────────────────────

interface Props {
  contract: SagExecutiveContract;
  summary:  ContractExecutiveSummary;
}

export function ContractReviewWorkspace({ contract, summary }: Props) {
  const [activeTab,      setActiveTab]      = useState<MainTab>("domains");
  const [activeDomain,   setActiveDomain]   = useState<string>(contract.vistasRequeridas[0]?.dominio ?? "pagos");
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("draft");
  const [domainEdits,    setDomainEdits]    = useState<DomainEdits>(() => initDomainEdits(contract));
  const [showAddForm,    setShowAddForm]    = useState<Record<string, boolean>>({});

  // ── Field edit handlers ──────────────────────────────────────────────────────

  const updateField = useCallback((domainId: string, fieldId: string, patch: Partial<EditableField>) => {
    setDomainEdits(prev => ({
      ...prev,
      [domainId]: prev[domainId].map(f =>
        f.id === fieldId ? { ...f, ...patch } : f
      ),
    }));
  }, []);

  const toggleEditField = useCallback((domainId: string, fieldId: string) => {
    setDomainEdits(prev => ({
      ...prev,
      [domainId]: prev[domainId].map(f =>
        f.id === fieldId ? { ...f, editing: !f.editing } : f
      ),
    }));
  }, []);

  const addField = useCallback((domainId: string, draft: NewFieldDraft) => {
    const newField: EditableField = {
      id:           `${domainId}_new_${Date.now()}`,
      campo:         draft.campo.toUpperCase().replace(/\s+/g, "_"),
      tipo:          draft.tipo,
      obligatorio:   draft.obligatorio,
      descripcion:   draft.descripcion,
      statusAcceso:  "Sin confirmar",
      notas:         draft.notas,
      isNew:         true,
      editing:       false,
    };
    setDomainEdits(prev => ({
      ...prev,
      [domainId]: [...(prev[domainId] ?? []), newField],
    }));
    setShowAddForm(prev => ({ ...prev, [domainId]: false }));
  }, []);

  // ── Export handlers ──────────────────────────────────────────────────────────

  const handleExport = useCallback((format: "markdown" | "json" | "csv" | "email") => {
    const edited = buildEditedContract(contract, domainEdits);
    const date   = contract.meta.fechaGeneracion;
    if (format === "markdown") {
      downloadFile(renderMarkdown(edited),  `sag-contract-${date}.md`,   "text/markdown");
    } else if (format === "json") {
      downloadFile(renderJsonBlob(edited),  `sag-contract-${date}.json`, "application/json");
    } else if (format === "csv") {
      downloadFile(buildCsv(contract, domainEdits), `sag-contract-fields-${date}.csv`, "text/csv");
    } else if (format === "email") {
      downloadFile(renderEmailBody(edited), `sag-email-${date}.txt`,     "text/plain");
    }
  }, [contract, domainEdits]);

  const handlePdf = useCallback(() => {
    window.print();
  }, []);

  // ── Gap analysis ─────────────────────────────────────────────────────────────

  const fieldsWithoutKpi = contract.matrizTrazabilidad.filter(
    r => r.kpisAfectados.length === 0 && r.obligatorio
  );
  const p1AllUnconfirmed = contract.statusDominios.filter(
    d => d.prioridad === 1 && d.camposAcordados === 0
  );
  const blockedKpis      = summary.criticalKpisBlocked;
  const moduleNoSource: string[] = [];
  {
    const moduleMap: Record<string, boolean[]> = {};
    for (const row of contract.matrizTrazabilidad) {
      for (const mod of row.modulosAgentik) {
        if (!moduleMap[mod]) moduleMap[mod] = [];
        moduleMap[mod].push(
          row.statusAcceso === "Acordado en reunión" || row.statusAcceso === "Confirmado"
        );
      }
    }
    for (const [mod, flags] of Object.entries(moduleMap)) {
      if (flags.every(f => !f)) moduleNoSource.push(mod);
    }
  }

  // ── Domain tabs ──────────────────────────────────────────────────────────────

  const domainTabs = contract.vistasRequeridas.map(v => ({
    id:    v.dominio,
    label: v.dominio.charAt(0).toUpperCase() + v.dominio.slice(1),
    badge: v.prioridad === 1 ? "P1" : v.prioridad === 2 ? "P2" : undefined,
  }));

  const activeDomainVista = contract.vistasRequeridas.find(v => v.dominio === activeDomain);
  const activeFields      = domainEdits[activeDomain] ?? [];
  const statusEntry       = contract.statusDominios.find(d => d.dominio === activeDomain);

  // ── Approval state colors ────────────────────────────────────────────────────

  const approvalMeta = {
    draft:     { label: "Borrador",            color: C.inkLight,  bg: C.surfaceAlt,  border: C.line       },
    reviewing: { label: "En revisión",          color: C.amber,     bg: C.amberLight,  border: C.amberBorder },
    approved:  { label: "Aprobado para envío",  color: C.green,     bg: C.greenLight,  border: C.greenBorder },
  }[approvalStatus];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>

      {/* ═══ APPROVAL BANNER (when approved) ═══════════════════════════════════ */}
      {approvalStatus === "approved" && (
        <div style={{
          padding:      `${S[3]}px ${S[5]}px`,
          background:   C.greenLight,
          border:       `1.5px solid ${C.greenBorder}`,
          borderRadius: R.lg,
          display:      "flex",
          alignItems:   "center",
          gap:          S[3],
        }}>
          <span style={{ fontSize: 20 }}>✅</span>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: 700, color: C.greenDark }}>
              Contrato listo para enviar a SAG
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.green }}>
              Exporta el documento y compártelo con el equipo SAG para iniciar la construcción de vistas.
            </div>
          </div>
        </div>
      )}

      {/* ═══ STATS STRIP ════════════════════════════════════════════════════════ */}
      <div style={{
        display:       "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        gap:           S[2],
      }}>
        {[
          { label: "Versión",          value: contract.meta.version          },
          { label: "Dominios totales", value: String(summary.totalDomains)   },
          { label: "Vistas solicitadas", value: String(summary.viewsToRequest) },
          { label: "Campos totales",   value: String(summary.totalFields)    },
          { label: "Campos acordados", value: String(summary.fieldsConfirmed) },
          { label: "Estado",           value: approvalMeta.label, highlight: true },
        ].map(stat => (
          <div key={stat.label} style={{
            background:   stat.highlight ? approvalMeta.bg : C.surface,
            border:       `1px solid ${stat.highlight ? approvalMeta.border : C.line}`,
            borderRadius: R.md,
            padding:      `${S[2]}px ${S[3]}px`,
          }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginBottom: 2 }}>
              {stat.label}
            </div>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.md, fontWeight: 700,
              color: stat.highlight ? approvalMeta.color : C.ink,
            }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* ═══ APPROVAL CONTROLS + EXPORT BAR ════════════════════════════════════ */}
      <div style={{
        display:       "flex",
        alignItems:    "center",
        gap:           S[3],
        padding:       `${S[3]}px ${S[4]}px`,
        background:    C.surface,
        border:        `1px solid ${C.line}`,
        borderRadius:  R.lg,
        flexWrap:      "wrap",
      }}>
        {/* Approval state selector */}
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, fontWeight: 600 }}>
            ESTADO:
          </span>
          {(["draft", "reviewing", "approved"] as ApprovalStatus[]).map(s => {
            const meta = {
              draft:     { label: "Borrador",     color: C.inkMid  },
              reviewing: { label: "En revisión",  color: C.amber   },
              approved:  { label: "✓ Aprobado",   color: C.green   },
            }[s];
            const isActive = approvalStatus === s;
            return (
              <button
                key={s}
                onClick={() => setApprovalStatus(s)}
                style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
                  color:        isActive ? C.white : meta.color,
                  background:   isActive ? meta.color : "transparent",
                  border:       `1px solid ${meta.color}`,
                  borderRadius: R.sm,
                  padding:      `3px ${S[2]}px`,
                  cursor:       "pointer",
                  transition:   "all 120ms",
                }}
              >
                {meta.label}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* Export buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginRight: S[1] }}>
            EXPORTAR:
          </span>
          {([
            { label: "Markdown", fmt: "markdown" as const, icon: "↓ .md"    },
            { label: "JSON",     fmt: "json"     as const, icon: "↓ .json"  },
            { label: "CSV",      fmt: "csv"      as const, icon: "↓ .csv"   },
            { label: "Email",    fmt: "email"    as const, icon: "↓ .txt"   },
          ]).map(btn => (
            <button
              key={btn.fmt}
              onClick={() => handleExport(btn.fmt)}
              style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
                color:        C.blueDark,
                background:   C.blueLight,
                border:       `1px solid ${C.blueBorder}`,
                borderRadius: R.sm,
                padding:      `3px ${S[2]}px`,
                cursor:       "pointer",
              }}
            >
              {btn.icon}
            </button>
          ))}
          <button
            onClick={handlePdf}
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
              color:        C.white,
              background:   C.blueDark,
              border:       "none",
              borderRadius: R.sm,
              padding:      `3px ${S[2]}px`,
              cursor:       "pointer",
            }}
          >
            PDF ↓
          </button>
        </div>
      </div>

      {/* ═══ MAIN TAB BAR ═══════════════════════════════════════════════════════ */}
      <TabBar
        tabs={MAIN_TABS.map(t => ({
          ...t,
          badge: t.id === "gaps" && (fieldsWithoutKpi.length + blockedKpis.length + p1AllUnconfirmed.length) > 0
            ? String(fieldsWithoutKpi.length + blockedKpis.length + p1AllUnconfirmed.length)
            : undefined,
        }))}
        active={activeTab}
        onChange={id => setActiveTab(id as MainTab)}
      />

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: DOMINIOS                                                          */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "domains" && (
        <div>
          <TabBar
            tabs={domainTabs}
            active={activeDomain}
            onChange={id => setActiveDomain(id)}
          />

          {activeDomainVista && statusEntry && (
            <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>

              {/* Domain meta */}
              <div style={{
                display:       "grid",
                gridTemplateColumns: "1fr 1fr",
                gap:           S[3],
              }}>
                {/* Left: description + meta */}
                <div style={{
                  background: C.surface, border: `1px solid ${C.line}`,
                  borderRadius: R.lg, padding: `${S[4]}px`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[3] }}>
                    <span style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
                      color: C.inkLight, letterSpacing: "0.08em",
                    }}>
                      {activeDomainVista.nombre.toUpperCase()}
                    </span>
                    <PriorityBadge p={activeDomainVista.prioridad} />
                    <StatusBadge label={activeDomainVista.status} />
                  </div>
                  <p style={{
                    fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid,
                    lineHeight: 1.6, margin: 0, marginBottom: S[3],
                  }}>
                    {activeDomainVista.proposito}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
                    {[
                      { label: "Vista",        value: activeDomainVista.nombre              },
                      { label: "Tablas SAG",   value: activeDomainVista.tabelasFuente.join(", ") },
                      { label: "Frecuencia",   value: activeDomainVista.frecuenciaSugerida  },
                      { label: "Notas",        value: activeDomainVista.notas ?? "—"         },
                    ].map(row => (
                      <div key={row.label} style={{ display: "flex", gap: S[2] }}>
                        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, width: 80, flexShrink: 0 }}>
                          {row.label}
                        </span>
                        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, fontWeight: 500 }}>
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: modules + KPIs */}
                <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
                  <div style={{
                    background: C.surface, border: `1px solid ${C.line}`,
                    borderRadius: R.lg, padding: `${S[3]}px`,
                  }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.inkLight, marginBottom: S[2], letterSpacing: "0.06em" }}>
                      MÓDULOS AGENTIK IMPACTADOS
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: S[1] }}>
                      {activeDomainVista.modulosImpactados.map(mod => (
                        <span key={mod} style={{
                          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
                          color: C.blueDark, background: C.blueLight,
                          border: `1px solid ${C.blueBorder}`,
                          borderRadius: R.sm, padding: `2px ${S[1]}px`,
                        }}>{mod}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{
                    background: C.surface, border: `1px solid ${C.line}`,
                    borderRadius: R.lg, padding: `${S[3]}px`,
                  }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.inkLight, marginBottom: S[2], letterSpacing: "0.06em" }}>
                      KPIs HABILITADOS
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: S[1] }}>
                      {activeDomainVista.kpisHabilitados.map(kpi => (
                        <span key={kpi} style={{
                          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
                          color: C.green, background: C.greenLight,
                          border: `1px solid ${C.greenBorder}`,
                          borderRadius: R.sm, padding: `2px ${S[1]}px`,
                        }}>{kpi}</span>
                      ))}
                    </div>
                  </div>
                  {statusEntry.bloqueadores.length > 0 && (
                    <div style={{
                      background: C.redLight, border: `1px solid ${C.redBorder}`,
                      borderRadius: R.lg, padding: `${S[3]}px`,
                    }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.redDark, marginBottom: S[2] }}>
                        BLOQUEADORES
                      </div>
                      {statusEntry.bloqueadores.map((b, i) => (
                        <div key={i} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red, marginBottom: 3 }}>
                          ⚠ {b}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Field table */}
              <div style={{
                border:       `1px solid ${C.line}`,
                borderRadius: R.lg,
                overflow:     "hidden",
              }}>
                {/* Table header */}
                <div style={{
                  display:       "grid",
                  gridTemplateColumns: "1.8fr 70px 80px 140px 1fr 60px",
                  gap:           S[2],
                  padding:       `${S[2]}px ${S[3]}px`,
                  background:    C.surfaceAlt,
                  borderBottom:  `1px solid ${C.line}`,
                }}>
                  {["Campo / Descripción", "Tipo", "Requerido", "Estado acceso", "Notas", ""].map(h => (
                    <div key={h} style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
                      color: C.inkLight, letterSpacing: "0.05em",
                    }}>{h}</div>
                  ))}
                </div>

                {/* Rows */}
                {activeFields.map(field => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    onUpdate={patch => updateField(activeDomain, field.id, patch)}
                    onToggleEdit={() => toggleEditField(activeDomain, field.id)}
                  />
                ))}

                {/* Add form */}
                <div style={{ padding: `0 ${S[3]}px ${S[3]}px` }}>
                  {showAddForm[activeDomain] ? (
                    <AddFieldForm
                      onAdd={draft => addField(activeDomain, draft)}
                      onCancel={() => setShowAddForm(p => ({ ...p, [activeDomain]: false }))}
                    />
                  ) : (
                    <button
                      onClick={() => setShowAddForm(p => ({ ...p, [activeDomain]: true }))}
                      style={{
                        marginTop:    S[2],
                        fontFamily:   T.mono, fontSize: T.sz.sm, fontWeight: 600,
                        color:        C.green,
                        background:   C.greenLight,
                        border:       `1px dashed ${C.greenBorder}`,
                        borderRadius: R.md,
                        padding:      `${S[2]}px ${S[3]}px`,
                        cursor:       "pointer",
                        width:        "100%",
                      }}
                    >
                      + Agregar campo a {activeDomainVista.nombre}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: TRAZABILIDAD                                                      */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "traceability" && (
        <div>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
            marginBottom: S[3], padding: `${S[2]}px ${S[3]}px`,
            background: C.blueLight, border: `1px solid ${C.blueBorder}`,
            borderRadius: R.md,
          }}>
            Cada campo justificado por su uso en módulos y KPIs de Agentik.
            Los campos sin trazabilidad aparecen en la pestaña "Gaps".
          </div>

          <div style={{ border: `1px solid ${C.line}`, borderRadius: R.lg, overflow: "hidden" }}>
            {/* Header */}
            <div style={{
              display:       "grid",
              gridTemplateColumns: "1.4fr 80px 1.2fr 60px 1.4fr 1.6fr",
              gap:           S[2],
              padding:       `${S[2]}px ${S[3]}px`,
              background:    C.surfaceAlt,
              borderBottom:  `1px solid ${C.line}`,
            }}>
              {["Campo", "Dominio", "Vista", "Tipo", "Módulos Agentik", "KPIs afectados"].map(h => (
                <div key={h} style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.inkLight }}>
                  {h}
                </div>
              ))}
            </div>

            {contract.matrizTrazabilidad.map((row, i) => (
              <div
                key={i}
                style={{
                  display:       "grid",
                  gridTemplateColumns: "1.4fr 80px 1.2fr 60px 1.4fr 1.6fr",
                  gap:           S[2],
                  alignItems:    "start",
                  padding:       `${S[1] + 2}px ${S[3]}px`,
                  borderBottom:  `1px solid ${C.lineSubtle}`,
                  background:    i % 2 === 0 ? C.white : C.surface,
                }}
              >
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>
                    {row.campo}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginTop: 1 }}>
                    {row.obligatorio ? "✓ Requerido" : "Opcional"}
                  </div>
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{row.dominio}</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark, fontWeight: 500 }}>
                  {row.vista}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>{row.tipo}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {row.modulosAgentik.map(m => (
                    <span key={m} style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 600,
                      color: C.blueDark, background: C.blueLight,
                      border: `1px solid ${C.blueBorder}`, borderRadius: R.xs,
                      padding: "1px 4px",
                    }}>{m}</span>
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {row.kpisAfectados.length > 0
                    ? row.kpisAfectados.map(k => (
                      <span key={k} style={{
                        fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 600,
                        color: C.green, background: C.greenLight,
                        border: `1px solid ${C.greenBorder}`, borderRadius: R.xs,
                        padding: "1px 4px",
                      }}>{k}</span>
                    ))
                    : <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>—</span>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: VISTAS SOLICITADAS                                                */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "views" && (
        <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
          {contract.vistasRequeridas.map(vista => {
            const fields = domainEdits[vista.dominio] ?? vista.camposRequeridos;
            return (
              <div key={vista.dominio} style={{
                border:       `1px solid ${C.line}`,
                borderRadius: R.lg,
                overflow:     "hidden",
              }}>
                {/* View card header */}
                <div style={{
                  padding:      `${S[3]}px ${S[4]}px`,
                  background:   vista.prioridad === 1 ? C.blueLight : C.surface,
                  borderBottom: `1px solid ${C.line}`,
                  display:      "flex",
                  alignItems:   "center",
                  gap:          S[2],
                }}>
                  <PriorityBadge p={vista.prioridad} />
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: 700, color: C.blueDark }}>
                    {vista.nombre}
                  </span>
                  <StatusBadge label={vista.status} />
                  <div style={{ flex: 1 }} />
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                    {vista.frecuenciaSugerida}
                  </span>
                </div>

                <div style={{ padding: `${S[3]}px ${S[4]}px`, display: "flex", gap: S[4] }}>
                  {/* Left: purpose + tables */}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, margin: 0, marginBottom: S[2] }}>
                      {vista.proposito}
                    </p>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                      Tablas fuente: <strong>{vista.tabelasFuente.join(", ")}</strong>
                    </div>
                    {vista.notas && (
                      <div style={{
                        marginTop: S[2], fontFamily: T.mono, fontSize: T.sz.xs,
                        color: C.amber, background: C.amberLight,
                        border: `1px solid ${C.amberBorder}`, borderRadius: R.sm,
                        padding: `${S[1]}px ${S[2]}px`,
                      }}>
                        ⚠ {vista.notas}
                      </div>
                    )}
                  </div>

                  {/* Right: field pills */}
                  <div style={{ minWidth: 280 }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.inkLight, marginBottom: S[1] }}>
                      CAMPOS ({fields.length})
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {fields.map((f, i) => (
                        <span key={i} style={{
                          fontFamily:   T.mono, fontSize: T.sz.xs, fontWeight: f.obligatorio ? 700 : 400,
                          color:        f.obligatorio ? C.ink : C.inkLight,
                          background:   f.obligatorio ? C.surfaceAlt : "transparent",
                          border:       `1px solid ${C.line}`,
                          borderRadius: R.xs,
                          padding:      "1px 5px",
                        }}>
                          {f.campo}
                          {(f as EditableField).isNew && (
                            <span style={{ color: C.green, marginLeft: 2 }}>*</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Modules + KPIs footer */}
                <div style={{
                  padding:     `${S[2]}px ${S[4]}px`,
                  background:  C.surface,
                  borderTop:   `1px solid ${C.lineSubtle}`,
                  display:     "flex",
                  gap:         S[4],
                  flexWrap:    "wrap",
                }}>
                  <div style={{ display: "flex", gap: S[1], flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginRight: S[1] }}>
                      MÓDULOS:
                    </span>
                    {vista.modulosImpactados.map(m => (
                      <span key={m} style={{
                        fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark,
                        background: C.blueLight, border: `1px solid ${C.blueBorder}`,
                        borderRadius: R.xs, padding: "1px 5px",
                      }}>{m}</span>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: S[1], flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginRight: S[1] }}>
                      KPIs:
                    </span>
                    {vista.kpisHabilitados.map(k => (
                      <span key={k} style={{
                        fontFamily: T.mono, fontSize: T.sz.xs, color: C.green,
                        background: C.greenLight, border: `1px solid ${C.greenBorder}`,
                        borderRadius: R.xs, padding: "1px 5px",
                      }}>{k}</span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: GAPS & FALTANTES                                                  */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "gaps" && (
        <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>

          {/* KPIs blocked */}
          <div style={{
            background: C.redLight, border: `1px solid ${C.redBorder}`,
            borderRadius: R.lg, padding: `${S[4]}px`,
          }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.redDark, marginBottom: S[2] }}>
              ● KPIs críticos sin soporte de datos ({blockedKpis.length})
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red, marginBottom: S[2] }}>
              Estos KPIs no pueden calcularse hasta que sus campos fuente estén confirmados con SAG.
            </div>
            {blockedKpis.length === 0
              ? <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.green }}>✓ Ningún KPI crítico bloqueado</div>
              : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: S[1] }}>
                  {blockedKpis.map(k => (
                    <span key={k} style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
                      color: C.red, background: C.white,
                      border: `1px solid ${C.redBorder}`, borderRadius: R.sm,
                      padding: "2px 8px",
                    }}>{k}</span>
                  ))}
                </div>
              )
            }
          </div>

          {/* P1 domains with no confirmed fields */}
          <div style={{
            background: C.amberLight, border: `1px solid ${C.amberBorder}`,
            borderRadius: R.lg, padding: `${S[4]}px`,
          }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.amberDark, marginBottom: S[2] }}>
              ● Dominios P1 sin ningún campo confirmado ({p1AllUnconfirmed.length})
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber, marginBottom: S[2] }}>
              Estos dominios son críticos para operación y aún no tienen acceso acordado con SAG.
            </div>
            {p1AllUnconfirmed.length === 0
              ? <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.green }}>✓ Todos los dominios P1 tienen al menos un campo confirmado</div>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
                  {p1AllUnconfirmed.map(d => (
                    <div key={d.dominio} style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.amberDark }}>
                      <strong>{d.nombre}</strong> — {d.totalCampos} campos, ninguno acordado.
                      {d.bloqueadores.length > 0 && (
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber, marginTop: 2 }}>
                          {d.bloqueadores.map((b, i) => <div key={i}>⚠ {b}</div>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            }
          </div>

          {/* Modules without confirmed source */}
          <div style={{
            background: C.surface, border: `1px solid ${C.line}`,
            borderRadius: R.lg, padding: `${S[4]}px`,
          }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.inkMid, marginBottom: S[2] }}>
              ● Módulos sin fuente de datos confirmada ({moduleNoSource.length})
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginBottom: S[2] }}>
              Todos los campos que alimentan a estos módulos están en estado "Sin confirmar".
            </div>
            {moduleNoSource.length === 0
              ? <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.green }}>✓ Todos los módulos tienen al menos un campo confirmado</div>
              : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: S[1] }}>
                  {moduleNoSource.map(m => (
                    <span key={m} style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
                      color: C.inkMid, background: C.surfaceAlt,
                      border: `1px solid ${C.line}`, borderRadius: R.sm,
                      padding: "2px 8px",
                    }}>{m}</span>
                  ))}
                </div>
              )
            }
          </div>

          {/* Fields without KPI traceability */}
          <div style={{
            background: C.surface, border: `1px solid ${C.line}`,
            borderRadius: R.lg, padding: `${S[4]}px`,
          }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.inkMid, marginBottom: S[2] }}>
              ● Campos requeridos sin trazabilidad a KPIs ({fieldsWithoutKpi.length})
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginBottom: S[2] }}>
              Estos campos son marcados como obligatorios pero no tienen un KPI asignado.
              Considerar si son realmente necesarios o si falta mapear su KPI destino.
            </div>
            {fieldsWithoutKpi.length === 0
              ? <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.green }}>✓ Todos los campos requeridos tienen trazabilidad a KPI</div>
              : (
                <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden" }}>
                  <div style={{
                    display: "grid", gridTemplateColumns: "1fr 80px 120px 1.5fr",
                    gap: S[2], padding: `${S[1]}px ${S[3]}px`,
                    background: C.surfaceAlt, borderBottom: `1px solid ${C.line}`,
                  }}>
                    {["Campo", "Dominio", "Vista", "Módulos"].map(h => (
                      <div key={h} style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.inkLight }}>{h}</div>
                    ))}
                  </div>
                  {fieldsWithoutKpi.map((row, i) => (
                    <div key={i} style={{
                      display: "grid", gridTemplateColumns: "1fr 80px 120px 1.5fr",
                      gap: S[2], padding: `${S[1] + 2}px ${S[3]}px`,
                      borderBottom: `1px solid ${C.lineSubtle}`,
                      background: i % 2 === 0 ? C.white : C.surface,
                    }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>{row.campo}</div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{row.dominio}</div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark }}>{row.vista}</div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>{row.modulosAgentik.join(", ")}</div>
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        </div>
      )}
    </div>
  );
}
