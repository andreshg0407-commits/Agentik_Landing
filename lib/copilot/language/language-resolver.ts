/**
 * lib/copilot/language/language-resolver.ts
 *
 * Agentik Copilot — Language System: Resolver
 * Sprint: AGENTIK-COPILOT-LANGUAGE-SYSTEM-01
 *
 * Pure functions for resolving user-facing language.
 * No React. No runtime. No UI. No external dependencies.
 *
 * Resolution chain (highest → lowest priority):
 *   1. Module language profile override
 *   2. Agent language profile dictionary
 *   3. Base language dictionary
 *   4. Raw key (last resort — should never surface in production)
 *
 * Usage:
 *   const label = resolveUserFacingTerm("insight", { agentId: "diego", moduleId: "finanzas" });
 *   // → "hallazgo financiero"
 */

import type {
  LanguageKey,
  AgentLanguageProfile,
  ModuleLanguageProfile,
  AgentSectionLabels,
  LanguageResolveOptions,
} from "./language-types";
import { BASE_LANGUAGE }            from "./base-language";
import { AGENT_LANGUAGE_PROFILES }  from "./agent-language-profiles";
import { MODULE_LANGUAGE_PROFILES } from "./module-language-profiles";
import { FORBIDDEN_TERM_SET }       from "./forbidden-terms";

// ── Core resolver ──────────────────────────────────────────────────────────────

/**
 * Resolves a LanguageKey to a user-facing label using the full resolution chain.
 *
 * @param key      - Internal language key (e.g. "insight", "active_work")
 * @param options  - Optional context: agentId and/or moduleId for profile lookup
 * @returns        User-facing label in business Spanish
 *
 * @example
 * resolveUserFacingTerm("insight", { agentId: "diego", moduleId: "conciliacion" })
 * // → "movimiento por revisar"  (module wins over agent)
 *
 * resolveUserFacingTerm("insight", { agentId: "mila" })
 * // → "cliente por contactar"  (agent profile)
 *
 * resolveUserFacingTerm("insight")
 * // → "hallazgo"  (base language fallback)
 */
export function resolveUserFacingTerm(
  key:     LanguageKey,
  options: Pick<LanguageResolveOptions, "agentId" | "moduleId"> = {},
): string {
  const { agentId, moduleId } = options;

  // 1. Module override (highest priority)
  if (moduleId) {
    const moduleProfile = MODULE_LANGUAGE_PROFILES[moduleId];
    if (moduleProfile?.overrides[key] !== undefined) {
      return moduleProfile.overrides[key]!;
    }
  }

  // 2. Agent profile dictionary
  if (agentId) {
    const agentProfile = AGENT_LANGUAGE_PROFILES[agentId];
    if (agentProfile?.dictionary[key] !== undefined) {
      return agentProfile.dictionary[key]!;
    }
  }

  // 3. Base language dictionary
  if (BASE_LANGUAGE[key] !== undefined) {
    return BASE_LANGUAGE[key];
  }

  // 4. Raw key fallback (should never reach production UI)
  return key;
}

/**
 * Convenience alias — same as resolveUserFacingTerm.
 * Use this name when the intent is "get a label for display."
 */
export const getLanguageLabel = resolveUserFacingTerm;

// ── Profile accessors ─────────────────────────────────────────────────────────

/**
 * Returns the AgentLanguageProfile for a given agentId, or undefined.
 *
 * @example
 * const profile = getAgentLanguageProfile("diego");
 * profile?.sectionLabels.insights // → "Hallazgos financieros"
 */
export function getAgentLanguageProfile(
  agentId: string,
): AgentLanguageProfile | undefined {
  return AGENT_LANGUAGE_PROFILES[agentId];
}

/**
 * Returns the ModuleLanguageProfile for a given moduleId, or undefined.
 *
 * @example
 * const profile = getModuleLanguageProfile("cartera");
 * profile?.overrides.insight // → "cliente por cobrar"
 */
export function getModuleLanguageProfile(
  moduleId: string,
): ModuleLanguageProfile | undefined {
  return MODULE_LANGUAGE_PROFILES[moduleId];
}

// ── Section labels resolver ────────────────────────────────────────────────────

/**
 * Returns the resolved section labels for a given agent and/or module context.
 *
 * Module sectionLabelOverrides take priority over agent sectionLabels,
 * which take priority over base section keys.
 *
 * @example
 * const labels = resolveSectionLabels({ agentId: "diego", moduleId: "cartera" });
 * labels.insights // → "Cobros pendientes"  (cartera module wins)
 */
export function resolveSectionLabels(
  options: Pick<LanguageResolveOptions, "agentId" | "moduleId"> = {},
): AgentSectionLabels {
  const { agentId, moduleId } = options;

  const agentProfile  = agentId  ? AGENT_LANGUAGE_PROFILES[agentId]   : undefined;
  const moduleProfile = moduleId ? MODULE_LANGUAGE_PROFILES[moduleId]  : undefined;

  // Base fallback section labels (from BASE_LANGUAGE keys)
  const base: AgentSectionLabels = {
    activeWork:       BASE_LANGUAGE["section_active_work"]       ?? "Trabajando en esto ahora",
    pendingApprovals: BASE_LANGUAGE["section_pending_approvals"]  ?? "Esperando tu aprobación",
    completedWork:    BASE_LANGUAGE["section_completed_work"]     ?? "Completado recientemente",
    followups:        BASE_LANGUAGE["section_followups"]          ?? "Seguimientos programados",
    suggestions:      BASE_LANGUAGE["section_suggestions"]        ?? "Recomendaciones",
    insights:         BASE_LANGUAGE["section_insights"]           ?? "Hallazgos",
    opportunities:    BASE_LANGUAGE["section_opportunities"]      ?? "Oportunidades detectadas",
    requestInbox:     BASE_LANGUAGE["section_request_inbox"]      ?? "Solicitudes",
    agentPresence:    BASE_LANGUAGE["section_agent_presence"]     ?? "Estado del agente",
    attentionItems:   BASE_LANGUAGE["section_attention_items"]    ?? "Puntos de atención",
  };

  // Merge agent section labels over base
  const withAgent: AgentSectionLabels = agentProfile
    ? { ...base, ...agentProfile.sectionLabels }
    : base;

  // Merge module section label overrides (highest priority)
  const withModule: AgentSectionLabels = moduleProfile?.sectionLabelOverrides
    ? { ...withAgent, ...moduleProfile.sectionLabelOverrides }
    : withAgent;

  return withModule;
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Returns true if the given string contains a forbidden term.
 * Performs case-insensitive substring matching.
 *
 * Use this in development/testing to validate that components are
 * not rendering engineering terms directly.
 *
 * @example
 * isForbiddenUserFacingTerm("Vista de Insights")      // → true  (contains "insight")
 * isForbiddenUserFacingTerm("Hallazgos financieros")  // → false
 * isForbiddenUserFacingTerm("Runtime error")          // → true  (contains "runtime")
 */
export function isForbiddenUserFacingTerm(text: string): boolean {
  const lower = text.toLowerCase();
  for (const forbidden of FORBIDDEN_TERM_SET) {
    if (lower.includes(forbidden)) return true;
  }
  return false;
}

/**
 * Returns all forbidden term matches found in the given text.
 * Useful for audit tooling and language compliance checks.
 *
 * @example
 * findForbiddenTerms("Runtime: 3 insights detectados")
 * // → ["runtime", "insight"]
 */
export function findForbiddenTerms(text: string): string[] {
  const lower   = text.toLowerCase();
  const matches: string[] = [];
  for (const forbidden of FORBIDDEN_TERM_SET) {
    if (lower.includes(forbidden)) {
      matches.push(forbidden);
    }
  }
  return matches;
}

/**
 * Returns true if a key has an explicit mapping in BASE_LANGUAGE.
 * Helps callers know whether a fallback to raw key will occur.
 */
export function hasBaseLanguageMapping(key: LanguageKey): boolean {
  return key in BASE_LANGUAGE;
}
