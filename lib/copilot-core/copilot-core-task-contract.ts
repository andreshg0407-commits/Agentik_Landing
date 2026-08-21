/**
 * lib/copilot-core/copilot-core-task-contract.ts
 *
 * Copilot Core — Task Suggestion Contract
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C
 *
 * Pure types. No Prisma, no runtime, no side effects.
 * Zero integration with task system.
 * Zero listTasks(), zero API, zero scheduler, zero executor,
 * zero Prisma writes, zero Prisma reads.
 *
 * This type exists solely as a future contract.
 */

/**
 * A copilot task suggestion. NOT persisted, NOT executed.
 * suggestedOnly is a compile-time true literal — not a runtime toggle.
 */
export interface CopilotTaskSuggestion {
  readonly suggestedOnly: true;
  readonly title: string;
  readonly description: string;
  readonly capabilityId: string;
}
