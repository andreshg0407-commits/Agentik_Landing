/**
 * types/copilot/copilot-types.ts
 *
 * Agentik Copilot Core V2 — Transversal Intelligence Layer
 * Sprint: AGENTIK-COPILOT-CORE-02
 *
 * 7 domain agents with context auto-resolution from pathname.
 * NOT: chat, LLM calls, Prisma, autonomous actions.
 *
 * This layer is ADDITIVE — does not replace lib/copilot/types.ts (financial signals).
 */

// ── Agent identity ─────────────────────────────────────────────────────────────

export type AgentId =
  | "luca"   // Marketing & commercial intelligence
  | "diego"  // Financial intelligence director
  | "laura"  // Collections & accounts receivable
  | "david"  // Reports & planning intelligence
  | "sofia"  // Integrations & connectors
  | "mila"   // Content & asset intelligence
  | "pablo"; // Operations & pipeline

// ── Module domains ────────────────────────────────────────────────────────────

export type CopilotModuleDomain =
  | "marketing_studio"
  | "finance"
  | "collections"
  | "reports"
  | "integrations"
  | "pipeline"
  | "agentik"
  | "control_center"
  | "settings"
  | "dashboard"
  | "default";

// ── Quick actions ──────────────────────────────────────────────────────────────

export interface CopilotQuickAction {
  id:    string;
  label: string;
  href:  string;
  icon?: string;  // emoji or lucide name
}

// ── Context cards ──────────────────────────────────────────────────────────────

export type CopilotCardType =
  | "status"
  | "metric"
  | "alert"
  | "recommendation"
  | "task";

export interface CopilotContextCard {
  id:       string;
  type:     CopilotCardType;
  titulo:   string;
  valor?:   string;
  meta?:    string;
  href?:    string;
  urgent?:  boolean;
}

// ── Tasks & suggestions ────────────────────────────────────────────────────────

export type CopilotTaskPriority = "critical" | "elevated" | "normal";

export interface CopilotTask {
  id:       string;
  label:    string;
  href:     string;
  priority: CopilotTaskPriority;
  agent:    AgentId;
}

export interface CopilotSuggestion {
  id:       string;
  text:     string;
  href:     string;
  agentId:  AgentId;
}

// ── Alert ──────────────────────────────────────────────────────────────────────

export type CopilotAlertLevel = "critical" | "warning" | "info";

export interface CopilotAlert {
  id:    string;
  title: string;
  level: CopilotAlertLevel;
  meta:  string;
  agent: AgentId;
}

// ── Agent definition ───────────────────────────────────────────────────────────

export interface CopilotAgentDef {
  id:            AgentId;
  name:          string;
  displayName:   string;       // "Luca · Marketing" — rail header line 1
  department:    string;       // "Marketing" | "Finanzas" | etc.
  role:          string;       // Operational title — rail header line 2
  specialty:     string;       // Short specialty description
  avatar:        string;       // /agents/{file}
  accentColor:   string;       // Hex color for accent
  domains:       CopilotModuleDomain[];
  quickActions:  CopilotQuickAction[];
  // What this agent watches
  watchedSignals: string[];
}

// ── Context ────────────────────────────────────────────────────────────────────

export interface CopilotContext {
  module:        CopilotModuleDomain;
  activeAgent:   CopilotAgentDef;
  pathname:      string;
  orgSlug:       string;
  isInternal:    boolean;
}

// ── Runtime state ──────────────────────────────────────────────────────────────

export type CopilotCoreRuntimeState =
  | "ready"
  | "loading"
  | "degraded"
  | "no_context";

export interface CopilotCoreRuntime {
  state:       CopilotCoreRuntimeState;
  context:     CopilotContext;
  tasks:       CopilotTask[];
  alerts:      CopilotAlert[];
  suggestions: CopilotSuggestion[];
  cards:       CopilotContextCard[];
}
