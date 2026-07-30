/**
 * lib/comercial/tiendas/store-snapshot-assembler.ts
 *
 * AGENTIK-STORES-TRUTH-AUDIT-01 — F1: StoreSnapshotAssembler.
 *
 * Único punto del futuro pipeline StoreSnapshot que transforma datos crudos
 * (inventario + gobernanza + políticas) en el insumo exacto de los motores
 * certificados S4–S6. PURO y client-safe: sin Prisma, sin reloj, sin
 * decisiones de negocio — ANOTA, NO DECIDE (cero déficits, cero acciones,
 * cero Regla 36, cero exclusiones aplicadas; solo hechos y flags).
 *
 * Ajustes del arquitecto incorporados (F1 aprobado, 30 jul 2026):
 *   1. Metadata estática separada de datos operacionales:
 *      `referenceCatalog` (estático) vs `stores[].items` (operacional).
 *   2. Contrato público SIN Map: arrays readonly en orden canónico.
 *      Los Map son exclusivamente internos a la implementación.
 *   3. Identidad principal estable: `referenceId` (productId cuando existe,
 *      con origen declarado). `referenceCode` queda como dato de negocio.
 *   4. Invariantes I8 (una estructura por item — AMBIGUOUS_STRUCTURE si un
 *      item resuelve a más de un punto del derrotero) e I9 (una regla
 *      efectiva por estructura — DUPLICATE_STRUCTURE_RULE si colisionan).
 *   5. Fingerprint verificable: `fingerprint` determinista (JSON canónico +
 *      FNV-1a 64) — el script A/B lo verifica corrida contra corrida.
 *
 * Invariantes certificados por la suite:
 *   I1 pureza/determinismo (misma entrada → misma salida byte a byte;
 *      dataAsOf sale de las filas, jamás de un reloj).
 *   I2 cuadre contable (Σ unidades de entrada no descartadas = Σ salida,
 *      por tienda; postcondición con error tipado).
 *   I3 anota-no-decide.
 *   I4 NOT_FOUND ≠ 0 (toda tienda activa existe como entrada, con items []
 *      explícito; una fila de tienda inactiva jamás crea una entrada).
 *   I5 bodega principal separada (mainStock nunca contamina itemsByStore).
 *   I6 thresholds solo desde políticas efectivas (persistida > pack default,
 *      con vigencia evaluada contra readAt del source, no contra un reloj).
 *   I7 verbatim hacia arriba (gobernanza, catálogo, escasez sin recalcular).
 *   I8 una estructura por item.  I9 una regla efectiva por estructura.
 *
 * Consumidor autorizado: exclusivamente el StoreSnapshotService (F2).
 * Prohibido importar store-distribution-service aquí (obs. 3 del F0).
 *
 * Certificación: lib/comercial/tiendas/__tests__/store-snapshot-assembler.test.ts
 */

import { isSpecialCollectionReference } from "../commercial-exclusions";
import { resolveBusinessLineId } from "./store-business-lines";
import {
  CASTILLITOS_TEXTILE_COVERAGE,
  LATIN_KIDS_TEXTILE_COVERAGE,
  CASTILLITOS_ACCESSORY_COVERAGE,
  CASTILLITOS_GLOBAL_LOW_STOCK,
} from "./store-policy-pack-config";
import {
  buildCastillitosTextilCatalog,
  buildLatinKidsTextilCatalog,
  buildImportAccesoriosCatalog,
} from "../maletas/assortment-catalog/castillitos-mallet-assortment-catalog";

// ═════════════════════════════════════════════════════════════════════════════
// Versión y errores
// ═════════════════════════════════════════════════════════════════════════════

export const ASSEMBLER_VERSION = 1 as const;

export type SnapshotSourceIntegrityCode =
  | "EMPTY_GOVERNANCE"
  | "NEGATIVE_UNITS"
  | "DUPLICATE_VARIANT"
  | "MAIN_WAREHOUSE_AS_STORE"
  | "AMBIGUOUS_STRUCTURE"
  | "DUPLICATE_STRUCTURE_RULE"
  | "MISSING_LINE_RULE"
  | "UNITS_RECONCILIATION_FAILED";

/** Fallo TOTAL, tipado (patrón S5): jamás resultados parciales. */
export class SnapshotSourceIntegrityError extends Error {
  readonly code: SnapshotSourceIntegrityCode;
  readonly detail: string;
  readonly metadata: Record<string, unknown>;

  constructor(code: SnapshotSourceIntegrityCode, detail: string, metadata: Record<string, unknown> = {}) {
    super(`[${code}] ${detail}`);
    this.name = "SnapshotSourceIntegrityError";
    this.code = code;
    this.detail = detail;
    this.metadata = metadata;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Contrato de ENTRADA (filas crudas del source-service, readonly)
// ═════════════════════════════════════════════════════════════════════════════

export interface SnapshotInventoryRow {
  /** Resuelto por el source-service vía warehouse-master. */
  readonly warehouseKind: "STORE" | "MAIN";
  /** slug de gobernanza cuando STORE; null cuando MAIN. */
  readonly storeId: string | null;
  readonly warehousePk: string;
  readonly referenceCode: string;
  readonly productId: string | null;
  readonly productName: string | null;
  /** Identidad de la variante (sku de variante o compuesta talla|color). */
  readonly variantKey: string;
  /** Unidades disponibles (quantity − reserved, ya acotado ≥ 0 por el source). */
  readonly units: number;
  readonly grupoSag: string | null;
  readonly subgrupoSag: string | null;
  /** Código SAG crudo de línea; la línea canónica se resuelve aquí. */
  readonly productLine: string | null;
  readonly handlingUnit: string | null;
  /** ISO — centinela SAG 1900-01-01 se normaliza a null aquí. */
  readonly createdAtSag: string | null;
  readonly heroImageUrl: string | null;
  readonly updatedAt: string | null;
}

export interface SnapshotGovernanceStore {
  readonly storeId: string;
  readonly displayName: string;
}

/** Subconjunto verbatim de StorePolicyRule que la ley de vigencia necesita. */
export interface SnapshotPolicyRule {
  readonly scope: string;
  readonly line?: string;
  readonly sizeClass?: string;
  readonly minQty: number;
  readonly idealQty: number;
  readonly maxQty: number;
  readonly active: boolean;
  readonly validFrom?: string | null;
  readonly validTo?: string | null;
}

export interface SnapshotSourceRows {
  readonly organizationId: string;
  /** Reloj del source AL LEER — solo para vigencia de políticas (I6). */
  readonly readAt: string;
  readonly inventoryRows: readonly SnapshotInventoryRow[];
  readonly governanceStores: readonly SnapshotGovernanceStore[];
  readonly policyRulesByStore: readonly {
    readonly storeId: string;
    readonly rules: readonly SnapshotPolicyRule[];
  }[];
}

// ═════════════════════════════════════════════════════════════════════════════
// Contrato de SALIDA (sin Map — arrays readonly en orden canónico; obs. 2)
// ═════════════════════════════════════════════════════════════════════════════

export type ReferenceIdentitySource = "PRODUCT_ID" | "REFERENCE_CODE";

/** OPERACIONAL — lo que cambia con cada sincronización de inventario. */
export interface AssembledItem {
  /** Identidad principal estable (obs. 3). */
  readonly referenceId: string;
  readonly identitySource: ReferenceIdentitySource;
  /** Dato de negocio, no identidad. */
  readonly referenceCode: string;
  readonly units: number;
  readonly variantCount: number;
  readonly line: string;
  /** Exactamente UNA estructura o ninguna (I8). */
  readonly structureKey: string | null;
  readonly flags: { readonly isSpecialCollection: boolean };
}

export interface AssembledStoreInventory {
  readonly storeId: string;
  readonly items: readonly AssembledItem[];
  /** Σ items.units — cuadre certificado (I2). */
  readonly totalUnits: number;
}

/** ESTÁTICO — metadata de referencia, separada de lo operacional (obs. 1). */
export interface ReferenceCatalogEntry {
  readonly referenceId: string;
  readonly identitySource: ReferenceIdentitySource;
  readonly referenceCode: string;
  readonly productName: string;
  readonly grupoSag: string | null;
  readonly subgrupoSag: string | null;
  readonly sizeClass: string | null;
  readonly heroImageUrl: string | null;
  readonly entryDate: string | null;
}

export interface AssembledMainStockEntry {
  readonly referenceId: string;
  readonly referenceCode: string;
  readonly units: number;
}

export interface StructureRule {
  readonly storeId: string;
  readonly structureKey: string;
  readonly line: string;
  readonly label: string;
  readonly minUnits: number;
  readonly idealUnits: number;
  readonly maxUnits: number | null;
  readonly source: "PACK_DEFAULT" | "POLICY_OVERRIDE";
}

export interface ExpectedStructure {
  readonly structureKey: string;
  readonly label: string;
  readonly groupLabel: string | null;
  readonly line: string;
  readonly priority: number;
}

export type DroppedRowReason = "STORE_INACTIVE" | "MISSING_REFERENCE";

export interface AssembledStoreData {
  readonly assemblerVersion: typeof ASSEMBLER_VERSION;
  readonly organizationId: string;
  /** max(updatedAt) de las filas — jamás un reloj (I1). */
  readonly dataAsOf: string | null;
  /** `asm1-<fnv64>` sobre el JSON canónico del resto del objeto (obs. 5). */
  readonly fingerprint: string;
  readonly activeStores: readonly SnapshotGovernanceStore[];
  readonly stores: readonly AssembledStoreInventory[];
  readonly referenceCatalog: readonly ReferenceCatalogEntry[];
  readonly mainStock: readonly AssembledMainStockEntry[];
  readonly structureRules: readonly StructureRule[];
  readonly expectedStructures: readonly ExpectedStructure[];
  readonly scarcity: {
    readonly threshold: number;
    readonly allowedStoreIds: readonly string[];
  };
  readonly dropped: {
    readonly count: number;
    readonly byReason: readonly { readonly reason: DroppedRowReason; readonly count: number }[];
  };
  /** Items visibles SIN punto del derrotero (no descartados — sin silencios). */
  readonly unresolvedStructure: readonly {
    readonly storeId: string;
    readonly referenceCode: string;
    readonly grupoSag: string | null;
    readonly subgrupoSag: string | null;
  }[];
}

// ═════════════════════════════════════════════════════════════════════════════
// Normalización (ley trasladada a su casa canónica; copias legacy mueren en F6)
// ═════════════════════════════════════════════════════════════════════════════

const HANDLING_UNIT_TO_SIZE_CLASS: Record<string, string> = {
  PEQUENO: "small",
  MEDIANO: "medium",
  GRANDE: "large",
};

export function resolveSizeClass(handlingUnit: string | null | undefined): string | null {
  if (!handlingUnit) return null;
  return HANDLING_UNIT_TO_SIZE_CLASS[handlingUnit] ?? null;
}

/** Centinela SAG (dd_fch_primer_vez = 1900-01-01) → null. */
const SAG_SENTINEL_ISO = "1900-01-02T00:00:00.000Z";

export function resolveEntryDate(createdAtSag: string | null | undefined): string | null {
  if (!createdAtSag) return null;
  return createdAtSag < SAG_SENTINEL_ISO ? null : createdAtSag;
}

// ═════════════════════════════════════════════════════════════════════════════
// JSON canónico + FNV-1a 64 (fingerprint determinista; obs. 5)
// ═════════════════════════════════════════════════════════════════════════════

export function canonicalAssemblerJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(v => canonicalAssemblerJson(v)).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys.map(k => `${JSON.stringify(k)}:${canonicalAssemblerJson((value as Record<string, unknown>)[k])}`);
  return `{${parts.join(",")}}`;
}

export function computeAssembledFingerprint(payload: unknown): string {
  const canonical = canonicalAssemblerJson(payload);
  let h = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const mask = BigInt("0xffffffffffffffff");
  for (let i = 0; i < canonical.length; i++) {
    h = (h ^ BigInt(canonical.charCodeAt(i))) & mask;
    h = (h * prime) & mask;
  }
  return `asm${ASSEMBLER_VERSION}-${h.toString(16).padStart(16, "0")}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// Catálogo de estructuras: universo esperado + lookup inverso (interno)
// ═════════════════════════════════════════════════════════════════════════════

interface StructureCatalogInfo {
  readonly structureKey: string;
  readonly label: string;
  readonly groupLabel: string | null;
  readonly line: string;
  readonly priority: number;
  /** ACC: talla que gobierna el target por tamaño; null para textil. */
  readonly accSize: string | null;
}

interface StructureLookup {
  readonly expected: ExpectedStructure[];
  /** "GRUPO|SUBGRUPO" (mayúsculas) → estructura CS. */
  readonly csByMatchKey: Map<string, StructureCatalogInfo>;
  /** "SUBGRUPO" (mayúsculas) → estructura LK. */
  readonly lkBySubgroup: Map<string, StructureCatalogInfo>;
  /** sizeClass (small|medium|large) → estructura ACC. */
  readonly accBySize: Map<string, StructureCatalogInfo>;
  readonly byKey: Map<string, StructureCatalogInfo>;
}

function buildMatchKeys(sagGrupo: string | null, sagSubgrupo: string | string[] | null): string[] {
  if (!sagGrupo || !sagSubgrupo) return [];
  const grupo = sagGrupo.toUpperCase();
  if (Array.isArray(sagSubgrupo)) return sagSubgrupo.map(s => `${grupo}|${s.toUpperCase()}`);
  return [`${grupo}|${sagSubgrupo.toUpperCase()}`];
}

export function buildStructureLookup(): StructureLookup {
  const expected: ExpectedStructure[] = [];
  const csByMatchKey = new Map<string, StructureCatalogInfo>();
  const lkBySubgroup = new Map<string, StructureCatalogInfo>();
  const accBySize = new Map<string, StructureCatalogInfo>();
  const byKey = new Map<string, StructureCatalogInfo>();

  const register = (info: StructureCatalogInfo) => {
    if (byKey.has(info.structureKey)) {
      throw new SnapshotSourceIntegrityError(
        "DUPLICATE_STRUCTURE_RULE",
        `El catálogo define dos veces la estructura ${info.structureKey}`,
        { structureKey: info.structureKey },
      );
    }
    byKey.set(info.structureKey, info);
    expected.push({
      structureKey: info.structureKey,
      label: info.label,
      groupLabel: info.groupLabel,
      line: info.line,
      priority: info.priority,
    });
  };

  // CS — clave GRUPO|SUBGRUPO (con merges tipo BUZO/CAMIBUSO)
  for (const group of buildCastillitosTextilCatalog().groups) {
    for (const entry of group.entries) {
      if (!entry.active) continue;
      const info: StructureCatalogInfo = {
        structureKey: `CS|${group.sagGrupo}|${entry.subgroupName}`,
        label: entry.subgroupName,
        groupLabel: group.groupName,
        line: "castillitos",
        priority: entry.priority,
        accSize: null,
      };
      register(info);
      for (const key of buildMatchKeys(group.sagGrupo, entry.sagSubgrupo)) {
        csByMatchKey.set(key, info);
      }
    }
  }

  // LK — clave SUBGRUPO
  for (const group of buildLatinKidsTextilCatalog().groups) {
    for (const entry of group.entries) {
      if (!entry.active) continue;
      const info: StructureCatalogInfo = {
        structureKey: `LK|${entry.subgroupName}`,
        label: entry.subgroupName,
        groupLabel: null,
        line: "latin_kids",
        priority: entry.priority,
        accSize: null,
      };
      register(info);
      const subKey = typeof entry.sagSubgrupo === "string" ? entry.sagSubgrupo.toUpperCase() : null;
      if (subKey) lkBySubgroup.set(subKey, info);
    }
  }

  // ACC — clave sizeClass (small|medium|large vía subgroupCode)
  for (const group of buildImportAccesoriosCatalog().groups) {
    for (const entry of group.entries) {
      if (!entry.active) continue;
      const sc = entry.subgroupCode ? HANDLING_UNIT_TO_SIZE_CLASS[entry.subgroupCode.toUpperCase()] ?? null : null;
      const info: StructureCatalogInfo = {
        structureKey: `ACC|${entry.subgroupName}`,
        label: entry.subgroupName,
        groupLabel: "ACCESORIOS",
        line: "accesorios_importacion",
        priority: entry.priority,
        accSize: sc,
      };
      register(info);
      if (sc) accBySize.set(sc, info);
    }
  }

  return { expected, csByMatchKey, lkBySubgroup, accBySize, byKey };
}

/**
 * Resuelve LA estructura de un item (I8). Candidatos por las tres vías del
 * catálogo; más de una estructura DISTINTA → AMBIGUOUS_STRUCTURE (fallo total).
 */
function resolveItemStructure(
  lookup: StructureLookup,
  args: { referenceCode: string; grupoSag: string | null; subgrupoSag: string | null; sizeClass: string | null },
): StructureCatalogInfo | null {
  const candidates = new Map<string, StructureCatalogInfo>();

  if (
    args.grupoSag && args.grupoSag !== "SIN_GRUPO_SAG" &&
    args.subgrupoSag && args.subgrupoSag !== "SIN_SUBGRUPO_SAG"
  ) {
    const cs = lookup.csByMatchKey.get(`${args.grupoSag.toUpperCase()}|${args.subgrupoSag.toUpperCase()}`);
    if (cs) candidates.set(cs.structureKey, cs);
  }
  if (args.subgrupoSag && args.subgrupoSag !== "SIN_SUBGRUPO_SAG") {
    const lk = lookup.lkBySubgroup.get(args.subgrupoSag.toUpperCase());
    if (lk) candidates.set(lk.structureKey, lk);
  }
  if (args.sizeClass) {
    const acc = lookup.accBySize.get(args.sizeClass);
    if (acc) candidates.set(acc.structureKey, acc);
  }

  if (candidates.size > 1) {
    throw new SnapshotSourceIntegrityError(
      "AMBIGUOUS_STRUCTURE",
      `La referencia ${args.referenceCode} resuelve a ${candidates.size} estructuras (${[...candidates.keys()].join(", ")}) — invariante I8: una estructura por item`,
      { referenceCode: args.referenceCode, structureKeys: [...candidates.keys()] },
    );
  }
  return candidates.size === 1 ? [...candidates.values()][0] : null;
}

// ═════════════════════════════════════════════════════════════════════════════
// Reglas efectivas por estructura (I6 + I9) — ley de vigencia replicada
// verbatim de la config certificada (persistida > pack default)
// ═════════════════════════════════════════════════════════════════════════════

function isRuleInForce(rule: SnapshotPolicyRule, readAt: string): boolean {
  if (rule.validFrom && rule.validFrom > readAt) return false;
  if (rule.validTo && rule.validTo < readAt) return false;
  return true;
}

function resolveTextileRule(
  rules: readonly SnapshotPolicyRule[],
  lineId: string,
  defaults: { minimumUnits: number; idealUnits: number; maximumUnits: number },
  readAt: string,
): { minUnits: number; idealUnits: number; maxUnits: number; source: StructureRule["source"] } {
  const override = rules.find(r => r.active && r.scope === "line" && r.line === lineId);
  if (override && isRuleInForce(override, readAt)) {
    return { minUnits: override.minQty, idealUnits: override.idealQty, maxUnits: override.maxQty, source: "POLICY_OVERRIDE" };
  }
  return { minUnits: defaults.minimumUnits, idealUnits: defaults.idealUnits, maxUnits: defaults.maximumUnits, source: "PACK_DEFAULT" };
}

function resolveAccessoryTarget(
  rules: readonly SnapshotPolicyRule[],
  sizeClass: string,
  defaultTarget: number,
  readAt: string,
): { target: number; source: StructureRule["source"] } {
  const override = rules.find(r => r.active && r.scope === "class_size" && r.sizeClass === sizeClass);
  if (override && isRuleInForce(override, readAt)) {
    return { target: override.idealQty, source: "POLICY_OVERRIDE" };
  }
  return { target: defaultTarget, source: "PACK_DEFAULT" };
}

// ═════════════════════════════════════════════════════════════════════════════
// Ensamblador principal
// ═════════════════════════════════════════════════════════════════════════════

export function assembleSnapshotSource(source: SnapshotSourceRows): AssembledStoreData {
  // ── Gobernanza: única verdad de tienda activa (I4/I7) ──
  if (source.governanceStores.length === 0) {
    throw new SnapshotSourceIntegrityError("EMPTY_GOVERNANCE", "Gobernanza sin tiendas activas — no hay universo sobre el cual ensamblar", { organizationId: source.organizationId });
  }
  const activeStoreIds = new Set(source.governanceStores.map(s => s.storeId));

  const lookup = buildStructureLookup();

  // ── Acumuladores internos (Map SOLO aquí; obs. 2) ──
  interface ItemAcc {
    referenceId: string;
    identitySource: ReferenceIdentitySource;
    referenceCode: string;
    units: number;
    variantCount: number;
    line: string;
    grupoSag: string | null;
    subgrupoSag: string | null;
    sizeClass: string | null;
  }
  const itemsByStore = new Map<string, Map<string, ItemAcc>>();
  for (const s of source.governanceStores) itemsByStore.set(s.storeId, new Map());
  const mainStockAcc = new Map<string, { referenceId: string; referenceCode: string; units: number }>();
  const catalogAcc = new Map<string, ReferenceCatalogEntry>();
  const seenVariants = new Set<string>();
  const droppedByReason = new Map<DroppedRowReason, number>();
  const inputUnitsByStore = new Map<string, number>();
  let dataAsOf: string | null = null;

  const drop = (reason: DroppedRowReason) => droppedByReason.set(reason, (droppedByReason.get(reason) ?? 0) + 1);

  for (const row of source.inventoryRows) {
    // Validaciones duras — fallo total
    if (row.units < 0) {
      throw new SnapshotSourceIntegrityError("NEGATIVE_UNITS", `Unidades negativas (${row.units}) en ${row.referenceCode} · bodega ${row.warehousePk}`, { referenceCode: row.referenceCode, warehousePk: row.warehousePk, units: row.units });
    }
    if (row.warehouseKind === "MAIN" && row.storeId !== null) {
      throw new SnapshotSourceIntegrityError("MAIN_WAREHOUSE_AS_STORE", `Bodega principal ${row.warehousePk} presentada como tienda ${row.storeId}`, { warehousePk: row.warehousePk, storeId: row.storeId });
    }
    if (row.warehouseKind === "STORE" && row.storeId === null) {
      throw new SnapshotSourceIntegrityError("MAIN_WAREHOUSE_AS_STORE", `Fila de tienda sin storeId (bodega ${row.warehousePk})`, { warehousePk: row.warehousePk });
    }

    if (!row.referenceCode) { drop("MISSING_REFERENCE"); continue; }
    if (row.warehouseKind === "STORE" && !activeStoreIds.has(row.storeId!)) { drop("STORE_INACTIVE"); continue; }

    if (row.updatedAt && (dataAsOf === null || row.updatedAt > dataAsOf)) dataAsOf = row.updatedAt;

    const referenceCode = row.referenceCode.toUpperCase();
    const referenceId = row.productId ?? `code:${referenceCode}`;
    const identitySource: ReferenceIdentitySource = row.productId ? "PRODUCT_ID" : "REFERENCE_CODE";
    const sizeClass = resolveSizeClass(row.handlingUnit);

    // Catálogo estático (obs. 1): first-wins + primer no-nulo para opcionales
    const existing = catalogAcc.get(referenceId);
    if (!existing) {
      catalogAcc.set(referenceId, {
        referenceId,
        identitySource,
        referenceCode,
        productName: row.productName ?? referenceCode,
        grupoSag: row.grupoSag,
        subgrupoSag: row.subgrupoSag,
        sizeClass,
        heroImageUrl: row.heroImageUrl,
        entryDate: resolveEntryDate(row.createdAtSag),
      });
    } else if (!existing.heroImageUrl && row.heroImageUrl) {
      catalogAcc.set(referenceId, { ...existing, heroImageUrl: row.heroImageUrl });
    }

    if (row.warehouseKind === "MAIN") {
      // I5 — bodega principal separada
      const acc = mainStockAcc.get(referenceId);
      if (acc) acc.units += row.units;
      else mainStockAcc.set(referenceId, { referenceId, referenceCode, units: row.units });
      continue;
    }

    // Tienda — duplicado exacto de variante = fuente corrupta
    const variantId = `${row.storeId}::${referenceId}::${row.variantKey}`;
    if (seenVariants.has(variantId)) {
      throw new SnapshotSourceIntegrityError("DUPLICATE_VARIANT", `Variante duplicada ${row.variantKey} de ${referenceCode} en ${row.storeId}`, { storeId: row.storeId, referenceCode, variantKey: row.variantKey });
    }
    seenVariants.add(variantId);

    inputUnitsByStore.set(row.storeId!, (inputUnitsByStore.get(row.storeId!) ?? 0) + row.units);

    const storeItems = itemsByStore.get(row.storeId!)!;
    const item = storeItems.get(referenceId);
    if (item) {
      item.units += row.units;
      item.variantCount += 1;
    } else {
      storeItems.set(referenceId, {
        referenceId,
        identitySource,
        referenceCode,
        units: row.units,
        variantCount: 1,
        line: resolveBusinessLineId(row.productLine),
        grupoSag: row.grupoSag,
        subgrupoSag: row.subgrupoSag,
        sizeClass,
      });
    }
  }

  // ── Estructura por item (I8) + salida canónica ──
  const unresolvedStructure: AssembledStoreData["unresolvedStructure"][number][] = [];
  const stores: AssembledStoreInventory[] = [...source.governanceStores]
    .sort((a, b) => a.storeId.localeCompare(b.storeId))
    .map(gov => {
      const accs = [...itemsByStore.get(gov.storeId)!.values()]
        .sort((a, b) => a.referenceId.localeCompare(b.referenceId) || a.referenceCode.localeCompare(b.referenceCode));
      const items: AssembledItem[] = accs.map(acc => {
        const structure = resolveItemStructure(lookup, {
          referenceCode: acc.referenceCode,
          grupoSag: acc.grupoSag,
          subgrupoSag: acc.subgrupoSag,
          sizeClass: acc.sizeClass,
        });
        if (!structure) {
          unresolvedStructure.push({ storeId: gov.storeId, referenceCode: acc.referenceCode, grupoSag: acc.grupoSag, subgrupoSag: acc.subgrupoSag });
        }
        return {
          referenceId: acc.referenceId,
          identitySource: acc.identitySource,
          referenceCode: acc.referenceCode,
          units: acc.units,
          variantCount: acc.variantCount,
          line: acc.line,
          structureKey: structure?.structureKey ?? null,
          flags: { isSpecialCollection: isSpecialCollectionReference(acc.referenceCode) },
        };
      });
      const totalUnits = items.reduce((s, i) => s + i.units, 0);

      // I2 — cuadre contable por tienda, postcondición dura
      const expectedTotal = inputUnitsByStore.get(gov.storeId) ?? 0;
      if (totalUnits !== expectedTotal) {
        throw new SnapshotSourceIntegrityError("UNITS_RECONCILIATION_FAILED", `Descuadre en ${gov.storeId}: entrada ${expectedTotal} ≠ salida ${totalUnits}`, { storeId: gov.storeId, expectedTotal, totalUnits });
      }
      return { storeId: gov.storeId, items, totalUnits };
    });

  // ── Reglas efectivas por (tienda, estructura) — I6 + I9 ──
  const rulesByStore = new Map(source.policyRulesByStore.map(e => [e.storeId, e.rules]));
  const structureRules: StructureRule[] = [];
  const seenRuleKeys = new Set<string>();
  for (const gov of [...source.governanceStores].sort((a, b) => a.storeId.localeCompare(b.storeId))) {
    const rules = rulesByStore.get(gov.storeId) ?? [];
    for (const info of lookup.expected) {
      const catalogInfo = lookup.byKey.get(info.structureKey)!;
      let resolved: { minUnits: number; idealUnits: number; maxUnits: number | null; source: StructureRule["source"] };
      if (catalogInfo.line === "castillitos") {
        resolved = resolveTextileRule(rules, "castillitos", CASTILLITOS_TEXTILE_COVERAGE, source.readAt);
      } else if (catalogInfo.line === "latin_kids") {
        resolved = resolveTextileRule(rules, "latin_kids", LATIN_KIDS_TEXTILE_COVERAGE, source.readAt);
      } else if (catalogInfo.line === "accesorios_importacion") {
        const size = catalogInfo.accSize;
        if (!size) {
          throw new SnapshotSourceIntegrityError("MISSING_LINE_RULE", `Estructura ACC ${info.structureKey} sin talla resoluble para su target`, { structureKey: info.structureKey });
        }
        const defaultTarget = CASTILLITOS_ACCESSORY_COVERAGE.idealBySize[size as keyof typeof CASTILLITOS_ACCESSORY_COVERAGE.idealBySize] ?? 0;
        const acc = resolveAccessoryTarget(rules, size, defaultTarget, source.readAt);
        resolved = { minUnits: acc.target, idealUnits: acc.target, maxUnits: null, source: acc.source };
      } else {
        throw new SnapshotSourceIntegrityError("MISSING_LINE_RULE", `Línea sin regla de cobertura: ${catalogInfo.line} (${info.structureKey})`, { line: catalogInfo.line, structureKey: info.structureKey });
      }

      const ruleKey = `${gov.storeId}|${info.structureKey}`;
      if (seenRuleKeys.has(ruleKey)) {
        throw new SnapshotSourceIntegrityError("DUPLICATE_STRUCTURE_RULE", `Regla efectiva duplicada para ${ruleKey} — invariante I9: una regla por estructura`, { storeId: gov.storeId, structureKey: info.structureKey });
      }
      seenRuleKeys.add(ruleKey);
      structureRules.push({
        storeId: gov.storeId,
        structureKey: info.structureKey,
        line: catalogInfo.line,
        label: info.label,
        minUnits: resolved.minUnits,
        idealUnits: resolved.idealUnits,
        maxUnits: resolved.maxUnits,
        source: resolved.source,
      });
    }
  }

  // ── Salida canónica final + fingerprint ──
  const payload = {
    assemblerVersion: ASSEMBLER_VERSION,
    organizationId: source.organizationId,
    dataAsOf,
    activeStores: [...source.governanceStores].sort((a, b) => a.storeId.localeCompare(b.storeId)),
    stores,
    referenceCatalog: [...catalogAcc.values()].sort((a, b) => a.referenceId.localeCompare(b.referenceId)),
    mainStock: [...mainStockAcc.values()].sort((a, b) => a.referenceId.localeCompare(b.referenceId)),
    structureRules,
    expectedStructures: [...lookup.expected].sort((a, b) => a.structureKey.localeCompare(b.structureKey)),
    scarcity: {
      threshold: CASTILLITOS_GLOBAL_LOW_STOCK.threshold,
      allowedStoreIds: [...CASTILLITOS_GLOBAL_LOW_STOCK.allowedStoreIds],
    },
    dropped: {
      count: [...droppedByReason.values()].reduce((s, c) => s + c, 0),
      byReason: [...droppedByReason.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => a.reason.localeCompare(b.reason)),
    },
    unresolvedStructure: unresolvedStructure
      .sort((a, b) => a.storeId.localeCompare(b.storeId) || a.referenceCode.localeCompare(b.referenceCode)),
  };

  return { ...payload, fingerprint: computeAssembledFingerprint(payload) };
}
