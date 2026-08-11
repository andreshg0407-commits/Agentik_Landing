/**
 * lib/comercial/executive/commercial-executive-reports.ts
 *
 * Sprint: AGENTIK-COMMERCIAL-MOBILE-EXECUTIVE-B02
 *
 * Permanent report catalog for executive mobile/tablet presentation.
 *
 * Reports consume canonical facts already computed by the PA/snapshot.
 * No report-specific reimplementation of business calculations.
 *
 * PURE: no Prisma, no LLM, no React, no viewport.
 */

import type { ControlComercialSnapshot } from "../control/control-comercial-loader";
import type { ExecutiveReport, ReportId } from "./commercial-executive-types";

// ── Report definitions ──────────────────────────────────────────────────────

interface ReportDefinition {
  id: ReportId;
  title: string;
  description: string;
  domain: ExecutiveReport["domain"];
  pathSuffix: string;
  availableWhen: (s: ControlComercialSnapshot) => boolean;
}

const REPORT_CATALOG: ReportDefinition[] = [
  {
    id: "resumen-ejecutivo",
    title: "Resumen Comercial Ejecutivo",
    description: "Vision general del estado comercial: ventas, pedidos, cartera, inventario.",
    domain: "ventas",
    pathSuffix: "executive",
    availableWhen: () => true,
  },
  {
    id: "ventas-ritmo",
    title: "Ventas y ritmo",
    description: "Ventas del mes, semana y dia. Ticket promedio y volumen de pedidos.",
    domain: "ventas",
    pathSuffix: "ventas",
    availableWhen: (s) => s.ventasMes > 0 || s.pedidosMes > 0,
  },
  {
    id: "cartera",
    title: "Cartera",
    description: "Cartera total, vencida, concentracion de mora y clientes en riesgo.",
    domain: "cartera",
    pathSuffix: "clientes",
    availableWhen: (s) => s.cartera.carteraTotal > 0,
  },
  {
    id: "vendedores",
    title: "Vendedores",
    description: "Ranking de vendedores, actividad y cobertura comercial.",
    domain: "vendedores",
    pathSuffix: "vendedores",
    availableWhen: (s) => s.vendedoresOperativos > 0,
  },
  {
    id: "tiendas",
    title: "Tiendas",
    description: "Estado de la red de tiendas, cobertura y desempeno por punto.",
    domain: "tiendas",
    pathSuffix: "tiendas",
    availableWhen: () => true,
  },
  {
    id: "importaciones",
    title: "Importaciones",
    description: "Rotacion, recompra, inventario lento y capital inmovilizado.",
    domain: "importaciones",
    pathSuffix: "importaciones",
    availableWhen: () => true,
  },
];

// ── Main assembler ──────────────────────────────────────────────────────────

/**
 * Builds the permanent report catalog with availability flags.
 *
 * DETERMINISTIC: same snapshot → same output.
 */
export function assembleExecutiveReports(
  snapshot: ControlComercialSnapshot,
  orgSlug: string,
): ExecutiveReport[] {
  return REPORT_CATALOG.map(def => ({
    id: def.id,
    title: def.title,
    description: def.description,
    domain: def.domain,
    deepLink: `/${orgSlug}/comercial/${def.pathSuffix}`,
    available: def.availableWhen(snapshot),
  }));
}
