/**
 * castillitos-crm/mappers.ts
 *
 * Pure mapping functions that translate raw Castillitos CRM JSON rows into
 * canonical Agentik unified types:
 *   - mapCrmCustomer     → UnifiedCustomer
 *   - mapCrmOpportunity  → UnifiedOpportunity
 *   - mapCrmActivity     → UnifiedActivity
 *   - mapCrmQuote        → UnifiedQuote
 *
 * Rows arrive as flattened V8 JSON:API records (id + _module + spread
 * attributes from flattenV8Record).  Each mapper accepts both the SuiteCRM
 * V8 snake_case field names and the legacy camelCase fallback names so the
 * same mapper works regardless of the source module version.
 *
 * SuiteCRM V8 field reference (confirmed against AOS_Quotes / AOS_Opportunities
 * / Calls / Accounts):
 *   Dates       : date_entered, date_modified, date_start, date_closed
 *   Amount      : total_amount (quotes), amount (opportunities)
 *   Stage       : quote_stage (quotes), sales_stage (opportunities)
 *   Account     : billing_account_name / billing_account_id (quotes),
 *                 account_name / account_id (opportunities & activities)
 *   Seller      : assigned_user_name, assigned_user_id
 *   Quote#      : number (AOS_Quotes)
 *   Activity    : name (subject), description (body), _module (type source)
 *
 * All monetary values are COP unless a `currency_id` / `currency` field
 * is present in the row.
 */

import type {
  ActivityType,
  OpportunityStatus,
  QuoteStatus,
  UnifiedActivity,
  UnifiedCustomer,
  UnifiedOpportunity,
  UnifiedQuote,
} from "@/lib/connectors/core/types";

// ── Field extraction helpers ──────────────────────────────────────────────────

function str(row: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = row[key];
    if (v != null) {
      const s = String(v).trim();
      if (s.length > 0) return s;
    }
  }
  return undefined;
}

function num(row: Record<string, unknown>, key: string, fallback = 0): number {
  const v = row[key];
  if (v == null) return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : fallback;
}

function parseDate(row: Record<string, unknown>, ...keys: string[]): Date {
  for (const key of keys) {
    const v = row[key];
    if (!v) continue;
    const s = String(v).trim();
    if (!s) continue;
    const d = new Date(s.includes("T") ? s : s + "T00:00:00Z");
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(0);
}

function parseDateOpt(row: Record<string, unknown>, ...keys: string[]): Date | undefined {
  for (const key of keys) {
    const v = row[key];
    if (!v) continue;
    const s = String(v).trim();
    if (!s) continue;
    const d = new Date(s.includes("T") ? s : s + "T00:00:00Z");
    if (!isNaN(d.getTime()) && d.getTime() > 0) return d;
  }
  return undefined;
}

// ── Slug helper ───────────────────────────────────────────────────────────────

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

// ── Activity type mapping ─────────────────────────────────────────────────────

// SuiteCRM V8 module names (from _module field) map to activity types.
const ACTIVITY_TYPE_MAP: Record<string, ActivityType> = {
  // SuiteCRM V8 module names
  calls:        "call",
  meetings:     "meeting",
  notes:        "note",
  emails:       "email",
  tasks:        "note",
  // Legacy / generic type strings
  call:         "call",
  llamada:      "call",
  phone:        "call",
  email:        "email",
  correo:       "email",
  mail:         "email",
  visit:        "visit",
  visita:       "visit",
  note:         "note",
  nota:         "note",
  comment:      "note",
  meeting:      "meeting",
  reunion:      "meeting",
  reunión:      "meeting",
  quote_sent:   "quote_sent",
  cotizacion:   "quote_sent",
  cotización:   "quote_sent",
  demo:         "demo",
  demostracion: "demo",
  proposal:     "proposal",
  propuesta:    "proposal",
};

function mapActivityType(raw: string | undefined): ActivityType {
  if (!raw) return "other";
  const key = raw.toLowerCase().replace(/\s+/g, "_");
  return ACTIVITY_TYPE_MAP[key] ?? "other";
}

// ── Opportunity status mapping ─────────────────────────────────────────────────

function mapOpportunityStatus(raw: string | undefined): OpportunityStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "won":
    case "ganado":
    case "ganada":
    case "closed won":      // SuiteCRM sales_stage value
    case "closed_won":
      return "won";
    case "lost":
    case "perdido":
    case "perdida":
    case "closed lost":     // SuiteCRM sales_stage value
    case "closed_lost":
      return "lost";
    case "abandoned":
    case "abandonado":
    case "abandonada":
      return "abandoned";
    default:
      return "open";
  }
}

// ── Quote status mapping ───────────────────────────────────────────────────────
//
// AOS_Quotes `stage` confirmed values from JR Consultores CRM:
//   "Draft"          → draft
//   "Negotiation"    → draft
//   "Delivered"      → sent
//   "Confirmed"      → accepted
//   "Closed Accepted"→ accepted
//   "Invoiced"       → accepted  (invoice generated)
//   "Closed Lost"    → rejected
//   "Closed Dead"    → expired

function mapQuoteStatus(raw: string | undefined): QuoteStatus {
  switch ((raw ?? "").toLowerCase().trim()) {
    case "sent":
    case "enviada":
    case "enviado":
    case "delivered":
      return "sent";
    case "accepted":
    case "aceptada":
    case "aceptado":
    case "approved":
    case "confirmed":
    case "closed accepted":
    case "invoiced":        // invoice generated — treat as accepted
      return "accepted";
    case "rejected":
    case "rechazada":
    case "rechazado":
    case "declined":
    case "closed lost":
      return "rejected";
    case "expired":
    case "vencida":
    case "vencido":
    case "closed dead":
      return "expired";
    default:
      return "draft";
  }
}

// ── mapCrmCustomer ─────────────────────────────────────────────────────────────

/**
 * Map a Castillitos CRM customer/account row to UnifiedCustomer.
 *
 * SuiteCRM V8 (Accounts): name, billing_address_city, billing_address_state,
 *   billing_address_country, phone_office, email1, assigned_user_name,
 *   date_entered, date_modified.
 * Legacy camelCase fallbacks retained.
 */
export function mapCrmCustomer(
  row:   Record<string, unknown>,
  orgId: string
): UnifiedCustomer {
  const sourceId = str(row, "id") ?? toSlug(str(row, "name") ?? "unknown");
  const name     = str(row, "name", "nombre", "companyName") ?? "SIN NOMBRE";
  const taxId    = str(row, "nit", "taxId", "tax_id", "rut", "sic_code");

  // V8: date_modified / date_entered; legacy: updatedAt / createdAt
  const updatedAt = parseDate(row, "date_modified", "updatedAt", "updated_at", "modifiedAt", "date_entered");
  const createdAt = parseDate(row, "date_entered",  "createdAt", "created_at");

  return {
    sourceId,
    source:  "castillitos_crm",
    orgId,

    name,
    taxId,
    // V8 Accounts: email1, phone_office; legacy: email, phone
    email: str(row, "email1", "email"),
    phone: str(row, "phone_office", "phone", "telefono", "mobile", "phone_mobile"),

    type: taxId ? "company" : "unknown",

    address: {
      // V8 billing address fields
      city:    str(row, "billing_address_city",    "city",    "ciudad"),
      state:   str(row, "billing_address_state",   "state",   "department", "departamento"),
      country: str(row, "billing_address_country", "country", "pais") ?? "CO",
    },

    // V8: assigned_user_name / assigned_user_id; legacy: sellerName / sellerId
    salesRepName: str(row, "assigned_user_name", "sellerName", "seller_name", "assignedTo", "vendedor"),
    salesRepId:   str(row, "assigned_user_id",   "sellerId",   "seller_id"),

    createdAt: createdAt.getTime() > 0 ? createdAt : updatedAt,
    updatedAt,

    meta: { raw: row },
  };
}

// ── mapCrmOpportunity ──────────────────────────────────────────────────────────

/**
 * Map a Castillitos CRM opportunity row to UnifiedOpportunity.
 *
 * SuiteCRM V8 (AOS_Opportunities): name, sales_stage, amount, probability,
 *   account_name, account_id, assigned_user_name, assigned_user_id,
 *   date_entered, date_modified, date_closed (expected close), description.
 * Legacy camelCase fallbacks retained.
 */
export function mapCrmOpportunity(
  row:   Record<string, unknown>,
  orgId: string
): UnifiedOpportunity {
  const sourceId = str(row, "id") ?? "unknown";
  const title    = str(row, "name", "title", "nombre", "oportunidad") ?? "Sin título";

  // V8: sales_stage; legacy: stage / etapa
  const stage    = str(row, "sales_stage", "stage", "etapa", "pipeline_stage") ?? "unknown";

  const amount      = num(row, "amount",      0);
  // V8 does not expose currency_name reliably; fall back to currency_id or default COP
  const currency    = str(row, "currency_id", "currency") ?? "COP";
  const probability = num(row, "probability", 50);

  // V8: date_entered → openedAt, date_closed → expectedCloseAt
  const openedAt        = parseDate(row, "date_entered",  "openedAt", "opened_at", "createdAt", "created_at");
  const closedAt        = parseDateOpt(row, "date_closed_actual", "closedAt", "closed_at");
  const expectedCloseAt = parseDateOpt(row, "date_closed",        "expectedCloseAt", "expected_close_at", "closeDate");
  const lastActivityAt  = parseDateOpt(row, "date_modified",      "lastActivityAt",  "last_activity_at");

  // V8: sales_stage → status
  const status = mapOpportunityStatus(str(row, "sales_stage", "status", "estado"));

  // V8 account link: account_name / account_id
  const sellerRaw = str(row, "assigned_user_name", "sellerName", "seller_name", "vendedor");

  return {
    sourceId,
    source:  "castillitos_crm",
    orgId,

    crmId:    sourceId,
    title,
    stage,
    amount,
    currency,
    probability: Math.min(100, Math.max(0, Math.round(probability))),

    // V8: account_name / account_id; legacy: customerName / customerId
    customerId:    str(row, "account_id",   "customerId",   "customer_id"),
    customerName:  str(row, "account_name", "customerName", "customer_name", "clienteName", "cliente"),
    customerTaxId: str(row, "customerTaxId", "customer_tax_id", "nit"),

    sellerSlug: str(row, "sellerSlug", "seller_slug")
      ?? (sellerRaw ? toSlug(sellerRaw) : undefined),
    sellerName: sellerRaw,

    status,
    lossReason: str(row, "lossReason", "loss_reason", "razonPerdida"),
    lossNote:   str(row, "description", "lossNote",   "loss_note",   "notaPerdida"),

    openedAt,
    expectedCloseAt,
    closedAt,
    lastActivityAt,

    meta: { raw: row },
  };
}

// ── mapCrmActivity ─────────────────────────────────────────────────────────────

/**
 * Map a Castillitos CRM activity row to UnifiedActivity.
 *
 * SuiteCRM V8 (Calls / Meetings / Notes / Tasks):
 *   name → subject, description → body, date_start → occurredAt (Calls/Meetings),
 *   date_entered → occurredAt (Notes/Tasks), date_due / due_date → dueAt,
 *   assigned_user_name → sellerName, parent_id / parent_name → opportunityId link,
 *   account_id / account_name → customerId link.
 *   _module field (from flattenV8Record) used to derive activity type.
 * Legacy camelCase fallbacks retained.
 */
export function mapCrmActivity(
  row:   Record<string, unknown>,
  orgId: string
): UnifiedActivity {
  const sourceId = str(row, "id") ?? "unknown";

  // Derive type: prefer _module (set by flattenV8Record), then explicit type field
  const rawType  = str(row, "_module", "type", "tipo", "activityType");
  const type     = mapActivityType(rawType);

  // SuiteCRM Calls/Meetings use date_start; Notes/Tasks use date_entered
  const occurredAt = parseDate(
    row,
    "date_start", "occurredAt", "occurred_at", "date", "fecha",
    "date_entered", "createdAt", "created_at",
  );

  const sellerRaw = str(row, "assigned_user_name", "sellerName", "seller_name", "vendedor");

  return {
    sourceId,
    source:  "castillitos_crm",
    orgId,

    crmId:   sourceId,
    type,
    // V8: name → subject; legacy: subject / asunto / title
    subject: str(row, "name", "subject", "asunto", "title"),
    body:    str(row, "description", "body", "descripcion", "note", "nota"),
    outcome: str(row, "outcome", "resultado", "status"),

    // V8: account_id / account_name; parent link may point to opportunity
    customerId:    str(row, "account_id",   "customerId",    "customer_id"),
    opportunityId: str(row, "parent_id",    "opportunityId", "opportunity_id"),

    sellerSlug: str(row, "sellerSlug", "seller_slug")
      ?? (sellerRaw ? toSlug(sellerRaw) : undefined),
    sellerName: sellerRaw,

    occurredAt,
    // V8: date_due (Tasks) / duration hints (Calls have duration_hours)
    dueAt:       parseDateOpt(row, "date_due",    "dueAt",       "due_at",       "fechaVencimiento"),
    completedAt: parseDateOpt(row, "date_closed", "completedAt", "completed_at", "fechaCompletado"),

    meta: { raw: row },
  };
}

// ── mapCrmQuote ────────────────────────────────────────────────────────────────

/**
 * Map a Castillitos CRM quote row to UnifiedQuote.
 *
 * SuiteCRM V8 (AOS_Quotes): number → quoteNumber, quote_stage → status,
 *   total_amount → amount, billing_account_name / billing_account_id → customer,
 *   opportunity_name / opportunity_id → opportunity link,
 *   assigned_user_name → sellerName, date_entered → issuedAt,
 *   date_modified for cursor tracking.
 * Legacy camelCase fallbacks retained.
 */
export function mapCrmQuote(
  row:   Record<string, unknown>,
  orgId: string
): UnifiedQuote {
  const sourceId = str(row, "id") ?? "unknown";

  // AOS_Quotes confirmed field: `stage` (not quote_stage).
  // `stage` is the canonical pipeline/status field in JR Consultores CRM.
  const rawStatus = str(row, "stage", "quote_stage", "status", "estado");
  const status    = mapQuoteStatus(rawStatus);

  // V8: date_entered → issuedAt
  const issuedAt    = parseDate(row, "date_entered",  "issuedAt", "issued_at", "createdAt", "created_at", "fecha");
  const expiresAt   = parseDateOpt(row, "date_quote_expected_closed", "expiresAt", "expires_at", "validUntil");
  const respondedAt = parseDateOpt(row, "respondedAt", "responded_at", "acceptedAt", "rejectedAt");

  const sellerRaw = str(row, "assigned_user_name", "sellerName", "seller_name", "vendedor");

  return {
    sourceId,
    source:  "castillitos_crm",
    orgId,

    crmId: sourceId,
    // V8: number (quote reference #); AOS_Quotes also uses `name` as the quote title
    quoteNumber: str(row, "number", "quoteNumber", "quote_number", "numero"),
    status,
    // V8: total_amount; legacy: amount
    amount:   num(row, "total_amount", 0) || num(row, "amount", 0),
    currency: str(row, "currency_id", "currency") ?? "COP",

    // AOS_Quotes confirmed fields: billing_account_id + billing_account (name)
    // billing_account is the relate-field that returns the account display name
    customerId:    str(row, "billing_account_id",  "customerId",    "customer_id"),
    opportunityId: str(row, "opportunity_id",      "opportunityId", "opportunity_id"),

    sellerSlug: str(row, "sellerSlug", "seller_slug")
      ?? (sellerRaw ? toSlug(sellerRaw) : undefined),
    sellerName: sellerRaw,

    issuedAt,
    expiresAt,
    respondedAt,

    // meta.raw contains ALL flattened V8 attributes, including:
    //   name, stage, invoice_status, lista_precios_c, sucursal_c,
    //   estado_mercancia_c, id_sag_c, respuesta_sag_c, billing_account
    meta: { raw: row },
  };
}
