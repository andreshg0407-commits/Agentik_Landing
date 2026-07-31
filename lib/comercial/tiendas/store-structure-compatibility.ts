/**
 * lib/comercial/tiendas/store-structure-compatibility.ts
 *
 * AGENTIK-STORES-TRUTH-AUDIT-01 — F2: ley de compatibilidad de estructuras,
 * EXTRAÍDA VERBATIM de store-structure-availability-service (movimiento
 * textual, cero cambio de comportamiento — mismo patrón del Sprint 5 cuando
 * resolveCatalogInfo se movió desde store-coverage-service).
 *
 * PURA y client-safe: sin Prisma, sin server-only, sin SDS. La comparten el
 * proveedor certificado S5/S6 (que la re-exporta para sus consumidores
 * actuales) y el pipeline del StoreSnapshot (F2) — UNA sola fuente de la ley.
 *
 * `CompatibilityIndex` declara la FORMA mínima del índice que la ley de match
 * necesita (los tres buckets). El SubstitutionIndex del mundo actual la
 * satisface estructuralmente; el pipeline construye la suya desde
 * AssembledStoreData. La ley de match vive aquí; la plomería de datos, no.
 */

import {
  buildCastillitosTextilCatalog,
  buildLatinKidsTextilCatalog,
  buildImportAccesoriosCatalog,
} from "../maletas/assortment-catalog/castillitos-mallet-assortment-catalog";
import { normalizeCanonicalGroup, normalizeCanonicalSubgroup } from "./classification-normalization";

// ── Contratos ────────────────────────────────────────────────────────────────

export interface StructureCatalogInfo {
  structureKey: string;
  line: "CASTILLITOS" | "LATIN_KIDS" | "ACCESORIOS";
  sagGrupo: string | null;
  sagSubgrupo: string | string[] | null;
  sizeClass: string | null;
}

/** Forma mínima del índice de compatibilidad (buckets de refs por clave). */
export interface CompatibilityIndex {
  readonly byGroupAndSubgroup: ReadonlyMap<string, ReadonlySet<string>>;
  readonly bySubgroup: ReadonlyMap<string, ReadonlySet<string>>;
  readonly byLineSizeClass: ReadonlyMap<string, ReadonlySet<string>>;
}

// ── Ley de resolución de catálogo (verbatim) ─────────────────────────────────

export function resolveCatalogInfo(structureKey: string): StructureCatalogInfo | null {
  const parts = structureKey.split("|");
  if (parts.length < 2) return null;

  const prefix = parts[0];

  if (prefix === "CS" && parts.length >= 3) {
    const sagGrupo = parts[1];
    const subgroupName = parts.slice(2).join("|");
    const catalog = buildCastillitosTextilCatalog();
    for (const group of catalog.groups) {
      if (group.sagGrupo !== sagGrupo) continue;
      for (const entry of group.entries) {
        if (entry.subgroupName === subgroupName && entry.active) {
          return { structureKey, line: "CASTILLITOS", sagGrupo: group.sagGrupo, sagSubgrupo: entry.sagSubgrupo, sizeClass: null };
        }
      }
    }
    return null;
  }

  if (prefix === "LK") {
    const subgroupName = parts.slice(1).join("|");
    const catalog = buildLatinKidsTextilCatalog();
    for (const group of catalog.groups) {
      for (const entry of group.entries) {
        if (entry.subgroupName === subgroupName && entry.active) {
          return { structureKey, line: "LATIN_KIDS", sagGrupo: null, sagSubgrupo: entry.sagSubgrupo, sizeClass: null };
        }
      }
    }
    return null;
  }

  if (prefix === "ACC") {
    const subgroupName = parts.slice(1).join("|");
    const scMap: Record<string, string> = { PEQUENO: "small", MEDIANO: "medium", GRANDE: "large" };
    const catalog = buildImportAccesoriosCatalog();
    for (const group of catalog.groups) {
      for (const entry of group.entries) {
        if (entry.subgroupName === subgroupName && entry.active) {
          const sc = entry.subgroupCode ? scMap[entry.subgroupCode.toUpperCase()] ?? null : null;
          return { structureKey, line: "ACCESORIOS", sagGrupo: null, sagSubgrupo: null, sizeClass: sc };
        }
      }
    }
    return null;
  }

  return null;
}

// ── Ley de refs compatibles (verbatim) ───────────────────────────────────────

export function findCompatibleRefs(
  input: StructureCatalogInfo,
  subIndex: CompatibilityIndex,
): Set<string> {
  const result = new Set<string>();

  if (input.line === "CASTILLITOS") {
    const sagSubgrupos = Array.isArray(input.sagSubgrupo)
      ? input.sagSubgrupo
      : input.sagSubgrupo ? [input.sagSubgrupo] : [];
    const normalizedGrupo = normalizeCanonicalGroup(input.sagGrupo);

    for (const sub of sagSubgrupos) {
      const normalizedSub = normalizeCanonicalSubgroup(sub);
      for (const [key, refs] of subIndex.byGroupAndSubgroup) {
        const pipeIdx = key.indexOf("|");
        if (pipeIdx < 0) continue;
        const keyGroupSubgroup = key.substring(pipeIdx + 1);
        if (keyGroupSubgroup === `${normalizedGrupo}|${normalizedSub}`) {
          for (const ref of refs) result.add(ref);
        }
      }
    }
  } else if (input.line === "LATIN_KIDS") {
    const sagSub = typeof input.sagSubgrupo === "string" ? input.sagSubgrupo : null;
    if (sagSub) {
      const normalizedSub = normalizeCanonicalSubgroup(sagSub);
      for (const [key, refs] of subIndex.bySubgroup) {
        const pipeIdx = key.indexOf("|");
        if (pipeIdx < 0) continue;
        const keySubgroup = key.substring(pipeIdx + 1);
        if (keySubgroup === normalizedSub) {
          for (const ref of refs) result.add(ref);
        }
      }
    }
  } else if (input.line === "ACCESORIOS") {
    if (input.sizeClass) {
      const refs = subIndex.byLineSizeClass.get(input.sizeClass);
      if (refs) {
        for (const ref of refs) result.add(ref);
      }
    }
  }

  return result;
}
