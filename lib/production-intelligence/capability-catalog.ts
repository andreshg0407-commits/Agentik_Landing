/**
 * capability-catalog.ts
 *
 * CASTILLITOS-EXECUTIVE-REPORTS-01
 * Registered capabilities for Production Intelligence.
 *
 * No Prisma. No React. No server-only. Pure domain types.
 */

import type { IntelligenceCapability } from "@/lib/commercial-intelligence/capability-catalog";

/** Production Intelligence capabilities. */
export const PRODUCTION_INTELLIGENCE_CAPABILITIES: IntelligenceCapability[] = [
  {
    id: "production_in_progress_intelligence",
    name: "Production In Progress Intelligence",
    description:
      "Visualiza produccion en proceso desde Bodega 04. " +
      "Separa por SubLinea (LATIN KIDS, CASTILLITOS, IMPORTACION). " +
      "Calcula dias en produccion y genera observaciones automaticas.",
    domain: "production",
    inputs: [
      "SagProductionRecord[] — movimientos SAG de produccion (OP, CN, PC, EC, ET, T1, T2, Y1)",
    ],
    outputs: [
      "ProductionInProgressReport — reporte con etapas inferidas y dias en produccion",
    ],
    signalTypes: [
      "PRODUCTION_IN_PROGRESS",
      "PRODUCTION_DELAY_RISK",
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
    id: "production_stage_inference",
    name: "Production Stage Inference",
    description:
      "Infiere la etapa actual de produccion utilizando evidencia documental de SAG. " +
      "Etapas configurables (no hardcodeadas). " +
      "Si no hay suficiente evidencia, reporta 'etapa indeterminada' con confianza reducida.",
    domain: "production",
    inputs: [
      "SagProductionRecord[] — registros SAG para una referencia/OP",
      "ProductionStageDefinition[] — definiciones de etapas configurables",
    ],
    outputs: [
      "ProductionStageInference — etapa inferida con evidencia y confianza",
    ],
    signalTypes: [],
    consumers: [
      "Production In Progress Intelligence",
      "David (Copilot)",
      "Decision Engine",
    ],
  },
];
