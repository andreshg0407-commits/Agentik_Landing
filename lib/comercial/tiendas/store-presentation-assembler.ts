/**
 * lib/comercial/tiendas/store-presentation-assembler.ts
 *
 * AGENTIK-STORES-TRUTH-AUDIT-01 — F3A: StorePresentationAssembler.
 *
 * Transformación ÚNICA: StoreSnapshot → Presentation DTO. PURO, client-safe.
 *
 * CONTRATO ENDURECIDO (aprobado): cero sumas, restas, promedios, porcentajes,
 * umbrales y derivación de estados. Todo número visible es COPIA VERBATIM de
 * un campo del snapshot; todo estado visible es mapeo 1:1 de un enum — y los
 * estados de proyección se leen EXCLUSIVAMENTE del bloque presentationHints
 * (ajuste del arquitecto: jamás derivados de KPIs). Permitido únicamente:
 * formateo (toLocaleString, sufijos, "—"), selección/filtrado/agrupación/
 * ordenamiento de listas, e interpolación de campos en plantillas fijas.
 * Conteos de negocio: siempre campos del snapshot (needCount, openCount,
 * totals.*) — la UI solo puede mostrar el largo de listas aquí entregadas.
 *
 * Este módulo importa ÚNICAMENTE tipos de store-snapshot-pipeline (guardián
 * en F3B). Ni motores, ni servicios, ni SDS, ni Prisma, ni reloj.
 *
 * Certificación: __tests__/store-presentation-assembler.test.ts
 */

import type {
  StoreSnapshot,
  SnapshotPerStore,
  SnapshotHealthStatus,
  SnapshotActionKey,
  SnapshotCoverageStructure,
} from "./store-snapshot-pipeline";

// ═════════════════════════════════════════════════════════════════════════════
// Tonos y diccionarios fijos (mapeo 1:1 de enums — jamás de números)
// ═════════════════════════════════════════════════════════════════════════════

export type PresentationTone = "positive" | "warning" | "critical" | "neutral";

const HEALTH_TONE: Record<SnapshotHealthStatus, PresentationTone> = {
  SALUDABLE: "positive",
  ATENCION: "warning",
  CRITICA: "critical",
};

const HEALTH_LABEL: Record<SnapshotHealthStatus, string> = {
  SALUDABLE: "Saludable",
  ATENCION: "Atención",
  CRITICA: "Crítica",
};

const MODULE_HINT_TONE: Record<string, PresentationTone> = {
  OK: "positive",
  ALERTA: "critical",
  PENDIENTE: "warning",
  SIN_BASE: "neutral",
};

const QUANTITATIVE_TONE: Record<string, PresentationTone> = {
  SALUDABLE: "positive",
  CON_REFERENCIAS_BAJO_MINIMO: "critical",
  CON_EXCESO: "warning",
  SIN_REFERENCIAS: "neutral",
};

const SPECIAL_STATUS_TONE: Record<string, PresentationTone> = {
  CUMPLIDA: "positive",
  FALTANTE: "critical",
  EXCEDENTE: "warning",
  NO_AUTORIZADA: "critical",
};

const CANDIDATE_TYPE_LABEL: Record<string, string> = {
  REPOSICION_MISMA_REFERENCIA: "Reposición",
  COMPLEMENTO_REFERENCIA_COMPATIBLE: "Complemento compatible",
  REFERENCIA_NUEVA_COMPATIBLE: "Referencia nueva",
};

// Plantillas B8 — seleccionadas por actionKey del bloque de hints, jamás por
// comparación numérica. Los números se interpolan verbatim.
const ACTION_TEMPLATE: Record<SnapshotActionKey, (k: { shortageUnits: number; withdrawalUnits: number }) => string> = {
  ATENDER_REGLA_ESPECIAL: () => "Atender reglas especiales",
  SURTIR_Y_RETIRAR: k => `Surtir ${fmtInt(k.shortageUnits)} uds · retirar ${fmtInt(k.withdrawalUnits)} uds`,
  SURTIR: k => `Surtir ${fmtInt(k.shortageUnits)} uds`,
  RETIRAR: k => `Retirar ${fmtInt(k.withdrawalUnits)} uds`,
  AL_DIA: () => "Al día",
};

// ── Formateo (única "aritmética" permitida: presentación de un campo) ────────

function fmtInt(n: number): string {
  return n.toLocaleString("es-CO");
}

/** B1: número verbatim con sufijo, o "Sin base" — JAMÁS "0 %" para SIN_BASE. */
function fmtCoverage(percent: number | null, status: "OK" | "SIN_BASE"): string {
  return status === "SIN_BASE" || percent === null ? "Sin base" : `${percent} %`;
}

// ═════════════════════════════════════════════════════════════════════════════
// DTOs
// ═════════════════════════════════════════════════════════════════════════════

export interface PresentationKpiCard {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly tone: PresentationTone;
}

export interface PresentationStoreCard {
  readonly storeId: string;
  readonly title: string;
  readonly subtitle: string;               // refs · uds · cobertura (campos verbatim)
  readonly coverageText: string;           // B1 — MISMO campo que el tab (T4)
  readonly coverageTone: PresentationTone; // por healthStatus (enum), no por número
  readonly healthBadge: { readonly label: string; readonly tone: PresentationTone };
  readonly actionText: string;             // B8 — plantilla por hints.actionKey
  readonly stats: {
    readonly shortageUnits: string;
    readonly withdrawalUnits: string;
    readonly criticalStructures: string;
    readonly excessStructures: string;
  };
}

export interface DashboardPresentation {
  readonly kpiCards: readonly PresentationKpiCard[];
  readonly storeCards: readonly PresentationStoreCard[];
  readonly freshness: { readonly dataAsOf: string | null; readonly generatedAt: string | null };
  readonly documentsOpenText: string;
}

export interface PresentationCoverageRow {
  readonly structureKey: string;
  readonly label: string;
  readonly groupLabel: string | null;
  readonly line: string;
  readonly totalUnitsText: string;
  readonly ruleText: string;                    // "min / ideal / max" verbatim
  readonly statusKey: string;                   // quantitativeStatus (enum verbatim)
  readonly statusTone: PresentationTone;
  readonly deficitToIdealText: string;
  readonly excessText: string;
  readonly covered: boolean;                    // structuralCoverageStatus === CUBIERTA (enum)
}

export interface CoverageTabPresentation {
  readonly storeId: string;
  readonly coverageText: string;                // B1 — MISMO campo que la card (T4)
  readonly healthyOfExpectedText: string;
  readonly rows: readonly PresentationCoverageRow[];
  readonly lineGroups: readonly { readonly line: string; readonly rows: readonly PresentationCoverageRow[] }[];
  readonly specialRules: readonly {
    readonly pattern: string;
    readonly label: string;
    readonly statusKey: string;
    readonly tone: PresentationTone;
    readonly totalUnitsText: string;
    readonly idealUnitsText: string;
  }[];
}

export interface NeedsTabPresentation {
  readonly storeId: string;
  readonly suggestions: readonly {
    readonly structureKey: string;
    readonly referenceCode: string;
    readonly productName: string;
    readonly unitsText: string;
    readonly typeLabel: string;
    readonly reasons: readonly { readonly code: string; readonly detail: string }[];
  }[];
  readonly withdrawals: readonly {
    readonly structureKey: string;
    readonly label: string;
    readonly unitsText: string;
  }[];
  readonly unassignedTitle: string;
  readonly unassigned: readonly {
    readonly structureKey: string;
    readonly label: string;
    readonly code: string;
    readonly detail: string;
    readonly engineReason: string;
    readonly requiredText: string;
    readonly pendingText: string;
    readonly metadata: Readonly<Record<string, string | number | boolean>>;
  }[];
  readonly totals: {
    readonly suggestedUnitsText: string;
    readonly unassignedCountText: string;
    readonly unassignedPendingText: string;
  };
}

// ── Lenguaje comercial para causas de faltantes ──────────────────────────────

const UNASSIGNED_HUMAN_CAUSE: Record<string, string> = {
  SIN_DATOS_DISPONIBILIDAD: "Sin datos de disponibilidad",
  SIN_COMPATIBLES_CON_STOCK: "Sin stock compatible en bodega",
  COMPATIBLES_EXCLUIDAS_POR_REGLAS: "Stock reservado por Regla 36",
  ASIGNACION_PARCIAL: "Pool agotado (asignación parcial)",
  ESCASEZ_GLOBAL_POOL_AGOTADO: "Pool agotado",
};

// ── Operative Needs DTO ──────────────────────────────────────────────────────

export interface OperativeNeedsSuggestionItem {
  readonly referenceCode: string;
  readonly productName: string;
  readonly unitsText: string;
  readonly typeLabel: string;
}

export interface OperativeNeedsUnassignedItem {
  readonly structureLabel: string;
  readonly pendingText: string;
  readonly cause: string;
  /** Technical detail — hidden by default, shown in "Ver explicación" */
  readonly technicalDetail: string;
  readonly engineReason: string;
}

export interface OperativeNeedsStructureGroup {
  /** Derrotero structure label (e.g. "PANTALÓN CLÁSICO — 30") */
  readonly structureKey: string;
  readonly label: string;
  /** Line from coverage (e.g. "1" for Textil) */
  readonly line: string;
  /** How many units this structure needs (from coverage deficit) */
  readonly requiredText: string;
  /** How many units the plan can send now */
  readonly suggestedText: string;
  /** How many units remain pending after suggestions */
  readonly pendingText: string;
  /** true if all required units are covered by suggestions */
  readonly fullyCovered: boolean;
  /** Concrete references available to send for this structure */
  readonly items: readonly OperativeNeedsSuggestionItem[];
}

export interface OperativeNeedsPresentation {
  readonly storeId: string;
  /** Structures grouped and sorted by line, then by label */
  readonly structureGroups: readonly OperativeNeedsStructureGroup[];
  /** Summary KPIs */
  readonly totalStructuresText: string;
  readonly coveredStructuresText: string;
  readonly pendingStructuresText: string;
  readonly totalSuggestedText: string;
  readonly totalPendingText: string;
  /** Unassigned needs with human-readable causes */
  readonly unassigned: readonly OperativeNeedsUnassignedItem[];
  /** Withdrawals (excesos) */
  readonly withdrawals: readonly {
    readonly structureKey: string;
    readonly label: string;
    readonly unitsText: string;
  }[];
  /** Show CTA only when there are suggestions */
  readonly hasSuggestions: boolean;
}

export function buildOperativeNeedsPresentation(snapshot: StoreSnapshot, storeId: string): OperativeNeedsPresentation {
  const store = requireStore(snapshot, storeId);
  const projection = store.presentationHints.needs;
  const coverageByKey = new Map(store.coverage.structures.map(s => [s.structureKey, s]));

  // Group suggestions by structureKey
  const suggestionsByStructure = new Map<string, typeof projection.suggestions[number][]>();
  for (const s of projection.suggestions) {
    const list = suggestionsByStructure.get(s.structureKey) ?? [];
    list.push(s);
    suggestionsByStructure.set(s.structureKey, list);
  }

  // Build structure groups for structures that have suggestions
  const structureKeys = [...new Set(projection.suggestions.map(s => s.structureKey))];
  const structureGroups: OperativeNeedsStructureGroup[] = structureKeys.map(key => {
    const cov = coverageByKey.get(key);
    const items = suggestionsByStructure.get(key) ?? [];
    let suggestedUnits = 0;
    for (const it of items) suggestedUnits += it.units;
    const requiredUnits = cov?.unitRule.deficitToIdeal ?? suggestedUnits;
    const diff = requiredUnits - suggestedUnits;
    const pending = diff > 0 ? diff : 0;
    return {
      structureKey: key,
      label: cov?.label ?? key,
      line: cov?.line ?? "",
      requiredText: fmtInt(requiredUnits),
      suggestedText: fmtInt(suggestedUnits),
      pendingText: fmtInt(pending),
      fullyCovered: pending === 0,
      items: items.map(s => ({
        referenceCode: s.referenceCode,
        productName: s.productName,
        unitsText: fmtInt(s.units),
        typeLabel: CANDIDATE_TYPE_LABEL[s.candidateType] ?? s.candidateType,
      })),
    };
  }).sort((a, b) => a.line.localeCompare(b.line) || a.label.localeCompare(b.label));

  // Unassigned — human-readable
  const unassigned: OperativeNeedsUnassignedItem[] = projection.unassigned.map(u => ({
    structureLabel: u.label,
    pendingText: fmtInt(u.pendingUnits),
    cause: UNASSIGNED_HUMAN_CAUSE[u.code] ?? u.code,
    technicalDetail: u.detail,
    engineReason: u.engineReason,
  }));

  // Withdrawals
  const withdrawals = store.needs.needs
    .filter(n => n.action === "RETIRO")
    .map(n => ({ structureKey: n.structureKey, label: n.label, unitsText: fmtInt(n.requiredUnits) }));

  const coveredCount = structureGroups.filter(g => g.fullyCovered).length;
  const pendingCount = structureGroups.length - coveredCount + unassigned.length;

  return {
    storeId,
    structureGroups,
    totalStructuresText: fmtInt(structureGroups.length + unassigned.length),
    coveredStructuresText: fmtInt(coveredCount),
    pendingStructuresText: fmtInt(pendingCount),
    totalSuggestedText: fmtInt(projection.totals.suggestedUnits),
    totalPendingText: fmtInt(projection.totals.unassignedPendingUnits),
    unassigned,
    withdrawals,
    hasSuggestions: projection.suggestions.length > 0,
  };
}

export interface ReplenishmentPresentation {
  readonly storeSummaries: readonly {
    readonly storeId: string;
    readonly requiredText: string;
    readonly executableText: string;
    readonly allocatedText: string;
    readonly withdrawalText: string;
  }[];
  readonly scarcityText: string | null;
  readonly documentsOpenText: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// Builders
// ═════════════════════════════════════════════════════════════════════════════

function requireStore(snapshot: StoreSnapshot, storeId: string): SnapshotPerStore {
  const store = snapshot.perStore.find(s => s.storeId === storeId);
  if (!store) throw new Error(`[PRESENTATION] tienda ${storeId} no existe en el snapshot`);
  return store;
}

export function buildDashboardPresentation(snapshot: StoreSnapshot): DashboardPresentation {
  const hints = snapshot.presentationHints;
  const kpiCards: PresentationKpiCard[] = [
    {
      key: "tiendasActivas",
      label: "Tiendas activas",
      value: fmtInt(snapshot.moduleKpis.tiendasActivas),
      tone: "neutral",
    },
    {
      key: "requierenAtencion",
      label: "Requieren atención",
      value: fmtInt(snapshot.moduleKpis.requierenAtencion),
      tone: MODULE_HINT_TONE[hints.requierenAtencion],
    },
    {
      key: "unidadesPorSurtir",
      label: "Unidades por surtir",
      value: `${fmtInt(snapshot.moduleKpis.unidadesPorSurtir)} uds`,
      tone: MODULE_HINT_TONE[hints.unidadesPorSurtir],
    },
    {
      key: "coberturaRed",
      label: "Cobertura de la red",
      value: fmtCoverage(snapshot.moduleKpis.coberturaRed, hints.coberturaRed === "SIN_BASE" ? "SIN_BASE" : "OK"),
      tone: MODULE_HINT_TONE[hints.coberturaRed],
    },
  ];

  const storeCards: PresentationStoreCard[] = snapshot.perStore.map(s => ({
    storeId: s.storeId,
    title: s.displayName,
    subtitle: `${fmtInt(s.inventory.referenceCount)} refs · ${fmtInt(s.inventory.totalUnits)} uds · Cobertura ${fmtCoverage(s.kpis.coveragePercent, s.kpis.coverageStatus)}`,
    coverageText: fmtCoverage(s.kpis.coveragePercent, s.kpis.coverageStatus),
    coverageTone: HEALTH_TONE[s.kpis.healthStatus],
    healthBadge: { label: HEALTH_LABEL[s.kpis.healthStatus], tone: HEALTH_TONE[s.kpis.healthStatus] },
    actionText: ACTION_TEMPLATE[s.presentationHints.actionKey]({
      shortageUnits: s.kpis.shortageUnits,
      withdrawalUnits: s.kpis.withdrawalUnits,
    }),
    stats: {
      shortageUnits: fmtInt(s.kpis.shortageUnits),
      withdrawalUnits: fmtInt(s.kpis.withdrawalUnits),
      criticalStructures: fmtInt(s.kpis.criticalStructures),
      excessStructures: fmtInt(s.kpis.excessStructures),
    },
  }));

  return {
    kpiCards,
    storeCards,
    freshness: { dataAsOf: snapshot.dataAsOf, generatedAt: snapshot.generatedAt },
    documentsOpenText: `${fmtInt(snapshot.documentRefs.openCount)} documentos de surtido abiertos`,
  };
}

function coverageRow(st: SnapshotCoverageStructure): PresentationCoverageRow {
  return {
    structureKey: st.structureKey,
    label: st.label,
    groupLabel: st.groupLabel,
    line: st.line,
    totalUnitsText: fmtInt(st.totalUnits),
    ruleText: st.rule.maxUnits === null
      ? `${st.rule.minUnits} / ${st.rule.idealUnits} / —`
      : `${st.rule.minUnits} / ${st.rule.idealUnits} / ${st.rule.maxUnits}`,
    statusKey: st.quantitativeStatus,
    statusTone: QUANTITATIVE_TONE[st.quantitativeStatus] ?? "neutral",
    deficitToIdealText: fmtInt(st.unitRule.deficitToIdeal),
    excessText: fmtInt(st.unitRule.excessOverMax),
    covered: st.structuralCoverageStatus === "CUBIERTA",
  };
}

export function buildCoverageTabPresentation(snapshot: StoreSnapshot, storeId: string): CoverageTabPresentation {
  const store = requireStore(snapshot, storeId);
  const rows = store.coverage.structures.map(coverageRow);
  const lines = [...new Set(rows.map(r => r.line))];
  return {
    storeId,
    coverageText: fmtCoverage(store.kpis.coveragePercent, store.kpis.coverageStatus),   // T4: mismo campo que la card
    healthyOfExpectedText: `${fmtInt(store.coverage.healthyStructures)} de ${fmtInt(store.coverage.expectedStructures)} estructuras saludables`,
    rows,
    lineGroups: lines.map(line => ({ line, rows: rows.filter(r => r.line === line) })),
    specialRules: store.coverage.specialRules.map(r => ({
      pattern: r.pattern,
      label: r.label,
      statusKey: r.status,
      tone: SPECIAL_STATUS_TONE[r.status] ?? "neutral",
      totalUnitsText: fmtInt(r.totalUnits),
      idealUnitsText: fmtInt(r.idealUnits),
    })),
  };
}

export function buildNeedsTabPresentation(snapshot: StoreSnapshot, storeId: string): NeedsTabPresentation {
  const store = requireStore(snapshot, storeId);
  const projection = store.presentationHints.needs;   // proyección certificada, verbatim

  return {
    storeId,
    suggestions: projection.suggestions.map(s => ({
      structureKey: s.structureKey,
      referenceCode: s.referenceCode,
      productName: s.productName,
      unitsText: fmtInt(s.units),
      typeLabel: CANDIDATE_TYPE_LABEL[s.candidateType] ?? s.candidateType,
      reasons: s.reasons.map(r => ({ code: r.code, detail: r.detail })),
    })),
    withdrawals: store.needs.needs
      .filter(n => n.action === "RETIRO")
      .map(n => ({ structureKey: n.structureKey, label: n.label, unitsText: fmtInt(n.requiredUnits) })),
    unassignedTitle: projection.unassignedTitle,
    unassigned: projection.unassigned.map(u => ({
      structureKey: u.structureKey,
      label: u.label,
      code: u.code,
      detail: u.detail,
      engineReason: u.engineReason,
      requiredText: fmtInt(u.requiredUnits),
      pendingText: fmtInt(u.pendingUnits),
      metadata: u.metadata,
    })),
    totals: {
      suggestedUnitsText: fmtInt(projection.totals.suggestedUnits),
      unassignedCountText: fmtInt(projection.totals.unassignedCount),
      unassignedPendingText: fmtInt(projection.totals.unassignedPendingUnits),
    },
  };
}

export function buildReplenishmentPresentation(snapshot: StoreSnapshot): ReplenishmentPresentation {
  return {
    storeSummaries: snapshot.plan.summaryByStore.map(s => ({
      storeId: s.storeId,
      requiredText: fmtInt(s.requiredUnits),
      executableText: fmtInt(s.executableUnits),
      allocatedText: fmtInt(s.allocatedUnits),
      withdrawalText: fmtInt(s.withdrawalUnits),
    })),
    scarcityText: snapshot.plan.scarcityMaterialized
      ? "Escasez global materializada: el stock elegible no alcanzó para todas las necesidades ejecutables."
      : null,
    documentsOpenText: `${fmtInt(snapshot.documentRefs.openCount)} documentos abiertos`,
  };
}
