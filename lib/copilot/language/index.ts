/**
 * lib/copilot/language/index.ts
 *
 * Agentik Copilot — Language System
 * Sprint: AGENTIK-COPILOT-LANGUAGE-SYSTEM-01
 *
 * Central export point for the Language System.
 * Import from this path — never from individual files directly.
 *
 * @example
 * import {
 *   resolveUserFacingTerm,
 *   resolveSectionLabels,
 *   isForbiddenUserFacingTerm,
 *   DIEGO_LANGUAGE_PROFILE,
 *   BASE_LANGUAGE,
 * } from "@/lib/copilot/language";
 */

// ── Types ──────────────────────────────────────────────────────────────────────
export type {
  LanguageKey,
  LanguageRole,
  LanguageModule,
  LanguageVariant,
  LanguageDefinition,
  AgentSectionLabels,
  AgentLanguageProfile,
  ModuleLanguageProfile,
  LanguageResolveOptions,
} from "./language-types";

// ── Base language dictionary ──────────────────────────────────────────────────
export { BASE_LANGUAGE } from "./base-language";

// ── Forbidden terms ───────────────────────────────────────────────────────────
export type { ForbiddenTerm }               from "./forbidden-terms";
export { FORBIDDEN_TERMS, FORBIDDEN_TERM_SET } from "./forbidden-terms";

// ── Agent language profiles ───────────────────────────────────────────────────
export {
  DIEGO_LANGUAGE_PROFILE,
  LUCA_LANGUAGE_PROFILE,
  MILA_LANGUAGE_PROFILE,
  PABLO_LANGUAGE_PROFILE,
  SOFIA_LANGUAGE_PROFILE,
  DAVID_LANGUAGE_PROFILE,
  LAURA_LANGUAGE_PROFILE,
  AGENT_LANGUAGE_PROFILES,
} from "./agent-language-profiles";

// ── Module language profiles ──────────────────────────────────────────────────
export {
  FINANZAS_LANGUAGE_PROFILE,
  CONCILIACION_LANGUAGE_PROFILE,
  CARTERA_LANGUAGE_PROFILE,
  TESORERIA_LANGUAGE_PROFILE,
  CIERRE_LANGUAGE_PROFILE,
  PLANEACION_LANGUAGE_PROFILE,
  MARKETING_LANGUAGE_PROFILE,
  COMERCIAL_LANGUAGE_PROFILE,
  PRODUCCION_LANGUAGE_PROFILE,
  MODULE_LANGUAGE_PROFILES,
} from "./module-language-profiles";

// ── Audit utilities (AGENTIK-COPILOT-LANGUAGE-ADOPTION-01) ───────────────────
export type { AuditViolation, ComponentAuditResult, LanguageAuditReport } from "./language-audit";
export {
  auditUserFacingText,
  auditComponentLabels,
  findForbiddenTerms as findForbiddenTermsInText,
  generateLanguageAudit,
  formatAuditReport,
  COPILOT_COMPONENT_LABELS,
} from "./language-audit";

// ── Resolver functions ────────────────────────────────────────────────────────
export {
  resolveUserFacingTerm,
  getLanguageLabel,
  getAgentLanguageProfile,
  getModuleLanguageProfile,
  resolveSectionLabels,
  isForbiddenUserFacingTerm,
  findForbiddenTerms,
  hasBaseLanguageMapping,
} from "./language-resolver";
