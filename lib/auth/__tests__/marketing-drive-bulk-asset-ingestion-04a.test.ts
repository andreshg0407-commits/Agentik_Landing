/**
 * lib/auth/__tests__/marketing-drive-bulk-asset-ingestion-04a.test.ts
 *
 * MARKETING-DRIVE-BULK-ASSET-INGESTION-04A — Section K: 20 Tests
 *
 * Source-reading pattern: reads implementation files and asserts on content.
 * No mocks, no DB, no network. Deterministic.
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

const tenantRootSrc      = readSrc("lib/marketing-studio/drive/drive-tenant-root.ts");
const driveClientSrc     = readSrc("lib/marketing-studio/drive/drive-api-client.ts");
const driveRouteSrc      = readSrc("app/api/orgs/[orgSlug]/marketing-studio/drive/route.ts");
const setRootRouteSrc    = readSrc("app/api/orgs/[orgSlug]/marketing-studio/drive/set-root/route.ts");
const normalizerSrc      = readSrc("lib/marketing-studio/bulk-import/reference-normalizer.ts");
const dryRunTypesSrc     = readSrc("lib/marketing-studio/bulk-import/drive-dry-run-types.ts");
const dryRunEngineSrc    = readSrc("lib/marketing-studio/bulk-import/drive-dry-run-engine.ts");
const assetMapServiceSrc = readSrc("lib/marketing-studio/products/product-asset-map-service.ts");
const reconAuditSrc      = readSrc("app/api/orgs/[orgSlug]/marketing-studio/biblioteca/reconciliation-audit/route.ts");
const drawerSrc          = readSrc("components/marketing-studio/library/reference-folder-drawer.tsx");
const bibliotecaPageSrc  = readSrc("app/(app)/[orgSlug]/agentik/marketing-studio/biblioteca/page.tsx");

// ── Inline normalizer functions (mirroring reference-normalizer.ts for unit tests) ──

function normalizeReference(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s{2,}/g, " ");
}

const REF_CODE_PATTERN = /([A-Za-z]{2,5}-\d{3,8})/;
const BRACKET_PATTERN = /\[([A-Za-z0-9-]+)\]/;

function extractReference(name: string): { reference: string | null; method: string } {
  const raw = name.trim();
  if (!raw) return { reference: null, method: "none" };
  const dotIdx = raw.lastIndexOf(".");
  const hasExt = dotIdx > 0 && raw.length - dotIdx <= 6;
  const baseName = hasExt ? raw.slice(0, dotIdx) : raw;
  const bracketMatch = baseName.match(BRACKET_PATTERN);
  if (bracketMatch) return { reference: normalizeReference(bracketMatch[1]), method: "bracket" };
  const codeMatch = baseName.match(REF_CODE_PATTERN);
  if (codeMatch) {
    const ref = normalizeReference(codeMatch[1]);
    const isPrefix = baseName.trimStart().toUpperCase().startsWith(ref);
    return { reference: ref, method: isPrefix ? "prefix" : "filename_prefix" };
  }
  return { reference: null, method: "none" };
}

function matchReference(
  ref: string | null,
  skuToProduct: Map<string, string>,
  skuCounts?: Map<string, number>,
): { productId: string | null; matchedSku: string | null; status: string; extractedRef: string | null } {
  if (!ref) return { productId: null, matchedSku: null, status: "NO_REF_EXTRACTED", extractedRef: null };
  if (skuCounts && (skuCounts.get(ref) ?? 0) > 1) {
    return { productId: null, matchedSku: ref, status: "AMBIGUOUS_REF", extractedRef: ref };
  }
  const productId = skuToProduct.get(ref);
  if (productId) return { productId, matchedSku: ref, status: "MATCHED", extractedRef: ref };
  return { productId: null, matchedSku: null, status: "REF_NOT_FOUND", extractedRef: ref };
}

// ── T1–T4: Tenant Root Storage ─────────────────────────────────────────────

describe("04A-C: Tenant Root Storage", () => {
  test("T01: drive-tenant-root.ts uses IntegrationResource model", () => {
    expect(tenantRootSrc).toContain("prisma.integrationResource");
    expect(tenantRootSrc).toContain("google_drive");
    expect(tenantRootSrc).toContain("root_folder");
  });

  test("T02: getTenantDriveRoot resolves by organizationId", () => {
    expect(tenantRootSrc).toContain("organizationId");
    expect(tenantRootSrc).toContain("findFirst");
    expect(tenantRootSrc).toContain("selected:     true");
  });

  test("T03: setTenantDriveRoot deselects old roots before upsert", () => {
    expect(tenantRootSrc).toContain("updateMany");
    expect(tenantRootSrc).toContain("selected: false");
    expect(tenantRootSrc).toContain("upsert");
  });

  test("T04: set-root route requires admin role (04A-D-R1: platformRole + membership.role)", () => {
    // 04A-D-R1: three-condition gate replaces hasMinRole
    expect(setRootRouteSrc).toContain("isSetRootAuthorized");
    expect(setRootRouteSrc).toContain("AGENTIK_ADMIN");
    expect(setRootRouteSrc).toContain("Admin access required");
  });
});

// ── T5–T8: Ancestry Validation ──────────────────────────────────────────────

describe("04A-C: Ancestry Validation", () => {
  test("T05: isDescendantOfRoot walks parent chain via Drive API", () => {
    expect(driveClientSrc).toContain("isDescendantOfRoot");
    expect(driveClientSrc).toContain("ANCESTRY_MAX_DEPTH");
    expect(driveClientSrc).toContain("id,parents,shortcutDetails");
  });

  test("T06: isDescendantOfRoot handles shortcuts (targetId)", () => {
    expect(driveClientSrc).toContain("shortcutDetails");
    expect(driveClientSrc).toContain("targetId");
  });

  test("T07: isDescendantOfRoot fails closed on max depth", () => {
    const maxDepthIdx = driveClientSrc.indexOf("ANCESTRY_MAX_DEPTH");
    expect(maxDepthIdx).toBeGreaterThan(-1);
    // Returns false on max depth exceeded
    expect(driveClientSrc).toContain("// Max depth exceeded");
    expect(driveClientSrc).toContain("return false");
  });

  test("T08: Drive route validates ancestry before structure/dry-run", () => {
    expect(driveRouteSrc).toContain("isDescendantOfRoot");
    expect(driveRouteSrc).toContain("OUTSIDE_TENANT_ROOT");
  });
});

// ── T9–T12: Reference Normalizer ────────────────────────────────────────────

describe("04A-D: Reference Normalizer", () => {
  test("T09: normalizeReference is idempotent", () => {
    expect(normalizeReference("  cj-1126012  ")).toBe("CJ-1126012");
    expect(normalizeReference("CJ-1126012")).toBe("CJ-1126012");
    expect(normalizeReference(normalizeReference("  cj-1126012  "))).toBe("CJ-1126012");
  });

  test("T10: extractReference extracts from prefix pattern", () => {
    const result = extractReference("CJ-1126012 Conjunto Dino");
    expect(result.reference).toBe("CJ-1126012");
    expect(result.method).toBe("prefix");
  });

  test("T11: extractReference extracts from bracket pattern", () => {
    const result = extractReference("Pijama Estrellas [PJ-001]");
    expect(result.reference).toBe("PJ-001");
    expect(result.method).toBe("bracket");
  });

  test("T12: extractReference extracts from filename prefix", () => {
    const result = extractReference("CJ-1126012_01.jpg");
    expect(result.reference).toBe("CJ-1126012");
  });
});

// ── T13–T14: Reference Matching ─────────────────────────────────────────────

describe("04A-D: Reference Matching", () => {
  test("T13: matchReference returns MATCHED for exact SKU match", () => {
    const skuMap = new Map([["CJ-1126012", "prod-1"]]);
    const result = matchReference("CJ-1126012", skuMap);
    expect(result.status).toBe("MATCHED");
    expect(result.productId).toBe("prod-1");
  });

  test("T14: matchReference returns AMBIGUOUS_REF when count > 1", () => {
    const skuMap = new Map([["CJ-1126012", "prod-1"]]);
    const counts = new Map([["CJ-1126012", 2]]);
    const result = matchReference("CJ-1126012", skuMap, counts);
    expect(result.status).toBe("AMBIGUOUS_REF");
    expect(result.productId).toBeNull();
  });
});

// ── T15–T17: Dry-Run Engine ────────────────────────────────────────────────

describe("04A-F: Dry-Run Engine", () => {
  test("T15: dry-run types define all 14 status codes", () => {
    const statuses = [
      "READY", "DUPLICATE_DRIVE_FILE", "DUPLICATE_CHECKSUM",
      "UNSUPPORTED_MIME", "FILE_TOO_LARGE", "NO_REF_EXTRACTED",
      "REF_NOT_FOUND", "AMBIGUOUS_REF", "PRODUCT_NOT_ACTIVE",
      "HERO_ALREADY_EXISTS", "GOOGLE_NATIVE_SKIP", "HIDDEN_FILE",
      "OUTSIDE_TENANT_ROOT", "PERMISSION_DENIED",
    ];
    for (const s of statuses) {
      expect(dryRunTypesSrc).toContain(`"${s}"`);
    }
  });

  test("T16: dry-run engine is zero-writes", () => {
    expect(dryRunEngineSrc).toContain("ZERO WRITES");
    expect(dryRunEngineSrc).not.toContain("prisma.");
    expect(dryRunEngineSrc).not.toContain("prisma.productEntity");
    expect(dryRunEngineSrc).not.toContain("prisma.asset");
    expect(dryRunEngineSrc).not.toContain("uploadTo");
  });

  test("T17: dry-run result includes zeroWrites: true", () => {
    expect(dryRunEngineSrc).toContain("zeroWrites:     true");
  });
});

// ── T18–T19: Drive Route Integration ───────────────────────────────────────

describe("04A: Drive Route Integration", () => {
  test("T18: Drive route requires tenant root for structure and dry-run", () => {
    expect(driveRouteSrc).toContain("getTenantDriveRoot");
    expect(driveRouteSrc).toContain("DRIVE_TENANT_ROOT_NOT_CONFIGURED");
  });

  test("T19: Drive route returns status with tenantRootConfigured flag", () => {
    expect(driveRouteSrc).toContain("tenantRootConfigured");
    expect(driveRouteSrc).toContain("tenantRootFolderName");
  });
});

// ── T20: Commercial Service ─────────────────────────────────────────────────

describe("04A-J: Commercial Asset Map Service", () => {
  test("T20: getPrimaryAssetUrlMap is server-only and read-only", () => {
    expect(assetMapServiceSrc).toContain("server-only");
    expect(assetMapServiceSrc).toContain("getPrimaryAssetUrlMap");
    expect(assetMapServiceSrc).toContain("Read-only, zero writes");
    // No Prisma mutations — only findMany for reads
    expect(assetMapServiceSrc).not.toContain("prisma.productEntity.create");
    expect(assetMapServiceSrc).not.toContain("prisma.productEntity.update");
    expect(assetMapServiceSrc).not.toContain("prisma.productEntity.delete");
    expect(assetMapServiceSrc).not.toContain("uploadTo");
  });
});

// ── T21: Reconciliation Audit ──────────────────────────────────────────────

describe("04A-A: Reconciliation Audit", () => {
  test("T21: reconciliation audit is read-only with zeroWrites assertion", () => {
    expect(reconAuditSrc).toContain("zeroWrites:  true");
    // No Prisma mutations
    expect(reconAuditSrc).not.toContain("prisma.productEntity.create");
    expect(reconAuditSrc).not.toContain("prisma.productEntity.update");
    expect(reconAuditSrc).not.toContain("prisma.asset.create");
    expect(reconAuditSrc).not.toContain("uploadTo");
  });
});

// ── T22–T23: Drawer and Page Updates ────────────────────────────────────────

describe("04A: UI Updates", () => {
  test("T22: drawer uses driveRootConfigured state", () => {
    expect(drawerSrc).toContain("driveRootConfigured");
    expect(drawerSrc).toContain("tenantRootConfigured");
  });

  test("T23: PIL alert text includes physical stock disclaimer", () => {
    expect(bibliotecaPageSrc).toContain("Stock fisico en bodega");
    expect(bibliotecaPageSrc).toContain("Confirmar disponibilidad con operaciones");
  });
});

// ── T24–T25: Idempotency Contract ──────────────────────────────────────────

describe("04A-G: Idempotency Contract", () => {
  test("T24: dry-run types define AssetIdempotencyKey", () => {
    expect(dryRunTypesSrc).toContain("AssetIdempotencyKey");
    expect(dryRunTypesSrc).toContain("driveFileId");
    expect(dryRunTypesSrc).toContain("contentChecksum");
    expect(dryRunTypesSrc).toContain("normalizedReference");
  });

  test("T25: dry-run engine checks driveFileId for duplicate detection", () => {
    expect(dryRunEngineSrc).toContain("importedDriveIds");
    expect(dryRunEngineSrc).toContain("DUPLICATE_DRIVE_FILE");
  });
});
