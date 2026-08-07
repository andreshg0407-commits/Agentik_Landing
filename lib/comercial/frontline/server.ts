/**
 * lib/comercial/frontline/server.ts
 *
 * Server-only barrel for frontline domain services.
 */

import "server-only";

// Frontline Core (AGENTIK-COMMERCIAL-FRONTLINE-CORE-01)
export { resolveCurrentSeller, deriveSellerScope, sellerScopeFilter, customerScopeFilter, orderScopeFilter, portfolioScopeFilter } from "./seller-user-mapping";
export { getCustomerPurchaseHistory, getCustomerTopProducts } from "./customer-purchase-intelligence";
export { getCustomerReceivables, getCustomerCommercialContext } from "./customer-commercial-context";
export { getSellerAttention, emitCustomerOverdueAttention } from "./frontline-attention-service";

// Seller App V1 (AGENTIK-SELLER-APP-V1-01)
export { getSellerInactiveCustomers } from "./seller-inactive-customers";
export { getOrderFulfillmentTimeline, getSellerOrderTimelines } from "./order-fulfillment-timeline";
export { emitSellerNotification, emitSampleWithdrawalNotification, emitNotificationsFromAttention, getInAppNotifications, markNotificationRead, dismissNotification, clearResolvedCondition } from "./seller-notification-service";
export { scanAndNotifyWithdrawals, scanAndNotifyWithdrawalsForSeller } from "./sample-withdrawal-notifier";
export { getSellerAppFeatureFlags, isSellerFeatureEnabled, getSellerAppNavigation, prepareCatalogGenerationRequest } from "./seller-app-features";
