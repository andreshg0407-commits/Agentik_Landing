/**
 * lib/copilot/intent-memory.ts
 *
 * Agentik Copilot — Intent Memory V1 (deterministic mock)
 *
 * Phase 3 of Sprint AGENTIK-COPILOT-EXECUTIVE-INTENT-01
 *
 * Simulates continuity of executive intents across sessions.
 * V1: deterministic mock — no DB, no localStorage.
 * V2: driven by Prisma.CopilotIntentLog with real persistence.
 *
 * Purpose:
 *   Enable Copilot to say "esta prioridad sigue activa" without DB.
 *   The mock creates the illusion of memory using org-scoped deterministic state.
 *
 * Contract:
 *   - getIntentMemory(orgSlug, agentId) → past unresolved intents
 *   - mergeIntentMemory(current, memory) → intents with continuity markers
 *   - summarizeIntentContinuity(intents) → text summary for rail display
 */

import type { ExecutiveIntent, IntentType } from "./executive-intent";

// ── Memory entry ──────────────────────────────────────────────────────────────

export interface IntentMemoryEntry {
  intentId:          string;
  type:              IntentType;
  agentId:           string;
  module:            string;
  title:             string;
  lastSeenLabel:     string;   // e.g. "sesión anterior", "hace 2 sesiones"
  continuityMarker:  string;   // Copilot phrasing for continuity
  wasEscalated:      boolean;
  sessionCount:      number;   // How many sessions this intent has been active
}

// ── Agent continuity phrasing ─────────────────────────────────────────────────

const CONTINUITY_PHRASES: Record<string, Partial<Record<IntentType, string>>> = {
  diego: {
    protect_liquidity:   "Diego mantiene seguimiento — riesgo aún no resuelto",
    unblock_close:       "Pendiente desde sesión anterior — bloqueo de cierre activo",
    review_integrations: "Diego sostiene vigilancia sobre sincronización",
    maintain_stability:  "Seguimiento rutinario continúa estable",
    recover_commercial:  "Diego mantiene foco comercial",
  },
  luca: {
    protect_liquidity:   "Luca mantiene seguimiento de liquidez",
    unblock_close:       "Luca acompaña revisión de cierre",
    recover_commercial:  "Luca sostiene oportunidad de campaña activa",
    maintain_stability:  "Luca protege ritmo comercial",
    review_integrations: "Luca monitorea conectividad",
  },
  sofi: {
    protect_liquidity:   "Sofi vigila liquidez ecommerce",
    unblock_close:       "Sofi sostiene revisión de cierre",
    recover_commercial:  "Sofi vigila experiencia web — oportunidad activa",
    maintain_stability:  "Sofi mantiene estabilidad ecommerce",
    review_integrations: "Sofi vigila conectores Shopify",
  },
  mila: {
    protect_liquidity:   "Mila mantiene seguimiento financiero",
    unblock_close:       "Mila sostiene revisión de cierre",
    recover_commercial:  "Mila protege oportunidad de venta activa",
    maintain_stability:  "Mila mantiene seguimiento comercial",
    review_integrations: "Mila monitorea estado operativo",
  },
};

function continuityPhrase(agentId: string, type: IntentType): string {
  return (
    CONTINUITY_PHRASES[agentId]?.[type] ??
    CONTINUITY_PHRASES["diego"]?.[type] ??
    "Prioridad activa desde sesión anterior"
  );
}

// ── Mock memory registry ──────────────────────────────────────────────────────
// V1: deterministic per org. Intent memory is scoped to the org's known risk profile.
// Castillitos: known financial pressure → liquidity and close intents always have memory.

const MOCK_MEMORY: Record<string, IntentMemoryEntry[]> = {
  // castillitos: financial risk profile with known cartera and reconciliation pressure
  castillitos: [
    {
      intentId:         "intent-liquidity-castillitos",
      type:             "protect_liquidity",
      agentId:          "diego",
      module:           "finanzas/tesoreria",
      title:            "Diego mantiene prioridad: proteger liquidez",
      lastSeenLabel:    "sesión anterior",
      continuityMarker: continuityPhrase("diego", "protect_liquidity"),
      wasEscalated:     false,
      sessionCount:     3,
    },
    {
      intentId:         "intent-close-castillitos",
      type:             "unblock_close",
      agentId:          "diego",
      module:           "finanzas/cierre",
      title:            "Diego sostiene vigilancia sobre el cierre financiero",
      lastSeenLabel:    "hace 2 sesiones",
      continuityMarker: continuityPhrase("diego", "unblock_close"),
      wasEscalated:     false,
      sessionCount:     2,
    },
  ],
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns mock intent memory for a given org and agent.
 * V1: deterministic per org slug.
 */
export function getIntentMemory(
  orgSlug: string,
  agentId: string,
): IntentMemoryEntry[] {
  const orgMemory = MOCK_MEMORY[orgSlug] ?? [];
  return orgMemory.filter(m => m.agentId === agentId || m.agentId === "diego");
}

/**
 * Merges current intents with past memory entries.
 * For each current intent, if memory exists for the same type:
 *   - Marks intent as "continued" via continuityMarker
 *   - Increments session count
 *   - Preserves escalation status
 */
export function mergeIntentMemory(
  currentIntents: ExecutiveIntent[],
  memory:         IntentMemoryEntry[],
): Array<ExecutiveIntent & { continuityMarker?: string; sessionCount?: number }> {
  return currentIntents.map(intent => {
    const memoryEntry = memory.find(m => m.type === intent.type);
    if (!memoryEntry) return intent;

    return {
      ...intent,
      // Preserve escalated status from memory
      status:           memoryEntry.wasEscalated ? "escalated" : intent.status,
      continuityMarker: memoryEntry.continuityMarker,
      sessionCount:     memoryEntry.sessionCount + 1,
      // Backfill startedAt from memory (intent has been alive since before this session)
      startedAt:        new Date(intent.startedAt.getTime() - memoryEntry.sessionCount * 3_600_000),
    };
  });
}

/**
 * Produces a one-line continuity summary for the rail display.
 * Used in the "Foco ejecutivo" section header.
 * Returns null if there is no meaningful continuity to show.
 */
export function summarizeIntentContinuity(
  intents: Array<ExecutiveIntent & { sessionCount?: number }>,
): string | null {
  const primary = intents[0];
  if (!primary) return null;

  const count = primary.sessionCount ?? 1;
  if (count <= 1) return null;

  const sessionLabel = count === 2 ? "sesión anterior"
                     : count <= 4 ? `${count - 1} sesiones`
                     : "varias sesiones";

  return `Prioridad activa desde ${sessionLabel}`;
}
