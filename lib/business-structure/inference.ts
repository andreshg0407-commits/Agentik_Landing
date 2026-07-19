/**
 * business-structure/inference.ts
 *
 * Deterministic inference of business dimensions from SaleRecord fields.
 *
 * All logic is pure (no DB calls). Input comes from the in-memory SaleRecord
 * shape already loaded by the calling module.
 *
 * Inference order:
 *   BusinessLine    ← comprobanteCode → SourceSemanticRule.businessLine
 *                     (falls back to OTHER; ARKETOPS codes return OTHER because
 *                      they are excluded before reaching this layer)
 *   SalesChannelKey ← sagSourceType → REMISIONES  (F2 always → REMISIONES)
 *                     channel (Prisma SaleChannel enum) → registry map
 *   OperatingUnitKey← storeSlug → OPERATING_UNIT_REGISTRY.storeSlugs lookup
 *
 * Important contract:
 *   - This module NEVER queries the DB.
 *   - It NEVER breaks ARKETOPS separation — if a code is ARKETOPS, the caller
 *     must not have included it in the result set in the first place.
 *   - It returns OTHER rather than throwing for unrecognised values.
 */

import type { SaleChannel } from "@prisma/client";
import type { SagSourceType } from "@/lib/sag/source-inference";
import { CASTILLITOS_SOURCE_SEMANTIC_RULES } from "@/lib/sag/master-data/source-semantic-rules";
import { OPERATING_UNIT_REGISTRY } from "./dimensions";
import type {
  BusinessLine,
  SalesChannelKey,
  OperatingUnitKey,
  BusinessDimensions,
} from "./types";

// ── BusinessLine inference ────────────────────────────────────────────────────

/**
 * Build a lookup map from comprobanteCode → BusinessLine.
 * Derived lazily from the master-data source semantic rules.
 * Only codes that have an explicit businessLine set are in this map.
 */
let _codeToBusinessLine: Map<string, BusinessLine> | null = null;

function codeToBusinessLineMap(): Map<string, BusinessLine> {
  if (_codeToBusinessLine) return _codeToBusinessLine;
  const m = new Map<string, BusinessLine>();
  for (const rule of CASTILLITOS_SOURCE_SEMANTIC_RULES) {
    if (rule.businessLine) {
      m.set(rule.codigoFuente, rule.businessLine);
    }
  }
  _codeToBusinessLine = m;
  return m;
}

/**
 * Infer BusinessLine from a SaleRecord's comprobanteCode.
 *
 * Returns the mapped businessLine from source-semantic-rules if set,
 * otherwise CASTILLITOS (the safe default for Castillitos own codes).
 *
 * Note: ARKETOPS codes are NOT mapped here because they carry no
 * businessLine in source-semantic-rules (only businessOwner: "ARKETOPS").
 * If one slips through, it falls back to OTHER via the caller.
 */
export function inferBusinessLine(
  comprobanteCode: string | null | undefined,
): BusinessLine {
  if (!comprobanteCode) return "CASTILLITOS";
  const mapped = codeToBusinessLineMap().get(comprobanteCode.trim().toUpperCase());
  return mapped ?? "CASTILLITOS";
}

// ── SalesChannel inference ────────────────────────────────────────────────────

/**
 * Map from Prisma SaleChannel enum values to our canonical SalesChannelKey.
 *
 * EMPRESA      → EMPRESA     (B2B direct)
 * ALMACEN/TIENDA → TIENDAS   (physical retail)
 * ONLINE       → WEB
 * TELEFONO     → TELEFONO
 * DISTRIBUIDOR → MAYORISTAS  (distributor = wholesale)
 * MAYORISTA    → MAYORISTAS
 * OTRO/null    → OTHER
 */
const PRISMA_CHANNEL_TO_KEY: Record<SaleChannel, SalesChannelKey> = {
  EMPRESA:     "EMPRESA",
  ALMACEN:     "TIENDAS",
  TIENDA:      "TIENDAS",
  ONLINE:      "WEB",
  TELEFONO:    "TELEFONO",
  DISTRIBUIDOR:"MAYORISTAS",
  MAYORISTA:   "MAYORISTAS",
  OTRO:        "OTHER",
};

/**
 * Infer SalesChannelKey.
 *
 * FUENTE_2 (sagSourceType = REMISION) always maps to REMISIONES regardless
 * of the channel field — the dispatch flow is its own commercial channel.
 */
export function inferSalesChannel(
  channel: SaleChannel | null | undefined,
  sagSourceType: SagSourceType | null | undefined,
): SalesChannelKey {
  // F2 / remisión is its own channel — overrides everything
  if (sagSourceType === "REMISION") return "REMISIONES";

  if (!channel) return "OTHER";
  return PRISMA_CHANNEL_TO_KEY[channel] ?? "OTHER";
}

// ── OperatingUnit inference ───────────────────────────────────────────────────

/**
 * Build a lookup map from normalised storeSlug → OperatingUnitKey.
 * Derived lazily from OPERATING_UNIT_REGISTRY.storeSlugs.
 */
let _slugToUnit: Map<string, OperatingUnitKey> | null = null;

function slugToUnitMap(): Map<string, OperatingUnitKey> {
  if (_slugToUnit) return _slugToUnit;
  const m = new Map<string, OperatingUnitKey>();
  for (const meta of Object.values(OPERATING_UNIT_REGISTRY)) {
    for (const slug of meta.storeSlugs) {
      m.set(slug, meta.key);
    }
  }
  _slugToUnit = m;
  return m;
}

/**
 * Infer OperatingUnitKey from storeSlug.
 *
 * Normalisation: lowercase + trim (slugs are already URL-safe strings).
 * Falls back to OTHER for unknown slugs.
 */
export function inferOperatingUnit(
  storeSlug: string | null | undefined,
): OperatingUnitKey {
  if (!storeSlug) return "OTHER";
  const normalised = storeSlug.trim().toLowerCase();
  return slugToUnitMap().get(normalised) ?? "OTHER";
}

// ── Composite ─────────────────────────────────────────────────────────────────

/**
 * Infer all three dimensions in one call.
 *
 * @param comprobanteCode  SaleRecord.comprobanteCode
 * @param channel          SaleRecord.channel (Prisma SaleChannel enum)
 * @param sagSourceType    SaleRecord.sagSourceType
 * @param storeSlug        SaleRecord.storeSlug
 */
export function inferBusinessDimensions(params: {
  comprobanteCode: string | null | undefined;
  channel:         SaleChannel | null | undefined;
  sagSourceType:   SagSourceType | null | undefined;
  storeSlug:       string | null | undefined;
}): BusinessDimensions {
  const businessLine  = inferBusinessLine(params.comprobanteCode);
  const salesChannel  = inferSalesChannel(params.channel, params.sagSourceType);
  const operatingUnit = inferOperatingUnit(params.storeSlug);

  const hasUnknownDimension =
    businessLine  === "OTHER" ||
    salesChannel  === "OTHER" ||
    operatingUnit === "OTHER";

  return { businessLine, salesChannel, operatingUnit, hasUnknownDimension };
}
