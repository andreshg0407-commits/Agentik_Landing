/**
 * components/copilot/copilot-panel.fixture.ts
 *
 * Agentik Copilot Panel — Development Fixture
 * Sprint: AGENTIK-COPILOT-PANEL-01
 *
 * @dev DEVELOPMENT ONLY — Do not import from production code.
 *
 * Provides a minimal, generic CopilotViewModel for local visual testing.
 * No real data. No client-specific content. No SAG. No Castillitos.
 * All content is structural and clearly labeled as placeholder.
 */

import type { CopilotViewModel } from "@/lib/copilot/viewmodel";

// ── Fixture factory ────────────────────────────────────────────────────────────

/**
 * Returns a generic CopilotViewModel for development and visual testing.
 * Safe to use in Storybook, component previews, or layout reviews.
 */
export function createDevFixtureViewModel(): CopilotViewModel {
  return {
    leadAgent: {
      agentId:               "diego",
      agentName:             "Diego",
      role:                  "Inteligencia Financiera",
      description:           "Especialista en finanzas, tesorería, conciliación y cierre contable.",
      tone:                  "analitico",
      primaryDomains:        ["bancos", "conciliacion", "cartera"],
      availableCapabilities: [
        "bancos.calculate_balance",
        "cartera.detect_overdue",
        "conciliacion.detect_exceptions",
      ],
      isLead: true,
    },

    supportAgents: [
      {
        agentId:               "mila",
        agentName:             "Mila",
        role:                  "Inteligencia Comercial",
        description:           "Especialista en cartera y cobros.",
        tone:                  "comercial",
        primaryDomains:        ["clientes", "cartera", "ventas"],
        availableCapabilities: ["cartera.prioritize_collection"],
        isLead: false,
      },
    ],

    suggestions: [
      {
        id:                   "cap:cartera.detect_overdue:0",
        title:                "Revisar cartera vencida",
        description:          "El contexto actual permite revisar el estado de cartera vencida y priorizar acciones de cobranza.",
        priority:             "high",
        category:             "alert",
        domainRef:            "cartera",
        actionRef:            undefined,
        requiresConfirmation: false,
        riskLabel:            "Bajo",
        score:                380,
      },
      {
        id:                   "cap:bancos.detect_unreconciled:0",
        title:                "Revisar movimientos bancarios sin conciliar",
        description:          "Las capacidades activas permiten identificar movimientos sin correspondencia.",
        priority:             "high",
        category:             "alert",
        domainRef:            "bancos",
        actionRef:            undefined,
        requiresConfirmation: false,
        riskLabel:            "Bajo",
        score:                360,
      },
      {
        id:                   "cap:conciliacion.detect_exceptions:0",
        title:                "Revisar excepciones de conciliación",
        description:          "Identifica movimientos que no pudieron ser conciliados automáticamente.",
        priority:             "critical",
        category:             "alert",
        domainRef:            "conciliacion",
        actionRef:            "flag_for_review",
        requiresConfirmation: false,
        riskLabel:            "Bajo",
        score:                440,
      },
      {
        id:                   "cap:cartera.project_cashflow:0",
        title:                "Proyectar flujo de caja por cobros",
        description:          "Estima los ingresos esperados por cobros de cartera en el período activo.",
        priority:             "medium",
        category:             "analysis",
        domainRef:            "cartera",
        actionRef:            "generate_report",
        requiresConfirmation: false,
        riskLabel:            "Bajo",
        score:                300,
      },
    ],

    insights: [
      {
        id:              "ins:domain:conciliacion:0",
        title:           "Revisión de conciliación disponible",
        description:     "El contexto actual permite revisar el estado de conciliación y las excepciones pendientes.",
        type:            "risk",
        severity:        "high",
        confidence:      0.45,
        confidenceLabel: "Media",
        domainRef:       "conciliacion",
        evidence:        [
          {
            type:        "domain_active",
            ref:         "conciliacion",
            description: "Dominio conciliacion activo en el módulo actual.",
          },
        ],
        relatedSuggestionIds: ["cap:conciliacion.detect_exceptions:0"],
        score:           700,
      },
      {
        id:              "ins:domain:cartera:0",
        title:           "Análisis de cartera disponible",
        description:     "Las capacidades activas permiten revisar el estado de mora y priorizar cobros.",
        type:            "observation",
        severity:        "medium",
        confidence:      0.4,
        confidenceLabel: "Media",
        domainRef:       "cartera",
        evidence:        [
          {
            type:        "domain_active",
            ref:         "cartera",
            description: "Dominio cartera activo en el módulo actual.",
          },
        ],
        score:           540,
      },
      {
        id:              "ins:domain:bancos:0",
        title:           "Posición bancaria disponible para revisión",
        description:     "El contexto financiero permite calcular el saldo bancario real.",
        type:            "observation",
        severity:        "medium",
        confidence:      0.38,
        confidenceLabel: "Baja",
        domainRef:       "bancos",
        score:           480,
      },
    ],

    attentionItems: [
      {
        id:           "attn:ins:ins:domain:conciliacion:0",
        title:        "Revisión de conciliación disponible",
        description:  "El contexto actual permite revisar el estado de conciliación y las excepciones pendientes.",
        severity:     "high",
        source:       "insight",
        domainRef:    "conciliacion",
        insightRef:   "ins:domain:conciliacion:0",
        score:        700,
      },
      {
        id:            "attn:sug:cap:conciliacion.detect_exceptions:0",
        title:         "Revisar excepciones de conciliación",
        description:   "Identifica movimientos que no pudieron ser conciliados automáticamente.",
        severity:      "critical",
        source:        "suggestion",
        domainRef:     "conciliacion",
        suggestionRef: "cap:conciliacion.detect_exceptions:0",
        score:         440,
      },
    ],

    opportunities: [
      {
        id:            "opp:sug:cap:cartera.project_cashflow:0",
        title:         "Proyectar flujo de caja por cobros",
        description:   "Estima los ingresos esperados por cobros para anticipar la posición de liquidez.",
        source:        "suggestion",
        domainRef:     "cartera",
        suggestionRef: "cap:cartera.project_cashflow:0",
        score:         300,
      },
    ],

    summary: {
      module:           "finanzas/conciliacion",
      screen:           "",
      activeDomains:    ["conciliacion", "bancos", "cartera", "pagos"],
      leadAgentName:    "Diego",
      leadAgentId:      "diego",
      activeAgentNames: ["Diego", "Mila"],
      totalSuggestions: 4,
      totalInsights:    3,
      attentionCount:   2,
      opportunityCount: 1,
      readiness:        "ready",
      readinessLabel:   "Listo",
    },

    // ── Workspace data (AGENTIK-COPILOT-WORKSPACE-01) ──────────────────────

    activeWork: [
      {
        id:          "aw:001",
        title:       "Clasificando movimientos sin categoría",
        progress:    72,
        priority:    "high",
        domain:      "conciliacion",
        status:      "running",
        statusLabel: "Ejecutando",
      },
      {
        id:          "aw:002",
        title:       "Analizando antigüedad de cartera",
        progress:    45,
        priority:    "medium",
        domain:      "cartera",
        status:      "analyzing",
        statusLabel: "Analizando",
      },
      {
        id:          "aw:003",
        title:       "Preparando reporte de posición bancaria",
        progress:    88,
        priority:    "low",
        domain:      "bancos",
        status:      "running",
        statusLabel: "Ejecutando",
      },
    ],

    pendingApprovals: [
      {
        id:          "pa:001",
        action:      "Marcar 14 movimientos como 'No conciliable'",
        impact:      "Estos movimientos llevan más de 30 días sin correspondencia y no tienen contrapartida identificada en el período activo.",
        risk:        "medium",
        riskLabel:   "Medio",
        status:      "pending_approval",
        statusLabel: "Esperando aprobación",
        domain:      "conciliacion",
      },
      {
        id:          "pa:002",
        action:      "Enviar alerta de cartera vencida a equipo comercial",
        impact:      "Se detectaron 8 clientes con más de 60 días en mora. La notificación activa el protocolo de cobro preventivo.",
        risk:        "low",
        riskLabel:   "Bajo",
        status:      "pending_approval",
        statusLabel: "Esperando aprobación",
        domain:      "cartera",
      },
      {
        id:          "pa:003",
        action:      "Actualizar proyección de flujo de caja para el mes en curso",
        impact:      "La proyección actual usa datos del período anterior. Actualizar con los movimientos recientes mejora la precisión del cierre.",
        risk:        "high",
        riskLabel:   "Alto",
        status:      "pending_review",
        statusLabel: "Pendiente revisión",
        domain:      "bancos",
      },
    ],

    completedWork: [
      {
        id:             "cw:001",
        title:          "Conciliación automática de extractos bancarios",
        completedLabel: "Hace 18 minutos",
        outcome:        "342 movimientos conciliados",
        domain:         "bancos",
      },
      {
        id:             "cw:002",
        title:          "Clasificación de facturas pendientes por antigüedad",
        completedLabel: "Hace 1 hora",
        outcome:        "4 rangos identificados",
        domain:         "cartera",
      },
      {
        id:             "cw:003",
        title:          "Validación de integridad del período contable",
        completedLabel: "Hace 2 horas",
        domain:         "conciliacion",
      },
    ],

    followups: [
      {
        id:       "fu:001",
        title:    "Revisar excepciones de conciliación pendientes de respuesta",
        due:      "Hoy 5:00 PM",
        priority: "high",
        domain:   "conciliacion",
      },
      {
        id:       "fu:002",
        title:    "Confirmar recepción de pago de cliente principal",
        due:      "Mañana 9:00 AM",
        priority: "medium",
        domain:   "cartera",
      },
      {
        id:       "fu:003",
        title:    "Verificar cuadre del cierre semanal",
        due:      "Viernes",
        priority: "low",
        domain:   "bancos",
      },
    ],

    requestInbox: [
      {
        id:          "ri:001",
        request:     "¿Cuál es el saldo bancario disponible hoy?",
        status:      "completed",
        statusLabel: "Completado",
        domain:      "bancos",
      },
      {
        id:          "ri:002",
        request:     "Muéstrame los clientes con más de 60 días en mora",
        status:      "completed",
        statusLabel: "Completado",
        domain:      "cartera",
      },
      {
        id:          "ri:003",
        request:     "¿Cuántas excepciones de conciliación hay abiertas?",
        status:      "in_progress",
        statusLabel: "En proceso",
        domain:      "conciliacion",
      },
      {
        id:          "ri:004",
        request:     "Proyecta el flujo de caja para los próximos 15 días",
        status:      "in_progress",
        statusLabel: "En proceso",
        domain:      "bancos",
      },
      {
        id:          "ri:005",
        request:     "Genera el reporte de cierre del período anterior",
        status:      "pending",
        statusLabel: "Pendiente",
        domain:      "conciliacion",
      },
    ],

    isReady:     true,
    module:      "finanzas/conciliacion",
    screen:      "",
    snapshotId:  "dev-fixture-001",
    generatedAt: new Date(),
  };
}
