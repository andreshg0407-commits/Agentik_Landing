/**
 * lib/comercial/clientes/sag-customer-master-adapter.ts
 *
 * Typed adapter for SAG vw_agentik_clientes view.
 * Maps the 24-column view output to CustomerProfile upsert data.
 *
 * Sprint: AGENTIK-CUSTOMERS-SAG-MASTER-DATA-INTEGRATION-01
 *
 * Column source: SAG vw_agentik_clientes view definition
 * The view JOINs: clientes + terceros + tipos_identificacion + tipos_clientes +
 *   ciudades + departamentos + paises + vendedores + canales + zonas +
 *   v_cual_precios + movimientos (ultima compra) + saldos_facturas (saldo cartera).
 */
import "server-only";

// ── Raw row type (matches vw_agentik_clientes output columns) ─────────────

export interface SagCustomerMasterRow {
  CLIENTE_ID: number | null;          // ka_nl_tercero (SAG internal PK)
  CODIGO_CLIENTE: string | null;      // sc_codigo_alterno
  NIT: number | null;                 // n_nit (integer, no DV)
  TIPO_IDENTIFICACION: string | null; // SS_NOM_IDENTIFICACION (e.g. "NIT", "CC")
  RAZON_SOCIAL: string | null;        // sc_nombre (legal name)
  NOMBRE_COMERCIAL: string | null;    // sc_nombre_alterno or fallback sc_nombre
  TIPO_CLIENTE: string | null;        // ss_tipo_cliente
  ESTADO: string | null;              // "Activo" | "Inactivo"
  FECHA_CREACION: string | null;      // ddt_fecha_creacion_tercero (ISO datetime)
  FECHA_ULTIMA_COMPRA: string | null; // MAX(d_fecha_documento) from MOVIMIENTOS
  CUPO_CREDITO: number | null;        // n_cupo_maximo (ISNULL → 0)
  SALDO_CARTERA: number | null;       // SUM(n_saldo_actual) from saldos_facturas
  CIUDAD: string | null;              // sc_nombre_ciudad (resolved from JOIN)
  DEPARTAMENTO: string | null;        // ss_nombre (resolved from JOIN)
  PAIS: string | null;                // ss_nom_pais (resolved from JOIN)
  DIRECCION: string | null;           // sc_direccion
  TELEFONO: string | null;            // sc_telefono_ppal
  CELULAR: string | null;             // sc_telefono_alterno
  EMAIL: string | null;               // ss_email
  VENDEDOR_ASIGNADO: string | null;   // sc_nombre from vendedores JOIN
  CANAL_CLIENTE: string | null;       // ss_detalle from canales JOIN
  ZONA_COMERCIAL: string | null;      // sc_detalle_zona from zonas JOIN
  LISTA_PRECIOS: string | null;       // nombre from v_cual_precios JOIN
}

// ── Data quality classification ───────────────────────────────────────────

export type CustomerMasterDataQuality = "VALID" | "INCOMPLETE" | "SUSPICIOUS";

export interface CustomerMasterQualityResult {
  quality: CustomerMasterDataQuality;
  reasons: string[];
  /** Count of populated fields out of total mapped fields */
  fieldCoverage: number;
}

// ── Mapped customer master record (ready for CustomerProfile upsert) ──────

export interface MappedCustomerMaster {
  // Identity
  sagTerceroId: number;
  sagCustomerCode: string | null;
  nit: string | null;
  nitNormalized: string | null;
  documentType: string | null;

  // Names
  legalName: string;
  tradeName: string | null;
  name: string; // display name = tradeName ?? legalName

  // Status
  status: "ACTIVE" | "INACTIVE";

  // Location (resolved names from SAG JOINs — not FK integers)
  address: string | null;
  city: string | null;
  department: string | null;
  country: string | null;

  // Contact
  phone: string | null;
  mobile: string | null;
  email: string | null;

  // Commercial
  sellerName: string | null;
  channel: string | null;
  zone: string | null;
  customerType: string | null;
  priceListName: string | null;

  // Financial
  creditLimit: number;
  portfolioBalance: number;

  // Dates
  createdAt: Date | null;
  lastPurchaseAt: Date | null;

  // Quality
  dataQuality: CustomerMasterQualityResult;

  // Raw row for rawErpJson storage
  rawRow: SagCustomerMasterRow;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function trimStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function parseNum(v: unknown, fallback = 0): number {
  if (v == null) return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : fallback;
}

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s.includes("T") ? s : s.slice(0, 10) + "T00:00:00Z");
  return isNaN(d.getTime()) || d.getTime() <= 0 ? null : d;
}

/**
 * Normalise a Colombian NIT to its canonical form.
 * Strips dots, spaces, dash-DV suffix, and trims 10-digit NITs to 9.
 */
function normalizeNit(raw: string): string {
  let s = raw.trim().replace(/[\.\s]/g, "");
  s = s.replace(/-\d$/, "");
  if (/^\d{10}$/.test(s)) s = s.slice(0, 9);
  return s;
}

function toSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
}

// ── Suspicious name detection ──────────────────────────────────────────────

const SUSPICIOUS_NAME_PATTERNS = [
  /^[0\s]+$/,          // all zeros/spaces
  /^\|+$/,             // all pipes
  /^\.+$/,             // all dots
  /^-+$/,              // all dashes
  /^[^a-záéíóúñ]{0,2}$/i, // 0-2 non-alpha chars
];

function isSuspiciousName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2) return true;
  return SUSPICIOUS_NAME_PATTERNS.some(p => p.test(trimmed));
}

// ── Status normalization ───────────────────────────────────────────────────

export function normalizeCustomerStatus(estado: unknown): "ACTIVE" | "INACTIVE" {
  const s = trimStr(estado);
  if (!s) return "INACTIVE";
  const upper = s.toUpperCase();
  if (upper === "ACTIVO" || upper === "S" || upper === "SI" || upper === "ACTIVE") {
    return "ACTIVE";
  }
  return "INACTIVE";
}

// ── Name normalization ─────────────────────────────────────────────────────

export function normalizeCustomerName(raw: string | null): string {
  if (!raw) return "SIN NOMBRE";
  const trimmed = raw.trim();
  if (trimmed.length === 0 || isSuspiciousName(trimmed)) return "SIN NOMBRE";
  // Title case basic normalization for ALL CAPS names
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 3) {
    return trimmed
      .toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase());
  }
  return trimmed;
}

// ── Data quality evaluator ─────────────────────────────────────────────────

export function evaluateCustomerDataQuality(
  row: SagCustomerMasterRow,
): CustomerMasterQualityResult {
  const reasons: string[] = [];
  let populated = 0;
  const total = 14; // key fields we check

  // Identity
  if (row.CLIENTE_ID != null && row.CLIENTE_ID > 0) populated++;
  else reasons.push("CLIENTE_ID ausente");

  if (row.NIT != null && row.NIT > 0) populated++;
  else reasons.push("NIT ausente");

  // Names
  const legalName = trimStr(row.RAZON_SOCIAL);
  if (legalName && !isSuspiciousName(legalName)) populated++;
  else reasons.push("RAZON_SOCIAL ausente o sospechosa");

  // Status
  if (trimStr(row.ESTADO)) populated++;
  else reasons.push("ESTADO ausente");

  // Location
  if (trimStr(row.CIUDAD)) populated++;
  else reasons.push("CIUDAD ausente");

  if (trimStr(row.DIRECCION)) populated++;
  else reasons.push("DIRECCION ausente");

  // Contact
  if (trimStr(row.TELEFONO) || trimStr(row.CELULAR)) populated++;
  else reasons.push("Sin telefono");

  if (trimStr(row.EMAIL)) populated++;
  else reasons.push("EMAIL ausente");

  // Commercial
  if (trimStr(row.VENDEDOR_ASIGNADO)) populated++;
  else reasons.push("VENDEDOR_ASIGNADO ausente");

  if (trimStr(row.TIPO_CLIENTE)) populated++;
  else reasons.push("TIPO_CLIENTE ausente");

  // Financial
  if (row.CUPO_CREDITO != null && row.CUPO_CREDITO > 0) populated++;

  // Dates
  if (trimStr(row.FECHA_CREACION)) populated++;
  if (trimStr(row.FECHA_ULTIMA_COMPRA)) populated++;

  // Price list
  if (trimStr(row.LISTA_PRECIOS)) populated++;

  const fieldCoverage = populated / total;

  // Classify
  let quality: CustomerMasterDataQuality;
  if (legalName && isSuspiciousName(legalName)) {
    quality = "SUSPICIOUS";
  } else if (fieldCoverage >= 0.6) {
    quality = "VALID";
  } else {
    quality = "INCOMPLETE";
  }

  return { quality, reasons, fieldCoverage };
}

// ── Main mapper ────────────────────────────────────────────────────────────

/**
 * Map a raw vw_agentik_clientes row to a MappedCustomerMaster.
 * Returns null if the row has no usable identity (no CLIENTE_ID and no NIT).
 */
export function mapSagCustomerMasterRow(
  row: Record<string, unknown>,
): MappedCustomerMaster | null {
  // Cast to typed row (SAG returns arbitrary Record<string, unknown>)
  const r: SagCustomerMasterRow = {
    CLIENTE_ID:          parseNum(row["CLIENTE_ID"], 0) || null,
    CODIGO_CLIENTE:      trimStr(row["CODIGO_CLIENTE"]),
    NIT:                 parseNum(row["NIT"], 0) || null,
    TIPO_IDENTIFICACION: trimStr(row["TIPO_IDENTIFICACION"]),
    RAZON_SOCIAL:        trimStr(row["RAZON_SOCIAL"]),
    NOMBRE_COMERCIAL:    trimStr(row["NOMBRE_COMERCIAL"]),
    TIPO_CLIENTE:        trimStr(row["TIPO_CLIENTE"]),
    ESTADO:              trimStr(row["ESTADO"]),
    FECHA_CREACION:      trimStr(row["FECHA_CREACION"]),
    FECHA_ULTIMA_COMPRA: trimStr(row["FECHA_ULTIMA_COMPRA"]),
    CUPO_CREDITO:        parseNum(row["CUPO_CREDITO"], 0),
    SALDO_CARTERA:       parseNum(row["SALDO_CARTERA"], 0),
    CIUDAD:              trimStr(row["CIUDAD"]),
    DEPARTAMENTO:        trimStr(row["DEPARTAMENTO"]),
    PAIS:                trimStr(row["PAIS"]),
    DIRECCION:           trimStr(row["DIRECCION"]),
    TELEFONO:            trimStr(row["TELEFONO"]),
    CELULAR:             trimStr(row["CELULAR"]),
    EMAIL:               trimStr(row["EMAIL"]),
    VENDEDOR_ASIGNADO:   trimStr(row["VENDEDOR_ASIGNADO"]),
    CANAL_CLIENTE:       trimStr(row["CANAL_CLIENTE"]),
    ZONA_COMERCIAL:      trimStr(row["ZONA_COMERCIAL"]),
    LISTA_PRECIOS:       trimStr(row["LISTA_PRECIOS"]),
  };

  // Identity gate: must have at least CLIENTE_ID or NIT
  const clienteId = r.CLIENTE_ID;
  const nitRaw = r.NIT != null && r.NIT > 0 ? String(r.NIT) : null;
  if (!clienteId && !nitRaw) return null;

  // NIT normalization
  const nit = nitRaw;
  const nitNorm = nit ? normalizeNit(nit) : null;

  // Names
  const legalName = normalizeCustomerName(r.RAZON_SOCIAL);
  const tradeName = r.NOMBRE_COMERCIAL && r.NOMBRE_COMERCIAL !== r.RAZON_SOCIAL
    ? normalizeCustomerName(r.NOMBRE_COMERCIAL)
    : null;
  const displayName = tradeName ?? legalName;

  // Status
  const status = normalizeCustomerStatus(r.ESTADO);

  // Dates
  const createdAt = parseDate(r.FECHA_CREACION);
  const lastPurchaseAt = parseDate(r.FECHA_ULTIMA_COMPRA);

  // Quality
  const dataQuality = evaluateCustomerDataQuality(r);

  return {
    sagTerceroId: clienteId ?? 0,
    sagCustomerCode: r.CODIGO_CLIENTE,
    nit,
    nitNormalized: nitNorm,
    documentType: r.TIPO_IDENTIFICACION,

    legalName,
    tradeName,
    name: displayName,

    status,

    address: r.DIRECCION,
    city: r.CIUDAD,
    department: r.DEPARTAMENTO,
    country: r.PAIS ?? "Colombia",

    phone: r.TELEFONO,
    mobile: r.CELULAR,
    email: r.EMAIL,

    sellerName: r.VENDEDOR_ASIGNADO,
    channel: r.CANAL_CLIENTE,
    zone: r.ZONA_COMERCIAL,
    customerType: r.TIPO_CLIENTE,
    priceListName: r.LISTA_PRECIOS,

    creditLimit: r.CUPO_CREDITO ?? 0,
    portfolioBalance: r.SALDO_CARTERA ?? 0,

    createdAt,
    lastPurchaseAt,

    dataQuality,
    rawRow: r,
  };
}

// ── Slug builder (presentation-only — NOT used for identity/dedup) ────────

/**
 * Build a URL-friendly slug for a customer profile.
 *
 * IMPORTANT: This slug is for URL routing only. It does NOT participate
 * in identity, upsert dedup, or relation resolution. The canonical identity
 * key is (organizationId, sagTerceroId).
 *
 * Format: nit-based if available, otherwise name-based.
 * The sync layer handles slug collisions by appending -{sagTerceroId}.
 */
export function buildCustomerSlug(mapped: MappedCustomerMaster): string {
  const base = mapped.nit ?? mapped.name;
  return toSlug(base);
}

// ── SAG query constant ─────────────────────────────────────────────────────

/**
 * The SQL query to execute against SAG via consultaSagJson.
 * Targets the vw_agentik_clientes view which JOINs clientes + terceros +
 * tipos_identificacion + tipos_clientes + ciudades + departamentos + paises +
 * vendedores + canales + zonas + v_cual_precios + movimientos + saldos_facturas.
 */
export const SAG_CUSTOMER_MASTER_QUERY = "SELECT * FROM vw_agentik_clientes";
