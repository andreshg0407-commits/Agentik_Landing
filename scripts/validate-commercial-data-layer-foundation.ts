/**
 * scripts/validate-commercial-data-layer-foundation.ts
 *
 * Validation for COMMERCIAL-DATA-LAYER-FOUNDATION-01.
 * Ensures infrastructure is complete, contracts are present,
 * and no prohibited dependencies exist.
 *
 * Usage: npx tsx scripts/validate-commercial-data-layer-foundation.ts
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, join } from "path";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean): void {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else    { console.log(`  FAIL  ${label}`); failed++; }
}

const BASE = resolve(__dirname, "../lib/comercial/data-layer");

console.log("\n=== COMMERCIAL-DATA-LAYER-FOUNDATION-01 Validation ===\n");

// ── 1. Structure created ─────────────────────────────────────────────────────

console.log("--- 1. Directory structure ---");

const requiredDirs = [
  "adapters",
  "contracts",
  "semantic",
  "repositories",
  "synchronization",
  "quality",
  "snapshots",
  "events",
  "shared",
  "testing",
];

for (const dir of requiredDirs) {
  check(`Directory exists: ${dir}/`, existsSync(join(BASE, dir)));
}

// ── 2. Contracts present ─────────────────────────────────────────────────────

console.log("\n--- 2. Contracts present ---");

const contractFiles = [
  "contracts/canonical-record.ts",
  "contracts/commercial-identity.ts",
  "contracts/external-reference.ts",
  "contracts/data-source-metadata.ts",
  "contracts/synchronization-context.ts",
  "contracts/quality-assessment.ts",
  "contracts/domain-event.ts",
];

for (const file of contractFiles) {
  check(`Contract file: ${file}`, existsSync(join(BASE, file)));
}

// Verify key types exist in contracts
const contractsIndex = readFileSync(join(BASE, "contracts/index.ts"), "utf-8");
const requiredTypes = [
  "CanonicalRecord",
  "CommercialIdentity",
  "CommercialDomain",
  "CommercialTimestamp",
  "ExternalReference",
  "DataSourceMetadata",
  "SynchronizationContext",
  "SynchronizationResult",
  "QualityAssessment",
  "DomainEvent",
];

for (const type of requiredTypes) {
  check(`Type exported: ${type}`, contractsIndex.includes(type));
}

// ── 3. Interfaces present ────────────────────────────────────────────────────

console.log("\n--- 3. Interfaces present ---");

const adapterContract = readFileSync(join(BASE, "adapters/adapter-contract.ts"), "utf-8");
check("CommercialAdapter interface defined", adapterContract.includes("interface CommercialAdapter"));
check("discover() method", adapterContract.includes("discover("));
check("validate() method", adapterContract.includes("validate("));
check("normalize() method", adapterContract.includes("normalize("));
check("synchronize() method", adapterContract.includes("synchronize("));
check("health() method", adapterContract.includes("health("));
check("capabilities() method", adapterContract.includes("capabilities("));

const repoContract = readFileSync(join(BASE, "repositories/repository-contract.ts"), "utf-8");
check("CommercialRepository interface defined", repoContract.includes("interface CommercialRepository"));
check("find() method", repoContract.includes("find("));
check("findByExternalId() method", repoContract.includes("findByExternalId("));
check("upsert() method", repoContract.includes("upsert("));
check("bulkUpsert() method", repoContract.includes("bulkUpsert("));
check("delete() method", repoContract.includes("delete("));
check("snapshot() method", repoContract.includes("snapshot("));

// ── 4. Adapters empty (no concrete implementations) ──────────────────────────

console.log("\n--- 4. No concrete adapter implementations ---");

const adapterDir = readdirSync(join(BASE, "adapters"));
check("No ProductAdapter file", !adapterDir.some(f => f.toLowerCase().includes("product")));
check("No CustomerAdapter file", !adapterDir.some(f => f.toLowerCase().includes("customer")));
check("No SalesAdapter file", !adapterDir.some(f => f.toLowerCase().includes("sale")));
check("No InventoryAdapter file", !adapterDir.some(f => f.toLowerCase().includes("inventory")));
check("No SAGAdapter file", !adapterDir.some(f => f.toLowerCase().includes("sag")));

// ── 5. No business logic ─────────────────────────────────────────────────────

console.log("\n--- 5. No business logic ---");

function getAllFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else if (entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

const allFiles = getAllFiles(BASE);
let hasBusinessLogic = false;

for (const file of allFiles) {
  const content = readFileSync(file, "utf-8");
  if (content.includes("calculateRotation") || content.includes("evaluateCoverage") || content.includes("buildRepurchase")) {
    hasBusinessLogic = true;
  }
}
check("No business logic functions", !hasBusinessLogic);

// ── 6. No SAG imports ────────────────────────────────────────────────────────

console.log("\n--- 6. No SAG imports ---");

let hasSagImport = false;
for (const file of allFiles) {
  const content = readFileSync(file, "utf-8");
  if (content.includes("from") && (content.includes("/sag/") || content.includes("sag-") || content.includes("SAG_API"))) {
    hasSagImport = true;
  }
}
check("No imports from SAG modules", !hasSagImport);

// ── 7. No Prisma imports ─────────────────────────────────────────────────────

console.log("\n--- 7. No Prisma imports ---");

let hasPrismaImport = false;
for (const file of allFiles) {
  const content = readFileSync(file, "utf-8");
  if (content.includes("from \"@prisma") || content.includes("from '@prisma") || content.includes("prisma.") || content.includes("PrismaClient")) {
    hasPrismaImport = true;
  }
}
check("No Prisma imports", !hasPrismaImport);

// ── 8. No React imports ──────────────────────────────────────────────────────

console.log("\n--- 8. No React imports ---");

let hasReactImport = false;
for (const file of allFiles) {
  const content = readFileSync(file, "utf-8");
  if (content.includes("from \"react\"") || content.includes("from 'react'") || content.includes("\"use client\"")) {
    hasReactImport = true;
  }
}
check("No React imports", !hasReactImport);

// ── 9. No UI imports ─────────────────────────────────────────────────────────

console.log("\n--- 9. No UI imports ---");

let hasUIImport = false;
for (const file of allFiles) {
  const content = readFileSync(file, "utf-8");
  if (content.includes("components/") || content.includes("lib/ui/") || content.includes("@/components")) {
    hasUIImport = true;
  }
}
check("No UI component imports", !hasUIImport);

// ── 10. No domain-specific implementations ───────────────────────────────────

console.log("\n--- 10. No domain-specific implementations ---");

const domainKeywords = ["ProductProfile", "CustomerProfile", "SaleLine", "InventoryPosition", "StoreCoverageRule"];
let hasDomainSpecific = false;
for (const file of allFiles) {
  const content = readFileSync(file, "utf-8");
  for (const keyword of domainKeywords) {
    if (content.includes(`interface ${keyword}`) || content.includes(`type ${keyword} =`)) {
      hasDomainSpecific = true;
    }
  }
}
check("No domain-specific entity definitions", !hasDomainSpecific);

// ── 11. No synchronization implemented ───────────────────────────────────────

console.log("\n--- 11. No synchronization implemented ---");

const syncDir = readdirSync(join(BASE, "synchronization"));
check("Only contract files in synchronization/", syncDir.every(f => f.includes("contract") || f === "index.ts"));

let hasFetchCall = false;
for (const file of allFiles) {
  const content = readFileSync(file, "utf-8");
  if (content.includes("await fetch(") || content.includes("axios.get") || content.includes("httpClient")) {
    hasFetchCall = true;
  }
}
check("No HTTP calls (fetch/axios)", !hasFetchCall);

// ── 12. Exports consistent ───────────────────────────────────────────────────

console.log("\n--- 12. Barrel exports consistent ---");

for (const dir of requiredDirs) {
  const indexPath = join(BASE, dir, "index.ts");
  check(`Barrel export exists: ${dir}/index.ts`, existsSync(indexPath));
}
check("Top-level index.ts exists", existsSync(join(BASE, "index.ts")));

const topIndex = readFileSync(join(BASE, "index.ts"), "utf-8");
check("Top barrel exports contracts", topIndex.includes("./contracts"));
check("Top barrel exports adapters", topIndex.includes("./adapters"));
check("Top barrel exports repositories", topIndex.includes("./repositories"));
check("Top barrel exports synchronization", topIndex.includes("./synchronization"));
check("Top barrel exports quality", topIndex.includes("./quality"));
check("Top barrel exports snapshots", topIndex.includes("./snapshots"));
check("Top barrel exports events", topIndex.includes("./events"));
check("Top barrel exports shared", topIndex.includes("./shared"));
check("Top barrel exports semantic", topIndex.includes("./semantic"));

// ── 13. Synchronization pipeline stages ──────────────────────────────────────

console.log("\n--- 13. Pipeline stages defined ---");

const pipelineContent = readFileSync(join(BASE, "synchronization/pipeline-contract.ts"), "utf-8");
const stages = ["DiscoverStage", "ExtractStage", "NormalizeStage", "ValidateStage", "QualityStage", "PersistStage", "SnapshotStage", "EventStage", "MetricsStage"];
for (const stage of stages) {
  check(`Pipeline stage: ${stage}`, pipelineContent.includes(stage));
}

// ── 14. Quality dimensions ───────────────────────────────────────────────────

console.log("\n--- 14. Quality dimensions ---");

const qualityContent = readFileSync(join(BASE, "quality/quality-types.ts"), "utf-8");
const dimensions = ["Confidence", "Completeness", "Consistency", "Freshness", "Validity", "Origin"];
for (const dim of dimensions) {
  check(`Quality dimension: ${dim}`, qualityContent.includes(`interface ${dim}`));
}

// ── 15. Event catalog ────────────────────────────────────────────────────────

console.log("\n--- 15. Event catalog ---");

const eventContent = readFileSync(join(BASE, "events/event-catalog.ts"), "utf-8");
const events = ["SynchronizationStarted", "SynchronizationCompleted", "SnapshotCreated", "RecordRejected", "QualityIssueDetected", "AdapterHealthChanged"];
for (const event of events) {
  check(`Event type: ${event}`, eventContent.includes(event));
}

// ── 16. Semantic contracts ───────────────────────────────────────────────────

console.log("\n--- 16. Semantic contracts ---");

const semanticContent = readFileSync(join(BASE, "semantic/semantic-contract.ts"), "utf-8");
const semanticTypes = ["SemanticMappingContract", "SemanticEvidence", "SemanticNormalizer", "SemanticValidation", "SemanticConfidence"];
for (const st of semanticTypes) {
  check(`Semantic type: ${st}`, semanticContent.includes(st));
}

// ── 17. Testing utilities ────────────────────────────────────────────────────

console.log("\n--- 17. Testing utilities ---");

const testContent = readFileSync(join(BASE, "testing/mock-adapter.ts"), "utf-8");
check("createMockAdapter factory", testContent.includes("createMockAdapter"));
check("createMockSyncContext factory", testContent.includes("createMockSyncContext"));
check("createMockQuality factory", testContent.includes("createMockQuality"));

// ── 18. Documentation exists ─────────────────────────────────────────────────

console.log("\n--- 18. Documentation ---");

const docPath = resolve(__dirname, "../docs/architecture/COMMERCIAL_DATA_LAYER_FOUNDATION_01.md");
check("Foundation doc exists", existsSync(docPath));

const docContent = readFileSync(docPath, "utf-8");
check("Doc has directory structure", docContent.includes("Directory Structure"));
check("Doc has dependency rules", docContent.includes("Dependency Rules"));
check("Doc has how-to-implement guide", docContent.includes("How to implement"));
check("Doc answers success criteria", docContent.includes("success criteria"));

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("FOUNDATION VALIDATION FAILED.\n");
  process.exit(1);
} else {
  console.log("FOUNDATION VALIDATION PASSED — COMMERCIAL-DATA-LAYER-FOUNDATION-01 complete.\n");
}
