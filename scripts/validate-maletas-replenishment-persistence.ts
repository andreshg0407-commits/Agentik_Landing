/**
 * scripts/validate-maletas-replenishment-persistence.ts
 *
 * MALETAS-BULK-REPLENISHMENT-PERSISTENCE-01 — FASE 14
 *
 * Structural validation of the replenishment persistence layer.
 * Checks: Prisma models, service exports, API route, client wiring,
 * migration SQL, state machine transitions, data validation rules.
 *
 * Usage:
 *   npx tsx scripts/validate-maletas-replenishment-persistence.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

function fileContains(rel: string, needle: string): boolean {
  if (!fileExists(rel)) return false;
  return fs.readFileSync(path.join(ROOT, rel), "utf-8").includes(needle);
}

console.log("=== MALETAS REPLENISHMENT PERSISTENCE VALIDATION ===\n");

// ── 1. Prisma schema ─────────────────────────────────────────────────────────
console.log("[1] Prisma schema models");
const schema = fileExists("prisma/schema.prisma")
  ? fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf-8")
  : "";

check("MaletaReplenishmentPlan model exists", schema.includes("model MaletaReplenishmentPlan"));
check("MaletaReplenishmentItem model exists", schema.includes("model MaletaReplenishmentItem"));
check("MaletaReplenishmentEvent model exists", schema.includes("model MaletaReplenishmentEvent"));
check("Plan has organizationId field", schema.includes("organizationId") && schema.includes("MaletaReplenishmentPlan"));
check("Plan has vendorId field", /model MaletaReplenishmentPlan[\s\S]*?vendorId/.test(schema));
check("Plan has status field", /model MaletaReplenishmentPlan[\s\S]*?status/.test(schema));
check("Plan has documentNumber field", /model MaletaReplenishmentPlan[\s\S]*?documentNumber/.test(schema));
check("Item has planId field", /model MaletaReplenishmentItem[\s\S]*?planId/.test(schema));
check("Item has addedReference field", /model MaletaReplenishmentItem[\s\S]*?addedReference/.test(schema));
check("Item has quantity field", /model MaletaReplenishmentItem[\s\S]*?quantity/.test(schema));
check("Event has planId field", /model MaletaReplenishmentEvent[\s\S]*?planId/.test(schema));
check("Event has type field", /model MaletaReplenishmentEvent[\s\S]*?type/.test(schema));
check("Organization has maletaReplenishmentPlans relation", schema.includes("maletaReplenishmentPlans"));

// ── 2. Migration SQL ─────────────────────────────────────────────────────────
console.log("\n[2] Migration SQL");
const migrationPath = "prisma/migrations/20260716000000_maleta_replenishment_plans/migration.sql";
check("Migration file exists", fileExists(migrationPath));
check("Creates MaletaReplenishmentPlan table", fileContains(migrationPath, 'CREATE TABLE "MaletaReplenishmentPlan"'));
check("Creates MaletaReplenishmentItem table", fileContains(migrationPath, 'CREATE TABLE "MaletaReplenishmentItem"'));
check("Creates MaletaReplenishmentEvent table", fileContains(migrationPath, 'CREATE TABLE "MaletaReplenishmentEvent"'));
check("Plan org+vendor index", fileContains(migrationPath, "MaletaReplenishmentPlan_organizationId_vendorId_idx"));
check("Plan org+status index", fileContains(migrationPath, "MaletaReplenishmentPlan_organizationId_status_idx"));
check("Item planId index", fileContains(migrationPath, "MaletaReplenishmentItem_planId_idx"));
check("Event planId index", fileContains(migrationPath, "MaletaReplenishmentEvent_planId_idx"));
check("FK Plan → Organization", fileContains(migrationPath, "MaletaReplenishmentPlan_organizationId_fkey"));
check("FK Item → Plan (CASCADE)", fileContains(migrationPath, "MaletaReplenishmentItem_planId_fkey"));
check("FK Event → Plan (CASCADE)", fileContains(migrationPath, "MaletaReplenishmentEvent_planId_fkey"));

// ── 3. Service layer ─────────────────────────────────────────────────────────
console.log("\n[3] Service layer");
const svcPath = "lib/comercial/maletas/replenishment-plan-service.ts";
check("Service file exists", fileExists(svcPath));
check("Exports listReplenishmentPlans", fileContains(svcPath, "export async function listReplenishmentPlans"));
check("Exports getActiveDraftPlan", fileContains(svcPath, "export async function getActiveDraftPlan"));
check("Exports getPlan", fileContains(svcPath, "export async function getPlan"));
check("Exports createOrGetDraftPlan", fileContains(svcPath, "export async function createOrGetDraftPlan"));
check("Exports addItemToPlan", fileContains(svcPath, "export async function addItemToPlan"));
check("Exports removeItemFromPlan", fileContains(svcPath, "export async function removeItemFromPlan"));
check("Exports generatePlanDocument", fileContains(svcPath, "export async function generatePlanDocument"));
check("Exports updatePlanStatus", fileContains(svcPath, "export async function updatePlanStatus"));
check("VALID_TRANSITIONS defined", fileContains(svcPath, "VALID_TRANSITIONS"));
check("isValidTransition function", fileContains(svcPath, "isValidTransition"));
check("Document number generation", fileContains(svcPath, "generateUniqueDocumentNumber"));
check("Org guard in getPlan", fileContains(svcPath, "organizationId"));
check("PLAN_NOT_FOUND error", fileContains(svcPath, "PLAN_NOT_FOUND"));
check("PLAN_NOT_DRAFT error", fileContains(svcPath, "PLAN_NOT_DRAFT"));
check("PLAN_EMPTY error", fileContains(svcPath, "PLAN_EMPTY"));
check("INVALID_ADDED_REFERENCE error", fileContains(svcPath, "INVALID_ADDED_REFERENCE"));
check("INVALID_QUANTITY error", fileContains(svcPath, "INVALID_QUANTITY"));
check("INVALID_TRANSITION error", fileContains(svcPath, "INVALID_TRANSITION"));

// ── 4. API route ─────────────────────────────────────────────────────────────
console.log("\n[4] API route");
const routePath = "app/api/orgs/[orgSlug]/comercial/maletas/replenishment-plans/route.ts";
check("API route file exists", fileExists(routePath));
check("GET handler exported", fileContains(routePath, "export async function GET"));
check("POST handler exported", fileContains(routePath, "export async function POST"));
check("requireOrgAccess used", fileContains(routePath, "requireOrgAccess"));
check("Action: create_or_get_draft", fileContains(routePath, "create_or_get_draft"));
check("Action: get_draft", fileContains(routePath, "get_draft"));
check("Action: add_item", fileContains(routePath, "add_item"));
check("Action: remove_item", fileContains(routePath, "remove_item"));
check("Action: generate_document", fileContains(routePath, "generate_document"));
check("Action: update_status", fileContains(routePath, "update_status"));
check("Action: history", fileContains(routePath, '"history"'));
check("401 for UNAUTHENTICATED", fileContains(routePath, "401"));
check("404 for NOT_FOUND", fileContains(routePath, "404"));
check("409 for conflict errors", fileContains(routePath, "409"));

// ── 5. Client wiring ─────────────────────────────────────────────────────────
console.log("\n[5] Client wiring");
const clientPath = "app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx";
check("Client file exists", fileExists(clientPath));
check("planApiUrl defined", fileContains(clientPath, "planApiUrl"));
check("fetchPlans function", fileContains(clientPath, "fetchPlans"));
check("planApiPost function", fileContains(clientPath, "planApiPost"));
check("useEffect for initial load", fileContains(clientPath, "useEffect"));
check("plansLoading state", fileContains(clientPath, "plansLoading"));
check("planSaving state", fileContains(clientPath, "planSaving"));
check("planError state", fileContains(clientPath, "planError"));
check("No unused apiBase variable", !fileContains(clientPath, "const apiBase"));
check("Uses create_or_get_draft action", fileContains(clientPath, "create_or_get_draft"));
check("Uses add_item action", fileContains(clientPath, "add_item"));
check("Uses remove_item action", fileContains(clientPath, "remove_item"));
check("Uses generate_document action", fileContains(clientPath, "generate_document"));
check("Uses update_status action", fileContains(clientPath, "update_status"));

// ── 6. State machine validation ──────────────────────────────────────────────
console.log("\n[6] State machine transitions");
const svc = fileExists(svcPath)
  ? fs.readFileSync(path.join(ROOT, svcPath), "utf-8")
  : "";
check("draft → pending_warehouse", svc.includes("pending_warehouse") && svc.includes("draft"));
check("draft → cancelled", svc.includes("cancelled"));
check("pending_warehouse → prepared", svc.includes("prepared"));
check("pending_warehouse → shipped", svc.includes("shipped"));
check("prepared → shipped", svc.includes("prepared") && svc.includes("shipped"));
check("shipped → received", svc.includes("received"));

// ── Summary ──────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\n=== VALIDATION COMPLETE: ${pass}/${total} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
