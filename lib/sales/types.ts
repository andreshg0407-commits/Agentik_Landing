import type { SaleChannel, SaleGrain, SagDocumentFamily } from "@prisma/client";
// SagSourceType and SourceDocumentStage are new enum types added in a prior sprint.
// They will be exported from @prisma/client after `prisma generate` runs.
// Until then, use local string-literal types that match the schema exactly.
import type { SagSourceType, SourceDocumentStage } from "@/lib/sag/source-inference";
import type { SaleSourceType, SourceInferredFrom } from "@/lib/sag/source-semantics";

// ── Raw SAG row (as received from CSV / Excel upload) ─────────────────────────
// All fields are strings because CSV parsers return strings. Optional fields
// may be absent in aggregated exports.

export interface RawSagRow {
  fecha:            string;               // "2024-03-15" | "15/03/2024" | "202403"
  periodo?:         string;              // "202403"  (alias for periodo_ao_mes)
  periodo_ao_mes?:  string;              // "202403"
  vendedor:         string;              // "Juan Pérez" | "JP001"
  tienda:           string;              // "Tienda Norte" | "TN01"
  linea:            string;              // "Calzado" | "Ropa"
  canal:            string;              // "tienda" | "online" | "distribuidor"
  valor:            string | number;     // "1.250.000" | "$1,250,000.50" | 1250000
  marca?:           string;
  zona?:            string;
  codigo?:          string;              // product code
  producto?:        string;              // product name
  cod_comprobante?: string;              // "FV" (comprobante type code)
  comprobante?:     string;              // "FV-001234"
  // Optional origin/linked document reference
  origen_documento?: string;
  // Explicit source column — import wizard or SAG export.
  // Checked field names: fuente, f, tipo_fuente, source, tipo_documento_fuente.
  // Accepts: "Fuente 1" | "Fuente 2" | "F1" | "F2" | 1 | 2 | "OFICIAL" | "REMISION"
  fuente?:          string | number;
  f?:               string | number;     // short alias: "F1" | "F2" | 1 | 2
  nit_cliente?:     string;
  nombre_cliente?:  string;
  unidades?:        string | number;
  num_transacciones?: string | number;   // Only in AGGREGATED exports
  [key: string]: unknown;               // allow extra columns
}

// ── Normalized sale ready for DB insert ───────────────────────────────────────

export interface NormalizedSale {
  grain:           SaleGrain;
  saleDate:        Date;
  periodoAoMes:    string | null;         // "YYYYMM" or null
  // seller
  sellerCode:      string | null;
  sellerSlug:      string;
  sellerName:      string;
  // store
  storeCode:       string | null;
  storeSlug:       string;
  storeName:       string;
  // product / commercial
  productLine:     string;
  brand:           string | null;
  zone:            string | null;
  productCode:     string | null;
  productName:     string | null;
  channel:         SaleChannel;
  comprobanteCode: string | null;
  comprobante:     string | null;
  // document source classification
  sagDocumentFamily:   SagDocumentFamily;
  originDocumentRef:   string | null;    // link to origin order or related invoice
  // source awareness — DB storage values
  sagSourceType:       SagSourceType;    // OFICIAL (F1) | REMISION (F2)
  sourceDocumentStage: SourceDocumentStage;
  // source semantics — business-level computed fields (NOT stored in DB separately)
  sourceType:          SaleSourceType;   // FUENTE_1 | FUENTE_2 (derived from sagSourceType)
  sourceInferredFrom:  SourceInferredFrom; // audit: which signal determined the source
  // customer
  customerNit:     string | null;
  customerName:    string | null;
  // financials
  amount:          number;
  currency:        "COP";
  units:           number | null;
  txCount:         number | null;        // null = unknown (AGGREGATED with no count)
  // dedup
  naturalKey:      string;               // 32-char SHA-256 slice
  rawJson:         RawSagRow;
}

// ── Parse error ───────────────────────────────────────────────────────────────

export interface ParseError {
  rowIndex: number;
  row:      RawSagRow;
  error:    string;
  severity: "warn" | "error";
}
