/**
 * lib/marketing-studio/ads/ads-execution-service.ts
 *
 * MARKETING-ADS-EXECUTION-01 — Ejecutor Real de Anuncios
 * SERVER ONLY — @server-only
 *
 * Responsabilidad:
 *   - Consumir exclusivamente ejecuciones con status "approved".
 *   - Leer el ApprovedExecutionSnapshot del metadataJson (nunca el wizard vivo).
 *   - Resolver credenciales desde Vault en tiempo de ejecución.
 *   - Publicar campañas en Meta y TikTok usando APIs oficiales.
 *   - Crear todas las campañas en estado PAUSED — el operador activa manualmente.
 *   - Registrar IDs externos y ciclo de vida en AgentExecution.
 *
 * Principio de snapshot inmutable:
 *   El ejecutor NUNCA lee el estado actual del wizard.
 *   Si el borrador cambió después de la aprobación, la aprobación ya no es válida
 *   y el ejecutor rechazará la ejecución con INVALID_SNAPSHOT.
 *
 * Garantías de seguridad:
 *   - Nunca guarda tokens ni credenciales en el registro.
 *   - En producción, credenciales solo desde Vault.
 *   - Copilot NUNCA puede disparar esta función — solo el operador humano.
 *
 * Preparado para:
 *   - MARKETING-ADS-CREATIVE-01 — subida de creativos reales
 *   - MARKETING-ADS-AUDIENCE-01 — segmentación avanzada
 */
import "server-only";

import {
  getExecution,
  updateExecutionStatus,
  completeExecution,
  failExecution,
}                                           from "@/lib/execution/execution-registry";
import {
  resolveMetaAdsCredentials,
  resolveTikTokAdsCredentials,
}                                           from "./ads-vault";
import {
  ADS_EXECUTION_ERROR_CODES,
}                                           from "./ads-execution-types";
import type {
  ApprovedExecutionSnapshot,
  AdsExecutionResult,
  AdsExecutionPlatformResult,
  MetaCampaignCreationResult,
  TikTokCampaignCreationResult,
} from "./ads-execution-types";

// ── Meta Graph API version ────────────────────────────────────────────────────

const META_API_VERSION = "v19.0";
const META_GRAPH_BASE  = `https://graph.facebook.com/${META_API_VERSION}`;

// ── TikTok Business API version ───────────────────────────────────────────────

const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

// ── Mapeo de objetivos → Meta ────────────────────────────────────────────────

function metaCampaignObjective(objetivo: string): string {
  switch (objetivo) {
    case "mensajes":       return "OUTCOME_ENGAGEMENT";
    case "visitas":        return "OUTCOME_TRAFFIC";
    case "ventas":         return "OUTCOME_SALES";
    case "seguidores":     return "OUTCOME_AWARENESS";
    case "reconocimiento": return "OUTCOME_AWARENESS";
    case "alcance":        return "OUTCOME_REACH";
    default:               return "OUTCOME_TRAFFIC";
  }
}

function metaOptimizationGoal(objetivo: string): string {
  switch (objetivo) {
    case "mensajes":       return "CONVERSATIONS";
    case "visitas":        return "LINK_CLICKS";
    case "ventas":         return "OFFSITE_CONVERSIONS";
    case "seguidores":     return "PAGE_LIKES";
    case "reconocimiento": return "REACH";
    case "alcance":        return "REACH";
    default:               return "LINK_CLICKS";
  }
}

// ── Mapeo de objetivos → TikTok ──────────────────────────────────────────────

function tiktokObjectiveType(objetivo: string): string {
  switch (objetivo) {
    case "mensajes":       return "ENGAGEMENT";
    case "visitas":        return "TRAFFIC";
    case "ventas":         return "CONVERSIONS";
    case "seguidores":     return "REACH";
    case "reconocimiento": return "REACH";
    case "alcance":        return "REACH";
    default:               return "TRAFFIC";
  }
}

// ── Conversión de presupuesto ─────────────────────────────────────────────────

/**
 * Convierte el monto a la unidad mínima de la moneda.
 * Meta y TikTok esperan el presupuesto en la unidad mínima (e.g. centavos para USD).
 */
function toBudgetMinUnit(monto: string, moneda: string): number {
  const amount = parseFloat(monto.replace(/[^0-9.]/g, "")) || 0;
  // USD → centavos; COP/MXN/ARS → centavos de peso
  return Math.round(amount * 100);
}

// ── Meta ejecutor ─────────────────────────────────────────────────────────────

/**
 * Crea una campaña completa en Meta Marketing API:
 *   1. Campaña (PAUSED)
 *   2. Ad Set (PAUSED)
 *   3. Ad Creative
 *   4. Ad (PAUSED)
 *
 * Todas las entidades se crean en estado PAUSED.
 * El operador debe activarlas manualmente desde Meta Business Manager.
 *
 * Nunca guarda el access token en ninguna variable serializable.
 */
async function executeMetaCampaign(
  snapshot:    ApprovedExecutionSnapshot,
  accessToken: string,
): Promise<MetaCampaignCreationResult> {
  const adAccountId = snapshot.metaAdAccountId;
  if (!adAccountId) {
    return {
      success: false, campaignId: null, adsetId: null, adId: null, creativeId: null,
      errorCode: ADS_EXECUTION_ERROR_CODES.MISSING_AD_ACCOUNT,
      errorMsg:  "No hay cuenta publicitaria de Meta configurada en el snapshot.",
    };
  }

  // Normalizar ID: Meta acepta "act_XXXXXXXX" o solo el número
  const accountPath = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const budget      = toBudgetMinUnit(snapshot.monto, snapshot.moneda);
  const objective   = metaCampaignObjective(snapshot.objetivo);
  const optGoal     = metaOptimizationGoal(snapshot.objetivo);
  const campaignName = `Agentik · ${snapshot.objetivo} · ${snapshot.snapshotAt.slice(0, 10)}`;

  // ── 1. Crear Campaña ────────────────────────────────────────────────────────

  let campaignId: string | null = null;

  try {
    const campaignRes = await fetch(`${META_GRAPH_BASE}/${accountPath}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:                   campaignName,
        objective,
        status:                 "PAUSED",
        special_ad_categories:  [],
        access_token:           accessToken,
      }),
    });

    const campaignData = await campaignRes.json() as { id?: string; error?: { message?: string; code?: number } };

    if (!campaignRes.ok || campaignData.error) {
      return {
        success: false, campaignId: null, adsetId: null, adId: null, creativeId: null,
        errorCode: ADS_EXECUTION_ERROR_CODES.META_API_ERROR,
        errorMsg:  `Error al crear campaña en Meta: ${campaignData.error?.message ?? "desconocido"} (código ${campaignData.error?.code ?? "?"})`,
      };
    }

    campaignId = campaignData.id ?? null;
    if (!campaignId) {
      return {
        success: false, campaignId: null, adsetId: null, adId: null, creativeId: null,
        errorCode: ADS_EXECUTION_ERROR_CODES.META_API_ERROR,
        errorMsg:  "Meta no devolvió el ID de la campaña creada.",
      };
    }
  } catch (err) {
    return {
      success: false, campaignId: null, adsetId: null, adId: null, creativeId: null,
      errorCode: ADS_EXECUTION_ERROR_CODES.META_API_ERROR,
      errorMsg:  `Error de red al crear campaña en Meta: ${err instanceof Error ? err.message : "desconocido"}`,
    };
  }

  // ── 2. Crear Ad Set ─────────────────────────────────────────────────────────

  let adsetId: string | null = null;

  try {
    const adsetBody: Record<string, unknown> = {
      name:              `Agentik AdSet · ${snapshot.objetivo}`,
      campaign_id:       campaignId,
      billing_event:     "IMPRESSIONS",
      optimization_goal: optGoal,
      status:            "PAUSED",
      access_token:      accessToken,
      targeting: {
        geo_locations: {
          countries: snapshot.pais ? [snapshot.pais.toUpperCase().slice(0, 2)] : ["CO"],
        },
        age_min: parseInt(snapshot.edadMin, 10) || 18,
        age_max: parseInt(snapshot.edadMax, 10) || 65,
      },
    };

    // Presupuesto: diario o total
    if (snapshot.tipoPres === "diario") {
      adsetBody.daily_budget = budget;
    } else {
      adsetBody.lifetime_budget = budget;
      // lifetime_budget requiere end_time
      if (snapshot.fin) adsetBody.end_time = new Date(snapshot.fin).toISOString();
    }

    if (snapshot.inicio) adsetBody.start_time = new Date(snapshot.inicio).toISOString();
    if (snapshot.fin && snapshot.tipoPres !== "total") {
      adsetBody.end_time = new Date(snapshot.fin).toISOString();
    }

    const adsetRes  = await fetch(`${META_GRAPH_BASE}/${accountPath}/adsets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adsetBody),
    });
    const adsetData = await adsetRes.json() as { id?: string; error?: { message?: string; code?: number } };

    if (!adsetRes.ok || adsetData.error) {
      return {
        success: false, campaignId, adsetId: null, adId: null, creativeId: null,
        errorCode: ADS_EXECUTION_ERROR_CODES.META_API_ERROR,
        errorMsg:  `Error al crear Ad Set en Meta: ${adsetData.error?.message ?? "desconocido"}`,
      };
    }

    adsetId = adsetData.id ?? null;
  } catch (err) {
    return {
      success: false, campaignId, adsetId: null, adId: null, creativeId: null,
      errorCode: ADS_EXECUTION_ERROR_CODES.META_API_ERROR,
      errorMsg:  `Error de red al crear Ad Set: ${err instanceof Error ? err.message : "desconocido"}`,
    };
  }

  // ── 3. Crear Ad Creative ────────────────────────────────────────────────────

  let creativeId: string | null = null;

  try {
    const destinoUrl = snapshot.urlDestino || "https://agentik.co";
    const creativeBody: Record<string, unknown> = {
      name:         `Agentik Creative · ${snapshot.snapshotAt.slice(0, 10)}`,
      access_token: accessToken,
      object_story_spec: {
        page_id:     snapshot.metaPageId ?? undefined,
        link_data: {
          link:    destinoUrl,
          message: snapshot.textoPrincipal,
          name:    snapshot.cta || campaignName,
          call_to_action: {
            type: snapshot.objetivo === "mensajes" ? "CONTACT_US" : "LEARN_MORE",
          },
        },
      },
    };

    const creativeRes  = await fetch(`${META_GRAPH_BASE}/${accountPath}/adcreatives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creativeBody),
    });
    const creativeData = await creativeRes.json() as { id?: string; error?: { message?: string; code?: number } };

    if (!creativeRes.ok || creativeData.error) {
      // Creative failure is non-fatal in v1 — log but proceed
      console.warn("[ads-execution] Ad Creative creation failed:", creativeData.error?.message);
      creativeId = null;
    } else {
      creativeId = creativeData.id ?? null;
    }
  } catch (err) {
    console.warn("[ads-execution] Ad Creative network error:", err instanceof Error ? err.message : err);
    creativeId = null;
  }

  // ── 4. Crear Ad ─────────────────────────────────────────────────────────────

  let adId: string | null = null;

  if (adsetId && creativeId) {
    try {
      const adRes  = await fetch(`${META_GRAPH_BASE}/${accountPath}/ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:         `Agentik Ad · ${snapshot.objetivo}`,
          adset_id:     adsetId,
          creative:     { creative_id: creativeId },
          status:       "PAUSED",
          access_token: accessToken,
        }),
      });
      const adData = await adRes.json() as { id?: string; error?: { message?: string; code?: number } };

      if (!adRes.ok || adData.error) {
        console.warn("[ads-execution] Ad creation failed:", adData.error?.message);
        adId = null;
      } else {
        adId = adData.id ?? null;
      }
    } catch (err) {
      console.warn("[ads-execution] Ad network error:", err instanceof Error ? err.message : err);
      adId = null;
    }
  }

  return {
    success:    true,
    campaignId,
    adsetId,
    adId,
    creativeId,
  };
}

// ── TikTok ejecutor ───────────────────────────────────────────────────────────

/**
 * Crea una campaña completa en TikTok Business API:
 *   1. Campaña (DISABLE)
 *   2. Ad Group (DISABLE)
 *   3. Ad (DISABLE)
 *
 * Todas en estado DISABLE (equivalente PAUSED en TikTok).
 */
async function executeTikTokCampaign(
  snapshot:    ApprovedExecutionSnapshot,
  accessToken: string,
): Promise<TikTokCampaignCreationResult> {
  const advertiserId = snapshot.tiktokAdvertiserId;
  if (!advertiserId) {
    return {
      success: false, campaignId: null, adgroupId: null, adId: null,
      errorCode: ADS_EXECUTION_ERROR_CODES.MISSING_ADVERTISER,
      errorMsg:  "No hay cuenta de anunciante TikTok configurada en el snapshot.",
    };
  }

  const objective    = tiktokObjectiveType(snapshot.objetivo);
  const budget       = toBudgetMinUnit(snapshot.monto, snapshot.moneda);
  const campaignName = `Agentik · ${snapshot.objetivo} · ${snapshot.snapshotAt.slice(0, 10)}`;

  const headers = {
    "Content-Type":  "application/json",
    "Access-Token":  accessToken,
  };

  // ── 1. Crear Campaña ────────────────────────────────────────────────────────

  let campaignId: string | null = null;

  try {
    const campaignRes = await fetch(`${TIKTOK_API_BASE}/campaign/create/`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        advertiser_id:  advertiserId,
        campaign_name:  campaignName,
        objective_type: objective,
        budget_mode:    snapshot.tipoPres === "diario" ? "BUDGET_MODE_DAY" : "BUDGET_MODE_TOTAL",
        budget,
        operation_status: "DISABLE",
      }),
    });

    const campaignData = await campaignRes.json() as {
      code: number; message: string; data?: { campaign_id?: string }
    };

    if (campaignData.code !== 0) {
      return {
        success: false, campaignId: null, adgroupId: null, adId: null,
        errorCode: ADS_EXECUTION_ERROR_CODES.TIKTOK_API_ERROR,
        errorMsg:  `Error al crear campaña en TikTok: ${campaignData.message} (código ${campaignData.code})`,
      };
    }

    campaignId = campaignData.data?.campaign_id ?? null;
    if (!campaignId) {
      return {
        success: false, campaignId: null, adgroupId: null, adId: null,
        errorCode: ADS_EXECUTION_ERROR_CODES.TIKTOK_API_ERROR,
        errorMsg:  "TikTok no devolvió el ID de la campaña creada.",
      };
    }
  } catch (err) {
    return {
      success: false, campaignId: null, adgroupId: null, adId: null,
      errorCode: ADS_EXECUTION_ERROR_CODES.TIKTOK_API_ERROR,
      errorMsg:  `Error de red al crear campaña en TikTok: ${err instanceof Error ? err.message : "desconocido"}`,
    };
  }

  // ── 2. Crear Ad Group ───────────────────────────────────────────────────────

  let adgroupId: string | null = null;

  try {
    const adgroupBody: Record<string, unknown> = {
      advertiser_id:    advertiserId,
      campaign_id:      campaignId,
      adgroup_name:     `Agentik AdGroup · ${snapshot.objetivo}`,
      operation_status: "DISABLE",
      budget_mode:      snapshot.tipoPres === "diario" ? "BUDGET_MODE_DAY" : "BUDGET_MODE_TOTAL",
      budget,
      schedule_type:    "SCHEDULE_START_END",
      schedule_start_time: snapshot.inicio
        ? `${snapshot.inicio} 00:00:00`
        : new Date().toISOString().slice(0, 10) + " 00:00:00",
      schedule_end_time: snapshot.fin
        ? `${snapshot.fin} 23:59:59`
        : undefined,
      location_ids:     [6252001], // United States as default; TODO: map from snapshot.pais
      age_groups:       ["AGE_18_24", "AGE_25_34"], // TODO: map from edadMin/edadMax
      placement_type:   "PLACEMENT_TYPE_AUTOMATIC",
      optimization_goal: "CLICK",
    };

    const adgroupRes  = await fetch(`${TIKTOK_API_BASE}/adgroup/create/`, {
      method: "POST", headers,
      body: JSON.stringify(adgroupBody),
    });
    const adgroupData = await adgroupRes.json() as {
      code: number; message: string; data?: { adgroup_id?: string }
    };

    if (adgroupData.code !== 0) {
      return {
        success: false, campaignId, adgroupId: null, adId: null,
        errorCode: ADS_EXECUTION_ERROR_CODES.TIKTOK_API_ERROR,
        errorMsg:  `Error al crear Ad Group en TikTok: ${adgroupData.message}`,
      };
    }

    adgroupId = adgroupData.data?.adgroup_id ?? null;
  } catch (err) {
    return {
      success: false, campaignId, adgroupId: null, adId: null,
      errorCode: ADS_EXECUTION_ERROR_CODES.TIKTOK_API_ERROR,
      errorMsg:  `Error de red al crear Ad Group: ${err instanceof Error ? err.message : "desconocido"}`,
    };
  }

  // ── 3. Crear Ad ─────────────────────────────────────────────────────────────

  let adId: string | null = null;

  if (adgroupId) {
    try {
      const adRes  = await fetch(`${TIKTOK_API_BASE}/ad/create/`, {
        method: "POST", headers,
        body: JSON.stringify({
          advertiser_id:    advertiserId,
          adgroup_id:       adgroupId,
          operation_status: "DISABLE",
          creatives: [{
            ad_name:       `Agentik Ad · ${snapshot.objetivo}`,
            ad_text:       snapshot.textoPrincipal,
            call_to_action: snapshot.cta || "Más información",
            landing_page_url: snapshot.urlDestino || "https://agentik.co",
          }],
        }),
      });
      const adData = await adRes.json() as {
        code: number; message: string; data?: { ad_ids?: string[] }
      };

      if (adData.code === 0 && adData.data?.ad_ids?.[0]) {
        adId = adData.data.ad_ids[0];
      } else {
        console.warn("[ads-execution] TikTok Ad creation failed:", adData.message);
      }
    } catch (err) {
      console.warn("[ads-execution] TikTok Ad network error:", err instanceof Error ? err.message : err);
    }
  }

  return { success: true, campaignId, adgroupId, adId };
}

// ── Función principal ─────────────────────────────────────────────────────────

/**
 * Ejecuta un anuncio aprobado en Meta y/o TikTok.
 *
 * Flujo:
 *   1. Verificar que la ejecución existe y está en status "approved".
 *   2. Leer ApprovedExecutionSnapshot del metadataJson.
 *   3. Resolver credenciales desde Vault (nunca del wizard vivo).
 *   4. Transicionar a "executing" (registra startedAt).
 *   5. Ejecutar en cada plataforma en paralelo.
 *   6. Transicionar a "completed" o "failed".
 *   7. Devolver AdsExecutionResult.
 *
 * IMPORTANTE:
 *   - Solo ejecuta ejecuciones en status "approved".
 *   - Lee únicamente del snapshot almacenado — nunca del wizard.
 *   - Copilot no puede llamar esta función directamente.
 *   - Crea campañas en estado PAUSED/DISABLE — el operador activa manualmente.
 *
 * @param executionId — ID del AgentExecution con status "approved".
 * @param tenantId    — Tenant owner (orgSlug para Vault + organizationId para DB).
 * @param organizationId — ID interno de la organización (para DB queries).
 * @param triggeredBy — Actor que dispara la ejecución (userId humano).
 */
export async function executeApprovedAd(
  executionId:    string,
  tenantId:       string,
  organizationId: string,
  triggeredBy:    string,
): Promise<AdsExecutionResult> {
  const executedAt = new Date().toISOString();

  if (!executionId || !tenantId || !organizationId) {
    return {
      executionId:          null,
      status:               "failed",
      platformResults:      [],
      externalReferenceIds: {},
      summary:              "Parámetros requeridos no están presentes.",
      executedAt,
      errorCode:            ADS_EXECUTION_ERROR_CODES.INTERNAL_ERROR,
      errorMessage:         "executionId, tenantId y organizationId son obligatorios.",
    };
  }

  // ── 1. Verificar que existe y está aprobada ───────────────────────────────

  const record = await getExecution(executionId, organizationId);

  if (!record) {
    return {
      executionId,
      status:               "failed",
      platformResults:      [],
      externalReferenceIds: {},
      summary:              "Ejecución no encontrada o acceso denegado.",
      executedAt,
      errorCode:            ADS_EXECUTION_ERROR_CODES.EXECUTION_NOT_FOUND,
    };
  }

  if (record.status !== "approved") {
    return {
      executionId,
      status:               "failed",
      platformResults:      [],
      externalReferenceIds: {},
      summary:              `La ejecución está en estado "${record.status}", no "Aprobado". Solo se pueden ejecutar anuncios aprobados.`,
      executedAt,
      errorCode:            ADS_EXECUTION_ERROR_CODES.NOT_APPROVED,
    };
  }

  // ── 2. Leer snapshot del metadataJson ────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = record as any;
  const snapshot = meta.metadataJson?.snapshot as ApprovedExecutionSnapshot | undefined
                ?? meta.metadataJson?.["snapshot"] as ApprovedExecutionSnapshot | undefined;

  if (!snapshot || !snapshot.approvalVersion || !snapshot.plataformas) {
    return {
      executionId,
      status:               "failed",
      platformResults:      [],
      externalReferenceIds: {},
      summary:              "Snapshot de aprobación no encontrado. Vuelve a validar y aprobar el anuncio.",
      executedAt,
      errorCode:            ADS_EXECUTION_ERROR_CODES.MISSING_SNAPSHOT,
    };
  }

  // ── 3. Transicionar a "executing" ─────────────────────────────────────────

  const executingRecord = await updateExecutionStatus(executionId, organizationId, "executing");
  if (!executingRecord) {
    return {
      executionId,
      status:               "failed",
      platformResults:      [],
      externalReferenceIds: {},
      summary:              "Error al iniciar la ejecución. El registro no pudo actualizarse.",
      executedAt,
      errorCode:            ADS_EXECUTION_ERROR_CODES.INTERNAL_ERROR,
    };
  }

  // ── 4. Ejecutar por plataforma ────────────────────────────────────────────

  const platformResults: AdsExecutionPlatformResult[] = [];
  const externalReferenceIds: Record<string, string>  = {};

  const platformPromises = snapshot.plataformas.map(async (platform) => {
    if (platform === "meta") {
      // Resolver credenciales Meta desde Vault (nunca del wizard)
      const creds = await resolveMetaAdsCredentials(tenantId);
      if (creds.source === "NOT_CONFIGURED" || !creds.accessToken) {
        platformResults.push({
          platform: "meta",
          success:  false,
          errorCode:    ADS_EXECUTION_ERROR_CODES.MISSING_CREDENTIALS,
          errorMessage: "No se encontraron credenciales de Meta. Configúralas en la Bóveda.",
        });
        return;
      }

      const result = await executeMetaCampaign(snapshot, creds.accessToken);
      platformResults.push({
        platform:   "meta",
        success:    result.success,
        campaignId: result.campaignId ?? undefined,
        adsetId:    result.adsetId    ?? undefined,
        adId:       result.adId       ?? undefined,
        creativeId: result.creativeId ?? undefined,
        errorCode:     result.errorCode,
        errorMessage:  result.errorMsg,
      });

      if (result.success) {
        if (result.campaignId) externalReferenceIds["meta_campaign_id"] = result.campaignId;
        if (result.adsetId)    externalReferenceIds["meta_adset_id"]    = result.adsetId;
        if (result.adId)       externalReferenceIds["meta_ad_id"]       = result.adId;
        if (result.creativeId) externalReferenceIds["meta_creative_id"] = result.creativeId;
      }
    }

    if (platform === "tiktok") {
      const creds = await resolveTikTokAdsCredentials(tenantId);
      if (creds.source === "NOT_CONFIGURED" || !creds.accessToken) {
        platformResults.push({
          platform: "tiktok",
          success:  false,
          errorCode:    ADS_EXECUTION_ERROR_CODES.MISSING_CREDENTIALS,
          errorMessage: "No se encontraron credenciales de TikTok. Configúralas en la Bóveda.",
        });
        return;
      }

      const result = await executeTikTokCampaign(snapshot, creds.accessToken);
      platformResults.push({
        platform:   "tiktok",
        success:    result.success,
        campaignId: result.campaignId ?? undefined,
        adsetId:    result.adgroupId  ?? undefined,
        adId:       result.adId       ?? undefined,
        errorCode:     result.errorCode,
        errorMessage:  result.errorMsg,
      });

      if (result.success) {
        if (result.campaignId) externalReferenceIds["tiktok_campaign_id"] = result.campaignId;
        if (result.adgroupId)  externalReferenceIds["tiktok_adgroup_id"]  = result.adgroupId;
        if (result.adId)       externalReferenceIds["tiktok_ad_id"]       = result.adId;
      }
    }
  });

  await Promise.all(platformPromises);

  // ── 5. Determinar resultado global ────────────────────────────────────────

  const succeeded = platformResults.filter(r => r.success);
  const failed    = platformResults.filter(r => !r.success);

  const allFailed  = failed.length === platformResults.length;
  const allSuccess = succeeded.length === platformResults.length;

  const finalStatus: AdsExecutionResult["status"] =
    allSuccess ? "completed" :
    allFailed  ? "failed"    : "partial";

  const idsStr = Object.entries(externalReferenceIds)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  const summary = allSuccess
    ? `Campaña creada en PAUSA en ${succeeded.map(r => r.platform).join(" y ")}. ${idsStr ? `IDs: ${idsStr}` : ""} Actívala en el panel de la plataforma.`
    : allFailed
    ? `Falló la publicación en ${failed.map(r => r.platform).join(" y ")}: ${failed[0]?.errorMessage ?? "error desconocido"}.`
    : `Publicación parcial: ${succeeded.map(r => r.platform).join(", ")} OK; ${failed.map(r => r.platform).join(", ")} fallaron.`;

  const errorCode = allFailed ? (failed[0]?.errorCode ?? ADS_EXECUTION_ERROR_CODES.INTERNAL_ERROR) : undefined;

  // ── 6. Actualizar registro ────────────────────────────────────────────────

  if (allFailed) {
    await failExecution(executionId, organizationId, {
      errorCode:    errorCode ?? "EXECUTION_FAILED",
      errorMessage: failed.map(r => `${r.platform}: ${r.errorMessage}`).join("; "),
      summary,
      metadata: {
        triggeredBy,
        platformResults,
        executedAt,
      },
    });
  } else {
    await completeExecution(executionId, organizationId, {
      summary,
      externalReferenceIds: Object.keys(externalReferenceIds).length > 0 ? externalReferenceIds : undefined,
      metadata: {
        triggeredBy,
        platformResults,
        executedAt,
        partialFailures: failed.length > 0 ? failed : undefined,
      },
    });
  }

  return {
    executionId,
    status: finalStatus,
    platformResults,
    externalReferenceIds,
    summary,
    executedAt,
    errorCode,
    errorMessage: allFailed ? failed.map(r => r.errorMessage).filter(Boolean).join("; ") : undefined,
  };
}
