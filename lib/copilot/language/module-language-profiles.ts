/**
 * lib/copilot/language/module-language-profiles.ts
 *
 * Agentik Copilot — Language System: Module Language Profiles
 * Sprint: AGENTIK-COPILOT-LANGUAGE-SYSTEM-01
 *
 * Language profiles scoped to product modules.
 * Allows the same agent to change vocabulary depending on which module
 * the user is currently working in.
 *
 * Resolution chain (highest to lowest priority):
 *   module override → agent profile → base language
 *
 * Rules:
 *   - Overrides are partial — only listed keys are overridden.
 *   - No logic. No UI. No runtime dependencies.
 *   - All labels must comply with Forbidden Terms list.
 */

import type { ModuleLanguageProfile } from "./language-types";

// ── Finanzas ───────────────────────────────────────────────────────────────────

export const FINANZAS_LANGUAGE_PROFILE: ModuleLanguageProfile = {
  moduleId:   "finanzas",
  moduleName: "Finanzas",
  overrides: {
    insight:           "hallazgo financiero",
    insights:          "hallazgos financieros",
    suggestion:        "recomendación financiera",
    suggestions:       "recomendaciones financieras",
    opportunity:       "proyección financiera",
    opportunities:     "proyecciones financieras",
    attention:         "riesgo financiero",
    attention_items:   "riesgos financieros",
    followup:          "seguimiento financiero",
    followups:         "seguimientos financieros",
    domain:            "área financiera",
    context:           "posición financiera",
  },
  sectionLabelOverrides: {
    insights:      "Hallazgos financieros",
    suggestions:   "Recomendaciones financieras",
    opportunities: "Proyecciones financieras",
    attentionItems:"Riesgos financieros",
    followups:     "Seguimientos financieros",
  },
};

// ── Conciliación ───────────────────────────────────────────────────────────────

export const CONCILIACION_LANGUAGE_PROFILE: ModuleLanguageProfile = {
  moduleId:   "conciliacion",
  moduleName: "Conciliación",
  overrides: {
    insight:           "movimiento por revisar",
    insights:          "movimientos por revisar",
    suggestion:        "acción de conciliación",
    suggestions:       "acciones de conciliación",
    opportunity:       "movimiento conciliable",
    opportunities:     "movimientos conciliables",
    attention:         "excepción detectada",
    attention_items:   "excepciones detectadas",
    followup:          "seguimiento de conciliación",
    followups:         "seguimientos de conciliación",
    active_work:       "conciliando ahora",
    completed_work:    "conciliado recientemente",
    domain:            "fuente",
    context:           "estado de conciliación",
  },
  sectionLabelOverrides: {
    insights:         "Movimientos por revisar",
    suggestions:      "Acciones de conciliación",
    opportunities:    "Movimientos conciliables",
    attentionItems:   "Excepciones detectadas",
    activeWork:       "Conciliando ahora",
    completedWork:    "Conciliado recientemente",
    followups:        "Seguimientos de conciliación",
  },
};

// ── Cartera ────────────────────────────────────────────────────────────────────

export const CARTERA_LANGUAGE_PROFILE: ModuleLanguageProfile = {
  moduleId:   "cartera",
  moduleName: "Cartera",
  overrides: {
    insight:           "cliente por cobrar",
    insights:          "cobros pendientes",
    suggestion:        "acción de cobro",
    suggestions:       "acciones de cobro",
    opportunity:       "cliente recuperable",
    opportunities:     "clientes recuperables",
    attention:         "cuenta vencida",
    attention_items:   "cuentas vencidas",
    followup:          "seguimiento de cobro",
    followups:         "seguimientos de cobro",
    active_work:       "gestionando cobros",
    completed_work:    "cobros recuperados",
    domain:            "cliente",
    context:           "estado de cartera",
  },
  sectionLabelOverrides: {
    insights:         "Cobros pendientes",
    suggestions:      "Acciones de cobro",
    opportunities:    "Clientes recuperables",
    attentionItems:   "Cuentas vencidas",
    activeWork:       "Gestionando cobros",
    completedWork:    "Cobros recuperados",
    followups:        "Seguimientos de cobro",
  },
};

// ── Tesorería ──────────────────────────────────────────────────────────────────

export const TESORERIA_LANGUAGE_PROFILE: ModuleLanguageProfile = {
  moduleId:   "tesoreria",
  moduleName: "Tesorería",
  overrides: {
    insight:           "movimiento de caja",
    insights:          "movimientos de caja",
    suggestion:        "acción de tesorería",
    suggestions:       "acciones de tesorería",
    opportunity:       "optimización de liquidez",
    opportunities:     "optimizaciones de liquidez",
    attention:         "alerta de liquidez",
    attention_items:   "alertas de liquidez",
    followup:          "seguimiento de tesorería",
    followups:         "seguimientos de tesorería",
    active_work:       "procesando movimientos",
    completed_work:    "movimientos procesados",
    domain:            "cuenta bancaria",
    context:           "posición de caja",
  },
  sectionLabelOverrides: {
    insights:         "Movimientos de caja",
    suggestions:      "Acciones de tesorería",
    opportunities:    "Optimizaciones de liquidez",
    attentionItems:   "Alertas de liquidez",
    activeWork:       "Procesando movimientos",
    completedWork:    "Movimientos procesados",
    followups:        "Seguimientos de tesorería",
  },
};

// ── Cierre ─────────────────────────────────────────────────────────────────────

export const CIERRE_LANGUAGE_PROFILE: ModuleLanguageProfile = {
  moduleId:   "cierre",
  moduleName: "Cierre Contable",
  overrides: {
    insight:           "diferencia detectada",
    insights:          "diferencias detectadas",
    suggestion:        "ajuste sugerido",
    suggestions:       "ajustes sugeridos",
    opportunity:       "registro por completar",
    opportunities:     "registros por completar",
    attention:         "inconsistencia contable",
    attention_items:   "inconsistencias contables",
    followup:          "pendiente de cierre",
    followups:         "pendientes de cierre",
    active_work:       "procesando cierre",
    completed_work:    "cierres completados",
    domain:            "período contable",
    context:           "estado del cierre",
  },
  sectionLabelOverrides: {
    insights:         "Diferencias detectadas",
    suggestions:      "Ajustes sugeridos",
    opportunities:    "Registros por completar",
    attentionItems:   "Inconsistencias contables",
    activeWork:       "Procesando cierre",
    completedWork:    "Cierres completados",
    followups:        "Pendientes de cierre",
  },
};

// ── Planeación ─────────────────────────────────────────────────────────────────

export const PLANEACION_LANGUAGE_PROFILE: ModuleLanguageProfile = {
  moduleId:   "planeacion",
  moduleName: "Planeación",
  overrides: {
    insight:           "proyección",
    insights:          "proyecciones",
    suggestion:        "escenario sugerido",
    suggestions:       "escenarios sugeridos",
    opportunity:       "escenario favorable",
    opportunities:     "escenarios favorables",
    attention:         "riesgo de proyección",
    attention_items:   "riesgos de proyección",
    followup:          "revisión de plan",
    followups:         "revisiones de plan",
    active_work:       "modelando escenarios",
    completed_work:    "escenarios generados",
    domain:            "período",
    context:           "contexto de planeación",
  },
  sectionLabelOverrides: {
    insights:         "Proyecciones",
    suggestions:      "Escenarios sugeridos",
    opportunities:    "Escenarios favorables",
    attentionItems:   "Riesgos de proyección",
    activeWork:       "Modelando escenarios",
    completedWork:    "Escenarios generados",
    followups:        "Revisiones de plan",
  },
};

// ── Marketing ──────────────────────────────────────────────────────────────────

export const MARKETING_LANGUAGE_PROFILE: ModuleLanguageProfile = {
  moduleId:   "marketing",
  moduleName: "Marketing",
  overrides: {
    insight:           "oportunidad de campaña",
    insights:          "oportunidades de campaña",
    suggestion:        "campaña sugerida",
    suggestions:       "campañas sugeridas",
    opportunity:       "audiencia disponible",
    opportunities:     "audiencias disponibles",
    attention:         "campaña por revisar",
    attention_items:   "campañas por revisar",
    followup:          "publicación programada",
    followups:         "publicaciones programadas",
    active_work:       "campañas activas",
    completed_work:    "publicaciones realizadas",
    domain:            "canal",
    context:           "contexto de campaña",
  },
  sectionLabelOverrides: {
    insights:         "Oportunidades de campaña",
    suggestions:      "Campañas sugeridas",
    opportunities:    "Audiencias disponibles",
    attentionItems:   "Campañas por revisar",
    activeWork:       "Campañas activas",
    completedWork:    "Publicaciones realizadas",
    followups:        "Publicaciones programadas",
  },
};

// ── Comercial ──────────────────────────────────────────────────────────────────

export const COMERCIAL_LANGUAGE_PROFILE: ModuleLanguageProfile = {
  moduleId:   "comercial",
  moduleName: "Comercial",
  overrides: {
    insight:           "cliente prioritario",
    insights:          "clientes prioritarios",
    suggestion:        "oportunidad de venta",
    suggestions:       "oportunidades de venta",
    opportunity:       "negocio en progreso",
    opportunities:     "negocios en progreso",
    attention:         "cliente en riesgo",
    attention_items:   "clientes en riesgo",
    followup:          "seguimiento de cliente",
    followups:         "seguimientos de clientes",
    active_work:       "gestiones activas",
    completed_work:    "ventas cerradas",
    domain:            "cliente",
    context:           "estado comercial",
  },
  sectionLabelOverrides: {
    insights:         "Clientes prioritarios",
    suggestions:      "Oportunidades de venta",
    opportunities:    "Negocios en progreso",
    attentionItems:   "Clientes en riesgo",
    activeWork:       "Gestiones activas",
    completedWork:    "Ventas cerradas",
    followups:        "Seguimientos de clientes",
  },
};

// ── Producción ─────────────────────────────────────────────────────────────────

export const PRODUCCION_LANGUAGE_PROFILE: ModuleLanguageProfile = {
  moduleId:   "produccion",
  moduleName: "Producción",
  overrides: {
    insight:           "alerta de producción",
    insights:          "alertas de producción",
    suggestion:        "ajuste sugerido",
    suggestions:       "ajustes sugeridos",
    opportunity:       "optimización disponible",
    opportunities:     "optimizaciones disponibles",
    attention:         "orden por atender",
    attention_items:   "órdenes por atender",
    followup:          "seguimiento de orden",
    followups:         "seguimientos de órdenes",
    active_work:       "órdenes en proceso",
    completed_work:    "órdenes completadas",
    domain:            "línea de producción",
    context:           "estado de producción",
  },
  sectionLabelOverrides: {
    insights:         "Alertas de producción",
    suggestions:      "Ajustes sugeridos",
    opportunities:    "Optimizaciones disponibles",
    attentionItems:   "Órdenes por atender",
    activeWork:       "Órdenes en proceso",
    completedWork:    "Órdenes completadas",
    followups:        "Seguimientos de órdenes",
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Central registry of all module language profiles.
 * Keyed by moduleId for O(1) lookup in the language resolver.
 */
export const MODULE_LANGUAGE_PROFILES: Readonly<Record<string, ModuleLanguageProfile>> = {
  finanzas:     FINANZAS_LANGUAGE_PROFILE,
  conciliacion: CONCILIACION_LANGUAGE_PROFILE,
  cartera:      CARTERA_LANGUAGE_PROFILE,
  tesoreria:    TESORERIA_LANGUAGE_PROFILE,
  cierre:       CIERRE_LANGUAGE_PROFILE,
  planeacion:   PLANEACION_LANGUAGE_PROFILE,
  marketing:    MARKETING_LANGUAGE_PROFILE,
  comercial:    COMERCIAL_LANGUAGE_PROFILE,
  produccion:   PRODUCCION_LANGUAGE_PROFILE,
};
