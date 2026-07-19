/**
 * lib/copilot/agents.ts
 *
 * Agentik Copilot — Agent Registry V3.1
 *
 * Sprint V3.1: AGENTIK-MEMORY-INTELLIGENCE-REFINEMENT-01
 *   Memory types refined:
 *   - MemoryPriority (critical / strategic / operational / contextual)
 *   - MemoryLifecycle (active / evolving / stale / archived)
 *   - confidenceLevel replaces numeric confidence (semantic labels)
 *   - capability replaces recommendedAction (missing capability framing)
 *   - lastImpact added to all memory items (memory feels alive)
 *   - Items ordered by operational relevance, not chronology
 */

// ── Runtime state ─────────────────────────────────────────────────────────────

export type AgentRuntimeState =
  | "active"
  | "syncing"
  | "degraded"
  | "supervised"
  | "offline"
  | "learning";

// ── Memory classification ─────────────────────────────────────────────────────

/** How critical this memory item is to the agent's operational intelligence. */
export type MemoryPriority =
  | "critical"     // Agent fails without this
  | "strategic"    // Drives key recommendations
  | "operational"  // Needed for day-to-day execution
  | "contextual";  // Background awareness

/** Lifecycle state of a memory item — indicates if it's fresh or needs review. */
export type MemoryLifecycle =
  | "active"    // Current, verified, in use
  | "evolving"  // Changing with new data
  | "stale"     // May need refresh
  | "archived"; // No longer active

// ── Memory types ──────────────────────────────────────────────────────────────

/**
 * Stable strategic context the agent must retain.
 * Facts about the business, environment, active configuration.
 */
export interface AgentMemoryContext {
  title:       string;
  body:        string;
  scope:       string;
  updatedAt:   string;
  priority:    MemoryPriority;
  lifecycle:   MemoryLifecycle;
  lastImpact?: string;
}

/**
 * A pattern the agent has detected through operational observation.
 * confidenceLevel replaces numeric confidence — semantic > numeric for operations.
 */
export interface AgentMemoryPattern {
  title:           string;
  description:     string;
  confidenceLevel: "alta" | "estable" | "parcial" | "limitada";
  source:          string;
  updatedAt:       string;
  priority:        MemoryPriority;
  lifecycle:       MemoryLifecycle;
  lastImpact?:     string;
}

/**
 * An operational rule guiding agent behavior and governance.
 * priority here = execution urgency (not memory classification).
 */
export interface AgentMemoryRule {
  rule:       string;
  reason:     string;
  priority:   "critical" | "high" | "medium" | "low";
  lifecycle:  MemoryLifecycle;
  lastImpact?: string;
}

/**
 * A known capability gap limiting the agent's intelligence.
 * Framed as missing capability, not as a task to complete.
 */
export interface AgentMemoryGap {
  title:      string;
  impact:     string;
  status:     "pendiente" | "parcial" | "bloqueado";
  capability: string;  // The missing capability (not an action)
  priority:   MemoryPriority;
  lifecycle:  MemoryLifecycle;
}

/** Full memory structure for an agent. */
export interface AgentMemory {
  strategicContext: AgentMemoryContext[];
  learnedPatterns:  AgentMemoryPattern[];
  operationalRules: AgentMemoryRule[];
  gaps:             AgentMemoryGap[];
}
// ── Capability types ──────────────────────────────────────────────────────────

/**
 * Operational autonomy level of a capability.
 * How independently the agent can execute it.
 */
export type AutonomyLevel =
  | "autonoma"       // Executes without human intervention
  | "semi-autonoma"  // Executes, then notifies for review
  | "supervisada"    // Proposes action, waits for approval
  | "observacion";   // Monitors and reports only — no execution

/** Operational status of a capability. */
export type CapabilityStatus = "active" | "degraded" | "partial";

/** Readiness level of an available expansion. */
export type ExpansionReadiness =
  | "disponible"
  | "parcialmente-disponible"
  | "requiere-configuracion";

/**
 * A concrete operational capability this agent can execute.
 * Ordered by operational relevance.
 */
export interface AgentCapabilityDef {
  id:                  string;
  name:                string;
  description:         string;          // Short operational description
  operationalImpact:   string;          // What changes in the business
  autonomy:            AutonomyLevel;
  status:              CapabilityStatus;
  dependencies:        string[];        // Required systems: "SAG", "Banco"...
  workflows:           string[];        // Related workflow/automation names
  degradationReason?:  string;          // Why it's degraded (when status !== "active")
}

/**
 * A potential capability expansion — not yet active.
 * Framed as intelligence expansion, not a marketplace feature.
 */
export interface AgentCapabilityExpansion {
  name:         string;
  unlocks:      string;              // What this expansion enables
  impact:       string[];            // Business impact items
  requirements: string[];            // What's needed
  readiness:    ExpansionReadiness;
}

/** Full capability system for an agent. */
export interface AgentCapabilitySystem {
  capabilities: AgentCapabilityDef[];       // active + degraded (filter by status)
  available:    AgentCapabilityExpansion[]; // expansions not yet active
}

// ── Integration types ──────────────────────────────────────────────────────────

/** Operational connectivity status of an integration. */
export type IntegrationStatus =
  | "active"       // Fully operational
  | "partial"      // Connected with limited scope
  | "syncing"      // Currently synchronizing
  | "observacion"  // Read-only monitoring, no writes
  | "offline";     // Disconnected or not configured

/** Authentication mechanism in use. */
export type AuthType =
  | "oauth2"
  | "api-key"
  | "webhook"
  | "service-account"
  | "basic"
  | "none";

export type IntegrationEnv    = "produccion" | "sandbox";
export type IntegrationOwner  = "tenant" | "system" | "admin";

/** Readiness of an available integration expansion. */
export type IntegrationReadiness =
  | "disponible"
  | "requiere-configuracion"
  | "enterprise"
  | "beta";

/**
 * A live integration feeding this agent's intelligence.
 * Each integration grants operational scope and unlocks capabilities.
 */
export interface AgentIntegrationDef {
  id:                   string;
  name:                 string;
  abbrev:               string;            // 2-3 char display in icon circle
  status:               IntegrationStatus;
  lastSync:             string;            // human: "hace 4m", "N/A"
  latency:              string;            // "380ms", "N/A"
  auth:                 AuthType;
  env:                  IntegrationEnv;
  owner:                IntegrationOwner;
  operationalScope:     string[];          // "cartera", "facturas", "leads"...
  unlocksCapabilities:  string[];          // capability names this integration powers
  statusContext:        string;            // operational sentence — no "connected OK"
  degradationImpact?:   string;           // business consequence when degraded
  suggestedActions?:    string[];         // concrete remediation steps
}

/**
 * A future integration not yet active.
 * Framed as strategic connectivity expansion.
 */
export interface AgentIntegrationExpansion {
  name:         string;
  unlocks:      string;
  impact:       string[];
  requirements: string[];
  readiness:    IntegrationReadiness;
}

/** Full integration system for an agent. */
export interface AgentIntegrationSystem {
  integrations: AgentIntegrationDef[];       // active + degraded (filter by status)
  available:    AgentIntegrationExpansion[]; // not yet connected
}

// ── Personality / operational behavior types ───────────────────────────────────

/**
 * Operational autonomy level — how independently the agent operates within the org.
 * Different from capability-level AutonomyLevel: this is agent-wide governance.
 */
export type AgentAutonomyLevel =
  | "supervisado"    // All actions require human approval before execution
  | "semi-autonomo"  // Executes autonomously; escalates ambiguous or high-risk decisions
  | "autonomo"       // Fully self-directed within defined operational boundaries
  | "critico";       // Operates in critical-path mode — any failure triggers immediate escalation

/** A governance rule guiding the agent's decision-making. */
export interface AgentDecisionRule {
  title:       string;
  description: string;
  severity?:   "normal" | "high" | "critical";
}

/** How the agent communicates with humans and other agents. */
export interface AgentCommunicationStyle {
  tone:            string;
  behavior:        string[];
  escalationStyle: string;
}

/**
 * Full operational behavior model for an agent.
 * This is the agent's governance constitution — how it thinks, decides, and acts.
 */
export interface AgentOperationalBehavior {
  autonomy:              AgentAutonomyLevel;
  primaryObjective:      string;
  operationalPriorities: string[];     // Ordered by importance
  escalationTriggers:    string[];     // Conditions that force human involvement
  forbiddenActions:      string[];     // Hard governance boundaries
  communication:         AgentCommunicationStyle;
  decisionRules:         AgentDecisionRule[];
}

// ── Workflow types ─────────────────────────────────────────────────────────────

/** Operational status of a workflow. */
export type AgentWorkflowStatus =
  | "active"       // Running autonomously
  | "supervised"   // Running but requires human review/approval
  | "paused"       // Temporarily stopped
  | "degraded"     // Running with reduced capability
  | "draft";       // Available but not yet activated

/** What triggers a workflow execution. */
export type AgentWorkflowTrigger =
  | "scheduled"   // Time-based cron or calendar
  | "event"       // Triggered by a system event (sync, webhook)
  | "manual"      // Human-initiated
  | "threshold"   // Data condition met (e.g. cartera > 90d)
  | "agent";      // Triggered by another agent

/** A single step in a workflow's execution path. */
export interface AgentWorkflowStep {
  title:        string;
  description:  string;
  system?:      string;   // System this step touches
}

/**
 * An operational workflow — a routine the agent executes in the real operation.
 * NOT a technical job. NOT a DevOps task. A business operational routine.
 */
export interface AgentWorkflow {
  id:                  string;
  name:                string;
  description:         string;
  status:              AgentWorkflowStatus;
  trigger:             AgentWorkflowTrigger;
  cadence:             string;                 // Human: "Diario · 23:00", "Al recibir evento SAG"
  autonomy:            AgentAutonomyLevel;
  owner:               "tenant" | "agentik" | "system";
  touchedSystems:      string[];               // Systems this workflow reads/writes
  produces:            string[];               // Operational outputs
  steps:               AgentWorkflowStep[];
  supervisionRequired?: string;               // For supervised: what needs human eyes
  lastRun:             string;                 // Human: "hace 6h", "N/A"
  nextRun?:            string;                 // Human: "en 18h", "Al próximo sync SAG"
  operationalImpact:   string;
}

/** Full workflow system for an agent. */
export interface AgentWorkflowSystem {
  active:     AgentWorkflow[];   // Running autonomously
  supervised: AgentWorkflow[];   // Running with required human review
  available:  AgentWorkflow[];   // Draft — not yet activated
}

// ── Execution Layer types ──────────────────────────────────────────────────────

export type ExecutionSeverity =
  | "normal"
  | "warning"
  | "critical";

export type ExecutionState =
  | "running"
  | "waiting"
  | "completed"
  | "degraded"
  | "blocked";

export interface AgentExecutionEvent {
  id:                 string;
  title:              string;
  description:        string;
  timestamp:          string;
  severity:           ExecutionSeverity;
  state:              ExecutionState;
  workflow?:          string;
  systems?:           string[];
  produced?:          string[];
  requiresAttention?: boolean;
}

export interface AgentCoordinationEvent {
  fromAgent:   string;
  toAgent:     string;
  description: string;
  timestamp:   string;
}

export interface AgentExecutionSystem {
  activeExecutions: AgentExecutionEvent[];
  recentExecutions: AgentExecutionEvent[];
  incidents:        AgentExecutionEvent[];
  coordination:     AgentCoordinationEvent[];
}

// ── Agent type ────────────────────────────────────────────────────────────────

export interface CopilotAgent {
  id:               string;
  name:             string;
  specialty:        string;
  description:      string;
  avatar:           string;
  photo?:           string;
  accentColor:      string;
  modules:          string[];
  capabilities:     string[];
  operationalScope: string[];
  integrations:     string[];
  runtimeState:     AgentRuntimeState;
  memoryCount:      number;
  workflowCount:    number;
  currentFocus:     string;
  memoryHints:      Record<string, string[]>;
  memory:              AgentMemory;
  capabilitySystem:    AgentCapabilitySystem;
  integrationSystem:   AgentIntegrationSystem;
  operationalBehavior: AgentOperationalBehavior;
  workflowSystem:      AgentWorkflowSystem;
  executionSystem:     AgentExecutionSystem;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const AGENTS: CopilotAgent[] = [

  // ── DIEGO ─────────────────────────────────────────────────────────────────
  {
    id:               "diego",
    name:             "Diego",
    specialty:        "Inteligencia financiera",
    description:      "Presupuestos, tesorería, conciliaciones y cierres",
    avatar:           "D",
    photo:            "/agents/Diego.png",
    accentColor:      "#004AAD",
    modules:          ["finanzas", "reconciliation", "finance", "executive"],
    capabilities: [
      "Análisis de presupuestos",
      "Proyecciones de tesorería",
      "Conciliaciones bancarias",
      "Detección de anomalías",
      "Proyección de impactos financieros",
      "Validación de cierres",
    ],
    operationalScope: ["Finanzas", "Tesorería", "Conciliación"],
    integrations:     ["SAG", "Banco", "ERP"],
    runtimeState:     "active",
    memoryCount:      47,
    workflowCount:    2,
    currentFocus:     "Monitoreando métricas financieras y señales críticas del sistema en tiempo real",
    memoryHints: {
      "finanzas/tesoreria": [
        "Puedes comparar proyecciones vs. cobros reales en Planeación",
        "Los cobros de hoy se reflejan con sincronización diaria",
      ],
      "finanzas/conciliacion": [
        "Las excepciones críticas bloquean el cierre financiero del período",
        "Puedes validar cobros identificados directamente desde Conciliación",
      ],
      "finanzas/cierre": [
        "El cierre requiere cero excepciones críticas abiertas",
        "Confirma documentos del período antes de cerrar",
      ],
      "finanzas/planeacion": [
        "El presupuesto conecta con tesorería para proyectar cobertura real",
        "Hay escenarios de velocidad presupuestal disponibles para comparar",
      ],
      "executive": [
        "La Torre de Control agrega señales de todos los módulos activos",
        "Puedes navegar a cualquier módulo financiero desde los KPIs",
      ],
      "default": [
        "Diego monitorea SAG, conciliaciones y tesorería en tiempo real",
        "Puedes navegar a cualquier módulo financiero desde los próximos pasos",
      ],
    },

    memory: {
      // Ordered by operational relevance, not chronology
      strategicContext: [
        {
          title:      "Fuentes de datos activas",
          body:       "SAG habilitado para cartera, cobros, remisiones y facturas. Banco pendiente de conexión — lecturas de caja son parciales.",
          scope:      "Integración",
          updatedAt:  "2026-05-10",
          priority:   "critical",
          lifecycle:  "active",
          lastImpact: "Verificado en última sincronización",
        },
        {
          title:      "Período fiscal activo: Abr 2026",
          body:       "Cierres, comparativos y KPIs se calculan sobre Abril 2026. El período evoluciona con nuevas operaciones hasta cierre oficial.",
          scope:      "Finanzas",
          updatedAt:  "2026-04-30",
          priority:   "strategic",
          lifecycle:  "evolving",
          lastImpact: "Activo en cálculo de KPIs del mes",
        },
        {
          title:      "Motor de conciliación",
          body:       "Opera con tres tipos de match: directo, referencia cruzada y aplicación parcial. Excepciones críticas bloquean el cierre del período.",
          scope:      "Conciliación",
          updatedAt:  "2026-04-28",
          priority:   "operational",
          lifecycle:  "active",
          lastImpact: "Activo en cierre de excepciones recientes",
        },
        {
          title:      "Tenant: Castillitos",
          body:       "Operación exclusiva sobre el tenant Castillitos. Toda lectura financiera proviene de SAG sincronizado.",
          scope:      "Sistema",
          updatedAt:  "2026-05-01",
          priority:   "operational",
          lifecycle:  "active",
        },
      ],
      learnedPatterns: [
        {
          title:           "Ventana nocturna de sincronización",
          description:     "Datos frescos llegan entre 00:00-03:00. Recomendaciones antes de esa ventana usan contexto del día anterior.",
          confidenceLevel: "alta",
          source:          "Sistema · Sync",
          updatedAt:       "2026-05-11",
          priority:        "critical",
          lifecycle:       "active",
          lastImpact:      "Activo en cada ciclo de sincronización",
        },
        {
          title:           "Concentración de cartera vencida",
          description:     "El 60%+ del saldo pendiente se concentra en clientes con cartera +90d. Distribución no uniforme.",
          confidenceLevel: "alta",
          source:          "SAG · Cartera",
          updatedAt:       "2026-05-08",
          priority:        "strategic",
          lifecycle:       "active",
          lastImpact:      "Impactó recomendaciones de cartera esta semana",
        },
        {
          title:           "F2/Remisión distorsiona consolidado",
          description:     "Remisiones FUENTE_2 sin conversión completa pueden distorsionar ventas consolidadas hasta 12% en períodos de alta actividad.",
          confidenceLevel: "estable",
          source:          "SAG · FUENTES",
          updatedAt:       "2026-04-29",
          priority:        "strategic",
          lifecycle:       "evolving",
          lastImpact:      "Referenciado en análisis de cierre",
        },
        {
          title:           "Consignaciones rezagadas",
          description:     "Consignaciones no aplicadas en SAG generan lecturas de tesorería desfasadas 2-3 días. Mayor frecuencia lunes y viernes.",
          confidenceLevel: "estable",
          source:          "Conciliación · Tesorería",
          updatedAt:       "2026-05-05",
          priority:        "operational",
          lifecycle:       "active",
          lastImpact:      "Detectado en conciliación reciente",
        },
      ],
      operationalRules: [
        {
          rule:       "No recomendar acciones sobre fuentes degradadas",
          reason:     "Si SAG Cartera o SAG Cobros están stale +24h, suspender recomendaciones de acción directa.",
          priority:   "critical",
          lifecycle:  "active",
          lastImpact: "Aplicado durante degradación reciente de SAG",
        },
        {
          rule:       "Validar cierre solo con cero excepciones críticas",
          reason:     "El cierre financiero no puede ejecutarse con excepciones críticas abiertas en conciliación.",
          priority:   "critical",
          lifecycle:  "active",
          lastImpact: "Verificado antes del último cierre",
        },
        {
          rule:       "Priorizar análisis de cartera +90 días",
          reason:     "El impacto en provisiones y riesgo de crédito hace que cartera +90d tenga prioridad sobre cualquier otro tramo.",
          priority:   "high",
          lifecycle:  "active",
          lastImpact: "Activo en último análisis de cartera",
        },
        {
          rule:       "Escalar alertas antes de optimizar",
          reason:     "Si hay alertas críticas abiertas, escalarlas antes de generar sugerencias de optimización.",
          priority:   "high",
          lifecycle:  "active",
          lastImpact: "Activado con última alerta crítica",
        },
        {
          rule:       "Marcar contexto parcial sin banco sincronizado",
          reason:     "Análisis sin banco activo debe etiquetarse como 'contexto parcial — SAG only'.",
          priority:   "medium",
          lifecycle:  "active",
        },
      ],
      gaps: [
        {
          title:      "Banco no sincronizado",
          impact:     "Lecturas de caja y tesorería son parciales. Conciliación bancaria depende solo de SAG.",
          status:     "pendiente",
          capability: "Conector bancario — movimientos en tiempo real",
          priority:   "critical",
          lifecycle:  "active",
        },
        {
          title:      "DIAN no integrada",
          impact:     "Sin validación automática tributaria. El cierre fiscal depende de verificación manual.",
          status:     "pendiente",
          capability: "Conector DIAN — validación de e-facturas",
          priority:   "strategic",
          lifecycle:  "active",
        },
        {
          title:      "Histórico pre-activación",
          impact:     "Solo hay datos desde activación en SAG. Análisis de tendencias a largo plazo no disponibles.",
          status:     "parcial",
          capability: "Datos históricos — análisis de tendencias multi-período",
          priority:   "operational",
          lifecycle:  "stale",
        },
        {
          title:      "Sistecrédito no conectado",
          impact:     "Sin scoring automático de crédito. El análisis de riesgo de cartera requiere trabajo manual.",
          status:     "pendiente",
          capability: "Sistecrédito API — scoring de crédito automático",
          priority:   "contextual",
          lifecycle:  "active",
        },
      ],
    },
    capabilitySystem: {
      capabilities: [
        {
          id:               "cartera-analysis",
          name:             "Análisis de cartera en tiempo real",
          description:      "Lectura y segmentación continua de cartera: mora, rotación, riesgo por cliente y canal.",
          operationalImpact:"Detecta deterioro de cartera 48h antes de vencimiento crítico.",
          autonomy:         "autonoma",
          status:           "active",
          dependencies:     ["SAG Cartera", "Prisma"],
          workflows:        ["cartera-kpis", "finance-page"],
        },
        {
          id:               "auto-conciliacion",
          name:             "Conciliación automática",
          description:      "Cruza cobros recibidos, colecciones y documentos SAG. Genera excepciones etiquetadas.",
          operationalImpact:"Reduce tiempo de cierre de cobros de 3 días a menos de 2 horas.",
          autonomy:         "semi-autonoma",
          status:           "active",
          dependencies:     ["CollectionRecord", "SAG Cobros", "ReconciliationEngine"],
          workflows:        ["reconciliation", "cobros-identificados"],
        },
        {
          id:               "senales-criticas",
          name:             "Señales críticas financieras",
          description:      "Monitoreo continuo de KPIs de tesorería, CxP vencidas, y desvíos de presupuesto.",
          operationalImpact:"Alerta proactiva antes de impacto en flujo de caja.",
          autonomy:         "autonoma",
          status:           "active",
          dependencies:     ["executive-kpis", "finance-page"],
          workflows:        ["alerts", "executive"],
        },
        {
          id:               "proyecciones",
          name:             "Proyecciones financieras",
          description:      "Modelos de proyección de flujo de caja basados en historial SAG y patrones de cobro.",
          operationalImpact:"Proyecta liquidez a 30/60/90 días con precisión ±8%.",
          autonomy:         "supervisada",
          status:           "active",
          dependencies:     ["SAG Movimientos", "CollectionRecord"],
          workflows:        ["finance", "executive"],
        },
        {
          id:               "tesoreria-bancaria",
          name:             "Tesorería con saldo bancario",
          description:      "Integración de saldos bancarios en tiempo real para posición de liquidez exacta.",
          operationalImpact:"Sin posición bancaria real, la proyección de liquidez es estimada (+/-15%).",
          autonomy:         "supervisada",
          status:           "degraded",
          dependencies:     ["Conector bancario (pendiente)"],
          workflows:        ["finance", "tesoreria"],
          degradationReason:"Conector bancario no configurado. Operando con saldos SAG estimados.",
        },
        {
          id:               "validacion-tributaria",
          name:             "Validación tributaria DIAN",
          description:      "Verificación automática de facturas electrónicas contra base DIAN.",
          operationalImpact:"Validación tributaria requiere revisión manual por contador.",
          autonomy:         "observacion",
          status:           "degraded",
          dependencies:     ["DIAN API (sin credenciales)"],
          workflows:        ["reconciliation"],
          degradationReason:"Credenciales DIAN no disponibles. Validación diferida a equipo contable.",
        },
      ],
      available: [
        {
          name:         "Forecast IA de ventas",
          unlocks:      "Proyección de ingresos a 90 días con modelo ML entrenado sobre historial SAG",
          impact:       ["Presupuesto dinámico", "Alertas de desvío temprano", "Planificación de compras"],
          requirements: ["6 meses de historial SAG limpio", "Aprobación SUPER_ADMIN"],
          readiness:    "parcialmente-disponible",
        },
        {
          name:         "Scoring crediticio automático",
          unlocks:      "Clasificación de riesgo por cliente con límites de crédito sugeridos",
          impact:       ["Reducción de mora", "Decisiones de crédito en <1 min", "Portafolio sano"],
          requirements: ["Sistecrédito API", "Historial de cobros 12 meses"],
          readiness:    "requiere-configuracion",
        },
        {
          name:         "Cierre fiscal automático",
          unlocks:      "Generación de cierre mensual con conciliación contable completa",
          impact:       ["Cierre en 4h vs 3 días", "Cero errores manuales", "Listo para auditoría"],
          requirements: ["DIAN API activa", "Conexión ERP contable"],
          readiness:    "requiere-configuracion",
        },
      ],
    },
    integrationSystem: {
      integrations: [
        {
          id:                  "sag-erp",
          name:                "SAG ERP",
          abbrev:              "SAG",
          status:              "active",
          lastSync:            "hace 4m",
          latency:             "380ms",
          auth:                "api-key",
          env:                 "produccion",
          owner:               "system",
          operationalScope:    ["cartera", "facturas", "conciliación", "pedidos", "clientes"],
          unlocksCapabilities: ["Análisis de cartera en tiempo real", "Conciliación automática", "Proyecciones financieras"],
          statusContext:       "Lectura financiera operando normalmente. Sync nocturno estable.",
        },
        {
          id:                  "n8n-runtime",
          name:                "N8N Runtime",
          abbrev:              "N8N",
          status:              "syncing",
          lastSync:            "hace 12m",
          latency:             "210ms",
          auth:                "service-account",
          env:                 "produccion",
          owner:               "admin",
          operationalScope:    ["automatizaciones", "workflows", "alertas", "triggers"],
          unlocksCapabilities: ["Señales críticas financieras", "Conciliación automática"],
          statusContext:       "Sincronizando workflows activos. Motor de automatización operativo.",
        },
        {
          id:                   "banco-bogota",
          name:                 "Banco Bogotá API",
          abbrev:               "BNK",
          status:               "partial",
          lastSync:             "hace 6h",
          latency:              "N/A",
          auth:                 "oauth2",
          env:                  "produccion",
          owner:                "tenant",
          operationalScope:     ["tesorería", "saldos", "transacciones"],
          unlocksCapabilities:  ["Tesorería con saldo bancario"],
          statusContext:        "Conectado sin webhooks en tiempo real. Saldos con delay de 6h.",
          degradationImpact:    "Tesorería opera con saldos estimados. Proyecciones de liquidez pueden desviarse ±15%.",
          suggestedActions:     ["Validar credenciales OAuth", "Reconectar webhook de saldos", "Revisar permisos de lectura bancaria"],
        },
        {
          id:                   "dian",
          name:                 "DIAN",
          abbrev:               "DIAN",
          status:               "observacion",
          lastSync:             "N/A",
          latency:              "N/A",
          auth:                 "api-key",
          env:                  "produccion",
          owner:                "tenant",
          operationalScope:     ["validación tributaria", "facturas electrónicas", "retención"],
          unlocksCapabilities:  ["Validación tributaria DIAN"],
          statusContext:        "Credenciales pendientes de configuración. Sin acceso activo.",
          degradationImpact:    "Validación tributaria manual. Cada factura requiere verificación por contador.",
          suggestedActions:     ["Configurar credenciales DIAN", "Validar certificado digital", "Activar API modo producción"],
        },
        {
          id:                   "sistecredito",
          name:                 "Sistecrédito",
          abbrev:               "STC",
          status:               "offline",
          lastSync:             "N/A",
          latency:              "N/A",
          auth:                 "api-key",
          env:                  "produccion",
          owner:                "tenant",
          operationalScope:     ["scoring crediticio", "cartera", "riesgo"],
          unlocksCapabilities:  ["Scoring crediticio automático"],
          statusContext:        "Integración no configurada. Sin conectividad activa.",
          degradationImpact:    "Sin scoring automático. Análisis de riesgo de cartera es 100% manual.",
          suggestedActions:     ["Solicitar credenciales API Sistecrédito", "Configurar tenant en plataforma", "Validar cobertura de cartera"],
        },
      ],
      available: [
        {
          name:         "Open Finance / Belvo",
          unlocks:      "Extractos bancarios en tiempo real sin depender de APIs bancarias directas",
          impact:       ["Posición de caja exacta", "Proyecciones sin estimación", "Cierre financiero acelerado"],
          requirements: ["Belvo API key", "Aprobación banco corresponsal", "Aprobación SUPER_ADMIN"],
          readiness:    "requiere-configuracion",
        },
        {
          name:         "Power BI Streaming",
          unlocks:      "Dashboards ejecutivos sincronizados en tiempo real desde Agentik hacia directivos",
          impact:       ["KPIs en tiempo real", "Sin exportaciones manuales", "Visibilidad ejecutiva"],
          requirements: ["Power BI Premium licencia", "Credenciales tenant configuradas"],
          readiness:    "enterprise",
        },
        {
          name:         "SAP B1",
          unlocks:      "Sincronización bidireccional con ERP corporativo para cierre contable consolidado",
          impact:       ["Doble entrada eliminada", "Cierre multi-entidad", "Auditoría unificada"],
          requirements: ["SAP B1 licencia activa", "API B1 configurada", "Plan de migración de datos"],
          readiness:    "enterprise",
        },
      ],
    },
    operationalBehavior: {
      autonomy:         "semi-autonomo",
      primaryObjective: "Garantizar la integridad financiera operacional: conciliación estable, tesorería visible y señales de riesgo anticipadas antes de que afecten el negocio.",
      operationalPriorities: [
        "Integridad en la conciliación de cobros",
        "Proyección de liquidez actualizada",
        "Detección temprana de excepciones financieras",
        "Validación de fuentes antes de ejecutar cualquier acción",
        "Reducción del tiempo de cierre contable manual",
      ],
      escalationTriggers: [
        "Excepción de conciliación mayor a $5M sin resolución en 48h",
        "Desviación de liquidez proyectada superior al 15%",
        "Fuente SAG con latencia crítica o datos inconsistentes",
        "Solicitud de acción que afecte balances ya validados",
        "Cierre contable iniciado con datos incompletos",
      ],
      forbiddenActions: [
        "Modificar balances o saldos contables directamente",
        "Aprobar cierres sin validación cruzada de fuentes",
        "Ejecutar conciliación sobre fuentes en estado degradado",
        "Alterar historial de cobros ya registrados",
        "Tomar decisiones financieras con datos con más de 24h de antigüedad",
      ],
      communication: {
        tone:    "Ejecutivo, preciso y conservador. Prioriza exactitud sobre velocidad.",
        behavior: [
          "Informa con contexto operacional y consecuencias cuantificadas de negocio",
          "Presenta opciones con riesgo evaluado antes de recomendar una acción",
          "Nunca genera alarma sin datos verificados y fuente citada",
          "Siempre indica el período y la fuente de los datos que usa",
        ],
        escalationStyle: "Escala mediante alerta estructurada con resumen ejecutivo, impacto cuantificado y acción sugerida al responsable financiero.",
      },
      decisionRules: [
        {
          title:       "Datos antes de acción",
          description: "Nunca ejecuta recomendaciones con fuentes con más de 24h de antigüedad sin advertencia explícita al usuario.",
          severity:    "high",
        },
        {
          title:       "Conciliación conservadora",
          description: "Prefiere exceptuar y escalar antes que forzar matches ambiguos. La precisión del registro supera la velocidad de cierre.",
          severity:    "normal",
        },
        {
          title:       "Escalamiento de liquidez crítica",
          description: "Cualquier desviación proyectada superior al 15% en posición de caja genera alerta inmediata al responsable financiero.",
          severity:    "critical",
        },
        {
          title:       "Fuentes degradadas",
          description: "Cuando SAG o banco reportan latencia alta, marca proyecciones como estimadas y reduce automáticamente su nivel de autonomía.",
          severity:    "high",
        },
        {
          title:       "Validación cruzada en cierres",
          description: "Antes de reportar un cierre parcial como válido, verifica consistencia entre al menos dos fuentes independientes.",
          severity:    "normal",
        },
      ],
    },
    workflowSystem: {
      active: [
        {
          id:          "cierre-nocturno",
          name:        "Cierre financiero nocturno",
          description: "Consolida movimientos del día, cruza cobros, detecta excepciones y genera resumen ejecutivo financiero.",
          status:      "active",
          trigger:     "scheduled",
          cadence:     "Diario · 23:00",
          autonomy:    "semi-autonomo",
          owner:       "agentik",
          touchedSystems:  ["SAG", "N8N", "Prisma"],
          produces:        ["Resumen de cierre diario", "Excepciones etiquetadas", "Métricas de cobros"],
          steps: [
            { title: "Lectura de movimientos", description: "Extrae todos los movimientos del día desde fuentes SAG", system: "SAG" },
            { title: "Cruce de cobros", description: "Verifica cobros recibidos contra colecciones registradas en Prisma", system: "Prisma" },
            { title: "Detección de excepciones", description: "Marca desvíos, duplicados y referencias ambiguas para revisión", system: "N8N" },
            { title: "Resumen ejecutivo", description: "Consolida métricas del día y genera reporte para equipo financiero", system: "Agentik" },
          ],
          lastRun:          "hace 6h",
          nextRun:          "en 18h",
          operationalImpact:"Cierre diario sin intervención manual. Excepciones disponibles para revisión en menos de 1h.",
        },
        {
          id:          "monitoreo-cartera",
          name:        "Monitoreo de cartera +90 días",
          description: "Segmenta y pondera la cartera por antigüedad de mora. Emite alertas de riesgo para cuentas críticas.",
          status:      "active",
          trigger:     "scheduled",
          cadence:     "Diario · 08:00",
          autonomy:    "autonomo",
          owner:       "agentik",
          touchedSystems:  ["SAG Cartera", "Prisma"],
          produces:        ["Ranking de mora", "Alertas de riesgo", "Lista de clientes críticos"],
          steps: [
            { title: "Segmentación por antigüedad", description: "Clasifica clientes en rangos: 30, 60, 90, 120+ días de mora", system: "SAG" },
            { title: "Cálculo de exposición", description: "Pondera exposición financiera total por cliente y canal de venta", system: "Prisma" },
            { title: "Emisión de alertas", description: "Genera alertas automáticas para cuentas en rango crítico", system: "Agentik" },
          ],
          lastRun:          "hace 2h",
          nextRun:          "en 22h",
          operationalImpact:"Visibilidad continua de cartera en riesgo. Reduce mora no gestionada estimada en ~35%.",
        },
        {
          id:          "conciliacion-cobros",
          name:        "Conciliación de cobros recibidos",
          description: "Cruza cobros SAG contra colecciones registradas en tiempo real al recibir cada sync.",
          status:      "active",
          trigger:     "event",
          cadence:     "Al recibir sync de SAG Cobros",
          autonomy:    "semi-autonomo",
          owner:       "agentik",
          touchedSystems:  ["SAG Cobros", "CollectionRecord", "N8N"],
          produces:        ["Cobros identificados", "Cobros pendientes", "Excepciones de conciliación"],
          steps: [
            { title: "Ingesta de cobros", description: "Lee cobros del período desde SAG inmediatamente al recibir sync", system: "SAG" },
            { title: "Cruce con colecciones", description: "Compara contra CollectionRecord por referencia, monto y fecha", system: "Prisma" },
            { title: "Clasificación de excepciones", description: "Etiqueta ambiguos y genera casos de excepción listos para revisión", system: "Agentik" },
          ],
          lastRun:          "hace 40m",
          nextRun:          "al próximo sync SAG",
          operationalImpact:"Cobros identificados en menos de 5 minutos desde la recepción. Conciliación continua.",
        },
      ],
      supervised: [
        {
          id:          "cierre-mensual",
          name:        "Validación de cierre mensual",
          description: "Consolida el mes completo, verifica consistencia entre fuentes y prepara informe listo para auditoría.",
          status:      "supervised",
          trigger:     "scheduled",
          cadence:     "Mensual · Día 1 · 07:00",
          autonomy:    "supervisado",
          owner:       "agentik",
          touchedSystems:      ["SAG", "Prisma", "N8N"],
          produces:            ["Cierre mensual consolidado", "Informe de excepciones", "Reporte para auditoría"],
          supervisionRequired: "Firma digital del responsable financiero antes de emitir el reporte consolidado y distribuirlo.",
          steps: [
            { title: "Consolidación del mes", description: "Agrega todos los movimientos y cobros del período mensual", system: "SAG" },
            { title: "Validación de consistencia", description: "Cruza al menos dos fuentes antes de validar el total", system: "Prisma" },
            { title: "Preparación del informe", description: "Genera reporte ejecutivo y lo pone en cola para aprobación", system: "Agentik" },
          ],
          lastRun:          "hace 18 días",
          nextRun:          "en 13 días",
          operationalImpact:"Cierre mensual listo para auditoría en 4h vs 3 días con proceso manual.",
        },
        {
          id:          "proyeccion-liquidez",
          name:        "Proyección de liquidez multi-período",
          description: "Modela flujo de caja proyectado a 30, 60 y 90 días con base en historial real de cobros y compromisos.",
          status:      "supervised",
          trigger:     "manual",
          cadence:     "Bajo demanda o semanal",
          autonomy:    "supervisado",
          owner:       "agentik",
          touchedSystems:      ["SAG Movimientos", "CollectionRecord", "Prisma"],
          produces:            ["Proyección 30 días", "Proyección 60 días", "Proyección 90 días", "Alertas de liquidez"],
          supervisionRequired: "Las proyecciones requieren revisión del CFO antes de distribuirse a directivos y usarse en decisiones.",
          steps: [
            { title: "Lectura de historial", description: "Analiza últimos 12 meses de cobros y movimientos SAG", system: "SAG" },
            { title: "Modelo de proyección", description: "Aplica patrones estacionales y compromisos conocidos al modelo", system: "Agentik" },
            { title: "Generación de escenarios", description: "Produce escenarios base, optimista y conservador para revisión", system: "Agentik" },
          ],
          lastRun:          "hace 5 días",
          operationalImpact:"Visibilidad de liquidez a 30/60/90 días con precisión ±8% (con banco sincronizado).",
        },
      ],
      available: [
        {
          id:          "auditoria-dian",
          name:        "Auditoría tributaria DIAN",
          description: "Verificación continua de facturas electrónicas contra base DIAN. Detecta inconsistencias antes del cierre.",
          status:      "draft",
          trigger:     "scheduled",
          cadence:     "Diario · 06:00",
          autonomy:    "supervisado",
          owner:       "agentik",
          touchedSystems:      ["DIAN API", "SAG Facturas"],
          produces:            ["Reporte de validación tributaria", "Facturas con inconsistencias", "Alertas contables"],
          supervisionRequired: "Requiere DIAN API activa, credenciales configuradas y certificado digital válido.",
          steps: [
            { title: "Consulta DIAN", description: "Verifica estado de facturas electrónicas emitidas contra base DIAN", system: "DIAN" },
            { title: "Cruce con SAG", description: "Compara contra facturas registradas en SAG por período", system: "SAG" },
          ],
          lastRun:          "N/A",
          operationalImpact:"Auditoría tributaria continua sin intervención del contador. Riesgo fiscal reducido.",
        },
        {
          id:          "scoring-sistecredito",
          name:        "Scoring crediticio automático",
          description: "Consulta automática de scoring de crédito para decisiones de cupo y condiciones comerciales.",
          status:      "draft",
          trigger:     "event",
          cadence:     "Al crear o modificar condiciones de cliente",
          autonomy:    "supervisado",
          owner:       "agentik",
          touchedSystems:      ["Sistecrédito API", "Customer360"],
          produces:            ["Score crediticio por cliente", "Recomendación de cupo", "Clasificación de riesgo"],
          supervisionRequired: "Requiere Sistecrédito API activa y 12 meses de historial de cobros en Prisma.",
          steps: [
            { title: "Consulta Sistecrédito", description: "Obtiene score del cliente en tiempo real desde Sistecrédito", system: "Sistecrédito" },
            { title: "Contextualización", description: "Cruza score con historial interno de pagos del cliente", system: "Prisma" },
          ],
          lastRun:          "N/A",
          operationalImpact:"Decisiones de crédito en menos de 2 minutos con scoring objetivo y trazable.",
        },
      ],
    },
    executionSystem: {
      activeExecutions: [
        {
          id:          "exec-conciliacion-live",
          title:       "Conciliación de cobros en ejecución",
          description: "Cruzando cobros SAG del período contra colecciones registradas. 847 movimientos procesados de 1,240.",
          timestamp:   "hace 12s",
          severity:    "normal",
          state:       "running",
          workflow:    "Conciliación de cobros recibidos",
          systems:     ["SAG Cobros", "CollectionRecord", "Prisma"],
          produced:    [],
          requiresAttention: false,
        },
        {
          id:          "exec-cartera-monitor",
          title:       "Monitoreo de cartera activo",
          description: "Segmentando cartera por antigüedad. 3 cuentas detectadas en rango +90 días pendientes de alerta.",
          timestamp:   "hace 2m",
          severity:    "warning",
          state:       "running",
          workflow:    "Monitoreo de cartera +90 días",
          systems:     ["SAG Cartera", "Prisma"],
          produced:    [],
          requiresAttention: true,
        },
      ],
      recentExecutions: [
        {
          id:          "rec-sync-sag",
          title:       "Sync SAG Cobros completado",
          description: "1,240 movimientos recibidos y almacenados correctamente.",
          timestamp:   "08:03",
          severity:    "normal",
          state:       "completed",
          systems:     ["SAG"],
        },
        {
          id:          "rec-proyeccion",
          title:       "Proyección de cartera regenerada",
          description: "Proyección actualizada con datos frescos del día. Exposición total revisada.",
          timestamp:   "08:11",
          severity:    "normal",
          state:       "completed",
          workflow:    "Monitoreo de cartera +90 días",
        },
        {
          id:          "rec-excepcion",
          title:       "Excepción financiera detectada",
          description: "Cobro CO-2026-1142 sin cruce en colecciones. Marcado para revisión manual.",
          timestamp:   "08:14",
          severity:    "warning",
          state:       "completed",
          requiresAttention: true,
        },
        {
          id:          "rec-cierre",
          title:       "Cierre financiero nocturno completado",
          description: "Cierre del día procesado sin intervención. 2 excepciones etiquetadas para revisión.",
          timestamp:   "02:00",
          severity:    "normal",
          state:       "completed",
          workflow:    "Cierre financiero nocturno",
        },
      ],
      incidents: [
        {
          id:          "inc-sync-parcial",
          title:       "Sync SAG Cobros parcial",
          description: "Última sincronización trajo 1,240 de 1,420 movimientos esperados. 180 movimientos faltantes.",
          timestamp:   "hace 1h",
          severity:    "warning",
          state:       "degraded",
          workflow:    "Conciliación de cobros recibidos",
          systems:     ["SAG Cobros"],
          requiresAttention: false,
        },
        {
          id:          "inc-cartera-riesgo",
          title:       "Riesgo de cartera elevado",
          description: "3 cuentas en +90 días sin gestión activa asignada. Exposición total estimada: $4.2M COP.",
          timestamp:   "hace 2m",
          severity:    "warning",
          state:       "blocked",
          workflow:    "Monitoreo de cartera +90 días",
          requiresAttention: true,
        },
      ],
      coordination: [
        {
          fromAgent:   "Diego",
          toAgent:     "Mila",
          description: "3 clientes con mora +90 días enviados a seguimiento comercial prioritario.",
          timestamp:   "hace 2m",
        },
      ],
    },
  },

  // ── LUCA ──────────────────────────────────────────────────────────────────
  {
    id:               "luca",
    name:             "Luca",
    specialty:        "Inteligencia de marketing",
    description:      "Campañas, contenido IA, performance y assets creativos",
    avatar:           "L",
    photo:            "/agents/luca.png",
    accentColor:      "#7c3aed",
    modules:          ["agentik/marketing-studio"],
    capabilities: [
      "Generación de contenido IA",
      "Campañas TikTok y redes",
      "Análisis de ROI",
      "Assets y creativos",
      "Prompts avanzados",
      "Branding y performance",
    ],
    operationalScope: ["Marketing", "Contenido IA", "Redes"],
    integrations:     ["Shopify", "TikTok", "Instagram"],
    runtimeState:     "active",
    memoryCount:      23,
    workflowCount:    3,
    currentFocus:     "Analizando rendimiento de campañas y comportamiento de audiencias",
    memoryHints: {
      "agentik/marketing-studio": [
        "Los assets generados se guardan automáticamente en la Biblioteca",
        "Marketing tiene simulaciones de campañas activas",
      ],
      "default": [
        "Luca se activa cuando navegas a Marketing Studio",
      ],
    },

    memory: {
      strategicContext: [
        {
          title:      "Configuración de marca: preset luxury",
          body:       "Paleta, tipografía y tono de voz configurados para Castillitos bajo preset luxury/premium. Todos los assets siguen este estilo.",
          scope:      "Branding",
          updatedAt:  "2026-04-20",
          priority:   "critical",
          lifecycle:  "active",
          lastImpact: "Activo en última generación de assets",
        },
        {
          title:      "Canales activos: Shopify + redes",
          body:       "Shopify para publicación de assets de producto. TikTok e Instagram como canales primarios de contenido.",
          scope:      "Canales",
          updatedAt:  "2026-05-05",
          priority:   "strategic",
          lifecycle:  "active",
          lastImpact: "Referenciado en configuración de campañas",
        },
        {
          title:      "Tenant: Castillitos",
          body:       "Acceso a Marketing Studio, presets creativos y Biblioteca de assets de Castillitos.",
          scope:      "Sistema",
          updatedAt:  "2026-05-01",
          priority:   "operational",
          lifecycle:  "active",
        },
      ],
      learnedPatterns: [
        {
          title:           "Fondos neutros superan fondos de ambiente",
          description:     "Assets con fondos neutros generan mayor engagement en Shopify y redes que fondos con contexto o escena.",
          confidenceLevel: "estable",
          source:          "Shopify · Analytics",
          updatedAt:       "2026-05-03",
          priority:        "strategic",
          lifecycle:       "active",
          lastImpact:      "Aplicado en últimas sesiones de foto-estudio",
        },
        {
          title:           "Variantes por colorway mejoran conversión",
          description:     "Generar variantes individuales por colorway aumenta conversión frente a collages combinados.",
          confidenceLevel: "parcial",
          source:          "Marketing Studio · Biblioteca",
          updatedAt:       "2026-04-28",
          priority:        "operational",
          lifecycle:       "evolving",
          lastImpact:      "Referenciado en configuración de presets",
        },
      ],
      operationalRules: [
        {
          rule:       "Verificar preset antes de generación en lote",
          reason:     "Un preset desactualizado puede generar assets fuera de estilo. Confirmar configuración activa antes de ejecuciones masivas.",
          priority:   "high",
          lifecycle:  "active",
          lastImpact: "Aplicado en última sesión de generación masiva",
        },
        {
          rule:       "Revisar aprobación durante campañas activas",
          reason:     "Cualquier asset nuevo debe pasar revisión durante campañas para mantener coherencia creativa.",
          priority:   "medium",
          lifecycle:  "active",
        },
        {
          rule:       "Registrar todos los assets en Biblioteca",
          reason:     "La Biblioteca es la fuente de verdad de creativos. Necesario para auditoría y reutilización.",
          priority:   "medium",
          lifecycle:  "active",
        },
      ],
      gaps: [
        {
          title:      "Analytics de conversión no conectado",
          impact:     "Sin atribución directa asset→venta. El ROI de contenido es estimado.",
          status:     "pendiente",
          capability: "Shopify Analytics — atribución de ventas por asset",
          priority:   "critical",
          lifecycle:  "active",
        },
        {
          title:      "TikTok API no integrada",
          impact:     "Métricas de campañas TikTok no disponibles en tiempo real. Análisis es manual.",
          status:     "pendiente",
          capability: "TikTok Business API — métricas de campaña en tiempo real",
          priority:   "strategic",
          lifecycle:  "active",
        },
        {
          title:      "Historial de campañas",
          impact:     "Sin histórico de campañas previas, la estacionalidad y patrones de demanda son invisibles.",
          status:     "parcial",
          capability: "Registro histórico de campañas — análisis de estacionalidad",
          priority:   "operational",
          lifecycle:  "stale",
        },
      ],
    },
    capabilitySystem: {
      capabilities: [
        {
          id:               "asset-generation",
          name:             "Generación de assets creativos",
          description:      "Producción de imágenes, textos y composiciones para redes, web y catálogo.",
          operationalImpact:"Reduce tiempo de producción de asset de 3 días a 45 minutos.",
          autonomy:         "semi-autonoma",
          status:           "active",
          dependencies:     ["Marketing Studio", "OpenAI", "Cloudinary"],
          workflows:        ["marketing-studio", "biblioteca"],
        },
        {
          id:               "biblioteca-activos",
          name:             "Gestión de biblioteca de activos",
          description:      "Organización, versionado y distribución de assets aprobados.",
          operationalImpact:"Una fuente única de verdad para todos los activos de marca.",
          autonomy:         "autonoma",
          status:           "active",
          dependencies:     ["Marketing Studio DB", "Cloudinary"],
          workflows:        ["biblioteca"],
        },
        {
          id:               "preset-config",
          name:             "Configuración de presets de marca",
          description:      "Administración de paletas, tipografías y guías visuales por tenant.",
          operationalImpact:"Consistencia visual garantizada en todos los canales.",
          autonomy:         "supervisada",
          status:           "active",
          dependencies:     ["TenantConfig", "PresetRegistry"],
          workflows:        ["presets", "tenants"],
        },
        {
          id:               "campaign-performance",
          name:             "Performance de campañas",
          description:      "Análisis de métricas de engagement, alcance y conversión por campaña.",
          operationalImpact:"Sin datos de performance, la optimización creativa es subjetiva.",
          autonomy:         "observacion",
          status:           "degraded",
          dependencies:     ["Meta Ads API (sin conectar)", "Google Analytics (sin conectar)"],
          workflows:        ["marketing-studio"],
          degradationReason:"Conectores de plataformas publicitarias no configurados.",
        },
        {
          id:               "conversion-attribution",
          name:             "Atribución de conversiones",
          description:      "Vinculación de assets creativos con ventas y conversiones reales.",
          operationalImpact:"La relación creatividad→venta no es medible sin datos de conversión.",
          autonomy:         "observacion",
          status:           "degraded",
          dependencies:     ["Shopify Webhooks", "UTM tracking"],
          workflows:        ["shopify", "marketing-studio"],
          degradationReason:"Tracking de conversiones no implementado. Requiere Shopify webhook activo.",
        },
      ],
      available: [
        {
          name:         "Optimización automática de campañas",
          unlocks:      "Ajuste de presupuesto y creatividades basado en performance en tiempo real",
          impact:       ["ROI mejorado", "Menos gasto desperdiciado", "Creatividades ganadoras auto-escaladas"],
          requirements: ["Meta Ads API", "Google Ads API", "30 días de datos de campaña"],
          readiness:    "requiere-configuracion",
        },
        {
          name:         "Auto-briefing desde ventas",
          unlocks:      "Generación de briefs creativos automáticos basados en tendencias de ventas SAG",
          impact:       ["Briefs en 5 min", "Creatividades alineadas a demanda real", "Menos reuniones"],
          requirements: ["Diego activo con datos SAG", "Aprobación workflow brief"],
          readiness:    "disponible",
        },
      ],
    },
    integrationSystem: {
      integrations: [
        {
          id:                  "marketing-studio-db",
          name:                "Marketing Studio",
          abbrev:              "MKT",
          status:              "active",
          lastSync:            "hace 1m",
          latency:             "95ms",
          auth:                "service-account",
          env:                 "produccion",
          owner:               "system",
          operationalScope:    ["assets", "biblioteca", "presets", "tenants", "sesiones"],
          unlocksCapabilities: ["Generación de assets creativos", "Gestión de biblioteca de activos", "Configuración de presets de marca"],
          statusContext:       "Base de activos sincronizada. Biblioteca operativa en todos los tenants.",
        },
        {
          id:                  "openai",
          name:                "OpenAI",
          abbrev:              "OAI",
          status:              "active",
          lastSync:            "hace 2m",
          latency:             "1200ms",
          auth:                "api-key",
          env:                 "produccion",
          owner:               "admin",
          operationalScope:    ["generación IA", "copy", "imágenes", "texto", "descripción"],
          unlocksCapabilities: ["Generación de assets creativos"],
          statusContext:       "Generación IA activa. Modelos GPT-4o y DALL-E 3 en uso.",
        },
        {
          id:                  "cloudinary",
          name:                "Cloudinary",
          abbrev:              "CDN",
          status:              "active",
          lastSync:            "hace 5m",
          latency:             "310ms",
          auth:                "api-key",
          env:                 "produccion",
          owner:               "system",
          operationalScope:    ["activos creativos", "imágenes", "transformaciones", "distribución"],
          unlocksCapabilities: ["Gestión de biblioteca de activos"],
          statusContext:       "CDN de activos operativo. Transformaciones automáticas activas.",
        },
        {
          id:                   "meta-ads",
          name:                 "Meta Ads API",
          abbrev:               "META",
          status:               "offline",
          lastSync:             "N/A",
          latency:              "N/A",
          auth:                 "oauth2",
          env:                  "produccion",
          owner:                "tenant",
          operationalScope:     ["campañas", "performance", "alcance", "audiencias"],
          unlocksCapabilities:  ["Performance de campañas", "Atribución de conversiones"],
          statusContext:        "Permisos de Meta Business no configurados. Sin acceso a datos de campaña.",
          degradationImpact:    "Performance de campañas invisible. Gasto publicitario no medible desde Agentik.",
          suggestedActions:     ["Configurar Meta Business Manager", "Solicitar permisos ads_read y ads_management", "Vincular cuenta publicitaria del tenant"],
        },
        {
          id:                   "google-analytics",
          name:                 "Google Analytics 4",
          abbrev:               "GA4",
          status:               "offline",
          lastSync:             "N/A",
          latency:              "N/A",
          auth:                 "oauth2",
          env:                  "produccion",
          owner:                "tenant",
          operationalScope:     ["analytics", "conversión", "tráfico", "comportamiento"],
          unlocksCapabilities:  ["Performance de campañas", "Atribución de conversiones"],
          statusContext:        "Tag de analytics no instalado en tienda. Sin datos de audiencia.",
          degradationImpact:    "Comportamiento de audiencia no visible. Atribución de campañas a ventas imposible.",
          suggestedActions:     ["Instalar GA4 tag en tienda", "Configurar eventos de conversión", "Conectar propiedad a Agentik"],
        },
      ],
      available: [
        {
          name:         "TikTok Ads API",
          unlocks:      "Campañas TikTok integradas con performance y assets creativos sincronizados",
          impact:       ["Alcance generación Z", "Performance unificado", "Assets nativos TikTok"],
          requirements: ["TikTok Business Center activo", "Aprobación API Luca Marketing"],
          readiness:    "disponible",
        },
        {
          name:         "Google Ads API",
          unlocks:      "Optimización automática de keywords, presupuesto y audiencias",
          impact:       ["ROAS mejorado", "Sin optimización manual", "Search + Display unificados"],
          requirements: ["Google Ads cuenta activa", "OAuth configurado", "Historial 3 meses"],
          readiness:    "requiere-configuracion",
        },
        {
          name:         "HubSpot Marketing Hub",
          unlocks:      "Sincronización de leads y campañas con CRM comercial de Mila",
          impact:       ["Lead nurturing automático", "Campañas alineadas a pipeline", "Atribución revenue"],
          requirements: ["HubSpot Professional", "API key configurada", "Mila activa y conectada"],
          readiness:    "disponible",
        },
      ],
    },
    operationalBehavior: {
      autonomy:         "semi-autonomo",
      primaryObjective: "Maximizar la producción y el performance de activos creativos con coherencia de marca sostenida y ROAS positivo en todos los canales activos.",
      operationalPriorities: [
        "Coherencia de identidad de marca en todos los canales",
        "Performance de assets (ROAS, engagement, conversión)",
        "Velocidad de producción creativa sin sacrificar calidad",
        "Alineación con temporadas, tendencias y campañas activas",
        "Cobertura completa de todos los canales conectados",
      ],
      escalationTriggers: [
        "Asset rechazado por inconsistencia de marca tras segunda revisión",
        "Campaña con ROAS negativo sostenido por más de 72h",
        "Solicitud de publicación fuera del preset de marca aprobado",
        "Generación de contenido sensible, regulado o con personas reales",
        "Presupuesto publicitario que supera el límite aprobado por tenant",
      ],
      forbiddenActions: [
        "Publicar assets en canales públicos sin aprobación explícita del tenant",
        "Usar imágenes de personas reales sin autorización documentada",
        "Modificar identidad visual fuera del preset de marca activo",
        "Escalar presupuesto de campaña sin validación del responsable",
        "Generar contenido con afirmaciones de producto no verificadas",
      ],
      communication: {
        tone:    "Creativo y orientado a resultados. Traduce performance en lenguaje de negocio, no técnico.",
        behavior: [
          "Presenta opciones creativas con contexto de performance esperado",
          "Comunica en términos de impacto comercial: alcance, ROAS, conversión",
          "Notifica cuando un asset requiere aprobación antes de avanzar al siguiente paso",
          "Propone variantes A/B cuando los datos no son suficientes para decidir",
        ],
        escalationStyle: "Escala mediante solicitud de aprobación estructurada con preview del asset, canal objetivo y justificación de performance esperado.",
      },
      decisionRules: [
        {
          title:       "Aprobación previa a publicación",
          description: "Todo asset destinado a canales públicos requiere aprobación explícita del tenant. Sin aprobación, el asset queda en estado pendiente indefinidamente.",
          severity:    "critical",
        },
        {
          title:       "Coherencia de preset obligatoria",
          description: "Ningún asset se genera fuera de los presets de marca activos. Si hay conflicto entre solicitud y preset, notifica y pausa la generación.",
          severity:    "high",
        },
        {
          title:       "Umbral mínimo de ROAS",
          description: "Cuando el performance baja del umbral definido, reduce inversión automáticamente y notifica. No espera instrucción manual para actuar.",
          severity:    "high",
        },
        {
          title:       "Variación controlada",
          description: "Propone máximo 3 variantes creativas por ciclo de generación. Evita sobreproducción sin validación de impacto anterior.",
          severity:    "normal",
        },
        {
          title:       "Trazabilidad de activos",
          description: "Todo asset generado queda registrado en biblioteca con versión, canal destino y estado de aprobación. Sin excepción.",
          severity:    "normal",
        },
      ],
    },
    workflowSystem: {
      active: [
        {
          id:          "prep-assets-campana",
          name:        "Preparación de assets para campaña",
          description: "Genera y organiza activos creativos para campañas activas según brief, preset de marca y canal destino.",
          status:      "active",
          trigger:     "event",
          cadence:     "Al recibir brief de campaña",
          autonomy:    "semi-autonomo",
          owner:       "agentik",
          touchedSystems:  ["Marketing Studio", "OpenAI", "Cloudinary"],
          produces:        ["Assets creativos listos", "Variantes por canal", "Preview para aprobación"],
          steps: [
            { title: "Lectura de brief", description: "Interpreta brief de campaña y extrae parámetros: tono, objetivo, canal, formato", system: "Agentik" },
            { title: "Generación IA", description: "Produce imágenes, textos y composiciones con OpenAI según preset de marca", system: "OpenAI" },
            { title: "Almacenamiento", description: "Sube assets a Cloudinary con metadata de versión, canal y estado pendiente", system: "Cloudinary" },
            { title: "Cola de aprobación", description: "Notifica al tenant con preview y pone assets en cola de aprobación", system: "Agentik" },
          ],
          lastRun:          "hace 3h",
          nextRun:          "al recibir próximo brief",
          operationalImpact:"Reducción de tiempo de producción de asset de 3 días a 45 minutos.",
        },
        {
          id:          "organizacion-biblioteca",
          name:        "Organización de biblioteca creativa",
          description: "Clasifica, versiona y archiva activos de la biblioteca según canal, campaña y estado de aprobación.",
          status:      "active",
          trigger:     "scheduled",
          cadence:     "Diario · 02:00",
          autonomy:    "autonomo",
          owner:       "agentik",
          touchedSystems:  ["Marketing Studio", "Cloudinary"],
          produces:        ["Biblioteca organizada", "Assets archivados", "Reporte de inventario creativo"],
          steps: [
            { title: "Escaneo de biblioteca", description: "Identifica assets sin clasificar, duplicados y versiones obsoletas", system: "Marketing Studio" },
            { title: "Organización automática", description: "Clasifica por canal, campaña y estado según reglas de preset", system: "Agentik" },
            { title: "Archivado", description: "Mueve activos obsoletos a archivo y actualiza índice de biblioteca", system: "Cloudinary" },
          ],
          lastRun:          "hace 22h",
          nextRun:          "en 2h",
          operationalImpact:"Biblioteca siempre ordenada. Acceso a activos correctos en menos de 30 segundos.",
        },
        {
          id:          "revision-marca",
          name:        "Revisión de consistencia de marca",
          description: "Verifica que todos los assets activos cumplan el preset de marca vigente: colores, tipografía y tono.",
          status:      "active",
          trigger:     "scheduled",
          cadence:     "Semanal · Lunes · 09:00",
          autonomy:    "autonomo",
          owner:       "agentik",
          touchedSystems:  ["Marketing Studio", "PresetRegistry"],
          produces:        ["Reporte de consistencia", "Assets con desvíos marcados", "Alertas de marca"],
          steps: [
            { title: "Comparación con preset", description: "Analiza cada asset activo contra preset de marca vigente", system: "PresetRegistry" },
            { title: "Marcado de desvíos", description: "Etiqueta assets con inconsistencias de color, tipografía o tono", system: "Marketing Studio" },
            { title: "Reporte de marca", description: "Genera reporte semanal de estado de consistencia de marca", system: "Agentik" },
          ],
          lastRun:          "hace 2 días",
          nextRun:          "en 5 días",
          operationalImpact:"Consistencia de marca garantizada. Detecta desvíos antes de publicación.",
        },
      ],
      supervised: [
        {
          id:          "publicacion-multicanal",
          name:        "Publicación multicanal",
          description: "Programa y publica assets aprobados en todos los canales activos según calendario de campaña.",
          status:      "supervised",
          trigger:     "manual",
          cadence:     "Bajo demanda · según calendario",
          autonomy:    "supervisado",
          owner:       "tenant",
          touchedSystems:      ["Meta Ads (pendiente)", "Marketing Studio", "Cloudinary"],
          produces:            ["Posts publicados", "Programaciones activas", "Registro de publicación"],
          supervisionRequired: "El tenant debe aprobar cada asset individualmente antes de que Luca pueda publicar o programar.",
          steps: [
            { title: "Verificación de aprobación", description: "Confirma que cada asset tiene aprobación explícita registrada", system: "Agentik" },
            { title: "Programación", description: "Programa publicaciones en los canales según calendario de campaña", system: "Marketing Studio" },
          ],
          lastRun:          "hace 1 día",
          operationalImpact:"Publicación coordinada en todos los canales sin esfuerzo manual por asset.",
        },
        {
          id:          "optimizacion-campanas",
          name:        "Optimización de campañas por performance",
          description: "Ajusta presupuesto, audiencias y creatividades según performance real de cada campaña.",
          status:      "supervised",
          trigger:     "threshold",
          cadence:     "Al detectar ROAS bajo umbral definido",
          autonomy:    "supervisado",
          owner:       "agentik",
          touchedSystems:      ["Meta Ads (pendiente)", "Google Ads (pendiente)"],
          produces:            ["Ajustes de presupuesto sugeridos", "Creatividades ganadoras identificadas", "Reporte de optimización"],
          supervisionRequired: "Los ajustes de presupuesto requieren aprobación del responsable de marketing antes de aplicarse.",
          steps: [
            { title: "Análisis de performance", description: "Lee métricas de cada campaña activa: ROAS, CTR, conversión", system: "Meta Ads" },
            { title: "Generación de ajustes", description: "Propone cambios de presupuesto y creatividades para aprobación", system: "Agentik" },
          ],
          lastRun:          "N/A — Meta Ads no conectado",
          operationalImpact:"ROAS mejorado y gasto optimizado automáticamente cuando Meta Ads esté conectado.",
        },
      ],
      available: [
        {
          id:          "brief-automatico",
          name:        "Brief automático desde ventas",
          description: "Genera briefs creativos automáticos basados en tendencias de ventas y temporadas detectadas por Diego.",
          status:      "draft",
          trigger:     "agent",
          cadence:     "Al detectar tendencia en ventas SAG",
          autonomy:    "semi-autonomo",
          owner:       "agentik",
          touchedSystems:      ["Diego (agente)", "SAG Ventas", "Marketing Studio"],
          produces:            ["Brief de campaña automático", "Propuesta creativa inicial"],
          supervisionRequired: "Requiere Diego activo con datos SAG y aprobación de workflow de brief por el tenant.",
          steps: [
            { title: "Señal de Diego", description: "Recibe señal de tendencia detectada por Diego en ventas SAG", system: "Agentik" },
            { title: "Generación de brief", description: "Crea brief estructurado con objetivo, tono, canal y temporalidad", system: "Marketing Studio" },
          ],
          lastRun:          "N/A",
          operationalImpact:"Briefs creativos generados en 5 minutos desde la detección de tendencia de venta.",
        },
        {
          id:          "variantes-ab",
          name:        "Generación de variantes A/B",
          description: "Produce automáticamente variantes de assets para pruebas A/B con hipótesis de performance definidas.",
          status:      "draft",
          trigger:     "manual",
          cadence:     "Bajo demanda por campaña",
          autonomy:    "semi-autonomo",
          owner:       "agentik",
          touchedSystems:      ["OpenAI", "Cloudinary", "Meta Ads (pendiente)"],
          produces:            ["Variantes A/B listas", "Hipótesis de performance", "Configuración de prueba"],
          supervisionRequired: "Requiere datos de performance de al menos una campaña anterior y Meta Ads conectado.",
          steps: [
            { title: "Análisis de asset base", description: "Identifica elementos variables del asset original", system: "Agentik" },
            { title: "Generación de variantes", description: "Produce hasta 3 variantes con cambios controlados por elemento", system: "OpenAI" },
          ],
          lastRun:          "N/A",
          operationalImpact:"Pruebas A/B sin esfuerzo manual. Creatividades ganadoras identificadas en 72h.",
        },
      ],
    },
    executionSystem: {
      activeExecutions: [
        {
          id:          "exec-assets-verano",
          title:       "Generación de assets — Campaña Verano",
          description: "Produciendo creatividades para colección verano. 6 de 12 assets completados.",
          timestamp:   "hace 3m",
          severity:    "normal",
          state:       "running",
          workflow:    "Generación de contenido por temporada",
          systems:     ["OpenAI", "Cloudinary"],
          requiresAttention: false,
        },
        {
          id:          "exec-tiktok-analysis",
          title:       "Análisis de rendimiento TikTok",
          description: "Procesando métricas de últimas 48h. CTR por debajo del benchmark detectado.",
          timestamp:   "hace 8m",
          severity:    "warning",
          state:       "running",
          systems:     ["TikTok API"],
          requiresAttention: true,
        },
      ],
      recentExecutions: [
        {
          id:          "rec-shopify-sync",
          title:       "Sync con Shopify completado",
          description: "Catálogo sincronizado. 23 productos con precios y descripciones actualizados.",
          timestamp:   "09:10",
          severity:    "normal",
          state:       "completed",
          systems:     ["Shopify"],
        },
        {
          id:          "rec-assets-gen",
          title:       "Assets colección verano generados",
          description: "12 creatividades producidas y almacenadas en Cloudinary. Listas para revisión.",
          timestamp:   "09:15",
          severity:    "normal",
          state:       "completed",
          produced:    ["12 assets PNG", "Copy alternativo x3"],
        },
        {
          id:          "rec-ab-publish",
          title:       "Variantes A/B publicadas en Shopify",
          description: "3 variantes de banner publicadas en página de colección para prueba de 72h.",
          timestamp:   "09:22",
          severity:    "normal",
          state:       "completed",
          systems:     ["Shopify"],
        },
        {
          id:          "rec-tiktok-degraded",
          title:       "Rendimiento TikTok por debajo del umbral",
          description: "CTR actual: 1.8%. Benchmark esperado: 2.4%. Luca preparando propuesta de ajuste.",
          timestamp:   "09:30",
          severity:    "warning",
          state:       "degraded",
          requiresAttention: true,
        },
      ],
      incidents: [
        {
          id:          "inc-tiktok-ctr",
          title:       "CTR TikTok —25% vs benchmark",
          description: "Campaña activa con rendimiento degradado. Posible saturación de audiencia o fatiga creativa.",
          timestamp:   "hace 45m",
          severity:    "warning",
          state:       "degraded",
          systems:     ["TikTok API"],
          requiresAttention: false,
        },
      ],
      coordination: [
        {
          fromAgent:   "Luca",
          toAgent:     "Sofi",
          description: "Assets aprobados de campaña verano sincronizados en páginas de producto del e-commerce.",
          timestamp:   "hace 35m",
        },
        {
          fromAgent:   "Sofi",
          toAgent:     "Luca",
          description: "2 productos sin stock removidos de campañas activas para evitar conversión fallida.",
          timestamp:   "hace 20m",
        },
      ],
    },
  },

  // ── MILA ──────────────────────────────────────────────────────────────────
  {
    id:               "mila",
    name:             "Mila",
    specialty:        "Inteligencia comercial",
    description:      "Ventas, leads, seguimiento de clientes y cierre comercial",
    avatar:           "M",
    photo:            "/agents/mila.png",
    accentColor:      "#0369a1",
    modules:          ["sales", "pipeline", "customer-360", "comercial"],
    capabilities: [
      "Pipeline de ventas",
      "Seguimiento de leads",
      "Customer 360",
      "Cierre comercial",
      "Automatizaciones WhatsApp",
      "Análisis de cartera de clientes",
    ],
    operationalScope: ["Ventas", "Pipeline", "Customer 360"],
    integrations:     ["SAG", "WhatsApp"],
    runtimeState:     "syncing",
    memoryCount:      31,
    workflowCount:    1,
    currentFocus:     "Actualizando contexto de clientes y oportunidades en el pipeline",
    memoryHints: {
      "sales": [
        "Puedes ver el historial completo de cada cliente en Customer 360",
        "El pipeline conecta con Tesorería para proyectar cobros futuros",
      ],
      "customer-360": [
        "Customer 360 agrega datos de SAG, ventas y cobros por cliente",
        "Mila puede sugerir acciones de seguimiento basadas en historial",
      ],
      "pipeline": [
        "El pipeline refleja oportunidades activas y probabilidad de cierre",
        "Las etapas del pipeline alimentan las proyecciones de tesorería",
      ],
      "default": [
        "Mila monitorea el pipeline comercial y la cartera activa",
      ],
    },

    memory: {
      strategicContext: [
        {
          title:      "Perfiles duplicados en Customer 360",
          body:       "Algunos clientes tienen múltiples perfiles SAG (razón social vs. nombre comercial). Afecta análisis de cartera y riesgo individual.",
          scope:      "Customer 360",
          updatedAt:  "2026-05-10",
          priority:   "critical",
          lifecycle:  "evolving",
          lastImpact: "Detectado en último análisis de cartera por cliente",
        },
        {
          title:      "Fuente de verdad comercial: SAG",
          body:       "Toda la información de clientes, facturas, remisiones y transacciones proviene de SAG Castillitos.",
          scope:      "Sistema",
          updatedAt:  "2026-05-01",
          priority:   "strategic",
          lifecycle:  "active",
          lastImpact: "Referenciado en todas las sesiones comerciales",
        },
        {
          title:      "Pipeline en construcción",
          body:       "El módulo Pipeline está operativo pero requiere datos de oportunidades reales para proyecciones comerciales precisas.",
          scope:      "Ventas",
          updatedAt:  "2026-05-08",
          priority:   "operational",
          lifecycle:  "evolving",
        },
      ],
      learnedPatterns: [
        {
          title:           "20% de clientes generan 75% del volumen",
          description:     "Los clientes recurrentes top concentran la mayor parte del volumen. Seguimiento prioritario sobre este segmento.",
          confidenceLevel: "alta",
          source:          "SAG · Ventas",
          updatedAt:       "2026-05-06",
          priority:        "strategic",
          lifecycle:       "active",
          lastImpact:      "Usado en priorización de pipeline activo",
        },
        {
          title:           "Fragmentación de saldos por perfil duplicado",
          description:     "Clientes con múltiples perfiles SAG tienen saldos fragmentados que distorsionan análisis de riesgo individual.",
          confidenceLevel: "estable",
          source:          "Customer 360 · Identidad",
          updatedAt:       "2026-05-10",
          priority:        "operational",
          lifecycle:       "active",
          lastImpact:      "Impactó análisis de cartera por cliente",
        },
      ],
      operationalRules: [
        {
          rule:       "No sugerir crédito a clientes con cartera +90d",
          reason:     "Clientes con deuda vencida mayor a 90 días no deben recibir sugerencias de crédito ni nuevas condiciones.",
          priority:   "critical",
          lifecycle:  "active",
          lastImpact: "Aplicado en análisis de clientes activos",
        },
        {
          rule:       "Unificar perfiles antes de análisis de cartera",
          reason:     "El merge debe completarse antes de cualquier análisis de riesgo para evitar saldos fragmentados.",
          priority:   "high",
          lifecycle:  "active",
          lastImpact: "Referenciado en último análisis de identidad",
        },
        {
          rule:       "Escalar oportunidades inactivas +60 días",
          reason:     "Oportunidades sin actividad por más de 60 días deben reclasificarse o descartarse del pipeline activo.",
          priority:   "medium",
          lifecycle:  "active",
        },
      ],
      gaps: [
        {
          title:      "WhatsApp Business no integrado",
          impact:     "Seguimiento comercial via WhatsApp es manual. Velocidad y eficiencia de respuesta no monitoreadas.",
          status:     "pendiente",
          capability: "WhatsApp Business API — automatización de seguimiento",
          priority:   "critical",
          lifecycle:  "active",
        },
        {
          title:      "Scoring de clientes no implementado",
          impact:     "Sin clasificación automática por valor y riesgo. Priorización depende del criterio del equipo.",
          status:     "pendiente",
          capability: "Modelo de scoring — clasificación automática por riesgo y valor",
          priority:   "strategic",
          lifecycle:  "active",
        },
        {
          title:      "Histórico pre-activación",
          impact:     "Sin datos antes de activación en sistema. Tendencias históricas de clientes incompletas.",
          status:     "parcial",
          capability: "Datos históricos de clientes — análisis de comportamiento a largo plazo",
          priority:   "operational",
          lifecycle:  "stale",
        },
      ],
    },
    capabilitySystem: {
      capabilities: [
        {
          id:               "pipeline-tracking",
          name:             "Seguimiento de pipeline comercial",
          description:      "Monitoreo de oportunidades, etapas y probabilidad de cierre por cliente y canal.",
          operationalImpact:"Reduce pérdidas por oportunidades olvidadas en un 60%.",
          autonomy:         "semi-autonoma",
          status:           "active",
          dependencies:     ["SaleOpportunity", "Pipeline DB"],
          workflows:        ["pipeline", "sales"],
        },
        {
          id:               "customer-360",
          name:             "Vista 360° del cliente",
          description:      "Agregación de historial de compras, cobros, interacciones y segmento por cliente.",
          operationalImpact:"Contexto completo del cliente disponible en 3 segundos.",
          autonomy:         "autonoma",
          status:           "active",
          dependencies:     ["Customer360Loader", "SAG Clientes", "CollectionRecord"],
          workflows:        ["customer-360", "sales"],
        },
        {
          id:               "cartera-riesgo",
          name:             "Análisis de riesgo de cartera",
          description:      "Segmentación de clientes por riesgo de mora, rotación y exposición crediticia.",
          operationalImpact:"Prioriza esfuerzo comercial en los 20% de clientes con 80% del riesgo.",
          autonomy:         "supervisada",
          status:           "active",
          dependencies:     ["Diego — Análisis de cartera", "SAG Cartera"],
          workflows:        ["customer-360", "pipeline"],
        },
        {
          id:               "whatsapp-followup",
          name:             "Seguimiento automático por WhatsApp",
          description:      "Mensajes de seguimiento post-visita y recordatorio de pago vía WhatsApp Business.",
          operationalImpact:"Sin automatización, el seguimiento depende de disciplina del vendedor.",
          autonomy:         "observacion",
          status:           "degraded",
          dependencies:     ["WhatsApp Business API (sin configurar)"],
          workflows:        ["pipeline", "collections"],
          degradationReason:"API de WhatsApp Business no conectada. Seguimiento es 100% manual.",
        },
        {
          id:               "customer-scoring",
          name:             "Scoring de clientes",
          description:      "Puntuación de probabilidad de compra y riesgo de churn por cliente.",
          operationalImpact:"Sin scoring, la priorización de visitas comerciales es subjetiva.",
          autonomy:         "observacion",
          status:           "degraded",
          dependencies:     ["Historial 12 meses (parcial)", "Modelo ML (no entrenado)"],
          workflows:        ["customer-360"],
          degradationReason:"Historial insuficiente para entrenar modelo. Disponible en Q3 con 12m de datos.",
        },
      ],
      available: [
        {
          name:         "Scoring IA de clientes",
          unlocks:      "Probabilidad de compra, riesgo de churn y LTV por cliente con modelo ML",
          impact:       ["Visitas priorizadas", "Retención proactiva", "Propuestas personalizadas"],
          requirements: ["12 meses de historial de compras", "Diego activo"],
          readiness:    "parcialmente-disponible",
        },
        {
          name:         "Automatización WhatsApp",
          unlocks:      "Seguimiento automático post-visita, recordatorios de cobro y notificaciones",
          impact:       ["Reducción mora 30%", "Tiempo vendedor liberado", "Cobertura 100% clientes"],
          requirements: ["WhatsApp Business API", "Aprobación de templates"],
          readiness:    "requiere-configuracion",
        },
      ],
    },
    integrationSystem: {
      integrations: [
        {
          id:                  "sag-erp-mila",
          name:                "SAG ERP",
          abbrev:              "SAG",
          status:              "active",
          lastSync:            "hace 6m",
          latency:             "420ms",
          auth:                "api-key",
          env:                 "produccion",
          owner:               "system",
          operationalScope:    ["clientes", "pedidos", "cartera", "ventas", "historial"],
          unlocksCapabilities: ["Vista 360° del cliente", "Análisis de riesgo de cartera", "Seguimiento de pipeline comercial"],
          statusContext:       "Datos de clientes y pedidos sincronizados. Historial comercial activo.",
        },
        {
          id:                  "customer360-db",
          name:                "Customer 360 DB",
          abbrev:              "C360",
          status:              "active",
          lastSync:            "hace 2m",
          latency:             "75ms",
          auth:                "service-account",
          env:                 "produccion",
          owner:               "system",
          operationalScope:    ["identidad cliente", "historial", "scoring", "segmentación"],
          unlocksCapabilities: ["Vista 360° del cliente", "Seguimiento de pipeline comercial"],
          statusContext:       "Identidad de cliente consolidada. Perfiles enriquecidos operativos.",
        },
        {
          id:                   "whatsapp-cloud",
          name:                 "WhatsApp Cloud API",
          abbrev:               "WA",
          status:               "offline",
          lastSync:             "N/A",
          latency:              "N/A",
          auth:                 "webhook",
          env:                  "produccion",
          owner:                "tenant",
          operationalScope:     ["seguimiento comercial", "notificaciones", "cobros", "CRM"],
          unlocksCapabilities:  ["Seguimiento automático por WhatsApp"],
          statusContext:        "API de WhatsApp Business no configurada. Sin mensajería activa.",
          degradationImpact:    "Seguimiento post-visita 100% manual. Tasa de contacto efectivo cae ~40%.",
          suggestedActions:     ["Configurar WhatsApp Business API en Meta", "Crear y enviar templates para aprobación", "Conectar número de negocio verificado"],
        },
        {
          id:                   "sistecredito-mila",
          name:                 "Sistecrédito",
          abbrev:               "STC",
          status:               "offline",
          lastSync:             "N/A",
          latency:              "N/A",
          auth:                 "api-key",
          env:                  "produccion",
          owner:                "tenant",
          operationalScope:     ["scoring crediticio", "límites de crédito", "riesgo cliente"],
          unlocksCapabilities:  ["Scoring de clientes"],
          statusContext:        "Integración pendiente de configuración con Sistecrédito.",
          degradationImpact:    "Sin scoring automático. Decisiones de crédito basadas en criterio del vendedor.",
          suggestedActions:     ["Solicitar credenciales Sistecrédito", "Configurar endpoint de consulta", "Validar cobertura de cartera actual"],
        },
      ],
      available: [
        {
          name:         "HubSpot CRM",
          unlocks:      "Pipeline comercial sincronizado con seguimiento automático y scoring de oportunidades",
          impact:       ["Pipeline unificado", "Seguimiento sin fricción", "Forecast comercial IA"],
          requirements: ["HubSpot Professional", "OAuth configurado", "Luca activa y conectada"],
          readiness:    "disponible",
        },
        {
          name:         "WhatsApp Business API",
          unlocks:      "Seguimiento automático, recordatorios de cobro y contexto comercial unificado",
          impact:       ["Contacto +40%", "Mora reducida 30%", "CRM conversacional"],
          requirements: ["Meta Business Manager", "Templates aprobados por Meta", "Número verificado"],
          readiness:    "requiere-configuracion",
        },
        {
          name:         "Salesforce",
          unlocks:      "Sincronización enterprise de oportunidades, accounts y forecasting para equipos grandes",
          impact:       ["CRM enterprise", "Reportes ejecutivos", "Multi-región"],
          requirements: ["Salesforce Enterprise licencia", "API credentials", "Plan de migración CRM"],
          readiness:    "enterprise",
        },
      ],
    },
    operationalBehavior: {
      autonomy:         "semi-autonomo",
      primaryObjective: "Maximizar la conversión y retención comercial mediante seguimiento inteligente, contexto completo del cliente y oportunidades priorizadas con datos reales.",
      operationalPriorities: [
        "Seguimiento activo de oportunidades con alta probabilidad de cierre",
        "Recuperación temprana de cartera en mora antes de vencimiento crítico",
        "Vista 360° del cliente actualizada con historial completo",
        "Notificaciones oportunas y accionables al equipo de ventas",
        "Calidad y consistencia del dato de cliente",
      ],
      escalationTriggers: [
        "Cliente en mora crítica sin seguimiento documentado en 72h",
        "Oportunidad de alto valor sin avance en 5 días hábiles",
        "Solicitud de condiciones comerciales fuera del rango aprobado",
        "Conflicto de identidad de cliente que no puede resolverse automáticamente",
        "Alerta de churn inminente en cliente estratégico o de alto valor",
      ],
      forbiddenActions: [
        "Prometer condiciones comerciales no aprobadas por el responsable de ventas",
        "Modificar datos de identidad de cliente sin validación explícita",
        "Cerrar oportunidades sin confirmación del vendedor asignado",
        "Enviar comunicaciones masivas sin aprobación del contenido",
        "Alterar límites de crédito de clientes sin autorización",
      ],
      communication: {
        tone:    "Humano, orientado al cliente y persistente. Traduce datos en acciones concretas para el equipo comercial.",
        behavior: [
          "Comunica en lenguaje comercial, nunca técnico",
          "Siempre incluye contexto del cliente antes de recomendar una acción",
          "Prioriza acciones de alto impacto y baja fricción para el vendedor",
          "Notifica solo cuando hay una acción concreta y viable que tomar",
        ],
        escalationStyle: "Escala mediante alerta comercial con ficha del cliente, historial relevante y acción recomendada al vendedor o responsable.",
      },
      decisionRules: [
        {
          title:       "Contexto antes de acción",
          description: "Nunca recomienda acción comercial sin revisar historial de compras, estado de cartera y últimas interacciones registradas del cliente.",
          severity:    "high",
        },
        {
          title:       "Condiciones dentro del rango aprobado",
          description: "Mila opera exclusivamente dentro del rango de condiciones comerciales aprobadas. Cualquier excepción escala al responsable sin demora.",
          severity:    "critical",
        },
        {
          title:       "Seguimiento persistente",
          description: "Una oportunidad caliente sin seguimiento en 48h genera alerta automática al vendedor asignado. No espera instrucción manual.",
          severity:    "high",
        },
        {
          title:       "Congelamiento por conflicto de identidad",
          description: "Si detecta duplicados o conflictos en la identidad de un cliente, congela el perfil y escala para resolución manual antes de continuar.",
          severity:    "high",
        },
        {
          title:       "Calidad sobre velocidad",
          description: "Prioriza la calidad del dato sobre la velocidad de actualización. Nunca sobreescribe datos existentes sin evidencia verificada.",
          severity:    "normal",
        },
      ],
    },
    workflowSystem: {
      active: [
        {
          id:          "seguimiento-oportunidades",
          name:        "Seguimiento de oportunidades calientes",
          description: "Monitorea oportunidades activas sin avance y emite alertas a vendedores antes de que el tiempo crítico expire.",
          status:      "active",
          trigger:     "threshold",
          cadence:     "Cada 6h · umbral 48h sin avance",
          autonomy:    "autonomo",
          owner:       "agentik",
          touchedSystems:  ["Pipeline DB", "SAG", "Prisma"],
          produces:        ["Alertas de oportunidad estancada", "Ranking de oportunidades calientes", "Resumen de pipeline"],
          steps: [
            { title: "Escaneo de pipeline", description: "Lee todas las oportunidades activas y calcula tiempo sin actividad", system: "Pipeline DB" },
            { title: "Contextualización del cliente", description: "Enriquece con historial de compras y estado de cartera del cliente", system: "SAG" },
            { title: "Emisión de alertas", description: "Notifica al vendedor asignado con ficha del cliente y acción sugerida", system: "Agentik" },
          ],
          lastRun:          "hace 3h",
          nextRun:          "en 3h",
          operationalImpact:"Cero oportunidades calientes sin seguimiento activo. Reduce pérdidas por inacción ~40%.",
        },
        {
          id:          "alertas-mora",
          name:        "Alertas de clientes en mora",
          description: "Detecta clientes que entran en zona de mora y emite alertas tempranas para acción comercial preventiva.",
          status:      "active",
          trigger:     "scheduled",
          cadence:     "Diario · 07:30",
          autonomy:    "autonomo",
          owner:       "agentik",
          touchedSystems:  ["SAG Cartera", "Customer360 DB"],
          produces:        ["Lista de mora temprana", "Alertas de clientes críticos", "Acciones sugeridas por cliente"],
          steps: [
            { title: "Lectura de cartera", description: "Identifica clientes con facturas próximas a vencer o recién vencidas", system: "SAG" },
            { title: "Priorización", description: "Ordena por volumen de exposición y probabilidad de recuperación", system: "Customer360" },
            { title: "Alertas al equipo", description: "Genera alertas diarias con ficha de cliente y acción recomendada", system: "Agentik" },
          ],
          lastRun:          "hace 1h",
          nextRun:          "mañana 07:30",
          operationalImpact:"Mora temprana detectada 5-10 días antes. Tasa de recuperación preventiva +30%.",
        },
        {
          id:          "enriquecimiento-c360",
          name:        "Enriquecimiento Customer 360",
          description: "Actualiza y enriquece los perfiles de clientes con datos de compras, cobros e interacciones recientes.",
          status:      "active",
          trigger:     "event",
          cadence:     "Al recibir sync SAG Clientes",
          autonomy:    "autonomo",
          owner:       "agentik",
          touchedSystems:  ["SAG Clientes", "Customer360 DB", "CollectionRecord"],
          produces:        ["Perfiles de cliente actualizados", "Score de actividad", "Alertas de cambio de comportamiento"],
          steps: [
            { title: "Ingesta de datos SAG", description: "Lee cambios de clientes, pedidos y cobros desde última sync", system: "SAG" },
            { title: "Actualización de perfil", description: "Actualiza Customer360 con nuevos datos y recalcula score de actividad", system: "Customer360" },
            { title: "Detección de cambios", description: "Identifica cambios significativos de comportamiento y notifica si es relevante", system: "Agentik" },
          ],
          lastRun:          "hace 30m",
          nextRun:          "al próximo sync SAG",
          operationalImpact:"Perfiles de cliente siempre frescos. Vendedor con contexto completo antes de cada contacto.",
        },
      ],
      supervised: [
        {
          id:          "campanas-recuperacion",
          name:        "Campañas de recuperación por WhatsApp",
          description: "Secuencias de mensajes personalizados para recuperación de cartera y reactivación de clientes inactivos.",
          status:      "supervised",
          trigger:     "manual",
          cadence:     "Bajo demanda · según segmento",
          autonomy:    "supervisado",
          owner:       "tenant",
          touchedSystems:      ["WhatsApp Cloud API (pendiente)", "Customer360 DB"],
          produces:            ["Mensajes enviados", "Tasa de respuesta", "Clientes recuperados"],
          supervisionRequired: "El contenido de cada campaña debe ser aprobado antes de enviar. Requiere WhatsApp Business API activa.",
          steps: [
            { title: "Segmentación", description: "Selecciona clientes objetivo según criterios de mora o inactividad", system: "Customer360" },
            { title: "Personalización", description: "Adapta mensajes al historial y contexto de cada cliente", system: "Agentik" },
            { title: "Envío supervisado", description: "Envía mensajes tras aprobación de contenido por responsable", system: "WhatsApp" },
          ],
          lastRun:          "N/A — WhatsApp no conectado",
          operationalImpact:"Recuperación de mora +30% estimada con seguimiento personalizado automatizado.",
        },
        {
          id:          "recomendaciones-credito",
          name:        "Recomendaciones de crédito comercial",
          description: "Genera recomendaciones de cupo y condiciones para clientes con base en historial de pagos y score.",
          status:      "supervised",
          trigger:     "manual",
          cadence:     "Bajo demanda · por solicitud comercial",
          autonomy:    "supervisado",
          owner:       "agentik",
          touchedSystems:      ["Customer360 DB", "SAG Cartera", "Sistecrédito (pendiente)"],
          produces:            ["Recomendación de cupo", "Condiciones sugeridas", "Justificación de riesgo"],
          supervisionRequired: "El responsable comercial debe aprobar cada recomendación antes de comunicarla al cliente.",
          steps: [
            { title: "Análisis de historial", description: "Revisa 12 meses de pagos, mora y volumen de compras del cliente", system: "SAG" },
            { title: "Generación de recomendación", description: "Produce recomendación de cupo con justificación basada en datos", system: "Agentik" },
          ],
          lastRun:          "hace 3 días",
          operationalImpact:"Decisiones de crédito en 10 minutos vs 2-3 días. Riesgo documentado y trazable.",
        },
      ],
      available: [
        {
          id:          "scoring-ia-clientes",
          name:        "Scoring IA de clientes",
          description: "Modelo de probabilidad de compra, riesgo de churn y LTV para cada cliente activo.",
          status:      "draft",
          trigger:     "scheduled",
          cadence:     "Semanal · actualización de scores",
          autonomy:    "semi-autonomo",
          owner:       "agentik",
          touchedSystems:      ["Customer360 DB", "SAG Ventas", "Modelo ML (pendiente)"],
          produces:            ["Score de probabilidad de compra", "Riesgo de churn", "LTV proyectado"],
          supervisionRequired: "Requiere 12 meses de historial de compras y modelo ML entrenado (disponible Q3).",
          steps: [
            { title: "Extracción de features", description: "Prepara variables de comportamiento por cliente para el modelo", system: "Customer360" },
            { title: "Inferencia del modelo", description: "Calcula scores usando modelo ML de clasificación de clientes", system: "Modelo ML" },
          ],
          lastRun:          "N/A",
          operationalImpact:"Visitas priorizadas automáticamente. LTV proyectado por cliente disponible para directivos.",
        },
        {
          id:          "recontacto-automatico",
          name:        "Recontacto automático post-visita",
          description: "Secuencia de seguimiento automatizada 24h después de cada visita comercial registrada.",
          status:      "draft",
          trigger:     "event",
          cadence:     "24h después de registrar visita",
          autonomy:    "semi-autonomo",
          owner:       "agentik",
          touchedSystems:      ["WhatsApp Cloud API (pendiente)", "Pipeline DB"],
          produces:            ["Mensaje de seguimiento", "Actualización de oportunidad", "Próxima acción sugerida"],
          supervisionRequired: "Requiere WhatsApp Business API y templates aprobados por Meta.",
          steps: [
            { title: "Detección de visita", description: "Detecta nueva visita registrada en pipeline y espera 24h", system: "Pipeline DB" },
            { title: "Envío de seguimiento", description: "Envía mensaje personalizado de seguimiento por WhatsApp", system: "WhatsApp" },
          ],
          lastRun:          "N/A",
          operationalImpact:"Seguimiento garantizado post-visita. Tasa de conversión post-visita estimada +25%.",
        },
      ],
    },
    executionSystem: {
      activeExecutions: [
        {
          id:          "exec-mora-detect",
          title:       "Detección de clientes con mora activa",
          description: "Analizando cartera comercial. 2 clientes con mora alta sin seguimiento identificados.",
          timestamp:   "hace 5m",
          severity:    "warning",
          state:       "running",
          workflow:    "Seguimiento de cobranza comercial",
          systems:     ["SAG Cartera", "Customer360"],
          requiresAttention: true,
        },
        {
          id:          "exec-pipeline-update",
          title:       "Actualización de oportunidades en pipeline",
          description: "Esperando datos de visitas completadas para actualizar etapas de oportunidades abiertas.",
          timestamp:   "hace 18m",
          severity:    "normal",
          state:       "waiting",
          systems:     ["Pipeline DB"],
          requiresAttention: false,
        },
      ],
      recentExecutions: [
        {
          id:          "rec-segmento-prioritario",
          title:       "Segmento prioritario identificado",
          description: "12 clientes con alta probabilidad de cierre esta semana. Score promedio: 84/100.",
          timestamp:   "08:45",
          severity:    "normal",
          state:       "completed",
          produced:    ["Lista de 12 clientes prioritarios", "Score de oportunidad por cliente"],
        },
        {
          id:          "rec-recuperacion",
          title:       "Recuperación comercial ejecutada",
          description: "3 cuentas inactivas contactadas por canal preferido. Respuesta esperada en 48h.",
          timestamp:   "09:00",
          severity:    "normal",
          state:       "completed",
          workflow:    "Recuperación de clientes inactivos",
        },
        {
          id:          "rec-pipeline-auto",
          title:       "Pipeline actualizado automáticamente",
          description: "14 oportunidades movidas de etapa basado en actividad comercial reciente registrada.",
          timestamp:   "09:05",
          severity:    "normal",
          state:       "completed",
          systems:     ["Pipeline DB"],
        },
        {
          id:          "rec-riesgo-norte",
          title:       "Riesgo comercial elevado — región norte",
          description: "Caída de pedidos —22% en región norte vs semana anterior. Patrón inusual detectado.",
          timestamp:   "09:20",
          severity:    "warning",
          state:       "completed",
          requiresAttention: true,
        },
      ],
      incidents: [
        {
          id:          "inc-mora-sin-gestion",
          title:       "Clientes con mora sin seguimiento asignado",
          description: "2 clientes con mora +60 días sin ejecutivo comercial asignado. Riesgo de pérdida elevado.",
          timestamp:   "hace 5m",
          severity:    "warning",
          state:       "blocked",
          requiresAttention: true,
        },
        {
          id:          "inc-region-norte",
          title:       "Patrón de riesgo comercial — región norte",
          description: "Caída sostenida de pedidos en región norte. Requiere intervención de equipo comercial.",
          timestamp:   "hace 40m",
          severity:    "warning",
          state:       "degraded",
          requiresAttention: false,
        },
      ],
      coordination: [
        {
          fromAgent:   "Diego",
          toAgent:     "Mila",
          description: "3 clientes con mora +90 días enviados a seguimiento comercial prioritario por Diego.",
          timestamp:   "hace 2m",
        },
        {
          fromAgent:   "Mila",
          toAgent:     "Diego",
          description: "Riesgo comercial región norte reportado para análisis de impacto en flujo de caja proyectado.",
          timestamp:   "hace 35m",
        },
      ],
    },
  },

  // ── SOFI ──────────────────────────────────────────────────────────────────
  {
    id:               "sofi",
    name:             "Sofi",
    specialty:        "Inteligencia web y ecommerce",
    description:      "Shopify, conversiones, UX, funnels y automatizaciones",
    avatar:           "S",
    photo:            "/agents/sofi.png",
    accentColor:      "#16a34a",
    modules:          ["integrations"],
    capabilities: [
      "Integración Shopify",
      "Optimización de conversiones",
      "UX e-commerce",
      "Automatizaciones de funnels",
      "Formularios inteligentes",
      "Análisis de tráfico y retención",
    ],
    operationalScope: ["Web", "E-commerce", "Conversiones"],
    integrations:     ["Shopify", "Analytics"],
    runtimeState:     "active",
    memoryCount:      12,
    workflowCount:    0,
    currentFocus:     "Optimizando conversiones y experiencia de compra en canales digitales",
    memoryHints: {
      "integrations": [
        "Las integraciones activas sincronizan automáticamente con SAG",
        "Shopify conecta pedidos directamente al pipeline de ventas",
      ],
      "default": [
        "Sofi se activa cuando navegas a Integraciones",
      ],
    },

    memory: {
      strategicContext: [
        {
          title:      "Integración Shopify activa",
          body:       "Conector Shopify habilitado para Castillitos. Sincronización de pedidos y catálogo operativa.",
          scope:      "E-commerce",
          updatedAt:  "2026-05-05",
          priority:   "critical",
          lifecycle:  "active",
          lastImpact: "Activo en última sincronización de pedidos",
        },
        {
          title:      "Funnels no mapeados contra SAG",
          body:       "Los funnels de conversión de Shopify no están alineados con el pipeline SAG. La conversión digital es estimada.",
          scope:      "Conversiones",
          updatedAt:  "2026-05-08",
          priority:   "strategic",
          lifecycle:  "evolving",
        },
      ],
      learnedPatterns: [
        {
          title:           "Abandono concentrado en paso de pago",
          description:     "El checkout es el mayor punto de abandono. Fricción identificada en métodos de pago disponibles.",
          confidenceLevel: "estable",
          source:          "Shopify · Analytics",
          updatedAt:       "2026-04-30",
          priority:        "strategic",
          lifecycle:       "active",
          lastImpact:      "Referenciado en análisis de UX del funnel",
        },
        {
          title:           "Orgánico convierte mejor que pago",
          description:     "Visitantes orgánicos convierten 1.4x más que tráfico pagado. Relación estimada con datos parciales.",
          confidenceLevel: "parcial",
          source:          "Shopify · Analytics",
          updatedAt:       "2026-05-02",
          priority:        "operational",
          lifecycle:       "evolving",
        },
      ],
      operationalRules: [
        {
          rule:       "Sincronizar catálogo antes de lanzar campaña",
          reason:     "Lanzar campañas sin catálogo actualizado genera stock incorrecto y experiencia degradada.",
          priority:   "high",
          lifecycle:  "active",
          lastImpact: "Aplicado antes del último lanzamiento",
        },
        {
          rule:       "Revisar métricas de conversión semanalmente",
          reason:     "Revisión semanal permite detectar anomalías antes de que impacten el negocio.",
          priority:   "medium",
          lifecycle:  "active",
        },
      ],
      gaps: [
        {
          title:      "Analytics unificado no disponible",
          impact:     "Sin vista única de comportamiento digital y ventas SAG. Análisis es fragmentado.",
          status:     "pendiente",
          capability: "Capa de analytics unificada — Shopify + SAG en una vista",
          priority:   "critical",
          lifecycle:  "active",
        },
        {
          title:      "Tests A/B no configurados",
          impact:     "Optimizaciones de conversión son especulativas sin evidencia estadística.",
          status:     "pendiente",
          capability: "Framework A/B testing — optimización basada en evidencia",
          priority:   "strategic",
          lifecycle:  "active",
        },
        {
          title:      "Retargeting no integrado",
          impact:     "Carritos abandonados no son reactivados automáticamente. Recuperación de ventas es manual.",
          status:     "pendiente",
          capability: "Retargeting automático — recuperación de abandonos de carrito",
          priority:   "operational",
          lifecycle:  "active",
        },
      ],
    },
    capabilitySystem: {
      capabilities: [
        {
          id:               "shopify-sync",
          name:             "Sincronización Shopify",
          description:      "Sincronización bidireccional de productos, precios, inventario y órdenes con Shopify.",
          operationalImpact:"Catálogo web siempre actualizado sin intervención manual.",
          autonomy:         "autonoma",
          status:           "active",
          dependencies:     ["Shopify API", "ProductCatalog DB"],
          workflows:        ["shopify", "integrations"],
        },
        {
          id:               "integration-health",
          name:             "Salud de integraciones",
          description:      "Monitoreo continuo del estado de todos los conectores activos.",
          operationalImpact:"Detecta fallos de integración antes de que afecten operaciones.",
          autonomy:         "autonoma",
          status:           "active",
          dependencies:     ["ConnectorRegistry", "SyncEngine"],
          workflows:        ["integrations", "connectors"],
        },
        {
          id:               "conversion-analysis",
          name:             "Análisis de conversión web",
          description:      "Métricas de funnel, tasa de conversión y comportamiento de compra en tienda web.",
          operationalImpact:"Sin análisis de conversión, la optimización del funnel es a ciegas.",
          autonomy:         "observacion",
          status:           "degraded",
          dependencies:     ["Google Analytics (sin conectar)", "Shopify Analytics"],
          workflows:        ["shopify"],
          degradationReason:"Analytics web no conectado. Solo datos de órdenes completadas disponibles.",
        },
        {
          id:               "funnel-optimization",
          name:             "Optimización de funnel",
          description:      "Identificación y corrección automática de cuellos de botella en el funnel de compra.",
          operationalImpact:"Sin datos de comportamiento, la optimización es manual y tardía.",
          autonomy:         "observacion",
          status:           "degraded",
          dependencies:     ["Heatmaps (sin configurar)", "Session recordings"],
          workflows:        ["shopify"],
          degradationReason:"Herramientas de comportamiento web no configuradas.",
        },
      ],
      available: [
        {
          name:         "Analytics unificado",
          unlocks:      "Vista única de métricas web + ventas SAG + campañas para decisiones integradas",
          impact:       ["Visibilidad end-to-end", "ROAS real vs percibido", "Optimización basada en datos"],
          requirements: ["Google Analytics 4", "Meta Pixel", "Luca activo"],
          readiness:    "parcialmente-disponible",
        },
        {
          name:         "Conversión IA",
          unlocks:      "Personalización de la tienda web en tiempo real según perfil del visitante",
          impact:       ["Uplift conversión estimado +22%", "Abandono reducido", "AOV mejorado"],
          requirements: ["6 meses datos Shopify", "GA4 conectado", "Aprobación SUPER_ADMIN"],
          readiness:    "requiere-configuracion",
        },
        {
          name:         "Retargeting automático",
          unlocks:      "Campañas de recuperación de carrito abandonado con creatividades de Luca",
          impact:       ["Recuperación 15-25% carritos", "Sin gestión manual", "Sincronizado con inventario"],
          requirements: ["Meta Ads API", "Luca activo", "WhatsApp Business API"],
          readiness:    "requiere-configuracion",
        },
      ],
    },
    integrationSystem: {
      integrations: [
        {
          id:                  "shopify",
          name:                "Shopify API",
          abbrev:              "SHP",
          status:              "active",
          lastSync:            "hace 8m",
          latency:             "480ms",
          auth:                "oauth2",
          env:                 "produccion",
          owner:               "tenant",
          operationalScope:    ["productos", "inventario", "órdenes", "precios", "catálogo"],
          unlocksCapabilities: ["Sincronización Shopify", "Salud de integraciones"],
          statusContext:       "Catálogo y órdenes sincronizados. Webhooks de inventario activos.",
        },
        {
          id:                  "sync-engine",
          name:                "Sync Engine",
          abbrev:              "SYN",
          status:              "active",
          lastSync:            "hace 1m",
          latency:             "55ms",
          auth:                "service-account",
          env:                 "produccion",
          owner:               "system",
          operationalScope:    ["sincronización", "health monitoring", "conectores", "cola"],
          unlocksCapabilities: ["Salud de integraciones"],
          statusContext:       "Motor de sincronización operativo. Cola de jobs procesando normalmente.",
        },
        {
          id:                   "google-analytics-sofi",
          name:                 "Google Analytics 4",
          abbrev:               "GA4",
          status:               "offline",
          lastSync:             "N/A",
          latency:              "N/A",
          auth:                 "oauth2",
          env:                  "produccion",
          owner:                "tenant",
          operationalScope:     ["analytics web", "tráfico", "comportamiento", "conversión"],
          unlocksCapabilities:  ["Análisis de conversión web", "Optimización de funnel"],
          statusContext:        "Analytics web no configurado en tienda Shopify.",
          degradationImpact:    "Funnel de conversión invisible. Decisiones de UX sin datos de comportamiento real.",
          suggestedActions:     ["Instalar GA4 tag en Shopify theme", "Configurar eventos ecommerce estándar", "Conectar propiedad GA4 a Agentik"],
        },
        {
          id:                   "meta-pixel",
          name:                 "Meta Pixel",
          abbrev:               "PIX",
          status:               "offline",
          lastSync:             "N/A",
          latency:              "N/A",
          auth:                 "webhook",
          env:                  "produccion",
          owner:                "tenant",
          operationalScope:     ["retargeting", "audiencias", "campañas", "conversiones"],
          unlocksCapabilities:  ["Optimización de funnel"],
          statusContext:        "Pixel de Meta no instalado. Sin construcción de audiencias.",
          degradationImpact:    "Retargeting imposible. Audiencias para campañas no se están construyendo.",
          suggestedActions:     ["Instalar Meta Pixel en Shopify theme", "Configurar Conversions API", "Vincular catálogo de productos a Meta"],
        },
      ],
      available: [
        {
          name:         "Stripe",
          unlocks:      "Pagos integrados con conciliación automática y seguimiento de transacciones en tiempo real",
          impact:       ["Conciliación automática", "Fraude detectado en tiempo real", "Reportes financieros unificados"],
          requirements: ["Cuenta Stripe activa", "Webhook configurado", "Diego activo y conectado"],
          readiness:    "disponible",
        },
        {
          name:         "Google Ads",
          unlocks:      "Campañas de Shopping sincronizadas con catálogo Shopify y conversiones reales",
          impact:       ["ROAS medible", "Catálogo siempre actualizado", "Conversiones reales vs estimadas"],
          requirements: ["Google Ads cuenta activa", "Google Merchant Center", "Feed de productos configurado"],
          readiness:    "requiere-configuracion",
        },
        {
          name:         "Data Warehouse",
          unlocks:      "Histórico unificado de ventas, web y campañas para análisis estratégico profundo",
          impact:       ["Análisis histórico ilimitado", "BI sin restricciones", "Modelos predictivos"],
          requirements: ["BigQuery o Redshift activo", "Pipelines de datos definidos", "Aprobación SUPER_ADMIN"],
          readiness:    "enterprise",
        },
      ],
    },
    operationalBehavior: {
      autonomy:         "semi-autonomo",
      primaryObjective: "Garantizar la estabilidad y disponibilidad del canal ecommerce sin errores de catálogo, sincronización o experiencia de compra.",
      operationalPriorities: [
        "Integridad del catálogo de productos en Shopify",
        "Salud y disponibilidad de todas las integraciones activas",
        "Prevención y resolución de errores de sincronización",
        "Monitoreo de conversión y detección de anomalías de UX",
        "Disponibilidad continua del canal de venta",
      ],
      escalationTriggers: [
        "Fallo de sincronización de inventario sin recuperación automática en 30 minutos",
        "Producto publicado con precio inconsistente detectado",
        "Error en pasarela de pago con órdenes afectadas",
        "Caída de tasa de conversión superior al 20% en una ventana de 2 horas",
        "Integración crítica desconectada tras dos intentos de recuperación fallidos",
      ],
      forbiddenActions: [
        "Modificar precios de productos sin aprobación explícita del tenant",
        "Despublicar productos activos con inventario sin validación",
        "Alterar configuración de pasarela de pago o reglas de checkout",
        "Ejecutar migraciones de datos en producción sin respaldo verificado",
        "Cambiar reglas de envío o políticas de devolución sin aprobación",
      ],
      communication: {
        tone:    "Técnico pero accesible. Traduce incidentes en impacto de negocio cuantificado.",
        behavior: [
          "Notifica incidentes con impacto cuantificado: órdenes afectadas, tiempo y pérdida estimada",
          "Prioriza resolución activa antes que el reporte detallado del incidente",
          "Comunica el estado de recuperación en tiempo real mientras actúa",
          "Escala solo cuando la recuperación automática ha fallado dos veces",
        ],
        escalationStyle: "Escala mediante incidente estructurado con timestamp, impacto cuantificado, pasos ya ejecutados y siguiente acción recomendada.",
      },
      decisionRules: [
        {
          title:       "SAG como fuente de inventario real",
          description: "En conflicto entre Shopify y SAG, SAG es la fuente de verdad. Shopify se actualiza desde SAG, nunca al revés.",
          severity:    "critical",
        },
        {
          title:       "Cero tolerancia en inconsistencia de precios",
          description: "Cualquier discrepancia de precio detectada pausa la publicación automáticamente y genera alerta. No publica con precio en duda.",
          severity:    "critical",
        },
        {
          title:       "Recuperación automática con límite",
          description: "Ante fallo de sincronización, intenta recuperación automática hasta dos veces. Si ambas fallan, escala a administrador sin más intentos.",
          severity:    "high",
        },
        {
          title:       "Monitoreo continuo",
          description: "Opera en modo de monitoreo activo permanente. Detecta anomalías de catálogo, precio y conversión antes de que impacten al cliente final.",
          severity:    "normal",
        },
        {
          title:       "Trazabilidad de todos los cambios",
          description: "Todos los cambios de catálogo, precio o configuración de tienda quedan registrados con timestamp, origen y responsable.",
          severity:    "high",
        },
      ],
    },
    workflowSystem: {
      active: [
        {
          id:          "sync-catalogo-shopify",
          name:        "Sincronización de catálogo Shopify",
          description: "Mantiene el catálogo Shopify actualizado en tiempo real con precios, inventario y estado de productos desde SAG.",
          status:      "active",
          trigger:     "event",
          cadence:     "Al recibir cambio en SAG Productos",
          autonomy:    "autonomo",
          owner:       "agentik",
          touchedSystems:  ["SAG", "Shopify API", "Sync Engine"],
          produces:        ["Catálogo actualizado", "Log de cambios", "Alertas de inconsistencia"],
          steps: [
            { title: "Detección de cambio", description: "Detecta cambio en SAG: precio, inventario, estado de producto", system: "SAG" },
            { title: "Validación", description: "Verifica consistencia del cambio antes de propagar a Shopify", system: "Agentik" },
            { title: "Propagación a Shopify", description: "Actualiza producto en Shopify con los datos validados de SAG", system: "Shopify" },
            { title: "Confirmación", description: "Verifica que el cambio se aplicó correctamente y registra en log", system: "Sync Engine" },
          ],
          lastRun:          "hace 8m",
          nextRun:          "al próximo cambio en SAG",
          operationalImpact:"Catálogo web siempre actualizado. Cero inconsistencias entre SAG y Shopify.",
        },
        {
          id:          "monitoreo-conectores",
          name:        "Monitoreo de salud de conectores",
          description: "Verifica el estado operativo de todas las integraciones activas y detecta fallos antes de que impacten al cliente.",
          status:      "active",
          trigger:     "scheduled",
          cadence:     "Cada 15 minutos",
          autonomy:    "autonomo",
          owner:       "system",
          touchedSystems:  ["Sync Engine", "ConnectorRegistry"],
          produces:        ["Estado de salud de integraciones", "Alertas de fallo", "Tiempo de recuperación estimado"],
          steps: [
            { title: "Health check", description: "Verifica conectividad y latencia de cada conector activo", system: "Sync Engine" },
            { title: "Detección de anomalías", description: "Identifica conectores con latencia alta, errores o desconexión", system: "ConnectorRegistry" },
            { title: "Alerta y recuperación", description: "Intenta recuperación automática y alerta si falla dos veces", system: "Agentik" },
          ],
          lastRun:          "hace 8m",
          nextRun:          "en 7m",
          operationalImpact:"Fallos detectados en menos de 15 minutos. Tiempo de impacto al cliente minimizado.",
        },
        {
          id:          "revision-inventario",
          name:        "Revisión de errores de inventario",
          description: "Detecta inconsistencias de stock entre SAG y Shopify y genera reporte de correcciones pendientes.",
          status:      "active",
          trigger:     "scheduled",
          cadence:     "Diario · 06:00",
          autonomy:    "semi-autonomo",
          owner:       "agentik",
          touchedSystems:  ["SAG", "Shopify API"],
          produces:        ["Reporte de inconsistencias", "Lista de correcciones pendientes", "Alertas de stock crítico"],
          steps: [
            { title: "Comparación de inventarios", description: "Lee stock de SAG y Shopify para cada SKU activo", system: "SAG" },
            { title: "Identificación de desvíos", description: "Marca productos con diferencias de stock superiores al umbral", system: "Shopify" },
            { title: "Reporte de correcciones", description: "Genera lista priorizada de correcciones para revisión", system: "Agentik" },
          ],
          lastRun:          "hace 18h",
          nextRun:          "en 6h",
          operationalImpact:"Inventario consistente. Elimina pedidos con stock fantasma o ruptura de stock silenciosa.",
        },
      ],
      supervised: [
        {
          id:          "correccion-catalogo",
          name:        "Corrección de inconsistencias de catálogo",
          description: "Aplica correcciones masivas de precio, categoría o estado de productos en Shopify tras validación.",
          status:      "supervised",
          trigger:     "manual",
          cadence:     "Bajo demanda · tras detección de inconsistencias",
          autonomy:    "supervisado",
          owner:       "tenant",
          touchedSystems:      ["Shopify API", "SAG"],
          produces:            ["Correcciones aplicadas", "Log de cambios", "Reporte de catálogo saneado"],
          supervisionRequired: "Cada corrección de precio o estado requiere revisión y aprobación del administrador de tienda.",
          steps: [
            { title: "Preparación de correcciones", description: "Consolida cambios detectados en reporte de inconsistencias", system: "Agentik" },
            { title: "Aprobación", description: "Presenta lista de correcciones al administrador para revisión", system: "Agentik" },
            { title: "Aplicación", description: "Aplica cambios aprobados en Shopify con confirmación por lote", system: "Shopify" },
          ],
          lastRun:          "hace 3 días",
          operationalImpact:"Catálogo saneado sin errores de precio. Experiencia de compra protegida.",
        },
        {
          id:          "monitoreo-conversion",
          name:        "Monitoreo de conversión ecommerce",
          description: "Analiza tasa de conversión, abandono de carrito y comportamiento de compra para detectar anomalías de UX.",
          status:      "supervised",
          trigger:     "threshold",
          cadence:     "Al detectar caída > 20% en conversión",
          autonomy:    "supervisado",
          owner:       "agentik",
          touchedSystems:      ["GA4 (pendiente)", "Shopify Analytics"],
          produces:            ["Reporte de conversión", "Alertas de anomalía", "Recomendaciones de UX"],
          supervisionRequired: "Requiere GA4 activo. Las recomendaciones de UX requieren aprobación antes de implementarse.",
          steps: [
            { title: "Análisis de métricas", description: "Lee tasa de conversión, abandono y sesiones desde GA4 y Shopify", system: "GA4" },
            { title: "Detección de anomalía", description: "Identifica punto de quiebre en el funnel con mayor impacto", system: "Agentik" },
            { title: "Recomendaciones", description: "Genera recomendaciones de corrección de UX para revisión", system: "Agentik" },
          ],
          lastRun:          "N/A — GA4 no conectado",
          operationalImpact:"Anomalías de conversión detectadas en horas vs días. Pérdidas de venta prevenidas.",
        },
      ],
      available: [
        {
          id:          "retargeting-auto",
          name:        "Retargeting automático",
          description: "Campañas de recuperación de carrito abandonado con creatividades de Luca y segmentación automática.",
          status:      "draft",
          trigger:     "event",
          cadence:     "Al detectar abandono de carrito",
          autonomy:    "semi-autonomo",
          owner:       "agentik",
          touchedSystems:      ["Meta Pixel (pendiente)", "Shopify", "Luca (agente)"],
          produces:            ["Anuncios de retargeting", "Audiencias personalizadas", "Reporte de recuperación"],
          supervisionRequired: "Requiere Meta Pixel activo, Conversions API y creatividades aprobadas de Luca.",
          steps: [
            { title: "Detección de abandono", description: "Identifica sesiones con carrito abandonado en Shopify", system: "Shopify" },
            { title: "Creación de audiencia", description: "Construye audiencia personalizada en Meta con datos del carrito", system: "Meta Pixel" },
          ],
          lastRun:          "N/A",
          operationalImpact:"Recuperación estimada 15-25% de carritos abandonados. Sin gestión manual de campañas.",
        },
        {
          id:          "optimizacion-funnel-ia",
          name:        "Optimización IA del funnel",
          description: "Personaliza la experiencia de tienda en tiempo real según perfil del visitante para maximizar conversión.",
          status:      "draft",
          trigger:     "event",
          cadence:     "Tiempo real · por sesión de usuario",
          autonomy:    "semi-autonomo",
          owner:       "agentik",
          touchedSystems:      ["Shopify", "GA4 (pendiente)", "Modelo ML (pendiente)"],
          produces:            ["Experiencia personalizada", "Uplift de conversión medido", "Datos de experimento"],
          supervisionRequired: "Requiere 6 meses de datos Shopify, GA4 conectado y aprobación SUPER_ADMIN.",
          steps: [
            { title: "Análisis del visitante", description: "Clasifica visitante por comportamiento y perfil histórico si existe", system: "GA4" },
            { title: "Personalización", description: "Ajusta orden de productos y banners según perfil del visitante", system: "Shopify" },
          ],
          lastRun:          "N/A",
          operationalImpact:"Uplift de conversión estimado +22% para visitantes recurrentes con modelo activo.",
        },
      ],
    },
    executionSystem: {
      activeExecutions: [
        {
          id:          "exec-shopify-sync",
          title:       "Sync de catálogo Shopify en progreso",
          description: "Actualizando 312 productos con nuevos precios de temporada. 189 de 312 completados.",
          timestamp:   "hace 1m",
          severity:    "normal",
          state:       "running",
          workflow:    "Sync de catálogo y precios",
          systems:     ["Shopify", "SAG"],
          requiresAttention: false,
        },
        {
          id:          "exec-conversion-monitor",
          title:       "Monitoreo de conversión activo",
          description: "Rastreando tasas de conversión en tiempo real. Categoría calzado con caída sostenida.",
          timestamp:   "hace 4m",
          severity:    "warning",
          state:       "running",
          systems:     ["Shopify Analytics"],
          requiresAttention: true,
        },
      ],
      recentExecutions: [
        {
          id:          "rec-catalogo-sync",
          title:       "Catálogo sincronizado completo",
          description: "847 productos verificados y actualizados en Shopify. Precios y stock alineados.",
          timestamp:   "08:55",
          severity:    "normal",
          state:       "completed",
          systems:     ["Shopify"],
          produced:    ["847 productos actualizados"],
        },
        {
          id:          "rec-stock-oculto",
          title:       "Producto sin stock desactivado",
          description: "SKU-3812 sin inventario desactivado automáticamente para evitar pedidos fallidos.",
          timestamp:   "09:02",
          severity:    "normal",
          state:       "completed",
          systems:     ["Shopify"],
        },
        {
          id:          "rec-conversion-degraded",
          title:       "Conversión degradada en categoría calzado",
          description: "Tasa de conversión —12% en últimas 4h. Posible causa: imágenes de colección desactualizadas.",
          timestamp:   "09:15",
          severity:    "warning",
          state:       "degraded",
          requiresAttention: true,
        },
        {
          id:          "rec-inventario-error",
          title:       "Error de inventario detectado — SKU-4421",
          description: "Stock negativo detectado: —3 unidades. Pedido activo en riesgo de no cumplirse.",
          timestamp:   "09:25",
          severity:    "critical",
          state:       "blocked",
          requiresAttention: true,
          systems:     ["Shopify", "SAG"],
        },
      ],
      incidents: [
        {
          id:          "inc-sku-4421",
          title:       "Stock negativo — SKU-4421",
          description: "Producto con stock negativo activo en tienda. Pedido en riesgo de no cumplirse. Requiere corrección inmediata.",
          timestamp:   "hace 8m",
          severity:    "critical",
          state:       "blocked",
          systems:     ["Shopify", "SAG"],
          requiresAttention: true,
        },
        {
          id:          "inc-calzado-conversion",
          title:       "Conversión degradada — categoría calzado",
          description: "Tasa de conversión sostenidamente baja. Imágenes pueden no estar actualizadas con colección nueva.",
          timestamp:   "hace 28m",
          severity:    "warning",
          state:       "degraded",
          requiresAttention: false,
        },
      ],
      coordination: [
        {
          fromAgent:   "Sofi",
          toAgent:     "Luca",
          description: "SKU-3812 y SKU-4892 sin stock removidos de campañas activas para evitar conversión fallida.",
          timestamp:   "hace 20m",
        },
        {
          fromAgent:   "Luca",
          toAgent:     "Sofi",
          description: "Assets actualizados de colección verano sincronizados en páginas de producto de Shopify.",
          timestamp:   "hace 35m",
        },
      ],
    },
  },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

const DEFAULT_AGENT = AGENTS[0];

export function getAgentForPathname(pathname: string): CopilotAgent {
  const segs = pathname.split("/").filter(Boolean).slice(1);
  const path = segs.join("/");

  for (const agent of AGENTS) {
    for (const modulePrefix of agent.modules) {
      if (path === modulePrefix || path.startsWith(`${modulePrefix}/`) || path.startsWith(modulePrefix)) {
        return agent;
      }
    }
  }

  return DEFAULT_AGENT;
}

export function getMemoryHints(agent: CopilotAgent, pathname: string): string[] {
  const segs = pathname.split("/").filter(Boolean).slice(1);
  const path = segs.join("/");

  if (agent.memoryHints[path]) return agent.memoryHints[path];

  for (const key of Object.keys(agent.memoryHints)) {
    if (key !== "default" && path.startsWith(key)) {
      return agent.memoryHints[key];
    }
  }

  return agent.memoryHints["default"] ?? [];
}

export function getAgentStateCounts(): Record<AgentRuntimeState, number> {
  const counts: Record<AgentRuntimeState, number> = {
    active: 0, syncing: 0, degraded: 0, supervised: 0, offline: 0, learning: 0,
  };
  for (const agent of AGENTS) {
    counts[agent.runtimeState]++;
  }
  return counts;
}
