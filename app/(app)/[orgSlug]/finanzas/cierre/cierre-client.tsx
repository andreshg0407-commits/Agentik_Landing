"use client";

/**
 * CierreClient
 *
 * Centro Operacional de Cierre Financiero V1.
 * Cierre continuo · validación operacional · control financiero del período.
 *
 * Principio: el cierre financiero NO es un evento mensual. Es un proceso continuo vivo.
 * Agentik guía el cierre durante todo el mes — detecta bloqueos antes de que exploten.
 *
 * Sprint: AGENTIK-FINANCE-CLOSING-V1-01
 * All data: PLACEHOLDER — replace with API/Prisma queries before ship.
 */

import Link                           from "next/link";
import { useState }                   from "react";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { CollapsibleSection }         from "@/components/workspace/collapsible-section";
import { OperationalSideDrawer }      from "@/components/workspace/operational-side-drawer";
import type { DrawerSeverity }        from "@/components/workspace/operational-side-drawer";
import { C, T, S, R, E }            from "@/lib/ui/tokens";
import { opActionBtn, opActionCol, opStatusActionCol } from "@/lib/ui/op-table";
import type { CloseScore }              from "@/lib/finance/close-score";
import type { FinancialSourceStatus }   from "@/lib/finance/graph";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type Severity        = "critical" | "warning" | "normal" | "info";
type PipelineStatus  = "ok" | "warning" | "critical" | "pending" | "blocked";
type RiesgoLevel     = "bajo" | "moderado" | "alto" | "critico";
type BlockerPriority = "critico" | "alto" | "medio";
type InformeEstado   = "listo" | "en_preparacion" | "bloqueado" | "requiere_validacion" | "datos_incompletos";

type DrawerCtx =
  | { type: "blocker";        index: number }
  | { type: "validation";     index: number }
  | { type: "pipeline_stage"; index: number }
  | { type: "result";         index: number }
  | { type: "ia_obs";         index: number }
  | { type: "informe";        index: number };

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA — PLACEHOLDER: replace with real API queries before ship
// ─────────────────────────────────────────────────────────────────────────────

const CIERRE_STATUS = {
  periodo:             "Abril 2026",
  progreso:            78,
  bloqueosCriticos:    2,
  concilPendientes:    1,
  validPendientes:     4,
  riesgo:              "moderado" as RiesgoLevel,
  diasRestantes:       3,
  badge:               "2 bloqueos críticos · 78% validado",
  lastUpdate:          "Hace 8 min",
  tendencia:           +17,                        // pts vs same day previous period
  siguienteDesbloqueo: "Conciliar Bancolombia",
  siguienteHref:       "conciliacion" as const,
};

const PIPELINE_STAGES: Array<{
  id:       string;
  label:    string;
  status:   PipelineStatus;
  count:    number;
  unit:     string;
  detail:   string;
  blocker?: string;
}> = [
  {
    id: "documentos", label: "Documentos",
    status: "ok", count: 847, unit: "documentos",
    detail: "100% cargados y clasificados · sin pendientes",
  },
  {
    id: "conciliacion", label: "Conciliación",
    status: "warning", count: 1, unit: "pendiente",
    detail: "Bancolombia Abr 2026 sin conciliar",
    blocker: "Bancolombia Abr 2026",
  },
  {
    id: "validacion", label: "Validación",
    status: "warning", count: 3, unit: "en revisión",
    detail: "3 XML DIAN requieren validación",
    blocker: "XML DIAN inconsistentes",
  },
  {
    id: "ajustes", label: "Ajustes",
    status: "pending", count: 0, unit: "pendiente",
    detail: "Esperando conciliación y validación contable",
  },
  {
    id: "aprobacion", label: "Aprobación",
    status: "pending", count: 0, unit: "pendiente",
    detail: "Requiere ajustes completados",
  },
  {
    id: "cierre", label: "Cierre final",
    status: "pending", count: 0, unit: "no iniciado",
    detail: "Pipeline completo requerido para iniciar cierre",
  },
];

const BLOCKERS: Array<{
  id:       string;
  prioridad: BlockerPriority;
  label:    string;
  fuente:   string;
  impacto:  string;
  accion:   string;
  cta:      string;
  href:     "conciliacion" | "documentos" | "tesoreria" | "validaciones";
  timeline: Array<{ time: string; label: string; severity?: Severity }>;
}> = [
  {
    id: "B001", prioridad: "critico",
    label:   "Bancolombia sin conciliar — Abr 2026",
    fuente:  "Conciliación Inteligente",
    impacto: "Retraso de cierre estimado: 5 días adicionales si no se resuelve hoy",
    accion:  "Ir a Conciliación Inteligente →",
    cta:     "Conciliar →",
    href:    "conciliacion",
    timeline: [
      { time: "Hace 2 días",  label: "Extracto Bancolombia disponible en Centro Documental" },
      { time: "Hace 1 día",   label: "Motor IA detectó 1.203 movimientos sin cruzar", severity: "warning" },
      { time: "Hoy 08:00",    label: "Bloqueo escalado — impacto en cierre confirmado", severity: "critical" },
    ],
  },
  {
    id: "B002", prioridad: "critico",
    label:   "3 XML DIAN inconsistentes — período Abr 2026",
    fuente:  "Centro Documental · DIAN",
    impacto: "Riesgo tributario · cierre tributario bloqueado hasta resolución",
    accion:  "Revisar en Centro Documental →",
    cta:     "Ver docs →",
    href:    "documentos",
    timeline: [
      { time: "Hace 3 días",  label: "XML DIAN recibidos por sincronización automática" },
      { time: "Hace 2 días",  label: "Motor IA detectó inconsistencia de NIT en 3 documentos", severity: "warning" },
      { time: "Hoy",          label: "Bloqueo activo · validación manual requerida", severity: "critical" },
    ],
  },
  {
    id: "B003", prioridad: "alto",
    label:   "3 soportes de pago faltantes",
    fuente:  "Centro Documental",
    impacto: "Auditoría incompleta · 3 movimientos sin soporte documental válido",
    accion:  "Cargar soportes en Centro Documental →",
    cta:     "Cargar →",
    href:    "documentos",
    timeline: [
      { time: "Hace 5 días",  label: "3 pagos registrados en SAG sin soporte asociado" },
      { time: "Hace 2 días",  label: "Agentik IA marcó como faltantes en checklist de cierre", severity: "warning" },
    ],
  },
  {
    id: "B004", prioridad: "medio",
    label:   "Cartera pendiente de validación",
    fuente:  "Tesorería Operativa",
    impacto: "Diferencias potenciales en balance general si cartera no se confirma",
    accion:  "Validar en Tesorería →",
    cta:     "Ver tesorería →",
    href:    "tesoreria",
    timeline: [
      { time: "Ayer",  label: "Cartera Abr 2026 generada — pendiente revisión operador" },
    ],
  },
  {
    id: "B005", prioridad: "medio",
    label:   "Impuestos del período sin aprobar",
    fuente:  "Validaciones pendientes",
    impacto: "Cierre tributario parcial hasta aprobación del período",
    accion:  "Ir a validaciones →",
    cta:     "Validar →",
    href:    "validaciones",
    timeline: [
      { time: "Hace 4 días",  label: "IVA y retención calculados por Motor IA" },
      { time: "Ayer",         label: "Pendiente aprobación responsable contable", severity: "warning" },
    ],
  },
];

const VALIDATIONS: Array<{
  id:      string;
  label:   string;
  tipo:    string;
  monto:   number;
  origen:  string;
  cta:     string;
  sevCss:  string;
  sev:     Severity;
  detail:  string;
  timeline: Array<{ time: string; label: string; severity?: Severity }>;
}> = [
  {
    id: "V001", label: "Nota crédito #NC-2891 · Proveedor Alfa",
    tipo: "Ajuste", monto: 4_320_000, origen: "SAG",
    cta: "Aprobar", sevCss: "ag-op-status--warning", sev: "warning",
    detail: "Nota crédito aplicada sobre factura F-2026-0881. Requiere aprobación para consolidar en PYG.",
    timeline: [
      { time: "Hace 2 días", label: "Nota crédito recibida de Proveedor Alfa" },
      { time: "Ayer",        label: "Motor IA verificó consistencia con factura original" },
      { time: "Hoy",        label: "Pendiente aprobación · bloquea cierre de cuentas", severity: "warning" },
    ],
  },
  {
    id: "V002", label: "Diferencia extracto Bancolombia · día 28",
    tipo: "Dif. bancaria", monto: 180_000, origen: "BC · Abr 28",
    cta: "Revisar", sevCss: "ag-op-status--critical", sev: "critical",
    detail: "Diferencia de $180.000 entre extracto Bancolombia y registro SAG del día 28 de abril. Posible comisión no registrada.",
    timeline: [
      { time: "Hoy 08:31",   label: "Diferencia detectada automáticamente por Motor IA", severity: "warning" },
      { time: "Hoy 08:32",   label: "Escalada a revisión humana — valor < umbral crítico" },
    ],
  },
  {
    id: "V003", label: "Reclasificación gasto · Cuenta 5135",
    tipo: "Reclasif.", monto: 0, origen: "SAG",
    cta: "Validar", sevCss: "ag-op-status--warning", sev: "warning",
    detail: "Agentik detectó gasto clasificado en cuenta 5135 que debería reclasificarse en 5290 según reglas del plan de cuentas activo.",
    timeline: [
      { time: "Hace 3 días", label: "Gasto registrado en cuenta 5135" },
      { time: "Ayer",        label: "Motor IA detectó inconsistencia con reglas del plan de cuentas", severity: "warning" },
    ],
  },
  {
    id: "V004", label: "Saldo inicial Davivienda no confirmado",
    tipo: "Val. saldo", monto: 15_320_000, origen: "DV · Mar 2026",
    cta: "Confirmar", sevCss: "ag-op-status--warning", sev: "warning",
    detail: "El saldo de apertura Davivienda para abril 2026 no ha sido confirmado contra el extracto de cierre de marzo.",
    timeline: [
      { time: "Hace 4 días", label: "Saldo inicial importado desde extracto Mar 2026" },
      { time: "Hace 2 días", label: "Pendiente confirmación manual por operador", severity: "warning" },
    ],
  },
];

const IA_OBSERVATIONS: Array<{
  id:      string;
  obs:     string;
  tipo:    "riesgo" | "preventivo" | "positivo" | "alerta";
  accion:  string;
  impacto: string;
  cta:     string;
  ctaHref: string;
}> = [
  {
    id: "IA001", tipo: "riesgo",
    accion:  "Conciliar Bancolombia",
    impacto: "Elimina el 42% del riesgo de retraso del cierre",
    cta:     "Ir a conciliación",
    ctaHref: "conciliacion",
    obs:     "Resolver la conciliación Bancolombia es la acción de mayor impacto disponible hoy.",
  },
  {
    id: "IA002", tipo: "alerta",
    accion:  "Validar 3 XML DIAN",
    impacto: "Desbloquea etapa de ajustes automáticamente",
    cta:     "Ir a documentos",
    ctaHref: "documentos",
    obs:     "El cierre tributario depende de 3 XML DIAN sin validar. Aprobarlos desbloqueará la etapa de ajustes.",
  },
  {
    id: "IA003", tipo: "positivo",
    accion:  "Tendencia positiva confirmada",
    impacto: "+17 pts vs cierre anterior al día 12",
    cta:     "",
    ctaHref: "",
    obs:     "78% de validación a día 12 vs. 61% en el mismo punto del mes anterior. Período más estable que marzo.",
  },
  {
    id: "IA004", tipo: "preventivo",
    accion:  "Revisar retenciones Proveedor Alfa",
    impacto: "Evita ajustes manuales en consolidación del PYG",
    cta:     "Ver documentos",
    ctaHref: "documentos",
    obs:     "2 facturas del proveedor Alfa presentan diferencias de retención que pueden afectar el cierre.",
  },
];

const RESULTS: Array<{
  id:      string;
  label:   string;
  tipo:    string;
  estado:  string;
  estCss:  string;
  formats: string[];
  detail:  string;
}> = [
  {
    id: "R001", label: "Balance General · Abr 2026",
    tipo: "Estado financiero", estado: "Pendiente aprobación", estCss: "ag-op-status--warning",
    formats: ["PDF", "XLSX"],
    detail: "Balance general pendiente de aprobación. Requiere resolución de bloqueadores activos antes de generar versión final.",
  },
  {
    id: "R002", label: "Estado de Resultados · Abr 2026",
    tipo: "PYG", estado: "Pendiente cierre", estCss: "ag-op-status--stale",
    formats: ["PDF", "XLSX"],
    detail: "PYG en construcción. 1 reclasificación pendiente puede afectar los totales. Se consolida al aprobar ajustes.",
  },
  {
    id: "R003", label: "Declaraciones DIAN · Abr 2026",
    tipo: "XML DIAN", estado: "3 pendientes", estCss: "ag-op-status--critical",
    formats: ["XML", "PDF"],
    detail: "3 XML DIAN con inconsistencias detectadas. No exportable hasta validación humana aprobada.",
  },
  {
    id: "R004", label: "Paquete de Auditoría · Abr 2026",
    tipo: "Auditoría", estado: "Pendiente cierre", estCss: "ag-op-status--stale",
    formats: ["ZIP", "PDF"],
    detail: "Paquete de trazabilidad completa. Se genera automáticamente al completar el cierre. Incluye todos los movimientos, soportes y validaciones.",
  },
];

const INFORMES_CIERRE: Array<{
  id:       string;
  label:    string;
  fuentes:  string[];
  estado:   InformeEstado;
  blocker?: string;
  formatos: string[];
  accion:   string;
  detail:   string;
}> = [
  {
    id: "I001", label: "Estado de Resultados",
    fuentes: ["Ventas", "Costos", "Documentos", "Conciliación"],
    estado: "bloqueado", blocker: "1 conciliación bancaria pendiente",
    formatos: ["PDF", "XLSX"], accion: "Resolver",
    detail: "Requiere conciliación Bancolombia completa. Agentik consolida automáticamente ingresos, costos y gastos del período.",
  },
  {
    id: "I002", label: "PYG · Pérdidas y Ganancias",
    fuentes: ["SAG", "Conciliación", "Documentos"],
    estado: "bloqueado", blocker: "Reclasificación Cta. 5135 pendiente",
    formatos: ["PDF", "XLSX"], accion: "Validar",
    detail: "PYG bloqueado por 1 reclasificación pendiente de aprobación. Una vez aprobada, Agentik consolidará el resultado del período.",
  },
  {
    id: "I003", label: "Balance General",
    fuentes: ["SAG", "Tesorería", "Conciliación"],
    estado: "requiere_validacion", blocker: "Cartera sin confirmar",
    formatos: ["PDF", "XLSX"], accion: "Confirmar",
    detail: "Balance en construcción. Cartera pendiente de validación puede generar diferencias. Confirmar en Tesorería para desbloquear.",
  },
  {
    id: "I004", label: "Cierre Fiscal · Abr 2026",
    fuentes: ["DIAN", "Documentos", "SAG"],
    estado: "bloqueado", blocker: "3 XML DIAN inconsistentes",
    formatos: ["XML", "PDF"], accion: "Revisar",
    detail: "Cierre tributario bloqueado. 3 documentos DIAN con inconsistencias de NIT requieren validación antes de generar declaraciones.",
  },
  {
    id: "I005", label: "Cierre Financiero · Abr 2026",
    fuentes: ["Todos los módulos"],
    estado: "en_preparacion",
    formatos: ["PDF", "XLSX"], accion: "Ver estado",
    detail: "Cierre financiero completo en preparación. Agentik consolida datos de todos los módulos al completar el pipeline operacional.",
  },
  {
    id: "I006", label: "Informe Ejecutivo del Período",
    fuentes: ["Cierre", "Ventas", "Tesorería"],
    estado: "en_preparacion",
    formatos: ["PDF"], accion: "Ver borrador",
    detail: "Informe ejecutivo preparado para dirección. Incluye resumen de resultados, variaciones y alertas del período.",
  },
  {
    id: "I007", label: "Comparativo Pedidos vs Ventas",
    fuentes: ["SAG", "Ventas", "Pedidos"],
    estado: "listo",
    formatos: ["PDF", "XLSX"], accion: "Generar",
    detail: "Comparativo disponible. Datos de pedidos y ventas del período completos y validados por Motor IA.",
  },
  {
    id: "I008", label: "Seguimiento de Producción",
    fuentes: ["SAG", "Producción"],
    estado: "listo",
    formatos: ["XLSX"], accion: "Generar",
    detail: "Datos de producción del período disponibles. Incluye eficiencia, órdenes y comparativo vs. período anterior.",
  },
  {
    id: "I009", label: "Tasa de Cumplimiento",
    fuentes: ["Pedidos", "Producción", "Ventas"],
    estado: "listo",
    formatos: ["PDF", "XLSX"], accion: "Generar",
    detail: "Tasa de cumplimiento calculada sobre pedidos vs. entregas reales. Período cerrado con datos completos.",
  },
  {
    id: "I010", label: "Paquete de Auditoría",
    fuentes: ["Todos los módulos"],
    estado: "en_preparacion",
    formatos: ["ZIP", "PDF"], accion: "Ver estado",
    detail: "Paquete de trazabilidad completa para auditoría externa. Se genera automáticamente al completar el cierre financiero.",
  },
];

const INFORME_ESTADO_LABEL: Record<InformeEstado, string> = {
  listo:               "Listo",
  en_preparacion:      "Preparando",
  bloqueado:           "Bloqueado",
  requiere_validacion: "Validar",
  datos_incompletos:   "Incompleto",
};

const INFORME_ESTADO_CSS: Record<InformeEstado, string> = {
  listo:               "ag-op-status--ok",
  en_preparacion:      "ag-op-status--stale",
  bloqueado:           "ag-op-status--critical",
  requiere_validacion: "ag-op-status--warning",
  datos_incompletos:   "ag-op-status--warning",
};

const INFORME_ESTADO_COLOR: Record<InformeEstado, string> = {
  listo:               C.green,
  en_preparacion:      C.inkMid,
  bloqueado:           C.red,
  requiere_validacion: C.amber,
  datos_incompletos:   C.amber,
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmtM(n: number): string {
  return `$${n.toLocaleString("es-CO")}`;
}

const SEV_DOT: Record<Severity, string> = {
  critical: C.red, warning: C.amber, normal: C.green, info: C.blue,
};

const SEV_TO_DRAWER: Record<Severity, DrawerSeverity> = {
  critical: "critical", warning: "warning", normal: "info", info: "info",
};

const PIPELINE_COLOR: Record<PipelineStatus, string> = {
  ok:       C.green,
  warning:  C.amber,
  critical: C.red,
  pending:  C.inkGhost,
  blocked:  C.red,
};

const PIPELINE_CSS: Record<PipelineStatus, string> = {
  ok:       "ag-op-status--ok",
  warning:  "ag-op-status--warning",
  critical: "ag-op-status--critical",
  pending:  "ag-op-status--stale",
  blocked:  "ag-op-status--critical",
};

const BLOCKER_COLOR: Record<BlockerPriority, string> = {
  critico: C.red, alto: C.amber, medio: C.inkMid,
};

const BLOCKER_CSS: Record<BlockerPriority, string> = {
  critico: "ag-op-status--critical", alto: "ag-op-status--warning", medio: "ag-op-status--stale",
};

const RIESGO_COLOR: Record<RiesgoLevel, string> = {
  bajo: C.green, moderado: C.amber, alto: C.red, critico: C.red,
};

const IA_OBS_COLOR: Record<"riesgo" | "preventivo" | "positivo" | "alerta", string> = {
  riesgo:     C.red,
  alerta:     C.amber,
  preventivo: C.blue,
  positivo:   C.green,
};

const IA_OBS_LABEL: Record<"riesgo" | "preventivo" | "positivo" | "alerta", string> = {
  riesgo:     "RIESGO",
  alerta:     "ALERTA",
  preventivo: "PREVENTIVO",
  positivo:   "TENDENCIA",
};

// ─────────────────────────────────────────────────────────────────────────────
// PAGE-LEVEL SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FinanceSectionHeader — section divider with Agentik finance identity.
 * Blue gradient tint signals system structure. Accent border carries semantic color.
 * Single source of truth for ALL section headers in Cierre Financiero.
 */
function FinanceSectionHeader({ label, meta, accent }: { label: string; meta?: string; accent?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: S[2], marginBottom: S[5],
      padding: `${S[2] + 2}px ${S[3]}px`,
      background: "linear-gradient(180deg, rgba(37,99,235,0.045) 0%, rgba(37,99,235,0.018) 100%)",
      border: "1px solid rgba(37,99,235,0.08)",
      ...(accent ? { borderLeft: `3px solid ${accent}` } : {}),
      borderRadius: R.md,
    }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{label}</span>
      {meta && <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>· {meta}</span>}
    </div>
  );
}

function PassiveAction({ label }: { label: string }) {
  return (
    <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkGhost, padding: `${S[2]}px ${S[3]}px`, display: "block", cursor: "default", userSelect: "none" as const }}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAWER INTERNAL COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function DSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: S[5] }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: S[2], paddingBottom: S[1], borderBottom: `1px solid ${C.lineSubtle}` }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function DRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${S[2]}px 0`, borderBottom: `1px solid ${C.lineSubtle}` }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{label}</span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: accent ?? C.ink }}>{value}</span>
    </div>
  );
}

function DrawerMetricGrid({ items }: { items: Array<{ label: string; value: string; accent?: string }> }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2], marginBottom: S[5] }}>
      {items.map(item => (
        <div key={item.label} style={{
          background: C.surface, border: `1px solid ${C.lineSubtle}`,
          borderLeft: `3px solid ${item.accent ?? C.lineSubtle}`,
          borderRadius: R.md, padding: `${S[3]}px ${S[3]}px ${S[2]}px`,
        }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: S[1] }}>{item.label}</div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: 700, color: item.accent ?? C.ink, lineHeight: 1.2 }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function DrawerTimeline({ title, events }: {
  title?:  string;
  events:  Array<{ time: string; label: string; severity?: Severity }>;
}) {
  return (
    <div style={{ marginBottom: S[5] }}>
      {title && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: S[3], paddingBottom: S[1], borderBottom: `1px solid ${C.lineSubtle}` }}>
          {title}
        </div>
      )}
      <div>
        {events.map((ev, i) => (
          <div key={i} style={{ display: "flex", gap: S[3] }}>
            <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", flexShrink: 0, width: 10 }}>
              <div style={{
                width: 10, height: 10, borderRadius: R.pill, flexShrink: 0, marginTop: 2,
                background: ev.severity ? SEV_DOT[ev.severity] : C.blue,
                boxShadow: `0 0 0 2px ${C.white}`,
              }} />
              {i < events.length - 1 && <div style={{ width: 1, flex: 1, background: C.lineSubtle, minHeight: S[3], marginTop: 2 }} />}
            </div>
            <div style={{ paddingBottom: i < events.length - 1 ? S[3] : 0, minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: 2 }}>{ev.time}</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.5 }}>{ev.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DrawerAIRecommendation({ text }: { text: string }) {
  return (
    <div style={{ background: C.blueLight, border: `1px solid ${C.blueBorder}`, borderLeft: `3px solid ${C.blueDark}`, borderRadius: R.md, padding: S[4], marginBottom: S[4] }}>
      <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[2] }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 16, borderRadius: R.sm, background: C.blueDark, color: C.white, fontFamily: T.mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.04em", flexShrink: 0 }}>
          IA
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Agentik detecta</span>
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, lineHeight: 1.7 }}>{text}</div>
    </div>
  );
}

function DrawerTraceability({ source, updated }: { source: string; updated: string }) {
  return (
    <div style={{ marginTop: S[5], paddingTop: S[3], borderTop: `1px solid ${C.lineSubtle}`, display: "flex", alignItems: "center", gap: S[2] }}>
      <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: R.pill, background: C.green, flexShrink: 0 }} />
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>{source} · {updated}</span>
    </div>
  );
}

function DActions({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2], paddingTop: S[4], borderTop: `1px solid ${C.lineSubtle}` }}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAWER RESOLVER
// ─────────────────────────────────────────────────────────────────────────────

function getDrawerProps(ctx: DrawerCtx | null, orgSlug: string): {
  title:       string;
  subtitle?:   string;
  statusLabel?: string;
  severity?:   DrawerSeverity;
  content:     React.ReactNode;
} {
  if (!ctx) return { title: "", content: null };

  switch (ctx.type) {

    case "blocker": {
      const bl = BLOCKERS[ctx.index];
      if (!bl) return { title: "Bloqueo", content: null };
      return {
        title:       bl.label,
        subtitle:    `${bl.prioridad.toUpperCase()} · ${bl.fuente}`,
        statusLabel: bl.prioridad.toUpperCase(),
        severity:    bl.prioridad === "critico" ? "critical" : bl.prioridad === "alto" ? "warning" : "watch",
        content: (
          <>
            <DrawerMetricGrid items={[
              { label: "Prioridad", value: bl.prioridad.toUpperCase(), accent: BLOCKER_COLOR[bl.prioridad] },
              { label: "Fuente",    value: bl.fuente },
            ]} />
            <DSection title="Impacto operacional">
              <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.7, margin: 0 }}>{bl.impacto}</p>
            </DSection>
            <DrawerTimeline title="Historial del bloqueo" events={bl.timeline} />
            <DrawerAIRecommendation text={`Bloqueo "${bl.label}" activo en cierre Abril 2026. ${bl.impacto} Acción recomendada: ${bl.accion}`} />
            <DActions>
              <Link
                href={`/${orgSlug}/finanzas/${bl.href}`}
                className="ag-action-primary"
                style={{ textDecoration: "none", textAlign: "center" as const, fontSize: T.sz.sm }}
              >
                {bl.accion}
              </Link>
              <PassiveAction label="Marcar como en proceso" />
              <PassiveAction label="Escalar a responsable" />
            </DActions>
            <DrawerTraceability source={`Agentik IA · ${bl.fuente}`} updated={CIERRE_STATUS.lastUpdate} />
          </>
        ),
      };
    }

    case "validation": {
      const val = VALIDATIONS[ctx.index];
      if (!val) return { title: "Validación", content: null };
      return {
        title:       val.label,
        subtitle:    `${val.tipo} · ${val.origen}`,
        statusLabel: val.tipo.toUpperCase(),
        severity:    SEV_TO_DRAWER[val.sev],
        content: (
          <>
            <DrawerMetricGrid items={[
              { label: "Tipo",    value: val.tipo,                                    accent: C.amber  },
              { label: "Monto",  value: val.monto > 0 ? fmtM(val.monto) : "—",      accent: C.amber  },
              { label: "Origen", value: val.origen },
              { label: "Acción", value: val.cta },
            ]} />
            <DSection title="Detalle de la validación">
              <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.7, margin: 0 }}>{val.detail}</p>
            </DSection>
            <DrawerTimeline title="Historial" events={val.timeline} />
            <DrawerAIRecommendation text={`Validación pendiente detectada automáticamente. ${val.detail} Aprobar o revisar antes del cierre del período para evitar diferencias en estados financieros.`} />
            <DActions>
              <PassiveAction label={`${val.cta} →`} />
              <PassiveAction label="Solicitar revisión adicional" />
            </DActions>
            <DrawerTraceability source="Motor IA · Validaciones automáticas" updated={CIERRE_STATUS.lastUpdate} />
          </>
        ),
      };
    }

    case "pipeline_stage": {
      const stage = PIPELINE_STAGES[ctx.index];
      if (!stage) return { title: "Etapa", content: null };
      const sev: DrawerSeverity = stage.status === "warning" ? "warning" : stage.status === "critical" ? "critical" : stage.status === "blocked" ? "critical" : "info";
      return {
        title:       stage.label,
        subtitle:    `Etapa ${ctx.index + 1} de ${PIPELINE_STAGES.length} · Cierre ${CIERRE_STATUS.periodo}`,
        statusLabel: stage.status.toUpperCase(),
        severity:    sev,
        content: (
          <>
            <DrawerMetricGrid items={[
              { label: "Estado",  value: stage.status.toUpperCase(), accent: PIPELINE_COLOR[stage.status] },
              { label: "Conteo",  value: `${stage.count} ${stage.unit}` },
            ]} />
            <DSection title="Detalle operacional">
              <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.7, margin: 0 }}>{stage.detail}</p>
            </DSection>
            {stage.blocker && (
              <DSection title="Bloqueo activo">
                <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red, lineHeight: 1.7, margin: 0 }}>{stage.blocker}</p>
              </DSection>
            )}
            <DrawerAIRecommendation text={`Etapa "${stage.label}" ${stage.status === "ok" ? "completada sin bloqueos" : "requiere atención"}. ${stage.detail}`} />
            <DActions>
              <PassiveAction label="Ver detalle completo" />
            </DActions>
            <DrawerTraceability source={`Motor IA · Pipeline Cierre ${CIERRE_STATUS.periodo}`} updated={CIERRE_STATUS.lastUpdate} />
          </>
        ),
      };
    }

    case "result": {
      const res = RESULTS[ctx.index];
      if (!res) return { title: "Resultado", content: null };
      return {
        title:       res.label,
        subtitle:    `${res.tipo} · Formatos: ${res.formats.join(", ")}`,
        statusLabel: res.estado.toUpperCase(),
        severity:    res.estado.includes("aprobación") ? "warning" : "info",
        content: (
          <>
            <DrawerMetricGrid items={[
              { label: "Tipo",    value: res.tipo    },
              { label: "Estado",  value: res.estado  },
              { label: "Formatos", value: res.formats.join(", ") },
              { label: "Período", value: CIERRE_STATUS.periodo },
            ]} />
            <DSection title="Descripción">
              <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.7, margin: 0 }}>{res.detail}</p>
            </DSection>
            <DrawerAIRecommendation text={`"${res.label}" disponible para exportación una vez el cierre ${CIERRE_STATUS.periodo} esté completado. ${res.detail}`} />
            <DActions>
              <PassiveAction label={`Descargar ${res.formats[0]} →`} />
              {res.formats[1] && <PassiveAction label={`Descargar ${res.formats[1]} →`} />}
              <PassiveAction label="Enviar por correo →" />
            </DActions>
            <DrawerTraceability source={`Motor de Cierre · ${CIERRE_STATUS.periodo}`} updated={CIERRE_STATUS.lastUpdate} />
          </>
        ),
      };
    }

    case "informe": {
      const inf = INFORMES_CIERRE[ctx.index];
      if (!inf) return { title: "Informe", content: null };
      const infSev: DrawerSeverity = inf.estado === "bloqueado" ? "critical" : inf.estado === "requiere_validacion" || inf.estado === "datos_incompletos" ? "warning" : "info";
      return {
        title:       inf.label,
        subtitle:    `Informe oficial · ${CIERRE_STATUS.periodo} · ${inf.formatos.join(", ")}`,
        statusLabel: INFORME_ESTADO_LABEL[inf.estado].toUpperCase(),
        severity:    infSev,
        content: (
          <>
            <DrawerMetricGrid items={[
              { label: "Estado",   value: INFORME_ESTADO_LABEL[inf.estado], accent: INFORME_ESTADO_COLOR[inf.estado] },
              { label: "Período",  value: CIERRE_STATUS.periodo },
              { label: "Fuentes",  value: inf.fuentes.join(" · ") },
              { label: "Formatos", value: inf.formatos.join(", ") },
            ]} />
            {inf.blocker && (
              <DSection title="Bloqueo activo">
                <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red, lineHeight: 1.7, margin: 0 }}>{inf.blocker}</p>
              </DSection>
            )}
            <DSection title="Descripción del informe">
              <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.7, margin: 0 }}>{inf.detail}</p>
            </DSection>
            <DSection title="Datos desde">
              {inf.fuentes.map((f, i) => <DRow key={i} label={`Fuente ${i + 1}`} value={f} accent={C.blueDark} />)}
            </DSection>
            <DrawerAIRecommendation text={`"${inf.label}" — ${inf.detail} Agentik prepara y valida automáticamente los datos del informe al completar el pipeline de cierre.`} />
            <DActions>
              <PassiveAction label={`${inf.accion} →`} />
              {inf.formatos.map(f => <PassiveAction key={f} label={`Exportar ${f} →`} />)}
            </DActions>
            <DrawerTraceability source={`Motor de Cierre · ${inf.fuentes.join(", ")}`} updated={CIERRE_STATUS.lastUpdate} />
          </>
        ),
      };
    }

    case "ia_obs": {
      const obs = IA_OBSERVATIONS[ctx.index];
      if (!obs) return { title: "Observación IA", content: null };
      return {
        title:       `Observación ${IA_OBS_LABEL[obs.tipo]}`,
        subtitle:    `Agentik IA · Cierre ${CIERRE_STATUS.periodo}`,
        statusLabel: IA_OBS_LABEL[obs.tipo],
        severity:    obs.tipo === "riesgo" ? "critical" : obs.tipo === "alerta" ? "warning" : "info",
        content: (
          <>
            <DrawerAIRecommendation text={obs.obs} />
            {obs.cta && (
              <DActions>
                <PassiveAction label={`${obs.cta} →`} />
              </DActions>
            )}
            <DrawerTraceability source="Agentik IA · Análisis continuo de cierre" updated={CIERRE_STATUS.lastUpdate} />
          </>
        ),
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function CierreClient({
  orgSlug,
  closeScore,
  graphIssueCount        = 0,
  graphCriticalCount     = 0,
  graphHasCriticalIssues = false,
  graphSourceStatus      = [],
}: {
  orgSlug:                 string;
  closeScore?:             CloseScore;
  graphIssueCount?:        number;
  graphCriticalCount?:     number;
  graphHasCriticalIssues?: boolean;
  graphSourceStatus?:      FinancialSourceStatus[];
}) {
  const [ctx, setCtx] = useState<DrawerCtx | null>(null);
  const open  = (c: DrawerCtx) => setCtx(c);
  const close = () => setCtx(null);
  const [informesExpanded, setInformesExpanded] = useState(false);

  // Derive operative values from real CloseScore + graph health
  // bloqueosCriticos: max of close-score blockers and graph critical issues
  const realBlockerCount = Math.max(closeScore?.blockers.length ?? 0, graphCriticalCount);
  const cierreStatus = {
    periodo:             "Mayo 2026",
    progreso:            closeScore?.total ?? 0,
    bloqueosCriticos:    realBlockerCount,
    concilPendientes:    closeScore?.dimensions.find(d => d.key === "reconciliation" && d.severity !== "ok") ? 1 : 0,
    validPendientes:     (closeScore?.warnings.length ?? 0) + graphIssueCount,
    riesgo:              (graphHasCriticalIssues ? "critico"
                          : !closeScore ? "moderado"
                          : closeScore.grade === "A" || closeScore.grade === "B" ? "bajo"
                          : closeScore.grade === "C" ? "moderado"
                          : closeScore.grade === "D" ? "alto"
                          : "critico") as RiesgoLevel,
    diasRestantes:       3,
    badge:               closeScore
                          ? `${realBlockerCount} bloqueos · ${closeScore.total}% validado · Grado ${closeScore.grade}${graphIssueCount > 0 ? ` · ${graphIssueCount} alertas graph` : ""}`
                          : graphIssueCount > 0
                          ? `${graphIssueCount} alertas en el graph financiero · evaluación pendiente`
                          : "Sin datos de cierre · evaluación pendiente",
    lastUpdate:          "Calculado ahora",
    tendencia:           0,
    siguienteDesbloqueo: closeScore?.blockers[0] ?? (graphHasCriticalIssues ? "Resolver inconsistencias del graph financiero" : "Ejecutar evaluación de cierre"),
    siguienteHref:       "conciliacion" as const,
  };

  const riesgoColor = RIESGO_COLOR[cierreStatus.riesgo];
  // Health color: green ≥76%, amber 41–75%, red ≤40%
  const progColor   = cierreStatus.progreso >= 76 ? C.green : cierreStatus.progreso >= 41 ? C.amber : C.red;

  const drawerProps = getDrawerProps(ctx, orgSlug);

  return (
    <div style={{ minWidth: 0 }}>

      {/* ── HEADER ───────────────────────────────────────────────────────── */}
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Torre de Control", href: `/${orgSlug}/executive` },
          { label: "Finanzas",         href: `/${orgSlug}/executive` },
          { label: "Cierre Financiero" },
        ]}
        title="Cierre Financiero"
        subtitle="Cierre continuo · validación operacional · control financiero del período"
        status={cierreStatus.bloqueosCriticos > 0 ? "warning" : "ok"}
        statusLabel={cierreStatus.badge}
      />


      {/* ── UPSTREAM INTEGRATION SIGNAL ─────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: S[2],
        marginBottom: S[6], flexWrap: "wrap" as const,
      }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Consume →</span>
        {[
          { label: "Centro Documental",    href: `/${orgSlug}/finanzas/documentos`,   color: C.blueDark, ok: true  },
          { label: "Conciliación",         href: `/${orgSlug}/finanzas/conciliacion`, color: C.amber,    ok: false },
          { label: "Tesorería",            href: `/${orgSlug}/finanzas/tesoreria`,    color: C.green,    ok: true  },
          { label: "Validaciones IA",      href: "#",                                  color: C.amber,    ok: false },
        ].map(src => (
          <Link key={src.label} href={src.href} style={{ textDecoration: "none" }}>
            <span style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 600,
              color: src.color, background: `${src.color}12`,
              border: `1px solid ${src.color}40`,
              borderRadius: R.pill, padding: `2px ${S[3]}px`,
              display: "inline-flex", alignItems: "center", gap: S[1],
            }}>
              <span style={{ display: "inline-block", width: 4, height: 4, borderRadius: "50%", background: src.ok ? C.green : C.amber }} />
              {src.label}
            </span>
          </Link>
        ))}
      </div>

      {/* ── 1. ESTADO DEL CIERRE — corazón del módulo ───────────────────── */}
      <section style={{ marginBottom: S[8] }}>
        <FinanceSectionHeader
          label={`Estado del cierre · ${cierreStatus.periodo}`}
          meta={`Actualizado ${cierreStatus.lastUpdate}`}
          accent={progColor}
        />
        <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.lg, overflow: "hidden", boxShadow: E.sm }}>
          {/* Barra dinámica — color según salud del cierre */}
          <div style={{ height: 6, background: C.surface }}>
            <div style={{
              height: "100%", width: `${cierreStatus.progreso}%`,
              background: progColor, borderRadius: "0 3px 3px 0",
              transition: "width 0.5s ease, background 0.4s ease",
            }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 240px", gap: 0 }}>
            {/* Col 1 — % dominante */}
            <div style={{
              padding: `${S[5]}px ${S[5]}px`,
              borderRight: `1px solid ${C.lineSubtle}`,
              display: "flex", flexDirection: "column" as const, justifyContent: "center", alignItems: "flex-start",
            }}>
              <div style={{
                fontFamily: T.mono, fontSize: "54px", fontWeight: 800,
                color: progColor, lineHeight: 1, marginBottom: S[1], letterSpacing: "-2px",
              }}>
                {cierreStatus.progreso}%
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[2] }}>
                validado · {cierreStatus.periodo}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
                <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: C.green, flexShrink: 0 }} />
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.green, fontWeight: 600 }}>
                  {cierreStatus.tendencia > 0 ? `+${cierreStatus.tendencia}` : cierreStatus.tendencia} pts vs mes ant.
                </span>
              </div>
            </div>
            {/* Col 2 — métricas contextuales: label > número */}
            <div style={{ padding: `${S[5]}px ${S[5]}px`, display: "flex", flexDirection: "column" as const, justifyContent: "center", gap: S[4] }}>
              {[
                {
                  frase: `${cierreStatus.bloqueosCriticos} críticos activos`,
                  meta:  "Bloqueos del cierre",
                  color: cierreStatus.bloqueosCriticos > 0 ? C.red : C.green,
                },
                {
                  frase: `${cierreStatus.concilPendientes} conciliación pendiente`,
                  meta:  "Bancolombia · Abr 2026",
                  color: cierreStatus.concilPendientes > 0 ? C.amber : C.green,
                },
                {
                  frase: `${cierreStatus.validPendientes} validaciones pendientes`,
                  meta:  "Requieren decisión humana",
                  color: C.inkMid,
                },
              ].map(m => (
                <div key={m.frase} style={{ borderLeft: `3px solid ${m.color}`, paddingLeft: S[3] }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: m.color, lineHeight: 1.2 }}>{m.frase}</div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>{m.meta}</div>
                </div>
              ))}
            </div>
            {/* Col 3 — mini card operacional de riesgo */}
            <div style={{
              padding: `${S[4]}px ${S[4]}px`,
              borderLeft: `1px solid ${C.lineSubtle}`,
              display: "flex", alignItems: "stretch",
            }}>
              <div style={{
                flex: 1,
                background: `${riesgoColor}09`,
                border: `1px solid ${riesgoColor}28`,
                borderLeft: `3px solid ${riesgoColor}`,
                borderRadius: R.md,
                padding: `${S[3]}px ${S[4]}px`,
                display: "flex", flexDirection: "column" as const, gap: S[3],
              }}>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: S[1] }}>Riesgo actual</div>
                  <span
                    className={`ag-op-status ${cierreStatus.riesgo === "critico" || cierreStatus.riesgo === "alto" ? "ag-op-status--critical" : cierreStatus.riesgo === "moderado" ? "ag-op-status--warning" : "ag-op-status--ok"}`}
                    style={{ fontSize: T.sz.xs, fontWeight: 700, textTransform: "none" as const }}
                  >
                    {cierreStatus.riesgo.charAt(0).toUpperCase() + cierreStatus.riesgo.slice(1)}
                  </span>
                </div>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: S[1] }}>Próxima acción</div>
                  <Link href={`/${orgSlug}/finanzas/${cierreStatus.siguienteHref}`} style={{ textDecoration: "none" }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.blueDark }}>→ {cierreStatus.siguienteDesbloqueo}</span>
                  </Link>
                </div>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: S[1] }}>Plazo estimado</div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.inkMid }}>{cierreStatus.diasRestantes} días hábiles</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. AVANCE DEL CIERRE — línea de tiempo progresiva ───────────── */}
      <section style={{ marginBottom: S[8] }}>
        {(() => {
          const completedCount = PIPELINE_STAGES.filter(s => s.status === "ok").length;
          const activeCount    = PIPELINE_STAGES.filter(s => s.status === "warning" || s.status === "critical").length;
          return (
            <FinanceSectionHeader
              label="Avance del cierre"
              meta={`${completedCount} de ${PIPELINE_STAGES.length} etapas completadas · ${activeCount} con bloqueo activo`}
              accent={C.green}
            />
          );
        })()}
        <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.lg, padding: `${S[6]}px ${S[6]}px ${S[5]}px` }}>
          {(() => {
            const n = PIPELINE_STAGES.length;
            return (
              <>
                {/* ── Track + circles ── */}
                <div style={{ position: "relative" as const, height: 36, marginBottom: S[3] }}>
                  {/* Gray background rail — full width between first and last circle */}
                  <div style={{
                    position: "absolute" as const,
                    top: "50%", left: `${(0.5 / n) * 100}%`, right: `${(0.5 / n) * 100}%`,
                    height: 3, transform: "translateY(-50%)",
                    background: "#e5e7eb", borderRadius: R.pill,
                  }} />

                  {/* Colored segments — one per gap, reflects each stage's status */}
                  {PIPELINE_STAGES.slice(0, -1).map((stage, i) => {
                    const segLeft  = `${((i + 0.5) / n) * 100}%`;
                    const segRight = `${((n - i - 1.5) / n) * 100}%`;
                    const segColor = stage.status === "ok"       ? C.green
                      : stage.status === "warning"  ? C.amber
                      : stage.status === "critical" ? "#dc2626"
                      : "#e5e7eb";
                    return (
                      <div key={i} style={{
                        position: "absolute" as const,
                        top: "50%", left: segLeft, right: segRight,
                        height: 3, transform: "translateY(-50%)",
                        background: segColor, borderRadius: R.pill,
                        transition: "background 0.3s ease",
                      }} />
                    );
                  })}

                  {/* Stage circles */}
                  {PIPELINE_STAGES.map((stage, i) => {
                    const cx       = `${((i + 0.5) / n) * 100}%`;
                    const isOk     = stage.status === "ok";
                    const isActive = stage.status === "warning" || stage.status === "critical";
                    const hasBlockerBefore = PIPELINE_STAGES.slice(0, i).some(
                      s => s.status === "warning" || s.status === "critical"
                    );
                    const isDownstream = stage.status === "pending" && hasBlockerBefore;
                    // Semantic colors — T08: verde=listo, amber=activo, rojo=crítico, gris=pendiente
                    const circleBg = isOk                     ? C.green
                      : stage.status === "warning"  ? C.amber
                      : stage.status === "critical" ? "#dc2626"
                      : "#e5e7eb";
                    const circleSize = isActive ? 32 : isOk ? 30 : 26;

                    return (
                      <div
                        key={stage.id}
                        onClick={() => open({ type: "pipeline_stage", index: i })}
                        className={isActive ? "ag-step-breathe" : undefined}
                        style={{
                          position: "absolute" as const,
                          top: "50%", left: cx,
                          transform: "translate(-50%, -50%)",
                          width: circleSize, height: circleSize,
                          borderRadius: "50%",
                          background: circleBg,
                          border: isOk || isActive ? "none" : `2px solid #d1d5db`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", zIndex: 3,
                          opacity: isDownstream ? 0.4 : 1,
                        }}
                      >
                        {isOk && (
                          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                            <path d="M2.5 7L5.5 10L11.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                        {!isOk && (
                          <span style={{
                            fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 700,
                            color: isActive ? C.white : "#9ca3af",
                          }}>{i + 1}</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── Labels below circles ── */}
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${n}, 1fr)` }}>
                  {PIPELINE_STAGES.map((stage, i) => {
                    const isOk     = stage.status === "ok";
                    const isActive = stage.status === "warning" || stage.status === "critical";
                    const hasBlockerBefore = PIPELINE_STAGES.slice(0, i).some(
                      s => s.status === "warning" || s.status === "critical"
                    );
                    const isDownstream = stage.status === "pending" && hasBlockerBefore;
                    const stColor  = PIPELINE_COLOR[stage.status];
                    const stCss    = PIPELINE_CSS[stage.status];
                    return (
                      <div
                        key={stage.id}
                        onClick={() => open({ type: "pipeline_stage", index: i })}
                        style={{
                          display: "flex", flexDirection: "column" as const,
                          alignItems: "center", gap: S[1],
                          paddingTop: S[2], paddingLeft: S[1], paddingRight: S[1],
                          opacity: isDownstream ? 0.4 : 1,
                          cursor: "pointer",
                        }}
                      >
                        <span style={{
                          fontFamily: T.mono, fontSize: T.sz["2xs"],
                          color: isActive ? C.ink : isOk ? C.inkMid : C.inkFaint,
                          fontWeight: isActive || isOk ? 700 : 500,
                          textAlign: "center" as const,
                          letterSpacing: "0.03em",
                        }}>{stage.label}</span>
                        <span
                          className={`ag-op-status ${stCss}`}
                          style={{ fontSize: T.sz["2xs"], textTransform: "none" as const }}
                        >
                          {isOk ? "Listo" : isActive ? "En curso" : isDownstream ? "En espera" : "Pendiente"}
                        </span>
                        {stage.blocker && isActive && (
                          <span style={{
                            fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 600,
                            color: stColor, textAlign: "center" as const,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                            maxWidth: "100%",
                          }}>{stage.blocker}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      </section>

      {/* ── 3. BLOQUEADORES DEL CIERRE — sala de control ────────────────── */}
      <section style={{ marginBottom: S[8] }}>
        <FinanceSectionHeader
          label="Bloqueadores del cierre"
          meta={`${BLOCKERS.filter(b => b.prioridad === "critico").length} críticos · ${BLOCKERS.filter(b => b.prioridad === "alto").length} altos · ${BLOCKERS.filter(b => b.prioridad === "medio").length} medios`}
          accent={C.red}
        />
        <div style={{
          background: C.white,
          border: `1px solid ${C.lineSubtle}`,
          borderTop: `4px solid ${C.red}`,
          borderRadius: R.lg, overflow: "hidden",
        }}>
          {/* Table header */}
          <div style={{
            display: "grid", gridTemplateColumns: "80px 1fr 1fr 140px",
            columnGap: 28, padding: `${S[2] + 2}px ${S[4]}px`,
            background: C.surface, borderBottom: `1px solid ${C.lineSubtle}`,
          }}>
            {(["Prioridad", "Bloqueo", "Impacto operacional", "Acción"] as const).map((h, hi) => (
              <span key={h} style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                textTransform: "uppercase" as const, letterSpacing: "0.06em",
                ...(hi === 3 ? { justifySelf: "center" as const } : {}),
              }}>{h}</span>
            ))}
          </div>
          {BLOCKERS.map((bl, i) => (
            <div
              key={bl.id}
              onClick={() => open({ type: "blocker", index: i })}
              className="ag-op-row"
              style={{
                display: "grid", gridTemplateColumns: "80px 1fr 1fr 140px",
                alignItems: "center", columnGap: 28, padding: `${S[3]}px ${S[4]}px`,
                borderBottom: i < BLOCKERS.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                borderLeft: `3px solid ${BLOCKER_COLOR[bl.prioridad]}`,
                cursor: "pointer",
              }}
            >
              <span className={`ag-op-status ${BLOCKER_CSS[bl.prioridad]}`} style={{ fontSize: T.sz["2xs"], alignSelf: "flex-start" }}>
                {bl.prioridad.toUpperCase()}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{bl.label}</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>{bl.fuente}</div>
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, lineHeight: 1.65, paddingRight: S[3] }}>{bl.impacto}</div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <Link
                  href={`/${orgSlug}/finanzas/${bl.href}`}
                  onClick={e => e.stopPropagation()}
                  style={{ textDecoration: "none" }}
                >
                  <button style={opActionBtn(C.blueDark)}>
                    {bl.cta}
                  </button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 4. VALIDACIONES PENDIENTES ──────────────────────────────────── */}
      <section style={{ marginBottom: S[8] }}>
        <FinanceSectionHeader
          label="Validaciones pendientes"
          meta={`${VALIDATIONS.length} validaciones · decisión humana requerida`}
          accent={C.blueDark}
        />
        <div style={{
          background: C.white,
          border: `1px solid ${C.lineSubtle}`,
          borderTop: `4px solid ${C.blueDark}`,
          borderRadius: R.lg, overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "grid", gridTemplateColumns: "88px 1fr 132px 140px",
            columnGap: 28, padding: `${S[2] + 2}px ${S[4]}px`,
            background: C.surface, borderBottom: `1px solid ${C.lineSubtle}`,
          }}>
            {(["Tipo", "Validación", "Origen", "Acción"] as const).map((h, hi) => (
              <span key={h} style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                textTransform: "uppercase" as const, letterSpacing: "0.06em",
                ...(hi === 3 ? { justifySelf: "center" as const } : {}),
              }}>{h}</span>
            ))}
          </div>
          {VALIDATIONS.map((val, i) => (
            <div
              key={val.id}
              onClick={() => open({ type: "validation", index: i })}
              className="ag-op-row"
              style={{
                display: "grid", gridTemplateColumns: "88px 1fr 132px 140px",
                alignItems: "center", columnGap: 28, padding: `${S[3]}px ${S[4]}px`,
                borderBottom: i < VALIDATIONS.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                borderLeft: `3px solid ${val.sev === "critical" ? C.red : C.amber}`,
                cursor: "pointer",
              }}
            >
              {/* Col 1 — tipo badge */}
              <span className={`ag-op-status ${val.sevCss}`} style={{ fontSize: T.sz["2xs"], alignSelf: "center" }}>
                {val.tipo}
              </span>
              {/* Col 2 — ID + label + monto */}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, flexShrink: 0, opacity: 0.6 }}>{val.id}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{val.label}</span>
                </div>
                {val.monto > 0 && (
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, fontWeight: 600, marginTop: 2 }}>{fmtM(val.monto)}</div>
                )}
              </div>
              {/* Col 3 — origen */}
              <div style={{ minWidth: 0 }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, display: "block" }}>{val.origen}</span>
              </div>
              {/* Col 4 — action */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  onClick={e => { e.stopPropagation(); open({ type: "validation", index: i }); }}
                  style={opActionBtn(C.blueDark)}
                >{val.cta} →</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 5. INFORMES DEL CIERRE ───────────────────────────────────────── */}
      <section style={{ marginBottom: S[8] }}>
        <FinanceSectionHeader
          label="Informes del cierre"
          meta="Estados financieros, reportes fiscales y paquetes ejecutivos del período"
          accent={C.blueDark}
        />
        <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.lg, overflow: "hidden", boxShadow: E.sm }}>
          {/* Header — 5 cols: ID · Informe · Fuentes · Estado · Acción */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "52px minmax(220px,1fr) 96px 112px 120px",
            columnGap: 28,
            padding: `${S[2] + 2}px ${S[4]}px`,
            background: C.surface, borderBottom: `1px solid ${C.lineSubtle}`,
          }}>
            {(["ID", "Informe", "Fuentes", "Estado", "Acción"] as const).map((h, hi) => (
              <span
                key={h}
                style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                  textTransform: "uppercase" as const, letterSpacing: "0.06em",
                  ...(hi === 3 || hi === 4 ? { justifySelf: "center" as const } : {}),
                }}
              >{h}</span>
            ))}
          </div>
          {(informesExpanded ? INFORMES_CIERRE : INFORMES_CIERRE.slice(0, 5)).map((inf, i, arr) => {
            const infColor = INFORME_ESTADO_COLOR[inf.estado];
            const realIdx  = INFORMES_CIERRE.indexOf(inf);
            return (
              <div
                key={inf.id}
                onClick={() => open({ type: "informe", index: realIdx })}
                className="ag-op-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "52px minmax(220px,1fr) 96px 112px 120px",
                  columnGap: 28,
                  alignItems: "center", padding: `${S[3]}px ${S[4]}px`,
                  borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                  borderLeft: `3px solid ${infColor}`,
                  cursor: "pointer",
                }}
              >
                {/* Col 1 — ID */}
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>{inf.id}</span>

                {/* Col 2 — Informe label + blocker */}
                <div style={{ minWidth: 0 }}>
                  <span style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.ink,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, display: "block",
                  }}>{inf.label}</span>
                  {inf.blocker && (
                    <div style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red, marginTop: 2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                    }}>{inf.blocker}</div>
                  )}
                </div>

                {/* Col 3 — Fuentes: chip + "+N" — never invades Estado */}
                <div style={{ display: "flex", alignItems: "center", gap: S[1], minWidth: 0 }}>
                  <span style={{
                    fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                    background: C.surface, border: `1px solid ${C.lineSubtle}`,
                    borderRadius: R.pill, padding: `1px ${S[2]}px`,
                    overflowWrap: "anywhere" as const, minWidth: 0, maxWidth: "100%",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                  }}>{inf.fuentes[0]}</span>
                  {inf.fuentes.length > 1 && (
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, flexShrink: 0 }}>
                      +{inf.fuentes.length - 1}
                    </span>
                  )}
                </div>

                {/* Col 4 — Estado: 112px column, badge 96px centered */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span
                    className={`ag-op-status ${INFORME_ESTADO_CSS[inf.estado]}`}
                    style={{
                      fontSize: T.sz["2xs"], whiteSpace: "nowrap" as const,
                      textTransform: "none" as const,
                      width: 96, justifyContent: "center",
                    }}
                  >
                    {INFORME_ESTADO_LABEL[inf.estado]}
                  </span>
                </div>

                {/* Col 5 — Acción: 120px column, button centered, no right padding */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    onClick={e => { e.stopPropagation(); open({ type: "informe", index: realIdx }); }}
                    style={opActionBtn(C.blueDark)}
                  >{inf.accion} →</button>
                </div>
              </div>
            );
          })}
          {/* Ver todos footer */}
          {!informesExpanded && INFORMES_CIERRE.length > 5 && (
            <div style={{ borderTop: `1px solid ${C.lineSubtle}`, padding: `${S[3]}px ${S[4]}px`, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setInformesExpanded(true)}
                style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.blueDark, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
              >
                Ver todos los informes ({INFORMES_CIERRE.length}) →
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── 6. ACCIONES RECOMENDADAS POR AGENTIK ────────────────────────── */}
      <section style={{ marginBottom: S[8] }}>
        <FinanceSectionHeader label="Acciones recomendadas por Agentik" meta="inteligencia operacional · impacto medible · priorizado por riesgo" accent={C.blueDark} />
        <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
          {IA_OBSERVATIONS.map((obs, i) => {
            const obColor = IA_OBS_COLOR[obs.tipo];
            const obLabel = IA_OBS_LABEL[obs.tipo];
            return (
              <div
                key={obs.id}
                onClick={() => open({ type: "ia_obs", index: i })}
                className="ag-op-row"
                style={{
                  background: C.white, border: `1px solid ${C.lineSubtle}`,
                  borderLeft: `3px solid ${obColor}`,
                  borderRadius: R.md, padding: `${S[3]}px ${S[4]}px`,
                  cursor: "pointer",
                }}
              >
                {/* Top row: tipo badge + CTA */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[2] }}>
                  <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 20, height: 14, borderRadius: R.sm,
                      background: C.blueDark, color: C.white,
                      fontFamily: T.mono, fontSize: 7, fontWeight: 700, letterSpacing: "0.04em", flexShrink: 0,
                    }}>IA</span>
                    <span style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 700,
                      color: C.inkMid, textTransform: "uppercase" as const, letterSpacing: "0.06em",
                    }}>{obLabel}</span>
                  </div>
                  {obs.cta && (
                    <Link href={`/${orgSlug}/finanzas/${obs.ctaHref}`} onClick={e => e.stopPropagation()} style={{ textDecoration: "none" }}>
                      <button style={opActionBtn(C.blueDark)}>{obs.cta} →</button>
                    </Link>
                  )}
                </div>
                {/* Action title */}
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink, marginBottom: 2 }}>
                  {obs.accion}
                </div>
                {/* Impacto */}
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                  {obs.impacto}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 6. RESULTADOS DEL CIERRE (collapsed) ───────────────────────── */}
      <CollapsibleSection
        title="Resultados del cierre"
        meta="Informes oficiales · paquetes fiscales · auditoría · exportación PDF / XML / XLSX"
        accent={C.inkMid}
        defaultOpen={false}
      >
        <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.lg, overflow: "hidden" }}>
          {/* Header */}
          <div style={{
            display: "grid", gridTemplateColumns: "64px 1fr 140px 120px 100px",
            gap: S[2], padding: `${S[2] + 2}px ${S[4]}px`,
            background: C.surface, borderBottom: `1px solid ${C.lineSubtle}`,
          }}>
            {["ID", "Paquete", "Tipo", "Estado", "Formatos"].map(h => (
              <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{h}</span>
            ))}
          </div>
          {RESULTS.map((res, i) => (
            <div
              key={res.id}
              onClick={() => open({ type: "result", index: i })}
              className="ag-op-row"
              style={{
                display: "grid", gridTemplateColumns: "64px 1fr 140px 120px 100px",
                alignItems: "center", gap: S[2], padding: `${S[3]}px ${S[4]}px`,
                borderBottom: i < RESULTS.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                cursor: "pointer",
              }}
            >
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{res.id}</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{res.label}</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{res.tipo}</span>
              <span className={`ag-op-status ${res.estCss}`} style={{ fontSize: T.sz["2xs"] }}>{res.estado}</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{res.formats.join(" · ")}</span>
            </div>
          ))}
        </div>
        {/* Note: generate when closing is complete */}
        <div style={{ marginTop: S[3], padding: `${S[3]}px ${S[4]}px`, background: C.surface, borderLeft: `3px solid ${C.inkGhost}`, borderRadius: R.md }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            Los paquetes se generan automáticamente al completar el cierre. Resolución de bloqueos requerida.
          </span>
        </div>
      </CollapsibleSection>

      {/* ── DRAWER ────────────────────────────────────────────────────────── */}
      <OperationalSideDrawer
        open={ctx !== null}
        onClose={close}
        title={drawerProps.title}
        subtitle={drawerProps.subtitle}
        statusLabel={drawerProps.statusLabel}
        severity={drawerProps.severity}
      >
        {drawerProps.content}
      </OperationalSideDrawer>

    </div>
  );
}

/**
 * Architecture: AGENTIK-FINANCE-CLOSING-V1-01
 *
 * Sprint: AGENTIK-FINANCE-CLOSING-POLISH-02
 * Sections:
 *  Header:          OperationalWorkspaceHeader + upstream integration signal
 *  Section 1:       Estado del Cierre — progress + bloqueos + riesgo + plazo
 *  Section 2:       Pipeline del Cierre — 6 etapas operacionales
 *  Section 3:       Bloqueadores del Cierre — sala de control
 *  Section 4:       Validaciones Pendientes — decisiones humanas
 *  Section 5:       Informes del Cierre — 10 informes oficiales con estado y fuentes
 *  Section 6:       Observaciones Agentik IA — inteligencia financiera (reducida)
 *  Section 7:       Resultados/Exportables (CollapsibleSection, collapsed)
 *  Drawer:          blocker / validation / pipeline_stage / result / ia_obs / informe
 *
 * Drawers: blocker · validation · pipeline_stage · result · ia_obs · informe
 * Data:    All PLACEHOLDER — replace with /api/orgs/[orgSlug]/cierre/* before ship
 * Backend: POST /api/orgs/[orgSlug]/cierre/run — HIGH priority
 *          GET  /api/orgs/[orgSlug]/cierre/status — HIGH priority
 *          GET  /api/orgs/[orgSlug]/cierre/blockers — HIGH priority
 *          GET  /api/orgs/[orgSlug]/cierre/informes — HIGH priority
 */
