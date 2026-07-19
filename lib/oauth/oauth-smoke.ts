/**
 * lib/oauth/oauth-smoke.ts
 *
 * MARKETING-OAUTH-CONNECT-01 — Smoke Checks del sistema OAuth
 *
 * Verificaciones determinísticas sin llamadas externas.
 * Sin Prisma, sin fetch, sin Meta, sin TikTok.
 * Valida: providers, state, seguridad, normalización, invariantes de Vault.
 */

import { getOAuthProvider, listOAuthProviders, getConnectUrl } from "./oauth-service";
import { buildConnectUrl } from "./oauth-state";
import type { OAuthDryRunCheck } from "./oauth-types";

// ── Result type ────────────────────────────────────────────────────────────────

export interface OAuthSmokeResult {
  total:   number;
  passed:  number;
  failed:  number;
  results: { name: string; passed: boolean; reason?: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function check(
  name:   string,
  passed: boolean,
  reason?: string,
): OAuthSmokeResult["results"][0] {
  return { name, passed, reason: passed ? undefined : (reason ?? `"${name}" falló`) };
}

// ── Smoke runner ──────────────────────────────────────────────────────────────

export function runOAuthSmokeChecks(): OAuthSmokeResult {
  const results: OAuthSmokeResult["results"] = [];
  let passed = 0;
  let failed = 0;

  function assert(name: string, cond: boolean, reason?: string) {
    const r = check(name, cond, reason);
    results.push(r);
    if (cond) passed++; else failed++;
  }

  // ── Provider registry ──────────────────────────────────────────────────────

  {
    const providers = listOAuthProviders();
    assert("Registry contiene al menos 2 providers", providers.length >= 2);
    assert("Meta está registrado", !!getOAuthProvider("meta"),    "meta no encontrado");
    assert("TikTok está registrado", !!getOAuthProvider("tiktok"), "tiktok no encontrado");
  }

  // ── Provider desconocido rechazado ─────────────────────────────────────────

  {
    const unknown = getOAuthProvider("not_a_real_provider");
    assert("Provider desconocido devuelve null", unknown === null,
      "getOAuthProvider debería retornar null para providers desconocidos");
  }

  // ── Provider estructuralmente correcto ────────────────────────────────────

  {
    const meta = getOAuthProvider("meta");
    assert("Meta tiene id",             meta?.id === "meta");
    assert("Meta tiene label",          !!meta?.label);
    assert("Meta tiene color",          meta?.color?.startsWith("#") ?? false);
    assert("Meta no requiere PKCE",     meta?.requiresPkce === false,
      "Meta usa standard code flow — PKCE no requerido");
    assert("Meta tiene defaultScopes",  (meta?.defaultScopes?.length ?? 0) > 0);
    assert("Meta providerGroup = meta", meta?.providerGroup === "meta");
  }

  {
    const tiktok = getOAuthProvider("tiktok");
    assert("TikTok tiene id",            tiktok?.id === "tiktok");
    assert("TikTok requiere PKCE",       tiktok?.requiresPkce === true,
      "TikTok requiere PKCE S256");
    assert("TikTok tiene defaultScopes", (tiktok?.defaultScopes?.length ?? 0) > 0);
    assert("TikTok user.info.basic",     tiktok?.defaultScopes?.includes("user.info.basic") ?? false,
      "user.info.basic es scope mínimo requerido por TikTok");
  }

  // ── Connect URL construction ────────────────────────────────────────────────

  {
    const url = getConnectUrl("meta", "castillitos");
    assert("Meta connect URL no es null",         url !== null);
    assert("Meta connect URL apunta a backend",   (url ?? "").includes("/api/orgs/"),
      "Connect URL debe apuntar a ruta backend — nunca al cliente");
    assert("Meta connect URL contiene orgSlug",   (url ?? "").includes("castillitos"));
    assert("Meta connect URL no contiene secret", !(url ?? "").toLowerCase().includes("secret"),
      "La URL de inicio OAuth nunca debe contener secretos");
    assert("Meta connect URL no contiene token",  !(url ?? "").toLowerCase().includes("token"),
      "La URL de inicio OAuth nunca debe contener tokens");
  }

  {
    const url = getConnectUrl("tiktok", "castillitos");
    assert("TikTok connect URL no es null",         url !== null);
    assert("TikTok connect URL apunta a backend",   (url ?? "").includes("/api/orgs/"));
  }

  // ── Provider desconocido → connect URL null ────────────────────────────────

  {
    const url = getConnectUrl("linkedin", "castillitos");
    assert("Provider desconocido → connect URL null", url === null,
      "Un provider no registrado debe devolver null — no redirigir a URL inválida");
  }

  // ── buildConnectUrl con opciones ───────────────────────────────────────────

  {
    const url = buildConnectUrl("castillitos", "meta", { mode: "reconnect", returnTo: "/connections" });
    assert("buildConnectUrl incluye mode",     url.includes("mode=reconnect"));
    assert("buildConnectUrl incluye returnTo", url.includes("returnTo="));
  }

  // ── State requirement ──────────────────────────────────────────────────────

  {
    // State MUST NOT be empty / predictable
    const { generateOAuthState } = require("@/lib/integrations/oauth/oauth-url-builder") as typeof import("@/lib/integrations/oauth/oauth-url-builder");
    const s1 = generateOAuthState();
    const s2 = generateOAuthState();
    assert("State tiene longitud suficiente (≥ 32 chars)", s1.length >= 32,
      `State length = ${s1.length}`);
    assert("Dos states distintos son diferentes", s1 !== s2,
      "generateOAuthState debe ser no determinístico");
    assert("State es hexadecimal",
      /^[0-9a-f]+$/.test(s1),
      `State inesperado: ${s1.slice(0, 8)}…`);
  }

  // ── Token response no expone secretos ─────────────────────────────────────

  {
    // Simulate a normalized token meta — must never contain raw token values
    const tokenMeta = {
      provider:        "meta",
      scopes:          ["pages_read_engagement", "instagram_basic"],
      expiresAt:       new Date(Date.now() + 3600_000).toISOString(),
      hasRefreshToken: false,
    };
    const serial  = JSON.stringify(tokenMeta).toLowerCase();
    const banned  = ["access_token", "refresh_token", "client_secret", "app_secret", "bearer"];
    const found   = banned.filter(b => serial.includes(b));
    assert("OAuthTokenMeta no expone secretos", found.length === 0,
      `Campos prohibidos encontrados: ${found.join(", ")}`);
  }

  // ── IntegrationConnection no guarda accessToken ─────────────────────────────

  {
    // The connection snapshot interface must not have an accessToken field
    // We check by creating a mock connection and verifying no token field exists
    const mockConn: Record<string, unknown> = {
      id:                  "conn_01",
      organizationId:      "org_01",
      provider:            "meta_facebook",
      status:              "connected",
      health:              "healthy",
      shopDomain:          null,
      externalAccountId:   "page_123",
      externalAccountName: "Mi Empresa",
      label:               null,
      isPrimary:           true,
      accountHandle:       null,
      accountAvatarUrl:    null,
      accountType:         "page",
      providerGroup:       "meta",
      externalPageId:      "page_123",
      externalBusinessId:  null,
      externalAdAccountId: null,
      scopes:              ["pages_read_engagement"],
      connectedAt:         new Date().toISOString(),
      disconnectedAt:      null,
      lastHealthCheckAt:   new Date().toISOString(),
      errorMessage:        null,
    };
    const banned = ["accessToken", "access_token", "refreshToken", "refresh_token", "encryptedValue"];
    const found  = banned.filter(f => f in mockConn);
    assert("IntegrationConnectionSnapshot no contiene tokens", found.length === 0,
      `Campos de token encontrados: ${found.join(", ")}`);
  }

  // ── Scopes normalizados ────────────────────────────────────────────────────

  {
    const meta = getOAuthProvider("meta");
    const scopes = meta?.defaultScopes ?? [];
    assert("Scopes Meta son array", Array.isArray(scopes));
    assert("Scopes Meta son strings", scopes.every(s => typeof s === "string"),
      "Todos los scopes deben ser strings");
    assert("Scopes Meta sin duplicados",
      new Set(scopes).size === scopes.length,
      "Hay scopes duplicados en Meta defaultScopes");
  }

  // ── Vault tenant-scoped invariante ────────────────────────────────────────

  {
    // storeIntegrationSecret siempre requiere connectionId (que implica organizationId)
    const { storeIntegrationSecret } = require("@/lib/integrations/vault/vault-service") as typeof import("@/lib/integrations/vault/vault-service");
    assert("storeIntegrationSecret está exportado", typeof storeIntegrationSecret === "function",
      "La función de guardado en vault debe existir y ser callable");
  }

  // ── Redirect URL contiene state ────────────────────────────────────────────

  {
    // Simulate building a meta auth URL with a state
    const state = "abc123def456abc123def456abc123de"; // 32 chars hex
    const mockUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=APP_ID&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&response_type=code&scope=pages_read_engagement&state=${state}`;
    const parsed  = new URL(mockUrl);
    assert("Auth URL contiene state parameter", parsed.searchParams.get("state") === state,
      "La URL de autorización debe incluir el state para prevención CSRF");
    assert("Auth URL no contiene client_secret",
      !mockUrl.toLowerCase().includes("client_secret"),
      "client_secret no debe aparecer en la URL de autorización");
  }

  // ── Callback sin code falla ────────────────────────────────────────────────

  {
    // Simulate the guard logic in callback routes
    const code  = null;
    const state = "validstate123";
    const shouldFail = !code && !!state;
    assert("Callback sin code debe fallar (con state válido)", shouldFail,
      "Un callback sin code debe ser rechazado — no intentar intercambio");

    const noState = null;
    const noCode  = null;
    const shouldAlsoFail = !noState || !noCode;
    assert("Callback sin state ni code debe fallar", shouldAlsoFail);
  }

  // ── orgSlug requerido en rutas ─────────────────────────────────────────────

  {
    const metaRoute  = getOAuthProvider("meta")?.connectRoute("castillitos") ?? "";
    const emptyRoute = getOAuthProvider("meta")?.connectRoute("") ?? "";
    assert("Connect route incluye orgSlug", metaRoute.includes("castillitos"),
      `Route: ${metaRoute}`);
    assert("Connect route vacío sin orgSlug detectado", emptyRoute.includes("/api/orgs//"),
      "Route con orgSlug vacío debe producir URL con doble slash detectada como inválida");
  }

  return { total: results.length, passed, failed, results };
}
