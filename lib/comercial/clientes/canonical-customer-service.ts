/**
 * lib/comercial/clientes/canonical-customer-service.ts
 *
 * Single canonical authority for commercial customer reads.
 * All modules (Pedidos, Vendedores, Clientes) MUST consume customers
 * through this service — no direct CustomerProfile queries for commercial ops.
 *
 * Sources:
 *   - CustomerProfile (Prisma) — primary store
 *   - rawErpJson — SAG commercial fields (zona, credito, etc.)
 *   - rawCrmJson — CRM supplementary data (city DANE, seller)
 *   - CRMQuote — seller inference fallback
 *
 * Sprint: AGENTIK-ORDERS-CUSTOMER-DATA-FOUNDATION-01
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveCity, resolveCrmCity } from "./city-resolver";
import {
  extractSagCommercialFields,
  mergeAddress,
  mergeLocation,
  resolveSeller,
  mergePriceList,
  mergePaymentTerms,
  mergePortfolio,
  computeFieldQuality,
} from "./customer-merge-engine";
import { validateCustomerForSagOrder } from "./customer-sag-validation";
import type {
  CanonicalCommercialCustomer,
  CanonicalCustomerBranch,
  CustomerSearchResult,
  ResolvedSeller,
  SagReadinessResult,
} from "./canonical-customer-types";

const db = prisma as any;

// ── Profile fields selected for canonical reads ─────────────────────────────

const PROFILE_SELECT = {
  id: true,
  organizationId: true,
  erpId: true,
  crmId: true,
  sagTerceroId: true,
  nit: true,
  nitNormalized: true,
  slug: true,
  name: true,
  legalName: true,
  status: true,
  segment: true,
  customerType: true,
  email: true,
  phone: true,
  city: true,
  department: true,
  address: true,
  sellerSlug: true,
  sellerName: true,
  ltv: true,
  lastPurchaseAt: true,
  totalReceivable: true,
  overdueReceivable: true,
  maxDpd: true,
  erpSyncedAt: true,
  crmSyncedAt: true,
  rawErpJson: true,
  rawCrmJson: true,
  updatedAt: true,
} as const;

// ── Internal: build canonical from profile row ──────────────────────────────

function buildCanonical(
  p: any,
  branches: CanonicalCustomerBranch[] = [],
): CanonicalCommercialCustomer {
  // Extract SAG commercial fields from rawErpJson
  const sag = extractSagCommercialFields(p.rawErpJson);

  // Extract CRM fields
  const crmRaw = p.rawCrmJson as Record<string, unknown> | null;
  const crmData = (crmRaw?.raw ?? crmRaw) as Record<string, unknown> | null;
  const crmCity = crmData?.billing_address_city
    ? String(crmData.billing_address_city)
    : null;
  const crmDept = crmData?.billing_address_state
    ? String(crmData.billing_address_state)
    : null;
  const crmSeller = p.sellerName ?? undefined;

  // Merge address
  const addressResult = mergeAddress(
    sag.address ?? p.address,
    undefined, // CRM address not separately tracked
    p.address,
  );

  // Merge location
  const locationResult = mergeLocation(
    sag.sagCityId,
    sag.sagDeptId,
    resolveCrmCity(crmCity),
    crmDept,
    resolveCity(p.city),
    p.department,
  );

  // Resolve seller
  const seller = resolveSeller(
    sag.vendedor,
    sag.nitVendedor,
    crmSeller,
    p.sellerName,
  );

  // Price list
  const priceList = mergePriceList(sag.precioVenta);

  // Payment terms
  const paymentTerms = mergePaymentTerms(
    sag.formaPago,
    sag.credito,
    sag.diasCredito,
  );

  // Portfolio
  const portfolio = mergePortfolio(
    p.totalReceivable,
    p.overdueReceivable,
    p.maxDpd,
  );

  // Data quality
  const dataQuality = computeFieldQuality({
    sagCode: p.erpId,
    address: addressResult.value,
    city: locationResult.city,
    sagCityId: locationResult.sagCityId,
    seller,
    priceList,
    paymentTerms,
  });

  // Status mapping
  const status = p.status === "ACTIVE" ? "ACTIVE" as const
    : p.status === "INACTIVE" ? "INACTIVE" as const
    : "UNKNOWN" as const;

  return {
    id: p.id,
    organizationId: p.organizationId,

    sagCode: p.erpId ?? undefined,
    crmId: p.crmId ?? undefined,
    sagTerceroId: p.sagTerceroId ?? undefined,

    documentType: sag.tipoDoc,
    documentNumber: p.nit ?? undefined,
    nitNormalized: p.nitNormalized ?? undefined,

    legalName: p.name,
    tradeName: p.legalName ?? undefined,

    address: addressResult.value,
    city: locationResult.city,
    sagCityId: locationResult.sagCityId,
    department: locationResult.department,
    sagDepartmentId: locationResult.sagDeptId,
    country: "CO",

    phone: p.phone ?? undefined,
    email: p.email ?? undefined,

    zone: sag.zona,
    channel: sag.tipoCliente,
    customerType: p.customerType,

    priceList,
    paymentTerms,
    portfolio,
    seller,

    branches,
    hasBranches: branches.length > 1,

    status,
    sagActive: sag.activo === "1" || sag.activo === "S" || undefined,

    dataQuality,

    erpSyncedAt: p.erpSyncedAt?.toISOString(),
    crmSyncedAt: p.crmSyncedAt?.toISOString(),
    updatedAt: p.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

// ── getCustomer ─────────────────────────────────────────────────────────────

/**
 * Load a single customer by CustomerProfile.id with full canonical enrichment.
 */
export async function getCustomer(
  organizationId: string,
  customerId: string,
): Promise<CanonicalCommercialCustomer | null> {
  const p = await db.customerProfile.findFirst({
    where: { id: customerId, organizationId },
    select: PROFILE_SELECT,
  });
  if (!p) return null;

  const branches = await getCustomerBranches(organizationId, p.nitNormalized ?? p.nit);
  return buildCanonical(p, branches);
}

// ── getCustomerBySagCode ────────────────────────────────────────────────────

export async function getCustomerBySagCode(
  organizationId: string,
  sagCode: string,
): Promise<CanonicalCommercialCustomer | null> {
  const p = await db.customerProfile.findFirst({
    where: { organizationId, erpId: sagCode },
    select: PROFILE_SELECT,
  });
  if (!p) return null;

  const branches = await getCustomerBranches(organizationId, p.nitNormalized ?? p.nit);
  return buildCanonical(p, branches);
}

// ── getCustomerBranches ─────────────────────────────────────────────────────

/**
 * Find all branches (sucursales) for a customer by NIT.
 * In SAG, branches are represented as separate TERCEROS rows sharing the same NIT.
 * Each becomes a separate CustomerProfile record with the same nitNormalized.
 */
export async function getCustomerBranches(
  organizationId: string,
  nit: string | null | undefined,
): Promise<CanonicalCustomerBranch[]> {
  if (!nit) return [];

  const profiles = await db.customerProfile.findMany({
    where: {
      organizationId,
      OR: [
        { nitNormalized: nit },
        { nit },
      ],
    },
    select: {
      id: true,
      organizationId: true,
      erpId: true,
      name: true,
      address: true,
      city: true,
      department: true,
      phone: true,
      sellerName: true,
      status: true,
      rawErpJson: true,
      lastPurchaseAt: true,
    },
    orderBy: { lastPurchaseAt: { sort: "desc", nulls: "last" } },
  });

  if (profiles.length <= 1) {
    // Single profile = single branch (main)
    if (profiles.length === 0) return [];
    const p = profiles[0];
    const sag = extractSagCommercialFields(p.rawErpJson);
    return [{
      id: p.id,
      organizationId: p.organizationId,
      parentCustomerId: p.id,
      sagCustomerCode: p.erpId ?? undefined,
      name: p.name,
      address: p.address ?? undefined,
      city: p.city ?? undefined,
      department: p.department ?? undefined,
      phone: p.phone ?? undefined,
      seller: p.sellerName
        ? { name: p.sellerName, source: "CUSTOMER_PROFILE", confidence: "INFERRED" }
        : { source: "UNAVAILABLE", confidence: "UNAVAILABLE" },
      status: p.status,
      isMain: true,
      source: "SAG",
      sourceRecordId: p.erpId ?? undefined,
    }];
  }

  // Multiple profiles sharing same NIT = branches
  // The "main" is the one with the most recent purchase or first created
  const mainId = profiles[0].id;

  return profiles.map((p: any, idx: number) => {
    const sag = extractSagCommercialFields(p.rawErpJson);
    return {
      id: p.id,
      organizationId: p.organizationId,
      parentCustomerId: mainId,
      sagCustomerCode: p.erpId ?? undefined,
      name: p.name,
      address: p.address ?? undefined,
      city: p.city ?? undefined,
      department: p.department ?? undefined,
      phone: p.phone ?? undefined,
      seller: sag.vendedor
        ? { name: sag.vendedor, sagCode: sag.nitVendedor, source: "CUSTOMER_BRANCH" as const, confidence: "CONFIRMED" as const }
        : p.sellerName
          ? { name: p.sellerName, source: "CUSTOMER_PROFILE" as const, confidence: "INFERRED" as const }
          : { source: "UNAVAILABLE" as const, confidence: "UNAVAILABLE" as const },
      status: p.status,
      isMain: idx === 0,
      source: "SAG" as const,
      sourceRecordId: p.erpId ?? undefined,
    };
  });
}

// ── searchCustomers ─────────────────────────────────────────────────────────

/**
 * Search customers for the order wizard. Returns lightweight results
 * with SAG readiness pre-computed.
 */
export async function searchCustomers(
  organizationId: string,
  query: string,
): Promise<CustomerSearchResult[]> {
  const q = query.trim();
  const where: any = {
    organizationId,
    status: "ACTIVE",
  };
  if (q) {
    where.OR = [
      { name:          { contains: q, mode: "insensitive" } },
      { slug:          { contains: q, mode: "insensitive" } },
      { nit:           { contains: q, mode: "insensitive" } },
      { nitNormalized: { contains: q, mode: "insensitive" } },
      { sellerName:    { contains: q, mode: "insensitive" } },
      { city:          { contains: q, mode: "insensitive" } },
    ];
  }

  const profiles = await db.customerProfile.findMany({
    where,
    orderBy: { lastPurchaseAt: { sort: "desc", nulls: "last" } },
    take: 30,
    select: {
      id: true,
      erpId: true,
      nit: true,
      nitNormalized: true,
      name: true,
      city: true,
      address: true,
      sellerName: true,
      status: true,
      lastPurchaseAt: true,
      rawErpJson: true,
    },
  });

  // Count branches per NIT
  const nitCounts = new Map<string, number>();
  const nits = profiles
    .map((p: any) => p.nitNormalized ?? p.nit)
    .filter(Boolean) as string[];

  if (nits.length > 0) {
    try {
      const counts: { nit: string; count: bigint }[] = await db.$queryRawUnsafe(`
        SELECT "nitNormalized" as nit, COUNT(*)::bigint as count
        FROM "CustomerProfile"
        WHERE "organizationId" = $1
          AND "nitNormalized" = ANY($2::text[])
        GROUP BY "nitNormalized"
        HAVING COUNT(*) > 1
      `, organizationId, [...new Set(nits)]);
      for (const r of counts) {
        nitCounts.set(r.nit, Number(r.count));
      }
    } catch {
      // Non-fatal
    }
  }

  return profiles.map((p: any) => {
    const sag = extractSagCommercialFields(p.rawErpJson);
    const nit = p.nitNormalized ?? p.nit;
    const branchCount = nitCounts.get(nit) ?? 1;

    // Compute SAG readiness inline
    const sagReady = p.erpId ? "READY" as const : "DRAFT_ONLY" as const;

    return {
      id: p.id,
      sagCode: p.erpId ?? undefined,
      nit: p.nit ?? undefined,
      name: p.name,
      city: resolveCity(p.city) ?? undefined,
      address: p.address ?? undefined,
      seller: sag.vendedor
        ? { name: sag.vendedor, sagCode: sag.nitVendedor, source: "CUSTOMER_PROFILE" as const, confidence: "CONFIRMED" as const }
        : p.sellerName
          ? { name: p.sellerName, source: "CUSTOMER_PROFILE" as const, confidence: "INFERRED" as const }
          : undefined,
      priceListCode: sag.precioVenta,
      creditLimit: sag.credito,
      hasBranches: branchCount > 1,
      branchCount,
      status: p.status,
      sagReadiness: sagReady,
      lastPurchaseAt: p.lastPurchaseAt?.toISOString(),
    };
  });
}

// ── getCustomerCommercialProfile ─────────────────────────────────────────────

/**
 * Get the commercial profile for a customer — used by the order wizard
 * to display all relevant data at selection time.
 */
export async function getCustomerCommercialProfile(
  organizationId: string,
  customerId: string,
): Promise<{
  customer: CanonicalCommercialCustomer;
  sagReadiness: SagReadinessResult;
} | null> {
  const customer = await getCustomer(organizationId, customerId);
  if (!customer) return null;

  const sagReadiness = validateCustomerForSagOrder(customer);
  return { customer, sagReadiness };
}

// ── resolveCustomerSeller ───────────────────────────────────────────────────

/**
 * Resolve the seller for a specific order context.
 * Uses the 5-level priority cascade.
 */
export async function resolveCustomerSeller(
  organizationId: string,
  customerId: string,
  orderSellerTerceroId?: number,
): Promise<ResolvedSeller> {
  // Level 1: SAG order seller (explicit vendedor from MOVIMIENTOS)
  if (orderSellerTerceroId && orderSellerTerceroId > 0) {
    // Try to resolve name from TERCEROS via sagTerceroId
    try {
      const seller = await db.customerProfile.findFirst({
        where: { organizationId, sagTerceroId: orderSellerTerceroId },
        select: { name: true, nit: true },
      });
      if (seller) {
        return {
          name: seller.name,
          sagCode: seller.nit ?? String(orderSellerTerceroId),
          source: "SAG_ORDER",
          confidence: "CONFIRMED",
        };
      }
    } catch {
      // Non-fatal
    }
    // Fallback: return the ID without name resolution
    return {
      sagCode: String(orderSellerTerceroId),
      source: "SAG_ORDER",
      confidence: "CONFIRMED",
    };
  }

  // Levels 2-5: customer profile resolution
  const customer = await getCustomer(organizationId, customerId);
  if (!customer) {
    return { source: "UNAVAILABLE", confidence: "UNAVAILABLE" };
  }

  return customer.seller;
}
