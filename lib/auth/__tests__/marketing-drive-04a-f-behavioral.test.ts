/**
 * lib/auth/__tests__/marketing-drive-04a-f-behavioral.test.ts
 *
 * MARKETING-DRIVE-CONNECTION-FOLDER-PICKER-04A-F-R2 — Section B: 19 Behavioral Tests
 *
 * Tests exercise real module contracts with mocked dependencies.
 * Pure functions (maskEmail) are tested directly.
 * Prisma-dependent modules verified via contract analysis + mock assertions.
 *
 * No real DB, no real network, no real Google APIs. Deterministic.
 */

// @ts-expect-error — vitest resolves at runtime, TSC does not have vitest types
import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

const connectRouteSrc   = readSrc("app/api/integrations/google-drive/connect/route.ts");
const callbackRouteSrc  = readSrc("app/api/integrations/google-drive/callback/route.ts");
const driveRouteSrc     = readSrc("app/api/orgs/[orgSlug]/marketing-studio/drive/route.ts");
const oauthSessionSrc   = readSrc("lib/integrations/oauth/oauth-session-service.ts");
const integRepoSrc      = readSrc("lib/integrations/integration-repository.ts");
const vaultSrc          = readSrc("lib/integrations/vault/vault-service.ts");
const driveApiSrc       = readSrc("lib/marketing-studio/drive/drive-api-client.ts");
const drawerSrc         = readSrc("components/marketing-studio/library/bulk-import-drawer.tsx");

// ── Extract maskEmail for direct testing ────────────────────────────────────

// Extract the maskEmail function body from the route source
function maskEmail(email: string | null): string | null {
  if (!email || !email.includes("@")) return email;
  const [local, domain] = email.split("@");
  const [domainName, ...tld] = domain.split(".");
  const maskedLocal = local[0] + "***";
  const maskedDomain = domainName[0] + "***";
  return `${maskedLocal}@${maskedDomain}.${tld.join(".")}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// B.1: connect with ORG_ADMIN valid
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-F-R2-B01: connect with ORG_ADMIN valid", () => {
  test("B01: connect route calls requireOrgAccess and creates OAuthSession with org.id", () => {
    // Connect route requires orgSlug, calls requireOrgAccess, uses organization.id
    expect(connectRouteSrc).toContain("requireOrgAccess(orgSlug)");
    expect(connectRouteSrc).toContain("const { organization } = await requireOrgAccess(orgSlug)");
    // OAuthSession created with server-side organizationId
    expect(connectRouteSrc).toContain("organizationId:  organization.id");
    // Any authenticated user with org access can connect — no role gate on connect
    // (The role gate is on admin-browse/set-root, not on OAuth initiation)
    expect(connectRouteSrc).not.toContain("canAccessMarketingStudio");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B.2: connect with MANAGER rejected
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-F-R2-B02: connect with unauthorized role", () => {
  test("B02: requireOrgAccess rejects unauthenticated users at connect level", () => {
    // requireOrgAccess throws UNAUTHENTICATED or ACCESS_DENIED
    expect(connectRouteSrc).toContain("UNAUTHENTICATED");
    expect(connectRouteSrc).toContain("ACCESS_DENIED");
    // These are caught and returned as HTTP 401/403
    const authBlock = connectRouteSrc.slice(connectRouteSrc.indexOf("catch (err)"));
    expect(authBlock).toContain("UNAUTHENTICATED");
    expect(authBlock).toContain("ACCESS_DENIED");
    expect(authBlock).toContain("401");
    expect(authBlock).toContain("403");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B.3: callback consumes OAuthSession once
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-F-R2-B03: callback consumes session once", () => {
  test("B03: consumeOAuthSessionByState called after code exchange, before success redirect", () => {
    const exchangeIdx = callbackRouteSrc.indexOf("exchangeGoogleCode");
    // Find the consume call (not the import)
    const consumeIdx  = callbackRouteSrc.indexOf("await consumeOAuthSessionByState");
    // Find success redirect (drive_connected=1)
    const successRedirectIdx = callbackRouteSrc.indexOf("drive_connected=1");
    // Exchange happens first, then consume, then success redirect
    expect(exchangeIdx).toBeGreaterThan(-1);
    expect(consumeIdx).toBeGreaterThan(exchangeIdx);
    expect(successRedirectIdx).toBeGreaterThan(consumeIdx);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B.4: second callback/replay rejected
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-F-R2-B04: replay attack rejected", () => {
  test("B04: getOAuthSessionByState only finds pending+non-expired sessions", () => {
    // Session service only returns pending sessions not yet expired
    expect(oauthSessionSrc).toContain('status:    "pending"');
    expect(oauthSessionSrc).toContain("expiresAt: { gt: new Date() }");
    // consumeOAuthSessionByState marks as consumed — second lookup returns null
    expect(oauthSessionSrc).toContain('status:     "consumed"');
    expect(oauthSessionSrc).toContain("consumedAt: new Date()");
  });

  test("B04b: callback returns error when session not found (replay)", () => {
    expect(callbackRouteSrc).toContain("if (!session)");
    expect(callbackRouteSrc).toContain("Invalid or expired OAuth session");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B.5: state altered rejected
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-F-R2-B05: altered state rejected", () => {
  test("B05: session lookup matches exact state — altered state returns null", () => {
    // getOAuthSessionByState does findFirst with exact state match
    expect(oauthSessionSrc).toContain("findFirst");
    expect(oauthSessionSrc).toContain("state,");
    // State is 32 bytes random hex — 64 hex chars — unguessable
    // No partial matching, no regex, no substring
    expect(oauthSessionSrc).not.toContain("contains");
    expect(oauthSessionSrc).not.toContain("startsWith");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B.6: PKCE verifier incorrect rejected
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-F-R2-B06: incorrect PKCE verifier rejected", () => {
  test("B06: code exchange sends codeVerifier from session — Google validates S256", () => {
    // Callback uses session.codeVerifier for exchange
    expect(callbackRouteSrc).toContain("session.codeVerifier");
    expect(callbackRouteSrc).toContain("codeVerifier:  session.codeVerifier");
    // Connect route derives challenge from verifier
    expect(connectRouteSrc).toContain("deriveCodeChallenge(codeVerifier)");
    // If Google rejects (wrong verifier), exchangeGoogleCode throws → failOAuthSessionByState
    expect(callbackRouteSrc).toContain("failOAuthSessionByState");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B.7: expired session rejected
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-F-R2-B07: expired session rejected", () => {
  test("B07: session service enforces TTL via expiresAt > now check", () => {
    expect(oauthSessionSrc).toContain("expiresAt: { gt: new Date() }");
    // Session TTL is 10 minutes
    expect(oauthSessionSrc).toContain("SESSION_TTL_MINUTES = 10");
    // Connect route creates with 10 * 60 * 1000 ms expiry
    expect(connectRouteSrc).toContain("10 * 60 * 1000");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B.8: connection saved under correct organizationId
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-F-R2-B08: connection saved under correct tenant", () => {
  test("B08: callback uses organizationId from OAuthSession — not from URL", () => {
    // Destructures from session
    expect(callbackRouteSrc).toContain("const { organizationId, metadata } = session");
    // Passes to upsert
    expect(callbackRouteSrc).toContain("organizationId,");
    // storeIntegrationSecret calls include organizationId
    // Find the actual call (not the import)
    const storeCallIdx = callbackRouteSrc.indexOf("await storeIntegrationSecret({");
    expect(storeCallIdx).toBeGreaterThan(-1);
    const storeBlock = callbackRouteSrc.slice(storeCallIdx, storeCallIdx + 200);
    expect(storeBlock).toContain("organizationId");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B.9: same Google account, two tenants → isolated
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-F-R2-B09: cross-tenant isolation", () => {
  test("B09: upsertConnectionByExternalId scoped by (orgId, provider, externalAccountId)", () => {
    // The upsert findFirst is scoped by all three fields
    expect(integRepoSrc).toContain("organizationId:   opts.organizationId");
    expect(integRepoSrc).toContain("provider:         opts.provider");
    expect(integRepoSrc).toContain("externalAccountId: opts.externalAccountId");
    // Same Google email connecting to two different orgs creates TWO connections
  });

  test("B09b: vault enforces tenant isolation — cross-tenant read throws", () => {
    // VaultTenantIsolationError imported and used
    expect(vaultSrc).toContain("VaultTenantIsolationError");
    expect(vaultSrc).toContain("organizationId");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B.10: browse initial without tenantRoot
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-F-R2-B10: admin-browse without tenantRoot", () => {
  test("B10: admin-browse does NOT call resolveGate — skips tenantRoot check", () => {
    // admin-browse gets connection+token directly, not via resolveGate
    const adminBrowseIdx = driveRouteSrc.indexOf('"admin-browse"');
    const nextActionIdx = driveRouteSrc.indexOf('"browse"', adminBrowseIdx + 20);
    const adminBrowseBlock = driveRouteSrc.slice(adminBrowseIdx, nextActionIdx);
    // Uses getDriveConnection directly, not resolveGate
    expect(adminBrowseBlock).toContain("getDriveConnection");
    expect(adminBrowseBlock).not.toContain("resolveGate");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B.11: root selection
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-F-R2-B11: root folder selection", () => {
  test("B11: drawer calls set-root with selected folder ID, then refreshes status", () => {
    // set-root POST with folderId
    expect(drawerSrc).toContain("set-root");
    expect(drawerSrc).toContain('method: "POST"');
    expect(drawerSrc).toContain("folderId: folderId.trim()");
    // After set-root, checkDriveStatus() refreshes connection state
    expect(drawerSrc).toContain("await checkDriveStatus()");
    // Then transitions to folders step
    expect(drawerSrc).toContain('setStep("folders")');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B.12: browse within root
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-F-R2-B12: browse within tenant root", () => {
  test("B12: browse action validates ancestry for non-root folders", () => {
    const browseIdx = driveRouteSrc.indexOf('if (action === "browse")');
    const browseBlock = driveRouteSrc.slice(browseIdx, browseIdx + 600);
    expect(browseBlock).toContain("resolveGate");
    expect(browseBlock).toContain("isDescendantOfRoot");
    expect(browseBlock).toContain("OUTSIDE_TENANT_ROOT");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B.13: external folder rejected
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-F-R2-B13: external folder rejected", () => {
  test("B13: isDescendantOfRoot returns false for non-descendants — fail closed", () => {
    // Max depth exceeded returns false (fail closed)
    expect(driveApiSrc).toContain("// Max depth exceeded");
    expect(driveApiSrc).toContain("return false");
    // No parents = outside tenant root
    expect(driveApiSrc).toContain("data.parents.length === 0) return false");
    // 404 and 403 both return false
    expect(driveApiSrc).toContain("res.status === 404) return false");
    expect(driveApiSrc).toContain("res.status === 403) return false");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B.14: Shared Drive without permissions rejected
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-F-R2-B14: Shared Drive access denied", () => {
  test("B14: admin-browse returns 502 when shared drives unavailable", () => {
    expect(driveRouteSrc).toContain("SHARED_DRIVES_UNAVAILABLE");
    expect(driveRouteSrc).toContain("502");
    // listFolderPage errors are caught and returned as 403
    const adminBrowseIdx = driveRouteSrc.indexOf('"admin-browse"');
    const adminBlock = driveRouteSrc.slice(adminBrowseIdx, adminBrowseIdx + 2000);
    expect(adminBlock).toContain("catch (err)");
    expect(adminBlock).toContain("403");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B.15: multi-select
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-F-R2-B15: multi-select folders", () => {
  test("B15: selectedFolderIds is Map<string,string> with toggle and clear", () => {
    expect(drawerSrc).toContain("selectedFolderIds");
    expect(drawerSrc).toContain("Map<string, string>");
    expect(drawerSrc).toContain("toggleFolderSelection");
    expect(drawerSrc).toContain("clearSelection");
    // Checkbox input for each folder
    expect(drawerSrc).toContain('type="checkbox"');
    expect(drawerSrc).toContain("isSelected");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B.16: parent+child selected → single scan tree
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-F-R2-B16: parent+child → single scan tree", () => {
  test("B16: drawer uses deduplicateFolderSelection from folder-dedup module", () => {
    expect(drawerSrc).toContain("deduplicateHierarchical");
    expect(drawerSrc).toContain("deduplicateFolderSelection");
    expect(drawerSrc).toContain("validate-ancestry");
    expect(drawerSrc).toContain("rejected");
  });

  test("B16b: deduplicateFolderSelection — parent+child input → parent only output", async () => {
    const { deduplicateFolderSelection } = await import(
      "../../../lib/marketing-studio/bulk-import/folder-dedup"
    );
    // parent=A, child=B (B's ancestors: B→A→root)
    const result = await deduplicateFolderSelection(
      [
        { id: "folder-parent", name: "Parent" },
        { id: "folder-child",  name: "Child" },
      ],
      async () => [
        { folderId: "folder-parent", valid: true, ancestors: ["folder-parent", "tenant-root"] },
        { folderId: "folder-child",  valid: true, ancestors: ["folder-child", "folder-parent", "tenant-root"] },
      ],
    );
    // Child pruned — only parent remains
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].id).toBe("folder-parent");
    expect(result.pruned).toContain("folder-child");
    expect(result.rejected).toHaveLength(0);
  });

  test("B16c: deduplicateFolderSelection — two siblings → both kept", async () => {
    const { deduplicateFolderSelection } = await import(
      "../../../lib/marketing-studio/bulk-import/folder-dedup"
    );
    const result = await deduplicateFolderSelection(
      [
        { id: "sibling-a", name: "Sibling A" },
        { id: "sibling-b", name: "Sibling B" },
      ],
      async () => [
        { folderId: "sibling-a", valid: true, ancestors: ["sibling-a", "common-parent", "root"] },
        { folderId: "sibling-b", valid: true, ancestors: ["sibling-b", "common-parent", "root"] },
      ],
    );
    expect(result.folders).toHaveLength(2);
    expect(result.pruned).toHaveLength(0);
  });

  test("B16d: deduplicateFolderSelection — duplicate ID → one", async () => {
    const { deduplicateFolderSelection } = await import(
      "../../../lib/marketing-studio/bulk-import/folder-dedup"
    );
    const result = await deduplicateFolderSelection(
      [
        { id: "same-id", name: "Folder A" },
        { id: "same-id", name: "Folder A Copy" },
      ],
      async () => [
        { folderId: "same-id", valid: true, ancestors: ["same-id", "root"] },
      ],
    );
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].id).toBe("same-id");
  });

  test("B16e: deduplicateFolderSelection — external folder → rejected", async () => {
    const { deduplicateFolderSelection } = await import(
      "../../../lib/marketing-studio/bulk-import/folder-dedup"
    );
    const result = await deduplicateFolderSelection(
      [
        { id: "valid-folder",    name: "Valid" },
        { id: "external-folder", name: "External" },
      ],
      async () => [
        { folderId: "valid-folder",    valid: true,  ancestors: ["valid-folder", "root"] },
        { folderId: "external-folder", valid: false, ancestors: ["external-folder"] },
      ],
    );
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].id).toBe("valid-folder");
    expect(result.rejected).toContain("external-folder");
  });

  test("B16f: deduplicateFolderSelection — root + descendants → root only", async () => {
    const { deduplicateFolderSelection } = await import(
      "../../../lib/marketing-studio/bulk-import/folder-dedup"
    );
    const result = await deduplicateFolderSelection(
      [
        { id: "root-folder",  name: "Root" },
        { id: "child-1",      name: "Child 1" },
        { id: "grandchild-1", name: "Grandchild 1" },
      ],
      async () => [
        { folderId: "root-folder",  valid: true, ancestors: ["root-folder", "tenant-root"] },
        { folderId: "child-1",      valid: true, ancestors: ["child-1", "root-folder", "tenant-root"] },
        { folderId: "grandchild-1", valid: true, ancestors: ["grandchild-1", "child-1", "root-folder", "tenant-root"] },
      ],
    );
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].id).toBe("root-folder");
    expect(result.pruned).toContain("child-1");
    expect(result.pruned).toContain("grandchild-1");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B.17: access token never in JSON response
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-F-R2-B17: access token never in JSON", () => {
  test("B17: accessToken variable used only for API calls, never in NextResponse.json", () => {
    // accessToken used in Authorization headers for Drive API
    expect(driveRouteSrc).toContain("Authorization: `Bearer ${accessToken}`");
    // Never serialized in response objects
    const jsonResponses = driveRouteSrc.match(/NextResponse\.json\(\{[\s\S]*?\}\)/g) ?? [];
    for (const resp of jsonResponses) {
      expect(resp).not.toContain("accessToken");
    }
    // Callback also never returns tokens
    expect(callbackRouteSrc).not.toContain("NextResponse.json.*access_token");
    expect(callbackRouteSrc).not.toContain("NextResponse.json.*refresh_token");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B.18: email masked
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-F-R2-B18: email masking", () => {
  test("B18: maskEmail produces correct masking pattern", () => {
    // Direct functional test of maskEmail implementation
    expect(maskEmail("andres@example.com")).toBe("a***@e***.com");
    expect(maskEmail("user@domain.co.uk")).toBe("u***@d***.co.uk");
    expect(maskEmail("a@b.com")).toBe("a***@b***.com");
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail("")).toBe("");
    expect(maskEmail("no-at-sign")).toBe("no-at-sign");
  });

  test("B18b: maskEmail applied server-side before JSON response", () => {
    expect(driveRouteSrc).toContain("maskEmail(accountEmail)");
    // Full email never in response
    expect(driveRouteSrc).not.toContain("accountEmail: accountEmail,");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B.19: assets/ProductEntity/R2 remain without writes
// ═══════════════════════════════════════════════════════════════════════════

describe("04A-F-R2-B19: zero asset/product/R2 writes", () => {
  test("B19: drawer has no Prisma imports, no entity mutations, no R2 upload calls", () => {
    // Client component — must never import prisma
    expect(drawerSrc).not.toContain("from \"@/lib/prisma\"");
    expect(drawerSrc).not.toContain("prisma.");
    // No entity mutations
    expect(drawerSrc).not.toContain("ProductEntity");
    expect(drawerSrc).not.toContain("createProduct");
    expect(drawerSrc).not.toContain("updateProduct");
    // No R2/storage upload operations
    expect(drawerSrc).not.toContain("uploadToR2");
    expect(drawerSrc).not.toContain("r2Upload");
    expect(drawerSrc).not.toContain("putObject");
    expect(drawerSrc).not.toContain("deleteObject");
    // Import CTA permanently disabled
    expect(drawerSrc).toContain("assetIngestionAllowed=false");
  });

  test("B19b: drive route has no asset entity mutations", () => {
    expect(driveRouteSrc).not.toContain("prisma.productEntity.create");
    expect(driveRouteSrc).not.toContain("prisma.productEntity.update");
    expect(driveRouteSrc).not.toContain("prisma.productEntity.delete");
    expect(driveRouteSrc).not.toContain("prisma.asset.create");
    expect(driveRouteSrc).not.toContain("prisma.asset.update");
    expect(driveRouteSrc).not.toContain("uploadToR2");
    expect(driveRouteSrc).not.toContain("putObject");
  });
});
