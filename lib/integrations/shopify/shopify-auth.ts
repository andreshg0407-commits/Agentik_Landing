/**
 * lib/integrations/shopify/shopify-auth.ts
 *
 * MS-10 — Shopify OAuth Flow
 *
 * Implements the Shopify OAuth 2.0 authorization code flow.
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   State tokens are HMAC-signed with SHOPIFY_STATE_SECRET.
 *   Client secret is NEVER logged or exposed.
 *   Shop domain is validated before any redirect.
 *   HMAC on callback is verified before code exchange.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   SERVER ONLY — never import from client components.
 *   No Prisma — persistence is handled by integration-repository.ts.
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type {
  ShopifyAuthUrlParams,
  ShopifyAuthUrl,
  ShopifyTokenExchangeParams,
  ShopifyAccessTokenResult,
} from "./shopify-types";
import { SHOPIFY_SCOPES_REQUIRED, SHOPIFY_API_VERSION_DEFAULT } from "./shopify-types";
import {
  ShopifyConfigError,
  ShopifyInvalidShopDomainError,
  ShopifyCodeExchangeError,
} from "./shopify-errors";
import { IntegrationStateError, IntegrationCsrfError } from "../integration-errors";

// ── Shop domain validation ────────────────────────────────────────────────────

const SHOP_SUBDOMAIN_RE = /^[a-zA-Z0-9][a-zA-Z0-9\-]{1,48}[a-zA-Z0-9]$/;

/**
 * Validates and normalizes a shop input to a full .myshopify.com domain.
 * Input may be "my-store" or "my-store.myshopify.com".
 * Returns null if invalid.
 */
export function validateShopDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  // Strip trailing slash or path
  const domain = trimmed.replace(/\/.*$/, "");

  let subdomain: string;
  if (domain.endsWith(".myshopify.com")) {
    subdomain = domain.replace(/\.myshopify\.com$/, "");
  } else {
    subdomain = domain;
  }

  if (!SHOP_SUBDOMAIN_RE.test(subdomain)) return null;
  return `${subdomain}.myshopify.com`;
}

/**
 * Validates all required environment variables for Shopify OAuth.
 * Throws ShopifyConfigError if any are missing.
 */
export function validateShopifyConfig(): void {
  const required = [
    "SHOPIFY_CLIENT_ID",
    "SHOPIFY_CLIENT_SECRET",
    "SHOPIFY_APP_URL",
    "SHOPIFY_STATE_SECRET",
  ];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new ShopifyConfigError(
      `Missing required Shopify config: ${missing.join(", ")}`,
    );
  }
}

// ── State (anti-CSRF) ─────────────────────────────────────────────────────────

function getStateSecret(): string {
  const secret = process.env.SHOPIFY_STATE_SECRET;
  if (!secret) throw new ShopifyConfigError("SHOPIFY_STATE_SECRET is not set");
  return secret;
}

/**
 * Generates a signed state token for the OAuth flow.
 * Format: {organizationId}:{timestamp}:{nonce}:{signature}
 */
export function generateOAuthState(organizationId: string): string {
  const timestamp = Date.now().toString();
  const nonce     = randomBytes(16).toString("hex");
  const payload   = `${organizationId}:${timestamp}:${nonce}`;
  const sig       = createHmac("sha256", getStateSecret())
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

/**
 * Validates a state token and returns the organizationId.
 * Throws IntegrationCsrfError if invalid.
 * Throws IntegrationStateError if expired (>10 minutes).
 */
export function validateOAuthState(
  state:          string,
  expectedOrgId:  string,
): void {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const parts   = decoded.split(":");
    if (parts.length !== 4) throw new IntegrationCsrfError();

    const [orgId, timestampStr, nonce, receivedSig] = parts;
    const payload = `${orgId}:${timestampStr}:${nonce}`;
    const expectedSig = createHmac("sha256", getStateSecret())
      .update(payload)
      .digest("hex");

    // Timing-safe comparison
    const recv = Buffer.from(receivedSig, "hex");
    const expt = Buffer.from(expectedSig, "hex");
    if (recv.length !== expt.length || !timingSafeEqual(recv, expt)) {
      throw new IntegrationCsrfError();
    }

    // Org isolation check
    if (orgId !== expectedOrgId) throw new IntegrationCsrfError();

    // Expiry: 10 minutes
    const age = Date.now() - parseInt(timestampStr, 10);
    if (age > 10 * 60 * 1000) {
      throw new IntegrationStateError("OAuth state token has expired");
    }
  } catch (err) {
    if (
      err instanceof IntegrationCsrfError ||
      err instanceof IntegrationStateError
    ) throw err;
    throw new IntegrationCsrfError();
  }
}

// ── Auth URL builder ──────────────────────────────────────────────────────────

/**
 * Builds the Shopify OAuth authorization URL.
 * The caller must store the returned state in a secure HTTP-only cookie.
 */
export function buildShopifyAuthUrl(organizationId: string, shopDomain: string): ShopifyAuthUrl {
  validateShopifyConfig();

  const validDomain = validateShopDomain(shopDomain);
  if (!validDomain) throw new ShopifyInvalidShopDomainError(shopDomain);

  const clientId   = process.env.SHOPIFY_CLIENT_ID!;
  const appUrl     = process.env.SHOPIFY_APP_URL!;
  const redirectUri = `${appUrl}/api/integrations/shopify/callback`;
  const scopes      = SHOPIFY_SCOPES_REQUIRED.join(",");
  const state       = generateOAuthState(organizationId);

  const url = new URL(`https://${validDomain}/admin/oauth/authorize`);
  url.searchParams.set("client_id",    clientId);
  url.searchParams.set("scope",        scopes);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state",        state);

  return { url: url.toString(), state };
}

// ── HMAC verification (Shopify callback) ──────────────────────────────────────

/**
 * Verifies the Shopify HMAC on the OAuth callback request.
 * Shopify sends all query params except `hmac`, sorted and joined,
 * signed with HMAC-SHA256 using the client secret.
 *
 * Returns true if valid, false if invalid.
 * NEVER throws — let caller decide on action.
 */
export function verifyShopifyCallbackHmac(
  queryParams: Record<string, string>,
): boolean {
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientSecret) return false;

  const { hmac, ...rest } = queryParams;
  if (!hmac) return false;

  const message = Object.entries(rest)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const computed = createHmac("sha256", clientSecret)
    .update(message)
    .digest("hex");

  try {
    const recv = Buffer.from(hmac,     "hex");
    const expt = Buffer.from(computed, "hex");
    return recv.length === expt.length && timingSafeEqual(recv, expt);
  } catch {
    return false;
  }
}

// ── Token exchange ────────────────────────────────────────────────────────────

/**
 * Exchanges the authorization code for a Shopify access token.
 * SERVER ONLY — returns plaintext access token. Never log the result.
 */
export async function exchangeShopifyCode(
  params: ShopifyTokenExchangeParams,
): Promise<ShopifyAccessTokenResult> {
  const { shopDomain, code, clientId, clientSecret } = params;

  const validDomain = validateShopDomain(shopDomain);
  if (!validDomain) throw new ShopifyInvalidShopDomainError(shopDomain);

  const response = await fetch(
    `https://${validDomain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id:     clientId,
        client_secret: clientSecret,  // ⚠ server-only, never log
        code,
      }),
    },
  );

  if (!response.ok) {
    throw new ShopifyCodeExchangeError("unknown", response.status);
  }

  const data = await response.json() as {
    access_token:     string;
    scope:            string;
    associated_user?: {
      id:            number;
      email:         string;
      first_name:    string;
      last_name:     string;
      account_owner: boolean;
    };
    expires_in?: number;
  };

  return {
    accessToken:  data.access_token,   // ⚠ server-only
    scope:        data.scope,
    expiresIn:    data.expires_in,
    associatedUser: data.associated_user ? {
      id:           data.associated_user.id,
      email:        data.associated_user.email,
      firstName:    data.associated_user.first_name,
      lastName:     data.associated_user.last_name,
      accountOwner: data.associated_user.account_owner,
    } : undefined,
  };
}
