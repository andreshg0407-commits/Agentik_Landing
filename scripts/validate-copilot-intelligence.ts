/**
 * scripts/validate-copilot-intelligence.ts
 *
 * Agentik — Copilot Intelligence — Pure Validation Suite
 * Sprint: AGENTIK-COPILOT-INTELLIGENCE-01
 *
 * 100+ pure static checks. No DB. No server-only. No AI providers.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/validate-copilot-intelligence.ts
 */

import type { CopilotIntent }             from "@/lib/copilot/copilot-types";
import { resolveCopilotIntent, debugIntentScores } from "@/lib/copilot/copilot-intent-resolver";
import { getAgentIdsForIntent, selectAgentsForIntent } from "@/lib/copilot/copilot-agent-selector";
import { buildCopilotExecutionPlan }      from "@/lib/copilot/copilot-execution-plan";
import { aggregateCopilotResponse }       from "@/lib/copilot/copilot-response-aggregator";
import {
  createCopilotAuditEvent,
  auditRequestReceived,
  auditIntentResolved,
  auditAgentsSelected,
  auditPlanCreated,
  auditExecutionStarted,
  auditExecutionCompleted,
  CopilotAuditLog,
}                                         from "@/lib/copilot/copilot-audit";
import { resolveAgentDisplayName }        from "@/lib/agents/runtime/agent-tenant-profile";
import { resolveAgent }                   from "@/lib/agents/runtime/agent-resolver";

// ── Test infrastructure ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(label: string, condition: boolean): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(label);
    console.error(`  FAIL  ${label}`);
  }
}

function section(name: string): void {
  console.log(`\n── ${name}`);
}

// ── Section 1: CopilotIntent type coverage ────────────────────────────────────

section("1. CopilotIntent — all 6 values representable");

{
  const intents: CopilotIntent[] = ["FINANCE", "MARKETING", "COMMERCIAL", "COLLECTIONS", "MULTI_DOMAIN", "GENERAL"];
  assert("FINANCE is valid CopilotIntent", intents.includes("FINANCE"));
  assert("MARKETING is valid CopilotIntent", intents.includes("MARKETING"));
  assert("COMMERCIAL is valid CopilotIntent", intents.includes("COMMERCIAL"));
  assert("COLLECTIONS is valid CopilotIntent", intents.includes("COLLECTIONS"));
  assert("MULTI_DOMAIN is valid CopilotIntent", intents.includes("MULTI_DOMAIN"));
  assert("GENERAL is valid CopilotIntent", intents.includes("GENERAL"));
}

// ── Section 2: Intent resolver — FINANCE queries ──────────────────────────────

section("2. Intent resolver — FINANCE queries (Spanish)");

{
  const financeQueries = [
    "¿Cómo está la caja?",
    "Necesito revisar la tesorería",
    "¿Cuál es la liquidez del día?",
    "Muéstrame el flujo de caja",
    "Estado financiero del mes",
    "¿Hay diferencias en la conciliación?",
    "Revisar los bancos",
    "¿Cuánto hay en la cuenta bancaria?",
    "Presupuesto actual",
  ];

  for (const q of financeQueries) {
    const intent = resolveCopilotIntent(q);
    assert(`FINANCE: "${q.slice(0, 40)}"`, intent === "FINANCE");
  }
}

// ── Section 3: Intent resolver — MARKETING queries ────────────────────────────

section("3. Intent resolver — MARKETING queries (Spanish)");

{
  const marketingQueries = [
    "¿Qué campañas funcionan mejor?",
    "Ver el contenido pendiente de publicación",
    "¿Cuántos posts hay en redes?",
    "Estado de la pauta de marketing",
    "Catálogo de Instagram",
    "Fotos del estudio pendientes",
    "Sincronizar catálogo con Shopify",
  ];

  for (const q of marketingQueries) {
    const intent = resolveCopilotIntent(q);
    assert(`MARKETING: "${q.slice(0, 40)}"`, intent === "MARKETING");
  }
}

// ── Section 4: Intent resolver — COMMERCIAL queries ───────────────────────────

section("4. Intent resolver — COMMERCIAL queries (Spanish)");

{
  const commercialQueries = [
    "¿Qué clientes están cayendo?",
    "Ver las ventas del mes",
    "Clientes en riesgo de churn",
    "¿Cuál es el margen comercial?",
    "Pedidos pendientes de vendedores",
    "Pipeline comercial de este mes",
  ];

  for (const q of commercialQueries) {
    const intent = resolveCopilotIntent(q);
    assert(`COMMERCIAL: "${q.slice(0, 40)}"`, intent === "COMMERCIAL");
  }
}

// ── Section 5: Intent resolver — COLLECTIONS queries ─────────────────────────

section("5. Intent resolver — COLLECTIONS queries (Spanish)");

{
  const collectionsQueries = [
    "¿Qué facturas están vencidas?",
    "Estado de la cartera vencida",
    "Cobros pendientes de esta semana",
    "Cuentas por cobrar del mes",
    "Gestionar la cobranza urgente",
    // "Clientes con mora alta" → MULTI_DOMAIN (clientes=COMMERCIAL + mora=COLLECTIONS)
    // "Cartera de crédito vencido" tested below — now clean COLLECTIONS
    "Facturas de mora urgente",
    "Cartera vencida del mes",
  ];

  for (const q of collectionsQueries) {
    const intent = resolveCopilotIntent(q);
    assert(`COLLECTIONS: "${q.slice(0, 40)}"`, intent === "COLLECTIONS");
  }
}

// ── Section 6: Intent resolver — MULTI_DOMAIN queries ────────────────────────

section("6. Intent resolver — MULTI_DOMAIN queries");

{
  const multiQueries = [
    "¿Cómo va Castillitos?",
    "Dame un resumen de la empresa",
    "¿Cómo estamos hoy?",
    "Situación general del negocio",
    "Panorama general de la semana",
    "¿Cómo vamos en todo?",
    "Overview de la empresa",
    "Informe general del negocio",
    // Mixed domains (finance + commercial)
    "¿Cómo está la caja y los clientes?",
    // Mixed domains (marketing + collections)
    "Campañas activas y facturas vencidas",
    // Cross-domain: clientes (COMMERCIAL) + mora (COLLECTIONS)
    "Clientes con mora alta",
  ];

  for (const q of multiQueries) {
    const intent = resolveCopilotIntent(q);
    assert(`MULTI_DOMAIN: "${q.slice(0, 40)}"`, intent === "MULTI_DOMAIN");
  }
}

// ── Section 7: Intent resolver — edge cases ───────────────────────────────────

section("7. Intent resolver — edge cases");

{
  assert("empty string → GENERAL", resolveCopilotIntent("") === "GENERAL");
  assert("spaces only → GENERAL", resolveCopilotIntent("   ") === "GENERAL");
  assert("gibberish → GENERAL", resolveCopilotIntent("xyz abc 123") === "GENERAL");
  assert("single word 'hola' → GENERAL", resolveCopilotIntent("hola") === "GENERAL");
  assert("accented text works — tesorería", resolveCopilotIntent("¿La tesorería está bien?") === "FINANCE");
  assert("accented text works — conciliación", resolveCopilotIntent("Conciliación del día") === "FINANCE");
  assert("mixed case normalized", resolveCopilotIntent("CAJA Y TESORERÍA") === "FINANCE");
  assert("punctuation stripped", resolveCopilotIntent("¿Cómo está la caja!") === "FINANCE");
}

// ── Section 8: debugIntentScores utility ──────────────────────────────────────

section("8. debugIntentScores — debug utility");

{
  const debug = debugIntentScores("¿Cómo está la caja?");
  assert("debugIntentScores returns normalized", typeof debug.normalized === "string");
  assert("debugIntentScores returns scores object", typeof debug.scores === "object");
  assert("debugIntentScores returns intent", typeof debug.intent === "string");
  assert("FINANCE score > 0 for 'caja' query", debug.scores.FINANCE > 0);
  assert("MARKETING score = 0 for 'caja' query", debug.scores.MARKETING === 0);

  const multiDebug = debugIntentScores("¿Cómo va la empresa?");
  assert("MULTI score > 0 for company query", multiDebug.scores.MULTI > 0);
}

// ── Section 9: Agent selection — IDs per intent ───────────────────────────────

section("9. Agent selection — agent IDs per intent");

{
  const financeIds = getAgentIdsForIntent("FINANCE");
  assert("FINANCE → finance_agent", financeIds.includes("finance_agent"));
  assert("FINANCE → exactly 1 agent", financeIds.length === 1);

  const marketingIds = getAgentIdsForIntent("MARKETING");
  assert("MARKETING → marketing_agent", marketingIds.includes("marketing_agent"));
  assert("MARKETING → exactly 1 agent", marketingIds.length === 1);

  const commercialIds = getAgentIdsForIntent("COMMERCIAL");
  assert("COMMERCIAL → commercial_agent", commercialIds.includes("commercial_agent"));
  assert("COMMERCIAL → exactly 1 agent", commercialIds.length === 1);

  const collectionsIds = getAgentIdsForIntent("COLLECTIONS");
  assert("COLLECTIONS → collections_agent", collectionsIds.includes("collections_agent"));
  assert("COLLECTIONS → exactly 1 agent", collectionsIds.length === 1);

  const multiIds = getAgentIdsForIntent("MULTI_DOMAIN");
  assert("MULTI_DOMAIN includes finance_agent", multiIds.includes("finance_agent"));
  assert("MULTI_DOMAIN includes marketing_agent", multiIds.includes("marketing_agent"));
  assert("MULTI_DOMAIN includes commercial_agent", multiIds.includes("commercial_agent"));
  assert("MULTI_DOMAIN includes collections_agent", multiIds.includes("collections_agent"));
  assert("MULTI_DOMAIN has 4 agents", multiIds.length === 4);

  const generalIds = getAgentIdsForIntent("GENERAL");
  assert("GENERAL → finance_agent (default)", generalIds.includes("finance_agent"));
}

// ── Section 10: Agent selection — resolves valid definitions ──────────────────

section("10. Agent selection — resolves AgentDefinition from runtime registry");

{
  const financeAgents = selectAgentsForIntent("FINANCE");
  assert("FINANCE: returns array", Array.isArray(financeAgents));
  assert("FINANCE: non-empty", financeAgents.length > 0);
  assert("FINANCE: id is finance_agent", financeAgents[0]?.id === "finance_agent");
  assert("FINANCE: displayName is Diego", financeAgents[0]?.displayName === "Diego");
  assert("FINANCE: enabled", financeAgents[0]?.enabled === true);

  const marketingAgents = selectAgentsForIntent("MARKETING");
  assert("MARKETING: id is marketing_agent", marketingAgents[0]?.id === "marketing_agent");
  assert("MARKETING: displayName is Luca", marketingAgents[0]?.displayName === "Luca");

  const commercialAgents = selectAgentsForIntent("COMMERCIAL");
  assert("COMMERCIAL: id is commercial_agent", commercialAgents[0]?.id === "commercial_agent");
  assert("COMMERCIAL: displayName is Valentina", commercialAgents[0]?.displayName === "Valentina");

  const collectionsAgents = selectAgentsForIntent("COLLECTIONS");
  assert("COLLECTIONS: id is collections_agent", collectionsAgents[0]?.id === "collections_agent");
  assert("COLLECTIONS: displayName is Mila", collectionsAgents[0]?.displayName === "Mila");

  const multiAgents = selectAgentsForIntent("MULTI_DOMAIN");
  assert("MULTI_DOMAIN: 4 agents returned", multiAgents.length === 4);
  assert("MULTI_DOMAIN: all are enabled", multiAgents.every(a => a.enabled));
  assert("MULTI_DOMAIN: all have semantic IDs (not display names)", multiAgents.every(a => a.id.endsWith("_agent")));
}

// ── Section 11: Execution plan — structure ────────────────────────────────────

section("11. Execution plan — buildCopilotExecutionPlan");

{
  const plan = buildCopilotExecutionPlan("FINANCE", ["finance_agent"]);
  assert("plan has id", typeof plan.id === "string" && plan.id.startsWith("cxp-"));
  assert("plan.intent is FINANCE", plan.intent === "FINANCE");
  assert("plan.agents contains finance_agent", plan.agents.includes("finance_agent"));
  assert("plan.agents has 1 entry", plan.agents.length === 1);
  assert("plan.parallelizable is false for 1 agent", plan.parallelizable === false);
  assert("plan.createdAt is ISO string", !isNaN(Date.parse(plan.createdAt)));
}

// ── Section 12: Execution plan — parallelizable logic ─────────────────────────

section("12. Execution plan — parallelizable logic");

{
  const single = buildCopilotExecutionPlan("FINANCE", ["finance_agent"]);
  assert("1 agent → parallelizable=false", single.parallelizable === false);

  const dual = buildCopilotExecutionPlan("MULTI_DOMAIN", ["finance_agent", "marketing_agent"]);
  assert("2 agents → parallelizable=true", dual.parallelizable === true);

  const quad = buildCopilotExecutionPlan("MULTI_DOMAIN", ["finance_agent", "marketing_agent", "commercial_agent", "collections_agent"]);
  assert("4 agents → parallelizable=true", quad.parallelizable === true);

  const empty = buildCopilotExecutionPlan("GENERAL", []);
  assert("0 agents → parallelizable=false (empty)", empty.parallelizable === false);
}

// ── Section 13: Execution plan — uniqueness ───────────────────────────────────

section("13. Execution plan — each plan has a unique ID");

{
  const ids = new Set(Array.from({ length: 10 }, () => buildCopilotExecutionPlan("FINANCE", ["finance_agent"]).id));
  assert("10 consecutive plans all have unique IDs", ids.size === 10);
}

// ── Section 14: Response aggregation — basic structure ────────────────────────

section("14. Response aggregation — structure");

{
  const plan = buildCopilotExecutionPlan("FINANCE", ["finance_agent"]);
  const results = [
    {
      agentId:       "finance_agent",
      displayName:   "Diego",
      success:       true,
      summary:       "Diego: 2 paso(s) completado.",
      executedSteps: 2,
      metadata:      { status: "completed" },
    },
  ];

  const response = aggregateCopilotResponse("req-001", "castillitos", plan, results, Date.now() - 500);

  assert("response.id is req-001", response.id === "req-001");
  assert("response.orgSlug is castillitos", response.orgSlug === "castillitos");
  assert("response.intent is FINANCE", response.intent === "FINANCE");
  assert("response.plan is the plan", response.plan === plan);
  assert("response.agentResults has 1 entry", response.agentResults.length === 1);
  assert("response.success is true", response.success === true);
  assert("response.errors is empty", response.errors.length === 0);
  assert("response.participatingAgents contains Diego", response.participatingAgents.includes("Diego"));
  assert("response.consolidatedSummary is non-empty", response.consolidatedSummary.length > 0);
  assert("response.durationMs >= 0", response.durationMs >= 0);
  assert("response.createdAt is ISO string", !isNaN(Date.parse(response.createdAt)));
}

// ── Section 15: Response aggregation — failure handling ───────────────────────

section("15. Response aggregation — failure handling");

{
  const plan = buildCopilotExecutionPlan("FINANCE", ["finance_agent"]);
  const results = [
    {
      agentId:       "finance_agent",
      displayName:   "Diego",
      success:       false,
      summary:       "Diego: Error en ejecución",
      error:         "DB connection failed",
      executedSteps: 0,
      metadata:      { status: "failed" },
    },
  ];

  const response = aggregateCopilotResponse("req-002", "castillitos", plan, results, Date.now());

  assert("failed response: success=false", response.success === false);
  assert("failed response: errors array has entry", response.errors.length > 0);
  assert("failed response: error mentions Diego", response.errors[0]?.includes("Diego") ?? false);
  assert("failed response: consolidatedSummary is non-empty", response.consolidatedSummary.length > 0);
}

// ── Section 16: Response aggregation — partial success ────────────────────────

section("16. Response aggregation — partial success (multi-agent)");

{
  const plan = buildCopilotExecutionPlan("MULTI_DOMAIN", ["finance_agent", "marketing_agent"]);
  const results = [
    {
      agentId:       "finance_agent",
      displayName:   "Diego",
      success:       true,
      summary:       "Diego: 2 paso(s) completado.",
      executedSteps: 2,
      metadata:      {},
    },
    {
      agentId:       "marketing_agent",
      displayName:   "Luca",
      success:       false,
      summary:       "Luca: Error",
      error:         "Service unavailable",
      executedSteps: 0,
      metadata:      {},
    },
  ];

  const response = aggregateCopilotResponse("req-003", "castillitos", plan, results, Date.now());

  assert("partial: overall success=true (at least one succeeded)", response.success === true);
  assert("partial: errors has 1 entry (for Luca)", response.errors.length === 1);
  assert("partial: participatingAgents has 2 entries", response.participatingAgents.length === 2);
  assert("partial: summary mentions both agents", response.consolidatedSummary.includes("Diego") && response.consolidatedSummary.includes("Luca"));
}

// ── Section 17: Response aggregation — empty results ─────────────────────────

section("17. Response aggregation — empty results");

{
  const plan = buildCopilotExecutionPlan("GENERAL", []);
  const response = aggregateCopilotResponse("req-004", "castillitos", plan, [], Date.now());

  assert("empty: success=false", response.success === false);
  assert("empty: summary is non-empty", response.consolidatedSummary.length > 0);
  assert("empty: participatingAgents is empty", response.participatingAgents.length === 0);
}

// ── Section 18: Persona resolution ────────────────────────────────────────────

section("18. Persona resolution — resolveAgentDisplayName");

{
  // Default: no tenant override → returns AgentDefinition.displayName
  const diego    = resolveAgent("finance_agent");
  const diegos   = resolveAgentDisplayName("castillitos", "finance_agent", diego?.displayName ?? "Diego");
  assert("finance_agent resolves to Diego (default)", diegos === "Diego");

  const luca     = resolveAgent("marketing_agent");
  const lucas    = resolveAgentDisplayName("castillitos", "marketing_agent", luca?.displayName ?? "Luca");
  assert("marketing_agent resolves to Luca (default)", lucas === "Luca");

  const valentina = resolveAgent("commercial_agent");
  const valname   = resolveAgentDisplayName("castillitos", "commercial_agent", valentina?.displayName ?? "Valentina");
  assert("commercial_agent resolves to Valentina (default)", valname === "Valentina");

  const mila     = resolveAgent("collections_agent");
  const milaname = resolveAgentDisplayName("castillitos", "collections_agent", mila?.displayName ?? "Mila");
  assert("collections_agent resolves to Mila (default)", milaname === "Mila");
}

{
  // Confirm user never sees raw agent IDs
  const agentIds = ["finance_agent", "marketing_agent", "commercial_agent", "collections_agent"];
  const displayNames = agentIds.map(id => {
    const def = resolveAgent(id);
    return resolveAgentDisplayName("castillitos", id, def?.displayName ?? id);
  });
  assert("no display name equals finance_agent", !displayNames.includes("finance_agent"));
  assert("no display name equals marketing_agent", !displayNames.includes("marketing_agent"));
  assert("no display name equals commercial_agent", !displayNames.includes("commercial_agent"));
  assert("no display name equals collections_agent", !displayNames.includes("collections_agent"));
}

// ── Section 19: Audit — event shape ──────────────────────────────────────────

section("19. Audit — event shape and factory");

{
  const event = createCopilotAuditEvent("req-test", "copilot_request_received", "Test message", { foo: "bar" });
  assert("event.id starts with cpa-", event.id.startsWith("cpa-"));
  assert("event.requestId is set", event.requestId === "req-test");
  assert("event.type is correct", event.type === "copilot_request_received");
  assert("event.message is set", event.message === "Test message");
  assert("event.metadata.foo is bar", event.metadata.foo === "bar");
  assert("event.occurredAt is ISO", !isNaN(Date.parse(event.occurredAt)));
}

// ── Section 20: Audit — typed constructors ────────────────────────────────────

section("20. Audit — typed event constructors");

{
  const reqEvent = auditRequestReceived("req-001", "castillitos", "¿Cómo va Castillitos?");
  assert("auditRequestReceived type", reqEvent.type === "copilot_request_received");
  assert("auditRequestReceived requestId", reqEvent.requestId === "req-001");

  const intentEvent = auditIntentResolved("req-001", "MULTI_DOMAIN", "¿Cómo va?");
  assert("auditIntentResolved type", intentEvent.type === "copilot_intent_resolved");
  assert("auditIntentResolved metadata.intent", intentEvent.metadata.intent === "MULTI_DOMAIN");

  const agentsEvent = auditAgentsSelected("req-001", "MULTI_DOMAIN", ["finance_agent", "marketing_agent"]);
  assert("auditAgentsSelected type", agentsEvent.type === "copilot_agents_selected");
  assert("auditAgentsSelected metadata.agentIds", Array.isArray(agentsEvent.metadata.agentIds));

  const planEvent = auditPlanCreated("req-001", "cxp-001", ["finance_agent"], false);
  assert("auditPlanCreated type", planEvent.type === "copilot_plan_created");
  assert("auditPlanCreated metadata.planId", planEvent.metadata.planId === "cxp-001");

  const startEvent = auditExecutionStarted("req-001", "cxp-001", ["finance_agent"]);
  assert("auditExecutionStarted type", startEvent.type === "copilot_execution_started");

  const doneEvent = auditExecutionCompleted("req-001", "cxp-001", true, 450, []);
  assert("auditExecutionCompleted type", doneEvent.type === "copilot_execution_completed");
  assert("auditExecutionCompleted success=true", doneEvent.metadata.success === true);
  assert("auditExecutionCompleted durationMs=450", doneEvent.metadata.durationMs === 450);
}

// ── Section 21: Audit — CopilotAuditLog accumulator ─────────────────────────

section("21. Audit — CopilotAuditLog accumulator");

{
  const log = new CopilotAuditLog();
  assert("initial count is 0", log.count() === 0);

  log.push(auditRequestReceived("req-001", "castillitos", "Test"));
  assert("count is 1 after push", log.count() === 1);

  log.push(auditIntentResolved("req-001", "FINANCE", "Test"));
  log.push(auditAgentsSelected("req-001", "FINANCE", ["finance_agent"]));
  log.push(auditPlanCreated("req-001", "plan-001", ["finance_agent"], false));
  log.push(auditExecutionStarted("req-001", "plan-001", ["finance_agent"]));
  log.push(auditExecutionCompleted("req-001", "plan-001", true, 300, []));

  assert("count is 6 for full pipeline", log.count() === 6);

  const all = log.getAll();
  assert("getAll returns array", Array.isArray(all));
  assert("getAll length matches count", all.length === 6);

  // Verify pipeline order
  assert("first event is request_received", all[0]?.type === "copilot_request_received");
  assert("last event is execution_completed", all[5]?.type === "copilot_execution_completed");
}

// ── Section 22: End-to-end flow — pure domain path ────────────────────────────

section("22. End-to-end — pure domain pipeline (no server-only)");

{
  // Simulate the full pipeline without calling executeGoal
  const userMessage = "¿Cómo va Castillitos?";
  const orgSlug     = "castillitos";
  const requestId   = "e2e-test-001";

  // 1. Intent
  const intent = resolveCopilotIntent(userMessage);
  assert("e2e: intent is MULTI_DOMAIN", intent === "MULTI_DOMAIN");

  // 2. Agent selection
  const agents   = selectAgentsForIntent(intent);
  const agentIds = agents.map(a => a.id);
  assert("e2e: 4 agents selected", agents.length === 4);

  // 3. Execution plan
  const plan = buildCopilotExecutionPlan(intent, agentIds);
  assert("e2e: plan is parallelizable", plan.parallelizable === true);
  assert("e2e: plan has 4 agents", plan.agents.length === 4);

  // 4. Mock agent results (simulates executor output)
  const mockResults = agents.map(agent => ({
    agentId:       agent.id,
    displayName:   resolveAgentDisplayName(orgSlug, agent.id, agent.displayName),
    success:       true,
    summary:       `${agent.displayName}: 2 paso(s) completado.`,
    executedSteps: 2,
    metadata:      { status: "completed" },
  }));

  // 5. Aggregation
  const response = aggregateCopilotResponse(requestId, orgSlug, plan, mockResults, Date.now() - 1200);

  assert("e2e: response.success=true", response.success === true);
  assert("e2e: response.intent=MULTI_DOMAIN", response.intent === "MULTI_DOMAIN");
  assert("e2e: 4 participatingAgents", response.participatingAgents.length === 4);
  assert("e2e: participatingAgents includes Diego", response.participatingAgents.includes("Diego"));
  assert("e2e: participatingAgents includes Luca", response.participatingAgents.includes("Luca"));
  assert("e2e: participatingAgents includes Valentina", response.participatingAgents.includes("Valentina"));
  assert("e2e: participatingAgents includes Mila", response.participatingAgents.includes("Mila"));
  assert("e2e: summary is non-empty", response.consolidatedSummary.length > 0);
  assert("e2e: durationMs >= 0", response.durationMs >= 0);

  // Audit trail
  const log = new CopilotAuditLog();
  log.push(auditRequestReceived(requestId, orgSlug, userMessage));
  log.push(auditIntentResolved(requestId, intent, userMessage));
  log.push(auditAgentsSelected(requestId, intent, agentIds));
  log.push(auditPlanCreated(requestId, plan.id, agentIds, plan.parallelizable));
  log.push(auditExecutionStarted(requestId, plan.id, agentIds));
  log.push(auditExecutionCompleted(requestId, plan.id, true, 1200, []));

  assert("e2e: audit has 6 events", log.count() === 6);
}

// ── Section 23: Finance routing — end-to-end ─────────────────────────────────

section("23. Finance routing — Diego");

{
  // Unambiguous finance query (no MULTI-domain language)
  const intent  = resolveCopilotIntent("Revisar la tesorería del mes");
  const agents  = selectAgentsForIntent(intent);
  const plan    = buildCopilotExecutionPlan(intent, agents.map(a => a.id));

  assert("Finance routing: intent=FINANCE", intent === "FINANCE");
  assert("Finance routing: 1 agent", agents.length === 1);
  assert("Finance routing: agent is Diego", agents[0]?.displayName === "Diego");
  assert("Finance routing: not parallelizable", plan.parallelizable === false);
}

// ── Section 24: Marketing routing — Luca ─────────────────────────────────────

section("24. Marketing routing — Luca");

{
  const intent  = resolveCopilotIntent("¿Qué campañas están activas?");
  const agents  = selectAgentsForIntent(intent);

  assert("Marketing routing: intent=MARKETING", intent === "MARKETING");
  assert("Marketing routing: agent is Luca", agents[0]?.displayName === "Luca");
}

// ── Section 25: Commercial routing — Valentina ────────────────────────────────

section("25. Commercial routing — Valentina");

{
  // Unambiguous commercial query (specific phrase "clientes en riesgo")
  const intent  = resolveCopilotIntent("Ver los clientes en riesgo de este mes");
  const agents  = selectAgentsForIntent(intent);

  assert("Commercial routing: intent=COMMERCIAL", intent === "COMMERCIAL");
  assert("Commercial routing: agent is Valentina", agents[0]?.displayName === "Valentina");
}

// ── Section 26: Collections routing — Mila ───────────────────────────────────

section("26. Collections routing — Mila");

{
  const intent  = resolveCopilotIntent("¿Qué facturas están vencidas?");
  const agents  = selectAgentsForIntent(intent);

  assert("Collections routing: intent=COLLECTIONS", intent === "COLLECTIONS");
  assert("Collections routing: agent is Mila", agents[0]?.displayName === "Mila");
}

// ── Final report ───────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${"═".repeat(60)}`);
console.log(`AGENTIK-COPILOT-INTELLIGENCE-01 — Validation Suite`);
console.log(`${"═".repeat(60)}`);
console.log(`Passed: ${passed}  |  Failed: ${failed}  |  Total: ${total}`);

if (failures.length > 0) {
  console.log(`\nFailed checks:`);
  for (const f of failures) {
    console.log(`  ✗ ${f}`);
  }
}

console.log(`\nVerdict: ${failed === 0 ? "PASS — Copilot Intelligence contracts verified" : "FAIL — Fix the checks above"}`);
process.exit(failed === 0 ? 0 : 1);
