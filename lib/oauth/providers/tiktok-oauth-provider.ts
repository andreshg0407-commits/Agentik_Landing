/**
 * lib/oauth/providers/tiktok-oauth-provider.ts
 *
 * MARKETING-OAUTH-CONNECT-01 — TikTok OAuth Provider
 *
 * Proveedor normalizado para el flujo OAuth de TikTok.
 * Cubre: publicación de video, TikTok Ads / Advertiser.
 *
 * Wrapper sobre la infraestructura existente:
 *   lib/integrations/oauth/providers/tiktok-oauth.ts
 *
 * SECURITY:
 * - isConfigured() nunca expone valores de env.
 * - PKCE requerido (S256) — codeVerifier permanece server-side.
 * - Los secretos se leen solo server-side desde process.env.
 */

import type { OAuthProviderConfig } from "../oauth-types";

// ── Scopes ─────────────────────────────────────────────────────────────────────
// user.info.basic siempre requerido.
// video.upload + video.publish para publicación.
// advertiser.read para descubrir cuentas de anuncios.

export const TIKTOK_DEFAULT_SCOPES = [
  "user.info.basic",
  "video.upload",
  "video.publish",
  "advertiser.read",
] as const;

// ── Provider ──────────────────────────────────────────────────────────────────

export const tiktokOAuthProvider: OAuthProviderConfig = {
  id:               "tiktok",
  label:            "TikTok",
  description:      "Videos cortos · TikTok Ads",
  color:            "#010101",
  defaultScopes:    [...TIKTOK_DEFAULT_SCOPES],
  requiresPkce:     true,    // TikTok requires PKCE S256
  providerGroup:    "tiktok",
  internalProvider: "tiktok",
  connectRoute:     (orgSlug) => `/api/orgs/${orgSlug}/integrations/tiktok/connect`,
  isConfigured: () => !!(
    process.env.TIKTOK_CLIENT_KEY &&
    process.env.TIKTOK_CLIENT_SECRET &&
    process.env.TIKTOK_REDIRECT_URI
  ),
};
