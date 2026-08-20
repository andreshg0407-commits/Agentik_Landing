/**
 * lib/comercial/maletas/assortment-catalog/castillitos-mallet-assortment-catalog.ts
 *
 * Tenant-specific assortment catalogs for Castillitos.
 * Transcribed EXACTLY from DERROTERO CS.xlsx and official Latin Kids matrix.
 *
 * Three catalogs:
 *   1. Castillitos Textil — 4 groups, 32 entries (from DERROTERO CS.xlsx)
 *   2. Latin Kids Textil  — 4 groups, 24 entries (gender + age sections)
 *   3. Importacion/Accesorios — 3 entries by sizeClass
 *
 * SCOPE: Maletas de vendedores ONLY. NOT for tiendas.
 *
 * Sprint: CASTILLITOS-MALLET-POLICIES-01
 * Sprint: MALETAS-DERROTERO-CANONICO-08B2R5 — LT 4-section matrix + VESTIDO 3→5
 */

import type {
  MalletAssortmentCatalog,
  MalletAssortmentGroup,
  MalletAssortmentEntry,
  MalletAssortmentEntryEvidence,
} from "./mallet-assortment-types";

// ── Evidence helpers ────────────────────────────────────────────────────────

const CS_EVIDENCE: MalletAssortmentEntryEvidence = {
  source: "DERROTERO CS.xlsx",
  confidence: 1.0,
  note: "Transcribed from official Castillitos derrotero Excel",
};

const IMPORT_EVIDENCE: MalletAssortmentEntryEvidence = {
  source: "Go Live meeting specification",
  confidence: 1.0,
  note: "Import accessory mallet targets by size class",
};

// ── Entry builder ───────────────────────────────────────────────────────────

function entry(
  subgroupCode: string | null,
  subgroupName: string,
  targetUnits: number,
  priority: number,
  evidence: MalletAssortmentEntryEvidence,
  sagSubgrupo: string | string[] | null = null,
): MalletAssortmentEntry {
  return {
    subgroupCode,
    subgroupName,
    targetUnits,
    minUnits: null,
    maxUnits: null,
    priority,
    active: true,
    evidence,
    sagSubgrupo,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. CASTILLITOS TEXTIL — Exact transcription from DERROTERO CS.xlsx
// ═══════════════════════════════════════════════════════════════════════════

const CS_NINA_BEBE: MalletAssortmentGroup = {
  groupCode: "CS_NINA_BEBE",
  groupName: "CS Niña Bebé",
  sagGrupo: "CS NIÑA BEBE",
  additionalSagGrupos: ["BASICAS BEBE"],
  entries: [
    entry("PIJAMA_CL", "Pijama Niña BB CL", 3, 1, CS_EVIDENCE, "PIJAMA NIÑA BB CL"),
    entry("PIJAMA_LL", "Pijama Niña BB LL", 2, 2, CS_EVIDENCE, "PIJAMA NIÑA BB LL"),
    entry("CONJUNTO_CC", "Conjunto Niña BB CC", 3, 3, CS_EVIDENCE, "CONJUNTO NIÑA BB CC"),
    entry("CONJUNTO_CL", "Conjunto Niña BB CL", 2, 4, CS_EVIDENCE, "CONJUNTO NIÑA BB CL"),
    entry("BLUSAS", "Blusas", 2, 5, CS_EVIDENCE, "BLUSAS"),
    entry("VESTIDO", "Vestido", 5, 6, CS_EVIDENCE, "VESTIDO"), // 08B2R5: 3→5
    entry("CAMISETA", "Camiseta", 1, 7, CS_EVIDENCE, "CAMISETA"),
    entry("MAMELUCO", "Mameluco", 1, 8, CS_EVIDENCE, ["MAMELUCO", "MAMELUCO LARGO"]),
    entry("BUZO_CAMIBUSO", "Buzo / Camibuso", 1, 9, CS_EVIDENCE, ["BUZO", "CAMIBUSO"]),
  ],
};

const CS_NINO_BEBE: MalletAssortmentGroup = {
  groupCode: "CS_NINO_BEBE",
  groupName: "CS Niño Bebé",
  sagGrupo: "CS NIÑO BEBE",
  additionalSagGrupos: ["BASICAS BEBE"],
  entries: [
    entry("PIJAMA_CL", "Pijama Niño BB CL", 3, 1, CS_EVIDENCE, "PIJAMA NIÑO BB CL"),
    entry("PIJAMA_LL", "Pijama Niño BB LL", 2, 2, CS_EVIDENCE, "PIJAMA NIÑO BB LL"),
    entry("CONJUNTO_CC", "Conjunto Niño BB CC", 2, 3, CS_EVIDENCE, "CONJUNTO NIÑO BB CC"),
    entry("CONJUNTO_CL", "Conjunto Niño BB CL", 3, 4, CS_EVIDENCE, "CONJUNTO NIÑO BB CL"),
    entry("CAMISETA", "Camiseta", 2, 5, CS_EVIDENCE, "CAMISETA"),
    entry("MAMELUCO", "Mameluco", 1, 6, CS_EVIDENCE, ["MAMELUCO", "MAMELUCO LARGO"]),
    entry("BUZO_CAMIBUSO", "Buzo / Camibuso", 1, 7, CS_EVIDENCE, ["BUZO", "CAMIBUSO"]),
    entry("POLO", "Polo", 1, 8, CS_EVIDENCE, "POLO"),
  ],
};

const CS_NINA_KIDS: MalletAssortmentGroup = {
  groupCode: "CS_NINA_KIDS",
  groupName: "CS Niña Kids",
  sagGrupo: "CS NIÑA KIDS",
  additionalSagGrupos: ["BASICAS KIDS"],
  entries: [
    entry("PIJAMA_CL", "Pijama Niña Kids CL", 3, 1, CS_EVIDENCE, "PIJAMA NIÑA KIDS CL"),
    entry("PIJAMA_LL", "Pijama Niña Kids LL", 2, 2, CS_EVIDENCE, "PIJAMA NIÑA KIDS LL"),
    entry("CONJUNTO_CC", "Conjunto Niña Kids CC", 2, 3, CS_EVIDENCE, "CONJUNTO NIÑA KIDS CC"),
    entry("CONJUNTO_CL", "Conjunto Niña Kids CL", 2, 4, CS_EVIDENCE, "CONJUNTO NIÑA KIDS CL"),
    entry("BLUSA", "Blusa", 2, 5, CS_EVIDENCE, "BLUSA"),
    entry("VESTIDO", "Vestido", 5, 6, CS_EVIDENCE, "VESTIDO"), // 08B2R5: 3→5
    entry("CAMISETA", "Camiseta", 1, 7, CS_EVIDENCE, "CAMISETA"),
    entry("BUZO_CAMIBUSO", "Buzo / Camibuso", 1, 8, CS_EVIDENCE, ["BUZO", "CAMIBUSO"]),
  ],
};

const CS_NINO_KIDS: MalletAssortmentGroup = {
  groupCode: "CS_NINO_KIDS",
  groupName: "CS Niño Kids",
  sagGrupo: "CS NIÑO KIDS",
  additionalSagGrupos: ["BASICAS KIDS"],
  entries: [
    entry("PIJAMA_CL", "Pijama Niño Kids CL", 3, 1, CS_EVIDENCE, "PIJAMA NIÑO KIDS CL"),
    entry("PIJAMA_LL", "Pijama Niño Kids LL", 2, 2, CS_EVIDENCE, "PIJAMA NIÑO KIDS LL"),
    entry("CONJUNTO_CC", "Conjunto Niño Kids CC", 2, 3, CS_EVIDENCE, "CONJUNTO NIÑO KIDS CC"),
    entry("CONJUNTO_CL", "Conjunto Niño Kids CL", 3, 4, CS_EVIDENCE, "CONJUNTO NIÑO KIDS CL"),
    entry("CAMISETA", "Camiseta", 2, 5, CS_EVIDENCE, "CAMISETA"),
    entry("BUZO_CAMIBUSO", "Buzo / Camibuso", 1, 6, CS_EVIDENCE, ["BUZO", "CAMIBUSO"]),
    entry("POLO", "Polo", 1, 7, CS_EVIDENCE, "POLO"),
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. LATIN KIDS TEXTIL — 4 sections by gender + age stage
//    Source: Official Latin Kids derrotero matrix (Aug 2026)
//    Each entry = exactly one SAG subgrupo, gender-discriminated.
//    Closed universe: only subgrupos in the official document participate.
//
//    COLLISION GUARD: "CONJUNTO MESES BB NIÑO" appears in BOTH
//    LT_NINO_KIDS (ideal=5) and LT_NINO_BEBE (ideal=3).
//    They MUST remain as two distinct positions — never merged.
//
//    Invariants:
//      4 sections, 24 positions, 78 total ideal
//      Subtotals: 25 + 35 + 9 + 9 = 78
//
//    Sprint: MALETAS-DERROTERO-CANONICO-08B2R5
// ═══════════════════════════════════════════════════════════════════════════

const LT_EVIDENCE_OFFICIAL: MalletAssortmentEntryEvidence = {
  source: "DERROTERO LT (official matrix Aug 2026)",
  confidence: 1.0,
  note: "Transcribed from official Latin Kids derrotero — 4 sections, gender + age",
};

// ── A. LT NIÑA KIDS — 8 positions, subtotal 25 ─────────────────────────

const LT_NINA_KIDS: MalletAssortmentGroup = {
  groupCode: "LT_NINA_KIDS",
  groupName: "LT Niña Kids",
  sagGrupo: null,
  entries: [
    entry("PIJAMA_CC_10_16_NINA", "Pijama CC 10-16 Niña", 3, 1, LT_EVIDENCE_OFFICIAL, "PIJAMA CC 10-16 NIÑA"),
    entry("PIJAMA_CC_2_8_NINA",   "Pijama CC 2-8 Niña",   4, 2, LT_EVIDENCE_OFFICIAL, "PIJAMA CC 2-8 NIÑA"),
    entry("PIJAMA_CL_10_16_NINA", "Pijama CL 10-16 Niña", 4, 3, LT_EVIDENCE_OFFICIAL, "PIJAMA CL 10-16 NIÑA"),
    entry("PIJAMA_CL_2_8_NINA",   "Pijama CL 2-8 Niña",   5, 4, LT_EVIDENCE_OFFICIAL, "PIJAMA CL 2-8 NIÑA"),
    entry("PIJAMA_LL_10_16_NINA", "Pijama LL 10-16 Niña", 2, 5, LT_EVIDENCE_OFFICIAL, "PIJAMA LL 10-16 NIÑA"),
    entry("PIJAMA_LL_2_8_NINA",   "Pijama LL 2-8 Niña",   3, 6, LT_EVIDENCE_OFFICIAL, "PIJAMA LL 2-8 NIÑA"),
    entry("PIJAMA_CL_18_22_NINA", "Pijama CL 18-22 Niña", 2, 7, LT_EVIDENCE_OFFICIAL, "PIJAMA CL 18-22 NIÑA"),
    entry("PIJAMA_CC_18_22_NINA", "Pijama CC 18-22 Niña", 2, 8, LT_EVIDENCE_OFFICIAL, "PIJAMA CC 18-22 NIÑA"),
  ],
};

// ── B. LT NIÑO KIDS — 10 positions, subtotal 35 ────────────────────────

const LT_NINO_KIDS: MalletAssortmentGroup = {
  groupCode: "LT_NINO_KIDS",
  groupName: "LT Niño Kids",
  sagGrupo: null,
  entries: [
    entry("PIJAMA_CC_10_16_NINO", "Pijama CC 10-16 Niño", 3, 1, LT_EVIDENCE_OFFICIAL, "PIJAMA CC 10-16 NIÑO"),
    entry("PIJAMA_CC_2_8_NINO",   "Pijama CC 2-8 Niño",   4, 2, LT_EVIDENCE_OFFICIAL, "PIJAMA CC 2-8 NIÑO"),
    entry("PIJAMA_CL_10_16_NINO", "Pijama CL 10-16 Niño", 4, 3, LT_EVIDENCE_OFFICIAL, "PIJAMA CL 10-16 NIÑO"),
    entry("PIJAMA_CL_2_8_NINO",   "Pijama CL 2-8 Niño",   5, 4, LT_EVIDENCE_OFFICIAL, "PIJAMA CL 2-8 NIÑO"),
    entry("PIJAMA_LL_10_16_NINO", "Pijama LL 10-16 Niño", 2, 5, LT_EVIDENCE_OFFICIAL, "PIJAMA LL 10-16 NIÑO"),
    entry("PIJAMA_LL_2_8_NINO",   "Pijama LL 2-8 Niño",   3, 6, LT_EVIDENCE_OFFICIAL, "PIJAMA LL 2-8 NIÑO"),
    entry("PIJAMA_CL_18_22_NINO", "Pijama CL 18-22 Niño", 2, 7, LT_EVIDENCE_OFFICIAL, "PIJAMA CL 18-22 NIÑO"),
    entry("PIJAMA_CC_18_22_NINO", "Pijama CC 18-22 Niño", 2, 8, LT_EVIDENCE_OFFICIAL, "PIJAMA CC 18-22 NIÑO"),
    entry("CONJUNTO_2_12_NINO",   "Conjunto 2-12 Niño",   5, 9, LT_EVIDENCE_OFFICIAL, "CONJUNTO 2-12 NIÑO"),
    entry("CONJUNTO_MESES_BB_NINO_KIDS", "Conjunto Meses BB Niño", 5, 10, LT_EVIDENCE_OFFICIAL, "CONJUNTO MESES BB NIÑO"),
  ],
};

// ── C. LT NIÑA BEBE — 3 positions, subtotal 9 ──────────────────────────

const LT_NINA_BEBE: MalletAssortmentGroup = {
  groupCode: "LT_NINA_BEBE",
  groupName: "LT Niña Bebe",
  sagGrupo: null,
  entries: [
    entry("CONJUNTO_MESES_BB_NINA", "Conjunto Meses BB Niña", 3, 1, LT_EVIDENCE_OFFICIAL, "CONJUNTO MESES BB NIÑA"),
    entry("PIJAMA_MESES_CL_NINA_BB", "Pijama Meses CL Niña BB", 3, 2, LT_EVIDENCE_OFFICIAL, "PIJAMA MESES CL NIÑA BB"),
    entry("PIJAMA_MESES_LL_NINA_BB", "Pijama Meses LL Niña BB", 3, 3, LT_EVIDENCE_OFFICIAL, "PIJAMA MESES LL NIÑA BB"),
  ],
};

// ── D. LT NIÑO BEBE — 3 positions, subtotal 9 ──────────────────────────

const LT_NINO_BEBE: MalletAssortmentGroup = {
  groupCode: "LT_NINO_BEBE",
  groupName: "LT Niño Bebe",
  sagGrupo: null,
  entries: [
    entry("CONJUNTO_MESES_BB_NINO_BEBE", "Conjunto Meses BB Niño", 3, 1, LT_EVIDENCE_OFFICIAL, "CONJUNTO MESES BB NIÑO"),
    entry("PIJAMA_MESES_CL_NINO_BB", "Pijama Meses CL Niño BB", 3, 2, LT_EVIDENCE_OFFICIAL, "PIJAMA MESES CL NIÑO BB"),
    entry("PIJAMA_MESES_LL_NINO_BB", "Pijama Meses LL Niño BB", 3, 3, LT_EVIDENCE_OFFICIAL, "PIJAMA MESES LL NIÑO BB"),
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// 3. IMPORTACION / ACCESORIOS — By size class
// ═══════════════════════════════════════════════════════════════════════════

const IMPORT_ACCESORIOS: MalletAssortmentGroup = {
  groupCode: "IMPORT_ACCESORIOS",
  groupName: "Importación / Accesorios",
  sagGrupo: null, // Import uses sizeClass/handlingUnit, not SAG grupo
  entries: [
    entry("PEQUENO", "Pequeño", 10, 1, IMPORT_EVIDENCE, null), // Matched by sizeClass, not sagSubgrupo
    entry("MEDIANO", "Mediano", 10, 2, IMPORT_EVIDENCE, null),
    // GRANDE excluded from maletas per business decision (AGENTIK-SALES-PORTFOLIO-SUPPLY-PLAN-02).
    // Historical target preserved; active: false prevents evaluation, coverage, and candidate selection.
    { subgroupCode: "GRANDE", subgroupName: "Grande", targetUnits: 3, minUnits: null, maxUnits: null, priority: 3, active: false, evidence: IMPORT_EVIDENCE, sagSubgrupo: null },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// Catalog builders (tenant-specific)
// ═══════════════════════════════════════════════════════════════════════════

const CASTILLITOS_TENANT_ID = "castillitos";

export function buildCastillitosTextilCatalog(): MalletAssortmentCatalog {
  return {
    catalogId: "cat-cs-textil-v1",
    tenantId: CASTILLITOS_TENANT_ID,
    name: "Derrotero Castillitos Textil v1",
    commercialWorld: "TEXTIL",
    brand: "Castillitos",
    version: "1.0.0",
    status: "ACTIVE",
    validFrom: new Date("2026-01-01"),
    validUntil: null,
    groups: [CS_NINA_BEBE, CS_NINO_BEBE, CS_NINA_KIDS, CS_NINO_KIDS],
    source: "DERROTERO CS.xlsx",
    evidence: {
      domain: "MALLET_ASSORTMENT",
      traceId: "castillitos-mallet-policies-01",
      tenantId: CASTILLITOS_TENANT_ID,
      catalogId: "cat-cs-textil-v1",
      source: "DERROTERO CS.xlsx",
      confidence: 1.0,
      observedAt: new Date("2026-07-13"),
      note: "Official derrotero from Castillitos Go Live",
    },
    createdAt: new Date("2026-07-13"),
    activatedAt: new Date("2026-07-13"),
  };
}

export function buildLatinKidsTextilCatalog(): MalletAssortmentCatalog {
  return {
    catalogId: "cat-lt-textil-v2",
    tenantId: CASTILLITOS_TENANT_ID,
    name: "Derrotero Latin Kids Textil v2",
    commercialWorld: "TEXTIL",
    brand: "Latin Kids",
    version: "2.0.0",
    status: "ACTIVE",
    validFrom: new Date("2026-08-20"),
    validUntil: null,
    groups: [LT_NINA_KIDS, LT_NINO_KIDS, LT_NINA_BEBE, LT_NINO_BEBE],
    source: "DERROTERO LT (official matrix Aug 2026)",
    evidence: {
      domain: "MALLET_ASSORTMENT",
      traceId: "maletas-derrotero-canonico-08b2r5",
      tenantId: CASTILLITOS_TENANT_ID,
      catalogId: "cat-lt-textil-v2",
      source: "DERROTERO LT (official matrix Aug 2026)",
      confidence: 1.0,
      observedAt: new Date("2026-08-20"),
      note: "Latin Kids 4-section matrix — gender (NIÑA/NIÑO) + age (KIDS/BEBE), 24 positions, 78 ideal",
    },
    createdAt: new Date("2026-08-20"),
    activatedAt: new Date("2026-08-20"),
  };
}

export function buildImportAccesoriosCatalog(): MalletAssortmentCatalog {
  return {
    catalogId: "cat-import-accesorios-v1",
    tenantId: CASTILLITOS_TENANT_ID,
    name: "Derrotero Importación / Accesorios v1",
    commercialWorld: "IMPORTACION",
    brand: null,
    version: "1.0.0",
    status: "ACTIVE",
    validFrom: new Date("2026-01-01"),
    validUntil: null,
    groups: [IMPORT_ACCESORIOS],
    source: "Go Live meeting specification",
    evidence: {
      domain: "MALLET_ASSORTMENT",
      traceId: "castillitos-mallet-policies-01",
      tenantId: CASTILLITOS_TENANT_ID,
      catalogId: "cat-import-accesorios-v1",
      source: "Go Live meeting specification",
      confidence: 1.0,
      observedAt: new Date("2026-07-13"),
      note: "Import/accessory mallet targets by size class",
    },
    createdAt: new Date("2026-07-13"),
    activatedAt: new Date("2026-07-13"),
  };
}

// ── Exported group constants for test verification ──────────────────────────

export const CS_GROUPS = {
  CS_NINA_BEBE,
  CS_NINO_BEBE,
  CS_NINA_KIDS,
  CS_NINO_KIDS,
} as const;

export const LT_GROUPS = {
  LT_NINA_KIDS,
  LT_NINO_KIDS,
  LT_NINA_BEBE,
  LT_NINO_BEBE,
} as const;

export const IMPORT_GROUPS = {
  IMPORT_ACCESORIOS,
} as const;
