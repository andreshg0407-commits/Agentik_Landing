/**
 * lib/comercial/pedidos/order-history-types.ts
 *
 * Types for customer and seller commercial history.
 * No Prisma — runs on client and server.
 *
 * Sprint: COMERCIAL-PEDIDOS-DOCUMENTO-HISTORIAL-03
 * Sprint: COMERCIAL-PEDIDOS-HIBRIDO-SAG-AGENTIK
 */

// ── Customer history ──────────────────────────────────────────────────────────

export interface CustomerOrderHistory {
  customerCode:      string;
  customerName:      string;
  totalOrders:       number;
  totalUnits:        number;
  totalValue:        number;
  firstOrderDate:    string | null;
  lastOrderDate:     string | null;
  orders:            CustomerOrderEntry[];
  /** Aggregated product preferences */
  preferences:       CustomerPreferences;
}

export interface CustomerOrderEntry {
  orderId:        string;
  consecutivo:    number;
  date:           string;
  sellerName:     string;
  channel:        string;
  totalUnits:     number;
  totalValue:     number;
  status:         string;
  /** Origin: agentik | sag | importado | migrado */
  origin:         string;
  references:     string[];
}

export interface CustomerPreferences {
  topReferences:  FrequencyItem[];
  topSizes:       FrequencyItem[];
  topColors:      FrequencyItem[];
  topLines:       FrequencyItem[];
  /** References bought once and never repeated */
  oneTimeBuys:    string[];
}

export interface FrequencyItem {
  value:    string;
  count:    number;
  lastSeen: string;
}

// ── Seller history ────────────────────────────────────────────────────────────

export interface SellerOrderHistory {
  sellerName:        string;
  totalOrders:       number;
  totalSynced:       number;
  totalDrafts:       number;
  totalConflicts:    number;
  totalCancelled:    number;
  totalValue:        number;
  totalUnits:        number;
  uniqueCustomers:   number;
  orders:            SellerOrderEntry[];
}

export interface SellerOrderEntry {
  orderId:        string;
  consecutivo:    number;
  date:           string;
  customerName:   string;
  totalUnits:     number;
  totalValue:     number;
  status:         string;
  /** Origin: agentik | sag | importado | migrado */
  origin:         string;
}
