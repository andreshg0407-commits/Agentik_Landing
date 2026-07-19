/**
 * lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-types.ts
 *
 * Type contracts for SAG ARTICULOS → ProductEntity sync.
 *
 * Data flow:
 *   SAG SOAP (ARTICULOS table)
 *     → SagArticleRawRow (raw SOAP response row)
 *     → SagArticleNormalized (validated, trimmed, typed)
 *     → ProductEntity (Prisma upsert via externalSource="sag" + externalId=CODIGO)
 *
 * Sprint: SAG-CATALOG-SYNC-01
 */

// ── Raw row from SAG SOAP response ──────────────────────────────────────────

/**
 * A single row from `SELECT * FROM ARTICULOS`.
 * Field names match query-catalog.ts ARTICLES.all.expectedFields.
 * All values come as unknown from SOAP — normalizer validates and coerces.
 */
export interface SagArticleRawRow {
  CODIGO?:              unknown;
  DESCRIPCION?:         unknown;
  GRUPO?:               unknown;
  SUB_GRUPO?:           unknown;
  LINEA?:               unknown;
  MARCA?:               unknown;
  UNIDAD?:              unknown;
  IVA?:                 unknown;
  TARIFA_IVA?:          unknown;
  PRECIO?:              unknown;
  COSTO?:               unknown;
  MANEJA_KARDEX?:       unknown;
  MANEJA_TALLA_COLOR?:  unknown;
  MANEJA_LOTE?:         unknown;
  ACTIVO?:              unknown;
  BLOQUEADO?:           unknown;
  FECHA_MODIFICACION?:  unknown;
  /** Catch-all for unexpected fields returned by SAG */
  [key: string]:        unknown;
}

// ── Normalized article ──────────────────────────────────────────────────────

/**
 * Validated, typed article ready for ProductEntity upsert.
 * Normalizer guarantees all required fields are present.
 */
export interface SagArticleNormalized {
  /** UPPERCASE trimmed CODIGO — becomes ProductEntity.sku + externalId */
  codigo:       string;
  /** Trimmed DESCRIPCION — becomes ProductEntity.name */
  descripcion:  string;
  /** GRUPO code (product group) — becomes ProductEntity.category */
  grupo:        string;
  /** SUB_GRUPO code */
  subGrupo:     string;
  /** LINEA code — becomes ProductEntity.productLine */
  linea:        string;
  /** MARCA */
  marca:        string;
  /** Unit of measure (UND, KG, etc.) */
  unidad:       string;
  /** IVA flag */
  iva:          boolean;
  /** IVA tariff percentage (e.g. 19) */
  tarifaIva:    number;
  /** Sale price — becomes ProductEntity.price */
  precio:       number;
  /** Cost price */
  costo:        number;
  /** Whether article manages kardex (inventory tracking) */
  manejaKardex:      boolean;
  /** Whether article manages size/color variants */
  manejaTallaColor:  boolean;
  /** Whether article manages lot/batch tracking */
  manejaLote:        boolean;
  /** Active flag */
  activo:       boolean;
  /** Blocked flag */
  bloqueado:    boolean;
  /** Last modification date from SAG (ISO string or null) */
  fechaModificacion: string | null;
  /** First creation date from SAG dd_fch_primer_vez (ISO string or null) */
  fechaCreacion: string | null;
  /** Last purchase date from SAG d_ultima_compra (ISO string or null) */
  ultimaCompra: string | null;
  /** Last sale date from SAG d_ultima_venta (ISO string or null) */
  ultimaVenta: string | null;
  /** Secondary description from SAG ss_detalle_artic2 */
  descripcion2: string;
  /** Barcode from SAG ss_codigo_barras */
  codigoBarras: string;
  /** "Unidad de manejo" from SAG — raw value before normalization */
  unidadManejo: string;
}

// ── Sync options ────────────────────────────────────────────────────────────

export interface SagArticleSyncOptions {
  /** If true, validate and report but do not persist */
  dryRun?:     boolean;
  /** Max articles to process (for controlled testing) */
  limit?:      number;
  /** If true, only sync active (ACTIVO=1) articles */
  activeOnly?: boolean;
}

// ── Sync result ─────────────────────────────────────────────────────────────

export type SagArticleSyncStatus =
  | "success"
  | "partial"     // Some rows invalid but at least one was persisted
  | "dry_run"     // Validation only — nothing persisted
  | "empty"       // Input was empty or all rows were invalid
  | "error";      // Unrecoverable error

export interface SagArticleSyncResult {
  status:            SagArticleSyncStatus;
  /** Total rows received from SAG SOAP */
  totalRows:         number;
  /** Rows that passed validation */
  validRows:         number;
  /** Rows that failed validation */
  invalidRows:       number;
  /** Rows excluded by commercial filter (non-commercial) */
  excluded:          number;
  /** ProductEntity records created */
  created:           number;
  /** ProductEntity records updated */
  updated:           number;
  /** Rows skipped (already up-to-date) */
  skipped:           number;
  /** Elapsed time in milliseconds */
  durationMs:        number;
  /** Whether this was a dry run */
  dryRun:            boolean;
  /** Validation errors (up to 20) */
  validationErrors:  SagArticleValidationError[];
  /** Error message if status === "error" */
  error?:            string;
}

export interface SagArticleValidationError {
  /** Row index (0-based) */
  rowIndex:  number;
  /** Raw CODIGO from input */
  codigo:    string | undefined;
  /** Human-readable reason */
  reason:    string;
}
