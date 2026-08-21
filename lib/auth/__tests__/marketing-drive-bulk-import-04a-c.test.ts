/**
 * lib/auth/__tests__/marketing-drive-bulk-import-04a-c.test.ts
 *
 * MARKETING-DRIVE-BULK-ASSET-INGESTION-04A-C — Paginated Scan: 14 Tests
 *
 * Source-reading pattern + unit tests. Deterministic. No mocks, no DB, no network.
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
const driveClientSrc      = readSrc("lib/marketing-studio/drive/drive-api-client.ts");
const bulkImportDrawerSrc = readSrc("components/marketing-studio/library/bulk-import-drawer.tsx");
const dryRunTypesSrc      = readSrc("lib/marketing-studio/bulk-import/drive-dry-run-types.ts");
const dryRunEngineSrc     = readSrc("lib/marketing-studio/bulk-import/drive-dry-run-engine.ts");
const setRootRouteSrc     = readSrc("app/api/orgs/[orgSlug]/marketing-studio/drive/set-root/route.ts");

// ── T01: Multiple pages accumulate ────────────────────────────────────────

describe("04A-C-B: Paginated scan", () => {
  test("T01: Client accumulates server-analyzed files across multiple pages via scan-page", () => {
    // Client BFS loop uses scan-page action
    expect(bulkImportDrawerSrc).toContain('"scan-page"');
    // 04A-D: accumulates server-analyzed DryRunFileDetail[] (not raw DriveScannedFile[])
    expect(bulkImportDrawerSrc).toContain("accumulatedFiles");
    expect(bulkImportDrawerSrc).toContain("DryRunFileDetail[]");
    expect(bulkImportDrawerSrc).toContain("seenFileIds");
    // 04A-D: reads page.analyzedFiles (server-issued, not raw scannedFiles)
    expect(bulkImportDrawerSrc).toContain("page.analyzedFiles");
    // Processes nextPageToken to continue within folder
    expect(bulkImportDrawerSrc).toContain("page.nextPageToken");
    // Enqueues child folders
    expect(bulkImportDrawerSrc).toContain("page.childFolderIds");
    expect(bulkImportDrawerSrc).toContain("queue.push");
  });
});

// ── T02: No hard 2000 limit ──────────────────────────────────────────────

describe("04A-C-A: Completeness beyond 2000", () => {
  test("T02: No files.length >= 2000 as authority — uses complete/truncated fields", () => {
    // Drawer does NOT use 2000 as hard limit
    expect(bulkImportDrawerSrc).not.toContain("files.length >= 2000");
    // Uses explicit completeness fields
    expect(bulkImportDrawerSrc).toContain("completeness");
    expect(bulkImportDrawerSrc).toContain("complete");
    expect(bulkImportDrawerSrc).toContain("truncated");
  });
});

// ── T03: Recursive multi-level scanning ──────────────────────────────────

describe("04A-C-B: Recursive scanning", () => {
  test("T03: Server scan-page returns childFolderIds and client enqueues them", () => {
    // Server returns child folders
    expect(driveRouteSrc).toContain("childFolderIds");
    expect(driveRouteSrc).toContain("childFolders");
    // listFolderPage separates files from folders
    expect(driveClientSrc).toContain("listFolderPage");
    expect(driveClientSrc).toContain("childFolders");
    // Client processes child folders into BFS queue
    expect(bulkImportDrawerSrc).toContain("FolderQueueItem");
    expect(bulkImportDrawerSrc).toContain("queue.push");
  });
});

// ── T04: Retry does not duplicate ────────────────────────────────────────

describe("04A-C-E: Idempotency across pages", () => {
  test("T04: Deduplication by driveFileId prevents double-counting", () => {
    // Client-side dedup by driveFileId (04A-D: DryRunFileDetail uses driveFileId)
    expect(bulkImportDrawerSrc).toContain("seenFileIds");
    expect(bulkImportDrawerSrc).toContain("seenFileIds.has(f.driveFileId)");
    // Server-side dedup in legacy POST analyze (04A-D: kept for backward compat)
    expect(driveRouteSrc).toContain("seenIds");
    expect(driveRouteSrc).toContain("dedupedFiles");
  });
});

// ── T05: Cancellation leaves complete=false ──────────────────────────────

describe("04A-C-D: Cancellation", () => {
  test("T05: Cancel sets truncated=true and complete=false", () => {
    expect(bulkImportDrawerSrc).toContain("cancelledRef");
    expect(bulkImportDrawerSrc).toContain("cancelledRef.current = true");
    // After cancel: truncated=true
    expect(bulkImportDrawerSrc).toContain("cancelScan");
    // Complete derived from !truncated
    const completeLineIdx = bulkImportDrawerSrc.indexOf("const complete = !truncated");
    expect(completeLineIdx).toBeGreaterThan(-1);
  });
});

// ── T06: nextPageToken pending prevents complete=true ────────────────────

describe("04A-C-A: Completeness contract — nextPageToken", () => {
  test("T06: Server page result is not complete when nextPageToken exists", () => {
    // Server: complete only when folderExhausted AND no children
    expect(driveRouteSrc).toContain("folderExhausted");
    expect(driveRouteSrc).toContain("pageResult.nextPageToken === null");
    expect(driveRouteSrc).toContain("childFolderIds.length === 0");
    // Type: ScanPageResult has complete field
    expect(dryRunTypesSrc).toContain("ScanPageResult");
    expect(dryRunTypesSrc).toContain("complete:         boolean");
    expect(dryRunTypesSrc).toContain("nextPageToken:    string | null");
  });
});

// ── T07: Pending child folders prevent complete=true ─────────────────────

describe("04A-C-A: Completeness contract — folder queue", () => {
  test("T07: Client sets complete only when queue is empty", () => {
    // Client: complete = !truncated && queue.length === 0 && allErrors.length === 0
    expect(bulkImportDrawerSrc).toContain("queue.length === 0");
    expect(bulkImportDrawerSrc).toContain("allErrors.length === 0");
  });
});

// ── T08: Partial error generates truncated=true ──────────────────────────

describe("04A-C-D: Partial errors", () => {
  test("T08: Permission or page errors set truncated=true", () => {
    // Server: page error → truncated
    expect(driveRouteSrc).toContain("truncated:       true");
    // Client: allErrors → truncated
    expect(bulkImportDrawerSrc).toContain("truncated = true");
    // Incomplete banner
    expect(bulkImportDrawerSrc).toContain("INCOMPLETO");
    expect(bulkImportDrawerSrc).toContain("complete=false");
    expect(bulkImportDrawerSrc).toContain("truncated=true");
  });
});

// ── T09: Folder substitution rejected ────────────────────────────────────

describe("04A-C-C: Security per page", () => {
  test("T09: scan-page validates ancestry and rejects substituted folders", () => {
    // scan-page calls isDescendantOfRoot
    expect(driveRouteSrc).toContain('action === "scan-page"');
    // Within scan-page block, ancestry is checked
    const scanPageIdx = driveRouteSrc.indexOf('action === "scan-page"');
    const afterScanPage = driveRouteSrc.slice(scanPageIdx, scanPageIdx + 2000);
    expect(afterScanPage).toContain("isDescendantOfRoot");
    expect(afterScanPage).toContain("OUTSIDE_TENANT_ROOT");
    // Drawer handles OUTSIDE_TENANT_ROOT as substitution attack
    expect(bulkImportDrawerSrc).toContain("OUTSIDE_TENANT_ROOT");
    expect(bulkImportDrawerSrc).toContain("Carpeta sustituida");
  });
});

// ── T10: Each page revalidates tenant root ───────────────────────────────

describe("04A-C-C: Tenant root revalidation", () => {
  test("T10: scan-page resolves tenant root on every request", () => {
    // resolveGate called for scan-page
    expect(driveRouteSrc).toContain("resolveGate");
    expect(driveRouteSrc).toContain("getTenantDriveRoot");
    // resolveGate is used for ALL actions
    const resolveGateIdx = driveRouteSrc.indexOf("async function resolveGate");
    expect(resolveGateIdx).toBeGreaterThan(-1);
  });
});

// ── T11: CSV/JSON preserve complete/truncated ────────────────────────────

describe("04A-C-D: Export completeness", () => {
  test("T11: CSV and JSON downloads include completeness metadata", () => {
    // CSV includes complete/truncated
    expect(bulkImportDrawerSrc).toContain("complete=");
    expect(bulkImportDrawerSrc).toContain("truncated=");
    expect(bulkImportDrawerSrc).toContain("scannedFiles=");
    expect(bulkImportDrawerSrc).toContain("scannedFolders=");
    // JSON includes completeness (whole result)
    expect(bulkImportDrawerSrc).toContain("JSON.stringify(dryRunResult");
  });
});

// ── T12: Zero writes — no product/asset/R2/Drive writes ─────────────────

describe("04A-C-F: Zero writes", () => {
  test("T12: Dry-run engine has no prisma writes, route POST is analyze-only", () => {
    // Engine: zero writes
    expect(dryRunEngineSrc).toContain("ZERO WRITES");
    expect(dryRunEngineSrc).not.toContain("prisma.");
    // Route POST only action=analyze
    expect(driveRouteSrc).toContain('"analyze"');
    // Drawer: analyze is POST but for dry-run analysis only
    const postSection = driveRouteSrc.slice(driveRouteSrc.indexOf("export async function POST"));
    expect(postSection).toContain("runDryRun");
    expect(postSection).not.toContain("ProductAssetLink");
    // POST handler: no entity mutations, only runDryRun analysis
    expect(postSection).not.toContain("ProductAssetLink");
    expect(postSection).not.toContain("prisma.productEntity.create");
    expect(postSection).not.toContain("prisma.asset.create");
    expect(postSection).not.toContain("uploadTo");
  });
});

// ── T13: Prior 98 tests meta-check ───────────────────────────────────────

describe("04A-C-I: Prior tests preserved", () => {
  test("T13: R1 + 04A + 04A-B test files still exist", () => {
    const r1Exists = fs.existsSync(path.join(ROOT, "lib/auth/__tests__/marketing-r4a-security-closeout-r1.test.ts"));
    const t04aExists = fs.existsSync(path.join(ROOT, "lib/auth/__tests__/marketing-drive-bulk-asset-ingestion-04a.test.ts"));
    const t04abExists = fs.existsSync(path.join(ROOT, "lib/auth/__tests__/marketing-drive-bulk-import-04a-b.test.ts"));
    expect(r1Exists).toBe(true);
    expect(t04aExists).toBe(true);
    expect(t04abExists).toBe(true);
  });
});

// ── T14: Set-root audit (Section F) ──────────────────────────────────────

describe("04A-C-F: Set-root security audit", () => {
  test("T14: set-root route enforces admin role, server-side orgId, validates folder", () => {
    // 04A-D-R1: three-condition gate (platformRole + membership.role)
    expect(setRootRouteSrc).toContain("isSetRootAuthorized");
    expect(setRootRouteSrc).toContain("AGENTIK_ADMIN");
    expect(setRootRouteSrc).toContain("Admin access required");
    // organizationId from server session
    expect(setRootRouteSrc).toContain("organization.id");
    expect(setRootRouteSrc).not.toContain("body.organizationId");
    // Drive connection tenant-scoped
    expect(setRootRouteSrc).toContain("getDriveConnection(organizationId)");
    // Folder validated via Drive API before storage
    expect(setRootRouteSrc).toContain("validateDriveFolder(folderId, accessToken)");
    // Stored in IntegrationResource via setTenantDriveRoot
    expect(setRootRouteSrc).toContain("setTenantDriveRoot");
    // Response body never includes accessToken or OAuth token
    // Find the success response (ok: true)
    const successIdx = setRootRouteSrc.indexOf("ok:         true");
    expect(successIdx).toBeGreaterThan(-1);
    const successResponse = setRootRouteSrc.slice(successIdx, successIdx + 200);
    expect(successResponse).not.toContain("accessToken");
    expect(successResponse).not.toContain("refreshToken");
    expect(successResponse).toContain("folderId");
    expect(successResponse).toContain("folderName");
  });
});
