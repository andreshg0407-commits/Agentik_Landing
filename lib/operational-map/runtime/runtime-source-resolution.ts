/**
 * lib/operational-map/runtime/runtime-source-resolution.ts
 *
 * Runtime Source Resolution — AGENTIK-SAG-LINEAGE-RESOLUTION-02
 *
 * Resolves the dominant SAG operational source code for a runtime model.
 * Groups by comprobanteCode, picks the highest row-count code,
 * cross-references with SAG_SOURCE_BY_CODE, and returns a typed result.
 *
 * Used by the lineage detector to populate primarySagSource.
 * Safe to call standalone for diagnostic purposes.
 */

import { prisma }              from "@/lib/prisma";
import { SAG_SOURCE_BY_CODE }  from "@/lib/operational-map/source-catalog/sag-real-source-catalog";
import type { SagRealSource }  from "@/lib/operational-map/source-catalog/sag-real-source-catalog";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PrimarySagSource {
  code:            string;
  sourceName:      string;
  sourceType:      "OFICIAL" | "REMISION" | "INVENTARIO" | "PRODUCCION" | "HISTORICO" | "EXCLUIR";
  documentFamily:  string;
  fuente:          "F1" | "F2" | "mixed" | "unknown";
  rowCount:        number;
  totalCodes:      number;             // number of distinct codes found
  topCodes:        { code: string; sourceName: string; rowCount: number }[];  // top 5
  confidence:      number;             // 0–100
  catalogMatch:    SagRealSource;
}

export interface UnresolvedSagSource {
  unresolved:       true;
  unresolvedReason: string;
  codesFound:       string[];          // what codes exist (even if not in catalog)
  rowsFound:        number;
}

export type SagSourceResolution = PrimarySagSource | UnresolvedSagSource;

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface CodeGroup {
  code:          string;
  rowCount:      number;
  sagSourceType: string | null;
}

function deriveFuente(sagSourceType: string | null, fallbackCode: string): "F1" | "F2" | "unknown" {
  if (sagSourceType === "OFICIAL")  return "F1";
  if (sagSourceType === "REMISION") return "F2";
  // Fallback: F2 source codes start with F2 in SAG
  const cat = SAG_SOURCE_BY_CODE[fallbackCode];
  if (cat?.clasificacion === "NO OFICIAL") return "F2";
  if (cat?.clasificacion === "OFICIAL")    return "F1";
  return "unknown";
}

function buildResolution(topGroup: CodeGroup, allGroups: CodeGroup[]): SagSourceResolution {
  // Resolution order:
  // 1. Dominant code IF it's in the catalog
  // 2. Dominant catalog-matched code with impactaVentas=true (prefer operational ventas codes)
  // 3. Dominant catalog-matched code (any)
  // 4. Unresolved — report all found codes for DBA confirmation

  const dominantMatch = SAG_SOURCE_BY_CODE[topGroup.code];

  // Pick the best catalog-matched group
  let bestGroup: CodeGroup | null = null;
  let bestMatch: SagRealSource | null = null;

  if (dominantMatch) {
    // Dominant code is in catalog — use it directly
    bestGroup = topGroup;
    bestMatch = dominantMatch;
  } else {
    // Dominant code not in catalog — find best catalog-matched code
    // Priority: impactaVentas=true first, then any catalog match, ranked by rowCount
    const matched = allGroups
      .map(g => ({ g, m: SAG_SOURCE_BY_CODE[g.code] ?? null }))
      .filter((x): x is { g: CodeGroup; m: SagRealSource } => x.m !== null);

    if (matched.length > 0) {
      // Prefer ventas impact first, then by row count
      const ventasMatch = matched.find(x => x.m.impactaVentas);
      const chosen = ventasMatch ?? matched[0];
      bestGroup = chosen.g;
      bestMatch = chosen.m;
    }
  }

  const allCodes     = allGroups.map(g => g.code);
  const totalRows    = allGroups.reduce((s, g) => s + g.rowCount, 0);
  const unknownCodes = allGroups.filter(g => !SAG_SOURCE_BY_CODE[g.code]).map(g => g.code);

  if (!bestGroup || !bestMatch) {
    return {
      unresolved:       true,
      unresolvedReason: `${allCodes.length} código(s) encontrado(s) en runtime: [${allCodes.join(", ")}] — ninguno coincide con SAG_SOURCE_BY_CODE. Confirmar con DBA.`,
      codesFound:       allCodes,
      rowsFound:        totalRows,
    };
  }

  // If we fell back from the dominant code, note it in the confidence
  const isFallback = bestGroup.code !== topGroup.code;

  const topCodes = allGroups.slice(0, 5).map(g => ({
    code:       g.code,
    sourceName: SAG_SOURCE_BY_CODE[g.code]?.nombreFuente ?? g.code,
    rowCount:   g.rowCount,
  }));

  let confidence = 60;
  if (bestMatch)                                           confidence += 15;
  if (bestGroup.rowCount > 1000)                          confidence += 10;
  if (allGroups.length === 1)                             confidence += 10;
  if (!isFallback && bestGroup.rowCount > (allGroups[1]?.rowCount ?? 0) * 3) confidence += 5;
  if (isFallback)                                          confidence -= 10; // fallback: slightly lower confidence
  if (unknownCodes.length > 0)                             confidence -= 5;  // unknown codes present
  confidence = Math.max(30, Math.min(95, confidence));

  const fuente = deriveFuente(bestGroup.sagSourceType, bestGroup.code);

  return {
    code:           bestGroup.code,
    sourceName:     bestMatch.nombreFuente,
    sourceType:     (bestMatch.clasificacion as PrimarySagSource["sourceType"]),
    documentFamily: bestMatch.subclasificacion ?? bestMatch.tipoOperacional ?? bestMatch.clasificacion,
    fuente,
    rowCount:       bestGroup.rowCount,
    totalCodes:     allGroups.length,
    topCodes,
    confidence,
    catalogMatch:   bestMatch,
  };
}

// ─── Model-specific resolvers ─────────────────────────────────────────────────

export async function resolvePrimarySagSourceCode(
  organizationId: string,
  model:          "SaleRecord" | "CollectionRecord",
): Promise<SagSourceResolution> {
  if (model === "SaleRecord") {
    const groups = await prisma.saleRecord.groupBy({
      by:      ["comprobanteCode", "sagSourceType"],
      where:   { organizationId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _count:  { id: true } as any,
      orderBy: { _count: { id: "desc" } },
    });

    const codeGroups: CodeGroup[] = groups
      .filter(g => g.comprobanteCode)
      .map(g => ({
        code:          g.comprobanteCode!,
        rowCount:      (g._count as Record<string, number>).id ?? 0,
        sagSourceType: g.sagSourceType ?? null,
      }));

    // Dedupe: same code can appear with OFICIAL and REMISION — merge row counts
    const merged = new Map<string, CodeGroup>();
    for (const g of codeGroups) {
      const existing = merged.get(g.code);
      if (existing) {
        existing.rowCount += g.rowCount;
      } else {
        merged.set(g.code, { ...g });
      }
    }
    const sorted = [...merged.values()].sort((a, b) => b.rowCount - a.rowCount);

    if (sorted.length === 0) {
      const totalRows = await prisma.saleRecord.count({ where: { organizationId } });
      return {
        unresolved:       true,
        unresolvedReason: totalRows > 0
          ? `SaleRecord tiene ${totalRows.toLocaleString()} filas pero comprobanteCode es null en todos. Verificar importación CSV.`
          : "SaleRecord no tiene filas. Importar datos SAG primero.",
        codesFound: [],
        rowsFound:  totalRows,
      };
    }

    return buildResolution(sorted[0], sorted);
  }

  if (model === "CollectionRecord") {
    const groups = await prisma.collectionRecord.groupBy({
      by:      ["comprobanteCode"],
      where:   { organizationId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _count:  { id: true } as any,
      orderBy: { _count: { id: "desc" } },
    });

    const codeGroups: CodeGroup[] = groups
      .filter(g => g.comprobanteCode)
      .map(g => ({
        code:          g.comprobanteCode!,
        rowCount:      (g._count as Record<string, number>).id ?? 0,
        sagSourceType: "OFICIAL",
      }));

    if (codeGroups.length === 0) {
      const totalRows = await prisma.collectionRecord.count({ where: { organizationId } });
      return {
        unresolved:       true,
        unresolvedReason: totalRows > 0
          ? `CollectionRecord tiene ${totalRows.toLocaleString()} filas pero comprobanteCode es null. Verificar importación.`
          : "CollectionRecord no tiene filas.",
        codesFound: [],
        rowsFound:  totalRows,
      };
    }

    return buildResolution(codeGroups[0], codeGroups);
  }

  return {
    unresolved:       true,
    unresolvedReason: `Modelo ${model} no soportado para resolución de código fuente SAG.`,
    codesFound: [],
    rowsFound:  0,
  };
}

// ─── Type guard ───────────────────────────────────────────────────────────────

export function isResolvedSource(r: SagSourceResolution): r is PrimarySagSource {
  return !("unresolved" in r);
}
