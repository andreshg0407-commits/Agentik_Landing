/**
 * lib/marketing-studio/ads/ads-execution-types.ts
 *
 * MARKETING-ADS-EXECUTION-01 — Tipos de Ejecución Real de Anuncios
 *
 * Tipos serializables — seguros para boundary RSC → client.
 * No contiene secretos, tokens ni valores cifrados.
 *
 * Principio:
 *   El ejecutor NUNCA lee el estado vivo del wizard.
 *   Solo ejecuta el ApprovedExecutionSnapshot capturado en el momento de la aprobación.
 *   Si el borrador cambia después de aprobar, la aprobación queda inválida.
 */

// ── Snapshot inmutable de aprobación ──────────────────────────────────────────

/**
 * ApprovedExecutionSnapshot — captura inmutable del borrador aprobado.
 *
 * Se genera en el cliente al momento de aprobar y se almacena en el
 * metadataJson del AgentExecution. El ejecutor lo leerá exclusivamente de ahí.
 *
 * Reglas de integridad:
 *   - Nunca contiene tokens, secretos ni credenciales.
 *   - Contiene IDs de cuentas (no tokens de acceso).
 *   - Cambiar el borrador después de capturar el snapshot invalida la aprobación.
 *   - approvalVersion detecta cambios posteriores al snapshot.
 */
export interface ApprovedExecutionSnapshot {
  /** Hash determinístico de los campos clave del borrador al momento de aprobar. */
  approvalVersion: string;
  /** Cuándo fue capturado el snapshot. ISO string. */
  snapshotAt:      string;

  // ── Plataformas ─────────────────────────────────────────────────────────────
  plataformas:     string[];   // ["meta", "tiktok"]
  metaSubchannels: string[];   // ["facebook", "instagram"]

  // ── Objetivo ────────────────────────────────────────────────────────────────
  objetivo: string;

  // ── Recursos creativos (IDs y etiquetas — sin contenido de archivo) ─────────
  assets: Array<{
    id:           string;
    source:       string;     // biblioteca | foto_estudio | shopify | etc.
    label:        string;
    shopifyName?: string;
    shopifyLink?: string;
  }>;

  // ── Contenido ───────────────────────────────────────────────────────────────
  textoPrincipal: string;
  cta:            string;
  hashtags:       string;

  // ── Destino ─────────────────────────────────────────────────────────────────
  destino:       string | null;
  urlDestino:    string;
  whatsappNumber: string;

  // ── Audiencia ───────────────────────────────────────────────────────────────
  pais:      string;
  ciudad:    string;
  edadMin:   string;
  edadMax:   string;
  intereses: string;
  publico:   string;

  // ── Presupuesto ─────────────────────────────────────────────────────────────
  monto:    string;             // "150" (string numérico)
  moneda:   string;             // "USD" | "COP" | "MXN"
  tipoPres: "diario" | "total";
  inicio:   string;             // ISO date "2026-07-01"
  fin:      string;             // ISO date "2026-07-15"

  // ── Cuentas de Meta (resueltas al momento de aprobar desde TenantAdsConfig) ─
  // IDs de plataforma únicamente — nunca tokens.
  metaAdAccountId:        string | null;
  metaAdAccountName:      string | null;
  metaPageId:             string | null;
  metaPageName:           string | null;
  metaInstagramAccountId: string | null;

  // ── Cuentas de TikTok ───────────────────────────────────────────────────────
  tiktokAdvertiserId:   string | null;
  tiktokAdvertiserName: string | null;
}

// ── Resultado por plataforma ──────────────────────────────────────────────────

/**
 * Resultado de ejecución en una plataforma específica.
 * Contiene IDs externos para sincronización futura — nunca tokens.
 */
export interface AdsExecutionPlatformResult {
  /** Plataforma ejecutada. */
  platform:      string;
  /** Si la publicación tuvo éxito en esta plataforma. */
  success:       boolean;
  /** ID de la campaña creada (si disponible). */
  campaignId?:   string;
  /** ID del adset / grupo de anuncios. */
  adsetId?:      string;
  /** ID del anuncio individual. */
  adId?:         string;
  /** ID del creative (Meta). */
  creativeId?:   string;
  /** Código de error si falló. */
  errorCode?:    string;
  /** Descripción del error sin datos sensibles. */
  errorMessage?: string;
}

// ── Resultado global de ejecución ─────────────────────────────────────────────

/**
 * Resultado completo de executeApprovedAd().
 * Seguro para RSC → client. No contiene tokens ni secretos.
 */
export interface AdsExecutionResult {
  /** ID del AgentExecution actualizado. */
  executionId:          string | null;
  /** Estado final del ciclo de vida. */
  status:               "completed" | "failed" | "partial";
  /** Resultados por plataforma. */
  platformResults:      AdsExecutionPlatformResult[];
  /** IDs externos consolidados para auditoría y sincronización. */
  externalReferenceIds: Record<string, string>;
  /** Resumen legible del resultado. */
  summary:              string;
  /** Cuándo terminó la ejecución. ISO string. */
  executedAt:           string;
  /** Código de error global si status=failed. */
  errorCode?:           string;
  /** Descripción global del error. */
  errorMessage?:        string;
}

// ── Campaña de Meta (respuesta de API) ───────────────────────────────────────

/** Respuesta interna de la creación de campaña en Meta. */
export interface MetaCampaignCreationResult {
  success:    boolean;
  campaignId: string | null;
  adsetId:    string | null;
  adId:       string | null;
  creativeId: string | null;
  errorCode?: string;
  errorMsg?:  string;
}

/** Respuesta interna de la creación de campaña en TikTok. */
export interface TikTokCampaignCreationResult {
  success:    boolean;
  campaignId: string | null;
  adgroupId:  string | null;
  adId:       string | null;
  errorCode?: string;
  errorMsg?:  string;
}

// ── Respuesta de la API route ─────────────────────────────────────────────────

/** Respuesta de POST /api/.../ads/execute */
export interface AdsExecuteApiResponse {
  executionResult: AdsExecutionResult;
  executionId:     string | null;
}

// ── Hash de versión de aprobación ────────────────────────────────────────────

/**
 * Calcula un hash determinístico djb2-like de los campos clave del borrador.
 *
 * Se genera en el cliente al construir el ApprovedExecutionSnapshot.
 * Si el borrador cambia después de capturar el snapshot, el hash diferirá
 * y la UI puede detectar la invalidación antes de intentar ejecutar.
 *
 * Campos incluidos: plataformas, objetivo, monto, moneda, tipoPres,
 *   inicio, fin, textoPrincipal, urlDestino, destino.
 * Campos excluidos: assets (IDs inestables), audiencia fina (ciudad/intereses).
 *
 * Cliente-seguro — sin dependencias de servidor.
 */
export function computeApprovalVersion(fields: {
  plataformas:    string[];
  objetivo:       string;
  monto:          string;
  moneda:         string;
  tipoPres:       string;
  inicio:         string;
  fin:            string;
  textoPrincipal: string;
  urlDestino:     string;
  destino:        string | null;
}): string {
  const str = JSON.stringify([
    [...fields.plataformas].sort(),
    fields.objetivo,
    fields.monto,
    fields.moneda,
    fields.tipoPres,
    fields.inicio,
    fields.fin,
    fields.textoPrincipal,
    fields.urlDestino,
    fields.destino,
  ]);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0; // 32-bit int
  }
  return (hash >>> 0).toString(16);
}

// ── Códigos de error de ejecución ─────────────────────────────────────────────

export const ADS_EXECUTION_ERROR_CODES = {
  // Estado incorrecto
  NOT_APPROVED:         "NOT_APPROVED",
  MISSING_SNAPSHOT:     "MISSING_SNAPSHOT",
  INVALID_SNAPSHOT:     "INVALID_SNAPSHOT",
  EXECUTION_NOT_FOUND:  "EXECUTION_NOT_FOUND",
  // Credenciales
  MISSING_CREDENTIALS:  "MISSING_CREDENTIALS",
  INVALID_CREDENTIALS:  "INVALID_CREDENTIALS",
  // Configuración
  MISSING_AD_ACCOUNT:   "MISSING_AD_ACCOUNT",
  MISSING_ADVERTISER:   "MISSING_ADVERTISER",
  // API externa
  META_API_ERROR:       "META_API_ERROR",
  TIKTOK_API_ERROR:     "TIKTOK_API_ERROR",
  // Interno
  INTERNAL_ERROR:       "INTERNAL_ERROR",
} as const;

export type AdsExecutionErrorCode = typeof ADS_EXECUTION_ERROR_CODES[keyof typeof ADS_EXECUTION_ERROR_CODES];
