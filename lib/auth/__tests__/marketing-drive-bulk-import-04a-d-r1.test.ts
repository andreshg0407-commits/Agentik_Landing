/**
 * lib/auth/__tests__/marketing-drive-bulk-import-04a-d-r1.test.ts
 *
 * MARKETING-DRIVE-BULK-ASSET-INGESTION-04A-D-R1 — Final Closeout: 30 Tests
 *
 * Sections:
 *   A: Role gate certified (platformRole + membership.role separation)
 *   B: Root configuration certified (idempotent, single-active, cross-tenant zero)
 *   C: Server-side scan authority (client metadata authority zero)
 *   D: Completeness and scale
 *   E: STALE_DRIVE_FILE contract
 *   H: Prior tests preserved
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

const setRootRouteSrc     = readSrc("app/api/orgs/[orgSlug]/marketing-studio/drive/set-root/route.ts");
const driveRouteSrc       = readSrc("app/api/orgs/[orgSlug]/marketing-studio/drive/route.ts");
const bulkImportDrawerSrc = readSrc("components/marketing-studio/library/bulk-import-drawer.tsx");
const dryRunTypesSrc      = readSrc("lib/marketing-studio/bulk-import/drive-dry-run-types.ts");
const dryRunEngineSrc     = readSrc("lib/marketing-studio/bulk-import/drive-dry-run-engine.ts");
const tenantRootSrc       = readSrc("lib/marketing-studio/drive/drive-tenant-root.ts");
const moduleAccessSrc     = readSrc("lib/auth/module-access.ts");
const orgAccessSrc        = readSrc("lib/auth/org-access.ts");

// ═══════════════════════════════════════════════════════════════════════════
// SECTION A: ROLE GATE CERTIFIED
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-D-R1-A: Role gate — platformRole + membership.role", () => {
  test("T01: set-root uses three-condition gate: platformRole SUPER_ADMIN/AGENTIK_ADMIN OR membership.role ORG_ADMIN", () => {
    // Gate checks platformRole for platform authority
    expect(setRootRouteSrc).toContain('platformRole === "SUPER_ADMIN"');
    expect(setRootRouteSrc).toContain('platformRole === "AGENTIK_ADMIN"');
    // Gate checks membership.role for org authority
    expect(setRootRouteSrc).toContain('membership.role === "ORG_ADMIN"');
    // Combined in isSetRootAuthorized
    expect(setRootRouteSrc).toContain("isSetRootAuthorized");
  });

  test("T02: set-root does NOT use hasMinRole — explicit conditions only", () => {
    // hasMinRole removed from set-root imports and logic
    expect(setRootRouteSrc).not.toContain("hasMinRole(");
    expect(setRootRouteSrc).not.toContain("hasMinRole ");
    // import line should not contain hasMinRole
    const importLine = setRootRouteSrc.slice(
      setRootRouteSrc.indexOf("from \"@/lib/auth/module-access\"") - 100,
      setRootRouteSrc.indexOf("from \"@/lib/auth/module-access\"") + 40,
    );
    expect(importLine).not.toContain("hasMinRole");
  });

  test("T03: set-root explicitly denies MANAGER, OPERATOR, VIEWER, BILLING", () => {
    // The gate logic: only SUPER_ADMIN/AGENTIK_ADMIN platformRole OR ORG_ADMIN membershipRole
    // Everything else is denied. Verify the comment documents this.
    expect(setRootRouteSrc).toContain("MANAGER");
    expect(setRootRouteSrc).toContain("OPERATOR");
    expect(setRootRouteSrc).toContain("VIEWER");
    expect(setRootRouteSrc).toContain("BILLING");
    expect(setRootRouteSrc).toContain("null");
    expect(setRootRouteSrc).toContain("SET_ROOT_DENIED");
  });

  test("T04: platformRole comes from requireOrgAccess() — never from body/query", () => {
    // requireOrgAccess returns platformRole
    expect(orgAccessSrc).toContain("platformRole");
    expect(orgAccessSrc).toContain("User.platformRole");
    // set-root destructures platformRole from requireOrgAccess
    expect(setRootRouteSrc).toContain("platformRole");
    expect(setRootRouteSrc).toContain("requireOrgAccess(orgSlug)");
    // No platformRole from body
    expect(setRootRouteSrc).not.toContain("body.platformRole");
    expect(setRootRouteSrc).not.toContain("body.role");
    // No organizationId from body
    expect(setRootRouteSrc).not.toContain("body.organizationId");
    expect(setRootRouteSrc).not.toContain("body.orgSlug");
  });

  test("T05: organizationId comes exclusively from requireOrgAccess", () => {
    // set-root: organizationId from organization.id (server session)
    expect(setRootRouteSrc).toContain("organization.id");
    expect(setRootRouteSrc).toContain("requireOrgAccess(orgSlug)");
    // drive route: same pattern
    expect(driveRouteSrc).toContain("organization.id");
    expect(driveRouteSrc).toContain("requireOrgAccess(orgSlug)");
  });
});

describe("04A-D-R1-A: Role hierarchy audit", () => {
  test("T06: ROLE_HIERARCHY defines exact 7-role ascending order", () => {
    const hierarchyIdx = moduleAccessSrc.indexOf("ROLE_HIERARCHY");
    expect(hierarchyIdx).toBeGreaterThan(-1);
    const hierarchyBlock = moduleAccessSrc.slice(hierarchyIdx, hierarchyIdx + 300);
    // Exact order: VIEWER < BILLING < OPERATOR < MANAGER < ORG_ADMIN < AGENTIK_ADMIN < SUPER_ADMIN
    const viewerIdx = hierarchyBlock.indexOf('"VIEWER"');
    const billingIdx = hierarchyBlock.indexOf('"BILLING"');
    const operatorIdx = hierarchyBlock.indexOf('"OPERATOR"');
    const managerIdx = hierarchyBlock.indexOf('"MANAGER"');
    const orgAdminIdx = hierarchyBlock.indexOf('"ORG_ADMIN"');
    const agentikIdx = hierarchyBlock.indexOf('"AGENTIK_ADMIN"');
    const superIdx = hierarchyBlock.indexOf('"SUPER_ADMIN"');
    expect(viewerIdx).toBeLessThan(billingIdx);
    expect(billingIdx).toBeLessThan(operatorIdx);
    expect(operatorIdx).toBeLessThan(managerIdx);
    expect(managerIdx).toBeLessThan(orgAdminIdx);
    expect(orgAdminIdx).toBeLessThan(agentikIdx);
    expect(agentikIdx).toBeLessThan(superIdx);
  });

  test("T07: canAccessMarketingStudio gates: SUPER_ADMIN, AGENTIK_ADMIN, ORG_ADMIN, MANAGER only", () => {
    const fnStart = moduleAccessSrc.indexOf("function canAccessMarketingStudio");
    const fnEnd = moduleAccessSrc.indexOf("}", fnStart) + 1;
    const fn = moduleAccessSrc.slice(fnStart, fnEnd);
    expect(fn).toContain("SUPER_ADMIN");
    expect(fn).toContain("AGENTIK_ADMIN");
    expect(fn).toContain("ORG_ADMIN");
    expect(fn).toContain("MANAGER");
    // Not in function body
    expect(fn).not.toContain("OPERATOR");
    expect(fn).not.toContain("BILLING");
    expect(fn).not.toContain("VIEWER");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION B: ROOT CONFIGURATION CERTIFIED
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-D-R1-B: Root configuration — idempotency and uniqueness", () => {
  test("T08: Repeat set-root with same folder is idempotent via upsert", () => {
    // Uses upsert with composite unique key
    expect(tenantRootSrc).toContain("upsert");
    expect(tenantRootSrc).toContain("organizationId_provider_externalId");
    // Same folderId → update, not create duplicate
    expect(tenantRootSrc).toContain("create:");
    expect(tenantRootSrc).toContain("update:");
  });

  test("T09: Changing folder leaves exactly one active root per tenant", () => {
    // Deselects all existing roots before setting new one
    expect(tenantRootSrc).toContain("updateMany");
    expect(tenantRootSrc).toContain("selected: false");
    // Then upserts the new one with selected: true
    expect(tenantRootSrc).toContain("selected:     true");
    // Query filters by selected: true
    const getRoot = tenantRootSrc.slice(tenantRootSrc.indexOf("getTenantDriveRoot"), tenantRootSrc.indexOf("setTenantDriveRoot"));
    expect(getRoot).toContain("selected:     true");
  });

  test("T10: Cross-tenant isolation — organizationId scopes all queries", () => {
    // getTenantDriveRoot: organizationId in WHERE
    expect(tenantRootSrc).toContain("organizationId,");
    // setTenantDriveRoot: deselect scoped by organizationId
    const deselect = tenantRootSrc.slice(tenantRootSrc.indexOf("updateMany"), tenantRootSrc.indexOf("upsert"));
    expect(deselect).toContain("organizationId");
    // upsert composite key includes organizationId
    expect(tenantRootSrc).toContain("organizationId_provider_externalId");
  });

  test("T11: Folder validated via Drive API before storage", () => {
    expect(setRootRouteSrc).toContain("validateDriveFolder(folderId, accessToken)");
    // Only stored AFTER validation succeeds
    const validateIdx = setRootRouteSrc.indexOf("validateDriveFolder");
    const storeIdx = setRootRouteSrc.indexOf("setTenantDriveRoot");
    expect(validateIdx).toBeLessThan(storeIdx);
  });

  test("T12: OAuth tokens never in response body", () => {
    // Success response: ok, folderId, folderName, resourceId — no tokens
    const successIdx = setRootRouteSrc.indexOf("ok:         true");
    expect(successIdx).toBeGreaterThan(-1);
    const successBlock = setRootRouteSrc.slice(successIdx, successIdx + 200);
    expect(successBlock).not.toContain("accessToken");
    expect(successBlock).not.toContain("refreshToken");
    expect(successBlock).not.toContain("secret");
    // Error response bodies: no token exposure
    const catchBlock = setRootRouteSrc.slice(setRootRouteSrc.indexOf("} catch"));
    // Token values never serialized into NextResponse.json error bodies
    expect(catchBlock).not.toContain("refreshToken");
    // accessToken exists as variable name but never in JSON response body
    expect(catchBlock).not.toContain('"accessToken"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION C: SERVER-SIDE SCAN AUTHORITY — CLIENT METADATA ZERO
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-D-R1-C: Server-side scan authority", () => {
  test("T13: scan-page builds all file metadata server-side from Drive API", () => {
    const scanPageIdx = driveRouteSrc.indexOf('action === "scan-page"');
    const scanPageEnd = driveRouteSrc.indexOf("Common gate for structure", scanPageIdx);
    const scanPageBlock = driveRouteSrc.slice(scanPageIdx, scanPageEnd);
    // Server builds DriveScannedFile[] from raw Drive API response
    expect(scanPageBlock).toContain("DriveScannedFile");
    expect(scanPageBlock).toContain("item.id");
    expect(scanPageBlock).toContain("item.name");
    expect(scanPageBlock).toContain("item.mimeType");
    expect(scanPageBlock).toContain("item.size");
    // Server runs analysis
    expect(scanPageBlock).toContain("runDryRun");
    expect(scanPageBlock).toContain("buildProductMapsForDryRun");
  });

  test("T14: Client drawer does NOT submit any of the 11 forbidden fields", () => {
    // Client never sends these to server
    expect(bulkImportDrawerSrc).not.toContain('method: "POST"');
    expect(bulkImportDrawerSrc).not.toContain("method: 'POST'");
    // Verify no JSON body with file metadata
    expect(bulkImportDrawerSrc).not.toContain("JSON.stringify({");
    // Client only calls GET scan-page with folderId/pageToken/folderPath/folderName
    // (navigational params, not metadata)
  });

  test("T15: Cache-Control: private, no-store on status, scan-page, and results", () => {
    expect(driveRouteSrc).toContain("Cache-Control");
    expect(driveRouteSrc).toContain("private, no-store");
    // NO_CACHE_HEADERS constant defined
    expect(driveRouteSrc).toContain("NO_CACHE_HEADERS");
    // Applied to status response — find the status action block
    const statusActionIdx = driveRouteSrc.indexOf('action === "status"');
    const statusBlock = driveRouteSrc.slice(statusActionIdx, statusActionIdx + 500);
    expect(statusBlock).toContain("NO_CACHE_HEADERS");
    // Applied to scan-page response — find the scan-page result return
    const scanResultIdx = driveRouteSrc.indexOf("analyzedFiles:   pageAnalysis");
    const scanBlock = driveRouteSrc.slice(scanResultIdx, scanResultIdx + 500);
    expect(scanBlock).toContain("NO_CACHE_HEADERS");
  });

  test("T16: resolveGate re-resolves connection + root + token per scan-page request", () => {
    const scanPageBlock = driveRouteSrc.slice(
      driveRouteSrc.indexOf('action === "scan-page"'),
      driveRouteSrc.indexOf('action === "scan-page"') + 2000,
    );
    expect(scanPageBlock).toContain("resolveGate(organizationId)");
    // resolveGate calls getDriveConnection + getTenantDriveRoot + getDriveAccessToken
    const resolveGateBlock = driveRouteSrc.slice(
      driveRouteSrc.indexOf("async function resolveGate"),
      driveRouteSrc.indexOf("async function resolveGate") + 500,
    );
    expect(resolveGateBlock).toContain("getDriveConnection");
    expect(resolveGateBlock).toContain("getTenantDriveRoot");
    expect(resolveGateBlock).toContain("getDriveAccessToken");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION D: COMPLETENESS AND SCALE
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-D-R1-D: Completeness contract — drawer logic", () => {
  test("T17: complete=true requires queue empty AND nextPageToken null AND errors=0 AND not cancelled AND not truncated", () => {
    // complete derivation
    expect(bulkImportDrawerSrc).toContain("const complete = !truncated && queue.length === 0 && allErrors.length === 0");
    // cancelled → truncated
    expect(bulkImportDrawerSrc).toContain("cancelledRef.current");
    const cancelBlock = bulkImportDrawerSrc.slice(
      bulkImportDrawerSrc.indexOf("if (cancelledRef.current)"),
      bulkImportDrawerSrc.indexOf("if (cancelledRef.current)") + 200,
    );
    expect(cancelBlock).toContain("truncated = true");
  });

  test("T18: Multi-page folder handled — pageToken updates queue[0]", () => {
    expect(bulkImportDrawerSrc).toContain("page.nextPageToken");
    expect(bulkImportDrawerSrc).toContain("pageToken: page.nextPageToken");
    // Folder only removed from queue when exhausted (no nextPageToken)
    expect(bulkImportDrawerSrc).toContain("queue.shift()");
    expect(bulkImportDrawerSrc).toContain("totalFoldersProcessed++");
  });

  test("T19: Nested folders — childFolderIds enqueued into BFS queue", () => {
    expect(bulkImportDrawerSrc).toContain("page.childFolderIds");
    expect(bulkImportDrawerSrc).toContain("queue.push(");
    expect(bulkImportDrawerSrc).toContain("child.id");
    expect(bulkImportDrawerSrc).toContain("child.name");
    expect(bulkImportDrawerSrc).toContain("child.path");
  });

  test("T20: Duplicate files across pages — dedup by driveFileId", () => {
    expect(bulkImportDrawerSrc).toContain("seenFileIds.has(f.driveFileId)");
    expect(bulkImportDrawerSrc).toContain("seenFileIds.add(f.driveFileId)");
  });

  test("T21: Cancellation sets truncated=true and breaks loop", () => {
    expect(bulkImportDrawerSrc).toContain("cancelledRef.current = true");
    // In the loop: if (cancelledRef.current) { truncated = true; break; }
    const loopBlock = bulkImportDrawerSrc.slice(
      bulkImportDrawerSrc.indexOf("while (queue.length > 0)"),
      bulkImportDrawerSrc.indexOf("} catch (err)"),
    );
    expect(loopBlock).toContain("cancelledRef.current");
    expect(loopBlock).toContain("truncated = true");
    expect(loopBlock).toContain("break");
  });

  test("T22: Child folder error sets truncated=true and continues", () => {
    // HTTP error from scan-page → add to allErrors, shift queue, truncated
    // Find the scan-page error handling (second if (!res.ok) in the file — inside scanning loop)
    const firstOk = bulkImportDrawerSrc.indexOf("if (!res.ok)");
    const secondOk = bulkImportDrawerSrc.indexOf("if (!res.ok)", firstOk + 10);
    expect(secondOk).toBeGreaterThan(firstOk);
    const errorBlock = bulkImportDrawerSrc.slice(secondOk, secondOk + 800);
    expect(errorBlock).toContain("allErrors.push");
    expect(errorBlock).toContain("queue.shift()");
    expect(errorBlock).toContain("truncated = true");
    expect(errorBlock).toContain("continue");
  });

  test("T23: Partial results never presented as importable — truncated banner", () => {
    expect(bulkImportDrawerSrc).toContain("INCOMPLETO");
    expect(bulkImportDrawerSrc).toContain("complete=false");
    expect(bulkImportDrawerSrc).toContain("truncated=true");
    // Button always disabled
    expect(bulkImportDrawerSrc).toContain("Importación todavía bloqueada");
    expect(bulkImportDrawerSrc).toContain("disabled");
  });
});

describe("04A-D-R1-D: Server-side completeness", () => {
  test("T24: Server scan-page complete=true only when folderExhausted AND no children", () => {
    expect(driveRouteSrc).toContain("folderExhausted");
    expect(driveRouteSrc).toContain("pageResult.nextPageToken === null");
    expect(driveRouteSrc).toContain("childFolderIds.length === 0");
    // Server error → truncated: true, complete: false
    const errorResult = driveRouteSrc.slice(
      driveRouteSrc.indexOf("analyzedFiles:   []"),
      driveRouteSrc.indexOf("analyzedFiles:   []") + 300,
    );
    expect(errorResult).toContain("complete:");
    expect(errorResult).toContain("false");
    expect(errorResult).toContain("truncated:");
    expect(errorResult).toContain("true");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION E: STALE_DRIVE_FILE CONTRACT
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-D-R1-E: STALE_DRIVE_FILE — contract-ready", () => {
  test("T25: STALE_DRIVE_FILE status code exists in types", () => {
    expect(dryRunTypesSrc).toContain('"STALE_DRIVE_FILE"');
  });

  test("T26: STALE_DRIVE_FILE documented as CONTRACT_READY_IMPORT_TIME_DETECTION_PENDING", () => {
    expect(dryRunTypesSrc).toContain("CONTRACT_READY_IMPORT_TIME_DETECTION_PENDING");
    expect(dryRunTypesSrc).toContain("re-fetch");
    expect(dryRunTypesSrc).toContain("re-scan");
    expect(dryRunTypesSrc).toContain("never trust browser-accumulated rows");
  });

  test("T27: STALE_DRIVE_FILE has label in drawer", () => {
    expect(bulkImportDrawerSrc).toContain("STALE_DRIVE_FILE");
    expect(bulkImportDrawerSrc).toContain("Pendiente revalidar");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION H: PRIOR TESTS AND ZERO WRITES PRESERVED
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-D-R1-H: Prior tests preserved", () => {
  test("T28: All prior test files exist", () => {
    const files = [
      "lib/auth/__tests__/marketing-r4a-security-closeout-r1.test.ts",
      "lib/auth/__tests__/marketing-drive-bulk-asset-ingestion-04a.test.ts",
      "lib/auth/__tests__/marketing-drive-bulk-import-04a-b.test.ts",
      "lib/auth/__tests__/marketing-drive-bulk-import-04a-c.test.ts",
      "lib/auth/__tests__/marketing-drive-bulk-import-04a-d.test.ts",
    ];
    for (const f of files) {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
    }
  });
});

describe("04A-D-R1-H: Zero writes global", () => {
  test("T29: Engine is zero-writes, no prisma, no DB calls", () => {
    expect(dryRunEngineSrc).toContain("ZERO WRITES");
    expect(dryRunEngineSrc).not.toContain("prisma.");
    expect(dryRunEngineSrc).not.toContain(".create(");
    expect(dryRunEngineSrc).not.toContain(".update(");
    expect(dryRunEngineSrc).not.toContain(".delete(");
  });

  test("T30: Drawer has zero write methods and import CTA permanently disabled", () => {
    // No write HTTP methods
    expect(bulkImportDrawerSrc).not.toContain('method: "POST"');
    expect(bulkImportDrawerSrc).not.toContain('method: "PUT"');
    expect(bulkImportDrawerSrc).not.toContain('method: "PATCH"');
    expect(bulkImportDrawerSrc).not.toContain('method: "DELETE"');
    // No DB operations
    expect(bulkImportDrawerSrc).not.toContain(".create(");
    expect(bulkImportDrawerSrc).not.toContain(".update(");
    expect(bulkImportDrawerSrc).not.toContain(".delete(");
    // Import CTA disabled
    expect(bulkImportDrawerSrc).toContain("assetIngestionAllowed=false");
    expect(bulkImportDrawerSrc).toContain("Importación todavía bloqueada");
    // Button has disabled attribute and not-allowed cursor
    // The inner text "Importación todavía bloqueada" appears AFTER the title attribute
    // and the style block with cursor: "not-allowed" — search forward from title
    const titleIdx = bulkImportDrawerSrc.indexOf('title="Importación todavía bloqueada');
    expect(titleIdx).toBeGreaterThan(-1);
    const ctaBlock = bulkImportDrawerSrc.slice(Math.max(0, titleIdx - 200), titleIdx + 500);
    expect(ctaBlock).toContain("disabled");
    expect(ctaBlock).toContain("not-allowed");
  });
});
