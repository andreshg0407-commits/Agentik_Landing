/**
 * lib/copilot/finance/index.ts
 *
 * Barrel — Financial copilot layer (Diego Financial Intelligence).
 *
 * Sprint: AGENTIK-DIEGO-FINANCIAL-COPILOT-01
 */

export { buildDiegoFinancialAdapter }           from "./diego-financial-adapter";
export { answerFinancialQuestion, answerAllFinancialQuestions, QUESTION_LABELS } from "./diego-financial-questions";
export { computeFinancialFocusAreas, buildFinancialFocusAreas } from "./diego-focus-engine";

export type { DiegoFinancialSignal, DiegoFinancialAdapterOutput, DiegoEvidenceTrace, DiegoFinancialSignalSeverity } from "./diego-financial-adapter";
export type { DiegoQuestionAnswer } from "./diego-financial-questions";
export type { FinancialFocusArea } from "./diego-focus-engine";
