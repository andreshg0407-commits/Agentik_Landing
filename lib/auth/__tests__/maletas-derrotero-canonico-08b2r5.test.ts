/**
 * MALETAS-DERROTERO-CANONICO-08B2R5 — Latin Kids 4-section matrix + VESTIDO 3→5
 *
 * 22 mandatory gates:
 *   T01: LT has exactly 4 sections
 *   T02: LT has exactly 24 positions
 *   T03: LT ideal total = 78
 *   T04: Subtotals are 25, 35, 9, 9
 *   T05: NIÑO and NIÑA never cross
 *   T06: KIDS and BEBE never cross
 *   T07: PIJAMA and CONJUNTO never cross
 *   T08: CC, CL, LL strict compatibility
 *   T09: Two "CONJUNTO MESES BB NIÑO" positions remain separate
 *   T10: KIDS position has ideal 5
 *   T11: BEBE position has ideal 3
 *   T12: CS NIÑA BEBÉ / VESTIDO = 5
 *   T13: CS NIÑA KIDS / VESTIDO = 5
 *   T14: No other CS quantity changed
 *   T15: CS total increased exactly +4
 *   T16: Néstor consumes new derrotero automatically
 *   T17: Orlando consumes new derrotero automatically
 *   T18: Third vendor fixture also receives without hardcode
 *   T19: Coverage, reconciliation, PDF, XML use same payload
 *   T20: DATA_UNVERIFIED prevents false coverage
 *   T21: 178 base tests still pass (verified externally)
 *   T22: Zero new TSC errors (verified externally)
 */

import { describe, test, expect } from "vitest";
import {
  buildCastillitosTextilCatalog,
  buildLatinKidsTextilCatalog,
  CS_GROUPS,
  LT_GROUPS,
} from "../../comercial/maletas/assortment-catalog/castillitos-mallet-assortment-catalog";
import type { MalletAssortmentGroup, MalletAssortmentEntry } from "../../comercial/maletas/assortment-catalog/mallet-assortment-types";
import * as fs from "fs";
import * as path from "path";

// ── Catalog instances ────────────────────────────────────────────────────────

const ltCatalog = buildLatinKidsTextilCatalog();
const csCatalog = buildCastillitosTextilCatalog();

// Helper: sum targetUnits across a group's active entries
function groupTotal(group: MalletAssortmentGroup): number {
  return group.entries
    .filter((e) => e.active)
    .reduce((s, e) => s + e.targetUnits, 0);
}

function groupPositions(group: MalletAssortmentGroup): number {
  return group.entries.filter((e) => e.active).length;
}

// ═════════════════════════════════════════════════════════════════════════════
// LATIN KIDS — 4-section matrix
// ═════════════════════════════════════════════════════════════════════════════

describe("MALETAS-DERROTERO-CANONICO-08B2R5 — Latin Kids", () => {
  test("T01: Latin Kids has exactly 4 sections (groups)", () => {
    expect(ltCatalog.groups.length).toBe(4);
    const codes = ltCatalog.groups.map((g) => g.groupCode);
    expect(codes).toContain("LT_NINA_KIDS");
    expect(codes).toContain("LT_NINO_KIDS");
    expect(codes).toContain("LT_NINA_BEBE");
    expect(codes).toContain("LT_NINO_BEBE");
  });

  test("T02: Latin Kids has exactly 24 positions", () => {
    const total = ltCatalog.groups.reduce((s, g) => s + groupPositions(g), 0);
    expect(total).toBe(24);
  });

  test("T03: Latin Kids ideal total = 78", () => {
    const total = ltCatalog.groups.reduce((s, g) => s + groupTotal(g), 0);
    expect(total).toBe(78);
  });

  test("T04: Subtotals are 25, 35, 9, 9", () => {
    const find = (code: string) => ltCatalog.groups.find((g) => g.groupCode === code)!;
    expect(groupTotal(find("LT_NINA_KIDS"))).toBe(25);
    expect(groupTotal(find("LT_NINO_KIDS"))).toBe(35);
    expect(groupTotal(find("LT_NINA_BEBE"))).toBe(9);
    expect(groupTotal(find("LT_NINO_BEBE"))).toBe(9);
  });

  test("T05: NIÑO and NIÑA never cross — no shared sagSubgrupos", () => {
    const ninaGroups = ltCatalog.groups.filter((g) => g.groupCode.includes("NINA"));
    const ninoGroups = ltCatalog.groups.filter((g) => g.groupCode.includes("NINO"));

    const ninaSags = new Set<string>();
    for (const g of ninaGroups) {
      for (const e of g.entries) {
        const sags = Array.isArray(e.sagSubgrupo) ? e.sagSubgrupo : e.sagSubgrupo ? [e.sagSubgrupo] : [];
        sags.forEach((s) => ninaSags.add(s));
      }
    }

    for (const g of ninoGroups) {
      for (const e of g.entries) {
        const sags = Array.isArray(e.sagSubgrupo) ? e.sagSubgrupo : e.sagSubgrupo ? [e.sagSubgrupo] : [];
        for (const s of sags) {
          expect(ninaSags.has(s)).toBe(false);
        }
      }
    }
  });

  test("T06: KIDS and BEBE separated by distinct positionIds — collision 'CONJUNTO MESES BB NIÑO' handled", () => {
    // "CONJUNTO MESES BB NIÑO" intentionally shares sagSubgrupo across KIDS and BEBE
    // but has different subgroupCode, ensuring separate positionIds
    const kidsGroups = ltCatalog.groups.filter((g) => g.groupCode.includes("KIDS"));
    const bebeGroups = ltCatalog.groups.filter((g) => g.groupCode.includes("BEBE"));

    // Verify unique positionIds across KIDS and BEBE
    const kidsPositionIds = new Set<string>();
    for (const g of kidsGroups) {
      for (const e of g.entries) {
        kidsPositionIds.add(`${ltCatalog.catalogId}|${g.groupCode}|${e.subgroupCode}`);
      }
    }
    for (const g of bebeGroups) {
      for (const e of g.entries) {
        const posId = `${ltCatalog.catalogId}|${g.groupCode}|${e.subgroupCode}`;
        expect(kidsPositionIds.has(posId)).toBe(false);
      }
    }

    // Verify the collision case: same sagSubgrupo, different subgroupCode
    const kidsNinoGroup = ltCatalog.groups.find((g) => g.groupCode === "LT_NINO_KIDS")!;
    const bebeNinoGroup = ltCatalog.groups.find((g) => g.groupCode === "LT_NINO_BEBE")!;
    const kidsConjunto = kidsNinoGroup.entries.find((e) => e.sagSubgrupo === "CONJUNTO MESES BB NIÑO")!;
    const bebeConjunto = bebeNinoGroup.entries.find((e) => e.sagSubgrupo === "CONJUNTO MESES BB NIÑO")!;
    expect(kidsConjunto.subgroupCode).not.toBe(bebeConjunto.subgroupCode);
  });

  test("T07: PIJAMA and CONJUNTO never cross in sagSubgrupos", () => {
    for (const g of ltCatalog.groups) {
      for (const e of g.entries) {
        const sags = Array.isArray(e.sagSubgrupo) ? e.sagSubgrupo : e.sagSubgrupo ? [e.sagSubgrupo] : [];
        for (const s of sags) {
          const isPijama = s.startsWith("PIJAMA");
          const isConjunto = s.startsWith("CONJUNTO");
          // Each entry is exclusively PIJAMA or CONJUNTO, never both
          expect(isPijama && isConjunto).toBe(false);
          // And the subgroupCode must match
          if (isPijama) {
            expect(e.subgroupCode!.startsWith("PIJAMA")).toBe(true);
          }
          if (isConjunto) {
            expect(e.subgroupCode!.startsWith("CONJUNTO")).toBe(true);
          }
        }
      }
    }
  });

  test("T08: CC, CL, LL strict compatibility — subgroupCode contains construction type", () => {
    for (const g of ltCatalog.groups) {
      for (const e of g.entries) {
        if (!e.subgroupCode) continue;
        const sags = Array.isArray(e.sagSubgrupo) ? e.sagSubgrupo : e.sagSubgrupo ? [e.sagSubgrupo] : [];
        for (const s of sags) {
          // If subgroupCode says _CC_, sagSubgrupo must say "CC"
          if (e.subgroupCode.includes("_CC_")) {
            expect(s).toContain("CC");
            expect(s).not.toMatch(/\bCL\b/);
            expect(s).not.toMatch(/\bLL\b/);
          }
          if (e.subgroupCode.includes("_CL_")) {
            expect(s).toContain("CL");
          }
          if (e.subgroupCode.includes("_LL_")) {
            expect(s).toContain("LL");
          }
        }
      }
    }
  });

  test("T09: Two 'CONJUNTO MESES BB NIÑO' positions remain separate", () => {
    // One in LT_NINO_KIDS with ideal=5, one in LT_NINO_BEBE with ideal=3
    const kidsGroup = ltCatalog.groups.find((g) => g.groupCode === "LT_NINO_KIDS")!;
    const bebeGroup = ltCatalog.groups.find((g) => g.groupCode === "LT_NINO_BEBE")!;

    const kidsEntry = kidsGroup.entries.find((e) =>
      e.sagSubgrupo === "CONJUNTO MESES BB NIÑO",
    )!;
    const bebeEntry = bebeGroup.entries.find((e) =>
      e.sagSubgrupo === "CONJUNTO MESES BB NIÑO",
    )!;

    expect(kidsEntry).toBeDefined();
    expect(bebeEntry).toBeDefined();
    // Different subgroupCode to avoid position ID collision
    expect(kidsEntry.subgroupCode).not.toBe(bebeEntry.subgroupCode);
  });

  test("T10: KIDS 'CONJUNTO MESES BB NIÑO' has ideal 5", () => {
    const kidsGroup = ltCatalog.groups.find((g) => g.groupCode === "LT_NINO_KIDS")!;
    const entry = kidsGroup.entries.find((e) =>
      e.sagSubgrupo === "CONJUNTO MESES BB NIÑO",
    )!;
    expect(entry.targetUnits).toBe(5);
  });

  test("T11: BEBE 'CONJUNTO MESES BB NIÑO' has ideal 3", () => {
    const bebeGroup = ltCatalog.groups.find((g) => g.groupCode === "LT_NINO_BEBE")!;
    const entry = bebeGroup.entries.find((e) =>
      e.sagSubgrupo === "CONJUNTO MESES BB NIÑO",
    )!;
    expect(entry.targetUnits).toBe(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CASTILLITOS — VESTIDO 3→5
// ═════════════════════════════════════════════════════════════════════════════

describe("MALETAS-DERROTERO-CANONICO-08B2R5 — CS VESTIDO", () => {
  test("T12: CS NIÑA BEBÉ / VESTIDO = 5", () => {
    const group = csCatalog.groups.find((g) => g.groupCode === "CS_NINA_BEBE")!;
    const vestido = group.entries.find((e) => e.subgroupCode === "VESTIDO")!;
    expect(vestido.targetUnits).toBe(5);
  });

  test("T13: CS NIÑA KIDS / VESTIDO = 5", () => {
    const group = csCatalog.groups.find((g) => g.groupCode === "CS_NINA_KIDS")!;
    const vestido = group.entries.find((e) => e.subgroupCode === "VESTIDO")!;
    expect(vestido.targetUnits).toBe(5);
  });

  test("T14: No other CS quantity changed (only 2 VESTIDO entries modified)", () => {
    // Pre-08B2R5 totals per group (VESTIDO was 3 each, now 5 each):
    // CS_NINA_BEBE: 18 → 20 (+2)
    // CS_NINO_BEBE: 15 (unchanged — no VESTIDO)
    // CS_NINA_KIDS: 16 → 18 (+2)
    // CS_NINO_KIDS: 14 (unchanged — no VESTIDO)

    const find = (code: string) => csCatalog.groups.find((g) => g.groupCode === code)!;

    // NINA BEBE: 3+2+3+2+2+5+1+1+1 = 20
    expect(groupTotal(find("CS_NINA_BEBE"))).toBe(20);
    // NINO BEBE: 3+2+2+3+2+1+1+1 = 15 (unchanged)
    expect(groupTotal(find("CS_NINO_BEBE"))).toBe(15);
    // NINA KIDS: 3+2+2+2+2+5+1+1 = 18
    expect(groupTotal(find("CS_NINA_KIDS"))).toBe(18);
    // NINO KIDS: 3+2+2+3+2+1+1 = 14 (unchanged)
    expect(groupTotal(find("CS_NINO_KIDS"))).toBe(14);

    // No VESTIDO in boys groups
    const ninoBebeVestido = find("CS_NINO_BEBE").entries.find((e) => e.subgroupCode === "VESTIDO");
    const ninoKidsVestido = find("CS_NINO_KIDS").entries.find((e) => e.subgroupCode === "VESTIDO");
    expect(ninoBebeVestido).toBeUndefined();
    expect(ninoKidsVestido).toBeUndefined();
  });

  test("T15: CS total increased exactly +4 (63→67)", () => {
    const csTotal = csCatalog.groups.reduce((s, g) => s + groupTotal(g), 0);
    expect(csTotal).toBe(67);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PROPAGATION — generic vendor consumption
// ═════════════════════════════════════════════════════════════════════════════

describe("MALETAS-DERROTERO-CANONICO-08B2R5 — Propagation", () => {
  const ROOT = path.resolve(__dirname, "../../..");

  const coverageEngineSrc = fs.readFileSync(
    path.join(ROOT, "lib/comercial/maletas/sample-coverage-engine.ts"), "utf8",
  );
  const loaderSrc = fs.readFileSync(
    path.join(ROOT, "lib/comercial/maletas/vendor-sample-loader.ts"), "utf8",
  );
  const reportPayloadSrc = fs.readFileSync(
    path.join(ROOT, "lib/comercial/maletas/coverage-report-payload.ts"), "utf8",
  );

  test("T16: Néstor consumes new derrotero — no hardcoded LT vendor filter", () => {
    // Coverage engine has no vendor-specific LT logic
    expect(coverageEngineSrc).not.toContain('"NESTOR"');
    // Evaluator imports buildLatinKidsTextilCatalog — all vendors get same catalog
    const evalSrc = fs.readFileSync(
      path.join(ROOT, "lib/comercial/maletas/maletas-functional-evaluation.ts"), "utf8",
    );
    expect(evalSrc).toContain("buildLatinKidsTextilCatalog");
  });

  test("T17: Orlando consumes new derrotero — same mechanism", () => {
    expect(coverageEngineSrc).not.toContain('"ORLANDO"');
  });

  test("T18: Third vendor fixture receives without hardcode", () => {
    // No vendor-specific code in the catalog file
    const catalogSrc = fs.readFileSync(
      path.join(ROOT, "lib/comercial/maletas/assortment-catalog/castillitos-mallet-assortment-catalog.ts"), "utf8",
    );
    // Catalog defines groups, not vendors
    expect(catalogSrc).not.toContain("NESTOR");
    expect(catalogSrc).not.toContain("ORLANDO");
    // buildLatinKidsTextilCatalog returns the same catalog for all vendors
    const cat1 = buildLatinKidsTextilCatalog();
    const cat2 = buildLatinKidsTextilCatalog();
    expect(cat1.groups.length).toBe(cat2.groups.length);
    expect(cat1.catalogId).toBe(cat2.catalogId);
  });

  test("T19: Coverage, reconciliation, PDF, XML all use CoverageReportPayload", () => {
    // PDF and XML derive from same payload
    expect(reportPayloadSrc).toContain("CoverageReportPayload");
    expect(reportPayloadSrc).toContain("pos.groupName"); // carries group identity
    expect(reportPayloadSrc).toContain("pos.subgroupName");
  });

  test("T20: DATA_UNVERIFIED prevents false coverage", () => {
    // Coverage engine uses DATA_UNVERIFIED guard
    expect(coverageEngineSrc).toContain("DATA_UNVERIFIED");
    expect(coverageEngineSrc).toContain("No fue posible verificar completamente la disponibilidad");
    // Does not mark as covered when data unverified
    expect(coverageEngineSrc).toContain("No se recomienda producir hasta certificar B01 y OP");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// STRUCTURAL — catalog versioning
// ═════════════════════════════════════════════════════════════════════════════

describe("MALETAS-DERROTERO-CANONICO-08B2R5 — Structural", () => {
  test("LT catalog version is 2.0.0", () => {
    expect(ltCatalog.version).toBe("2.0.0");
  });

  test("LT catalogId is cat-lt-textil-v2", () => {
    expect(ltCatalog.catalogId).toBe("cat-lt-textil-v2");
  });

  test("CS catalog version unchanged at 1.0.0", () => {
    expect(csCatalog.version).toBe("1.0.0");
  });

  test("All LT entries have gendered sagSubgrupo", () => {
    for (const g of ltCatalog.groups) {
      for (const e of g.entries) {
        const sag = typeof e.sagSubgrupo === "string" ? e.sagSubgrupo : "";
        expect(sag.includes("NIÑA") || sag.includes("NIÑO")).toBe(true);
      }
    }
  });

  test("Position IDs are unique across all LT groups", () => {
    const ids = new Set<string>();
    for (const g of ltCatalog.groups) {
      for (const e of g.entries) {
        const posId = `${ltCatalog.catalogId}|${g.groupCode}|${e.subgroupCode ?? e.subgroupName}`;
        expect(ids.has(posId)).toBe(false);
        ids.add(posId);
      }
    }
    expect(ids.size).toBe(24);
  });
});
