/**
 * lib/operational-map/multisource/kpi-consolidation-lineage.ts
 *
 * KPI Consolidation Lineage — multi-source governance.
 *
 * Derives the consolidation lineage for each KPI purely from the existing
 * SAG source catalog (sag-real-source-catalog.ts).
 *
 * This is NOT a mock. It reads the actual `kpiKeysSugeridos` from each
 * SAG source and classifies them using classifyOperationalSource().
 *
 * If a source has no confirmed table → marked "sin tabla confirmada".
 * If a KPI has no matching sources → pendingNotes explains why.
 *
 * Sprint: AGENTIK-OPS-MULTISOURCE-GOVERNANCE-01
 */

import {
  SAG_OFICIAL_F1,
  SAG_NO_OFICIAL_F2,
  SAG_INVENTARIO,
  SAG_PRODUCCION,
  type SagRealSource,
} from "@/lib/operational-map/source-catalog/sag-real-source-catalog";

import {
  classifyOperationalSource,
  type OperationalViewType,
} from "./operational-source-classifier";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LineageSourceEntry {
  codigoFuente:        string;
  nombreFuente:        string;
  sagId:               string | undefined;
  clasificacion:       string;
  viewType:            OperationalViewType;
  operationalGroup:    string;
  isOfficial:          boolean;
  contributesToConsolidated: boolean;
  impactaVentas:       boolean;
  impactaCobros:       boolean;
  tablaSagConfirmada:  string | null;
  /** "pendiente confirmar tabla" | "pendiente validación DBA" | undefined */
  pendingNote:         string | undefined;
}

export interface KpiConsolidationLineage {
  kpiKey:       string;
  entityLabel:  string;
  /** All SAG sources that feed this KPI (from kpiKeysSugeridos) */
  sources:      LineageSourceEntry[];
  /** Pending items about the lineage itself (missing sources, EXTERNAL deps, etc.) */
  pendingNotes: string[];
  /** Whether the consolidation is considered complete (all views have ≥1 source) */
  consolidationComplete: boolean;
}

// ─── Build lineage ────────────────────────────────────────────────────────────

const ALL_CATALOG_SOURCES: SagRealSource[] = [
  ...SAG_OFICIAL_F1,
  ...SAG_NO_OFICIAL_F2,
  ...SAG_INVENTARIO,
  ...SAG_PRODUCCION,
];

export function buildKpiConsolidationLineage(
  kpiKey:      string,
  entityLabel: string,
): KpiConsolidationLineage {
  const matching = ALL_CATALOG_SOURCES.filter(s =>
    s.kpiKeysSugeridos.includes(kpiKey),
  );

  const sources: LineageSourceEntry[] = matching.map(s => {
    const cls = classifyOperationalSource(s.codigoFuente, s.clasificacion);
    return {
      codigoFuente:        s.codigoFuente,
      nombreFuente:        s.nombreFuente,
      sagId:               s.sagId,
      clasificacion:       s.clasificacion,
      viewType:            cls.viewType,
      operationalGroup:    cls.operationalGroup,
      isOfficial:          cls.isOfficial,
      contributesToConsolidated: cls.contributesToConsolidated,
      impactaVentas:       s.impactaVentas,
      impactaCobros:       s.impactaCobros,
      tablaSagConfirmada:  s.tablaSagConfirmada,
      pendingNote:         s.tablaSagConfirmada === null
        ? "sin tabla confirmada — pendiente DBA"
        : undefined,
    };
  });

  const pendingNotes: string[] = [];

  if (sources.length === 0) {
    pendingNotes.push("Sin fuentes SAG mapeadas en catálogo — requiere validación");
  } else {
    const hasF1 = sources.some(s => s.viewType === "fuente_1");
    if (!hasF1 && sources.some(s => s.isOfficial)) {
      // All OFICIAL are tiendas or web — that's still F1 scope
    }
    if (!sources.some(s => s.contributesToConsolidated)) {
      pendingNotes.push("Ninguna fuente mapeada contribuye al consolidado ejecutivo");
    }
    const unconfirmedTables = sources.filter(s => !s.tablaSagConfirmada).length;
    if (unconfirmedTables > 0) {
      pendingNotes.push(`${unconfirmedTables} fuente(s) sin tabla SAG confirmada — pendiente DBA`);
    }
  }

  const consolidationComplete = sources.length > 0 && sources.some(s => s.contributesToConsolidated);

  return { kpiKey, entityLabel, sources, pendingNotes, consolidationComplete };
}

// ─── Pre-built lineages for 10 core KPIs ─────────────────────────────────────

/**
 * Special KPIs with EXTERNAL dependencies get extra pending notes.
 * These cannot be derived from the SAG catalog alone.
 */
const EXTERNAL_PENDING: Record<string, string[]> = {
  disponible_banco_hoy: [
    "Fuente primaria es banco externo — pendiente integración bancaria",
    "SAG refleja egresos/ingresos pero NO es fuente autorizada de saldo bancario",
    "Requiere: API bancaria ó archivo de conciliación diaria",
  ],
  liquidez_operativa_dia: [
    "Cálculo requiere saldo bancario actual — pendiente integración bancaria",
    "SAG provee CxC + CxP, pero el disponible real necesita fuente bancaria",
  ],
  score_riesgo_mora: [
    "Score computado por Agentik sobre datos SAG — no existe fuente SAG directa",
    "Requiere: CXCCXC confirmada + cartera histórica + modelo ML scoring",
  ],
};

/**
 * KPI keys where Agentik computes a consolidation/enrichment layer on top of SAG.
 * These get an explicit AGENTIK source appended to the lineage tree.
 */
const AGENTIK_COMPUTED: Set<string> = new Set([
  // Core sales + collections — Agentik consolidates multi-source into single daily value
  "ventas_dia_fuente1",
  "recaudos_dia",
  // HYBRID KPIs — Agentik computes derived metrics from SAG raw data
  "score_riesgo_mora",
  "tasa_cobertura",
  "disponibilidad_ref",
  "liquidez_operativa_dia",
  "pedidos_retenidos_cartera",
]);

/** Build and return lineages for all 10 core KPIs */
export function buildCoreKpiLineages(): Record<string, KpiConsolidationLineage> {
  const CORE: Array<{ kpiKey: string; entityLabel: string }> = [
    { kpiKey: "tasa_cobertura",            entityLabel: "Tasa de Cobertura de Inventario" },
    { kpiKey: "cartera_vencida_total",     entityLabel: "Cartera Vencida Total" },
    { kpiKey: "recaudos_dia",              entityLabel: "Recaudos del Día" },
    { kpiKey: "liquidez_operativa_dia",    entityLabel: "Liquidez Operativa del Día" },
    { kpiKey: "pedidos_pendientes_despacho", entityLabel: "Pedidos Pendientes de Despacho" },
    { kpiKey: "ventas_dia_fuente1",        entityLabel: "Ventas del Día" },
    { kpiKey: "disponible_banco_hoy",      entityLabel: "Disponible en Banco Hoy" },
    { kpiKey: "disponibilidad_ref",        entityLabel: "Disponibilidad Operacional por Referencia" },
    { kpiKey: "score_riesgo_mora",         entityLabel: "Score de Riesgo de Mora" },
    { kpiKey: "pedidos_retenidos_cartera", entityLabel: "Pedidos Retenidos por Cartera" },
  ];

  const result: Record<string, KpiConsolidationLineage> = {};

  for (const { kpiKey, entityLabel } of CORE) {
    const lineage = buildKpiConsolidationLineage(kpiKey, entityLabel);

    // Append external pending notes
    if (EXTERNAL_PENDING[kpiKey]) {
      lineage.pendingNotes.push(...EXTERNAL_PENDING[kpiKey]);
    }

    // Add Agentik-computed note
    if (AGENTIK_COMPUTED.has(kpiKey)) {
      lineage.sources.push({
        codigoFuente:        "AGENTIK",
        nombreFuente:        "Capa de cómputo Agentik",
        sagId:               undefined,
        clasificacion:       "OFICIAL",
        viewType:            "consolidated",
        operationalGroup:    "Agentik / Computed",
        isOfficial:          false,
        contributesToConsolidated: true,
        impactaVentas:       false,
        impactaCobros:       false,
        tablaSagConfirmada:  "runtime_agentik",
        pendingNote:         undefined,
      });
    }

    result[kpiKey] = lineage;
  }

  return result;
}

// Singleton — computed once at module load
export const CORE_KPI_LINEAGES = buildCoreKpiLineages();
