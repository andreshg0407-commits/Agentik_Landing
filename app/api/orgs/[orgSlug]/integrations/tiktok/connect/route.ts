/**
 * GET /api/orgs/[orgSlug]/integrations/tiktok/connect
 *
 * AGENTIK-OAUTH-CONNECTIONS-01 — TikTok OAuth Initiation
 *
 * Initiates a TikTok OAuth PKCE flow for the authenticated tenant.
 * Creates an OAuthSession (state + codeVerifier), then redirects to TikTok.
 *
 * Query params:
 *   mode=new_connection|reconnect|add_account (default: new_connection)
 *   returnTo=<path>  (default: /[orgSlug]/agentik/marketing-studio/connections)
 *
 * SECURITY:
 * - requireOrgAccess enforces tenant membership.
 * - State is 32 bytes random hex — no predictable pattern.
 * - codeVerifier stays server-side (S256 challenge sent to TikTok).
 * - Session expires in 10 minutes.
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import { startOAuthSession }             from "@/lib/integrations/oauth/oauth-session-service";
import { getTikTokCredentials }          from "@/lib/integrations/oauth/providers/tiktok-oauth";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function GET(
  req:     NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);

    // Validate TikTok credentials are configured
    getTikTokCredentials();  // throws if env vars missing

    const url         = new URL(req.url);
    const mode        = (url.searchParams.get("mode") ?? "new_connection") as "new_connection" | "reconnect" | "add_account";
    const defaultReturn = `/${orgSlug}/agentik/marketing-studio/connections`;
    const returnTo    = url.searchParams.get("returnTo") ?? defaultReturn;

    // Use provider-specific callback URL
    const redirectUri = process.env.TIKTOK_REDIRECT_URI!;

    const { authUrl } = await startOAuthSession({
      organizationId: organization.id,
      orgSlug,
      provider:       "tiktok",
      connectMode:    mode,
      returnTo,
    });

    return NextResponse.redirect(authUrl);

  } catch (err) {
    const message = err instanceof Error ? err.message : "Configuration error";
    const isConfig = message.includes("env vars");

    // Redirect back with error rather than showing raw error
    const fallback = `/agentik/marketing-studio/connections?error=${encodeURIComponent(
      isConfig ? "tiktok_not_configured" : "oauth_start_failed"
    )}`;
    return NextResponse.redirect(new URL(fallback, req.url));
  }
}
