/**
 * lib/comercial/terminology.ts
 *
 * Tenant-aware commercial terminology layer.
 *
 * Agentik's core domain uses generic language (Sales Portfolio / Portafolio de venta).
 * Tenant-specific vocabulary is resolved here — never hardcoded in components.
 *
 * Current tenant overrides:
 *   castillitos → "Maletas" vocabulary
 *   default     → "Portafolio de venta" vocabulary
 *
 * Sprint: AGENTIK-COMERCIAL-SALES-PORTFOLIO-TERMINOLOGY-01
 */

export interface CommercialTerminology {
  /** e.g. "Maleta" | "Portafolio de venta" */
  salesPortfolioSingular: string;
  /** e.g. "Maletas" | "Portafolios de venta" */
  salesPortfolioPlural: string;
  /** e.g. "Referencia" | "Producto / referencia" */
  salesPortfolioItem: string;
  /** e.g. "Configurar maleta comercial" | "Configurar portafolio de venta" */
  configureSalesPortfolio: string;
  /** e.g. "Maletas activas" | "Portafolios activos" */
  activeSalesPortfolios: string;
  /** e.g. "Activar maleta" | "Activar portafolio" */
  activatePortfolio: string;
  /** e.g. "Refs en maleta" | "Refs en portafolio" */
  refsInPortfolio: string;
  /** e.g. "Todas las maletas" | "Todos los portafolios" */
  allPortfolios: string;
  /** e.g. "Nueva maleta" | "Nuevo portafolio" */
  newPortfolio: string;
  /** e.g. "Guardar borrador de maleta" | "Guardar borrador" */
  saveDraft: string;
}

const CASTILLITOS_TERMINOLOGY: CommercialTerminology = {
  salesPortfolioSingular:  "Maleta",
  salesPortfolioPlural:    "Maletas",
  salesPortfolioItem:      "Referencia",
  configureSalesPortfolio: "Configurar maleta comercial",
  activeSalesPortfolios:   "Maletas activas",
  activatePortfolio:       "Activar maleta",
  refsInPortfolio:         "Refs en maleta",
  allPortfolios:            "Todas las maletas",
  newPortfolio:             "Nueva maleta",
  saveDraft:                "Guardar borrador",
};

const DEFAULT_TERMINOLOGY: CommercialTerminology = {
  salesPortfolioSingular:  "Portafolio de venta",
  salesPortfolioPlural:    "Portafolios de venta",
  salesPortfolioItem:      "Producto / referencia",
  configureSalesPortfolio: "Configurar portafolio de venta",
  activeSalesPortfolios:   "Portafolios activos",
  activatePortfolio:       "Activar portafolio",
  refsInPortfolio:         "Refs en portafolio",
  allPortfolios:            "Todos los portafolios",
  newPortfolio:             "Nuevo portafolio",
  saveDraft:                "Guardar borrador",
};

/**
 * Returns the correct commercial vocabulary for a given tenant slug.
 * Called once per component render — no memoization needed (pure function).
 */
export function getCommercialTerminology(orgSlug?: string): CommercialTerminology {
  if (orgSlug === "castillitos") return CASTILLITOS_TERMINOLOGY;
  return DEFAULT_TERMINOLOGY;
}
