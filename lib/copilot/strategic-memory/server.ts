// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Server-only barrel — imports "server-only" to prevent client-side usage
import "server-only";

// Re-export everything from the client-safe barrel
export * from "./index";

// Server-only additions
export { checkStrategicMemoryHealth } from "./strategic-memory-health";
export type { StrategicMemoryHealthStatus, StrategicMemoryHealthReport } from "./strategic-memory-health";

export { runStrategicMemoryEngine, buildEngineAuditEvent } from "./strategic-memory-engine";
export type { StrategicMemoryEngineInput, StrategicMemoryEngineStatus, StrategicEngineAuditEvent } from "./strategic-memory-engine";

export { PrismaStrategicMemoryRepository } from "./persistence/prisma-strategic-memory-repository";

// Integration adapters (server-only — contain AI/LLM/DB bridge logic)
export {
  memoryEntryToStrategicInput,
  memoryEntriesToStrategicInputs,
  buildMemoryContextFromStrategic,
} from "./integrations/strategic-memory-memory-engine";

export {
  buildGraphFromStrategicMemory,
  strategicEntryToGraphNode,
  strategicRelationToGraphEdge,
  findHighWeightStrategicNodes,
} from "./integrations/strategic-memory-memory-graph";

export {
  learningPatternToStrategicInput,
  learningPatternsToStrategicInputs,
  buildLearningSignalsFromStrategic,
} from "./integrations/strategic-memory-learning";

export {
  executiveSignalToStrategicInput,
  executiveInsightToStrategicInput,
  buildExecutiveStrategicContext,
  snapshotToExecutiveBriefing,
} from "./integrations/strategic-memory-executive-brain";

export {
  hypothesisToStrategicInput,
  recommendationToStrategicInput,
  buildCrossModuleStrategicContext,
  findConflictingStrategicEntries,
} from "./integrations/strategic-memory-cross-module";

export {
  playbookToStrategicInput,
  buildPlaybookStrategicInputs,
  findStrategicPlaybookCandidates,
  detectObsoleteStrategicPlaybooks,
} from "./integrations/strategic-memory-playbooks";

export {
  buildStrategicCopilotHint,
  buildStrategicCopilotPromptContext,
  formatStrategicContextForPrompt,
  getStrategicToneModifier,
} from "./integrations/strategic-memory-copilot";

export {
  buildStrategicTenantProfile,
  getTenantStrategicMaturityLabel,
  isStrategicProfileMature,
  getTenantConfidenceMultiplier,
  shouldEscalateToExecutive,
} from "./integrations/strategic-memory-tenant-profile";

export {
  agentOutcomeToStrategicInput,
  buildStrategicInputsFromAgentLearning,
  strategicEntryToLearningFeedback,
  buildLearningFeedbackFromStrategic,
} from "./integrations/strategic-memory-agent-learning";

export {
  buildStrategicComplianceReport,
  evaluateStrategicComplianceGate,
  filterCompliantStrategicEntries,
  getComplianceStrategicSummary,
} from "./integrations/strategic-memory-compliance";

export {
  auditStrategicMemoryCreated,
  auditStrategicMemoryUpdated,
  auditStrategicMemoryArchived,
  auditStrategicRelationCreated,
  auditStrategicGuardrailViolation,
  auditStrategicEngineRun,
  buildStrategicAuditLog,
} from "./integrations/strategic-memory-audit";
export type { StrategicAuditEventType, StrategicAuditEvent } from "./integrations/strategic-memory-audit";
