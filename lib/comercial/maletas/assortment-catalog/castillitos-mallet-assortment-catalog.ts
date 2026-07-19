/**
 * lib/comercial/maletas/assortment-catalog/castillitos-mallet-assortment-catalog.ts
 *
 * Tenant-specific assortment catalogs for Castillitos.
 * Transcribed EXACTLY from DERROTERO CS.xlsx and existing Latin Kids data.
 *
 * Three catalogs:
 *   1. Castillitos Textil — 4 groups, 32 entries (from DERROTERO CS.xlsx)
 *   2. Latin Kids Textil  — 1 group, 11 entries (from official DERROTERO LT document)
 *   3. Importacion/Accesorios — 3 entries by sizeClass
 *
 * SCOPE: Maletas de vendedores ONLY. NOT for tiendas.
 *
 * Sprint: CASTILLITOS-MALLET-POLICIES-01
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
  entries: [
    entry("PIJAMA_CL", "Pijama Niña BB CL", 3, 1, CS_EVIDENCE, "PIJAMA NIÑA BB CL"),
    entry("PIJAMA_LL", "Pijama Niña BB LL", 2, 2, CS_EVIDENCE, "PIJAMA NIÑA BB LL"),
    entry("CONJUNTO_CC", "Conjunto Niña BB CC", 3, 3, CS_EVIDENCE, "CONJUNTO NIÑA BB CC"),
    entry("CONJUNTO_CL", "Conjunto Niña BB CL", 2, 4, CS_EVIDENCE, "CONJUNTO NIÑA BB CL"),
    entry("BLUSAS", "Blusas", 2, 5, CS_EVIDENCE, "BLUSAS"),
    entry("VESTIDO", "Vestido", 3, 6, CS_EVIDENCE, "VESTIDO"),
    entry("CAMISETA", "Camiseta", 1, 7, CS_EVIDENCE, "CAMISETA"),
    entry("MAMELUCO", "Mameluco", 1, 8, CS_EVIDENCE, "MAMELUCO"),
    entry("BUZO_CAMIBUSO", "Buzo / Camibuso", 1, 9, CS_EVIDENCE, ["BUZO", "CAMIBUSO"]),
  ],
};

const CS_NINO_BEBE: MalletAssortmentGroup = {
  groupCode: "CS_NINO_BEBE",
  groupName: "CS Niño Bebé",
  sagGrupo: "CS NIÑO BEBE",
  entries: [
    entry("PIJAMA_CL", "Pijama Niño BB CL", 3, 1, CS_EVIDENCE, "PIJAMA NIÑO BB CL"),
    entry("PIJAMA_LL", "Pijama Niño BB LL", 2, 2, CS_EVIDENCE, "PIJAMA NIÑO BB LL"),
    entry("CONJUNTO_CC", "Conjunto Niño BB CC", 2, 3, CS_EVIDENCE, "CONJUNTO NIÑO BB CC"),
    entry("CONJUNTO_CL", "Conjunto Niño BB CL", 3, 4, CS_EVIDENCE, "CONJUNTO NIÑO BB CL"),
    entry("CAMISETA", "Camiseta", 2, 5, CS_EVIDENCE, "CAMISETA"),
    entry("MAMELUCO", "Mameluco", 1, 6, CS_EVIDENCE, "MAMELUCO"),
    entry("BUZO_CAMIBUSO", "Buzo / Camibuso", 1, 7, CS_EVIDENCE, ["BUZO", "CAMIBUSO"]),
    entry("POLO", "Polo", 1, 8, CS_EVIDENCE, "POLO"),
  ],
};

const CS_NINA_KIDS: MalletAssortmentGroup = {
  groupCode: "CS_NINA_KIDS",
  groupName: "CS Niña Kids",
  sagGrupo: "CS NIÑA KIDS",
  entries: [
    entry("PIJAMA_CL", "Pijama Niña Kids CL", 3, 1, CS_EVIDENCE, "PIJAMA NIÑA KIDS CL"),
    entry("PIJAMA_LL", "Pijama Niña Kids LL", 2, 2, CS_EVIDENCE, "PIJAMA NIÑA KIDS LL"),
    entry("CONJUNTO_CC", "Conjunto Niña Kids CC", 2, 3, CS_EVIDENCE, "CONJUNTO NIÑA KIDS CC"),
    entry("CONJUNTO_CL", "Conjunto Niña Kids CL", 2, 4, CS_EVIDENCE, "CONJUNTO NIÑA KIDS CL"),
    entry("BLUSA", "Blusa", 2, 5, CS_EVIDENCE, "BLUSA"),
    entry("VESTIDO", "Vestido", 3, 6, CS_EVIDENCE, "VESTIDO"),
    entry("CAMISETA", "Camiseta", 1, 7, CS_EVIDENCE, "CAMISETA"),
    entry("BUZO_CAMIBUSO", "Buzo / Camibuso", 1, 8, CS_EVIDENCE, ["BUZO", "CAMIBUSO"]),
  ],
};

const CS_NINO_KIDS: MalletAssortmentGroup = {
  groupCode: "CS_NINO_KIDS",
  groupName: "CS Niño Kids",
  sagGrupo: "CS NIÑO KIDS",
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
// 2. LATIN KIDS TEXTIL — Official derrotero (11 entries, 1:1 SAG subgrupo)
//    Source: Official Latin Kids derrotero document
//    Each entry = exactly one SAG subgrupo, no consolidation.
//    Closed universe: only subgrupos in the official document participate.
// ═══════════════════════════════════════════════════════════════════════════

const LT_EVIDENCE_OFFICIAL: MalletAssortmentEntryEvidence = {
  source: "DERROTERO LT (official document)",
  confidence: 1.0,
  note: "Transcribed from official Latin Kids derrotero",
};

const LT_SUBGRUPOS: MalletAssortmentGroup = {
  groupCode: "LT_SUBGRUPOS",
  groupName: "Latin Kids",
  sagGrupo: null, // Latin Kids uses subgrupo only for matching
  entries: [
    entry("PIJAMA_CC_10_16", "Pijama CC 10-16", 3, 1, LT_EVIDENCE_OFFICIAL, "PIJAMA CC 10-16"),
    entry("PIJAMA_CC_2_8", "Pijama CC 2-8", 4, 2, LT_EVIDENCE_OFFICIAL, "PIJAMA CC 2-8"),
    entry("PIJAMA_CL_10_16", "Pijama CL 10-16", 4, 3, LT_EVIDENCE_OFFICIAL, "PIJAMA CL 10-16"),
    entry("PIJAMA_CL_2_8", "Pijama CL 2-8", 5, 4, LT_EVIDENCE_OFFICIAL, "PIJAMA CL 2-8"),
    entry("PIJAMA_LL_10_16", "Pijama LL 10-16", 2, 5, LT_EVIDENCE_OFFICIAL, "PIJAMA LL 10-16"),
    entry("PIJAMA_LL_2_8", "Pijama LL 2-8", 3, 6, LT_EVIDENCE_OFFICIAL, "PIJAMA LL 2-8"),
    entry("PIJAMA_CL_18_22", "Pijama CL 18-22", 2, 7, LT_EVIDENCE_OFFICIAL, "PIJAMA CL 18-22"),
    entry("PIJAMA_CC_18_22", "Pijama CC 18-22", 2, 8, LT_EVIDENCE_OFFICIAL, "PIJAMA CC 18-22"),
    entry("CONJUNTO_2_12", "Conjunto 2-12", 5, 9, LT_EVIDENCE_OFFICIAL, "CONJUNTO 2-12"),
    entry("CONJUNTO_NAUTICO_MESES", "Conjunto Náutico Meses", 5, 10, LT_EVIDENCE_OFFICIAL, "CONJUNTO NAUTICO MESES"),
    entry("CONJUNTO_MESES", "Conjunto Meses", 3, 11, LT_EVIDENCE_OFFICIAL, "CONJUNTO MESES"),
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
    entry("GRANDE", "Grande", 3, 3, IMPORT_EVIDENCE, null),
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
    catalogId: "cat-lt-textil-v1",
    tenantId: CASTILLITOS_TENANT_ID,
    name: "Derrotero Latin Kids Textil v1",
    commercialWorld: "TEXTIL",
    brand: "Latin Kids",
    version: "1.0.0",
    status: "ACTIVE",
    validFrom: new Date("2026-01-01"),
    validUntil: null,
    groups: [LT_SUBGRUPOS],
    source: "DERROTERO LT (official document)",
    evidence: {
      domain: "MALLET_ASSORTMENT",
      traceId: "castillitos-mallet-policies-01",
      tenantId: CASTILLITOS_TENANT_ID,
      catalogId: "cat-lt-textil-v1",
      source: "DERROTERO LT (official document)",
      confidence: 1.0,
      observedAt: new Date("2026-07-16"),
      note: "Transcribed from official Latin Kids derrotero — 11 entries, 1:1 SAG subgrupo",
    },
    createdAt: new Date("2026-07-13"),
    activatedAt: new Date("2026-07-13"),
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
  LT_SUBGRUPOS,
} as const;

export const IMPORT_GROUPS = {
  IMPORT_ACCESORIOS,
} as const;
