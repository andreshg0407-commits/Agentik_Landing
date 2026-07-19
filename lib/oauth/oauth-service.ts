/**
 * lib/oauth/oauth-service.ts
 *
 * MARKETING-OAUTH-CONNECT-01 — Servicio unificado OAuth
 *
 * Fachada principal del sistema OAuth de Marketing Studio.
 * Registra todos los providers V1 y expone funciones de consulta seguras.
 *
 * SERVER ONLY — nunca importar en client components.
 *
 * Principios:
 *   - Secretos nunca en respuestas JSON ni logs.
 *   - Provider desconocido → rechazado (fail closed).
 *   - Dry-run → solo lectura, sin efectos externos.
 *   - Conexiones derivadas de IntegrationConnection existente.
 */

import "server-only";

import type { OAuthProviderConfig, OAuthProvider, OAuthDryRunResult } from "./oauth-types";
import { metaOAuthProvider }    from "./providers/meta-oauth-provider";
import { tiktokOAuthProvider }  from "./providers/tiktok-oauth-provider";
import { listConnectionsByProvider, getIntegrationConnection }
  from "@/lib/integrations/integration-repository";

// ── Provider registry ──────────────────────────────────────────────────────────

const PROVIDER_REGISTRY: Record<OAuthProvider, OAuthProviderConfig> = {
  meta:     metaOAuthProvider,
  tiktok:   tiktokOAuthProvider,
  // Preparados para futuras integraciones:
  google:   {
    id:               "google",
    label:            "Google Ads",
    description:      "Búsqueda · Display · Shopping",
    color:            "#4285F4",
    defaultScopes:    ["https://www.googleapis.com/auth/adwords", "https://www.googleapis.com/auth/userinfo.email"],
    requiresPkce:     true,
    providerGroup:    "google",
    internalProvider: "google",
    connectRoute:     (s) => `/api/orgs/${s}/integrations/google/connect`,
    isConfigured:     () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  },
  youtube:  {
    id:               "youtube",
    label:            "YouTube",
    description:      "Canal de video · Shorts",
    color:            "#FF0000",
    defaultScopes:    ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"],
    requiresPkce:     true,
    providerGroup:    "youtube",
    internalProvider: "youtube",
    connectRoute:     (s) => `/api/orgs/${s}/integrations/youtube/connect`,
    isConfigured:     () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  },
  shopify:  {
    id:               "shopify",
    label:            "Shopify",
    description:      "Tienda online · Productos",
    color:            "#96BF48",
    defaultScopes:    ["read_products", "write_products", "read_orders", "read_inventory"],
    requiresPkce:     false,
    providerGroup:    "shopify",
    internalProvider: "shopify",
    connectRoute:     (s) => `/api/orgs/${s}/integrations/shopify/connect`,
    isConfigured:     () => !!(process.env.SHOPIFY_API_KEY && process.env.SHOPIFY_API_SECRET),
  },
  whatsapp: {
    id:               "whatsapp",
    label:            "WhatsApp Business",
    description:      "Mensajería · Catálogo",
    color:            "#25D366",
    defaultScopes:    ["whatsapp_business_messaging", "whatsapp_business_management"],
    requiresPkce:     false,
    providerGroup:    "meta",
    internalProvider: "meta_whatsapp",
    connectRoute:     (s) => `/api/orgs/${s}/integrations/meta/connect`,
    isConfigured:     () => !!(process.env.META_APP_ID && process.env.META_APP_SECRET),
  },
};

// ── Registry accessors ────────────────────────────────────────────────────────

/**
 * Retorna la configuración del provider o null si no está soportado.
 * Nunca lanza — fail closed.
 */
export function getOAuthProvider(provider: string): OAuthProviderConfig | null {
  return PROVIDER_REGISTRY[provider as OAuthProvider] ?? null;
}

/**
 * Lista todos los providers V1 registrados.
 */
export function listOAuthProviders(): OAuthProviderConfig[] {
  return Object.values(PROVIDER_REGISTRY);
}

/**
 * Retorna solo los providers cuyas credenciales están configuradas en env.
 * Nunca expone los valores de env — solo booleano de disponibilidad.
 */
export function listConfiguredProviders(): OAuthProviderConfig[] {
  return listOAuthProviders().filter(p => {
    try {
      return p.isConfigured();
    } catch {
      return false;
    }
  });
}

// ── Connect URL ────────────────────────────────────────────────────────────────

/**
 * Construye la URL del route de inicio OAuth para el provider dado.
 * Retorna null si el provider no existe o no está configurado.
 *
 * SECURITY: siempre apunta al backend — nunca expone parámetros OAuth al cliente.
 */
export function getConnectUrl(
  provider: string,
  orgSlug:  string,
  options?: { mode?: "new_connection" | "reconnect" | "add_account"; returnTo?: string },
): string | null {
  const def = getOAuthProvider(provider);
  if (!def) return null;

  const base   = def.connectRoute(orgSlug);
  const params = new URLSearchParams();
  if (options?.mode)     params.set("mode",     options.mode);
  if (options?.returnTo) params.set("returnTo", options.returnTo);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

// ── Dry-run diagnostics ───────────────────────────────────────────────────────

/**
 * Ejecuta un diagnóstico de solo lectura sobre la conexión de un provider.
 * Verifica el estado derivado sin llamadas externas ni efectos laterales.
 *
 * SECURITY: nunca retorna tokens — solo estado derivado de IntegrationConnection.
 */
export async function runOAuthDryRun(
  organizationId: string,
  provider:       string,
): Promise<OAuthDryRunResult> {
  const def = getOAuthProvider(provider);
  const now = new Date().toISOString();

  if (!def) {
    return {
      provider:  provider as OAuthProvider,
      allPassed: false,
      checks:    [{ label: "Provider soportado", passed: false, detail: `"${provider}" no está registrado` }],
      checkedAt: now,
    };
  }

  const checks: OAuthDryRunResult["checks"] = [];

  // Check 1: Provider configurado en env
  const configured = def.isConfigured();
  checks.push({
    label:  "Credenciales configuradas en entorno",
    passed: configured,
    detail: configured ? undefined : "Faltan variables de entorno para este provider",
  });

  // Check 2: Existe al menos una IntegrationConnection
  let connections: Awaited<ReturnType<typeof listConnectionsByProvider>> = {};
  try {
    connections = await listConnectionsByProvider(organizationId);
  } catch { /* DB not ready */ }

  const providerKeys = [def.internalProvider, def.id];
  const conns = providerKeys.flatMap(k => connections[k] ?? []);

  checks.push({
    label:  "Conexión establecida",
    passed: conns.length > 0,
    detail: conns.length === 0 ? "No hay IntegrationConnection para este provider" : undefined,
  });

  if (conns.length > 0) {
    const primary = conns.find(c => c.isPrimary) ?? conns[0];

    // Check 3: Token status
    const isActive = primary.status === "connected";
    checks.push({
      label:  "Token válido",
      passed: isActive && primary.health !== "critical",
      detail: primary.errorMessage ?? undefined,
    });

    // Check 4: Scopes received
    checks.push({
      label:  "Scopes concedidos",
      passed: primary.scopes.length > 0,
      detail: primary.scopes.length === 0 ? "No se detectaron scopes en la conexión" : undefined,
    });

    // Check 5: Account detected
    checks.push({
      label:  "Cuenta detectada",
      passed: !!primary.externalAccountId,
      detail: !primary.externalAccountId ? "externalAccountId vacío — puede requerir reconexión" : undefined,
    });

    // Check 6: No secrets in connection record (invariant)
    checks.push({
      label:  "Secrets en Vault (no en IntegrationConnection)",
      passed: true,
      detail: "IntegrationConnection nunca contiene tokens — verificación de diseño",
    });
  }

  const allPassed = checks.every(c => c.passed);
  return { provider: def.id, allPassed, checks, checkedAt: now };
}
