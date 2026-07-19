/**
 * lib/agentik/ux-language.ts
 *
 * AGENTIK-OPERATIONAL-UX-KIT-01 — Centralized Business Language
 *
 * Spanish LATAM enterprise terms for Agentik.
 * Use these constants instead of English tech jargon in any module.
 *
 * Rule: NO KPI · NO Dashboard · NO Insight · NO Analytics
 *       NO Performance · NO Funnel · NO Health Score · NO Engagement
 */

// ── Jargon replacements ────────────────────────────────────────────────────────

/** Drop-in replacements for English tech jargon. */
export const AG_TERMS = {
  KPI:           "Indicadores del negocio",
  Dashboard:     "Centro de operaciones",
  Insight:       "Señal detectada",
  Analytics:     "Análisis del negocio",
  Performance:   "Rendimiento",
  Funnel:        "Flujo de conversión",
  HealthScore:   "Estado operativo",
  Engagement:    "Interacción",
} as const;

// ── Canonical module labels ────────────────────────────────────────────────────

/** Use these terms consistently across all modules. */
export const AG_LABELS = {
  metrics:         "Indicadores del negocio",
  alerts:          "Alertas importantes",
  recommendations: "Recomendaciones",
  opportunities:   "Oportunidades detectadas",
  risk:            "Riesgo operativo",
  signals:         "Señales del negocio",
  activity:        "Actividad reciente",
  history:         "Historial",
  summary:         "Resumen",
  evolution:       "Evolución",
  relevantData:    "Datos relevantes",
  copilotAnalysis: "Análisis de Sofía",
  suggestedActions:"Acciones sugeridas",
} as const;

// ── State labels ───────────────────────────────────────────────────────────────

/** Connection and data state descriptions. */
export const AG_STATE = {
  connecting:        "Conectando",
  syncing:           "Sincronizando datos",
  ready:             "En línea",
  degraded:          "Con advertencias",
  blocked:           "Requiere acción",
  noData:            "Sin datos disponibles",
  requiresReview:    "Requiere revisión",
  noAlerts:          "Sin alertas activas",
  noIssues:          "Operación dentro de parámetros normales",
} as const;

// ── Common action labels ───────────────────────────────────────────────────────

/** Reusable action labels for buttons and links. */
export const AG_ACTIONS = {
  viewDetail:  "Ver detalle →",
  viewAll:     "Ver todos →",
  connect:     "Conectar",
  configure:   "Configurar",
  retry:       "Reintentar",
  processing:  "Procesando…",
} as const;

// ── Standard drawer section titles ────────────────────────────────────────────

/**
 * Universal drawer section order for all Agentik modules.
 * Follow this sequence — deviations require explicit justification.
 */
export const DRAWER_SECTIONS = [
  "Resumen",
  "Evolución",
  "Datos relevantes",
  "Análisis de Sofía",
  "Acciones sugeridas",
] as const;

export type DrawerSectionTitle = (typeof DRAWER_SECTIONS)[number];

// ── Module connection status ───────────────────────────────────────────────────

/** Timeline steps shared across all modules. Extend per-domain as needed. */
export const AG_ACTIVATION_STEPS = {
  connect:    "Conectar fuente de datos",
  sync:       "Sincronizar información",
  configure:  "Configurar preferencias",
  activate:   "Activar alertas y automatizaciones",
} as const;
