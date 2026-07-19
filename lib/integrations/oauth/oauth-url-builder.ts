/**
 * lib/integrations/oauth/oauth-url-builder.ts
 *
 * AGENTIK-INTEGRATIONS-VAULT-RUNTIME-01 — OAuth URL Builder
 *
 * Unified entry point for building provider authorization URLs.
 * Always requires a valid OAuthSession (state + codeVerifier from oauth-session-service).
 *
 * SECURITY:
 * - State must come from a stored OAuthSession to prevent CSRF.
 * - Code verifier stays server-side; only the challenge goes to the provider.
 * - Never generate URLs without a session — stateless flows are prohibited.
 */

import { createHash, randomBytes } from "crypto";
import { buildTikTokAuthUrl }     from "./providers/tiktok-oauth";
import { buildMetaAuthUrl }       from "./providers/meta-oauth";
import { buildGoogleAuthUrl }     from "./providers/google-oauth";
import type { MetaOAuthPurpose }  from "./providers/meta-oauth";

// ── PKCE helpers ──────────────────────────────────────────────────────────────

/** Generates a cryptographically random code verifier (43–128 chars, base64url). */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/** Derives S256 code challenge from a verifier. */
export function deriveCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Generates a random state parameter (32 bytes hex). */
export function generateOAuthState(): string {
  return randomBytes(32).toString("hex");
}

// ── Provider union ────────────────────────────────────────────────────────────

export type SupportedOAuthProvider =
  | "tiktok"
  | "meta_instagram"
  | "meta_facebook"
  | "meta_whatsapp"
  | "google_ads"
  | "youtube";

// ── Unified builder ───────────────────────────────────────────────────────────

/**
 * Builds the authorization URL for any supported provider.
 *
 * @param provider   The provider to connect
 * @param state      CSRF state from OAuthSession (must match callback)
 * @param codeVerifier  PKCE verifier (required for TikTok; ignored for Meta)
 * @param scopes     Override default scopes (optional)
 */
export function buildOAuthUrl(params: {
  provider:      SupportedOAuthProvider;
  state:         string;
  codeVerifier:  string;
  scopes?:       string[];
}): string {
  const { provider, state, codeVerifier, scopes } = params;
  const codeChallenge = deriveCodeChallenge(codeVerifier);

  switch (provider) {
    case "tiktok":
      return buildTikTokAuthUrl({ state, codeChallenge, scopes });

    case "meta_instagram":
      return buildMetaAuthUrl({ state, purpose: "instagram", scopes });

    case "meta_facebook":
      return buildMetaAuthUrl({ state, purpose: "facebook", scopes });

    case "meta_whatsapp":
      return buildMetaAuthUrl({ state, purpose: "whatsapp", scopes });

    case "google_ads":
      return buildGoogleAuthUrl({ state, codeChallenge, purpose: "google_ads", scopes });

    case "youtube":
      return buildGoogleAuthUrl({ state, codeChallenge, purpose: "youtube", scopes });

    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unsupported OAuth provider: ${_exhaustive}`);
    }
  }
}
