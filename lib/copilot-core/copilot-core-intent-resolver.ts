/**
 * lib/copilot-core/copilot-core-intent-resolver.ts
 *
 * Copilot Core — Intent Resolver
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C
 *
 * Pure function. Deterministic keyword matching.
 * The LLM NEVER chooses or invents capabilityId.
 *
 * Fail-closed:
 *   - Single match → resolved
 *   - Multiple matches → ambiguous (CLARIFICATION_REQUIRED)
 *   - No match → unsupported
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type IntentResult =
  | { readonly kind: "resolved"; readonly capabilityId: string }
  | { readonly kind: "ambiguous"; readonly candidates: readonly string[] }
  | { readonly kind: "unsupported" };

// ── Keyword Map ──────────────────────────────────────────────────────────────

interface IntentPattern {
  readonly capabilityId: string;
  readonly keywords: readonly string[];
}

const INTENT_PATTERNS: readonly IntentPattern[] = [
  {
    capabilityId: "commercial.customers.summary.read",
    keywords: ["clientes", "customers", "cartera", "portafolio de clientes"],
  },
  {
    capabilityId: "commercial.orders.summary.read",
    keywords: ["pedidos", "orders", "ordenes", "órdenes"],
  },
  {
    capabilityId: "commercial.sales.performance.read",
    keywords: [
      "desempeño", "performance", "ventas", "meta",
      "rendimiento", "facturación", "facturacion",
    ],
  },
];

// ── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Resolve user message to a capability via keyword matching.
 * Pure function — no network, no LLM, no side effects.
 */
export function resolveIntent(userMessage: string): IntentResult {
  const normalized = userMessage.toLowerCase().trim();

  if (!normalized) {
    return { kind: "unsupported" };
  }

  const matches: string[] = [];

  for (const pattern of INTENT_PATTERNS) {
    for (const keyword of pattern.keywords) {
      if (normalized.includes(keyword)) {
        if (!matches.includes(pattern.capabilityId)) {
          matches.push(pattern.capabilityId);
        }
        break;
      }
    }
  }

  if (matches.length === 0) {
    return { kind: "unsupported" };
  }

  if (matches.length === 1) {
    return { kind: "resolved", capabilityId: matches[0] };
  }

  return { kind: "ambiguous", candidates: matches };
}
