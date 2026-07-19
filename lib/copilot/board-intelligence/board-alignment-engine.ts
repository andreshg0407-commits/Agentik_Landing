// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 9: Board Alignment Engine

import type { BoardAlignment, BoardConfidence } from "./board-intelligence-types";
import { boardConfidenceFromScore } from "./board-intelligence-types";

// ── Inputs ──────────────────────────────────────────────────────────────────

export interface AlignmentInput {
  readonly orgSlug:          string;
  readonly sessionId:        string;
  readonly strategicScore?:  number;   // 0–1
  readonly governanceScore?: number;   // 0–1
  readonly executionScore?:  number;   // 0–1
  readonly risksAligned?:    boolean;
  readonly budgetAligned?:   boolean;
  readonly misalignedAreas?: string[];
  readonly alignedAreas?:    string[];
  readonly recommendations?: string[];
}

// ── Scoring ─────────────────────────────────────────────────────────────────

export function evaluateAlignmentScore(input: AlignmentInput): number {
  try {
    const strategic   = input.strategicScore  ?? 0.6;
    const governance  = input.governanceScore ?? 0.6;
    const execution   = input.executionScore  ?? 0.6;
    const riskBonus   = input.risksAligned   ? 0.05 : -0.05;
    const budgetBonus = input.budgetAligned  ? 0.05 : -0.05;

    const base = strategic * 0.40 + governance * 0.35 + execution * 0.25;
    return Math.max(0, Math.min(1, base + riskBonus + budgetBonus));
  } catch {
    return 0.5;
  }
}

export function detectMisalignment(input: AlignmentInput): string[] {
  try {
    const misaligned: string[] = [...(input.misalignedAreas ?? [])];

    if ((input.strategicScore ?? 0.6) < 0.4) {
      misaligned.push("Alineación estratégica débil");
    }
    if ((input.governanceScore ?? 0.6) < 0.4) {
      misaligned.push("Debilidades de gobierno detectadas");
    }
    if ((input.executionScore ?? 0.6) < 0.4) {
      misaligned.push("Baja preparación de ejecución");
    }
    if (input.risksAligned === false) {
      misaligned.push("Riesgos no alineados con plan estratégico");
    }
    if (input.budgetAligned === false) {
      misaligned.push("Presupuesto no alineado con prioridades");
    }

    return [...new Set(misaligned)];
  } catch {
    return [];
  }
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function evaluateAlignment(input: AlignmentInput): BoardAlignment {
  try {
    const alignmentScore  = evaluateAlignmentScore(input);
    const misalignedAreas = detectMisalignment(input);
    const alignedAreas    = input.alignedAreas ?? [];
    const confidence: BoardConfidence = boardConfidenceFromScore(alignmentScore);

    const alignmentSummary = buildAlignmentSummary(alignmentScore, misalignedAreas, alignedAreas);
    const recommendations  = input.recommendations ?? buildDefaultAlignmentRecommendations(misalignedAreas);

    return {
      orgSlug:          input.orgSlug,
      sessionId:        input.sessionId,
      alignmentScore,
      misalignedAreas,
      alignedAreas,
      alignmentSummary,
      recommendations,
      confidence,
    };
  } catch {
    return buildEmptyAlignment(input.orgSlug, input.sessionId);
  }
}

function buildAlignmentSummary(
  score:        number,
  misaligned:   string[],
  aligned:      string[]
): string {
  if (score >= 0.75 && misaligned.length === 0) {
    return "Alta alineación en todas las dimensiones estratégicas y de gobierno.";
  }
  if (score >= 0.55) {
    return `Alineación moderada. ${aligned.length} área(s) alineada(s), ${misaligned.length} área(s) requieren atención.`;
  }
  return `Alineación débil detectada. ${misaligned.length} área(s) crítica(s) requieren revisión urgente.`;
}

function buildDefaultAlignmentRecommendations(misaligned: string[]): string[] {
  if (misaligned.length === 0) return ["Mantener alineación actual en próximo ciclo de revisión."];
  return misaligned.map((m) => `Revisar y corregir: ${m}`);
}

export function buildEmptyAlignment(orgSlug: string, sessionId: string): BoardAlignment {
  return {
    orgSlug,
    sessionId,
    alignmentScore:   0.5,
    misalignedAreas:  [],
    alignedAreas:     [],
    alignmentSummary: "Datos insuficientes para evaluación de alineación.",
    recommendations:  [],
    confidence:       "LOW",
  };
}
