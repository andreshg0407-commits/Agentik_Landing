/**
 * lib/copilot/navigation/agent-workspace-fixtures.ts
 *
 * Agentik Copilot — Agent Workspace Section Fixtures
 * Sprint: AGENTIK-COPILOT-NAVIGATION-REAL-01
 *
 * Per-category fixture data for workspace tabs in the drawer.
 * All navigation targets use CopilotNavigationTarget — never raw strings.
 *
 * Architecture boundary: no React, no UI — pure data.
 */

import type { DrawerCategoryKey }         from "./copilot-action-map";
import type { CopilotNavigationTarget }   from "./copilot-navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RecentActivity {
  timeAgo:     string;
  description: string;
}

export interface ModuleCard {
  label:       string;
  statusLabel: string;
  target:      CopilotNavigationTarget;
}

export interface NextAgentAction {
  label: string;
}

export interface OperationalStatus {
  label: string;
}

export interface SuggestedQuestion {
  text: string;
}

export interface AgentWorkspace {
  suggestedQuestions: SuggestedQuestion[];
  recentActivity:     RecentActivity[];
  moduleCards:        ModuleCard[];
  nextActions:        NextAgentAction[];
  operationalStatus:  OperationalStatus[];
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

export const AGENT_WORKSPACE: Record<DrawerCategoryKey, AgentWorkspace> = {
  attention: {
    suggestedQuestions: [
      { text: "¿Por qué me recomiendas revisar esto?" },
      { text: "¿Qué riesgo tiene si lo dejo pendiente?" },
      { text: "¿Qué movimientos debería mirar primero?" },
      { text: "¿Puedes resumirme el impacto en el cierre?" },
    ],
    recentActivity: [
      { timeAgo: "Hace 3 min",  description: "Diego detectó 2 excepciones de conciliación sin categoría." },
      { timeAgo: "Hace 12 min", description: "Diego clasificó movimientos bancarios del período." },
      { timeAgo: "Hace 31 min", description: "Diego ejecutó una revisión automática parcial." },
    ],
    moduleCards: [
      { label: "Conciliación Inteligente", statusLabel: "2 movimientos por revisar",  target: "CONCILIATION" },
      { label: "Tesorería",                statusLabel: "Flujo de caja disponible",    target: "TREASURY"     },
      { label: "Documentos",               statusLabel: "Soportes pendientes",         target: "DOCUMENTS"    },
    ],
    nextActions: [
      { label: "Validar movimientos sin categoría" },
      { label: "Confirmar excepciones con el equipo" },
      { label: "Actualizar estado de conciliación" },
    ],
    operationalStatus: [
      { label: "Analizando excepciones de conciliación" },
      { label: "Cruzando movimientos bancarios" },
    ],
  },

  activeWork: {
    suggestedQuestions: [
      { text: "¿En qué proceso está trabajando ahora?" },
      { text: "¿Cuándo estima terminar la conciliación?" },
      { text: "¿Hay algún bloqueo que deba resolver?" },
      { text: "¿Qué debo revisar mientras avanza?" },
    ],
    recentActivity: [
      { timeAgo: "Hace 2 min",  description: "Diego inició el proceso de conciliación automática." },
      { timeAgo: "Hace 18 min", description: "Diego actualizó la antigüedad de cartera." },
      { timeAgo: "Hace 45 min", description: "Diego preparó el reporte de posición bancaria." },
    ],
    moduleCards: [
      { label: "Conciliación Inteligente", statusLabel: "Proceso activo ahora",        target: "CONCILIATION" },
      { label: "Cartera",                  statusLabel: "Actualizada hace 18 min",      target: "PORTFOLIO"    },
      { label: "Reportes",                 statusLabel: "Informe en preparación",       target: "REPORTS"      },
    ],
    nextActions: [
      { label: "Completar conciliación del período" },
      { label: "Actualizar flujo de caja proyectado" },
      { label: "Generar informe de posición" },
    ],
    operationalStatus: [
      { label: "Procesando conciliación automática" },
      { label: "Analizando antigüedad de cartera" },
      { label: "Preparando informe financiero" },
    ],
  },

  pendingApprovals: {
    suggestedQuestions: [
      { text: "¿Qué pasa si apruebo esto?" },
      { text: "¿Hay algún riesgo en esta autorización?" },
      { text: "¿Puedo revisarlo en otro momento?" },
      { text: "¿Qué impacto tiene en el flujo de caja?" },
    ],
    recentActivity: [
      { timeAgo: "Hace 8 min",  description: "Diego marcó 3 movimientos como pendientes de aprobación." },
      { timeAgo: "Hace 22 min", description: "Diego envió solicitud de autorización al equipo." },
      { timeAgo: "Hace 1 h",    description: "Diego inició el flujo de aprobación contable." },
    ],
    moduleCards: [
      { label: "Centro de Aprobaciones",   statusLabel: "3 acciones en espera",              target: "APPROVALS"    },
      { label: "Conciliación Inteligente", statusLabel: "Pendiente de validación",            target: "CONCILIATION" },
      { label: "Documentos",               statusLabel: "Soportes adjuntos disponibles",      target: "DOCUMENTS"    },
    ],
    nextActions: [
      { label: "Confirmar autorizaciones pendientes" },
      { label: "Notificar al responsable asignado" },
      { label: "Registrar decisión en bitácora" },
    ],
    operationalStatus: [
      { label: "Esperando autorización de movimientos" },
      { label: "Revisando flujo de aprobación" },
    ],
  },

  suggestions: {
    suggestedQuestions: [
      { text: "¿Por qué me haces esta recomendación?" },
      { text: "¿Qué datos usaste para llegar a esto?" },
      { text: "¿Qué pasa si no la aplico?" },
      { text: "¿Hay otras opciones para este caso?" },
    ],
    recentActivity: [
      { timeAgo: "Hace 5 min",  description: "Diego generó una recomendación de conciliación." },
      { timeAgo: "Hace 20 min", description: "Diego completó el análisis de contexto operativo." },
      { timeAgo: "Hace 55 min", description: "Diego revisó los patrones de movimientos históricos." },
    ],
    moduleCards: [
      { label: "Conciliación Inteligente", statusLabel: "Recomendación disponible",     target: "CONCILIATION" },
      { label: "Tesorería",                statusLabel: "Ajuste sugerido pendiente",     target: "TREASURY"     },
      { label: "Planeación",               statusLabel: "Modelo actualizable",          target: "PLANNING"     },
    ],
    nextActions: [
      { label: "Revisar recomendaciones del período" },
      { label: "Aplicar ajuste sugerido en tesorería" },
      { label: "Confirmar impacto en planeación" },
    ],
    operationalStatus: [
      { label: "Generando recomendaciones contextuales" },
      { label: "Analizando patrones históricos" },
    ],
  },

  opportunities: {
    suggestedQuestions: [
      { text: "¿Qué clientes requieren prioridad ahora?" },
      { text: "¿Cuánto riesgo de recaudo hay en el período?" },
      { text: "¿Qué seguimiento me sugieres para cada uno?" },
      { text: "¿Puedes preparar un resumen ejecutivo?" },
    ],
    recentActivity: [
      { timeAgo: "Hace 10 min", description: "Diego identificó oportunidades en cartera vencida." },
      { timeAgo: "Hace 35 min", description: "Diego completó el análisis de clientes activos." },
      { timeAgo: "Hace 2 h",    description: "Diego revisó la proyección de recaudo mensual." },
    ],
    moduleCards: [
      { label: "Comercial",                statusLabel: "Oportunidades detectadas",      target: "COMMERCIAL"   },
      { label: "Cobranza",                 statusLabel: "12 clientes con saldo vencido", target: "COLLECTIONS"  },
      { label: "Reportes",                 statusLabel: "Análisis disponible",           target: "REPORTS"      },
    ],
    nextActions: [
      { label: "Contactar clientes con cartera vencida" },
      { label: "Actualizar proyección de recaudo" },
      { label: "Generar informe comercial del período" },
    ],
    operationalStatus: [
      { label: "Analizando oportunidades de mejora" },
      { label: "Revisando cartera de clientes activos" },
    ],
  },

  followups: {
    suggestedQuestions: [
      { text: "¿Cuáles son los seguimientos más urgentes?" },
      { text: "¿Hay compromisos que se vencen esta semana?" },
      { text: "¿Qué debería reprogramar?" },
      { text: "¿Puedes armarme un resumen de la agenda?" },
    ],
    recentActivity: [
      { timeAgo: "Hace 15 min", description: "Diego programó un seguimiento de revisión de cartera." },
      { timeAgo: "Hace 40 min", description: "Diego confirmó la reunión de cierre semanal." },
      { timeAgo: "Hace 3 h",    description: "Diego actualizó la agenda de seguimientos pendientes." },
    ],
    moduleCards: [
      { label: "Agenda",                   statusLabel: "3 seguimientos activos",               target: "CALENDAR"     },
      { label: "Tareas",                   statusLabel: "Compromisos sin confirmar",            target: "TASKS"        },
      { label: "Conciliación Inteligente", statusLabel: "Revisión programada pendiente",        target: "CONCILIATION" },
    ],
    nextActions: [
      { label: "Confirmar seguimientos programados" },
      { label: "Reprogramar los que requieren ajuste" },
      { label: "Actualizar estado de compromisos" },
    ],
    operationalStatus: [
      { label: "Rastreando compromisos operativos" },
      { label: "Monitoreando seguimientos activos" },
    ],
  },

  recentActivity: {
    suggestedQuestions: [
      { text: "¿Qué tareas completaste hoy?" },
      { text: "¿Hubo algún incidente en el proceso?" },
      { text: "¿Qué queda pendiente del período?" },
      { text: "¿Puedes exportar un resumen de actividad?" },
    ],
    recentActivity: [
      { timeAgo: "Hace 5 min",  description: "Diego completó la conciliación automática del período." },
      { timeAgo: "Hace 22 min", description: "Diego procesó la clasificación de facturas." },
      { timeAgo: "Hace 58 min", description: "Diego validó la integridad del período contable." },
    ],
    moduleCards: [
      { label: "Conciliación Inteligente", statusLabel: "Período conciliado",                target: "CONCILIATION" },
      { label: "Cierre",                   statusLabel: "Tareas completadas registradas",    target: "CLOSING"      },
      { label: "Reportes",                 statusLabel: "Resumen de actividad disponible",   target: "REPORTS"      },
    ],
    nextActions: [
      { label: "Revisar resumen de actividad del período" },
      { label: "Confirmar tareas completadas en cierre" },
      { label: "Exportar actividad para el equipo" },
    ],
    operationalStatus: [
      { label: "Período de actividad estable" },
      { label: "Registrando tareas completadas" },
    ],
  },

  insights: {
    suggestedQuestions: [
      { text: "¿Qué hallazgo tiene mayor impacto?" },
      { text: "¿Qué datos sustentan este análisis?" },
      { text: "¿Cómo afecta esto al cierre del período?" },
      { text: "¿Puedes preparar un resumen ejecutivo?" },
    ],
    recentActivity: [
      { timeAgo: "Hace 7 min",  description: "Diego completó el análisis financiero del período." },
      { timeAgo: "Hace 28 min", description: "Diego revisó los indicadores de liquidez." },
      { timeAgo: "Hace 1 h",    description: "Diego consolidó datos de tesorería y cartera." },
    ],
    moduleCards: [
      { label: "Tesorería",                statusLabel: "Indicadores disponibles",    target: "TREASURY"     },
      { label: "Conciliación Inteligente", statusLabel: "Datos cruzados",             target: "CONCILIATION" },
      { label: "Planeación",               statusLabel: "Modelo actualizable",        target: "PLANNING"     },
    ],
    nextActions: [
      { label: "Revisar hallazgos del período" },
      { label: "Validar indicadores en tesorería" },
      { label: "Compartir hallazgos con el equipo" },
    ],
    operationalStatus: [
      { label: "Analizando indicadores financieros" },
      { label: "Cruzando datos de tesorería y cartera" },
    ],
  },
};
