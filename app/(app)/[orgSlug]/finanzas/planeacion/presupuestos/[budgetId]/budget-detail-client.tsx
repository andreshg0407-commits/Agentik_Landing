"use client";

/**
 * BudgetDetailClient
 *
 * Vista operativa completa de un presupuesto vivo.
 * Responde: qué está pasando · por qué · qué módulos lo afectan ·
 *           qué riesgo tiene · qué puede ajustar · qué recomienda Agentik.
 *
 * Sprint: AGENTIK-FINANCE-BUDGET-DETAIL-01
 * All data: PLACEHOLDER — replace with real Prisma queries before ship.
 *
 * ── LAYOUT RULES (inherits from Planeación Financiera) ───────────────────────
 *  container: maxWidth 960 · padding S[5]×S[6] · margin 0 auto
 *  section headers: PlanSectionHeader (blue gradient + semantic left border)
 *  section gap: marginBottom S[8] · last section S[6]
 *  grids: CSS grid only — no flex for tabular rows
 *  rail-safe: all grids work at ~696px content width
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { CSSProperties }        from "react";
import { useState }                   from "react";
import Link                           from "next/link";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { C, T, S, R, E }             from "@/lib/ui/tokens";
import { opActionBtn }               from "@/lib/ui/op-table";
import { FINANCE_LANGUAGE }          from "@/lib/finance/language";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type BudgetEstado = "activo" | "en_riesgo" | "sobre_ritmo" | "subejecutado" | "agotado" | "pausado";

interface BudgetDetalle {
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
  velocidadEsperada:     number;
  indiceDesvio:          number;
  proyeccionAgotamiento: string;
  coberturaDias:         number;
  periodoInicio:         string;
  periodoFin:            string;
  tolerancia:            number;
  objetivo:              string;
  area:                  string;
  moduleKey:             string;
}

interface TimelineEvent {
  fecha:   string;
  label:   string;
  monto:   string;
  modulo:  string;
  tipo:    "inicio" | "gasto" | "positivo" | "ajuste" | "alerta" | "fin";
  pctPos:  number;
  above:   boolean;
}

interface BudgetEvento {
  fecha:   string;
  evento:  string;
  modulo:  string;
  impacto: string;
  estado:  "confirmado" | "positivo" | "pendiente" | "alerta";
}

interface ConexionModulo {
  nombre:    string;
  tipo:      "recibe" | "afecta";
  señal:     string;
  intensidad: "alta" | "media" | "baja";
}

interface SimulacionRapida {
  id:        string;
  titulo:    string;
  accion:    string;
  cta:       string;
  impacto:   string;
  cobertura: string;
  riesgo:    "bajo" | "medio" | "alto";
  insightIA: string;
}

interface AjusteDisponible {
  id:             string;
  accion:         string;
  descripcion:    string;
  impacto:        string;
  requiereAprob:  boolean;
  moduloAfectado: string;
  color:          string;
}

interface HistorialItem {
  fecha:  string;
  evento: string;
  actor:  string;
  detalle: string;
}

type AlertaTipo    = "riesgo" | "oportunidad" | "decision" | "dependencia";
type AlertaUrgencia = "alta" | "media" | "baja";

interface AlertaDecision {
  id:       string;
  tipo:     AlertaTipo;
  titulo:   string;
  accion:   string;
  urgencia: AlertaUrgencia;
}

interface ReasignacionDestino {
  id:              string;
  nombre:          string;
  area:            string;
  disponible:      number;
  impactoOrigen:   string;
  impactoDestino:  string;
  riesgo:          "bajo" | "medio" | "alto";
  previewCobertura: string;
  previewRiesgo:    string;
  previewLiquidez:  string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA — PLACEHOLDER: replace with real API/Prisma queries before ship
// ─────────────────────────────────────────────────────────────────────────────

const BUDGETS_MOCK: BudgetDetalle[] = [
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
    velocidadEsperada:     807_692,   // 42M / 52 días hábiles Q2
    indiceDesvio:          1.41,
    proyeccionAgotamiento: "19 may 2026",
    coberturaDias:         2,
    periodoInicio:         "01 abr 2026",
    periodoFin:            "30 jun 2026",
    tolerancia:            10,
    objetivo:              "Impulsar ventas de Línea Infantil con pauta digital en Meta y TikTok durante Q2.",
    area:                  "marketing",
    moduleKey:             "marketing_studio",
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
    velocidadEsperada:     912_500,
    indiceDesvio:          0.97,
    proyeccionAgotamiento: "22 jul 2026",
    coberturaDias:         38,
    periodoInicio:         "01 abr 2026",
    periodoFin:            "30 jun 2026",
    tolerancia:            15,
    objetivo:              "Cubrir costos operativos de Castillitos Norte durante Q2.",
    area:                  "comercial",
    moduleKey:             "sales",
  },
];

function getBudget(budgetId: string): BudgetDetalle {
  return BUDGETS_MOCK.find((b) => b.id === budgetId) ?? BUDGETS_MOCK[0];
}

// ── Timeline events (Marketing Digital Q2) ────────────────────────────────

const TIMELINE_EVENTS: TimelineEvent[] = [
  {
    fecha:  "01 abr",
    label:  "Inicio Q2",
    monto:  "$0",
    modulo: "Sistema",
    tipo:   "inicio",
    pctPos: 0,
    above:  true,
  },
  {
    fecha:  "08 abr",
    label:  "Campaña Meta activada",
    monto:  "+$4.2M",
    modulo: "Marketing Studio",
    tipo:   "gasto",
    pctPos: 8,
    above:  false,
  },
  {
    fecha:  "18 abr",
    label:  "Incremento pauta TikTok",
    monto:  "+$5.8M",
    modulo: "Marketing Studio",
    tipo:   "gasto",
    pctPos: 19,
    above:  true,
  },
  {
    fecha:  "05 may",
    label:  "Optimización CAC",
    monto:  "−$1.3M",
    modulo: "Marketing Studio",
    tipo:   "positivo",
    pctPos: 37,
    above:  false,
  },
  {
    fecha:  "12 may",
    label:  "Reasignación parcial",
    monto:  "+$2.4M",
    modulo: "Planeación",
    tipo:   "ajuste",
    pctPos: 45,
    above:  true,
  },
  {
    fecha:  "hoy",
    label:  "Alerta sobreconsumo",
    monto:  "$1.8M disp.",
    modulo: "Agentik",
    tipo:   "alerta",
    pctPos: 48,
    above:  false,
  },
  {
    fecha:  "30 jun",
    label:  "Fin período",
    monto:  "",
    modulo: "",
    tipo:   "fin",
    pctPos: 100,
    above:  true,
  },
];

// ── Budget eventos (event log) ─────────────────────────────────────────────

const BUDGET_EVENTOS: BudgetEvento[] = [
  {
    fecha:   "08 may 2026",
    evento:  "Campaña TikTok — activación pauta Línea Infantil",
    modulo:  "Marketing Studio",
    impacto: "+$4.2M",
    estado:  "confirmado",
  },
  {
    fecha:   "12 may 2026",
    evento:  "Ajuste de pauta Meta — extensión semana 2",
    modulo:  "Marketing Studio",
    impacto: "+$2.1M",
    estado:  "confirmado",
  },
  {
    fecha:   "14 may 2026",
    evento:  "Optimización CAC — reducción segmentos ineficientes",
    modulo:  "Marketing Studio",
    impacto: "−$1.3M",
    estado:  "positivo",
  },
  {
    fecha:   "15 may 2026",
    evento:  "Alerta automática — cobertura crítica detectada",
    modulo:  "Agentik",
    impacto: "2 días restantes",
    estado:  "alerta",
  },
  {
    fecha:   "15 may 2026",
    evento:  "Reasignación pendiente desde Campaña Redes Sociales",
    modulo:  "Planeación",
    impacto: "+$9.9M disponible",
    estado:  "pendiente",
  },
];

// ── Conexiones sistémicas ──────────────────────────────────────────────────

const CONEXIONES_RECIBE: ConexionModulo[] = [
  { nombre: "Marketing Studio",  tipo: "recibe", señal: "Activaciones y consumo de pauta", intensidad: "alta"  },
  { nombre: "Pipeline Comercial",tipo: "recibe", señal: "Conversiones asociadas a campañas",  intensidad: "media" },
  { nombre: "Centro Documental", tipo: "recibe", señal: "Facturas y órdenes de compra",       intensidad: "media" },
];

const CONEXIONES_AFECTA: ConexionModulo[] = [
  { nombre: "Tesorería Operativa", tipo: "afecta", señal: "Flujo de caja proyectado",           intensidad: "alta"  },
  { nombre: "Cierre Financiero",   tipo: "afecta", señal: "Resultado del período Q2",           intensidad: "alta"  },
  { nombre: "Simulaciones",        tipo: "afecta", señal: "Base para escenarios hipotéticos",   intensidad: "media" },
  { nombre: "Recomendaciones IA",  tipo: "afecta", señal: "Señales para lectura contextual",    intensidad: "media" },
];

// ── Simulaciones rápidas ───────────────────────────────────────────────────

const SIMULACIONES_RAPIDAS: SimulacionRapida[] = [
  {
    id:        "sr1",
    titulo:    "Aumentar inversión 20%",
    accion:    "+$8.4M al presupuesto",
    cta:       "Proyectar inversión",
    impacto:   "Cobertura +22 días · Cubre cierre Q2",
    cobertura: "50 días",
    riesgo:    "bajo",
    insightIA: "Agentik proyecta retorno positivo si el CAC se mantiene bajo 38% durante junio.",
  },
  {
    id:        "sr2",
    titulo:    "Reducir pauta 15%",
    accion:    "Recorte campañas activas",
    cta:       "Evaluar recorte",
    impacto:   "−$6.3M / mes · Riesgo en conversión",
    cobertura: "22 días",
    riesgo:    "medio",
    insightIA: "Agentik detecta riesgo en Línea Infantil si se recortan segmentos Meta activos.",
  },
  {
    id:        "sr3",
    titulo:    "Reasignar excedente Redes",
    accion:    "+$9.9M desde Campaña Redes",
    cta:       "Reasignar excedente",
    impacto:   "Cubre déficit sin nuevo capital",
    cobertura: "12 días extra",
    riesgo:    "bajo",
    insightIA: "Agentik confirma que Campaña Redes tiene $9.9M subutilizados sin afectar metas.",
  },
  {
    id:        "sr4",
    titulo:    "Extender cobertura a jun 30",
    accion:    "+$14M para cubrir todo Q2",
    cta:       "Proyectar cobertura",
    impacto:   "Cierre completo · ROI máximo",
    cobertura: "46 días",
    riesgo:    "bajo",
    insightIA: "Agentik proyecta cierre completo Q2 con ROI estimado de 2.4x si la pauta se mantiene.",
  },
];

// ── Ajustes disponibles ────────────────────────────────────────────────────

const AJUSTES_DISPONIBLES: AjusteDisponible[] = [
  {
    id:             "a1",
    accion:         "Aumentar presupuesto",
    descripcion:    "Ampliar el techo del presupuesto para extender la cobertura del período.",
    impacto:        "Amplía cobertura operacional · Sin efecto en liquidez",
    requiereAprob:  false,
    moduloAfectado: "Tesorería Operativa",
    color:          C.blueDark,
  },
  {
    id:             "a2",
    accion:         "Reducir inversión",
    descripcion:    "Recortar el monto activo para liberar liquidez hacia otras áreas.",
    impacto:        "Libera capital · Puede afectar alcance de campañas",
    requiereAprob:  false,
    moduloAfectado: "Cierre Financiero",
    color:          C.amber,
  },
  {
    id:             "a3",
    accion:         "Pausar monitoreo",
    descripcion:    "Desactivar alertas automáticas y el motor de seguimiento.",
    impacto:        "Detiene alertas · Agentik no emitirá señales",
    requiereAprob:  false,
    moduloAfectado: "Agentik",
    color:          C.inkLight,
  },
  {
    id:             "a4",
    accion:         "Cambiar tolerancia",
    descripcion:    "Ajustar el umbral de desvío a partir del cual se emiten alertas.",
    impacto:        "Calibra sensibilidad · Afecta frecuencia de alertas",
    requiereAprob:  false,
    moduloAfectado: "Motor de Presupuestos",
    color:          C.blue,
  },
  {
    id:             "a5",
    accion:         "Reasignar a otra área",
    descripcion:    "Transferir fondos disponibles a un presupuesto de otra área operativa.",
    impacto:        "Redistribuye capital · Actualiza múltiples presupuestos",
    requiereAprob:  true,
    moduloAfectado: "Planeación Financiera",
    color:          C.green,
  },
  {
    id:             "a6",
    accion:         "Cerrar presupuesto",
    descripcion:    "Finalizar el ciclo antes del período y liberar los fondos no utilizados.",
    impacto:        "Cierra ciclo · Los fondos disponibles retornan a Tesorería",
    requiereAprob:  true,
    moduloAfectado: "Cierre Financiero",
    color:          C.red,
  },
];

// ── Historial ──────────────────────────────────────────────────────────────

const HISTORIAL: HistorialItem[] = [
  {
    fecha:   "13 abr 2026",
    evento:  "Presupuesto creado",
    actor:   "Sistema",
    detalle: "Motor de Presupuestos activado · $42.0M · Q2 2026 · Tolerancia 10%",
  },
  {
    fecha:   "18 abr 2026",
    evento:  "Tolerancia ajustada",
    actor:   "Administrador",
    detalle: "Umbral ajustado de 10% → 15% para campañas activas de pauta",
  },
  {
    fecha:   "30 abr 2026",
    evento:  "Alerta automática emitida",
    actor:   "Agentik",
    detalle: "Velocidad de consumo +18% sobre ritmo esperado — nivel ATENCIÓN",
  },
  {
    fecha:   "05 may 2026",
    evento:  "Recomendación tomada",
    actor:   "Administrador",
    detalle: "Aplicada optimización CAC recomendada · Ahorro $1.3M registrado",
  },
  {
    fecha:   "12 may 2026",
    evento:  "Reasignación parcial aprobada",
    actor:   "Administrador",
    detalle: "+$2.4M desde Campaña Redes Sociales (b4) · Cobertura extendida 2 días",
  },
  {
    fecha:   "15 may 2026",
    evento:  "Alerta crítica emitida",
    actor:   "Agentik",
    detalle: "Cobertura: 2 días · Velocidad 31% sobre ritmo · Nivel CRÍTICO activado",
  },
];

// ── Alertas y decisiones ──────────────────────────────────────────────────

const ALERTAS_DECISIONES: AlertaDecision[] = [
  {
    id:       "ad1",
    tipo:     "riesgo",
    titulo:   "Agotamiento en 2 días",
    accion:   "Recalibrar ahora",
    urgencia: "alta",
  },
  {
    id:       "ad2",
    tipo:     "oportunidad",
    titulo:   "$9.9M disponibles en Redes Sociales",
    accion:   "Reasignar recursos",
    urgencia: "media",
  },
  {
    id:       "ad3",
    tipo:     "decision",
    titulo:   "Reasignación pendiente de aprobación",
    accion:   "Revisar decisión",
    urgencia: "media",
  },
  {
    id:       "ad4",
    tipo:     "dependencia",
    titulo:   "Tesorería afectada — flujo proyectado",
    accion:   "Ver flujo de caja",
    urgencia: "alta",
  },
];

const ALERTA_TIPO_COLOR: Record<AlertaTipo, string> = {
  riesgo:      C.red,
  oportunidad: C.green,
  decision:    C.blueDark,
  dependencia: C.amber,
};

const ALERTA_TIPO_LABEL: Record<AlertaTipo, string> = {
  riesgo:      "Riesgo",
  oportunidad: "Oportunidad",
  decision:    "Decisión",
  dependencia: "Dependencia",
};

// ── Reasignación presupuestaria ────────────────────────────────────────────

const REASIGNACION_DESTINOS: ReasignacionDestino[] = [
  {
    id:              "rd1",
    nombre:          "Inventario Línea Premium",
    area:            "Logística",
    disponible:      41_000_000,
    impactoOrigen:   "Reduce cobertura digital −8 días",
    impactoDestino:  "Extiende cobertura logística +12 días",
    riesgo:          "bajo",
    previewCobertura: "2d → 10d",
    previewRiesgo:    "Crítico → Moderado",
    previewLiquidez:  "+8%",
  },
  {
    id:              "rd2",
    nombre:          "Operaciones Tienda Norte",
    area:            "Operaciones",
    disponible:      36_100_000,
    impactoOrigen:   "Reduce alcance en Línea Infantil",
    impactoDestino:  "Amplía margen operativo Q2",
    riesgo:          "medio",
    previewCobertura: "2d → 6d",
    previewRiesgo:    "Crítico → Alto",
    previewLiquidez:  "+5%",
  },
  {
    id:              "rd3",
    nombre:          "Campaña Redes Sociales",
    area:            "Marketing",
    disponible:      9_900_000,
    impactoOrigen:   "Reduce CAC proyectado −4%",
    impactoDestino:  "Cubre déficit sin capital nuevo",
    riesgo:          "bajo",
    previewCobertura: "2d → 14d",
    previewRiesgo:    "Crítico → Moderado",
    previewLiquidez:  "+12%",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmtShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

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

const ESTADO_LABEL: Record<BudgetEstado, string> = {
  en_riesgo:    "En riesgo",
  sobre_ritmo:  "Sobre ritmo",
  subejecutado: "Subejecutado",
  activo:       "En ritmo",
  agotado:      "Agotado",
  pausado:      "Pausado",
};

const ESTADO_BADGE: Record<BudgetEstado, string> = {
  en_riesgo:    "ag-op-status ag-op-status--critical",
  sobre_ritmo:  "ag-op-status ag-op-status--warning",
  subejecutado: "ag-op-status ag-op-status--neutral",
  activo:       "ag-op-status ag-op-status--ok",
  agotado:      "ag-op-status ag-op-status--critical",
  pausado:      "ag-op-status ag-op-status--neutral",
};

const EVENTO_ESTADO_COLOR: Record<BudgetEvento["estado"], string> = {
  confirmado: C.inkMid,
  positivo:   C.green,
  pendiente:  C.amber,
  alerta:     C.red,
};

const EVENTO_BADGE_CLASS: Record<BudgetEvento["estado"], string> = {
  confirmado: "ag-op-status ag-op-status--neutral",
  positivo:   "ag-op-status ag-op-status--ok",
  pendiente:  "ag-op-status ag-op-status--warning",
  alerta:     "ag-op-status ag-op-status--critical",
};

const EVENTO_LABEL: Record<BudgetEvento["estado"], string> = {
  confirmado: "Confirmado",
  positivo:   "Positivo",
  pendiente:  "Pendiente",
  alerta:     "Alerta",
};

const TIMELINE_COLOR: Record<TimelineEvent["tipo"], string> = {
  inicio:   C.blueDark,
  gasto:    C.red,
  positivo: C.green,
  ajuste:   C.amber,
  alerta:   C.red,
  fin:      C.inkFaint,
};

const SIM_RIESGO_COLOR: Record<SimulacionRapida["riesgo"], string> = {
  bajo:  C.green,
  medio: C.amber,
  alto:  C.red,
};

const INTENSIDAD_DOT: Record<ConexionModulo["intensidad"], string> = {
  alta:  C.blueDark,
  media: C.blue,
  baja:  C.inkLight,
};

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

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
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          · {meta}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function BudgetDetailClient({
  orgSlug,
  budgetId,
}: {
  orgSlug:  string;
  budgetId: string;
}) {
  const budget = getBudget(budgetId);
  const col    = ESTADO_COLOR[budget.estado];
  const pct    = Math.round((budget.ejecutado / budget.planeado) * 100);
  const desvPct = Math.round((budget.indiceDesvio - 1) * 100);
  const desvSign = desvPct > 0 ? "+" : "";

  const [historialExpanded,   setHistorialExpanded]   = useState(false);
  const [selectedDestino,     setSelectedDestino]     = useState<string>("");
  const [montoReasignacion,   setMontoReasignacion]   = useState<string>("");

  const colHeaderStyle: CSSProperties = {
    fontFamily:    T.mono,
    fontSize:      T.sz["2xs"],
    color:         C.inkFaint,
    fontWeight:    700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };

  return (
    <div style={{ padding: `${S[5]}px ${S[6]}px`, maxWidth: 960, margin: "0 auto" }}>

      {/* ══════════════════════════════════════════════════════════════════════
          TASK 02 — HEADER EJECUTIVO
      ══════════════════════════════════════════════════════════════════════ */}
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Finanzas",              href: `/${orgSlug}/executive`               },
          { label: "Planeación Financiera", href: `/${orgSlug}/finanzas/planeacion`     },
          { label: budget.nombre                                                         },
        ]}
        title={budget.nombre}
        subtitle={`${budget.categoria} · ${budget.dimension} · ${budget.periodoInicio} – ${budget.periodoFin}`}
        status={budget.estado === "en_riesgo" || budget.estado === "agotado" ? "critical"
              : budget.estado === "sobre_ritmo"                              ? "warning"
              : budget.estado === "activo"                                   ? "ok"
              :                                                                "neutral"}
        statusLabel={ESTADO_LABEL[budget.estado]}
        contextualBackHref={`/${orgSlug}/finanzas/planeacion`}
        contextualBackLabel="Planeación Financiera"
      />

      {/* ── Executive KPI strip ────────────────────────────────────────────── */}
      <div style={{
        background:   C.white,
        border:       `1px solid ${C.line}`,
        borderLeft:   `3px solid ${col}`,
        borderRadius: R.md,
        boxShadow:    E.sm,
        overflow:     "hidden",
        marginBottom: S[8],
      }}>
        {/* Top row: large numbers + actions */}
        <div style={{
          display:             "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr auto",
          columnGap:           0,
          borderBottom:        `1px solid ${C.lineSubtle}`,
        }}>
          {/* Planeado */}
          <div style={{ padding: `${S[4]}px ${S[4]}px`, borderRight: `1px solid ${C.lineSubtle}` }}>
            <div style={{ ...colHeaderStyle, marginBottom: S[1] + 2 }}>Presupuesto</div>
            <div style={{ fontFamily: T.mono, fontSize: "22px", fontWeight: 800, color: C.ink, lineHeight: 1, letterSpacing: "-1px" }}>
              {fmtShort(budget.planeado)}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[1] }}>
              {budget.periodoInicio} – {budget.periodoFin}
            </div>
          </div>

          {/* Ejecutado */}
          <div style={{ padding: `${S[4]}px ${S[4]}px`, borderRight: `1px solid ${C.lineSubtle}` }}>
            <div style={{ ...colHeaderStyle, marginBottom: S[1] + 2 }}>Ejecutado</div>
            <div style={{ fontFamily: T.mono, fontSize: "22px", fontWeight: 800, color: col, lineHeight: 1, letterSpacing: "-1px" }}>
              {fmtShort(budget.ejecutado)}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[1] }}>
              {pct}% del presupuesto
            </div>
          </div>

          {/* Disponible */}
          <div style={{ padding: `${S[4]}px ${S[4]}px`, borderRight: `1px solid ${C.lineSubtle}` }}>
            <div style={{ ...colHeaderStyle, marginBottom: S[1] + 2 }}>Disponible</div>
            <div style={{
              fontFamily: T.mono, fontSize: "22px", fontWeight: 800,
              color: budget.disponible <= 5_000_000 ? C.red : C.inkMid,
              lineHeight: 1, letterSpacing: "-1px",
            }}>
              {fmtShort(budget.disponible)}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[1] }}>
              {budget.coberturaDias} días de cobertura
            </div>
          </div>

          {/* Estado + desvío */}
          <div style={{ padding: `${S[4]}px ${S[4]}px`, borderRight: `1px solid ${C.lineSubtle}` }}>
            <div style={{ ...colHeaderStyle, marginBottom: S[1] + 2 }}>Estado</div>
            <span className={ESTADO_BADGE[budget.estado]}>{ESTADO_LABEL[budget.estado]}</span>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: col, marginTop: S[2], fontWeight: 700 }}>
              Desvío {desvSign}{desvPct}%
            </div>
          </div>

          {/* Actions */}
          <div style={{
            padding:       `${S[4]}px ${S[4]}px`,
            display:       "flex",
            flexDirection: "column" as const,
            gap:           S[2],
            justifyContent:"center",
          }}>
            <button style={{ ...opActionBtn(C.blueDark), minWidth: 148 }}>
              Recalibrar presupuesto →
            </button>
            <button style={{ ...opActionBtn(C.inkLight), minWidth: 148 }}>
              Proyectar escenario →
            </button>
          </div>
        </div>

        {/* Execution bar + objective strip */}
        <div style={{ padding: `${S[3]}px ${S[4]}px`, background: C.surface }}>
          {/* Bar */}
          <div style={{ display: "flex", alignItems: "center", gap: S[3], marginBottom: S[2] }}>
            <div style={{ flex: 1, height: 8, background: C.lineSubtle, borderRadius: R.pill, overflow: "hidden" }}>
              <div style={{
                height:     "100%",
                width:      `${Math.min(pct, 100)}%`,
                background: `linear-gradient(90deg,${col} 0%,${col}cc 100%)`,
                borderRadius: R.pill,
                transition: "width 0.5s ease",
              }} />
            </div>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: col, flexShrink: 0 }}>
              {pct}% ejecutado
            </span>
            {budget.comprometido > 0 && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, flexShrink: 0 }}>
                + {fmtShort(budget.comprometido)} comprometido
              </span>
            )}
          </div>
          {/* Objetivo */}
          {budget.objetivo && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: S[2] }}>
              <span style={{ ...colHeaderStyle, flexShrink: 0, marginTop: 1 }}>Objetivo</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>{budget.objetivo}</span>
            </div>
          )}
        </div>

        {/* Velocidad · Riesgo proyectado · Próxima decisión */}
        <div style={{
          borderTop:           `1px solid ${C.lineSubtle}`,
          display:             "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          background:          C.surface,
        }}>
          <div style={{ padding: `${S[2]+2}px ${S[4]}px`, borderRight: `1px solid ${C.lineSubtle}` }}>
            <div style={{ ...colHeaderStyle, marginBottom: 3 }}>Velocidad actual</div>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: col }}>
              {fmtShort(budget.velocidadDiaria)}/día
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginLeft: S[2] }}>
              vs. {fmtShort(budget.velocidadEsperada)} esperado
            </span>
          </div>
          <div style={{ padding: `${S[2]+2}px ${S[4]}px`, borderRight: `1px solid ${C.lineSubtle}` }}>
            <div style={{ ...colHeaderStyle, marginBottom: 4 }}>Riesgo proyectado</div>
            <span className={
              budget.estado === "en_riesgo" || budget.estado === "agotado"
                ? "ag-op-status ag-op-status--critical"
                : budget.estado === "sobre_ritmo"
                  ? "ag-op-status ag-op-status--warning"
                  : "ag-op-status ag-op-status--ok"
            }>
              {budget.estado === "en_riesgo" || budget.estado === "agotado"
                ? "Crítico"
                : budget.estado === "sobre_ritmo"
                  ? "Moderado"
                  : "Controlado"}
            </span>
          </div>
          <div style={{ padding: `${S[2]+2}px ${S[4]}px` }}>
            <div style={{ ...colHeaderStyle, marginBottom: 3 }}>Próxima decisión</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: col, lineHeight: 1.35 }}>
              {budget.coberturaDias <= 2
                ? "Reasignar o ampliar hoy"
                : budget.coberturaDias <= 7
                  ? "Revisar antes del cierre de semana"
                  : "Monitoreo activo — sin acción urgente"}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ALERTAS Y DECISIONES — capa de atención contextual
          Señales activas · riesgos · oportunidades · decisiones pendientes
      ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: S[5] }}>
        <PlanSectionHeader
          label="Alertas y decisiones"
          meta={`${ALERTAS_DECISIONES.length} activas`}
          accent={C.red}
        />
        <div style={{
          display:             "grid",
          gridTemplateColumns: "repeat(4,minmax(0,1fr))",
          gap:                 S[2],
        }}>
          {ALERTAS_DECISIONES.map((al) => {
            const alCol      = ALERTA_TIPO_COLOR[al.tipo];
            const isRisk      = al.tipo === "riesgo";
            const isOpport    = al.tipo === "oportunidad";
            const borderWidth = isRisk ? "2px" : "1px";
            const borderColor = isRisk
              ? `${alCol}50`
              : isOpport
                ? C.line
                : `${alCol}20`;
            const bgColor = isRisk
              ? `${alCol}05`
              : C.white;
            const shadow = isRisk
              ? `0 0 0 1px ${alCol}18, 0 2px 8px ${alCol}10, ${E.sm}`
              : isOpport
                ? E.sm
                : E.sm;
            return (
              <div
                key={al.id}
                className="ag-op-row"
                style={{
                  background:    bgColor,
                  border:        `${borderWidth} solid ${borderColor}`,
                  borderLeft:    `3px solid ${alCol}`,
                  borderRadius:  R.md,
                  padding:       `${S[3]}px ${S[3]}px`,
                  display:       "flex",
                  flexDirection: "column" as const,
                  gap:           S[1] + 2,
                  transition:    "box-shadow 0.18s ease",
                  boxShadow:     shadow,
                  opacity:       isOpport ? 0.92 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: S[1] }}>
                  <span style={opBadge(alCol)}>{ALERTA_TIPO_LABEL[al.tipo]}</span>
                  {isRisk && (
                    <span style={{
                      width:        7, height: 7,
                      borderRadius: "50%",
                      background:   alCol,
                      flexShrink:   0,
                      boxShadow:    `0 0 0 3px ${alCol}30`,
                    }} />
                  )}
                </div>
                <div style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  fontWeight: 600,
                  color:      C.ink,
                  lineHeight: 1.35,
                  flex:       1,
                }}>
                  {al.titulo}
                </div>
                <button style={{ ...opActionBtn(alCol), width: "100%", justifyContent: "center" as const }}>
                  {al.accion} →
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          TASK 03 — ESTADO VIVO DEL PRESUPUESTO
      ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: S[8] }}>
        <PlanSectionHeader label="Estado del presupuesto" meta="ritmo · velocidad · proyección" accent={col} />

        {/* Critical callout */}
        <div style={{
          background:   `${col}08`,
          border:       `1px solid ${col}20`,
          borderLeft:   `3px solid ${col}`,
          borderRadius: R.md,
          padding:      `${S[3] + 2}px ${S[4]}px`,
          marginBottom: S[3],
          display:      "flex",
          alignItems:   "center",
          gap:          S[3],
        }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: col }}>
              A esta velocidad, el presupuesto se agota el {budget.proyeccionAgotamiento}.
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
              {" "}Quedan {budget.coberturaDias} días de cobertura.
            </span>
          </div>
          <span style={opBadge(col)}>
            {desvSign}{desvPct}% desvío
          </span>
        </div>

        {/* Metrics grid */}
        <div style={{
          background:   C.white,
          border:       `1px solid ${C.line}`,
          borderRadius: R.md,
          boxShadow:    E.sm,
          overflow:     "hidden",
        }}>
          <div style={{
            display:             "grid",
            gridTemplateColumns: "1fr 1px 1fr 1px 1fr 1px 1fr",
          }}>
            {/* Velocidad diaria */}
            <div style={{ padding: `${S[4]}px ${S[4]}px` }}>
              <div style={{ ...colHeaderStyle, marginBottom: S[2] }}>Velocidad diaria</div>
              <div style={{ fontFamily: T.mono, fontSize: "24px", fontWeight: 800, color: col, lineHeight: 1, letterSpacing: "-1px" }}>
                {fmtShort(budget.velocidadDiaria)}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[1] }}>
                por día
              </div>
            </div>
            <div style={{ background: C.lineSubtle }} />

            {/* Ritmo esperado */}
            <div style={{ padding: `${S[4]}px ${S[4]}px` }}>
              <div style={{ ...colHeaderStyle, marginBottom: S[2] }}>Ritmo esperado</div>
              <div style={{ fontFamily: T.mono, fontSize: "24px", fontWeight: 800, color: C.inkMid, lineHeight: 1, letterSpacing: "-1px" }}>
                {fmtShort(budget.velocidadEsperada)}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[1] }}>
                por día (plan)
              </div>
            </div>
            <div style={{ background: C.lineSubtle }} />

            {/* Proyección de agotamiento */}
            <div style={{ padding: `${S[4]}px ${S[4]}px` }}>
              <div style={{ ...colHeaderStyle, marginBottom: S[2] }}>Agotamiento proyectado</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: 800, color: col, lineHeight: 1.2 }}>
                {budget.proyeccionAgotamiento}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[1] }}>
                {budget.coberturaDias} días restantes
              </div>
            </div>
            <div style={{ background: C.lineSubtle }} />

            {/* Fin del período */}
            <div style={{ padding: `${S[4]}px ${S[4]}px` }}>
              <div style={{ ...colHeaderStyle, marginBottom: S[2] }}>Fin del período</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: 800, color: C.inkMid, lineHeight: 1.2 }}>
                {budget.periodoFin}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[1] }}>
                cierre Q2 2026
              </div>
            </div>
          </div>

          {/* Risk strip */}
          <div style={{
            borderTop:      `1px solid ${C.lineSubtle}`,
            padding:        `${S[2] + 2}px ${S[4]}px`,
            background:     C.surface,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            gap:            S[4],
          }}>
            <div style={{ display: "flex", gap: S[5] }}>
              <div>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Comprometido </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.amber }}>
                  {fmtShort(budget.comprometido)}
                </span>
              </div>
              <div>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Tolerancia </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.inkMid }}>
                  {budget.tolerancia}%
                </span>
              </div>
              <div>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Desvío real </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: col }}>
                  {desvSign}{desvPct}%
                </span>
              </div>
            </div>
            <span style={{
              fontFamily:    T.mono,
              fontSize:      T.sz["2xs"],
              color:         budget.indiceDesvio > 1 + budget.tolerancia / 100 ? C.red : C.green,
              fontWeight:    700,
              textTransform: "uppercase" as const,
              letterSpacing: "0.07em",
            }}>
              {budget.indiceDesvio > 1 + budget.tolerancia / 100
                ? "Fuera de tolerancia"
                : "Dentro de tolerancia"}
            </span>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          TASK 04 — TIMELINE DE CONSUMO
      ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: S[8] }}>
        <PlanSectionHeader label="Evolución del consumo" meta="Q2 2026 · abr–jun" accent={C.blueDark} />

        <div style={{
          background:   C.white,
          border:       `1px solid ${C.line}`,
          borderRadius: R.md,
          boxShadow:    E.sm,
          padding:      `${S[3]}px ${S[4]}px ${S[4]}px`,
          overflow:     "hidden",
        }}>
          {/* Month labels */}
          <div style={{
            display:             "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            marginBottom:        S[2],
          }}>
            {["Abril 2026", "Mayo 2026", "Junio 2026"].map((m) => (
              <div key={m} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textAlign: "center" as const }}>
                {m}
              </div>
            ))}
          </div>

          {/* Timeline track */}
          <div style={{ position: "relative", height: 140, userSelect: "none" as const }}>

            {/* Base line */}
            <div style={{
              position:     "absolute",
              top:          "50%",
              left:         S[2],
              right:        S[2],
              height:       2,
              background:   C.lineSubtle,
              borderRadius: R.pill,
              transform:    "translateY(-50%)",
            }} />

            {/* Progress line (consumed portion up to ~48% = today) */}
            <div style={{
              position:     "absolute",
              top:          "50%",
              left:         S[2],
              width:        `calc(48% - ${S[2]}px)`,
              height:       2,
              background:   `linear-gradient(90deg, ${C.blueDark} 0%, ${col} 100%)`,
              borderRadius: R.pill,
              transform:    "translateY(-50%)",
            }} />

            {/* Events */}
            {TIMELINE_EVENTS.map((ev, i) => {
              const evCol  = TIMELINE_COLOR[ev.tipo];
              const leftPct = ev.pctPos;

              return (
                <div
                  key={i}
                  style={{
                    position:  "absolute",
                    left:      `${leftPct}%`,
                    top:       "50%",
                    transform: "translate(-50%, -50%)",
                    zIndex:    2,
                  }}
                >
                  {/* Dot */}
                  <div style={{
                    width:        ev.tipo === "alerta" ? 14 : 10,
                    height:       ev.tipo === "alerta" ? 14 : 10,
                    borderRadius: "50%",
                    background:   evCol,
                    border:       `2px solid ${C.white}`,
                    boxShadow:    `0 0 0 1px ${evCol}`,
                    position:     "relative",
                    zIndex:       3,
                  }} />

                  {/* Label above */}
                  {ev.above && (
                    <div style={{
                      position:   "absolute",
                      bottom:     "calc(100% + 10px)",
                      left:       "50%",
                      transform:  "translateX(-50%)",
                      textAlign:  "center" as const,
                      width:      90,
                    }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 700, color: evCol, lineHeight: 1.3 }}>
                        {ev.label}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                        {ev.fecha}
                      </div>
                      {ev.monto && (
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 700, color: evCol }}>
                          {ev.monto}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Label below */}
                  {!ev.above && (
                    <div style={{
                      position:  "absolute",
                      top:       "calc(100% + 10px)",
                      left:      "50%",
                      transform: "translateX(-50%)",
                      textAlign: "center" as const,
                      width:     90,
                    }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 700, color: evCol, lineHeight: 1.3 }}>
                        {ev.label}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                        {ev.fecha}
                      </div>
                      {ev.monto && (
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 700, color: evCol }}>
                          {ev.monto}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{
            borderTop:   `1px solid ${C.lineSubtle}`,
            paddingTop:  S[2],
            display:     "flex",
            gap:         S[4],
            flexWrap:    "wrap" as const,
          }}>
            {[
              { color: C.blueDark, label: "Período" },
              { color: C.red,      label: "Gasto / Alerta" },
              { color: C.green,    label: "Ahorro" },
              { color: C.amber,    label: "Ajuste" },
            ].map((leg) => (
              <div key={leg.label} style={{ display: "flex", alignItems: "center", gap: S[1] + 2 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: leg.color }} />
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                  {leg.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          TASK 05 — EVENTOS DEL PRESUPUESTO
      ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: S[8] }}>
        <PlanSectionHeader
          label="Eventos del presupuesto"
          meta={`${BUDGET_EVENTOS.length} eventos registrados`}
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
            gridTemplateColumns: "84px minmax(0,1.6fr) 120px 80px 100px",
            columnGap:           16,
            padding:             `${S[2]}px ${S[4]}px`,
            borderBottom:        `1px solid ${C.line}`,
            background:          C.surface,
          }}>
            {["Fecha", "Evento", "Módulo", "Impacto", "Estado"].map((h, hi) => (
              <span key={h} style={{
                ...colHeaderStyle,
                justifySelf: (hi >= 3 ? "center" : "start") as "center" | "start",
              }}>
                {h}
              </span>
            ))}
          </div>

          {BUDGET_EVENTOS.map((ev, i) => {
            const evCol = EVENTO_ESTADO_COLOR[ev.estado];
            return (
              <div
                key={i}
                className="ag-op-row"
                style={{
                  display:             "grid",
                  gridTemplateColumns: "84px minmax(0,1.6fr) 120px 80px 100px",
                  columnGap:           16,
                  alignItems:          "center",
                  padding:             `${S[3]}px ${S[4]}px`,
                  borderBottom:        i < BUDGET_EVENTOS.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                  borderLeft:          `3px solid ${evCol}`,
                }}
              >
                {/* Fecha */}
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                  {ev.fecha}
                </span>

                {/* Evento */}
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    {ev.evento}
                  </div>
                </div>

                {/* Módulo */}
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                  {ev.modulo}
                </span>

                {/* Impacto */}
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: evCol, justifySelf: "center" as const }}>
                  {ev.impacto}
                </span>

                {/* Estado */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <span className={EVENTO_BADGE_CLASS[ev.estado]}>{EVENTO_LABEL[ev.estado]}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          TASK 06 — CONEXIONES SISTÉMICAS
      ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: S[8] }}>
        <PlanSectionHeader label="Conexiones del presupuesto" meta="módulos alimentados" accent={C.blue} />

        <div style={{
          display:             "grid",
          gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)",
          gap:                 S[3],
          alignItems:          "start",
        }}>
          {/* Left: feeds */}
          <div style={{
            background:   C.white,
            border:       `1px solid ${C.line}`,
            borderRadius: R.md,
            overflow:     "hidden",
          }}>
            <div style={{
              padding:      `${S[2] + 2}px ${S[3]}px`,
              borderBottom: `1px solid ${C.lineSubtle}`,
              background:   C.surface,
            }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>
                Recibe señales de
              </span>
            </div>
            <div style={{ padding: `${S[2]}px 0` }}>
              {CONEXIONES_RECIBE.map((c) => (
                <div key={c.nombre} style={{
                  display:     "flex",
                  alignItems:  "flex-start",
                  gap:         S[2],
                  padding:     `${S[2] + 1}px ${S[3]}px`,
                }}>
                  <div style={{
                    flexShrink:   0,
                    marginTop:    3,
                    width:        8,
                    height:       8,
                    borderRadius: "50%",
                    background:   INTENSIDAD_DOT[c.intensidad],
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.inkMid }}>
                      {c.nombre}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2, lineHeight: 1.4 }}>
                      {c.señal}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Center: budget hub */}
          <div style={{
            display:        "flex",
            flexDirection:  "column" as const,
            alignItems:     "center",
            justifyContent: "center",
            gap:            S[1],
            paddingTop:     S[3],
          }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>→</div>
            <div style={{
              background:   `${C.blueDark}0A`,
              border:       `2px solid ${C.blueDark}30`,
              borderRadius: R.md,
              padding:      `${S[3]}px ${S[3]}px`,
              textAlign:    "center" as const,
              minWidth:     100,
            }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 800, color: C.blueDark, textTransform: "uppercase" as const, letterSpacing: "0.07em", lineHeight: 1.4 }}>
                {budget.nombre}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 4 }}>
                {fmtShort(budget.planeado)} · Q2
              </div>
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>→</div>
          </div>

          {/* Right: affects */}
          <div style={{
            background:   C.white,
            border:       `1px solid ${C.line}`,
            borderRadius: R.md,
            overflow:     "hidden",
          }}>
            <div style={{
              padding:      `${S[2] + 2}px ${S[3]}px`,
              borderBottom: `1px solid ${C.lineSubtle}`,
              background:   C.surface,
            }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>
                Afecta a
              </span>
            </div>
            <div style={{ padding: `${S[2]}px 0` }}>
              {CONEXIONES_AFECTA.map((c) => (
                <div key={c.nombre} style={{
                  display:    "flex",
                  alignItems: "flex-start",
                  gap:        S[2],
                  padding:    `${S[2] + 1}px ${S[3]}px`,
                }}>
                  <div style={{
                    flexShrink:   0,
                    marginTop:    3,
                    width:        8,
                    height:       8,
                    borderRadius: "50%",
                    background:   INTENSIDAD_DOT[c.intensidad],
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.inkMid }}>
                      {c.nombre}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2, lineHeight: 1.4 }}>
                      {c.señal}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          TASK 07 — LECTURA AGENTIK (IA CONTEXTUAL)
      ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: S[8] }}>
        <PlanSectionHeader label="Lectura Agentik" meta="inteligencia contextual" accent={C.green} />

        <div style={{
          background:   C.white,
          border:       `1px solid ${C.line}`,
          borderLeft:   `3px solid ${C.red}`,
          borderRadius: R.md,
          boxShadow:    E.sm,
          overflow:     "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding:        `${S[3]}px ${S[4]}px`,
            borderBottom:   `1px solid ${C.lineSubtle}`,
            background:     `${C.red}06`,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            gap:            S[3],
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <div style={{
                width:         28, height: 28,
                borderRadius:  R.sm,
                background:    `${C.blueDark}14`,
                border:        `1px solid ${C.blueDark}28`,
                display:       "flex",
                alignItems:    "center",
                justifyContent:"center",
                flexShrink:    0,
              }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 800, color: C.blueDark }}>
                  AI
                </span>
              </div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.inkMid, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                Lectura Agentik
              </span>
            </div>
            <span style={opBadge(C.red)}>Crítica</span>
          </div>

          {/* Main finding */}
          <div style={{ padding: `${S[4]}px ${S[4]}px ${S[3]}px` }}>
            <p style={{
              fontFamily:  T.mono,
              fontSize:    T.sz.sm,
              color:       C.inkMid,
              lineHeight:  1.6,
              margin:      0,
              marginBottom: S[4],
            }}>
              Agentik detectó que <strong style={{ color: C.ink }}>Marketing Digital Q2</strong> se está
              consumiendo <strong style={{ color: C.red }}>31% más rápido</strong> que el ritmo esperado.
              Si no se ajusta, el presupuesto se agotará antes del cierre del período y reducirá la
              capacidad de pauta para Línea Infantil.
            </p>

            {/* 3 signal rows */}
            {[
              {
                label: "Detectó",
                text:  "Velocidad de consumo $1.06M/día vs. ritmo esperado $0.81M/día — desviación acumulada del 31%.",
                color: C.red,
              },
              {
                label: "Importa",
                text:  "El presupuesto se agota el 19 mayo, 42 días antes del cierre de Q2. Riesgo de paralización de campañas activas.",
                color: C.amber,
              },
              {
                label: "Sin acción",
                text:  "Paralización de pauta en semana 3 de mayo. Pérdida de alcance en Línea Infantil en período de mayor tráfico.",
                color: C.inkLight,
              },
            ].map((row) => (
              <div key={row.label} style={{
                display:      "grid",
                gridTemplateColumns: "72px 1fr",
                columnGap:    S[3],
                alignItems:   "flex-start",
                marginBottom: S[2],
              }}>
                <span style={opBadge(row.color)}>{row.label}</span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.5 }}>
                  {row.text}
                </span>
              </div>
            ))}
          </div>

          {/* Recommendation block */}
          <div style={{
            margin:       `0 ${S[4]}px`,
            marginBottom: S[3],
            padding:      `${S[3]}px ${S[3]}px`,
            background:   `${C.blueDark}07`,
            border:       `1px solid ${C.blueDark}18`,
            borderLeft:   `3px solid ${C.blueDark}`,
            borderRadius: R.sm,
          }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 700, color: C.blueDark, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: S[1] + 2 }}>
              Recomendación
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, lineHeight: 1.55 }}>
              Reasigna <strong style={{ color: C.blueDark }}>$9.9M</strong> desde Campaña Redes Sociales
              (presupuesto b4, actualmente subutilizado al 22%) para cubrir el déficit proyectado y
              extender la cobertura hasta el cierre de Q2.
            </div>
          </div>

          {/* CTAs */}
          <div style={{
            padding:        `${S[3]}px ${S[4]}px`,
            borderTop:      `1px solid ${C.lineSubtle}`,
            background:     C.surface,
            display:        "flex",
            gap:            S[2],
          }}>
            <button style={opActionBtn(C.blueDark)}>Abrir escenario →</button>
            <button style={opActionBtn(C.green)}>Reasignar recursos →</button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          TASK 08 — SIMULACIONES RÁPIDAS
      ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: S[8] }}>
        <PlanSectionHeader label="Escenarios sobre este presupuesto" meta="4 escenarios disponibles" accent={C.blue} />

        <div style={{
          display:             "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
          gap:                 S[3],
        }}>
          {SIMULACIONES_RAPIDAS.map((sim) => {
            const rCol = SIM_RIESGO_COLOR[sim.riesgo];
            return (
              <div
                key={sim.id}
                className="ag-op-row"
                style={{
                  background:    C.white,
                  border:        `1px solid ${C.line}`,
                  borderRadius:  R.md,
                  overflow:      "hidden",
                  transition:    "box-shadow 0.2s ease",
                }}
              >
                {/* Accent top bar */}
                <div style={{ height: 3, background: `linear-gradient(90deg, ${rCol} 0%, ${rCol}60 100%)` }} />
                <div style={{ padding: `${S[3]}px ${S[3]}px` }}>
                  {/* Title */}
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink, marginBottom: S[1] + 2 }}>
                    {sim.titulo}
                  </div>
                  {/* Action */}
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginBottom: S[2] }}>
                    {sim.accion}
                  </div>

                  {/* Impact callout */}
                  <div style={{
                    background:   `${C.blueDark}07`,
                    border:       `1px solid ${C.blueDark}18`,
                    borderRadius: R.sm,
                    padding:      `${S[1] + 2}px ${S[2]}px`,
                    marginBottom: S[2],
                  }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: 2 }}>
                      {FINANCE_LANGUAGE.impactEstimated}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.inkMid }}>
                      {sim.impacto}
                    </div>
                  </div>

                  {/* AI micro insight */}
                  <div style={{
                    display:     "flex",
                    alignItems:  "flex-start",
                    gap:         S[1]+2,
                    padding:     `${S[1]+2}px ${S[2]}px`,
                    background:  `${C.blueDark}05`,
                    border:      `1px solid ${C.blueDark}10`,
                    borderRadius: R.sm,
                  }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 800, color: C.blueDark, flexShrink: 0, lineHeight: 1.6 }}>AI</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, lineHeight: 1.5 }}>
                      {sim.insightIA}
                    </span>
                  </div>

                  {/* Footer row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: S[2] }}>
                    <div style={{ display: "flex", alignItems: "center", gap: S[1] + 2 }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Cob. </span>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.inkMid }}>
                        {sim.cobertura}
                      </span>
                      <span style={opBadge(rCol)}>{sim.riesgo}</span>
                    </div>
                    <button style={opActionBtn(rCol)}>{sim.cta} →</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          REASIGNACIÓN PRESUPUESTARIA
          Mover fondos entre áreas activas del tenant.
      ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: S[8] }}>
        <PlanSectionHeader
          label="Reasignación presupuestaria"
          meta="mover fondos entre áreas activas"
          accent={C.green}
        />

        <div style={{
          background:   C.white,
          border:       `1px solid ${C.line}`,
          borderRadius: R.md,
          boxShadow:    E.sm,
          overflow:     "hidden",
        }}>
          {/* Origen node */}
          <div style={{
            padding:     `${S[3]}px ${S[4]}px`,
            borderBottom:`1px solid ${C.lineSubtle}`,
            background:  C.surface,
            display:     "flex",
            alignItems:  "center",
            gap:         S[3],
          }}>
            <div style={{
              background:   `${col}0A`,
              border:       `1px solid ${col}28`,
              borderLeft:   `3px solid ${col}`,
              borderRadius: R.sm,
              padding:      `${S[2]}px ${S[3]}px`,
              flex:         1,
            }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 2 }}>
                Origen
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: col }}>
                {budget.nombre}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
                {fmtShort(budget.disponible)} disponibles · {budget.coberturaDias} días cobertura
              </div>
            </div>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.md, color: C.inkFaint, flexShrink: 0 }}>→</span>
            <div style={{
              background:   `${C.green}07`,
              border:       `1px dashed ${C.green}30`,
              borderRadius: R.sm,
              padding:      `${S[2]}px ${S[3]}px`,
              flex:         1,
              minHeight:    52,
              display:      "flex",
              alignItems:   "center",
            }}>
              {selectedDestino ? (() => {
                const dest = REASIGNACION_DESTINOS.find((d) => d.id === selectedDestino);
                if (!dest) return null;
                return (
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 2 }}>
                      Destino
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.green }}>
                      {dest.nombre}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
                      {dest.area} · {fmtShort(dest.disponible)} disponibles
                    </div>
                  </div>
                );
              })() : (
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, fontStyle: "italic" }}>
                  Selecciona destino →
                </span>
              )}
            </div>
          </div>

          {/* Destino selection grid */}
          <div style={{ padding: `${S[3]}px ${S[4]}px` }}>
            <div style={{ ...{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em" }, marginBottom: S[2] }}>
              Áreas disponibles para recibir fondos
            </div>
            <div style={{
              display:             "grid",
              gridTemplateColumns: "repeat(3,minmax(0,1fr))",
              gap:                 S[2],
              marginBottom:        S[3],
            }}>
              {REASIGNACION_DESTINOS.map((dest) => {
                const rCol    = SIM_RIESGO_COLOR[dest.riesgo];
                const isActive = selectedDestino === dest.id;
                return (
                  <div
                    key={dest.id}
                    className="ag-op-row"
                    onClick={() => setSelectedDestino(isActive ? "" : dest.id)}
                    style={{
                      background:   isActive ? `${C.green}08` : C.white,
                      border:       isActive ? `1px solid ${C.green}40` : `1px solid ${C.line}`,
                      borderLeft:   `3px solid ${rCol}`,
                      borderRadius: R.md,
                      padding:      `${S[2]+2}px ${S[3]}px`,
                      cursor:       "pointer",
                      transition:   "background 0.15s ease, border-color 0.15s ease",
                    }}
                  >
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.ink, marginBottom: 2 }}>
                      {dest.nombre}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: S[1]+2 }}>
                      {dest.area} · {fmtShort(dest.disponible)} disp.
                    </div>
                    <span style={opBadge(rCol)}>{dest.riesgo}</span>
                  </div>
                );
              })}
            </div>

            {/* Monto + consecuencias */}
            {selectedDestino && (() => {
              const dest = REASIGNACION_DESTINOS.find((d) => d.id === selectedDestino);
              if (!dest) return null;
              return (
                <div style={{
                  background:   `${C.surface}`,
                  border:       `1px solid ${C.line}`,
                  borderLeft:   `3px solid ${C.green}`,
                  borderRadius: R.md,
                  padding:      `${S[3]}px ${S[4]}px`,
                }}>
                  {/* ── Preview dinámico ── */}
                  <div style={{
                    display:             "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap:                 S[2],
                    marginBottom:        S[3],
                    padding:             `${S[2]+2}px ${S[3]}px`,
                    background:          `${C.blueDark}04`,
                    border:              `1px solid ${C.blueDark}10`,
                    borderRadius:        R.sm,
                  }}>
                    {[
                      { label: "Cobertura",    valor: dest.previewCobertura, color: C.green  },
                      { label: "Riesgo",        valor: dest.previewRiesgo,    color: C.amber  },
                      { label: "Liquidez proy.", valor: dest.previewLiquidez,  color: C.blue   },
                    ].map((row) => (
                      <div key={row.label}>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: 2 }}>
                          {row.label}
                        </div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: row.color }}>
                          {row.valor}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", alignItems: "flex-end", gap: S[3], marginBottom: S[3] }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: S[1]+2 }}>
                        Monto a reasignar
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: S[1]+2 }}>
                        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.inkFaint, flexShrink: 0 }}>$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="0"
                          value={montoReasignacion}
                          onChange={(e) => setMontoReasignacion(e.target.value)}
                          style={{
                            fontFamily:  T.mono,
                            fontSize:    T.sz.sm,
                            color:       C.ink,
                            background:  C.white,
                            border:      `1px solid ${C.line}`,
                            borderRadius: R.sm,
                            padding:     `${S[1]+2}px ${S[2]+2}px`,
                            width:       "100%",
                            outline:     "none",
                            boxSizing:   "border-box" as const,
                          }}
                        />
                      </div>
                    </div>
                    <button
                      style={{
                        ...opActionBtn(C.green),
                        height:  36,
                        opacity: montoReasignacion.trim() ? 1 : 0.4,
                        cursor:  montoReasignacion.trim() ? "pointer" : "not-allowed",
                      }}
                    >
                      Confirmar reasignación →
                    </button>
                  </div>

                  {/* Consecuencias */}
                  <div style={{
                    display:             "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap:                 S[2],
                  }}>
                    <div style={{
                      background:   `${col}07`,
                      border:       `1px solid ${col}1A`,
                      borderRadius: R.sm,
                      padding:      `${S[2]}px ${S[3]}px`,
                    }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: 3 }}>
                        Efecto en origen
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: col }}>
                        {dest.impactoOrigen}
                      </div>
                    </div>
                    <div style={{
                      background:   `${C.green}07`,
                      border:       `1px solid ${C.green}1A`,
                      borderRadius: R.sm,
                      padding:      `${S[2]}px ${S[3]}px`,
                    }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: 3 }}>
                        Efecto en destino
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.green }}>
                        {dest.impactoDestino}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          TASK 09 — AJUSTES DISPONIBLES
      ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: S[8] }}>
        <PlanSectionHeader label="Recalibrar presupuesto" meta="ajustes sobre estrategia financiera" accent={C.amber} />

        <div style={{
          display:             "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
          gap:                 S[3],
        }}>
          {AJUSTES_DISPONIBLES.map((aj) => (
            <div
              key={aj.id}
              className="ag-op-row"
              style={{
                background:    C.white,
                border:        `1px solid ${C.line}`,
                borderLeft:    `3px solid ${aj.color}`,
                borderRadius:  R.md,
                overflow:      "hidden",
                transition:    "box-shadow 0.2s ease",
                display:       "flex",
                flexDirection: "column" as const,
              }}
            >
              <div style={{ padding: `${S[3]}px ${S[3]}px`, flex: 1 }}>
                {/* Header: title + aprobación */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: S[2], marginBottom: S[1] + 2 }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink }}>
                    {aj.accion}
                  </div>
                  {aj.requiereAprob && (
                    <span style={opBadge(C.amber)}>Aprobación</span>
                  )}
                </div>

                {/* Description */}
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginBottom: S[2], lineHeight: 1.5 }}>
                  {aj.descripcion}
                </div>

                {/* Impact + module */}
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[1] + 2 }}>
                  {aj.impacto}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: S[1] + 2 }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Módulo</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.inkMid }}>
                    {aj.moduloAfectado}
                  </span>
                </div>
              </div>

              {/* Action strip */}
              <div style={{
                borderTop:      `1px solid ${C.lineSubtle}`,
                padding:        `${S[2]}px ${S[3]}px`,
                background:     C.surface,
                display:        "flex",
                justifyContent: "flex-end",
              }}>
                <button style={opActionBtn(aj.color)}>{aj.accion} →</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          TASK 10 — HISTORIAL Y TRAZABILIDAD (collapsible)
      ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: S[6] }}>
        {/* Section header doubles as toggle */}
        <div
          onClick={() => setHistorialExpanded(!historialExpanded)}
          style={{ cursor: "pointer" }}
        >
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:          S[2],
            minHeight:    32,
            marginBottom: historialExpanded ? S[5] : 0,
            padding:      `${S[1] + 2}px ${S[3]}px`,
            background:   "linear-gradient(180deg,rgba(37,99,235,0.042) 0%,rgba(37,99,235,0.016) 100%)",
            border:       "1px solid rgba(37,99,235,0.08)",
            borderLeft:   `3px solid ${C.inkLight}`,
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
              Historial del presupuesto
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              · {HISTORIAL.length} entradas
            </span>
            <span style={{
              marginLeft:  "auto",
              fontFamily:  T.mono,
              fontSize:    T.sz.xs,
              color:       C.inkFaint,
              fontWeight:  700,
            }}>
              {historialExpanded ? "▲ Contraer" : "▼ Expandir"}
            </span>
          </div>
        </div>

        {historialExpanded && (
          <div style={{
            background:   C.white,
            border:       `1px solid ${C.line}`,
            borderRadius: R.md,
            boxShadow:    E.sm,
            overflow:     "hidden",
          }}>
            {HISTORIAL.map((item, i) => (
              <div
                key={i}
                className="ag-op-row"
                style={{
                  display:      "grid",
                  gridTemplateColumns: "100px minmax(0,1fr) 100px",
                  columnGap:    16,
                  alignItems:   "flex-start",
                  padding:      `${S[3]}px ${S[4]}px`,
                  borderBottom: i < HISTORIAL.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                  borderLeft:   `3px solid ${i === HISTORIAL.length - 1 ? C.red : C.lineSubtle}`,
                }}
              >
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                  {item.fecha}
                </span>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink, marginBottom: 3 }}>
                    {item.evento}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, lineHeight: 1.45 }}>
                    {item.detalle}
                  </div>
                </div>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textAlign: "right" as const }}>
                  {item.actor}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
