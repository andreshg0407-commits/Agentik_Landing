/**
 * lib/operational-data/mappers/crm/index.ts
 *
 * CRM → Operational mapper consolidation.
 *
 * ─── PURPOSE ─────────────────────────────────────────────────────────────────
 * Single import point for all CRM → Operational mapping.
 *
 * TWO mapper variants exist per entity:
 *
 *   Abstract mappers (Crm Raw*)
 *     Use when mapping from a generic/future CRM source or webhook payload.
 *     Input shape uses Spanish business field names.
 *
 *   Prisma-backed mappers (PrismaCrm*)
 *     Use when reading from Prisma models populated by the connector sync.
 *     Input shape mirrors Prisma model fields exactly.
 *     Called by: CrmCommercialProvider (lib/operational-data/providers/)
 *
 * Sprint: AGENTIK-CRM-INTEGRATION-AUDIT-AND-OPERATIONAL-UPGRADE-01
 */

// ─── Customer ─────────────────────────────────────────────────────────────────
export type { CrmRawCustomer }                          from "./crm-customer-mapper";
export { mapCrmCustomerToOperational,
         mapCrmCustomersToOperational }                 from "./crm-customer-mapper";

export type { PrismaCustomerProfileShape }              from "./crm-customer-mapper";
export { mapPrismaCustomerProfileToOperational,
         mapPrismaCustomerProfilesToOperational }       from "./crm-customer-mapper";

// ─── Order (from CRM Quote) ───────────────────────────────────────────────────
export type { CrmRawOrder, CrmRawOrderLine }            from "./crm-order-mapper";
export { mapCrmOrderToOperational,
         mapCrmOrdersToOperational }                    from "./crm-order-mapper";

export type { PrismaCrmQuoteShape,
              PrismaCrmQuoteLineShape }                  from "./crm-order-mapper";
export { mapPrismaCrmQuoteToOperationalOrder,
         mapPrismaCrmQuotesToOperationalOrders,
         mapPrismaCrmQuoteLineToOperationalLine,
         mapPrismaCrmQuoteLinesToOperationalLines }      from "./crm-order-mapper";

// ─── Opportunity ──────────────────────────────────────────────────────────────
export type { CrmRawOpportunity }                       from "./crm-opportunity-mapper";
export { mapCrmOpportunityToOperational,
         mapCrmOpportunitiesToOperational }             from "./crm-opportunity-mapper";

export type { PrismaCrmOpportunityShape }               from "./crm-opportunity-mapper";
export { mapPrismaCrmOpportunityToOperational,
         mapPrismaCrmOpportunitiesToOperational }       from "./crm-opportunity-mapper";

// ─── Sales Activity ───────────────────────────────────────────────────────────
export type { CrmRawActivity }                          from "./crm-sales-activity-mapper";
export { mapCrmActivityToOperational,
         mapCrmActivitiesToOperational }                from "./crm-sales-activity-mapper";

export type { PrismaCrmActivityShape }                  from "./crm-sales-activity-mapper";
export { mapPrismaCrmActivityToOperational,
         mapPrismaCrmActivitiesToOperational }          from "./crm-sales-activity-mapper";
