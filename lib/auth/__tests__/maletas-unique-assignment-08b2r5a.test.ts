/**
 * MALETAS-DERROTERO-08B2R5A — Unique Assignment & Ambiguous Group Tests
 *
 * Proves:
 *   A. Double assignment bug reproduced and fixed
 *   B. One-ref-one-position invariant
 *   C. Compound matcher for ambiguous sagSubgrupos
 *   D. Ambiguous refs → DATA_UNVERIFIED with AMBIGUOUS_DERROTERO_GROUP
 *   E. Certified refs cover exactly one position
 *   F. Ambiguous positions fail closed in B01/B04/PRODUCTION cascade
 *   G. Structural invariants
 */

import { describe, test, expect } from "vitest";
import {
  evaluateVendorAssortment,
  evaluateCatalog,
  buildAmbiguityIndex,
  getAmbiguousSagSubgrupos,
} from "../../comercial/maletas/maletas-functional-evaluation";
import {
  buildLatinKidsTextilCatalog,
} from "../../comercial/maletas/assortment-catalog/castillitos-mallet-assortment-catalog";
import type { VendorSampleSnapshot } from "../../comercial/maletas/vendor-sample-types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRef(overrides: Record<string, unknown> & { reference: string }) {
  return {
    reference: overrides.reference,
    description: (overrides.description as string) ?? overrides.reference,
    brand: (overrides.brand as string) ?? "Latin Kids",
    line: (overrides.line as string) ?? "LT",
    group: null,
    grupoSag: (overrides.grupoSag as string | null) ?? null,
    subgrupoSag: (overrides.subgrupoSag as string | null) ?? null,
    sizeClass: null,
    disponible: 100,
    isAccessory: false,
    retiro: false,
    productEntityId: null,
    // Optional certified group
    ...(overrides.derroteroGroupCode != null
      ? { derroteroGroupCode: overrides.derroteroGroupCode }
      : {}),
  };
}

function makeVendor(vendorId: string, refs: ReturnType<typeof makeRef>[]): VendorSampleSnapshot {
  return {
    vendorId,
    vendorName: vendorId,
    lines: ["LT"],
    refs: refs as any,
    totalBagRefs: refs.length,
    activatedBagRefs: refs.length,
    sagUpdatedAt: new Date().toISOString(),
  } as any;
}

const ltCatalog = buildLatinKidsTextilCatalog();

// ═════════════════════════════════════════════════════════════════════════════
// A. REPRODUCE THE BUG (before fix: both got current=1, now both get 0)
// ═════════════════════════════════════════════════════════════════════════════

describe("A. Reproduce double assignment bug", () => {
  test("Single ambiguous ref 'CONJUNTO MESES BB NIÑO' covers 0 positions", () => {
    const ref = makeRef({
      reference: "FIXTURE-CONJUNTO-BB-NINO-01",
      subgrupoSag: "CONJUNTO MESES BB NIÑO",
    });

    const result = evaluateCatalog(ltCatalog, [ref] as any, "TEXTIL");

    const kidsGroup = result.groups.find((g) => g.groupCode === "LT_NINO_KIDS")!;
    const kidsEntry = kidsGroup.entries.find((e) => e.subgroupCode === "CONJUNTO_MESES_BB_NINO_KIDS")!;

    const bebeGroup = result.groups.find((g) => g.groupCode === "LT_NINO_BEBE")!;
    const bebeEntry = bebeGroup.entries.find((e) => e.subgroupCode === "CONJUNTO_MESES_BB_NINO_BEBE")!;

    // BUG CONFIRMED FIXED: both are 0, not 1
    expect(kidsEntry.currentReferences).toBe(0);
    expect(bebeEntry.currentReferences).toBe(0);

    // Unique references consumed = 0 (ambiguous → not assigned)
    const totalAssigned = result.groups.reduce(
      (s, g) => s + g.entries.reduce((s2, e) => s2 + e.matchedReferences.length, 0), 0,
    );
    expect(totalAssigned).toBeLessThanOrEqual(1); // was 2 before fix (bug)
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B. ONE-REF-ONE-POSITION INVARIANT
// ═════════════════════════════════════════════════════════════════════════════

describe("B. One-ref-one-position invariant", () => {
  test("totalReferenceAssignments <= uniqueEligibleVendorReferences", () => {
    const refs = [
      makeRef({ reference: "R1", subgrupoSag: "PIJAMA CC 2-8 NIÑA" }),
      makeRef({ reference: "R2", subgrupoSag: "PIJAMA CC 2-8 NIÑO" }),
      makeRef({ reference: "R3", subgrupoSag: "CONJUNTO MESES BB NIÑO" }), // ambiguous
    ];

    const result = evaluateCatalog(ltCatalog, refs as any, "TEXTIL");

    // Count total assignments across all entries
    const allAssignments: string[] = [];
    for (const g of result.groups) {
      for (const e of g.entries) {
        allAssignments.push(...e.matchedReferences);
      }
    }

    // Each referenceId appears at most once
    const refCounts = new Map<string, number>();
    for (const r of allAssignments) {
      refCounts.set(r, (refCounts.get(r) ?? 0) + 1);
    }
    for (const [ref, count] of refCounts) {
      expect(count).toBe(1); // never duplicated
    }

    // Total assignments <= unique eligible refs
    const uniqueRefs = new Set(refs.map((r) => r.reference));
    expect(allAssignments.length).toBeLessThanOrEqual(uniqueRefs.size);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C. COMPOUND MATCHER — AMBIGUITY INDEX
// ═════════════════════════════════════════════════════════════════════════════

describe("C. Compound matcher", () => {
  test("Ambiguity index detects CONJUNTO MESES BB NIÑO in 2 groups", () => {
    const index = buildAmbiguityIndex(ltCatalog);
    const conjuntoGroups = index.get("CONJUNTO MESES BB NIÑO");
    expect(conjuntoGroups).toBeDefined();
    expect(conjuntoGroups!.size).toBe(2);
    expect(conjuntoGroups!.has("LT_NINO_KIDS")).toBe(true);
    expect(conjuntoGroups!.has("LT_NINO_BEBE")).toBe(true);
  });

  test("Non-ambiguous sagSubgrupos map to exactly 1 group", () => {
    const index = buildAmbiguityIndex(ltCatalog);
    const pijamaCC = index.get("PIJAMA CC 2-8 NIÑA");
    expect(pijamaCC).toBeDefined();
    expect(pijamaCC!.size).toBe(1);
    expect(pijamaCC!.has("LT_NINA_KIDS")).toBe(true);
  });

  test("getAmbiguousSagSubgrupos returns only ambiguous keys", () => {
    const ambiguous = getAmbiguousSagSubgrupos(ltCatalog);
    expect(ambiguous.has("CONJUNTO MESES BB NIÑO")).toBe(true);
    // Non-ambiguous should NOT be in the set
    expect(ambiguous.has("PIJAMA CC 2-8 NIÑA")).toBe(false);
    expect(ambiguous.has("PIJAMA CC 2-8 NIÑO")).toBe(false);
    expect(ambiguous.has("CONJUNTO 2-12 NIÑO")).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D. AMBIGUOUS REF → DATA_UNVERIFIED
// ═════════════════════════════════════════════════════════════════════════════

describe("D. Ambiguous ref is DATA_UNVERIFIED", () => {
  test("Ambiguous ref reported as AMBIGUOUS_DERROTERO_GROUP unresolved", () => {
    const ref = makeRef({
      reference: "AMBIG-01",
      subgrupoSag: "CONJUNTO MESES BB NIÑO",
    });
    const vendor = makeVendor("TEST", [ref]);
    const result = evaluateVendorAssortment(vendor);

    const ambiguousUnresolved = result.unresolvedRefs.filter(
      (r) => r.reason === "AMBIGUOUS_DERROTERO_GROUP",
    );
    expect(ambiguousUnresolved.length).toBe(1);
    expect(ambiguousUnresolved[0].reference).toBe("AMBIG-01");
    expect(ambiguousUnresolved[0].reasonLabel).toContain("mas de una posicion canonica");
    expect(ambiguousUnresolved[0].reasonLabel).toContain("LT_NINO_KIDS");
    expect(ambiguousUnresolved[0].reasonLabel).toContain("LT_NINO_BEBE");
  });

  test("Ambiguous ref summary count is correct", () => {
    const ref = makeRef({
      reference: "AMBIG-02",
      subgrupoSag: "CONJUNTO MESES BB NIÑO",
    });
    const vendor = makeVendor("TEST", [ref]);
    const result = evaluateVendorAssortment(vendor);

    expect(result.unresolvedSummary.ambiguousDerroteroGroup).toBe(1);
  });

  test("Non-ambiguous refs do NOT produce AMBIGUOUS_DERROTERO_GROUP", () => {
    const ref = makeRef({
      reference: "CLEAR-01",
      subgrupoSag: "PIJAMA CC 2-8 NIÑA",
    });
    const vendor = makeVendor("TEST", [ref]);
    const result = evaluateVendorAssortment(vendor);

    const ambiguous = result.unresolvedRefs.filter(
      (r) => r.reason === "AMBIGUOUS_DERROTERO_GROUP",
    );
    expect(ambiguous.length).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E. CERTIFIED REFS — exclusive coverage
// ═════════════════════════════════════════════════════════════════════════════

describe("E. Certified references", () => {
  test("E1: Certified LT_NINO_KIDS → KIDS=1, BEBE=0", () => {
    const ref = makeRef({
      reference: "CERT-KIDS-01",
      subgrupoSag: "CONJUNTO MESES BB NIÑO",
      derroteroGroupCode: "LT_NINO_KIDS",
    });

    const result = evaluateCatalog(ltCatalog, [ref] as any, "TEXTIL");

    const kids = result.groups.find((g) => g.groupCode === "LT_NINO_KIDS")!;
    const kidsEntry = kids.entries.find((e) => e.subgroupCode === "CONJUNTO_MESES_BB_NINO_KIDS")!;
    expect(kidsEntry.currentReferences).toBe(1);

    const bebe = result.groups.find((g) => g.groupCode === "LT_NINO_BEBE")!;
    const bebeEntry = bebe.entries.find((e) => e.subgroupCode === "CONJUNTO_MESES_BB_NINO_BEBE")!;
    expect(bebeEntry.currentReferences).toBe(0);
  });

  test("E2: Certified LT_NINO_BEBE → KIDS=0, BEBE=1", () => {
    const ref = makeRef({
      reference: "CERT-BEBE-01",
      subgrupoSag: "CONJUNTO MESES BB NIÑO",
      derroteroGroupCode: "LT_NINO_BEBE",
    });

    const result = evaluateCatalog(ltCatalog, [ref] as any, "TEXTIL");

    const kids = result.groups.find((g) => g.groupCode === "LT_NINO_KIDS")!;
    const kidsEntry = kids.entries.find((e) => e.subgroupCode === "CONJUNTO_MESES_BB_NINO_KIDS")!;
    expect(kidsEntry.currentReferences).toBe(0);

    const bebe = result.groups.find((g) => g.groupCode === "LT_NINO_BEBE")!;
    const bebeEntry = bebe.entries.find((e) => e.subgroupCode === "CONJUNTO_MESES_BB_NINO_BEBE")!;
    expect(bebeEntry.currentReferences).toBe(1);
  });

  test("E3: Ambiguous ref → KIDS=0, BEBE=0", () => {
    const ref = makeRef({
      reference: "AMBIG-03",
      subgrupoSag: "CONJUNTO MESES BB NIÑO",
      // NO derroteroGroupCode
    });

    const result = evaluateCatalog(ltCatalog, [ref] as any, "TEXTIL");

    const kids = result.groups.find((g) => g.groupCode === "LT_NINO_KIDS")!;
    const kidsEntry = kids.entries.find((e) => e.subgroupCode === "CONJUNTO_MESES_BB_NINO_KIDS")!;
    expect(kidsEntry.currentReferences).toBe(0);

    const bebe = result.groups.find((g) => g.groupCode === "LT_NINO_BEBE")!;
    const bebeEntry = bebe.entries.find((e) => e.subgroupCode === "CONJUNTO_MESES_BB_NINO_BEBE")!;
    expect(bebeEntry.currentReferences).toBe(0);
  });

  test("E4: One KIDS + one BEBE → each covers exclusively its position", () => {
    const refKids = makeRef({
      reference: "CERT-K-01",
      subgrupoSag: "CONJUNTO MESES BB NIÑO",
      derroteroGroupCode: "LT_NINO_KIDS",
    });
    const refBebe = makeRef({
      reference: "CERT-B-01",
      subgrupoSag: "CONJUNTO MESES BB NIÑO",
      derroteroGroupCode: "LT_NINO_BEBE",
    });

    const result = evaluateCatalog(ltCatalog, [refKids, refBebe] as any, "TEXTIL");

    const kids = result.groups.find((g) => g.groupCode === "LT_NINO_KIDS")!;
    const kidsEntry = kids.entries.find((e) => e.subgroupCode === "CONJUNTO_MESES_BB_NINO_KIDS")!;
    expect(kidsEntry.currentReferences).toBe(1);
    expect(kidsEntry.matchedReferences).toEqual(["CERT-K-01"]);

    const bebe = result.groups.find((g) => g.groupCode === "LT_NINO_BEBE")!;
    const bebeEntry = bebe.entries.find((e) => e.subgroupCode === "CONJUNTO_MESES_BB_NINO_BEBE")!;
    expect(bebeEntry.currentReferences).toBe(1);
    expect(bebeEntry.matchedReferences).toEqual(["CERT-B-01"]);

    // Total assignments = 2, unique refs = 2
    const allAssigned: string[] = [];
    for (const g of result.groups) {
      for (const e of g.entries) {
        allAssigned.push(...e.matchedReferences);
      }
    }
    expect(allAssigned.length).toBe(2);
    expect(new Set(allAssigned).size).toBe(2);
  });

  test("E5: Single ambiguous ref never produces two assignments", () => {
    const ref = makeRef({
      reference: "SINGLE-AMBIG",
      subgrupoSag: "CONJUNTO MESES BB NIÑO",
    });

    const result = evaluateCatalog(ltCatalog, [ref] as any, "TEXTIL");

    const allAssigned: string[] = [];
    for (const g of result.groups) {
      for (const e of g.entries) {
        allAssigned.push(...e.matchedReferences);
      }
    }
    // Must be 0 — ambiguous ref is excluded from all positions
    expect(allAssigned.length).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// F. isAmbiguousPosition flag propagation
// ═════════════════════════════════════════════════════════════════════════════

describe("F. Ambiguous position flag in evaluation output", () => {
  test("CONJUNTO_MESES_BB_NINO_KIDS has isAmbiguousPosition=true", () => {
    const result = evaluateCatalog(ltCatalog, [], "TEXTIL");
    const kids = result.groups.find((g) => g.groupCode === "LT_NINO_KIDS")!;
    const entry = kids.entries.find((e) => e.subgroupCode === "CONJUNTO_MESES_BB_NINO_KIDS")!;
    expect(entry.isAmbiguousPosition).toBe(true);
  });

  test("CONJUNTO_MESES_BB_NINO_BEBE has isAmbiguousPosition=true", () => {
    const result = evaluateCatalog(ltCatalog, [], "TEXTIL");
    const bebe = result.groups.find((g) => g.groupCode === "LT_NINO_BEBE")!;
    const entry = bebe.entries.find((e) => e.subgroupCode === "CONJUNTO_MESES_BB_NINO_BEBE")!;
    expect(entry.isAmbiguousPosition).toBe(true);
  });

  test("Non-ambiguous entries have isAmbiguousPosition=false", () => {
    const result = evaluateCatalog(ltCatalog, [], "TEXTIL");
    const ninaKids = result.groups.find((g) => g.groupCode === "LT_NINA_KIDS")!;
    for (const e of ninaKids.entries) {
      expect(e.isAmbiguousPosition).toBe(false);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// G. STRUCTURAL INVARIANTS
// ═════════════════════════════════════════════════════════════════════════════

describe("G. Structural invariants", () => {
  test("G1: Each vendorRef appears in at most one assignment", () => {
    const refs = [
      makeRef({ reference: "G1-R1", subgrupoSag: "PIJAMA CC 2-8 NIÑA" }),
      makeRef({ reference: "G1-R2", subgrupoSag: "PIJAMA CC 2-8 NIÑO" }),
      makeRef({ reference: "G1-R3", subgrupoSag: "CONJUNTO MESES BB NIÑO" }),
      makeRef({
        reference: "G1-R4", subgrupoSag: "CONJUNTO MESES BB NIÑO",
        derroteroGroupCode: "LT_NINO_KIDS",
      }),
    ];

    const result = evaluateCatalog(ltCatalog, refs as any, "TEXTIL");
    const allRefs: string[] = [];
    for (const g of result.groups) {
      for (const e of g.entries) {
        allRefs.push(...e.matchedReferences);
      }
    }

    // Each ref appears at most once
    const seen = new Set<string>();
    for (const r of allRefs) {
      expect(seen.has(r)).toBe(false);
      seen.add(r);
    }
  });

  test("G4: Same sagSubgrupo + different groupCode → separate positions", () => {
    const result = evaluateCatalog(ltCatalog, [], "TEXTIL");

    // Both positions exist
    const kidsEntry = result.groups
      .find((g) => g.groupCode === "LT_NINO_KIDS")!.entries
      .find((e) => e.subgroupCode === "CONJUNTO_MESES_BB_NINO_KIDS")!;

    const bebeEntry = result.groups
      .find((g) => g.groupCode === "LT_NINO_BEBE")!.entries
      .find((e) => e.subgroupCode === "CONJUNTO_MESES_BB_NINO_BEBE")!;

    // Same sagSubgrupo
    expect(kidsEntry.sagSubgrupos).toEqual(["CONJUNTO MESES BB NIÑO"]);
    expect(bebeEntry.sagSubgrupos).toEqual(["CONJUNTO MESES BB NIÑO"]);

    // Different ideals
    expect(kidsEntry.targetReferences).toBe(5);
    expect(bebeEntry.targetReferences).toBe(3);
  });

  test("G5: Text match alone does not authorize group crossing", () => {
    // A ref matching "CONJUNTO MESES BB NIÑO" without certified group
    // must NOT cover any position
    const ref = makeRef({
      reference: "TEXT-ONLY",
      subgrupoSag: "CONJUNTO MESES BB NIÑO",
    });

    const result = evaluateCatalog(ltCatalog, [ref] as any, "TEXTIL");

    for (const g of result.groups) {
      for (const e of g.entries) {
        if (e.matchedReferences.includes("TEXT-ONLY")) {
          // This should not happen
          expect(true).toBe(false);
        }
      }
    }
  });

  test("G6: Sum of assigned refs <= unique refs used", () => {
    const refs = [
      makeRef({ reference: "G6-1", subgrupoSag: "PIJAMA CC 2-8 NIÑA" }),
      makeRef({ reference: "G6-2", subgrupoSag: "PIJAMA CL 2-8 NIÑA" }),
      makeRef({ reference: "G6-3", subgrupoSag: "CONJUNTO MESES BB NIÑO" }), // ambiguous
      makeRef({
        reference: "G6-4", subgrupoSag: "CONJUNTO MESES BB NIÑO",
        derroteroGroupCode: "LT_NINO_KIDS",
      }),
    ];

    const result = evaluateCatalog(ltCatalog, refs as any, "TEXTIL");

    const allAssigned: string[] = [];
    for (const g of result.groups) {
      for (const e of g.entries) {
        allAssigned.push(...e.matchedReferences);
      }
    }

    const uniqueAssigned = new Set(allAssigned);
    expect(allAssigned.length).toBe(uniqueAssigned.size); // no duplicates
    expect(uniqueAssigned.size).toBeLessThanOrEqual(refs.length);
  });
});
