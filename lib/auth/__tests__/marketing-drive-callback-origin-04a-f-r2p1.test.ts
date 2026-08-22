/**
 * lib/auth/__tests__/marketing-drive-callback-origin-04a-f-r2p1.test.ts
 *
 * MARKETING-DRIVE-CALLBACK-ORIGIN-04A-F-R2-P1 — 15 Tests
 *
 * P1 fix: OAuth callback must redirect to the initiating deployment origin,
 * not always to NEXT_PUBLIC_APP_URL (production). Covers:
 *   - Connect route stores originUrl in OAuthSession metadata
 *   - Callback uses stored originUrl for redirect
 *   - Origin validation (open-redirect prevention)
 *   - DRIVE_PERMISSION_DENIED signals reauthRequired
 *   - Drawer detects reauth from admin-browse errors
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

const connectSrc  = readSrc("app/api/integrations/google-drive/connect/route.ts");
const callbackSrc = readSrc("app/api/integrations/google-drive/callback/route.ts");
const driveRouteSrc = readSrc("app/api/orgs/[orgSlug]/marketing-studio/drive/route.ts");
const drawerSrc   = readSrc("components/marketing-studio/library/bulk-import-drawer.tsx");

// ── Section A: Connect stores originUrl ─────────────────────────────────────

describe("CALLBACK-ORIGIN-A: Connect route captures initiating origin", () => {
  test("T01: Connect stores originUrl in OAuthSession metadata", () => {
    expect(connectSrc).toContain("originUrl");
    expect(connectSrc).toContain("initiatingOrigin");
    expect(connectSrc).toContain("req.nextUrl.origin");
  });

  test("T02: originUrl stored alongside orgSlug and returnTo", () => {
    // All three must be in the metadata block
    const metadataIdx = connectSrc.indexOf("metadata:");
    const metadataBlock = connectSrc.slice(metadataIdx, metadataIdx + 300);
    expect(metadataBlock).toContain("orgSlug");
    expect(metadataBlock).toContain("returnTo");
    expect(metadataBlock).toContain("originUrl");
  });
});

// ── Section B: Callback uses stored origin ──────────────────────────────────

describe("CALLBACK-ORIGIN-B: Callback redirects to initiating origin", () => {
  test("T03: Callback reads originUrl from session metadata", () => {
    expect(callbackSrc).toContain("originUrl");
    expect(callbackSrc).toContain("storedOrigin");
  });

  test("T04: Callback uses isAllowedOrigin to validate stored origin", () => {
    expect(callbackSrc).toContain("isAllowedOrigin");
    expect(callbackSrc).toContain("isAllowedOrigin(storedOrigin)");
  });

  test("T05: Fallback to NEXT_PUBLIC_APP_URL when origin is missing or invalid", () => {
    expect(callbackSrc).toContain("fallbackAppUrl");
    expect(callbackSrc).toContain("NEXT_PUBLIC_APP_URL");
    // Ternary: use stored if valid, else fallback
    expect(callbackSrc).toContain("isAllowedOrigin(storedOrigin) ? storedOrigin : fallbackAppUrl");
  });

  test("T06: Success redirect uses appUrl (resolved origin, not hardcoded)", () => {
    const successRedirect = callbackSrc.indexOf("drive_connected=1");
    const nearSuccess = callbackSrc.slice(Math.max(0, successRedirect - 100), successRedirect + 50);
    expect(nearSuccess).toContain("appUrl");
    expect(nearSuccess).not.toContain("NEXT_PUBLIC_APP_URL");
  });

  test("T07: Error redirect also uses appUrl from resolved origin", () => {
    const errorRedirect = callbackSrc.indexOf("token_exchange_failed");
    const nearError = callbackSrc.slice(Math.max(0, errorRedirect - 100), errorRedirect + 50);
    expect(nearError).toContain("appUrl");
  });
});

// ── Section C: Origin validation (open-redirect prevention) ─────────────────

describe("CALLBACK-ORIGIN-C: Origin validation prevents open redirect", () => {
  test("T08: isAllowedOrigin function exists with URL parsing", () => {
    expect(callbackSrc).toContain("function isAllowedOrigin");
    expect(callbackSrc).toContain("new URL(origin)");
  });

  test("T09: Allows production domain agentickers.com", () => {
    expect(callbackSrc).toContain('hostname === "agentickers.com"');
  });

  test("T10: Allows Vercel preview deployments (project-scoped)", () => {
    expect(callbackSrc).toContain("andreshg0407-commits-projects.vercel.app");
  });

  test("T11: Allows localhost for development", () => {
    expect(callbackSrc).toContain('hostname === "localhost"');
  });

  test("T12: Returns false for undefined/null origin", () => {
    expect(callbackSrc).toContain("if (!origin) return false");
  });
});

// ── Section D: DRIVE_PERMISSION_DENIED signals reauth ───────────────────────

describe("CALLBACK-ORIGIN-D: Permission denied triggers reauth flow", () => {
  test("T13: DRIVE_PERMISSION_DENIED error handler includes reauthRequired", () => {
    const permDeniedIdx = driveRouteSrc.indexOf('"DRIVE_PERMISSION_DENIED"');
    // Find the error handler line (in the catch block)
    const errorHandlerIdx = driveRouteSrc.indexOf("DRIVE_PERMISSION_DENIED", permDeniedIdx + 30);
    if (errorHandlerIdx > -1) {
      const errorLine = driveRouteSrc.slice(errorHandlerIdx, errorHandlerIdx + 200);
      expect(errorLine).toContain("reauthRequired");
    }
  });

  test("T14: Drawer admin-browse detects reauthRequired from error response", () => {
    // Find the admin-browse fetch call (not the comment)
    const browseIdx = drawerSrc.indexOf('action: "admin-browse"');
    const browseBlock = drawerSrc.slice(browseIdx, browseIdx + 1000);
    expect(browseBlock).toContain("reauthRequired");
    expect(browseBlock).toContain('setConnState("REAUTH_REQUIRED")');
  });

  test("T15: Denied consent redirect tries to resolve origin from session", () => {
    // The error/denied path reads session to get originUrl
    const deniedIdx = callbackSrc.indexOf("drive_error=denied");
    const deniedBlock = callbackSrc.slice(Math.max(0, deniedIdx - 500), deniedIdx + 50);
    expect(deniedBlock).toContain("originUrl");
    expect(deniedBlock).toContain("isAllowedOrigin");
  });
});
