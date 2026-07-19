/**
 * GET /api/orgs/[orgSlug]/integrations/google/youtube/connect
 *
 * MARKETING-INTEGRATIONS-GOOGLE-01 — YouTube OAuth Initiation
 *
 * Initiates YouTube OAuth (PKCE) for the authenticated tenant.
 * Uses the same Google credentials as Google Ads but with YouTube scopes.
 * After authorization, Google calls /api/integrations/google/callback.
 *
 * Query params:
 *   mode=new_connection|reconnect|add_account (default: new_connection)
 *   returnTo=<path>
 *
 * SECURITY:
 * - requireOrgAccess enforces tenant membership.
 * - PKCE S256 — verifier stays server-side.
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
      provider:       "youtube",
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
