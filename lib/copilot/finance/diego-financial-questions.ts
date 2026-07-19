/**
 * lib/copilot/finance/diego-financial-questions.ts
 *
 * FASE 2 — Preguntas financieras determinísticas de Diego.
 *
 * Diego soporta 7 preguntas enrutadas a través de routeFinancialQuestion().
 * Si answered=false → NO responder. Sin inventar. Sin suposiciones.
 *
 * Sprint: AGENTIK-DIEGO-FINANCIAL-COPILOT-01
 */

import { getFinancialIntelligenceContext, routeFinancialQuestion } from "@/lib/finance/intelligence";
import type { FinancialQuestion, RoutedAnswer, FinancialDataState } from "@/lib/finance/intelligence";

// ── Output type ───────────────────────────────────────────────────────────────

export type DiegoQuestionAnswer = {
  question:      FinancialQuestion;
  answered:      boolean;
  /** null when answered=false. Never invented. */
  summary:       string | null;
  confidencePct: number;           // 0–100 rounded
  confidenceBadge: "HIGH" | "MEDIUM" | "LOW";
  freshnessState: FinancialDataState;
  freshnessBadge: string;          // e.g. "REAL", "STALE", "SIN DATOS"
  sourceCount:   number;
  /** Human-readable list of sources backing the answer */
  sourceSummary: string;
  focusPath:     string | null;
};

// ── Badge derivation ──────────────────────────────────────────────────────────

function toConfidenceBadge(confidence: number): "HIGH" | "MEDIUM" | "LOW" {
  if (confidence >= 0.75) return "HIGH";
  if (confidence >= 0.45) return "MEDIUM";
  return "LOW";
}

function toFreshnessBadge(state: FinancialDataState): string {
  switch (state) {
    case "REAL":    return "REAL";
    case "PARTIAL": return "PARCIAL";
    case "STALE":   return "STALE";
    case "MISSING": return "SIN DATOS";
    case "BROKEN":  return "ERROR";
    default:        return "DESCONOCIDO";
  }
}

function sourceNames(routed: RoutedAnswer): string {
  if (routed.evidence.length === 0) return "—";
  const names = [...new Set(routed.evidence.map(e => e.source))];
  return names.slice(0, 4).join(", ");
}

// ── NO_EVIDENCE response ──────────────────────────────────────────────────────

const NO_EVIDENCE_SUMMARY =
  "No existe evidencia suficiente para responder esta pregunta.";

// ── Question label map ────────────────────────────────────────────────────────

export const QUESTION_LABELS: Record<FinancialQuestion, string> = {
  que_paso_hoy:              "¿Qué pasó hoy?",
  afecta_liquidez:           "¿Qué afecta liquidez?",
  bloquea_cierre:            "¿Qué bloquea cierre?",
  sin_conciliar:             "¿Qué está sin conciliar?",
  kpis_no_confiables:        "¿Qué KPIs no son confiables?",
  clientes_cartera:          "¿Qué clientes tienen riesgo?",
  movimientos_sin_relacion:  "¿Qué movimientos no tienen relación?",
};

// ── Single question answer ────────────────────────────────────────────────────

export async function answerFinancialQuestion(
  orgId:    string,
  question: FinancialQuestion,
): Promise<DiegoQuestionAnswer> {
  const ctx    = await getFinancialIntelligenceContext(orgId);
  const routed = routeFinancialQuestion(question, ctx);

  const confidencePct = Math.round(routed.confidence * 100);

  return {
    question,
    answered:        routed.answered,
    summary:         routed.answered ? (routed.summary ?? NO_EVIDENCE_SUMMARY) : null,
    confidencePct,
    confidenceBadge: toConfidenceBadge(routed.confidence),
    freshnessState:  routed.dataState,
    freshnessBadge:  toFreshnessBadge(routed.dataState),
    sourceCount:     routed.evidence.length,
    sourceSummary:   sourceNames(routed),
    focusPath:       routed.focusPath,
  };
}

// ── All questions (batch) ─────────────────────────────────────────────────────

export async function answerAllFinancialQuestions(
  orgId: string,
): Promise<DiegoQuestionAnswer[]> {
  // Single context load shared across all questions
  const ctx = await getFinancialIntelligenceContext(orgId);

  const questions: FinancialQuestion[] = [
    "que_paso_hoy",
    "afecta_liquidez",
    "bloquea_cierre",
    "sin_conciliar",
    "kpis_no_confiables",
    "clientes_cartera",
    "movimientos_sin_relacion",
  ];

  return questions.map(question => {
    const routed        = routeFinancialQuestion(question, ctx);
    const confidencePct = Math.round(routed.confidence * 100);

    return {
      question,
      answered:        routed.answered,
      summary:         routed.answered ? (routed.summary ?? NO_EVIDENCE_SUMMARY) : null,
      confidencePct,
      confidenceBadge: toConfidenceBadge(routed.confidence),
      freshnessState:  routed.dataState,
      freshnessBadge:  toFreshnessBadge(routed.dataState),
      sourceCount:     routed.evidence.length,
      sourceSummary:   sourceNames(routed),
      focusPath:       routed.focusPath,
    };
  });
}
