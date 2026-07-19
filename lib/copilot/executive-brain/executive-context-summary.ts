/**
 * lib/copilot/executive-brain/executive-context-summary.ts
 *
 * Agentik — Executive Brain — Context Compression
 * Sprint: AGENTIK-EXECUTIVE-BRAIN-01
 *
 * Generates a compact text summary of ExecutiveContext for injection into
 * Copilot's response pipeline. Prevents context explosion.
 *
 * Maximum output: 2000 characters.
 *
 * Pure domain. No Prisma. No server-only. No React. No AI. No prompts.
 */

import type { ExecutiveContext, ExecutiveInsight, ExecutiveSignal } from "./executive-brain-types";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_SUMMARY_CHARS  = 2000;
const MAX_INSIGHTS_SHOWN = 5;
const MAX_SIGNALS_SHOWN  = 5;

// ── Formatters ────────────────────────────────────────────────────────────────

function formatInsight(insight: ExecutiveInsight): string {
  return `[${insight.priority}] ${insight.title}: ${insight.summary}`;
}

function formatSignal(signal: ExecutiveSignal): string {
  const dir = signal.direction === "DECLINING" ? "↓" : signal.direction === "IMPROVING" ? "↑" : "→";
  return `• ${dir} [${signal.category}/${signal.severity}] ${signal.title}`;
}

// ── Summary builder ───────────────────────────────────────────────────────────

/**
 * Build a compact text summary of the ExecutiveContext.
 * Designed for injection into Copilot's context pipeline without exploding token budget.
 *
 * Structure:
 *   === CONTEXTO EJECUTIVO ===
 *   [Insights section]
 *   [Top signals section]
 *
 * Always returns a string. Returns empty string when context is empty.
 */
export function buildExecutiveSummary(ctx: ExecutiveContext): string {
  if (ctx.signals.length === 0 && ctx.insights.length === 0) {
    return "";
  }

  const parts: string[] = [];

  parts.push("=== CONTEXTO EJECUTIVO ===");

  // Insights block
  if (ctx.insights.length > 0) {
    parts.push("\nInsights ejecutivos:");
    const topInsights = ctx.insights.slice(0, MAX_INSIGHTS_SHOWN);
    for (const insight of topInsights) {
      parts.push(formatInsight(insight));
    }
    if (ctx.insights.length > MAX_INSIGHTS_SHOWN) {
      parts.push(`(+${ctx.insights.length - MAX_INSIGHTS_SHOWN} insight(s) adicional(es))`);
    }
  }

  // Top signals block (only CRITICAL + HIGH to keep it compact)
  const criticalHighSignals = ctx.signals.filter(
    s => s.severity === "CRITICAL" || s.severity === "HIGH",
  );
  if (criticalHighSignals.length > 0) {
    parts.push("\nSeñales prioritarias:");
    const topSignals = criticalHighSignals.slice(0, MAX_SIGNALS_SHOWN);
    for (const signal of topSignals) {
      parts.push(formatSignal(signal));
    }
    if (criticalHighSignals.length > MAX_SIGNALS_SHOWN) {
      parts.push(`(+${criticalHighSignals.length - MAX_SIGNALS_SHOWN} señal(es) adicional(es))`);
    }
  }

  const result = parts.join("\n");

  // Enforce hard limit
  if (result.length > MAX_SUMMARY_CHARS) {
    return result.slice(0, MAX_SUMMARY_CHARS - 3) + "...";
  }

  return result;
}

/**
 * Returns a one-line executive headline from the context.
 * Used for quick status labels in UI or response headers.
 *
 * Examples:
 *   "⚠ Atención ejecutiva requerida — 2 alertas críticas"
 *   "✓ Contexto ejecutivo estable"
 *   "↑ Señales positivas detectadas"
 */
export function buildExecutiveHeadline(ctx: ExecutiveContext): string {
  if (ctx.signals.length === 0) return "Sin señales ejecutivas activas";

  const criticalCount = ctx.signals.filter(s => s.severity === "CRITICAL").length;
  const highCount     = ctx.signals.filter(s => s.severity === "HIGH").length;
  const improvingCount = ctx.signals.filter(s => s.direction === "IMPROVING").length;

  if (criticalCount > 0) {
    return `⚠ Atención ejecutiva requerida — ${criticalCount} alerta(s) crítica(s)`;
  }
  if (highCount >= 2) {
    return `⚠ Múltiples señales de alta prioridad — ${highCount} señales HIGH`;
  }
  if (improvingCount > ctx.signals.length / 2) {
    return `↑ Señales positivas dominantes — ${improvingCount} señal(es) mejorando`;
  }
  return `→ Contexto ejecutivo estable — ${ctx.signals.length} señal(es) activa(s)`;
}
