"use client";

/**
 * PlaneacionClient
 *
 * Planeación Financiera — Radar Estratégico V1 (polished + Motor de Presupuestos).
 * Proyección · Presupuestos vivos · Simulaciones · Recomendaciones IA.
 *
 * Filosofía: NO es un ERP clásico. Es mission control financiero.
 * Responde: "¿Cómo se ve el futuro financiero de la empresa?"
 *
 * Sprint: AGENTIK-FINANCE-BUDGET-ENGINE-01
 * All data: PLACEHOLDER — replace with real Prisma queries before ship.
 *
 * ── SYSTEMIC LAYOUT RULES (AGENTIK FINANCIAL MODULES) ────────────────────────
 *
 *  CONTAINER
 *    padding: S[5] × S[6]  (20px top/bottom · 24px left/right)
 *    maxWidth: 960         (stable with both rails open at 1280px+ viewport)
 *    margin: 0 auto
 *
 *  SECTION HEADER
 *    PlanSectionHeader — gradient-blue background + semantic accent left border
 *    marginBottom: S[5] before section content
 *    sectionGap: marginBottom S[8] between sections (S[6] for last)
 *
 *  CARDS
 *    border: 1px solid C.line + borderLeft: 3px solid <semantic>
 *    borderRadius: R.md · boxShadow: E.sm
 *    transition: box-shadow 0.2s ease  (motion system)
 *    header padding: S[2] × S[3]
 *    body padding:   S[2] × S[3]
 *    strip padding:  S[2] × S[3]
 *
 *  OPERATIONAL TABLES
 *    CSS grid, never flex for rows
 *    columnGap: 24 (standard for financial tables)
 *    header bg: C.surface · row bg: C.white
 *    row padding: S[3] × S[4]
 *    left border: 3px solid <semantic color>
 *    use ag-op-row class on rows for hover state
 *
 *  BADGES (custom)
 *    opBadge(color) — height 18px, R.sm radius, T.sz["2xs"], uppercase
 *    ag-op-status ag-op-status--{variant} — for standard operational states
 *    NEVER mix sizes across the same component
 *
 *  PROGRESS BARS
 *    height: 6px (card bars) · 10px (monitor bars)
 *    background: gradient fill for depth
 *    transition: width 0.45s ease
 *
 *  MOTOR DE PRESUPUESTOS
 *    enabledModules: string[] — from getEnabledModules(organization.id) in page.tsx
 *    areaOptions: derived from AREA_FROM_MODULE × enabledModules (no hardcoding)
 *    2-column layout: form left + connections right
 *    Copilot insight strip below — tenant-aware per area
 *    Filter bar above Presupuestos Activos (estado pills + search)
 *
 *  RAIL COEXISTENCE
 *    At 1280px viewport + both rails: ~696px content available
 *    Budget cards: 2-col grid — each ~340px min, workable
 *    Sim cards:    3-col minmax(0,1fr) — each ~220px min, workable
 *    Ejecución:    "minmax(160px,1.2fr) 1fr 68px 120px" + 3×24gap
 *    Recomendaciones: "1fr 100px"
 *    Motor form: "minmax(0,1.4fr) minmax(0,1fr)" + gap S[4]
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { CSSProperties }        from "react";
import { useState }                   from "react";
import Link                           from "next/link";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { C, T, S, R, E }             from "@/lib/ui/tokens";
import { opActionBtn }               from "@/lib/ui/op-table";
import { FINANCE_LANGUAGE, getBudgetActionLabel } from "@/lib/finance/language";
import type {
  BudgetRow,
  VarianceRow,
  CashFlowSummary,
  FpaRecommendation,
  RevenueForecast,
} from "@/lib/finance/fpa-queries";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type BudgetEstado  = "activo" | "en_riesgo" | "sobre_ritmo" | "subejecutado" | "agotado" | "pausado";
type SimEstado     = "critico" | "atencion" | "oportunidad" | "neutro";
type RecPrioridad  = "critica" | "alta" | "media" | "baja";
type RecTipo       = "alerta_presupuesto" | "reasignacion" | "velocidad" | "oportunidad" | "proyeccion";

interface BudgetActivo {
  id:                    string;
  nombre:                string;
  categoria:             string;
  dimension:             string;
  estado:                BudgetEstado;
  planeado:              number;
  ejecutado:             number;
  comprometido:          number;
  disponible:            number;
  velocidadDiaria:       number;
  indiceDesvio:          number;
  proyeccionAgotamiento: string;
  coberturaDias:         number;
  periodoInicio:         string;
  periodoFin:            string;
  revisionLabel:         string;
}

interface Simulacion {
  id:               string;
  titulo:           string;
  descripcion:      string;
  impactoEstimado:  string;
  estadoProyectado: SimEstado;
  area:             string;
  insightIA:        string;
}

interface Recomendacion {
  id:          string;
  tipo:        RecTipo;
  prioridad:   RecPrioridad;
  titulo:      string;
  descripcion: string;
  impacto:     string;
  area:        string;
  accion:      string;
  confianza:   number;
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA — PLACEHOLDER: replace with real API/Prisma queries before ship
// ─────────────────────────────────────────────────────────────────────────────

const PLANEACION_STATUS = {
  periodo:               "Q2 2026 · Abr–Jun",
  saludGlobal:           74,
  saludLabel:            "ESTABLE",
  saludTendencia:        "+5 pts vs. Q1",
  liquidezRunway:        47,
  liquidezHasta:         "29 jun 2026",
  riesgoGlobal:          "MODERADO",
  riesgoCriticos:        1,
  tendenciaMargen:       "+2.3%",
  tendenciaLabel:        "en crecimiento vs. Q1",
  presupuestoTotal:      487_600_000,
  ejecutadoTotal:        201_880_000,
  presupuestosActivos:   4,
  presupuestosEnRiesgo:  1,
  lastUpdate:            "Hace 23 min",
};

const BUDGETS_ACTIVOS: BudgetActivo[] = [
  {
    id:                    "b1",
    nombre:                "Marketing Digital Q2",
    categoria:             "Marketing",
    dimension:             "Línea Infantil",
    estado:                "en_riesgo",
    planeado:              42_000_000,
    ejecutado:             31_800_000,
    comprometido:          8_400_000,
    disponible:            1_800_000,
    velocidadDiaria:       1_060_000,
    indiceDesvio:          1.41,
    proyeccionAgotamiento: "19 may 2026",
    coberturaDias:         2,
    periodoInicio:         "02 abr 2026",
    periodoFin:            "30 jun 2026",
    revisionLabel:         "revisión automática hoy",
  },
  {
    id:                    "b2",
    nombre:                "Operaciones Tienda Norte",
    categoria:             "Operaciones",
    dimension:             "Castillitos Norte",
    estado:                "activo",
    planeado:              68_500_000,
    ejecutado:             28_200_000,
    comprometido:          4_200_000,
    disponible:            36_100_000,
    velocidadDiaria:       940_000,
    indiceDesvio:          0.97,
    proyeccionAgotamiento: "22 jul 2026",
    coberturaDias:         38,
    periodoInicio:         "02 abr 2026",
    periodoFin:            "30 jun 2026",
    revisionLabel:         "próxima revisión: 20 may",
  },
  {
    id:                    "b3",
    nombre:                "Inventario Línea Premium",
    categoria:             "Logística",
    dimension:             "Inventario Central",
    estado:                "sobre_ritmo",
    planeado:              185_000_000,
    ejecutado:             119_400_000,
    comprometido:          24_600_000,
    disponible:            41_000_000,
    velocidadDiaria:       3_980_000,
    indiceDesvio:          1.24,
    proyeccionAgotamiento: "31 may 2026",
    coberturaDias:         10,
    periodoInicio:         "02 abr 2026",
    periodoFin:            "30 jun 2026",
    revisionLabel:         "alerta programada: 31 may",
  },
  {
    id:                    "b4",
    nombre:                "Campaña Redes Sociales",
    categoria:             "Marketing",
    dimension:             "Digital · Mayo",
    estado:                "subejecutado",
    planeado:              12_800_000,
    ejecutado:             2_900_000,
    comprometido:          0,
    disponible:            9_900_000,
    velocidadDiaria:       96_667,
    indiceDesvio:          0.53,
    proyeccionAgotamiento: "03 sep 2026",
    coberturaDias:         102,
    periodoInicio:         "01 may 2026",
    periodoFin:            "31 may 2026",
    revisionLabel:         "próximo corte: 31 may",
  },
];

const SIMULACIONES: Simulacion[] = [
  {
    id:               "s1",
    titulo:           "¿Qué pasa si ventas bajan 20%?",
    descripcion:      "Impacto en operaciones y logística si el volumen de ventas cae un 20% este trimestre.",
    impactoEstimado:  "−$34.2M en margen operacional",
    estadoProyectado: "critico",
    area:             "Operaciones · Logística",
    insightIA:        "Agentik detecta presión operativa si ventas continúan cayendo 3 semanas consecutivas.",
  },
  {
    id:               "s2",
    titulo:           "¿Qué pasa si marketing dobla inversión?",
    descripcion:      "Efecto sobre liquidez y ROI si el presupuesto de marketing digital se duplica en junio.",
    impactoEstimado:  "CAC +38% · Cobertura −12 días",
    estadoProyectado: "atencion",
    area:             "Marketing · Tesorería",
    insightIA:        "Agentik proyecta agotamiento temprano si el CAC supera 40% en semana 3 de junio.",
  },
  {
    id:               "s3",
    titulo:           "¿Qué pasa si abrimos una tienda?",
    descripcion:      "Proyección si se activa una tienda nueva en Medellín en Q3 2026.",
    impactoEstimado:  "+$86M inversión inicial · ROI Q4",
    estadoProyectado: "oportunidad",
    area:             "Expansión · Estrategia",
    insightIA:        "Agentik detecta oportunidad de expansión sin afectar liquidez operativa en Q2.",
  },
];

const RECOMENDACIONES: Recomendacion[] = [
  {
    id:          "r1",
    tipo:        "alerta_presupuesto",
    prioridad:   "critica",
    titulo:      "Marketing Digital agotará presupuesto en 2 días",
    descripcion: "La velocidad de consumo proyecta agotamiento el 19 de mayo. Acción requerida hoy.",
    impacto:     "Riesgo de paralización de campañas activas en Línea Infantil",
    area:        "Marketing · Línea Infantil",
    accion:      "Corregir presupuesto",
    confianza:   0.97,
  },
  {
    id:          "r2",
    tipo:        "reasignacion",
    prioridad:   "alta",
    titulo:      "Campaña Redes tiene $9.9M subutilizados",
    descripcion: "Mayo está al 22% de ejecución con 18 días hábiles restantes. Riesgo de cierre con excedente.",
    impacto:     "$9.9M reasignables a Marketing Digital sin afectar objetivos",
    area:        "Marketing · Digital",
    accion:      "Reasignar recursos",
    confianza:   0.89,
  },
  {
    id:          "r3",
    tipo:        "velocidad",
    prioridad:   "alta",
    titulo:      "Inventario Premium se agotará 30 días antes del cierre Q2",
    descripcion: "Ritmo actual proyecta agotamiento el 31 mayo, con 30 días de período restantes.",
    impacto:     "Posible desabastecimiento línea premium en junio",
    area:        "Logística · Inventario",
    accion:      "Proyectar abastecimiento",
    confianza:   0.84,
  },
  {
    id:          "r4",
    tipo:        "oportunidad",
    prioridad:   "media",
    titulo:      "Tienda Norte optimizó costos — $4.2M recuperables",
    descripcion: "Ejecutó 41% del presupuesto en el 47% del período. Margen de ahorro proyectado.",
    impacto:     "+$4.2M disponibles para reasignación Q3",
    area:        "Operaciones · Castillitos Norte",
    accion:      "Validar ahorro",
    confianza:   0.91,
  },
  {
    id:          "r5",
    tipo:        "proyeccion",
    prioridad:   "media",
    titulo:      "Cobertura operacional global: 47 días cubiertos",
    descripcion: "Al ritmo actual el presupuesto total Q2 cubre hasta el 29 junio. Objetivo: 30 junio.",
    impacto:     "Cierre en tiempo si la velocidad se mantiene",
    area:        "Global · Q2 2026",
    accion:      "Revisar cobertura",
    confianza:   0.88,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// MOTOR DE PRESUPUESTOS — TENANT-AWARE CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Maps active tenant modules → budget area options. Order matters for display. */
const AREA_FROM_MODULE: Array<{ moduleKey: string; area: string; label: string }> = [
  { moduleKey: "finance",          area: "finanzas",   label: "Finanzas"   },
  { moduleKey: "sales",            area: "comercial",  label: "Comercial"  },
  { moduleKey: "marketing_studio", area: "marketing",  label: "Marketing"  },
  { moduleKey: "collections",      area: "cobranza",   label: "Cobranza"   },
  { moduleKey: "inventory",        area: "inventario", label: "Inventario" },
  { moduleKey: "production",       area: "produccion", label: "Producción" },
  { moduleKey: "purchases",        area: "compras",    label: "Compras"    },
  { moduleKey: "workforce",        area: "rrhh",       label: "RRHH"       },
  { moduleKey: "dispatch",         area: "logistica",  label: "Logística"  },
];

/** Entity options per area. PLACEHOLDER — replace with real org entities. */
const ENTIDADES_POR_AREA: Record<string, string[]> = {
  finanzas:   ["Empresa Global", "Castillitos Norte", "Castillitos Sur"],
  comercial:  ["Canal Directo", "Canal Mayorista", "Línea Infantil"],
  marketing:  ["Digital", "ATL · BTL", "Redes Sociales"],
  cobranza:   ["Cartera Vencida", "Cartera Vigente", "Cobros Online"],
  inventario: ["Central", "Tienda Norte", "Tienda Sur"],
  produccion: ["Línea A", "Línea B"],
  compras:    ["Nacional", "Internacional"],
  rrhh:       ["Planta", "Administrativo", "Comercial"],
  logistica:  ["Despachos", "Devoluciones", "Última Milla"],
};

/** Systemic connections always active for any budget. */
const CONEXIONES_SIEMPRE = ["Cierre Financiero", "Tesorería Operativa"];

/** Additional connections per area. */
const CONEXIONES_POR_AREA: Record<string, string[]> = {
  finanzas:   ["Conciliación Bancaria", "Cartera", "Cuentas por Pagar"],
  comercial:  ["Pipeline Comercial", "Centro Documental", "Cartera"],
  marketing:  ["Marketing Studio", "Pipeline Comercial"],
  cobranza:   ["Cartera", "Centro Documental", "Conciliación Bancaria"],
  inventario: ["Centro Documental", "Compras"],
  produccion: ["Compras", "Inventario"],
  compras:    ["Centro Documental", "Inventario"],
  rrhh:       ["Cierre Financiero"],
  logistica:  ["Centro Documental", "Inventario"],
};

const BUDGET_TIPOS: Array<{ key: string; label: string }> = [
  { key: "gasto",     label: "Gasto Operativo"       },
  { key: "inversion", label: "Inversión"              },
  { key: "ingresos",  label: "Ingresos Proyectados"   },
  { key: "proyecto",  label: "Proyecto"               },
  { key: "ciclo",     label: "Ciclo Comercial"        },
];

const PERIODOS: Array<{ key: string; label: string }> = [
  { key: "mes_actual", label: "Este mes"   },
  { key: "q2_2026",    label: "Q2 2026"    },
  { key: "h1_2026",    label: "H1 2026"    },
  { key: "anual_2026", label: "Año 2026"   },
  { key: "custom",     label: "Otro"       },
];

const TOLERANCIAS = [5, 10, 15, 20, 30];


/** Contextual objective placeholder per area — hints for the objetivo field. */
const OBJETIVO_PLACEHOLDERS: Record<string, string> = {
  finanzas:   "Optimizar margen financiero Q2 sin afectar liquidez operativa",
  comercial:  "Optimizar margen comercial en canal directo para Q2",
  marketing:  "Controlar consumo de pauta sin perder alcance en Línea Infantil",
  cobranza:   "Reducir cartera vencida y mejorar velocidad de recuperación",
  inventario: "Extender cobertura operativa Q3 con margen del 15%",
  produccion: "Reducir gasto operativo mensual en línea de producción",
  compras:    "Reducir desviación logística y optimizar tiempos de entrega",
  rrhh:       "Controlar costo de nómina mensual dentro del presupuesto aprobado",
  logistica:  "Extender cobertura logística Q2 con ajuste de rutas prioritarias",
  default:    "Reducir desviación · Controlar consumo · Extender cobertura operativa",
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmtShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

/**
 * opBadge — standardized custom badge for priority / classification chips.
 * Height: 18px · R.sm radius · T.sz["2xs"] · uppercase · flexShrink:0
 */
const opBadge = (color: string): CSSProperties => ({
  display:       "inline-flex",
  alignItems:    "center",
  height:        18,
  padding:       `0 ${S[2]}px`,
  background:    `${color}0F`,
  border:        `1px solid ${color}2A`,
  borderRadius:  R.sm,
  fontFamily:    T.mono,
  fontSize:      T.sz["2xs"],
  fontWeight:    700,
  color,
  textTransform: "uppercase" as const,
  letterSpacing: "0.07em",
  whiteSpace:    "nowrap" as const,
  flexShrink:    0,
  lineHeight:    1,
});

const ESTADO_COLOR: Record<BudgetEstado, string> = {
  en_riesgo:    C.red,
  sobre_ritmo:  C.amber,
  subejecutado: C.blue,
  activo:       C.green,
  agotado:      C.red,
  pausado:      C.inkFaint,
};

const ESTADO_BADGE: Record<BudgetEstado, string> = {
  en_riesgo:    "ag-op-status ag-op-status--critical",
  sobre_ritmo:  "ag-op-status ag-op-status--warning",
  subejecutado: "ag-op-status ag-op-status--neutral",
  activo:       "ag-op-status ag-op-status--ok",
  agotado:      "ag-op-status ag-op-status--critical",
  pausado:      "ag-op-status ag-op-status--neutral",
};

const ESTADO_LABEL: Record<BudgetEstado, string> = {
  en_riesgo:    "En riesgo",
  sobre_ritmo:  "Sobre ritmo",
  subejecutado: "Subejecutado",
  activo:       "En ritmo",
  agotado:      "Agotado",
  pausado:      "Pausado",
};

const SIM_ESTADO_COLOR: Record<SimEstado, string> = {
  critico:     C.red,
  atencion:    C.amber,
  oportunidad: C.green,
  neutro:      C.inkLight,
};

const SIM_ESTADO_BADGE: Record<SimEstado, string> = {
  critico:     "ag-op-status ag-op-status--critical",
  atencion:    "ag-op-status ag-op-status--warning",
  oportunidad: "ag-op-status ag-op-status--ok",
  neutro:      "ag-op-status ag-op-status--neutral",
};

const SIM_ESTADO_LABEL: Record<SimEstado, string> = {
  critico:     "Consecuencia crítica",
  atencion:    "Requiere atención",
  oportunidad: "Oportunidad",
  neutro:      "Neutral",
};

const REC_PRIORIDAD_COLOR: Record<RecPrioridad, string> = {
  critica: C.red,
  alta:    C.amber,
  media:   C.blueDark,
  baja:    C.inkLight,
};

const REC_PRIORIDAD_LABEL: Record<RecPrioridad, string> = {
  critica: "Crítica",
  alta:    "Alta",
  media:   "Media",
  baja:    "Baja",
};

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PlanSectionHeader
 *
 * Standard section header for all financial module zones.
 * Blue gradient background · semantic accent border left · mono label.
 */
function PlanSectionHeader({
  label,
  meta,
  accent,
}: {
  label:   string;
  meta?:   string;
  accent?: string;
}) {
  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          S[2],
      minHeight:    32,
      marginBottom: S[5],
      padding:      `${S[1] + 2}px ${S[3]}px`,
      background:   "linear-gradient(180deg,rgba(37,99,235,0.042) 0%,rgba(37,99,235,0.016) 100%)",
      border:       "1px solid rgba(37,99,235,0.08)",
      borderLeft:   accent ? `3px solid ${accent}` : "1px solid rgba(37,99,235,0.08)",
      borderRadius: R.md,
    }}>
      <span style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.xs,
        color:         C.inkMid,
        fontWeight:    700,
        textTransform: "uppercase" as const,
        letterSpacing: "0.09em",
      }}>
        {label}
      </span>
      {meta && (
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          color:      C.inkFaint,
          fontWeight: 400,
        }}>
          · {meta}
        </span>
      )}
    </div>
  );
}

/**
 * LayerDivider — visual separator between strategic layers.
 * Provides breathing room and labels the transition between CAPA boundaries.
 * Margin is self-contained — sections do NOT need extra marginBottom.
 */
function LayerDivider({ label }: { label: string }) {
  return (
    <div style={{
      display:     "flex",
      alignItems:  "center",
      gap:         S[3],
      margin:      `${S[8] + S[4]}px 0 ${S[8]}px`,
    }}>
      <div style={{ flex: 1, height: 1, background: C.lineSubtle }} />
      <span style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        color:         C.inkFaint,
        fontWeight:    600,
        textTransform: "uppercase" as const,
        letterSpacing: "0.12em",
        whiteSpace:    "nowrap" as const,
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: C.lineSubtle }} />
    </div>
  );
}

function BudgetCard({ budget, orgSlug }: { budget: BudgetActivo; orgSlug: string }) {
  const pct = Math.round((budget.ejecutado / budget.planeado) * 100);
  const col = ESTADO_COLOR[budget.estado];

  const isCritical = budget.estado === "en_riesgo" || budget.estado === "agotado";

  return (
    <div className="ag-op-row" style={{
      background:    C.white,
      border:        `1px solid ${isCritical ? `${col}40` : C.line}`,
      borderLeft:    `3px solid ${col}`,
      borderRadius:  R.md,
      boxShadow:     isCritical ? `${E.sm}, 0 0 0 1px ${col}18` : E.sm,
      overflow:      "hidden",
      display:       "flex",
      flexDirection: "column" as const,
      transition:    "box-shadow 0.2s ease",
      cursor:        "pointer",
    }}>
      {/* ── Header ── */}
      <div style={{
        padding:        `${S[2]}px ${S[3]}px`,
        borderBottom:   `1px solid ${C.lineSubtle}`,
        background:     isCritical ? `${col}05` : "transparent",
        display:        "flex",
        alignItems:     "flex-start",
        justifyContent: "space-between",
        gap:            S[2],
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.sm,
            fontWeight:   700,
            color:        C.ink,
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap" as const,
          }}>
            {budget.nombre}
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      C.inkFaint,
            marginTop:  2,
          }}>
            {budget.categoria} · {budget.dimension}
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            color:      C.inkFaint,
            marginTop:  3,
            opacity:    0.75,
          }}>
            activo desde {budget.periodoInicio} · {budget.revisionLabel}
          </div>
        </div>
        <span className={ESTADO_BADGE[budget.estado]} style={{ flexShrink: 0 }}>
          {ESTADO_LABEL[budget.estado]}
        </span>
      </div>

      {/* ── Progress bar ── */}
      <div style={{ padding: `${S[2]}px ${S[3]}px` }}>
        <div style={{
          display:        "flex",
          justifyContent: "space-between",
          alignItems:     "center",
          marginBottom:   5,
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            ejecutado vs. planeado
          </span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: col }}>
            {pct}%
          </span>
        </div>
        <div style={{ height: 8, background: C.lineSubtle, borderRadius: R.pill, overflow: "hidden" }}>
          <div style={{
            height:       "100%",
            width:        `${Math.min(pct, 100)}%`,
            background:   `linear-gradient(90deg,${col} 0%,${col}cc 100%)`,
            borderRadius: R.pill,
            transition:   "width 0.45s ease",
          }} />
        </div>
        {budget.comprometido > 0 && (
          <div style={{ textAlign: "right" as const, marginTop: 3 }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
              + {fmtShort(budget.comprometido)} comprometido
            </span>
          </div>
        )}
      </div>

      {/* ── 3 key metrics ── */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        padding:             `0 ${S[3]}px ${S[2]}px`,
        gap:                 0,
      }}>
        <div style={{ paddingRight: S[2], borderRight: `1px solid ${C.lineSubtle}` }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
            Planeado
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.inkMid, marginTop: 2 }}>
            {fmtShort(budget.planeado)}
          </div>
        </div>
        <div style={{ padding: `0 ${S[2]}px`, borderRight: `1px solid ${C.lineSubtle}` }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
            Ejecutado
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: col, marginTop: 2 }}>
            {fmtShort(budget.ejecutado)}
          </div>
        </div>
        <div style={{ paddingLeft: S[2] }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
            Disponible
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.inkMid, marginTop: 2 }}>
            {fmtShort(budget.disponible)}
          </div>
        </div>
      </div>

      {/* ── Bottom strip ── */}
      <div style={{
        marginTop:      "auto",
        borderTop:      `1px solid ${C.lineSubtle}`,
        padding:        `${S[2]}px ${S[3]}px`,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        background:     C.surface,
      }}>
        <div style={{ display: "flex", gap: S[3] }}>
          <div>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Vel. </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.inkMid }}>
              {fmtShort(budget.velocidadDiaria)}/día
            </span>
          </div>
          <div>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Cob. </span>
            <span style={{
              fontFamily: T.mono,
              fontSize:   T.sz.xs,
              fontWeight: 700,
              color:      budget.coberturaDias <= 7 ? C.red : budget.coberturaDias <= 14 ? C.amber : C.inkMid,
            }}>
              {budget.coberturaDias}d
            </span>
          </div>
        </div>
        <Link
          href={`/${orgSlug}/finanzas/planeacion/presupuestos/${budget.id}`}
          style={opActionBtn(C.blueDark)}
        >
          {getBudgetActionLabel(budget.estado)} →
        </Link>
      </div>
    </div>
  );
}

function SimulacionCard({ sim }: { sim: Simulacion }) {
  const col = SIM_ESTADO_COLOR[sim.estadoProyectado];

  return (
    <div style={{
      background:    C.white,
      border:        `1px solid ${C.line}`,
      borderRadius:  R.md,
      boxShadow:     E.sm,
      overflow:      "hidden",
      display:       "flex",
      flexDirection: "column" as const,
      transition:    "box-shadow 0.2s ease",
    }}>
      {/* Accent bar — lab identity */}
      <div style={{
        height:     4,
        background: `linear-gradient(90deg,${col} 0%,${col}50 100%)`,
      }} />

      {/* Content */}
      <div style={{
        padding:       `${S[4]}px ${S[3]}px`,
        flex:          1,
        display:       "flex",
        flexDirection: "column" as const,
        gap:           S[2],
        background:    `${C.surface}88`,
      }}>
        <div style={{
          fontFamily: T.mono,
          fontSize:   T.sz.sm,
          fontWeight: 700,
          color:      C.ink,
          lineHeight: 1.38,
        }}>
          {sim.titulo}
        </div>
        <div style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          color:      C.inkLight,
          lineHeight: 1.5,
        }}>
          {sim.descripcion}
        </div>

        {/* Impact */}
        <div style={{
          background:   `${col}09`,
          border:       `1px solid ${col}1E`,
          borderLeft:   `3px solid ${col}`,
          borderRadius: R.sm,
          padding:      `${S[1]+2}px ${S[2]+2}px`,
          marginTop:    S[1],
        }}>
          <div style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            color:         C.inkFaint,
            textTransform: "uppercase" as const,
            letterSpacing: "0.06em",
            marginBottom:  2,
          }}>
            Consecuencia estimada
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: col }}>
            {sim.impactoEstimado}
          </div>
        </div>

        <div style={{
          fontFamily: T.mono,
          fontSize:   T.sz["2xs"],
          color:      C.inkFaint,
          marginTop:  "auto" as const,
        }}>
          {sim.area}
        </div>

        {/* AI micro insight */}
        <div style={{
          display:     "flex",
          alignItems:  "flex-start",
          gap:         S[1]+2,
          marginTop:   S[2],
          padding:     `${S[1]+2}px ${S[2]}px`,
          background:  `${C.blueDark}06`,
          border:      `1px solid ${C.blueDark}12`,
          borderRadius: R.sm,
        }}>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            fontWeight:    800,
            color:         C.blueDark,
            letterSpacing: "0.04em",
            flexShrink:    0,
            lineHeight:    1.6,
          }}>AI</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, lineHeight: 1.5 }}>
            {sim.insightIA}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        borderTop:      `1px solid ${C.lineSubtle}`,
        padding:        `${S[2]}px ${S[3]}px`,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        background:     C.surface,
      }}>
        <span className={SIM_ESTADO_BADGE[sim.estadoProyectado]}>
          {SIM_ESTADO_LABEL[sim.estadoProyectado]}
        </span>
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz["2xs"],
          color:      C.inkFaint,
          fontStyle:  "italic",
        }}>
          próximamente
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function PlaneacionClient({
  orgSlug,
  enabledModules,
  budgets      = [],
  variance     = { rows: [], hasData: false },
  cashFlow,
  forecast:    _forecast,
  recommendations = [],
  cashConfidenceLevel  = "LOW",
  cashConfidenceReasons = [],
  hasBank      = false,
  hasBudgets   = false,
}: {
  orgSlug:               string;
  enabledModules:        string[];
  budgets?:              BudgetRow[];
  variance?:             { rows: VarianceRow[]; hasData: boolean };
  cashFlow?:             CashFlowSummary;
  forecast?:             RevenueForecast;
  recommendations?:      FpaRecommendation[];
  cashConfidenceLevel?:  "HIGH" | "MEDIUM" | "LOW";
  cashConfidenceReasons?: string[];
  hasBank?:              boolean;
  hasBudgets?:           boolean;
}) {
  // ── Existing state ─────────────────────────────────────────────────────────
  const [verDetalleEjecucion, setVerDetalleEjecucion] = useState(false);

  // ── Motor de Presupuestos — form state ─────────────────────────────────────
  const [motorTipo,      setMotorTipo]      = useState<string>("");
  const [motorArea,      setMotorArea]      = useState<string>("");
  const [motorEntidad,   setMotorEntidad]   = useState<string>("");
  const [motorMonto,     setMotorMonto]     = useState<string>("");
  const [motorPeriodo,   setMotorPeriodo]   = useState<string>("");
  const [motorTolIdx,    setMotorTolIdx]    = useState<number>(1);   // default 10%
  const [motorObjetivo,  setMotorObjetivo]  = useState<string>("");
  const [motorActivado,  setMotorActivado]  = useState<boolean>(false);

  // ── Presupuestos Activos — filter state ────────────────────────────────────
  const [filtroEstado,   setFiltroEstado]   = useState<BudgetEstado | "">("");
  const [filtroBusqueda, setFiltroBusqueda] = useState<string>("");

  // ── Real FPA data derivation ────────────────────────────────────────────────
  const daysElapsed    = new Date().getDate();
  const presupuestoTotal = budgets.reduce((s, b) => s + b.amount, 0);
  const ejecutadoTotal   = variance.rows.reduce((s, r) => s + r.actual, 0);
  const pctEjecutado     = presupuestoTotal > 0 ? Math.round((ejecutadoTotal / presupuestoTotal) * 100) : 0;

  // Map BudgetRow[] + VarianceRow[] → BudgetActivo[]
  const budgetsActivos: BudgetActivo[] = budgets.map((b) => {
    const vRow       = variance.rows.find(r => r.dimensionKey === b.dimensionKey && r.category === b.category);
    const ejecutado  = vRow?.actual ?? 0;
    const disponible = Math.max(0, b.amount - ejecutado);
    const varPct     = vRow?.variancePct ?? 0;
    const estado: BudgetEstado =
      ejecutado === 0           ? "subejecutado" :
      disponible < b.amount * 0.05 ? "agotado"  :
      disponible < b.amount * 0.15 ? "en_riesgo":
      varPct > 20               ? "sobre_ritmo" :
      varPct < -20              ? "subejecutado" : "activo";
    const velocidadDiaria = daysElapsed > 0 ? Math.round(ejecutado / daysElapsed) : 0;
    const coberturaDias   = velocidadDiaria > 0 ? Math.round(disponible / velocidadDiaria) : 0;
    return {
      id:                    b.id,
      nombre:                `${b.category} · ${b.dimensionLabel}`,
      categoria:             b.category,
      dimension:             b.dimensionLabel,
      estado,
      planeado:              b.amount,
      ejecutado,
      comprometido:          0,
      disponible,
      velocidadDiaria,
      indiceDesvio:          vRow ? Math.abs(varPct) / 100 + 1 : 1.0,
      proyeccionAgotamiento: coberturaDias > 0 ? `${coberturaDias} días` : "—",
      coberturaDias,
      periodoInicio:         `01 ene ${b.year}`,
      periodoFin:            `31 dic ${b.year}`,
      revisionLabel:         "FUENTE: SAG · Budget",
    };
  });

  const presupuestosEnRiesgo = budgetsActivos.filter(b => b.estado === "en_riesgo" || b.estado === "agotado").length;

  // Computed PLANEACION_STATUS from real data
  const planeacionStatus = {
    periodo:              `${new Date().getFullYear()} · Anual`,
    saludGlobal:          pctEjecutado,
    saludLabel:           pctEjecutado >= 70 ? "SALUDABLE" : pctEjecutado >= 40 ? "ESTABLE" : budgets.length === 0 ? "SIN DATOS" : "EN RIESGO",
    saludTendencia:       budgets.length > 0 ? "REAL · SAG" : "—",
    liquidezRunway:       cashFlow?.hasData && cashFlow.horizons.length > 0 ? 30 : 0,
    liquidezHasta:        cashFlow?.hasData ? "30 días (cartera)" : "—",
    riesgoGlobal:         presupuestosEnRiesgo > 0 ? "MODERADO" : budgets.length === 0 ? "SIN DATOS" : "BAJO",
    riesgoCriticos:       presupuestosEnRiesgo,
    tendenciaMargen:      "—",
    tendenciaLabel:       "datos SAG",
    presupuestoTotal,
    ejecutadoTotal,
    presupuestosActivos:  budgetsActivos.length,
    presupuestosEnRiesgo,
    lastUpdate:           "Calculado ahora",
  };

  // ── Cash confidence metadata ─────────────────────────────────────────────
  const confColor = cashConfidenceLevel === "HIGH"
    ? C.green
    : cashConfidenceLevel === "MEDIUM"
      ? C.amber
      : C.red;
  const confLabel = cashConfidenceLevel === "HIGH"
    ? "CONFIANZA ALTA"
    : cashConfidenceLevel === "MEDIUM"
      ? "CONFIANZA MEDIA"
      : "CONFIANZA BAJA";
  const confSources = [
    hasBank    && "banco",
    hasBudgets && "presupuestos",
    cashFlow?.hasData && "flujo caja",
  ].filter(Boolean).join(" · ") || "sin fuentes conectadas";

  // Map FpaRecommendation[] → Recomendacion[]
  const CAT_TO_TIPO: Record<string, RecTipo> = {
    budget: "alerta_presupuesto", cashflow: "proyeccion",
    growth: "oportunidad",        workforce: "velocidad",
  };
  const recomendaciones: Recomendacion[] = recommendations.map((r, i) => ({
    id:          r.id ?? `r${i}`,
    tipo:        CAT_TO_TIPO[r.category] ?? "proyeccion",
    prioridad:   r.severity === "critical" ? "critica" : r.severity === "warning" ? "alta" : "media",
    titulo:      r.title,
    descripcion: r.body,
    impacto:     r.metric ?? r.body,
    area:        r.category,
    accion:      "Revisar",
    confianza:   r.severity === "critical" ? 0.95 : r.severity === "warning" ? 0.85 : 0.70,
  }));

  // ── Derived: area options from enabled modules ──────────────────────────────
  const areaOptions = AREA_FROM_MODULE.filter((a) => enabledModules.includes(a.moduleKey));

  // ── Derived: entity options for selected area ───────────────────────────────
  const entidadOptions = motorArea ? (ENTIDADES_POR_AREA[motorArea] ?? []) : [];

  // ── Derived: systemic connections for selected area ─────────────────────────
  const conexionesActivas = [
    ...CONEXIONES_SIEMPRE,
    ...(motorArea ? (CONEXIONES_POR_AREA[motorArea] ?? []) : []),
  ];

  // ── Derived: can activate ───────────────────────────────────────────────────
  const canActivar = !!(motorTipo && motorArea && motorMonto.trim());

  // ── Derived: filtered presupuestos ─────────────────────────────────────────
  const budgetsFiltrados = budgetsActivos.filter((b) => {
    const matchEstado   = !filtroEstado   || b.estado === filtroEstado;
    const matchBusqueda = !filtroBusqueda || b.nombre.toLowerCase().includes(filtroBusqueda.toLowerCase());
    return matchEstado && matchBusqueda;
  });

  // ── Column header style (shared) ───────────────────────────────────────────
  const colHeaderStyle: CSSProperties = {
    fontFamily:    T.mono,
    fontSize:      T.sz["2xs"],
    color:         C.inkFaint,
    fontWeight:    700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };

  // ── Pill styles ─────────────────────────────────────────────────────────────
  const pillBase = (active: boolean, accentColor?: string): CSSProperties => ({
    fontFamily:   T.mono,
    fontSize:     T.sz.xs,
    fontWeight:   active ? 700 : 500,
    color:        active ? (accentColor ?? C.blueDark) : C.inkLight,
    background:   active ? `${accentColor ?? C.blueDark}12` : C.surface,
    border:       active ? `1px solid ${accentColor ?? C.blueDark}40` : `1px solid ${C.line}`,
    borderRadius: R.sm,
    padding:      `${S[1] + 1}px ${S[2] + 2}px`,
    cursor:       "pointer",
    whiteSpace:   "nowrap" as const,
    transition:   "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
  });

  // ── Input style ─────────────────────────────────────────────────────────────
  const inputStyle: CSSProperties = {
    fontFamily:   T.mono,
    fontSize:     T.sz.sm,
    color:        C.ink,
    background:   C.white,
    border:       `1px solid ${C.line}`,
    borderRadius: R.sm,
    padding:      `${S[1] + 2}px ${S[2] + 2}px`,
    width:        "100%",
    outline:      "none",
    boxSizing:    "border-box" as const,
  };

  const pctGlobal = Math.round(
    (planeacionStatus.ejecutadoTotal / planeacionStatus.presupuestoTotal) * 100,
  );

  return (
    <div style={{ padding: `${S[5]}px ${S[6]}px`, maxWidth: 960, margin: "0 auto" }}>

      {/* ── WORKSPACE HEADER ──────────────────────────────────────────────── */}
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Finanzas", href: `/${orgSlug}/executive` },
          { label: "Planeación Financiera" },
        ]}
        title="Planeación Financiera"
        subtitle={`Proyección · Presupuestos vivos · Simulaciones · ${planeacionStatus.periodo}`}
        status="warning"
        statusLabel={`${planeacionStatus.presupuestosEnRiesgo} presupuesto en riesgo`}
      />


      {/* ══════════════════════════════════════════════════════════════════════
          CAPA 1 — ESTADO ESTRATÉGICO
          ZONA 1 — PANORAMA FINANCIERO
          Primera lectura ejecutiva. Responde: ¿cómo se ve el futuro?
      ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: 0 }}>
        <PlanSectionHeader
          label="Panorama Financiero"
          meta={planeacionStatus.periodo}
          accent={C.blueDark}
        />

        <div style={{
          background:   C.white,
          border:       `1px solid ${C.line}`,
          borderRadius: R.md,
          boxShadow:    E.sm,
          overflow:     "hidden",
        }}>
          {/* KPI grid: health score (fixed) + 3 predictive metrics — no hard divider cells */}
          <div style={{
            display:             "grid",
            gridTemplateColumns: "minmax(148px,168px) 1fr 1fr 1fr",
          }}>

            {/* ── Salud Financiera — primary signal ── */}
            <div style={{
              padding:     `${S[5]}px ${S[4]}px`,
              background:  `${C.blueDark}06`,
              borderRight: `1px solid ${C.lineSubtle}`,
            }}>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xs"],
                color:         C.inkFaint,
                textTransform: "uppercase" as const,
                letterSpacing: "0.1em",
                marginBottom:  S[2],
              }}>
                Salud Financiera
              </div>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      "38px",
                fontWeight:    800,
                color:         C.blueDark,
                lineHeight:    1,
                letterSpacing: "-2px",
              }}>
                {planeacionStatus.saludGlobal}
              </div>
              <div style={{
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                color:      C.inkMid,
                fontWeight: 600,
                marginTop:  S[1],
              }}>
                / 100 · {planeacionStatus.saludLabel}
              </div>
              <div style={{
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                color:      C.inkFaint,
                marginTop:  S[2],
              }}>
                ↑ {planeacionStatus.saludTendencia}
              </div>
            </div>

            {/* ── Runway Financiero ── */}
            <div style={{ padding: `${S[4]}px ${S[4]}px`, borderRight: `1px solid ${C.lineSubtle}` }}>
              <div style={{ ...colHeaderStyle, marginBottom: S[2] }}>Cobertura Operacional</div>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      "28px",
                fontWeight:    800,
                color:         C.ink,
                lineHeight:    1,
                letterSpacing: "-1px",
              }}>
                {planeacionStatus.liquidezRunway}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginTop: S[1] }}>
                días cubiertos
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 4 }}>
                hasta {planeacionStatus.liquidezHasta}
              </div>
            </div>

            {/* ── Riesgo Proyectado — enterprise badge approach ── */}
            <div style={{ padding: `${S[4]}px ${S[4]}px`, borderRight: `1px solid ${C.lineSubtle}` }}>
              <div style={{ ...colHeaderStyle, marginBottom: S[2] }}>Riesgo Proyectado</div>
              <div style={{ marginBottom: S[1] }}>
                <span style={{
                  display:       "inline-flex",
                  alignItems:    "center",
                  gap:           6,
                  background:    `${C.amber}0D`,
                  border:        `1px solid ${C.amber}28`,
                  borderRadius:  R.sm,
                  padding:       `${S[1] + 1}px ${S[2] + 2}px`,
                  fontFamily:    T.mono,
                  fontSize:      T.sz.xs,
                  fontWeight:    700,
                  color:         C.amberDark,
                  letterSpacing: "0.05em",
                }}>
                  <span style={{
                    width:        7,
                    height:       7,
                    borderRadius: "50%",
                    background:   C.amber,
                    flexShrink:   0,
                  }} />
                  {planeacionStatus.riesgoGlobal}
                </span>
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[2] }}>
                {planeacionStatus.riesgoCriticos} presupuesto crítico
              </div>
            </div>

            {/* ── Tendencia de Margen ── */}
            <div style={{ padding: `${S[4]}px ${S[4]}px` }}>
              <div style={{ ...colHeaderStyle, marginBottom: S[2] }}>Tendencia de Margen</div>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      "28px",
                fontWeight:    800,
                color:         C.green,
                lineHeight:    1,
                letterSpacing: "-1px",
              }}>
                {planeacionStatus.tendenciaMargen}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginTop: S[1] }}>
                vs. Q1 2026
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 4 }}>
                {planeacionStatus.tendenciaLabel}
              </div>
            </div>
          </div>

          {/* Global execution progress bar */}
          <div style={{ borderTop: `1px solid ${C.lineSubtle}` }}>
            <div style={{ height: 4, background: C.surfaceAlt }}>
              <div style={{
                height:     "100%",
                width:      `${pctGlobal}%`,
                background: `linear-gradient(90deg,${C.blueDark} 0%,${C.blue} 100%)`,
                transition: "width 0.6s ease",
              }} />
            </div>
          </div>

          {/* ── Narrative bar — 4-column operational data strip ── */}
          <div style={{
            display:             "grid",
            gridTemplateColumns: "1fr 1px 1fr 1px 1fr 1px 1fr",
            background:          C.surface,
            alignItems:          "center",
          }}>
            {/* Ejecutado */}
            <div style={{ padding: `${S[2]+2}px ${S[4]}px` }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 3 }}>
                Ejecutado
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.inkMid }}>
                {fmtShort(planeacionStatus.ejecutadoTotal)}
              </div>
            </div>
            <div style={{ background: C.lineSubtle, alignSelf: "stretch" }} />
            {/* Total */}
            <div style={{ padding: `${S[2]+2}px ${S[4]}px` }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 3 }}>
                Total Q2
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.inkMid }}>
                {fmtShort(planeacionStatus.presupuestoTotal)}
              </div>
            </div>
            <div style={{ background: C.lineSubtle, alignSelf: "stretch" }} />
            {/* Cobertura */}
            <div style={{ padding: `${S[2]+2}px ${S[4]}px` }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 3 }}>
                Cobertura
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.inkMid }}>
                {planeacionStatus.liquidezRunway} días · {pctGlobal}% ejecutado
              </div>
            </div>
            <div style={{ background: C.lineSubtle, alignSelf: "stretch" }} />
            {/* ETA */}
            <div style={{
              padding:        `${S[2]+2}px ${S[4]}px`,
              display:        "flex",
              justifyContent: "space-between",
              alignItems:     "center",
            }}>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 3 }}>
                  Plazo estimado
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.inkMid }}>
                  {planeacionStatus.liquidezHasta}
                </div>
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, flexShrink: 0 }}>
                {planeacionStatus.lastUpdate}
              </div>
            </div>
          </div>

          {/* ── Confidence metadata strip ── */}
          <div style={{
            borderTop:   `1px solid ${C.lineSubtle}`,
            padding:     `${S[2]}px ${S[4]}px`,
            display:     "flex",
            alignItems:  "center",
            gap:         S[3],
            background:  C.surface,
          }}>
            <span style={{
              display:       "inline-flex",
              alignItems:    "center",
              gap:           5,
              background:    `${confColor}0D`,
              border:        `1px solid ${confColor}28`,
              borderRadius:  R.sm,
              padding:       `2px ${S[2]+1}px`,
              fontFamily:    T.mono,
              fontSize:      T.sz["2xs"],
              fontWeight:    700,
              color:         confColor,
              letterSpacing: "0.05em",
              flexShrink:    0,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: confColor, flexShrink: 0 }} />
              {confLabel}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
              {confSources}
            </span>
            {cashConfidenceReasons.length > 0 && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginLeft: "auto" }}>
                {cashConfidenceReasons[0]}
              </span>
            )}
          </div>
        </div>
      </section>

      <LayerDivider label="Motor presupuestario" />

      {/* ══════════════════════════════════════════════════════════════════════
          CAPA 2 — MOTOR PRESUPUESTARIO
          ZONA 2 — MOTOR DE PRESUPUESTOS
          Activación tenant-aware. Lee módulos activos → genera áreas dinámicas.
          Bloque 01: Formulario de creación (tipo · área · entidad · monto · período · tolerancia · objetivo)
          Bloque 02: Mapa de impacto sistémico (dinámico por área)
          Bloque 04: Copilot contextual intelligence strip
      ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: S[5] }}>
        <PlanSectionHeader
          label="Motor de Presupuestos"
          meta={`${areaOptions.length} áreas disponibles`}
          accent={C.blueDark}
        />

        {motorActivado ? (
          /* ── Confirmation state ── */
          <div style={{
            background:   `${C.green}09`,
            border:       `1px solid ${C.green}30`,
            borderLeft:   `3px solid ${C.green}`,
            borderRadius: R.md,
            padding:      `${S[5]}px ${S[5]}px`,
            display:      "flex",
            alignItems:   "center",
            justifyContent: "space-between",
            gap:          S[4],
          }}>
            <div>
              <div style={{
                fontFamily:  T.mono,
                fontSize:    T.sz.sm,
                fontWeight:  700,
                color:       C.green,
                marginBottom: S[1],
              }}>
                Monitoreo activado exitosamente
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                El presupuesto ha sido registrado y comenzará a recibir datos de los módulos conectados.
              </div>
            </div>
            <button
              onClick={() => {
                setMotorActivado(false);
                setMotorTipo(""); setMotorArea(""); setMotorEntidad("");
                setMotorMonto(""); setMotorPeriodo(""); setMotorObjetivo("");
                setMotorTolIdx(1);
              }}
              style={opActionBtn(C.green)}
            >
              Nuevo presupuesto →
            </button>
          </div>
        ) : (
          <>
            {/* ── Main 2-column layout: form + connections ── */}
            <div style={{
              display:             "grid",
              gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)",
              gap:                 S[4],
              marginBottom:        S[3],
            }}>

              {/* ────────────────────────────────────────────────
                  BLOQUE 01 — Formulario de activación
              ──────────────────────────────────────────────── */}
              <div style={{
                background:    C.white,
                border:        `1px solid ${C.line}`,
                borderRadius:  R.md,
                boxShadow:     E.sm,
                overflow:      "hidden",
              }}>
                <div style={{
                  padding:     `${S[3]}px ${S[4]}px`,
                  borderBottom: `1px solid ${C.lineSubtle}`,
                  background:  C.surface,
                }}>
                  <span style={{
                    fontFamily:    T.mono,
                    fontSize:      T.sz.xs,
                    fontWeight:    700,
                    color:         C.inkMid,
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.08em",
                  }}>
                    Activar presupuesto inteligente
                  </span>
                </div>

                <div style={{
                  padding: `${S[4]}px`,
                  display: "flex",
                  flexDirection: "column" as const,
                  gap: S[4],
                }}>

                  {/* Tipo de presupuesto */}
                  <div>
                    <div style={{
                      fontFamily:    T.mono,
                      fontSize:      T.sz["2xs"],
                      color:         C.inkFaint,
                      fontWeight:    700,
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.08em",
                      marginBottom:  S[1] + 2,
                    }}>
                      Tipo
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[1] + 2 }}>
                      {BUDGET_TIPOS.map((t) => (
                        <button
                          key={t.key}
                          onClick={() => setMotorTipo(t.key)}
                          style={pillBase(motorTipo === t.key)}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Área */}
                  <div>
                    <div style={{
                      fontFamily:    T.mono,
                      fontSize:      T.sz["2xs"],
                      color:         C.inkFaint,
                      fontWeight:    700,
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.08em",
                      marginBottom:  S[1] + 2,
                    }}>
                      Área
                    </div>
                    {areaOptions.length === 0 ? (
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, fontStyle: "italic" }}>
                        Sin módulos activos disponibles
                      </span>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[1] + 2 }}>
                        {areaOptions.map((a) => (
                          <button
                            key={a.area}
                            onClick={() => { setMotorArea(a.area); setMotorEntidad(""); }}
                            style={pillBase(motorArea === a.area, C.blueDark)}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Entidad (shown once area is selected) */}
                  {entidadOptions.length > 0 && (
                    <div>
                      <div style={{
                        fontFamily:    T.mono,
                        fontSize:      T.sz["2xs"],
                        color:         C.inkFaint,
                        fontWeight:    700,
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.08em",
                        marginBottom:  S[1] + 2,
                      }}>
                        Entidad
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[1] + 2 }}>
                        {entidadOptions.map((e) => (
                          <button
                            key={e}
                            onClick={() => setMotorEntidad(e)}
                            style={pillBase(motorEntidad === e, C.inkMid)}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Monto */}
                  <div>
                    <div style={{
                      fontFamily:    T.mono,
                      fontSize:      T.sz["2xs"],
                      color:         C.inkFaint,
                      fontWeight:    700,
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.08em",
                      marginBottom:  S[1] + 2,
                    }}>
                      Monto presupuestado
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: S[1] + 2 }}>
                      <span style={{
                        fontFamily: T.mono,
                        fontSize:   T.sz.sm,
                        fontWeight: 700,
                        color:      C.inkFaint,
                        flexShrink: 0,
                      }}>
                        $
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={motorMonto}
                        onChange={(e) => setMotorMonto(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {/* Período */}
                  <div>
                    <div style={{
                      fontFamily:    T.mono,
                      fontSize:      T.sz["2xs"],
                      color:         C.inkFaint,
                      fontWeight:    700,
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.08em",
                      marginBottom:  S[1] + 2,
                    }}>
                      Período
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[1] + 2 }}>
                      {PERIODOS.map((p) => (
                        <button
                          key={p.key}
                          onClick={() => setMotorPeriodo(p.key)}
                          style={pillBase(motorPeriodo === p.key)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tolerancia */}
                  <div>
                    <div style={{
                      display:     "flex",
                      alignItems:  "center",
                      gap:         S[2],
                      marginBottom: S[1] + 2,
                    }}>
                      <div style={{
                        fontFamily:    T.mono,
                        fontSize:      T.sz["2xs"],
                        color:         C.inkFaint,
                        fontWeight:    700,
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.08em",
                      }}>
                        Tolerancia
                      </div>
                      <span style={opBadge(C.blueDark)}>
                        {TOLERANCIAS[motorTolIdx]}%
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: S[1] + 2 }}>
                      {TOLERANCIAS.map((tol, idx) => (
                        <button
                          key={tol}
                          onClick={() => setMotorTolIdx(idx)}
                          style={pillBase(motorTolIdx === idx)}
                        >
                          {tol}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Objetivo */}
                  <div>
                    <div style={{
                      fontFamily:    T.mono,
                      fontSize:      T.sz["2xs"],
                      color:         C.inkFaint,
                      fontWeight:    700,
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.08em",
                      marginBottom:  S[1] + 2,
                    }}>
                      Objetivo (opcional)
                    </div>
                    <textarea
                      placeholder={motorArea
                        ? (OBJETIVO_PLACEHOLDERS[motorArea] ?? OBJETIVO_PLACEHOLDERS.default)
                        : OBJETIVO_PLACEHOLDERS.default}
                      value={motorObjetivo}
                      onChange={(e) => setMotorObjetivo(e.target.value)}
                      rows={2}
                      style={{
                        ...inputStyle,
                        resize:     "vertical" as const,
                        lineHeight: 1.5,
                      }}
                    />
                  </div>

                  {/* CTA */}
                  <div style={{ paddingTop: S[1] }}>
                    <button
                      onClick={() => canActivar && setMotorActivado(true)}
                      style={{
                        ...opActionBtn(canActivar ? C.blueDark : C.inkFaint),
                        width:     "100%",
                        height:    36,
                        fontSize:  T.sz.xs,
                        cursor:    canActivar ? "pointer" : "not-allowed",
                        opacity:   canActivar ? 1 : 0.5,
                      }}
                    >
                      Activar seguimiento operativo →
                    </button>
                    {!canActivar && (
                      <div style={{
                        fontFamily: T.mono,
                        fontSize:   T.sz["2xs"],
                        color:      C.inkFaint,
                        textAlign:  "center" as const,
                        marginTop:  S[1],
                      }}>
                        Completa tipo, área y monto para continuar
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ────────────────────────────────────────────────
                  BLOQUE 02 — Mapa de impacto sistémico
              ──────────────────────────────────────────────── */}
              <div style={{
                background:    C.white,
                border:        `1px solid ${C.line}`,
                borderRadius:  R.md,
                boxShadow:     E.sm,
                overflow:      "hidden",
                display:       "flex",
                flexDirection: "column" as const,
              }}>
                <div style={{
                  padding:      `${S[3]}px ${S[4]}px`,
                  borderBottom: `1px solid ${C.lineSubtle}`,
                  background:   C.surface,
                }}>
                  <span style={{
                    fontFamily:    T.mono,
                    fontSize:      T.sz.xs,
                    fontWeight:    700,
                    color:         C.inkMid,
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.08em",
                  }}>
                    Mapa de impacto
                  </span>
                </div>

                <div style={{ padding: `${S[3]}px ${S[3]}px`, flex: 1, display: "flex", flexDirection: "column" as const, gap: 0 }}>

                  {/* ── Node 1: Presupuesto ── */}
                  <div style={{
                    background:   `${C.blueDark}08`,
                    border:       `1px solid ${C.blueDark}24`,
                    borderLeft:   `3px solid ${C.blueDark}`,
                    borderRadius: R.sm,
                    padding:      `${S[2]}px ${S[3]}px`,
                    display:      "flex",
                    alignItems:   "center",
                    gap:          S[2],
                  }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.blueDark, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.blueDark }}>
                        {motorTipo
                          ? (BUDGET_TIPOS.find((t) => t.key === motorTipo)?.label ?? "Presupuesto")
                          : "Presupuesto"}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 }}>
                        {motorArea
                          ? `${areaOptions.find((a) => a.area === motorArea)?.label ?? motorArea}${motorMonto ? ` · $${motorMonto}` : ""}`
                          : "Origen de fondos"}
                      </div>
                    </div>
                  </div>

                  {/* Connector */}
                  <div style={{ display: "flex", justifyContent: "center", padding: `2px 0` }}>
                    <div style={{ width: 1, height: 14, background: `${C.blueDark}30`, borderLeft: `1px dashed ${C.blueDark}40` }} />
                  </div>

                  {/* ── Node 2: Módulos de origen ── */}
                  <div style={{
                    border:       `1px solid ${C.line}`,
                    borderRadius: R.sm,
                    overflow:     "hidden",
                  }}>
                    <div style={{
                      background: C.surface,
                      padding:    `${S[1]+1}px ${S[3]}px`,
                      borderBottom: `1px solid ${C.lineSubtle}`,
                    }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>
                        Alimentado por
                      </span>
                    </div>
                    {conexionesActivas.filter((_, i) => i < 4).map((con, i, arr) => (
                      <div key={con} style={{
                        display:      "flex",
                        alignItems:   "center",
                        gap:          S[2],
                        padding:      `${S[1]+2}px ${S[3]}px`,
                        borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                        background:   C.white,
                      }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: i < 2 ? C.blueDark : C.inkLight, flexShrink: 0 }} />
                        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 600, color: C.inkMid }}>{con}</span>
                        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginLeft: "auto" }}>
                          {i < 2 ? "alta" : "media"}
                        </span>
                      </div>
                    ))}
                    {!motorArea && (
                      <div style={{ padding: `${S[2]}px ${S[3]}px`, background: C.white }}>
                        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, fontStyle: "italic" }}>
                          Selecciona área para ver señales
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Connector */}
                  <div style={{ display: "flex", justifyContent: "center", padding: `2px 0` }}>
                    <div style={{ width: 1, height: 14, borderLeft: `1px dashed ${C.lineSubtle}` }} />
                  </div>

                  {/* ── Node 3: Downstream — Tesorería + Cierre ── */}
                  <div style={{
                    display:             "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap:                 S[1] + 1,
                  }}>
                    {[
                      { nombre: "Tesorería", color: C.amber, señal: "Flujo de caja" },
                      { nombre: "Cierre Q2",  color: C.red,   señal: "Resultado" },
                    ].map((node) => (
                      <div key={node.nombre} style={{
                        background:   `${node.color}06`,
                        border:       `1px solid ${node.color}20`,
                        borderTop:    `2px solid ${node.color}`,
                        borderRadius: R.sm,
                        padding:      `${S[1]+2}px ${S[2]+2}px`,
                      }}>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 700, color: node.color }}>{node.nombre}</div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 }}>{node.señal}</div>
                      </div>
                    ))}
                  </div>

                  {/* Connector */}
                  <div style={{ display: "flex", justifyContent: "center", padding: `2px 0` }}>
                    <div style={{ width: 1, height: 14, borderLeft: `1px dashed ${C.green}40` }} />
                  </div>

                  {/* ── Node 4: Agentik signals ── */}
                  <div style={{
                    background:   `${C.green}07`,
                    border:       `1px solid ${C.green}22`,
                    borderLeft:   `3px solid ${C.green}`,
                    borderRadius: R.sm,
                    padding:      `${S[2]}px ${S[3]}px`,
                    display:      "flex",
                    alignItems:   "center",
                    gap:          S[2],
                  }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.green, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.green }}>
                        {conexionesActivas.length} señales activas
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 }}>
                        Monitoreo · Alertas · Proyecciones
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div style={{
                  borderTop:  `1px solid ${C.lineSubtle}`,
                  padding:    `${S[2]}px ${S[4]}px`,
                  background: C.surface,
                }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                    Alimentación en tiempo real una vez activado
                  </span>
                </div>
              </div>
            </div>

          </>
        )}
      </section>

      <LayerDivider label="Ejecución presupuestal" />

      {/* ══════════════════════════════════════════════════════════════════════
          CAPA 3 — OPERACIÓN ACTIVA
          ZONA 3 — PRESUPUESTOS ACTIVOS
          Entidades vivas. Consumo · salud · velocidad · cobertura.
          BLOQUE 03: Filter bar — estado pills + búsqueda
      ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: S[8] }}>
        <PlanSectionHeader
          label="Presupuestos Activos"
          meta={`${budgetsFiltrados.length} de ${budgetsActivos.length} presupuestos · ${planeacionStatus.presupuestosEnRiesgo} en riesgo`}
          accent={C.blueDark}
        />

        {/* ── BLOQUE 03: Filter bar ── */}
        <div style={{
          display:        "flex",
          alignItems:     "center",
          gap:            S[3],
          marginBottom:   S[3],
          flexWrap:       "wrap" as const,
        }}>
          {/* Estado filter pills */}
          <div style={{ display: "flex", gap: S[1] + 2, flexWrap: "wrap" as const }}>
            <button
              onClick={() => setFiltroEstado("")}
              style={pillBase(!filtroEstado)}
            >
              Todos
            </button>
            {(["activo", "en_riesgo", "sobre_ritmo", "subejecutado", "agotado", "pausado"] as BudgetEstado[]).map((est) => (
              <button
                key={est}
                onClick={() => setFiltroEstado(est === filtroEstado ? "" : est)}
                style={pillBase(filtroEstado === est, ESTADO_COLOR[est])}
              >
                {ESTADO_LABEL[est]}
              </button>
            ))}
          </div>

          {/* Search input */}
          <div style={{ flex: 1, minWidth: 160, maxWidth: 240 }}>
            <input
              type="text"
              placeholder="Buscar presupuesto…"
              value={filtroBusqueda}
              onChange={(e) => setFiltroBusqueda(e.target.value)}
              style={{ ...inputStyle, fontSize: T.sz.xs }}
            />
          </div>
        </div>

        {budgetsFiltrados.length === 0 ? (
          <div style={{
            background:   C.surface,
            border:       `1px solid ${C.line}`,
            borderRadius: R.md,
            padding:      `${S[6]}px ${S[4]}px`,
            textAlign:    "center" as const,
          }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint }}>
              No hay presupuestos que coincidan con los filtros aplicados
            </span>
          </div>
        ) : (
          <div style={{
            display:             "grid",
            gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
            gap:                 S[3],
          }}>
            {budgetsFiltrados.map((b) => (
              <BudgetCard key={b.id} budget={b} orgSlug={orgSlug} />
            ))}
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          ZONA 4 — EJECUCIÓN VS. PLANEADO
          Monitor de desviaciones. Cada fila = unidad de monitoreo.
      ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: S[8] }}>
        <PlanSectionHeader
          label="Ejecución frente al Plan"
          meta="monitor de desviaciones"
          accent={C.amber}
        />

        <div style={{
          background:   C.white,
          border:       `1px solid ${C.line}`,
          borderRadius: R.md,
          boxShadow:    E.sm,
          overflow:     "hidden",
        }}>
          {/* Column headers */}
          <div style={{
            display:             "grid",
            gridTemplateColumns: "minmax(160px,1.2fr) 1fr 68px 120px",
            columnGap:           24,
            padding:             `${S[2]}px ${S[4]}px`,
            borderBottom:        `1px solid ${C.line}`,
            background:          C.surface,
          }}>
            {["Presupuesto", "Ejecución", "Desvío", "Estado"].map((h, hi) => (
              <span key={h} style={{
                ...colHeaderStyle,
                justifySelf: (hi >= 2 ? "center" : "start") as "center" | "start",
              }}>
                {h}
              </span>
            ))}
          </div>

          {/* Monitoring rows */}
          {budgetsActivos.map((b, i) => {
            const pct      = Math.round((b.ejecutado / b.planeado) * 100);
            const col      = ESTADO_COLOR[b.estado];
            const desvPct  = Math.round((b.indiceDesvio - 1) * 100);
            const desvSign = desvPct > 0 ? "+" : "";

            return (
              <div
                key={b.id}
                className="ag-op-row"
                style={{
                  display:             "grid",
                  gridTemplateColumns: "minmax(160px,1.2fr) 1fr 68px 120px",
                  columnGap:           24,
                  alignItems:          "center",
                  padding:             `${S[3] + 2}px ${S[4]}px`,
                  borderBottom:        i < budgetsActivos.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                  borderLeft:          `3px solid ${col}`,
                }}
              >
                {/* Name */}
                <div>
                  <div style={{
                    fontFamily:   T.mono,
                    fontSize:     T.sz.sm,
                    fontWeight:   600,
                    color:        C.ink,
                    overflow:     "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace:   "nowrap" as const,
                  }}>
                    {b.nombre}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                    {b.dimension} · hasta {b.periodoFin}
                  </div>
                </div>

                {/* Bar */}
                <div>
                  <div style={{
                    height:       10,
                    background:   C.lineSubtle,
                    borderRadius: R.pill,
                    overflow:     "hidden",
                    marginBottom: 5,
                  }}>
                    <div style={{
                      height:       "100%",
                      width:        `${Math.min(pct, 100)}%`,
                      background:   `linear-gradient(90deg,${col} 0%,${col}cc 100%)`,
                      borderRadius: R.pill,
                      transition:   "width 0.45s ease",
                    }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                      {fmtShort(b.ejecutado)}
                    </span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                      {fmtShort(b.planeado)} plan
                    </span>
                  </div>
                </div>

                {/* Deviation — prominent */}
                <div style={{ textAlign: "center" as const }}>
                  <span style={{
                    fontFamily:    T.mono,
                    fontSize:      T.sz.md,
                    fontWeight:    800,
                    color:         col,
                    letterSpacing: "-0.5px",
                  }}>
                    {desvSign}{desvPct}%
                  </span>
                </div>

                {/* Estado */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <span className={ESTADO_BADGE[b.estado]}>{ESTADO_LABEL[b.estado]}</span>
                </div>
              </div>
            );
          })}

          {/* Footer */}
          <div style={{
            padding:        `${S[2]}px ${S[4]}px`,
            background:     C.surface,
            borderTop:      `1px solid ${C.lineSubtle}`,
            display:        "flex",
            justifyContent: "space-between",
            alignItems:     "center",
            gap:            S[4],
          }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              Desvío: 0% = ritmo exacto · positivo = sobre ritmo · negativo = subejecutado
            </span>
            <button
              onClick={() => setVerDetalleEjecucion(!verDetalleEjecucion)}
              style={opActionBtn(C.inkLight)}
            >
              {verDetalleEjecucion ? "Contraer" : "Ver evolución →"}
            </button>
          </div>

          {verDetalleEjecucion && (
            <div style={{
              padding:    `${S[4]}px`,
              borderTop:  `1px solid ${C.line}`,
              background: C.surface,
              textAlign:  "center" as const,
            }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, fontStyle: "italic" }}>
                Vista detallada con períodos y ajustes — disponible en próxima versión
              </span>
            </div>
          )}
        </div>
      </section>

      <LayerDivider label="Escenarios y decisiones" />

      {/* ══════════════════════════════════════════════════════════════════════
          CAPA 4 — INTELIGENCIA ESTRATÉGICA
          ZONA 5 — SIMULACIONES Y ESCENARIOS
          Laboratorio estratégico. Proyecta el futuro posible.
      ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: S[8] }}>
        <PlanSectionHeader
          label="Simulaciones y Escenarios"
          meta="escenarios financieros"
          accent={C.blue}
        />

        <div style={{
          display:             "grid",
          gridTemplateColumns: "repeat(3,minmax(0,1fr))",
          gap:                 S[3],
          alignItems:          "stretch",
          marginBottom:        S[3],
        }}>
          {SIMULACIONES.map((sim) => (
            <SimulacionCard key={sim.id} sim={sim} />
          ))}
        </div>

        {/* Nueva simulación CTA */}
        <div style={{
          background:     C.white,
          border:         `1px solid ${C.blueDark}20`,
          borderLeft:     `3px solid ${C.blueDark}40`,
          borderRadius:   R.md,
          padding:        `${S[3]}px ${S[4]}px`,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          gap:            S[4],
        }}>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.inkMid, marginBottom: 2 }}>
              Crear escenario
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              {FINANCE_LANGUAGE.scenarioCreatorDesc}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: S[2], flexShrink: 0 }}>
            <span style={{ ...opBadge(C.inkFaint), opacity: 0.7, fontStyle: "italic" as const, textTransform: "none" as const, letterSpacing: 0, fontWeight: 400 }}>
              próximamente
            </span>
            <button style={{ ...opActionBtn(C.blueDark), opacity: 0.45, cursor: "not-allowed" }}>
              Crear escenario →
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          ZONA 6 — recomendaciones AGENTIK
          Centro de decisiones IA. Contextual · priorizado · accionable.
      ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: S[6] }}>
        <PlanSectionHeader
          label="Señales y decisiones Agentik"
          meta={`${recomendaciones.length} señales activas`}
          accent={C.green}
        />

        <div style={{
          background:   C.white,
          border:       `1px solid ${C.line}`,
          borderRadius: R.md,
          boxShadow:    E.sm,
          overflow:     "hidden",
        }}>
          {recomendaciones.map((rec, i) => {
            const col   = REC_PRIORIDAD_COLOR[rec.prioridad];
            const label = REC_PRIORIDAD_LABEL[rec.prioridad];

            return (
              <div
                key={rec.id}
                className="ag-op-row"
                style={{
                  display:             "grid",
                  gridTemplateColumns: "1fr 100px",
                  columnGap:           16,
                  alignItems:          "center",
                  padding:             `${S[3]}px ${S[4]}px`,
                  borderBottom:        i < recomendaciones.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                  borderLeft:          `3px solid ${col}`,
                }}
              >
                {/* ── Content column ── */}
                <div>
                  {/* Priority badge + title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 6 }}>
                    <span style={opBadge(col)}>{label}</span>
                    <span style={{
                      fontFamily:   T.mono,
                      fontSize:     T.sz.sm,
                      fontWeight:   700,
                      color:        C.ink,
                      overflow:     "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace:   "nowrap" as const,
                    }}>
                      {rec.titulo}
                    </span>
                  </div>

                  {/* Impact — hero element */}
                  <div style={{
                    fontFamily:  T.mono,
                    fontSize:    T.sz.xs,
                    fontWeight:  600,
                    color:       col,
                    marginBottom: 4,
                  }}>
                    {rec.impacto}
                  </div>

                  {/* Area + confidence — minimal footer */}
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                    {rec.area} · {Math.round(rec.confianza * 100)}% confianza
                  </div>
                </div>

                {/* ── Action column ── */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button style={opActionBtn(col)}>{rec.accion} →</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

    </div>
  );
}
