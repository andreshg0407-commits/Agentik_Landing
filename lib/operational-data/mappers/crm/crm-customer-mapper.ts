/**
 * lib/operational-data/mappers/crm/crm-customer-mapper.ts
 *
 * Maps CRM customer/contact records → OperationalCustomer.
 *
 * ─── CONTRACT ────────────────────────────────────────────────────────────────
 * CRM raw shapes are defined here as `CrmRawCustomer`.
 * This is what the CRM API/webhook/export delivers.
 *
 * Agentik code NEVER imports CrmRawCustomer outside this mapper.
 * All downstream code works with OperationalCustomer only.
 *
 * Sprint: AGENTIK-OPERATIONAL-DATA-LAYER-01
 */

import type { OperationalCustomer } from "../../operational-entities";

// ─── CRM raw shape ────────────────────────────────────────────────────────────
// What the CRM system delivers — field names are CRM-native.
// Do NOT use these outside this file.

export interface CrmRawCustomer {
  id:                 string;
  nombre:             string;
  email?:             string;
  telefono?:          string;
  ciudad?:            string;
  pais?:              string;
  vendedorId?:        string;
  totalCompras?:      number;
  cantidadOrdenes?:   number;
  ultimaCompra?:      string;
  clasificacion?:     string;  // "A" | "B" | "C" | "nuevo" | "inactivo"
  puntuacionEngagement?: number;
  sincronizadoEn:     string;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

export function mapCrmCustomerToOperational(
  raw:            CrmRawCustomer,
  organizationId: string,
): OperationalCustomer {
  const segment = normalizeCrmSegment(raw.clasificacion);

  return {
    id:             `crm_cust_${raw.id}`,
    organizationId,
    source:         "crm",
    sourceId:       raw.id,
    syncedAt:       raw.sincronizadoEn,
    confidence:     0.88,

    name:           raw.nombre,
    email:          raw.email,
    phone:          raw.telefono,
    city:           raw.ciudad,
    country:        raw.pais ?? "CO",
    salesRepId:     raw.vendedorId,
    engagementScore: raw.puntuacionEngagement ?? computeDefaultEngagement(raw),
    totalOrderValue: raw.totalCompras ?? 0,
    totalOrders:    raw.cantidadOrdenes ?? 0,
    lastOrderAt:    raw.ultimaCompra,
    segment,

    metadata: {
      crmId:          raw.id,
      clasificacion:  raw.clasificacion,
    },
  };
}

export function mapCrmCustomersToOperational(
  rows:           CrmRawCustomer[],
  organizationId: string,
): OperationalCustomer[] {
  return rows.map(r => mapCrmCustomerToOperational(r, organizationId));
}

// ─── Prisma-backed shape ──────────────────────────────────────────────────────
// Mirrors CustomerProfile Prisma model fields needed for operational mapping.
// Does NOT import Prisma — mirrors only. Provider converts Prisma types before calling.

export interface PrismaCustomerProfileShape {
  id:            string;
  organizationId: string;
  slug:          string;
  name:          string;
  crmId:         string | null;
  nit:           string | null;
  email:         string | null;
  phone:         string | null;
  city:          string | null;
  department:    string | null;
  sellerName:    string | null;
  sellerSlug:    string | null;
  customerType:  string;           // "B2B" | "B2C" | etc.
  crmSyncedAt:   string | null;    // ISO string (provider converts Date → string)
  updatedAt:     string;           // ISO string
}

/**
 * Maps a Prisma CustomerProfile (CRM-sourced fields) → OperationalCustomer.
 *
 * Only call this when `crmId` is present or `crmSyncedAt` is non-null.
 * For SAG-only profiles, use the SAG mapper instead.
 */
export function mapPrismaCustomerProfileToOperational(
  profile:        PrismaCustomerProfileShape,
  organizationId: string,
): OperationalCustomer {
  return {
    id:             `crm_cust_${profile.id}`,
    organizationId,
    source:         "crm",
    sourceId:       profile.crmId ?? profile.id,
    syncedAt:       profile.crmSyncedAt ?? profile.updatedAt,
    confidence:     0.88,

    name:           profile.name,
    email:          profile.email ?? undefined,
    phone:          profile.phone ?? undefined,
    city:           profile.city ?? undefined,
    country:        "CO",
    salesRepId:     profile.sellerSlug ?? undefined,
    engagementScore: 40,   // default — no direct LTV on CustomerProfile; enrich from SaleRecord
    totalOrderValue: 0,    // PLACEHOLDER — join with SaleRecord in Phase 2
    totalOrders:    0,     // PLACEHOLDER — join with SaleRecord in Phase 2
    segment:        undefined,

    metadata: {
      crmId:       profile.crmId,
      nit:         profile.nit,
      slug:        profile.slug,
      sellerSlug:  profile.sellerSlug,
      customerType: profile.customerType,
    },
  };
}

export function mapPrismaCustomerProfilesToOperational(
  profiles:       PrismaCustomerProfileShape[],
  organizationId: string,
): OperationalCustomer[] {
  return profiles.map(p => mapPrismaCustomerProfileToOperational(p, organizationId));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeCrmSegment(
  crm?: string,
): OperationalCustomer["segment"] {
  if (!crm) return undefined;
  const upper = crm.toUpperCase();
  if (upper === "A")         return "a";
  if (upper === "B")         return "b";
  if (upper === "C")         return "c";
  if (upper === "NUEVO")     return "nuevo";
  if (upper === "INACTIVO")  return "inactivo";
  return undefined;
}

function computeDefaultEngagement(raw: CrmRawCustomer): number {
  if (!raw.ultimaCompra) return 10;
  const daysSinceLast = Math.floor(
    (Date.now() - new Date(raw.ultimaCompra).getTime()) / 86_400_000,
  );
  if (daysSinceLast < 30)  return 90;
  if (daysSinceLast < 60)  return 70;
  if (daysSinceLast < 90)  return 50;
  if (daysSinceLast < 180) return 30;
  return 10;
}
