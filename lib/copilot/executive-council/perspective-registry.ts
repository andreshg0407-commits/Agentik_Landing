// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 3: Perspective Registry

import type { CouncilPerspective } from "./executive-council-types";

export interface PerspectiveDefinition {
  readonly id:           CouncilPerspective;
  readonly label:        string;
  readonly description:  string;
  readonly weight:       number;  // 0–1 vote weight
  readonly domains:      string[];
  readonly focusAreas:   string[];
}

export const PERSPECTIVE_REGISTRY: Record<CouncilPerspective, PerspectiveDefinition> = {
  FINANCE: {
    id:          "FINANCE",
    label:       "Perspectiva Financiera",
    description: "Evalúa desde costo, rentabilidad, flujo de caja y salud financiera",
    weight:      1.0,
    domains:     ["FINANCE"],
    focusAreas:  ["liquidez", "rentabilidad", "deuda", "flujo de caja", "presupuesto"],
  },
  COMMERCIAL: {
    id:          "COMMERCIAL",
    label:       "Perspectiva Comercial",
    description: "Evalúa desde ventas, clientes, cartera y crecimiento de ingresos",
    weight:      1.0,
    domains:     ["COMMERCIAL"],
    focusAreas:  ["ventas", "clientes", "cartera", "crecimiento", "canales"],
  },
  OPERATIONS: {
    id:          "OPERATIONS",
    label:       "Perspectiva Operativa",
    description: "Evalúa desde eficiencia, procesos, capacidad y ejecución",
    weight:      0.9,
    domains:     ["OPERATIONS"],
    focusAreas:  ["eficiencia", "procesos", "capacidad", "ejecución", "calidad"],
  },
  MARKETING: {
    id:          "MARKETING",
    label:       "Perspectiva de Marketing",
    description: "Evalúa desde marca, posicionamiento, campañas y adquisición",
    weight:      0.8,
    domains:     ["MARKETING"],
    focusAreas:  ["marca", "posicionamiento", "adquisición", "campañas", "retención"],
  },
  COLLECTIONS: {
    id:          "COLLECTIONS",
    label:       "Perspectiva de Cobranza",
    description: "Evalúa desde cobros, cartera vencida, recuperación y riesgo de crédito",
    weight:      0.9,
    domains:     ["FINANCE", "COMMERCIAL"],
    focusAreas:  ["cobros", "cartera vencida", "recuperación", "riesgo de crédito"],
  },
  EXECUTIVE: {
    id:          "EXECUTIVE",
    label:       "Perspectiva Ejecutiva",
    description: "Visión transversal de prioridades estratégicas y alineamiento organizacional",
    weight:      1.0,
    domains:     ["EXECUTIVE", "CROSS_DOMAIN"],
    focusAreas:  ["prioridades", "alineamiento", "visión", "gobierno", "decisiones"],
  },
  STRATEGY: {
    id:          "STRATEGY",
    label:       "Perspectiva Estratégica",
    description: "Evalúa desde objetivos de largo plazo, posicionamiento competitivo y horizonte",
    weight:      1.0,
    domains:     ["EXECUTIVE"],
    focusAreas:  ["objetivos", "horizonte", "competencia", "posicionamiento", "crecimiento"],
  },
  RISK: {
    id:          "RISK",
    label:       "Perspectiva de Riesgo",
    description: "Evalúa exposición al riesgo, vulnerabilidades y capacidad de mitigación",
    weight:      1.0,
    domains:     ["COMPLIANCE", "CROSS_DOMAIN"],
    focusAreas:  ["exposición", "mitigación", "vulnerabilidades", "contingencias"],
  },
  COMPLIANCE: {
    id:          "COMPLIANCE",
    label:       "Perspectiva de Cumplimiento",
    description: "Evalúa adherencia regulatoria, controles internos y obligaciones legales",
    weight:      0.9,
    domains:     ["COMPLIANCE"],
    focusAreas:  ["regulatorio", "controles", "auditoría", "obligaciones", "normativa"],
  },
  CUSTOM: {
    id:          "CUSTOM",
    label:       "Perspectiva Personalizada",
    description: "Perspectiva adicional definida por el tenant",
    weight:      0.7,
    domains:     ["CROSS_DOMAIN"],
    focusAreas:  ["personalizado"],
  },
};

export function getPerspectiveDefinition(p: CouncilPerspective): PerspectiveDefinition {
  return PERSPECTIVE_REGISTRY[p];
}

export function getPerspectiveWeight(p: CouncilPerspective): number {
  return PERSPECTIVE_REGISTRY[p].weight;
}

export const DEFAULT_COUNCIL_PERSPECTIVES: CouncilPerspective[] = [
  "FINANCE", "COMMERCIAL", "OPERATIONS", "STRATEGY", "RISK",
];

export const FULL_COUNCIL_PERSPECTIVES: CouncilPerspective[] = [
  "FINANCE", "COMMERCIAL", "OPERATIONS", "MARKETING",
  "COLLECTIONS", "EXECUTIVE", "STRATEGY", "RISK", "COMPLIANCE",
];
