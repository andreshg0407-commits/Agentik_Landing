"use client";

/**
 * components/operational-map/proximos-pasos-card.tsx
 *
 * Módulo de captura de acuerdos — Acta estructurada SAG × Agentik.
 *
 * 6 pestañas: Método · Fuentes · Sincronización · Responsables · Plan · Acta
 *
 * Persistencia:
 *   1. onChange → autosave localStorage (inmediato, sin UI)
 *   2. "Guardar sección" → POST/PATCH a DB → confirmación visual
 *   3. onMount → carga desde DB primero; fallback a localStorage
 *
 * Estados: sin guardar · guardando · guardado · error
 *
 * Sprint: AGENTIK-MEETING-NOTES-PERSISTENCE-01
 */

import { useState, useEffect, useRef } from "react";
import { T, S, C, R }                  from "@/lib/ui/tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

type IntegrationMethod = "vistas_sql" | "replica" | "api" | "export" | "otro" | "";
type SyncFrequency     = "tiempo_real" | "horaria" | "diaria" | "manual" | "";
type ActionPriority    = "alta" | "media" | "baja";
type ActionStatus      = "pendiente" | "en_progreso" | "completado";
type SaveStatus        = "idle" | "saving" | "saved" | "error";

interface ActionItem {
  id:          string;
  descripcion: string;
  responsable: string;
  fecha:       string;
  prioridad:   ActionPriority;
  estado:      ActionStatus;
}

interface MeetingActa {
  sessionId:    string;
  createdAt:    string;
  updatedAt:    string;
  metodo: {
    tipo:                IntegrationMethod;
    descripcion:         string;
    restricciones:       string;
    accesoHistorico:     string;   // metodoAccesoHistorico in DB
  };
  fuentes: {
    tablaVentas:   string;
    tablaPagos:    string;
    tablaRecaudos: string;
    tablaCartera:  string;
    notas:         string;
  };
  sincronizacion: {
    frecuencia: SyncFrequency;
    hora:       string;
    notas:      string;
  };
  responsables: {
    nombreSag:     string;
    rolSag:        string;
    nombreAgentik: string;
    rolAgentik:    string;
    proxReunion:   string;
  };
  acciones:      ActionItem[];
  observaciones: string;
}

type TabKey = "metodo" | "fuentes" | "sincronizacion" | "responsables" | "acciones" | "acta";

// ─── Storage abstraction ──────────────────────────────────────────────────────

const LS_KEY = "agentik_sag_meeting_acta_v1";

const LocalStorage = {
  load(): MeetingActa | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as MeetingActa) : null;
    } catch { return null; }
  },
  save(data: MeetingActa): void {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
  },
  clear(): void {
    if (typeof window === "undefined") return;
    try { localStorage.removeItem(LS_KEY); } catch {}
  },
};

// Maps MeetingActa → DB payload
function actaToPayload(acta: MeetingActa, meetingType: string) {
  return {
    meetingType,
    meetingDate:              acta.createdAt.slice(0, 10),
    metodoIntegracion:        acta.metodo.tipo          || null,
    metodoDescripcion:        acta.metodo.descripcion   || null,
    metodoRestricciones:      acta.metodo.restricciones || null,
    metodoAccesoHistorico:    acta.metodo.accesoHistorico || null,
    fuenteVentas:             acta.fuentes.tablaVentas   || null,
    fuentePagos:              acta.fuentes.tablaPagos    || null,
    fuenteRecaudos:           acta.fuentes.tablaRecaudos || null,
    fuenteCartera:            acta.fuentes.tablaCartera  || null,
    fuentesNotas:             acta.fuentes.notas         || null,
    frecuenciaSincronizacion: acta.sincronizacion.frecuencia || null,
    horaEjecucion:            acta.sincronizacion.hora   || null,
    syncNotas:                acta.sincronizacion.notas  || null,
    responsableSag:           acta.responsables.nombreSag     || null,
    rolSag:                   acta.responsables.rolSag        || null,
    responsableAgentik:       acta.responsables.nombreAgentik || null,
    rolAgentik:               acta.responsables.rolAgentik    || null,
    proximaReunion:           acta.responsables.proxReunion   || null,
    accionesJson:             acta.acciones.length > 0 ? acta.acciones : null,
    observaciones:            acta.observaciones || null,
  };
}

// Maps DB record → MeetingActa
function payloadToActa(r: Record<string, unknown>): MeetingActa {
  return {
    sessionId:    String(r.id ?? ""),
    createdAt:    String(r.createdAt ?? new Date().toISOString()),
    updatedAt:    String(r.updatedAt ?? new Date().toISOString()),
    metodo: {
      tipo:            (r.metodoIntegracion     as IntegrationMethod) ?? "",
      descripcion:     String(r.metodoDescripcion    ?? ""),
      restricciones:   String(r.metodoRestricciones  ?? ""),
      accesoHistorico: String(r.metodoAccesoHistorico ?? ""),
    },
    fuentes: {
      tablaVentas:   String(r.fuenteVentas   ?? ""),
      tablaPagos:    String(r.fuentePagos    ?? ""),
      tablaRecaudos: String(r.fuenteRecaudos ?? ""),
      tablaCartera:  String(r.fuenteCartera  ?? ""),
      notas:         String(r.fuentesNotas   ?? ""),
    },
    sincronizacion: {
      frecuencia: (r.frecuenciaSincronizacion as SyncFrequency) ?? "",
      hora:       String(r.horaEjecucion ?? ""),
      notas:      String(r.syncNotas     ?? ""),
    },
    responsables: {
      nombreSag:     String(r.responsableSag     ?? ""),
      rolSag:        String(r.rolSag             ?? ""),
      nombreAgentik: String(r.responsableAgentik ?? ""),
      rolAgentik:    String(r.rolAgentik         ?? ""),
      proxReunion:   String(r.proximaReunion     ?? ""),
    },
    acciones:      Array.isArray(r.accionesJson) ? (r.accionesJson as ActionItem[]) : [],
    observaciones: String(r.observaciones ?? ""),
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const emptyActa = (): MeetingActa => ({
  sessionId:      genId(),
  createdAt:      new Date().toISOString(),
  updatedAt:      new Date().toISOString(),
  metodo:         { tipo: "", descripcion: "", restricciones: "", accesoHistorico: "" },
  fuentes:        { tablaVentas: "", tablaPagos: "", tablaRecaudos: "", tablaCartera: "", notas: "" },
  sincronizacion: { frecuencia: "", hora: "", notas: "" },
  responsables:   { nombreSag: "", rolSag: "", nombreAgentik: "", rolAgentik: "", proxReunion: "" },
  acciones:       [],
  observaciones:  "",
});

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "metodo",         label: "Método",        icon: "⬡" },
  { key: "fuentes",        label: "Fuentes",        icon: "◈" },
  { key: "sincronizacion", label: "Sincronización", icon: "↻" },
  { key: "responsables",   label: "Responsables",   icon: "◎" },
  { key: "acciones",       label: "Plan de acción", icon: "▸" },
  { key: "acta",           label: "Acta completa",  icon: "≡" },
];

const METHOD_LABELS: Record<IntegrationMethod, string> = {
  "":          "Sin definir",
  vistas_sql:  "Vistas SQL certificadas",
  replica:     "Réplica controlada",
  api:         "API",
  export:      "Export programado",
  otro:        "Otro",
};

const FREQ_LABELS: Record<SyncFrequency, string> = {
  "":           "Sin definir",
  tiempo_real:  "Tiempo real",
  horaria:      "Horaria",
  diaria:       "Diaria",
  manual:       "Manual",
};

const STATUS_META: Record<ActionStatus, { label: string; color: string }> = {
  pendiente:   { label: "Pendiente",   color: "#64748b" },
  en_progreso: { label: "En progreso", color: "#0284c7" },
  completado:  { label: "Completado",  color: "#166534" },
};

const SAVE_STATUS_META: Record<SaveStatus, { label: string; color: string; bg: string; border: string }> = {
  idle:   { label: "Sin guardar",          color: "#92400e", bg: "#fffbeb", border: "#fde68a" },
  saving: { label: "Guardando…",           color: "#0284c7", bg: "#eff6ff", border: "#bfdbfe" },
  saved:  { label: "Guardado en base de datos ✓", color: "#166534", bg: "#f0fdf4", border: "#bbf7d0" },
  error:  { label: "Error al guardar",     color: "#991b1b", bg: "#fee2e2", border: "#fca5a5" },
};

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputBase: React.CSSProperties = {
  width:        "100%",
  fontFamily:   T.mono,
  fontSize:     T.sz.xs,
  color:        C.ink,
  background:   C.surface,
  border:       `1px solid ${C.line}`,
  borderRadius: R.sm,
  padding:      `${S[2]}px ${S[3]}px`,
  outline:      "none",
  boxSizing:    "border-box" as const,
  lineHeight:   1.5,
};

// ─── Micro-components ─────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: T.mono, fontSize: 9, fontWeight: 600,
      letterSpacing: "0.08em", textTransform: "uppercase" as const,
      color: C.inkFaint, marginBottom: S[1],
    }}>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

function RadioGroup<T extends string>({
  value, options, onChange,
}: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[2] }}>
      {options.map(opt => (
        <button key={opt.value} type="button" onClick={() => onChange(opt.value)} style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontFamily: T.mono, fontSize: T.sz.xs,
          color: value === opt.value ? C.blueDark : C.inkMid,
          background: value === opt.value ? "#eff6ff" : C.surfaceAlt,
          border: `1px solid ${value === opt.value ? "#bfdbfe" : C.line}`,
          borderRadius: R.sm, padding: `${S[1]}px ${S[3]}px`, cursor: "pointer",
        }}>
          <span style={{ fontSize: 9 }}>{value === opt.value ? "●" : "○"}</span>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SaveBar({
  tabKey, dirty, status, savedAt, onSave,
}: {
  tabKey:  TabKey;
  dirty:   boolean;
  status:  SaveStatus;
  savedAt: string | null;
  onSave:  () => void;
}) {
  const meta = SAVE_STATUS_META[status];
  const showStatus = status !== "idle" || !dirty;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "flex-end",
      gap: S[3], marginTop: S[3], paddingTop: S[3],
      borderTop: `1px solid ${C.line}`,
    }}>
      {showStatus && (
        <span style={{
          fontFamily: T.mono, fontSize: "10px",
          color: meta.color,
          background: meta.bg, border: `1px solid ${meta.border}`,
          borderRadius: R.sm, padding: `2px ${S[2]}px`,
        }}>
          {meta.label}
          {status === "saved" && savedAt && (
            <> · {new Date(savedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</>
          )}
        </span>
      )}
      {dirty && status !== "saving" && (
        <span style={{ fontFamily: T.mono, fontSize: "10px", color: "#d97706" }}>
          ● Sin guardar en DB
        </span>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || status === "saving"}
        style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
          color: dirty && status !== "saving" ? C.blueDark : C.inkFaint,
          background: dirty && status !== "saving" ? "#eff6ff" : C.surfaceAlt,
          border: `1px solid ${dirty && status !== "saving" ? "#bfdbfe" : C.line}`,
          borderRadius: R.sm, padding: `${S[2]}px ${S[4]}px`,
          cursor: dirty && status !== "saving" ? "pointer" : "default",
          opacity: !dirty || status === "saving" ? 0.6 : 1,
        }}
      >
        {status === "saving" ? "Guardando…" : "Guardar en base de datos"}
      </button>
    </div>
  );
}

function ActaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: S[3], alignItems: "flex-start" }}>
      <span style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, minWidth: 160, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, lineHeight: 1.5 }}>
        {value || "—"}
      </span>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug:     string;
  meetingType?: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProximosPasosCard({ orgSlug, meetingType = "sag_validation" }: Props) {
  const [acta,         setActa]         = useState<MeetingActa>(emptyActa);
  const [tab,          setTab]          = useState<TabKey>("metodo");
  const [dirty,        setDirty]        = useState<Set<TabKey>>(new Set());
  const [sectionStatus, setSectionStatus] = useState<Partial<Record<TabKey, SaveStatus>>>({});
  const [savedAt,      setSavedAt]      = useState<Partial<Record<TabKey, string>>>({});
  const [agreementId,  setAgreementId]  = useState<string | null>(null);
  const [loaded,       setLoaded]       = useState(false);
  const [source,       setSource]       = useState<"db" | "local" | "empty">("empty");
  const [confirming,   setConfirming]   = useState(false);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Mount: load from DB first, fallback to localStorage ───────────────────

  useEffect(() => {
    async function init() {
      try {
        const res  = await fetch(
          `/api/orgs/${orgSlug}/operational-map/meeting-agreements?meetingType=${meetingType}`,
        );
        const data = await res.json() as { ok: boolean; agreement: Record<string, unknown> | null };
        if (data.ok && data.agreement) {
          setActa(payloadToActa(data.agreement));
          setAgreementId(String(data.agreement.id));
          setSource("db");
          setLoaded(true);
          return;
        }
      } catch {}

      // Fallback: localStorage
      const local = LocalStorage.load();
      if (local) {
        setActa(local);
        setSource("local");
      } else {
        setSource("empty");
      }
      setLoaded(true);
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, meetingType]);

  // ── Autosave to localStorage on every change ───────────────────────────────

  useEffect(() => {
    if (!loaded) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      LocalStorage.save({ ...acta, updatedAt: new Date().toISOString() });
    }, 600);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [acta, loaded]);

  // ── Patch helpers ─────────────────────────────────────────────────────────

  function markDirty(tabKey: TabKey) {
    setDirty(prev => new Set(prev).add(tabKey));
    // Clear "saved" status when user starts editing again
    setSectionStatus(prev => prev[tabKey] === "saved" ? { ...prev, [tabKey]: "idle" } : prev);
  }

  function patchMetodo(fields: Partial<MeetingActa["metodo"]>) {
    setActa(prev => ({ ...prev, metodo: { ...prev.metodo, ...fields } }));
    markDirty("metodo");
  }
  function patchFuentes(fields: Partial<MeetingActa["fuentes"]>) {
    setActa(prev => ({ ...prev, fuentes: { ...prev.fuentes, ...fields } }));
    markDirty("fuentes");
  }
  function patchSync(fields: Partial<MeetingActa["sincronizacion"]>) {
    setActa(prev => ({ ...prev, sincronizacion: { ...prev.sincronizacion, ...fields } }));
    markDirty("sincronizacion");
  }
  function patchResponsables(fields: Partial<MeetingActa["responsables"]>) {
    setActa(prev => ({ ...prev, responsables: { ...prev.responsables, ...fields } }));
    markDirty("responsables");
  }

  // ── Save to DB ─────────────────────────────────────────────────────────────

  async function saveSection(tabKey: TabKey) {
    setSectionStatus(prev => ({ ...prev, [tabKey]: "saving" }));
    try {
      const url    = agreementId
        ? `/api/orgs/${orgSlug}/operational-map/meeting-agreements/${agreementId}`
        : `/api/orgs/${orgSlug}/operational-map/meeting-agreements`;
      const method = agreementId ? "PATCH" : "POST";

      const res  = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(actaToPayload(acta, meetingType)),
      });
      const data = await res.json() as { ok: boolean; agreement?: Record<string, unknown> };

      if (data.ok && data.agreement) {
        if (!agreementId) setAgreementId(String(data.agreement.id));
        const now = new Date().toISOString();
        setActa(prev => ({ ...prev, updatedAt: now }));
        LocalStorage.save({ ...acta, updatedAt: now });
        setSavedAt(prev => ({ ...prev, [tabKey]: now }));
        setSectionStatus(prev => ({ ...prev, [tabKey]: "saved" }));
        setDirty(prev => { const n = new Set(prev); n.delete(tabKey); return n; });
        setSource("db");
      } else {
        setSectionStatus(prev => ({ ...prev, [tabKey]: "error" }));
      }
    } catch {
      setSectionStatus(prev => ({ ...prev, [tabKey]: "error" }));
    }
  }

  // ── Action items ──────────────────────────────────────────────────────────

  function addAction() {
    setActa(prev => ({
      ...prev,
      acciones: [...prev.acciones, {
        id: genId(), descripcion: "", responsable: "",
        fecha: "", prioridad: "media", estado: "pendiente",
      }],
    }));
    markDirty("acciones");
  }

  function updateAction(id: string, fields: Partial<ActionItem>) {
    setActa(prev => ({
      ...prev,
      acciones: prev.acciones.map(a => a.id === id ? { ...a, ...fields } : a),
    }));
    markDirty("acciones");
  }

  function removeAction(id: string) {
    setActa(prev => ({ ...prev, acciones: prev.acciones.filter(a => a.id !== id) }));
    markDirty("acciones");
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  function handleReset() {
    if (!confirming) { setConfirming(true); return; }
    const fresh = emptyActa();
    LocalStorage.clear();
    setActa(fresh);
    setAgreementId(null);
    setDirty(new Set());
    setSavedAt({});
    setSectionStatus({});
    setSource("empty");
    setConfirming(false);
  }

  if (!loaded) return null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      margin: `${S[4]}px 0 0`,
      border: `1.5px solid ${C.line}`,
      borderLeft: `4px solid ${C.blueDark}`,
      borderRadius: 8,
      background: C.surface,
      overflow: "hidden",
    }}>

      {/* ── Card header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: `${S[3]}px ${S[4]}px`,
        background: C.surfaceAlt, borderBottom: `1px solid ${C.line}`,
      }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.blueDark }}>
            Próximos pasos acordados
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, marginTop: 2, display: "flex", gap: S[2], flexWrap: "wrap" as const }}>
            <span>
              Sesión {new Date(acta.createdAt).toLocaleDateString("es-CO", {
                day: "numeric", month: "long", year: "numeric",
              })}
            </span>
            {source === "db" && agreementId && (
              <span style={{ color: "#166534" }}>· base de datos activa</span>
            )}
            {source === "local" && (
              <span style={{ color: "#d97706" }}>· localStorage (sin guardar en DB)</span>
            )}
            {source === "empty" && (
              <span style={{ color: C.inkGhost }}>· nueva sesión</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          onBlur={() => setConfirming(false)}
          style={{
            fontFamily: T.mono, fontSize: 10,
            color: confirming ? "#991b1b" : C.inkFaint,
            background: confirming ? "#fee2e2" : "none",
            border: `1px solid ${confirming ? "#fca5a5" : C.line}`,
            borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`,
            cursor: "pointer", flexShrink: 0,
          }}
        >
          {confirming ? "¿Confirmar reinicio?" : "↺ Nueva sesión"}
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        display: "flex", borderBottom: `1px solid ${C.line}`,
        background: C.surface, overflowX: "auto" as const,
      }}>
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontFamily: T.mono, fontSize: 10,
            fontWeight: tab === t.key ? 700 : 400,
            color: tab === t.key ? C.blueDark : C.inkMid,
            background: "none", border: "none",
            borderBottom: tab === t.key ? `2px solid ${C.blueDark}` : "2px solid transparent",
            padding: `${S[2]}px ${S[3]}px`,
            cursor: "pointer", whiteSpace: "nowrap" as const,
            marginBottom: -1, flexShrink: 0,
          }}>
            <span style={{ fontSize: 10 }}>{t.icon}</span>
            {t.label}
            {dirty.has(t.key) && (
              <span style={{
                width: 5, height: 5, borderRadius: "50%",
                background: "#d97706", display: "inline-block", marginLeft: 1,
              }} />
            )}
            {sectionStatus[t.key] === "saved" && !dirty.has(t.key) && (
              <span style={{
                width: 5, height: 5, borderRadius: "50%",
                background: "#16a34a", display: "inline-block", marginLeft: 1,
              }} />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div style={{ padding: `${S[4]}px`, display: "flex", flexDirection: "column" as const, gap: S[3] }}>

        {/* ══ Método ══ */}
        {tab === "metodo" && (
          <>
            <Field label="Método seleccionado por SAG">
              <RadioGroup<IntegrationMethod>
                value={acta.metodo.tipo}
                options={[
                  { value: "vistas_sql", label: "Vistas SQL" },
                  { value: "replica",    label: "Réplica" },
                  { value: "api",        label: "API" },
                  { value: "export",     label: "Export programado" },
                  { value: "otro",       label: "Otro" },
                ]}
                onChange={v => patchMetodo({ tipo: v })}
              />
            </Field>
            <Field label="Descripción del método acordado">
              <textarea
                value={acta.metodo.descripcion}
                onChange={e => patchMetodo({ descripcion: e.target.value })}
                placeholder="Descripción detallada del método acordado con SAG…"
                rows={3}
                style={{ ...inputBase, resize: "vertical" }}
              />
            </Field>
            <Field label="Método de acceso histórico (pagos y recaudos)">
              <textarea
                value={acta.metodo.accesoHistorico}
                onChange={e => patchMetodo({ accesoHistorico: e.target.value })}
                placeholder="¿Cómo se accederá al histórico de pagos y recaudos? Método específico confirmado por SAG…"
                rows={2}
                style={{ ...inputBase, resize: "vertical" }}
              />
            </Field>
            <Field label="Restricciones o consideraciones">
              <textarea
                value={acta.metodo.restricciones}
                onChange={e => patchMetodo({ restricciones: e.target.value })}
                placeholder="Accesos requeridos, restricciones técnicas, condiciones especiales…"
                rows={2}
                style={{ ...inputBase, resize: "vertical" }}
              />
            </Field>
            <SaveBar
              tabKey="metodo"
              dirty={dirty.has("metodo")}
              status={sectionStatus.metodo ?? "idle"}
              savedAt={savedAt.metodo ?? null}
              onSave={() => saveSection("metodo")}
            />
          </>
        )}

        {/* ══ Fuentes ══ */}
        {tab === "fuentes" && (
          <>
            {(
              [
                { key: "tablaVentas",   label: "Tabla oficial — Ventas" },
                { key: "tablaPagos",    label: "Tabla oficial — Pagos" },
                { key: "tablaRecaudos", label: "Tabla oficial — Recaudos" },
                { key: "tablaCartera",  label: "Tabla oficial — Cartera" },
              ] as { key: keyof MeetingActa["fuentes"]; label: string }[]
            ).map(f => (
              <Field key={f.key} label={f.label}>
                <input
                  type="text"
                  value={String(acta.fuentes[f.key])}
                  onChange={e => patchFuentes({ [f.key]: e.target.value })}
                  placeholder="nombre_tabla o nombre_vista"
                  style={inputBase}
                />
              </Field>
            ))}
            <Field label="Notas adicionales (campos relevantes, vistas, restricciones DBA)">
              <textarea
                value={acta.fuentes.notas}
                onChange={e => patchFuentes({ notas: e.target.value })}
                placeholder="Campos disponibles, vistas certificadas, permisos requeridos…"
                rows={2}
                style={{ ...inputBase, resize: "vertical" }}
              />
            </Field>
            <SaveBar
              tabKey="fuentes"
              dirty={dirty.has("fuentes")}
              status={sectionStatus.fuentes ?? "idle"}
              savedAt={savedAt.fuentes ?? null}
              onSave={() => saveSection("fuentes")}
            />
          </>
        )}

        {/* ══ Sincronización ══ */}
        {tab === "sincronizacion" && (
          <>
            <Field label="Frecuencia recomendada por SAG">
              <RadioGroup<SyncFrequency>
                value={acta.sincronizacion.frecuencia}
                options={[
                  { value: "tiempo_real", label: "Tiempo real" },
                  { value: "horaria",     label: "Horaria" },
                  { value: "diaria",      label: "Diaria" },
                  { value: "manual",      label: "Manual" },
                ]}
                onChange={v => patchSync({ frecuencia: v })}
              />
            </Field>
            <Field label="Hora de ejecución recomendada">
              <input
                type="text"
                value={acta.sincronizacion.hora}
                onChange={e => patchSync({ hora: e.target.value })}
                placeholder="Ej: 02:00 AM, cada hora en punto, fuera de horario pico…"
                style={inputBase}
              />
            </Field>
            <Field label="Observaciones (SLAs, ventanas de mantenimiento)">
              <textarea
                value={acta.sincronizacion.notas}
                onChange={e => patchSync({ notas: e.target.value })}
                placeholder="Restricciones horarias, ventanas de mantenimiento, SLAs acordados…"
                rows={2}
                style={{ ...inputBase, resize: "vertical" }}
              />
            </Field>
            <SaveBar
              tabKey="sincronizacion"
              dirty={dirty.has("sincronizacion")}
              status={sectionStatus.sincronizacion ?? "idle"}
              savedAt={savedAt.sincronizacion ?? null}
              onSave={() => saveSection("sincronizacion")}
            />
          </>
        )}

        {/* ══ Responsables ══ */}
        {tab === "responsables" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
              <Field label="Responsable SAG">
                <input type="text" value={acta.responsables.nombreSag}
                  onChange={e => patchResponsables({ nombreSag: e.target.value })}
                  placeholder="Nombre completo" style={inputBase} />
              </Field>
              <Field label="Cargo / Rol SAG">
                <input type="text" value={acta.responsables.rolSag}
                  onChange={e => patchResponsables({ rolSag: e.target.value })}
                  placeholder="Cargo o rol" style={inputBase} />
              </Field>
              <Field label="Responsable Agentik">
                <input type="text" value={acta.responsables.nombreAgentik}
                  onChange={e => patchResponsables({ nombreAgentik: e.target.value })}
                  placeholder="Nombre completo" style={inputBase} />
              </Field>
              <Field label="Cargo / Rol Agentik">
                <input type="text" value={acta.responsables.rolAgentik}
                  onChange={e => patchResponsables({ rolAgentik: e.target.value })}
                  placeholder="Cargo o rol" style={inputBase} />
              </Field>
            </div>
            <Field label="Fecha próxima reunión de seguimiento">
              <input type="text" value={acta.responsables.proxReunion}
                onChange={e => patchResponsables({ proxReunion: e.target.value })}
                placeholder="DD/MM/AAAA" style={inputBase} />
            </Field>
            <SaveBar
              tabKey="responsables"
              dirty={dirty.has("responsables")}
              status={sectionStatus.responsables ?? "idle"}
              savedAt={savedAt.responsables ?? null}
              onSave={() => saveSection("responsables")}
            />
          </>
        )}

        {/* ══ Plan de acción ══ */}
        {tab === "acciones" && (
          <>
            {acta.acciones.length === 0 ? (
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                fontStyle: "italic", textAlign: "center" as const,
                padding: `${S[4]}px`, background: C.surfaceAlt,
                border: `1px dashed ${C.line}`, borderRadius: R.md,
              }}>
                Sin acciones registradas.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
                {acta.acciones.map((item, idx) => (
                  <div key={item.id} style={{
                    background: C.surfaceAlt, border: `1px solid ${C.line}`,
                    borderRadius: R.md, padding: `${S[3]}px`,
                  }}>
                    <div style={{
                      display: "flex", alignItems: "center",
                      justifyContent: "space-between", marginBottom: S[2],
                    }}>
                      <span style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>
                        Acción {idx + 1}
                      </span>
                      <button type="button" onClick={() => removeAction(item.id)}
                        style={{ fontFamily: T.mono, fontSize: 14, lineHeight: 1, color: C.inkFaint, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                        ×
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
                      <input type="text" value={item.descripcion}
                        onChange={e => updateAction(item.id, { descripcion: e.target.value })}
                        placeholder="Descripción de la acción acordada…" style={inputBase} />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 90px", gap: S[2] }}>
                        <input type="text" value={item.responsable}
                          onChange={e => updateAction(item.id, { responsable: e.target.value })}
                          placeholder="Responsable" style={inputBase} />
                        <input type="text" value={item.fecha}
                          onChange={e => updateAction(item.id, { fecha: e.target.value })}
                          placeholder="Fecha objetivo" style={inputBase} />
                        <select value={item.prioridad}
                          onChange={e => updateAction(item.id, { prioridad: e.target.value as ActionPriority })}
                          style={{ ...inputBase, padding: `${S[1]}px ${S[2]}px` }}>
                          <option value="alta">Alta</option>
                          <option value="media">Media</option>
                          <option value="baja">Baja</option>
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: S[3] }}>
                        {(["pendiente", "en_progreso", "completado"] as ActionStatus[]).map(st => (
                          <button key={st} type="button" onClick={() => updateAction(item.id, { estado: st })}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              fontFamily: T.mono, fontSize: 10,
                              color: item.estado === st ? STATUS_META[st].color : C.inkGhost,
                              background: "none", border: "none", cursor: "pointer", padding: 0,
                            }}>
                            <span style={{ fontSize: 9 }}>{item.estado === st ? "●" : "○"}</span>
                            {STATUS_META[st].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={addAction} style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: S[2], width: "100%",
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
              color: C.blueDark, background: "#eff6ff",
              border: "1.5px dashed #93c5fd", borderRadius: R.md,
              padding: `${S[3]}px`, cursor: "pointer",
              marginTop: acta.acciones.length > 0 ? S[1] : 0,
            }}>
              + Agregar acción
            </button>
            <SaveBar
              tabKey="acciones"
              dirty={dirty.has("acciones")}
              status={sectionStatus.acciones ?? "idle"}
              savedAt={savedAt.acciones ?? null}
              onSave={() => saveSection("acciones")}
            />
          </>
        )}

        {/* ══ Acta completa ══ */}
        {tab === "acta" && (
          <>
            <Field label="Observaciones generales de la reunión">
              <textarea
                value={acta.observaciones}
                onChange={e => {
                  setActa(prev => ({ ...prev, observaciones: e.target.value }));
                  markDirty("acta");
                }}
                placeholder="Contexto general, acuerdos verbales, puntos para próxima reunión…"
                rows={4}
                style={{ ...inputBase, resize: "vertical" }}
              />
            </Field>

            {/* Compiled summary */}
            <div style={{
              background: C.surfaceAlt, border: `1px solid ${C.line}`,
              borderRadius: R.md, padding: `${S[4]}px`,
            }}>
              <div style={{
                fontFamily: T.mono, fontSize: 9, fontWeight: 700,
                letterSpacing: "0.08em", color: C.inkFaint,
                marginBottom: S[3], textTransform: "uppercase" as const,
              }}>
                Resumen del acta · {agreementId ? "guardada en base de datos" : "sin persistir en DB"}
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
                <ActaRow label="Método acordado"          value={METHOD_LABELS[acta.metodo.tipo]} />
                <ActaRow label="Acceso histórico"         value={acta.metodo.accesoHistorico} />
                <ActaRow label="Frecuencia"               value={FREQ_LABELS[acta.sincronizacion.frecuencia]} />
                <ActaRow label="Tabla ventas"             value={acta.fuentes.tablaVentas} />
                <ActaRow label="Tabla pagos"              value={acta.fuentes.tablaPagos} />
                <ActaRow label="Tabla recaudos"           value={acta.fuentes.tablaRecaudos} />
                <ActaRow label="Tabla cartera"            value={acta.fuentes.tablaCartera} />
                <ActaRow
                  label="Responsable SAG"
                  value={[acta.responsables.nombreSag, acta.responsables.rolSag].filter(Boolean).join(" · ")}
                />
                <ActaRow
                  label="Responsable Agentik"
                  value={[acta.responsables.nombreAgentik, acta.responsables.rolAgentik].filter(Boolean).join(" · ")}
                />
                <ActaRow label="Próxima reunión"          value={acta.responsables.proxReunion} />
                <ActaRow
                  label="Plan de acción"
                  value={acta.acciones.length > 0
                    ? `${acta.acciones.length} acción${acta.acciones.length !== 1 ? "es" : ""}`
                    : "Sin acciones"}
                />
              </div>

              {acta.acciones.length > 0 && (
                <div style={{ marginTop: S[3], borderTop: `1px solid ${C.line}`, paddingTop: S[3] }}>
                  <div style={{
                    fontFamily: T.mono, fontSize: 9, fontWeight: 700,
                    letterSpacing: "0.08em", color: C.inkFaint,
                    marginBottom: S[2], textTransform: "uppercase" as const,
                  }}>
                    Acciones acordadas
                  </div>
                  {acta.acciones.map((a, i) => (
                    <div key={a.id} style={{ display: "flex", gap: S[2], marginBottom: S[2], alignItems: "flex-start" }}>
                      <span style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, flexShrink: 0 }}>
                        {i + 1}.
                      </span>
                      <div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
                          {a.descripcion || "(sin descripción)"}
                        </div>
                        <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, marginTop: 1 }}>
                          {[
                            a.responsable && `Resp: ${a.responsable}`,
                            a.fecha       && `Fecha: ${a.fecha}`,
                            STATUS_META[a.estado].label,
                          ].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <SaveBar
              tabKey="acta"
              dirty={dirty.has("acta")}
              status={sectionStatus.acta ?? "idle"}
              savedAt={savedAt.acta ?? null}
              onSave={() => saveSection("acta")}
            />
          </>
        )}

      </div>
    </div>
  );
}
