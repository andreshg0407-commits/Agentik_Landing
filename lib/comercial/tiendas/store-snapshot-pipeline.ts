/**
 * lib/comercial/tiendas/store-snapshot-pipeline.ts
 *
 * AGENTIK-STORES-TRUTH-AUDIT-01 — F2: pipeline del StoreSnapshot.
 *
 * PURO y client-safe. Una corrida = AssembledStoreData (F1) → motores
 * certificados S4 → S5 → S6 → KPIs del diccionario F0 → StoreSnapshot v1.2.
 * El pipeline NO tiene reloj (generatedAt lo adjunta el servicio), NO toca
 * Prisma ni SDS, y NO decide nada que no esté en los motores o en el
 * diccionario certificado.
 *
 * Leyes replicadas VERBATIM del mundo certificado (fuente citada):
 *   - disponibilidad por estructura/tienda: store-structure-availability-service
 *     (eligible/blocked por isRule36Eligible, pool = bodega principal);
 *   - candidatos y pools globales: resolveStructureCandidates (presencia decide
 *     TIPO, jamás elegibilidad; pool global única verdad; mainStock 0 → fuera);
 *   - orden canónico de tiendas: buildCanonicalStorePriorityOrder (permitidas
 *     de escasez primero, luego el orden canónico de ventas), restringido a
 *     las tiendas ACTIVAS de gobernanza (F0-A1: única verdad de tienda);
 *   - ACC: target actúa como min e ideal, sin tope (maxUnits → MAX_SAFE_INTEGER
 *     para el motor, null en el contrato), igual que el coverage-service.
 *
 * La ley de match de compatibilidad NO se replica: se importa del módulo
 * compartido store-structure-compatibility (una sola fuente).
 *
 * Invariantes F0 aplicadas: 1 (un dataAsOf, passthrough), 2 (moduleKpis
 * recomputable), 4 (Regla 36 solo isRule36Eligible), 5 (una sola cifra de
 * cobertura), 6 (unidades agregadas por estructura), 7 (SIN_BASE explícito,
 * cero centinelas), 8 (única entrada: AssembledStoreData), 9 (fingerprint
 * determinista excluyendo generatedAt/metrics/documentRefs).
 *
 * Ajustes del arquitecto (F2): pipelineVersion y rulesVersion como constantes
 * compartidas (store-snapshot-versions) · bloque `extensions` reservado.
 *
 * Certificación: __tests__/store-snapshot-pipeline.test.ts
 */

import {
  STORE_SNAPSHOT_SCHEMA_VERSION,
  SNAPSHOT_PIPELINE_VERSION,
  SNAPSHOT_RULES_VERSION,
} from "./store-snapshot-versions";
import {
  evaluateUnitStructureCoverage,
  evaluateSpecialRules,
  type SpecialRuleEvaluation,
} from "./store-unit-coverage-engine";
import {
  buildStoreUnitNeeds,
  type StoreUnitNeedsResult,
  type StructureAvailability,
} from "./store-unit-needs-engine";
import {
  buildStoreReplenishmentPlan,
  type StoreReplenishmentPlan,
  type ReferencePool,
  type StructureCandidateRef,
  type AllocationCandidateType,
} from "./store-replenishment-allocation-engine";
import type { UnitsRuleEvaluation } from "../derrotero-semantics";
import { isRule36Eligible } from "./store-rule36-eligibility";
import { CANONICAL_SALES_STORES } from "../sales-canonical-source";
import { CASTILLITOS_SPECIAL_PRODUCTS } from "./store-policy-pack-config";
import {
  resolveCatalogInfo,
  findCompatibleRefs,
  type CompatibilityIndex,
} from "./store-structure-compatibility";
import { normalizeCanonicalGroup, normalizeCanonicalSubgroup } from "./classification-normalization";
import {
  canonicalAssemblerJson,
  type AssembledStoreData,
  type AssembledItem,
} from "./store-snapshot-assembler";
import {
  buildStoreNeedsTabPresentation,
  type StoreNeedsTabPresentation,
} from "./store-unit-needs-presentation";

// ═════════════════════════════════════════════════════════════════════════════
// Umbrales de la ley de negocio (D1–D3 del F0, recomendados certificados).
// Cambiarlos = subir SNAPSHOT_RULES_VERSION. La UI jamás posee un umbral.
// ═════════════════════════════════════════════════════════════════════════════

export interface StoreSnapshotThresholds {
  /** D2: estructuras bajo mínimo que vuelven CRITICA a una tienda. */
  readonly healthCritical: number;
  /** D2: NO_AUTORIZADA de severidad alta fuerza CRITICA. */
  readonly unauthorizedHighIsCritical: boolean;
  /** D1: los retiros pendientes cuentan como "requiere atención". */
  readonly attentionIncludesWithdrawals: boolean;
  readonly scarcityThreshold: number;
  readonly allowedStoreIds: readonly string[];
}

const RULES_D1_D2 = {
  healthCritical: 3,
  unauthorizedHighIsCritical: true,
  attentionIncludesWithdrawals: true,
} as const;

// ═════════════════════════════════════════════════════════════════════════════
// Contrato de salida (sin Map — arrays readonly en orden canónico)
// ═════════════════════════════════════════════════════════════════════════════

export interface SnapshotCoverageStructure {
  readonly structureKey: string;
  readonly label: string;
  readonly groupLabel: string | null;
  readonly line: string;
  readonly priority: number;
  readonly refCount: number;
  readonly totalUnits: number;
  readonly rule: { readonly minUnits: number; readonly idealUnits: number; readonly maxUnits: number | null; readonly source: string };
  /** VERBATIM del motor S1/S4. */
  readonly unitRule: UnitsRuleEvaluation;
  readonly structuralCoverageStatus: "CUBIERTA" | "SIN_COBERTURA";
  readonly quantitativeStatus: string;
}

export interface SnapshotStoreCoverage {
  readonly expectedStructures: number;
  readonly healthyStructures: number;
  readonly structures: readonly SnapshotCoverageStructure[];
  readonly specialRules: readonly SpecialRuleEvaluation[];
}

export type SnapshotHealthStatus = "SALUDABLE" | "ATENCION" | "CRITICA";

/** KPIs por tienda — diccionario F0 §4.B (B1–B7). B8 vive en presentación. */
export interface SnapshotStoreKpis {
  /** B1 — única definición de cobertura del módulo. */
  readonly coveragePercent: number | null;
  readonly coverageStatus: "OK" | "SIN_BASE";
  /** B2 (con secundarios: necesidad ≠ disponibilidad ≠ asignación). */
  readonly shortageUnits: number;
  readonly executableUnits: number;
  readonly allocatedUnits: number;
  /** B3. */
  readonly withdrawalUnits: number;
  /** B4/B5 — estructuras, jamás filas variante. */
  readonly criticalStructures: number;
  readonly excessStructures: number;
  /** B7 — semáforo con umbrales del snapshot. */
  readonly healthStatus: SnapshotHealthStatus;
  readonly requiresAttention: boolean;
}

/**
 * F3A (ajuste del arquitecto): estados destinados EXCLUSIVAMENTE a la
 * proyección visual, en bloque independiente — jamás mezclados con KPIs.
 * El PresentationAssembler lee sus estados únicamente de aquí.
 */
export type SnapshotActionKey =
  | "ATENDER_REGLA_ESPECIAL"
  | "SURTIR_Y_RETIRAR"
  | "SURTIR"
  | "RETIRAR"
  | "AL_DIA";

export interface SnapshotStorePresentationHints {
  readonly actionKey: SnapshotActionKey;
  /** Proyección certificada del tab Necesidades (ley del fix NEEDS-SINGLE-SOURCE, verbatim). */
  readonly needs: StoreNeedsTabPresentation;
}

/** Estados visuales de los KPIs de módulo (tono lo mapea el PA, 1:1). */
export interface SnapshotModulePresentationHints {
  readonly requierenAtencion: "ALERTA" | "OK";
  readonly unidadesPorSurtir: "PENDIENTE" | "OK";
  readonly unidadesPorRetirar: "PENDIENTE" | "OK";
  readonly coberturaRed: "OK" | "SIN_BASE";
}

export interface SnapshotPerStore {
  readonly storeId: string;
  readonly displayName: string;
  /** Hechos de inventario de la tienda (paridad visual de cards). */
  readonly inventory: { readonly totalUnits: number; readonly referenceCount: number };
  readonly coverage: SnapshotStoreCoverage;
  /** VERBATIM del motor S5. */
  readonly needs: StoreUnitNeedsResult;
  readonly kpis: SnapshotStoreKpis;
  readonly presentationHints: SnapshotStorePresentationHints;
}

/** KPIs de módulo — diccionario F0 §4.A. A6 lo adjunta el servicio (referencias S7). */
export interface SnapshotModuleKpis {
  readonly tiendasActivas: number;
  readonly requierenAtencion: number;
  readonly unidadesPorSurtir: number;
  readonly unidadesEjecutables: number;
  readonly unidadesAsignadas: number;
  readonly unidadesPorRetirar: number;
  /** A5 — ratio ponderado global; null si la red no tiene base. */
  readonly coberturaRed: number | null;
  readonly documentosAbiertos: number;
}

export interface SnapshotPlanPoolUsage {
  readonly referenceCode: string;
  readonly eligible: number;
  readonly allocated: number;
  readonly remaining: number;
}

export interface SnapshotDocumentRefs {
  readonly openDocumentIds: readonly string[];
  readonly openCount: number;
  readonly lastDocumentNumber: string | null;
}

export interface StoreSnapshot {
  readonly schemaVersion: typeof STORE_SNAPSHOT_SCHEMA_VERSION;
  readonly pipelineVersion: typeof SNAPSHOT_PIPELINE_VERSION;
  readonly rulesVersion: typeof SNAPSHOT_RULES_VERSION;
  readonly organizationId: string;
  /** Huella de la corrida — excluye generatedAt/metrics/documentRefs (inv. 9). */
  readonly fingerprint: string;
  /** Edad real del dato (passthrough del assembled — inv. 1). */
  readonly dataAsOf: string | null;
  /** Reloj de la corrida — lo adjunta el SERVICIO, jamás el pipeline. */
  readonly generatedAt: string | null;
  readonly thresholds: StoreSnapshotThresholds;
  readonly activeStores: readonly { readonly storeId: string; readonly displayName: string }[];
  readonly perStore: readonly SnapshotPerStore[];
  /** Estados visuales de módulo (F3A) — bloque independiente de moduleKpis. */
  readonly presentationHints: SnapshotModulePresentationHints;
  /** VERBATIM del motor S6 (poolUsage serializado sin Map). */
  readonly plan: Omit<StoreReplenishmentPlan, "poolUsage"> & { readonly poolUsage: readonly SnapshotPlanPoolUsage[] };
  readonly moduleKpis: SnapshotModuleKpis;
  /** Solo referencias (ajuste 2 F0) — las adjunta el servicio desde S7. */
  readonly documentRefs: SnapshotDocumentRefs;
  /** Bloque reservado para capacidades futuras (ajuste 5 del arquitecto). */
  readonly extensions: Readonly<Record<string, unknown>>;
}

// ═════════════════════════════════════════════════════════════════════════════
// Fingerprint (inv. 9): JSON canónico + FNV-1a 64 — prefijo declara versiones
// ═════════════════════════════════════════════════════════════════════════════

export function computeSnapshotFingerprint(payload: unknown): string {
  const canonical = canonicalAssemblerJson(payload);
  let h = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const mask = BigInt("0xffffffffffffffff");
  for (let i = 0; i < canonical.length; i++) {
    h = (h ^ BigInt(canonical.charCodeAt(i))) & mask;
    h = (h * prime) & mask;
  }
  return `snap${SNAPSHOT_PIPELINE_VERSION}r${SNAPSHOT_RULES_VERSION}-${h.toString(16).padStart(16, "0")}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// E1 — Índice de compatibilidad desde el assembled (plomería; la ley de match
// es la compartida). Buckets con la MISMA forma de claves del mundo actual.
// ═════════════════════════════════════════════════════════════════════════════

interface RefInfo {
  readonly productName: string;
  readonly grupoSag: string | null;
  readonly subgrupoSag: string | null;
  readonly sizeClass: string | null;
}

function buildRefInfoByCode(assembled: AssembledStoreData): Map<string, RefInfo> {
  const byCode = new Map<string, RefInfo>();
  for (const c of assembled.referenceCatalog) {
    if (!byCode.has(c.referenceCode)) {
      byCode.set(c.referenceCode, {
        productName: c.productName,
        grupoSag: c.grupoSag,
        subgrupoSag: c.subgrupoSag,
        sizeClass: c.sizeClass,
      });
    }
  }
  return byCode;
}

export function buildCompatibilityIndexFromAssembled(
  assembled: AssembledStoreData,
  refInfoByCode: ReadonlyMap<string, RefInfo>,
): CompatibilityIndex {
  const byGroupAndSubgroup = new Map<string, Set<string>>();
  const bySubgroup = new Map<string, Set<string>>();
  const byLineSizeClass = new Map<string, Set<string>>();

  const add = (map: Map<string, Set<string>>, key: string, ref: string) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(ref);
  };

  for (const store of assembled.stores) {
    for (const item of store.items) {
      const info = refInfoByCode.get(item.referenceCode);
      const group = normalizeCanonicalGroup(info?.grupoSag);
      const subgroup = normalizeCanonicalSubgroup(info?.subgrupoSag);
      add(byGroupAndSubgroup, `${item.line}|${group}|${subgroup}`, item.referenceCode);
      add(bySubgroup, `${item.line}|${subgroup}`, item.referenceCode);
      if (info?.sizeClass) add(byLineSizeClass, info.sizeClass, item.referenceCode);
    }
  }
  return { byGroupAndSubgroup, bySubgroup, byLineSizeClass };
}

// ═════════════════════════════════════════════════════════════════════════════
// Orden canónico de tiendas (ley del plan-service, restringida a activas)
// ═════════════════════════════════════════════════════════════════════════════

export function buildSnapshotStoreOrder(assembled: AssembledStoreData): {
  order: string[];
  materialPriorityStoreIds: string[];
} {
  const active = new Set(assembled.activeStores.map(s => s.storeId));
  const material = [...assembled.scarcity.allowedStoreIds];
  const orderedActive: string[] = [];
  for (const id of material) if (active.has(id)) orderedActive.push(id);
  for (const s of CANONICAL_SALES_STORES) {
    if (active.has(s.storeId) && !orderedActive.includes(s.storeId)) orderedActive.push(s.storeId);
  }
  for (const s of assembled.activeStores) {
    if (!orderedActive.includes(s.storeId)) orderedActive.push(s.storeId);
  }
  return { order: orderedActive, materialPriorityStoreIds: material };
}

// ═════════════════════════════════════════════════════════════════════════════
// KPIs (diccionario F0) — funciones puras recomputables (inv. 2)
// ═════════════════════════════════════════════════════════════════════════════

function hasHighSpecialAlert(specialRules: readonly SpecialRuleEvaluation[], onlyUnauthorized: boolean): boolean {
  return specialRules.some(r =>
    r.severity === "high" &&
    (r.status === "NO_AUTORIZADA" || (!onlyUnauthorized && r.status === "FALTANTE")),
  );
}

export function computeStoreKpis(
  coverage: SnapshotStoreCoverage,
  needs: StoreUnitNeedsResult,
  allocatedUnits: number,
  thresholds: StoreSnapshotThresholds,
): SnapshotStoreKpis {
  const expected = coverage.expectedStructures;
  const healthy = coverage.healthyStructures;
  const coverageStatus = expected > 0 ? "OK" as const : "SIN_BASE" as const;
  const coveragePercent = expected > 0 ? Math.round((healthy / expected) * 100) : null;

  const shortageUnits = needs.summary.replenishment.requiredUnits;
  const executableUnits = needs.summary.replenishment.executableUnits;
  const withdrawalUnits = needs.summary.removals.requiredUnits;
  const criticalStructures = coverage.structures.filter(s => s.unitRule.status === "BELOW_MINIMUM").length;
  const excessStructures = coverage.structures.filter(s => s.unitRule.status === "OVER_MAXIMUM").length;

  const specialAlta = coverage.specialRules.some(r => r.severity === "high" && (r.status === "NO_AUTORIZADA" || r.status === "FALTANTE"));
  const requiresAttention =
    criticalStructures > 0 ||
    specialAlta ||
    (thresholds.attentionIncludesWithdrawals && withdrawalUnits > 0);

  const critical =
    criticalStructures >= thresholds.healthCritical ||
    (thresholds.unauthorizedHighIsCritical && hasHighSpecialAlert(coverage.specialRules, true));

  return {
    coveragePercent,
    coverageStatus,
    shortageUnits,
    executableUnits,
    allocatedUnits,
    withdrawalUnits,
    criticalStructures,
    excessStructures,
    healthStatus: critical ? "CRITICA" : requiresAttention ? "ATENCION" : "SALUDABLE",
    requiresAttention,
  };
}

/**
 * F3A — estados visuales por tienda. Función pura, separada de computeStoreKpis
 * (no mezclar hints con KPIs). Precedencia fija certificada.
 */
export function computeStorePresentationHints(
  coverage: SnapshotStoreCoverage,
  needs: StoreUnitNeedsResult,
  needsProjection: StoreNeedsTabPresentation,
): SnapshotStorePresentationHints {
  const shortage = needs.summary.replenishment.requiredUnits;
  const withdrawal = needs.summary.removals.requiredUnits;
  const specialAlta = coverage.specialRules.some(
    r => r.severity === "high" && (r.status === "NO_AUTORIZADA" || r.status === "FALTANTE"),
  );
  const actionKey: SnapshotActionKey = specialAlta
    ? "ATENDER_REGLA_ESPECIAL"
    : shortage > 0 && withdrawal > 0 ? "SURTIR_Y_RETIRAR"
    : shortage > 0 ? "SURTIR"
    : withdrawal > 0 ? "RETIRAR"
    : "AL_DIA";
  return { actionKey, needs: needsProjection };
}

/** F3A — estados visuales de módulo (bloque independiente de moduleKpis). */
export function computeModulePresentationHints(moduleKpis: SnapshotModuleKpis): SnapshotModulePresentationHints {
  return {
    requierenAtencion: moduleKpis.requierenAtencion > 0 ? "ALERTA" : "OK",
    unidadesPorSurtir: moduleKpis.unidadesPorSurtir > 0 ? "PENDIENTE" : "OK",
    unidadesPorRetirar: moduleKpis.unidadesPorRetirar > 0 ? "PENDIENTE" : "OK",
    coberturaRed: moduleKpis.coberturaRed === null ? "SIN_BASE" : "OK",
  };
}

/** A1–A5 recomputables desde perStore (inv. 2). A6 se compone con documentRefs. */
export function computeModuleKpis(
  perStore: readonly SnapshotPerStore[],
  documentosAbiertos: number,
): SnapshotModuleKpis {
  let healthySum = 0;
  let expectedSum = 0;
  for (const s of perStore) {
    if (s.kpis.coverageStatus === "SIN_BASE") continue;   // inv. 7: fuera del denominador
    healthySum += s.coverage.healthyStructures;
    expectedSum += s.coverage.expectedStructures;
  }
  return {
    tiendasActivas: perStore.length,
    requierenAtencion: perStore.filter(s => s.kpis.requiresAttention).length,
    unidadesPorSurtir: perStore.reduce((sum, s) => sum + s.kpis.shortageUnits, 0),
    unidadesEjecutables: perStore.reduce((sum, s) => sum + s.kpis.executableUnits, 0),
    unidadesAsignadas: perStore.reduce((sum, s) => sum + s.kpis.allocatedUnits, 0),
    unidadesPorRetirar: perStore.reduce((sum, s) => sum + s.kpis.withdrawalUnits, 0),
    coberturaRed: expectedSum > 0 ? Math.round((healthySum / expectedSum) * 100) : null,
    documentosAbiertos,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Pipeline principal
// ═════════════════════════════════════════════════════════════════════════════

export function runStoreSnapshotPipeline(assembled: AssembledStoreData): StoreSnapshot {
  const thresholds: StoreSnapshotThresholds = {
    ...RULES_D1_D2,
    scarcityThreshold: assembled.scarcity.threshold,
    allowedStoreIds: [...assembled.scarcity.allowedStoreIds],
  };

  const refInfoByCode = buildRefInfoByCode(assembled);
  const compatIndex = buildCompatibilityIndexFromAssembled(assembled, refInfoByCode);
  const mainStockByCode = new Map<string, number>();
  for (const m of assembled.mainStock) {
    mainStockByCode.set(m.referenceCode, (mainStockByCode.get(m.referenceCode) ?? 0) + m.units);
  }
  const rulesByStoreStructure = new Map<string, (typeof assembled.structureRules)[number]>();
  for (const r of assembled.structureRules) rulesByStoreStructure.set(`${r.storeId}|${r.structureKey}`, r);

  const { order, materialPriorityStoreIds } = buildSnapshotStoreOrder(assembled);
  const itemsByStoreId = new Map(assembled.stores.map(s => [s.storeId, s.items]));
  const displayNameByStore = new Map(assembled.activeStores.map(s => [s.storeId, s.displayName]));

  // ── E2/E3: cobertura (S4) + disponibilidad + necesidades (S5), por tienda ──
  interface StoreStage { coverage: SnapshotStoreCoverage; needs: StoreUnitNeedsResult; itemsWithStock: ReadonlySet<string> }
  const stageByStore = new Map<string, StoreStage>();

  for (const storeId of order) {
    const items: readonly AssembledItem[] = itemsByStoreId.get(storeId) ?? [];
    const unitsByStructure = new Map<string, number[]>();
    const refCountByStructure = new Map<string, number>();
    for (const item of items) {
      if (!item.structureKey) continue;
      if (!unitsByStructure.has(item.structureKey)) unitsByStructure.set(item.structureKey, []);
      unitsByStructure.get(item.structureKey)!.push(item.units);
      refCountByStructure.set(item.structureKey, (refCountByStructure.get(item.structureKey) ?? 0) + 1);
    }

    const structures: SnapshotCoverageStructure[] = assembled.expectedStructures.map(exp => {
      const rule = rulesByStoreStructure.get(`${storeId}|${exp.structureKey}`);
      if (!rule) {
        // El assembler certifica I9 (una regla por estructura×tienda); ausencia = corrupción.
        throw new Error(`[SNAPSHOT_PIPELINE] estructura sin regla efectiva: ${storeId}|${exp.structureKey}`);
      }
      const refUnits = unitsByStructure.get(exp.structureKey) ?? [];
      const cov = evaluateUnitStructureCoverage(refUnits, {
        minUnits: rule.minUnits,
        idealUnits: rule.idealUnits,
        maxUnits: rule.maxUnits ?? Number.MAX_SAFE_INTEGER,   // ley ACC del coverage-service
      });
      return {
        structureKey: exp.structureKey,
        label: exp.label,
        groupLabel: exp.groupLabel,
        line: exp.line,
        priority: exp.priority,
        refCount: refCountByStructure.get(exp.structureKey) ?? 0,
        totalUnits: cov.unitRule.totalUnits,
        rule: { minUnits: rule.minUnits, idealUnits: rule.idealUnits, maxUnits: rule.maxUnits, source: rule.source },
        unitRule: cov.unitRule,
        structuralCoverageStatus: cov.structuralStatus,
        quantitativeStatus: cov.quantitativeStatus,
      };
    });

    const specialRules = evaluateSpecialRules(
      storeId,
      items.map(i => ({
        referenceCode: i.referenceCode,
        productName: refInfoByCode.get(i.referenceCode)?.productName ?? i.referenceCode,
        currentUnits: i.units,
      })),
      CASTILLITOS_SPECIAL_PRODUCTS,
    );

    // Disponibilidad solo para estructuras con déficit (ley del unit-needs-service)
    const availability = new Map<string, StructureAvailability>();
    for (const s of structures) {
      if (s.unitRule.deficitToIdeal <= 0) continue;
      const catalogInfo = resolveCatalogInfo(s.structureKey);
      if (!catalogInfo) continue;                       // ausencia → SIN_DATOS (motor S5)
      const compatible = findCompatibleRefs(catalogInfo, compatIndex);
      let eligibleUnits = 0;
      let blockedUnits = 0;
      for (const ref of compatible) {
        const mainStock = mainStockByCode.get(ref) ?? 0;
        if (mainStock <= 0) continue;
        const eligible = isRule36Eligible({
          mainStockUnits: mainStock,
          scarcityThreshold: thresholds.scarcityThreshold,
          destinationStoreId: storeId,
          allowedStoreIds: [...thresholds.allowedStoreIds],
        });
        if (eligible) eligibleUnits += mainStock;
        else blockedUnits += mainStock;
      }
      availability.set(s.structureKey, {
        status: "CONOCIDA",
        eligibleUnits,
        blockedUnits,
        totalUnits: eligibleUnits + blockedUnits,
      });
    }

    const needs = buildStoreUnitNeeds({
      storeId,
      structures: structures.map(s => ({
        structureKey: s.structureKey,
        label: s.label,
        line: s.line,
        structuralCoverageStatus: s.structuralCoverageStatus,
        unitRule: s.unitRule,
      })),
      specialRules,
      availability,
    });

    stageByStore.set(storeId, {
      coverage: {
        expectedStructures: structures.length,
        healthyStructures: structures.filter(s => s.quantitativeStatus === "SALUDABLE").length,
        structures,
        specialRules,
      },
      needs,
      itemsWithStock: new Set(items.map(i => i.referenceCode)),
    });
  }

  // ── E4: pools + candidatos (ley verbatim del proveedor) + plan (S6) ──
  const needsByStore = new Map<string, StoreUnitNeedsResult>();
  for (const storeId of order) needsByStore.set(storeId, stageByStore.get(storeId)!.needs);

  const structureKeys = new Set<string>();
  const uncoveredByStore = new Map<string, Set<string>>();
  for (const [storeId, result] of needsByStore) {
    const uncovered = new Set<string>();
    for (const n of result.needs) {
      if (n.action !== "REPOSICION") continue;
      if (n.source !== "ESTRUCTURA") continue;
      structureKeys.add(n.structureKey);
      if (n.priorityClass === "NO_COVERAGE") uncovered.add(n.structureKey);
    }
    uncoveredByStore.set(storeId, uncovered);
  }

  const referencePools = new Map<string, ReferencePool>();
  const candidatesByStructure = new Map<string, StructureCandidateRef[]>();
  for (const structureKey of structureKeys) {
    const catalogInfo = resolveCatalogInfo(structureKey);
    if (!catalogInfo) continue;
    const compatible = findCompatibleRefs(catalogInfo, compatIndex);
    const candidates: StructureCandidateRef[] = [];
    for (const ref of compatible) {
      const mainStock = mainStockByCode.get(ref) ?? 0;
      if (mainStock <= 0) continue;
      if (!referencePools.has(ref)) {
        referencePools.set(ref, {
          eligibleUnits: mainStock,
          productName: refInfoByCode.get(ref)?.productName ?? ref,
          underScarcityThreshold: mainStock <= thresholds.scarcityThreshold,
        });
      }
      const candidateTypeByStore = new Map<string, AllocationCandidateType>();
      for (const storeId of order) {
        const eligible = isRule36Eligible({
          mainStockUnits: mainStock,
          scarcityThreshold: thresholds.scarcityThreshold,
          destinationStoreId: storeId,
          allowedStoreIds: [...thresholds.allowedStoreIds],
        });
        if (!eligible) continue;
        const present = stageByStore.get(storeId)!.itemsWithStock.has(ref);
        const uncovered = uncoveredByStore.get(storeId)?.has(structureKey) ?? false;
        candidateTypeByStore.set(
          storeId,
          present ? "REPOSICION_MISMA_REFERENCIA"
            : uncovered ? "REFERENCIA_NUEVA_COMPATIBLE"
            : "COMPLEMENTO_REFERENCIA_COMPATIBLE",
        );
      }
      if (candidateTypeByStore.size > 0) candidates.push({ referenceCode: ref, candidateTypeByStore });
    }
    candidatesByStructure.set(structureKey, candidates);
  }

  const plan = buildStoreReplenishmentPlan({
    storePriorityOrder: order,
    materialPriorityStoreIds,
    needsByStore,
    referencePools,
    candidatesByStructure,
  });

  // ── E5: KPIs del diccionario ──
  const allocatedByStore = new Map(plan.summaryByStore.map(s => [s.storeId, s.allocatedUnits]));
  const perStore: SnapshotPerStore[] = [...assembled.activeStores]
    .sort((a, b) => a.storeId.localeCompare(b.storeId))
    .map(gov => {
      const stage = stageByStore.get(gov.storeId)!;
      const storeInventory = itemsByStoreId.get(gov.storeId) ?? [];
      // Proyección certificada del tab Necesidades (fix NEEDS-SINGLE-SOURCE, verbatim)
      const needsProjection = buildStoreNeedsTabPresentation(plan, stage.needs);
      return {
        storeId: gov.storeId,
        displayName: displayNameByStore.get(gov.storeId) ?? gov.storeId,
        inventory: {
          totalUnits: storeInventory.reduce((s, i) => s + i.units, 0),
          referenceCount: storeInventory.length,
        },
        coverage: stage.coverage,
        needs: stage.needs,
        kpis: computeStoreKpis(stage.coverage, stage.needs, allocatedByStore.get(gov.storeId) ?? 0, thresholds),
        presentationHints: computeStorePresentationHints(stage.coverage, stage.needs, needsProjection),
      };
    });

  const moduleKpis = computeModuleKpis(perStore, 0);   // A6 real lo adjunta el servicio

  // ── E6: serialización canónica + fingerprint (inv. 9) ──
  const poolUsage: SnapshotPlanPoolUsage[] = [...plan.poolUsage.entries()]
    .map(([referenceCode, u]) => ({ referenceCode, eligible: u.eligible, allocated: u.allocated, remaining: u.remaining }))
    .sort((a, b) => a.referenceCode.localeCompare(b.referenceCode));
  const { poolUsage: _rawPool, ...planRest } = plan;
  void _rawPool;

  const payload = {
    schemaVersion: STORE_SNAPSHOT_SCHEMA_VERSION,
    pipelineVersion: SNAPSHOT_PIPELINE_VERSION,
    rulesVersion: SNAPSHOT_RULES_VERSION,
    organizationId: assembled.organizationId,
    dataAsOf: assembled.dataAsOf,
    thresholds,
    activeStores: [...assembled.activeStores].sort((a, b) => a.storeId.localeCompare(b.storeId)),
    perStore,
    presentationHints: computeModulePresentationHints(moduleKpis),
    plan: { ...planRest, poolUsage },
    moduleKpis,
  };

  return {
    ...payload,
    fingerprint: computeSnapshotFingerprint(payload),
    generatedAt: null,                                   // lo adjunta el servicio
    documentRefs: { openDocumentIds: [], openCount: 0, lastDocumentNumber: null },
    extensions: {},
  };
}

/**
 * Adjunta las referencias de documentos (S7) y finaliza A6 — función pura,
 * recomputable en suite (inv. 2). El fingerprint NO cambia (inv. 9).
 */
export function attachDocumentRefs(
  snapshot: StoreSnapshot,
  documentRefs: SnapshotDocumentRefs,
): StoreSnapshot {
  return {
    ...snapshot,
    documentRefs,
    moduleKpis: { ...snapshot.moduleKpis, documentosAbiertos: documentRefs.openCount },
  };
}
