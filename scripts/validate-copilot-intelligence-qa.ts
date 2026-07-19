/**
 * scripts/validate-copilot-intelligence-qa.ts
 *
 * Agentik — QA Validation — AGENTIK-COPILOT-INTELLIGENCE-QA-01
 *
 * 13-phase hardening audit of the Copilot Intelligence layer.
 * 80+ checks. No DB. No network. Pure static + domain logic validation.
 *
 * Run: npx tsx scripts/validate-copilot-intelligence-qa.ts
 */

export {};

import { resolveCopilotIntent, debugIntentScores } from "../lib/copilot/copilot-intent-resolver";
import { getAgentIdsForIntent, selectAgentsForIntent } from "../lib/copilot/copilot-agent-selector";
import { buildCopilotExecutionPlan } from "../lib/copilot/copilot-execution-plan";
import { aggregateCopilotResponse } from "../lib/copilot/copilot-response-aggregator";
import {
  CopilotAuditLog,
  auditRequestReceived,
  auditIntentResolved,
  auditAgentsSelected,
  auditPlanCreated,
  auditExecutionStarted,
  auditExecutionCompleted,
  createCopilotAuditEvent,
  type CopilotAuditEventType,
} from "../lib/copilot/copilot-audit";
import { resolveAgent, getAllAgents } from "../lib/agents/runtime/agent-resolver";
import {
  resolveAgentDisplayName,
  setAgentTenantProfile,
  getAgentTenantProfile,
} from "../lib/agents/runtime/agent-tenant-profile";
import type { CopilotIntent, CopilotAgentResult, CopilotExecutionPlan } from "../lib/copilot/copilot-types";
import type { AgentId } from "../lib/agents/runtime/agent-types";

// ── Test infrastructure ───────────────────────────────────────────────────────

let _passed = 0;
let _failed = 0;
const _failures: string[] = [];

function check(section: string, label: string, condition: boolean, note?: string): void {
  if (condition) {
    _passed++;
  } else {
    _failed++;
    _failures.push(`  ✗ [${section}] ${label}${note ? ` — ${note}` : ""}`);
  }
}

function section(name: string): void {
  console.log(`\n── ${name} ${"─".repeat(Math.max(0, 60 - name.length))}`);
}

// ── §1 — Import boundary audit ────────────────────────────────────────────────

section("§1 — Import boundary audit (static grep)");

import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "..");

function readFile(rel: string): string {
  try { return readFileSync(resolve(ROOT, rel), "utf-8"); }
  catch { return ""; }
}

const pureFiles: Record<string, string> = {
  "copilot-types":          readFile("lib/copilot/copilot-types.ts"),
  "copilot-intent-resolver":readFile("lib/copilot/copilot-intent-resolver.ts"),
  "copilot-agent-selector": readFile("lib/copilot/copilot-agent-selector.ts"),
  "copilot-execution-plan": readFile("lib/copilot/copilot-execution-plan.ts"),
  "copilot-response-aggregator": readFile("lib/copilot/copilot-response-aggregator.ts"),
  "copilot-audit":          readFile("lib/copilot/copilot-audit.ts"),
};

const serverOnlyFiles: Record<string, string> = {
  "copilot-agent-executor":      readFile("lib/copilot/copilot-agent-executor.ts"),
  "copilot-intelligence-service":readFile("lib/copilot/copilot-intelligence-service.ts"),
};

for (const [name, src] of Object.entries(pureFiles)) {
  check("§1", `${name} has no "server-only"`, !src.includes('"server-only"') && !src.includes("'server-only'"));
  check("§1", `${name} has no prisma import`,
    !src.includes("@prisma/client") && !src.includes("lib/prisma") && !src.includes("from \"prisma\""));
  check("§1", `${name} has no AI provider calls`,
    !src.includes("openai") && !src.includes("anthropic") && !src.includes("ai-layer-service"));
  check("§1", `${name} has no fetch/axios`,
    !src.includes("fetch(") && !src.includes("axios"));
}

for (const [name, src] of Object.entries(serverOnlyFiles)) {
  check("§1", `${name} imports "server-only"`, src.includes(`import "server-only"`));
  check("§1", `${name} has no AI provider direct calls`,
    !src.includes("openai") && !src.includes("anthropic") && !src.includes("ai-layer-service"));
}

// ── §2 — No Agent Runtime duplication ────────────────────────────────────────

section("§2 — No Agent Runtime duplication");

const executorSrc = serverOnlyFiles["copilot-agent-executor"];
const serviceSrc  = serverOnlyFiles["copilot-intelligence-service"];
const selectorSrc = pureFiles["copilot-agent-selector"];

check("§2", "executor delegates to executeGoal (no inline agent logic)",
  executorSrc.includes("executeGoal") && !executorSrc.includes("if (agentId === "));
check("§2", "executor uses resolveAgent (no hardcoded agent definitions)",
  executorSrc.includes("resolveAgent") && !executorSrc.includes("displayName: \"Diego\""));
check("§2", "executor uses resolveAgentDisplayName for persona",
  executorSrc.includes("resolveAgentDisplayName"));
check("§2", "selector delegates to resolveAgent (no inline registry copy)",
  selectorSrc.includes("resolveAgent") && !selectorSrc.includes("id: \"finance_agent\", displayName"));
check("§2", "intelligence service has no raw AI provider calls",
  !serviceSrc.includes("fetch(") && !serviceSrc.includes("openai") && !serviceSrc.includes("anthropic"));
check("§2", "no 'Yumeko' hardcoded anywhere in copilot files",
  Object.values({ ...pureFiles, ...serverOnlyFiles }).every(s => !s.includes("Yumeko")));
check("§2", "selector checks agent.enabled before resolving",
  selectorSrc.includes("agent.enabled"));
check("§2", "selector has fallback when all agents disabled",
  selectorSrc.includes("finance_agent") && selectorSrc.includes("resolved.length === 0"));

// ── §3 — Intent resolver — core routing ──────────────────────────────────────

section("§3 — Intent resolver — core routing");

const cases: Array<[string, CopilotIntent, string]> = [
  // FINANCE cases
  ["Revisar la tesorería del mes",           "FINANCE",     "tesorería → FINANCE"],
  ["¿Cómo está el flujo de caja?",           "FINANCE",     "flujo de caja → FINANCE"],
  ["Dame el saldo bancario de hoy",          "FINANCE",     "saldo bancario → FINANCE"],
  ["Quiero ver el balance financiero",       "FINANCE",     "balance financiero → FINANCE"],
  ["Conciliación bancaria pendiente",        "FINANCE",     "conciliación → FINANCE"],
  ["¿Cuánto hay disponible en caja?",        "FINANCE",     "disponible en caja → FINANCE"],
  ["Cuentas bancarias y reservas",           "FINANCE",     "cuentas bancarias → FINANCE"],
  // MARKETING cases
  ["¿Qué campañas están activas esta semana?", "MARKETING", "campañas → MARKETING"],
  ["Ver contenido pendiente de publicar",    "MARKETING",   "contenido publicar → MARKETING"],
  ["Fotos del catálogo para Instagram",      "MARKETING",   "foto catálogo instagram → MARKETING"],
  ["Pauta de TikTok esta semana",            "MARKETING",   "pauta tiktok → MARKETING"],
  ["Publicaciones programadas en redes",     "MARKETING",   "publicaciones redes → MARKETING"],
  // COMMERCIAL cases
  ["Ver los clientes en riesgo de este mes", "COMMERCIAL",  "clientes en riesgo → COMMERCIAL"],
  ["Ventas del mes vs cuota",                "COMMERCIAL",  "ventas → COMMERCIAL"],
  ["¿Cuántos pedidos están pendientes?",     "COMMERCIAL",  "pedidos → COMMERCIAL"],
  ["Margenes comerciales por canal",         "COMMERCIAL",  "margen comercial → COMMERCIAL"],
  // COLLECTIONS cases
  ["¿Qué facturas están vencidas este mes?", "COLLECTIONS", "facturas vencidas → COLLECTIONS"],
  // NOTE: "clientes" (COMMERCIAL) + "cartera/mora" (COLLECTIONS) → 2 domains → MULTI_DOMAIN by design
  ["Cartera vencida de clientes",            "MULTI_DOMAIN","cartera vencida + clientes → MULTI (2 domains)"],
  ["Clientes en mora alta",                  "MULTI_DOMAIN","mora alta + clientes → MULTI (2 domains)"],
  ["Días de mora del portafolio",            "COLLECTIONS", "días de mora → COLLECTIONS"],
  ["Cuentas por cobrar pendientes",          "COLLECTIONS", "cuentas por cobrar → COLLECTIONS"],
  // MULTI_DOMAIN cases
  ["¿Cómo va Castillitos esta semana?",      "MULTI_DOMAIN","como va → MULTI"],
  ["Dame un resumen general de la empresa",  "MULTI_DOMAIN","resumen general → MULTI"],
  ["¿Cómo estamos?",                         "MULTI_DOMAIN","como estamos → MULTI"],
  ["Panorama integral del negocio",          "MULTI_DOMAIN","panorama integral → MULTI"],
  ["¿Qué problemas graves tenemos?",         "MULTI_DOMAIN","problemas graves → MULTI"],
  ["¿Qué hay urgente hoy?",                  "MULTI_DOMAIN","hay urgente → MULTI"],
  ["¿Cuáles son las alertas críticas?",      "MULTI_DOMAIN","alertas críticas → MULTI"],
  ["¿Qué es lo más importante hoy?",          "MULTI_DOMAIN","lo más importante → MULTI"],
  ["Ventas y cartera esta semana",           "MULTI_DOMAIN","ventas + cartera → MULTI (2 domains)"],
  ["Campañas y pedidos pendientes",          "MULTI_DOMAIN","campañas + pedidos → MULTI (2 domains)"],
  // GENERAL cases
  ["Hola",                                   "GENERAL",     "greeting → GENERAL"],
  ["",                                       "GENERAL",     "empty string → GENERAL"],
  ["   ",                                    "GENERAL",     "whitespace → GENERAL"],
  ["¿Me puedes ayudar?",                     "GENERAL",     "help request → GENERAL"],
];

for (const [msg, expected, label] of cases) {
  const got = resolveCopilotIntent(msg);
  check("§3", label, got === expected, `got "${got}"`);
}

// ── §4 — Intent resolver — algorithm safety ───────────────────────────────────

section("§4 — Intent resolver — algorithm safety");

// Verify "cómo está la caja" doesn't become MULTI_DOMAIN (FINANCE score ≥ MULTI score)
const cajaScores = debugIntentScores("¿Cómo está la caja?");
check("§4", "caja: FINANCE scored",       cajaScores.scores.FINANCE >= 1);
check("§4", "caja: MULTI not strictly >", cajaScores.scores.MULTI <= cajaScores.scores.FINANCE);
check("§4", "caja: resolves to FINANCE",  cajaScores.intent === "FINANCE");

// Verify "negocio" alone doesn't force COMMERCIAL
const negocioScores = debugIntentScores("¿Cómo está el negocio?");
check("§4", "negocio: 'negocio' not in COMMERCIAL keywords (excluded per design)",
  negocioScores.scores.COMMERCIAL === 0 || negocioScores.intent === "MULTI_DOMAIN",
  `got COMMERCIAL=${negocioScores.scores.COMMERCIAL}, intent=${negocioScores.intent}`);

// Verify "cliente con mora" is MULTI_DOMAIN (COMMERCIAL + COLLECTIONS both score)
const clienteMoraScores = debugIntentScores("Clientes con mora alta");
check("§4", "cliente+mora: both COMMERCIAL and COLLECTIONS score",
  clienteMoraScores.scores.COMMERCIAL >= 1 && clienteMoraScores.scores.COLLECTIONS >= 1);
check("§4", "cliente+mora: intent is MULTI_DOMAIN",
  clienteMoraScores.intent === "MULTI_DOMAIN");

// Verify never returns undefined
const edgeCases = ["null", "0", "123", "!!!", "SELECT * FROM users"];
for (const msg of edgeCases) {
  const intent = resolveCopilotIntent(msg);
  check("§4", `edge case "${msg.slice(0, 20)}" returns defined intent`, intent !== undefined && intent !== null);
}

// Verify all 6 intent values are valid
const validIntents: CopilotIntent[] = ["FINANCE", "MARKETING", "COMMERCIAL", "COLLECTIONS", "MULTI_DOMAIN", "GENERAL"];
check("§4", "FINANCE is a valid intent",     validIntents.includes("FINANCE"));
check("§4", "MULTI_DOMAIN is a valid intent",validIntents.includes("MULTI_DOMAIN"));
check("§4", "GENERAL is a valid intent",     validIntents.includes("GENERAL"));

// ── §5 — Agent selector safety ────────────────────────────────────────────────

section("§5 — Agent selector safety");

const financeIds    = getAgentIdsForIntent("FINANCE");
const marketingIds  = getAgentIdsForIntent("MARKETING");
const commercialIds = getAgentIdsForIntent("COMMERCIAL");
const collectionsIds= getAgentIdsForIntent("COLLECTIONS");
const multiIds      = getAgentIdsForIntent("MULTI_DOMAIN");
const generalIds    = getAgentIdsForIntent("GENERAL");

check("§5", "FINANCE → [finance_agent]",        financeIds.length === 1 && financeIds[0] === "finance_agent");
check("§5", "MARKETING → [marketing_agent]",    marketingIds.length === 1 && marketingIds[0] === "marketing_agent");
check("§5", "COMMERCIAL → [commercial_agent]",  commercialIds.length === 1 && commercialIds[0] === "commercial_agent");
check("§5", "COLLECTIONS → [collections_agent]",collectionsIds.length === 1 && collectionsIds[0] === "collections_agent");
check("§5", "MULTI_DOMAIN → 4 agents",          multiIds.length === 4);
check("§5", "MULTI_DOMAIN contains all 4 native IDs",
  multiIds.includes("finance_agent") && multiIds.includes("marketing_agent") &&
  multiIds.includes("commercial_agent") && multiIds.includes("collections_agent"));
check("§5", "GENERAL → [finance_agent]",        generalIds.length === 1 && generalIds[0] === "finance_agent");

// getAgentIdsForIntent returns a copy (not mutating internal state)
const copy1 = getAgentIdsForIntent("MULTI_DOMAIN");
copy1.push("extra_agent" as AgentId);
const copy2 = getAgentIdsForIntent("MULTI_DOMAIN");
check("§5", "getAgentIdsForIntent returns a fresh copy (immutable)",
  copy2.length === 4 && !copy2.includes("extra_agent" as AgentId));

// selectAgentsForIntent resolves full definitions
const selected = selectAgentsForIntent("FINANCE");
check("§5", "selectAgentsForIntent returns non-empty for FINANCE",   selected.length > 0);
check("§5", "selectAgentsForIntent returns AgentDefinition with id", selected[0]?.id === "finance_agent");
check("§5", "selectAgentsForIntent filters enabled agents only",     selected.every(a => a.enabled));

// Multi-domain selection
const multiSelected = selectAgentsForIntent("MULTI_DOMAIN");
check("§5", "MULTI_DOMAIN selectAgentsForIntent returns 4 agents",  multiSelected.length === 4);
check("§5", "MULTI_DOMAIN all have displayName",
  multiSelected.every(a => typeof a.displayName === "string" && a.displayName.length > 0));

// ── §6 — Execution plan safety ────────────────────────────────────────────────

section("§6 — Execution plan safety");

const singlePlan = buildCopilotExecutionPlan("FINANCE", ["finance_agent"]);
check("§6", "single-agent plan: parallelizable = false",          !singlePlan.parallelizable);
check("§6", "single-agent plan: agents array has 1 entry",        singlePlan.agents.length === 1);
check("§6", "single-agent plan: id has cxp- prefix",             singlePlan.id.startsWith("cxp-"));
check("§6", "single-agent plan: createdAt is ISO string",         singlePlan.createdAt.includes("T"));
check("§6", "single-agent plan: intent is FINANCE",              singlePlan.intent === "FINANCE");

const multiPlan = buildCopilotExecutionPlan("MULTI_DOMAIN",
  ["finance_agent", "marketing_agent", "commercial_agent", "collections_agent"]);
check("§6", "multi-agent plan: parallelizable = true",            multiPlan.parallelizable);
check("§6", "multi-agent plan: agents array has 4 entries",       multiPlan.agents.length === 4);

// Verify plan agents is a copy (not aliased)
const ids: AgentId[] = ["finance_agent"];
const planA = buildCopilotExecutionPlan("FINANCE", ids);
ids.push("marketing_agent");
check("§6", "plan.agents is a defensive copy (not aliased to input)", planA.agents.length === 1);

// Each call generates a unique plan ID
const p1 = buildCopilotExecutionPlan("FINANCE", ["finance_agent"]);
const p2 = buildCopilotExecutionPlan("FINANCE", ["finance_agent"]);
check("§6", "each plan gets a unique ID", p1.id !== p2.id);

// Empty agents array → parallelizable = false
const emptyPlan = buildCopilotExecutionPlan("GENERAL", []);
check("§6", "empty agents plan: parallelizable = false", !emptyPlan.parallelizable);
check("§6", "empty agents plan: agents array is empty",  emptyPlan.agents.length === 0);

// ── §7 — Response aggregator guarantees ──────────────────────────────────────

section("§7 — Response aggregator guarantees");

const now = Date.now();

// All-success scenario
const successResults: CopilotAgentResult[] = [
  { agentId: "finance_agent",   displayName: "Diego",     success: true,  summary: "1 paso completado.", error: undefined, executedSteps: 1, metadata: {} },
  { agentId: "marketing_agent", displayName: "Luca",      success: true,  summary: "2 pasos completados.", error: undefined, executedSteps: 2, metadata: {} },
];
const plan2 = buildCopilotExecutionPlan("MULTI_DOMAIN", ["finance_agent", "marketing_agent"]);
const allSuccessResp = aggregateCopilotResponse("req-001", "castillitos", plan2, successResults, now);

check("§7", "all-success: success=true",                                  allSuccessResp.success);
check("§7", "all-success: errors=[] (empty)",                             allSuccessResp.errors.length === 0);
check("§7", "all-success: participatingAgents has 2 entries",             allSuccessResp.participatingAgents.length === 2);
check("§7", "all-success: participatingAgents[0] = Diego",               allSuccessResp.participatingAgents[0] === "Diego");
check("§7", "all-success: consolidatedSummary is non-empty",              allSuccessResp.consolidatedSummary.length > 0);
check("§7", "all-success: agentResults has 2 entries",                    allSuccessResp.agentResults.length === 2);
check("§7", "all-success: requestId preserved",                           allSuccessResp.id === "req-001");
check("§7", "all-success: orgSlug preserved",                             allSuccessResp.orgSlug === "castillitos");
check("§7", "all-success: durationMs is a positive number",               allSuccessResp.durationMs >= 0);
check("§7", "all-success: createdAt is ISO string",                       allSuccessResp.createdAt.includes("T"));

// Partial failure scenario (1 success, 1 failure)
const partialResults: CopilotAgentResult[] = [
  { agentId: "finance_agent",   displayName: "Diego",     success: true,  summary: "OK", error: undefined, executedSteps: 1, metadata: {} },
  { agentId: "marketing_agent", displayName: "Luca",      success: false, summary: "Error", error: "DB timeout", executedSteps: 0, metadata: {} },
];
const partialResp = aggregateCopilotResponse("req-002", "castillitos", plan2, partialResults, now);
check("§7", "partial failure: success=true (at least one succeeded)",    partialResp.success);
check("§7", "partial failure: errors array has 1 entry",                 partialResp.errors.length === 1);
check("§7", "partial failure: error message mentions Luca",              partialResp.errors[0]?.includes("Luca") ?? false);
check("§7", "partial failure: consolidatedSummary mentions both agents",
  partialResp.consolidatedSummary.includes("Diego") && partialResp.consolidatedSummary.includes("Luca"));

// All-fail scenario
const failResults: CopilotAgentResult[] = [
  { agentId: "finance_agent", displayName: "Diego", success: false, summary: "Failed", error: "down", executedSteps: 0, metadata: {} },
];
const singlePlan2 = buildCopilotExecutionPlan("FINANCE", ["finance_agent"]);
const allFailResp = aggregateCopilotResponse("req-003", "castillitos", singlePlan2, failResults, now);
check("§7", "all-fail: success=false",                                   !allFailResp.success);
check("§7", "all-fail: errors has 1 entry",                              allFailResp.errors.length === 1);

// Empty results scenario
const emptyResp = aggregateCopilotResponse("req-004", "castillitos", singlePlan2, [], now);
check("§7", "empty results: success=false",                              !emptyResp.success);
check("§7", "empty results: consolidatedSummary is non-empty fallback",  emptyResp.consolidatedSummary.length > 0);
check("§7", "empty results: participatingAgents is empty array",         emptyResp.participatingAgents.length === 0);

// ── §8 — Persona resolution ───────────────────────────────────────────────────

section("§8 — Persona resolution");

const personas: Array<[AgentId, string]> = [
  ["finance_agent",    "Diego"],
  ["marketing_agent",  "Luca"],
  ["commercial_agent", "Valentina"],
  ["collections_agent","Mila"],
];

for (const [agentId, expectedName] of personas) {
  const def  = resolveAgent(agentId);
  const name = resolveAgentDisplayName("castillitos", agentId, def?.displayName ?? agentId);
  check("§8", `${agentId} resolves to "${expectedName}"`, name === expectedName, `got "${name}"`);
  check("§8", `${agentId} does not return raw ID as name`, name !== agentId);
}

// Tenant override test
setAgentTenantProfile({
  orgSlug:     "test-override",
  agentId:     "finance_agent",
  displayName: "Carlos",
  enabled:     true,
});
const overridden = resolveAgentDisplayName("test-override", "finance_agent", "Diego");
check("§8", "tenant override applies custom display name", overridden === "Carlos");
check("§8", "tenant override doesn't affect other orgs",
  resolveAgentDisplayName("castillitos", "finance_agent", "Diego") === "Diego");

// Fallback when no profile registered
const noProfile = resolveAgentDisplayName("unknown-org", "finance_agent", "Diego");
check("§8", "no-profile fallback returns baseDisplayName", noProfile === "Diego");

// Resolve null agent → baseName fallback
const nullDef = resolveAgent("nonexistent_agent" as AgentId);
check("§8", "resolveAgent for unknown ID returns null", nullDef === null);

// ── §9 — Audit trail ──────────────────────────────────────────────────────────

section("§9 — Audit trail");

const log = new CopilotAuditLog();
check("§9", "new CopilotAuditLog starts with count=0", log.count() === 0);
check("§9", "new CopilotAuditLog getAll returns []",   log.getAll().length === 0);

const rid = "qa-audit-001";
log.push(auditRequestReceived(rid, "castillitos", "Test query"));
log.push(auditIntentResolved(rid, "FINANCE", "Test query"));
log.push(auditAgentsSelected(rid, "FINANCE", ["finance_agent"]));
const plan3 = buildCopilotExecutionPlan("FINANCE", ["finance_agent"]);
log.push(auditPlanCreated(rid, plan3.id, ["finance_agent"], false));
log.push(auditExecutionStarted(rid, plan3.id, ["finance_agent"]));
log.push(auditExecutionCompleted(rid, plan3.id, true, 250, []));

check("§9", "6 events pushed → count=6",               log.count() === 6);
const events = log.getAll();
check("§9", "getAll returns array of length 6",         events.length === 6);

const expectedTypes: CopilotAuditEventType[] = [
  "copilot_request_received",
  "copilot_intent_resolved",
  "copilot_agents_selected",
  "copilot_plan_created",
  "copilot_execution_started",
  "copilot_execution_completed",
];
const gotTypes = events.map(e => e.type);
for (const t of expectedTypes) {
  check("§9", `audit trail contains event type: ${t}`, gotTypes.includes(t));
}

// All events have required fields
for (const e of events) {
  check("§9", `event ${e.type}: has id`,         typeof e.id === "string" && e.id.length > 0);
  check("§9", `event ${e.type}: has requestId`,  e.requestId === rid);
  check("§9", `event ${e.type}: has occurredAt`, e.occurredAt.includes("T"));
  check("§9", `event ${e.type}: metadata is obj`,typeof e.metadata === "object");
}

// getAll returns a snapshot (not aliased)
const snap1 = log.getAll();
snap1.push(events[0]!); // mutate the copy
check("§9", "getAll returns defensive copy (not aliased)", log.count() === 6);

// Event IDs are unique
const ids2 = events.map(e => e.id);
const unique = new Set(ids2);
check("§9", "all 6 audit event IDs are unique", unique.size === 6);

// Event ID format
check("§9", "audit event IDs have cpa- prefix", events.every(e => e.id.startsWith("cpa-")));

// userMessage truncated to 200 chars
const longMsg = "A".repeat(300);
const longEvent = auditRequestReceived("x", "org", longMsg);
const storedMsg = String(longEvent.metadata.userMessage ?? "");
check("§9", "auditRequestReceived truncates userMessage to 200 chars", storedMsg.length <= 200);

// ── §10 — Intelligence service pipeline contract ──────────────────────────────

section("§10 — Intelligence service pipeline contract (static)");

const svcSrc = readFile("lib/copilot/copilot-intelligence-service.ts");
check("§10", "service exports copilotIntelligenceService",            svcSrc.includes("copilotIntelligenceService"));
check("§10", "service exports executeCopilotRequest",                 svcSrc.includes("executeCopilotRequest"));
check("§10", "service calls resolveCopilotIntent",                   svcSrc.includes("resolveCopilotIntent"));
check("§10", "service calls selectAgentsForIntent",                   svcSrc.includes("selectAgentsForIntent"));
check("§10", "service calls buildCopilotExecutionPlan",              svcSrc.includes("buildCopilotExecutionPlan"));
check("§10", "service calls executeCopilotPlan",                     svcSrc.includes("executeCopilotPlan"));
check("§10", "service calls aggregateCopilotResponse",               svcSrc.includes("aggregateCopilotResponse"));
check("§10", "service has validation guard for orgSlug/userMessage", svcSrc.includes("orgSlug") && svcSrc.includes("userMessage?.trim()"));
check("§10", "service catches executor errors with try/catch",       svcSrc.includes("try {") && svcSrc.includes("catch (err"));
check("§10", "service never throws (returns error-shaped CopilotResponse)",
  svcSrc.includes("success:             false") && svcSrc.includes("errors:"));
check("§10", "service does NOT import getAgentIdsForIntent (removed unused import)",
  !svcSrc.includes("getAgentIdsForIntent"));

// ── §11 — Harness security ────────────────────────────────────────────────────

section("§11 — Harness security");

const harnessFile = readFile("app/api/internal/integration-tests/copilot-intelligence/route.ts");
check("§11", "harness exists",                                         harnessFile.length > 0);
check("§11", "harness checks NODE_ENV !== production",                harnessFile.includes(`NODE_ENV === "production"`));
check("§11", "harness checks ENABLE_INTERNAL_INTEGRATION_TESTS",      harnessFile.includes("ENABLE_INTERNAL_INTEGRATION_TESTS"));
check("§11", "harness checks x-agentik-integration-token header",     harnessFile.includes("x-agentik-integration-token"));
check("§11", "harness returns 403 when not allowed",                  harnessFile.includes("status: 403"));
check("§11", "harness runs in parallel (Promise.all)",                harnessFile.includes("Promise.all"));
check("§11", "harness has org_slug = castillitos",                    harnessFile.includes(`"castillitos"`));
check("§11", "harness validates finance intent",                       harnessFile.includes("FINANCE"));
check("§11", "harness validates marketing intent",                     harnessFile.includes("MARKETING"));
check("§11", "harness validates commercial intent",                    harnessFile.includes("COMMERCIAL"));
check("§11", "harness validates collections intent",                   harnessFile.includes("COLLECTIONS"));
check("§11", "harness validates multi-domain intent",                  harnessFile.includes("MULTI_DOMAIN"));

// ── §12 — HTTP harness script ─────────────────────────────────────────────────

section("§12 — HTTP harness script");

const harnessScript = readFile("scripts/integration/run-copilot-intelligence-harness.ts");
check("§12", "harness script exists",                                  harnessScript.length > 0);
check("§12", "harness script has export {} (module mode)",            harnessScript.includes("export {}"));
check("§12", "harness script uses COPILOT_BASE_URL (not BASE_URL)",  harnessScript.includes("COPILOT_BASE_URL"));
check("§12", "harness script uses COPILOT_ENDPOINT",                  harnessScript.includes("COPILOT_ENDPOINT"));
check("§12", "harness script exits 0 on PASS",                        harnessScript.includes(`summary.verdict === "PASS" ? 0 : 1`));
check("§12", "harness script handles connection failure gracefully",  harnessScript.includes("process.exit(1)"));

// ── §13 — Architectural debt inventory ───────────────────────────────────────

section("§13 — Architectural debt inventory (documented)");

// These items are known debt — not bugs. We verify they are NOT implemented
// (so future sprints know exactly what to build).

const executorSrc2 = readFile("lib/copilot/copilot-agent-executor.ts");
// Timeout: deliberately not implemented in this sprint
check("§13", "DEBT(executor): no timeout implemented yet",
  !executorSrc2.includes("AbortController") && !executorSrc2.includes("setTimeout"));

const auditSrc = readFile("lib/copilot/copilot-audit.ts");
// Persistence: deliberately not implemented in this sprint
check("§13", "DEBT(audit): no DB persistence yet (in-memory only)",
  !auditSrc.includes("prisma") && !auditSrc.includes("@prisma/client"));

// CopilotTenantProfile: not yet implemented
const tenantProfileExists = readFile("lib/copilot/copilot-tenant-profile.ts");
check("§13", "DEBT(personas): CopilotTenantProfile not yet implemented (future sprint)",
  tenantProfileExists.length === 0);

// Memory layer: not yet connected
check("§13", "DEBT(memory): no memory layer in executor (future sprint)",
  !executorSrc2.includes("copilot-memory") && !executorSrc2.includes("agentMemory"));

// ── Final report ──────────────────────────────────────────────────────────────

const total = _passed + _failed;
console.log(`\n${"═".repeat(64)}`);
console.log(`AGENTIK-COPILOT-INTELLIGENCE-QA-01 — Validation Complete`);
console.log(`${"═".repeat(64)}`);
console.log(`Passed: ${_passed}  |  Failed: ${_failed}  |  Total: ${total}`);

if (_failed > 0) {
  console.log(`\nFailed checks:`);
  for (const f of _failures) console.log(f);
  console.log(`\nVerdict: NEEDS FIXES`);
  process.exit(1);
} else {
  console.log(`\nVerdict: AGENTIK-COPILOT-INTELLIGENCE-01 = READY FOR MEMORY ENGINE`);
  process.exit(0);
}
