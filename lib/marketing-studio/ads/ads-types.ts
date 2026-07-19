/**
 * lib/marketing-studio/ads/ads-types.ts
 *
 * MARKETING-ADS-01 — Tipos del módulo Anuncios
 * MARKETING-ADS-CONNECTORS-01 — Extended with connectivity state
 *
 * Tipos serializables seguros para el boundary RSC → client.
 * No importar Prisma ni librerías server-only desde aquí.
 */

// Re-export connector diagnostic types (plain types — no server-only)
export type {
  AdsPlatform,
  AdsConnectionStatus,
  AdsAccountSummary,
  AdsPermissionSummary,
  AdsConnectorDiagnostic,
} from "./connectors/ads-connector-types";

// ── Connectivity aggregate types (RSC → client safe) ──────────────────────────

export type AdsConnectivityHealth =
  | "all_connected"   // every configured platform is connected
  | "partial"         // at least one connected, at least one degraded/error
  | "none_configured" // no platform has credentials configured
  | "degraded";       // credentials present but nothing connected

export interface AdsConnectivityStatus {
  health:    AdsConnectivityHealth;
  platforms: import("./connectors/ads-connector-types").AdsConnectorDiagnostic[];
  checkedAt: string;
  connected: string[];
  attention: string[];
}

// ── Domain enums ───────────────────────────────────────────────────────────────

export type AdPlatform   = "facebook" | "instagram" | "tiktok" | "google" | "youtube";
export type AdObjective  = "mensajes" | "visitas" | "ventas" | "seguidores" | "reconocimiento" | "alcance";
export type AdAssetSource = "biblioteca" | "foto_estudio" | "upload_image" | "upload_video" | "shopify";
export type AdBudgetType = "diario" | "total";
export type AdCurrency   = "USD" | "COP" | "MXN" | "ARS";

export type AdStatus =
  | "activo"
  | "programado"
  | "borrador"
  | "revision"
  | "finalizado"
  | "pausado";

// ── Entity ────────────────────────────────────────────────────────────────────

export interface AdEntity {
  id:          string;
  nombre:      string;
  plataformas: AdPlatform[];
  objetivo:    AdObjective;
  presupuesto: string;   // formatted string, e.g. "USD 100 / 7 días"
  estado:      AdStatus;
  inicio:      string | null;  // ISO
  fin:         string | null;  // ISO
  updatedAt:   string;         // ISO
}

// ── Runtime state (RSC → client safe) ────────────────────────────────────────

export interface AdsRuntimeHealth {
  level:      "ok" | "warning" | "critical" | "empty";
  activos:    number;
  revision:   number;
  finalizados: number;
}

export interface AdsRuntimeState {
  ads:          AdEntity[];
  health:       AdsRuntimeHealth;
  /** Connectivity diagnostic — null if service check was skipped. */
  connectivity: AdsConnectivityStatus | null;
  /**
   * Saved platform account selections from TenantAdsConfig.
   * Loaded at RSC time (fast — Prisma only, no external API calls).
   * For live discovery, use the /ads/accounts API route on demand.
   */
  accountsConfig: import("./ads-accounts-types").TenantAdsConfigData[] | null;
}

// ── Label maps ────────────────────────────────────────────────────────────────

export const AD_STATUS_LABEL: Record<AdStatus, string> = {
  activo:     "Activo",
  programado: "Programado",
  borrador:   "Borrador",
  revision:   "En revisión",
  finalizado: "Finalizado",
  pausado:    "Pausado",
};

export const AD_STATUS_VARIANT: Record<AdStatus, string> = {
  activo:     "active",
  programado: "scheduled",
  borrador:   "draft",
  revision:   "review",
  finalizado: "done",
  pausado:    "paused",
};

export const AD_OBJECTIVE_LABEL: Record<AdObjective, string> = {
  mensajes:       "Mensajes",
  visitas:        "Visitas al sitio",
  ventas:         "Ventas",
  seguidores:     "Seguidores",
  reconocimiento: "Reconocimiento",
  alcance:        "Alcance",
};

export const AD_PLATFORM_LABEL: Record<AdPlatform, string> = {
  facebook:  "Facebook",
  instagram: "Instagram",
  tiktok:    "TikTok",
  google:    "Google",
  youtube:   "YouTube",
};
