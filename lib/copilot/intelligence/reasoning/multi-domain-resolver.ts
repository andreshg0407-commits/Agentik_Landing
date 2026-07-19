/**
 * lib/copilot/intelligence/reasoning/multi-domain-resolver.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Engine — Multi-Domain Resolver
 *
 * Resolves queries that involve multiple business domains simultaneously:
 *   - Sales (commercial)
 *   - Marketing
 *   - Portfolio / collections
 *   - Treasury / finance
 *   - Inventory
 *   - Operations
 *
 * Determines which domains are relevant to a query and produces a
 * prioritized domain resolution plan that the pipeline can execute.
 *
 * No Prisma. No server-only. Pure domain logic. Never throws.
 */

import type { ReasoningCategory, ReasoningSignal } from "./reasoning-types";
import type { CrossDomainContext } from "./cross-domain-context";
import { buildContext } from "./cross-domain-context";
import { runReasoningPipeline } from "./reasoning-pipeline";
import type { ReasoningConclusion } from "./reasoning-types";
import { emptyConclusion } from "./reasoning-types";
import type { ReasoningPipelineOptions } from "./reasoning-pipeline";

// ── Domain Resolution Plan ─────────────────────────────────────────────────────

export interface DomainResolutionPlan {
  queryId:          string;
  orgSlug:          string;
  requestedDomains: ReasoningCategory[];
  resolvedDomains:  ReasoningCategory[];
  isMultiDomain:    boolean;
  priorityOrder:    ReasoningCategory[];
  reasoning:        string;
}

// ── Domain keyword mapping ─────────────────────────────────────────────────────

const DOMAIN_KEYWORDS: Record<ReasoningCategory, string[]> = {
  FINANCIAL:   [
    "caja", "tesorería", "treasury", "cash", "liquidez", "finanzas", "presupuesto",
    "budget", "cierre", "conciliación", "reconciliation", "pago", "egreso", "ingreso",
  ],
  COMMERCIAL:  [
    "ventas", "sales", "comercial", "cliente", "client", "pipeline", "margen",
    "margin", "canal", "channel", "oportunidad", "opportunity", "pedido", "order",
  ],
  MARKETING:   [
    "marketing", "campaña", "campaign", "pauta", "contenido", "content", "redes",
    "social", "publicidad", "ads", "foto", "studio", "conversión", "conversion",
  ],
  COLLECTIONS: [
    "cobranza", "cobro", "collection", "cartera", "portfolio", "mora", "overdue",
    "deuda", "deudor", "facturas", "invoice", "vencido", "vencimiento",
  ],
  OPERATIONS:  [
    "operación", "operation", "proceso", "process", "inventario", "inventory",
    "ejecución", "execution", "flujo", "workflow", "tarea", "task", "aprobación",
  ],
  EXECUTIVE:   [
    "ejecutivo", "executive", "ceo", "dirección", "board", "estrategia", "strategy",
    "prioridad", "priority", "urgente", "urgent", "crítico", "critical",
  ],
  MULTI_DOMAIN: [],  // auto-applied when 2+ domains detected
};

// ── resolveDomains ─────────────────────────────────────────────────────────────

/**
 * resolveDomains — determine which business domains a natural-language query touches.
 *
 * Keyword-based resolution (no AI). Deterministic.
 */
export function resolveDomains(
  query:   string,
  orgSlug: string,
  queryId: string,
): DomainResolutionPlan {
  const lower = query.toLowerCase();
  const detected: ReasoningCategory[] = [];

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS) as [ReasoningCategory, string[]][]) {
    if (domain === "MULTI_DOMAIN") continue;
    if (keywords.some(kw => lower.includes(kw))) {
      detected.push(domain);
    }
  }

  // Default to EXECUTIVE if nothing matches (general query)
  if (detected.length === 0) detected.push("EXECUTIVE");

  const isMultiDomain = detected.length >= 2;
  const resolved: ReasoningCategory[] = isMultiDomain
    ? [...detected, "MULTI_DOMAIN"]
    : detected;

  const priorityOrder = _prioritizeDomains(detected);

  return {
    queryId,
    orgSlug,
    requestedDomains: detected,
    resolvedDomains:  resolved,
    isMultiDomain,
    priorityOrder,
    reasoning:        `Detected domains from query: [${detected.join(", ")}]. ${isMultiDomain ? "Multi-domain resolution applied." : "Single-domain resolution."}`,
  };
}

// ── resolveMultiDomainQuery ────────────────────────────────────────────────────

/**
 * resolveMultiDomainQuery — full multi-domain reasoning from a query + signals.
 *
 * 1. Resolves domain plan from query
 * 2. Filters signals to relevant domains
 * 3. Builds CrossDomainContext
 * 4. Runs reasoning pipeline
 * 5. Returns conclusion
 *
 * Never throws.
 */
export function resolveMultiDomainQuery(
  orgSlug:  string,
  queryId:  string,
  query:    string,
  signals:  ReasoningSignal[],
  opts?: {
    memoryEntries?:    Array<{ id: string; title: string; type: string; importance: string }>;
    playbookEntries?:  Array<{ id: string; title: string; category: string; priority: string }>;
    executiveSignals?: Array<{ id: string; title: string; severity: string; category: string }>;
    pipelineOpts?:     ReasoningPipelineOptions;
  },
): ReasoningConclusion {
  try {
    const plan = resolveDomains(query, orgSlug, queryId);

    // Filter signals to relevant domains only
    const relevantSignals = signals.filter(
      s => s.orgSlug === orgSlug && // tenant isolation
        (plan.resolvedDomains.includes(s.category) || plan.resolvedDomains.includes("MULTI_DOMAIN")),
    );

    // Build integration summaries
    const memoryContext = opts?.memoryEntries && opts.memoryEntries.length > 0 ? {
      available:  true,
      entryCount: opts.memoryEntries.length,
      topEntries: opts.memoryEntries.slice(0, 5),
    } : undefined;

    const playbookContext = opts?.playbookEntries && opts.playbookEntries.length > 0 ? {
      available:     true,
      playbookCount: opts.playbookEntries.length,
      topPlaybooks:  opts.playbookEntries.slice(0, 5),
    } : undefined;

    const executiveBrainContext = opts?.executiveSignals && opts.executiveSignals.length > 0 ? {
      available:           true,
      signalCount:         opts.executiveSignals.length,
      criticalSignalCount: opts.executiveSignals.filter(s => s.severity === "CRITICAL").length,
      topSignals:          opts.executiveSignals.slice(0, 5),
    } : undefined;

    // Build context
    const context = buildContext(orgSlug, queryId, relevantSignals, {
      memoryContext,
      playbookContext,
      executiveBrainContext,
    });

    // Run pipeline
    const { conclusion } = runReasoningPipeline(context, opts?.pipelineOpts);

    return conclusion;
  } catch {
    return emptyConclusion(orgSlug, queryId);
  }
}

// ── getDomainCoverage ──────────────────────────────────────────────────────────

/**
 * getDomainCoverage — check which domains have signal data available.
 */
export function getDomainCoverage(
  signals: ReasoningSignal[],
  orgSlug: string,
): Record<ReasoningCategory, number> {
  const coverage: Record<string, number> = {};

  for (const signal of signals) {
    if (signal.orgSlug !== orgSlug) continue;
    coverage[signal.category] = (coverage[signal.category] ?? 0) + 1;
  }

  return coverage as Record<ReasoningCategory, number>;
}

/**
 * getActiveDomains — return only domains that have at least one signal.
 */
export function getActiveDomains(
  signals: ReasoningSignal[],
  orgSlug: string,
): ReasoningCategory[] {
  const coverage = getDomainCoverage(signals, orgSlug);
  return Object.entries(coverage)
    .filter(([, count]) => count > 0)
    .map(([domain]) => domain as ReasoningCategory);
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function _prioritizeDomains(domains: ReasoningCategory[]): ReasoningCategory[] {
  // Priority order: FINANCIAL > COLLECTIONS > COMMERCIAL > OPERATIONS > MARKETING > EXECUTIVE
  const priorityRank: Record<ReasoningCategory, number> = {
    FINANCIAL:   6,
    COLLECTIONS: 5,
    COMMERCIAL:  4,
    OPERATIONS:  3,
    MARKETING:   2,
    EXECUTIVE:   1,
    MULTI_DOMAIN: 0,
  };

  return [...domains].sort((a, b) => (priorityRank[b] ?? 0) - (priorityRank[a] ?? 0));
}
