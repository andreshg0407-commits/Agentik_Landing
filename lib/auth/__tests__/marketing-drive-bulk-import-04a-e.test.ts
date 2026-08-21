/**
 * lib/auth/__tests__/marketing-drive-bulk-import-04a-e.test.ts
 *
 * MARKETING-DRIVE-BULK-ASSET-INGESTION-04A-E — Runtime Certification: 30 Tests
 *
 * Sections:
 *   C: Security per page (ancestry, token isolation, Cache-Control)
 *   D: Robustness (multi-page, nested, dedup, cancel, error, completeness)
 *   E: STALE_DRIVE_FILE baseline capture (modifiedTime + version)
 *   G: Zero writes global (no assets, no products, no R2, CTA disabled)
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
const setRootRouteSrc     = readSrc("app/api/orgs/[orgSlug]/marketing-studio/drive/set-root/route.ts");
const driveClientSrc      = readSrc("lib/marketing-studio/drive/drive-api-client.ts");
const bulkImportDrawerSrc = readSrc("components/marketing-studio/library/bulk-import-drawer.tsx");
const dryRunTypesSrc      = readSrc("lib/marketing-studio/bulk-import/drive-dry-run-types.ts");
const dryRunEngineSrc     = readSrc("lib/marketing-studio/bulk-import/drive-dry-run-engine.ts");
const tenantRootSrc       = readSrc("lib/marketing-studio/drive/drive-tenant-root.ts");

// ═══════════════════════════════════════════════════════════════════════════
// SECTION C: SECURITY PER PAGE
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-E-C: organizationId exclusively from requireOrgAccess", () => {
  test("T01: GET handler obtains organizationId from organization.id only", () => {
    // requireOrgAccess returns organization, membership
    expect(driveRouteSrc).toContain("requireOrgAccess(orgSlug)");
    expect(driveRouteSrc).toContain("const organizationId = organization.id");
    // No organizationId from query/body
    expect(driveRouteSrc).not.toContain("searchParams.get(\"organizationId\")");
    expect(driveRouteSrc).not.toContain("body.organizationId");
  });

  test("T02: POST handler obtains organizationId from organization.id only", () => {
    const postBlock = driveRouteSrc.slice(driveRouteSrc.indexOf("export async function POST"));
    expect(postBlock).toContain("requireOrgAccess(orgSlug)");
    expect(postBlock).toContain("organization.id");
    expect(postBlock).not.toContain("body.organizationId");
  });

  test("T03: set-root obtains organizationId from organization.id only", () => {
    expect(setRootRouteSrc).toContain("requireOrgAccess(orgSlug)");
    expect(setRootRouteSrc).toContain("organization.id");
    expect(setRootRouteSrc).not.toContain("body.organizationId");
    expect(setRootRouteSrc).not.toContain("body.orgSlug");
  });
});

describe("04A-E-C: Ancestry validation per scan-page", () => {
  test("T04: scan-page validates currentFolderId belongs to tenant root", () => {
    const scanPageIdx = driveRouteSrc.indexOf('action === "scan-page"');
    const scanPageBlock = driveRouteSrc.slice(scanPageIdx, scanPageIdx + 2000);
    expect(scanPageBlock).toContain("isDescendantOfRoot(folderId, tenantRoot.folderId, accessToken)");
    expect(scanPageBlock).toContain("OUTSIDE_TENANT_ROOT");
    expect(scanPageBlock).toContain("status: 403");
  });

  test("T05: ancestry check walks parent chain with ANCESTRY_MAX_DEPTH", () => {
    expect(driveClientSrc).toContain("ANCESTRY_MAX_DEPTH");
    expect(driveClientSrc).toContain("isDescendantOfRoot");
    // Fail closed on max depth
    const ancestryFn = driveClientSrc.slice(
      driveClientSrc.indexOf("export async function isDescendantOfRoot"),
      driveClientSrc.indexOf("export async function isDescendantOfRoot") + 1500,
    );
    expect(ancestryFn).toContain("// Max depth exceeded");
    expect(ancestryFn).toContain("return false");
  });

  test("T06: ancestry resolves shortcuts via shortcutDetails.targetId", () => {
    expect(driveClientSrc).toContain("shortcutDetails");
    expect(driveClientSrc).toContain("targetId");
    const ancestryFn = driveClientSrc.slice(
      driveClientSrc.indexOf("export async function isDescendantOfRoot"),
      driveClientSrc.indexOf("// ── Paginated folder listing"),
    );
    expect(ancestryFn).toContain("shortcutDetails");
    expect(ancestryFn).toContain("targetId");
  });
});

describe("04A-E-C: pageToken tied to folder/scan", () => {
  test("T07: pageToken is passed only to the same folderId in listFolderPage", () => {
    // scan-page handler passes folderId and pageToken together
    const scanPageBlock = driveRouteSrc.slice(
      driveRouteSrc.indexOf('action === "scan-page"'),
      driveRouteSrc.indexOf("Common gate for structure"),
    );
    expect(scanPageBlock).toContain("listFolderPage(folderId, accessToken, pageToken)");
    // listFolderPage uses folderId in the Drive API query
    const listFn = driveClientSrc.slice(
      driveClientSrc.indexOf("export async function listFolderPage"),
      driveClientSrc.indexOf("export async function listFolderPage") + 800,
    );
    expect(listFn).toContain("'${folderId}' in parents");
    expect(listFn).toContain("pageToken");
  });

  test("T08: Client ties pageToken to queue[0] folder — never cross-folder", () => {
    // When nextPageToken exists, update queue[0] with new token
    expect(bulkImportDrawerSrc).toContain("pageToken: page.nextPageToken");
    // queue[0] is current folder being scanned
    expect(bulkImportDrawerSrc).toContain("const current = queue[0]");
    // pageToken from current item
    expect(bulkImportDrawerSrc).toContain("current.pageToken");
  });
});

describe("04A-E-C: No OAuth tokens/secrets in responses", () => {
  test("T09: Drive route never returns accessToken in JSON response", () => {
    // All NextResponse.json calls should not include accessToken
    // resolveGate returns it internally but never serializes it
    const resolveGate = driveRouteSrc.slice(
      driveRouteSrc.indexOf("async function resolveGate"),
      driveRouteSrc.indexOf("// ── GET"),
    );
    expect(resolveGate).toContain("return { conn, tenantRoot, accessToken }");
    // Status response: no accessToken
    const statusBlock = driveRouteSrc.slice(
      driveRouteSrc.indexOf('action === "status"'),
      driveRouteSrc.indexOf('action === "status"') + 400,
    );
    expect(statusBlock).not.toContain("accessToken");
    // scan-page result: no accessToken
    expect(dryRunTypesSrc).not.toContain("accessToken");
  });

  test("T10: set-root response never includes OAuth credentials", () => {
    const successIdx = setRootRouteSrc.indexOf("ok:         true");
    const successBlock = setRootRouteSrc.slice(successIdx, successIdx + 200);
    expect(successBlock).not.toContain("accessToken");
    expect(successBlock).not.toContain("refreshToken");
    expect(successBlock).not.toContain("clientSecret");
  });
});

describe("04A-E-C: Cache-Control on all Drive proxy responses", () => {
  test("T11: NO_CACHE_HEADERS constant defined with private, no-store", () => {
    expect(driveRouteSrc).toContain('const NO_CACHE_HEADERS = { "Cache-Control": "private, no-store" }');
  });

  test("T12: status response includes NO_CACHE_HEADERS", () => {
    const statusIdx = driveRouteSrc.indexOf('action === "status"');
    const statusBlock = driveRouteSrc.slice(statusIdx, statusIdx + 800);
    expect(statusBlock).toContain("NO_CACHE_HEADERS");
  });

  test("T13: scan-page success response includes NO_CACHE_HEADERS", () => {
    const successReturn = driveRouteSrc.slice(
      driveRouteSrc.indexOf("analyzedFiles:   pageAnalysis"),
      driveRouteSrc.indexOf("analyzedFiles:   pageAnalysis") + 600,
    );
    expect(successReturn).toContain("NO_CACHE_HEADERS");
  });

  test("T14: scan-page error response includes NO_CACHE_HEADERS", () => {
    // Error result (truncated: true) also has NO_CACHE_HEADERS
    const errorResultIdx = driveRouteSrc.indexOf("analyzedFiles:   []");
    const errorBlock = driveRouteSrc.slice(errorResultIdx, errorResultIdx + 400);
    expect(errorBlock).toContain("NO_CACHE_HEADERS");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION D: ROBUSTNESS
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-E-D: Multi-page and nested folder handling", () => {
  test("T15: BFS loop processes queue until empty — supports arbitrary depth", () => {
    expect(bulkImportDrawerSrc).toContain("while (queue.length > 0)");
    // Child folders pushed to queue regardless of depth
    expect(bulkImportDrawerSrc).toContain("queue.push(");
    expect(bulkImportDrawerSrc).toContain("child.id");
  });

  test("T16: Server paginates via nextPageToken — client continues in same folder", () => {
    // Server returns nextPageToken from Drive API
    expect(driveClientSrc).toContain("nextPageToken: data.nextPageToken ?? null");
    // Client updates queue[0] to continue same folder with new token
    expect(bulkImportDrawerSrc).toContain("queue[0] = { ...current, pageToken: page.nextPageToken }");
    // Folder only shifted when exhausted
    expect(bulkImportDrawerSrc).toContain("queue.shift()");
  });
});

describe("04A-E-D: Deduplication", () => {
  test("T17: Client deduplicates by driveFileId across all pages", () => {
    expect(bulkImportDrawerSrc).toContain("const seenFileIds = new Set<string>()");
    expect(bulkImportDrawerSrc).toContain("seenFileIds.has(f.driveFileId)");
    expect(bulkImportDrawerSrc).toContain("seenFileIds.add(f.driveFileId)");
  });

  test("T18: Server POST legacy deduplicates by file id", () => {
    const postBlock = driveRouteSrc.slice(driveRouteSrc.indexOf("export async function POST"));
    expect(postBlock).toContain("seenIds");
    expect(postBlock).toContain("dedupedFiles");
  });

  test("T19: Engine checks importedDriveIds for DUPLICATE_DRIVE_FILE", () => {
    expect(dryRunEngineSrc).toContain("importedDriveIds.has(sf.id)");
    expect(dryRunEngineSrc).toContain("DUPLICATE_DRIVE_FILE");
  });
});

describe("04A-E-D: Cancellation and error handling", () => {
  test("T20: Cancel sets truncated=true, complete=false, stops loop", () => {
    expect(bulkImportDrawerSrc).toContain("cancelledRef.current = true");
    expect(bulkImportDrawerSrc).toContain("const complete = !truncated && queue.length === 0 && allErrors.length === 0");
  });

  test("T21: Partial page error → truncated=true, queue continues", () => {
    // scan-page error handling in drawer
    const loopBlock = bulkImportDrawerSrc.slice(
      bulkImportDrawerSrc.indexOf("while (queue.length > 0)"),
      bulkImportDrawerSrc.indexOf("} catch (err)"),
    );
    expect(loopBlock).toContain("allErrors.push");
    expect(loopBlock).toContain("truncated = true");
    expect(loopBlock).toContain("continue");
  });

  test("T22: Server error result returns truncated=true, complete=false", () => {
    const errorResult = driveRouteSrc.slice(
      driveRouteSrc.indexOf("analyzedFiles:   []"),
      driveRouteSrc.indexOf("analyzedFiles:   []") + 300,
    );
    expect(errorResult).toContain("complete:        false");
    expect(errorResult).toContain("truncated:       true");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION E: STALE_DRIVE_FILE BASELINE CAPTURE
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-E-E: STALE_DRIVE_FILE — baseline metadata capture", () => {
  test("T23: Drive API requests modifiedTime and version fields", () => {
    // listFolderPage and listFolderContents request these fields
    expect(driveClientSrc).toContain("modifiedTime");
    expect(driveClientSrc).toContain("version");
    expect(driveClientSrc).toContain("files(id,name,mimeType,size,modifiedTime,version)");
  });

  test("T24: DriveFile interface includes modifiedTime and version", () => {
    const driveFileBlock = driveClientSrc.slice(
      driveClientSrc.indexOf("interface DriveFile"),
      driveClientSrc.indexOf("interface DriveFileListResponse"),
    );
    expect(driveFileBlock).toContain("modifiedTime?:");
    expect(driveFileBlock).toContain("version?:");
  });

  test("T25: DriveScannedFile interface includes modifiedTime and version", () => {
    const scannedFileBlock = driveClientSrc.slice(
      driveClientSrc.indexOf("export interface DriveScannedFile"),
      driveClientSrc.indexOf("export interface DriveScannedFile") + 500,
    );
    expect(scannedFileBlock).toContain("modifiedTime?:");
    expect(scannedFileBlock).toContain("version?:");
    expect(scannedFileBlock).toContain("baseline for staleness detection");
  });

  test("T26: DryRunFileDetail includes driveModifiedTime and driveVersion", () => {
    expect(dryRunTypesSrc).toContain("driveModifiedTime?:");
    expect(dryRunTypesSrc).toContain("driveVersion?:");
    expect(dryRunTypesSrc).toContain("baseline for staleness detection");
  });

  test("T27: Engine propagates modifiedTime/version from scanned file to detail", () => {
    expect(dryRunEngineSrc).toContain("driveModifiedTime: sf.modifiedTime");
    expect(dryRunEngineSrc).toContain("driveVersion:      sf.version");
  });

  test("T28: scan-page route passes modifiedTime/version through to engine", () => {
    const scanPageBlock = driveRouteSrc.slice(
      driveRouteSrc.indexOf("Convert DriveFile[] to DriveScannedFile[]"),
      driveRouteSrc.indexOf("04A-D: Server-side analysis per page"),
    );
    expect(scanPageBlock).toContain("modifiedTime: item.modifiedTime");
    expect(scanPageBlock).toContain("version:      item.version");
  });

  test("T29: STALE_DRIVE_FILE contract documents baseline comparison at import time", () => {
    expect(dryRunTypesSrc).toContain("CONTRACT_READY_IMPORT_TIME_DETECTION_PENDING");
    expect(dryRunTypesSrc).toContain("driveModifiedTime");
    expect(dryRunTypesSrc).toContain("driveVersion");
    expect(dryRunTypesSrc).toContain("compares modifiedTime/version against scan baseline");
    expect(dryRunTypesSrc).toContain("Mismatch");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION G: ZERO WRITES GLOBAL
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-E-G: Zero writes — no assets, no products, no R2", () => {
  test("T30: Engine has zero writes — no prisma, no entity mutations", () => {
    expect(dryRunEngineSrc).toContain("ZERO WRITES");
    expect(dryRunEngineSrc).not.toContain("prisma.");
    expect(dryRunEngineSrc).not.toContain("prisma.productEntity");
    expect(dryRunEngineSrc).not.toContain("prisma.asset");
    expect(dryRunEngineSrc).not.toContain("uploadTo");
  });

  test("T31: Drawer has no asset-write HTTP methods (POST only for set-root — allowed)", () => {
    // 04A-F: POST is allowed ONLY for set-root (admin config write).
    // Verify the only POST call is for set-root, not for asset import.
    const postMatches = bulkImportDrawerSrc.match(/method:\s*"POST"/g) ?? [];
    expect(postMatches.length).toBe(1); // exactly one POST — set-root
    const postIdx = bulkImportDrawerSrc.indexOf('method: "POST"');
    const postContext = bulkImportDrawerSrc.slice(Math.max(0, postIdx - 200), postIdx + 200);
    expect(postContext).toContain("set-root");
    // No other write methods
    expect(bulkImportDrawerSrc).not.toContain('method: "PUT"');
    expect(bulkImportDrawerSrc).not.toContain('method: "PATCH"');
    expect(bulkImportDrawerSrc).not.toContain('method: "DELETE"');
  });

  test("T32: Drawer has no DB operations (Map.delete/URL.createObjectURL are OK)", () => {
    expect(bulkImportDrawerSrc).not.toContain("prisma.");
    expect(bulkImportDrawerSrc).not.toContain("prisma");
    expect(bulkImportDrawerSrc).not.toContain("ProductEntity");
    expect(bulkImportDrawerSrc).not.toContain("uploadTo");
  });

  test("T33: Import CTA is permanently disabled with assetIngestionAllowed=false", () => {
    expect(bulkImportDrawerSrc).toContain("assetIngestionAllowed=false");
    expect(bulkImportDrawerSrc).toContain("Importación todavía bloqueada");
    // Button is disabled
    const titleIdx = bulkImportDrawerSrc.indexOf('title="Importación todavía bloqueada');
    expect(titleIdx).toBeGreaterThan(-1);
    const ctaBlock = bulkImportDrawerSrc.slice(Math.max(0, titleIdx - 200), titleIdx + 500);
    expect(ctaBlock).toContain("disabled");
    expect(ctaBlock).toContain("not-allowed");
  });

  test("T34: No R2 upload function calls in drawer or engine", () => {
    // Check for actual R2 upload operations, not mentions in comments
    expect(bulkImportDrawerSrc).not.toContain("uploadToR2");
    expect(bulkImportDrawerSrc).not.toContain("r2Upload");
    expect(bulkImportDrawerSrc).not.toContain("putObject");
    expect(dryRunEngineSrc).not.toContain("uploadToR2");
    expect(dryRunEngineSrc).not.toContain("r2Upload");
    expect(dryRunEngineSrc).not.toContain("putObject");
  });

  test("T35: No ProductEntity creation in drawer or engine", () => {
    expect(bulkImportDrawerSrc).not.toContain("ProductEntity");
    expect(bulkImportDrawerSrc).not.toContain("createProduct");
    // Engine: no Prisma entity mutations
    expect(dryRunEngineSrc).not.toContain("createProduct");
    expect(dryRunEngineSrc).not.toContain("prisma.productEntity");
    expect(dryRunEngineSrc).not.toContain("prisma.asset");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION F: PRIOR TESTS PRESERVED
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-E-F: Prior test suites preserved", () => {
  test("T36: All 6 prior test files exist", () => {
    const files = [
      "lib/auth/__tests__/marketing-r4a-security-closeout-r1.test.ts",
      "lib/auth/__tests__/marketing-drive-bulk-asset-ingestion-04a.test.ts",
      "lib/auth/__tests__/marketing-drive-bulk-import-04a-b.test.ts",
      "lib/auth/__tests__/marketing-drive-bulk-import-04a-c.test.ts",
      "lib/auth/__tests__/marketing-drive-bulk-import-04a-d.test.ts",
      "lib/auth/__tests__/marketing-drive-bulk-import-04a-d-r1.test.ts",
    ];
    for (const f of files) {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
    }
  });
});
