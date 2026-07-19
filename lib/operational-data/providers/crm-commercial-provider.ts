/**
 * lib/operational-data/providers/crm-commercial-provider.ts
 *
 * CrmCommercialProvider — bridges Prisma CRM data → Operational Data Layer.
 *
 * ─── POSITION IN ARCHITECTURE ────────────────────────────────────────────────
 *
 *   SuiteCRM V8 API
 *       ↓ (connector sync — CastillitosCrmAdapter)
 *   Prisma: CRMQuote · CRMOpportunity · CRMActivity · CustomerProfile
 *       ↓ (THIS FILE)
 *   OperationalOrder · OperationalCustomer · OperationalOpportunity · OperationalSalesActivity
 *       ↓
 *   CommercialOperationalContext → Agents · Copilot · Sales Portfolio · Demand Engine
 *
 * ─── RULE ─────────────────────────────────────────────────────────────────────
 * No module outside this provider reads Prisma CRM tables directly for
 * operational intelligence. The provider is the ONLY authorized reader.
 *
 * Legacy readers (lib/customer360/, lib/sales/crm-alert-engine.ts) maintain
 * their direct Prisma access for their own purposes. Those will be migrated
 * progressively in future sprints.
 *
 * ─── WHAT IS MAPPED ───────────────────────────────────────────────────────────
 *
 *   CRMQuote + CRMQuoteLine → OperationalOrder (with real product lines)
 *     Lines are loaded in one batch query by quoteId and joined before mapping.
 *     Each OperationalOrderLine carries metadata: talla, color, bodega, vat, estadoPedido.
 *
 *   CRMOpportunity    → OperationalOpportunity
 *     referenceLines extracted from rawCrmJson opportunistically.
 *
 *   CRMActivity       → OperationalSalesActivity
 *
 *   CustomerProfile   → OperationalCustomer
 *     Only profiles with crmId or crmSyncedAt are included.
 *
 * ─── PERFORMANCE NOTES ───────────────────────────────────────────────────────
 * This provider is designed for request-time use (no background jobs).
 * All queries use Prisma's selective field projection (`select:`) to avoid
 * loading rawCrmJson (potentially large) unless needed.
 *
 * Sprint: AGENTIK-CRM-INTEGRATION-AUDIT-AND-OPERATIONAL-UPGRADE-01
 */

import { prisma } from "@/lib/prisma";
import type { IOperationalDataProvider }           from "../operational-provider";
import type { OperationalSourceMetadata }          from "../operational-source";
import type {
  OperationalCustomer,
  OperationalOrder,
  OperationalSalesRep,
  OperationalOpportunity,
  OperationalSalesActivity,
} from "../operational-entities";
import {
  mapPrismaCustomerProfileToOperational,
  mapPrismaCrmQuoteToOperationalOrder,
  mapPrismaCrmOpportunityToOperational,
  mapPrismaCrmActivityToOperational,
} from "../mappers/crm/index";
import type {
  PrismaCustomerProfileShape,
  PrismaCrmQuoteShape,
  PrismaCrmQuoteLineShape,
  PrismaCrmOpportunityShape,
  PrismaCrmActivityShape,
} from "../mappers/crm/index";

// ─── Provider ─────────────────────────────────────────────────────────────────

export class CrmCommercialProvider implements IOperationalDataProvider {
  readonly source = "crm" as const;

  getSourceMetadata(): OperationalSourceMetadata {
    return {
      source:                "crm",
      displayName:           "CRM Castillitos (SuiteCRM)",
      trustScore:            0.85,
      isLive:                false,  // sync-based, not real-time
      lastSyncAt:            null,   // TODO: read from ConnectorRun
      typicalFreshnessSec:   3600,   // 1-hour typical sync cadence
      isAvailable:           true,
    };
  }

  // ── getOrders: CRMQuote + CRMQuoteLine → OperationalOrder ────────────────

  async getOrders(
    organizationId: string,
    since?: Date,
  ): Promise<OperationalOrder[]> {
    // Step 1: Load all relevant quotes
    const quoteRows = await prisma.cRMQuote.findMany({
      where: {
        organizationId,
        ...(since ? { updatedAt: { gte: since } } : {}),
        // Exclude terminal non-relevant statuses from operational feed
        status: { notIn: ["EXPIRED"] },
      },
      select: {
        id:            true,
        organizationId: true,
        crmId:         true,
        customerId:    true,
        opportunityId: true,
        quoteNumber:   true,
        status:        true,
        amount:        true,
        currency:      true,
        issuedAt:      true,
        expiresAt:     true,
        respondedAt:   true,
        sellerSlug:    true,
        sellerName:    true,
        updatedAt:     true,
        rawCrmJson:    true,
      },
      orderBy: { issuedAt: "desc" },
    });

    if (quoteRows.length === 0) return [];

    // Step 2: Batch-load all CRMQuoteLine rows for these quotes
    const quoteIds = quoteRows.map(q => q.id);
    const lineRows = await prisma.cRMQuoteLine.findMany({
      where: { organizationId, quoteId: { in: quoteIds } },
      select: {
        id:            true,
        organizationId: true,
        crmId:         true,
        quoteId:       true,
        quoteCrmId:    true,
        productCrmId:  true,
        reference:     true,
        productName:   true,
        qty:           true,
        unitPrice:     true,
        listPrice:     true,
        totalPrice:    true,
        discount:      true,
        discountAmount: true,
        vatRate:       true,
        vatAmount:     true,
        size:          true,
        color:         true,
        warehouseName: true,
        warehouseId:   true,
        status:        true,
        syncedAt:      true,
      },
    });

    // Step 3: Group lines by quoteId for O(1) lookup
    const linesByQuoteId = new Map<string, PrismaCrmQuoteLineShape[]>();
    for (const row of lineRows) {
      if (!row.quoteId) continue;
      const shape: PrismaCrmQuoteLineShape = {
        id:             row.id,
        organizationId: row.organizationId,
        crmId:          row.crmId,
        quoteId:        row.quoteId,
        quoteCrmId:     row.quoteCrmId,
        productCrmId:   row.productCrmId,
        reference:      row.reference,
        productName:    row.productName,
        qty:            row.qty.toNumber(),
        unitPrice:      row.unitPrice.toNumber(),
        listPrice:      row.listPrice.toNumber(),
        totalPrice:     row.totalPrice.toNumber(),
        discount:       row.discount.toNumber(),
        discountAmount: row.discountAmount.toNumber(),
        vatRate:        row.vatRate.toNumber(),
        vatAmount:      row.vatAmount.toNumber(),
        size:           row.size,
        color:          row.color,
        warehouseName:  row.warehouseName,
        warehouseId:    row.warehouseId,
        status:         row.status,
        syncedAt:       row.syncedAt.toISOString(),
      };
      const existing = linesByQuoteId.get(row.quoteId) ?? [];
      existing.push(shape);
      linesByQuoteId.set(row.quoteId, existing);
    }

    // Step 4: Map quotes + joined lines → OperationalOrder[]
    return quoteRows.map(row => {
      const quoteShape: PrismaCrmQuoteShape = {
        id:             row.id,
        organizationId: row.organizationId,
        crmId:          row.crmId,
        customerId:     row.customerId,
        opportunityId:  row.opportunityId,
        quoteNumber:    row.quoteNumber,
        status:         row.status as string,
        amount:         row.amount.toNumber(),
        currency:       row.currency,
        issuedAt:       row.issuedAt.toISOString(),
        expiresAt:      row.expiresAt?.toISOString() ?? null,
        respondedAt:    row.respondedAt?.toISOString() ?? null,
        sellerSlug:     row.sellerSlug,
        sellerName:     row.sellerName,
        updatedAt:      row.updatedAt.toISOString(),
        rawCrmJson:     row.rawCrmJson as Record<string, unknown> | null,
      };
      const lines = linesByQuoteId.get(row.id);
      return mapPrismaCrmQuoteToOperationalOrder(quoteShape, organizationId, lines);
    });
  }

  // ── getCustomers: CustomerProfile (CRM) → OperationalCustomer ─────────────

  async getCustomers(organizationId: string): Promise<OperationalCustomer[]> {
    const rows = await prisma.customerProfile.findMany({
      where: {
        organizationId,
        // Only include profiles that have been touched by CRM sync
        crmId: { not: null },
      },
      select: {
        id:            true,
        organizationId: true,
        slug:          true,
        name:          true,
        crmId:         true,
        nit:           true,
        email:         true,
        phone:         true,
        city:          true,
        department:    true,
        sellerName:    true,
        sellerSlug:    true,
        customerType:  true,
        crmSyncedAt:   true,
        updatedAt:     true,
      },
      orderBy: { name: "asc" },
    });

    return rows.map(row => {
      const shape: PrismaCustomerProfileShape = {
        id:             row.id,
        organizationId: row.organizationId,
        slug:           row.slug,
        name:           row.name,
        crmId:          row.crmId,
        nit:            row.nit,
        email:          row.email,
        phone:          row.phone,
        city:           row.city,
        department:     row.department,
        sellerName:     row.sellerName,
        sellerSlug:     row.sellerSlug,
        customerType:   row.customerType,
        crmSyncedAt:    row.crmSyncedAt?.toISOString() ?? null,
        updatedAt:      row.updatedAt.toISOString(),
      };
      return mapPrismaCustomerProfileToOperational(shape, organizationId);
    });
  }

  // ── getSalesReps: not available from CRM directly ──────────────────────────
  // Sales reps in the CRM are assigned_user_name fields on records.
  // A proper getSalesReps() requires fetching the SuiteCRM Users module.
  // For now: return empty — SAG provider covers sales rep data.

  async getSalesReps(_organizationId: string): Promise<OperationalSalesRep[]> {
    return [];
  }

  // ── getOpportunities: CRMOpportunity → OperationalOpportunity ─────────────

  async getOpportunities(organizationId: string): Promise<OperationalOpportunity[]> {
    const rows = await prisma.cRMOpportunity.findMany({
      where: {
        organizationId,
        // Only active opportunities — closed ones reduce signal noise
        status: { in: ["OPEN"] },
      },
      select: {
        id:             true,
        organizationId: true,
        crmId:          true,
        customerId:     true,
        title:          true,
        stage:          true,
        amount:         true,
        currency:       true,
        probability:    true,
        status:         true,
        lossReason:     true,
        lossNote:       true,
        sellerSlug:     true,
        sellerName:     true,
        openedAt:       true,
        expectedCloseAt: true,
        closedAt:       true,
        lastActivityAt: true,
        updatedAt:      true,
        rawCrmJson:     true,
      },
      orderBy: { expectedCloseAt: "asc" },
    });

    return rows.map(row => {
      const shape: PrismaCrmOpportunityShape = {
        id:             row.id,
        organizationId: row.organizationId,
        crmId:          row.crmId,
        customerId:     row.customerId,
        title:          row.title,
        stage:          row.stage,
        amount:         row.amount.toNumber(),
        currency:       row.currency,
        probability:    row.probability,
        status:         row.status as string,
        lossReason:     row.lossReason,
        lossNote:       row.lossNote,
        sellerSlug:     row.sellerSlug,
        sellerName:     row.sellerName,
        openedAt:       row.openedAt.toISOString(),
        expectedCloseAt: row.expectedCloseAt?.toISOString() ?? null,
        closedAt:       row.closedAt?.toISOString() ?? null,
        lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
        updatedAt:      row.updatedAt.toISOString(),
        rawCrmJson:     row.rawCrmJson as Record<string, unknown> | null,
      };
      return mapPrismaCrmOpportunityToOperational(shape, organizationId);
    });
  }

  // ── getSalesActivities: CRMActivity → OperationalSalesActivity ─────────────

  async getSalesActivities(
    organizationId: string,
    since?: Date,
  ): Promise<OperationalSalesActivity[]> {
    const rows = await prisma.cRMActivity.findMany({
      where: {
        organizationId,
        ...(since ? { occurredAt: { gte: since } } : {}),
      },
      select: {
        id:             true,
        organizationId: true,
        crmId:          true,
        customerId:     true,
        opportunityId:  true,
        type:           true,
        subject:        true,
        body:           true,
        outcome:        true,
        sellerSlug:     true,
        sellerName:     true,
        occurredAt:     true,
        dueAt:          true,
        completedAt:    true,
      },
      orderBy: { occurredAt: "desc" },
      take:    500,   // cap at 500 most recent — context builders should pass `since`
    });

    return rows.map(row => {
      const shape: PrismaCrmActivityShape = {
        id:             row.id,
        organizationId: row.organizationId,
        crmId:          row.crmId,
        customerId:     row.customerId,
        opportunityId:  row.opportunityId,
        type:           row.type as string,
        subject:        row.subject,
        body:           row.body,
        outcome:        row.outcome,
        sellerSlug:     row.sellerSlug,
        sellerName:     row.sellerName,
        occurredAt:     row.occurredAt.toISOString(),
        dueAt:          row.dueAt?.toISOString() ?? null,
        completedAt:    row.completedAt?.toISOString() ?? null,
      };
      return mapPrismaCrmActivityToOperational(shape, organizationId);
    });
  }
}

// ─── Singleton factory ────────────────────────────────────────────────────────

let _instance: CrmCommercialProvider | null = null;

/**
 * Returns a singleton CrmCommercialProvider instance.
 * Safe to call multiple times — returns the same object.
 */
export function getCrmCommercialProvider(): CrmCommercialProvider {
  if (!_instance) _instance = new CrmCommercialProvider();
  return _instance;
}
