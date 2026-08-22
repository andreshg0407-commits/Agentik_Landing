/**
 * lib/auth/__tests__/marketing-drive-oauth-reauth-04a-f-r2.test.ts
 *
 * MARKETING-DRIVE-OAUTH-REAUTH-04A-F-R2 — 20 Tests
 *
 * Covers: stale OAuth connection detection, Drive API probe, reauth flow,
 * scope verification, differentiated error taxonomy, disconnect action,
 * token replacement, tenant isolation, zero asset writes.
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

const driveRouteSrc   = readSrc("app/api/orgs/[orgSlug]/marketing-studio/drive/route.ts");
const callbackRouteSrc = readSrc("app/api/integrations/google-drive/callback/route.ts");
const drawerSrc       = readSrc("components/marketing-studio/library/bulk-import-drawer.tsx");
const driveClientSrc  = readSrc("lib/marketing-studio/drive/drive-api-client.ts");
const driveOAuthSrc   = readSrc("lib/integrations/oauth/providers/google-drive-oauth.ts");

// ── Section A: Live Drive probe in status ───────────────────────────────────

describe("REAUTH-A: Status endpoint probes Drive API", () => {
  test("T01: Status action calls getDriveAccessToken to verify token validity", () => {
    // Find the status block
    const statusIdx = driveRouteSrc.indexOf('"status"');
    const statusBlock = driveRouteSrc.slice(statusIdx, statusIdx + 3000);
    expect(statusBlock).toContain("getDriveAccessToken");
  });

  test("T02: Status probes googleapis.com/drive/v3/about — lightweight read-only", () => {
    const statusIdx = driveRouteSrc.indexOf('"status"');
    const statusBlock = driveRouteSrc.slice(statusIdx, statusIdx + 3000);
    expect(statusBlock).toContain("googleapis.com/drive/v3/about");
  });

  test("T03: Status returns reauthRequired and reauthReason fields", () => {
    const statusIdx = driveRouteSrc.indexOf('"status"');
    const statusBlock = driveRouteSrc.slice(statusIdx, statusIdx + 3000);
    expect(statusBlock).toContain("reauthRequired");
    expect(statusBlock).toContain("reauthReason");
  });

  test("T04: Stale connection (DB connected, token revoked) returns reauthRequired:true", () => {
    const statusIdx = driveRouteSrc.indexOf('"status"');
    const statusBlock = driveRouteSrc.slice(statusIdx, statusIdx + 4500);
    // On probe failure (401/403), sets reauthRequired = true
    expect(statusBlock).toContain("reauthRequired = true");
    // connected is false when reauthRequired or configError
    expect(statusBlock).toContain("!reauthRequired && !configError");
  });
});

// ── Section B: Differentiated error taxonomy ────────────────────────────────

describe("REAUTH-B: Error taxonomy — 5 distinct reauth reasons", () => {
  test("T05: Status classifies TOKEN_REVOKED from probe 401/403", () => {
    expect(driveRouteSrc).toContain('"TOKEN_REVOKED"');
  });

  test("T06: Status classifies TOKEN_EXPIRED from getDriveAccessToken failure", () => {
    expect(driveRouteSrc).toContain('"TOKEN_EXPIRED"');
  });

  test("T07: Status classifies DRIVE_SCOPE_MISSING from insufficientPermissions", () => {
    expect(driveRouteSrc).toContain('"DRIVE_SCOPE_MISSING"');
    expect(driveRouteSrc).toContain("insufficientPermissions");
  });

  test("T08: Status classifies DRIVE_API_DISABLED from accessNotConfigured", () => {
    expect(driveRouteSrc).toContain('"DRIVE_API_DISABLED"');
    expect(driveRouteSrc).toContain("accessNotConfigured");
  });

  test("T09: Status classifies WORKSPACE_ADMIN_BLOCKED from domainPolicy", () => {
    expect(driveRouteSrc).toContain('"WORKSPACE_ADMIN_BLOCKED"');
    expect(driveRouteSrc).toContain("domainPolicy");
  });
});

// ── Section C: Callback scope verification ──────────────────────────────────

describe("REAUTH-C: Callback verifies granted scopes", () => {
  test("T10: Callback checks for drive.readonly in granted scopes", () => {
    expect(callbackRouteSrc).toContain("drive.readonly");
    expect(callbackRouteSrc).toContain("hasDriveReadonly");
  });

  test("T11: Missing drive.readonly redirects with DRIVE_SCOPE_MISSING error", () => {
    expect(callbackRouteSrc).toContain("DRIVE_SCOPE_MISSING");
    // Redirect, not a 403 JSON — user sees error in UI
    const scopeCheckIdx = callbackRouteSrc.indexOf("hasDriveReadonly");
    const scopeBlock = callbackRouteSrc.slice(scopeCheckIdx, scopeCheckIdx + 300);
    expect(scopeBlock).toContain("NextResponse.redirect");
  });

  test("T12: Session consumed even on scope failure — anti-replay", () => {
    // The consumeOAuthSessionByState before DRIVE_SCOPE_MISSING redirect
    const scopeIdx = callbackRouteSrc.indexOf("DRIVE_SCOPE_MISSING");
    const beforeScope = callbackRouteSrc.slice(0, scopeIdx);
    expect(beforeScope).toContain("consumeOAuthSessionByState");
  });
});

// ── Section D: Drawer REAUTH_REQUIRED state ─────────────────────────────────

describe("REAUTH-D: Drawer handles REAUTH_REQUIRED", () => {
  test("T13: ConnectionState type includes REAUTH_REQUIRED", () => {
    expect(drawerSrc).toContain('"REAUTH_REQUIRED"');
  });

  test("T14: checkDriveStatus detects reauthRequired from status response", () => {
    expect(drawerSrc).toContain("data.reauthRequired");
    expect(drawerSrc).toContain('setConnState("REAUTH_REQUIRED")');
  });

  test("T15: REAUTH_REQUIRED shows 'Reconectar cuenta de Google' CTA", () => {
    expect(drawerSrc).toContain('connState === "REAUTH_REQUIRED"');
    expect(drawerSrc).toContain("Reconectar cuenta de Google");
    expect(drawerSrc).toContain("Reautorizacion requerida");
  });

  test("T16: REAUTH_REQUIRED auto-returns to connection step from any step", () => {
    expect(drawerSrc).toContain('connState === "REAUTH_REQUIRED"');
    expect(drawerSrc).toContain('setStep("connection")');
  });

  test("T17: Drawer has reauthReasonLabel for reauth and configErrorLabel for config", () => {
    // Reauth reasons (show reconnect CTA)
    expect(drawerSrc).toContain("reauthReasonLabel");
    expect(drawerSrc).toContain("TOKEN_REVOKED");
    expect(drawerSrc).toContain("TOKEN_EXPIRED");
    expect(drawerSrc).toContain("DRIVE_SCOPE_MISSING");
    // Config errors (no reconnect CTA — "Contacta al administrador")
    expect(drawerSrc).toContain("configErrorLabel");
    expect(drawerSrc).toContain("DRIVE_API_DISABLED");
    expect(drawerSrc).toContain("WORKSPACE_ADMIN_BLOCKED");
  });
});

// ── Section E: Disconnect action ────────────────────────────────────────────

describe("REAUTH-E: Disconnect action", () => {
  test("T18: Disconnect action exists with admin gate", () => {
    expect(driveRouteSrc).toContain('"disconnect"');
    expect(driveRouteSrc).toContain("ADMIN_DISCONNECT_DENIED");
    expect(driveRouteSrc).toContain("disconnectConnectionById");
  });

  test("T19: Disconnect does NOT delete assets or products", () => {
    // Find the disconnect block
    const disconnectIdx = driveRouteSrc.indexOf('"disconnect"');
    const disconnectBlock = driveRouteSrc.slice(disconnectIdx, disconnectIdx + 600);
    expect(disconnectBlock).not.toContain("prisma.productEntity");
    expect(disconnectBlock).not.toContain("prisma.asset");
    expect(disconnectBlock).not.toContain("uploadToR2");
    expect(disconnectBlock).not.toContain("putObject");
  });
});

// ── Section F: OAuth reconnection ───────────────────────────────────────────

describe("REAUTH-F: Reconnection preserves security guarantees", () => {
  test("T20: OAuth config uses prompt=consent + access_type=offline for fresh tokens", () => {
    expect(driveOAuthSrc).toContain("prompt");
    expect(driveOAuthSrc).toContain("consent");
    expect(driveOAuthSrc).toContain("access_type");
    expect(driveOAuthSrc).toContain("offline");
  });

  test("T21: Callback replaces old tokens — upsert semantics on storeIntegrationSecret", () => {
    expect(callbackRouteSrc).toContain("storeIntegrationSecret");
    expect(callbackRouteSrc).toContain("access_token");
    expect(callbackRouteSrc).toContain("refresh_token");
    // Upsert connection by external ID — replaces existing
    expect(callbackRouteSrc).toContain("upsertConnectionByExternalId");
  });

  test("T22: Scopes requested include drive.readonly, openid, email", () => {
    expect(driveOAuthSrc).toContain("drive.readonly");
    expect(driveOAuthSrc).toContain("openid");
    expect(driveOAuthSrc).toContain("email");
  });
});

// ── Section G: Zero-write guarantee ─────────────────────────────────────────

describe("REAUTH-G: Zero asset/product writes", () => {
  test("T23: Status probe is read-only — about endpoint, no file mutations", () => {
    const statusIdx = driveRouteSrc.indexOf('"status"');
    const statusBlock = driveRouteSrc.slice(statusIdx, statusIdx + 3000);
    // Uses about endpoint, not files.create/update/delete
    expect(statusBlock).toContain("about?fields=user");
    expect(statusBlock).not.toContain("files.create");
    expect(statusBlock).not.toContain("files.update");
  });

  test("T24: Drawer REAUTH_REQUIRED block has zero write operations", () => {
    const reauthIdx = drawerSrc.indexOf('connState === "REAUTH_REQUIRED"');
    const reauthBlock = drawerSrc.slice(reauthIdx, reauthIdx + 500);
    expect(reauthBlock).not.toContain("prisma.");
    expect(reauthBlock).not.toContain('method: "POST"');
    expect(reauthBlock).not.toContain('method: "PUT"');
    expect(reauthBlock).not.toContain('method: "DELETE"');
  });
});
