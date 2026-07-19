/**
 * lib/reconciliation/engine/validation/fixtures.ts
 *
 * AGENTIK-RECON-ENGINE-02 — Task 9
 * Controlled Test Scenarios for Engine Validation
 *
 * Provides deterministic, synthetic CanonicalReconRecord[] pairs with
 * known expected outcomes. Used by compare-results tests and parity checks.
 *
 * Rules:
 *   - No real PII: NITs are fictional, names are generic
 *   - No real amounts from production data
 *   - Deterministic: same fixture → same engine output every time
 *   - Covers all exception types: exact_match, amount_mismatch, only_in_a,
 *     only_in_b, duplicate, probable_match
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { CanonicalReconRecord } from "../../canonical-record";
import type { ValidationScenario }   from "./validation-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRecord(
  overrides: Partial<CanonicalReconRecord> & { id: string; externalId: string; amount: number },
): CanonicalReconRecord {
  return {
    sourceId:       "sag_orders",
    documentType:   "FE",
    documentNumber: null,
    thirdPartyId:   null,
    thirdPartyName: null,
    currency:       "COP",
    date:           "2026-01-15",
    dueDate:        null,
    reference:      null,
    accountCode:    null,
    status:         "open",
    rawRef:         `SaleRecord:${overrides.id}`,
    metadata:       {},
    ...overrides,
  };
}

// ── Scenario 1: All exact matches ─────────────────────────────────────────────

const exactMatchA: CanonicalReconRecord[] = [
  makeRecord({ id: "a1", externalId: "EXT-001", documentNumber: "FE-1001", thirdPartyId: "900111001", amount: 1_500_000 }),
  makeRecord({ id: "a2", externalId: "EXT-002", documentNumber: "FE-1002", thirdPartyId: "900111002", amount: 2_800_000 }),
  makeRecord({ id: "a3", externalId: "EXT-003", documentNumber: "FE-1003", thirdPartyId: "900111003", amount:   750_000 }),
];

const exactMatchB: CanonicalReconRecord[] = [
  makeRecord({ id: "b1", externalId: "EXT-001", sourceId: "sag_sales", documentNumber: "FE-1001", thirdPartyId: "900111001", amount: 1_500_000 }),
  makeRecord({ id: "b2", externalId: "EXT-002", sourceId: "sag_sales", documentNumber: "FE-1002", thirdPartyId: "900111002", amount: 2_800_000 }),
  makeRecord({ id: "b3", externalId: "EXT-003", sourceId: "sag_sales", documentNumber: "FE-1003", thirdPartyId: "900111003", amount:   750_000 }),
];

export const SCENARIO_ALL_EXACT: ValidationScenario = {
  name:        "all_exact_matches",
  description: "Three records in A perfectly match three records in B by documentNumber and amount.",
  recordsA:    exactMatchA,
  recordsB:    exactMatchB,
  expected: {
    exactMatches:     3,
    amountMismatches: 0,
    onlyInA:          0,
    onlyInB:          0,
    probableMatches:  0,
    duplicatesA:      0,
    duplicatesB:      0,
  },
};

// ── Scenario 2: Amount mismatches ─────────────────────────────────────────────

const amountMismatchA: CanonicalReconRecord[] = [
  makeRecord({ id: "c1", externalId: "EXT-010", documentNumber: "FE-2001", thirdPartyId: "900222001", amount: 1_000_000 }),
  makeRecord({ id: "c2", externalId: "EXT-011", documentNumber: "FE-2002", thirdPartyId: "900222002", amount: 3_500_000 }),
];

const amountMismatchB: CanonicalReconRecord[] = [
  makeRecord({ id: "d1", externalId: "EXT-010", sourceId: "sag_sales", documentNumber: "FE-2001", thirdPartyId: "900222001", amount: 1_050_000 }),  // +50k delta
  makeRecord({ id: "d2", externalId: "EXT-011", sourceId: "sag_sales", documentNumber: "FE-2002", thirdPartyId: "900222002", amount: 3_480_000 }),  // -20k delta
];

export const SCENARIO_AMOUNT_MISMATCH: ValidationScenario = {
  name:        "amount_mismatches",
  description: "Identity (documentNumber) matches but amounts differ — should produce amount_mismatch pairs.",
  recordsA:    amountMismatchA,
  recordsB:    amountMismatchB,
  expected: {
    exactMatches:     0,
    amountMismatches: 2,
    onlyInA:          0,
    onlyInB:          0,
    probableMatches:  0,
    duplicatesA:      0,
    duplicatesB:      0,
  },
};

// ── Scenario 3: Orphans (only_in_a / only_in_b) ───────────────────────────────

const orphansA: CanonicalReconRecord[] = [
  makeRecord({ id: "e1", externalId: "EXT-020", documentNumber: "FE-3001", thirdPartyId: "900333001", amount: 500_000 }),
  makeRecord({ id: "e2", externalId: "EXT-021", documentNumber: "FE-3002", thirdPartyId: "900333002", amount: 800_000 }),
];

const orphansB: CanonicalReconRecord[] = [
  // Different documentNumbers — no match possible
  makeRecord({ id: "f1", externalId: "EXT-030", sourceId: "sag_sales", documentNumber: "FE-9001", thirdPartyId: "900444001", amount: 200_000 }),
];

export const SCENARIO_ORPHANS: ValidationScenario = {
  name:        "orphans_only",
  description: "Side A has 2 records, side B has 1 unrelated record — should produce 2 only_in_a and 1 only_in_b.",
  recordsA:    orphansA,
  recordsB:    orphansB,
  expected: {
    exactMatches:     0,
    amountMismatches: 0,
    onlyInA:          2,
    onlyInB:          1,
    probableMatches:  0,
    duplicatesA:      0,
    duplicatesB:      0,
  },
};

// ── Scenario 4: Duplicates ────────────────────────────────────────────────────

const duplicatesA: CanonicalReconRecord[] = [
  makeRecord({ id: "g1", externalId: "EXT-040", documentNumber: "FE-4001", thirdPartyId: "900555001", amount: 1_200_000 }),
  makeRecord({ id: "g2", externalId: "EXT-041", documentNumber: "FE-4001", thirdPartyId: "900555001", amount: 1_200_000 }),  // duplicate key
];

const duplicatesB: CanonicalReconRecord[] = [
  makeRecord({ id: "h1", externalId: "EXT-040", sourceId: "sag_sales", documentNumber: "FE-4001", thirdPartyId: "900555001", amount: 1_200_000 }),
];

export const SCENARIO_DUPLICATES: ValidationScenario = {
  name:        "duplicates_in_a",
  description: "Side A has two records with the same documentNumber — one enters matching, the duplicate is flagged.",
  recordsA:    duplicatesA,
  recordsB:    duplicatesB,
  expected: {
    exactMatches:     1,
    amountMismatches: 0,
    onlyInA:          0,
    onlyInB:          0,
    probableMatches:  0,
    duplicatesA:      1,  // one duplicate group
    duplicatesB:      0,
  },
};

// ── Scenario 5: Probable match (fuzzy) ────────────────────────────────────────
// Records share amount + NIT but differ in documentNumber → score ~50 (NIT=20 + amount=30)
// To make it a probable_match (score ≥ 60) we also add reference match (+15) → total 65
// Note: exact match won't fire because documentNumbers differ

const probableA: CanonicalReconRecord[] = [
  makeRecord({
    id: "i1", externalId: "EXT-050",
    documentNumber: "FE-5001",
    thirdPartyId:   "900666001",
    thirdPartyName: "Comercializadora Beta",
    amount:         4_250_000,
    reference:      "REF-ABC-2026",
    date:           "2026-01-10",
  }),
];

const probableB: CanonicalReconRecord[] = [
  makeRecord({
    id: "j1", externalId: "EXT-060",
    sourceId:       "sag_sales",
    documentNumber: "VT-9999",          // different documentNumber → no exact match
    thirdPartyId:   "900666001",         // same NIT → +20
    thirdPartyName: "Comercializadora Beta",
    amount:         4_250_000,           // same amount → +30
    reference:      "REF-ABC-2026",     // same reference → +15
    date:           "2026-01-10",        // same date → +10
    // total: 75 → probable_match (≥ 60)
  }),
];

export const SCENARIO_PROBABLE_MATCH: ValidationScenario = {
  name:        "probable_match_fuzzy",
  description: "Records share NIT + amount + reference + date but have different documentNumbers → fuzzy probable_match (score ~75).",
  recordsA:    probableA,
  recordsB:    probableB,
  expected: {
    exactMatches:     0,
    amountMismatches: 0,
    onlyInA:          0,
    onlyInB:          0,
    probableMatches:  1,
    duplicatesA:      0,
    duplicatesB:      0,
  },
};

// ── Scenario 6: Mixed (realistic) ────────────────────────────────────────────

const mixedA: CanonicalReconRecord[] = [
  // Will match exactly
  makeRecord({ id: "k1", externalId: "EXT-100", documentNumber: "FE-6001", thirdPartyId: "900777001", amount: 2_100_000 }),
  // Amount mismatch
  makeRecord({ id: "k2", externalId: "EXT-101", documentNumber: "FE-6002", thirdPartyId: "900777002", amount: 1_800_000 }),
  // Only in A
  makeRecord({ id: "k3", externalId: "EXT-102", documentNumber: "FE-6003", thirdPartyId: "900777003", amount:   950_000 }),
];

const mixedB: CanonicalReconRecord[] = [
  makeRecord({ id: "l1", externalId: "EXT-100", sourceId: "sag_sales", documentNumber: "FE-6001", thirdPartyId: "900777001", amount: 2_100_000 }),
  makeRecord({ id: "l2", externalId: "EXT-101", sourceId: "sag_sales", documentNumber: "FE-6002", thirdPartyId: "900777002", amount: 1_900_000 }),  // amount differs
  // Only in B (no match for k3)
  makeRecord({ id: "l3", externalId: "EXT-200", sourceId: "sag_sales", documentNumber: "FE-7777", thirdPartyId: "900888001", amount:   300_000 }),
];

export const SCENARIO_MIXED: ValidationScenario = {
  name:        "mixed_realistic",
  description: "Mix of exact_match, amount_mismatch, only_in_a, and only_in_b — simulates a typical partial-period reconciliation.",
  recordsA:    mixedA,
  recordsB:    mixedB,
  expected: {
    exactMatches:     1,
    amountMismatches: 1,
    onlyInA:          1,
    onlyInB:          1,
    probableMatches:  0,
    duplicatesA:      0,
    duplicatesB:      0,
  },
};

// ── Scenario 7: Empty inputs ───────────────────────────────────────────────────

export const SCENARIO_EMPTY: ValidationScenario = {
  name:        "empty_inputs",
  description: "Both sides are empty — engine should return all-zero result without error.",
  recordsA:    [],
  recordsB:    [],
  expected: {
    exactMatches:     0,
    amountMismatches: 0,
    onlyInA:          0,
    onlyInB:          0,
    probableMatches:  0,
    duplicatesA:      0,
    duplicatesB:      0,
  },
};

// ── All scenarios export ───────────────────────────────────────────────────────

export const ALL_VALIDATION_SCENARIOS: ValidationScenario[] = [
  SCENARIO_ALL_EXACT,
  SCENARIO_AMOUNT_MISMATCH,
  SCENARIO_ORPHANS,
  SCENARIO_DUPLICATES,
  SCENARIO_PROBABLE_MATCH,
  SCENARIO_MIXED,
  SCENARIO_EMPTY,
];
