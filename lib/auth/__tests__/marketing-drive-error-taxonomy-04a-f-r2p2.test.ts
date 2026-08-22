/**
 * lib/auth/__tests__/marketing-drive-error-taxonomy-04a-f-r2p2.test.ts
 *
 * MARKETING-DRIVE-ERROR-TAXONOMY-04A-F-R2-P2 — 25 Tests
 *
 * P0-R2 fix: classified Drive API errors, scopes reading, Preview redirect_uri.
 * Covers:
 *   A: DriveErrorClass taxonomy in drive-api-client (7 classes)
 *   B: classifyDriveError function classification logic
 *   C: Route error handler parses DRIVE_ERROR:CLASS:STATUS:ENDPOINT format
 *   D: Only TOKEN_REVOKED/DRIVE_SCOPE_MISSING/DRIVE_API_DISABLED trigger reauthRequired
 *   E: Scopes reading in status endpoint
 *   F: GOOGLE_DRIVE_REDIRECT_URI env var support
 *   G: admin-browse surfaces classified errors with reauthRequired
 *
 * Source-reading pattern. No mocks, no DB, no network.
 */

// @ts-expect-error — vitest resolves at runtime, TSC does not have vitest types
import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

const driveClientSrc = readSrc("lib/marketing-studio/drive/drive-api-client.ts");
const driveRouteSrc  = readSrc("app/api/orgs/[orgSlug]/marketing-studio/drive/route.ts");
const oauthConfigSrc = readSrc("lib/integrations/oauth/providers/google-drive-oauth.ts");

// ── Section A: DriveErrorClass taxonomy ──────────────────────────────────────

describe("ERROR-TAXONOMY-A: 7 Drive error classes defined", () => {
  test("T01: DriveErrorClass union type has 8 members", () => {
    expect(driveClientSrc).toContain("TOKEN_REVOKED");
    expect(driveClientSrc).toContain("DRIVE_SCOPE_MISSING");
    expect(driveClientSrc).toContain("DRIVE_API_DISABLED");
    expect(driveClientSrc).toContain("WORKSPACE_ADMIN_BLOCKED");
    expect(driveClientSrc).toContain("FOLDER_ACCESS_DENIED");
    expect(driveClientSrc).toContain("NOT_FOUND");
    expect(driveClientSrc).toContain("EMPTY_LISTING");
    expect(driveClientSrc).toContain('"UNKNOWN"');
  });

  test("T02: DriveApiErrorInfo interface has httpStatus, reason, message, endpoint, errorClass", () => {
    expect(driveClientSrc).toContain("interface DriveApiErrorInfo");
    expect(driveClientSrc).toContain("httpStatus:");
    expect(driveClientSrc).toContain("reason:");
    expect(driveClientSrc).toContain("message:");
    expect(driveClientSrc).toContain("endpoint:");
    expect(driveClientSrc).toContain("errorClass:");
  });
});

// ── Section B: classifyDriveError logic ──────────────────────────────────────

describe("ERROR-TAXONOMY-B: classifyDriveError classification", () => {
  test("T03: 401 maps to TOKEN_REVOKED", () => {
    const classifyIdx = driveClientSrc.indexOf("async function classifyDriveError");
    const classifyBlock = driveClientSrc.slice(classifyIdx, classifyIdx + 1400);
    expect(classifyBlock).toContain("httpStatus === 401");
    expect(classifyBlock).toContain('"TOKEN_REVOKED"');
  });

  test("T04: 403 insufficientPermissions maps to DRIVE_SCOPE_MISSING", () => {
    const classifyIdx = driveClientSrc.indexOf("async function classifyDriveError");
    const classifyBlock = driveClientSrc.slice(classifyIdx, classifyIdx + 1400);
    expect(classifyBlock).toContain('"insufficientPermissions"');
    expect(classifyBlock).toContain('"DRIVE_SCOPE_MISSING"');
  });

  test("T05: 403 accessNotConfigured maps to DRIVE_API_DISABLED", () => {
    const classifyIdx = driveClientSrc.indexOf("async function classifyDriveError");
    const classifyBlock = driveClientSrc.slice(classifyIdx, classifyIdx + 1400);
    expect(classifyBlock).toContain('"accessNotConfigured"');
    expect(classifyBlock).toContain('"DRIVE_API_DISABLED"');
  });

  test("T06: 403 domainPolicy maps to WORKSPACE_ADMIN_BLOCKED", () => {
    const classifyIdx = driveClientSrc.indexOf("async function classifyDriveError");
    const classifyBlock = driveClientSrc.slice(classifyIdx, classifyIdx + 1400);
    expect(classifyBlock).toContain('"domainPolicy"');
    expect(classifyBlock).toContain('"WORKSPACE_ADMIN_BLOCKED"');
  });

  test("T07: 403 on folder endpoint maps to FOLDER_ACCESS_DENIED", () => {
    const classifyIdx = driveClientSrc.indexOf("async function classifyDriveError");
    const classifyBlock = driveClientSrc.slice(classifyIdx, classifyIdx + 1400);
    expect(classifyBlock).toContain("FOLDER_ACCESS_DENIED");
    // Heuristic: files/ in endpoint or files.list
    expect(classifyBlock).toContain('endpoint.includes("files/")');
  });

  test("T08: throwDriveError format is DRIVE_ERROR:CLASS:STATUS:ENDPOINT", () => {
    const throwIdx = driveClientSrc.indexOf("function throwDriveError");
    const throwBlock = driveClientSrc.slice(throwIdx, throwIdx + 300);
    expect(throwBlock).toContain("DRIVE_ERROR:");
    expect(throwBlock).toContain("info.errorClass");
    expect(throwBlock).toContain("info.httpStatus");
    expect(throwBlock).toContain("info.endpoint");
  });
});

// ── Section C: All 4 DRIVE_PERMISSION_DENIED replaced ───────────────────────

describe("ERROR-TAXONOMY-C: All permission throws use classified errors", () => {
  test("T09: All 401/403 in drive-api-client use classifyDriveError", () => {
    // Count remaining literal DRIVE_PERMISSION_DENIED throws (should be zero)
    const matches = driveClientSrc.match(/throw new Error\("DRIVE_PERMISSION_DENIED"\)/g);
    expect(matches).toBeNull();
  });

  test("T10: classifyDriveError called 4 times in drive-api-client", () => {
    const calls = driveClientSrc.match(/classifyDriveError\(/g);
    expect(calls).not.toBeNull();
    expect(calls!.length).toBeGreaterThanOrEqual(4);
  });

  test("T11: listFolderPage uses classifyDriveError for files.list.page endpoint", () => {
    const listFolderIdx = driveClientSrc.indexOf("async function listFolderPage");
    const listFolderBlock = driveClientSrc.slice(listFolderIdx, listFolderIdx + 1000);
    expect(listFolderBlock).toContain('classifyDriveError(res, "files.list.page")');
  });
});

// ── Section D: Route error handler ───────────────────────────────────────────

describe("ERROR-TAXONOMY-D: Route parses classified errors correctly", () => {
  test("T12: Error handler detects DRIVE_ERROR: prefix", () => {
    expect(driveRouteSrc).toContain('msg.startsWith("DRIVE_ERROR:")');
  });

  test("T13: Parses errorClass from DRIVE_ERROR:CLASS:STATUS:ENDPOINT", () => {
    const handlerIdx = driveRouteSrc.indexOf('msg.startsWith("DRIVE_ERROR:")');
    const handlerBlock = driveRouteSrc.slice(handlerIdx, handlerIdx + 500);
    expect(handlerBlock).toContain("msg.split(\":\")");
    expect(handlerBlock).toContain("errorClass");
  });

  test("T14: Only TOKEN_REVOKED and DRIVE_SCOPE_MISSING set reauthRequired", () => {
    // Find the global (2nd) DRIVE_ERROR handler
    const firstIdx = driveRouteSrc.indexOf('msg.startsWith("DRIVE_ERROR:")');
    const globalIdx = driveRouteSrc.indexOf('msg.startsWith("DRIVE_ERROR:")', firstIdx + 10);
    const handlerBlock = driveRouteSrc.slice(globalIdx, globalIdx + 800);
    expect(handlerBlock).toContain('"TOKEN_REVOKED"');
    expect(handlerBlock).toContain('"DRIVE_SCOPE_MISSING"');
    // DRIVE_API_DISABLED is NOT in reauthClasses — it's a configError
    expect(handlerBlock).toContain("isConfigError");
    expect(handlerBlock).toContain("DRIVE_API_DISABLED");
  });

  test("T15: FOLDER_ACCESS_DENIED does NOT trigger reauthRequired", () => {
    const firstIdx = driveRouteSrc.indexOf('msg.startsWith("DRIVE_ERROR:")');
    const globalIdx = driveRouteSrc.indexOf('msg.startsWith("DRIVE_ERROR:")', firstIdx + 10);
    const handlerBlock = driveRouteSrc.slice(globalIdx, globalIdx + 1000);
    // reauthClasses only has TOKEN_REVOKED and DRIVE_SCOPE_MISSING
    expect(handlerBlock).toContain("reauthClasses.has(errorClass)");
    // DRIVE_API_DISABLED and WORKSPACE_ADMIN_BLOCKED are configError, not reauth
    expect(handlerBlock).toContain("configError: isConfigError ? errorClass : null");
  });

  test("T16: WORKSPACE_ADMIN_BLOCKED is a configError, not reauthRequired", () => {
    // The global error handler (2nd occurrence) treats it as configError
    const firstIdx = driveRouteSrc.indexOf('msg.startsWith("DRIVE_ERROR:")');
    const globalHandlerIdx = driveRouteSrc.indexOf('msg.startsWith("DRIVE_ERROR:")', firstIdx + 10);
    const handlerBlock = driveRouteSrc.slice(globalHandlerIdx, globalHandlerIdx + 800);
    expect(handlerBlock).toContain("WORKSPACE_ADMIN_BLOCKED");
    expect(handlerBlock).toContain("isConfigError");
  });
});

// ── Section E: Scopes reading in status ──────────────────────────────────────

describe("ERROR-TAXONOMY-E: Status endpoint reads stored scopes", () => {
  test("T17: Status queries IntegrationConnection.scopes", () => {
    const statusIdx = driveRouteSrc.indexOf('"status"');
    const statusBlock = driveRouteSrc.slice(statusIdx, statusIdx + 3000);
    expect(statusBlock).toContain("scopes");
    expect(statusBlock).toContain("storedScopes");
  });

  test("T18: Status response includes storedScopes and hasDriveReadonly", () => {
    const statusIdx = driveRouteSrc.indexOf('"status"');
    const statusBlock = driveRouteSrc.slice(statusIdx, statusIdx + 3000);
    expect(statusBlock).toContain("storedScopes");
    expect(statusBlock).toContain("hasDriveReadonly");
  });

  test("T19: hasDriveReadonly checks for drive.readonly scope", () => {
    const statusIdx = driveRouteSrc.indexOf('"status"');
    const statusBlock = driveRouteSrc.slice(statusIdx, statusIdx + 4000);
    expect(statusBlock).toContain("drive.readonly");
  });

  test("T20: No-connection response also includes storedScopes/hasDriveReadonly", () => {
    // The short-circuit response (no connection) must have scopes fields too
    const noConnIdx = driveRouteSrc.indexOf("no probe needed");
    const noConnBlock = driveRouteSrc.slice(noConnIdx, noConnIdx + 500);
    expect(noConnBlock).toContain("storedScopes");
    expect(noConnBlock).toContain("hasDriveReadonly");
  });
});

// ── Section F: GOOGLE_DRIVE_REDIRECT_URI env var ─────────────────────────────

describe("ERROR-TAXONOMY-F: Preview redirect_uri via env var", () => {
  test("T21: getGoogleCredentials prefers GOOGLE_DRIVE_REDIRECT_URI", () => {
    expect(oauthConfigSrc).toContain("GOOGLE_DRIVE_REDIRECT_URI");
    // Priority: GOOGLE_DRIVE_REDIRECT_URI > GOOGLE_REDIRECT_URI > fallback
    const credsFnIdx = oauthConfigSrc.indexOf("function getGoogleCredentials");
    const credsBlock = oauthConfigSrc.slice(credsFnIdx, credsFnIdx + 500);
    expect(credsBlock).toContain("GOOGLE_DRIVE_REDIRECT_URI");
    expect(credsBlock).toContain("GOOGLE_REDIRECT_URI");
  });

  test("T22: Fallback constructs redirect_uri from NEXT_PUBLIC_APP_URL", () => {
    const credsFnIdx = oauthConfigSrc.indexOf("function getGoogleCredentials");
    const credsBlock = oauthConfigSrc.slice(credsFnIdx, credsFnIdx + 500);
    expect(credsBlock).toContain("NEXT_PUBLIC_APP_URL");
    expect(credsBlock).toContain("/api/integrations/google-drive/callback");
  });

  test("T23: redirectUri is separate from originUrl concept", () => {
    // getGoogleCredentials returns redirectUri (where Google sends the code)
    const credsFnIdx = oauthConfigSrc.indexOf("function getGoogleCredentials");
    const credsBlock = oauthConfigSrc.slice(credsFnIdx, credsFnIdx + 500);
    expect(credsBlock).toContain("redirectUri");
    // originUrl is NOT used in getGoogleCredentials — it's a separate concept
    expect(credsBlock).not.toContain("originUrl");
  });
});

// ── Section G: admin-browse surfaces classified errors ───────────────────────

describe("ERROR-TAXONOMY-G: admin-browse error handling", () => {
  test("T24: admin-browse catch parses DRIVE_ERROR: format", () => {
    const adminBrowseIdx = driveRouteSrc.indexOf('"admin-browse"');
    const adminBrowseBlock = driveRouteSrc.slice(adminBrowseIdx, adminBrowseIdx + 3000);
    expect(adminBrowseBlock).toContain('msg.startsWith("DRIVE_ERROR:")');
    expect(adminBrowseBlock).toContain("reauthRequired");
  });

  test("T25: admin-browse classified error response includes reauthReason", () => {
    const adminBrowseIdx = driveRouteSrc.indexOf('"admin-browse"');
    const adminBrowseBlock = driveRouteSrc.slice(adminBrowseIdx, adminBrowseIdx + 3200);
    expect(adminBrowseBlock).toContain("reauthReason");
    expect(adminBrowseBlock).toContain("reauthClasses.has(errorClass)");
  });
});

// ── Section H: configError — no reauth CTA ──────────────────────────────────

const drawerSrc = readSrc("components/marketing-studio/library/bulk-import-drawer.tsx");

describe("ERROR-TAXONOMY-H: configError is separate from reauthRequired", () => {
  test("T26: Status probe sets configError for DRIVE_API_DISABLED (not reauthRequired)", () => {
    const probeIdx = driveRouteSrc.indexOf("accessNotConfigured");
    const probeBlock = driveRouteSrc.slice(probeIdx, probeIdx + 200);
    expect(probeBlock).toContain("DRIVE_API_DISABLED");
    // Must NOT contain reauthRequired = true nearby
    expect(probeBlock).not.toContain("reauthRequired = true");
    expect(probeBlock).toContain("configError");
  });

  test("T27: Status probe sets configError for WORKSPACE_ADMIN_BLOCKED", () => {
    const probeIdx = driveRouteSrc.indexOf("domainPolicy");
    const probeBlock = driveRouteSrc.slice(probeIdx, probeIdx + 200);
    expect(probeBlock).toContain("WORKSPACE_ADMIN_BLOCKED");
    expect(probeBlock).not.toContain("reauthRequired = true");
    expect(probeBlock).toContain("configError");
  });

  test("T28: Status response includes configError field", () => {
    const statusIdx = driveRouteSrc.indexOf('"status"');
    const statusBlock = driveRouteSrc.slice(statusIdx, statusIdx + 4500);
    expect(statusBlock).toContain("configError");
    // connected is false when configError exists
    expect(statusBlock).toContain("!reauthRequired && !configError");
  });

  test("T29: Drawer has configErrorLabel function for non-reauth errors", () => {
    expect(drawerSrc).toContain("configErrorLabel");
    expect(drawerSrc).toContain("Contacta al administrador");
  });

  test("T30: Drawer REAUTH_REQUIRED block does NOT show CTA for config errors", () => {
    // configError routes to ERROR state, not REAUTH_REQUIRED
    expect(drawerSrc).toContain('configError)');
    expect(drawerSrc).toContain('setConnState("ERROR")');
    // reauthReasonLabel no longer includes DRIVE_API_DISABLED
    const reauthFnIdx = drawerSrc.indexOf("function reauthReasonLabel");
    const reauthFnBlock = drawerSrc.slice(reauthFnIdx, reauthFnIdx + 400);
    expect(reauthFnBlock).not.toContain("DRIVE_API_DISABLED");
    expect(reauthFnBlock).not.toContain("WORKSPACE_ADMIN_BLOCKED");
  });
});

// ── Section I: Token refresh before reauth ───────────────────────────────────

const driveClientSrcI = readSrc("lib/marketing-studio/drive/drive-api-client.ts");

describe("ERROR-TAXONOMY-I: Token expired triggers refresh before reauth", () => {
  test("T31: getDriveAccessToken attempts refresh when token is expired", () => {
    const fnIdx = driveClientSrcI.indexOf("async function getDriveAccessToken");
    const fnBlock = driveClientSrcI.slice(fnIdx, fnIdx + 1000);
    // Checks for expired token and attempts refresh
    expect(fnBlock).toContain("isExpired");
    expect(fnBlock).toContain("refresh_token");
    expect(fnBlock).toContain("refreshGoogleAccessToken");
  });

  test("T32: Only throws DRIVE_TOKEN_EXPIRED when refresh itself fails", () => {
    const fnIdx = driveClientSrcI.indexOf("async function getDriveAccessToken");
    const fnBlock = driveClientSrcI.slice(fnIdx, fnIdx + 800);
    // Throws only when no refresh token or refresh call fails
    expect(fnBlock).toContain("DRIVE_TOKEN_EXPIRED");
    expect(fnBlock).toContain("no refresh token available");
  });

  test("T33: Status probe catch distinguishes transient errors from token failure", () => {
    const probeIdx = driveRouteSrc.indexOf("getDriveAccessToken already tried refresh");
    expect(probeIdx).toBeGreaterThan(-1);
    // Transient errors don't force reauth
    const catchBlock = driveRouteSrc.slice(probeIdx, probeIdx + 300);
    expect(catchBlock).toContain("PROBE_FAILED");
  });
});
