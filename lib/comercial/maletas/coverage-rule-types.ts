/**
 * lib/comercial/maletas/coverage-rule-types.ts
 *
 * CommercialCoverageRule — configurable production/coverage rules.
 * Replaces the static Excel DERROTERO as the operational rule source.
 *
 * Phase 3: Model definition.
 * Phase 3 (migration path): Excel derrotero → seed initial rules → user configures via UI.
 *
 * No Prisma here — these are pure TS types.
 * When Prisma migration runs, CommercialCoverageRule becomes a DB model.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-FUNCTIONAL-REALIGNMENT-01
 */

import type { CommercialCaseLine } from "./maletas-types";

// ─── Core rule model ───────────────────────────────────────────────────────────

export interface CommercialCoverageRule {
  /** Stable ID — "lt_pijama_nina_bebe" or user-generated cuid */
  id:                     string;
  organizationId:         string;
  line:                   CommercialCaseLine;
  category:               string;              // "NIÑA BEBE" | "NIÑO KIDS" | etc.
  productType:            string;              // "PIJAMA" | "CONJUNTO" | "VESTIDO" | etc.
  /** If set, rule applies to this SAG ref only (exact match UPPERCASE) */
  reference?:             string;
  /** If set, applies to this size only (e.g. "2-8" | "10-16") */
  size?:                  string;
  /** If set, applies to this color only */
  color?:                 string;
  /** Trigger threshold: alert when availableForCases <= this value */
  minWarehouseQty:        number;
  /** Operational target: desired inventory level */
  idealWarehouseQty:      number;
  /** Quantity to include in a ProductionRequestDraft when alert fires */
  suggestedProductionQty: number;
  /** 1 = highest priority */
  priority:               number;
  appliesToProduction:    boolean;
  appliesToCases:         boolean;
  appliesToStores:        boolean;
  active:                 boolean;
  /** Source tracks origin for audit and migration */
  source:                 "manual" | "excel_seed" | "default";
  createdAt:              string;
  updatedAt:              string;
}

// ─── Alert severity ────────────────────────────────────────────────────────────

export type ProductionAlertSeverity =
  | "critica"      // availableForCases <= 0 AND pendingPDQty > 0
  | "urgente"      // availableForCases <= 0
  | "alta"         // availableForCases <= minWarehouseQty AND pendingPDQty > 0
  | "preventiva"   // netAvailableAfterPD <= minWarehouseQty (current OK but will fall)
  | "normal";      // availableForCases <= minWarehouseQty, no PD pressure

// ─── Default rules (seed from Excel derrotero) ────────────────────────────────
//
// These represent the minimum operational baseline for Castillitos.
// Production minimums are derived from the derrotero case-level requirements
// scaled to approximate warehouse needs (category minimum × 4 vendors = warehouse min).
//
// The operator MUST review and configure these before full production use.
// These defaults are deliberately conservative to avoid over-triggering alerts.

export function getDefaultCoverageRules(orgId: string): CommercialCoverageRule[] {
  const now = new Date().toISOString();

  function rule(
    id: string,
    line: CommercialCaseLine,
    category: string,
    productType: string,
    min: number,
    ideal: number,
    priority: number,
    reference?: string,
  ): CommercialCoverageRule {
    return {
      id,
      organizationId:         orgId,
      line,
      category,
      productType,
      reference,
      minWarehouseQty:        min,
      idealWarehouseQty:      ideal,
      suggestedProductionQty: ideal,
      priority,
      appliesToProduction:    true,
      appliesToCases:         true,
      appliesToStores:        false,
      active:                 true,
      source:                 "default",
      createdAt:              now,
      updatedAt:              now,
    };
  }

  return [
    // ── LT — Pijamas Bebé Niña ─────────────────────────────────────────────
    rule("lt_pijama_bebe_nina_cl",   "LT", "NIÑA BEBE",  "PIJAMA CL",        12, 24, 1),
    rule("lt_pijama_bebe_nina_ll",   "LT", "NIÑA BEBE",  "PIJAMA LL",        12, 24, 1),
    // ── LT — Pijamas Bebé Niño ─────────────────────────────────────────────
    rule("lt_pijama_bebe_nino_cl",   "LT", "NIÑO BEBE",  "PIJAMA CL",        12, 24, 1),
    rule("lt_pijama_bebe_nino_ll",   "LT", "NIÑO BEBE",  "PIJAMA LL",        12, 24, 1),
    // ── LT — Niña Kids ─────────────────────────────────────────────────────
    rule("lt_conjunto_nina_cl_2_8",  "LT", "NIÑA",       "CONJUNTO CL",      20, 40, 2),
    rule("lt_conjunto_nina_cl_1016", "LT", "NIÑA",       "CONJUNTO CL",      16, 32, 2),
    rule("lt_conjunto_nina_cc",      "LT", "NIÑA",       "CONJUNTO CC",      12, 24, 3),
    // ── LT — Niño Kids ─────────────────────────────────────────────────────
    rule("lt_conjunto_nino_cl_2_8",  "LT", "NIÑO",       "CONJUNTO CL",      20, 40, 2),
    rule("lt_conjunto_nino_cl_1016", "LT", "NIÑO",       "CONJUNTO CL",      16, 32, 2),
    // ── CS — Niña Bebé ─────────────────────────────────────────────────────
    rule("cs_pijama_nina_bebe_cl",   "CS", "NIÑA BEBE",  "PIJAMA CL",        12, 24, 1),
    rule("cs_pijama_nina_bebe_ll",   "CS", "NIÑA BEBE",  "PIJAMA LL",         8, 16, 1),
    rule("cs_conjunto_nina_bebe_cc", "CS", "NIÑA BEBE",  "CONJUNTO CC",       8, 16, 2),
    rule("cs_conjunto_nina_bebe_cl", "CS", "NIÑA BEBE",  "CONJUNTO CL",       8, 16, 2),
    rule("cs_vestido_nina_bebe",     "CS", "NIÑA BEBE",  "VESTIDO",          12, 24, 2),
    // ── CS — Niña Kids ─────────────────────────────────────────────────────
    rule("cs_pijama_nina_kids_cl",   "CS", "NIÑA KIDS",  "PIJAMA CL",        12, 24, 1),
    rule("cs_pijama_nina_kids_ll",   "CS", "NIÑA KIDS",  "PIJAMA LL",         8, 16, 1),
    rule("cs_vestido_nina_kids",     "CS", "NIÑA KIDS",  "VESTIDO",          12, 24, 2),
    // ── CS — Niño Bebé ─────────────────────────────────────────────────────
    rule("cs_pijama_nino_bebe_cl",   "CS", "NIÑO BEBE",  "PIJAMA CL",        12, 24, 1),
    rule("cs_pijama_nino_bebe_ll",   "CS", "NIÑO BEBE",  "PIJAMA LL",         8, 16, 1),
    rule("cs_conjunto_nino_bebe_cc", "CS", "NIÑO BEBE",  "CONJUNTO CC",       8, 16, 2),
    // ── CS — Niño Kids ─────────────────────────────────────────────────────
    rule("cs_pijama_nino_kids_cl",   "CS", "NIÑO KIDS",  "PIJAMA CL",        12, 24, 1),
    rule("cs_pijama_nino_kids_ll",   "CS", "NIÑO KIDS",  "PIJAMA LL",         8, 16, 1),
  ];
}
