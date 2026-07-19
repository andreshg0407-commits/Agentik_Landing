/**
 * lib/copilot/language/forbidden-terms.ts
 *
 * Agentik Copilot — Language System: Forbidden Terms
 * Sprint: AGENTIK-COPILOT-LANGUAGE-SYSTEM-01
 *
 * Canonical list of terms that MUST NEVER appear in the user-facing interface.
 *
 * These are valid engineering concepts internally but are inappropriate for
 * Latin American business users (managers, operations teams, finance staff).
 *
 * Rules:
 *   1. Add new entries at the bottom of each category.
 *   2. Never remove existing entries.
 *   3. `suggestKeys` must point to keys that exist in BASE_LANGUAGE.
 *   4. Matching is case-insensitive and includes substring detection.
 */

// ── Term definition ────────────────────────────────────────────────────────────

export interface ForbiddenTerm {
  /** The forbidden string. Matching is case-insensitive. */
  term:        string;
  /** Why this term is inappropriate for business users. */
  reason:      string;
  /**
   * Suggested language keys from BASE_LANGUAGE to use instead.
   * Empty array means the concept should simply not surface to users.
   */
  suggestKeys: string[];
}

// ── Canonical forbidden terms ──────────────────────────────────────────────────

/**
 * The authoritative forbidden-terms registry.
 * Extend by appending — never mutate existing entries.
 */
export const FORBIDDEN_TERMS: readonly ForbiddenTerm[] = [

  // ── AI / ML terminology ──────────────────────────────────────────────────────
  {
    term:        "insight",
    reason:      "Anglicismo de IA que no tiene equivalente claro para gerentes latinoamericanos",
    suggestKeys: ["insight", "insights"],
  },
  {
    term:        "insights",
    reason:      "Plural de anglicismo IA",
    suggestKeys: ["insights"],
  },
  {
    term:        "capability",
    reason:      "Término técnico de arquitectura de agentes de IA",
    suggestKeys: ["capability", "capabilities"],
  },
  {
    term:        "capabilities",
    reason:      "Plural de término técnico de agentes",
    suggestKeys: ["capabilities"],
  },
  {
    term:        "recommendation engine",
    reason:      "Nombre de subsistema interno de Agentik",
    suggestKeys: ["suggestion", "suggestions"],
  },
  {
    term:        "scoring",
    reason:      "Concepto de ML no relevante para el usuario de negocio",
    suggestKeys: [],
  },
  {
    term:        "embedding",
    reason:      "Término técnico de IA que no debe exponerse",
    suggestKeys: [],
  },
  {
    term:        "embeddings",
    reason:      "Plural de término técnico de IA",
    suggestKeys: [],
  },
  {
    term:        "llm",
    reason:      "Acrónimo técnico de IA",
    suggestKeys: [],
  },
  {
    term:        "prompt",
    reason:      "Término técnico de interacción con modelos de IA",
    suggestKeys: [],
  },
  {
    term:        "inference",
    reason:      "Término de ML sin equivalente claro en lenguaje de negocio",
    suggestKeys: [],
  },
  {
    term:        "model",
    reason:      "Ambiguo — en contexto de IA no debe exponerse",
    suggestKeys: [],
  },

  // ── Architecture terminology ─────────────────────────────────────────────────
  {
    term:        "runtime",
    reason:      "Término de ingeniería de software sin significado de negocio",
    suggestKeys: [],
  },
  {
    term:        "snapshot",
    reason:      "Término de arquitectura/sistemas — el usuario ve 'situación actual'",
    suggestKeys: ["snapshot", "context"],
  },
  {
    term:        "registry",
    reason:      "Término de arquitectura de software",
    suggestKeys: [],
  },
  {
    term:        "discovery",
    reason:      "Término de arquitectura de software (service discovery)",
    suggestKeys: [],
  },
  {
    term:        "context resolver",
    reason:      "Nombre de subsistema interno de Agentik",
    suggestKeys: ["context"],
  },
  {
    term:        "domain registry",
    reason:      "Nombre de subsistema interno",
    suggestKeys: [],
  },
  {
    term:        "action registry",
    reason:      "Nombre de subsistema interno",
    suggestKeys: [],
  },
  {
    term:        "viewmodel",
    reason:      "Patrón de arquitectura MVVM — no relevante para usuario",
    suggestKeys: [],
  },
  {
    term:        "view model",
    reason:      "Variante con espacio del mismo patrón",
    suggestKeys: [],
  },
  {
    term:        "workspace",
    reason:      "Anglicismo SaaS — se reemplaza por 'oficina del agente' o contexto equivalente",
    suggestKeys: ["workspace"],
  },
  {
    term:        "agent presence",
    reason:      "Término de arquitectura de agentes — el usuario ve 'estado del agente'",
    suggestKeys: ["agent_presence"],
  },
  {
    term:        "copilot slot",
    reason:      "Nombre de componente interno de arquitectura",
    suggestKeys: [],
  },
  {
    term:        "knowledge base",
    reason:      "Término técnico de sistemas de IA",
    suggestKeys: [],
  },
  {
    term:        "knowledge layer",
    reason:      "Nombre de capa arquitectónica interna",
    suggestKeys: [],
  },

  // ── Developer / testing terminology ─────────────────────────────────────────
  {
    term:        "developer tools",
    reason:      "Etiqueta interna de herramientas de desarrollo",
    suggestKeys: [],
  },
  {
    term:        "debug",
    reason:      "Término de desarrollo de software",
    suggestKeys: [],
  },
  {
    term:        "dev fixture",
    reason:      "Término de testing de software",
    suggestKeys: [],
  },
  {
    term:        "fixture",
    reason:      "Término de testing de software",
    suggestKeys: [],
  },
  {
    term:        "mock",
    reason:      "Término de testing de software",
    suggestKeys: [],
  },
  {
    term:        "stub",
    reason:      "Término de testing de software",
    suggestKeys: [],
  },
  {
    term:        "snapshot id",
    reason:      "Identificador interno del sistema — nunca debe mostrarse al usuario",
    suggestKeys: [],
  },
  {
    term:        "sprint",
    reason:      "Metodología de desarrollo — no relevante para usuario de negocio",
    suggestKeys: [],
  },

  // ── SaaS / technology anglicisms ─────────────────────────────────────────────
  {
    term:        "onboarding",
    reason:      "Anglicismo SaaS sin equivalente natural en español de negocio",
    suggestKeys: [],
  },
  {
    term:        "pipeline",
    reason:      "Término técnico de DevOps / MLOps",
    suggestKeys: [],
  },
  {
    term:        "webhook",
    reason:      "Término técnico de integraciones de software",
    suggestKeys: [],
  },
  {
    term:        "api",
    reason:      "Término técnico de desarrollo de software",
    suggestKeys: [],
  },
  {
    term:        "token",
    reason:      "Término técnico ambiguo (autenticación / IA)",
    suggestKeys: [],
  },
  {
    term:        "endpoint",
    reason:      "Término técnico de APIs",
    suggestKeys: [],
  },
  {
    term:        "deploy",
    reason:      "Término de ingeniería de software",
    suggestKeys: [],
  },
  {
    term:        "deployment",
    reason:      "Término de ingeniería de software",
    suggestKeys: [],
  },
] as const;

// ── Fast lookup set ────────────────────────────────────────────────────────────

/**
 * Lowercase set of all forbidden term strings.
 * Use for O(1) containment checks in isForbiddenUserFacingTerm().
 */
export const FORBIDDEN_TERM_SET: ReadonlySet<string> = new Set(
  FORBIDDEN_TERMS.map(ft => ft.term.toLowerCase()),
);
