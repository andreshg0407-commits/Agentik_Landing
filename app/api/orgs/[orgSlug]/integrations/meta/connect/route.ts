/**
 * GET /api/orgs/[orgSlug]/integrations/meta/connect
 *
 * AGENTIK-OAUTH-CONNECTIONS-01 — Meta OAuth Initiation
 *
 * Initiates Meta (Facebook / Instagram) OAuth for the authenticated tenant.
 * Uses a single Meta OAuth flow that covers Instagram, Facebook Pages,
 * and optionally WhatsApp — separated into provider-specific connections
 * in the callback.
 *
 * Query params:
 *   mode=new_connection|reconnect|add_account (default: new_connection)
 *   returnTo=<path>
 *
 * SECURITY:
 * - requireOrgAccess enforces tenant membership.
 * - Standard code flow (Meta server apps do not use PKCE).
 * - State is 32 bytes random hex stored server-side.
 * - Session expires in 10 minutes.
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import { startOAuthSession }             from "@/lib/integrations/oauth/oauth-session-service";
import { getMetaCredentials }            from "@/lib/integrations/oauth/providers/meta-oauth";
import { META_OAUTH_CONFIG }             from "@/lib/integrations/oauth/providers/meta-oauth";
import { generateOAuthState }            from "@/lib/integrations/oauth/oauth-url-builder";
import { prisma }                        from "@/lib/prisma";

type RouteContext = { params: Promise<{ orgSlug: string }> };

// Combined scopes for full Meta flow (IG + Pages + optionally Ads)
const META_COMBINED_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
  "public_profile",
];

export async function GET(
  req:     NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);
    getMetaCredentials();  // throws if env vars missing

    const url         = new URL(req.url);
    const mode        = (url.searchParams.get("mode") ?? "new_connection") as "new_connection" | "reconnect" | "add_account";
    const defaultReturn = `/${orgSlug}/agentik/marketing-studio/connections`;
    const returnTo    = url.searchParams.get("returnTo") ?? defaultReturn;

    // For Meta, we use meta_facebook as the session provider (full Meta flow)
    const { authUrl } = await startOAuthSession({
      organizationId: organization.id,
      orgSlug,
      provider:       "meta_facebook",
      connectMode:    mode,
      returnTo,
      scopes:         META_COMBINED_SCOPES,
    });

    return NextResponse.redirect(authUrl);

  } catch (err) {
    const message = err instanceof Error ? err.message : "Configuration error";
    const isConfig = message.includes("env vars");
    const fallback = `/${orgSlug}/agentik/marketing-studio/connections?error=${encodeURIComponent(
      isConfig ? "meta_not_configured" : "oauth_start_failed"
    )}`;
    return NextResponse.redirect(new URL(fallback, req.url));
  }
}
