/**
 * lib/copilot/language/language-types.ts
 *
 * Agentik Copilot — Language System Types
 * Sprint: AGENTIK-COPILOT-LANGUAGE-SYSTEM-01
 *
 * Type definitions for the Language System.
 * Interfaces only. No logic. No runtime dependencies.
 *
 * Purpose: Define the shape of the language layer that separates
 * internal engineering terminology from user-visible business language.
 */

// ── Primitives ─────────────────────────────────────────────────────────────────

/**
 * An internal key that maps to a user-facing label.
 * Examples: "insight", "active_work", "pending_approval", "snapshot"
 *
 * Keys follow snake_case and represent engineering/architecture concepts.
 * They are NEVER shown to users directly — always resolved through the language layer.
 */
export type LanguageKey = string;

/**
 * Which profile category owns a language definition.
 *
 * - "base"   → generic business fallback, applies everywhere
 * - "agent"  → scoped to a specific agent identity (diego, mila, luca…)
 * - "module" → scoped to a product module (finanzas, marketing…)
 */
export type LanguageRole = "base" | "agent" | "module";

/**
 * Product modules that can carry dedicated language profiles.
 * Each module may override base language with domain-specific vocabulary.
 */
export type LanguageModule =
  | "finanzas"
  | "conciliacion"
  | "cartera"
  | "tesoreria"
  | "cierre"
  | "planeacion"
  | "marketing"
  | "comercial"
  | "produccion"
  | "global";

/**
 * Grammatical or display variant for a resolved term.
 *
 * - "singular" → e.g. "hallazgo"
 * - "plural"   → e.g. "hallazgos"
 * - "action"   → e.g. "revisar hallazgo"
 * - "label"    → e.g. "Hallazgos financieros" (section title, capitalized)
 */
export type LanguageVariant = "singular" | "plural" | "action" | "label";

// ── Core definitions ───────────────────────────────────────────────────────────

/**
 * A single term definition: maps one internal key to user-visible language.
 * Used to build dictionaries and document the language contract.
 */
export interface LanguageDefinition {
  /** Internal engineering key — never rendered to users. */
  key:              LanguageKey;
  /** User-facing label in plain business Spanish. */
  userFacingLabel:  string;
  /** Grammatical/display variant for this definition. */
  variant?:         LanguageVariant;
  /** Notes for language contributors — never rendered. */
  notes?:           string;
}

// ── Section labels ─────────────────────────────────────────────────────────────

/**
 * Section header labels for all operational panel sections.
 * Each field is required — ensures every section has a user-visible title.
 * Agents and modules may override these labels independently.
 */
export interface AgentSectionLabels {
  /** Label for "Active Work" section — e.g. "Trabajando en esto ahora" */
  activeWork:       string;
  /** Label for "Pending Approvals" section — e.g. "Esperando tu aprobación" */
  pendingApprovals: string;
  /** Label for "Completed Work" section — e.g. "Completado recientemente" */
  completedWork:    string;
  /** Label for "Followups" section — e.g. "Seguimientos programados" */
  followups:        string;
  /** Label for "Suggestions" section — e.g. "Recomendaciones" */
  suggestions:      string;
  /** Label for "Insights" section — e.g. "Hallazgos" */
  insights:         string;
  /** Label for "Opportunities" section — e.g. "Oportunidades detectadas" */
  opportunities:    string;
  /** Label for "Request Inbox" section — e.g. "Solicitudes" */
  requestInbox:     string;
  /** Label for "Agent Presence" block — e.g. "Estado del agente" */
  agentPresence:    string;
  /** Label for "Attention Items" section — e.g. "Puntos de atención" */
  attentionItems:   string;
}

// ── Profiles ───────────────────────────────────────────────────────────────────

/**
 * Full language profile for a specific agent identity.
 *
 * Defines the vocabulary that agent uses when presenting information.
 * A dictionary override is partial — missing keys fall back to base language.
 */
export interface AgentLanguageProfile {
  /** Agent identifier — must match agentId in the agent registry. */
  agentId:       string;
  /** Agent display name. */
  agentName:     string;
  /**
   * Agent-specific dictionary overrides.
   * Only keys present here override the base language dictionary.
   * All other keys resolve through BASE_LANGUAGE.
   */
  dictionary:    Partial<Record<LanguageKey, string>>;
  /** Section header labels as this agent presents them to the user. */
  sectionLabels: AgentSectionLabels;
}

/**
 * Language profile scoped to a product module.
 *
 * Allows the same agent to adjust vocabulary based on the current module.
 * Module overrides take precedence over agent overrides, which take precedence
 * over the base language — the most specific context wins.
 */
export interface ModuleLanguageProfile {
  /** Module identifier — matches LanguageModule union. */
  moduleId:              LanguageModule;
  /** Human-readable module name for documentation. */
  moduleName:            string;
  /**
   * Module-specific dictionary overrides.
   * Partial — only listed keys override. Unlisted keys fall through.
   */
  overrides:             Partial<Record<LanguageKey, string>>;
  /** Optional section label overrides for this module. */
  sectionLabelOverrides?: Partial<AgentSectionLabels>;
}

// ── Resolver input ─────────────────────────────────────────────────────────────

/**
 * Input for resolving a user-facing term.
 * All fields optional — more context yields more specific resolution.
 */
export interface LanguageResolveOptions {
  /** The internal key to resolve. */
  key:       LanguageKey;
  /** Agent context for agent-profile lookup. */
  agentId?:  string;
  /** Module context for module-profile lookup. */
  moduleId?: LanguageModule;
  /** Preferred grammatical variant (applied when profile supports it). */
  variant?:  LanguageVariant;
}
