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
  SnapshotFamilyBucket,
} from "./store-snapshot-pipeline";
import type {
  CoverageRuleEvaluation,
  CoverageRuleStatus,
} from "./coverage-rule-projection";
import { COMMERCIAL_FAMILIES } from "@/lib/products/commercial-taxonomy/commercial-taxonomy-data";

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

const SPECIAL_STATUS_TONE: Record<string, PresentationTone> = {
  CUMPLIDA: "positive",
  FALTANTE: "critical",
  EXCEDENTE: "warning",
  NO_AUTORIZADA: "critical",
};

const CANDIDATE_TYPE_LABEL: Record<string, string> = {
  REPOSICION_MISMA_REFERENCIA: "Reposición directa",
  COMPLEMENTO_REFERENCIA_COMPATIBLE: "Mercancía disponible",
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

// ═════════════════════════════════════════════════════════════════════════════
// COVERAGE-UX-01 BEGIN — tab Cobertura proyectado desde coverage.ruleEvaluations
// (fuente canónica, corrección 1). El guardián estricto del contrato endurecido
// aplica íntegro a esta sección: cero aritmética, estados por diccionario 1:1,
// conteos solo como cardinalidades de listas proyectadas o campos del snapshot.
// ═════════════════════════════════════════════════════════════════════════════

/** Estados humanos 1:1 (corrección 7). Jamás derivados de números. */
const COVERAGE_RULE_STATUS_LABEL: Record<CoverageRuleStatus, string> = {
  SIN_COBERTURA: "Sin cobertura",
  BAJO_MINIMO: "Bajo mínimo",
  DENTRO_DE_RANGO: "En rango",
  SOBRE_MAXIMO: "Sobre máximo",
  CUMPLIDA: "Objetivo cumplido",
  FALTANTE: "Requiere surtido",
  EXCEDENTE: "Sobre objetivo",
  NO_AUTORIZADA: "Presencia no autorizada",
};

const COVERAGE_RULE_STATUS_TONE: Record<CoverageRuleStatus, PresentationTone> = {
  SIN_COBERTURA: "critical",
  BAJO_MINIMO: "warning",
  DENTRO_DE_RANGO: "positive",
  SOBRE_MAXIMO: "warning",
  CUMPLIDA: "positive",
  FALTANTE: "critical",
  EXCEDENTE: "warning",
  NO_AUTORIZADA: "critical",
};

/** Diccionario 1:1: estados sanos para B1 (ley del pipeline: SOBRE_MAXIMO sigue sano). */
const COVERAGE_RULE_STATUS_HEALTHY: Record<CoverageRuleStatus, boolean> = {
  SIN_COBERTURA: false,
  BAJO_MINIMO: false,
  DENTRO_DE_RANGO: true,
  SOBRE_MAXIMO: true,
  CUMPLIDA: true,
  FALTANTE: false,
  EXCEDENTE: false,
  NO_AUTORIZADA: false,
};

/** Diccionario 1:1: estados que requieren atención (corrección 12). */
const COVERAGE_RULE_STATUS_ATTENTION: Record<CoverageRuleStatus, boolean> = {
  SIN_COBERTURA: true,
  BAJO_MINIMO: true,
  DENTRO_DE_RANGO: false,
  SOBRE_MAXIMO: false,
  CUMPLIDA: false,
  FALTANTE: false,
  EXCEDENTE: false,
  NO_AUTORIZADA: false,
};

/** Etiquetas de línea 1:1 con fallback humanizado (corrección 6): una línea
 *  nueva del Derrotero aparece con etiqueta legible sin tocar este código. */
const COVERAGE_LINE_LABEL: Record<string, string> = {
  castillitos: "Castillitos",
  latin_kids: "Latin Kids",
  accesorios_importacion: "Accesorios",
};

/** Prefijo de structureKey → id de línea (mismo mapeo que deriveStructureKeyFromEffective). */
const RULE_PREFIX_LINE: Record<string, string> = {
  CS: "castillitos",
  LK: "latin_kids",
  ACC: "accesorios_importacion",
};

/** Orden de presentación de secciones (diccionario 1:1 por id de línea;
 *  líneas desconocidas van después, en orden de aparición). */
const COVERAGE_LINE_ORDER: Record<string, number> = {
  castillitos: 1,
  latin_kids: 2,
  accesorios_importacion: 3,
};

function humanizeToken(token: string): string {
  return toTitleCase(token.replace(/_/g, " "));
}

/**
 * Jerarquía derivada del ruleId (proyección de texto, jamás evaluación):
 *   "STRUCT:CS|{grupo}|{subgrupo}"  → línea castillitos, grupo real
 *   "STRUCT:LK|{subgrupo}"          → línea latin_kids, plano
 *   "STRUCT:ACC|{tamaño}"           → línea accesorios, plano
 *   "STRUCT:DYN|{line}|{grupo}|{s}" → línea dinámica (ADD no estándar)
 *   prefijo desconocido             → sección propia humanizada (corrección 6)
 */
function resolveRuleHierarchy(ev: CoverageRuleEvaluation): {
  line: string;
  groupLabel: string | null;
  structureKey: string | null;
} {
  if (!ev.ruleId.startsWith("STRUCT:")) {
    return { line: "especiales", groupLabel: null, structureKey: null };
  }
  const structureKey = ev.ruleId.slice("STRUCT:".length);
  const parts = structureKey.split("|");
  if (parts[0] === "DYN" && parts.length >= 4) {
    return {
      line: parts[1] || "DYN",
      groupLabel: ev.ruleType === "TEXTILE_STRUCTURE" && parts[2] ? parts[2] : null,
      structureKey,
    };
  }
  return {
    line: RULE_PREFIX_LINE[parts[0]] ?? parts[0],
    groupLabel: ev.ruleType === "TEXTILE_STRUCTURE" && parts.length >= 3 ? parts[1] : null,
    structureKey,
  };
}

/** "CS NIÑA BEBE" → "Niña Bebe": quita el prefijo redundante de línea y aplica Title Case. */
function formatGroupDisplay(groupLabel: string, keyPrefix: string): string {
  const stripped = groupLabel.startsWith(`${keyPrefix} `)
    ? groupLabel.slice(`${keyPrefix} `.length)
    : groupLabel;
  return toTitleCase(stripped);
}

/** Detalle por estado — plantillas fijas con campos verbatim (corrección 8;
 *  copy BAJO_MINIMO gobernado por minimum — real-data gate §4/§5).
 *  deficitToMin y excessOverMax se enriquecen verbatim desde
 *  structures[].unitRule (el motor ya los computa; aquí jamás se calculan). */
function buildStructuralDetailText(
  ev: CoverageRuleEvaluation,
  deficitToMin: number | null,
  excessOverMax: number | null,
): string | null {
  switch (ev.status) {
    case "SIN_COBERTURA":
      // Sin referencias: el faltante al mínimo es el mínimo mismo (campo verbatim).
      return `Sin referencias con inventario · Faltan ${fmtInt(ev.minimum)} uds para alcanzar el mínimo`;
    case "BAJO_MINIMO":
      // Estado gobernado por minimum: jamás copy sobre el ideal (el ideal
      // sigue visible en ruleText). Sin enriquecimiento, condición sin cifra.
      return deficitToMin === null
        ? `Por debajo del mínimo de ${fmtInt(ev.minimum)} uds`
        : `Faltan ${fmtInt(deficitToMin)} uds para alcanzar el mínimo`;
    case "SOBRE_MAXIMO":
      return excessOverMax === null
        ? "Cumple cobertura · sobre el máximo"
        : `Cumple cobertura · ${fmtInt(excessOverMax)} uds sobre el máximo`;
    default:
      return null;
  }
}

export interface CoverageRuleRowPresentation {
  readonly ruleId: string;
  readonly label: string;
  readonly statusKey: CoverageRuleStatus;       // enum verbatim
  readonly statusLabel: string;                 // diccionario 1:1 (corrección 7)
  readonly tone: PresentationTone;
  readonly actualUnitsText: string;             // actualUnits verbatim
  readonly ruleText: string;                    // "min / ideal / max" verbatim ("—" sin tope)
  readonly detailText: string | null;           // déficit/exceso con campos verbatim
  readonly healthy: boolean;                    // diccionario 1:1 por enum
  readonly requiresAttention: boolean;          // diccionario 1:1 por enum
}

export interface CoverageGroupPresentation {
  readonly key: string;                         // `${line}::${groupLabel ?? ""}`
  readonly groupLabel: string | null;           // verbatim del ruleId (null = lista plana)
  readonly groupDisplay: string | null;
  readonly headerText: string | null;           // "N de M en cobertura" (cardinalidades)
  readonly rows: readonly CoverageRuleRowPresentation[];
}

export interface CoverageSectionPresentation {
  readonly line: string;                        // id verbatim
  readonly lineLabel: string;                   // diccionario 1:1 + fallback humanizado
  readonly ruleCountText: string;               // cardinalidad de filas proyectadas
  readonly groups: readonly CoverageGroupPresentation[];
}

export interface CoverageSpecialRowPresentation {
  readonly ruleId: string;
  readonly label: string;
  readonly statusKey: CoverageRuleStatus;
  readonly statusLabel: string;
  readonly tone: PresentationTone;
  readonly actualUnitsText: string;
  readonly idealUnitsText: string;
  readonly detailText: string | null;
}

export interface CoverageTabPresentation {
  readonly storeId: string;
  /** CONCEPTO 1 — cobertura estructural (TEXTILE_STRUCTURE + ACCESSORY_SIZE). */
  readonly structural: {
    readonly coverageText: string;              // B1 verbatim — MISMO campo que la card (T4)
    readonly coverageDetailText: string;        // "N de M reglas estructurales cumplen" (verbatim)
    readonly healthyCountText: string;          // healthyStructures verbatim
    readonly attentionCountText: string;        // cardinalidad de filas en atención
    readonly sections: readonly CoverageSectionPresentation[];
  };
  /** CONCEPTO 2 — reglas especiales: cumplimiento propio, jamás en el porcentaje. */
  readonly specials: {
    readonly summaryText: string;               // "N de M cumplidas" (cardinalidades)
    readonly rows: readonly CoverageSpecialRowPresentation[];
  };
}
// ═════ COVERAGE-UX-01 (interfaces) — el builder vive junto a los demás ═══════

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
  SIN_DATOS_DISPONIBILIDAD: "Sin información de inventario disponible",
  SIN_COMPATIBLES_CON_STOCK: "No hay mercancía disponible en bodega para este grupo",
  COMPATIBLES_EXCLUIDAS_POR_REGLAS: "Mercancía reservada para otras tiendas",
  ASIGNACION_PARCIAL: "Inventario insuficiente para cubrir todas las tiendas",
  ESCASEZ_GLOBAL_POOL_AGOTADO: "Inventario insuficiente para cubrir todas las tiendas",
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
  /** Line from coverage (e.g. "CS" for Castillitos) */
  readonly line: string;
  readonly pendingUnits: number;
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
  /** Line from coverage (e.g. "CS" for Castillitos) */
  readonly line: string;
  /** Raw unit counts for client-side line filtering */
  readonly suggestedUnits: number;
  readonly pendingUnits: number;
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
      suggestedUnits,
      pendingUnits: pending,
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
    line: u.line,
    pendingUnits: u.pendingUnits,
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

/**
 * COVERAGE-UX-01 — tab Cobertura proyectado desde coverage.ruleEvaluations
 * (fuente canónica, corrección 1). Las filas están GOBERNADAS por la
 * proyección: una regla ADD sintética aparece sin tocar structures (G2) y una
 * regla removida de la proyección desaparece aunque structures la traiga (G3).
 * structures[]/specialRules[] se usan SOLO como enriquecimiento verbatim de
 * cifras que la proyección no trae (exceso sobre máximo, exceso sobre objetivo).
 */
export function buildCoverageTabPresentation(snapshot: StoreSnapshot, storeId: string): CoverageTabPresentation {
  const store = requireStore(snapshot, storeId);
  const evaluations = store.coverage.ruleEvaluations;

  // Enriquecimiento verbatim (jamás gobierna filas)
  const structureByKey = new Map(store.coverage.structures.map(s => [s.structureKey, s]));
  const specialByRuleKey = new Map(
    store.coverage.specialRules.map(sr => [`SPECIAL:${sr.storeId}:${sr.pattern}`, sr]),
  );

  const structuralEvals = evaluations.filter(ev => ev.ruleType !== "SPECIAL_PRODUCT");
  const specialEvals = evaluations.filter(ev => ev.ruleType === "SPECIAL_PRODUCT");

  // Orden estable por priority (campo verbatim) y label — sin aritmética
  const sorted = [...structuralEvals].sort((a, b) =>
    a.priority < b.priority ? -1 : a.priority > b.priority ? 1 : a.label.localeCompare(b.label),
  );

  // Secciones y grupos en orden de aparición — jamás cardinalidades fijas
  type GroupAcc = { groupLabel: string | null; keyPrefix: string; rows: CoverageRuleRowPresentation[] };
  const sectionOrder: string[] = [];
  const groupsByLine = new Map<string, Map<string, GroupAcc>>();
  const allRows: CoverageRuleRowPresentation[] = [];

  for (const ev of sorted) {
    const h = resolveRuleHierarchy(ev);
    const st = h.structureKey ? structureByKey.get(h.structureKey) : undefined;
    const row: CoverageRuleRowPresentation = {
      ruleId: ev.ruleId,
      label: ev.label,
      statusKey: ev.status,
      statusLabel: COVERAGE_RULE_STATUS_LABEL[ev.status] ?? ev.status,
      tone: COVERAGE_RULE_STATUS_TONE[ev.status] ?? "neutral",
      actualUnitsText: fmtInt(ev.actualUnits),
      ruleText: ev.maximum === null
        ? `${fmtInt(ev.minimum)} / ${fmtInt(ev.ideal)} / —`
        : `${fmtInt(ev.minimum)} / ${fmtInt(ev.ideal)} / ${fmtInt(ev.maximum)}`,
      detailText: buildStructuralDetailText(
        ev,
        ev.status === "BAJO_MINIMO" ? (st?.unitRule.deficitToMin ?? null) : null,
        ev.status === "SOBRE_MAXIMO" ? (st?.unitRule.excessOverMax ?? null) : null,
      ),
      healthy: COVERAGE_RULE_STATUS_HEALTHY[ev.status] ?? false,
      requiresAttention: COVERAGE_RULE_STATUS_ATTENTION[ev.status] ?? false,
    };
    allRows.push(row);

    if (!groupsByLine.has(h.line)) {
      groupsByLine.set(h.line, new Map());
      sectionOrder.push(h.line);
    }
    const groups = groupsByLine.get(h.line)!;
    const groupKey = `${h.line}::${h.groupLabel ?? ""}`;
    if (!groups.has(groupKey)) {
      const keyPrefix = h.structureKey ? h.structureKey.split("|")[0] : "";
      groups.set(groupKey, { groupLabel: h.groupLabel, keyPrefix, rows: [] });
    }
    groups.get(groupKey)!.rows.push(row);
  }

  // Orden de secciones: diccionario 1:1 de líneas conocidas; desconocidas al
  // final en orden de aparición (sin aritmética: comparación pura).
  const orderedLines = [...sectionOrder].sort((a, b) => {
    const oa = COVERAGE_LINE_ORDER[a] ?? Number.MAX_SAFE_INTEGER;
    const ob = COVERAGE_LINE_ORDER[b] ?? Number.MAX_SAFE_INTEGER;
    if (oa < ob) return -1;
    if (oa > ob) return 1;
    return sectionOrder.indexOf(a) < sectionOrder.indexOf(b) ? -1 : 1;
  });

  const sections: CoverageSectionPresentation[] = orderedLines.map(line => {
    const groups = [...groupsByLine.get(line)!.entries()].map(([key, g]) => ({
      key,
      groupLabel: g.groupLabel,
      groupDisplay: g.groupLabel === null ? null : formatGroupDisplay(g.groupLabel, g.keyPrefix),
      // "N de M en cobertura" — cardinalidades de la lista proyectada
      headerText: g.groupLabel === null
        ? null
        : `${fmtInt(g.rows.filter(r => r.healthy).length)} de ${fmtInt(g.rows.length)} en cobertura`,
      rows: g.rows,
    }));
    const sectionRows = groups.flatMap(g => g.rows);
    return {
      line,
      lineLabel: COVERAGE_LINE_LABEL[line] ?? humanizeToken(line),
      ruleCountText: `${fmtInt(sectionRows.length)} reglas evaluadas`,
      groups,
    };
  });

  // CONCEPTO 2 — reglas especiales (cumplimiento propio, jamás en el porcentaje)
  const specialRows: CoverageSpecialRowPresentation[] = specialEvals.map(ev => {
    const sr = specialByRuleKey.get(ev.ruleId);
    let detailText: string | null = null;
    if (ev.status === "FALTANTE") {
      detailText = `Faltan ${fmtInt(ev.gapToIdeal)} uds para el objetivo`;
    } else if (ev.status === "EXCEDENTE" || ev.status === "NO_AUTORIZADA") {
      // Exceso enriquecido verbatim desde specialRules[]; sin él, condición sin cifra
      detailText = sr === undefined
        ? "Sobre el objetivo"
        : `+${fmtInt(sr.gapUnits)} uds sobre el objetivo`;
    }
    return {
      ruleId: ev.ruleId,
      label: ev.label,
      statusKey: ev.status,
      statusLabel: COVERAGE_RULE_STATUS_LABEL[ev.status] ?? ev.status,
      tone: COVERAGE_RULE_STATUS_TONE[ev.status] ?? "neutral",
      actualUnitsText: fmtInt(ev.actualUnits),
      idealUnitsText: fmtInt(ev.ideal),
      detailText,
    };
  });

  return {
    storeId,
    structural: {
      coverageText: fmtCoverage(store.kpis.coveragePercent, store.kpis.coverageStatus),   // T4: mismo campo que la card
      coverageDetailText: `${fmtInt(store.coverage.healthyStructures)} de ${fmtInt(store.coverage.expectedStructures)} reglas estructurales cumplen`,
      healthyCountText: fmtInt(store.coverage.healthyStructures),
      attentionCountText: fmtInt(allRows.filter(r => r.requiresAttention).length),
      sections,
    },
    specials: {
      summaryText: `${fmtInt(specialRows.filter(r => r.statusKey === "CUMPLIDA").length)} de ${fmtInt(specialRows.length)} cumplidas`,
      rows: specialRows,
    },
  };
}
// ═════ COVERAGE-UX-01 END ════════════════════════════════════════════════════

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

// ═════════════════════════════════════════════════════════════════════════════
// Accessory Composition — presentation projection (COMPOSITION-UX-01)
// ═════════════════════════════════════════════════════════════════════════════

// Title Case conversion preserving Unicode (tildes, ñ).
function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
}

// familyKey → human display label, derived from canonical COMMERCIAL_FAMILIES.
// NO manual dictionary — single source of truth.
const FAMILY_LABEL: Record<string, string> = Object.fromEntries(
  COMMERCIAL_FAMILIES.map(f => [f.key, toTitleCase(f.label)]),
);

const SIZE_LABEL: Record<string, string> = {
  "ACC|Pequeño": "Pequeños",
  "ACC|Mediano": "Medianos",
  "ACC|Grande": "Grandes",
};

export interface AccessoryFamilyReferencePresentation {
  readonly referenceId: string;
  readonly referenceCode: string;
  readonly description: string;
  readonly units: number;
  readonly thumbnailUrl: string | null;
}

export interface AccessoryFamilyRow {
  readonly key: string;
  readonly label: string;
  readonly units: number;
  readonly refCount: number;
  readonly percentage: number;
  readonly references: readonly AccessoryFamilyReferencePresentation[];
}

export type AccessoryDeltaState = "over" | "exact" | "under";

export interface AccessorySizeBlock {
  readonly structureKey: string;
  readonly sizeLabel: string;
  readonly units: number;
  readonly target: number;
  readonly delta: number;
  readonly deltaState: AccessoryDeltaState;
  readonly deltaText: string;
  readonly familyCount: number;
  readonly families: readonly AccessoryFamilyRow[];
}

export interface AccessoryCompositionPresentation {
  readonly storeId: string;
  readonly sizes: readonly AccessorySizeBlock[];
}

export function buildAccessoryCompositionPresentation(
  snapshot: StoreSnapshot,
  storeId: string,
): AccessoryCompositionPresentation {
  const store = requireStore(snapshot, storeId);
  const accStructures = store.coverage.structures.filter(
    s => s.structureKey.startsWith("ACC|"),
  );

  // Build referenceId → metadata lookup from catalog (no DB, no resolution)
  const nameById = new Map<string, string>();
  const imageById = new Map<string, string | null>();
  for (const c of snapshot.referenceCatalog) {
    nameById.set(c.referenceId, c.productName);
    imageById.set(c.referenceId, c.heroImageUrl);
  }

  const sizes: AccessorySizeBlock[] = accStructures.map(s => {
    const target = s.rule.idealUnits;
    const units = s.totalUnits;
    const delta = units - target;
    const deltaState: AccessoryDeltaState =
      delta > 0 ? "over" : delta === 0 ? "exact" : "under";
    const deltaText =
      delta > 0 ? `+${fmtInt(delta)} sobre el objetivo`
      : delta === 0 ? "Objetivo cumplido"
      : `Faltan ${fmtInt(Math.abs(delta))} para el objetivo`;

    const comp: readonly SnapshotFamilyBucket[] = s.compositionByFamily ?? [];
    const families: AccessoryFamilyRow[] = comp.map(b => ({
      key: b.familyKey,
      label: FAMILY_LABEL[b.familyKey] ?? b.familyKey,
      units: b.units,
      refCount: b.refCount,
      percentage: units > 0 ? Math.round((b.units / units) * 100) : 0,
      references: b.references.map(r => ({
        referenceId: r.referenceId,
        referenceCode: r.referenceCode,
        description: nameById.get(r.referenceId) ?? r.referenceCode,
        units: r.units,
        thumbnailUrl: imageById.get(r.referenceId) ?? null,
      })),
    }));

    return {
      structureKey: s.structureKey,
      sizeLabel: SIZE_LABEL[s.structureKey] ?? s.structureKey,
      units,
      target,
      delta,
      deltaState,
      deltaText,
      familyCount: families.length,
      families,
    };
  });

  return { storeId, sizes };
}

// ═════════════════════════════════════════════════════════════════════════════
// Special Products — ESPECIALES transversal view (SPECIAL-PRODUCTS-INVENTORY-01)
// ═════════════════════════════════════════════════════════════════════════════

export interface SpecialProductRulePresentation {
  readonly pattern: string;
  readonly label: string;
  readonly statusKey: string;
  readonly tone: PresentationTone;
  readonly idealUnits: number;
  readonly totalUnits: number;
  readonly gapUnits: number;
  readonly gapText: string;          // "Faltan 1" | "+2 sobre ideal" | "—"
  readonly semanticText: string;     // human explanation of rule status
  readonly matchedReferences: readonly {
    readonly referenceCode: string;
    readonly productName: string;
    readonly units: number;
    readonly thumbnailUrl: string | null;
  }[];
}

export interface SpecialProductsPresentation {
  readonly storeId: string;
  readonly rules: readonly SpecialProductRulePresentation[];
  readonly totalSpecialUnits: number;
  readonly totalSpecialReferences: number;
}

function buildGapText(status: string, gapUnits: number): string {
  if (status === "FALTANTE") return `Faltan ${fmtInt(gapUnits)} para el objetivo`;
  if (status === "EXCEDENTE") return `+${fmtInt(gapUnits)} sobre el objetivo`;
  if (status === "NO_AUTORIZADA") return `+${fmtInt(gapUnits)} sobre el objetivo`;
  return "—";
}

function buildSemanticText(status: string, idealUnits: number, totalUnits: number, label: string): string {
  if (status === "FALTANTE") return `${label}: ${fmtInt(totalUnits)} de ${fmtInt(idealUnits)} uds — faltan ${fmtInt(idealUnits - totalUnits)}`;
  if (status === "EXCEDENTE" || status === "NO_AUTORIZADA") return `${label}: ${fmtInt(totalUnits)} uds (objetivo ${fmtInt(idealUnits)})`;
  return `${label}: objetivo cumplido (${fmtInt(totalUnits)} uds)`;
}

export function buildSpecialProductsPresentation(
  snapshot: StoreSnapshot,
  storeId: string,
): SpecialProductsPresentation {
  const store = requireStore(snapshot, storeId);

  // Build referenceCode → heroImageUrl lookup from catalog (join by code, no DB)
  const imageByCode = new Map<string, string | null>();
  for (const c of snapshot.referenceCatalog) {
    imageByCode.set(c.referenceCode, c.heroImageUrl);
  }

  const rules = store.coverage.specialRules.map(r => ({
    pattern: r.pattern,
    label: r.label,
    statusKey: r.status,
    tone: (SPECIAL_STATUS_TONE[r.status] ?? "neutral") as PresentationTone,
    idealUnits: r.idealUnits,
    totalUnits: r.totalUnits,
    gapUnits: r.gapUnits,
    gapText: buildGapText(r.status, r.gapUnits),
    semanticText: buildSemanticText(r.status, r.idealUnits, r.totalUnits, r.label),
    matchedReferences: r.matchedReferences.map(m => ({
      referenceCode: m.referenceCode,
      productName: m.productName,
      units: m.units,
      thumbnailUrl: imageByCode.get(m.referenceCode) ?? null,
    })),
  }));

  return {
    storeId,
    rules,
    totalSpecialUnits: rules.reduce((s, r) => s + r.totalUnits, 0),
    totalSpecialReferences: rules.reduce((s, r) => s + r.matchedReferences.length, 0),
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
