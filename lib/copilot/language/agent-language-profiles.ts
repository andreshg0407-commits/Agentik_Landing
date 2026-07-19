/**
 * lib/copilot/language/agent-language-profiles.ts
 *
 * Agentik Copilot — Language System: Agent Language Profiles
 * Sprint: AGENTIK-COPILOT-LANGUAGE-SYSTEM-01
 *
 * Language profiles per agent identity.
 * Each profile defines how a specific agent presents information to users.
 *
 * Rules:
 *   - Profiles define language only. No logic. No UI. No runtime.
 *   - All labels must comply with the Forbidden Terms list.
 *   - Missing dictionary keys fall back to BASE_LANGUAGE.
 *   - sectionLabels are required and always override BASE_LANGUAGE section keys.
 */

import type { AgentLanguageProfile } from "./language-types";

// ── Diego — Inteligencia Financiera ───────────────────────────────────────────

export const DIEGO_LANGUAGE_PROFILE: AgentLanguageProfile = {
  agentId:   "diego",
  agentName: "Diego",

  dictionary: {
    insight:            "hallazgo financiero",
    insights:           "hallazgos financieros",
    suggestion:         "recomendación financiera",
    suggestions:        "recomendaciones financieras",
    opportunity:        "oportunidad financiera",
    opportunities:      "oportunidades financieras",
    attention:          "riesgo detectado",
    attention_items:    "riesgos detectados",
    alert:              "alerta financiera",
    alerts:             "alertas financieras",
    followup:           "seguimiento financiero",
    followups:          "seguimientos financieros",
    active_work:        "trabajando ahora",
    completed_work:     "trabajo completado",
    pending_approval:   "pendiente de aprobación",
    pending_approvals:  "pendientes de aprobación",
    request_inbox:      "consultas",
    domain:             "área financiera",
    context:            "posición financiera actual",
    observation:        "observación financiera",
  },

  sectionLabels: {
    activeWork:       "Trabajando en esto ahora",
    pendingApprovals: "Esperando tu aprobación",
    completedWork:    "Completado recientemente",
    followups:        "Seguimientos financieros",
    suggestions:      "Recomendaciones financieras",
    insights:         "Hallazgos financieros",
    opportunities:    "Proyecciones y oportunidades",
    requestInbox:     "Consultas",
    agentPresence:    "Estado de Diego",
    attentionItems:   "Riesgos detectados",
  },
};

// ── Luca — Inteligencia de Marketing ─────────────────────────────────────────

export const LUCA_LANGUAGE_PROFILE: AgentLanguageProfile = {
  agentId:   "luca",
  agentName: "Luca",

  dictionary: {
    insight:            "oportunidad detectada",
    insights:           "oportunidades detectadas",
    suggestion:         "campaña sugerida",
    suggestions:        "campañas sugeridas",
    opportunity:        "oportunidad de campaña",
    opportunities:      "oportunidades de campaña",
    attention:          "campaña por revisar",
    attention_items:    "campañas por revisar",
    alert:              "alerta de rendimiento",
    alerts:             "alertas de rendimiento",
    followup:           "seguimiento de campaña",
    followups:          "seguimientos de campaña",
    active_work:        "campañas activas",
    completed_work:     "campañas finalizadas",
    pending_approval:   "contenido pendiente de aprobación",
    pending_approvals:  "contenidos pendientes de aprobación",
    request_inbox:      "solicitudes de marketing",
    domain:             "canal",
    context:            "contexto de marketing",
    observation:        "dato relevante",
  },

  sectionLabels: {
    activeWork:       "Campañas activas",
    pendingApprovals: "Contenido pendiente de aprobación",
    completedWork:    "Publicaciones realizadas",
    followups:        "Próximas publicaciones",
    suggestions:      "Campañas sugeridas",
    insights:         "Oportunidades detectadas",
    opportunities:    "Oportunidades de crecimiento",
    requestInbox:     "Solicitudes de marketing",
    agentPresence:    "Estado de Luca",
    attentionItems:   "Campañas por revisar",
  },
};

// ── Mila — Inteligencia Comercial ─────────────────────────────────────────────

export const MILA_LANGUAGE_PROFILE: AgentLanguageProfile = {
  agentId:   "mila",
  agentName: "Mila",

  dictionary: {
    insight:            "cliente por contactar",
    insights:           "clientes por contactar",
    suggestion:         "oportunidad de venta",
    suggestions:        "oportunidades de venta",
    opportunity:        "oportunidad comercial",
    opportunities:      "oportunidades comerciales",
    attention:          "cuenta en riesgo",
    attention_items:    "cuentas en riesgo",
    alert:              "alerta comercial",
    alerts:             "alertas comerciales",
    followup:           "seguimiento comercial",
    followups:          "seguimientos comerciales",
    active_work:        "gestiones en curso",
    completed_work:     "gestiones completadas",
    pending_approval:   "cotización pendiente",
    pending_approvals:  "cotizaciones pendientes",
    request_inbox:      "solicitudes comerciales",
    domain:             "área comercial",
    context:            "contexto comercial",
    observation:        "dato de cliente",
  },

  sectionLabels: {
    activeWork:       "Gestiones en curso",
    pendingApprovals: "Cotizaciones pendientes",
    completedWork:    "Gestiones completadas",
    followups:        "Seguimientos comerciales",
    suggestions:      "Oportunidades de venta",
    insights:         "Clientes por contactar",
    opportunities:    "Oportunidades comerciales",
    requestInbox:     "Solicitudes comerciales",
    agentPresence:    "Estado de Mila",
    attentionItems:   "Cuentas en riesgo",
  },
};

// ── Pablo — Inteligencia Ejecutiva ────────────────────────────────────────────

export const PABLO_LANGUAGE_PROFILE: AgentLanguageProfile = {
  agentId:   "pablo",
  agentName: "Pablo",

  dictionary: {
    insight:            "aspecto relevante",
    insights:           "aspectos relevantes",
    suggestion:         "prioridad estratégica",
    suggestions:        "prioridades estratégicas",
    opportunity:        "decisión clave",
    opportunities:      "decisiones clave",
    attention:          "punto crítico",
    attention_items:    "puntos críticos",
    alert:              "alerta ejecutiva",
    alerts:             "alertas ejecutivas",
    followup:           "seguimiento ejecutivo",
    followups:          "seguimientos ejecutivos",
    active_work:        "en proceso",
    completed_work:     "resuelto",
    pending_approval:   "decisión pendiente",
    pending_approvals:  "decisiones pendientes",
    request_inbox:      "consultas ejecutivas",
    domain:             "área estratégica",
    context:            "situación de la empresa",
    observation:        "punto de atención",
  },

  sectionLabels: {
    activeWork:       "En proceso",
    pendingApprovals: "Decisiones pendientes",
    completedWork:    "Resuelto recientemente",
    followups:        "Seguimientos ejecutivos",
    suggestions:      "Prioridades estratégicas",
    insights:         "Aspectos relevantes",
    opportunities:    "Decisiones clave",
    requestInbox:     "Consultas ejecutivas",
    agentPresence:    "Estado de Pablo",
    attentionItems:   "Puntos críticos",
  },
};

// ── Sofía — Inteligencia Creativa ─────────────────────────────────────────────

export const SOFIA_LANGUAGE_PROFILE: AgentLanguageProfile = {
  agentId:   "sofia",
  agentName: "Sofía",

  dictionary: {
    insight:            "revisión pendiente",
    insights:           "revisiones pendientes",
    suggestion:         "pieza de contenido sugerida",
    suggestions:        "contenido sugerido",
    opportunity:        "activo creativo disponible",
    opportunities:      "activos creativos disponibles",
    attention:          "contenido por revisar",
    attention_items:    "contenidos por revisar",
    alert:              "alerta creativa",
    alerts:             "alertas creativas",
    followup:           "revisión programada",
    followups:          "revisiones programadas",
    active_work:        "contenido en producción",
    completed_work:     "contenido publicado",
    pending_approval:   "contenido pendiente de revisión",
    pending_approvals:  "contenidos pendientes de revisión",
    request_inbox:      "solicitudes creativas",
    domain:             "canal creativo",
    context:            "estado de producción",
    observation:        "nota creativa",
  },

  sectionLabels: {
    activeWork:       "Contenido en producción",
    pendingApprovals: "Revisiones pendientes",
    completedWork:    "Contenido publicado",
    followups:        "Publicaciones programadas",
    suggestions:      "Activos creativos sugeridos",
    insights:         "Revisiones pendientes",
    opportunities:    "Activos creativos disponibles",
    requestInbox:     "Solicitudes creativas",
    agentPresence:    "Estado de Sofía",
    attentionItems:   "Contenidos por revisar",
  },
};

// ── David — Inteligencia de Producto ─────────────────────────────────────────

export const DAVID_LANGUAGE_PROFILE: AgentLanguageProfile = {
  agentId:   "david",
  agentName: "David",

  dictionary: {
    insight:            "hallazgo operativo",
    insights:           "hallazgos operativos",
    suggestion:         "mejora sugerida",
    suggestions:        "mejoras sugeridas",
    opportunity:        "mejora de proceso",
    opportunities:      "mejoras de proceso",
    attention:          "bloqueo detectado",
    attention_items:    "bloqueos detectados",
    alert:              "alerta operativa",
    alerts:             "alertas operativas",
    followup:           "seguimiento operativo",
    followups:          "seguimientos operativos",
    active_work:        "en ejecución",
    completed_work:     "finalizado",
    pending_approval:   "pendiente de validación",
    pending_approvals:  "pendientes de validación",
    request_inbox:      "solicitudes operativas",
    domain:             "proceso",
    context:            "estado operativo",
    observation:        "observación operativa",
  },

  sectionLabels: {
    activeWork:       "En ejecución",
    pendingApprovals: "Pendientes de validación",
    completedWork:    "Finalizado recientemente",
    followups:        "Seguimientos operativos",
    suggestions:      "Mejoras sugeridas",
    insights:         "Hallazgos operativos",
    opportunities:    "Mejoras de proceso",
    requestInbox:     "Solicitudes operativas",
    agentPresence:    "Estado de David",
    attentionItems:   "Bloqueos detectados",
  },
};

// ── Laura — Inteligencia de Recursos Humanos ─────────────────────────────────

export const LAURA_LANGUAGE_PROFILE: AgentLanguageProfile = {
  agentId:   "laura",
  agentName: "Laura",

  dictionary: {
    insight:            "punto relevante de equipo",
    insights:           "puntos relevantes de equipo",
    suggestion:         "acción de personas",
    suggestions:        "acciones de personas",
    opportunity:        "oportunidad de talento",
    opportunities:      "oportunidades de talento",
    attention:          "situación por atender",
    attention_items:    "situaciones por atender",
    alert:              "alerta de equipo",
    alerts:             "alertas de equipo",
    followup:           "seguimiento de persona",
    followups:          "seguimientos de personas",
    active_work:        "gestiones de equipo activas",
    completed_work:     "gestiones completadas",
    pending_approval:   "solicitud pendiente",
    pending_approvals:  "solicitudes pendientes",
    request_inbox:      "solicitudes de equipo",
    domain:             "área de personas",
    context:            "estado del equipo",
    observation:        "nota de equipo",
  },

  sectionLabels: {
    activeWork:       "Gestiones de equipo activas",
    pendingApprovals: "Solicitudes pendientes",
    completedWork:    "Gestiones completadas",
    followups:        "Seguimientos de personas",
    suggestions:      "Acciones de personas",
    insights:         "Puntos relevantes de equipo",
    opportunities:    "Oportunidades de talento",
    requestInbox:     "Solicitudes de equipo",
    agentPresence:    "Estado de Laura",
    attentionItems:   "Situaciones por atender",
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Central registry of all agent language profiles.
 * Keyed by agentId for O(1) lookup in the language resolver.
 */
export const AGENT_LANGUAGE_PROFILES: Readonly<Record<string, AgentLanguageProfile>> = {
  diego:  DIEGO_LANGUAGE_PROFILE,
  luca:   LUCA_LANGUAGE_PROFILE,
  mila:   MILA_LANGUAGE_PROFILE,
  pablo:  PABLO_LANGUAGE_PROFILE,
  sofia:  SOFIA_LANGUAGE_PROFILE,
  david:  DAVID_LANGUAGE_PROFILE,
  laura:  LAURA_LANGUAGE_PROFILE,
};
