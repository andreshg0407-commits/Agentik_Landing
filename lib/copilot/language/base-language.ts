/**
 * lib/copilot/language/base-language.ts
 *
 * Agentik Copilot — Language System: Base Business Dictionary
 * Sprint: AGENTIK-COPILOT-LANGUAGE-SYSTEM-01
 *
 * Generic business language dictionary.
 * The universal fallback for all agents and modules.
 *
 * Rules:
 *   1. Every value must be understood by a non-technical Latin American business manager.
 *   2. No AI terminology. No SaaS terminology. No architecture terminology.
 *   3. All labels in Spanish (Colombia/LATAM register).
 *   4. Extend freely by adding new keys. Never rename or remove existing keys.
 *   5. No component imports. No React. No runtime logic.
 */

// ── Base dictionary ─────────────────────────────────────────────────────────────

/**
 * Base language dictionary.
 * Maps internal LanguageKeys to user-facing business Spanish labels.
 *
 * Used as the final fallback in the resolution chain:
 *   module override → agent profile → BASE_LANGUAGE → raw key (last resort)
 */
export const BASE_LANGUAGE: Readonly<Record<string, string>> = {

  // ── Core operational concepts ─────────────────────────────────────────────────
  insight:                  "hallazgo",
  insights:                 "hallazgos",
  suggestion:               "recomendación",
  suggestions:              "recomendaciones",
  recommendation:           "recomendación",
  recommendations:          "recomendaciones",
  followup:                 "seguimiento",
  followups:                "seguimientos",
  active_work:              "trabajando ahora",
  completed_work:           "trabajo completado",
  pending_approval:         "esperando aprobación",
  pending_approvals:        "pendientes de aprobación",
  request_inbox:            "solicitudes",
  agent_presence:           "estado del agente",
  opportunity:              "oportunidad",
  opportunities:            "oportunidades detectadas",
  attention:                "punto de atención",
  attention_items:          "puntos de atención",
  alert:                    "alerta",
  alerts:                   "alertas",
  observation:              "observación",
  observations:             "observaciones",
  priority:                 "prioridad",
  risk:                     "riesgo",
  status:                   "estado",
  progress:                 "avance",
  domain:                   "área",

  // ── Architecture concepts → business language ─────────────────────────────────
  workspace:                "oficina del agente",
  context:                  "situación actual",
  capability:               "capacidad disponible",
  capabilities:             "capacidades disponibles",
  snapshot:                 "resumen del momento",
  registry:                 "directorio",
  discovery:                "exploración",
  runtime:                  "sistema activo",
  viewmodel:                "información preparada",
  fixture:                  "datos de referencia",

  // ── Status labels ─────────────────────────────────────────────────────────────
  status_running:           "ejecutando",
  status_analyzing:         "analizando",
  status_paused:            "en pausa",
  status_completed:         "completado",
  status_pending:           "pendiente",
  status_in_progress:       "en proceso",
  status_pending_approval:  "esperando aprobación",
  status_pending_review:    "pendiente de revisión",
  status_blocked:           "bloqueado",
  status_ready:             "listo",

  // ── Priority labels ───────────────────────────────────────────────────────────
  priority_high:            "alta",
  priority_medium:          "media",
  priority_low:             "baja",
  priority_critical:        "crítica",

  // ── Risk labels ───────────────────────────────────────────────────────────────
  risk_high:                "alto",
  risk_medium:              "medio",
  risk_low:                 "bajo",

  // ── Section headers (used in UI panels) ──────────────────────────────────────
  section_active_work:      "Trabajando en esto ahora",
  section_pending_approvals:"Esperando tu aprobación",
  section_completed_work:   "Completado recientemente",
  section_followups:        "Seguimientos programados",
  section_suggestions:      "Recomendaciones",
  section_insights:         "Hallazgos",
  section_opportunities:    "Oportunidades detectadas",
  section_request_inbox:    "Solicitudes",
  section_agent_presence:   "Estado del agente",
  section_attention_items:  "Puntos de atención",

  // ── Time / recency labels ─────────────────────────────────────────────────────
  time_just_now:            "Ahora mismo",
  time_minutes_ago:         "hace {n} minutos",
  time_hours_ago:           "hace {n} horas",
  time_today:               "Hoy",
  time_yesterday:           "Ayer",
  time_this_week:           "Esta semana",

  // ── Action labels ─────────────────────────────────────────────────────────────
  action_approve:           "Aprobar",
  action_review:            "Revisar",
  action_reject:            "Rechazar",
  action_view:              "Ver detalle",
  action_dismiss:           "Descartar",
  action_confirm:           "Confirmar",
  action_assign:            "Asignar",

  // ── Confidence / readiness ────────────────────────────────────────────────────
  readiness_ready:          "Listo",
  readiness_loading:        "Cargando",
  readiness_stale:          "Información desactualizada",
  readiness_blocked:        "Bloqueado",
  readiness_degraded:       "Con advertencias",
  confidence_high:          "Alta confianza",
  confidence_medium:        "Confianza media",
  confidence_low:           "Confianza baja",
  confidence_label:         "Confianza",

  // ── Work board ────────────────────────────────────────────────────────────────
  board_label:              "Mesa de trabajo",
  board_pending_column:     "Pendientes",
  board_in_progress_column: "En progreso",
  board_completed_column:   "Completado",
  board_badge_critical:     "Crítico",
  board_badge_attention:    "Requiere atención",
  board_badge_pending:      "Pendiente",
  board_badge_analyzing:    "Analizando",
  board_badge_reviewed:     "Revisado",
  board_empty_pending:      "Sin elementos pendientes",
  board_empty_in_progress:  "Sin análisis en curso",
  board_empty_completed:    "Sin actividad registrada",

  // ── Agent status widget ───────────────────────────────────────────────────────
  agent_working:            "está trabajando",
  agent_in_progress_badge:  "En progreso",
  last_update_label:        "Última actualización",
  last_update_value:        "Hace 2 minutos",
  next_objective_label:     "Próximo objetivo",
  next_action_header:       "Próximo paso recomendado",
  priority_label_prefix:    "Prioridad",

  // ── Chat ─────────────────────────────────────────────────────────────────────
  chat_header:              "Habla con",
  chat_capabilities_label:  "El agente podrá ayudarte a",
  chat_other_topic:         "Otro tema",
  chat_context_reviewed:    "Estuve revisando el contexto operativo actual.",

  // ── Memory timeline ───────────────────────────────────────────────────────────
  timeline_header:          "Actividad reciente",
  timeline_subtitle:        "Historial reciente",

  // ── Insights list (no forbidden terms) ───────────────────────────────────────
  insights_empty:           "Sin hallazgos para esta situación.",
  insights_overflow:        "hallazgos adicionales",
  insights_related:         "Acción relacionada",

  // ── Suggestions list ─────────────────────────────────────────────────────────
  suggestions_empty:        "Sin recomendaciones activas para esta situación.",
  suggestions_context_note: "Basado en la situación actual",
  suggestions_overflow:     "recomendaciones adicionales",
  suggestions_coming_soon:  "Próximamente",

  // ── Agent header ─────────────────────────────────────────────────────────────
  agent_active_status:      "Activo",
  agent_support_label:      "Apoyo:",

} as const;
