/**
 * lib/copilot/executive-brain/executive-insight-generator.ts
 *
 * Agentik — Executive Brain — Insight Generator
 * Sprint: AGENTIK-EXECUTIVE-BRAIN-01
 *
 * Transforms ranked ExecutiveSignals into human-readable ExecutiveInsights.
 *
 * Strategy:
 *   1. Group signals by category.
 *   2. For each category group: determine aggregate severity + direction.
 *   3. Generate a natural-language insight from the group pattern.
 *   4. Cap at MAX_INSIGHTS (10).
 *
 * Deterministic. No AI. No LLM. Pure text composition from rules.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type {
  ExecutiveSignal,
  ExecutiveInsight,
  ExecutiveSignalCategory,
  ExecutiveSignalSeverity,
  ExecutiveSignalDirection,
} from "./executive-brain-types";
import {
  EXECUTIVE_SEVERITY_RANK,
  sortInsightsByPriority,
} from "./executive-brain-types";

// ── Limits ────────────────────────────────────────────────────────────────────

const MAX_INSIGHTS = 10;

// ── ID generator ──────────────────────────────────────────────────────────────

let _seq = 0;

function nextInsightId(): string {
  _seq = (_seq + 1) % 1_000_000;
  return `ei-${Date.now()}-${String(_seq).padStart(6, "0")}`;
}

// ── Category grouping ─────────────────────────────────────────────────────────

function groupByCategory(
  signals: ExecutiveSignal[],
): Map<ExecutiveSignalCategory, ExecutiveSignal[]> {
  const groups = new Map<ExecutiveSignalCategory, ExecutiveSignal[]>();
  for (const s of signals) {
    const group = groups.get(s.category) ?? [];
    group.push(s);
    groups.set(s.category, group);
  }
  return groups;
}

function dominantDirection(signals: ExecutiveSignal[]): ExecutiveSignalDirection {
  const counts = { IMPROVING: 0, STABLE: 0, DECLINING: 0 };
  for (const s of signals) counts[s.direction]++;
  if (counts.DECLINING >= counts.IMPROVING) {
    return counts.DECLINING > 0 ? "DECLINING" : "STABLE";
  }
  return "IMPROVING";
}

function maxSeverity(signals: ExecutiveSignal[]): ExecutiveSignalSeverity {
  return signals.reduce<ExecutiveSignalSeverity>(
    (best, s) => EXECUTIVE_SEVERITY_RANK[s.severity] > EXECUTIVE_SEVERITY_RANK[best] ? s.severity : best,
    "LOW",
  );
}

// ── Insight text templates ────────────────────────────────────────────────────

interface InsightTemplate {
  title:   (count: number, dir: ExecutiveSignalDirection) => string;
  summary: (count: number, dir: ExecutiveSignalDirection, sev: ExecutiveSignalSeverity) => string;
}

const CATEGORY_TEMPLATES: Record<ExecutiveSignalCategory, InsightTemplate> = {
  FINANCE: {
    title: (_, dir) => dir === "IMPROVING"
      ? "Señales financieras positivas"
      : dir === "DECLINING"
        ? "Atención requerida en finanzas"
        : "Situación financiera estable",
    summary: (count, dir, sev) => {
      if (sev === "CRITICAL") return `Se detectaron ${count} señal(es) financiera(s) crítica(s) que requieren atención inmediata.`;
      if (dir === "DECLINING")  return `${count} señal(es) financiera(s) indica(n) deterioro que merece revisión.`;
      if (dir === "IMPROVING")  return `${count} señal(es) financiera(s) muestra(n) tendencia positiva.`;
      return `Situación financiera dentro de parámetros normales. ${count} señal(es) activa(s).`;
    },
  },
  COLLECTIONS: {
    title: (_, dir) => dir === "IMPROVING"
      ? "Mejora en recuperación de cartera"
      : dir === "DECLINING"
        ? "Riesgo elevado en recuperación de cartera"
        : "Gestión de cobranza activa",
    summary: (count, dir, sev) => {
      if (sev === "CRITICAL") return `${count} señal(es) crítica(s) de cobranza. La cartera vencida requiere atención ejecutiva inmediata.`;
      if (dir === "DECLINING")  return `${count} señal(es) de cobranza indica(n) deterioro en la recuperación de cartera.`;
      if (dir === "IMPROVING")  return `${count} señal(es) muestran mejora en el recaudo de cartera.`;
      return `Proceso de cobranza activo. ${count} señal(es) en seguimiento.`;
    },
  },
  COMMERCIAL: {
    title: (_, dir) => dir === "IMPROVING"
      ? "Desempeño comercial positivo"
      : dir === "DECLINING"
        ? "Bajo desempeño comercial"
        : "Desempeño comercial estable",
    summary: (count, dir, sev) => {
      if (sev === "CRITICAL") return `${count} señal(es) comercial(es) crítica(s) requieren revisión urgente.`;
      if (dir === "DECLINING")  return `${count} señal(es) indica(n) que las ventas o el pipeline están por debajo del objetivo.`;
      if (dir === "IMPROVING")  return `${count} señal(es) confirman crecimiento comercial activo.`;
      return `Desempeño comercial dentro del rango esperado. ${count} señal(es) activa(s).`;
    },
  },
  MARKETING: {
    title: (_, dir) => dir === "IMPROVING"
      ? "Campañas de marketing efectivas"
      : dir === "DECLINING"
        ? "Campañas de marketing por debajo del objetivo"
        : "Actividad de marketing activa",
    summary: (count, dir, sev) => {
      if (sev === "CRITICAL") return `${count} señal(es) crítica(s) de marketing requieren atención inmediata.`;
      if (dir === "DECLINING")  return `${count} señal(es) de marketing indica(n) bajo rendimiento de campañas.`;
      if (dir === "IMPROVING")  return `${count} señal(es) confirman el éxito de las campañas actuales.`;
      return `Actividad de marketing en curso. ${count} señal(es) activa(s).`;
    },
  },
  OPERATIONS: {
    title: (_, dir) => dir === "IMPROVING"
      ? "Operaciones mejorando"
      : dir === "DECLINING"
        ? "Operaciones requieren atención"
        : "Operaciones estables",
    summary: (count, dir, sev) => {
      if (sev === "CRITICAL") return `${count} señal(es) operacional(es) crítica(s) requieren intervención inmediata.`;
      if (dir === "DECLINING")  return `${count} señal(es) operacional(es) indica(n) deterioro en los procesos.`;
      if (dir === "IMPROVING")  return `${count} señal(es) confirman mejora en eficiencia operacional.`;
      return `Operaciones funcionando con normalidad. ${count} señal(es) activa(s).`;
    },
  },
  EXECUTIVE: {
    title: (_, dir) => dir === "IMPROVING"
      ? "Oportunidades estratégicas activas"
      : dir === "DECLINING"
        ? "Alertas ejecutivas requieren atención"
        : "Revisiones ejecutivas pendientes",
    summary: (count, dir, sev) => {
      if (sev === "CRITICAL") return `${count} alerta(s) ejecutiva(s) crítica(s) requieren decisión o acción inmediata.`;
      if (dir === "DECLINING")  return `${count} señal(es) ejecutiva(s) indica(n) situaciones que requieren revisión estratégica.`;
      if (dir === "IMPROVING")  return `${count} señal(es) apuntan a oportunidades estratégicas aprovechables.`;
      return `${count} revisión(es) ejecutiva(s) en agenda.`;
    },
  },
};

// ── Insight generation ────────────────────────────────────────────────────────

/**
 * Generate up to MAX_INSIGHTS ExecutiveInsights from ranked signals.
 *
 * Strategy:
 *   - One insight per business domain (category)
 *   - Insight priority = highest signal severity in the group
 *   - Insight title/summary generated from deterministic templates
 *   - Output sorted by priority DESC, then supportingSignals count DESC
 */
export function generateExecutiveInsights(
  signals: ExecutiveSignal[],
): ExecutiveInsight[] {
  if (signals.length === 0) return [];

  const groups   = groupByCategory(signals);
  const insights: ExecutiveInsight[] = [];

  for (const [category, groupSignals] of groups) {
    const sev      = maxSeverity(groupSignals);
    const dir      = dominantDirection(groupSignals);
    const template = CATEGORY_TEMPLATES[category];
    const count    = groupSignals.length;

    insights.push({
      id:                nextInsightId(),
      title:             template.title(count, dir),
      summary:           template.summary(count, dir, sev),
      priority:          sev,
      categories:        [category],
      supportingSignals: groupSignals.map(s => s.id),
    });
  }

  // Sort by priority, then by supporting signal count
  insights.sort(sortInsightsByPriority);

  return insights.slice(0, MAX_INSIGHTS);
}
