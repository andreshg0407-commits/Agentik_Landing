/**
 * lib/comercial/clientes/customer-merge-engine.ts
 *
 * Pure functions for merging SAG + CRM + existing data into canonical
 * customer fields. No side effects, no DB access.
 *
 * Merge principles:
 *   - Confirmed data never overwritten by null/empty
 *   - SAG IDs are authoritative for SAG integration
 *   - CRM complements absent SAG data
 *   - Field provenance tracked per critical field
 *   - Branch-specific address has priority for delivery
 *
 * Sprint: AGENTIK-ORDERS-CUSTOMER-DATA-FOUNDATION-01
 */

import type {
  CustomerDataQuality,
  CustomerFieldQuality,
  CustomerPriceList,
  CustomerPaymentTerms,
  CustomerPortfolio,
  ResolvedSeller,
  SellerResolutionSource,
  SellerResolutionConfidence,
} from "./canonical-customer-types";

// ── SAG raw field extraction ────────────────────────────────────────────────

/** Extract SAG commercial fields from rawErpJson.meta */
export interface SagCommercialFields {
  sagCityId?: string;
  sagDeptId?: string;
  zona?: string;
  formaPago?: string;
  precioVenta?: string;
  credito?: number;
  diasCredito?: number;
  tipoCliente?: string;
  tipoDoc?: string;
  vendedor?: string;
  nitVendedor?: string;
  activo?: string;
  address?: string;
}

export function extractSagCommercialFields(rawErpJson: unknown): SagCommercialFields {
  if (!rawErpJson || typeof rawErpJson !== "object") return {};
  const meta = rawErpJson as Record<string, unknown>;
  const raw = (meta.raw ?? meta) as Record<string, unknown>;

  function s(key: string): string | undefined {
    const v = meta[key] ?? raw[key];
    if (v == null) return undefined;
    const str = String(v).trim();
    return str.length > 0 ? str : undefined;
  }

  function n(key: string): number | undefined {
    const v = meta[key] ?? raw[key];
    if (v == null) return undefined;
    const num = typeof v === "number" ? v : parseFloat(String(v));
    return isFinite(num) ? num : undefined;
  }

  return {
    sagCityId:    s("sagCityId")    ?? s("ka_ni_ciudad"),
    sagDeptId:    s("sagDeptId")    ?? s("ka_nl_departamento"),
    zona:         s("sagZona")      ?? s("sc_zona")       ?? s("ZONA"),
    formaPago:    s("sagFormaPago") ?? s("sc_forma_pago")  ?? s("FORMA_PAGO"),
    precioVenta:  s("sagPrecioVenta") ?? s("n_precio_venta") ?? s("PRECIO_VENTA"),
    credito:      n("sagCredito")   ?? n("n_credito")     ?? n("CREDITO"),
    diasCredito:  n("sagDiasCredito") ?? n("n_dias_credito") ?? n("DIAS_CREDITO"),
    tipoCliente:  s("sagTipoCliente") ?? s("sc_tipo_cliente") ?? s("TIPO_CLIENTE"),
    tipoDoc:      s("sagTipoDoc")    ?? s("sc_tipo_doc")     ?? s("TIPO_DOC"),
    vendedor:     s("sagVendedor")   ?? s("sc_vendedor")     ?? s("VENDEDOR"),
    nitVendedor:  s("sagNitVendedor") ?? s("n_nit_vendedor") ?? s("NIT_VENDEDOR"),
    activo:       s("sagActivo")     ?? s("sc_activo")       ?? s("ACTIVO"),
    address:      s("sc_direccion")  ?? s("DIRECCION"),
  };
}

// ── Address merge ───────────────────────────────────────────────────────────

/**
 * Merge address from multiple sources.
 * Priority: 1. SAG confirmed → 2. CRM confirmed → 3. Existing → 4. null
 * Never overwrite a valid address with null.
 */
export function mergeAddress(
  sagAddress: string | undefined,
  crmAddress: string | undefined,
  existingAddress: string | null | undefined,
): { value: string | undefined; quality: CustomerDataQuality } {
  if (sagAddress && sagAddress.trim().length > 0) {
    return { value: sagAddress.trim(), quality: "CONFIRMED" };
  }
  if (crmAddress && crmAddress.trim().length > 0) {
    return { value: crmAddress.trim(), quality: "CONFIRMED" };
  }
  if (existingAddress && existingAddress.trim().length > 0) {
    return { value: existingAddress.trim(), quality: "CONFIRMED" };
  }
  return { value: undefined, quality: "UNAVAILABLE" };
}

// ── City/Department merge ───────────────────────────────────────────────────

/**
 * Merge city from SAG (FK) + CRM (DANE) + existing.
 * SAG FK IDs are preserved but NOT used as display names.
 * CRM DANE-resolved names are authoritative for display.
 */
export function mergeLocation(
  sagCityId: string | undefined,
  sagDeptId: string | undefined,
  crmCity: string | null | undefined,
  crmDept: string | null | undefined,
  existingCity: string | null | undefined,
  existingDept: string | null | undefined,
): {
  city: string | undefined;
  department: string | undefined;
  sagCityId: string | undefined;
  sagDeptId: string | undefined;
  quality: CustomerDataQuality;
} {
  // CRM DANE-resolved names are best for display
  const city = (crmCity?.trim() || existingCity?.trim()) || undefined;
  const department = (crmDept?.trim() || existingDept?.trim()) || undefined;

  const quality: CustomerDataQuality =
    city ? "CONFIRMED" :
    sagCityId ? "INFERRED" :
    "UNAVAILABLE";

  return { city, department, sagCityId, sagDeptId, quality };
}

// ── Seller merge ────────────────────────────────────────────────────────────

/**
 * Resolve seller from multiple sources with priority cascade.
 * 1. SAG order vendedor (CONFIRMED)
 * 2. CRM order seller (CONFIRMED)
 * 3. Customer branch seller (INFERRED)
 * 4. Customer profile seller (INFERRED)
 * 5. UNAVAILABLE
 */
export function resolveSeller(
  sagVendedor: string | undefined,
  sagNitVendedor: string | undefined,
  crmSeller: string | undefined,
  profileSeller: string | null | undefined,
): ResolvedSeller {
  if (sagVendedor || sagNitVendedor) {
    return {
      name: sagVendedor,
      sagCode: sagNitVendedor,
      source: "CUSTOMER_PROFILE" as SellerResolutionSource,
      confidence: "CONFIRMED" as SellerResolutionConfidence,
    };
  }
  if (crmSeller) {
    return {
      name: crmSeller,
      source: "CUSTOMER_PROFILE" as SellerResolutionSource,
      confidence: "INFERRED" as SellerResolutionConfidence,
    };
  }
  if (profileSeller) {
    return {
      name: profileSeller,
      source: "CUSTOMER_PROFILE",
      confidence: "INFERRED",
    };
  }
  return {
    source: "UNAVAILABLE",
    confidence: "UNAVAILABLE",
  };
}

// ── Price list merge ────────────────────────────────────────────────────────

export function mergePriceList(
  sagPrecioVenta: string | undefined,
): CustomerPriceList {
  if (sagPrecioVenta) {
    return {
      code: sagPrecioVenta,
      name: `Lista ${sagPrecioVenta}`,
      quality: "CONFIRMED",
    };
  }
  return { quality: "UNAVAILABLE" };
}

// ── Payment terms merge ─────────────────────────────────────────────────────

export function mergePaymentTerms(
  sagFormaPago: string | undefined,
  sagCredito: number | undefined,
  sagDiasCredito: number | undefined,
): CustomerPaymentTerms {
  const hasData = sagFormaPago || sagCredito != null || sagDiasCredito != null;
  if (!hasData) return { quality: "UNAVAILABLE" };

  return {
    paymentMethod: sagFormaPago,
    creditLimit: sagCredito,
    paymentDays: sagDiasCredito,
    quality: "CONFIRMED",
  };
}

// ── Portfolio merge ─────────────────────────────────────────────────────────

export function mergePortfolio(
  totalReceivable: number | null | undefined,
  overdueReceivable: number | null | undefined,
  maxDpd: number | null | undefined,
): CustomerPortfolio {
  const total = totalReceivable != null ? Number(totalReceivable) : undefined;
  const overdue = overdueReceivable != null ? Number(overdueReceivable) : undefined;

  if (total == null && overdue == null) {
    return { quality: "UNAVAILABLE" };
  }
  return {
    totalBalance: total,
    overdueBalance: overdue,
    maxOverdueDays: maxDpd ?? undefined,
    quality: "CONFIRMED",
  };
}

// ── Data quality summary ────────────────────────────────────────────────────

export function computeFieldQuality(params: {
  sagCode: string | undefined;
  address: string | undefined;
  city: string | undefined;
  sagCityId: string | undefined;
  seller: ResolvedSeller;
  priceList: CustomerPriceList;
  paymentTerms: CustomerPaymentTerms;
}): CustomerFieldQuality {
  return {
    sagCode: params.sagCode ? "CONFIRMED" : "UNAVAILABLE",
    address: params.address ? "CONFIRMED" : "UNAVAILABLE",
    location:
      params.city ? "CONFIRMED" :
      params.sagCityId ? "INFERRED" :
      "UNAVAILABLE",
    seller: params.seller.confidence === "CONFIRMED" ? "CONFIRMED" :
            params.seller.confidence === "INFERRED" ? "INFERRED" :
            "UNAVAILABLE",
    priceList: params.priceList.quality,
    credit: params.paymentTerms.quality,
  };
}
