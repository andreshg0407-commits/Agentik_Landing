/**
 * cliente-360-loader.ts
 *
 * CLIENTES-360-01 Phase 2 + CLIENTES-DRAWER-PERF-REVIEW-01
 *
 * Loads all available data for a single customer:
 * - Profile + city + NIT
 * - Primary seller (from CRM quote history via client-seller-linker)
 * - CRM quotes
 * - SAG orders (via NIT)
 * - Receivables (cartera)
 * - Collection records (cobros)
 * - Sale records (facturas/remisiones via NIT)
 *
 * PERF-REVIEW-01 optimizations:
 * - Phase 1 parallel: profile + seller + receivables + collections
 * - Phase 2 parallel: crmQuotes + sagOrders + sales (need profile.nit/crmId)
 * - CRM quotes: raw SQL with JSON path filter instead of loading all + client filter
 * - Timing instrumentation via CLIENTE360_TIMING log
 *
 * Each block reports availability state.
 * NO fabricated data — if a source is empty, state = "no_disponible".
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveCity, resolveCrmCity } from "./city-resolver";
import { getCustomerPrimarySeller } from "@/lib/comercial/foundation/client-seller-linker";
import { fetchCustomerArWithStatus } from "@/lib/comercial/frontline/canonical-ar-service";
import { fetchCertifiedCustomerRecaudos } from "@/lib/comercial/frontline/canonical-recaudos-service";
import type { CertifiedReceivableDocument } from "@/lib/comercial/frontline/canonical-ar-types";
import type { ReceivableTruthStatus } from "@/lib/comercial/frontline/receivable-truth-contract";
import {
  classifyAgingBand,
  mapCertifiedDocToReceivable as mapDocPure,
  computeAgingCompleteness,
  resolveOverdueDisplay,
  resolveCollectionContext,
  resolveSagOrdersKpi,
  resolveInvoiceKpi,
  classifySalesHistory,
  classifyCollections,
} from "./clientes-pure";
import type {
  AgingCompleteness, CollectionContext, KpiSourceMeta,
  SalesHistoryResult, ClassifiedSaleItem, SalesProfileLabels,
  CustomerCollectionsResult,
} from "./clientes-pure";
import { resolveCanonicalDocumentKind, getSalesProfileLabels } from "./document-source-profiles";
import { resolveOrgSourceProfileId } from "./document-source-profiles";

// ── Types ─────────────────────────────────────────────────────────────────────

type BlockState = "disponible" | "no_disponible";

export interface Cliente360Profile {
  id: string;
  name: string;
  legalName: string | null;
  nit: string | null;
  erpId: string | null;        // CODIGO_CLIENTE from SAG
  city: string | null;
  department: string | null;
  status: string;
  customerType: string | null;  // TIPO_CLIENTE from SAG
  segment: string | null;       // CANAL_CLIENTE from SAG
  email: string | null;
  phone: string | null;
  address: string | null;
  crmId: string | null;
  sagTerceroId: number | null;
  lastPurchaseAt: string | null;
  crmSyncedAt: string | null;
  erpSyncedAt: string | null;
  // Extracted from rawErpJson.raw (SAG view fields not in Prisma columns)
  zone: string | null;           // ZONA_COMERCIAL
  creditLimit: number | null;    // CUPO_CREDITO
  priceListName: string | null;  // LISTA_PRECIOS
  createdAtSag: string | null;   // FECHA_CREACION
}

export interface Cliente360Seller {
  state: BlockState;
  sellerName: string | null;
  confidence: number;
}

export interface Cliente360CrmQuote {
  id: string;
  quoteNumber: string | null;
  amount: number;
  issuedAt: string | null;
  stage: string;
  sellerName: string | null;
  sagOrderId: string | null; // id_sag_c — traceability to SAG
}

export interface Cliente360SagOrder {
  id: string;
  erpMovId: number | null;
  orderNumber: string | null;
  orderDate: string | null;
  amount: number;
  status: string;
  customerName: string | null;
}

export interface Cliente360Receivable {
  id: string;
  erpId: string | null;
  /** Document type label (e.g. "Factura", "Nota crédito", "Remisión") */
  documentType: string;
  originalAmount: number;
  /** From vw_agentik_recaudos evidence only. Null when no recaudos data available */
  paidAmount: number | null;
  balanceDue: number;
  invoiceDate: string | null;
  dueDate: string | null;
  /** Null when SAG DIAS_MORA is null — do NOT coerce to 0 */
  daysOverdue: number | null;
  /** Null when DIAS_MORA is null — do NOT classify as CURRENT */
  agingBucket: string | null;
  status: string;
}

export interface Cliente360SaleRecord {
  id: string;
  comprobanteCode: string | null;
  amount: number;
  saleDate: string | null;
  productLine: string | null;
  sagSourceType: string | null; // OFICIAL / REMISION
  sellerSlug: string | null;
}

export interface Cliente360CollectionRecord {
  id: string;
  documentNumber: string | null;
  collectionDate: string | null;
  amount: number;
  appliedStatus: string | null;
}

export interface Cliente360Opportunity {
  id: string;
  type: string;
  title: string;
  reason: string;
}

export interface Cliente360Data {
  profile: Cliente360Profile;
  seller: Cliente360Seller;
  crmQuotes: { state: BlockState; items: Cliente360CrmQuote[] };
  sagOrders: { state: BlockState; items: Cliente360SagOrder[] };
  receivables: {
    state: BlockState;
    items: Cliente360Receivable[];
    /** Net receivable (gross - credits). Null when SAG unavailable */
    totalBalance: number | null;
    /** Gross receivable (positive saldos only). Null when SAG unavailable */
    grossReceivable: number | null;
    /** Credit balance (absolute value of negative saldos). Null when SAG unavailable */
    creditBalance: number | null;
    /** Total collected from vw_agentik_recaudos. Null when SAG unavailable */
    collectedAmount: number | null;
    /** Null when SAG unavailable — do NOT show Prisma saldo */
    totalOverdue: number | null;
    /** Count of documents with non-zero balance. Null when SAG unavailable */
    openCount: number | null;
    truthStatus: ReceivableTruthStatus;
    /** Aging completeness across open items — COMPLETE only when ALL have daysOverdue + dueDate */
    agingCompleteness: AgingCompleteness;
    /** Collection context — window label, asOf, linkage state */
    collectionContext: CollectionContext;
  };
  sales: { state: BlockState; items: Cliente360SaleRecord[] };
  collections: { state: BlockState; items: Cliente360CollectionRecord[] };
  opportunities: Cliente360Opportunity[];
  /** SAG orders KPI source metadata — truthState, reason, windowLabel */
  sagOrdersMeta: KpiSourceMeta;
  /** Invoice KPI source metadata — truthState, reason, windowLabel */
  invoicesMeta: KpiSourceMeta;
  /** Classified sales history — F1/F2 separated */
  salesHistory: SalesHistoryResult;
  /** Profile-specific section labels (e.g. "Facturación oficial (F1)") */
  salesProfileLabels: SalesProfileLabels;
  /** Classified collections from vw_agentik_recaudos — F1/F2 separated */
  collectionsResult: CustomerCollectionsResult;
  loadedAt: string;
}

// ── Timing helper ────────────────────────────────────────────────────────────

function ms(start: number): string {
  return `${(performance.now() - start).toFixed(0)}ms`;
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loadCliente360(
  organizationId: string,
  clienteId: string,
  orgSlug?: string,
): Promise<Cliente360Data | null> {
  const db = prisma as any;
  const t0 = performance.now();
  const timing: Record<string, string> = {};

  // Resolve source profile server-side — fail-closed to empty string (→ UNKNOWN_DOCUMENT)
  // orgSlug may be passed explicitly; if not, resolve from DB
  let resolvedOrgSlug: string = orgSlug ?? "";
  if (!resolvedOrgSlug) {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { slug: true },
    });
    resolvedOrgSlug = org?.slug ?? "";
  }
  const sourceProfileId = resolveOrgSourceProfileId(resolvedOrgSlug) ?? "";

  // ── Resolve clienteId: may be UUID (id) or slug (from alerts entityKey) ───
  let resolvedId = clienteId;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clienteId);
  if (!isUuid) {
    const bySlug = await db.customerProfile.findFirst({
      where: { slug: clienteId, organizationId },
      select: { id: true },
    });
    if (bySlug) resolvedId = bySlug.id;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 1: parallel — profile + seller + receivables + collections
  // These 4 queries are independent (all use orgId + resolvedId, no cross-deps)
  // ═══════════════════════════════════════════════════════════════════════════

  const tP1 = performance.now();

  const [profileResult, sellerResult, rawCollections] = await Promise.all([
    // 1. Profile
    (async () => {
      const t = performance.now();
      const r = await prisma.customerProfile.findFirst({
        where: { id: resolvedId, organizationId },
        select: {
          id: true, name: true, legalName: true, nit: true, erpId: true,
          city: true, department: true, status: true,
          customerType: true, segment: true,
          email: true, phone: true, address: true,
          crmId: true, sagTerceroId: true, lastPurchaseAt: true,
          crmSyncedAt: true, erpSyncedAt: true,
          rawCrmJson: true, rawErpJson: true,
        },
      });
      timing.profile = ms(t);
      return r;
    })(),

    // 2. Seller (from CRM quote history)
    (async () => {
      const t = performance.now();
      const r = await getCustomerPrimarySeller(organizationId, resolvedId);
      timing.seller = ms(t);
      return r;
    })(),

    // 3. Collections (via customerId FK)
    (async () => {
      const t = performance.now();
      const r = await db.collectionRecord.findMany({
        where: { organizationId, customerId: resolvedId },
        select: {
          id: true, documentNumber: true, collectionDate: true,
          amount: true, appliedStatus: true,
        },
        orderBy: { collectionDate: "desc" },
        take: 50,
      });
      timing.collections = ms(t);
      return r;
    })(),
  ]);

  timing.phase1 = ms(tP1);

  const p = profileResult;
  if (!p) return null;

  // Resolve city
  const crmRaw = (p.rawCrmJson as any)?.raw ?? {};
  const crmBillingCity = crmRaw.billing_address_city as string | undefined;
  const resolvedCity = resolveCity(p.city) ?? resolveCrmCity(crmBillingCity);

  // Extract SAG view fields from rawErpJson.raw (not in Prisma columns)
  const erpRaw = (p.rawErpJson as any)?.raw ?? {};

  const profile: Cliente360Profile = {
    id: p.id, name: p.name, legalName: p.legalName ?? null,
    nit: p.nit, erpId: p.erpId ?? null,
    city: resolvedCity, department: p.department ?? null,
    status: p.status, customerType: p.customerType ?? null,
    segment: p.segment, email: p.email,
    phone: p.phone, address: p.address, crmId: p.crmId,
    sagTerceroId: p.sagTerceroId,
    lastPurchaseAt: p.lastPurchaseAt?.toISOString() ?? null,
    crmSyncedAt: p.crmSyncedAt?.toISOString() ?? null,
    erpSyncedAt: p.erpSyncedAt?.toISOString() ?? null,
    zone: erpRaw.ZONA_COMERCIAL ?? null,
    creditLimit: erpRaw.CUPO_CREDITO != null ? Number(erpRaw.CUPO_CREDITO) : null,
    priceListName: erpRaw.LISTA_PRECIOS ?? null,
    createdAtSag: erpRaw.FECHA_CREACION ?? null,
  };

  const seller: Cliente360Seller = {
    state: sellerResult.sellerName ? "disponible" : "no_disponible",
    sellerName: sellerResult.sellerName,
    confidence: sellerResult.confidence,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 2: parallel — crmQuotes + sagOrders + sales (need profile.nit/crmId)
  // ═══════════════════════════════════════════════════════════════════════════

  const tP2 = performance.now();

  const [crmQuotesRaw, sagOrdersRaw, salesRaw] = await Promise.all([
    // CRM Quotes — use raw SQL with JSON path filter to avoid loading all org quotes
    (async () => {
      const t = performance.now();
      let rows: any[] = [];
      if (p.crmId) {
        rows = await db.$queryRawUnsafe(`
          SELECT id, "quoteNumber", amount, "issuedAt", "sellerName",
                 "rawCrmJson"->'raw'->>'stage' AS stage,
                 "rawCrmJson"->'raw'->>'id_sag_c' AS "sagOrderId"
          FROM "CRMQuote"
          WHERE "organizationId" = $1
            AND "rawCrmJson"->'raw'->>'billing_account_id' = $2
          ORDER BY "issuedAt" DESC
        `, organizationId, p.crmId);
      }
      timing.crmQuotes = ms(t);
      return rows;
    })(),

    // SAG Orders (via sagTerceroId — canonical SAG identity, NOT NIT)
    // CustomerOrderRecord.customerNit stores ka_nl_tercero as string
    (async () => {
      const t = performance.now();
      let rows: any[] = [];
      let queryOk = false;
      if (p.sagTerceroId != null && p.sagTerceroId > 0) {
        try {
          rows = await db.customerOrderRecord.findMany({
            where: { organizationId, customerNit: String(p.sagTerceroId) },
            select: {
              id: true, erpMovId: true, orderNumber: true,
              orderDate: true, amount: true, status: true, customerName: true,
            },
            orderBy: { orderDate: "desc" },
            take: 50,
          });
          queryOk = true;
        } catch {
          queryOk = false;
        }
      }
      timing.sagOrders = ms(t);
      return { rows, queryOk };
    })(),

    // Sales (via sagTerceroId — SaleRecord.customerNit stores SAG ka_nl_tercero as string)
    (async () => {
      const t = performance.now();
      let rows: any[] = [];
      let queryOk = false;
      if (p.sagTerceroId != null && p.sagTerceroId > 0) {
        try {
          rows = await db.saleRecord.findMany({
            where: { organizationId, customerNit: String(p.sagTerceroId) },
            select: {
              id: true, comprobanteCode: true, comprobante: true, amount: true,
              saleDate: true, productLine: true, sagSourceType: true,
              sellerSlug: true, sellerName: true, sellerCode: true,
            },
            orderBy: { saleDate: "desc" },
          });
          queryOk = true;
        } catch {
          queryOk = false;
        }
      }
      timing.sales = ms(t);
      return { rows, queryOk };
    })(),
  ]);

  timing.phase2 = ms(tP2);

  // ═══════════════════════════════════════════════════════════════════════════
  // Transform results
  // ═══════════════════════════════════════════════════════════════════════════

  const crmQuotes: Cliente360CrmQuote[] = crmQuotesRaw.map((q: any) => ({
    id: q.id,
    quoteNumber: q.quoteNumber,
    amount: Number(q.amount ?? 0),
    issuedAt: q.issuedAt instanceof Date ? q.issuedAt.toISOString() : (q.issuedAt ?? null),
    stage: q.stage || "Desconocido",
    sellerName: q.sellerName,
    sagOrderId: q.sagOrderId || null,
  }));

  const sagOrders: Cliente360SagOrder[] = sagOrdersRaw.rows.map((o: any) => ({
    id: o.id,
    erpMovId: o.erpMovId,
    orderNumber: o.orderNumber,
    orderDate: o.orderDate?.toISOString() ?? null,
    amount: Number(o.amount ?? 0),
    status: o.status,
    customerName: o.customerName,
  }));

  // SAG orders KPI metadata
  const sagOrdersMeta = resolveSagOrdersKpi(
    p.sagTerceroId, sagOrdersRaw.queryOk, sagOrders.length, new Date(),
  );

  // ── Canonical AR from SAG — ONLY source of receivable truth ──────────────
  // NO legacy CustomerReceivable is queried or used. All cartera data
  // comes exclusively from fetchCustomerArWithStatus → vw_agentik_cartera.
  let totalBalance: number | null;
  let grossReceivable: number | null;
  let creditBalance: number | null;
  let collectedAmount: number | null;
  let totalOverdue: number | null;
  let openCount: number | null;
  let receivableTruthStatus: ReceivableTruthStatus = "UNVERIFIED";
  let receivableItems: Cliente360Receivable[] = [];
  let agingCompleteness: AgingCompleteness = "UNVERIFIED";
  let collectionCtx: CollectionContext = {
    collectionWindowLabel: "\u2014",
    collectionAsOf: null,
    collectionLinkageState: "UNVERIFIED",
  };

  let recaudosResult: Awaited<ReturnType<typeof fetchCertifiedCustomerRecaudos>> | null = null;

  if (p.sagTerceroId != null && p.sagTerceroId > 0) {
    // Fetch cartera and recaudos in parallel from SAG
    const tAr = performance.now();
    const [arResult, recaudosResultLocal] = await Promise.all([
      fetchCustomerArWithStatus(p.sagTerceroId),
      fetchCertifiedCustomerRecaudos(p.sagTerceroId).catch(() => null),
    ]);
    recaudosResult = recaudosResultLocal;
    timing.canonicalAr = ms(tAr);

    // Recaudos: totalRecaudado from vw_agentik_recaudos (actual cash received — NO date filter)
    collectedAmount = recaudosResult?.ok ? recaudosResult.snapshot.totalRecaudado : null;

    // Resolve collection context — linkage between recaudos and open AR documents
    const recaudoDocuments = recaudosResult?.ok
      ? recaudosResult.snapshot.applications.map((a: any) => a.documentoRelacionado).filter(Boolean) as string[]
      : [];

    if (arResult.status === "CERTIFIED_ZERO") {
      totalBalance = 0;
      grossReceivable = 0;
      creditBalance = 0;
      totalOverdue = 0;
      openCount = 0;
      receivableTruthStatus = "CERTIFIED";
      agingCompleteness = "COMPLETE"; // no open items → nothing to verify
      collectionCtx = resolveCollectionContext(
        !!recaudosResult?.ok, recaudosResult?.ok ? new Date() : null,
        recaudoDocuments, [],
      );
      // receivableItems stays [] — genuinely no open documents
    } else if (arResult.status === "HAS_OPEN_AR") {
      grossReceivable = arResult.snapshot.totalPendiente;
      creditBalance = arResult.snapshot.creditBalance;
      totalBalance = arResult.snapshot.netReceivable;
      openCount = arResult.snapshot.documentCount;
      receivableTruthStatus = "CERTIFIED";
      // Convert SAG certified documents to Cliente360Receivable[]
      receivableItems = arResult.snapshot.documents.map(d => mapCertifiedDocToReceivable(d, sourceProfileId));
      // Compute aging completeness — requires BOTH daysOverdue AND dueDate
      agingCompleteness = computeAgingCompleteness(receivableItems);
      // totalOverdue is null-safe: only show when aging is fully verified
      totalOverdue = resolveOverdueDisplay(arResult.snapshot.totalVencido, agingCompleteness);
      // Collection linkage
      const openArDocs = arResult.snapshot.documents.map(d => d.documento);
      collectionCtx = resolveCollectionContext(
        !!recaudosResult?.ok, recaudosResult?.ok ? new Date() : null,
        recaudoDocuments, openArDocs,
      );
    } else {
      // SAG_UNAVAILABLE or IDENTITY_UNKNOWN — all values null/unknown
      totalBalance = null;
      grossReceivable = null;
      creditBalance = null;
      collectedAmount = null;
      totalOverdue = null;
      openCount = null;
      // receivableItems stays [] — no data to show
      // receivableTruthStatus stays "UNVERIFIED"
    }
  } else {
    // No SAG identity — cannot certify. All values null/unknown.
    totalBalance = null;
    grossReceivable = null;
    creditBalance = null;
    collectedAmount = null;
    totalOverdue = null;
    openCount = null;
    // receivableTruthStatus stays "UNVERIFIED"
  }

  const salesItems: Cliente360SaleRecord[] = salesRaw.rows.map((s: any) => ({
    id: s.id,
    comprobanteCode: s.comprobanteCode,
    amount: Number(s.amount ?? 0),
    saleDate: s.saleDate?.toISOString() ?? null,
    productLine: s.productLine,
    sagSourceType: s.sagSourceType,
    sellerSlug: s.sellerSlug,
  }));

  // Invoice KPI — count only SALES_INVOICE via canonical document kind
  // Use comprobanteCode (fuente prefix) for classification, NOT bare comprobante number
  const excludedKindLabels: string[] = [];
  let invoiceCount = 0;
  for (const s of salesRaw.rows) {
    const code = (s.comprobanteCode as string) ?? "";
    const num = (s.comprobante as string) ?? "";
    const docRef = code ? `${code}-${num}` : num;
    const kind = resolveCanonicalDocumentKind(sourceProfileId, {
      documento: docRef,
      tipoDocumento: "",
    });
    if (kind.kind === "SALES_INVOICE") {
      invoiceCount++;
    } else if (kind.kind !== "UNKNOWN_DOCUMENT") {
      if (!excludedKindLabels.includes(kind.label)) {
        excludedKindLabels.push(kind.label);
      }
    }
  }
  const invoicesMeta = resolveInvoiceKpi(
    p.sagTerceroId != null ? String(p.sagTerceroId) : null,
    salesRaw.queryOk, invoiceCount, salesRaw.rows.length,
    excludedKindLabels, new Date(),
  );

  // Build classified sale items for sales history F1/F2 separation
  const classifiedSales: ClassifiedSaleItem[] = salesRaw.rows.map((s: any) => {
    const code = (s.comprobanteCode as string) ?? "";
    const num = (s.comprobante as string) ?? "";
    const docRef = code ? `${code}-${num}` : num;
    const kind = resolveCanonicalDocumentKind(sourceProfileId, {
      documento: docRef,
      tipoDocumento: "",
    });
    // Seller truth: "Sin Vendedor" is a fallback injected by storage.ts, not real SAG data
    const rawSellerName = (s.sellerName as string) ?? "";
    const rawSellerCode = (s.sellerCode as string) ?? null;
    const isFallbackSeller = rawSellerName === "Sin Vendedor" || rawSellerName === "";
    const sellerTruthState: import("./clientes-pure").SellerTruthState =
      !isFallbackSeller ? "CERTIFIED"
      : rawSellerCode ? "IDENTITY_ONLY"
      : "NOT_REPORTED_BY_SOURCE";

    return {
      id: s.id,
      canonicalKind: kind.kind,
      rawSourceCode: code || null,
      rawDocumentNumber: docRef || null,
      issueDate: s.saleDate instanceof Date ? s.saleDate.toISOString() : (s.saleDate ?? null),
      seller: s.sellerSlug ?? null,
      sellerId: rawSellerCode,
      sellerName: isFallbackSeller ? null : rawSellerName,
      sellerTruthState,
      grossAmount: Number(s.amount ?? 0),
      productLine: s.productLine ?? null,
      sourceProfileId,
    };
  });

  const hasProfile = sourceProfileId.length > 0;
  // Cartera document codes for cross-source mismatch detection
  const carteraDocCodes: string[] = receivableItems.map(r => r.erpId).filter(Boolean) as string[];
  const salesHistory = classifySalesHistory(
    classifiedSales,
    salesRaw.queryOk,
    p.sagTerceroId != null && p.sagTerceroId > 0, // hasSagIdentity for sales = has sagTerceroId
    hasProfile,
    new Date(),
    carteraDocCodes,
  );

  const salesProfileLabels = getSalesProfileLabels(sourceProfileId);

  // Build certified collections result from vw_agentik_recaudos (canonical authority)
  const collectionsResult = classifyCollections(
    recaudosResult?.ok ? recaudosResult.snapshot.applications : [],
    !!recaudosResult?.ok,
    p.sagTerceroId != null && p.sagTerceroId > 0,
    hasProfile ? sourceProfileId : null,
    recaudosResult?.ok ? recaudosResult.snapshot.asOf : null,
  );

  const collectionItems: Cliente360CollectionRecord[] = rawCollections.map((c: any) => ({
    id: c.id,
    documentNumber: c.documentNumber,
    collectionDate: c.collectionDate?.toISOString() ?? null,
    amount: Number(c.amount ?? 0),
    appliedStatus: c.appliedStatus,
  }));

  // Opportunities (synchronous, no DB)
  // receivableItems come exclusively from canonical SAG — empty when UNVERIFIED/CERTIFIED_ZERO
  const opportunities = computeOpportunities(
    profile, seller, crmQuotes, sagOrders, receivableItems, salesItems,
  );

  timing.total = ms(t0);

  // Payload size estimation
  const result: Cliente360Data = {
    profile,
    seller,
    crmQuotes: {
      state: crmQuotes.length > 0 ? "disponible" : "no_disponible",
      items: crmQuotes,
    },
    sagOrders: {
      state: sagOrders.length > 0 ? "disponible" : "no_disponible",
      items: sagOrders,
    },
    receivables: {
      state: receivableTruthStatus === "CERTIFIED" ? "disponible" : "no_disponible",
      items: receivableItems,
      totalBalance,
      grossReceivable,
      creditBalance,
      collectedAmount,
      totalOverdue,
      openCount,
      truthStatus: receivableTruthStatus,
      agingCompleteness,
      collectionContext: collectionCtx,
    },
    sales: {
      state: salesItems.length > 0 ? "disponible" : "no_disponible",
      items: salesItems,
    },
    collections: {
      state: collectionItems.length > 0 ? "disponible" : "no_disponible",
      items: collectionItems,
    },
    opportunities,
    sagOrdersMeta,
    invoicesMeta,
    salesHistory,
    salesProfileLabels,
    collectionsResult,
    loadedAt: new Date().toISOString(),
  };

  const payloadKb = (JSON.stringify(result).length / 1024).toFixed(1);

  console.log(
    `[CLIENTE360_TIMING] ${p.name} — ` +
    `profile=${timing.profile} seller=${timing.seller} ` +
    `crmQuotes=${timing.crmQuotes} sagOrders=${timing.sagOrders} ` +
    `receivables=${timing.receivables} sales=${timing.sales} ` +
    `collections=${timing.collections} | ` +
    `phase1=${timing.phase1} phase2=${timing.phase2} | ` +
    `total=${timing.total} | ` +
    `payload=${payloadKb}KB | ` +
    `rows: quotes=${crmQuotes.length} sag=${sagOrders.length} ` +
    `recv=${receivableItems.length}(${receivableTruthStatus}) sales=${salesItems.length} ` +
    `coll=${collectionItems.length} opps=${opportunities.length}`,
  );

  return result;
}

// ── SAG document → Cliente360Receivable mapper ───────────────────────────────
// Logic lives in clientes-pure.ts — same code tested directly by behavioral tests
// sourceProfileId resolved server-side via resolveOrgSourceProfileId — NEVER defaulted

function mapCertifiedDocToReceivable(doc: CertifiedReceivableDocument, sourceProfileId: string): Cliente360Receivable {
  return mapDocPure(doc, sourceProfileId) as Cliente360Receivable;
}

// classifyAgingBand imported from clientes-pure.ts

// ── Opportunity Engine ────────────────────────────────────────────────────────

function computeOpportunities(
  profile: Cliente360Profile,
  seller: Cliente360Seller,
  crmQuotes: Cliente360CrmQuote[],
  sagOrders: Cliente360SagOrder[],
  receivables: Cliente360Receivable[],
  sales: Cliente360SaleRecord[],
): Cliente360Opportunity[] {
  const ops: Cliente360Opportunity[] = [];
  const now = Date.now();
  const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

  // 1. Sin pedido reciente > 90 dias
  const lastOrderDate = getLastActivityDate(crmQuotes, sagOrders, sales);
  if (lastOrderDate && (now - lastOrderDate) > NINETY_DAYS) {
    const days = Math.round((now - lastOrderDate) / (24 * 60 * 60 * 1000));
    ops.push({
      id: "opp_inactivo",
      type: "inactividad",
      title: "Cliente inactivo",
      reason: `Sin actividad comercial hace ${days} dias. Ultimo movimiento registrado hace mas de 90 dias.`,
    });
  }

  // 2. Cartera vencida — only when daysOverdue is known (not null)
  const overdue = receivables.filter(r => r.daysOverdue != null && r.daysOverdue > 0);
  if (overdue.length > 0) {
    const totalOverdue = overdue.reduce((s, r) => s + r.balanceDue, 0);
    const maxDays = Math.max(...overdue.map(r => r.daysOverdue!));
    ops.push({
      id: "opp_cartera_vencida",
      type: "cartera",
      title: "Cartera vencida pendiente",
      reason: `${overdue.length} factura${overdue.length > 1 ? "s" : ""} vencida${overdue.length > 1 ? "s" : ""} por $${fmtNum(totalOverdue)}. Mayor mora: ${maxDays} dias.`,
    });
  }

  // 3. Pedidos CRM no facturados
  const noFacturado = crmQuotes.filter(
    q => q.stage !== "Facturado" && q.stage !== "Anulado",
  );
  if (noFacturado.length > 0) {
    ops.push({
      id: "opp_no_facturado",
      type: "conversion",
      title: "Pedidos sin facturar",
      reason: `${noFacturado.length} pedido${noFacturado.length > 1 ? "s" : ""} CRM en estado no facturado (${[...new Set(noFacturado.map(q => q.stage))].join(", ")}).`,
    });
  }

  // 4. Sin vendedor confiable
  if (seller.state === "no_disponible" || seller.confidence < 60) {
    ops.push({
      id: "opp_sin_vendedor",
      type: "asignacion",
      title: "Sin vendedor asignado",
      reason: seller.confidence > 0
        ? `Vendedor con ${seller.confidence}% de confianza (minimo requerido: 60%).`
        : "No hay historial de pedidos CRM para determinar vendedor principal.",
    });
  }

  // 5. SAG orders but no CRM activity
  if (sagOrders.length > 0 && crmQuotes.length === 0) {
    ops.push({
      id: "opp_sag_sin_crm",
      type: "trazabilidad",
      title: "Actividad SAG sin registro CRM",
      reason: `${sagOrders.length} pedido${sagOrders.length > 1 ? "s" : ""} en SAG pero sin cotizaciones CRM. El vendedor puede no estar registrando en CRM.`,
    });
  }

  return ops;
}

function getLastActivityDate(
  crmQuotes: Cliente360CrmQuote[],
  sagOrders: Cliente360SagOrder[],
  sales: Cliente360SaleRecord[],
): number | null {
  const dates: number[] = [];
  for (const q of crmQuotes) {
    if (q.issuedAt) dates.push(new Date(q.issuedAt).getTime());
  }
  for (const o of sagOrders) {
    if (o.orderDate) dates.push(new Date(o.orderDate).getTime());
  }
  for (const s of sales) {
    if (s.saleDate) dates.push(new Date(s.saleDate).getTime());
  }
  return dates.length > 0 ? Math.max(...dates) : null;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString("es-CO");
}
