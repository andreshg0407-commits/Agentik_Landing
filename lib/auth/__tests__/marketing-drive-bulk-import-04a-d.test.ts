/**
 * lib/auth/__tests__/marketing-drive-bulk-import-04a-d.test.ts
 *
 * MARKETING-DRIVE-BULK-ASSET-INGESTION-04A-D — Server Authority + Role Fix: 14 Tests
 *
 * Source-reading pattern. No mocks, no DB, no network. Deterministic.
 */

// @ts-expect-error — vitest resolves at runtime, TSC does not have vitest types
import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── Source files ────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "../../..");

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

const driveRouteSrc       = readSrc("app/api/orgs/[orgSlug]/marketing-studio/drive/route.ts");
const bulkImportDrawerSrc = readSrc("components/marketing-studio/library/bulk-import-drawer.tsx");
const dryRunTypesSrc      = readSrc("lib/marketing-studio/bulk-import/drive-dry-run-types.ts");
const dryRunEngineSrc     = readSrc("lib/marketing-studio/bulk-import/drive-dry-run-engine.ts");
const setRootRouteSrc     = readSrc("app/api/orgs/[orgSlug]/marketing-studio/drive/set-root/route.ts");
const moduleAccessSrc     = readSrc("lib/auth/module-access.ts");

// ── T01: Server-side analysis per scan-page ────────────────────────────────

describe("04A-D-B: Server-side analysis", () => {
  test("T01: scan-page runs runDryRun server-side and returns DryRunFileDetail[]", () => {
    // scan-page handler calls runDryRun
    const scanPageIdx = driveRouteSrc.indexOf('action === "scan-page"');
    expect(scanPageIdx).toBeGreaterThan(-1);
    const afterScanPage = driveRouteSrc.slice(scanPageIdx, scanPageIdx + 4000);
    expect(afterScanPage).toContain("runDryRun");
    expect(afterScanPage).toContain("buildProductMapsForDryRun");
    expect(afterScanPage).toContain("getImportedDriveFileIds");
    expect(afterScanPage).toContain("pageAnalysis.files");
    // Returns analyzedFiles not scannedFiles
    expect(afterScanPage).toContain("analyzedFiles");
  });
});

// ── T02: Client accumulates server-analyzed rows, no POST ──────────────────

describe("04A-D-B: Client authority eliminated", () => {
  test("T02: Drawer accumulates DryRunFileDetail[] and never POSTs raw file data", () => {
    // Accumulates server-issued DryRunFileDetail
    expect(bulkImportDrawerSrc).toContain("DryRunFileDetail[]");
    expect(bulkImportDrawerSrc).toContain("accumulatedFiles");
    expect(bulkImportDrawerSrc).toContain("page.analyzedFiles");
    // 04A-F: POST is allowed ONLY for set-root (admin config write), not for file data.
    const postMatches = bulkImportDrawerSrc.match(/method:\s*"POST"/g) ?? [];
    expect(postMatches.length).toBeLessThanOrEqual(1);
    if (postMatches.length === 1) {
      const postIdx = bulkImportDrawerSrc.indexOf('method: "POST"');
      const postContext = bulkImportDrawerSrc.slice(Math.max(0, postIdx - 200), postIdx + 200);
      expect(postContext).toContain("set-root");
    }
    expect(bulkImportDrawerSrc).not.toContain("method: 'POST'");
    // No DriveScannedFile import (client never sees raw metadata)
    expect(bulkImportDrawerSrc).not.toContain("DriveScannedFile");
  });
});

// ── T03: Client builds summary from server-issued data ────────────────────

describe("04A-D-B: Client summary builder", () => {
  test("T03: buildClientSummary counts from server-issued DryRunFileDetail[]", () => {
    expect(bulkImportDrawerSrc).toContain("buildClientSummary");
    expect(bulkImportDrawerSrc).toContain("statusBreakdown");
    expect(bulkImportDrawerSrc).toContain("assetTypeBreakdown");
    expect(bulkImportDrawerSrc).toContain("uniqueRefsMatched");
    expect(bulkImportDrawerSrc).toContain("uniqueRefsUnmatched");
    expect(bulkImportDrawerSrc).toContain("readyToImport");
    expect(bulkImportDrawerSrc).toContain("rejected");
  });
});

// ── T04: ScanPageResult uses DryRunFileDetail[] ───────────────────────────

describe("04A-D-B: Type contract", () => {
  test("T04: ScanPageResult.analyzedFiles is DryRunFileDetail[] (not DriveScannedFile[])", () => {
    expect(dryRunTypesSrc).toContain("analyzedFiles:");
    expect(dryRunTypesSrc).toContain("DryRunFileDetail[]");
    // No more DriveScannedFile reference in ScanPageResult
    expect(dryRunTypesSrc).not.toContain("DriveScannedFile");
  });
});

// ── T05: STALE_DRIVE_FILE status code exists ──────────────────────────────

describe("04A-D-C: Staleness detection", () => {
  test("T05: STALE_DRIVE_FILE status code in type definition and drawer labels", () => {
    expect(dryRunTypesSrc).toContain("STALE_DRIVE_FILE");
    expect(bulkImportDrawerSrc).toContain("STALE_DRIVE_FILE");
    // Drawer has a label for it (04A-D-R1: contract-ready, pending revalidation)
    expect(bulkImportDrawerSrc).toContain("Pendiente revalidar");
  });
});

// ── T06: set-root allows ORG_ADMIN ────────────────────────────────────────

describe("04A-D-A: Role authority fix", () => {
  test("T06: set-root uses three-condition gate (04A-D-R1)", () => {
    // 04A-D-R1: explicit platformRole + membership.role gate (no hasMinRole)
    expect(setRootRouteSrc).toContain('"ORG_ADMIN"');
    expect(setRootRouteSrc).toContain("isSetRootAuthorized");
    expect(setRootRouteSrc).toContain('platformRole === "SUPER_ADMIN"');
    expect(setRootRouteSrc).toContain('platformRole === "AGENTIK_ADMIN"');
    expect(setRootRouteSrc).toContain('membership.role === "ORG_ADMIN"');
  });
});

// ── T07: Role hierarchy is correct ──────────────────────────────────────

describe("04A-D-A: Role hierarchy audit", () => {
  test("T07: ROLE_HIERARCHY has all 7 roles in ascending authority order", () => {
    expect(moduleAccessSrc).toContain("VIEWER");
    expect(moduleAccessSrc).toContain("BILLING");
    expect(moduleAccessSrc).toContain("OPERATOR");
    expect(moduleAccessSrc).toContain("MANAGER");
    expect(moduleAccessSrc).toContain("ORG_ADMIN");
    expect(moduleAccessSrc).toContain("AGENTIK_ADMIN");
    expect(moduleAccessSrc).toContain("SUPER_ADMIN");
    // VIEWER is lowest
    const viewerIdx = moduleAccessSrc.indexOf('"VIEWER"');
    const superIdx  = moduleAccessSrc.indexOf('"SUPER_ADMIN"');
    expect(viewerIdx).toBeLessThan(superIdx);
    // ORG_ADMIN < AGENTIK_ADMIN in hierarchy
    const orgAdminIdx = moduleAccessSrc.indexOf('"ORG_ADMIN"');
    const agentikIdx  = moduleAccessSrc.indexOf('"AGENTIK_ADMIN"');
    expect(orgAdminIdx).toBeLessThan(agentikIdx);
  });
});

// ── T08: Marketing Studio access requires MANAGER+ ──────────────────────

describe("04A-D-A: Marketing Studio access gate", () => {
  test("T08: canAccessMarketingStudio allows SUPER_ADMIN, AGENTIK_ADMIN, ORG_ADMIN, MANAGER", () => {
    const fn = moduleAccessSrc.slice(moduleAccessSrc.indexOf("function canAccessMarketingStudio"));
    expect(fn).toContain("SUPER_ADMIN");
    expect(fn).toContain("AGENTIK_ADMIN");
    expect(fn).toContain("ORG_ADMIN");
    expect(fn).toContain("MANAGER");
    // Does NOT include OPERATOR, BILLING, VIEWER
    const fnBlock = fn.slice(0, fn.indexOf("}"));
    expect(fnBlock).not.toContain("OPERATOR");
    expect(fnBlock).not.toContain("BILLING");
    expect(fnBlock).not.toContain("VIEWER");
  });
});

// ── T09: Server-side product map building per page ──────────────────────

describe("04A-D-B: Server product maps", () => {
  test("T09: scan-page loads product maps server-side for each page", () => {
    const scanPageIdx = driveRouteSrc.indexOf('action === "scan-page"');
    const afterScanPage = driveRouteSrc.slice(scanPageIdx, scanPageIdx + 4000);
    // Product maps built server-side
    expect(afterScanPage).toContain("buildProductMapsForDryRun(organizationId)");
    expect(afterScanPage).toContain("getImportedDriveFileIds(organizationId)");
    expect(afterScanPage).toContain("activeProductIds");
    // DryRunContext passed to runDryRun
    expect(afterScanPage).toContain("tenantRootId");
    expect(afterScanPage).toContain("skuToProduct");
    expect(afterScanPage).toContain("productsWithHero");
  });
});

// ── T10: Dedup by driveFileId in 04A-D ──────────────────────────────────

describe("04A-D-B: Client dedup", () => {
  test("T10: Client deduplicates by driveFileId from DryRunFileDetail", () => {
    expect(bulkImportDrawerSrc).toContain("seenFileIds.has(f.driveFileId)");
    expect(bulkImportDrawerSrc).toContain("seenFileIds.add(f.driveFileId)");
  });
});

// ── T11: Zero writes preserved across all layers ────────────────────────

describe("04A-D-F: Zero writes", () => {
  test("T11: Engine is zero-writes, drawer has no asset-write methods, no prisma in engine", () => {
    // Engine: zero writes, no prisma
    expect(dryRunEngineSrc).toContain("ZERO WRITES");
    expect(dryRunEngineSrc).not.toContain("prisma.");
    // 04A-F: POST allowed ONLY for set-root (admin config), no other write methods
    const postMatches = bulkImportDrawerSrc.match(/method:\s*"POST"/g) ?? [];
    expect(postMatches.length).toBeLessThanOrEqual(1);
    expect(bulkImportDrawerSrc).not.toContain('method: "PUT"');
    expect(bulkImportDrawerSrc).not.toContain('method: "PATCH"');
    expect(bulkImportDrawerSrc).not.toContain('method: "DELETE"');
    // Drawer: no Prisma or entity operations (Map.delete/URL.createObjectURL are OK)
    expect(bulkImportDrawerSrc).not.toContain("prisma.");
    expect(bulkImportDrawerSrc).not.toContain("ProductEntity");
    expect(bulkImportDrawerSrc).not.toContain("uploadTo");
  });
});

// ── T12: IntegrationResource root storage evidence ─────────────────────

describe("04A-D-D: Root storage evidence", () => {
  test("T12: Tenant root stored via IntegrationResource with uniqueness key", () => {
    const tenantRootSrc = readSrc("lib/marketing-studio/drive/drive-tenant-root.ts");
    // Uses IntegrationResource model
    expect(tenantRootSrc).toContain("integrationResource");
    // Upsert with composite key
    expect(tenantRootSrc).toContain("organizationId_provider_externalId");
    // Deselects previous roots before setting new one
    expect(tenantRootSrc).toContain("selected: false");
    expect(tenantRootSrc).toContain("selected:     true");
    // Provider and type constants
    expect(tenantRootSrc).toContain("google_drive");
    expect(tenantRootSrc).toContain("root_folder");
  });
});

// ── T13: Prior tests preserved ──────────────────────────────────────────

describe("04A-D-H: Prior tests preserved", () => {
  test("T13: R1 + 04A + 04A-B + 04A-C test files still exist", () => {
    const r1Exists = fs.existsSync(path.join(ROOT, "lib/auth/__tests__/marketing-r4a-security-closeout-r1.test.ts"));
    const t04aExists = fs.existsSync(path.join(ROOT, "lib/auth/__tests__/marketing-drive-bulk-asset-ingestion-04a.test.ts"));
    const t04abExists = fs.existsSync(path.join(ROOT, "lib/auth/__tests__/marketing-drive-bulk-import-04a-b.test.ts"));
    const t04acExists = fs.existsSync(path.join(ROOT, "lib/auth/__tests__/marketing-drive-bulk-import-04a-c.test.ts"));
    expect(r1Exists).toBe(true);
    expect(t04aExists).toBe(true);
    expect(t04abExists).toBe(true);
    expect(t04acExists).toBe(true);
  });
});

// ── T14: Completeness contract preserved from 04A-C ─────────────────────

describe("04A-D-H: Completeness contract preserved", () => {
  test("T14: complete/truncated fields still enforced in drawer and route", () => {
    // Drawer still computes completeness from queue + errors
    expect(bulkImportDrawerSrc).toContain("const complete = !truncated");
    expect(bulkImportDrawerSrc).toContain("queue.length === 0");
    expect(bulkImportDrawerSrc).toContain("allErrors.length === 0");
    expect(bulkImportDrawerSrc).toContain("INCOMPLETO");
    // Route still has folderExhausted logic
    expect(driveRouteSrc).toContain("folderExhausted");
    expect(driveRouteSrc).toContain("pageResult.nextPageToken === null");
    // Type contract preserved
    expect(dryRunTypesSrc).toContain("complete:         boolean");
    expect(dryRunTypesSrc).toContain("truncated:        boolean");
  });
});
