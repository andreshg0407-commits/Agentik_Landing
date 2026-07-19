/**
 * lib/marketing-studio/ads/ads-sync-types.ts
 *
 * MARKETING-ADS-SYNC-01 — Tipos de Sincronización de Estado de Anuncios
 *
 * Tipos serializables — seguros para boundary RSC → client.
 * No contiene secretos, tokens ni credenciales.
 *
 * Principio:
 *   Meta y TikTok NO son la fuente de verdad operativa.
 *   Agentik conserva la trazabilidad en AgentExecution.
 *   Las plataformas externas solo enriquecen el estado real.
 */

// ── Estado externo normalizado ────────────────────────────────────────────────

/**
 * Estado normalizado de un anuncio, independiente de la plataforma.
 *
 * Mapa de plataformas → AdsExternalStatus:
 *
 * Meta:
 *   ACTIVE             → active
 *   PAUSED             → paused
 *   IN_PROCESS         → in_review
 *   PENDING_REVIEW     → in_review
 *   DISAPPROVED        → rejected
 *   WITH_ISSUES        → failed
 *   DELETED | ARCHIVED → archived
 *
 * TikTok:
 *   ENABLE    → active
 *   DISABLE   → paused
 *   REVIEWING → in_review
 *   REJECTED  → rejected
 *   COMPLETED → completed
 *   DELETE    → archived
 *   FROZEN    → failed
 */
export type AdsExternalStatus =
  | "unknown"
  | "draft"
  | "in_review"
  | "active"
  | "paused"
  | "rejected"
  | "completed"
  | "failed"
  | "archived";

/** Spanish labels for normalized statuses. */
export const ADS_EXTERNAL_STATUS_LABEL: Record<AdsExternalStatus, string> = {
  unknown:   "Desconocido",
  draft:     "Borrador",
  in_review: "En revisión",
  active:    "Activo",
  paused:    "En pausa",
  rejected:  "Rechazado",
  completed: "Completado",
  failed:    "Fallido",
  archived:  "Archivado",
};

// ── External IDs de plataforma ────────────────────────────────────────────────

/**
 * IDs externos por plataforma, leídos desde AgentExecution.externalReferenceIds.
 * La presencia de meta_ad_id indica plataforma Meta.
 * La presencia de tiktok_campaign_id indica plataforma TikTok.
 */
export interface AdsExternalIds {
  meta_campaign_id?:   string;
  meta_adset_id?:      string;
  meta_ad_id?:         string;
  tiktok_campaign_id?: string;
  tiktok_adgroup_id?:  string;
  tiktok_ad_id?:       string;
}

// ── Payload seguro de provider ────────────────────────────────────────────────

/**
 * Payload de estado del proveedor, sin tokens ni datos sensibles.
 * Seguro para persistir en metadataJson.adsSync.providerPayloadSafe.
 */
export interface AdsProviderStatusPayload {
  /** Plataforma que reporta el estado. */
  platform:        string;
  /** Estado raw del proveedor (e.g. "PAUSED", "ENABLE"). */
  providerStatus:  string;
  /** Estado normalizado Agentik. */
  normalizedStatus: AdsExternalStatus;
  /** ISO timestamp de cuándo se consultó. */
  fetchedAt:       string;
  /** ID de campaña — para trazabilidad. No contiene tokens. */
  campaignId?:     string;
  /** ID del ad set / ad group. */
  adsetId?:        string;
  /** ID del anuncio individual. */
  adId?:           string;
}

// ── Problema de sincronización ────────────────────────────────────────────────

export interface AdsSyncIssue {
  /** Código interno del problema. */
  code:     string;
  /** Mensaje legible, sin datos sensibles. */
  message:  string;
  /** Plataforma a la que aplica. */
  platform: string;
}

// ── Resultado por ejecución ───────────────────────────────────────────────────

/**
 * Resultado de sincronización para una ejecución individual.
 * Seguro para RSC → client. No incluye tokens.
 */
export interface AdsSyncItemResult {
  /** ID del AgentExecution sincronizado. */
  executionId:      string;
  /** Proveedor principal (meta | tiktok | mixed). */
  provider:         string;
  /** Estado de Agentik antes de la sincronización. */
  previousStatus:   string | null;
  /** Estado externo normalizado después de sincronizar. */
  externalStatus:   AdsExternalStatus;
  /** Alias de externalStatus — para consistencia con UI. */
  normalizedStatus: AdsExternalStatus;
  /** ISO timestamp de la sincronización. */
  lastSyncedAt:     string;
  /** Problemas detectados durante la sincronización (non-fatal). */
  issues:           AdsSyncIssue[];
  /** Payloads de provider por plataforma. */
  providerPayloads: AdsProviderStatusPayload[];
}

// ── Resultado global ──────────────────────────────────────────────────────────

/**
 * Resultado de una operación de sincronización.
 * Puede sincronizar una o varias ejecuciones.
 */
export interface AdsSyncResult {
  /** Tenant sincronizado. */
  tenantId:     string;
  /** ISO timestamp del inicio de la sincronización. */
  syncedAt:     string;
  /** Resultados por ejecución. */
  items:        AdsSyncItemResult[];
  /** Cuántas ejecuciones se sincronizaron con éxito (al menos un proveedor). */
  totalSynced:  number;
  /** Cuántas ejecuciones fallaron completamente. */
  totalFailed:  number;
}

// ── Respuesta de API route ────────────────────────────────────────────────────

export interface AdsSyncApiResponse {
  syncResult:  AdsSyncResult;
  executionId: string | null;
}

// ── Códigos de error de sincronización ───────────────────────────────────────

export const ADS_SYNC_ERROR_CODES = {
  MISSING_CREDENTIALS:     "MISSING_CREDENTIALS",
  MISSING_EXTERNAL_IDS:    "MISSING_EXTERNAL_IDS",
  EXECUTION_NOT_FOUND:     "EXECUTION_NOT_FOUND",
  META_API_ERROR:          "META_API_ERROR",
  TIKTOK_API_ERROR:        "TIKTOK_API_ERROR",
  UNSUPPORTED_PROVIDER:    "UNSUPPORTED_PROVIDER",
  INTERNAL_ERROR:          "INTERNAL_ERROR",
} as const;

export type AdsSyncErrorCode = typeof ADS_SYNC_ERROR_CODES[keyof typeof ADS_SYNC_ERROR_CODES];
