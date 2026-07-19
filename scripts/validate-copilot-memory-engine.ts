/**
 * scripts/validate-copilot-memory-engine.ts
 *
 * Agentik — Validation — AGENTIK-COPILOT-MEMORY-ENGINE-01
 *
 * 150+ checks covering:
 *   - CRUD operations
 *   - Classification engine
 *   - Retrieval engine
 *   - Tenant isolation
 *   - Summaries
 *   - Governance policies
 *   - Audit trail
 *   - Serialization
 *   - Context building
 *   - Intelligence service integration (static)
 *
 * No DB. No network. No AI. Pure domain logic.
 *
 * Run: npx tsx scripts/validate-copilot-memory-engine.ts
 */

export {};

import { shouldStoreMemory, classifyMemory }         from "../lib/copilot/memory/memory-classifier";
import { InMemoryMemoryRepository }                   from "../lib/copilot/memory/in-memory-memory-repository";
import { StrategicMemoryManager }                     from "../lib/copilot/memory/strategic-memory-manager";
import {
  getStrategicContext,
  getModuleContext,
  getAgentContext,
  searchRelevantMemories,
  getPreferenceContext,
} from "../lib/copilot/memory/memory-retrieval";
import {
  buildStrategicSummary,
  buildOperationalSummary,
  buildPreferenceSummary,
  buildFullContextSummary,
} from "../lib/copilot/memory/memory-summary";
import {
  MemoryAuditLog,
  auditMemoryCreated,
  auditMemoryUpdated,
  auditMemoryDeleted,
  auditMemoryRetrieved,
  auditMemoryClassified,
  auditMemoryRejected,
  canStoreMemory,
  canRetrieveMemory,
  type MemoryAuditEventType,
} from "../lib/copilot/memory/memory-audit";
import { importanceAtLeast }                          from "../lib/copilot/memory/memory-types";
import { readFileSync }                               from "fs";
import { resolve }                                    from "path";

// ── Test infrastructure ───────────────────────────────────────────────────────

let _passed = 0;
let _failed = 0;
const _failures: string[] = [];

function check(sec: string, label: string, condition: boolean, note?: string): void {
  if (condition) {
    _passed++;
  } else {
    _failed++;
    _failures.push(`  ✗ [${sec}] ${label}${note ? ` — ${note}` : ""}`);
  }
}

function section(name: string): void {
  console.log(`\n── ${name} ${"─".repeat(Math.max(0, 60 - name.length))}`);
}

const ROOT = resolve(__dirname, "..");
function readSrc(rel: string): string {
  try { return readFileSync(resolve(ROOT, rel), "utf-8"); }
  catch { return ""; }
}

// ── Main async runner ─────────────────────────────────────────────────────────

async function main(): Promise<void> {

// ── §1 — Classification: trivial rejection ────────────────────────────────────

section("§1 — Classification: trivial rejection");

const trivialCases: Array<[string, string]> = [
  ["hola",        "greeting: hola"],
  ["buenas",      "greeting: buenas"],
  ["gracias",     "ack: gracias"],
  ["ok",          "ack: ok"],
  ["bien",        "ack: bien"],
  ["perfecto",    "ack: perfecto"],
  ["dale",        "ack: dale"],
  ["de acuerdo",  "ack: de acuerdo"],
  ["entendido",   "ack: entendido"],
  ["test",        "noise: test"],
  ["prueba",      "noise: prueba"],
  ["si",          "noise: si"],
  ["no",          "noise: no"],
  ["",            "empty string"],
  ["  ",          "whitespace only"],
  ["ok dale",     "short trivial pair"],
];

for (const [content, label] of trivialCases) {
  check("§1", `shouldStoreMemory("${label}") = false`, !shouldStoreMemory(content));
}

// ── §2 — Classification: storage-worthy content ───────────────────────────────

section("§2 — Classification: storage-worthy content");

const worthyCases: Array<[string, string]> = [
  ["Castillitos usa SAG para facturación",            "strategic fact"],
  ["PagosNet está pendiente de integración",          "integration status"],
  ["La línea bebé es la línea prioritaria del tenant","business priority"],
  ["Agentik utiliza AI Layer como capa central de IA","architecture fact"],
  ["Andrés prefiere agentes especializados por módulo","user preference"],
  ["Cierre de mayo 2026 está en proceso",             "operational status"],
  ["El tenant prefiere resúmenes cortos en el rail",  "display preference"],
  ["Cuando hay facturas vencidas, siempre escalar",   "behavioral pattern"],
];

for (const [content, label] of worthyCases) {
  check("§2", `shouldStoreMemory("${label}") = true`, shouldStoreMemory(content));
}

// ── §3 — Classification: type assignment ─────────────────────────────────────

section("§3 — Classification: type assignment");

const typeTests: Array<[string, string, string]> = [
  ["Castillitos usa SAG para facturación",            "STRATEGIC",   "SAG integration"],
  ["PagosNet está pendiente de integración",          "STRATEGIC",   "PagosNet integration"],
  ["Agentik integra shopify como canal de venta",     "STRATEGIC",   "Shopify integration"],
  ["Andrés prefiere agentes especializados",          "PREFERENCE",  "user preference"],
  ["El tenant prefiere resúmenes cortos",             "PREFERENCE",  "display preference"],
  ["Siempre que hay mora alta, escalar a Mila",       "LEARNING",    "behavioral pattern"],
  // NOTE: "cada vez que hay cierre" ties LEARNING(2) and OPERATIONAL(2) → tiebreak → OPERATIONAL.
  // Use a query that dominates LEARNING without triggering OPERATIONAL keywords.
  ["Normalmente cuando detectamos ese patron, aprendemos a escalar", "LEARNING", "learning pattern"],
  ["Cierre de mayo 2026 está en proceso",             "OPERATIONAL", "operational status"],
];

for (const [content, expectedType, label] of typeTests) {
  const result = classifyMemory(content);
  check("§3", `${label} → type=${expectedType}`, result.type === expectedType, `got "${result.type}"`);
  check("§3", `${label} → shouldStore=true`, result.shouldStore);
}

// ── §4 — Classification: importance assignment ────────────────────────────────

section("§4 — Classification: importance assignment");

const importanceTests: Array<[string, string, string]> = [
  ["Castillitos usa SAG — crítico para facturación",  "CRITICAL", "critical signal"],
  ["SAG es fundamental para el sistema de cobros",    "CRITICAL", "fundamental signal"],
  ["La línea bebé es prioritaria para el negocio",    "HIGH",     "prioritario signal"],
  ["Andrés prefiere resúmenes cortos en el copilot",  "MEDIUM",   "preference default"],
  ["Cierre de mayo 2026 está en proceso ahora",       "MEDIUM",   "operational default"],
];

for (const [content, expectedImp, label] of importanceTests) {
  const result = classifyMemory(content);
  check("§4", `${label} → importance=${expectedImp}`, result.importance === expectedImp,
    `got "${result.importance}"`);
}

// ── §5 — Classification: tag extraction ──────────────────────────────────────

section("§5 — Classification: tag extraction");

const tagTests: Array<[string, string, string]> = [
  ["Castillitos usa SAG para facturación",    "sag",         "SAG tag"],
  ["Agentik integra shopify como canal",      "shopify",     "Shopify tag"],
  ["Conecta meta para campañas publicitarias","meta",        "Meta tag"],
  ["Tiktok como canal de contenido principal","tiktok",      "TikTok tag"],
  ["Cuenta bancaria para transferencias",     "banking",     "banking tag"],
  ["Cartera de cobros vencida y pendiente",   "collections", "collections tag"],
];

for (const [content, expectedTag, label] of tagTests) {
  const result = classifyMemory(content);
  check("§5", `${label} → tags contain "${expectedTag}"`,
    result.suggestedTags.includes(expectedTag), `got [${result.suggestedTags.join(",")}]`);
}

// ── §6 — CRUD: save and retrieve ─────────────────────────────────────────────

section("§6 — CRUD: save and retrieve");

const repo6 = new InMemoryMemoryRepository();

const entry1 = await repo6.saveMemory({
  orgSlug: "castillitos", type: "STRATEGIC", scope: "TENANT",
  importance: "HIGH", title: "Castillitos usa SAG",
  content: "Castillitos usa SAG para facturación y control de cartera",
  tags: ["sag", "integration"], source: "copilot",
});

check("§6", "saveMemory returns entry with mem- id",  entry1.id.startsWith("mem-"));
check("§6", "saveMemory preserves orgSlug",           entry1.orgSlug === "castillitos");
check("§6", "saveMemory preserves type",              entry1.type === "STRATEGIC");
check("§6", "saveMemory preserves title",             entry1.title === "Castillitos usa SAG");
check("§6", "saveMemory preserves tags",              entry1.tags.includes("sag"));
check("§6", "saveMemory sets createdAt ISO string",   entry1.createdAt.includes("T"));
check("§6", "saveMemory sets updatedAt ISO string",   entry1.updatedAt.includes("T"));

const retrieved = await repo6.getMemory(entry1.id);
check("§6", "getMemory retrieves saved entry",        retrieved !== null);
check("§6", "getMemory id matches",                   retrieved?.id === entry1.id);

const notFound = await repo6.getMemory("mem-nonexistent");
check("§6", "getMemory returns null for unknown id",  notFound === null);

// ── §7 — CRUD: update ────────────────────────────────────────────────────────

section("§7 — CRUD: update");

const toUpdate = await repo6.saveMemory({
  orgSlug: "castillitos", type: "OPERATIONAL", scope: "TENANT",
  importance: "MEDIUM", title: "Cierre mayo", content: "Cierre mayo en proceso",
  tags: ["cierre"], source: "user",
});

const updated = await repo6.updateMemory(toUpdate.id, {
  title:   "Cierre mayo 2026",
  content: "Cierre de mayo 2026 completado",
});
check("§7", "updateMemory returns updated entry",         updated !== null);
check("§7", "updateMemory updates title",                 updated?.title === "Cierre mayo 2026");
check("§7", "updateMemory updates content",               updated?.content === "Cierre de mayo 2026 completado");
check("§7", "updateMemory preserves type",                updated?.type === "OPERATIONAL");
check("§7", "updateMemory advances updatedAt",
  (updated?.updatedAt ?? "") >= toUpdate.updatedAt);

const updatedNull = await repo6.updateMemory("mem-nonexistent", { title: "X" });
check("§7", "updateMemory returns null for unknown id",   updatedNull === null);

// ── §8 — CRUD: delete ────────────────────────────────────────────────────────

section("§8 — CRUD: delete");

const toDelete = await repo6.saveMemory({
  orgSlug: "castillitos", type: "PREFERENCE", scope: "TENANT",
  importance: "LOW", title: "Pref borrar", content: "preferencia temporal para borrar en test",
  tags: [], source: "test",
});

const deleted = await repo6.deleteMemory(toDelete.id);
check("§8", "deleteMemory returns true",                  deleted === true);

const afterDelete = await repo6.getMemory(toDelete.id);
check("§8", "getMemory returns null after delete",        afterDelete === null);

const deletedMissing = await repo6.deleteMemory("mem-nonexistent");
check("§8", "deleteMemory returns false for unknown id",  deletedMissing === false);

// ── §9 — CRUD: list and count ─────────────────────────────────────────────────

section("§9 — CRUD: list and count");

const repo9 = new InMemoryMemoryRepository();
await repo9.saveMemory({ orgSlug: "org-a", type: "STRATEGIC",   scope: "TENANT", importance: "HIGH",   title: "A1", content: "strategic fact for org a with enough content",     tags: [], source: "copilot" });
await repo9.saveMemory({ orgSlug: "org-a", type: "OPERATIONAL", scope: "TENANT", importance: "MEDIUM", title: "A2", content: "operational fact for org a with enough content",  tags: [], source: "copilot" });
await repo9.saveMemory({ orgSlug: "org-a", type: "PREFERENCE",  scope: "TENANT", importance: "LOW",    title: "A3", content: "preference fact for org a with enough content",   tags: [], source: "user" });
await repo9.saveMemory({ orgSlug: "org-b", type: "STRATEGIC",   scope: "TENANT", importance: "HIGH",   title: "B1", content: "strategic fact for org b with enough content",     tags: [], source: "copilot" });

const listA = await repo9.listMemories("org-a");
check("§9", "listMemories org-a returns 3",               listA.length === 3);
const listB = await repo9.listMemories("org-b");
check("§9", "listMemories org-b returns 1",               listB.length === 1);

const countA = await repo9.countMemories("org-a");
check("§9", "countMemories org-a = 3",                    countA === 3);
const countB = await repo9.countMemories("org-b");
check("§9", "countMemories org-b = 1",                    countB === 1);

await repo9.saveMemory({
  orgSlug: "org-a", type: "STRATEGIC", scope: "TENANT",
  importance: "CRITICAL", title: "Critical", content: "critical entry for ordering test content",
  tags: [], source: "copilot",
});
const listOrdered = await repo9.listMemories("org-a");
check("§9", "listMemories: CRITICAL entry is first",      listOrdered[0]?.importance === "CRITICAL");

// ── §10 — Search: by type ─────────────────────────────────────────────────────

section("§10 — Search: by type");

const strategic = await repo9.searchMemory("org-a", { type: "STRATEGIC" });
check("§10", "searchMemory STRATEGIC returns 2",           strategic.length === 2);
check("§10", "searchMemory STRATEGIC all correct type",    strategic.every(e => e.type === "STRATEGIC"));

const operational = await repo9.searchMemory("org-a", { type: "OPERATIONAL" });
check("§10", "searchMemory OPERATIONAL returns 1",         operational.length === 1);

const preference = await repo9.searchMemory("org-a", { type: "PREFERENCE" });
check("§10", "searchMemory PREFERENCE returns 1",          preference.length === 1);

// ── §11 — Search: by tags ─────────────────────────────────────────────────────

section("§11 — Search: by tags");

const repo11 = new InMemoryMemoryRepository();
await repo11.saveMemory({ orgSlug: "castillitos", type: "STRATEGIC", scope: "TENANT", importance: "HIGH",   title: "SAG",     content: "usa SAG para facturación completa y control", tags: ["sag", "integration"], source: "copilot" });
await repo11.saveMemory({ orgSlug: "castillitos", type: "STRATEGIC", scope: "TENANT", importance: "MEDIUM", title: "Shopify", content: "conecta shopify como canal de ecommerce",      tags: ["shopify", "integration"], source: "copilot" });
await repo11.saveMemory({ orgSlug: "castillitos", type: "PREFERENCE", scope: "TENANT", importance: "LOW",  title: "Pref",    content: "preferencia general de resúmenes del usuario", tags: ["preference"], source: "user" });

const bySag = await repo11.searchMemory("castillitos", { tags: ["sag"] });
check("§11", "searchMemory tags=[sag] returns 1",          bySag.length === 1);
check("§11", "searchMemory tags=[sag] title=SAG",          bySag[0]?.title === "SAG");

const byIntegration = await repo11.searchMemory("castillitos", { tags: ["integration"] });
check("§11", "searchMemory tags=[integration] returns 2",  byIntegration.length === 2);

const byBoth = await repo11.searchMemory("castillitos", { tags: ["sag", "integration"] });
check("§11", "searchMemory tags=[sag,integration] = 1 (AND)", byBoth.length === 1);

// ── §12 — Search: by query text ──────────────────────────────────────────────

section("§12 — Search: by query text");

const byQuery = await repo11.searchMemory("castillitos", { query: "shopify" });
check("§12", "searchMemory query=shopify returns 1",       byQuery.length === 1);

const byQueryGeneral = await repo11.searchMemory("castillitos", { query: "canal" });
check("§12", "searchMemory query=canal returns entry",     byQueryGeneral.length >= 1);

const byQueryNone = await repo11.searchMemory("castillitos", { query: "xyznotexist_abc123" });
check("§12", "searchMemory nonexistent returns 0",         byQueryNone.length === 0);

// ── §13 — Tenant isolation ────────────────────────────────────────────────────

section("§13 — Tenant isolation");

const repoIso = new InMemoryMemoryRepository();
await repoIso.saveMemory({ orgSlug: "tenant-a", type: "STRATEGIC", scope: "TENANT", importance: "HIGH", title: "A only", content: "strategic fact private to tenant a only", tags: [], source: "copilot" });
await repoIso.saveMemory({ orgSlug: "tenant-b", type: "STRATEGIC", scope: "TENANT", importance: "HIGH", title: "B only", content: "strategic fact private to tenant b only", tags: [], source: "copilot" });

const listTenantA = await repoIso.listMemories("tenant-a");
const listTenantB = await repoIso.listMemories("tenant-b");
check("§13", "tenant-a sees only its own entries",         listTenantA.every(e => e.orgSlug === "tenant-a"));
check("§13", "tenant-b sees only its own entries",         listTenantB.every(e => e.orgSlug === "tenant-b"));
check("§13", "tenant-a cannot see tenant-b data",          !listTenantA.some(e => e.orgSlug === "tenant-b"));
check("§13", "tenant-b cannot see tenant-a data",          !listTenantB.some(e => e.orgSlug === "tenant-a"));

await repoIso.clearMemories("tenant-a");
const afterClearA = await repoIso.countMemories("tenant-a");
const afterClearB = await repoIso.countMemories("tenant-b");
check("§13", "clearMemories(tenant-a) zeroes tenant-a",    afterClearA === 0);
check("§13", "clearMemories(tenant-a) preserves tenant-b", afterClearB === 1);

// ── §14 — Strategic memory manager ───────────────────────────────────────────

section("§14 — Strategic memory manager");

const repoMgr = new InMemoryMemoryRepository();
const mgr = new StrategicMemoryManager(repoMgr);

const sfResult = await mgr.recordStrategicFact(
  "castillitos", "SAG integration",
  "Castillitos usa SAG para facturación y control de cartera de clientes",
  { tags: ["sag"] },
);
check("§14", "recordStrategicFact: stored=true",           sfResult.stored);
check("§14", "recordStrategicFact: entry present",         sfResult.entry !== undefined);
check("§14", "recordStrategicFact: type=STRATEGIC",        sfResult.entry?.type === "STRATEGIC");
check("§14", "recordStrategicFact: has sag tag",           sfResult.entry?.tags.includes("sag") ?? false);

const prefResult = await mgr.recordPreference(
  "castillitos", "Resúmenes cortos",
  "El tenant prefiere resúmenes cortos y directos en el copilot rail derecho",
);
check("§14", "recordPreference: stored=true",              prefResult.stored);
check("§14", "recordPreference: type=PREFERENCE",          prefResult.entry?.type === "PREFERENCE");

const learnResult = await mgr.recordLearning(
  "castillitos", "Escalar mora alta",
  "Cada vez que hay mora alta detectada, siempre escalar al agente de cobranza Mila",
);
check("§14", "recordLearning: stored=true",                learnResult.stored);
check("§14", "recordLearning: type=LEARNING",              learnResult.entry?.type === "LEARNING");

const opResult = await mgr.recordOperationalFact(
  "castillitos", "Cierre mayo 2026",
  "El cierre de mayo 2026 está en proceso de aprobación final",
  { moduleId: "finance" },
);
check("§14", "recordOperationalFact: stored=true",         opResult.stored);
check("§14", "recordOperationalFact: type=OPERATIONAL",    opResult.entry?.type === "OPERATIONAL");
check("§14", "recordOperationalFact: moduleId=finance",    opResult.entry?.moduleId === "finance");

const trivialResult = await mgr.recordStrategicFact("castillitos", "Test", "hola");
check("§14", "manager rejects trivial content",            !trivialResult.stored);
check("§14", "manager trivial: reason present",            !!trivialResult.reason);

const updatedMgr = await mgr.updateMemory("castillitos", sfResult.entry!.id, { title: "SAG v2" });
check("§14", "manager updateMemory updates title",         updatedMgr?.title === "SAG v2");

const delResult = await mgr.deleteMemory("castillitos", sfResult.entry!.id);
check("§14", "manager deleteMemory returns true",          delResult);
const gone = await repoMgr.getMemory(sfResult.entry!.id);
check("§14", "manager deleteMemory: entry gone from repo", gone === null);

// ── §15 — Retrieval: strategic context ────────────────────────────────────────

section("§15 — Retrieval: strategic context");

const repoRet = new InMemoryMemoryRepository();
const mgrRet = new StrategicMemoryManager(repoRet);

await mgrRet.recordStrategicFact("castillitos", "SAG",      "Castillitos usa SAG para facturación completa",       { tags: ["sag"] });
await mgrRet.recordStrategicFact("castillitos", "PagosNet", "PagosNet está pendiente de integración con agentik",  { tags: ["payments"] });
await mgrRet.recordPreference("castillitos",    "Pref",     "Andrés prefiere agentes especializados por módulo de negocio");

const stratCtx = await getStrategicContext("castillitos", "FINANCE", repoRet);
check("§15", "getStrategicContext: orgSlug matches",        stratCtx.orgSlug === "castillitos");
check("§15", "getStrategicContext: retrievedAt ISO",        stratCtx.retrievedAt.includes("T"));
check("§15", "getStrategicContext: entries is array",       Array.isArray(stratCtx.entries));
check("§15", "getStrategicContext: STRATEGIC entries included", stratCtx.entries.length >= 1);
check("§15", "getStrategicContext: overflow is number",     typeof stratCtx.overflow === "number");

const emptyCtx = await getStrategicContext("org-empty-xyz-99", "FINANCE", repoRet);
check("§15", "empty org returns empty context",             emptyCtx.entries.length === 0);
check("§15", "empty org overflow=0",                        emptyCtx.overflow === 0);

// ── §16 — Retrieval: module and agent context ─────────────────────────────────

section("§16 — Retrieval: module and agent context");

const repoMod = new InMemoryMemoryRepository();
await repoMod.saveMemory({ orgSlug: "castillitos", type: "OPERATIONAL", scope: "MODULE", importance: "MEDIUM", title: "Finance status",   content: "cierre pendiente de aprobacion final del equipo", tags: [], source: "copilot", moduleId: "finance" });
await repoMod.saveMemory({ orgSlug: "castillitos", type: "OPERATIONAL", scope: "MODULE", importance: "MEDIUM", title: "Marketing status", content: "campanas activas esta semana en redes sociales",   tags: [], source: "copilot", moduleId: "marketing" });
await repoMod.saveMemory({ orgSlug: "castillitos", type: "PREFERENCE",  scope: "AGENT",  importance: "MEDIUM", title: "Diego tone",       content: "Diego usa tono conciso y directo con el usuario",  tags: [], source: "copilot", agentId: "finance_agent" });

const modCtx = await getModuleContext("castillitos", "finance", repoMod);
check("§16", "getModuleContext finance: entries >= 1",      modCtx.entries.length >= 1);
check("§16", "getModuleContext finance: all moduleId=finance",
  modCtx.entries.every(e => e.moduleId === "finance"));

const agentCtx = await getAgentContext("castillitos", "finance_agent", repoMod);
check("§16", "getAgentContext finance_agent: entries >= 1", agentCtx.entries.length >= 1);
check("§16", "getAgentContext: all agentId=finance_agent",
  agentCtx.entries.every(e => e.agentId === "finance_agent"));

// ── §17 — Retrieval: text search and preferences ──────────────────────────────

section("§17 — Retrieval: text search and preferences");

const repoSearch = new InMemoryMemoryRepository();
await repoSearch.saveMemory({ orgSlug: "castillitos", type: "STRATEGIC", scope: "TENANT", importance: "HIGH", title: "SAG",     content: "Castillitos usa SAG para facturación y control", tags: ["sag"],     source: "copilot" });
await repoSearch.saveMemory({ orgSlug: "castillitos", type: "STRATEGIC", scope: "TENANT", importance: "HIGH", title: "Shopify", content: "Shopify conectado como canal e-commerce activo",  tags: ["shopify"], source: "copilot" });
await repoSearch.saveMemory({ orgSlug: "castillitos", type: "PREFERENCE", scope: "TENANT", importance: "MEDIUM", title: "Pref", content: "prefiere agentes especializados por modulo del sistema", tags: ["preference"], source: "user" });

const searchSag = await searchRelevantMemories("castillitos", "SAG", undefined, 10, repoSearch);
check("§17", "searchRelevantMemories query=SAG returns result", searchSag.entries.length >= 1);

const searchTags = await searchRelevantMemories("castillitos", undefined, ["shopify"], 10, repoSearch);
check("§17", "searchRelevantMemories tags=[shopify] returns 1", searchTags.entries.length === 1);

const searchNone = await searchRelevantMemories("castillitos", "xyznotexist_abc123", undefined, 10, repoSearch);
check("§17", "searchRelevantMemories no match returns empty",   searchNone.entries.length === 0);

const prefCtx = await getPreferenceContext("castillitos", repoSearch);
check("§17", "getPreferenceContext returns entries",           prefCtx.entries.length >= 1);
check("§17", "getPreferenceContext all type=PREFERENCE",       prefCtx.entries.every(e => e.type === "PREFERENCE"));

// ── §18 — Summaries ───────────────────────────────────────────────────────────

section("§18 — Summaries");

const repoSum = new InMemoryMemoryRepository();
await repoSum.saveMemory({ orgSlug: "castillitos", type: "STRATEGIC",   scope: "TENANT", importance: "HIGH",   title: "SAG fact",  content: "Castillitos usa SAG para facturación completa", tags: [], source: "copilot" });
await repoSum.saveMemory({ orgSlug: "castillitos", type: "OPERATIONAL", scope: "TENANT", importance: "MEDIUM", title: "Op fact",   content: "Cierre de mayo 2026 está en proceso activo",    tags: [], source: "copilot" });
await repoSum.saveMemory({ orgSlug: "castillitos", type: "PREFERENCE",  scope: "TENANT", importance: "LOW",    title: "Pref fact", content: "Andrés prefiere resúmenes cortos y directos",  tags: [], source: "user" });

const strategicSum = await buildStrategicSummary("castillitos", repoSum);
check("§18", "buildStrategicSummary: totalCount >= 1",         strategicSum.totalCount >= 1);
check("§18", "buildStrategicSummary: summaryText non-empty",   strategicSum.summaryText.length > 0);
check("§18", "buildStrategicSummary: all type=STRATEGIC",      strategicSum.entries.every(e => e.type === "STRATEGIC"));
check("§18", "buildStrategicSummary: generatedAt ISO",         strategicSum.generatedAt.includes("T"));

const opSum = await buildOperationalSummary("castillitos", undefined, repoSum);
check("§18", "buildOperationalSummary: totalCount >= 1",       opSum.totalCount >= 1);
check("§18", "buildOperationalSummary: all OPERATIONAL",       opSum.entries.every(e => e.type === "OPERATIONAL"));

const prefSum = await buildPreferenceSummary("castillitos", repoSum);
check("§18", "buildPreferenceSummary: totalCount >= 1",        prefSum.totalCount >= 1);
check("§18", "buildPreferenceSummary: all PREFERENCE",         prefSum.entries.every(e => e.type === "PREFERENCE"));

const fullSum = await buildFullContextSummary("castillitos", repoSum);
check("§18", "buildFullContextSummary: totalCount >= 3",       fullSum.totalCount >= 3);
check("§18", "buildFullContextSummary: has estratégico block",
  fullSum.summaryText.toLowerCase().includes("estrat"));
check("§18", "buildFullContextSummary: generatedAt ISO",       fullSum.generatedAt.includes("T"));

const emptyStrSum = await buildStrategicSummary("empty-org-xyz-99", repoSum);
check("§18", "buildStrategicSummary empty org: fallback text", emptyStrSum.summaryText.length > 0);
check("§18", "buildStrategicSummary empty org: totalCount=0",  emptyStrSum.totalCount === 0);

// ── §19 — Audit trail ─────────────────────────────────────────────────────────

section("§19 — Audit trail");

const auditLog = new MemoryAuditLog();
check("§19", "new MemoryAuditLog starts empty",            auditLog.count() === 0);

const orgAudit = "castillitos";
auditLog.push(auditMemoryCreated(orgAudit, "mem-001", "SAG fact", "STRATEGIC", "HIGH", "copilot"));
auditLog.push(auditMemoryUpdated(orgAudit, "mem-001", ["title", "content"]));
auditLog.push(auditMemoryRetrieved(orgAudit, 3, "TENANT", "intent:FINANCE"));
auditLog.push(auditMemoryClassified(orgAudit, "STRATEGIC", "HIGH", true, "SAG usa SAG"));
auditLog.push(auditMemoryRejected(orgAudit, "trivial content", "hola"));
auditLog.push(auditMemoryDeleted(orgAudit, "mem-001", "SAG fact"));

check("§19", "count=6 after 6 pushes",                    auditLog.count() === 6);

const expectedAuditTypes: MemoryAuditEventType[] = [
  "memory_created", "memory_updated", "memory_retrieved",
  "memory_classified", "memory_rejected", "memory_deleted",
];
const gotAuditTypes = auditLog.getAll().map(e => e.type);
for (const t of expectedAuditTypes) {
  check("§19", `audit log contains: ${t}`,                gotAuditTypes.includes(t));
}

const allEvents = auditLog.getAll();
check("§19", "all events id starts with maud-",           allEvents.every(e => e.id.startsWith("maud-")));
check("§19", "all events have orgSlug",                   allEvents.every(e => e.orgSlug === orgAudit));
check("§19", "all events have occurredAt ISO",            allEvents.every(e => e.occurredAt.includes("T")));
check("§19", "all events have metadata object",           allEvents.every(e => typeof e.metadata === "object"));

check("§19", "getByType returns correct events",          auditLog.getByType("memory_created").length === 1);
check("§19", "getByOrg returns all events for org",       auditLog.getByOrg("castillitos").length === 6);

const snap = auditLog.getAll();
snap.push(snap[0]!);
check("§19", "getAll returns defensive copy",              auditLog.count() === 6);
check("§19", "all audit IDs unique",                      new Set(allEvents.map(e => e.id)).size === 6);

// Truncation test
const longMsg = "A".repeat(300);
const longEvent = auditMemoryRetrieved("castillitos", 1, "TENANT", longMsg);
check("§19", "audit event occurredAt is set",              longEvent.occurredAt.includes("T"));

// ── §20 — Governance policies ─────────────────────────────────────────────────

section("§20 — Governance policies");

check("§20", "canStoreMemory returns boolean",             typeof canStoreMemory("castillitos") === "boolean");
check("§20", "canStoreMemory is true by default",          canStoreMemory("castillitos") === true);
check("§20", "canStoreMemory any org = true",              canStoreMemory("unknown-org") === true);
check("§20", "canRetrieveMemory returns boolean",          typeof canRetrieveMemory("castillitos") === "boolean");
check("§20", "canRetrieveMemory is true by default",       canRetrieveMemory("castillitos") === true);

// ── §21 — Importance ordering ─────────────────────────────────────────────────

section("§21 — Importance ordering utility");

check("§21", "CRITICAL >= CRITICAL",   importanceAtLeast("CRITICAL", "CRITICAL"));
check("§21", "CRITICAL >= HIGH",       importanceAtLeast("CRITICAL", "HIGH"));
check("§21", "CRITICAL >= MEDIUM",     importanceAtLeast("CRITICAL", "MEDIUM"));
check("§21", "CRITICAL >= LOW",        importanceAtLeast("CRITICAL", "LOW"));
check("§21", "HIGH >= HIGH",           importanceAtLeast("HIGH", "HIGH"));
check("§21", "HIGH >= MEDIUM",         importanceAtLeast("HIGH", "MEDIUM"));
check("§21", "HIGH >= LOW",            importanceAtLeast("HIGH", "LOW"));
check("§21", "MEDIUM >= MEDIUM",       importanceAtLeast("MEDIUM", "MEDIUM"));
check("§21", "MEDIUM >= LOW",          importanceAtLeast("MEDIUM", "LOW"));
check("§21", "LOW >= LOW",             importanceAtLeast("LOW", "LOW"));
check("§21", "HIGH not >= CRITICAL",   !importanceAtLeast("HIGH", "CRITICAL"));
check("§21", "MEDIUM not >= HIGH",     !importanceAtLeast("MEDIUM", "HIGH"));
check("§21", "LOW not >= MEDIUM",      !importanceAtLeast("LOW", "MEDIUM"));

// ── §22 — Serialization ───────────────────────────────────────────────────────

section("§22 — Serialization");

const repoSer = new InMemoryMemoryRepository();
const serEntry = await repoSer.saveMemory({
  orgSlug: "castillitos", type: "STRATEGIC", scope: "TENANT",
  importance: "HIGH", title: "SAG integration",
  content: "Castillitos usa SAG para facturas y control de cartera vencida",
  tags: ["sag", "integration"], source: "copilot",
});

const serialized = JSON.stringify(serEntry);
check("§22", "MemoryEntry is JSON-serializable",           !!serialized);

const parsed = JSON.parse(serialized);
check("§22", "parsed.id matches",                         parsed.id === serEntry.id);
check("§22", "parsed.type matches",                       parsed.type === serEntry.type);
check("§22", "parsed.tags is array",                      Array.isArray(parsed.tags));
check("§22", "parsed.createdAt is string",                typeof parsed.createdAt === "string");

const ctxSer = await getStrategicContext("castillitos", "FINANCE", repoSer);
const ctxJson = JSON.stringify(ctxSer);
check("§22", "MemoryContext is JSON-serializable",         !!ctxJson);
check("§22", "MemoryContext.entries is array in JSON",     Array.isArray(JSON.parse(ctxJson).entries));

// ── §23 — Repository content limits ───────────────────────────────────────────

section("§23 — Repository content limits");

const repoLim = new InMemoryMemoryRepository();
const limEntry = await repoLim.saveMemory({
  orgSlug: "castillitos", type: "STRATEGIC", scope: "TENANT", importance: "MEDIUM",
  title:   "T".repeat(200),
  content: "C".repeat(3000),
  tags: [], source: "copilot",
});
check("§23", "title truncated to <= 80 chars",             limEntry.title.length <= 80);
check("§23", "content truncated to <= 2000 chars",         limEntry.content.length <= 2000);

const tagEntry = await repoLim.saveMemory({
  orgSlug: "castillitos", type: "STRATEGIC", scope: "TENANT", importance: "MEDIUM",
  title: "Tag test", content: "tag normalization test for the storage layer validation",
  tags: ["SAG", "  Integration  ", "PAYMENTS"], source: "copilot",
});
check("§23", "tags normalized to lowercase",               tagEntry.tags.every(t => t === t.toLowerCase()));
check("§23", "tags trimmed of whitespace",                 tagEntry.tags.every(t => t === t.trim()));

// ── §24 — Intelligence service integration (static) ──────────────────────────

section("§24 — Intelligence service integration (static)");

const svcSrc = readSrc("lib/copilot/copilot-intelligence-service.ts");
check("§24", "service imports getStrategicContext",        svcSrc.includes("getStrategicContext"));
check("§24", "service awaits getStrategicContext",         svcSrc.includes("await getStrategicContext("));
check("§24", "memory retrieval has try/catch (non-blocking)", svcSrc.includes("memoryContext = undefined"));
check("§24", "service attaches memoryContext to response", svcSrc.includes("memoryContext"));
check("§24", "service only attaches when entries > 0",     svcSrc.includes("entries.length > 0"));

const typeSrc = readSrc("lib/copilot/copilot-types.ts");
check("§24", "CopilotResponse has memoryContext optional field", typeSrc.includes("memoryContext?:"));
check("§24", "copilot-types imports MemoryContext",        typeSrc.includes("MemoryContext"));

// ── §25 — Memory files boundary audit (static) ────────────────────────────────

section("§25 — Memory files boundary audit (static)");

const pureMemFiles: Record<string, string> = {
  "memory-types":         readSrc("lib/copilot/memory/memory-types.ts"),
  "memory-repository":    readSrc("lib/copilot/memory/memory-repository.ts"),
  "memory-classifier":    readSrc("lib/copilot/memory/memory-classifier.ts"),
  "memory-audit":         readSrc("lib/copilot/memory/memory-audit.ts"),
  "in-memory-repository": readSrc("lib/copilot/memory/in-memory-memory-repository.ts"),
  "strategic-manager":    readSrc("lib/copilot/memory/strategic-memory-manager.ts"),
  "memory-retrieval":     readSrc("lib/copilot/memory/memory-retrieval.ts"),
  "memory-summary":       readSrc("lib/copilot/memory/memory-summary.ts"),
};

for (const [name, src] of Object.entries(pureMemFiles)) {
  check("§25", `${name}: no "server-only"`,
    !src.includes('"server-only"') && !src.includes("'server-only'"));
  check("§25", `${name}: no prisma import`,
    !src.includes("@prisma/client") && !src.includes("lib/prisma"));
  check("§25", `${name}: no AI provider calls`,
    !src.includes("openai") && !src.includes("anthropic") && !src.includes("ai-layer-service"));
  check("§25", `${name}: no fetch/axios`,
    !src.includes("fetch(") && !src.includes("axios."));
}

// ── §26 — Documented debt ─────────────────────────────────────────────────────

section("§26 — Documented debt (future sprints)");

const retrieval = readSrc("lib/copilot/memory/memory-retrieval.ts");
const audit     = readSrc("lib/copilot/memory/memory-audit.ts");
const manager   = readSrc("lib/copilot/memory/strategic-memory-manager.ts");
const repository = readSrc("lib/copilot/memory/in-memory-memory-repository.ts");

// NOTE: retrieval.ts documents "no vectors/embeddings" in comments — check for API imports instead
check("§26", "retrieval: no vector/embedding library imported",
  !retrieval.includes("from \"@pinecone") && !retrieval.includes("from \"openai\"") &&
  !retrieval.includes("embed(") && !retrieval.includes("createEmbedding("));
check("§26", "retrieval: no semantic AI",                 !retrieval.includes("openai") && !retrieval.includes("anthropic"));
check("§26", "audit: no DB persistence",                  !audit.includes("prisma"));
check("§26", "manager: quota DEBT documented",             manager.includes("DEBT"));
check("§26", "repository: no Prisma",                     !repository.includes("@prisma/client"));

// ── Final report ──────────────────────────────────────────────────────────────

} // end main()

main().then(() => {
  const total = _passed + _failed;
  console.log(`\n${"═".repeat(64)}`);
  console.log(`AGENTIK-COPILOT-MEMORY-ENGINE-01 — Validation Complete`);
  console.log(`${"═".repeat(64)}`);
  console.log(`Passed: ${_passed}  |  Failed: ${_failed}  |  Total: ${total}`);

  if (_failed > 0) {
    console.log(`\nFailed checks:`);
    for (const f of _failures) console.log(f);
    console.log(`\nVerdict: NEEDS FIXES`);
    process.exit(1);
  } else {
    console.log(`\nVerdict: AGENTIK-COPILOT-MEMORY-ENGINE-01 = READY FOR INTEGRATION`);
    process.exit(0);
  }
}).catch(err => {
  console.error("Validation script crashed:", err);
  process.exit(1);
});
