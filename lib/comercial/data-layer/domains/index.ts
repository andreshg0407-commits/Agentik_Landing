/**
 * domains/index.ts — Barrel export for domain registry.
 */

export type { CommercialDomainDescriptor } from "./commercial-domain-descriptors";
export {
  PRODUCT_DOMAIN,
  CUSTOMER_DOMAIN,
  INVENTORY_DOMAIN,
  SALES_DOMAIN,
  PURCHASING_IMPORT_DOMAIN,
  STORE_OPERATIONS_DOMAIN,
  PRODUCTION_DOMAIN,
  RECEIVABLES_DOMAIN,
  WORKFORCE_DOMAIN,
  LOGISTICS_DOMAIN,
  ALL_DOMAIN_DESCRIPTORS,
} from "./commercial-domain-descriptors";

export type {
  CommercialDomainRegistry,
  DomainRegistryResult,
  OwnershipValidation,
} from "./commercial-domain-registry";
export { createCommercialDomainRegistry } from "./commercial-domain-registry";
