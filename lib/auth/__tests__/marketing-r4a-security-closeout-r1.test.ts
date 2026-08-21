/**
 * MARKETING-R4A-SECURITY-CLOSEOUT-R1 — Security gate tests
 *
 * Validates:
 *   1. Storage: 3-state model (NOT_CONFIGURED / CONFIGURED_NOT_VERIFIED / CANARY_VERIFIED)
 *   2. Storage: uploads blocked unless CANARY_VERIFIED
 *   3. Ensure-product: ZERO writes — no prisma.create/update/delete calls
 *   4. Ensure-product: PRODUCT_IDENTITY_UNIQUENESS_REQUIRED returned when no existing entity
 *   5. Ensure-product: CCS checks disponible > 0 (not just presence)
 *   6. Ensure-product: PIL checks SUM(quantity) > 0
 *   7. Ensure-product: REF_NOT_ACTIVE_IN_INVENTORY for inactive refs
 *   8. Ensure-product: REF_NOT_IN_INVENTORY for missing refs
 *   9. Duplicate-audit: zero writes, read-only
 *  10. Drive: tenant isolation via OAuth (organizationId from server session)
 *  11. Drive: dry-run zero writes assertion
 *  12. No secrets in API responses
 */

// @ts-expect-error — vitest lives in .vite/ not node_modules/; resolved at runtime by vitest
import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── Helpers ──────────────────────────────────────────────────────────────────

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../../", relPath), "utf-8");
}

// ── Source files under test ──────────────────────────────────────────────────

const storageVerificationSrc = readSrc("lib/storage/storage-verification-status.ts");
const ensureProductSrc       = readSrc("app/api/orgs/[orgSlug]/marketing-studio/biblioteca/ensure-product/route.ts");
const duplicateAuditSrc      = readSrc("app/api/orgs/[orgSlug]/marketing-studio/biblioteca/duplicate-audit/route.ts");
const storageStatusSrc       = readSrc("app/api/orgs/[orgSlug]/marketing-studio/storage-status/route.ts");
const driveRouteSrc          = readSrc("app/api/orgs/[orgSlug]/marketing-studio/drive/route.ts");
const drawerSrc              = readSrc("components/marketing-studio/library/reference-folder-drawer.tsx");
const assetUploadSrc         = readSrc("app/api/orgs/[orgSlug]/marketing-studio/products/[productId]/assets/route.ts");
const ingestionGateSrc       = readSrc("lib/storage/asset-ingestion-gate.ts");

// ══════════════════════════════════════════════════════════════════════════════
// 1. Storage: 3-state model
// ══════════════════════════════════════════════════════════════════════════════

describe("1 — Storage 3-state verification model", () => {
  test("T01: StorageVerificationState has exactly 3 states", () => {
    expect(storageVerificationSrc).toContain('"NOT_CONFIGURED"');
    expect(storageVerificationSrc).toContain('"CONFIGURED_NOT_VERIFIED"');
    expect(storageVerificationSrc).toContain('"CANARY_VERIFIED"');
  });

  test("T02: NOT_CONFIGURED when loadR2Config returns null", () => {
    // config === null → NOT_CONFIGURED
    expect(storageVerificationSrc).toContain("if (!config)");
    const nullBlock = storageVerificationSrc.slice(
      storageVerificationSrc.indexOf("if (!config)"),
      storageVerificationSrc.indexOf("if (!config)") + 300,
    );
    expect(nullBlock).toContain("NOT_CONFIGURED");
    expect(nullBlock).toContain("uploadsAllowed: false");
  });

  test("T03: CONFIGURED_NOT_VERIFIED when config exists but canary not verified", () => {
    expect(storageVerificationSrc).toContain("STORAGE_CANARY_VERIFIED");
    expect(storageVerificationSrc).toContain("CONFIGURED_NOT_VERIFIED");
    const canaryBlock = storageVerificationSrc.slice(
      storageVerificationSrc.indexOf("canaryVerified"),
      storageVerificationSrc.indexOf("canaryVerified") + 400,
    );
    expect(canaryBlock).toContain("uploadsAllowed: false");
  });

  test("T04: CANARY_VERIFIED only when env var explicitly true", () => {
    expect(storageVerificationSrc).toContain('process.env.STORAGE_CANARY_VERIFIED === "true"');
    const verifiedBlock = storageVerificationSrc.slice(
      storageVerificationSrc.lastIndexOf("return {"),
    );
    expect(verifiedBlock).toContain("CANARY_VERIFIED");
    expect(verifiedBlock).toContain("uploadsAllowed: true");
  });

  test("T05: server-only import prevents client usage", () => {
    expect(storageVerificationSrc).toContain('"server-only"');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Storage: uploads blocked unless CANARY_VERIFIED
// ══════════════════════════════════════════════════════════════════════════════

describe("2 — Storage blocks uploads unless CANARY_VERIFIED", () => {
  test("T06: storage-status route returns state + uploadsAllowed", () => {
    expect(storageStatusSrc).toContain("getStorageVerificationStatus");
    expect(storageStatusSrc).toContain("status.state");
    expect(storageStatusSrc).toContain("status.uploadsAllowed");
  });

  test("T07: drawer checks CANARY_VERIFIED before allowing uploads", () => {
    expect(drawerSrc).toContain('storageState !== "CANARY_VERIFIED"');
  });

  test("T08: drawer fetches 3-state from /storage-status endpoint", () => {
    expect(drawerSrc).toContain("/marketing-studio/storage-status");
  });

  test("T09: drawer shows specific messages for each storage state", () => {
    expect(drawerSrc).toContain("STORAGE_NOT_CONFIGURED");
    expect(drawerSrc).toContain("STORAGE_CONFIGURED_NOT_VERIFIED");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Ensure-product: ZERO writes proven
// ══════════════════════════════════════════════════════════════════════════════

describe("3 — Ensure-product performs ZERO writes", () => {
  test("T10: no prisma.productEntity.create call exists", () => {
    expect(ensureProductSrc).not.toContain("productEntity.create");
  });

  test("T11: no prisma.productEntity.update call exists", () => {
    expect(ensureProductSrc).not.toContain("productEntity.update");
  });

  test("T12: no prisma.productEntity.upsert call exists", () => {
    expect(ensureProductSrc).not.toContain("productEntity.upsert");
  });

  test("T13: no prisma.productEntity.delete call exists", () => {
    expect(ensureProductSrc).not.toContain("productEntity.delete");
  });

  test("T14: no prisma.productAssetLink.create call exists", () => {
    expect(ensureProductSrc).not.toContain("productAssetLink.create");
  });

  test("T15: no prisma.generatedAsset.create call exists", () => {
    expect(ensureProductSrc).not.toContain("generatedAsset.create");
  });

  test("T16: only findFirst and findMany used (read-only Prisma ops)", () => {
    // All prisma calls should be findFirst or findMany
    const prismaOps = ensureProductSrc.match(/prisma\.\w+\.\w+/g) ?? [];
    for (const op of prismaOps) {
      expect(op).toMatch(/\.(findFirst|findMany)$/);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Ensure-product: PRODUCT_IDENTITY_UNIQUENESS_REQUIRED
// ══════════════════════════════════════════════════════════════════════════════

describe("4 — Ensure-product blocks creation without uniqueness constraint", () => {
  test("T17: returns PRODUCT_IDENTITY_UNIQUENESS_REQUIRED error", () => {
    expect(ensureProductSrc).toContain("PRODUCT_IDENTITY_UNIQUENESS_REQUIRED");
  });

  test("T18: returns 503 status for blocked creation", () => {
    // The PRODUCT_IDENTITY_UNIQUENESS_REQUIRED in actual code (not comments) returns 503
    const lastIdx = ensureProductSrc.lastIndexOf("PRODUCT_IDENTITY_UNIQUENESS_REQUIRED");
    const blockContext = ensureProductSrc.slice(lastIdx, lastIdx + 400);
    expect(blockContext).toContain("503");
  });

  test("T19: migration proposal documented in comments", () => {
    expect(ensureProductSrc).toContain("MIGRATION_PROPOSAL");
    expect(ensureProductSrc).toContain("@@unique");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Ensure-product: CCS active = disponible > 0
// ══════════════════════════════════════════════════════════════════════════════

describe("5 — CCS inventory requires disponible > 0", () => {
  test("T20: CCS query uses disponible gt 0", () => {
    expect(ensureProductSrc).toContain("disponible: { gt: 0 }");
  });

  test("T21: CCS query orders by snapshotAt desc (latest snapshot)", () => {
    expect(ensureProductSrc).toContain('snapshotAt: "desc"');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Ensure-product: PIL active = SUM(quantity) > 0
// ══════════════════════════════════════════════════════════════════════════════

describe("6 — PIL inventory requires SUM(quantity) > 0", () => {
  test("T22: PIL loads inventoryLevels with quantity", () => {
    expect(ensureProductSrc).toContain("inventoryLevels");
    expect(ensureProductSrc).toContain("quantity");
  });

  test("T23: PIL checks totalQty > 0", () => {
    expect(ensureProductSrc).toContain("totalQty > 0");
  });

  test("T24: PIL scoped to productLine 5", () => {
    expect(ensureProductSrc).toContain('productLine: "5"');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Ensure-product: REF_NOT_ACTIVE_IN_INVENTORY
// ══════════════════════════════════════════════════════════════════════════════

describe("7 — Inactive refs blocked with REF_NOT_ACTIVE_IN_INVENTORY", () => {
  test("T25: returns REF_NOT_ACTIVE_IN_INVENTORY for existing but inactive refs", () => {
    expect(ensureProductSrc).toContain("REF_NOT_ACTIVE_IN_INVENTORY");
  });

  test("T26: returns 409 for inactive refs", () => {
    const refIdx = ensureProductSrc.indexOf("REF_NOT_ACTIVE_IN_INVENTORY");
    const refContext = ensureProductSrc.slice(refIdx, refIdx + 200);
    expect(refContext).toContain("409");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Ensure-product: REF_NOT_IN_INVENTORY
// ══════════════════════════════════════════════════════════════════════════════

describe("8 — Missing refs blocked with REF_NOT_IN_INVENTORY", () => {
  test("T27: returns REF_NOT_IN_INVENTORY for unknown refs", () => {
    expect(ensureProductSrc).toContain("REF_NOT_IN_INVENTORY");
  });

  test("T28: returns 404 for missing refs", () => {
    const refIdx = ensureProductSrc.indexOf("REF_NOT_IN_INVENTORY");
    const refContext = ensureProductSrc.slice(refIdx, refIdx + 200);
    expect(refContext).toContain("404");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. Duplicate-audit: zero writes
// ══════════════════════════════════════════════════════════════════════════════

describe("9 — Duplicate-audit is read-only", () => {
  test("T29: no create/update/delete calls in duplicate-audit", () => {
    expect(duplicateAuditSrc).not.toContain(".create");
    expect(duplicateAuditSrc).not.toContain(".update");
    expect(duplicateAuditSrc).not.toContain(".delete");
    expect(duplicateAuditSrc).not.toContain(".upsert");
  });

  test("T30: zeroWrites assertion in response", () => {
    expect(duplicateAuditSrc).toContain("zeroWrites");
  });

  test("T31: requires AGENTIK_ADMIN role", () => {
    expect(duplicateAuditSrc).toContain("AGENTIK_ADMIN");
  });

  test("T32: only findMany used (single Prisma op)", () => {
    const ops = duplicateAuditSrc.match(/prisma\.\w+\.\w+/g) ?? [];
    for (const op of ops) {
      expect(op).toMatch(/\.findMany$/);
    }
  });

  test("T33: migrationSQL included when no duplicates", () => {
    expect(duplicateAuditSrc).toContain("migrationSQL");
    expect(duplicateAuditSrc).toContain("CREATE UNIQUE INDEX");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. Drive: tenant isolation
// ══════════════════════════════════════════════════════════════════════════════

describe("10 — Drive tenant isolation via OAuth", () => {
  test("T34: organizationId from requireOrgAccess (server session)", () => {
    expect(driveRouteSrc).toContain("requireOrgAccess");
    expect(driveRouteSrc).toContain("organization.id");
  });

  test("T35: getDriveConnection scoped by organizationId", () => {
    expect(driveRouteSrc).toContain("getDriveConnection(organizationId)");
  });

  test("T36: canAccessMarketingStudio guard present", () => {
    expect(driveRouteSrc).toContain("canAccessMarketingStudio");
  });

  test("T37: TENANT ROOT ENFORCEMENT documented", () => {
    expect(driveRouteSrc).toContain("TENANT ROOT ENFORCEMENT");
    expect(driveRouteSrc).toContain("Cross-tenant folder access is impossible");
  });

  test("T37b: DRIVE_TENANT_ROOT_NOT_CERTIFIED blocks structure and dry-run", () => {
    expect(driveRouteSrc).toContain("DRIVE_TENANT_ROOT_NOT_CERTIFIED");
    // The if-condition guards both structure and dry-run before the error return
    expect(driveRouteSrc).toContain('action === "structure" || action === "dry-run"');
    // Returns 503
    const gateReturnIdx = driveRouteSrc.indexOf('"DRIVE_TENANT_ROOT_NOT_CERTIFIED"');
    const returnBlock = driveRouteSrc.slice(gateReturnIdx, gateReturnIdx + 400);
    expect(returnBlock).toContain("503");
  });

  test("T37c: Drive import button disabled in drawer", () => {
    expect(drawerSrc).toContain("DRIVE_TENANT_ROOT_NOT_CERTIFIED");
    // Button is unconditionally disabled
    const driveButtonIdx = drawerSrc.indexOf("DRIVE_TENANT_ROOT_NOT_CERTIFIED");
    const buttonBlock = drawerSrc.slice(driveButtonIdx, driveButtonIdx + 400);
    expect(buttonBlock).toContain("disabled");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. Drive: dry-run zero writes
// ══════════════════════════════════════════════════════════════════════════════

describe("11 — Drive dry-run performs zero writes", () => {
  test("T38: zeroWrites assertion in dry-run response", () => {
    expect(driveRouteSrc).toContain("zeroWrites:        true");
  });

  test("T39: dry-run section has ZERO WRITES comment", () => {
    expect(driveRouteSrc).toContain("ZERO WRITES");
  });

  test("T40: no prisma.create/update/delete in drive route", () => {
    // Drive route should only use findMany for inventory lookup
    expect(driveRouteSrc).not.toContain(".create(");
    expect(driveRouteSrc).not.toContain(".update(");
    expect(driveRouteSrc).not.toContain(".delete(");
    expect(driveRouteSrc).not.toContain(".upsert(");
  });

  test("T41: tenantId included in dry-run response", () => {
    expect(driveRouteSrc).toContain("tenantId:");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 12. No secrets in API responses
// ══════════════════════════════════════════════════════════════════════════════

describe("12 — No secrets exposed in API responses", () => {
  test("T42: storage-status returns no credential values in NextResponse.json", () => {
    // Check that NextResponse.json calls don't contain credential fields
    const jsonBlocks = storageStatusSrc.match(/NextResponse\.json\(\{[\s\S]*?\}\)/g) ?? [];
    for (const block of jsonBlocks) {
      expect(block).not.toContain("accessKeyId");
      expect(block).not.toContain("secretAccessKey");
      expect(block).not.toContain("R2_BUCKET");
      expect(block).not.toContain("R2_ENDPOINT");
    }
  });

  test("T43: storage-verification-status exposes no config details", () => {
    expect(storageVerificationSrc).toContain("No credentials");
    // No bucket names or R2 URLs in output
    expect(storageVerificationSrc).not.toContain("R2_BUCKET");
    expect(storageVerificationSrc).not.toContain("R2_ACCESS_KEY");
  });

  test("T44: ensure-product returns no org internal IDs in error messages", () => {
    // Error messages should not expose organizationId
    const errorBlocks = ensureProductSrc.match(/NextResponse\.json\(\{[^}]+error[^}]+\}/g) ?? [];
    for (const block of errorBlocks) {
      expect(block).not.toContain("organizationId");
    }
  });

  test("T45: Drive route does not return tokens in any response", () => {
    // No accessToken or refreshToken in response bodies
    const jsonResponses = driveRouteSrc.match(/NextResponse\.json\(\{[\s\S]*?\}\)/g) ?? [];
    for (const resp of jsonResponses) {
      expect(resp).not.toContain("accessToken");
      expect(resp).not.toContain("refreshToken");
    }
  });

  test("T46: ensure-product storage gate blocks with state-specific codes (no config leak)", () => {
    expect(ensureProductSrc).toContain("STORAGE_NOT_CONFIGURED");
    expect(ensureProductSrc).toContain("STORAGE_CONFIGURED_NOT_VERIFIED");
    // These error codes reveal state, NOT config details
    expect(ensureProductSrc).not.toContain("R2_ENDPOINT");
    expect(ensureProductSrc).not.toContain("R2_BUCKET_NAME");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Bonus: ensure-product security gates ordering
// ══════════════════════════════════════════════════════════════════════════════

describe("Bonus — Ensure-product gate ordering", () => {
  test("T47: requireOrgAccess called before any Prisma query", () => {
    const orgAccessIdx = ensureProductSrc.indexOf("requireOrgAccess");
    const firstPrismaIdx = ensureProductSrc.indexOf("prisma.");
    expect(orgAccessIdx).toBeLessThan(firstPrismaIdx);
  });

  test("T48: canAccessMarketingStudio checked after org access", () => {
    const orgIdx = ensureProductSrc.indexOf("requireOrgAccess");
    const moduleIdx = ensureProductSrc.indexOf("canAccessMarketingStudio");
    expect(moduleIdx).toBeGreaterThan(orgIdx);
  });

  test("T49: storage verification checked before inventory queries", () => {
    const storageIdx = ensureProductSrc.indexOf("getStorageVerificationStatus");
    const inventoryIdx = ensureProductSrc.indexOf("commercialCoverageSnapshot");
    expect(storageIdx).toBeLessThan(inventoryIdx);
  });

  test("T50: organizationId from server session (organization.id), never from request body", () => {
    expect(ensureProductSrc).toContain("organization.id");
    // orgId is set from server session, not from body
    const orgIdAssign = ensureProductSrc.indexOf("const orgId = organization.id");
    const bodyParse = ensureProductSrc.indexOf("req.json()");
    expect(orgIdAssign).toBeLessThan(bodyParse);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 13. Conjunctive Asset Ingestion Gate
// ══════════════════════════════════════════════════════════════════════════════

describe("13 — Conjunctive asset ingestion gate (server-side)", () => {
  test("T51: ingestion gate requires BOTH storageCanaryVerified AND productIdentityUniquenessCertified", () => {
    expect(ingestionGateSrc).toContain("storageCanaryVerified && productIdentityUniquenessCertified");
  });

  test("T52: ingestion gate is server-only", () => {
    expect(ingestionGateSrc).toContain('"server-only"');
  });

  test("T53: ingestion gate checks PRODUCT_IDENTITY_UNIQUENESS_CERTIFIED env var", () => {
    expect(ingestionGateSrc).toContain('PRODUCT_IDENTITY_UNIQUENESS_CERTIFIED');
    expect(ingestionGateSrc).toContain('=== "true"');
  });

  test("T54: asset upload route imports and checks evaluateAssetIngestionGate", () => {
    expect(assetUploadSrc).toContain("evaluateAssetIngestionGate");
    expect(assetUploadSrc).toContain("ASSET_INGESTION_BLOCKED");
  });

  test("T55: asset upload returns 503 when ingestion blocked", () => {
    const blockIdx = assetUploadSrc.indexOf("ASSET_INGESTION_BLOCKED");
    const blockContext = assetUploadSrc.slice(blockIdx, blockIdx + 500);
    expect(blockContext).toContain("503");
  });

  test("T56: asset upload gate runs BEFORE FormData parsing", () => {
    const gateIdx = assetUploadSrc.indexOf("evaluateAssetIngestionGate");
    const formDataIdx = assetUploadSrc.indexOf("req.formData()");
    expect(gateIdx).toBeLessThan(formDataIdx);
  });

  test("T57: asset upload response includes both gate statuses", () => {
    expect(assetUploadSrc).toContain("storageCanaryVerified");
    expect(assetUploadSrc).toContain("productIdentityUniquenessCertified");
  });
});
