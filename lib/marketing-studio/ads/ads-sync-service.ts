/**
 * lib/marketing-studio/ads/ads-sync-service.ts
 *
 * MARKETING-ADS-SYNC-01 — Sincronización de Estado Real de Anuncios
 * SERVER ONLY — @server-only
 *
 * Responsabilidad:
 *   - Consultar el estado real de campañas en Meta y TikTok.
 *   - Normalizar los estados hacia AdsExternalStatus.
 *   - Actualizar AgentExecution.metadataJson con el bloque adsSync.
 *   - Nunca activar campañas, modificar presupuesto ni gastar recursos.
 *   - Nunca fallar todo si una plataforma falla.
 *   - Nunca guardar tokens ni payloads sensibles.
 *
 * Principio de fuentes:
 *   Meta y TikTok NO son la fuente de verdad operativa.
 *   Agentik conserva la trazabilidad en AgentExecution.
 *   Las plataformas externas solo enriquecen el estado real.
 *
 * Metadata guardada en AgentExecution.metadataJson.adsSync:
 *   {
 *     lastSyncedAt:      ISO string,
 *     externalStatus:    AdsExternalStatus,
 *     providerPayloads:  AdsProviderStatusPayload[],
 *     issues:            AdsSyncIssue[],
 *   }
 */
import "server-only";

import {
  getExecution,
  listExecutions,
  appendMetadata,
}                                from "@/lib/execution/execution-registry";
import { getMetaAdStatus }       from "./connectors/meta-ads-connector";
import { getTikTokAdStatus }     from "./connectors/tiktok-ads-connector";
import {
  ADS_SYNC_ERROR_CODES,
}                                from "./ads-sync-types";
import type {
  AdsExternalStatus,
  AdsExternalIds,
  AdsProviderStatusPayload,
  AdsSyncIssue,
  AdsSyncItemResult,
  AdsSyncResult,
} from "./ads-sync-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Detecta qué plataformas están presentes en los externalReferenceIds.
 */
function detectProviders(ids: Record<string, string>): string[] {
  const providers: string[] = [];
  const hasMeta   = ids.meta_campaign_id || ids.meta_adset_id || ids.meta_ad_id;
  const hasTikTok = ids.tiktok_campaign_id || ids.tiktok_adgroup_id || ids.tiktok_ad_id;
  if (hasMeta)   providers.push("meta");
  if (hasTikTok) providers.push("tiktok");
  return providers;
}

/**
 * Determina el estado global de una ejecución a partir de los payloads.
 * Prioridad: rejected > failed > in_review > active > paused > completed > archived > draft > unknown.
 */
function aggregateStatus(payloads: AdsProviderStatusPayload[]): AdsExternalStatus {
  if (payloads.length === 0) return "unknown";

  const priority: AdsExternalStatus[] = [
    "rejected", "failed", "in_review", "active",
    "paused", "completed", "archived", "draft", "unknown",
  ];

  for (const status of priority) {
    if (payloads.some(p => p.normalizedStatus === status)) return status;
  }

  return "unknown";
}

// ── syncAdsExecutionById ──────────────────────────────────────────────────────

/**
 * Sincroniza el estado de una ejecución Ads específica.
 *
 * Flujo:
 *   1. Verificar que existe y tiene externalReferenceIds.
 *   2. Detectar proveedores (meta/tiktok) por presencia de IDs.
 *   3. Consultar estado de cada plataforma en paralelo.
 *   4. Normalizar y agregar el estado global.
 *   5. Guardar en metadataJson.adsSync (sin tokens ni secretos).
 *   6. Retornar AdsSyncItemResult.
 *
 * Nunca activa campañas. Nunca lanza si una plataforma falla.
 *
 * @param tenantId    — orgSlug para Vault + tenant isolation.
 * @param executionId — ID del AgentExecution con externalReferenceIds.
 */
export async function syncAdsExecutionById(
  tenantId:    string,
  executionId: string,
): Promise<AdsSyncItemResult> {
  const lastSyncedAt = new Date().toISOString();

  const makeResult = (
    externalStatus: AdsExternalStatus,
    providerPayloads: AdsProviderStatusPayload[],
    issues: AdsSyncIssue[],
    previousStatus: string | null = null,
    provider: string = "unknown",
  ): AdsSyncItemResult => ({
    executionId,
    provider,
    previousStatus,
    externalStatus,
    normalizedStatus: externalStatus,
    lastSyncedAt,
    issues,
    providerPayloads,
  });

  // ── 1. Verificar ejecución ───────────────────────────────────────────────────

  const record = await getExecution(executionId, tenantId);

  if (!record) {
    return makeResult("unknown", [], [{
      code:     ADS_SYNC_ERROR_CODES.EXECUTION_NOT_FOUND,
      message:  "Ejecución no encontrada o acceso denegado.",
      platform: "all",
    }]);
  }

  const rawIds = record.externalReferenceIds as Record<string, string> | null ?? {};

  const providers = detectProviders(rawIds);

  if (providers.length === 0) {
    return makeResult("unknown", [], [{
      code:     ADS_SYNC_ERROR_CODES.MISSING_EXTERNAL_IDS,
      message:  "La ejecución no tiene IDs externos de plataforma. Es posible que la publicación no se completó.",
      platform: "all",
    }], record.status, "none");
  }

  // ── 2. Consultar estado de cada plataforma ────────────────────────────────

  const externalIds: AdsExternalIds = {
    meta_campaign_id:   rawIds.meta_campaign_id,
    meta_adset_id:      rawIds.meta_adset_id,
    meta_ad_id:         rawIds.meta_ad_id,
    tiktok_campaign_id: rawIds.tiktok_campaign_id,
    tiktok_adgroup_id:  rawIds.tiktok_adgroup_id,
    tiktok_ad_id:       rawIds.tiktok_ad_id,
  };

  const issues:         AdsSyncIssue[]            = [];
  const providerPayloads: AdsProviderStatusPayload[] = [];

  await Promise.all(providers.map(async (platform) => {
    try {
      if (platform === "meta") {
        const payload = await getMetaAdStatus(tenantId, externalIds);
        if (payload) {
          providerPayloads.push(payload);
        } else {
          issues.push({
            code:     ADS_SYNC_ERROR_CODES.MISSING_CREDENTIALS,
            message:  "No se pudieron resolver las credenciales de Meta para sincronizar.",
            platform: "meta",
          });
        }
      }

      if (platform === "tiktok") {
        const payload = await getTikTokAdStatus(tenantId, externalIds);
        if (payload) {
          providerPayloads.push(payload);
        } else {
          issues.push({
            code:     ADS_SYNC_ERROR_CODES.MISSING_CREDENTIALS,
            message:  "No se pudieron resolver las credenciales de TikTok para sincronizar.",
            platform: "tiktok",
          });
        }
      }
    } catch {
      issues.push({
        code:     platform === "meta"
                    ? ADS_SYNC_ERROR_CODES.META_API_ERROR
                    : ADS_SYNC_ERROR_CODES.TIKTOK_API_ERROR,
        message:  `Error inesperado al consultar ${platform}.`,
        platform,
      });
    }
  }));

  // ── 3. Agregar estado global ──────────────────────────────────────────────

  const externalStatus = aggregateStatus(providerPayloads);
  const provider       = providers.length === 1 ? providers[0] : "mixed";

  // ── 4. Guardar en metadataJson.adsSync ───────────────────────────────────
  // providerPayloads no incluye tokens — son seguros para persistir.

  await appendMetadata(executionId, tenantId, {
    adsSync: {
      lastSyncedAt,
      externalStatus,
      providerPayloads,
      issues,
    },
  });

  return makeResult(
    externalStatus,
    providerPayloads,
    issues,
    record.status,
    provider,
  );
}

// ── syncAdsExecutions ─────────────────────────────────────────────────────────

/**
 * Sincroniza las ejecuciones Ads recientes del tenant.
 *
 * Busca ejecuciones de módulo "ads" con estados terminales que tengan
 * externalReferenceIds (indicando que se publicó algo).
 *
 * Limita a las 20 más recientes para evitar sobrecarga.
 * Una plataforma que falla no cancela la sincronización de las demás.
 *
 * @param tenantId — orgSlug del tenant.
 */
export async function syncAdsExecutions(
  tenantId: string,
): Promise<AdsSyncResult> {
  const syncedAt = new Date().toISOString();

  if (!tenantId) {
    return {
      tenantId,
      syncedAt,
      items:       [],
      totalSynced: 0,
      totalFailed: 0,
    };
  }

  // Listar ejecuciones ads completadas y fallidas (terminales con posibles IDs externos).
  // "partial" se almacena como "completed" en el registro (AdsExecutionResult.status
  // es "partial" pero AgentExecution.status siempre es "completed" o "failed").
  const [completedRows, failedRows] = await Promise.all([
    listExecutions(tenantId, { module: "ads", status: "completed", limit: 20 }),
    listExecutions(tenantId, { module: "ads", status: "failed",    limit: 20 }),
  ]);

  // Merge, eliminar duplicados, y ordenar más recientes primero
  const seen  = new Set<string>();
  const all   = [...completedRows, ...failedRows].filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);

  // Solo sincronizar los que tienen IDs externos
  const withIds = all.filter(r => {
    const ids = r.externalReferenceIds as Record<string, string> | null ?? {};
    return detectProviders(ids).length > 0;
  });

  const items: AdsSyncItemResult[] = [];
  let totalFailed = 0;

  // Sincronizar en paralelo (máx 5 simultáneas para no saturar las APIs)
  const BATCH = 5;
  for (let i = 0; i < withIds.length; i += BATCH) {
    const batch = withIds.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(r => syncAdsExecutionById(tenantId, r.id).catch((): AdsSyncItemResult => ({
        executionId:      r.id,
        provider:         "unknown",
        previousStatus:   r.status,
        externalStatus:   "unknown",
        normalizedStatus: "unknown",
        lastSyncedAt:     new Date().toISOString(),
        issues:           [{ code: ADS_SYNC_ERROR_CODES.INTERNAL_ERROR, message: "Error inesperado.", platform: "all" }],
        providerPayloads: [],
      }))),
    );
    for (const result of results) {
      items.push(result);
      if (result.issues.some(i => i.code === ADS_SYNC_ERROR_CODES.MISSING_EXTERNAL_IDS || i.code === ADS_SYNC_ERROR_CODES.EXECUTION_NOT_FOUND)) {
        totalFailed++;
      }
    }
  }

  const totalSynced = items.length - totalFailed;

  return {
    tenantId,
    syncedAt,
    items,
    totalSynced,
    totalFailed,
  };
}
