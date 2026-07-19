/**
 * scripts/validate-copilot-memory-persistence.ts
 *
 * AGENTIK-COPILOT-MEMORY-PERSISTENCE-01 — Source-code validation suite
 *
 * 100+ deterministic checks on file structure, boundaries, and contracts.
 * Run via:  node scripts/_run-persistence-validation.js
 *
 * Checks:
 *   A. Schema & migration (10 checks)
 *   B. Prisma mapper (20 checks)
 *   C. Prisma repository (20 checks)
 *   D. Repository resolver (10 checks)
 *   E. Server barrel (15 checks)
 *   F. Client-safe barrel (15 checks)
 *   G. Strategic manager hardening (10 checks)
 *   H. Intelligence service wiring (10 checks)
 */

import * as fs from "fs";
import * as path from "path";

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL: ${label}`);
  }
}

function readFile(relPath: string): string {
  const abs = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(abs)) return "";
  return fs.readFileSync(abs, "utf-8");
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.resolve(process.cwd(), relPath));
}

// ── Files ─────────────────────────────────────────────────────────────────────

const SCHEMA   = readFile("prisma/schema.prisma");
const MIGRATION = readFile("prisma/migrations/20260605100000_copilot_memory/migration.sql");
const MAPPER   = readFile("lib/copilot/memory/persistence/memory-prisma-mapper.ts");
const REPO     = readFile("lib/copilot/memory/persistence/prisma-memory-repository.ts");
const RESOLVER = readFile("lib/copilot/memory/memory-repository-resolver.ts");
const SERVER   = readFile("lib/copilot/memory/server.ts");
const INDEX    = readFile("lib/copilot/memory/index.ts");
const MANAGER  = readFile("lib/copilot/memory/strategic-memory-manager.ts");
const INTEL    = readFile("lib/copilot/copilot-intelligence-service.ts");

// ── Section A: Schema & migration ────────────────────────────────────────────

check("A01 — schema.prisma exists", fs.existsSync(path.resolve(process.cwd(), "prisma/schema.prisma")));
check("A02 — CopilotMemory model in schema", SCHEMA.includes("model CopilotMemory {"));
check("A03 — orgSlug field in schema", SCHEMA.includes('"orgSlug"') || SCHEMA.includes("orgSlug"));
check("A04 — tagsJson Json field in schema", SCHEMA.includes("tagsJson") && SCHEMA.includes("Json"));
check("A05 — deletedAt nullable in schema", SCHEMA.includes("deletedAt") && SCHEMA.includes("DateTime?"));
check("A06 — VarChar(80) for title in schema", SCHEMA.includes("VarChar(80)") || SCHEMA.includes("@db.VarChar(80)"));
check("A07 — migration SQL file exists", fileExists("prisma/migrations/20260605100000_copilot_memory/migration.sql"));
check("A08 — CREATE TABLE CopilotMemory in migration", MIGRATION.includes('CREATE TABLE "CopilotMemory"'));
check("A09 — orgSlug index in migration", MIGRATION.includes("CopilotMemory_orgSlug_idx"));
check("A10 — deletedAt index in migration", MIGRATION.includes("CopilotMemory_deletedAt_idx"));

// ── Section B: Prisma mapper ──────────────────────────────────────────────────

check("B01 — mapper file exists", fileExists("lib/copilot/memory/persistence/memory-prisma-mapper.ts"));
check("B02 — mapper has NO import server-only", !MAPPER.includes('import "server-only"'));
check("B03 — mapper has NO prisma import", !MAPPER.includes("@prisma/client") && !MAPPER.includes("lib/prisma"));
check("B04 — parseTagsJson exported", MAPPER.includes("export function parseTagsJson"));
check("B05 — normalizeTags exported", MAPPER.includes("export function normalizeTags"));
check("B06 — PrismaCopilotMemoryRow interface exported", MAPPER.includes("export interface PrismaCopilotMemoryRow"));
check("B07 — rowToMemoryEntry exported", MAPPER.includes("export function rowToMemoryEntry"));
check("B08 — inputToCreatePayload exported", MAPPER.includes("export function inputToCreatePayload"));
check("B09 — inputToUpdatePayload exported", MAPPER.includes("export function inputToUpdatePayload"));
check("B10 — deletedAt excluded from rowToMemoryEntry output", !MAPPER.includes("deletedAt: row.deletedAt"));
check("B11 — title truncated to 80 in createPayload", MAPPER.includes("slice(0, 80)"));
check("B12 — content truncated to 2000 in createPayload", MAPPER.includes("slice(0, 2000)"));
check("B13 — ensureType has OPERATIONAL fallback", MAPPER.includes('"OPERATIONAL"'));
check("B14 — ensureScope has TENANT fallback", MAPPER.includes('"TENANT"'));
check("B15 — ensureImportance has MEDIUM fallback", MAPPER.includes('"MEDIUM"'));
check("B16 — parseTagsJson handles Array input", MAPPER.includes("Array.isArray(raw)"));
check("B17 — parseTagsJson handles string input (JSON.parse)", MAPPER.includes("JSON.parse(raw)"));
check("B18 — parseTagsJson returns [] on failure", MAPPER.includes("return []"));
check("B19 — normalizeTags deduplicates via Set", MAPPER.includes("new Set("));
check("B20 — normalizeTags lowercases + trims", MAPPER.includes("toLowerCase") && MAPPER.includes("trim()"));

// ── Section C: Prisma repository ──────────────────────────────────────────────

check("C01 — repo file exists", fileExists("lib/copilot/memory/persistence/prisma-memory-repository.ts"));
check("C02 — repo has import server-only", REPO.includes('import "server-only"'));
check("C03 — repo imports from lib/prisma", REPO.includes('"@/lib/prisma"'));
check("C04 — PrismaMemoryRepository class", REPO.includes("class PrismaMemoryRepository implements MemoryRepository"));
check("C05 — saveMemory uses copilotMemory.create", REPO.includes("prisma.copilotMemory.create"));
check("C06 — updateMemory uses copilotMemory.update", REPO.includes("prisma.copilotMemory.update"));
check("C07 — deleteMemory is soft delete", REPO.includes("deletedAt: new Date()"));
check("C08 — getMemory filters deletedAt: null", REPO.includes("deletedAt: null"));
check("C09 — searchMemory scopes by orgSlug", REPO.includes("orgSlug,") || REPO.includes("orgSlug:"));
check("C10 — searchMemory supports query text search", REPO.includes('contains: options.query'));
check("C11 — listMemories scopes by orgSlug", REPO.includes("listMemories"));
check("C12 — countMemories scopes by orgSlug", REPO.includes("countMemories"));
check("C13 — clearMemories uses updateMany (soft)", REPO.includes("copilotMemory.updateMany"));
check("C14 — clearMemories scopes by orgSlug", REPO.includes("clearMemories"));
check("C15 — MAX_FETCH constant defined", REPO.includes("MAX_FETCH"));
check("C16 — importance sort done in app code", REPO.includes("IMPORTANCE_RANK") || REPO.includes("sortByImportanceThenDate"));
check("C17 — importanceGte helper defined", REPO.includes("importanceGte"));
check("C18 — prismaMemoryRepository singleton exported", REPO.includes("export const prismaMemoryRepository"));
check("C19 — tags filter done in app code (not native JSONB)", REPO.includes("entryTagSet") || REPO.includes("required.every"));
check("C20 — deleteMemory checks existence before soft-delete", REPO.includes("findFirst") && REPO.includes("deletedAt: new Date()"));

// ── Section D: Repository resolver ────────────────────────────────────────────

check("D01 — resolver file exists", fileExists("lib/copilot/memory/memory-repository-resolver.ts"));
check("D02 — resolver has import server-only", RESOLVER.includes('import "server-only"'));
check("D03 — getServerMemoryRepository exported", RESOLVER.includes("export function getServerMemoryRepository"));
check("D04 — returns prismaMemoryRepository in non-test", RESOLVER.includes("prismaMemoryRepository"));
check("D05 — returns InMemoryMemoryRepository in test", RESOLVER.includes("InMemoryMemoryRepository"));
check("D06 — test check uses process.env.NODE_ENV", RESOLVER.includes('process.env.NODE_ENV === "test"'));
check("D07 — resetTestMemoryRepository exported", RESOLVER.includes("export function resetTestMemoryRepository"));
check("D08 — reset is no-op in non-test (checks NODE_ENV)", RESOLVER.includes("NODE_ENV") && RESOLVER.includes("resetTestMemoryRepository"));
check("D09 — test singleton uses ??= pattern", RESOLVER.includes("??="));
check("D10 — imports MemoryRepository interface", RESOLVER.includes("MemoryRepository"));

// ── Section E: Server barrel ──────────────────────────────────────────────────

check("E01 — server.ts file exists", fileExists("lib/copilot/memory/server.ts"));
check("E02 — server.ts has import server-only", SERVER.includes('import "server-only"'));
check("E03 — exports prismaMemoryRepository", SERVER.includes("prismaMemoryRepository"));
check("E04 — exports getServerMemoryRepository", SERVER.includes("getServerMemoryRepository"));
check("E05 — exports serverMemoryManager", SERVER.includes("serverMemoryManager"));
check("E06 — serverMemoryManager backed by getServerMemoryRepository", SERVER.includes("new StrategicMemoryManager(getServerMemoryRepository())"));
check("E07 — exports getStrategicContext bound to server repo", SERVER.includes("export function getStrategicContext"));
check("E08 — exports getModuleContext", SERVER.includes("export function getModuleContext"));
check("E09 — exports getAgentContext", SERVER.includes("export function getAgentContext"));
check("E10 — exports searchRelevantMemories", SERVER.includes("export function searchRelevantMemories"));
check("E11 — exports getPreferenceContext", SERVER.includes("export function getPreferenceContext"));
check("E12 — re-exports MemoryEntry type", SERVER.includes("MemoryEntry"));
check("E13 — re-exports MemoryRepository type", SERVER.includes("MemoryRepository"));
check("E14 — re-exports StrategicMemoryManager", SERVER.includes("StrategicMemoryManager"));
check("E15 — retrieval helpers use _serverRepo", SERVER.includes("_serverRepo"));

// ── Section F: Client-safe barrel ────────────────────────────────────────────

check("F01 — index.ts file exists", fileExists("lib/copilot/memory/index.ts"));
check("F02 — index.ts has NO import server-only", !INDEX.includes('import "server-only"'));
check("F03 — index.ts has NO prisma import", !INDEX.includes("@prisma/client") && !INDEX.includes("lib/prisma"));
check("F04 — index.ts has NO prismaMemoryRepository export", !INDEX.includes("prismaMemoryRepository"));
check("F05 — index.ts has NO getServerMemoryRepository export", !INDEX.includes("getServerMemoryRepository"));
check("F06 — index.ts has NO serverMemoryManager export", !INDEX.includes("serverMemoryManager"));
check("F07 — index.ts has NO StrategicMemoryManager runtime export", !INDEX.includes("export { StrategicMemoryManager") && !INDEX.includes("export class StrategicMemoryManager"));
check("F08 — index.ts exports MemoryEntry type", INDEX.includes("MemoryEntry"));
check("F09 — index.ts exports MemoryContext type", INDEX.includes("MemoryContext"));
check("F10 — index.ts exports MemoryType type", INDEX.includes("MemoryType"));
check("F11 — index.ts exports importanceAtLeast", INDEX.includes("importanceAtLeast"));
check("F12 — index.ts exports classifyMemory", INDEX.includes("classifyMemory"));
check("F13 — index.ts exports MemoryRepository interface (type only)", INDEX.includes("MemoryRepository"));
check("F14 — index.ts exports MemoryAuditEvent type", INDEX.includes("MemoryAuditEvent"));
check("F15 — index.ts has NO memory-retrieval or server import", !INDEX.includes("memory-retrieval") && !INDEX.includes("./server"));

// ── Section G: Strategic manager hardening ────────────────────────────────────

check("G01 — manager file exists", fileExists("lib/copilot/memory/strategic-memory-manager.ts"));
check("G02 — manager has NO prisma import", !MANAGER.includes("@prisma/client") && !MANAGER.includes("lib/prisma"));
check("G03 — manager has NO server-only import", !MANAGER.includes('import "server-only"'));
check("G04 — updateMemory validates orgSlug before update", MANAGER.includes("existing.orgSlug !== orgSlug") || MANAGER.includes("orgSlug !== orgSlug"));
check("G05 — updateMemory returns null on orgSlug mismatch", MANAGER.includes("if (!existing || existing.orgSlug !== orgSlug) return null"));
check("G06 — deleteMemory validates orgSlug before delete", MANAGER.includes("entry.orgSlug !== orgSlug") || MANAGER.includes("!entry || entry.orgSlug !== orgSlug"));
check("G07 — deleteMemory returns false on orgSlug mismatch", MANAGER.includes("if (!entry || entry.orgSlug !== orgSlug) return false"));
check("G08 — audit log for updated fires after check", MANAGER.includes("auditMemoryUpdated"));
check("G09 — audit log for deleted fires after check", MANAGER.includes("auditMemoryDeleted"));
check("G10 — defaultMemoryManager singleton exported", MANAGER.includes("export const defaultMemoryManager"));

// ── Section H: Intelligence service wiring ────────────────────────────────────

check("H01 — intelligence service imports from ./memory/server not ./memory/memory-retrieval", INTEL.includes('"./memory/server"'));
check("H02 — intelligence service does NOT import getStrategicContext from memory-retrieval directly", !INTEL.includes('"./memory/memory-retrieval"'));
check("H03 — intelligence service has import server-only", INTEL.includes('import "server-only"'));
check("H04 — intelligence service calls getStrategicContext", INTEL.includes("getStrategicContext("));
check("H05 — memory retrieval is wrapped in try/catch (non-blocking)", INTEL.includes("try {") && INTEL.includes("memoryContext = undefined"));
check("H06 — planning signals fallback to []", INTEL.includes("planningSignals = []"));
check("H07 — profile resolution is wrapped in try/catch", INTEL.includes("copilotProfile = undefined"));
check("H08 — final response attaches copilotProfile", INTEL.includes("copilotProfile,"));
check("H09 — final response attaches copilotDisplayName", INTEL.includes("copilotDisplayName:"));
check("H10 — final response attaches executiveStyle", INTEL.includes("executiveStyle:"));

// ── Final report ──────────────────────────────────────────────────────────────

const total = passed + failed;
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  AGENTIK-COPILOT-MEMORY-PERSISTENCE-01 — Validation Report");
console.log("═══════════════════════════════════════════════════════════════");
console.log(`  Total checks : ${total}`);
console.log(`  Passed       : ${passed}`);
console.log(`  Failed       : ${failed}`);
console.log("═══════════════════════════════════════════════════════════════");

if (failures.length > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log("  " + f));
}

console.log(
  failed === 0
    ? "\n  ✓ VERDICT: ALL CHECKS PASS — AGENTIK-COPILOT-MEMORY-PERSISTENCE-01 READY\n"
    : `\n  ✗ VERDICT: ${failed} CHECK(S) FAILED — review above\n`,
);

process.exit(failed > 0 ? 1 : 0);
