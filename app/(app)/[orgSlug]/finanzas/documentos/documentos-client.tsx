"use client";

/**
 * DocumentosClient
 *
 * Centro Documental Financiero V1.
 * Ingesta, lectura IA, clasificación y trazabilidad de documentos financieros.
 * Agentik convierte documentos en entidades operacionales reutilizables por
 * Conciliación, Tesorería, Cierre y Planeación.
 *
 * Sprint: AGENTIK-FINANCE-DOCS-POLISH-03
 * All data: PLACEHOLDER — replace with API/Prisma queries before ship.
 */

import Link                           from "next/link";
import { useState }                   from "react";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { CollapsibleSection }         from "@/components/workspace/collapsible-section";
import { OperationalSideDrawer }      from "@/components/workspace/operational-side-drawer";
import type { DrawerSeverity }        from "@/components/workspace/operational-side-drawer";
import { C, T, S, R, E }            from "@/lib/ui/tokens";
import { opActionBtn, opActionCol } from "@/lib/ui/op-table";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type Severity = "critical" | "warning" | "normal" | "info";

type DocAIStatus =
  | "pendiente"
  | "leyendo"
  | "estructura_detectada"
  | "requiere_revision"
  | "aprobado"
  | "listo_conciliacion"
  | "enviado_cierre"
  | "error_documental";

type DocPriority = "urgente" | "alta" | "normal" | "baja";

type DrawerCtx =
  | { type: "document";       index: number }
  | { type: "review_item";    index: number }
  | { type: "entity";         index: number }
  | { type: "pipeline_stage"; stage: "ingesta" | "lectura" | "validacion" | "impacto" | "conciliado" }
  | { type: "upload" };

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA — PLACEHOLDER: replace with real API queries before ship
// ─────────────────────────────────────────────────────────────────────────────

const DOCUMENTS: Array<{
  id:              string;
  nombre:          string;
  tipo:            string;
  fuente:          string;
  fecha:           string;
  aiStatus:        DocAIStatus;
  entidades:       number;
  destino:         string;
  cta:             string;
  monto:           number;
  prioridad:       DocPriority;
  accionRequerida: string;
  impactoModulos:  string[];
  campos:    Array<{ campo: string; valor: string; confianza: number }>;
  timeline:  Array<{ time: string; label: string; severity?: Severity }>;
}> = [
  {
    id: "D001", nombre: "Extracto Bancolombia Abr 2026",
    tipo: "Extracto bancario", fuente: "Bancolombia", fecha: "Hoy 08:30",
    aiStatus: "listo_conciliacion", entidades: 58, destino: "Conciliación Inteligente",
    cta: "Conciliar", monto: 0,
    prioridad: "alta", accionRequerida: "Conciliar 58 movimientos",
    impactoModulos: ["Conciliación", "Tesorería"],
    campos: [
      { campo: "entidad_banco",   valor: "Bancolombia",   confianza: 99 },
      { campo: "periodo",         valor: "Abr 2026",      confianza: 97 },
      { campo: "num_movimientos", valor: "58",            confianza: 99 },
      { campo: "saldo_inicial",   valor: "$42.800.000",   confianza: 95 },
      { campo: "saldo_final",     valor: "$38.150.000",   confianza: 95 },
    ],
    timeline: [
      { time: "Hoy 08:30", label: "Documento recibido — carga automática" },
      { time: "Hoy 08:31", label: "Lectura IA iniciada" },
      { time: "Hoy 08:31", label: "58 movimientos detectados" },
      { time: "Hoy 08:32", label: "Estructura aprobada · listo para conciliación", severity: "normal" },
    ],
  },
  {
    id: "D002", nombre: "Factura F-2026-0891 · Proveedor Alfa",
    tipo: "Factura de compra", fuente: "SAG", fecha: "Hoy 09:15",
    aiStatus: "aprobado", entidades: 7, destino: "Cierre Financiero",
    cta: "Enviar", monto: 3_890_000,
    prioridad: "normal", accionRequerida: "Enviar a Cierre Financiero",
    impactoModulos: ["Cierre", "Tesorería"],
    campos: [
      { campo: "nit_proveedor", valor: "901234567-1", confianza: 98 },
      { campo: "valor_total",   valor: "$3.890.000",  confianza: 99 },
      { campo: "fecha_emision", valor: "2026-04-28",  confianza: 99 },
      { campo: "iva",           valor: "$621.400",    confianza: 97 },
      { campo: "retencion",     valor: "$116.700",    confianza: 94 },
    ],
    timeline: [
      { time: "Hoy 09:15", label: "Factura cargada desde SAG" },
      { time: "Hoy 09:16", label: "Lectura IA: factura DIAN validada" },
      { time: "Hoy 09:16", label: "7 campos detectados con alta confianza", severity: "normal" },
    ],
  },
  {
    id: "D003", nombre: "XML DIAN · Período Abr 2026",
    tipo: "Documento DIAN", fuente: "DIAN", fecha: "Ayer 16:00",
    aiStatus: "requiere_revision", entidades: 14, destino: "Pendiente revisión",
    cta: "Revisar", monto: 12_450_000,
    prioridad: "urgente", accionRequerida: "Revisar 2 campos con baja confianza",
    impactoModulos: ["Cierre", "DIAN"],
    campos: [
      { campo: "valor_base_iva", valor: "$12.450.000", confianza: 62 },
      { campo: "nit_emisor",     valor: "901234567-1", confianza: 71 },
      { campo: "periodo_fiscal", valor: "2026-04",     confianza: 88 },
    ],
    timeline: [
      { time: "Ayer 16:00", label: "XML DIAN recibido" },
      { time: "Ayer 16:01", label: "Lectura IA: 2 campos con baja confianza", severity: "warning" },
      { time: "Ayer 16:01", label: "Enviado a bandeja de revisión humana" },
    ],
  },
  {
    id: "D004", nombre: "Soporte pago Ref. 203847",
    tipo: "Soporte de pago", fuente: "Manual", fecha: "Ayer 11:30",
    aiStatus: "estructura_detectada", entidades: 4, destino: "Conciliación Inteligente",
    cta: "Aprobar", monto: 1_800_000,
    prioridad: "alta", accionRequerida: "Aprobar campos detectados",
    impactoModulos: ["Conciliación"],
    campos: [
      { campo: "referencia_pago", valor: "Ref. 203847-A", confianza: 78 },
      { campo: "valor",           valor: "$1.800.000",    confianza: 96 },
      { campo: "fecha_pago",      valor: "2026-04-29",    confianza: 99 },
      { campo: "banco_destino",   valor: "PayCo",         confianza: 91 },
    ],
    timeline: [
      { time: "Ayer 11:30", label: "Soporte cargado manualmente" },
      { time: "Ayer 11:31", label: "Lectura IA: estructura detectada" },
      { time: "Ayer 11:31", label: "Pendiente aprobación de campos", severity: "info" },
    ],
  },
  {
    id: "D005", nombre: "Extracto Davivienda Mar 2026",
    tipo: "Extracto bancario", fuente: "Davivienda", fecha: "Hace 2 días",
    aiStatus: "aprobado", entidades: 43, destino: "Conciliación Inteligente",
    cta: "Conciliar", monto: 0,
    prioridad: "normal", accionRequerida: "Conciliar 43 movimientos",
    impactoModulos: ["Conciliación"],
    campos: [
      { campo: "entidad_banco",   valor: "Davivienda",  confianza: 99 },
      { campo: "num_movimientos", valor: "43",          confianza: 99 },
      { campo: "saldo_final",     valor: "$15.320.000", confianza: 95 },
    ],
    timeline: [
      { time: "Hace 2 días", label: "Extracto cargado" },
      { time: "Hace 2 días", label: "43 movimientos detectados y aprobados", severity: "normal" },
    ],
  },
  {
    id: "D006", nombre: "Orden de compra OC-2026-0112",
    tipo: "Orden", fuente: "SAG", fecha: "Hace 2 días",
    aiStatus: "pendiente", entidades: 0, destino: "—",
    cta: "Clasificar", monto: 0,
    prioridad: "baja", accionRequerida: "Clasificar documento",
    impactoModulos: [],
    campos: [],
    timeline: [
      { time: "Hace 2 días", label: "Orden cargada desde SAG · lectura pendiente", severity: "info" },
    ],
  },
  {
    id: "D007", nombre: "Nómina Abr 2026 — Castillitos S.A.",
    tipo: "Nómina", fuente: "RRHH", fecha: "Hace 3 días",
    aiStatus: "aprobado", entidades: 11, destino: "Cierre Financiero",
    cta: "Enviar", monto: 18_500_000,
    prioridad: "alta", accionRequerida: "Enviar a Cierre Financiero",
    impactoModulos: ["Cierre", "CashFlow"],
    campos: [
      { campo: "periodo_nomina",    valor: "Abr 2026",     confianza: 99 },
      { campo: "total_devengado",   valor: "$18.500.000",  confianza: 99 },
      { campo: "total_deducciones", valor: "$3.200.000",   confianza: 99 },
      { campo: "num_empleados",     valor: "11",           confianza: 97 },
    ],
    timeline: [
      { time: "Hace 3 días", label: "Nómina cargada desde RRHH" },
      { time: "Hace 3 días", label: "Estructura aprobada automáticamente", severity: "normal" },
    ],
  },
  {
    id: "D008", nombre: "Declaración IVA Q1 2026",
    tipo: "Impuesto", fuente: "DIAN", fecha: "Hace 5 días",
    aiStatus: "error_documental", entidades: 0, destino: "—",
    cta: "Revisar", monto: 0,
    prioridad: "urgente", accionRequerida: "Corregir período fiscal",
    impactoModulos: ["Cierre", "DIAN"],
    campos: [],
    timeline: [
      { time: "Hace 5 días", label: "Declaración recibida de DIAN" },
      { time: "Hace 5 días", label: "Error: período no coincide con fecha de documento", severity: "critical" },
      { time: "Hace 5 días", label: "Rechazada · requiere corrección antes de reintentar" },
    ],
  },
  {
    id: "D009", nombre: "Comprobante egreso CE-0284",
    tipo: "Comprobante", fuente: "SAG", fecha: "Hace 5 días",
    aiStatus: "listo_conciliacion", entidades: 5, destino: "Conciliación Inteligente",
    cta: "Conciliar", monto: 920_000,
    prioridad: "normal", accionRequerida: "Conciliar comprobante",
    impactoModulos: ["Conciliación"],
    campos: [
      { campo: "referencia",  valor: "CE-0284",      confianza: 99 },
      { campo: "valor",       valor: "$920.000",     confianza: 99 },
      { campo: "cuenta",      valor: "1105-01",      confianza: 94 },
      { campo: "nit_tercero", valor: "860507277-1",  confianza: 97 },
      { campo: "fecha",       valor: "2026-04-27",   confianza: 99 },
    ],
    timeline: [
      { time: "Hace 5 días", label: "Comprobante cargado desde SAG" },
      { time: "Hace 5 días", label: "5 campos detectados · alta confianza" },
      { time: "Hace 5 días", label: "Aprobado · listo para conciliación", severity: "normal" },
    ],
  },
  {
    id: "D010", nombre: "Contrato Marco Proveedor 2026",
    tipo: "Contrato", fuente: "Manual", fecha: "Hace 7 días",
    aiStatus: "estructura_detectada", entidades: 9, destino: "Centro Documental",
    cta: "Aprobar", monto: 0,
    prioridad: "baja", accionRequerida: "Aprobar estructura detectada",
    impactoModulos: [],
    campos: [
      { campo: "nit_proveedor",  valor: "800123456-7", confianza: 88 },
      { campo: "vigencia",       valor: "2026",        confianza: 92 },
      { campo: "valor_contrato", valor: "$0 · Marco",  confianza: 65 },
    ],
    timeline: [
      { time: "Hace 7 días", label: "Contrato cargado manualmente" },
      { time: "Hace 7 días", label: "Estructura parcialmente detectada", severity: "info" },
    ],
  },
];

const REVIEW_ITEMS: Array<{
  id:              string;
  docRef:          string;
  campo:           string;
  valorDetectado:  string;
  confianza:       number;
  sugerenciaIA:    string;
  accion:          string;
}> = [
  {
    id: "R001", docRef: "D003 · XML DIAN",
    campo: "valor_base_iva", valorDetectado: "$12.450.000", confianza: 62,
    sugerenciaIA: "Podría ser valor_total_factura — revisar período declarado",
    accion: "Aprobar lectura",
  },
  {
    id: "R002", docRef: "D003 · XML DIAN",
    campo: "nit_emisor", valorDetectado: "901234567-1", confianza: 71,
    sugerenciaIA: "NIT coincide con Alfa S.A.S. en SAG — validar que es el emisor correcto",
    accion: "Confirmar entidad",
  },
  {
    id: "R003", docRef: "D008 · Declaración IVA",
    campo: "periodo_fiscal", valorDetectado: "2025-Q4", confianza: 38,
    sugerenciaIA: "Documento podría corresponder a Q1 2026 — período no coincide con fecha",
    accion: "Corregir período",
  },
  {
    id: "R004", docRef: "D004 · Soporte pago",
    campo: "referencia_pago", valorDetectado: "Ref. 203847-A", confianza: 78,
    sugerenciaIA: "Sufijo -A no encontrado en extracto bancario — verificar referencia original",
    accion: "Validar referencia",
  },
];

const CLASSIFICATIONS: Array<{
  tipo:    string;
  count:   number;
  estado:  "aprobado" | "revision" | "pendiente" | "error";
  utilidad: string;
}> = [
  { tipo: "Factura",           count: 18, estado: "aprobado",  utilidad: "Conciliación · Cierre"  },
  { tipo: "Extracto bancario", count: 6,  estado: "aprobado",  utilidad: "Conciliación"            },
  { tipo: "Soporte de pago",   count: 9,  estado: "revision",  utilidad: "Conciliación"            },
  { tipo: "Documento DIAN",    count: 4,  estado: "revision",  utilidad: "DIAN · Cierre"           },
  { tipo: "Orden",             count: 7,  estado: "pendiente", utilidad: "Compras · ERP"           },
  { tipo: "Comprobante",       count: 12, estado: "aprobado",  utilidad: "Conciliación"            },
  { tipo: "Nómina",            count: 3,  estado: "aprobado",  utilidad: "Cierre · RRHH"           },
  { tipo: "Impuesto",          count: 2,  estado: "error",     utilidad: "DIAN"                    },
  { tipo: "Contrato",          count: 5,  estado: "revision",  utilidad: "Legal · Compras"         },
  { tipo: "Otro",              count: 3,  estado: "pendiente", utilidad: "Por clasificar"          },
];

const ENTITIES: Array<{
  label: string;
  count: number;
  ready: boolean;
  tipo:  string;
}> = [
  { label: "Clientes",           count: 87,  ready: true,  tipo: "Identidad"    },
  { label: "Fechas",             count: 198, ready: true,  tipo: "Temporal"     },
  { label: "Valores monetarios", count: 142, ready: true,  tipo: "Financiero"   },
  { label: "Referencias",        count: 64,  ready: true,  tipo: "Trazabilidad" },
  { label: "Facturas",           count: 18,  ready: true,  tipo: "Documento"    },
  { label: "NITs",               count: 23,  ready: true,  tipo: "Identidad"    },
  { label: "Impuestos",          count: 31,  ready: true,  tipo: "Financiero"   },
  { label: "Proveedores",        count: 14,  ready: true,  tipo: "Identidad"    },
  { label: "Cuentas bancarias",  count: 9,   ready: true,  tipo: "Financiero"   },
  { label: "Órdenes",            count: 7,   ready: false, tipo: "Operacional"  },
  { label: "Centros de costo",   count: 7,   ready: false, tipo: "Contable"     },
];

const AI_FLOW: Array<{
  step:   string;
  label:  string;
  count:  number;
  status: "ok" | "warning" | "pending";
}> = [
  { step: "01", label: "Cargados",      count: 69, status: "ok"      },
  { step: "02", label: "Lectura IA",    count: 63, status: "ok"      },
  { step: "03", label: "Estructurados", count: 58, status: "ok"      },
  { step: "04", label: "Aprobados",     count: 41, status: "warning" },
  { step: "05", label: "Listos",        count: 27, status: "ok"      },
];

// ─────────────────────────────────────────────────────────────────────────────
// COLOR / LABEL MAPS
// ─────────────────────────────────────────────────────────────────────────────

const AI_STATUS_LABEL: Record<DocAIStatus, string> = {
  pendiente:            "Pendiente",
  leyendo:              "Leyendo...",
  estructura_detectada: "Estructurado",
  requiere_revision:    "Revisar",
  aprobado:             "Aprobado",
  listo_conciliacion:   "Listo",
  enviado_cierre:       "En cierre",
  error_documental:     "Error",
};

const AI_STATUS_CSS: Record<DocAIStatus, string> = {
  pendiente:            "ag-op-status--stale",
  leyendo:              "ag-op-status--info",
  estructura_detectada: "ag-op-status--info",
  requiere_revision:    "ag-op-status--warning",
  aprobado:             "ag-op-status--ok",
  listo_conciliacion:   "ag-op-status--ok",
  enviado_cierre:       "ag-op-status--ok",
  error_documental:     "ag-op-status--critical",
};

const AI_STATUS_COLOR: Record<DocAIStatus, string> = {
  pendiente:            C.inkGhost,
  leyendo:              C.blue,
  estructura_detectada: C.blue,
  requiere_revision:    C.amber,
  aprobado:             C.green,
  listo_conciliacion:   C.green,
  enviado_cierre:       C.green,
  error_documental:     C.red,
};

const CLASIF_CSS: Record<"aprobado" | "revision" | "pendiente" | "error", string> = {
  aprobado:  "ag-op-status--ok",
  revision:  "ag-op-status--warning",
  pendiente: "ag-op-status--stale",
  error:     "ag-op-status--critical",
};

const CLASIF_LABEL: Record<"aprobado" | "revision" | "pendiente" | "error", string> = {
  aprobado:  "Aprobado",
  revision:  "Revisión",
  pendiente: "Pendiente",
  error:     "Error",
};

const SEV_DOT: Record<Severity, string> = {
  critical: C.red, warning: C.amber, normal: C.inkGhost, info: C.blue,
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmtM(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function confColor(c: number): string {
  return c >= 85 ? C.green : c >= 65 ? C.amber : C.red;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE-LEVEL SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ label, meta, accent }: { label: string; meta?: string; accent?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: S[2], marginBottom: S[5],
      padding: `${S[2] + 2}px ${S[3]}px`,
      background: C.surface, border: `1px solid ${C.lineSubtle}`,
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
// PRIORITY MAPS
// ─────────────────────────────────────────────────────────────────────────────

const PRIO_DOT: Record<DocPriority, string> = {
  urgente: C.red, alta: C.amber, normal: C.blue, baja: C.inkGhost,
};
const PRIO_LABEL: Record<DocPriority, string> = {
  urgente: "URGENTE", alta: "ALTA", normal: "NORMAL", baja: "BAJA",
};
const PRIO_CSS: Record<DocPriority, string> = {
  urgente: "ag-op-status--critical", alta: "ag-op-status--warning",
  normal: "ag-op-status--info", baja: "ag-op-status--stale",
};
const PRIO_ORDER: Record<DocPriority, number> = { urgente: 0, alta: 1, normal: 2, baja: 3 };

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function DocumentosClient({ orgSlug }: { orgSlug: string }) {
  const [ctx, setCtx] = useState<DrawerCtx | null>(null);
  const open  = (c: DrawerCtx) => setCtx(c);
  const close = () => setCtx(null);

  // Computed
  const totalDocs        = DOCUMENTS.length;
  const pendingAnalysis  = DOCUMENTS.filter(d => d.aiStatus === "pendiente" || d.aiStatus === "leyendo").length;
  const requiresReview   = DOCUMENTS.filter(d => d.aiStatus === "requiere_revision" || d.aiStatus === "error_documental").length;
  const readyForRecon    = DOCUMENTS.filter(d => d.aiStatus === "listo_conciliacion").length;
  const conciliadoCount  = DOCUMENTS.filter(d => d.aiStatus === "enviado_cierre").length;

  // Cola operativa sorted by priority
  const colaOperativa = [...DOCUMENTS].sort((a, b) => PRIO_ORDER[a.prioridad] - PRIO_ORDER[b.prioridad]);

  // Impacto operacional aggregation
  const impactoMap: Record<string, { docs: number; entidades: number }> = {};
  DOCUMENTS.forEach(doc => {
    doc.impactoModulos.forEach(mod => {
      if (!impactoMap[mod]) impactoMap[mod] = { docs: 0, entidades: 0 };
      impactoMap[mod].docs++;
      impactoMap[mod].entidades += doc.entidades;
    });
  });

  // ── Drawer ────────────────────────────────────────────────────────────────

  function getDrawerProps(c: DrawerCtx): {
    title: string; subtitle?: string; statusLabel?: string; severity?: DrawerSeverity; content: React.ReactNode;
  } | null {
    switch (c.type) {

      case "pipeline_stage": {
        const STAGE_MAP: Record<string, { title: string; count: number; detail: string; what: string; color: string }> = {
          ingesta:     { title: "Ingesta",       count: 69, detail: "Documentos recibidos en el pipeline", what: "XML · PDF · XLSX · CSV · Manual · SAG · DIAN · RRHH", color: C.blue  },
          lectura:     { title: "Lectura IA",    count: 63, detail: "Motor IA procesando estructura",      what: "Extracción de campos · detección de entidades · clasificación de tipo documental", color: C.blue  },
          validacion:  { title: "Validación",    count: 4,  detail: "Campos con baja confianza (<85%)",    what: "Decisión humana requerida · aprobación de campos · corrección de errores", color: C.amber },
          impacto:     { title: "Impacto",       count: 41, detail: "Documentos aprobados con entidades",  what: "Disponibles para Conciliación · Cierre · Tesorería · CashFlow", color: C.green },
          conciliado:  { title: "Conciliado",    count: 27, detail: "Documentos enviados a módulos",       what: "Conciliación Inteligente · Cierre Financiero · CashFlow actualizado", color: C.green },
        };
        const stage = STAGE_MAP[c.stage];
        if (!stage) return null;
        return {
          title: stage.title,
          subtitle: stage.detail,
          statusLabel: `${stage.count} DOCS`,
          severity: c.stage === "validacion" ? "warning" : "info",
          content: (
            <>
              <DrawerMetricGrid items={[
                { label: "Documentos",  value: `${stage.count}`, accent: stage.color },
                { label: "Etapa",       value: stage.title },
              ]} />
              <DSection title="Qué ocurre aquí">
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.7, padding: `${S[2]}px 0` }}>{stage.what}</div>
              </DSection>
              {c.stage === "validacion" && (
                <DSection title="Campos pendientes de decisión">
                  {REVIEW_ITEMS.map((r, i) => (
                    <DRow key={i} label={`${r.campo} · ${r.docRef}`} value={`${r.confianza}%`} accent={confColor(r.confianza)} />
                  ))}
                </DSection>
              )}
              {c.stage === "impacto" && (
                <DSection title="Módulos que se actualizan">
                  {Object.entries(impactoMap).map(([mod, v]) => (
                    <DRow key={mod} label={mod} value={`${v.docs} docs · ${v.entidades} campos`} accent={C.green} />
                  ))}
                </DSection>
              )}
              <DrawerTraceability source="Motor IA · Pipeline documental" updated="Tiempo real" />
            </>
          ),
        };
      }

      case "upload": {
        return {
          title:       "Ingesta documental operacional",
          subtitle:    "Carga masiva · lectura IA · clasificación automática · trazabilidad",
          statusLabel: "INGESTA",
          severity:    "info",
          content: (
            <>
              <DSection title="Formatos soportados">
                {([
                  { label: "XML DIAN",         value: "Facturas electrónicas y declaraciones"    },
                  { label: "PDF",              value: "Extractos bancarios, contratos, soportes" },
                  { label: "XLSX / CSV",       value: "Movimientos, nóminas, presupuestos"       },
                  { label: "Imagen escaneada", value: "Facturas físicas — OCR automático"        },
                ]).map((r, i) => <DRow key={i} label={r.label} value={r.value} />)}
              </DSection>
              <DSection title="Destinos operacionales">
                {([
                  { label: "Conciliación Inteligente", value: "Extractos · soportes · comprobantes" },
                  { label: "Cierre Financiero",        value: "Facturas · nóminas · impuestos"      },
                  { label: "Tesorería Operativa",      value: "Flujos · obligaciones · pagos"       },
                  { label: "Planeación Financiera",    value: "Contratos · presupuestos"            },
                ]).map((r, i) => <DRow key={i} label={r.label} value={r.value} accent={C.blueDark} />)}
              </DSection>
              <DActions>
                <PassiveAction label="Nueva ingesta →" />
                <PassiveAction label="Procesar lote ZIP →" />
                <PassiveAction label="Importar carpeta ERP →" />
                <PassiveAction label="Analizar XML DIAN →" />
              </DActions>
            </>
          ),
        };
      }

      case "document": {
        const doc = DOCUMENTS[c.index];
        if (!doc) return null;
        const statusColor = AI_STATUS_COLOR[doc.aiStatus];
        const drawerSev: DrawerSeverity =
          doc.aiStatus === "error_documental"  ? "critical" :
          doc.aiStatus === "requiere_revision" ? "warning"  :
          doc.aiStatus === "listo_conciliacion" || doc.aiStatus === "aprobado" ? "info" : "watch";
        const avgConf = doc.campos.length > 0
          ? Math.round(doc.campos.reduce((s, f) => s + f.confianza, 0) / doc.campos.length)
          : null;
        return {
          title:       doc.nombre,
          subtitle:    `${doc.tipo} · ${doc.fuente} · ${doc.fecha}`,
          statusLabel: AI_STATUS_LABEL[doc.aiStatus].toUpperCase(),
          severity:    drawerSev,
          content: (
            <>
              <DrawerMetricGrid items={[
                { label: "Estado IA",    value: AI_STATUS_LABEL[doc.aiStatus], accent: statusColor },
                { label: "Confianza",    value: avgConf !== null ? `${avgConf}%` : "—",            accent: avgConf ? confColor(avgConf) : C.inkGhost },
                { label: "Entidades",    value: doc.entidades > 0 ? `${doc.entidades} detectadas` : "Sin detectar", accent: doc.entidades > 0 ? C.green : C.inkGhost },
                { label: "Prioridad",    value: PRIO_LABEL[doc.prioridad],                         accent: PRIO_DOT[doc.prioridad] },
              ]} />

              {/* Acción requerida */}
              <div style={{ background: C.surface, border: `1px solid ${C.lineSubtle}`, borderLeft: `3px solid ${statusColor}`, borderRadius: R.md, padding: `${S[3]}px ${S[4]}px`, marginBottom: S[4] }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: S[1] }}>Acción requerida</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>{doc.accionRequerida}</div>
              </div>

              {/* Campos detectados con confianza inline */}
              {doc.campos.length > 0 && (
                <DSection title="Extracción IA — campos detectados">
                  {doc.campos.map((f, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${S[2]}px 0`, borderBottom: `1px solid ${C.lineSubtle}` }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{f.campo}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.ink }}>{f.valor}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
                          <div style={{ width: 32, height: 3, borderRadius: R.pill, background: C.lineSubtle, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${f.confianza}%`, background: confColor(f.confianza) }} />
                          </div>
                          <span style={{ fontFamily: T.mono, fontSize: 9, color: confColor(f.confianza), fontWeight: 700 }}>{f.confianza}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </DSection>
              )}

              {doc.monto > 0 && (
                <DSection title="Valor detectado">
                  <DRow label="Monto" value={fmtM(doc.monto)} accent={C.green} />
                </DSection>
              )}

              {/* Impacto operacional del documento */}
              {doc.impactoModulos.length > 0 && (
                <DSection title="Impacto operacional al aprobar">
                  {doc.impactoModulos.map(mod => (
                    <DRow key={mod} label={mod} value="Se actualiza al aprobar" accent={C.blueDark} />
                  ))}
                </DSection>
              )}

              {/* Conciliaciones sugeridas */}
              {(doc.aiStatus === "listo_conciliacion" || doc.aiStatus === "aprobado") && doc.entidades > 0 && (
                <DSection title="Conciliación sugerida">
                  <DRow label="Movimientos disponibles" value={`${doc.entidades} campos exportables`} accent={C.green} />
                  <DRow label="Destino"                 value={doc.destino}                           accent={C.blueDark} />
                </DSection>
              )}

              <DrawerTimeline title="Historial de lectura" events={doc.timeline} />

              <DActions>
                {doc.aiStatus === "listo_conciliacion" && (
                  <button className="ag-action-primary" style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, border: "none", padding: `${S[2]}px ${S[4]}px`, cursor: "pointer", borderRadius: R.md }}>
                    Enviar a Conciliación →
                  </button>
                )}
                {(doc.aiStatus === "estructura_detectada" || doc.aiStatus === "aprobado") && (
                  <button className="ag-action-primary" style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, border: "none", padding: `${S[2]}px ${S[4]}px`, cursor: "pointer", borderRadius: R.md }}>
                    Aprobar campos →
                  </button>
                )}
                {doc.aiStatus === "requiere_revision" && (
                  <button className="ag-action-primary" style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, border: "none", padding: `${S[2]}px ${S[4]}px`, cursor: "pointer", borderRadius: R.md }}>
                    Revisar campos →
                  </button>
                )}
                {doc.aiStatus === "error_documental" && (
                  <button className="ag-action-primary" style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, border: "none", padding: `${S[2]}px ${S[4]}px`, cursor: "pointer", borderRadius: R.md }}>
                    Corregir y reenviar →
                  </button>
                )}
                <PassiveAction label="Descargar documento" />
                <PassiveAction label="Enviar a cierre" />
                <PassiveAction label="Ver auditoría completa" />
              </DActions>
              <DrawerTraceability source={`Motor IA · ${doc.fuente}`} updated={doc.fecha} />
            </>
          ),
        };
      }

      case "review_item": {
        const item = REVIEW_ITEMS[c.index];
        if (!item) return null;
        const cc = confColor(item.confianza);
        return {
          title:       `Campo en revisión: ${item.campo}`,
          subtitle:    item.docRef,
          statusLabel: `${item.confianza}% CONFIANZA`,
          severity:    item.confianza < 50 ? "critical" : "warning",
          content: (
            <>
              <DrawerMetricGrid items={[
                { label: "Confianza IA",    value: `${item.confianza}%`,  accent: cc    },
                { label: "Valor detectado", value: item.valorDetectado,   accent: C.ink },
              ]} />
              <DSection title="Sugerencia del Motor IA">
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.7, padding: `${S[2]}px 0` }}>{item.sugerenciaIA}</div>
              </DSection>
              <DSection title="Umbral de aprobación automática">
                <div style={{ display: "flex", alignItems: "center", gap: S[3], padding: `${S[2]}px 0` }}>
                  <div style={{ flex: 1, height: 6, borderRadius: R.pill, background: C.lineSubtle, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${item.confianza}%`, background: cc, borderRadius: R.pill }} />
                  </div>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: cc, flexShrink: 0 }}>{item.confianza}% / 85%</span>
                </div>
              </DSection>
              <DActions>
                <button className="ag-action-primary" style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, border: "none", padding: `${S[2]}px ${S[4]}px`, cursor: "pointer", borderRadius: R.md }}>
                  Aprobar lectura →
                </button>
                <PassiveAction label="Corregir campo manualmente" />
                <PassiveAction label="Solicitar soporte documental" />
                <PassiveAction label="Rechazar documento" />
              </DActions>
              <DrawerTraceability source="Motor IA · Revisión requerida" updated="Pendiente de decisión" />
            </>
          ),
        };
      }

      case "entity": {
        const ent = ENTITIES[c.index];
        if (!ent) return null;
        return {
          title:       ent.label,
          subtitle:    `${ent.count} detectadas · tipo ${ent.tipo}`,
          statusLabel: ent.ready ? "LISTAS" : "PENDIENTES",
          severity:    ent.ready ? "info" : "watch",
          content: (
            <>
              <DrawerMetricGrid items={[
                { label: "Cantidad", value: `${ent.count}`,                                         accent: ent.ready ? C.green : C.amber },
                { label: "Tipo",     value: ent.tipo,                                               accent: C.ink   },
                { label: "Estado",   value: ent.ready ? "Lista para usar" : "Pendiente aprobación", accent: ent.ready ? C.green : C.amber },
              ]} />
              <DSection title="Uso operacional">
                {([
                  { label: "Conciliación Inteligente", value: ent.ready ? "Disponible" : "Pendiente" },
                  { label: "Cierre Financiero",        value: ent.ready ? "Disponible" : "Pendiente" },
                  { label: "Planeación Financiera",    value: "Disponible con aprobación" },
                ]).map((r, i) => <DRow key={i} label={r.label} value={r.value} accent={ent.ready ? C.green : C.amber} />)}
              </DSection>
              <DActions>
                {ent.ready && (
                  <button className="ag-action-primary" style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, border: "none", padding: `${S[2]}px ${S[4]}px`, cursor: "pointer", borderRadius: R.md }}>
                    Ver estructura completa →
                  </button>
                )}
                <PassiveAction label="Aprobar campos" />
                <PassiveAction label="Enviar a conciliación" />
              </DActions>
              <DrawerTraceability source={`Motor IA · ${ent.tipo}`} updated="Última lectura" />
            </>
          ),
        };
      }
    }
  }

  const drawerProps = ctx ? getDrawerProps(ctx) : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minWidth: 0 }}>

      {/* ── 1. HEADER ────────────────────────────────────────────────────── */}
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Finanzas", href: `/${orgSlug}/executive` },
          { label: "Centro Documental" },
        ]}
        title="Centro Documental"
        subtitle="Pipeline documental · lectura IA · validación · impacto operacional"
        status={requiresReview > 0 ? "warning" : "ok"}
        statusLabel={
          requiresReview > 0
            ? `${requiresReview} requieren revisión · ${readyForRecon} listos para conciliación`
            : `${readyForRecon} listos · ${pendingAnalysis} en cola · pipeline activo`
        }
      />

      {/* ── 2. PIPELINE VIVO ─────────────────────────────────────────────── */}
      <section style={{ marginBottom: S[8] }}>
        <div style={{
          background: C.white, border: `1px solid ${C.lineSubtle}`,
          borderRadius: R.lg, overflow: "hidden", boxShadow: E.sm,
        }}>
          {/* Pipeline header */}
          <div style={{ padding: `${S[3]}px ${S[5]}px`, borderBottom: `1px solid ${C.lineSubtle}`, background: C.surface, display: "flex", alignItems: "center", gap: S[3] }}>
            <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: R.pill, background: C.green, flexShrink: 0 }} />
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Pipeline documental activo</span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>· {totalDocs} documentos en ciclo</span>
          </div>
          {/* Pipeline stages */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 16px 1fr 16px 1fr 16px 1fr 16px 1fr", alignItems: "stretch" }}>
            {([
              { stage: "ingesta"    as const, label: "INGESTA",      count: 69, sub: "recibidos",    status: "ok"  as const, color: C.blue  },
              { stage: "lectura"    as const, label: "LECTURA IA",   count: 63, sub: "procesados",   status: "ok"  as const, color: C.blue  },
              { stage: "validacion" as const, label: "VALIDACIÓN",   count:  4, sub: "pendientes",   status: "warn" as const, color: C.amber },
              { stage: "impacto"    as const, label: "IMPACTO",      count: 41, sub: "aprobados",    status: "ok"  as const, color: C.green },
              { stage: "conciliado" as const, label: "CONCILIADO",   count: 27, sub: "listos",       status: "ok"  as const, color: C.green },
            ]).map((step, i) => (
              <>
                <div
                  key={step.stage}
                  onClick={() => open({ type: "pipeline_stage", stage: step.stage })}
                  style={{
                    padding: `${S[5]}px ${S[5]}px ${S[4]}px`,
                    borderTop: `4px solid ${step.color}`,
                    cursor: "pointer",
                    transition: "background 0.1s",
                    display: "flex", flexDirection: "column" as const, gap: S[2],
                    background: step.status === "warn" ? "rgba(217,119,6,0.025)" : C.white,
                  }}
                >
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: step.status === "warn" ? C.amber : C.inkFaint, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{step.label}</div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["3xl"], fontWeight: 700, color: step.color, lineHeight: 1 }}>{step.count}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                    <span className={`ag-op-status ${step.status === "warn" ? "ag-op-status--warning" : "ag-op-status--ok"}`} style={{ fontSize: T.sz["2xs"] }}>{step.sub}</span>
                  </div>
                </div>
                {i < 4 && (
                  <div key={`arr-${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: C.surface, borderTop: `4px solid ${C.lineSubtle}` }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost }}>→</span>
                  </div>
                )}
              </>
            ))}
          </div>
          {/* Pipeline footer — ingesta CTA */}
          <div style={{ padding: `${S[3]}px ${S[5]}px`, borderTop: `1px solid ${C.lineSubtle}`, background: C.surface, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
              {["XML DIAN","Extracto bancario","Factura","Nómina","Soporte pago","Comprobante"].map(t => (
                <span key={t} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.pill, padding: `1px ${S[3]}px` }}>{t}</span>
              ))}
            </div>
            <button
              onClick={() => open({ type: "upload" })}
              className="ag-action-secondary"
              style={{ fontFamily: T.mono, fontSize: T.sz.xs, cursor: "pointer" }}
            >
              Nueva ingesta →
            </button>
          </div>
        </div>
      </section>

      {/* ── 3. COLA OPERATIVA ─────────────────────────────────────────────── */}
      <section style={{ marginBottom: S[8] }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[5] }}>
          <div>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Documentos en proceso</span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginLeft: S[3] }}>· {totalDocs} total · orden por prioridad</span>
          </div>
          <span className={`ag-op-status ${requiresReview > 0 ? "ag-op-status--warning" : "ag-op-status--ok"}`} style={{ fontSize: T.sz["2xs"] }}>
            {requiresReview > 0 ? `${requiresReview} requieren acción` : "Sin bloqueos"}
          </span>
        </div>
        <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.lg, overflow: "hidden", boxShadow: E.sm }}>
          {/* Column headers */}
          <div style={{ padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`, background: C.surface, display: "grid", gridTemplateColumns: "80px 1fr 100px 100px 180px 130px 80px", gap: S[3], alignItems: "center" }}>
            {["Prioridad","Documento","Confianza IA","Estado","Acción requerida","Impacto",""].map(h => (
              <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{h}</span>
            ))}
          </div>
          {colaOperativa.map((doc, i) => {
            const statusColor = AI_STATUS_COLOR[doc.aiStatus];
            const avgConf = doc.campos.length > 0
              ? Math.round(doc.campos.reduce((s, f) => s + f.confianza, 0) / doc.campos.length)
              : null;
            return (
              <div
                key={doc.id}
                onClick={() => open({ type: "document", index: DOCUMENTS.indexOf(doc) })}
                className="ag-op-row"
                style={{
                  display: "grid", gridTemplateColumns: "80px 1fr 100px 100px 180px 130px 80px",
                  alignItems: "center", gap: S[3], padding: `${S[3]}px ${S[4]}px`,
                  borderBottom: i < colaOperativa.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                  borderLeft: `3px solid ${PRIO_DOT[doc.prioridad]}`,
                  background: doc.prioridad === "urgente" ? "rgba(220,38,38,0.025)" : doc.prioridad === "alta" ? "rgba(217,119,6,0.015)" : undefined,
                  cursor: "pointer", transition: "background 0.1s",
                }}
              >
                {/* Prioridad */}
                <span className={`ag-op-status ${PRIO_CSS[doc.prioridad]}`} style={{ fontSize: T.sz["2xs"] }}>
                  {PRIO_LABEL[doc.prioridad]}
                </span>
                {/* Documento */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{doc.nombre}</div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{doc.tipo} · {doc.fuente} · {doc.fecha}</div>
                </div>
                {/* Confianza IA */}
                <div>
                  {avgConf !== null ? (
                    <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                      <div style={{ flex: 1, height: 4, borderRadius: R.pill, background: C.lineSubtle, overflow: "hidden", minWidth: 40 }}>
                        <div style={{ height: "100%", width: `${avgConf}%`, background: confColor(avgConf), borderRadius: R.pill }} />
                      </div>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 700, color: confColor(avgConf), flexShrink: 0 }}>{avgConf}%</span>
                    </div>
                  ) : (
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>—</span>
                  )}
                </div>
                {/* Estado */}
                <span className={`ag-op-status ${AI_STATUS_CSS[doc.aiStatus]}`} style={{ fontSize: T.sz["2xs"] }}>
                  {AI_STATUS_LABEL[doc.aiStatus]}
                </span>
                {/* Acción requerida */}
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                  {doc.accionRequerida}
                </span>
                {/* Impacto */}
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[1] }}>
                  {doc.impactoModulos.length > 0 ? doc.impactoModulos.map(mod => (
                    <span key={mod} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark, background: C.blueLight, border: `1px solid ${C.blueBorder}`, borderRadius: R.sm, padding: `1px ${S[1] + 1}px`, whiteSpace: "nowrap" as const }}>
                      {mod}
                    </span>
                  )) : (
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>—</span>
                  )}
                </div>
                {/* Acción CTA */}
                <button
                  onClick={e => { e.stopPropagation(); open({ type: "document", index: DOCUMENTS.indexOf(doc) }); }}
                  style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 700, color: statusColor, background: "transparent", border: `1px solid ${statusColor}40`, borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`, cursor: "pointer", whiteSpace: "nowrap" as const }}
                >
                  {doc.cta} →
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 4. VALIDACIÓN PENDIENTE ──────────────────────────────────────── */}
      {REVIEW_ITEMS.length > 0 && (
        <section style={{ marginBottom: S[8] }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[5] }}>
            <div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Validación pendiente</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginLeft: S[3] }}>· {REVIEW_ITEMS.length} campos · decisión humana requerida · umbral &lt;85%</span>
            </div>
          </div>
          <div style={{
            background: "rgba(217,119,6,0.012)",
            border: `1.5px solid rgba(217,119,6,0.25)`,
            borderTop: `4px solid ${C.amber}`,
            borderRadius: R.lg, overflow: "hidden",
          }}>
            <div style={{ padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`, background: "rgba(217,119,6,0.03)", display: "grid", gridTemplateColumns: "72px 136px 1fr 130px 1fr", gap: S[3], alignItems: "center" }}>
              {["Doc","Campo","Valor detectado","Confianza IA","Acción"].map(h => (
                <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{h}</span>
              ))}
            </div>
            {REVIEW_ITEMS.map((item, i) => {
              const cc = confColor(item.confianza);
              return (
                <div
                  key={item.id}
                  onClick={() => open({ type: "review_item", index: i })}
                  className="ag-op-row"
                  style={{
                    display: "grid", gridTemplateColumns: "72px 136px 1fr 130px 1fr",
                    alignItems: "center", gap: S[3], padding: `${S[4]}px ${S[4]}px`,
                    borderBottom: i < REVIEW_ITEMS.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                    borderLeft: `3px solid ${cc}`,
                    cursor: "pointer", transition: "background 0.1s",
                  }}
                >
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{item.id}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, fontWeight: 600, background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: R.sm, padding: `1px ${S[2]}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, display: "block" }}>{item.campo}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{item.valorDetectado}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                    <div style={{ flex: 1, height: 4, borderRadius: R.pill, background: C.lineSubtle, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${item.confianza}%`, background: cc, borderRadius: R.pill }} />
                    </div>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 700, color: cc, flexShrink: 0 }}>{item.confianza}%</span>
                  </div>
                  <div style={opActionCol()}>
                    <button
                      onClick={e => { e.stopPropagation(); open({ type: "review_item", index: i }); }}
                      style={{ ...opActionBtn(C.blueDark), background: C.blueLight, border: `1px solid ${C.blueBorder}` }}
                    >{item.accion} →</button>
                  </div>
                </div>
              );
            })}
            <div style={{ padding: `${S[3]}px ${S[4]}px`, borderTop: `1px solid ${C.lineSubtle}`, background: "rgba(217,119,6,0.03)", display: "flex", alignItems: "center", gap: S[2] }}>
              <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: R.pill, background: C.amber, flexShrink: 0 }} />
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Campos aprobados entran al ciclo de conciliación · umbral automático ≥85% · decisión del operador requerida</span>
            </div>
          </div>
        </section>
      )}

      {/* ── 5. IMPACTO OPERACIONAL ───────────────────────────────────────── */}
      <section style={{ marginBottom: S[8] }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[3], marginBottom: S[5] }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Impacto operacional</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>· al aprobar documentos activos</span>
        </div>
        <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.lg, overflow: "hidden", boxShadow: E.sm }}>
          <div style={{ padding: `${S[3]}px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`, background: C.surface, display: "grid", gridTemplateColumns: "140px 1fr 80px 80px", gap: S[4], alignItems: "center" }}>
            {["Módulo", "Qué se actualiza", "Docs", "Campos"].map(h => (
              <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{h}</span>
            ))}
          </div>
          {([
            {
              mod: "Conciliación",
              href: `/${orgSlug}/finanzas/conciliacion`,
              color: C.blue,
              detail: "Extractos bancarios · soportes de pago · comprobantes disponibles para cruce automático",
            },
            {
              mod: "Cierre Financiero",
              href: `/${orgSlug}/finanzas/cierre`,
              color: C.green,
              detail: "Facturas · nóminas · declaraciones DIAN incorporadas al score de cierre",
            },
            {
              mod: "Tesorería",
              href: `/${orgSlug}/finanzas/tesoreria`,
              color: C.blueDark,
              detail: "Flujos de caja actualizados · extractos bancarios incorporados a posición",
            },
            {
              mod: "CashFlow",
              href: null,
              color: C.inkMid,
              detail: "Nóminas y obligaciones registradas en proyección de liquidez",
            },
            {
              mod: "DIAN",
              href: null,
              color: C.amber,
              detail: "Declaraciones y XML procesados · estado fiscal actualizable",
            },
          ]).map((row, i, arr) => {
            const v = impactoMap[row.mod] ?? { docs: 0, entidades: 0 };
            const isActive = v.docs > 0;
            return (
              <div
                key={row.mod}
                style={{
                  display: "grid", gridTemplateColumns: "140px 1fr 80px 80px",
                  alignItems: "center", gap: S[4],
                  padding: `${S[4]}px ${S[4]}px`,
                  borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                  borderLeft: `3px solid ${isActive ? row.color : C.lineSubtle}`,
                  opacity: isActive ? 1 : 0.45,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                  {row.href ? (
                    <Link href={row.href} style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: row.color, textDecoration: "none" }}>
                      {row.mod} →
                    </Link>
                  ) : (
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: row.color }}>{row.mod}</span>
                  )}
                </div>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.5 }}>{row.detail}</span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: isActive ? row.color : C.inkGhost, textAlign: "right" as const }}>{isActive ? v.docs : "—"}</span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: isActive ? C.ink : C.inkGhost, textAlign: "right" as const }}>{isActive ? v.entidades : "—"}</span>
              </div>
            );
          })}
          <div style={{ padding: `${S[3]}px ${S[4]}px`, borderTop: `1px solid ${C.lineSubtle}`, background: C.surface, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
              {DOCUMENTS.filter(d => d.impactoModulos.length > 0 && d.aiStatus === "listo_conciliacion").length} documentos listos para propagación · aprobación activa
            </span>
            <Link href={`/${orgSlug}/finanzas/conciliacion`} className="ag-action-secondary" style={{ textDecoration: "none", fontSize: T.sz.xs, display: "inline-block" }}>
              Ir a conciliación →
            </Link>
          </div>
        </div>
      </section>

      {/* ── 6. TRAZABILIDAD (colapsado) ──────────────────────────────────── */}
      <CollapsibleSection
        title="Trazabilidad documental"
        meta="Ciclo de vida · aprobaciones · envíos"
        accent={C.inkMid}
        detailLabel="Ver historial"
        defaultOpen={false}
      >
        <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.lg, overflow: "hidden" }}>
          {([
            { fecha: "Hoy 08:32",  user: "Motor IA",     accion: "Extracto Bancolombia aprobado · 58 entidades detectadas",     dot: C.green },
            { fecha: "Hoy 09:16",  user: "Motor IA",     accion: "Factura F-2026-0891 procesada y aprobada automáticamente",    dot: C.green },
            { fecha: "Ayer 16:01", user: "Motor IA",     accion: "XML DIAN enviado a bandeja de revisión — baja confianza",      dot: C.amber },
            { fecha: "Ayer 11:31", user: "Carga manual", accion: "Soporte pago Ref. 203847 estructurado · pendiente aprobación", dot: C.blue  },
            { fecha: "Hace 5d",    user: "Motor IA",     accion: "Declaración IVA rechazada — período no coincide",             dot: C.red   },
            { fecha: "Hace 5d",    user: "Motor IA",     accion: "Comprobante CE-0284 aprobado · listo para conciliación",       dot: C.green },
          ]).map((ev, i, arr) => (
            <div key={i} style={{ display: "flex", gap: S[4], padding: `${S[3]}px ${S[4]}px`, borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSubtle}` : "none" }}>
              <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", flexShrink: 0, width: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: R.pill, background: ev.dot, boxShadow: `0 0 0 2px ${C.white}`, flexShrink: 0, marginTop: 2 }} />
                {i < arr.length - 1 && <div style={{ width: 1, flex: 1, background: C.lineSubtle, minHeight: S[3], marginTop: 2 }} />}
              </div>
              <div style={{ flex: 1, paddingBottom: i < arr.length - 1 ? S[3] : 0 }}>
                <div style={{ display: "flex", gap: S[3], alignItems: "center", marginBottom: 2 }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{ev.fecha}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: R.pill, padding: `1px ${S[2]}px` }}>{ev.user}</span>
                </div>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{ev.accion}</span>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* ── 7. PAQUETES DOCUMENTALES (colapsado) ────────────────────────── */}
      <CollapsibleSection
        title="Paquetes documentales"
        meta="Exportación · auditoría · entrega a DIAN"
        accent={C.inkMid}
        detailLabel="Ver paquetes"
        defaultOpen={false}
      >
        <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.lg, overflow: "hidden" }}>
          {([
            { icon: "PDF", label: "Reporte Ejecutivo",    sub: "Resumen para dirección financiera",         badge: "PDF",  records: `${totalDocs} docs`  },
            { icon: "XML", label: "Exportar DIAN",        sub: "Paquete XML para obligaciones tributarias", badge: "XML",  records: "4 docs DIAN"        },
            { icon: "XLS", label: "Dataset de Auditoría", sub: "Campos completos con trazabilidad",         badge: "XLSX", records: `${totalDocs} docs`  },
            { icon: "ZIP", label: "Paquete Completo",     sub: "Todos los formatos + pista de auditoría",   badge: "ZIP",  records: "Completo"           },
          ]).map((item, i, arr) => (
            <div key={item.label} style={{ display: "grid", gridTemplateColumns: "40px 1fr 80px 88px 130px", alignItems: "center", gap: S[3], padding: `${S[3]}px ${S[4]}px`, borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSubtle}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 24, borderRadius: R.sm, background: C.surface, border: `1px solid ${C.lineSubtle}` }}>
                <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkMid, fontWeight: 700, letterSpacing: "0.04em" }}>{item.icon}</span>
              </div>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{item.sub}</div>
              </div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{item.records}</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: R.sm, padding: `1px ${S[2]}px`, display: "inline-block" }}>{item.badge}</span>
              <PassiveAction label="Exportar →" />
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* ── DRAWER ──────────────────────────────────────────────────────────── */}
      {drawerProps && (
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
      )}

    </div>
  );
}
