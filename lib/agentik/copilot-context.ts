/**
 * lib/agentik/copilot-context.ts
 *
 * Module context definitions for the Agentik Copilot persistent rail.
 *
 * Maps every enterprise route segment to a rich ModuleContext:
 *  – module identity & icon
 *  – description shown in the rail header
 *  – 3–5 suggested prompts specific to that business area
 *  – specialist routing hint (which agent should execute)
 *  – available action types for this module
 *  – system-prompt hints sent to the LLM
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type CopilotSpecialist =
  | "luca"      // marketing / Luca video content
  | "mila"      // WhatsApp / outbound sales
  | "sofi"      // customer conversations / CX
  | "sag"       // SAG approval executor
  | "finance"   // finance automations / DIAN
  | "reports"   // scheduled reports engine
  | "alerts"    // action center / alert investigation
  | "executive" // executive reporting / FP&A
  | "general";  // general orchestrator (fallback)

export type CopilotActionType =
  | "ask"
  | "recommend"
  | "execute"
  | "delegate"
  | "escalate"
  | "schedule";

export interface ModuleContext {
  moduleId:         string;
  moduleLabel:      string;
  moduleIcon:       string;
  description:      string;
  suggestedPrompts: string[];
  specialist:       CopilotSpecialist;
  availableActions: CopilotActionType[];
  systemHints:      string;
}

// ── Module map ────────────────────────────────────────────────────────────────

const MODULE_MAP: Record<string, ModuleContext> = {

  dashboard: {
    moduleId:         "dashboard",
    moduleLabel:      "Dashboard",
    moduleIcon:       "◇",
    description:      "Centro de operaciones · briefing diario · actividad reciente",
    suggestedPrompts: [
      "¿Hay alertas críticas activas que necesiten atención hoy?",
      "¿Cuántas aprobaciones SAG están pendientes?",
      "Dame un briefing ejecutivo del estado actual del negocio",
      "¿Qué módulo necesita atención urgente ahora mismo?",
    ],
    specialist:       "executive",
    availableActions: ["ask", "recommend"],
    systemHints:      "Daily ops dashboard. Aggregates live signals from four dimensions: (1) critical alert count from the alerts module, (2) SAG write approvals pending, (3) open action tasks (PENDING | IN_PROGRESS), (4) recent automation run status. User needs synthesized triage — tell them which signal is most elevated and which module to open. Do not give generic overviews; point to specific actionable areas.",
  },

  executive: {
    moduleId:         "executive",
    moduleLabel:      "Torre de Control",
    moduleIcon:       "◈",
    description:      "KPIs ejecutivos · alertas · aging · F1/F2 · ciclo de vida",
    suggestedPrompts: [
      "¿Cómo está la concentración de cartera en los top 10 clientes?",
      "Compara ventas F1 vs F2 del período actual",
      "¿Cuál es el aging de cuentas por cobrar por segmento?",
      "¿Qué KPIs están fuera de objetivo esta semana?",
      "Genera un flash report ejecutivo ahora",
    ],
    specialist:       "executive",
    availableActions: ["ask", "recommend", "execute", "schedule"],
    systemHints:      "Executive control tower. Key data: F1 (FUENTE_1 = canal comercial primario) vs F2 (FUENTE_2 = canal mayorista/secundario) revenue split; receivables aging buckets (0–30, 31–60, 61–90, 90+ días); customer concentration risk (top-10 exposure as % of total receivables); lifecycle KPIs vs targets; critical alert count. 'execute' and 'schedule' both trigger an immediate flash report covering current-period financials. Answer like a CFO reviewing end-of-day numbers — cite F1/F2 split, aging buckets, and threshold breaches when relevant.",
  },

  finance: {
    moduleId:         "finance",
    moduleLabel:      "Finanzas",
    moduleIcon:       "◆",
    description:      "FP&A · DIAN · XML · varianzas · presupuesto · flujo de caja",
    suggestedPrompts: [
      "¿Cuántos XMLs DIAN están pendientes de conciliación hoy?",
      "Analiza la varianza vs presupuesto del período actual",
      "¿Cuál es el score de cierre contable del mes?",
      "Identifica facturas con clasificación DIAN incorrecta",
      "Genera el flash report financiero del período",
    ],
    specialist:       "finance",
    availableActions: ["ask", "recommend", "execute"],
    systemHints:      "Finance FP&A module. Key data: DIAN XML documents (classified / unclassified, reconciled / pending); budget vs actual variance by cost center and period; accounting close score (% of month-end tasks completed); cash flow projection (inflows − outflows next 30 days); document intake queue. 'execute' triggers an immediate flash report with current-period financial summary (ingresos, egresos, varianza). Answer with accounting precision — cite periods, amounts in COP, percentages, and document counts. Flag items that block month-end close.",
  },

  sales: {
    moduleId:         "sales",
    moduleLabel:      "Comercial",
    moduleIcon:       "◇",
    description:      "Pipeline · cobranzas · top vendedores · riesgo de cartera",
    suggestedPrompts: [
      "¿Cuáles clientes tienen cartera vencida mayor a 60 días?",
      "Top 5 clientes por saldo vencido — acción de cobranza urgente",
      "Identifica clientes sin compra en los últimos 45 días",
      "¿Cómo está el cumplimiento del presupuesto comercial este mes?",
      "Activa el flujo de respuesta de riesgo de cartera",
    ],
    specialist:       "mila",
    availableActions: ["ask", "recommend", "execute", "delegate"],
    systemHints:      "Commercial module. Key data: receivables aging by customer (balanceDue, daysPastDue in buckets: 0–30, 31–60, 61–90, 90+); top-seller ranking by revenue and units (F1 vs F2 split); customer inactivity risk (days since last purchase); budget compliance % by seller and period; inventory exposure by segment. 'execute' triggers the collections risk response chain: (1) cobranza prioritaria → (2) escalación a gerencia → (3) informe ejecutivo. 'delegate' creates an immediate collection task targeting the customer with the highest overdue balance. Name customers and amounts when possible. Use aging buckets as the primary risk lens.",
  },

  alerts: {
    moduleId:         "alerts",
    moduleLabel:      "Alertas",
    moduleIcon:       "▲",
    description:      "Alertas críticas · investigación · escalación · Action Center",
    suggestedPrompts: [
      "¿Cuántas alertas CRITICAL están abiertas ahora mismo?",
      "¿Cuál es la alerta más urgente y cuál debería ser la primera acción?",
      "Agrupa las alertas abiertas por categoría y severidad",
      "¿Hay alertas de cartera o cobranza sin respuesta esta semana?",
      "Escala la alerta crítica más antigua a gerencia",
    ],
    specialist:       "alerts",
    availableActions: ["ask", "recommend", "escalate", "execute"],
    systemHints:      "Alerts triage module. Alert types: CARTERA (receivables / collections risk), OPERATIVA (process or operational failure), SISTEMA (integration or data pipeline error), CUMPLIMIENTO (regulatory or compliance breach). Severity: LOW < MEDIUM < HIGH < CRITICAL. Status flow: OPEN → INVESTIGATING → RESOLVED. 'escalate' and 'execute' both create an urgent escalation ActionTask targeting the most critical open alert by severity and age. Recommend resolution steps based on alert type — CARTERA → collections action; SISTEMA → ops team; CUMPLIMIENTO → legal escalation. Prioritize CRITICAL + OPEN + oldest age.",
  },

  reconciliation: {
    moduleId:         "reconciliation",
    moduleLabel:      "Conciliación",
    moduleIcon:       "⊞",
    description:      "XML vs SAG · discrepancias · cola de reintento",
    suggestedPrompts: [
      "¿Cuántos documentos XML están pendientes de conciliar?",
      "Muéstrame los registros con mayor discrepancia de valor",
      "¿Cuál es la causa más frecuente de discrepancias este mes?",
      "¿Hay documentos en la cola de reintento SAG desde hace más de 48 horas?",
    ],
    specialist:       "sag",
    availableActions: ["ask", "escalate"],
    systemHints:      "XML vs SAG reconciliation module. Reconciliation statuses: PENDING (awaiting match), MATCHED (reconciled), DISCREPANT (value or document mismatch), FAILED_RETRY (SAG write failed, in retry queue). Discrepancy types: AMOUNT_MISMATCH (value difference > tolerance), DOCUMENT_NOT_FOUND (XML exists but SAG has no match), HOMOLOGATION_ERROR (unmapped product or customer code), DUPLICATE (same document submitted twice). Retry queue shows documents that failed SAG write and are pending automatic or manual retry. Answer with counts, error type breakdown, and recommended resolution path. Do not claim to execute reconciliation — guide the user to investigate, correct master data, or escalate to the ops team.",
  },

  sag: {
    moduleId:         "sag",
    moduleLabel:      "SAG",
    moduleIcon:       "⊟",
    description:      "Aprobaciones pendientes · escrituras fallidas · cola de reintento",
    suggestedPrompts: [
      "¿Cuántas operaciones SAG están pendientes de aprobación?",
      "¿Hay escrituras SAG fallidas en las últimas 24 horas?",
      "¿Cuál es el estado actual de la cola de reintento?",
      "Identifica operaciones de bajo riesgo aptas para aprobación rápida",
    ],
    specialist:       "sag",
    availableActions: ["ask", "execute", "escalate"],
    systemHints:      "SAG write approval layer. SagWriteOperation statuses: PENDING (awaiting manual approval), APPROVED (queued for SAG write), FAILED (write error → retry queue), REJECTED (denied by approver). Risk levels (LOW / MEDIUM / HIGH) determine eligibility for batch approval — LOW-risk operations can be approved without individual review. Master data homologation maps external product and customer codes to SAG internal codes; homologation errors block writes. 'execute' creates an ops team action task to process the pending approval queue. 'escalate' creates an urgent task for failed operations that have exceeded retry limits. Do not claim to approve operations directly — route to the ops team with context.",
  },

  "customer-360": {
    moduleId:         "customer-360",
    moduleLabel:      "Customer 360",
    moduleIcon:       "◉",
    description:      "Perfiles · historial · cuentas por cobrar · segmentación",
    suggestedPrompts: [
      "¿Quiénes son los clientes de mayor riesgo?",
      "Muéstrame el perfil del cliente con más deuda",
      "Segmenta la cartera por aging",
      "Clientes sin compras en 60+ días",
    ],
    specialist:       "sofi",
    availableActions: ["ask", "recommend", "delegate"],
    systemHints:      "Customer 360 profiles. Full customer view: receivables aging, behavioral scoring, purchase history, inactivity risk, segment classification.",
  },

  collections: {
    moduleId:         "collections",
    moduleLabel:      "Cola de Cobranza",
    moduleIcon:       "💰",
    description:      "Cobranza · clientes en mora · acciones de cobro · Mila outbound",
    suggestedPrompts: [
      "¿A quién debo llamar hoy para cobrar?",
      "Muéstrame los 5 clientes con más días de mora",
      "¿Cuántos clientes tienen mora superior a 90 días?",
      "Genera acciones de cobranza para los top deudores",
      "¿Qué mensaje enviar por WhatsApp al mayor deudor?",
    ],
    specialist:       "mila",
    availableActions: ["ask", "recommend", "execute", "delegate"],
    systemHints:      "Collections work queue. Customers sorted by risk: riskScore DESC → maxDpd DESC → overdueReceivable DESC. Action suggestion rules: >180d DPD → legal process; >90d → urgent call + escalation; >60d → direct call + WhatsApp; >30d → WhatsApp + email; 0–30d → courtesy WhatsApp. Channel routing: WhatsApp (Mila) for <180d DPD; legal referral for >180d. 'execute' auto-creates CREAR_ACCION_COBRANZA tasks for all URGENT/HIGH priority customers. 'delegate' sends a WhatsApp message via Mila to the top debtor. Answer with customer names, overdue amounts in COP, DPD values, and specific recommended actions. Prioritize customers with maxDpd > 90 (critical exposure).",
  },

  workforce: {
    moduleId:         "workforce",
    moduleLabel:      "Workforce",
    moduleIcon:       "◈",
    description:      "Personal · productividad · nómina · alertas de staffing",
    suggestedPrompts: [
      "¿Hay anomalías en nómina este período?",
      "Resumen de productividad por equipo",
      "Alertas de staffing críticas",
      "Vendedores con rendimiento bajo objetivo",
    ],
    specialist:       "general",
    availableActions: ["ask", "recommend", "escalate"],
    systemHints:      "Workforce management. Staffing alerts, team productivity metrics, payroll anomaly detection, sales rep performance vs target.",
  },

  agentik: {
    moduleId:         "agentik",
    moduleLabel:      "Agentik",
    moduleIcon:       "▣",
    description:      "Inteligencia · acciones · automatizaciones · memoria estratégica",
    suggestedPrompts: [
      "¿Qué tareas están pendientes de ejecución?",
      "Crea una nueva acción de seguimiento",
      "Genera un informe ejecutivo ahora",
      "Estado de los agentes y automatizaciones",
    ],
    specialist:       "general",
    availableActions: ["ask", "recommend", "execute", "delegate", "escalate", "schedule"],
    systemHints:      "Agentik intelligence center. Action task management, automation runs, agent orchestration, strategic memory, scheduled report management.",
  },

  pipeline: {
    moduleId:         "pipeline",
    moduleLabel:      "Pipeline",
    moduleIcon:       "◌",
    description:      "CRM · oportunidades · etapas · seguimiento comercial",
    suggestedPrompts: [
      "¿Cuáles oportunidades están en riesgo de cierre?",
      "Pipeline del mes por vendedor",
      "Oportunidades sin actividad en 7+ días",
      "Tasa de conversión por etapa",
    ],
    specialist:       "mila",
    availableActions: ["ask", "recommend", "delegate"],
    systemHints:      "CRM sales pipeline. Opportunity stages, win rate analysis, stalled deals, seller activity gaps, conversion funnel optimization.",
  },

  documents: {
    moduleId:         "documents",
    moduleLabel:      "Documentos",
    moduleIcon:       "▤",
    description:      "Gestión documental · procesamiento · clasificación DIAN",
    suggestedPrompts: [
      "¿Cuántos documentos están sin procesar?",
      "Documentos con errores de clasificación",
      "Procesa los documentos pendientes",
    ],
    specialist:       "finance",
    availableActions: ["ask", "execute"],
    systemHints:      "Document management. Unprocessed DIAN XML documents, classification errors, intake queue, document processing status.",
  },

  reports: {
    moduleId:         "reports",
    moduleLabel:      "Reportes",
    moduleIcon:       "▥",
    description:      "Informes automáticos · FP&A · programación",
    suggestedPrompts: [
      "Genera el reporte ejecutivo de esta semana",
      "Programa un informe diario de cartera",
      "¿Cuáles reportes están activos?",
    ],
    specialist:       "reports",
    availableActions: ["ask", "execute", "schedule"],
    systemHints:      "Scheduled reports engine. FP&A reports, executive summaries, portfolio aging reports, report scheduling configuration.",
  },

  knowledge: {
    moduleId:         "knowledge",
    moduleLabel:      "Conocimiento",
    moduleIcon:       "▦",
    description:      "Memoria estratégica · SOPs · políticas · documentos indexados",
    suggestedPrompts: [
      "¿Qué SOPs tenemos indexados?",
      "Busca la política de crédito",
      "Documentos indexados esta semana",
    ],
    specialist:       "general",
    availableActions: ["ask", "recommend"],
    systemHints:      "Knowledge base. Indexed SOPs, company policies, strategic documents, knowledge retrieval.",
  },

};

// ── Default ───────────────────────────────────────────────────────────────────

const DEFAULT_CONTEXT: ModuleContext = {
  moduleId:         "general",
  moduleLabel:      "Agentik",
  moduleIcon:       "▣",
  description:      "Orquestador empresarial inteligente",
  suggestedPrompts: [
    "¿Cuál es el estado del negocio hoy?",
    "Muéstrame las alertas activas",
    "¿Qué necesito revisar primero?",
  ],
  specialist:       "general",
  availableActions: ["ask", "recommend", "execute"],
  systemHints:      "General enterprise context. Provide a high-level orchestration perspective.",
};

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Derive the ModuleContext from the current request pathname.
 *
 * Expects pathname in the form: /orgSlug/module[/subpath...]
 * e.g. /acme/finance → "finance" context
 *      /acme/sag/write → "sag" context
 */
export function getModuleContext(_orgSlug: string, pathname: string): ModuleContext {
  const parts   = pathname.replace(/^\//, "").split("/");
  const segment = parts[1] ?? "";
  return MODULE_MAP[segment] ?? DEFAULT_CONTEXT;
}
