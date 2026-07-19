/**
 * lib/connectors/adapters/sag-pya-soap/catalog/sag-master-lookups-normalizer.ts
 *
 * Normalizes raw SAG master lookup rows into typed SagLookupNormalized objects.
 *
 * Each table has its own field mapping confirmed via forensics (2026-06-23).
 *
 * Sprint: SAG-MASTER-LOOKUPS-01
 */

import type {
  SagLookupRawRow,
  SagLookupNormalized,
  SagLookupTableConfig,
  SagLookupKind,
} from "./sag-master-lookups-types";

// ── Table configurations ────────────────────────────────────────────────────

export const LOOKUP_TABLE_CONFIGS: SagLookupTableConfig[] = [
  {
    kind: "product_group",
    tableName: "GRUPOS",
    pkField: "ka_ni_grupo",
    codeField: "ka_ni_grupo",
    nameField: "sc_detalle_grupo",
  },
  {
    kind: "product_subgroup",
    tableName: "SUBGRUPOS",
    pkField: "ka_ni_subgrupo",
    codeField: "ka_ni_subgrupo",
    nameField: "sc_detalle_subgrupo",
    parentField: "ka_ni_grupo",
  },
  {
    kind: "product_line",
    tableName: "LINEAS",
    pkField: "ka_nl_linea",
    codeField: "ka_nl_linea",
    nameField: "ss_linea",
  },
  {
    kind: "size",
    tableName: "TALLAS",
    pkField: "ka_nl_talla",
    codeField: "ss_codigo",
    nameField: "ss_talla",
  },
  {
    kind: "color",
    tableName: "COLORES",
    pkField: "ka_nl_color",
    codeField: "ss_codigo",
    nameField: "ss_nombre",
  },
  {
    kind: "warehouse",
    tableName: "BODEGAS",
    pkField: "ka_nl_bodega",
    codeField: "ss_codigo",
    nameField: "ss_nombre",
    activeField: "sc_activo",
  },
  {
    kind: "brand",
    tableName: "MARCAS",
    pkField: "ka_nl_marca",
    codeField: "ka_nl_marca",
    nameField: "ss_marca",
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function bool(v: unknown): boolean {
  if (v === true || v === 1 || v === "1" || v === "S" || v === "s") return true;
  return false;
}

// ── Normalize ───────────────────────────────────────────────────────────────

export interface NormalizeLookupResult {
  normalized: SagLookupNormalized[];
  errors:     number;
}

export function normalizeLookupRows(
  rows: SagLookupRawRow[],
  config: SagLookupTableConfig,
): NormalizeLookupResult {
  const normalized: SagLookupNormalized[] = [];
  let errors = 0;

  for (const row of rows) {
    const sagId = num(row[config.pkField]);
    const code = str(row[config.codeField]) || String(sagId);
    const name = str(row[config.nameField]);

    if (!name && sagId === 0) {
      errors++;
      continue;
    }

    const entry: SagLookupNormalized = {
      kind: config.kind,
      sagId,
      code,
      name: name || `(${config.kind} ${sagId})`,
      active: config.activeField ? bool(row[config.activeField]) : true,
      rawJson: row as Record<string, unknown>,
    };

    if (config.parentField) {
      const parentVal = num(row[config.parentField]);
      if (parentVal > 0) {
        entry.parentId = parentVal;
      }
    }

    normalized.push(entry);
  }

  return { normalized, errors };
}
