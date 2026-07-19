/**
 * lib/oauth/oauth-state.ts
 *
 * MARKETING-OAUTH-CONNECT-01 — Gestión de estado OAuth
 *
 * Fachada sobre oauth-session-service.ts existente.
 * Centraliza la creación, validación y consumo de sesiones OAuth.
 *
 * SERVER ONLY — nunca importar en client components.
 *
 * SECURITY:
 * - state generado con 32 bytes aleatorios (hex) — nunca predecible.
 * - codeVerifier permanece server-side; solo el challenge va al provider.
 * - Sesiones expiran en 10 minutos.
 * - Sesiones consumidas no pueden reutilizarse.
 * - organizationId nunca proviene del cliente — siempre del OAuthSession.
 */

import "server-only";

import {
  startOAuthSession,
  getOAuthSessionByState,
  consumeOAuthSessionByState,
  failOAuthSessionByState,
  type StartOAuthSessionInput,
  type OAuthSessionRecord,
  type OAuthConnectMode,
} from "@/lib/integrations/oauth/oauth-session-service";
import type { SupportedOAuthProvider } from "@/lib/integrations/oauth/oauth-url-builder";
import type { OAuthProvider, OAuthConnectOptions } from "./oauth-types";
import { getOAuthProvider }             from "./oauth-service";

// ── Re-exports (backward compat surface) ──────────────────────────────────────

export type {
  OAuthSessionRecord,
  OAuthConnectMode,
};

export {
  getOAuthSessionByState,
  consumeOAuthSessionByState,
  failOAuthSessionByState,
};

// ── Provider → internal provider mapping ──────────────────────────────────────

function toInternalProvider(provider: OAuthProvider): SupportedOAuthProvider {
  const def = getOAuthProvider(provider);
  if (!def) throw new Error(`Unknown OAuth provider: ${provider}`);
  // Map to SupportedOAuthProvider (meta maps to meta_facebook for session)
  const internal = def.internalProvider as SupportedOAuthProvider;
  return internal;
}

// ── Start OAuth flow ──────────────────────────────────────────────────────────

export interface StartOAuthFlowInput {
  organizationId: string;
  provider:       OAuthProvider;
  orgSlug:        string;
  options?:       OAuthConnectOptions;
}

export interface StartOAuthFlowResult {
  sessionId: string;
  authUrl:   string;
}

/**
 * Inicia una sesión OAuth para el provider dado.
 * Genera state CSRF + codeVerifier PKCE y redirige al proveedor.
 *
 * SECURITY: nunca expone secretos ni tokens al cliente.
 */
export async function startOAuthFlow(
  input: StartOAuthFlowInput,
): Promise<StartOAuthFlowResult> {
  const def            = getOAuthProvider(input.provider);
  if (!def) throw new Error(`Provider not supported: ${input.provider}`);

  const internal: SupportedOAuthProvider = def.internalProvider as SupportedOAuthProvider;

  const sessionInput: StartOAuthSessionInput = {
    organizationId: input.organizationId,
    provider:       internal,
    orgSlug:        input.orgSlug,
    scopes:         def.defaultScopes,
    returnTo:       input.options?.returnTo ?? `/${input.orgSlug}/agentik/marketing-studio/connections`,
    connectMode:    (input.options?.mode ?? "new_connection") as OAuthConnectMode,
  };

  const { sessionId, authUrl } = await startOAuthSession(sessionInput);
  return { sessionId, authUrl };
}

// ── Build connect URL (for UI navigation) ────────────────────────────────────

/**
 * Devuelve la URL del route de inicio OAuth para el provider dado.
 * Esta URL siempre apunta al backend — nunca expone parámetros OAuth.
 */
export function buildConnectUrl(
  orgSlug:  string,
  provider: OAuthProvider,
  options?: OAuthConnectOptions,
): string {
  const def = getOAuthProvider(provider);
  if (!def) return `/${orgSlug}/agentik/marketing-studio/connections`;

  const base = def.connectRoute(orgSlug);
  const params = new URLSearchParams();
  if (options?.mode)     params.set("mode",     options.mode);
  if (options?.returnTo) params.set("returnTo", options.returnTo);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

// ── Validate state ────────────────────────────────────────────────────────────

/**
 * Valida el state de un callback OAuth.
 * Rechaza: state vacío, sesión no encontrada, sesión expirada o consumida.
 */
export async function validateOAuthCallback(state: string | null): Promise<{
  valid:   boolean;
  session: OAuthSessionRecord | null;
  error?:  string;
}> {
  if (!state) {
    return { valid: false, session: null, error: "missing_state" };
  }
  const session = await getOAuthSessionByState(state);
  if (!session) {
    return { valid: false, session: null, error: "invalid_or_expired_state" };
  }
  return { valid: true, session };
}
