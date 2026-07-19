/**
 * app/api/orgs/[orgSlug]/marketing-studio/ads/accounts/route.ts
 *
 * MARKETING-ADS-ACCOUNTS-01 — Ads Accounts Discovery & Selection API
 *
 * GET  /api/orgs/[orgSlug]/marketing-studio/ads/accounts
 *   → Triggers live discovery from Meta + TikTok APIs.
 *   → Returns discovered resources + current saved selections.
 *   → No caching — always fresh (caller shows spinner and "Descubrir" button).
 *
 * PUT  /api/orgs/[orgSlug]/marketing-studio/ads/accounts
 *   → Saves resource selection for a platform.
 *   → Body: SaveAdsSelectionInput (platform + selected IDs).
 *   → Returns updated TenantAdsConfigData.
 *
 * NEVER returns tokens, secrets, or encrypted values.
 */

import { NextResponse }                  from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import { canAccessMarketingStudio }      from "@/lib/auth/module-access";
import { discoverAdsAccounts }           from "@/lib/marketing-studio/ads/ads-accounts-service";
import {
  getAdsAccountsConfig,
  saveAdsAccountSelection,
}                                        from "@/lib/marketing-studio/ads/ads-accounts-config-service";
import type { SaveAdsSelectionInput }    from "@/lib/marketing-studio/ads/ads-accounts-types";

// ── GET — discover resources ───────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug }              = await params;
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    const [config, discovery] = await Promise.all([
      getAdsAccountsConfig(organization.id),
      discoverAdsAccounts(orgSlug, organization.id),
    ]);

    return NextResponse.json({ config, discovery });
  } catch (err) {
    console.error("[ads/accounts GET] error:", err);
    return NextResponse.json(
      { error: "Error al descubrir recursos publicitarios." },
      { status: 500 },
    );
  }
}

// ── PUT — save selection ───────────────────────────────────────────────────────

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug }              = await params;
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    const body = await req.json() as SaveAdsSelectionInput;

    if (!body?.platform) {
      return NextResponse.json({ error: "platform es requerido." }, { status: 400 });
    }

    // Belt-and-suspenders: never allow secrets to leak through this endpoint
    const forbidden = ["accessToken", "secret", "password", "encryptedValue", "token"];
    for (const key of forbidden) {
      if (key in body) {
        console.error("[ads/accounts PUT] blocked forbidden field:", key);
        return NextResponse.json({ error: "Campo no permitido en la selección." }, { status: 400 });
      }
    }

    const updated = await saveAdsAccountSelection(organization.id, body);

    return NextResponse.json({ config: updated });
  } catch (err) {
    console.error("[ads/accounts PUT] error:", err);
    return NextResponse.json(
      { error: "Error al guardar la selección." },
      { status: 500 },
    );
  }
}
