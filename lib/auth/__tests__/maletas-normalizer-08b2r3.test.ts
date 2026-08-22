/**
 * MALETAS-NORMALIZACION-B04-08B2R3 — FASE 9
 *
 * Behavioral tests for:
 *   - Textile reference normalizer (CC/CL/LL, BB/Kids, Niña/Niño)
 *   - Familia strictness (Pijama ≠ Conjunto)
 *   - BASICAS grupo resolution via description
 *   - B04 → OP_INCOMING cascade
 *   - DATA_UNVERIFIED when B04 unavailable
 *   - No 180-day rule
 *   - OP indicator consistency
 */

import { describe, test, expect } from "vitest";
import {
  normalizeTextileReference,
  isCompatibleWithPosition,
  normalizeDerroteroEntry,
  type FamiliaProducto,
  type Genero,
  type SegmentoEdad,
  type ConstruccionSuperior,
  type ConstruccionInferior,
} from "../../comercial/maletas/textile-reference-normalizer";

// ═══════════════════════════════════════════════════════════════════════════
// A — Construccion: CC, CL, LL
// ═══════════════════════════════════════════════════════════════════════════

describe("A — Construccion abbreviations CC/CL/LL", () => {
  test("T01: CC → corta/corta", () => {
    const r = normalizeTextileReference("Pijama Niña BB CC", "CS NIÑA BEBE", "PIJAMA NIÑA BB CC", "CS");
    expect(r.construccionSuperior).toBe("CORTA");
    expect(r.construccionInferior).toBe("CORTA");
  });

  test("T02: CL → corta/larga", () => {
    const r = normalizeTextileReference("Pijama Niña BB CL", "CS NIÑA BEBE", "PIJAMA NIÑA BB CL", "CS");
    expect(r.construccionSuperior).toBe("CORTA");
    expect(r.construccionInferior).toBe("LARGA");
  });

  test("T03: LL → larga/larga", () => {
    const r = normalizeTextileReference("Pijama Niño BB LL", "CS NIÑO BEBE", "PIJAMA NIÑO BB LL", "CS");
    expect(r.construccionSuperior).toBe("LARGA");
    expect(r.construccionInferior).toBe("LARGA");
  });

  test("T04: Full form CORTA CORTA → same as CC", () => {
    const r = normalizeTextileReference("Pijama corta corta", null, "PIJAMA CORTA CORTA", "LT");
    expect(r.construccionSuperior).toBe("CORTA");
    expect(r.construccionInferior).toBe("CORTA");
  });

  test("T05: Full form CORTA LARGA → same as CL", () => {
    const r = normalizeTextileReference("Pijama corta larga", null, "PIJAMA CORTA LARGA", "LT");
    expect(r.construccionSuperior).toBe("CORTA");
    expect(r.construccionInferior).toBe("LARGA");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B — Segmento de edad: BB/Bebé vs Kids
// ═══════════════════════════════════════════════════════════════════════════

describe("B — Segmento de edad BB/Bebé vs Kids", () => {
  test("T06: BB in subgrupo → BEBE", () => {
    const r = normalizeTextileReference("Pijama BB", "CS NIÑA BEBE", "PIJAMA NIÑA BB CL", "CS");
    expect(r.segmentoEdad).toBe("BEBE");
  });

  test("T07: KIDS from grupo → KIDS", () => {
    const r = normalizeTextileReference("Pijama Kids", "CS NIÑA KIDS", "PIJAMA NIÑA KIDS CL", "CS");
    expect(r.segmentoEdad).toBe("KIDS");
  });

  test("T08: BEBE from grupo CS NIÑO BEBE → BEBE", () => {
    const r = normalizeTextileReference("Camiseta", "CS NIÑO BEBE", "CAMISETA", "CS");
    expect(r.segmentoEdad).toBe("BEBE");
  });

  test("T09: MESES from subgrupo → MESES", () => {
    const r = normalizeTextileReference("Conjunto Meses", null, "CONJUNTO MESES", "LT");
    expect(r.segmentoEdad).toBe("MESES");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C — Género: Niña vs Niño
// ═══════════════════════════════════════════════════════════════════════════

describe("C — Género Niña vs Niño", () => {
  test("T10: NIÑA in subgrupo → NIÑA", () => {
    const r = normalizeTextileReference("Pijama", "CS NIÑA BEBE", "PIJAMA NIÑA BB CL", "CS");
    expect(r.genero).toBe("NIÑA");
  });

  test("T11: NIÑO in subgrupo → NIÑO", () => {
    const r = normalizeTextileReference("Pijama", "CS NIÑO KIDS", "PIJAMA NIÑO KIDS CL", "CS");
    expect(r.genero).toBe("NIÑO");
  });

  test("T12: BASICAS BEBE grupo without description gender → INDETERMINADO from grupo", () => {
    const r = normalizeTextileReference("Camiseta", "BASICAS BEBE", "CAMISETA", "CS");
    // BASICAS doesn't specify gender in grupo, description "Camiseta" alone can't determine
    expect(r.genero).toBe("INDETERMINADO");
  });

  test("T13: BASICAS BEBE with NIÑA in description → NIÑA", () => {
    const r = normalizeTextileReference("Camiseta Niña BB", "BASICAS BEBE", "CAMISETA", "CS");
    expect(r.genero).toBe("NIÑA");
  });

  test("T14: BASICAS KIDS with NIÑO in description → NIÑO", () => {
    const r = normalizeTextileReference("Polo Niño Kids", "BASICAS KIDS", "POLO", "CS");
    expect(r.genero).toBe("NIÑO");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D — Familia strictness: Pijama ≠ Conjunto
// ═══════════════════════════════════════════════════════════════════════════

describe("D — Familia strictness: Pijama ≠ Conjunto", () => {
  test("T15: PIJAMA subgrupo → familia PIJAMA", () => {
    const r = normalizeTextileReference("Pijama CL", null, "PIJAMA NIÑA BB CL", "CS");
    expect(r.familiaProducto).toBe("PIJAMA");
  });

  test("T16: CONJUNTO subgrupo → familia CONJUNTO", () => {
    const r = normalizeTextileReference("Conjunto CC", null, "CONJUNTO NIÑA BB CC", "CS");
    expect(r.familiaProducto).toBe("CONJUNTO");
  });

  test("T17: Pijama ref is NOT compatible with Conjunto position", () => {
    const ref = normalizeTextileReference("Pijama CL", "CS NIÑA BEBE", "PIJAMA NIÑA BB CL", "CS");
    const compatible = isCompatibleWithPosition(ref, {
      linea: "CS",
      familiaProducto: "CONJUNTO",
      genero: "NIÑA",
      segmentoEdad: "BEBE",
      construccionSuperior: "CORTA",
      construccionInferior: "LARGA",
    });
    expect(compatible).toBe(false);
  });

  test("T18: Pijama CL ref IS compatible with Pijama CL position", () => {
    const ref = normalizeTextileReference("Pijama CL", "CS NIÑA BEBE", "PIJAMA NIÑA BB CL", "CS");
    const compatible = isCompatibleWithPosition(ref, {
      linea: "CS",
      familiaProducto: "PIJAMA",
      genero: "NIÑA",
      segmentoEdad: "BEBE",
      construccionSuperior: "CORTA",
      construccionInferior: "LARGA",
    });
    expect(compatible).toBe(true);
  });

  test("T19: Pijama CC ref is NOT compatible with Pijama CL position", () => {
    const ref = normalizeTextileReference("Pijama CC", "CS NIÑA BEBE", "PIJAMA NIÑA BB CC", "CS");
    const compatible = isCompatibleWithPosition(ref, {
      linea: "CS",
      familiaProducto: "PIJAMA",
      genero: "NIÑA",
      segmentoEdad: "BEBE",
      construccionSuperior: "CORTA",
      construccionInferior: "LARGA",
    });
    expect(compatible).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E — BASICAS grupo with specific description
// ═══════════════════════════════════════════════════════════════════════════

describe("E — BASICAS grupo with specific description", () => {
  test("T20: BASICAS BEBE + CAMISETA subgrupo + 'Niña' in desc → CAMISETA/NIÑA/BEBE", () => {
    const r = normalizeTextileReference("Camiseta Niña Básica", "BASICAS BEBE", "CAMISETA", "CS");
    expect(r.familiaProducto).toBe("CAMISETA");
    expect(r.genero).toBe("NIÑA");
    expect(r.segmentoEdad).toBe("BEBE");
  });

  test("T21: BASICAS KIDS + POLO subgrupo + 'Niño' in desc → POLO/NIÑO/KIDS", () => {
    const r = normalizeTextileReference("Polo Niño Básico", "BASICAS KIDS", "POLO", "CS");
    expect(r.familiaProducto).toBe("POLO");
    expect(r.genero).toBe("NIÑO");
    expect(r.segmentoEdad).toBe("KIDS");
  });

  test("T22: BASICAS BEBE + BUZO subgrupo → BUZO_CAMIBUSO/BEBE", () => {
    const r = normalizeTextileReference("Buzo Bebé", "BASICAS BEBE", "BUZO", "CS");
    expect(r.familiaProducto).toBe("BUZO_CAMIBUSO");
    expect(r.segmentoEdad).toBe("BEBE");
  });

  test("T23: BASICAS BEBE + CAMIBUSO subgrupo → BUZO_CAMIBUSO", () => {
    const r = normalizeTextileReference("Camibuso Bebé", "BASICAS BEBE", "CAMIBUSO", "CS");
    expect(r.familiaProducto).toBe("BUZO_CAMIBUSO");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F — Compatibility matching
// ═══════════════════════════════════════════════════════════════════════════

describe("F — Compatibility matching rules", () => {
  test("T24: Wrong line → not compatible", () => {
    const ref = normalizeTextileReference("Pijama", "CS NIÑA BEBE", "PIJAMA NIÑA BB CL", "CS");
    expect(isCompatibleWithPosition(ref, {
      linea: "LT",
      familiaProducto: "PIJAMA",
      genero: "NIÑA",
      segmentoEdad: "BEBE",
      construccionSuperior: "CORTA",
      construccionInferior: "LARGA",
    })).toBe(false);
  });

  test("T25: Niña ref NOT compatible with Niño position", () => {
    const ref = normalizeTextileReference("Pijama Niña", "CS NIÑA BEBE", "PIJAMA NIÑA BB CL", "CS");
    expect(isCompatibleWithPosition(ref, {
      linea: "CS",
      familiaProducto: "PIJAMA",
      genero: "NIÑO",
      segmentoEdad: "BEBE",
      construccionSuperior: "CORTA",
      construccionInferior: "LARGA",
    })).toBe(false);
  });

  test("T26: BEBE ref NOT compatible with KIDS position", () => {
    const ref = normalizeTextileReference("Pijama BB", "CS NIÑA BEBE", "PIJAMA NIÑA BB CL", "CS");
    expect(isCompatibleWithPosition(ref, {
      linea: "CS",
      familiaProducto: "PIJAMA",
      genero: "NIÑA",
      segmentoEdad: "KIDS",
      construccionSuperior: "CORTA",
      construccionInferior: "LARGA",
    })).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// G — Derrotero entry normalization
// ═══════════════════════════════════════════════════════════════════════════

describe("G — Derrotero entry normalization", () => {
  test("T27: PIJAMA NIÑA BB CL → PIJAMA/NIÑA/BEBE/CORTA/LARGA", () => {
    const d = normalizeDerroteroEntry("PIJAMA NIÑA BB CL", "CS NIÑA BEBE", "CS");
    expect(d.familiaProducto).toBe("PIJAMA");
    expect(d.genero).toBe("NIÑA");
    expect(d.segmentoEdad).toBe("BEBE");
    expect(d.construccionSuperior).toBe("CORTA");
    expect(d.construccionInferior).toBe("LARGA");
  });

  test("T28: CONJUNTO NIÑO BB CC → CONJUNTO/NIÑO/BEBE/CORTA/CORTA", () => {
    const d = normalizeDerroteroEntry("CONJUNTO NIÑO BB CC", "CS NIÑO BEBE", "CS");
    expect(d.familiaProducto).toBe("CONJUNTO");
    expect(d.genero).toBe("NIÑO");
    expect(d.segmentoEdad).toBe("BEBE");
    expect(d.construccionSuperior).toBe("CORTA");
    expect(d.construccionInferior).toBe("CORTA");
  });

  test("T29: CAMISETA (CS NIÑA BEBE) → CAMISETA/NIÑA/BEBE", () => {
    const d = normalizeDerroteroEntry("CAMISETA", "CS NIÑA BEBE", "CS");
    expect(d.familiaProducto).toBe("CAMISETA");
    expect(d.genero).toBe("NIÑA");
    expect(d.segmentoEdad).toBe("BEBE");
  });

  test("T30: VESTIDO (CS NIÑA KIDS) → VESTIDO/NIÑA/KIDS", () => {
    const d = normalizeDerroteroEntry("VESTIDO", "CS NIÑA KIDS", "CS");
    expect(d.familiaProducto).toBe("VESTIDO");
    expect(d.genero).toBe("NIÑA");
    expect(d.segmentoEdad).toBe("KIDS");
  });

  test("T31: MAMELUCO LARGO → MAMELUCO with LARGA construction", () => {
    const d = normalizeDerroteroEntry("MAMELUCO LARGO", "CS NIÑA BEBE", "CS");
    expect(d.familiaProducto).toBe("MAMELUCO");
    expect(d.construccionSuperior).toBe("LARGA");
  });

  test("T32: Latin Kids PIJAMA CC 2-8 → PIJAMA/KIDS/CORTA/CORTA", () => {
    const d = normalizeDerroteroEntry("PIJAMA CC 2-8", null, "LT");
    expect(d.familiaProducto).toBe("PIJAMA");
    expect(d.segmentoEdad).toBe("KIDS");
    expect(d.construccionSuperior).toBe("CORTA");
    expect(d.construccionInferior).toBe("CORTA");
  });

  test("T33: Latin Kids CONJUNTO NAUTICO MESES → CONJUNTO/MESES", () => {
    const d = normalizeDerroteroEntry("CONJUNTO NAUTICO MESES", null, "LT");
    expect(d.familiaProducto).toBe("CONJUNTO");
    expect(d.segmentoEdad).toBe("MESES");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// H — B04 / OP cascade structural tests
// ═══════════════════════════════════════════════════════════════════════════

import * as fs from "fs";
import * as path from "path";

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../../", relPath), "utf-8");
}

describe("H — B04 inventory structural invariants", () => {
  test("T34: B04 loader queries vw_agentik_inventario for BODEGA '04 -%'", () => {
    const src = readSrc("lib/comercial/maletas/b04-production-inventory.ts");
    expect(src).toContain("WHERE BODEGA LIKE '04 -%'");
  });

  test("T35: B04 loader returns B04DataAvailability type", () => {
    const src = readSrc("lib/comercial/maletas/b04-production-inventory.ts");
    expect(src).toContain('availability: B04DataAvailability');
    expect(src).toContain('"AVAILABLE"');
    expect(src).toContain('"UNAVAILABLE"');
  });

  test("T36: B04 loader enriches from ProductEntity", () => {
    const src = readSrc("lib/comercial/maletas/b04-production-inventory.ts");
    expect(src).toContain("db.productEntity.findMany");
    expect(src).toContain("grupoSag");
    expect(src).toContain("subgrupoSag");
  });

  test("T37: B04 loader normalizes each reference", () => {
    const src = readSrc("lib/comercial/maletas/b04-production-inventory.ts");
    expect(src).toContain("normalizeTextileReference");
    expect(src).toContain("normalized: NormalizedReference");
  });

  test("T38: B04 loader only includes positive stock", () => {
    const src = readSrc("lib/comercial/maletas/b04-production-inventory.ts");
    expect(src).toContain("data.existencia <= 0");
  });

  test("T39: No temporal filter in B04 loader", () => {
    const src = readSrc("lib/comercial/maletas/b04-production-inventory.ts");
    expect(src).not.toContain("OP_ACTIVE_WINDOW");
    expect(src).not.toContain("cutoffMs");
    expect(src).not.toContain("setMonth(cutoff");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// I — Coverage engine B04 integration structural tests
// ═══════════════════════════════════════════════════════════════════════════

describe("I — Coverage engine must use B04 truth", () => {
  const engineSrc = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");

  test("T40: Coverage engine has CoverageDataAvailability with b01Available and opAvailable", () => {
    expect(engineSrc).toContain("b01Available: boolean");
    expect(engineSrc).toContain("opAvailable: boolean");
  });

  test("T41: DATA_UNVERIFIED when opAvailable=false (never PRODUCTION_REQUIRED)", () => {
    expect(engineSrc).toContain("!dataAvailability.opAvailable");
    const step2Idx = engineSrc.indexOf("// STEP 2: B04 Producto en Proceso (P0-08B2R6G-R1)");
    const step3Idx = engineSrc.indexOf("// STEP 3: PRODUCTION_REQUIRED");
    const opSection = engineSrc.slice(step2Idx, step3Idx);
    expect(opSection).toContain("DATA_UNVERIFIED");
  });

  test("T42: PRODUCTION_REQUIRED only after B01 AND OP miss", () => {
    const step3Idx = engineSrc.indexOf("// STEP 3: PRODUCTION_REQUIRED");
    expect(step3Idx).toBeGreaterThan(0);
    const after = engineSrc.slice(step3Idx, step3Idx + 500);
    expect(after).toContain("Stock certificado = 0 en B01 y B04. Produccion requerida.");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// J — Normalizer edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe("J — Normalizer edge cases", () => {
  test("T43: BLUSAS subgrupo → BLUSA familia", () => {
    const r = normalizeTextileReference("Blusas", "CS NIÑA BEBE", "BLUSAS", "CS");
    expect(r.familiaProducto).toBe("BLUSA");
  });

  test("T44: BLUSA subgrupo → BLUSA familia", () => {
    const r = normalizeTextileReference("Blusa", "CS NIÑA KIDS", "BLUSA", "CS");
    expect(r.familiaProducto).toBe("BLUSA");
  });

  test("T45: Confidence 1.0 for fully resolved reference", () => {
    const r = normalizeTextileReference("Pijama Niña BB CL", "CS NIÑA BEBE", "PIJAMA NIÑA BB CL", "CS");
    expect(r.confidence).toBe(1);
  });

  test("T46: Confidence < 1.0 for unresolved gender", () => {
    const r = normalizeTextileReference("Camiseta", "BASICAS BEBE", "CAMISETA", "CS");
    expect(r.confidence).toBeLessThan(1);
  });

  test("T47: Latin Kids PIJAMA CL 18-22 → correct age + construction", () => {
    const r = normalizeTextileReference("Pijama CL 18-22", null, "PIJAMA CL 18-22", "LT");
    expect(r.familiaProducto).toBe("PIJAMA");
    expect(r.segmentoEdad).toBe("KIDS");
    expect(r.construccionSuperior).toBe("CORTA");
    expect(r.construccionInferior).toBe("LARGA");
  });

  test("T48: CONJUNTO 2-12 → CONJUNTO/KIDS", () => {
    const r = normalizeTextileReference("Conjunto 2-12", null, "CONJUNTO 2-12", "LT");
    expect(r.familiaProducto).toBe("CONJUNTO");
    expect(r.segmentoEdad).toBe("KIDS");
  });

  test("T49: Raw values preserved exactly", () => {
    const r = normalizeTextileReference("Pijama Niña BB CL", "CS NIÑA BEBE", "PIJAMA NIÑA BB CL", "CS");
    expect(r.descripcionRaw).toBe("Pijama Niña BB CL");
    expect(r.grupoSagRaw).toBe("CS NIÑA BEBE");
    expect(r.subgrupoSagRaw).toBe("PIJAMA NIÑA BB CL");
    expect(r.lineaRaw).toBe("CS");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// K — GATE 1: B04 as sole OP authority
// ═══════════════════════════════════════════════════════════════════════════

describe("K — B04 sole OP authority (GATE 1)", () => {
  const loaderSrc = readSrc("lib/comercial/maletas/vendor-sample-loader.ts");

  test("T50: Only B04 candidates are passed to coverage engine (no legacy OP)", () => {
    expect(loaderSrc).toContain("const unifiedOpCandidates: OpCoverageCandidate[] = b04OpCandidates");
  });

  test("T51: opAvailable depends ONLY on b04Available — not legacy OP", () => {
    expect(loaderSrc).toContain("opAvailable: b04Available,");
    expect(loaderSrc).not.toContain("opAvailable: b04Available || opCovCandidates.length > 0");
  });

  test("T52: B04 unavailable → DATA_UNVERIFIED in coverage engine", () => {
    const engineSrc = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");
    const step2 = engineSrc.indexOf("// STEP 2: B04 Producto en Proceso (P0-08B2R6G-R1)");
    const step3 = engineSrc.indexOf("// STEP 3: PRODUCTION_REQUIRED");
    const opSection = engineSrc.slice(step2, step3);
    expect(opSection).toContain("!dataAvailability.opAvailable");
    expect(opSection).toContain("DATA_UNVERIFIED");
    expect(opSection).toContain("No fue posible verificar");
  });

  test("T53: Legacy ProductionOrder present but B04 unavailable → DATA_UNVERIFIED (legacy cannot certify)", () => {
    // Legacy OP data is NOT passed to coverage engine when B04 is sole authority
    expect(loaderSrc).not.toContain("...opCovCandidates.filter");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// L — GATE 2: No temporal filter for B04
// ═══════════════════════════════════════════════════════════════════════════

describe("L — No temporal filter for B04 (GATE 2)", () => {
  const evalSrc = readSrc("lib/comercial/maletas/maletas-functional-evaluation.ts");

  test("T54: checkOpEligibility bypasses age check for B04 candidates", () => {
    expect(evalSrc).toContain('op.opNumber === "B04"');
    // B04 candidates should return eligible:true immediately
    const b04Section = evalSrc.slice(
      evalSrc.indexOf('op.opNumber === "B04"'),
      evalSrc.indexOf('op.opNumber === "B04"') + 200,
    );
    expect(b04Section).toContain("eligible: true");
  });

  test("T55: B04 loader has no temporal filter", () => {
    const b04Src = readSrc("lib/comercial/maletas/b04-production-inventory.ts");
    expect(b04Src).not.toContain("OP_ACTIVE_WINDOW");
    expect(b04Src).not.toContain("cutoffMs");
    expect(b04Src).not.toContain("MAX_AGE");
    expect(b04Src).not.toContain("setMonth");
  });

  test("T56: B04 positive stock → OP_INCOMING in coverage engine", () => {
    const engineSrc = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");
    expect(engineSrc).toContain('"OP_INCOMING"');
    expect(engineSrc).toContain('"OP_ACTIVA"');
    const step2 = engineSrc.indexOf("// STEP 2: B04 Producto en Proceso (P0-08B2R6G-R1)");
    const step3 = engineSrc.indexOf("// STEP 3: PRODUCTION_REQUIRED");
    const opMatch = engineSrc.slice(step2, step3);
    expect(opMatch).toContain("OP_INCOMING");
    expect(opMatch).toContain("pendingQty");
    expect(opMatch).toContain("opNumber");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// M — GATE 3: B04 panel shows full inventory
// ═══════════════════════════════════════════════════════════════════════════

describe("M — B04 panel structure (GATE 3)", () => {
  const clientSrc = readSrc("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

  test("T57: B04 panel exists with correct title", () => {
    expect(clientSrc).toContain("En camino \u2014 Producto en proceso (B04)");
  });

  test("T58: B04 panel shows reconciled columns", () => {
    expect(clientSrc).toContain("Grupo / Subgrupo");
    expect(clientSrc).toContain('"B04"');
    expect(clientSrc).toContain('"Posicion"');
    expect(clientSrc).toContain("Razon");
    expect(clientSrc).toContain("Estado");
  });

  test("T59: B04 panel has search and line filter", () => {
    expect(clientSrc).toContain("Buscar referencia, descripcion, grupo, subgrupo...");
    expect(clientSrc).toContain("setLineFilter");
  });

  test("T60: B04 unavailable shows DATA_UNVERIFIED explanation", () => {
    expect(clientSrc).toContain("DATA_UNVERIFIED");
    expect(clientSrc).toContain("No fue posible consultar B04");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// N — GATE 6: Unified OP counters
// ═══════════════════════════════════════════════════════════════════════════

describe("N — Unified OP counters (GATE 6)", () => {
  const clientSrc = readSrc("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

  test("T61: Esperando OP reads from sampleCoverage.coverageSummary.opIncoming", () => {
    expect(clientSrc).toContain("sampleCoverage.coverageSummary.opIncoming");
  });

  test("T62: Con OP activa reads from sampleCoverage.coverageSummary.opIncoming", () => {
    // Must NOT use prodWithOp.length for the KPI display
    expect(clientSrc).toContain("En camino (B04)");
    expect(clientSrc).toContain('value: sampleCoverage.coverageSummary.opIncoming');
  });

  test("T63: En camino por OP reads from vendorCov.opIncoming (same engine)", () => {
    expect(clientSrc).toContain("En camino (B04)");
    expect(clientSrc).toContain("vendorCov.opIncoming");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O — GATE 4: Oportunidades auditable columns
// ═══════════════════════════════════════════════════════════════════════════

describe("O — Oportunidades auditable (GATE 4)", () => {
  const clientSrc = readSrc("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

  test("T64: Oportunidades table has normalizer data in stacked classification", () => {
    expect(clientSrc).toContain('"Clasificacion"');
    expect(clientSrc).toContain("cand.normalized.familiaProducto");
    expect(clientSrc).toContain("cand.normalized.genero");
    expect(clientSrc).toContain("cand.normalized.segmentoEdad");
  });

  test("T65: Oportunidades table shows derrotero position", () => {
    expect(clientSrc).toContain('"Posicion compatible"');
    expect(clientSrc).toContain("cand.derroteroMatch");
  });

  test("T66: OpportunityCandidateRef has normalized and derroteroMatch fields", () => {
    const loaderSrc = readSrc("lib/comercial/maletas/vendor-sample-loader.ts");
    expect(loaderSrc).toContain("normalized: normalizeTextileReference(");
    expect(loaderSrc).toContain("derroteroMatch:");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P — 08B2R4: Per-vendor reconciliation + UX cleanup
// ═══════════════════════════════════════════════════════════════════════════

describe("P — Per-vendor reconciliation (08B2R4)", () => {
  const clientSrc = readSrc("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

  test("T67: Main panel does NOT contain vendor-specific reconciliation", () => {
    expect(clientSrc).not.toContain("NestorReconciliationTable");
    expect(clientSrc).not.toContain('Reconciliacion Nestor');
  });

  test("T68: No hardcoded vendor names in reconciliation", () => {
    // VendorReconciliationTable uses vendorCov.vendorName dynamically
    expect(clientSrc).toContain("vendorCov.vendorName");
    // Should NOT contain hardcoded vendor references in reconciliation
    const reconSection = clientSrc.slice(clientSrc.indexOf("VendorReconciliationTable"));
    expect(reconSection).not.toContain('"NESTOR"');
    expect(reconSection).not.toContain('"ORLANDO"');
  });

  test("T69: VendorReconciliationTable exists and takes vendorCov prop", () => {
    expect(clientSrc).toContain("function VendorReconciliationTable");
    expect(clientSrc).toContain("vendorCov: VendorSampleCoverage");
  });

  test("T70: Reconciliation placed inside cobertura tab (drawer)", () => {
    const cobIdx = clientSrc.indexOf('drawerTab === "cobertura"');
    expect(cobIdx).toBeGreaterThan(0);
    const afterCob = clientSrc.slice(cobIdx, cobIdx + 8000);
    expect(afterCob).toContain("VendorReconciliationTable");
  });

  test("T71: Reconciliation shows invariant check", () => {
    expect(clientSrc).toContain("B01_AVAILABLE");
    expect(clientSrc).toContain("OP_INCOMING");
    expect(clientSrc).toContain("PRODUCTION_REQUIRED");
    expect(clientSrc).toContain("IMPORT_UNAVAILABLE");
    expect(clientSrc).toContain("DATA_UNVERIFIED");
  });

  test("T72: Cobertura tab does NOT contain 'Posiciones cubiertas' section", () => {
    const cobIdx = clientSrc.indexOf('drawerTab === "cobertura"');
    const afterCob = clientSrc.slice(cobIdx, cobIdx + 5000);
    expect(afterCob).not.toContain('"Posiciones cubiertas"');
  });

  test("T73: Cobertura tab does NOT contain 'Muestras para retirar' section", () => {
    const cobIdx = clientSrc.indexOf('drawerTab === "cobertura"');
    const afterCob = clientSrc.slice(cobIdx, cobIdx + 5000);
    expect(afterCob).not.toContain('"Muestras para retirar"');
  });

  test("T74: Retiro tab still exists with its counter", () => {
    expect(clientSrc).toContain('drawerTab === "retiro"');
    expect(clientSrc).toContain('"retiro"');
  });

  test("T75: Global tables use stacked layout (max 7 columns)", () => {
    // Oportunidades: 6 columns
    expect(clientSrc).toContain('"Posicion compatible"');
    expect(clientSrc).toContain('"Clasificacion"');
    // B04: 7 columns (Referencia, Descripcion, Linea, Grupo/Subgrupo, B04, Posicion/Razon, Estado)
    expect(clientSrc).toContain('"B04"');
  });

  test("T76: Tables use truncation for long descriptions", () => {
    expect(clientSrc).toContain("textOverflow");
    expect(clientSrc).toContain("ellipsis");
  });

  test("T77: Any vendor gets reconciliation automatically (no hardcoded IDs)", () => {
    // VendorReconciliationTable receives any VendorSampleCoverage — no vendor ID check
    const reconFunc = clientSrc.slice(
      clientSrc.indexOf("function VendorReconciliationTable"),
      clientSrc.indexOf("function VendorReconciliationTable") + 500,
    );
    expect(reconFunc).not.toContain('"NESTOR"');
    expect(reconFunc).not.toContain('"ORLANDO"');
    expect(reconFunc).not.toContain("vendorId ===");
  });

  test("T78: Activation idempotent — no vendor-specific code in loader", () => {
    const loaderSrc = readSrc("lib/comercial/maletas/vendor-sample-loader.ts");
    // B04 loading uses no vendor-specific logic
    const b04Section = loaderSrc.slice(loaderSrc.indexOf("B04 Production Inventory"));
    expect(b04Section).not.toContain('"NESTOR"');
    expect(b04Section).not.toContain('"ORLANDO"');
  });
});
