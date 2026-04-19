/**
 * lib/sag/write/types.ts
 *
 * Core domain types for the SAG write layer.
 *
 * Design principles:
 *  - Every write starts as PENDING and requires explicit approval.
 *  - XML is generated deterministically from validated TypeScript input.
 *  - SAG response (raw + parsed) is always persisted for audit.
 *  - Retry is manual and guarded by a max attempt cap.
 */

// ── Write operation types ──────────────────────────────────────────────────────
//
// Mirrors the SAG insercionSag a_n_tipo parameter values.

export const SAG_WRITE_TYPE = {
  UPSERT_CUSTOMER:   1,  // Crear/Actualizar clientes
  CREATE_DOCUMENT:   2,  // Crear documentos
  UPSERT_TERCERO:    3,  // Crear/Actualizar terceros (broader than cliente)
  UPSERT_PRODUCT:    5,  // Crear/Actualizar artículos
  CREATE_RECEIPT:    6,  // Recibos de caja / egresos / movimientos contables
  CREATE_GENERIC_DOC: 28, // Crear documentos genéricos
} as const;

export type SagWriteType = (typeof SAG_WRITE_TYPE)[keyof typeof SAG_WRITE_TYPE];

// ── Operation lifecycle status ─────────────────────────────────────────────────

export type SagWriteStatus =
  | "PENDING"    // Created, awaiting human approval
  | "APPROVED"   // Approved, ready for the executor to send
  | "REJECTED"   // Rejected by reviewer — will never be sent
  | "SENDING"    // Executor has picked it up, SAG call in-flight
  | "SUCCEEDED"  // SAG returned a success response
  | "FAILED"     // SAG returned an error or network failure
  | "RETRYING";  // Failed but scheduled for a manual retry

// ── Risk levels — used to gate UI warnings and future automation ───────────────

export type SagWriteRisk = "LOW" | "MEDIUM" | "HIGH";

// Per-type risk classification
export const WRITE_TYPE_RISK: Record<SagWriteType, SagWriteRisk> = {
  1:  "LOW",    // Customer upsert — idempotent
  3:  "LOW",    // Tercero upsert — idempotent
  5:  "LOW",    // Product upsert — idempotent
  2:  "HIGH",   // Document creation — financial, irreversible
  6:  "HIGH",   // Receipt/payment — financial, irreversible
  28: "MEDIUM", // Generic document — depends on type
};

// ── Per-type input shapes ──────────────────────────────────────────────────────
//
// These are the validated TypeScript inputs that XML builders consume.
// Field names mirror SAG column names (uppercase Spanish) for direct traceability
// but are typed rather than being arbitrary strings.

export interface SagCustomerInput {
  // ── Required ───────────────────────────────────────────────────────────────
  NIT:                     string;         // 9-digit NIT, no DV, no dots
  NOMBRE:                  string;         // Legal / commercial name

  // ── Identity ───────────────────────────────────────────────────────────────
  TIPO_DOC?:               string;         // NIT | CC | CE | PPN | etc.
  DIGITO_VERIFICACION?:    string;         // Check digit (0–9)
  NATURALEZA?:             "J" | "N";      // J = Jurídica, N = Natural

  // ── Address & contact ──────────────────────────────────────────────────────
  DIRECCION?:              string;
  CODIGO_DANE_CIUDAD?:     string;         // DANE code (5–6 digits)
  CIUDAD?:                 string;
  DEPARTAMENTO?:           string;
  TELEFONO?:               string;
  EMAIL?:                  string;
  EMAIL_FAC_ELECTRONICA?:  string;         // Electronic-invoice destination email

  // ── Commercial ─────────────────────────────────────────────────────────────
  NIT_VENDEDOR?:           string;         // Sales-rep NIT
  VENDEDOR?:               string;         // Sales-rep name
  TIPO_TERCERO?:           string;         // SAG tercero classification code
  TIPO_CLIENTE?:           string;         // Customer category code
  ZONA?:                   string;         // Commercial zone
  FORMA_PAGO?:             string;         // Payment-method code
  PRECIO_VENTA?:           number;         // Price-list number
  CREDITO?:                number;         // Credit limit COP (cupoMaximo)
  DIAS_CREDITO?:           number;         // Net payment days

  // ── Tax / fiscal ───────────────────────────────────────────────────────────
  RETENEDOR?:              "S" | "N";      // Withholding-tax agent
  IVA?:                    "S" | "N";      // IVA responsible
  RESPONSABILIDAD_FISCAL?: string;         // DIAN fiscal responsibility code

  // ── Status flags ───────────────────────────────────────────────────────────
  ACTIVO?:                 "S" | "N" | 0 | 1; // "S"/1 = active (default)
  ACTIVO_COMERCIAL?:       "S" | "N";      // Visible in commercial workflows
  ACTIVO_FIJO?:            "S" | "N";      // Fixed-asset flag (always "N" in v1)

  // ── Financial defaults (safe to default to 0) ──────────────────────────────
  COMISION_VENTAS?:        number;
  COMISION_COBROS?:        number;
  DESCUENTO?:              number;         // Default discount %
  DESCUENTO_PP?:           number;         // Prompt-payment discount %
}

export interface SagTerceroInput extends SagCustomerInput {
  // Tercero is a superset — same fields, different write path in SAG
  TIPO_PERSONA?: "J" | "N"; // J = Jurídica, N = Natural
  REGIMEN?:      "S" | "C"; // S = Simplificado, C = Común (IVA)
}

export interface SagProductInput {
  // ── Required ────────────────────────────────────────────────────────────────
  CODIGO:              string;   // Article code — SAG upserts on this key
  DESCRIPCION:         string;   // Description / name
  PRECIO:              number;   // Base price COP (= PV1 / price list 1)

  // ── Classification ──────────────────────────────────────────────────────────
  GRUPO?:              string;   // Product group
  SUB_GRUPO?:          string;   // Product sub-group
  LINEA?:              string;   // Product line / category
  MARCA?:              string;   // Brand
  REFERENCIA?:         string;   // SKU / external reference

  // ── Logistics ───────────────────────────────────────────────────────────────
  UNIDAD?:             string;   // Unit of measure: UND, KG, LT, CJ, BOL, …
  MANEJA_KARDEX?:      "S" | "N"; // Inventory tracking
  MANEJA_TALLA_COLOR?: "S" | "N"; // Size / colour variants
  TALLA?:              string;
  COLOR?:              string;
  MANEJA_LOTE?:        "S" | "N"; // Lot / batch control (default "N")

  // ── Pricing / tax ───────────────────────────────────────────────────────────
  TARIFA_IVA?:         string;   // IVA tariff code (e.g. IVA19, IVA5, IVA0)
  IVA?:                number;   // IVA percentage: 0 | 5 | 19 (overrides tariff)
  INCLUIDO_IVA?:       "S" | "N"; // Price already includes IVA (default "N")
  COSTO?:              number;   // Cost price COP

  // ── Commerce ────────────────────────────────────────────────────────────────
  COMPOSICION?:        "S" | "N"; // Bundle / kit product
  ADQUISICION?:        string;   // Acquisition / procurement code
  TIENDA_VIRTUAL?:     "S" | "N"; // Available in e-commerce / virtual store

  // ── Status ──────────────────────────────────────────────────────────────────
  ACTIVO?:             "S" | "N" | 0 | 1; // "S" = active (default)
  BLOQUEADO?:          "S" | "N"; // Blocked for new transactions (default "N")
}

export interface SagDocumentLine {
  CODIGO:     string;   // Article code
  CANTIDAD:   number;
  PRECIO:     number;   // Unit price at time of document
  DESCUENTO?: number;   // Percentage discount (0–100)
  IVA?:       number;   // Override IVA for this line
  BODEGA?:    string;   // Warehouse code
}

export interface SagDocumentInput {
  TIPO_DOC:    string;   // Required — SAG document type code (FV, CO, PE, …)
  NUMERO_DOC?: string;   // Optional — SAG will auto-assign if omitted
  NIT:         string;   // Required — customer NIT
  FECHA:       string;   // Required — ISO date YYYY-MM-DD
  VENDEDOR?:   string;
  BODEGA?:     string;   // Default warehouse
  OBSERVACION?: string;
  LINEAS:      SagDocumentLine[]; // Required — at least one line item
}

export interface SagReceiptInput {
  TIPO:      "RC" | "EG"; // RC = Recibo de caja, EG = Egreso
  NUMERO?:   string;      // Auto-assigned if omitted
  NIT:       string;      // Customer / third-party NIT
  FECHA:     string;      // ISO date YYYY-MM-DD
  VALOR:     number;      // Amount COP
  CONCEPTO:  string;      // Description / reason
  CUENTA?:   string;      // Accounting account code
  BANCO?:    string;      // Bank name for payment
  CHEQUE?:   string;      // Cheque number if applicable
}

// Union discriminated by write type
export type SagWriteInput =
  | { type: 1;  payload: SagCustomerInput }
  | { type: 3;  payload: SagTerceroInput  }
  | { type: 5;  payload: SagProductInput  }
  | { type: 2;  payload: SagDocumentInput }
  | { type: 28; payload: SagDocumentInput }
  | { type: 6;  payload: SagReceiptInput  };

// ── Validation result ──────────────────────────────────────────────────────────

export interface ValidationError {
  field:   string;
  message: string;
}

export interface ValidationResult {
  valid:  boolean;
  errors: ValidationError[];
}

// ── SAG write response ─────────────────────────────────────────────────────────
//
// SAG returns a plain string inside insercionSagResult.
// Common patterns observed:
//   "OK"
//   "OK: 900123456"
//   "ERROR: NIT inválido"
//   "FALLIDO: Artículo ya existe sin actualización"

export interface SagWriteResponse {
  raw:       string;         // Exact text from insercionSagResult
  ok:        boolean;        // true if raw starts with "OK"
  message:   string;         // Normalised message (stripped prefix)
  sagRef?:   string;         // Any ID/code SAG echoes back (e.g. document number)
}

// ── Queue operation record (mirrors DB model SagWriteOperation) ────────────────
//
// The DB model is defined in prisma/schema.prisma.
// This TS interface mirrors it for use in service code.

export interface SagWriteOperationRecord {
  id:               string;
  organizationId:   string;

  writeType:        SagWriteType;
  status:           SagWriteStatus;
  risk:             SagWriteRisk;

  // Human-readable description for the approval UI
  description:      string;

  // Source reference — e.g. "crm_opportunity:abc123", "shopify_order:456"
  sourceRef?:       string;

  // Validated input before XML generation
  inputJson:        SagWriteInput;

  // Generated XML (set when operation is queued)
  generatedXml:     string;

  // What was actually submitted to SAG (= generatedXml, kept for audit)
  submittedXml?:    string;

  // Raw SAG response
  sagResponseRaw?:  string;
  sagResponseOk?:   boolean;

  // Audit trail
  initiatedBy:      string;       // userId
  initiatedAt:      Date;
  approvedBy?:      string;       // userId
  approvedAt?:      Date;
  rejectedBy?:      string;
  rejectedAt?:      Date;
  rejectionReason?: string;
  sentAt?:          Date;

  retryCount:       number;       // max 3 before permanent failure
  lastError?:       string;
}
