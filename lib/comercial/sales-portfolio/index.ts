/**
 * lib/comercial/sales-portfolio/index.ts
 *
 * Public entry point for the Sales Portfolio domain.
 *
 * Import pattern for new Agentik modules:
 *   import type { SalesPortfolio, SalesPortfolioItem } from "@/lib/comercial/sales-portfolio";
 *   import { getCommercialTerminology }                from "@/lib/comercial/terminology";
 *
 * Sprint: AGENTIK-COMERCIAL-SALES-PORTFOLIO-TERMINOLOGY-01
 */

export type {
  SalesPortfolio,
  SalesPortfolioItem,
  SalesPortfolioOrderLine,
  SalesPortfolioTransferSuggestion,
  ProductionSuggestionFromPortfolio,
  SalesPortfolioStatus,
  SalesPortfolioItemStatus,
  DraftPortfolioItem,
} from "./sales-portfolio-types";

export { getCommercialTerminology } from "@/lib/comercial/terminology";
export type { CommercialTerminology } from "@/lib/comercial/terminology";
