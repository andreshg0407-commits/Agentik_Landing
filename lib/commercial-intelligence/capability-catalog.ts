/**
 * capability-catalog.ts
 *
 * CASTILLITOS-EXECUTIVE-REPORTS-01
 * Registered capabilities for Commercial Intelligence.
 *
 * These capabilities are discoverable by:
 * - Executive Dashboard
 * - David (copilot)
 * - Decision Engine
 * - Action Engine
 * - Alert Center
 * - Future modules
 *
 * No Prisma. No React. No server-only. Pure domain types.
 */

/** A registered intelligence capability. */
export interface IntelligenceCapability {
  /** Unique capability ID. */
  id: string;
  /** Display name. */
  name: string;
  /** Description of what this capability does. */
  description: string;
  /** Business domain. */
  domain: string;
  /** Input requirements. */
  inputs: string[];
  /** Output types produced. */
  outputs: string[];
  /** Signal types this capability can generate. */
  signalTypes: string[];
  /** Modules that can consume this capability. */
  consumers: string[];
}

/** Commercial Intelligence capabilities. */
export const COMMERCIAL_INTELLIGENCE_CAPABILITIES: IntelligenceCapability[] = [
  {
    id: "commercial_availability_intelligence",
    name: "Commercial Availability Intelligence",
    description:
      "Calcula el disponible real por referencia descontando pedidos pendientes del inventario en Bodega 01. " +
      "Agrupa por SubLinea, SubGrupo y Referencia.",
    domain: "commercial",
    inputs: [
      "SagAvailabilityRecord[] — registros SAG de inventario con bodega, pedidos, existencia",
    ],
    outputs: [
      "CommercialAvailabilityReport — reporte completo con desglose por SubLinea/SubGrupo",
    ],
    signalTypes: [
      "INVENTORY_LOW",
      "INVENTORY_UNAVAILABLE",
      "INVENTORY_AVAILABLE",
    ],
    consumers: [
      "Executive Dashboard",
      "David (Copilot)",
      "Decision Engine",
      "Action Engine",
      "Alert Center",
      "Mobile",
    ],
  },
  {
    id: "portfolio_replacement_intelligence",
    name: "Portfolio Replacement Intelligence",
    description:
      "Identifica referencias que deben salir de maletas de vendedores segun reglas por SubLinea. " +
      "Detecta vendedores afectados. Genera recomendaciones sin ejecutar acciones.",
    domain: "commercial",
    inputs: [
      "AvailabilityRow[] — resultados del motor de disponibilidad",
      "SellerMaletaRecord[] — inventario actual en maletas de vendedores",
      "MaletaReplacementRule[] — reglas de umbral por SubLinea",
    ],
    outputs: [
      "MaletaReplacementReport — items que necesitan reemplazo con vendedores afectados",
    ],
    signalTypes: [
      "MALLETA_REPLACEMENT_REQUIRED",
    ],
    consumers: [
      "Executive Dashboard",
      "David (Copilot)",
      "Decision Engine",
      "Action Engine",
      "Alert Center",
    ],
  },
];
