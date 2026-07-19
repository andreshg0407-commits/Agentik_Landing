/**
 * lib/marketing-studio/publicaciones/publicaciones-service.ts
 *
 * MARKETING-PUBLICACIONES-01 — Centro Unificado de Publicaciones
 *
 * SERVER ONLY — nunca importar en client components.
 *
 * Reutiliza la infraestructura existente de publishing-repository.ts.
 * Transforma PublishingPlan → PublicacionItem con lenguaje empresarial LATAM.
 *
 * Principios:
 *   - Solo lectura. Nunca activa ni modifica publicaciones.
 *   - No expone tokens ni credenciales.
 *   - No duplica lógica del motor de publicación.
 */

import "server-only";

import {
  listPublishingPlans,
  getPublishingPlan,
} from "@/lib/marketing-studio/publishing/publishing-repository";
import type {
  PublishingPlan,
  PublishingPlanStep,
} from "@/lib/marketing-studio/publishing/publishing-types";
import type {
  PublicacionItem,
  PublicacionPaso,
  PublicacionEstado,
  PublicacionOrigen,
  PublicacionTipo,
  PublicacionesResumen,
  PublicacionesApiResponse,
} from "./publicaciones-types";

// ── Mapeo de estados internos → estados editoriales ───────────────────────────

function mapEstado(status: string): PublicacionEstado {
  switch (status) {
    case "draft":                           return "borrador";
    case "planned":   case "queued":
    case "scheduled": case "preparing":    return "programada";
    case "blocked":                         return "en_revision";
    case "publishing": case "retrying":    return "programada";
    case "published":                       return "publicada";
    case "partial":                         return "parcial";
    case "failed":                          return "error";
    case "cancelled": case "archived":     return "cancelada";
    default:                                return "borrador";
  }
}

function mapPrioridad(p: string): PublicacionItem["prioridad"] {
  switch (p) {
    case "critical": return "critica";
    case "high":     return "alta";
    case "low":      return "baja";
    default:         return "media";
  }
}

function mapOrigen(trigger: string): PublicacionOrigen {
  switch (trigger) {
    case "campaign":              return "campaña";
    case "catalog_updated":       return "catalogo";
    case "product_approved":      return "producto";
    case "distribution_pipeline":
    case "webhook":               return "automatico";
    default:                      return "manual";
  }
}

function deriveTitulo(plan: PublishingPlan): string {
  // Prefer payload title from the first step; fall back to semantic ID
  for (const step of plan.steps) {
    const title = (step.payload as Record<string, unknown>)?.["title"] as string | undefined;
    if (title) return title;
    const name = (step.payload as Record<string, unknown>)?.["name"] as string | undefined;
    if (name) return name;
  }
  if (plan.campaignId) return `Campaña ${plan.campaignId.slice(-6)}`;
  if (plan.productId)  return `Producto ${plan.productId.slice(-6)}`;
  if (plan.catalogId)  return `Catálogo ${plan.catalogId.slice(-6)}`;
  return `Publicación ${plan.id.slice(-6)}`;
}

function mapPaso(step: PublishingPlanStep): PublicacionPaso {
  return {
    // ── Estado editorial ──
    id:           step.id,
    canal:        step.destination,
    estado:       mapEstado(step.status),
    error:        step.lastError,
    completadoEn: step.completedAt,
    programadoEn: step.scheduledAt,
    intentos:     step.retryCount,
    // ── Integración (internos — nunca mostrar al usuario) ──
    externalId:                  null, // PLACEHOLDER — populate from platform sync
    urlPublica:                  null, // PLACEHOLDER — populate from platform sync
    fechaEfectiva:               step.completedAt, // best approximation until real sync
    ultimaSincronizacion:        null, // PLACEHOLDER — populate from platform sync
    estadoSincronizacion:        "unknown",
    ultimaActualizacionMetricas: null, // PLACEHOLDER — populate from analytics sync
    // ── Métricas por canal ──
    metricas:                    null, // PLACEHOLDER — populate from analytics integration
  };
}

function deriveTipo(plan: PublishingPlan): PublicacionTipo | null {
  // Attempt to read tipo from payload; fall back to null (UI shows generic label)
  for (const step of plan.steps) {
    const tipo = (step.payload as Record<string, unknown>)?.["tipo"] as string | undefined;
    if (tipo === "reel" || tipo === "video" || tipo === "historia" || tipo === "carrusel") {
      return tipo as PublicacionTipo;
    }
    const format = (step.payload as Record<string, unknown>)?.["format"] as string | undefined;
    if (format === "reel" || format === "video" || format === "story") {
      return format === "story" ? "historia" : (format as PublicacionTipo);
    }
  }
  return null;
}

function deriveMiniatura(plan: PublishingPlan): string | null {
  for (const step of plan.steps) {
    const thumbnail = (step.payload as Record<string, unknown>)?.["thumbnailUrl"] as string | undefined;
    if (thumbnail) return thumbnail;
    const image = (step.payload as Record<string, unknown>)?.["imageUrl"] as string | undefined;
    if (image) return image;
  }
  return null;
}

function mapPlan(plan: PublishingPlan): PublicacionItem {
  const canales        = [...new Set(plan.steps.map(s => s.destination))];
  const tieneErrores   = plan.steps.some(s => s.status === "failed");
  const publicadaEn    =
    plan.status === "published" ? (plan.completedAt ?? plan.updatedAt) : null;

  return {
    // ── Capa 1: Información editorial ──
    id:              plan.id,
    titulo:          deriveTitulo(plan),
    descripcion:     null, // PLACEHOLDER — populate from content integration
    autor:           null, // PLACEHOLDER — populate from content integration
    tipo:            deriveTipo(plan),
    miniatura:       deriveMiniatura(plan),
    // ── Distribución ──
    canales,
    estado:          mapEstado(plan.status),
    prioridad:       mapPrioridad(plan.priority),
    origen:          mapOrigen(plan.trigger),
    programadaEn:    plan.scheduledAt,
    publicadaEn,
    actualizadaEn:   plan.updatedAt,
    progreso:        plan.progress,
    cantidadCanales: canales.length,
    tieneErrores,
    pasos:           plan.steps.map(mapPaso),
    // ── Métricas agregadas ──
    alcance:         null, // PLACEHOLDER — aggregate from paso.metricas when available
    reproducciones:  null, // PLACEHOLDER — aggregate from paso.metricas when available
    interacciones:   null, // PLACEHOLDER — aggregate from paso.metricas when available
    // ── Referencias internas ──
    campaignId:      plan.campaignId,
    productId:       plan.productId,
    catalogId:       plan.catalogId,
  };
}

// ── Resumen ────────────────────────────────────────────────────────────────────

function buildResumen(
  items: PublicacionItem[],
  syncedAt: string,
): PublicacionesResumen {
  const todayIso = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const publicadasHoy = items.filter(
    i => i.estado === "publicada" && i.publicadaEn?.startsWith(todayIso),
  ).length;

  const programadas     = items.filter(i => i.estado === "programada").length;
  const programadasHoy  = items.filter(
    i => i.estado === "programada" && i.programadaEn?.startsWith(todayIso),
  ).length;
  const publicadas      = items.filter(i => i.estado === "publicada").length;
  const borradores      = items.filter(i => i.estado === "borrador").length;
  const enRevision      = items.filter(i => i.estado === "en_revision").length;
  const conError        = items.filter(i => i.estado === "error" || i.tieneErrores).length;

  return {
    publicadasHoy,
    programadas,
    programadasHoy,
    publicadas,
    borradores,
    enRevision,
    conError,
    total:               items.length,
    ultimaSincronizacion: syncedAt,
  };
}

// ── Exports públicos ───────────────────────────────────────────────────────────

/**
 * Devuelve el resumen + listado completo de publicaciones para el tenant.
 * Reutiliza listPublishingPlans del motor de publicación existente.
 */
export async function getPublicacionesSummary(
  organizationId: string,
): Promise<PublicacionesApiResponse> {
  const plans      = await listPublishingPlans(organizationId);
  const syncedAt   = new Date().toISOString();
  const items      = plans.map(mapPlan);
  const resumen    = buildResumen(items, syncedAt);

  return { resumen, publicaciones: items, ultimaSincronizacion: syncedAt };
}

/**
 * Devuelve solo el listado de publicaciones.
 * Útil para paginación futura o filtros server-side.
 */
export async function getPublicacionesList(
  organizationId: string,
): Promise<PublicacionItem[]> {
  const plans = await listPublishingPlans(organizationId);
  return plans.map(mapPlan);
}

/**
 * Devuelve el detalle de una publicación por ID.
 * Incluye pasos por canal e historial de cambios.
 */
export async function getPublicacionDetail(
  planId:         string,
  organizationId: string,
): Promise<PublicacionItem | null> {
  const plan = await getPublishingPlan(planId, organizationId);
  if (!plan) return null;
  return mapPlan(plan);
}
