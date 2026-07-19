/**
 * GET /api/orgs/[orgSlug]/integrations/connections
 *
 * AGENTIK-OAUTH-CONNECTIONS-01 — Tenant Connections API (grouped)
 *
 * Returns all connections for the authenticated org, grouped by provider.
 * Used by the Connection Center UI and composer channel picker.
 *
 * SECURITY:
 * - requireOrgAccess enforces tenant isolation.
 * - Tokens and vault IDs are NEVER returned.
 * - Only safe metadata: provider, status, accountName, handle, scopes, timestamps.
 *
 * Response:
 * {
 *   groups: Array<{
 *     provider: string
 *     providerLabel: string
 *     accounts: ConnectionAccountView[]
 *   }>
 * }
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import { listConnectionsByProvider }   from "@/lib/integrations/integration-repository";
import { INTEGRATION_PROVIDER_LABEL }  from "@/lib/integrations/integration-types";

// ── Safe view (no secrets, no vault IDs) ─────────────────────────────────────

export type ConnectionAccountView = {
  id:                 string;
  provider:           string;
  status:             string;
  health:             string;
  isPrimary:          boolean;
  label:              string | null;
  accountName:        string | null;
  accountHandle:      string | null;
  accountAvatarUrl:   string | null;
  accountType:        string | null;
  externalAccountId:  string | null;
  externalPageId:     string | null;
  scopes:             string[];
  connectedAt:        string | null;
  lastHealthCheckAt:  string | null;
  errorMessage:       string | null;
};

export type ConnectionGroupView = {
  provider:      string;
  providerLabel: string;
  accounts:      ConnectionAccountView[];
};

// Provider display order
const PROVIDER_ORDER = [
  "tiktok",
  "meta_instagram",
  "meta_facebook",
  "meta_ads",
  "meta_whatsapp",
  "shopify",
  "youtube",
  "r2",
];

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);

    const grouped = await listConnectionsByProvider(organization.id);

    // Build ordered groups — only include providers with at least one connection
    const groups: ConnectionGroupView[] = [];

    // Add known providers in order first
    for (const provider of PROVIDER_ORDER) {
      if (!grouped[provider] || grouped[provider].length === 0) continue;
      groups.push({
        provider,
        providerLabel: INTEGRATION_PROVIDER_LABEL[provider] ?? provider,
        accounts: grouped[provider].map(toAccountView),
      });
    }

    // Append any remaining providers not in PROVIDER_ORDER
    for (const [provider, accounts] of Object.entries(grouped)) {
      if (PROVIDER_ORDER.includes(provider) || accounts.length === 0) continue;
      groups.push({
        provider,
        providerLabel: INTEGRATION_PROVIDER_LABEL[provider] ?? provider,
        accounts: accounts.map(toAccountView),
      });
    }

    return NextResponse.json({ groups }, { status: 200 });

  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function toAccountView(c: Awaited<ReturnType<typeof listConnectionsByProvider>>[string][number]): ConnectionAccountView {
  return {
    id:                 c.id,
    provider:           c.provider,
    status:             c.status,
    health:             c.health,
    isPrimary:          c.isPrimary,
    label:              c.label,
    accountName:        c.externalAccountName,
    accountHandle:      c.accountHandle,
    accountAvatarUrl:   c.accountAvatarUrl,
    accountType:        c.accountType,
    externalAccountId:  c.externalAccountId,
    externalPageId:     c.externalPageId,
    scopes:             c.scopes,
    connectedAt:        c.connectedAt,
    lastHealthCheckAt:  c.lastHealthCheckAt,
    errorMessage:       c.errorMessage,
  };
}

export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
