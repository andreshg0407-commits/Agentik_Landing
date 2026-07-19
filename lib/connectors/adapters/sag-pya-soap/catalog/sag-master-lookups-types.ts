/**
 * lib/connectors/adapters/sag-pya-soap/catalog/sag-master-lookups-types.ts
 *
 * Type contracts for SAG master lookup tables.
 *
 * Confirmed tables (Castillitos forensics 2026-06-23):
 *   GRUPOS     → 30 rows   PK: ka_ni_grupo      Name: sc_detalle_grupo
 *   SUBGRUPOS  → 269 rows  PK: ka_ni_subgrupo    Name: sc_detalle_subgrupo    FK: ka_ni_grupo
 *   LINEAS     → 5 rows    PK: ka_nl_linea       Name: ss_linea
 *   TALLAS     → 36 rows   PK: ka_nl_talla       Code: ss_codigo  Name: ss_talla
 *   COLORES    → 88 rows   PK: ka_nl_color       Code: ss_codigo  Name: ss_nombre
 *   BODEGAS    → 49 rows   PK: ka_nl_bodega      Code: ss_codigo  Name: ss_nombre
 *   MARCAS     → 3 rows    PK: ka_nl_marca       Name: ss_marca
 *
 * Sprint: SAG-MASTER-LOOKUPS-01
 */

// ── Raw row from SAG SOAP response ──────────────────────────────────────────

export interface SagLookupRawRow {
  [key: string]: unknown;
}

// ── Lookup kind ─────────────────────────────────────────────────────────────

export type SagLookupKind =
  | "product_group"
  | "product_subgroup"
  | "product_line"
  | "size"
  | "color"
  | "warehouse"
  | "brand";

// ── Normalized lookup entry ─────────────────────────────────────────────────

export interface SagLookupNormalized {
  /** Lookup kind (e.g. "product_group") */
  kind:         SagLookupKind;
  /** Numeric PK from SAG (e.g. ka_ni_grupo value) */
  sagId:        number;
  /** Short code (e.g. "BL1" for colors, "01" for bodegas) — may equal sagId as string */
  code:         string;
  /** Human-readable name (e.g. "PIJAMAS NIÑO", "BLANCO", "BODEGA PRINCIPAL") */
  name:         string;
  /** Parent group FK for subgroups (ka_ni_grupo) */
  parentId?:    number;
  /** Whether the entry is active (from sc_activo if available) */
  active:       boolean;
  /** Raw SAG row preserved for debugging */
  rawJson:      Record<string, unknown>;
}

// ── Table config ────────────────────────────────────────────────────────────

export interface SagLookupTableConfig {
  kind:       SagLookupKind;
  tableName:  string;
  pkField:    string;
  codeField:  string;
  nameField:  string;
  parentField?: string;
  activeField?: string;
}

// ── Sync result ─────────────────────────────────────────────────────────────

export interface SagMasterLookupSyncResult {
  kind:       SagLookupKind;
  tableName:  string;
  totalRows:  number;
  normalized: number;
  errors:     number;
  dryRun:     boolean;
}

// ── Aggregated result for all lookups ───────────────────────────────────────

export interface SagMasterLookupFullResult {
  tables:     SagMasterLookupSyncResult[];
  maps:       SagLookupMaps;
  durationMs: number;
  dryRun:     boolean;
}

// ── In-memory lookup maps ───────────────────────────────────────────────────

export interface SagLookupMaps {
  groups:     Map<string, SagLookupNormalized>;
  subgroups:  Map<string, SagLookupNormalized>;
  lines:      Map<string, SagLookupNormalized>;
  sizes:      Map<string, SagLookupNormalized>;
  colors:     Map<string, SagLookupNormalized>;
  warehouses: Map<string, SagLookupNormalized>;
  brands:     Map<string, SagLookupNormalized>;
}
