/**
 * lib/marketing-studio/commerce/shopify-config-service.ts
 *
 * SHOPIFY-CONFIGURATION-01 — Centro de Configuración y Diagnóstico Data Layer
 * SERVER ONLY — never import from client components.
 * @server-only
 *
 * Responsibility: aggregate Shopify connection health, scopes, sync queue state,
 * webhook status, and tenant policies into a serializable ShopifyConfigSummary
 * safe to pass across the RSC → client boundary.
 *
 * ── What this module is NOT ────────────────────────────────────────────────────
 *   NOT the connection manager — credentials live in Vault (vault-service.ts).
 *   NOT the sync engine — jobs processed by integration-runtime.
 *   NOT the webhook processor — /api/integrations/shopify/webhook handles that.
 *   NOT the policy engine — policies are structural defaults (no DB model yet).
 *
 * ── What this module IS ───────────────────────────────────────────────────────
 *   - Reads connection status from shopify-context-resolver (no secrets exposed).
 *   - Reads connection metadata from integration-repository (scopes, health, etc.).
 *   - Reads pending sync job count from integration-repository.
 *   - Derives diagnostic signals from all available data.
 *   - Returns a single serializable ShopifyConfigSummary for page.tsx.
 *
 * ── Persistence status ────────────────────────────────────────────────────────
 *   Policies: structural defaults — ShopifyTenantPolicy Prisma model not yet added.
 *             When added, replace buildDefaultPolicies() with a real DB query.
 *   Webhook registration: structural — IntegrationWebhookEvent rows track received
 *             events but not what is registered at Shopify. When a webhook
 *             registration model is added, replace the env-var heuristic below.
 *
 * ── Related existing infrastructure (reused, not duplicated) ─────────────────
 *   resolveShopifyContextStatus  → shopify-context-resolver.ts
 *   getIntegrationConnection     → integration-repository.ts
 *   getPendingIntegrationSyncJobs → integration-repository.ts
 *   IntegrationConnectionSnapshot → integration-types.ts
 */
import "server-only";

import { resolveShopifyContextStatus } from "@/lib/marketing-studio/commerce/shopify-runtime/shopify-context-resolver";
import {
  getIntegrationConnection,
  getPendingIntegrationSyncJobs,
}                                      from "@/lib/integrations/integration-repository";
import type {
  ConnectionStatus,
  ConnectionHealth,
}                                      from "@/lib/integrations/integration-types";

// ── Recommended Shopify scopes for full Agentik functionality ──────────────────

const RECOMMENDED_SCOPES: string[] = [
  "read_products",
  "write_products",
  "read_orders",
  "write_orders",
  "read_price_rules",
  "write_price_rules",
  "read_discounts",
  "write_discounts",
  "read_inventory",
];

// ── Webhook topics Agentik subscribes to ──────────────────────────────────────

const AGENTIK_WEBHOOK_TOPICS: string[] = [
  "products/create",
  "products/update",
  "products/delete",
  "orders/create",
  "orders/updated",
  "inventory_levels/update",
];

// ── Serializable types (RSC → client boundary safe) ───────────────────────────

export type DiagnosticSeverity = "ok" | "info" | "warning" | "critical";

export interface DiagnosticSignal {
  id:       string;
  label:    string;
  severity: DiagnosticSeverity;
  detail:   string | null;
}

/**
 * Tenant-level policies governing Shopify actions.
 * Structural defaults — no Prisma model yet.
 * When ShopifyTenantPolicy is added to the schema, query it in buildDefaultPolicies().
 */
export interface ShopifyTenantPolicy {
  publicationRequiresApproval: boolean;
  promotionsRequireApproval:   boolean;
  autoSyncEnabled:             boolean;
  automationsEnabled:          boolean;
  sensitiveActionsBlocked:     boolean;
}

/**
 * Full diagnostic summary of Shopify configuration state.
 * All fields are JSON-safe — safe for RSC → client boundary.
 * accessToken is NEVER included here.
 */
export interface ShopifyConfigSummary {
  // ── Connection ─────────────────────────────────────────────────────────────
  connected:          boolean;
  shopDomain:         string | null;
  /** Friendly store name from externalAccountName if available */
  storeName:          string | null;
  connectionId:       string | null;
  connectionStatus:   ConnectionStatus;
  connectionHealth:   ConnectionHealth;
  connectedAt:        string | null;  // ISO
  lastHealthCheckAt:  string | null;  // ISO
  errorMessage:       string | null;
  source:             "vault" | "env_dev" | "none";
  // ── Credentials (metadata only — no secrets ever) ─────────────────────────
  hasToken:           boolean;
  // ── Scopes ─────────────────────────────────────────────────────────────────
  scopes:             string[];
  missingScopes:      string[];
  scopesOk:           boolean;
  // ── Sync jobs ──────────────────────────────────────────────────────────────
  pendingJobs:        number;
  // ── Webhooks (structural) ─────────────────────────────────────────────────
  webhooksConfigured: boolean;
  webhookTopics:      string[];
  // ── Policies (structural defaults — no DB yet) ────────────────────────────
  policies:           ShopifyTenantPolicy;
  // ── Derived diagnostic signals ────────────────────────────────────────────
  signals:            DiagnosticSignal[];
}

// ── Default policies (structural stub) ────────────────────────────────────────

function buildDefaultPolicies(): ShopifyTenantPolicy {
  // PLACEHOLDER — structural defaults only.
  // Future: const row = await prisma.shopifyTenantPolicy.findUnique({ where: { organizationId } });
  return {
    publicationRequiresApproval: true,
    promotionsRequireApproval:   true,
    autoSyncEnabled:             false,
    automationsEnabled:          false,
    sensitiveActionsBlocked:     true,
  };
}

// ── Diagnostic signal builder ──────────────────────────────────────────────────

function buildDiagnosticSignals(params: {
  connected:          boolean;
  hasToken:           boolean;
  connectionStatus:   ConnectionStatus;
  connectionHealth:   ConnectionHealth;
  scopes:             string[];
  missingScopes:      string[];
  pendingJobs:        number;
  webhooksConfigured: boolean;
  errorMessage:       string | null;
}): DiagnosticSignal[] {
  const signals: DiagnosticSignal[] = [];

  // 1. Connection state
  signals.push({
    id:       "connection_state",
    label:    "Estado de conexión",
    severity: params.connected ? "ok" : "critical",
    detail:   params.connected
      ? `Activa · ${params.connectionStatus}`
      : "Sin conexión activa a Shopify",
  });

  // 2. Token de acceso
  signals.push({
    id:       "access_token",
    label:    "Token de acceso",
    severity: params.hasToken
      ? "ok"
      : params.connected ? "critical" : "info",
    detail: params.hasToken
      ? "Token disponible en Vault"
      : params.connected
        ? "Token no encontrado en Vault"
        : "Requiere conexión primero",
  });

  // 3. Permisos — only when connected
  if (params.connected) {
    signals.push({
      id:       "scopes",
      label:    "Permisos de la API",
      severity: params.missingScopes.length === 0 ? "ok" : "warning",
      detail:   params.missingScopes.length === 0
        ? `${params.scopes.length} permisos configurados`
        : `Faltan ${params.missingScopes.length} permiso${params.missingScopes.length !== 1 ? "s" : ""} recomendado${params.missingScopes.length !== 1 ? "s" : ""}`,
    });
  }

  // 4. Cola de sincronización — only when connected
  if (params.connected) {
    signals.push({
      id:       "sync_queue",
      label:    "Cola de sincronización",
      severity: params.pendingJobs > 20 ? "warning" : "ok",
      detail:   params.pendingJobs === 0
        ? "Sin trabajos pendientes"
        : `${params.pendingJobs} trabajo${params.pendingJobs !== 1 ? "s" : ""} en cola`,
    });
  }

  // 5. Webhooks
  signals.push({
    id:       "webhooks",
    label:    "Webhooks",
    severity: params.webhooksConfigured
      ? "ok"
      : params.connected ? "warning" : "info",
    detail: params.webhooksConfigured
      ? "Webhook secret configurado — eventos verificables"
      : params.connected
        ? "SHOPIFY_WEBHOOK_SECRET no configurado — webhooks no verificables"
        : "Requiere conexión para activar webhooks",
  });

  // 6. Estado de salud — only when connected
  if (params.connected) {
    signals.push({
      id:       "health",
      label:    "Estado de salud",
      severity:
        params.connectionHealth === "healthy"    ? "ok"       :
        params.connectionHealth === "warning"    ? "warning"  :
        params.connectionHealth === "critical"   ? "critical" : "info",
      detail: `Salud de la integración: ${params.connectionHealth}`,
    });
  }

  // 7. Error activo
  if (params.errorMessage) {
    signals.push({
      id:       "active_error",
      label:    "Error activo",
      severity: "critical",
      detail:   params.errorMessage,
    });
  }

  return signals;
}

// ── Main aggregator ────────────────────────────────────────────────────────────

/**
 * Returns a serializable summary of the Shopify configuration state.
 * Never exposes accessToken or any secret value.
 *
 * Resolution order:
 *   1. resolveShopifyContextStatus → ok/fail + shopDomain + source
 *   2. getIntegrationConnection    → full metadata (scopes, health, timestamps)
 *   3. getPendingIntegrationSyncJobs → job count (only when connected)
 *   4. Derive missingScopes, webhooksConfigured, signals, policies
 */
export async function getShopifyConfigSummary(
  organizationId: string,
): Promise<ShopifyConfigSummary> {
  // Step 1 — context resolution (checks token presence without exposing it)
  const resolution = await resolveShopifyContextStatus({ tenantId: organizationId });

  const connected = resolution.ok;
  const hasToken  = resolution.ok;  // ok requires both active connection AND valid token

  // Step 2 — connection metadata (no secrets)
  let connectionId:      string | null     = null;
  let connectionStatus:  ConnectionStatus  = "not_connected";
  let connectionHealth:  ConnectionHealth  = "disconnected";
  let shopDomain:        string | null     = resolution.shopDomain;
  let storeName:         string | null     = null;
  let connectedAt:       string | null     = null;
  let lastHealthCheckAt: string | null     = null;
  let errorMessage:      string | null     = null;
  let scopes:            string[]          = [];

  try {
    const conn = await getIntegrationConnection(organizationId, "shopify");
    if (conn) {
      connectionId      = conn.id;
      connectionStatus  = conn.status;
      connectionHealth  = conn.health;
      shopDomain        = conn.shopDomain ?? shopDomain;
      storeName         = conn.externalAccountName ?? null;
      connectedAt       = conn.connectedAt;
      lastHealthCheckAt = conn.lastHealthCheckAt;
      errorMessage      = conn.errorMessage;
      scopes            = conn.scopes;
    }
  } catch {
    // Non-blocking — use defaults above
  }

  // Step 3 — pending sync job count (only when connected)
  let pendingJobs = 0;
  if (connected) {
    try {
      const jobs = await getPendingIntegrationSyncJobs(organizationId, "shopify");
      pendingJobs = jobs.length;
    } catch {
      // Non-blocking
    }
  }

  // Step 4 — derived fields
  const missingScopes      = RECOMMENDED_SCOPES.filter(s => !scopes.includes(s));
  const scopesOk           = connected && missingScopes.length === 0;
  const webhooksConfigured = connected && !!process.env.SHOPIFY_WEBHOOK_SECRET;
  const webhookTopics      = webhooksConfigured ? AGENTIK_WEBHOOK_TOPICS : [];

  const signals = buildDiagnosticSignals({
    connected,
    hasToken,
    connectionStatus,
    connectionHealth,
    scopes,
    missingScopes,
    pendingJobs,
    webhooksConfigured,
    errorMessage,
  });

  return {
    connected,
    shopDomain,
    storeName,
    connectionId,
    connectionStatus,
    connectionHealth,
    connectedAt,
    lastHealthCheckAt,
    errorMessage,
    source:  resolution.source,
    hasToken,
    scopes,
    missingScopes,
    scopesOk,
    pendingJobs,
    webhooksConfigured,
    webhookTopics,
    policies: buildDefaultPolicies(),
    signals,
  };
}

// ── Status helpers ─────────────────────────────────────────────────────────────

/**
 * One-line Spanish label for OperationalWorkspaceHeader statusLabel.
 */
export function buildConfigStatusLabel(
  connected: boolean,
  summary:   ShopifyConfigSummary | null,
): string {
  if (!connected) return "Integración requerida";
  if (!summary)   return "Error al cargar configuración";

  const criticals = summary.signals.filter(s => s.severity === "critical").length;
  if (criticals > 0) {
    return `${criticals} señal${criticals !== 1 ? "es" : ""} crítica${criticals !== 1 ? "s" : ""}`;
  }
  const warnings = summary.signals.filter(s => s.severity === "warning").length;
  if (warnings > 0) {
    return `${warnings} elemento${warnings !== 1 ? "s" : ""} requiere${warnings !== 1 ? "n" : ""} atención`;
  }
  return "Configuración operativa";
}
