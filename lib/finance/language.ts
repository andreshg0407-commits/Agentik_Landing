/**
 * lib/finance/language.ts
 *
 * Agentik Enterprise OS — Diccionario de lenguaje financiero-operacional.
 *
 * Propósito: evitar mezcla de inglés, lenguaje SaaS genérico o copias inconsistentes
 * en el módulo financiero. Fuente de verdad para copy operacional.
 *
 * ── REGLAS DE TONO AGENTIK FINANCE ──────────────────────────────────────────
 *
 *  1. No usar inglés visible si existe alternativa clara en español.
 *  2. No usar botones genéricos tipo "Ver detalle" cuando puede existir una acción.
 *  3. El copy debe comunicar decisión, riesgo o consecuencia.
 *  4. El lenguaje debe ser entendible para una empresa tradicional.
 *  5. El sistema debe sonar ejecutivo, no técnico.
 *  6. El usuario debe sentir que Agentik opera el negocio, no que muestra pantallas.
 *  7. Cada CTA debe responder: "¿qué acción concreta hago ahora?"
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────────────
// DICCIONARIO — términos reemplazados
// ─────────────────────────────────────────────────────────────────────────────

export const FINANCE_LANGUAGE = {
  // Infraestructura financiera
  runway:              "Cobertura Operacional",
  runwayDays:          "días cubiertos",
  forecast:            "Proyección",
  insight:             "Señal",
  simulation:          "Escenario",
  newSimulation:       "Crear escenario",
  impact:              "Consecuencia",
  impactEstimated:     "Consecuencia estimada",
  impactOperational:   "Consecuencia operativa",
  impactCash:          "Efecto en caja",
  impactMargin:        "Efecto en margen",
  impactBudget:        "Efecto presupuestal",
  riskProjected:       "Riesgo proyectado",

  // Secciones
  activeBudgets:        "Presupuestos Activos",
  executionVsPlan:      "Ejecución frente al Plan",
  recommendations:      "Señales y decisiones Agentik",
  simulationsSection:   "Simulaciones y Escenarios",
  motorSection:         "Motor de Presupuestos",

  // Capas
  layerBudget:         "Presupuesto vivo",
  layerExecution:      "Ejecución presupuestal",
  layerIntelligence:   "Escenarios y decisiones",

  // Detalle de presupuesto
  consumptionTimeline: "Evolución del consumo",
  budgetConnections:   "Conexiones del presupuesto",
  budgetScenarios:     "Escenarios sobre este presupuesto",
  recalibrate:         "Recalibrar presupuesto",

  // Textos contextuales
  scenarioCreatorDesc: "Define una decisión futura y Agentik proyectará sus consecuencias financieras.",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — CTAs dinámicos por estado o tipo
// ─────────────────────────────────────────────────────────────────────────────

export type BudgetStatus =
  | "activo"
  | "en_riesgo"
  | "sobre_ritmo"
  | "subejecutado"
  | "agotado"
  | "pausado";

/**
 * Retorna el CTA correcto para el botón de acción de un presupuesto.
 * El texto describe la acción empresarial, no la pantalla de destino.
 */
export function getBudgetActionLabel(status: BudgetStatus): string {
  const map: Record<BudgetStatus, string> = {
    en_riesgo:    "Corregir desviación",
    sobre_ritmo:  "Controlar consumo",
    subejecutado: "Reasignar recursos",
    activo:       "Revisar ejecución",
    agotado:      "Resolver agotamiento",
    pausado:      "Reactivar seguimiento",
  };
  return map[status];
}

export type ScenarioType =
  | "ventas_bajan"
  | "marketing_dobla"
  | "expansion"
  | "inversion_aumenta"
  | "recorte"
  | "reasignar"
  | "cobertura";

/**
 * Retorna el CTA correcto para un escenario financiero.
 */
export function getScenarioActionLabel(type: ScenarioType): string {
  const map: Record<ScenarioType, string> = {
    ventas_bajan:       "Proyectar caída",
    marketing_dobla:    "Evaluar inversión",
    expansion:          "Proyectar expansión",
    inversion_aumenta:  "Proyectar inversión",
    recorte:            "Evaluar recorte",
    reasignar:          "Reasignar excedente",
    cobertura:          "Proyectar cobertura",
  };
  return map[type];
}

export type RecommendationType =
  | "alerta_presupuesto"
  | "reasignacion"
  | "velocidad"
  | "oportunidad"
  | "proyeccion";

/**
 * Retorna el CTA correcto para una recomendación Agentik.
 */
export function getRecommendationActionLabel(type: RecommendationType): string {
  const map: Record<RecommendationType, string> = {
    alerta_presupuesto: "Corregir presupuesto",
    reasignacion:       "Reasignar recursos",
    velocidad:          "Proyectar abastecimiento",
    oportunidad:        "Validar ahorro",
    proyeccion:         "Revisar cobertura",
  };
  return map[type];
}
