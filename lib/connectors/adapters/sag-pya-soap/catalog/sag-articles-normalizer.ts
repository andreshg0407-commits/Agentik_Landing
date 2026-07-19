/**
 * lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-normalizer.ts
 *
 * Normalizes raw SAG ARTICULOS rows into typed SagArticleNormalized objects.
 *
 * IMPORTANT: SAG PYA returns internal field names (prefixed sc_, ka_, ss_, etc.)
 * NOT the UPPERCASE aliases documented in query-catalog.ts.
 *
 * Confirmed field mapping (Castillitos forensics 2026-06-23):
 *   k_sc_codigo_articulo      → CODIGO
 *   sc_detalle_articulo       → DESCRIPCION
 *   ka_ni_grupo               → GRUPO (numeric FK)
 *   ka_ni_subgrupo            → SUB_GRUPO (numeric FK)
 *   ka_nl_linea               → LINEA (numeric FK)
 *   (no marca field found)    → MARCA
 *   ka_ni_tipo_unidad         → UNIDAD (numeric FK)
 *   n_porcentaje_iva          → TARIFA_IVA
 *   n_valor_venta_normal      → PRECIO
 *   nd_costo_std              → COSTO
 *   sc_maneja_kardex          → MANEJA_KARDEX (S/N)
 *   sc_maneja_tallas          → MANEJA_TALLA_COLOR (S/N)
 *   sc_fecha_lote             → MANEJA_LOTE (S/N)
 *   sc_activo                 → ACTIVO (S/N)
 *   sc_bloqueado              → BLOQUEADO (S/N)
 *   dd_fecha_ult_modificacion → FECHA_MODIFICACION
 *   ss_detalle_artic2         → secondary description (color/variant name)
 *
 * NOTE: "Unidad de manejo" (PEQUEÑO/MEDIANO/GRANDE) is NOT in the ARTICULOS table.
 * It lives in v_articulos.sc_unidad — resolved via separate v_articulos fetch in sync.
 * ka_ni_tipo_unidad is a numeric FK to the unit lookup (not the text value).
 *
 * Sprint: SAG-CATALOG-SYNC-01
 */

import type {
  SagArticleRawRow,
  SagArticleNormalized,
  SagArticleValidationError,
} from "./sag-articles-types";

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

function parseDate(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Resolve a field value from a SAG row, trying the real internal name first,
 * then the expected uppercase alias as fallback.
 */
function resolve(row: SagArticleRawRow, realName: string, aliasName: string): unknown {
  const v = row[realName];
  if (v != null && v !== "") return v;
  return row[aliasName];
}

// ── Normalize ───────────────────────────────────────────────────────────────

export interface NormalizeArticlesResult {
  normalized: SagArticleNormalized[];
  errors:     SagArticleValidationError[];
}

const MAX_ERRORS = 20;

export function normalizeArticles(
  rows: SagArticleRawRow[],
): NormalizeArticlesResult {
  const normalized: SagArticleNormalized[] = [];
  const errors: SagArticleValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // CODIGO: try real SAG name first, then uppercase alias
    const codigo = str(resolve(row, "k_sc_codigo_articulo", "CODIGO")).toUpperCase();

    if (!codigo) {
      if (errors.length < MAX_ERRORS) {
        errors.push({ rowIndex: i, codigo: undefined, reason: "Missing CODIGO" });
      }
      continue;
    }

    // DESCRIPCION: real = sc_detalle_articulo
    const descripcion = str(resolve(row, "sc_detalle_articulo", "DESCRIPCION"));
    if (!descripcion) {
      if (errors.length < MAX_ERRORS) {
        errors.push({ rowIndex: i, codigo, reason: "Missing DESCRIPCION" });
      }
      continue;
    }

    normalized.push({
      codigo,
      descripcion,
      grupo:             str(resolve(row, "ka_ni_grupo", "GRUPO")),
      subGrupo:          str(resolve(row, "ka_ni_subgrupo", "SUB_GRUPO")),
      linea:             str(resolve(row, "ka_nl_linea", "LINEA")),
      marca:             str(resolve(row, "ka_nl_ref", "MARCA")),  // ka_nl_ref is closest to brand/reference
      unidad:            str(resolve(row, "ka_ni_tipo_unidad", "UNIDAD")),
      iva:               bool(resolve(row, "n_porcentaje_iva", "IVA")),
      tarifaIva:         num(resolve(row, "n_porcentaje_iva", "TARIFA_IVA")),
      precio:            num(resolve(row, "n_valor_venta_normal", "PRECIO")),
      costo:             num(resolve(row, "nd_costo_std", "COSTO")),
      manejaKardex:      bool(resolve(row, "sc_maneja_kardex", "MANEJA_KARDEX")),
      manejaTallaColor:  bool(resolve(row, "sc_maneja_tallas", "MANEJA_TALLA_COLOR")),
      manejaLote:        bool(resolve(row, "sc_fecha_lote", "MANEJA_LOTE")),
      activo:            bool(resolve(row, "sc_activo", "ACTIVO")),
      bloqueado:         bool(resolve(row, "sc_bloqueado", "BLOQUEADO")),
      fechaModificacion: parseDate(resolve(row, "dd_fecha_ult_modificacion", "FECHA_MODIFICACION")),
      fechaCreacion:     parseDate(resolve(row, "dd_fch_primer_vez", "FECHA_CREACION")),
      ultimaCompra:      parseDate(resolve(row, "d_ultima_compra", "ULTIMA_COMPRA")),
      ultimaVenta:       parseDate(resolve(row, "d_ultima_venta", "ULTIMA_VENTA")),
      descripcion2:      str(resolve(row, "ss_detalle_artic2", "DESCRIPCION2")),
      codigoBarras:      str(resolve(row, "ss_codigo_barras", "CODIGO_BARRAS")),
      // sc_unidad_manejo does NOT exist in ARTICULOS table.
      // Handling unit resolved from v_articulos.sc_unidad in sync layer.
      // ka_ni_tipo_unidad is the numeric FK — kept for diagnostics only.
      unidadManejo:      str(resolve(row, "ka_ni_tipo_unidad", "UNIDAD")),
    });
  }

  return { normalized, errors };
}
