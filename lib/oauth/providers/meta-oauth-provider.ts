/**
 * lib/oauth/providers/meta-oauth-provider.ts
 *
 * MARKETING-OAUTH-CONNECT-01 — Meta OAuth Provider
 *
 * Proveedor normalizado para el flujo OAuth de Meta.
 * Cubre: Facebook Pages, Instagram Business, Meta Ads, WhatsApp Business.
 *
 * Wrapper sobre la infraestructura existente:
 *   lib/integrations/oauth/providers/meta-oauth.ts
 *
 * SECURITY:
 * - isConfigured() nunca expone valores de env.
 * - buildAuthUrl() delega a la ruta OAuth del backend — nunca al cliente.
 * - Los secretos se leen solo server-side desde process.env.
 */

import type { OAuthProviderConfig } from "../oauth-types";

// ── Combined scopes ────────────────────────────────────────────────────────────
// Solicitar todo en un solo flujo OAuth para minimizar reconexiones.

export const META_COMBINED_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
  "public_profile",
  "ads_read",
  "ads_management",
] as const;

// ── Provider ──────────────────────────────────────────────────────────────────

export const metaOAuthProvider: OAuthProviderConfig = {
  id:               "meta",
  label:            "Meta",
  description:      "Facebook · Instagram · Meta Ads",
  color:            "#1877F2",
  defaultScopes:    [...META_COMBINED_SCOPES],
  requiresPkce:     false,    // Meta server-side apps use standard code flow
  providerGroup:    "meta",
  internalProvider: "meta_facebook",  // OAuthSession provider key
  connectRoute:     (orgSlug) => `/api/orgs/${orgSlug}/integrations/meta/connect`,
  isConfigured: () => !!(
    process.env.META_APP_ID &&
    process.env.META_APP_SECRET &&
    process.env.META_REDIRECT_URI
  ),
};
