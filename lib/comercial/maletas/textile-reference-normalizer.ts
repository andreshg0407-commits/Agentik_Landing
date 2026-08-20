/**
 * textile-reference-normalizer.ts
 *
 * MALETAS-NORMALIZACION-B04-08B2R3 — FASE 2
 *
 * Canonical normalizer for textile product classification.
 * Maps SAG descriptions, grupos, and subgrupos into a shared taxonomy
 * used by: Derrotero, B01 inventory, Oportunidades de cobertura,
 * B04 OP activas, and Cobertura de mostrario.
 *
 * Rules:
 *   - CC = manga corta + pantalón corto (corta / corta)
 *   - CL = manga corta + pantalón largo (corta / larga)
 *   - LL = manga larga + pantalón largo (larga / larga)
 *   - BB = Bebé
 *   - KIDS = Kids
 *   - NIÑA / NIÑO → género
 *   - Families are strict — "Pijama" ≠ "Conjunto"
 *   - For generic grupos (BASICAS BEBE/KIDS), use description to resolve
 *
 * Deterministic token-based matching. No fuzzy logic.
 * Pure computation — no Prisma, no server-only, no side effects.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type FamiliaProducto =
  | "PIJAMA"
  | "CONJUNTO"
  | "BLUSA"
  | "VESTIDO"
  | "CAMISETA"
  | "MAMELUCO"
  | "BUZO_CAMIBUSO"
  | "POLO"
  | "OTRO";

export type Genero = "NIÑA" | "NIÑO" | "UNISEX" | "INDETERMINADO";

export type SegmentoEdad = "BEBE" | "KIDS" | "MESES" | "INDETERMINADO";

export type ConstruccionSuperior = "CORTA" | "LARGA" | "NA" | "INDETERMINADO";
export type ConstruccionInferior = "CORTA" | "LARGA" | "NA" | "INDETERMINADO";

export interface NormalizedReference {
  // ── Original data (preserved exactly) ──
  descripcionRaw: string;
  grupoSagRaw: string | null;
  subgrupoSagRaw: string | null;
  lineaRaw: string;

  // ── Normalized classification ──
  linea: string;                        // "CS" | "LT" | "IMPORT" | "OTRO"
  familiaProducto: FamiliaProducto;
  genero: Genero;
  segmentoEdad: SegmentoEdad;
  construccionSuperior: ConstruccionSuperior;
  construccionInferior: ConstruccionInferior;
  grupoSag: string | null;
  subgrupoSag: string | null;

  // ── Matching metadata ──
  /** Canonical key for derrotero matching: familia|genero|edad|construccion */
  matchKey: string;
  /** Confidence of the normalization (1.0 = all tokens resolved) */
  confidence: number;
  /** Tokens that could not be classified */
  unresolvedTokens: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Token dictionaries
// ═══════════════════════════════════════════════════════════════════════════

const FAMILIA_TOKENS: Record<string, FamiliaProducto> = {
  "PIJAMA": "PIJAMA",
  "CONJUNTO": "CONJUNTO",
  "BLUSA": "BLUSA",
  "BLUSAS": "BLUSA",
  "VESTIDO": "VESTIDO",
  "CAMISETA": "CAMISETA",
  "MAMELUCO": "MAMELUCO",
  "BUZO": "BUZO_CAMIBUSO",
  "CAMIBUSO": "BUZO_CAMIBUSO",
  "POLO": "POLO",
};

const GENERO_TOKENS: Record<string, Genero> = {
  "NIÑA": "NIÑA",
  "NINA": "NIÑA",
  "NIÑO": "NIÑO",
  "NINO": "NIÑO",
};

const EDAD_TOKENS: Record<string, SegmentoEdad> = {
  "BB": "BEBE",
  "BEBE": "BEBE",
  "BEBÉ": "BEBE",
  "BABY": "BEBE",
  "MESES": "MESES",
  "KIDS": "KIDS",
};

/** Map SAG subgrupo abbreviations to construccion */
const CONSTRUCCION_ALIASES: Record<string, { superior: ConstruccionSuperior; inferior: ConstruccionInferior }> = {
  "CC": { superior: "CORTA", inferior: "CORTA" },
  "CL": { superior: "CORTA", inferior: "LARGA" },
  "LL": { superior: "LARGA", inferior: "LARGA" },
  "CORTA CORTA": { superior: "CORTA", inferior: "CORTA" },
  "CORTA LARGA": { superior: "CORTA", inferior: "LARGA" },
  "LARGA LARGA": { superior: "LARGA", inferior: "LARGA" },
  "LARGO": { superior: "LARGA", inferior: "NA" },
};

/** Age range tokens found in Latin Kids subgrupos */
const AGE_RANGE_TOKENS: Record<string, SegmentoEdad> = {
  "2-8": "KIDS",
  "10-16": "KIDS",
  "18-22": "KIDS",
  "2-12": "KIDS",
};

// ═══════════════════════════════════════════════════════════════════════════
// Grupo-based classification
// ═══════════════════════════════════════════════════════════════════════════

interface GrupoClassification {
  genero: Genero;
  segmentoEdad: SegmentoEdad;
}

const GRUPO_CLASSIFICATION: Record<string, GrupoClassification> = {
  "CS NIÑA BEBE": { genero: "NIÑA", segmentoEdad: "BEBE" },
  "CS NIÑO BEBE": { genero: "NIÑO", segmentoEdad: "BEBE" },
  "CS NIÑA KIDS": { genero: "NIÑA", segmentoEdad: "KIDS" },
  "CS NIÑO KIDS": { genero: "NIÑO", segmentoEdad: "KIDS" },
  "BASICAS BEBE": { genero: "INDETERMINADO", segmentoEdad: "BEBE" },
  "BASICAS KIDS": { genero: "INDETERMINADO", segmentoEdad: "KIDS" },
  "NAUTICO MESES": { genero: "INDETERMINADO", segmentoEdad: "MESES" },
};

// ═══════════════════════════════════════════════════════════════════════════
// Core normalizer
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize a single reference into canonical classification.
 *
 * Resolution order:
 * 1. subgrupoSag → extract familia + construccion (most specific)
 * 2. grupoSag → extract genero + segmentoEdad
 * 3. description → fallback for unresolved tokens (genero from BASICAS)
 */
export function normalizeTextileReference(
  description: string,
  grupoSag: string | null,
  subgrupoSag: string | null,
  linea: string,
): NormalizedReference {
  const descUpper = description.toUpperCase().trim();
  const grupoUpper = grupoSag?.toUpperCase().trim() ?? null;
  const subgrupoUpper = subgrupoSag?.toUpperCase().trim() ?? null;

  let familiaProducto: FamiliaProducto = "OTRO";
  let genero: Genero = "INDETERMINADO";
  let segmentoEdad: SegmentoEdad = "INDETERMINADO";
  let construccionSuperior: ConstruccionSuperior = "NA";
  let construccionInferior: ConstruccionInferior = "NA";
  const unresolvedTokens: string[] = [];

  // ── 1. Extract from subgrupoSag ──
  if (subgrupoUpper) {
    const subTokens = subgrupoUpper.split(/\s+/);

    // First token is usually the familia
    for (const token of subTokens) {
      if (FAMILIA_TOKENS[token] && familiaProducto === "OTRO") {
        familiaProducto = FAMILIA_TOKENS[token];
      }
    }

    // Check for construccion (CC/CL/LL or full form)
    for (const [pattern, cons] of Object.entries(CONSTRUCCION_ALIASES)) {
      if (subgrupoUpper.includes(pattern)) {
        construccionSuperior = cons.superior;
        construccionInferior = cons.inferior;
        break;
      }
    }

    // Check for genero in subgrupo
    for (const token of subTokens) {
      const normalized = token.replace(/[ÑÉÁÍÓÚñéáíóú]/g, (c) => {
        const map: Record<string, string> = { "Ñ": "Ñ", "ñ": "Ñ", "É": "E", "é": "E", "Á": "A", "á": "A", "Í": "I", "í": "I", "Ó": "O", "ó": "O", "Ú": "U", "ú": "U" };
        return map[c] ?? c;
      });
      if (GENERO_TOKENS[token] && genero === "INDETERMINADO") {
        genero = GENERO_TOKENS[token];
      }
      if (GENERO_TOKENS[normalized] && genero === "INDETERMINADO") {
        genero = GENERO_TOKENS[normalized];
      }
    }

    // Check for edad in subgrupo
    for (const token of subTokens) {
      if (EDAD_TOKENS[token] && segmentoEdad === "INDETERMINADO") {
        segmentoEdad = EDAD_TOKENS[token];
      }
    }

    // Check age ranges (Latin Kids)
    for (const [range, edad] of Object.entries(AGE_RANGE_TOKENS)) {
      if (subgrupoUpper.includes(range) && segmentoEdad === "INDETERMINADO") {
        segmentoEdad = edad;
      }
    }

    // "NAUTICO" in subgrupo → CONJUNTO familia, MESES edad
    if (subgrupoUpper.includes("NAUTICO") && familiaProducto === "OTRO") {
      familiaProducto = "CONJUNTO";
    }
    if (subgrupoUpper.includes("MESES") && segmentoEdad === "INDETERMINADO") {
      segmentoEdad = "MESES";
    }
  }

  // ── 2. Extract from grupoSag ──
  if (grupoUpper) {
    const grupoClass = GRUPO_CLASSIFICATION[grupoUpper];
    if (grupoClass) {
      if (segmentoEdad === "INDETERMINADO") segmentoEdad = grupoClass.segmentoEdad;
      if (genero === "INDETERMINADO" && grupoClass.genero !== "INDETERMINADO") {
        genero = grupoClass.genero;
      }
    }
  }

  // ── 3. Fallback: extract from description (for BASICAS or unresolved) ──
  if (genero === "INDETERMINADO" || familiaProducto === "OTRO") {
    const descTokens = descUpper.split(/[\s\-\/,()]+/).filter(Boolean);

    for (const token of descTokens) {
      if (FAMILIA_TOKENS[token] && familiaProducto === "OTRO") {
        familiaProducto = FAMILIA_TOKENS[token];
      }
      if (GENERO_TOKENS[token] && genero === "INDETERMINADO") {
        genero = GENERO_TOKENS[token];
      }
      if (EDAD_TOKENS[token] && segmentoEdad === "INDETERMINADO") {
        segmentoEdad = EDAD_TOKENS[token];
      }
    }

    // Check description for construccion
    if (construccionSuperior === "NA" && construccionInferior === "NA") {
      for (const [pattern, cons] of Object.entries(CONSTRUCCION_ALIASES)) {
        if (descUpper.includes(pattern)) {
          construccionSuperior = cons.superior;
          construccionInferior = cons.inferior;
          break;
        }
      }
    }
  }

  // ── 4. MAMELUCO LARGO special handling ──
  if (familiaProducto === "MAMELUCO" && subgrupoUpper?.includes("LARGO")) {
    construccionSuperior = "LARGA";
    construccionInferior = "NA";
  }

  // ── 5. Compute confidence ──
  let resolvedFields = 0;
  const totalFields = 4; // familia, genero, edad, construccion
  if (familiaProducto !== "OTRO") resolvedFields++;
  if (genero !== "INDETERMINADO") resolvedFields++;
  if (segmentoEdad !== "INDETERMINADO") resolvedFields++;
  // construccion only required for PIJAMA and CONJUNTO
  if (familiaProducto === "PIJAMA" || familiaProducto === "CONJUNTO") {
    if (construccionSuperior !== "NA" && construccionSuperior !== "INDETERMINADO") resolvedFields++;
  } else {
    resolvedFields++; // NA is valid for non-pijama/conjunto
  }

  const confidence = totalFields > 0 ? resolvedFields / totalFields : 0;

  // ── 6. Build match key ──
  const matchKey = buildMatchKey(familiaProducto, genero, segmentoEdad, construccionSuperior, construccionInferior);

  return {
    descripcionRaw: description,
    grupoSagRaw: grupoSag,
    subgrupoSagRaw: subgrupoSag,
    lineaRaw: linea,
    linea,
    familiaProducto,
    genero,
    segmentoEdad,
    construccionSuperior,
    construccionInferior,
    grupoSag,
    subgrupoSag,
    matchKey,
    confidence,
    unresolvedTokens,
  };
}

/**
 * Check if a normalized reference is compatible with a derrotero position.
 *
 * Compatibility rules:
 * - Same línea
 * - Same familia (strict — PIJAMA ≠ CONJUNTO)
 * - Compatible género (NIÑA matches NIÑA or UNISEX, etc.)
 * - Compatible edad (BEBE matches BEBE, etc.)
 * - Compatible construcción (for PIJAMA/CONJUNTO: CC/CL/LL must match)
 *
 * Returns true only on deterministic match.
 */
export function isCompatibleWithPosition(
  ref: NormalizedReference,
  position: {
    linea: string;
    familiaProducto: FamiliaProducto;
    genero: Genero;
    segmentoEdad: SegmentoEdad;
    construccionSuperior: ConstruccionSuperior;
    construccionInferior: ConstruccionInferior;
  },
): boolean {
  if (ref.linea !== position.linea) return false;
  if (ref.familiaProducto !== position.familiaProducto) return false;

  // Gender compatibility
  if (ref.genero !== "INDETERMINADO" && position.genero !== "INDETERMINADO") {
    if (ref.genero !== "UNISEX" && position.genero !== "UNISEX" && ref.genero !== position.genero) {
      return false;
    }
  }

  // Age compatibility
  if (ref.segmentoEdad !== "INDETERMINADO" && position.segmentoEdad !== "INDETERMINADO") {
    if (ref.segmentoEdad !== position.segmentoEdad) return false;
  }

  // Construction compatibility (only for PIJAMA / CONJUNTO)
  if (position.familiaProducto === "PIJAMA" || position.familiaProducto === "CONJUNTO") {
    if (position.construccionSuperior !== "NA" && ref.construccionSuperior !== "NA" &&
        ref.construccionSuperior !== "INDETERMINADO" && position.construccionSuperior !== "INDETERMINADO") {
      if (ref.construccionSuperior !== position.construccionSuperior) return false;
    }
    if (position.construccionInferior !== "NA" && ref.construccionInferior !== "NA" &&
        ref.construccionInferior !== "INDETERMINADO" && position.construccionInferior !== "INDETERMINADO") {
      if (ref.construccionInferior !== position.construccionInferior) return false;
    }
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Derrotero position normalization
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build normalized classification for a derrotero entry.
 * Uses the entry's sagSubgrupo and group's sagGrupo to resolve classification.
 */
export function normalizeDerroteroEntry(
  sagSubgrupo: string,
  sagGrupo: string | null,
  linea: string,
): {
  familiaProducto: FamiliaProducto;
  genero: Genero;
  segmentoEdad: SegmentoEdad;
  construccionSuperior: ConstruccionSuperior;
  construccionInferior: ConstruccionInferior;
} {
  // Use the normalizer with subgrupo as both description and subgrupo
  const normalized = normalizeTextileReference(sagSubgrupo, sagGrupo, sagSubgrupo, linea);
  return {
    familiaProducto: normalized.familiaProducto,
    genero: normalized.genero,
    segmentoEdad: normalized.segmentoEdad,
    construccionSuperior: normalized.construccionSuperior,
    construccionInferior: normalized.construccionInferior,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Batch normalization
// ═══════════════════════════════════════════════════════════════════════════

export interface NormalizableRef {
  reference: string;
  description: string;
  grupoSag: string | null;
  subgrupoSag: string | null;
  linea: string;
}

/**
 * Normalize a batch of references.
 * Returns a Map keyed by reference code (uppercased, trimmed).
 */
export function normalizeReferencesBatch(
  refs: NormalizableRef[],
): Map<string, NormalizedReference> {
  const result = new Map<string, NormalizedReference>();
  for (const ref of refs) {
    const key = ref.reference.trim().toUpperCase();
    const normalized = normalizeTextileReference(
      ref.description,
      ref.grupoSag,
      ref.subgrupoSag,
      ref.linea,
    );
    result.set(key, normalized);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════════════════

function buildMatchKey(
  familia: FamiliaProducto,
  genero: Genero,
  edad: SegmentoEdad,
  consSup: ConstruccionSuperior,
  consInf: ConstruccionInferior,
): string {
  return `${familia}|${genero}|${edad}|${consSup}|${consInf}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Display labels — Section D: presentation-safe names
// ═══════════════════════════════════════════════════════════════════════════

/** Replacement map for display: internal abbreviations → human-readable Spanish. */
const DISPLAY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bBB\b/g, "Bebé"],
  [/\bBEBE\b/g, "Bebé"],
  [/\bNINA\b/g, "Niña"],
  [/\bNINO\b/g, "Niño"],
  [/\bCC\b/g, "CC"],
  [/\bCL\b/g, "CL"],
  [/\bLL\b/g, "LL"],
];

/**
 * Convert an internal subgroup/group name to display-safe label.
 * Never shows "BB" — always "Bebé". Never shows "NINA" — always "Niña".
 * Input can be any case; output uses title case with proper diacritics.
 *
 * MALETAS-P0-PRODUCTION-SAFETY-08B2R6 Section D
 */
export function toDisplayLabel(raw: string): string {
  // Title-case the input first
  let result = raw
    .toLowerCase()
    .split(/[\s_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  // Apply display replacements (whole-word only)
  for (const [pattern, replacement] of DISPLAY_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  // Fix "Bebe" (from title-case) that wasn't caught by \bBEBE\b
  result = result.replace(/\bBebe\b/g, "Bebé");
  result = result.replace(/\bNina\b/g, "Niña");
  result = result.replace(/\bNino\b/g, "Niño");

  return result;
}
