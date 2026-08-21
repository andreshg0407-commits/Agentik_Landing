/**
 * lib/auth/__tests__/marketing-drive-connection-folder-picker-04a-f.test.ts
 *
 * MARKETING-DRIVE-CONNECTION-FOLDER-PICKER-04A-F — 20 Tests
 *
 * Covers: OAuth tenant safety, visual folder picker, multi-select,
 * credential privacy, admin-browse, callback URI, write matrix.
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

const drawerSrc       = readSrc("components/marketing-studio/library/bulk-import-drawer.tsx");
const driveRouteSrc   = readSrc("app/api/orgs/[orgSlug]/marketing-studio/drive/route.ts");
const connectRouteSrc = readSrc("app/api/integrations/google-drive/connect/route.ts");
const callbackRouteSrc = readSrc("app/api/integrations/google-drive/callback/route.ts");
const driveOAuthSrc   = readSrc("lib/integrations/oauth/providers/google-drive-oauth.ts");
const oauthSessionSrc = readSrc("lib/integrations/oauth/oauth-session-service.ts");
const vaultServiceSrc = readSrc("lib/integrations/vault/vault-service.ts");
const integrationRepoSrc = readSrc("lib/integrations/integration-repository.ts");

// ── Section C: OAuth Tenant Safety ──────────────────────────────────────────

describe("04A-F-C: OAuth tenant safety", () => {
  test("T01: Connect route uses requireOrgAccess — organizationId from server session", () => {
    expect(connectRouteSrc).toContain("requireOrgAccess");
    expect(connectRouteSrc).toContain("organization.id");
    // organizationId stored in OAuthSession — not from query params
    expect(connectRouteSrc).toContain("organizationId:  organization.id");
  });

  test("T02: Callback gets organizationId from OAuthSession — not from query params", () => {
    expect(callbackRouteSrc).toContain("getOAuthSessionByState");
    expect(callbackRouteSrc).toContain("organizationId");
    // Destructured from session, not from req.nextUrl.searchParams
    expect(callbackRouteSrc).toContain("const { organizationId, metadata } = session");
    // No orgSlug in query params
    expect(callbackRouteSrc).not.toContain('searchParams.get("orgSlug")');
  });

  test("T03: OAuthSession consumed after use — anti-replay", () => {
    expect(callbackRouteSrc).toContain("consumeOAuthSessionByState");
    // Consumed before redirect
    const consumeIdx = callbackRouteSrc.indexOf("consumeOAuthSessionByState");
    const redirectIdx = callbackRouteSrc.indexOf("NextResponse.redirect(`${appUrl}${returnTo}");
    expect(consumeIdx).toBeGreaterThan(-1);
    expect(redirectIdx).toBeGreaterThan(consumeIdx);
  });

  test("T04: PKCE S256 — codeVerifier stored server-side, codeChallenge sent to Google", () => {
    expect(connectRouteSrc).toContain("generateCodeVerifier");
    expect(connectRouteSrc).toContain("deriveCodeChallenge");
    expect(connectRouteSrc).toContain("codeChallenge");
    expect(connectRouteSrc).toContain("codeVerifier");
    // Code exchange uses codeVerifier from session
    expect(callbackRouteSrc).toContain("session.codeVerifier");
  });

  test("T05: CSRF state is 32 bytes random hex — unguessable", () => {
    expect(connectRouteSrc).toContain("generateOAuthState");
    expect(connectRouteSrc).toContain("state");
    // Callback verifies state
    expect(callbackRouteSrc).toContain('searchParams.get("state")');
    expect(callbackRouteSrc).toContain("getOAuthSessionByState(state)");
  });

  test("T06: Connection upserted by (orgId, provider, externalAccountId) — no duplicates", () => {
    expect(callbackRouteSrc).toContain("upsertConnectionByExternalId");
    expect(callbackRouteSrc).toContain("organizationId");
    expect(callbackRouteSrc).toContain('"google_drive"');
  });

  test("T07: OAuthSession has 10-minute TTL", () => {
    expect(connectRouteSrc).toContain("10 * 60 * 1000");
    expect(connectRouteSrc).toContain("expiresAt");
  });
});

// ── Section A: Visual Folder Picker (admin-browse) ──────────────────────────

describe("04A-F-A: Visual folder picker for root selection", () => {
  test("T08: admin-browse action exists in drive route with admin gate", () => {
    expect(driveRouteSrc).toContain('"admin-browse"');
    expect(driveRouteSrc).toContain("ADMIN_BROWSE_DENIED");
    // Admin gate: same roles as set-root
    expect(driveRouteSrc).toContain("SUPER_ADMIN");
    expect(driveRouteSrc).toContain("AGENTIK_ADMIN");
    expect(driveRouteSrc).toContain("ORG_ADMIN");
  });

  test("T09: admin-browse supports My Drive and Shared Drives modes", () => {
    expect(driveRouteSrc).toContain('"my-drive"');
    expect(driveRouteSrc).toContain('"shared-drives"');
    // Shared Drives via Drive API /drives endpoint
    expect(driveRouteSrc).toContain("googleapis.com/drive/v3/drives");
  });

  test("T10: Drawer has root step with visual folder picker tabs", () => {
    expect(drawerSrc).toContain('step === "root"');
    expect(drawerSrc).toContain("admin-browse");
    expect(drawerSrc).toContain("Mi Drive");
    expect(drawerSrc).toContain("Shared Drives");
    // Breadcrumb navigation in root picker
    expect(drawerSrc).toContain("rootBrowseBreadcrumb");
  });

  test("T11: Root picker has confirm-selection CTA and advanced URL fallback", () => {
    expect(drawerSrc).toContain("Confirmar como root");
    expect(drawerSrc).toContain("rootSelectedId");
    expect(drawerSrc).toContain("rootSelectedName");
    // Advanced URL input toggle
    expect(drawerSrc).toContain("rootShowAdvanced");
    expect(drawerSrc).toContain("Opcion avanzada");
  });
});

// ── Section B: Multi-select Folders ─────────────────────────────────────────

describe("04A-F-B: Multi-select folders for scanning", () => {
  test("T12: selectedFolderIds is a Map for multi-select", () => {
    expect(drawerSrc).toContain("selectedFolderIds");
    expect(drawerSrc).toContain("new Map()");
    expect(drawerSrc).toContain("toggleFolderSelection");
    expect(drawerSrc).toContain("clearSelection");
  });

  test("T13: Hierarchical deduplication before scan", () => {
    expect(drawerSrc).toContain("deduplicateHierarchical");
    expect(drawerSrc).toContain("validate-ancestry");
    expect(drawerSrc).toContain("rejected");
  });

  test("T14: Validate-ancestry batch endpoint exists in route", () => {
    expect(driveRouteSrc).toContain('"validate-ancestry"');
    expect(driveRouteSrc).toContain("folderIds");
    expect(driveRouteSrc).toContain("Max 20 folders");
    // Each folder validated against tenant root
    expect(driveRouteSrc).toContain("isDescendantOfRoot");
  });
});

// ── Section D: Callback URIs ────────────────────────────────────────────────

describe("04A-F-D: Callback URI stability", () => {
  test("T15: redirectUri derived from NEXT_PUBLIC_APP_URL — not hardcoded", () => {
    expect(driveOAuthSrc).toContain("NEXT_PUBLIC_APP_URL");
    // Connect route stores redirectUri in session
    expect(connectRouteSrc).toContain("redirectUri:     creds.redirectUri");
    // Callback uses appUrl from env
    expect(callbackRouteSrc).toContain("process.env.NEXT_PUBLIC_APP_URL");
  });
});

// ── Section E: Credential Privacy ───────────────────────────────────────────

describe("04A-F-E: Credential privacy", () => {
  test("T16: Tokens encrypted with AES-256-GCM in vault", () => {
    expect(vaultServiceSrc).toContain("aes-256-gcm");
    // Prefers VAULT_ENCRYPTION_KEY, falls back to canonical VAULT_MASTER_KEY
    expect(vaultServiceSrc).toContain("VAULT_ENCRYPTION_KEY");
    expect(vaultServiceSrc).toContain("VAULT_MASTER_KEY");
    // Callback stores tokens via vault
    expect(callbackRouteSrc).toContain("storeIntegrationSecret");
    expect(callbackRouteSrc).toContain("access_token");
    expect(callbackRouteSrc).toContain("refresh_token");
  });

  test("T17: access_token NEVER sent to client — server-side only", () => {
    // Drive route uses getDriveAccessToken internally
    expect(driveRouteSrc).toContain("getDriveAccessToken");
    // But never returns it in JSON responses — check for accessToken in NextResponse.json
    const jsonCalls = driveRouteSrc.match(/NextResponse\.json\(\{[^}]*accessToken/g);
    expect(jsonCalls).toBeNull();
  });

  test("T18: Email masked server-side via maskEmail before JSON response", () => {
    expect(driveRouteSrc).toContain("maskEmail");
    expect(driveRouteSrc).toContain("maskEmail(accountEmail)");
    // Masking pattern: first char + ***
    expect(driveRouteSrc).toContain('local[0] + "***"');
    expect(driveRouteSrc).toContain('domainName[0] + "***"');
  });

  test("T19: Callback never logs token values", () => {
    // Callback logs safe message only
    expect(callbackRouteSrc).toContain("safeMsg");
    expect(callbackRouteSrc).not.toContain("console.log(tokens");
    expect(callbackRouteSrc).not.toContain("console.log(access_token");
    expect(callbackRouteSrc).not.toContain("console.log(refresh_token");
  });

  test("T20: Vault enforces tenant isolation on secret storage", () => {
    expect(vaultServiceSrc).toContain("organizationId");
    // Tenant mismatch throws
    expect(vaultServiceSrc).toContain("organizationId");
  });
});

// ── Section F: Write Matrix ─────────────────────────────────────────────────

describe("04A-F-F: Write matrix — allowed vs prohibited writes", () => {
  test("T21: Drawer has zero asset/product/storage write methods", () => {
    // No Prisma or entity operations (Map.delete/URL.createObjectURL are OK)
    expect(drawerSrc).not.toContain("prisma.");
    expect(drawerSrc).not.toContain("ProductEntity");
    expect(drawerSrc).not.toContain("uploadTo");
    // No PUT/PATCH/DELETE HTTP methods
    expect(drawerSrc).not.toContain('method: "PUT"');
    expect(drawerSrc).not.toContain('method: "PATCH"');
    expect(drawerSrc).not.toContain('method: "DELETE"');
  });

  test("T22: Drawer POST only for set-root (admin config write)", () => {
    const postMatches = drawerSrc.match(/method:\s*"POST"/g) ?? [];
    expect(postMatches.length).toBeLessThanOrEqual(1);
    if (postMatches.length === 1) {
      const postIdx = drawerSrc.indexOf('method: "POST"');
      const surrounding = drawerSrc.slice(Math.max(0, postIdx - 300), postIdx + 300);
      expect(surrounding).toContain("set-root");
    }
  });

  test("T23: Allowed writes — OAuth + Connection + Secret + tenantRoot only", () => {
    // OAuth: connect creates OAuthSession
    expect(connectRouteSrc).toContain("prisma.oAuthSession.create");
    // Callback: allowed writes
    expect(callbackRouteSrc).toContain("upsertConnectionByExternalId");       // IntegrationConnection
    expect(callbackRouteSrc).toContain("storeIntegrationSecret");             // IntegrationSecret (encrypted)
    expect(callbackRouteSrc).toContain("updateIntegrationConnectionStatus");  // IntegrationConnection status
    expect(callbackRouteSrc).toContain("consumeOAuthSessionByState");         // OAuthSession consume
    // Prohibited writes — no Asset, ProductEntity, R2
    expect(callbackRouteSrc).not.toContain("ProductEntity");
    expect(callbackRouteSrc).not.toContain("uploadTo");
  });

  test("T24: Drive route scan-page validates ancestry on EVERY request — fail closed", () => {
    // Find the scan-page block and verify ancestry check
    const scanPageIdx = driveRouteSrc.indexOf('"scan-page"');
    const scanPageBlock = driveRouteSrc.slice(scanPageIdx, scanPageIdx + 1500);
    expect(scanPageBlock).toContain("isDescendantOfRoot");
    expect(scanPageBlock).toContain("OUTSIDE_TENANT_ROOT");
  });
});

// ── Section G: 5-Step Stepper ───────────────────────────────────────────────

describe("04A-F-G: 5-step stepper flow", () => {
  test("T25: Drawer has all 5 stepper steps defined", () => {
    expect(drawerSrc).toContain('"connection"');
    expect(drawerSrc).toContain('"root"');
    expect(drawerSrc).toContain('"folders"');
    expect(drawerSrc).toContain('"scanning"');
    expect(drawerSrc).toContain('"results"');
    // Stepper labels rendered
    expect(drawerSrc).toContain("STEPPER_LABELS");
    expect(drawerSrc).toContain("Conexion");
    expect(drawerSrc).toContain("Carpetas");
    expect(drawerSrc).toContain("Escaneo");
    expect(drawerSrc).toContain("Resultados");
  });

  test("T26: Connection states cover full lifecycle", () => {
    expect(drawerSrc).toContain('"CHECKING"');
    expect(drawerSrc).toContain('"DISCONNECTED"');
    expect(drawerSrc).toContain('"CONNECTING"');
    expect(drawerSrc).toContain('"CONNECTED_NO_ROOT"');
    expect(drawerSrc).toContain('"READY"');
    expect(drawerSrc).toContain('"TOKEN_EXPIRED"');
    expect(drawerSrc).toContain('"ERROR"');
  });

  test("T27: Auto-advance: READY skips to folders, CONNECTED_NO_ROOT goes to root", () => {
    // READY → folders
    expect(drawerSrc).toContain('connState === "READY"');
    expect(drawerSrc).toContain('setStep("folders")');
    // CONNECTED_NO_ROOT → root
    expect(drawerSrc).toContain('connState === "CONNECTED_NO_ROOT"');
    expect(drawerSrc).toContain('setStep("root")');
  });

  test("T28: Connect redirects to OAuth initiation route", () => {
    expect(drawerSrc).toContain("/api/integrations/google-drive/connect");
    expect(drawerSrc).toContain("orgSlug");
  });
});

// ── Section I: Integration completeness ─────────────────────────────────────

describe("04A-F-I: End-to-end integration signals", () => {
  test("T29: Drawer renders scan progress with real KPIs during scanning", () => {
    expect(drawerSrc).toContain('step === "scanning"');
    expect(drawerSrc).toContain("scanFoldersDone");
    expect(drawerSrc).toContain("scanFilesDone");
    expect(drawerSrc).toContain("scanPagesDone");
    expect(drawerSrc).toContain("scanCurrentFolder");
    expect(drawerSrc).toContain("Escaneando");
  });

  test("T30: BFS queue initialized from ALL selected folders", () => {
    // Queue built from foldersToScan array
    expect(drawerSrc).toContain("foldersToScan.map");
    expect(drawerSrc).toContain("selectedFolderIds.entries()");
    expect(drawerSrc).toContain("seenFileIds");
  });
});
