/**
 * vendedor-360-types.ts
 *
 * VENDEDORES-360-01
 * Shared types for Vendedor 360 (importable from client components).
 */

export type Vendedor360BlockState = "disponible" | "no_disponible" | "provisional_sag" | "pendiente_pya";

export interface Vendedor360Identity {
  sellerName: string;
  sellerSlug: string;
  sagName: string | null;
  active: boolean;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  daysSinceLastActivity: number | null;
  crmQuoteCount: number;
  customerCount: number;
  totalCrmAmount: number;
}

export interface Vendedor360Client {
  profileId: string;
  name: string;
  city: string | null;
  status: string;
  lastPurchaseAt: string | null;
  carteraBalance: number;
  quotesCount: number;
}

export interface Vendedor360CrmQuote {
  id: string;
  quoteNumber: string | null;
  amount: number;
  issuedAt: string | null;
  stage: string;
  customerName: string | null;
  sagOrderId: string | null;
}

export interface Vendedor360SagOrder {
  id: string;
  orderNumber: string | null;
  orderDate: string | null;
  amount: number;
  status: string;
  customerName: string | null;
}

export interface Vendedor360CarteraEntry {
  clientName: string;
  balanceDue: number;
  documentsCount: number;
  oldestDueDate: string | null;
  daysOverdue: number;
}

export interface Vendedor360Risk {
  type: string;
  title: string;
  detail: string;
}

export interface Vendedor360Opportunity {
  type: string;
  title: string;
  detail: string;
}

export interface Vendedor360Recommendation {
  type: string;
  title: string;
  detail: string;
}

export interface Vendedor360Intelligence {
  clientesActivos: number;
  clientesSinCompraReciente: number;
  concentracionCartera: { top3Percent: number } | null;
  actividadReciente: { pedidosUltimos30d: number; pedidosUltimos90d: number };
  riesgos: Vendedor360Risk[];
  oportunidades: Vendedor360Opportunity[];
  recomendaciones: Vendedor360Recommendation[];
}

export interface Vendedor360Data {
  identity: Vendedor360Identity;
  clients: { state: Vendedor360BlockState; items: Vendedor360Client[] };
  crmQuotes: { state: Vendedor360BlockState; items: Vendedor360CrmQuote[] };
  sagOrders: { state: Vendedor360BlockState; items: Vendedor360SagOrder[] };
  cartera: { state: Vendedor360BlockState; items: Vendedor360CarteraEntry[]; totalBalance: number };
  recaudos: { state: "pendiente_pya" };
  metas: { state: "pendiente_pya" };
  comisiones: { state: "pendiente_pya" };
  intelligence: Vendedor360Intelligence;
  generatedAt: string;
}
