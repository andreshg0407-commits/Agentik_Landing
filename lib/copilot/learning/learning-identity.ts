// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning identity helpers — ID generation

function randomHex(bytes: number): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < bytes * 2; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

export function generateLearningEventId(): string {
  return `learn_evt_${Date.now()}_${randomHex(6)}`;
}

export function generateLearningPatternId(): string {
  return `learn_pat_${Date.now()}_${randomHex(6)}`;
}

export function generateLearningSignalId(): string {
  return `learn_sig_${Date.now()}_${randomHex(6)}`;
}

export function generateLearningAdjustmentId(): string {
  return `learn_adj_${Date.now()}_${randomHex(6)}`;
}

export function generateLearningOutcomeId(): string {
  return `learn_out_${Date.now()}_${randomHex(6)}`;
}

export function generateLearningResultId(): string {
  return `learn_res_${Date.now()}_${randomHex(6)}`;
}
