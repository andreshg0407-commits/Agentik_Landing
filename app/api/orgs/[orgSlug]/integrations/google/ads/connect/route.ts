/**
 * GET /api/orgs/[orgSlug]/integrations/google/ads/connect
 *
 * MARKETING-INTEGRATIONS-GOOGLE-01 — Google Ads OAuth Initiation
 *
 * Initiates Google Ads OAuth (PKCE) for the authenticated tenant.
 * After authorization, Google calls /api/integrations/google/callback
 * where the purpose is recovered from the OAuthSession metadata.
 *
 * Query params:
 *   mode=new_connection|reconnect|add_account (default: new_connection)
 *   returnTo=<path>
 *
 * SECURITY:
 * - requireOrgAccess enforces tenant membership.
 * - PKCE: S256 code challenge sent to Google; verifier stored server-side.
 * - State is 32 bytes random hex.
 * - Session expires in 10 minutes.
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import { startOAuthSession }             from "@/lib/integrations/oauth/oauth-session-service";
import { getGoogleCredentials }          from "@/lib/integrations/oauth/providers/google-oauth";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function GET(
  req:     NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);
    getGoogleCredentials();  // throws if env vars missing

    const url           = new URL(req.url);
    const mode          = (url.searchParams.get("mode") ?? "new_connection") as "new_connection" | "reconnect" | "add_account";
    const defaultReturn = `/${orgSlug}/agentik/marketing-studio/connections`;
    const returnTo      = url.searchParams.get("returnTo") ?? defaultReturn;

    const { authUrl } = await startOAuthSession({
      organizationId: organization.id,
      orgSlug,
      provider:       "google_ads",
      connectMode:    mode,
      returnTo,
    });

    return NextResponse.redirect(authUrl);

  } catch (err) {
    const message = err instanceof Error ? err.message : "Configuration error";
    const isConfig = message.includes("env vars");
    const fallback = `/${orgSlug}/agentik/marketing-studio/connections?error=${encodeURIComponent(
      isConfig ? "google_not_configured" : "oauth_start_failed",
    )}`;
    return NextResponse.redirect(new URL(fallback, req.url));
  }
}
