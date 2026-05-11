/**
 * source-semantics.ts
 *
 * SAG Source-Aware Layer — Semantic Model (Sprint 2)
 *
 * Maps the DB-stored SagSourceType (OFICIAL / REMISION) to the canonical
 * business type (FUENTE_1 / FUENTE_2) and exposes deterministically computed
 * boolean flags for every downstream module.
 *
 * Key rules:
 *   FUENTE_1 = Fuente 1 — official fiscal invoice (legal revenue truth, creates receivable)
 *   FUENTE_2 = Fuente 2 — remisión / despacho (operational pipeline, pending conversion)
 *
 * None of the derived fields (isFiscalTruth, shouldCountForRevenue, etc.) are
 * stored in the database — they are computed at runtime from sagSourceType so
 * they cannot drift from the source of truth.
 *
 * Usage:
 *   import { getSourceSemantics, fromSagSourceType } from "@/lib/sag/source-semantics";
 *   const sem = getSourceSemantics(fromSagSourceType(record.sagSourceType));
 *   if (sem.shouldCountForRevenue) { ... }
 */

import type { SagSourceType } from "./source-inference";
import { SQL_FILTER_EXCLUIR_ARKETOPS } from "@/lib/sag/master-data/source-semantic-rules";

// ── Canonical business type ───────────────────────────────────────────────────

/** Canonical business-level source classification. */
export type SaleSourceType = "FUENTE_1" | "FUENTE_2";

/**
 * Audit trail: how the source type was inferred at import time.
 * Stored as a string column in SaleRecord.sourceInferredFrom.
 */
export type SourceInferredFrom =
  | "family"           // sagDocumentFamily was authoritative (not OTHER)
  | "explicit_column"  // explicit CSV fuente/source column matched
  | "code_pattern"     // comprobanteCode matched REMISION heuristic
  | "ref_pattern"      // comprobante full-ref matched REMISION heuristic
  | "filename"         // filename hint matched
  | "default"          // fallback conservative default (FUENTE_1 assumed)
  | "legacy";          // imported before source tracking sprint (FUENTE_1 assumed)

// ── Semantic flags interface ──────────────────────────────────────────────────

export interface SaleSourceSemantics {
  /** Canonical business type. */
  sourceType:             SaleSourceType;
  /** Full human-readable label (Spanish). */
  sourceLabel:            string;
  /** Compact label for tables / chips / badges. */
  sourceShortLabel:       string;
  /** Numeric priority: 1 = fiscal truth, 2 = dispatch flow. */
  sourcePriority:         1 | 2;

  // ── Legal / fiscal ────────────────────────────────────────────────────────
  /** True: document creates legal obligations and accounts receivable. */
  isFiscalTruth:          boolean;
  /** True: document is operational dispatch, no immediate legal / AR effect. */
  isDispatchFlow:         boolean;

  // ── Accounting inclusion gates ────────────────────────────────────────────
  /** Include in recognized revenue (P&L / ventas facturadas). */
  shouldCountForRevenue:  boolean;
  /** Include in cash-flow projection (inflow model). */
  shouldCountForCashflow: boolean;
  /** Include in demand forecast (F2 = near-revenue demand signal). */
  shouldCountForForecast: boolean;

  // ── UI / display ──────────────────────────────────────────────────────────
  /** Badge color token. */
  colorToken:             "green" | "amber";
  /** DB storage equivalent (SagSourceType). */
  legacyEquivalent:       SagSourceType;

  // ── Data-model flags (see also source-aware.ts for extended model) ─────────
  /**
   * True for BOTH FUENTE_1 and FUENTE_2.
   * A remisión proves that delivery occurred — operational truth even when
   * the fiscal document (FUENTE_1) has not yet been issued.
   */
  isOperationalTruth:       boolean;
  /**
   * True only for FUENTE_1.
   * Only an official invoice can create an accounts-receivable (Cartera) entry.
   */
  canGenerateReceivable:     boolean;
  /**
   * True only for FUENTE_1.
   * Only an official invoice generates a DIAN XML expectation.
   */
  canGenerateXmlExpectation: boolean;
}

// ── Semantic definitions ──────────────────────────────────────────────────────

const SEMANTICS: Record<SaleSourceType, SaleSourceSemantics> = {
  FUENTE_1: {
    sourceType:                "FUENTE_1",
    sourceLabel:               "Fuente 1 — Factura oficial",
    sourceShortLabel:          "F1 · Oficial",
    sourcePriority:            1,
    isFiscalTruth:             true,
    isDispatchFlow:            false,
    shouldCountForRevenue:     true,
    shouldCountForCashflow:    true,
    shouldCountForForecast:    true,
    colorToken:                "green",
    legacyEquivalent:          "OFICIAL",
    isOperationalTruth:        true,
    canGenerateReceivable:     true,
    canGenerateXmlExpectation: true,
  },
  FUENTE_2: {
    sourceType:                "FUENTE_2",
    sourceLabel:               "Fuente 2 — Remisión / Despacho",
    sourceShortLabel:          "F2 · Remisión",
    sourcePriority:            2,
    isFiscalTruth:             false,
    isDispatchFlow:            true,
    shouldCountForRevenue:     false,
    shouldCountForCashflow:    false,
    shouldCountForForecast:    true,
    colorToken:                "amber",
    legacyEquivalent:          "REMISION",
    isOperationalTruth:        true,   // dispatch confirms delivery
    canGenerateReceivable:     false,
    canGenerateXmlExpectation: false,
  },
};

// ── Public API ────────────────────────────────────────────────────────────────

/** Get the full semantic descriptor for a source type. */
export function getSourceSemantics(sourceType: SaleSourceType): SaleSourceSemantics {
  return SEMANTICS[sourceType];
}

/** Convert DB storage value (SagSourceType) → business type (SaleSourceType). */
export function fromSagSourceType(sag: SagSourceType): SaleSourceType {
  return sag === "REMISION" ? "FUENTE_2" : "FUENTE_1";
}

/** Convert business type (SaleSourceType) → DB storage value (SagSourceType). */
export function toSagSourceType(sourceType: SaleSourceType): SagSourceType {
  return sourceType === "FUENTE_2" ? "REMISION" : "OFICIAL";
}

// ── Filter predicates ─────────────────────────────────────────────────────────

/** True when this DB value contributes to recognized revenue. */
export function isRevenueSource(sag: SagSourceType): boolean {
  return SEMANTICS[fromSagSourceType(sag)].shouldCountForRevenue;
}

/** True when this DB value is a dispatch/operational flow. */
export function isDispatchSource(sag: SagSourceType): boolean {
  return SEMANTICS[fromSagSourceType(sag)].isDispatchFlow;
}

// ── Raw SQL condition fragments ───────────────────────────────────────────────
// Use these in Prisma.$queryRaw via Prisma.raw() to keep filter logic centralized.

// Sprint 3.1: All source conditions now exclude ARKETOPS codes.
/** Restricts SaleRecord to FUENTE_1 — recognized revenue only. ARKETOPS excluded. */
export const REVENUE_SOURCE_CONDITION = `"sagSourceType" = 'OFICIAL' AND ${SQL_FILTER_EXCLUIR_ARKETOPS}`;

/** Restricts SaleRecord to FUENTE_2 — dispatch/remision flow only. ARKETOPS excluded. */
export const DISPATCH_SOURCE_CONDITION = `"sagSourceType" = 'REMISION' AND ${SQL_FILTER_EXCLUIR_ARKETOPS}`;

/** Includes all source types — for total / forecast queries. ARKETOPS excluded. */
export const ALL_SOURCES_CONDITION = `"sagSourceType" IN ('OFICIAL', 'REMISION') AND ${SQL_FILTER_EXCLUIR_ARKETOPS}`;

// ── CSV explicit-source normalization ─────────────────────────────────────────
//
// Centralizes the mapping from user-supplied CSV source values to SaleSourceType.
// Called by normalize.ts to replace the scattered inline checks.
//
// Handles:
//   Numeric shorthand:    "1", "2", 1, 2
//   Alpha codes:          "F1", "F2", "f1", "f2"
//   Full labels:          "Fuente 1", "fuente 2", "Fuente1", "FUENTE_2"
//   Semantic labels:      "oficial", "factura", "invoice" → FUENTE_1
//                         "remision", "remisión", "despacho", "dispatch" → FUENTE_2
//   Common SAG codes:     "NV", "GD", "NR", "REM" → FUENTE_2
//                         "FV", "FA" → FUENTE_1

export function normalizeExplicitSource(
  raw: string | number | null | undefined,
): SaleSourceType | null {
  if (raw == null) return null;

  // Collapse separators / whitespace for uniform matching
  const s = String(raw).toLowerCase().replace(/[\s_\-\.]/g, "");

  if (s === "") return null;

  // ── FUENTE_1 signals ───────────────────────────────────────────────────────
  if (
    s === "1"       || s === "f1"      || s === "fuente1" ||
    s === "oficial" || s === "factura" || s === "invoice" ||
    s === "fv"      || s === "fa"      ||
    // Castillitos k_sc_codigo_fuente — facturas de venta (FUENTES.xlsx 2026-04-20)
    s === "fe" || s === "vc" || s === "v1" || s === "v2" || s === "v3" || s === "fx"
  ) return "FUENTE_1";

  // ── FUENTE_2 signals ───────────────────────────────────────────────────────
  if (
    s === "2"        || s === "f2"       || s === "fuente2"         ||
    s === "remision" || s === "remisión" || s === "remision/despacho" ||
    s === "despacho" || s === "dispatch" ||
    s === "nv"       || s === "gd"       || s === "nr"   || s === "rem"
  ) return "FUENTE_2";

  return null;
}
