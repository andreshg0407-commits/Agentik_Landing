/**
 * lib/comercial/frontline/server.ts
 *
 * Server-only barrel for frontline domain services.
 */

import "server-only";

export { resolveCurrentSeller, deriveSellerScope, sellerScopeFilter, customerScopeFilter, orderScopeFilter, portfolioScopeFilter } from "./seller-user-mapping";
export { getCustomerPurchaseHistory, getCustomerTopProducts } from "./customer-purchase-intelligence";
export { getCustomerReceivables, getCustomerCommercialContext } from "./customer-commercial-context";
export { getSellerAttention, emitCustomerOverdueAttention } from "./frontline-attention-service";
