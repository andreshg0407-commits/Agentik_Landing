/**
 * accounting-classifier.ts
 *
 * Sprint 2 — Automatización contable por documentos V1
 *
 * Rule-based accounting classifier that works entirely from existing Document
 * records — no DIAN integration, no external API calls.
 *
 * Signal priority (highest → lowest):
 *   1. xmlExtraction.family   (CO_CREDIT_NOTE → DEVOLUCION, etc.)
 *   2. xmlExtraction.fields   (cufe, taxAmount → IVA, CO invoice fields)
 *   3. documentClassification.family (from process-document engine)
 *   4. Document.type          (BANK_STATEMENT, TAX_DOCUMENT, etc.)
 *   5. Document.category      (free-text sub-category)
 *   6. Document.title         (keyword analysis)
 *   7. Document.amount        (negative → DEVOLUCION/AJUSTE)
 *
 * Confidence scoring (0-100):
 *   - XML family confirmed      → base 88
 *   - Doc classification HIGH   → base 80
 *   - Doc classification MEDIUM → base 68
 *   - Doc classification LOW    → base 48
 *   - BANK_STATEMENT type       → base 92
 *   - TAX_DOCUMENT type         → base 85
 *   - Title keyword strong      → base 65
 *   - Title keyword weak        → base 45
 *   Adjustments:
 *     +8  validationStatus VALID
 *     +5  CUFE found (confirms Colombian e-invoice)
 *     +5  taxAmount found in XML
 *     -10 conflicting signals
 *     -15 multiple competing categories
 */

import { prisma } from "@/lib/prisma";
import {
  CHART_OF_ACCOUNTS,
  AUTO_APPROVE_THRESHOLD,
  REQUIRE_REVIEW_THRESHOLD,
  type AccountingCategory,
  type AccountEntry,
} from "./accounting-taxonomy";

// ── Public types ──────────────────────────────────────────────────────────────

export interface TaxProfile {
  hasIva:       boolean;
  ivaAmount:    number | null;
  /** Colombian IVA rates: 0, 5, 19 */
  estimatedRate: number | null;
  hasRetencion: boolean;
  isExempt:     boolean;
  /** CUFE — confirms authenticated Colombian e-invoice */
  cufe:         string | null;
}

export interface AccountingClassification {
  documentId:         string;
  documentTitle:      string;
  documentType:       string;
  /** Amount as stored (may be null for unprocessed docs) */
  amount:             number | null;
  currency:           string | null;
  documentDate:       Date | null;
  accountingCategory: AccountingCategory;
  suggestedAccount:   AccountEntry;
  taxProfile:         TaxProfile;
  counterparty:       string | null;
  counterpartyNit:    string | null;
  invoiceNumber:      string | null;
  costCenter:         string | null;
  branch:             string | null;
  channel:            string | null;
  confidenceScore:    number;
  confidenceReason:   string;
  requiresReview:     boolean;
  reviewReason:       string | null;
  /** Human-readable list of signals that drove the classification. */
  signals:            string[];
  /** XML document family when available. */
  xmlFamily:          string | null;
}

export interface ClassificationBatch {
  total:          number;
  autoApproved:   number;
  requiresReview: number;
  taxSensitive:   number;
  byCategory:     Partial<Record<AccountingCategory, number>>;
  items:          AccountingClassification[];
  hasData:        boolean;
}

// ── Internal signal accumulator ───────────────────────────────────────────────

interface CategoryVote {
  category: AccountingCategory;
  weight:   number;   // 1 (weak) → 5 (definitive)
  label:    string;
}

// ── extractedJson safe-access helpers ─────────────────────────────────────────

type EJ = Record<string, unknown>;

function ejStr(ej: EJ, key: string): string | null {
  const v = ej[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function ejNum(ej: EJ, key: string): number | null {
  const v = ej[key];
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") { const n = parseFloat(v); return isFinite(n) ? n : null; }
  return null;
}

function ejObj(ej: EJ, key: string): EJ | null {
  const v = ej[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as EJ) : null;
}

// ── Keyword signal tables ─────────────────────────────────────────────────────

/** Title keyword → (category, weight) */
const TITLE_SIGNALS: Array<{
  patterns: RegExp;
  category: AccountingCategory;
  weight:   number;
  label:    string;
}> = [
  { patterns: /nota\s*cr[eé]d|nc[\s\-]|crédito\s*venta/i,   category: "DEVOLUCION",        weight: 4, label: "titulo:nota_credito"    },
  { patterns: /nota\s*d[eé]b|nd[\s\-]/i,                     category: "AJUSTE",            weight: 3, label: "titulo:nota_debito"     },
  { patterns: /nómina|nomina|pago\s*empleados?|planilla/i,    category: "GASTO_NOMINA",      weight: 4, label: "titulo:nomina"          },
  { patterns: /retenci[oó]n|retencion|rete\s*fuente/i,       category: "IMPUESTO_RETENCION",weight: 4, label: "titulo:retencion"       },
  { patterns: /declaraci[oó]n|decl\s*iva|iva\b/i,            category: "IMPUESTO_IVA",      weight: 3, label: "titulo:iva"             },
  { patterns: /anticipo|avance\s*proveedor/i,                 category: "ANTICIPO",          weight: 4, label: "titulo:anticipo"        },
  { patterns: /extracto|estado\s*de?\s*cuenta|e\/c\b/i,       category: "BANCO",             weight: 4, label: "titulo:extracto"        },
  { patterns: /consignaci[oó]n|transfer[e\s]ncia\s*banc/i,   category: "BANCO",             weight: 3, label: "titulo:consignacion"    },
  { patterns: /devoluci[oó]n|reembolso/i,                     category: "DEVOLUCION",        weight: 3, label: "titulo:devolucion"      },
  { patterns: /factura\s*venta|fact\s*vta|fac\s*\d/i,        category: "INGRESO",           weight: 3, label: "titulo:factura_venta"   },
  { patterns: /factura\s*compra|fac\s*compra/i,               category: "PROVEEDOR",         weight: 3, label: "titulo:factura_compra"  },
  { patterns: /comprobante\s*de?\s*pago|recibo\s*de?\s*caja/i,category: "BANCO",             weight: 2, label: "titulo:comprobante_pago"},
  { patterns: /remisi[oó]n|pedido|orden\s*de?\s*compra/i,     category: "COSTO",             weight: 2, label: "titulo:remision"        },
  { patterns: /ajuste|asiento\s*contable|partida/i,           category: "AJUSTE",            weight: 2, label: "titulo:ajuste"          },
  { patterns: /gasto|expense|viáticos|viáticos|pasajes/i,    category: "GASTO_OPERATIVO",   weight: 2, label: "titulo:gasto"           },
];

/** Document.category free-text → category */
const CATEGORY_SIGNALS: Array<{
  patterns: RegExp;
  category: AccountingCategory;
  weight:   number;
  label:    string;
}> = [
  { patterns: /cfdi_ingreso|co_invoice|co_attached/i,        category: "INGRESO",           weight: 4, label: "category:ingreso"       },
  { patterns: /cfdi_egreso|co_credit|nota_cred/i,            category: "DEVOLUCION",        weight: 4, label: "category:devolucion"    },
  { patterns: /estado_cuenta|bank_stat|extracto/i,           category: "BANCO",             weight: 4, label: "category:banco"         },
  { patterns: /nomina/i,                                     category: "GASTO_NOMINA",      weight: 4, label: "category:nomina"        },
  { patterns: /retencion|withhold/i,                         category: "IMPUESTO_RETENCION",weight: 4, label: "category:retencion"     },
  { patterns: /iva|vat\b/i,                                  category: "IMPUESTO_IVA",      weight: 3, label: "category:iva"           },
  { patterns: /anticipo/i,                                   category: "ANTICIPO",          weight: 4, label: "category:anticipo"      },
  { patterns: /remision|pedido/i,                            category: "COSTO",             weight: 3, label: "category:costo"         },
];

// ── XML family → category mapping ────────────────────────────────────────────

const XML_FAMILY_MAP: Record<string, { category: AccountingCategory; weight: number; label: string }> = {
  CO_INVOICE:          { category: "INGRESO",    weight: 5, label: "xml:co_invoice"      },
  CO_ATTACHED_DOCUMENT:{ category: "INGRESO",    weight: 5, label: "xml:co_attached"     },
  CO_CREDIT_NOTE:      { category: "DEVOLUCION", weight: 5, label: "xml:co_credit_note"  },
  CO_DEBIT_NOTE:       { category: "AJUSTE",     weight: 4, label: "xml:co_debit_note"   },
  CFDI:                { category: "INGRESO",    weight: 4, label: "xml:cfdi"            },
};

/** From process-document engine: DocumentFamily → category */
const DOC_FAMILY_MAP: Record<string, { category: AccountingCategory; weight: number; label: string }> = {
  ELECTRONIC_INVOICE_STANDARD:         { category: "INGRESO",         weight: 4, label: "docfam:invoice"  },
  COMMERCIAL_DOC_REMITISION_OR_PEDIDO: { category: "COSTO",           weight: 3, label: "docfam:remision" },
  LOGISTICS_INVOICE:                   { category: "GASTO_OPERATIVO", weight: 3, label: "docfam:logistics" },
  BANK_STATEMENT:                      { category: "BANCO",           weight: 5, label: "docfam:bank"     },
};

// ── DocumentType base signals ─────────────────────────────────────────────────

const DOC_TYPE_BASE: Partial<Record<string, { category: AccountingCategory; weight: number; label: string; baseConf: number }>> = {
  BANK_STATEMENT:    { category: "BANCO",              weight: 5, label: "doctype:bank",    baseConf: 92 },
  TAX_DOCUMENT:      { category: "IMPUESTO_IVA",       weight: 4, label: "doctype:tax",     baseConf: 85 },
  ACCOUNTING_SUPPORT:{ category: "AJUSTE",             weight: 4, label: "doctype:support", baseConf: 78 },
  COMMERCIAL_DOCUMENT:{ category: "COSTO",             weight: 2, label: "doctype:commercial", baseConf: 58 },
  XML:               { category: "INGRESO",            weight: 3, label: "doctype:xml",     baseConf: 70 },
  PDF:               { category: "SIN_CLASIFICAR",     weight: 1, label: "doctype:pdf",     baseConf: 45 },
  OTHER:             { category: "SIN_CLASIFICAR",     weight: 1, label: "doctype:other",   baseConf: 35 },
};

// ── Core classifier ───────────────────────────────────────────────────────────

type RawDoc = {
  id:            string;
  title:         string;
  type:          string;
  category:      string | null;
  amount:        { toNumber(): number } | null;
  currency:      string | null;
  documentDate:  Date | null;
  issuerName:    string | null;
  issuerId:      string | null;
  receiverId:    string | null;
  receiverName:  string | null;
  extractedJson: unknown;
};

export function classifyOneDocument(doc: RawDoc): AccountingClassification {
  const votes:   CategoryVote[] = [];
  const signals: string[]       = [];
  const ej = (doc.extractedJson && typeof doc.extractedJson === "object" && !Array.isArray(doc.extractedJson))
    ? (doc.extractedJson as EJ)
    : null;

  // ── Signal 1: XML family (strongest single signal) ───────────────────────
  let xmlFamily: string | null = null;
  let baseConf = 50;
  let cufe: string | null = null;
  let ivaAmount: number | null = null;
  let invoiceNumber: string | null = null;
  let counterparty: string | null = null;
  let counterpartyNit: string | null = null;

  if (ej) {
    const xmlExt = ejObj(ej, "xmlExtraction");
    if (xmlExt && ejStr(xmlExt, "success") !== "false") {
      xmlFamily = ejStr(xmlExt, "family");
      if (xmlFamily && XML_FAMILY_MAP[xmlFamily]) {
        const m = XML_FAMILY_MAP[xmlFamily];
        votes.push(m);
        signals.push(m.label);
        baseConf = 88;
      }

      // XML fields (from extractedJson.xmlExtraction.fields)
      const fields = ejObj(xmlExt, "fields");
      if (fields) {
        cufe         = ejStr(fields, "cufe");
        ivaAmount    = ejNum(fields, "taxAmount");
        invoiceNumber = ejStr(fields, "invoiceNumber");
        counterparty    = ejStr(fields, "customerName") ?? ejStr(fields, "issuerName");
        counterpartyNit = ejStr(fields, "customerId")   ?? ejStr(fields, "issuerId");
        if (cufe)      signals.push("xml:cufe_presente");
        if (ivaAmount) signals.push("xml:iva_detectado");
      }
    }

    // ── Signal 2: documentClassification.family ──────────────────────────
    const dcl = ejObj(ej, "documentClassification");
    if (dcl) {
      const family = ejStr(dcl, "family");
      const conf   = ejStr(dcl, "confidence") as "HIGH" | "MEDIUM" | "LOW" | null;
      if (family && DOC_FAMILY_MAP[family]) {
        const m = DOC_FAMILY_MAP[family];
        votes.push(m);
        signals.push(m.label);
        if (!xmlFamily) {
          baseConf = conf === "HIGH" ? 80 : conf === "MEDIUM" ? 68 : 48;
        }
      }
    }
  }

  // ── Signal 3: DocumentType ────────────────────────────────────────────────
  const typeBase = DOC_TYPE_BASE[doc.type];
  if (typeBase) {
    votes.push({ category: typeBase.category, weight: typeBase.weight, label: typeBase.label });
    signals.push(typeBase.label);
    if (!xmlFamily && baseConf < typeBase.baseConf) baseConf = typeBase.baseConf;
  }

  // ── Signal 4: category field ──────────────────────────────────────────────
  if (doc.category) {
    for (const s of CATEGORY_SIGNALS) {
      if (s.patterns.test(doc.category)) {
        votes.push(s);
        signals.push(s.label);
        break; // one category match is enough
      }
    }
  }

  // ── Signal 5: title keywords ──────────────────────────────────────────────
  for (const s of TITLE_SIGNALS) {
    if (s.patterns.test(doc.title)) {
      votes.push(s);
      signals.push(s.label);
    }
  }

  // ── Signal 6: amount sign ─────────────────────────────────────────────────
  const amount = doc.amount?.toNumber() ?? null;
  if (amount !== null && amount < 0) {
    votes.push({ category: "DEVOLUCION", weight: 3, label: "amount:negativo" });
    signals.push("amount:negativo");
  }

  // ── Determine winning category ────────────────────────────────────────────
  const tally: Partial<Record<AccountingCategory, number>> = {};
  for (const v of votes) {
    tally[v.category] = (tally[v.category] ?? 0) + v.weight;
  }

  let winCategory: AccountingCategory = "SIN_CLASIFICAR";
  let winWeight = 0;
  for (const [cat, w] of Object.entries(tally) as [AccountingCategory, number][]) {
    if (w > winWeight) { winWeight = w; winCategory = cat; }
  }

  // ── Confidence scoring ────────────────────────────────────────────────────
  let confidence = baseConf;

  const validationStatus = ej ? ejStr(ej, "validationStatus") : null;
  if (validationStatus === "VALID")           confidence += 8;
  if (validationStatus === "INCOMPLETE")      confidence -= 10;
  if (validationStatus === "REVIEW_REQUIRED") confidence -= 5;

  if (cufe)      confidence += 5;
  if (ivaAmount) confidence += 5;

  // Penalise competing categories
  const competingCategories = Object.keys(tally).length;
  if (competingCategories >= 3) confidence -= 15;
  else if (competingCategories === 2) confidence -= 5;

  // Cap and floor
  confidence = Math.max(10, Math.min(98, confidence));

  // ── Fallbacks for counterparty / invoiceNumber ────────────────────────────
  if (!invoiceNumber) {
    // Try to extract from title (e.g. "FAC-2026-001")
    const m = doc.title.match(/(?:FAC|NC|ND|FE|FV|FP|FT)[\s\-]?[\w\-]+/i);
    if (m) invoiceNumber = m[0].trim();
  }
  if (!counterparty)    counterparty    = doc.issuerName ?? doc.receiverName ?? null;
  if (!counterpartyNit) counterpartyNit = doc.issuerId   ?? doc.receiverId   ?? null;

  // ── Tax profile ───────────────────────────────────────────────────────────
  const hasIva      = !!(ivaAmount && ivaAmount > 0);
  const hasRetencion = signals.some((s) => s.includes("retencion"));
  const isExempt    = !hasIva && winCategory === "INGRESO" && confidence > 70;

  let estimatedRate: number | null = null;
  if (hasIva && ivaAmount && amount) {
    const r = (ivaAmount / Math.abs(amount)) * 100;
    if (r >= 18 && r <= 20)      estimatedRate = 19;
    else if (r >= 4 && r <= 6)   estimatedRate = 5;
    else                         estimatedRate = 0;
  }

  const taxProfile: TaxProfile = {
    hasIva, ivaAmount, estimatedRate, hasRetencion, isExempt, cufe,
  };

  // ── Review flag ───────────────────────────────────────────────────────────
  const account = CHART_OF_ACCOUNTS[winCategory];
  const lowConf = confidence < REQUIRE_REVIEW_THRESHOLD;
  const taxAndUncertain = account.taxSensitive && confidence < AUTO_APPROVE_THRESHOLD;
  const isImpuesto = winCategory === "IMPUESTO_IVA" || winCategory === "IMPUESTO_RETENCION";
  const isNomina   = winCategory === "GASTO_NOMINA";
  const bigAmount  = amount !== null && Math.abs(amount) > 50_000_000; // > 50M COP

  const requiresReview = lowConf || taxAndUncertain || isImpuesto || isNomina || bigAmount;

  let reviewReason: string | null = null;
  if (lowConf)           reviewReason = `Confianza baja (${confidence}%)`;
  else if (isImpuesto)   reviewReason = "Cuenta de impuesto — siempre requiere revisión";
  else if (isNomina)     reviewReason = "Nómina — requiere validación RRHH";
  else if (taxAndUncertain) reviewReason = "Cuenta fiscal con confianza < 75%";
  else if (bigAmount)    reviewReason = "Monto superior a $50M — revisión obligatoria";

  // ── Confidence reason ─────────────────────────────────────────────────────
  const topSignal = votes.reduce<CategoryVote | null>(
    (best, v) => v.category === winCategory && (!best || v.weight > best.weight) ? v : best,
    null,
  );
  const confidenceReason = topSignal
    ? `Señal principal: ${topSignal.label} (peso ${topSignal.weight})`
    : "Sin señales claras";

  return {
    documentId:         doc.id,
    documentTitle:      doc.title,
    documentType:       doc.type,
    amount,
    currency:           doc.currency,
    documentDate:       doc.documentDate,
    accountingCategory: winCategory,
    suggestedAccount:   account,
    taxProfile,
    counterparty,
    counterpartyNit,
    invoiceNumber,
    costCenter:         null, // Phase 2 — map from branch/channel data
    branch:             null, // Phase 2 — from SaleRecord or SAG connector
    channel:            null, // Phase 2 — from SaleRecord
    confidenceScore:    Math.round(confidence),
    confidenceReason,
    requiresReview,
    reviewReason,
    signals,
    xmlFamily,
  };
}

// ── Batch query & classify ────────────────────────────────────────────────────

export async function getAccountingClassifications(
  organizationId: string,
): Promise<ClassificationBatch> {
  const docs = await prisma.document.findMany({
    where: {
      organizationId,
      deletedAt: null,
      type: { in: ["XML", "PDF", "BANK_STATEMENT", "TAX_DOCUMENT", "ACCOUNTING_SUPPORT", "COMMERCIAL_DOCUMENT"] },
      status: { in: ["PENDING", "PROCESSED", "REVIEWED"] },
    },
    orderBy: { documentDate: "desc" },
    take:    100,
    select: {
      id:            true,
      title:         true,
      type:          true,
      category:      true,
      amount:        true,
      currency:      true,
      documentDate:  true,
      issuerName:    true,
      issuerId:      true,
      receiverId:    true,
      receiverName:  true,
      extractedJson: true,
    },
  }) as RawDoc[];

  if (docs.length === 0) {
    return {
      total: 0, autoApproved: 0, requiresReview: 0,
      taxSensitive: 0, byCategory: {}, items: [], hasData: false,
    };
  }

  const items = docs.map(classifyOneDocument);

  // Sort: requiresReview first, then by confidence ascending (most uncertain first)
  items.sort((a, b) => {
    if (a.requiresReview !== b.requiresReview) return a.requiresReview ? -1 : 1;
    return a.confidenceScore - b.confidenceScore;
  });

  const byCategory: Partial<Record<AccountingCategory, number>> = {};
  for (const item of items) {
    byCategory[item.accountingCategory] = (byCategory[item.accountingCategory] ?? 0) + 1;
  }

  return {
    total:          items.length,
    autoApproved:   items.filter((i) => !i.requiresReview && i.confidenceScore >= AUTO_APPROVE_THRESHOLD).length,
    requiresReview: items.filter((i) => i.requiresReview).length,
    taxSensitive:   items.filter((i) => i.suggestedAccount.taxSensitive).length,
    byCategory,
    items,
    hasData: true,
  };
}
