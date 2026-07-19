/**
 * lib/copilot/operational-memory.ts
 *
 * Agentik Copilot — Operational Memory V1
 *
 * Simulated operational memory — events, detections, and actions
 * that happened in the tenant's operational context.
 *
 * Distinct from getMemoryHints() in agents.ts:
 *   - memoryHints = static capability hints ("puedes comparar X en Y")
 *   - operationalMemory = past events ("Diego detectó X hace 2 días")
 *
 * V1: static per-module registry. V2 will query CopilotActionLog +
 *     CopilotSignalRecord from the DB for real operational history.
 *
 * Sprint: AGENTIK-COPILOT-OPERATIONS-01
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OperationalMemoryItem {
  text:      string;
  relative:  string;   // "hoy", "ayer", "hace 2 días", "esta semana"
  agentName: string;   // "Diego", "Luca", "Mila", "Sofi"
  type:      "detection" | "action" | "finding" | "approval";
}

// ── Module memory registry ────────────────────────────────────────────────────

const MEMORY_BY_PATH: Record<string, OperationalMemoryItem[]> = {

  "finanzas/tesoreria": [
    {
      text:      "Diego identificó cobertura por debajo del umbral objetivo",
      relative:  "ayer",
      agentName: "Diego",
      type:      "detection",
    },
    {
      text:      "Última proyección de cobros: cobertura estimada 28 días",
      relative:  "hace 2 días",
      agentName: "Diego",
      type:      "action",
    },
  ],

  "finanzas/conciliacion": [
    {
      text:      "Conciliación detectó diferencias repetidas en extracto Bancolombia",
      relative:  "hace 3 días",
      agentName: "Diego",
      type:      "finding",
    },
    {
      text:      "Se procesaron 14 cobros identificados en el período",
      relative:  "esta semana",
      agentName: "Diego",
      type:      "action",
    },
  ],

  "finanzas/cierre": [
    {
      text:      "Tesorería aprobó cierre parcial del período anterior",
      relative:  "ayer",
      agentName: "Diego",
      type:      "approval",
    },
    {
      text:      "Diego validó documentos del período — 2 excepciones pendientes",
      relative:  "hace 2 días",
      agentName: "Diego",
      type:      "finding",
    },
  ],

  "finanzas/planeacion": [
    {
      text:      "Diego recalibró proyección de ingresos Q2 basado en desviación detectada",
      relative:  "hace 3 días",
      agentName: "Diego",
      type:      "action",
    },
    {
      text:      "Última simulación financiera: escenario expansión Medellín",
      relative:  "esta semana",
      agentName: "Diego",
      type:      "action",
    },
  ],

  "executive": [
    {
      text:      "Torre de Control consolidó señales de 3 módulos financieros activos",
      relative:  "hoy",
      agentName: "Diego",
      type:      "detection",
    },
    {
      text:      "Diego proyectó impacto de desviación presupuestal en cierre Q2",
      relative:  "ayer",
      agentName: "Diego",
      type:      "action",
    },
  ],

  "agentik/marketing-studio": [
    {
      text:      "Luca generó 3 assets para campaña Q2 Marketing",
      relative:  "ayer",
      agentName: "Luca",
      type:      "action",
    },
    {
      text:      "Simulación de ROI actualizada con métricas de TikTok",
      relative:  "hace 2 días",
      agentName: "Luca",
      type:      "action",
    },
  ],

  "sales": [
    {
      text:      "Mila identificó 5 oportunidades de cierre con alta probabilidad",
      relative:  "hoy",
      agentName: "Mila",
      type:      "detection",
    },
    {
      text:      "Seguimiento automático activado para 3 leads sin respuesta",
      relative:  "ayer",
      agentName: "Mila",
      type:      "action",
    },
  ],

  "customer-360": [
    {
      text:      "Mila actualizó perfiles de 12 clientes con datos de cobros recientes",
      relative:  "esta semana",
      agentName: "Mila",
      type:      "action",
    },
    {
      text:      "Detectados 3 clientes con cartera vencida mayor a 60 días",
      relative:  "ayer",
      agentName: "Mila",
      type:      "detection",
    },
  ],

  "pipeline": [
    {
      text:      "Pipeline actualizado — 2 oportunidades pasaron a negociación",
      relative:  "hoy",
      agentName: "Mila",
      type:      "action",
    },
  ],

  "integrations": [
    {
      text:      "Sofi sincronizó 847 pedidos de Shopify con el pipeline de ventas",
      relative:  "ayer",
      agentName: "Sofi",
      type:      "action",
    },
    {
      text:      "Integración Shopify: tasa de conversión +2.3% vs. semana anterior",
      relative:  "hace 2 días",
      agentName: "Sofi",
      type:      "finding",
    },
  ],

};

const DEFAULT_MEMORY: OperationalMemoryItem[] = [
  {
    text:      "Diego monitoreó señales financieras sin anomalías críticas",
    relative:  "hoy",
    agentName: "Diego",
    type:      "detection",
  },
];

// ── Lookup ────────────────────────────────────────────────────────────────────

/**
 * Returns simulated operational memory for the given pathname.
 * pathname format: /orgSlug/module/submodule
 */
export function getOperationalMemory(pathname: string): OperationalMemoryItem[] {
  const segs = pathname.split("/").filter(Boolean).slice(1); // drop orgSlug
  const path = segs.join("/");

  if (MEMORY_BY_PATH[path]) return MEMORY_BY_PATH[path];

  for (const key of Object.keys(MEMORY_BY_PATH)) {
    if (path.startsWith(key)) return MEMORY_BY_PATH[key];
  }

  return DEFAULT_MEMORY;
}
