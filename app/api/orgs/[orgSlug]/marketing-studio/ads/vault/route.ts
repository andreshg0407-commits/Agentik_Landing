/**
 * app/api/orgs/[orgSlug]/marketing-studio/ads/vault/route.ts
 *
 * MARKETING-ADS-VAULT-01 — Ads Vault Metadata API
 *
 * GET /api/orgs/[orgSlug]/marketing-studio/ads/vault
 *
 * Returns safe metadata about Ads credential configuration for all platforms.
 * NEVER returns actual credential values, tokens, or encrypted data.
 *
 * Response shape: AdsVaultMetadataEntry[]
 *   - platform
 *   - credentialSource (VAULT | ENV_DEV_FALLBACK | NOT_CONFIGURED)
 *   - exists (boolean)
 *   - resolvedAt (ISO timestamp)
 *   - complete (boolean — all required fields present)
 *   - missing (string[] — names of missing required fields)
 *
 * POST (upsert): not exposed yet — pending secure admin UI (AGENTIK-ADS-VAULT-02).
 */

import { NextResponse }             from "next/server";
import { requireOrgAccess }         from "@/lib/auth/org-access";
import { canAccessMarketingStudio } from "@/lib/auth/module-access";
import { getAdsVaultMetadata }      from "@/lib/marketing-studio/ads/ads-vault";

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

    const metadata = await getAdsVaultMetadata(organization.id);

    // Belt-and-suspenders: verify no secret values leaked into response
    for (const entry of metadata) {
      if ("accessToken" in entry || "encryptedValue" in entry || "secret" in entry) {
        console.error("[ads/vault] BUG: metadata entry contains secret field — blocked");
        return NextResponse.json(
          { error: "Error interno: respuesta contenía campos sensibles." },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ metadata });
  } catch (err) {
    console.error("[ads/vault] error:", err);
    return NextResponse.json(
      { error: "Error al consultar metadatos del Vault." },
      { status: 500 },
    );
  }
}
