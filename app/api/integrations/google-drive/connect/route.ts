/**
 * app/api/integrations/google-drive/connect/route.ts
 *
 * MARKETING-STUDIO-DRIVE-IMPORT-01 — Google Drive OAuth Initiation
 *
 * GET ?orgSlug=...
 *   Creates an OAuthSession (PKCE + CSRF state), builds the Google authorization URL,
 *   and redirects the user to Google for consent.
 *
 * SECURITY:
 * - requireOrgAccess enforces authentication and org membership.
 * - State and codeVerifier are stored in OAuthSession (server-side).
 * - If Google credentials are not configured, redirects to Biblioteca with error.
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireOrgAccess }             from "@/lib/auth/org-access";
import {
  generateOAuthState,
  generateCodeVerifier,
  deriveCodeChallenge,
}                                       from "@/lib/integrations/oauth/oauth-url-builder";
import {
  buildGoogleDriveAuthUrl,
  getGoogleCredentials,
}                                       from "@/lib/integrations/oauth/providers/google-drive-oauth";
import { prisma }                       from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const orgSlug = req.nextUrl.searchParams.get("orgSlug");
  if (!orgSlug) {
    return NextResponse.json({ error: "orgSlug required" }, { status: 400 });
  }

  try {
    const { organization } = await requireOrgAccess(orgSlug);
    const creds             = getGoogleCredentials();

    const state         = generateOAuthState();
    const codeVerifier  = generateCodeVerifier();
    const codeChallenge = deriveCodeChallenge(codeVerifier);
    const expiresAt     = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await prisma.oAuthSession.create({
      data: {
        organizationId:  organization.id,
        provider:        "google_drive",
        state,
        codeVerifier,
        redirectUri:     creds.redirectUri,
        requestedScopes: ["https://www.googleapis.com/auth/drive.readonly"],
        status:          "pending",
        metadata:        {
          orgSlug,
          returnTo: `/${orgSlug}/agentik/marketing-studio/biblioteca`,
        },
        expiresAt,
      },
    });

    const authUrl = buildGoogleDriveAuthUrl({
      state,
      codeChallenge,
      redirectUri: creds.redirectUri,
      clientId:    creds.clientId,
    });

    return NextResponse.redirect(authUrl);

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    if (msg.includes("Missing Google OAuth")) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      return NextResponse.redirect(
        `${appUrl}/${orgSlug}/agentik/marketing-studio/biblioteca?drive_error=not_configured`,
      );
    }
    console.error("[google-drive/connect]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
