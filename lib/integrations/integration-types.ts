/**
 * lib/integrations/integration-types.ts
 *
 * MS-10 — Integration Domain Types
 *
 * Provider-agnostic type system for the Agentik Integration Runtime.
 * Follows MS-05F as-const enum pattern throughout.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   No Prisma, no fetch, no side effects.
 *   All types are serializable for RSC → client boundary.
 *   organizationId-scoped by contract on every persistent record.
 */

// ── Provider ──────────────────────────────────────────────────────────────────

export const INTEGRATION_PROVIDER = {
  SHOPIFY:         "shopify",
  TIKTOK:          "tiktok",
  META_INSTAGRAM:  "meta_instagram",
  META_FACEBOOK:   "meta_facebook",
  META_ADS:        "meta_ads",
  META_WHATSAPP:   "meta_whatsapp",
  YOUTUBE:         "youtube",
  R2:              "r2",
  // Legacy — kept for backward compat with existing rows
  META:      "meta",
  WHATSAPP:  "whatsapp",
  GOOGLE:    "google",
  CUSTOM:    "custom",
} as const;
export type IntegrationProvider = typeof INTEGRATION_PROVIDER[keyof typeof INTEGRATION_PROVIDER];

export const INTEGRATION_PROVIDER_LABEL: Partial<Record<IntegrationProvider, string>> & Record<string, string> = {
  shopify:        "Shopify",
  tiktok:         "TikTok",
  meta_instagram: "Instagram",
  meta_facebook:  "Facebook",
  meta_ads:       "Meta Ads",
  meta_whatsapp:  "WhatsApp Business",
  youtube:        "YouTube",
  r2:             "Cloudflare R2",
  meta:           "Meta (legado)",
  whatsapp:       "WhatsApp (legado)",
  google:         "Google Merchant",
  custom:         "API Personalizada",
};

/** Group key for UI grouping — maps provider to visual card group */
export const PROVIDER_GROUP: Partial<Record<IntegrationProvider, string>> & Record<string, string> = {
  meta_instagram: "meta",
  meta_facebook:  "meta",
  meta_ads:       "meta",
  meta_whatsapp:  "meta",
  tiktok:         "tiktok",
  shopify:        "shopify",
  youtube:        "youtube",
  r2:             "r2",
};

// ── Connection status ─────────────────────────────────────────────────────────

export const CONNECTION_STATUS = {
  NOT_CONNECTED: "not_connected",
  CONNECTED:     "connected",
  EXPIRED:       "expired",
  REVOKED:       "revoked",
  ERROR:         "error",
  DISABLED:      "disabled",
} as const;
export type ConnectionStatus = typeof CONNECTION_STATUS[keyof typeof CONNECTION_STATUS];

export const CONNECTION_STATUS_LABEL: Record<ConnectionStatus, string> = {
  not_connected: "Sin conexión",
  connected:     "Conectado",
  expired:       "Expirado",
  revoked:       "Revocado",
  error:         "Error de conexión",
  disabled:      "Deshabilitado",
};

// ── Connection health ─────────────────────────────────────────────────────────

export const CONNECTION_HEALTH = {
  HEALTHY:      "healthy",
  WARNING:      "warning",
  CRITICAL:     "critical",
  DISCONNECTED: "disconnected",
} as const;
export type ConnectionHealth = typeof CONNECTION_HEALTH[keyof typeof CONNECTION_HEALTH];

export const CONNECTION_HEALTH_LABEL: Record<ConnectionHealth, string> = {
  healthy:      "Saludable",
  warning:      "Advertencia",
  critical:     "Crítico",
  disconnected: "Desconectado",
};

// ── Commerce job type + status ────────────────────────────────────────────────

export const COMMERCE_JOB_TYPE = {
  PUBLISH_PRODUCT_DRAFT: "publish_product_draft",
  UPDATE_PRODUCT:        "update_product",
  DELETE_PRODUCT:        "delete_product",
  SYNC_INVENTORY:        "sync_inventory",
  SYNC_COLLECTION:       "sync_collection",
} as const;
export type CommerceJobType = typeof COMMERCE_JOB_TYPE[keyof typeof COMMERCE_JOB_TYPE];

export const COMMERCE_JOB_STATUS = {
  PENDING:   "pending",
  QUEUED:    "queued",
  RUNNING:   "running",
  SUCCEEDED: "succeeded",
  FAILED:    "failed",
  CANCELLED: "cancelled",
} as const;
export type CommerceJobStatus = typeof COMMERCE_JOB_STATUS[keyof typeof COMMERCE_JOB_STATUS];

// ── Connection snapshot (safe for RSC → client, no secrets) ──────────────────

export interface IntegrationConnectionSnapshot {
  id:                  string;
  organizationId:      string;
  provider:            IntegrationProvider;
  status:              ConnectionStatus;
  health:              ConnectionHealth;
  shopDomain:          string | null;
  externalAccountId:   string | null;
  externalAccountName: string | null;
  // Multi-account fields — AGENTIK-OAUTH-CONNECTIONS-01
  label:               string | null;
  isPrimary:           boolean;
  accountHandle:       string | null;
  accountAvatarUrl:    string | null;
  accountType:         string | null;
  providerGroup:       string | null;
  externalPageId:      string | null;
  externalBusinessId:  string | null;
  externalAdAccountId: string | null;
  scopes:              string[];
  connectedAt:         string | null;  // ISO
  disconnectedAt:      string | null;  // ISO
  lastHealthCheckAt:   string | null;  // ISO
  errorMessage:        string | null;
}

// ── Webhook event (safe snapshot) ────────────────────────────────────────────

export interface WebhookEventSnapshot {
  id:             string;
  organizationId: string;
  provider:       IntegrationProvider;
  topic:          string;
  status:         "pending" | "processed" | "failed";
  receivedAt:     string;  // ISO
  processedAt:    string | null;
  errorMessage:   string | null;
}

// ── Commerce job snapshot ─────────────────────────────────────────────────────

export interface CommerceJobSnapshot {
  id:             string;
  organizationId: string;
  connectionId:   string | null;
  provider:       IntegrationProvider;
  jobType:        CommerceJobType;
  status:         CommerceJobStatus;
  priority:       number;
  productId:      string | null;
  retryCount:     number;
  scheduledAt:    string;  // ISO
  startedAt:      string | null;
  completedAt:    string | null;
  lastError:      string | null;
}
