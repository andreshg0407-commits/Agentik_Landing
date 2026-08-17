/**
 * lib/comercial/clientes/clientes-pure.ts
 *
 * Pure functions extracted from client-loader.ts and cliente-360-loader.ts.
 * NO server-only, NO Prisma, NO infrastructure dependencies.
 *
 * Production code and tests import from this same file.
 */

import { resolveCanonicalDocumentKind, resolveCollectionTarget, isDocumentCreditNote } from "./document-source-profiles";
import type { CollectionTarget } from "./document-source-profiles";

// ── Types ────────────────────────────────────────────────────────────────────

export type ClienteCarteraState = "HAS_OPEN_AR" | "CERTIFIED_ZERO" | "CERTIFIED_CREDIT_BALANCE" | "UNVERIFIED";

export type ArDataState = "CERTIFIED" | "UNVERIFIED" | "UNAVAILABLE";

/** Minimal AR context shape needed by pure functions */
export interface ArContextCore {
  dataState: ArDataState;
  arLookup: Map<number, { clienteId: number; totalPendiente: number; totalVencido: number; creditBalance: number; netReceivable: number }>;
}

// ── resolveRowCartera ────────────────────────────────────────────────────────

export function resolveRowCartera(
  arCtx: ArContextCore,
  sagTerceroId: number | null | undefined,
): { totalReceivable: number | null; overdueReceivable: number | null; carteraState: ClienteCarteraState } {
  if (arCtx.dataState !== "CERTIFIED") {
    return { totalReceivable: null, overdueReceivable: null, carteraState: "UNVERIFIED" };
  }

  if (sagTerceroId == null || sagTerceroId <= 0) {
    return { totalReceivable: null, overdueReceivable: null, carteraState: "UNVERIFIED" };
  }

  const arSnap = arCtx.arLookup.get(sagTerceroId);
  if (arSnap) {
    if (arSnap.netReceivable > 0) {
      return {
        totalReceivable: arSnap.netReceivable,
        overdueReceivable: arSnap.totalVencido,
        carteraState: "HAS_OPEN_AR",
      };
    }
    if (arSnap.netReceivable < 0) {
      // Net credit balance — credits exceed gross receivables
      return {
        totalReceivable: arSnap.netReceivable,
        overdueReceivable: 0,
        carteraState: "CERTIFIED_CREDIT_BALANCE",
      };
    }
    // netReceivable === 0 — gross and credits cancel out, or no balance
    return { totalReceivable: 0, overdueReceivable: 0, carteraState: "CERTIFIED_ZERO" };
  }

  // Customer exists in SAG but not in cartera → CERTIFIED_ZERO
  return { totalReceivable: 0, overdueReceivable: 0, carteraState: "CERTIFIED_ZERO" };
}

// ── classifyAgingBand ────────────────────────────────────────────────────────

export function classifyAgingBand(diasMora: number | null): string | null {
  if (diasMora === null) return null;  // unknown mora — do NOT classify as CURRENT
  if (diasMora <= 0) return "CURRENT";
  if (diasMora <= 30) return "1-30";
  if (diasMora <= 60) return "31-60";
  if (diasMora <= 90) return "61-90";
  if (diasMora <= 180) return "91-180";
  if (diasMora <= 365) return "181-365";
  return "365+";
}

// ── mapCertifiedDocToReceivable ──────────────────────────────────────────────

export interface CertifiedDocInput {
  documento: string;
  tipoDocumento: string;
  valorDocumento: number;
  saldoPendiente: number;
  diasMora: number | null;
  fechaDocumento: Date;
  fechaVencimiento: Date | null;
}

export interface ReceivableOutput {
  id: string;
  erpId: string | null;
  /** Document type label for display (e.g. "Factura F2", "Nota crédito D2") */
  documentType: string;
  originalAmount: number;
  /** Paid amount from vw_agentik_recaudos evidence. Null when no recaudos data available */
  paidAmount: number | null;
  balanceDue: number;
  invoiceDate: string | null;
  dueDate: string | null;
  daysOverdue: number | null;
  agingBucket: string | null;
  status: string;
}

/**
 * Classifies tipoDocumento from SAG into a display label.
 *
 * Delegates to resolveCanonicalDocumentKind with the specified source profile.
 * profileId is MANDATORY — no default. Callers must resolve it server-side
 * via resolveOrgSourceProfileId(orgSlug).
 *
 * FUENTES contract enforced per-tenant via document-source-profiles.ts.
 */
export function classifyDocumentType(tipoDocumento: string, documento: string, profileId: string): string {
  const result = resolveCanonicalDocumentKind(profileId, { documento, tipoDocumento });
  return result.label;
}

/**
 * Map a SAG certified document to a ReceivableOutput.
 * sourceProfileId is MANDATORY — resolved server-side via resolveOrgSourceProfileId().
 */
export function mapCertifiedDocToReceivable(doc: CertifiedDocInput, sourceProfileId: string): ReceivableOutput {
  return {
    id: `sag-${doc.documento}`,
    erpId: doc.documento,
    documentType: classifyDocumentType(doc.tipoDocumento, doc.documento, sourceProfileId),
    originalAmount: doc.valorDocumento,
    paidAmount: null,  // NEVER infer by difference — must come from vw_agentik_recaudos
    balanceDue: doc.saldoPendiente,
    invoiceDate: doc.fechaDocumento.toISOString(),
    dueDate: doc.fechaVencimiento?.toISOString() ?? null,
    daysOverdue: doc.diasMora,  // preserve null — do NOT coerce to 0
    agingBucket: classifyAgingBand(doc.diasMora),
    status: doc.saldoPendiente < 0 ? "CREDIT"
      : doc.saldoPendiente === 0 ? "CLOSED"
      : (doc.diasMora !== null && doc.diasMora > 0) ? "OVERDUE"
      : "OPEN",
  };
}

// ── Aging completeness ───────────────────────────────────────────────────────

export type AgingCompleteness = "COMPLETE" | "PARTIAL" | "UNVERIFIED";

export interface AgingItem {
  daysOverdue: number | null;
  dueDate: string | null;
  balanceDue: number;
}

/**
 * An item has verified aging only when BOTH daysOverdue is non-null AND dueDate is present.
 * DIAS_MORA=0 with dueDate=null is NOT verified — SAG may not have computed mora.
 */
export function isAgingVerified(item: AgingItem): boolean {
  return item.daysOverdue != null && item.dueDate != null;
}

/**
 * Compute aging completeness from open (positive-balance) items.
 */
export function computeAgingCompleteness(items: AgingItem[]): AgingCompleteness {
  const openItems = items.filter(i => i.balanceDue > 0);
  if (openItems.length === 0) return "COMPLETE"; // no open items → nothing to verify
  const verifiedCount = openItems.filter(isAgingVerified).length;
  if (verifiedCount === openItems.length) return "COMPLETE";
  if (verifiedCount > 0) return "PARTIAL";
  return "UNVERIFIED";
}

/**
 * Resolve overdue balance for display.
 * When aging is not COMPLETE, overdue cannot be certified as 0 → return null.
 */
export function resolveOverdueDisplay(
  totalVencido: number,
  agingCompleteness: AgingCompleteness,
): number | null {
  if (agingCompleteness !== "COMPLETE") return null;
  return totalVencido;
}

// ── Collection linkage ───────────────────────────────────────────────────────

export type CollectionLinkageState =
  | "APPLIED_TO_CURRENT_DOCUMENTS"
  | "CUSTOMER_HISTORY_ONLY"
  | "UNVERIFIED";

export interface CollectionContext {
  /** Human-readable label for the collection window */
  collectionWindowLabel: string;
  /** ISO timestamp when recaudos were fetched */
  collectionAsOf: string | null;
  /** Linkage state */
  collectionLinkageState: CollectionLinkageState;
}

/**
 * Determine collection linkage state from recaudos data.
 * If any recaudo.documentoRelacionado matches an open AR document, state=APPLIED.
 * Otherwise → CUSTOMER_HISTORY_ONLY.
 */
export function resolveCollectionContext(
  recaudosOk: boolean,
  recaudosAsOf: Date | null,
  recaudoDocuments: string[],
  openArDocuments: string[],
): CollectionContext {
  if (!recaudosOk || !recaudosAsOf) {
    return {
      collectionWindowLabel: "\u2014",
      collectionAsOf: null,
      collectionLinkageState: "UNVERIFIED",
    };
  }

  const openArSet = new Set(openArDocuments);
  const hasLinkedDocs = recaudoDocuments.some(d => openArSet.has(d));

  return {
    collectionWindowLabel: "Recaudos históricos",
    collectionAsOf: recaudosAsOf.toISOString(),
    collectionLinkageState: hasLinkedDocs
      ? "APPLIED_TO_CURRENT_DOCUMENTS"
      : "CUSTOMER_HISTORY_ONLY",
  };
}

// ── NC display status ────────────────────────────────────────────────────────

/**
 * Resolve display status for a credit note (CREDIT status).
 * If the NC's documentoRelacionado links to an open AR document, it's "NC aplicada".
 * Otherwise it's "Saldo a favor".
 *
 * For non-CREDIT items, returns the standard status label.
 */
export function resolveReceivableDisplayStatus(
  status: string,
  isLinkedToOpenAr: boolean,
): string {
  if (status === "CREDIT") {
    return isLinkedToOpenAr ? "NC aplicada" : "Saldo a favor";
  }
  return status;
}

// ── Header KPI source metadata ───────────────────────────────────────────────

export type KpiTruthState =
  | "CERTIFIED"          // query succeeded, records found
  | "EMPTY_CERTIFIED"    // query succeeded, zero records confirmed
  | "SOURCE_DOWN"        // query failed / timeout
  | "IDENTITY_MISSING"   // customer has no SAG identity
  | "PENDING_VALIDATION"; // state cannot be determined

export interface KpiSourceMeta {
  count: number | null;
  source: string;
  sourceAsOf: string | null;
  windowLabel: string;
  truthState: KpiTruthState;
  reason: string;
}

/** Display text for a KPI based on its truth state */
export function kpiDisplayValue(meta: KpiSourceMeta): string {
  switch (meta.truthState) {
    case "CERTIFIED":       return String(meta.count);
    case "EMPTY_CERTIFIED": return "0";
    case "SOURCE_DOWN":     return "No disponible";
    case "IDENTITY_MISSING": return "Cliente no vinculado con SAG";
    case "PENDING_VALIDATION": return "Pendiente de validación";
  }
}

/**
 * Resolve SAG orders KPI metadata.
 * sagTerceroId is the canonical join key — NOT NIT.
 */
export function resolveSagOrdersKpi(
  sagTerceroId: number | null,
  querySucceeded: boolean,
  orderCount: number,
  queryAsOf: Date | null,
): KpiSourceMeta {
  if (sagTerceroId == null || sagTerceroId <= 0) {
    return {
      count: null, source: "CustomerOrderRecord", sourceAsOf: null,
      windowLabel: "\u2014", truthState: "IDENTITY_MISSING",
      reason: "Cliente sin sagTerceroId — no se puede consultar pedidos SAG",
    };
  }
  if (!querySucceeded) {
    return {
      count: null, source: "CustomerOrderRecord", sourceAsOf: null,
      windowLabel: "\u2014", truthState: "SOURCE_DOWN",
      reason: "Consulta de pedidos SAG fallida",
    };
  }
  if (orderCount === 0) {
    return {
      count: 0, source: "CustomerOrderRecord", sourceAsOf: queryAsOf?.toISOString() ?? null,
      windowLabel: "Sin pedidos SAG", truthState: "EMPTY_CERTIFIED",
      reason: `Consulta exitosa para sagTerceroId=${sagTerceroId} — 0 registros`,
    };
  }
  return {
    count: orderCount, source: "CustomerOrderRecord", sourceAsOf: queryAsOf?.toISOString() ?? null,
    windowLabel: `${orderCount} pedido${orderCount !== 1 ? "s" : ""} SAG`,
    truthState: "CERTIFIED",
    reason: `${orderCount} pedidos encontrados para sagTerceroId=${sagTerceroId}`,
  };
}

/**
 * Resolve invoice KPI metadata.
 * Only counts SALES_INVOICE canonical kind from sales history.
 */
export function resolveInvoiceKpi(
  nit: string | null,
  querySucceeded: boolean,
  invoiceCount: number,
  totalSalesCount: number,
  excludedKinds: string[],
  queryAsOf: Date | null,
): KpiSourceMeta {
  if (!nit) {
    return {
      count: null, source: "SaleRecord", sourceAsOf: null,
      windowLabel: "\u2014", truthState: "IDENTITY_MISSING",
      reason: "Cliente sin NIT — no se puede consultar historial de ventas",
    };
  }
  if (!querySucceeded) {
    return {
      count: null, source: "SaleRecord", sourceAsOf: null,
      windowLabel: "\u2014", truthState: "SOURCE_DOWN",
      reason: "Consulta de historial de ventas fallida",
    };
  }
  if (invoiceCount === 0 && totalSalesCount === 0) {
    return {
      count: 0, source: "SaleRecord", sourceAsOf: queryAsOf?.toISOString() ?? null,
      windowLabel: "Facturación no disponible", truthState: "EMPTY_CERTIFIED",
      reason: `Consulta exitosa — 0 registros de venta para NIT ${nit}`,
    };
  }
  const excluded = excludedKinds.length > 0
    ? ` (excluidos: ${excludedKinds.join(", ")})`
    : "";
  return {
    count: invoiceCount, source: "SaleRecord", sourceAsOf: queryAsOf?.toISOString() ?? null,
    windowLabel: invoiceCount === 0
      ? "Facturación no disponible"
      : `${invoiceCount} factura${invoiceCount !== 1 ? "s" : ""}`,
    truthState: invoiceCount > 0 ? "CERTIFIED" : "EMPTY_CERTIFIED",
    reason: `${invoiceCount} facturas de ${totalSalesCount} registros${excluded}`,
  };
}

// ── Sales history F1/F2 separation ───────────────────────────────────────────

export type SalesHistoryTruthState =
  | "CERTIFIED"
  | "EMPTY_CERTIFIED"
  | "SOURCE_DOWN"
  | "IDENTITY_MISSING"
  | "PROFILE_MISSING"
  | "PARTIAL"
  | "UNVERIFIED";

export interface ClassifiedSaleItem {
  id: string;
  canonicalKind: string; // CanonicalDocumentKind
  rawSourceCode: string | null;
  rawDocumentNumber: string | null;
  issueDate: string | null;
  seller: string | null;
  grossAmount: number;
  productLine: string | null;
  sourceProfileId: string;
}

export interface SalesHistoryResult {
  truthState: SalesHistoryTruthState;
  reason: string;
  source: string;
  sourceAsOf: string | null;
  windowLabel: string;
  officialInvoices: ClassifiedSaleItem[];
  remissions: ClassifiedSaleItem[];
  creditNotes: ClassifiedSaleItem[];
  unclassifiedDocuments: ClassifiedSaleItem[];
  /** Excluded kinds (receipts, advances) — not in any section */
  excludedCount: number;
  /** Summary KPIs */
  officialGross: number;
  officialCreditTotal: number;
  officialNet: number;
  remissionGross: number;
  remissionCreditTotal: number;
  remissionNet: number;
  lastSaleDate: string | null;
  lastSaleKind: string | null;
}

/** Profile-specific section labels */
export interface SalesProfileLabels {
  invoiceLabel: string;
  remissionLabel: string;
  profileName: string;
}

export function getDefaultSalesProfileLabels(): SalesProfileLabels {
  return {
    invoiceLabel: "Facturación oficial",
    remissionLabel: "Remisiones",
    profileName: "Desconocido",
  };
}

/**
 * Classify sales items by canonical document kind and compute summaries.
 */
export function classifySalesHistory(
  items: ClassifiedSaleItem[],
  querySucceeded: boolean,
  hasSagIdentity: boolean,
  hasProfile: boolean,
  queryAsOf: Date | null,
): SalesHistoryResult {
  const base = {
    source: "SaleRecord (vw_agentik_ventas)",
    sourceAsOf: queryAsOf?.toISOString() ?? null,
  };

  if (!hasSagIdentity) {
    return {
      ...base, truthState: "IDENTITY_MISSING",
      reason: "Cliente sin identidad SAG — no se puede consultar historial de ventas",
      windowLabel: "\u2014",
      officialInvoices: [], remissions: [], creditNotes: [], unclassifiedDocuments: [],
      excludedCount: 0,
      officialGross: 0, officialCreditTotal: 0, officialNet: 0,
      remissionGross: 0, remissionCreditTotal: 0, remissionNet: 0,
      lastSaleDate: null, lastSaleKind: null,
    };
  }

  if (!querySucceeded) {
    return {
      ...base, truthState: "SOURCE_DOWN",
      reason: "Consulta de historial de ventas fallida",
      windowLabel: "\u2014",
      officialInvoices: [], remissions: [], creditNotes: [], unclassifiedDocuments: [],
      excludedCount: 0,
      officialGross: 0, officialCreditTotal: 0, officialNet: 0,
      remissionGross: 0, remissionCreditTotal: 0, remissionNet: 0,
      lastSaleDate: null, lastSaleKind: null,
    };
  }

  if (!hasProfile) {
    return {
      ...base, truthState: "PROFILE_MISSING",
      reason: "Perfil de clasificación documental no configurado para esta organización",
      windowLabel: "Clasificación no disponible",
      officialInvoices: [], remissions: [], creditNotes: [], unclassifiedDocuments: items,
      excludedCount: 0,
      officialGross: 0, officialCreditTotal: 0, officialNet: 0,
      remissionGross: 0, remissionCreditTotal: 0, remissionNet: 0,
      lastSaleDate: null, lastSaleKind: null,
    };
  }

  const officialInvoices: ClassifiedSaleItem[] = [];
  const remissions: ClassifiedSaleItem[] = [];
  const creditNotes: ClassifiedSaleItem[] = [];
  const unclassifiedDocuments: ClassifiedSaleItem[] = [];
  let excludedCount = 0;

  for (const item of items) {
    switch (item.canonicalKind) {
      case "SALES_INVOICE":    officialInvoices.push(item); break;
      case "SALES_REMISSION":  remissions.push(item); break;
      case "SALES_CREDIT_NOTE": creditNotes.push(item); break;
      case "CUSTOMER_RECEIPT":
      case "CUSTOMER_ADVANCE": excludedCount++; break;
      default:                 unclassifiedDocuments.push(item); break;
    }
  }

  const officialGross = officialInvoices.reduce((s, i) => s + i.grossAmount, 0);
  const remissionGross = remissions.reduce((s, i) => s + i.grossAmount, 0);
  // Credit notes reduce the world they belong to — for now attribute all to gross
  const officialCreditTotal = creditNotes
    .filter(cn => isOfficialCreditNote(cn.rawSourceCode))
    .reduce((s, cn) => s + Math.abs(cn.grossAmount), 0);
  const remissionCreditTotal = creditNotes
    .filter(cn => !isOfficialCreditNote(cn.rawSourceCode))
    .reduce((s, cn) => s + Math.abs(cn.grossAmount), 0);
  const officialNet = officialGross - officialCreditTotal;
  const remissionNet = remissionGross - remissionCreditTotal;

  // Last sale: most recent invoice or remission
  const salesDates = [...officialInvoices, ...remissions]
    .filter(i => i.issueDate)
    .sort((a, b) => new Date(b.issueDate!).getTime() - new Date(a.issueDate!).getTime());
  const lastSale = salesDates[0] ?? null;

  const total = officialInvoices.length + remissions.length;
  const truthState: SalesHistoryTruthState = total === 0 && creditNotes.length === 0
    ? "EMPTY_CERTIFIED" : "CERTIFIED";

  return {
    ...base, truthState,
    reason: `${officialInvoices.length} facturas, ${remissions.length} remisiones, ${creditNotes.length} NC, ${excludedCount} excluidos`,
    windowLabel: total > 0 ? "Histórico disponible" : "Sin ventas registradas",
    officialInvoices, remissions, creditNotes, unclassifiedDocuments, excludedCount,
    officialGross, officialCreditTotal, officialNet,
    remissionGross, remissionCreditTotal, remissionNet,
    lastSaleDate: lastSale?.issueDate ?? null,
    lastSaleKind: lastSale ? (lastSale.canonicalKind === "SALES_INVOICE" ? "Factura" : "Remisión") : null,
  };
}

/**
 * Determine if a credit note belongs to official invoicing or remissions.
 * Official NC codes: NE, NC, ND, NF, NS, NT, NG, NA, NW, NX, D1, D3
 * Remission NC codes: D2, 2D, 3D, 4D, 5D, 6D
 * This is a Castillitos-specific heuristic — should be profile-driven in future.
 */
function isOfficialCreditNote(rawSourceCode: string | null): boolean {
  if (!rawSourceCode) return true; // default to official if unknown
  const prefix = rawSourceCode.slice(0, 2).toUpperCase();
  // D2 and xD (2D-6D) are remission credit notes
  if (prefix === "D2" || /^[2-6]D$/.test(prefix)) return false;
  return true;
}

// ── Customer collections (recaudos) ──────────────────────────────────────────

export type CollectionsTruthState =
  | "CERTIFIED"
  | "EMPTY_CERTIFIED"
  | "SOURCE_DOWN"
  | "IDENTITY_MISSING"
  | "PROFILE_UNRESOLVED";

export type RecaudoLinkageState =
  | "APPLIED"
  | "PARTIALLY_LINKED"
  | "HISTORY_ONLY"
  | "UNVERIFIED";

export interface CustomerCollectionItem {
  id: string;
  date: string | null;
  receiptNumber: string;
  rawSourceCode: string;
  amount: number;
  appliedToDocument: string | null;
  collectionTarget: CollectionTarget;
  linkageLabel: string;
}

export interface CollectionBucket {
  amount: number;
  count: number;
}

export interface CustomerCollectionsResult {
  truthState: CollectionsTruthState;
  source: "vw_agentik_recaudos";
  asOf: string | null;
  windowLabel: string | null;
  linkageState: RecaudoLinkageState;
  totalCollected: number | null;
  receiptCount: number | null;
  officialInvoiceCollections: CollectionBucket | null;
  remissionCollections: CollectionBucket | null;
  advances: CollectionBucket | null;
  unclassified: CollectionBucket | null;
  latestCollectionAt: string | null;
  items: CustomerCollectionItem[];
  totalItems: number;
  reason: string;
}

/**
 * Classify collection applications from vw_agentik_recaudos into the
 * CustomerCollectionsResult contract.
 *
 * Each application from CertifiedCollectionApplication is mapped to:
 * - A CollectionTarget based on the receipt document prefix via the profile
 * - A linkage label based on DOCUMENTO_RELACIONADO presence
 *
 * Credit notes (SALES_CREDIT_NOTE by canonical kind) are EXCLUDED from
 * collections — they belong in the sales domain.
 */
export function classifyCollections(
  applications: Array<{
    idRecaudo: number;
    fechaRecaudo: Date;
    documentoRelacionado: string;
    valorRecaudado: number;
    montoNoAplicado: number;
    banco: string;
  }>,
  querySucceeded: boolean,
  hasSagIdentity: boolean,
  sourceProfileId: string | null,
  queryAsOf: Date | null,
): CustomerCollectionsResult {
  const base = {
    source: "vw_agentik_recaudos" as const,
    asOf: queryAsOf?.toISOString() ?? null,
  };

  if (!hasSagIdentity) {
    return {
      ...base, truthState: "IDENTITY_MISSING",
      windowLabel: null,
      linkageState: "UNVERIFIED",
      totalCollected: null, receiptCount: null,
      officialInvoiceCollections: null, remissionCollections: null,
      advances: null, unclassified: null,
      latestCollectionAt: null, items: [], totalItems: 0,
      reason: "Cliente sin identidad SAG — no se puede consultar recaudos",
    };
  }

  if (!querySucceeded) {
    return {
      ...base, truthState: "SOURCE_DOWN",
      windowLabel: null,
      linkageState: "UNVERIFIED",
      totalCollected: null, receiptCount: null,
      officialInvoiceCollections: null, remissionCollections: null,
      advances: null, unclassified: null,
      latestCollectionAt: null, items: [], totalItems: 0,
      reason: "Consulta de recaudos fallida",
    };
  }

  if (!sourceProfileId) {
    return {
      ...base, truthState: "PROFILE_UNRESOLVED",
      windowLabel: null,
      linkageState: "UNVERIFIED",
      totalCollected: null, receiptCount: null,
      officialInvoiceCollections: null, remissionCollections: null,
      advances: null, unclassified: null,
      latestCollectionAt: null, items: [], totalItems: 0,
      reason: "Perfil documental no configurado para esta organización",
    };
  }

  // Filter out credit notes — they belong in sales, not collections
  const validApps = applications.filter(a => {
    // If the document prefix resolves to SALES_CREDIT_NOTE, exclude it
    if (a.documentoRelacionado) {
      if (isDocumentCreditNote(sourceProfileId, a.documentoRelacionado)) return false;
    }
    // Only include positive values (actual payments)
    return a.valorRecaudado > 0;
  });

  if (validApps.length === 0) {
    return {
      ...base, truthState: "EMPTY_CERTIFIED",
      windowLabel: "Sin recaudos registrados",
      linkageState: "HISTORY_ONLY",
      totalCollected: 0, receiptCount: 0,
      officialInvoiceCollections: { amount: 0, count: 0 },
      remissionCollections: { amount: 0, count: 0 },
      advances: { amount: 0, count: 0 },
      unclassified: { amount: 0, count: 0 },
      latestCollectionAt: null, items: [], totalItems: 0,
      reason: "0 recaudos, 0 anticipos",
    };
  }

  const officialBucket: CollectionBucket = { amount: 0, count: 0 };
  const remissionBucket: CollectionBucket = { amount: 0, count: 0 };
  const advanceBucket: CollectionBucket = { amount: 0, count: 0 };
  const unclassifiedBucket: CollectionBucket = { amount: 0, count: 0 };

  let totalCollected = 0;
  let latestDate: Date | null = null;
  let linkedCount = 0;

  const items: CustomerCollectionItem[] = validApps.map((a, i) => {
    const docRef = a.documentoRelacionado || "";
    const receiptPrefix = docRef.slice(0, 2).toUpperCase();

    // Resolve collection target from profile
    const target = resolveCollectionTarget(sourceProfileId, receiptPrefix) ?? "UNCLASSIFIED";

    // Determine linkage
    const hasDocLink = docRef.length > 0;
    if (hasDocLink) linkedCount++;
    const linkageLabel = hasDocLink
      ? `Aplicado a ${docRef}`
      : "Sin vínculo documental certificado";

    totalCollected += a.valorRecaudado;

    // Bucket assignment
    switch (target) {
      case "OFFICIAL_INVOICE":
        officialBucket.amount += a.valorRecaudado;
        officialBucket.count++;
        break;
      case "REMISSION":
        remissionBucket.amount += a.valorRecaudado;
        remissionBucket.count++;
        break;
      case "CUSTOMER_ADVANCE":
        advanceBucket.amount += a.valorRecaudado;
        advanceBucket.count++;
        break;
      default:
        unclassifiedBucket.amount += a.valorRecaudado;
        unclassifiedBucket.count++;
        break;
    }

    if (!latestDate || a.fechaRecaudo > latestDate) {
      latestDate = a.fechaRecaudo;
    }

    return {
      id: `rec-${a.idRecaudo}-${i}`,
      date: a.fechaRecaudo.toISOString(),
      receiptNumber: `${a.idRecaudo}`,
      rawSourceCode: receiptPrefix || "\u2014",
      amount: a.valorRecaudado,
      appliedToDocument: hasDocLink ? docRef : null,
      collectionTarget: target,
      linkageLabel,
    };
  });

  // Determine linkage state
  let linkageState: RecaudoLinkageState;
  if (linkedCount === items.length && linkedCount > 0) {
    linkageState = "APPLIED";
  } else if (linkedCount > 0) {
    linkageState = "PARTIALLY_LINKED";
  } else {
    linkageState = "HISTORY_ONLY";
  }

  // Distinct receipt IDs for count
  const distinctReceipts = new Set(validApps.map(a => a.idRecaudo));

  return {
    ...base,
    truthState: "CERTIFIED",
    windowLabel: `${distinctReceipts.size} recibos / ${items.length} aplicaciones`,
    linkageState,
    totalCollected,
    receiptCount: distinctReceipts.size,
    officialInvoiceCollections: officialBucket,
    remissionCollections: remissionBucket,
    advances: advanceBucket,
    unclassified: unclassifiedBucket,
    latestCollectionAt: latestDate ? (latestDate as Date).toISOString() : null,
    items,
    totalItems: items.length,
    reason: `${officialBucket.count} facturación, ${remissionBucket.count} remisiones, ${advanceBucket.count} anticipos, ${unclassifiedBucket.count} sin clasificar`,
  };
}

// ── carteraTrafficLight ──────────────────────────────────────────────────────

export interface CarteraTrafficLightInput {
  truthStatus: string;
  totalBalance: number | null;
  items: AgingItem[];
}

export function carteraTrafficLight(receivables: CarteraTrafficLightInput): { label: string; color: string } {
  // UNVERIFIED — cannot assess health
  if (receivables.truthStatus !== "CERTIFIED") {
    return { label: "No verificada", color: "inkGhost" };
  }
  // CERTIFIED but totalBalance=null → data inconsistency, treat as unverified
  if (receivables.totalBalance === null) {
    return { label: "Dato inconsistente", color: "inkGhost" };
  }
  // CERTIFIED_ZERO — genuinely no cartera ($0 confirmed by SAG)
  if (receivables.totalBalance === 0) {
    return { label: "Sin cartera", color: "inkGhost" };
  }
  // Credit balance — customer has saldo a favor, not open receivables
  if (receivables.totalBalance < 0) {
    return { label: "Saldo a favor", color: "inkMid" };
  }
  // HAS_OPEN_AR — assess overdue status from items with VERIFIED aging
  // Verified = daysOverdue != null AND dueDate != null
  const verifiedItems = receivables.items.filter(isAgingVerified);
  if (verifiedItems.length === 0) {
    return { label: "Vencimiento no verificado", color: "inkMid" };
  }
  const overdueItems = verifiedItems.filter(r => r.daysOverdue! > 0);
  if (overdueItems.length === 0) {
    return { label: "Al dia", color: "green" };
  }
  const maxDaysOverdue = Math.max(...overdueItems.map(r => r.daysOverdue!));
  const overdueBalance = overdueItems.reduce((s, r) => s + r.balanceDue, 0);
  const overdueRatio = overdueBalance / receivables.totalBalance!;
  if (maxDaysOverdue > 90 || overdueRatio > 0.5) {
    return { label: "Critica", color: "red" };
  }
  return { label: "En mora", color: "amber" };
}

// ── computeClientScore ───────────────────────────────────────────────────────

export interface ClientScoreInput {
  crmQuoteCount: number;
  sagOrderCount: number;
  salesCount: number;
  sellerConfidence: number;
  arCertified: boolean;
  totalOverdue: number | null;
  totalBalance: number | null;
  /** Opportunity types present (e.g. ["cartera", "inactividad"]) */
  opportunityTypes: string[];
}

export function computeClientScore(input: ClientScoreInput): { grade: string; incomplete: boolean } {
  let score = 0;

  // AR data is complete only when certified AND both totals are non-null.
  // certified=true + balance=null is an inconsistent state — no AR points.
  const arComplete =
    input.arCertified &&
    input.totalBalance !== null &&
    input.totalOverdue !== null;

  // Activity
  if (input.crmQuoteCount > 0) score += 20;
  if (input.sagOrderCount > 0) score += 15;
  if (input.salesCount > 0) score += 15;

  // Seller
  if (input.sellerConfidence >= 80) score += 15;
  else if (input.sellerConfidence >= 50) score += 8;

  // Receivables health — ONLY award points when AR data is complete
  if (arComplete) {
    if (input.totalOverdue === 0 && input.totalBalance! > 0) score += 20;
    else if (input.totalOverdue === 0) score += 10;
  }

  // Low risk — cartera absence-of-risk only valid when AR data is complete
  // Inactivity can be evaluated independently (has its own data source)
  const hasCarteraRisk = input.opportunityTypes.includes("cartera");
  const hasInactivityRisk = input.opportunityTypes.includes("inactividad");

  if (arComplete && !hasCarteraRisk) score += 10;
  if (!hasInactivityRisk) score += 5;

  let grade: string;
  if (score >= 85) grade = "A+";
  else if (score >= 70) grade = "A";
  else if (score >= 55) grade = "B+";
  else if (score >= 40) grade = "B";
  else if (score >= 25) grade = "C";
  else grade = "D";

  return { grade, incomplete: !arComplete };
}

// ── Loader core functions (injectable deps for testability) ──────────────────

/** Shape of a customer in the AR snapshot */
export interface ArSnapshotCustomer {
  clienteId: number;
  totalPendiente: number;
  totalVencido: number;
  creditBalance: number;
  netReceivable: number;
}

/** Shape of the full AR snapshot */
export interface ArSnapshotData {
  customers: ArSnapshotCustomer[];
  asOf: Date;
}

/** Result from fetchCertifiedArSnapshot — ok:true with data, or ok:false with error */
export type ArFetchResult =
  | { ok: true; snapshot: ArSnapshotData }
  | { ok: false; error: string };

/** Full AR context with snapshot (superset of ArContextCore) */
export interface ArContextFull extends ArContextCore {
  snapshot: ArSnapshotData | null;
  arCustomerIds: Set<number>;
  overdueCustomerIds: Set<number>;
  asOf: string;
  reason: string;
}

/** Injectable dependencies for loadArContext */
export interface LoadArContextDeps {
  isCertified: (orgId: string) => boolean;
  fetchSnapshot: () => Promise<ArFetchResult>;
}

/**
 * Core logic of loadArContext — testable with injected dependencies.
 * Production wraps this with real Prisma/SAG deps.
 */
export async function loadArContextCore(
  organizationId: string,
  deps: LoadArContextDeps,
): Promise<ArContextFull> {
  const certified = deps.isCertified(organizationId);

  if (!certified) {
    return {
      dataState: "UNVERIFIED",
      snapshot: null,
      arLookup: new Map(),
      arCustomerIds: new Set(),
      overdueCustomerIds: new Set(),
      asOf: new Date().toISOString(),
      reason: "TENANT_NOT_CERTIFIED",
    };
  }

  let arResult: ArFetchResult;
  try {
    arResult = await deps.fetchSnapshot();
  } catch (err: any) {
    return {
      dataState: "UNAVAILABLE",
      snapshot: null,
      arLookup: new Map(),
      arCustomerIds: new Set(),
      overdueCustomerIds: new Set(),
      asOf: new Date().toISOString(),
      reason: err?.message ?? "FETCH_EXCEPTION",
    };
  }

  if (!arResult.ok) {
    return {
      dataState: "UNAVAILABLE",
      snapshot: null,
      arLookup: new Map(),
      arCustomerIds: new Set(),
      overdueCustomerIds: new Set(),
      asOf: new Date().toISOString(),
      reason: arResult.error,
    };
  }

  const arLookup = new Map<number, ArSnapshotCustomer>();
  const arCustomerIds = new Set<number>();
  const overdueCustomerIds = new Set<number>();

  for (const c of arResult.snapshot.customers) {
    arLookup.set(c.clienteId, c);
    // Only customers with positive net receivable count as "open AR"
    if (c.netReceivable > 0) {
      arCustomerIds.add(c.clienteId);
      if (c.totalVencido > 0) {
        overdueCustomerIds.add(c.clienteId);
      }
    }
  }

  return {
    dataState: "CERTIFIED",
    snapshot: arResult.snapshot,
    arLookup,
    arCustomerIds,
    overdueCustomerIds,
    asOf: arResult.snapshot.asOf.toISOString(),
    reason: "SAG_CERTIFIED",
  };
}

/** Injectable deps for loadClientesSummary core */
export interface SummaryDbDeps {
  queryProfileAgg: (orgId: string) => Promise<{
    total: number; active: number; inactive: number;
    withSeller: number; sinCompra90d: number; withCrm: number;
  }>;
  countDistinctProfiles: (orgId: string, sagIds: number[]) => Promise<number>;
}

/** Core logic of loadClientesSummary — testable */
export async function loadClientesSummaryCoreLogic(
  organizationId: string,
  arCtx: ArContextFull,
  deps: SummaryDbDeps,
): Promise<{
  total: number; active: number; inactive: number;
  withSeller: number; withCartera: number | null; withOverdue: number | null;
  sinCompra90d: number; withCrm: number;
  dataState: ArDataState; arAsOf: string | null; loadFailed: boolean;
}> {
  try {
    const agg = await deps.queryProfileAgg(organizationId);

    let withCartera: number | null = null;
    let withOverdue: number | null = null;

    if (arCtx.dataState === "CERTIFIED" && arCtx.arCustomerIds.size > 0) {
      const carteraIds = [...arCtx.arCustomerIds];
      const overdueIds = [...arCtx.overdueCustomerIds];

      const [carteraCount, overdueCount] = await Promise.all([
        deps.countDistinctProfiles(organizationId, carteraIds),
        overdueIds.length > 0
          ? deps.countDistinctProfiles(organizationId, overdueIds)
          : Promise.resolve(0),
      ]);

      withCartera = carteraCount;
      withOverdue = overdueCount;
    } else if (arCtx.dataState === "CERTIFIED") {
      withCartera = 0;
      withOverdue = 0;
    }

    return {
      ...agg,
      withCartera,
      withOverdue,
      dataState: arCtx.dataState,
      arAsOf: arCtx.dataState === "CERTIFIED" ? arCtx.asOf : null,
      loadFailed: false,
    };
  } catch {
    return {
      total: 0, active: 0, inactive: 0,
      withSeller: 0, withCartera: null, withOverdue: null,
      sinCompra90d: 0, withCrm: 0,
      dataState: "UNAVAILABLE",
      arAsOf: null,
      loadFailed: true,
    };
  }
}

/** Core logic of loadClientesPage filter guard for con_cartera */
export function resolveConCarteraFilter(
  arCtx: ArContextCore & { arCustomerIds: Set<number> },
): { allowed: false; dataState: ArDataState } | { allowed: true; sagIds: number[] } {
  if (arCtx.dataState !== "CERTIFIED" || arCtx.arCustomerIds.size === 0) {
    return { allowed: false, dataState: arCtx.dataState };
  }
  return { allowed: true, sagIds: [...arCtx.arCustomerIds] };
}
