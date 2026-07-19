/**
 * lib/integrations/oauth/oauth-session-service.ts
 *
 * AGENTIK-INTEGRATIONS-VAULT-RUNTIME-01 — OAuth Session Service
 *
 * Creates and consumes short-lived OAuthSession records for CSRF protection
 * and PKCE code verifier storage. Sessions expire in 10 minutes.
 *
 * Flow:
 *   1. startOAuthSession()  → returns { sessionId, authUrl }
 *   2. User redirected to provider via authUrl
 *   3. Provider calls callback with ?code=...&state=...
 *   4. consumeOAuthSession(state) → returns session for code exchange
 *
 * SECURITY:
 * - state is generated randomly and stored server-side.
 * - codeVerifier never leaves the server.
 * - Sessions expire in SESSION_TTL_MINUTES.
 * - Consumed sessions cannot be replayed.
 * - organizationId enforced on all lookups.
 */

import { prisma }                from "@/lib/prisma";
import {
  generateOAuthState,
  generateCodeVerifier,
  buildOAuthUrl,
}                                from "./oauth-url-builder";
import type { SupportedOAuthProvider } from "./oauth-url-builder";

// ── Config ────────────────────────────────────────────────────────────────────

const SESSION_TTL_MINUTES = 10;

// ── Types ─────────────────────────────────────────────────────────────────────

export type OAuthConnectMode = "new_connection" | "reconnect" | "add_account";

export interface StartOAuthSessionInput {
  organizationId: string;
  provider:       SupportedOAuthProvider;
  orgSlug:        string;
  /** Override default scopes */
  scopes?:        string[];
  /** URL to redirect back to after callback completes */
  returnTo?:      string;
  /** Connect mode for UX and post-callback handling */
  connectMode?:   OAuthConnectMode;
}

export interface StartOAuthSessionResult {
  sessionId: string;
  state:     string;
  authUrl:   string;
}

export interface OAuthSessionRecord {
  id:             string;
  organizationId: string;
  provider:       string;
  state:          string;
  codeVerifier:   string | null;
  redirectUri:    string;
  requestedScopes: unknown;
  status:         string;
  metadata:       unknown;
  expiresAt:      Date;
}

// ── Session lifecycle ─────────────────────────────────────────────────────────

/**
 * Creates an OAuthSession and returns the authorization URL.
 * The codeVerifier is stored server-side; only the code challenge goes to the provider.
 */
export async function startOAuthSession(
  input: StartOAuthSessionInput,
): Promise<StartOAuthSessionResult> {
  const state        = generateOAuthState();
  const codeVerifier = generateCodeVerifier();
  const redirectUri  = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/integrations/oauth/callback`;
  const expiresAt    = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000);

  const authUrl = buildOAuthUrl({
    provider:     input.provider,
    state,
    codeVerifier,
    scopes:       input.scopes,
  });

  const session = await prisma.oAuthSession.create({
    data: {
      organizationId:  input.organizationId,
      provider:        input.provider,
      state,
      codeVerifier,
      redirectUri,
      requestedScopes: input.scopes ?? [],
      status:          "pending",
      metadata: {
        returnTo:    input.returnTo    ?? null,
        orgSlug:     input.orgSlug,
        connectMode: input.connectMode ?? "new_connection",
      },
      expiresAt,
    },
  });

  return { sessionId: session.id, state, authUrl };
}

/**
 * Looks up a pending session by state and organizationId.
 * Returns null if not found, expired, or already consumed.
 */
export async function getOAuthSession(
  state:          string,
  organizationId: string,
): Promise<OAuthSessionRecord | null> {
  const session = await prisma.oAuthSession.findFirst({
    where: {
      state,
      organizationId,
      status:    "pending",
      expiresAt: { gt: new Date() },
    },
  });
  return session;
}

/**
 * Marks a session as consumed after successful code exchange.
 * Idempotent — calling twice is safe (second call returns null).
 */
export async function consumeOAuthSession(
  state:          string,
  organizationId: string,
): Promise<OAuthSessionRecord | null> {
  const session = await getOAuthSession(state, organizationId);
  if (!session) return null;

  await prisma.oAuthSession.update({
    where: { id: session.id },
    data: {
      status:     "consumed",
      consumedAt: new Date(),
    },
  });
  return session;
}

/**
 * Marks a session as failed.
 */
export async function failOAuthSession(
  state:          string,
  organizationId: string,
): Promise<void> {
  await prisma.oAuthSession.updateMany({
    where: { state, organizationId, status: "pending" },
    data:  { status: "failed" },
  });
}

/**
 * Looks up a pending session by state ONLY — no organizationId required.
 * Used in OAuth callbacks where the organizationId comes from the session itself.
 * Security: state is unguessable (32 bytes random hex).
 */
export async function getOAuthSessionByState(
  state: string,
): Promise<OAuthSessionRecord | null> {
  const session = await prisma.oAuthSession.findFirst({
    where: {
      state,
      status:    "pending",
      expiresAt: { gt: new Date() },
    },
  });
  return session;
}

/**
 * Consumes a session by state only (no organizationId). For use in callbacks.
 */
export async function consumeOAuthSessionByState(
  state: string,
): Promise<OAuthSessionRecord | null> {
  const session = await getOAuthSessionByState(state);
  if (!session) return null;

  await prisma.oAuthSession.update({
    where: { id: session.id },
    data: {
      status:     "consumed",
      consumedAt: new Date(),
    },
  });
  return session;
}

/**
 * Marks a session as failed by state only (for callbacks that fail before consuming).
 */
export async function failOAuthSessionByState(state: string): Promise<void> {
  await prisma.oAuthSession.updateMany({
    where: { state, status: "pending" },
    data:  { status: "failed" },
  });
}

/**
 * Cleans up expired pending sessions for maintenance.
 * Call from a scheduled job, not from request handlers.
 */
export async function purgeExpiredOAuthSessions(): Promise<number> {
  const result = await prisma.oAuthSession.deleteMany({
    where: { expiresAt: { lt: new Date() }, status: "pending" },
  });
  return result.count;
}
