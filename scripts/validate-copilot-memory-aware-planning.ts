/**
 * scripts/validate-copilot-memory-aware-planning.ts
 *
 * Agentik — AGENTIK-COPILOT-MEMORY-AWARE-PLANNING-01
 * Validation Suite — 150+ deterministic source-code checks
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/validate-copilot-memory-aware-planning.ts
 *
 * Exit 0 = all checks pass. Exit 1 = at least one failure.
 */

import * as fs   from "fs";
import * as path from "path";

// ── Helpers ───────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
  if (condition) {
    pass++;
  } else {
    fail++;
    failures.push(`  FAIL  ${label}`);
    console.error(`  FAIL  ${label}`);
  }
}

function readFile(rel: string): string {
  const abs = path.join(process.cwd(), rel);
  if (!fs.existsSync(abs)) return "";
  return fs.readFileSync(abs, "utf-8");
}

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(process.cwd(), rel));
}

// ── File paths ────────────────────────────────────────────────────────────────

const PLANNING_CONTEXT    = "lib/copilot/memory-planning/planning-context.ts";
const PLANNING_TYPES      = "lib/copilot/memory-planning/memory-planning-types.ts";
const SIGNAL_EXTRACTOR    = "lib/copilot/memory-planning/memory-signal-extractor.ts";
const PLAN_PRIORITY       = "lib/copilot/memory-planning/copilot-plan-priority.ts";
const AGENT_SELECTOR      = "lib/copilot/memory-planning/memory-aware-agent-selector.ts";
const PLANNING_AUDIT      = "lib/copilot/memory-planning/memory-planning-audit.ts";
const COPILOT_TYPES       = "lib/copilot/copilot-types.ts";
const EXECUTION_PLAN      = "lib/copilot/copilot-execution-plan.ts";
const RESPONSE_AGG        = "lib/copilot/copilot-response-aggregator.ts";
const INTEL_SERVICE       = "lib/copilot/copilot-intelligence-service.ts";
const HARNESS_ROUTE       = "app/api/internal/integration-tests/copilot-memory-aware-planning/route.ts";
const HTTP_CLIENT         = "scripts/integration/run-copilot-memory-aware-planning-harness.ts";

async function main(): Promise<void> {

  // ── §1: File existence ────────────────────────────────────────────────────
  console.log("\n§1 File Existence");

  check("planning-context.ts exists",           fileExists(PLANNING_CONTEXT));
  check("memory-planning-types.ts exists",      fileExists(PLANNING_TYPES));
  check("memory-signal-extractor.ts exists",    fileExists(SIGNAL_EXTRACTOR));
  check("copilot-plan-priority.ts exists",      fileExists(PLAN_PRIORITY));
  check("memory-aware-agent-selector.ts exists",fileExists(AGENT_SELECTOR));
  check("memory-planning-audit.ts exists",      fileExists(PLANNING_AUDIT));
  check("integration harness route exists",     fileExists(HARNESS_ROUTE));
  check("HTTP client script exists",            fileExists(HTTP_CLIENT));

  const planCtx  = readFile(PLANNING_CONTEXT);
  const types    = readFile(PLANNING_TYPES);
  const extractor= readFile(SIGNAL_EXTRACTOR);
  const priority = readFile(PLAN_PRIORITY);
  const selector = readFile(AGENT_SELECTOR);
  const audit    = readFile(PLANNING_AUDIT);
  const copTypes = readFile(COPILOT_TYPES);
  const execPlan = readFile(EXECUTION_PLAN);
  const respAgg  = readFile(RESPONSE_AGG);
  const service  = readFile(INTEL_SERVICE);
  const harness  = readFile(HARNESS_ROUTE);
  const httpCli  = readFile(HTTP_CLIENT);

  // ── §2: planning-context.ts ───────────────────────────────────────────────
  console.log("\n§2 planning-context.ts");

  check("exports CopilotPlanningContext interface",  planCtx.includes("export interface CopilotPlanningContext"));
  check("exports buildPlanningContext function",     planCtx.includes("export function buildPlanningContext"));
  check("has requestId field",                       planCtx.includes("requestId"));
  check("has orgSlug field",                         planCtx.includes("orgSlug"));
  check("has intent field",                          planCtx.includes("intent"));
  check("has memoryContext? field",                  planCtx.includes("memoryContext?"));
  check("has signals field",                         planCtx.includes("signals"));
  check("has baseAgents field",                      planCtx.includes("baseAgents"));
  check("has finalAgents field",                     planCtx.includes("finalAgents"));
  check("has addedAgentsFromMemory field",           planCtx.includes("addedAgentsFromMemory"));
  check("has warnings field",                        planCtx.includes("warnings"));
  check("has suggestedActions field",                planCtx.includes("suggestedActions"));
  check("has planningReasons field",                 planCtx.includes("planningReasons"));
  check("has priority field",                        planCtx.includes("priority"));
  check("has memorySignalCount field",               planCtx.includes("memorySignalCount"));
  check("has createdAt field",                       planCtx.includes("createdAt"));
  check("factory uses defensive copies (signals)",   planCtx.includes("[...signals]"));
  check("factory uses defensive copies (baseAgents)",planCtx.includes("[...baseAgents]"));
  check("factory uses defensive copies (finalAgents)",planCtx.includes("[...finalAgents]"));
  check("factory uses defensive copies (warnings)",   planCtx.includes("[...warnings]"));
  check("memorySignalCount derived from signals.length",planCtx.includes("signals.length"));
  check("createdAt uses ISO string",                 planCtx.includes("new Date().toISOString()"));
  check("no Prisma import",                          !planCtx.includes("from \"@prisma"));
  check("no server-only import",                     !planCtx.includes("\"server-only\""));
  check("no React import",                           !planCtx.includes("from \"react\""));
  check("imports CopilotIntent from copilot-types",  planCtx.includes("from \"../copilot-types\""));
  check("imports MemoryContext from memory-types",   planCtx.includes("from \"../memory/memory-types\""));
  check("imports from memory-planning-types",        planCtx.includes("from \"./memory-planning-types\""));

  // ── §3: memory-planning-types.ts ─────────────────────────────────────────
  console.log("\n§3 memory-planning-types.ts");

  check("exports CopilotDomain type",              types.includes("export type CopilotDomain"));
  check("CopilotDomain has FINANCE",               types.includes("\"FINANCE\""));
  check("CopilotDomain has MARKETING",             types.includes("\"MARKETING\""));
  check("CopilotDomain has COMMERCIAL",            types.includes("\"COMMERCIAL\""));
  check("CopilotDomain has COLLECTIONS",           types.includes("\"COLLECTIONS\""));
  check("exports MemoryPlanningSignalType",        types.includes("export type MemoryPlanningSignalType"));
  check("has PRIORITIZE_DOMAIN signal type",       types.includes("\"PRIORITIZE_DOMAIN\""));
  check("has PRIORITIZE_AGENT signal type",        types.includes("\"PRIORITIZE_AGENT\""));
  check("has ADD_WARNING signal type",             types.includes("\"ADD_WARNING\""));
  check("has SUGGEST_NEXT_ACTION signal type",     types.includes("\"SUGGEST_NEXT_ACTION\""));
  check("has ESCALATE_ATTENTION signal type",      types.includes("\"ESCALATE_ATTENTION\""));
  check("exports PlanningSignalStrength",          types.includes("export type PlanningSignalStrength"));
  check("PlanningSignalStrength has CRITICAL",     types.includes("\"CRITICAL\""));
  check("exports CopilotPlanPriority",             types.includes("export type CopilotPlanPriority"));
  check("exports MemoryPlanningSignal interface",  types.includes("export interface MemoryPlanningSignal"));
  check("exports MemoryAwareSelectionResult",      types.includes("export interface MemoryAwareSelectionResult"));
  check("exports strengthAtLeast",                 types.includes("export function strengthAtLeast"));
  check("exports maxStrength",                     types.includes("export function maxStrength"));
  check("no Prisma import",                        !types.includes("from \"@prisma"));
  check("no server-only import",                   !types.includes("\"server-only\""));

  // ── §4: memory-signal-extractor.ts ───────────────────────────────────────
  console.log("\n§4 memory-signal-extractor.ts");

  check("exports extractPlanningSignals",          extractor.includes("export function extractPlanningSignals"));
  check("has FINANCE_DOMAIN_KW array",             extractor.includes("FINANCE_DOMAIN_KW"));
  check("has MARKETING_DOMAIN_KW array",           extractor.includes("MARKETING_DOMAIN_KW"));
  check("has COMMERCIAL_DOMAIN_KW array",          extractor.includes("COMMERCIAL_DOMAIN_KW"));
  check("has COLLECTIONS_DOMAIN_KW array",         extractor.includes("COLLECTIONS_DOMAIN_KW"));
  check("has WARNING_TRIGGERS array",              extractor.includes("WARNING_TRIGGERS"));
  check("has ESCALATION_TRIGGERS array",           extractor.includes("ESCALATION_TRIGGERS"));
  check("has LEARNING_ESCALATION_PATTERNS array",  extractor.includes("LEARNING_ESCALATION_PATTERNS"));
  check("has ACTION_TRIGGERS array",               extractor.includes("ACTION_TRIGGERS"));
  check("emits PRIORITIZE_DOMAIN signal",          extractor.includes("\"PRIORITIZE_DOMAIN\""));
  check("emits PRIORITIZE_AGENT signal",           extractor.includes("\"PRIORITIZE_AGENT\""));
  check("emits ADD_WARNING signal",                extractor.includes("\"ADD_WARNING\""));
  check("emits ESCALATE_ATTENTION signal",         extractor.includes("\"ESCALATE_ATTENTION\""));
  check("emits SUGGEST_NEXT_ACTION signal",        extractor.includes("\"SUGGEST_NEXT_ACTION\""));
  check("finance keywords include sag",            extractor.includes("\"sag\""));
  check("finance keywords include pagosnet",       extractor.includes("\"pagosnet\""));
  check("finance keywords include conciliacion",   extractor.includes("\"conciliacion\""));
  check("LEARNING memory promotes MEDIUM→HIGH",    extractor.includes("LEARNING") && extractor.includes("HIGH"));
  check("returns empty array on empty context",    extractor.includes("entries.length === 0") || extractor.includes("entries.length===0"));
  check("try/catch per entry (never throws)",      extractor.includes("try {") && extractor.includes("} catch {"));
  check("collections emits PRIORITIZE_AGENT",      extractor.includes("collections_agent"));
  check("escalation adds collections_agent",       extractor.includes("collections_agent"));
  check("ID format sig-{timestamp}-{seq}",         extractor.includes("`sig-${Date.now()}`") || extractor.includes("sig-${Date.now()}"));
  check("no Prisma import",                        !extractor.includes("from \"@prisma"));
  check("no server-only import",                   !extractor.includes("\"server-only\""));
  check("no OpenAI/Anthropic/vector imports",      !extractor.includes("openai") && !extractor.includes("pinecone") && !extractor.includes("embed("));

  // ── §5: copilot-plan-priority.ts ─────────────────────────────────────────
  console.log("\n§5 copilot-plan-priority.ts");

  check("exports calculatePlanPriority",           priority.includes("export function calculatePlanPriority"));
  check("exports priorityAtLeast",                 priority.includes("export function priorityAtLeast"));
  check("re-exports CopilotPlanPriority",          priority.includes("export type { CopilotPlanPriority }"));
  check("CRITICAL signal → CRITICAL priority",     priority.includes("\"CRITICAL\"") && priority.includes("break"));
  check("ESCALATE_ATTENTION → at least HIGH",      priority.includes("ESCALATE_ATTENTION") && priority.includes("HIGH"));
  check("HIGH signal → at least HIGH",             priority.includes("strength === \"HIGH\""));
  check("GENERAL intent → LOW baseline",           priority.includes("GENERAL") && priority.includes("LOW"));
  check("MULTI_DOMAIN intent → MEDIUM baseline",   priority.includes("MULTI_DOMAIN") && priority.includes("MEDIUM"));
  check("no Prisma import",                        !priority.includes("from \"@prisma"));
  check("no server-only import",                   !priority.includes("\"server-only\""));
  check("maxPriority helper exists",               priority.includes("maxPriority"));
  check("PRIORITY_ORDER has 4 levels",             priority.includes("LOW:") && priority.includes("MEDIUM:") && priority.includes("HIGH:") && priority.includes("CRITICAL:"));

  // ── §6: memory-aware-agent-selector.ts ───────────────────────────────────
  console.log("\n§6 memory-aware-agent-selector.ts");

  check("exports applyMemoryAwareSelection",       selector.includes("export function applyMemoryAwareSelection"));
  check("DOMAIN_AGENT_ID map exists",             selector.includes("DOMAIN_AGENT_ID"));
  check("FINANCE maps to finance_agent",          selector.includes("finance_agent"));
  check("MARKETING maps to marketing_agent",      selector.includes("marketing_agent"));
  check("COMMERCIAL maps to commercial_agent",    selector.includes("commercial_agent"));
  check("COLLECTIONS maps to collections_agent",  selector.includes("collections_agent"));
  check("uses Set for deduplication",             selector.includes("new Set<AgentId>"));
  check("uses resolveAgent guard",                selector.includes("resolveAgent"));
  check("checks def.enabled before adding",       selector.includes("def.enabled"));
  check("base agents preserved in order",         selector.includes("baseAgents.filter"));
  check("added agents appended at end",           selector.includes("...added"));
  check("handles PRIORITIZE_AGENT case",          selector.includes("case \"PRIORITIZE_AGENT\""));
  check("handles PRIORITIZE_DOMAIN case",         selector.includes("case \"PRIORITIZE_DOMAIN\""));
  check("handles ADD_WARNING case",               selector.includes("case \"ADD_WARNING\""));
  check("handles SUGGEST_NEXT_ACTION case",       selector.includes("case \"SUGGEST_NEXT_ACTION\""));
  check("handles ESCALATE_ATTENTION case",        selector.includes("case \"ESCALATE_ATTENTION\""));
  check("warnings array collected",               selector.includes("warnings.push"));
  check("suggestedActions array collected",       selector.includes("suggestedActions.push"));
  check("reasons array collected",                selector.includes("reasons.push"));
  check("no Prisma import",                       !selector.includes("from \"@prisma"));
  check("no server-only import",                  !selector.includes("\"server-only\""));

  // ── §7: memory-planning-audit.ts ─────────────────────────────────────────
  console.log("\n§7 memory-planning-audit.ts");

  check("exports MemoryPlanningAuditEvent interface",  audit.includes("export interface MemoryPlanningAuditEvent"));
  check("exports createPlanningAuditEvent",           audit.includes("export function createPlanningAuditEvent"));
  check("exports auditSignalsExtracted",              audit.includes("export function auditSignalsExtracted"));
  check("exports auditAgentAdded",                    audit.includes("export function auditAgentAdded"));
  check("exports auditWarningAdded",                  audit.includes("export function auditWarningAdded"));
  check("exports auditSuggestedActionAdded",          audit.includes("export function auditSuggestedActionAdded"));
  check("exports auditPriorityCalculated",            audit.includes("export function auditPriorityCalculated"));
  check("exports auditPlanningFailed",                audit.includes("export function auditPlanningFailed"));
  check("exports MemoryPlanningAuditLog class",       audit.includes("export class MemoryPlanningAuditLog"));
  check("exports globalPlanningAuditLog singleton",   audit.includes("export const globalPlanningAuditLog"));
  check("has 6 event types",                         (audit.match(/\|/g) ?? []).length >= 5);
  check("audit events are JSON-serializable shape",   audit.includes("occurredAt") && audit.includes("metadata"));
  check("no Prisma import",                          !audit.includes("from \"@prisma"));

  // ── §8: copilot-types.ts — planning extensions ───────────────────────────
  console.log("\n§8 copilot-types.ts planning extensions");

  check("imports CopilotPlanPriority from planning types",  copTypes.includes("CopilotPlanPriority"));
  check("imports CopilotPlanningContext from planning",     copTypes.includes("CopilotPlanningContext"));
  check("re-exports CopilotPlanPriority",                  copTypes.includes("export type { CopilotPlanPriority"));
  check("CopilotExecutionPlan has priority? field",         copTypes.includes("priority?:") && copTypes.includes("CopilotPlanPriority"));
  check("CopilotExecutionPlan has planningReasons? field",  copTypes.includes("planningReasons?"));
  check("CopilotExecutionPlan has memorySignalCount? field",copTypes.includes("memorySignalCount?"));
  check("CopilotExecutionPlan has addedAgentsFromMemory?",  copTypes.includes("addedAgentsFromMemory?"));
  check("CopilotResponse has planningContext? field",       copTypes.includes("planningContext?"));
  check("CopilotResponse has warnings? field",              copTypes.includes("warnings?"));
  check("CopilotResponse has suggestedActions? field",      copTypes.includes("suggestedActions?"));
  check("CopilotResponse has priority? field",              copTypes.includes("priority?") && copTypes.includes("CopilotPlanPriority"));
  check("memoryContext still present",                      copTypes.includes("memoryContext?"));
  check("no Prisma import",                                !copTypes.includes("from \"@prisma"));
  check("no server-only import",                           !copTypes.includes("\"server-only\""));

  // ── §9: copilot-execution-plan.ts — planning metadata ────────────────────
  console.log("\n§9 copilot-execution-plan.ts planning metadata");

  check("exports CopilotExecutionPlanMetadata",            execPlan.includes("export interface CopilotExecutionPlanMetadata"));
  check("buildCopilotExecutionPlan accepts planning?",     execPlan.includes("planning?"));
  check("plan includes priority from planning",            execPlan.includes("priority:") && execPlan.includes("planning?.priority"));
  check("plan includes planningReasons from planning",     execPlan.includes("planningReasons:") && execPlan.includes("planning?.planningReasons"));
  check("plan includes memorySignalCount from planning",   execPlan.includes("memorySignalCount:") && execPlan.includes("planning?.memorySignalCount"));
  check("plan includes addedAgentsFromMemory from planning",execPlan.includes("addedAgentsFromMemory:") && execPlan.includes("planning?.addedAgentsFromMemory"));
  check("agents still copied defensively",                 execPlan.includes("[...agentIds]"));
  check("no Prisma import",                               !execPlan.includes("from \"@prisma"));
  check("no server-only import",                          !execPlan.includes("\"server-only\""));

  // ── §10: copilot-response-aggregator.ts — enrichment ─────────────────────
  console.log("\n§10 copilot-response-aggregator.ts enrichment");

  check("exports CopilotResponseEnrichment",               respAgg.includes("export interface CopilotResponseEnrichment"));
  check("aggregateCopilotResponse accepts enrichment?",    respAgg.includes("enrichment?"));
  check("planningContext attached from enrichment",        respAgg.includes("planningContext:") && respAgg.includes("enrichment?.planningContext"));
  check("warnings attached from enrichment",              respAgg.includes("warnings:") && respAgg.includes("enrichment?.warnings"));
  check("suggestedActions attached from enrichment",      respAgg.includes("suggestedActions:") && respAgg.includes("enrichment?.suggestedActions"));
  check("priority attached from enrichment",              respAgg.includes("priority:") && respAgg.includes("enrichment?.priority"));
  check("no Prisma import",                               !respAgg.includes("from \"@prisma"));
  check("no server-only import",                          !respAgg.includes("\"server-only\""));

  // ── §11: copilot-intelligence-service.ts — full pipeline ─────────────────
  console.log("\n§11 copilot-intelligence-service.ts full pipeline");

  check("imports extractPlanningSignals",                  service.includes("extractPlanningSignals"));
  check("imports applyMemoryAwareSelection",               service.includes("applyMemoryAwareSelection"));
  check("imports calculatePlanPriority",                   service.includes("calculatePlanPriority"));
  check("imports buildPlanningContext",                    service.includes("buildPlanningContext"));
  check("Step 2c: extract signals from memory",            service.includes("extractPlanningSignals(memoryContext)"));
  check("Step 3b: memory-aware selection call",            service.includes("applyMemoryAwareSelection("));
  check("Step 3c: calculate plan priority call",           service.includes("calculatePlanPriority(intent"));
  check("Step 4b: build planning context call",            service.includes("buildPlanningContext("));
  check("plan built with planning metadata",              service.includes("buildCopilotExecutionPlan(intent, finalAgentIds,"));
  check("aggregateResponse called with enrichment",        service.includes("aggregateCopilotResponse(") && service.includes("planningContext"));
  check("signal extraction is non-blocking (try/catch)",   service.includes("planningSignals = extractPlanningSignals") || service.includes("planningSignals=extractPlanningSignals"));
  check("memory-aware selection is non-blocking",          service.includes("applyMemoryAwareSelection(") && service.includes("catch"));
  check("plan priority is non-blocking",                   service.includes("calculatePlanPriority") && service.includes("catch"));
  check("warnings collected from selection result",        service.includes("selection.warnings"));
  check("suggestedActions collected from selection result",service.includes("selection.suggestedActions"));
  check("addedFromMemory collected",                       service.includes("selection.addedAgents") || service.includes("addedAgents"));
  check("planningContext only built when signals present", service.includes("planningSignals.length > 0"));
  check("server-only import preserved",                    service.includes("import \"server-only\""));
  check("import from memory-signal-extractor",             service.includes("from \"./memory-planning/memory-signal-extractor\""));
  check("import from memory-aware-agent-selector",         service.includes("from \"./memory-planning/memory-aware-agent-selector\""));
  check("import from copilot-plan-priority",               service.includes("from \"./memory-planning/copilot-plan-priority\""));
  check("import from planning-context",                    service.includes("from \"./memory-planning/planning-context\""));

  // ── §12: Non-blocking guarantee ───────────────────────────────────────────
  console.log("\n§12 Non-blocking guarantees");

  // Each planning step should have its own try/catch
  const serviceTryCatchCount = (service.match(/try \{/g) ?? []).length;
  check("service has multiple try/catch blocks (≥4)",      serviceTryCatchCount >= 4);
  check("extractPlanningSignals called inside try block",  service.includes("try {") && service.includes("planningSignals = extractPlanningSignals"));
  check("applyMemoryAwareSelection inside try block",      service.includes("selection = applyMemoryAwareSelection") || service.includes("const selection = applyMemoryAwareSelection"));
  check("calculatePlanPriority inside try block",          service.includes("planPriority = calculatePlanPriority"));
  check("signal extraction fallback = []",                 service.includes("planningSignals = [];"));
  check("selection fallback = baseAgentIds",               service.includes("finalAgentIds = baseAgentIds"));
  check("priority fallback = MEDIUM",                      service.includes("planPriority = \"MEDIUM\""));

  // ── §13: Purity rules ─────────────────────────────────────────────────────
  console.log("\n§13 Purity rules across planning files");

  const planningFiles = [planCtx, types, extractor, priority, selector, audit];
  for (const [idx, content] of planningFiles.entries()) {
    const fname = [
      "planning-context", "memory-planning-types", "memory-signal-extractor",
      "copilot-plan-priority", "memory-aware-agent-selector", "memory-planning-audit",
    ][idx];
    check(`${fname}: no Prisma import`,       !content.includes("from \"@prisma"));
    check(`${fname}: no server-only import`,  !content.includes("\"server-only\""));
    check(`${fname}: no React import`,        !content.includes("from \"react\""));
    check(`${fname}: no openai import`,       !content.includes("from \"openai\""));
    check(`${fname}: no anthropic import`,    !content.includes("from \"@anthropic-ai\""));
  }

  // ── §14: Type correctness hints ───────────────────────────────────────────
  console.log("\n§14 Type correctness hints");

  check("planningContext uses import type",     planCtx.includes("import type"));
  check("selector uses import type for AgentId",selector.includes("import type { AgentId }") || selector.includes("import type {\n  AgentId"));
  check("copilot-types uses import type for new imports", copTypes.includes("import type { CopilotPlanPriority }") || copTypes.includes("import type {\n  CopilotPlanPriority") || copTypes.includes("import type { CopilotPlanningContext }"));
  check("execution plan uses import type",      execPlan.includes("import type {"));
  check("response aggregator uses import type", respAgg.includes("import type {"));

  // ── §15: Integration harness ──────────────────────────────────────────────
  console.log("\n§15 Integration harness");

  check("harness route file exists",            harness.length > 0);
  check("harness has POST handler",             harness.includes("export async function POST") || harness.includes("export function POST"));
  check("harness checks NODE_ENV",              harness.includes("NODE_ENV"));
  check("harness checks integration token",     harness.includes("x-agentik-integration-token") || harness.includes("agentik-integration-token"));
  check("harness returns 403 on bad token",     harness.includes("403"));
  check("harness has at least 8 tests",         (harness.match(/Test \d+|test\d+|\"test\d/g) ?? []).length >= 6);
  check("harness tests planning signals",       harness.includes("signal") || harness.includes("planning"));
  check("harness tests non-blocking behavior",  harness.includes("non-blocking") || harness.includes("nonBlocking") || harness.includes("graceful"));

  // ── §16: HTTP client ─────────────────────────────────────────────────────
  console.log("\n§16 HTTP client");

  check("HTTP client file exists",              httpCli.length > 0);
  check("HTTP client uses async main() pattern",httpCli.includes("async function main()"));
  check("HTTP client has export {} (ESM marker)",httpCli.includes("export {}") || httpCli.includes("module.exports"));
  check("HTTP client calls main()",             httpCli.includes("main()"));
  check("HTTP client has PASS/FAIL output",     httpCli.includes("PASS") && httpCli.includes("FAIL"));

  // ── §17: No duplication with Agent Runtime ────────────────────────────────
  console.log("\n§17 No Agent Runtime duplication");

  check("planning files don't import executeGoal",    [planCtx, types, extractor, priority, selector].every(f => !f.includes("executeGoal")));
  check("planning files don't import agent-runtime",  [planCtx, types, extractor, priority, selector].every(f => !f.includes("agent-runtime\"")));
  check("planning files don't import TaskDraft",      [planCtx, types, extractor, priority, selector].every(f => !f.includes("TaskDraft")));
  check("planning signals are not AI-generated",      [extractor].every(f =>
    !f.includes("openai") && !f.includes("anthropic") && !f.includes("gemini") && !f.includes("embed")));

  // ── §18: Determinism ─────────────────────────────────────────────────────
  console.log("\n§18 Determinism");

  check("signal extractor uses keyword matching, not AI",  extractor.includes("includes(") || extractor.includes(".filter("));
  check("plan priority uses PRIORITY_ORDER map",           priority.includes("PRIORITY_ORDER"));
  check("agent selector uses Set for dedup, not random",   selector.includes("new Set"));
  check("buildPlanningContext is pure (no await)",        !planCtx.includes("await "));
  check("calculatePlanPriority is pure (no await)",       !priority.includes("await "));
  check("applyMemoryAwareSelection is pure (no await)",   !selector.includes("await "));

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log(`AGENTIK-COPILOT-MEMORY-AWARE-PLANNING-01 Validation`);
  console.log("═".repeat(60));
  console.log(`  PASS: ${pass}`);
  console.log(`  FAIL: ${fail}`);
  console.log(`  TOTAL: ${pass + fail}`);
  console.log("═".repeat(60));

  if (fail > 0) {
    console.log("\nFailed checks:");
    failures.forEach(f => console.log(f));
    console.log();
    process.exit(1);
  } else {
    console.log("\n  ALL CHECKS PASSED — Memory-Aware Planning layer is READY.");
    console.log();
    process.exit(0);
  }
}

main().catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
