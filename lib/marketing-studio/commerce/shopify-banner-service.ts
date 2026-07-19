/**
 * lib/marketing-studio/commerce/shopify-banner-service.ts
 *
 * SHOPIFY-BANNERS-PRODUCTION-01 — Banner Management Service
 *
 * SERVER ONLY — never import from client components.
 *
 * Manages store-location banners: create, update, approve, publish,
 * schedule, pause, archive, history.
 *
 * RULES:
 *   - Assets must be approved in Biblioteca.
 *   - Nothing publishes automatically.
 *   - Collection/category placements require targetId.
 *   - Replacing an active banner records history.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { BANNER_PLACEMENT_LABEL } from "./shopify-experiences-types";
import type { BannerPlacement } from "./shopify-experiences-types";
import type {
  ShopifyBannerDraft,
  ShopifyBannerStatus,
  ShopifyBannerSlot,
  ShopifyBannerAsset,
  ShopifyBannerHistoryEntry,
  ShopifyBannerSchedule,
  CreateBannerDraftInput,
  UpdateBannerDraftInput,
  BannerHistoryAction,
  BannerSofiaHint,
} from "./shopify-banner-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb = () => (prisma as any).agentExecution;

const MODULE     = "marketing_studio";
const BANNER_OP  = "SHOPIFY_BANNER_DRAFT";
const HISTORY_OP = "SHOPIFY_BANNER_HISTORY";

const ALL_PLACEMENTS: BannerPlacement[] = [
  "home", "home_secundario", "coleccion", "categoria",
  "promocion", "temporada", "footer",
];

// ── Persistence helpers ──────────────────────────────────────────────────────

function draftFromRow(row: Record<string, unknown>): ShopifyBannerDraft {
  const m = ((row.metadataJson ?? {}) as Record<string, unknown>);
  return {
    id:            row.id as string,
    tenantId:      row.tenantId as string,
    placement:     (m.placement as BannerPlacement) ?? "home",
    targetId:      (m.targetId as string | null) ?? null,
    targetName:    (m.targetName as string | null) ?? null,
    status:        (row.status as ShopifyBannerStatus) ?? "borrador",
    asset:         (m.asset as ShopifyBannerAsset | null) ?? null,
    titulo:        (m.titulo as string | null) ?? null,
    subtitulo:     (m.subtitulo as string | null) ?? null,
    ctaTexto:      (m.ctaTexto as string | null) ?? null,
    ctaUrl:        (m.ctaUrl as string | null) ?? null,
    inicioAt:      (m.inicioAt as string | null) ?? null,
    finAt:         (m.finAt as string | null) ?? null,
    creadoPor:     (row.createdBy as string) ?? "sistema",
    creadoAt:      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ""),
    actualizadoAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt ?? ""),
    version:       (m.version as number) ?? 1,
  };
}

function historyFromRow(row: Record<string, unknown>): ShopifyBannerHistoryEntry {
  const m = ((row.metadataJson ?? {}) as Record<string, unknown>);
  return {
    id:          row.id as string,
    bannerId:    (m.bannerId as string) ?? "",
    action:      (m.action as BannerHistoryAction) ?? "created",
    placement:   (m.placement as BannerPlacement) ?? "home",
    ubicacion:   BANNER_PLACEMENT_LABEL[(m.placement as BannerPlacement) ?? "home"] ?? "",
    assetNombre: (m.assetNombre as string | null) ?? null,
    assetId:     (m.assetId as string | null) ?? null,
    usuario:     (row.createdBy as string) ?? "sistema",
    fecha:       row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ""),
    resultado:   (m.resultado as "ok" | "error") ?? "ok",
    error:       (m.error as string | null) ?? null,
    version:     (m.version as number) ?? 1,
  };
}

async function recordHistory(
  tenantId:  string,
  bannerId:  string,
  action:    BannerHistoryAction,
  draft:     ShopifyBannerDraft,
  userId:    string,
  resultado: "ok" | "error" = "ok",
  error:     string | null = null,
): Promise<void> {
  await execDb().create({
    data: {
      tenantId,
      module:    MODULE,
      operation: HISTORY_OP,
      action:    `banner_${action}`,
      status:    resultado,
      createdBy: userId,
      metadataJson: {
        bannerId,
        action,
        placement:   draft.placement,
        assetNombre: draft.asset?.nombre ?? null,
        assetId:     draft.asset?.assetId ?? null,
        resultado,
        error,
        version:     draft.version,
      },
    },
  });
}

// ── Validation ────────────────────────────────────────────────────────────────

function validatePlacement(placement: string): placement is BannerPlacement {
  return ALL_PLACEMENTS.includes(placement as BannerPlacement);
}

function requiresTargetId(placement: BannerPlacement): boolean {
  return placement === "coleccion" || placement === "categoria";
}

function validateAssetApproved(asset: ShopifyBannerAsset): string | null {
  if (!asset.assetId) return "El asset no tiene ID.";
  if (!asset.aprobadoAt) return "El asset no esta aprobado en Biblioteca.";
  return null;
}

// ── List banner slots ────────────────────────────────────────────────────────

export async function listBannerSlots(tenantId: string): Promise<ShopifyBannerSlot[]> {
  const allDrafts = await execDb().findMany({
    where: {
      tenantId,
      module:    MODULE,
      operation: BANNER_OP,
      status:    { notIn: ["archivado"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drafts: ShopifyBannerDraft[] = allDrafts.map((r: any) => draftFromRow(r));

  return ALL_PLACEMENTS.map(placement => {
    const slotDrafts = drafts.filter(d => d.placement === placement);
    const active = slotDrafts.find(d => d.status === "publicado") ?? null;
    const draft = slotDrafts.find(d =>
      d.status === "borrador" || d.status === "en_revision" || d.status === "aprobado" || d.status === "programado",
    ) ?? null;

    return {
      placement,
      ubicacion:       BANNER_PLACEMENT_LABEL[placement],
      activeBanner:    active,
      draftBanner:     draft,
      draftCount:      slotDrafts.filter(d => d.status !== "publicado" && d.status !== "pausado").length,
      lastPublishedAt: active?.actualizadoAt ?? null,
    };
  });
}

// ── Get single slot ──────────────────────────────────────────────────────────

export async function getBannerSlot(
  tenantId:  string,
  placement: BannerPlacement,
): Promise<ShopifyBannerSlot | null> {
  const slots = await listBannerSlots(tenantId);
  return slots.find(s => s.placement === placement) ?? null;
}

// ── Get current banner for a placement ───────────────────────────────────────

export async function getCurrentBanner(
  tenantId:  string,
  placement: BannerPlacement,
): Promise<ShopifyBannerDraft | null> {
  const row = await execDb().findFirst({
    where: {
      tenantId,
      module:    MODULE,
      operation: BANNER_OP,
      status:    "publicado",
      metadataJson: { path: ["placement"], equals: placement },
    },
    orderBy: { updatedAt: "desc" },
  });
  return row ? draftFromRow(row) : null;
}

// ── Create banner draft ──────────────────────────────────────────────────────

export async function createBannerDraft(
  tenantId: string,
  input:    CreateBannerDraftInput,
  userId:   string,
): Promise<{ ok: boolean; draft?: ShopifyBannerDraft; error?: string }> {
  if (!validatePlacement(input.placement)) {
    return { ok: false, error: `Ubicacion invalida: ${input.placement}` };
  }

  if (requiresTargetId(input.placement) && !input.targetId) {
    return { ok: false, error: `${BANNER_PLACEMENT_LABEL[input.placement]} requiere un targetId (coleccion o categoria).` };
  }

  const assetError = validateAssetApproved(input.asset);
  if (assetError) return { ok: false, error: assetError };

  const row = await execDb().create({
    data: {
      tenantId,
      module:    MODULE,
      operation: BANNER_OP,
      action:    "banner_created",
      status:    "borrador",
      createdBy: userId,
      metadataJson: {
        placement:   input.placement,
        targetId:    input.targetId ?? null,
        targetName:  input.targetName ?? null,
        asset:       input.asset,
        titulo:      input.titulo ?? null,
        subtitulo:   input.subtitulo ?? null,
        ctaTexto:    input.ctaTexto ?? null,
        ctaUrl:      input.ctaUrl ?? null,
        inicioAt:    input.inicioAt ?? null,
        finAt:       input.finAt ?? null,
        version:     1,
      },
    },
  });

  const draft = draftFromRow(row);
  await recordHistory(tenantId, draft.id, "created", draft, userId);

  return { ok: true, draft };
}

// ── Update banner draft ──────────────────────────────────────────────────────

export async function updateBannerDraft(
  tenantId: string,
  draftId:  string,
  input:    UpdateBannerDraftInput,
  userId:   string,
): Promise<{ ok: boolean; draft?: ShopifyBannerDraft; error?: string }> {
  const row = await execDb().findFirst({
    where: { id: draftId, tenantId, module: MODULE, operation: BANNER_OP },
  });
  if (!row) return { ok: false, error: "Borrador no encontrado." };

  const existing = draftFromRow(row);
  if (existing.status !== "borrador" && existing.status !== "en_revision") {
    return { ok: false, error: `No se puede editar un banner en estado ${existing.status}.` };
  }

  if (input.asset) {
    const assetError = validateAssetApproved(input.asset);
    if (assetError) return { ok: false, error: assetError };
  }

  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  const updatedMeta = {
    ...meta,
    ...(input.asset !== undefined && { asset: input.asset }),
    ...(input.titulo !== undefined && { titulo: input.titulo }),
    ...(input.subtitulo !== undefined && { subtitulo: input.subtitulo }),
    ...(input.ctaTexto !== undefined && { ctaTexto: input.ctaTexto }),
    ...(input.ctaUrl !== undefined && { ctaUrl: input.ctaUrl }),
    ...(input.inicioAt !== undefined && { inicioAt: input.inicioAt }),
    ...(input.finAt !== undefined && { finAt: input.finAt }),
    version: (existing.version ?? 1) + 1,
  };

  const updated = await execDb().update({
    where: { id: draftId },
    data: { metadataJson: updatedMeta },
  });

  const draft = draftFromRow(updated);
  await recordHistory(tenantId, draftId, "updated", draft, userId);

  return { ok: true, draft };
}

// ── Status transitions ───────────────────────────────────────────────────────

async function transitionStatus(
  tenantId: string,
  draftId:  string,
  newStatus: ShopifyBannerStatus,
  action:   BannerHistoryAction,
  userId:   string,
  allowedFrom: ShopifyBannerStatus[],
): Promise<{ ok: boolean; draft?: ShopifyBannerDraft; error?: string }> {
  const row = await execDb().findFirst({
    where: { id: draftId, tenantId, module: MODULE, operation: BANNER_OP },
  });
  if (!row) return { ok: false, error: "Banner no encontrado." };

  const existing = draftFromRow(row);
  if (!allowedFrom.includes(existing.status)) {
    return { ok: false, error: `No se puede ${action} desde estado ${existing.status}.` };
  }

  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  const updated = await execDb().update({
    where: { id: draftId },
    data: {
      status: newStatus,
      metadataJson: { ...meta, version: (existing.version ?? 1) + 1 },
    },
  });

  const draft = draftFromRow(updated);
  await recordHistory(tenantId, draftId, action, draft, userId);

  return { ok: true, draft };
}

export async function submitForReview(
  tenantId: string, draftId: string, userId: string,
): Promise<{ ok: boolean; draft?: ShopifyBannerDraft; error?: string }> {
  return transitionStatus(tenantId, draftId, "en_revision", "submitted_review", userId, ["borrador"]);
}

export async function approveBannerDraft(
  tenantId: string, draftId: string, userId: string,
): Promise<{ ok: boolean; draft?: ShopifyBannerDraft; error?: string }> {
  return transitionStatus(tenantId, draftId, "aprobado", "approved", userId, ["en_revision"]);
}

export async function rejectBannerDraft(
  tenantId: string, draftId: string, userId: string,
): Promise<{ ok: boolean; draft?: ShopifyBannerDraft; error?: string }> {
  return transitionStatus(tenantId, draftId, "borrador", "rejected", userId, ["en_revision"]);
}

export async function publishBanner(
  tenantId: string, draftId: string, userId: string,
): Promise<{ ok: boolean; draft?: ShopifyBannerDraft; error?: string }> {
  const row = await execDb().findFirst({
    where: { id: draftId, tenantId, module: MODULE, operation: BANNER_OP },
  });
  if (!row) return { ok: false, error: "Banner no encontrado." };

  const existing = draftFromRow(row);
  if (existing.status !== "aprobado" && existing.status !== "programado") {
    return { ok: false, error: "Solo se puede publicar un banner aprobado o programado." };
  }

  // Archive current active banner for this placement
  const activeBanners = await execDb().findMany({
    where: {
      tenantId,
      module:    MODULE,
      operation: BANNER_OP,
      status:    "publicado",
      metadataJson: { path: ["placement"], equals: existing.placement },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ab of activeBanners) {
    const abMeta = (ab.metadataJson ?? {}) as Record<string, unknown>;
    await execDb().update({
      where: { id: ab.id },
      data: {
        status: "archivado",
        metadataJson: { ...abMeta, version: ((abMeta.version as number) ?? 1) + 1 },
      },
    });
    await recordHistory(tenantId, ab.id, "replaced", draftFromRow(ab), userId);
  }

  // Publish the new banner
  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  const updated = await execDb().update({
    where: { id: draftId },
    data: {
      status: "publicado",
      metadataJson: { ...meta, version: (existing.version ?? 1) + 1 },
    },
  });

  const draft = draftFromRow(updated);
  await recordHistory(tenantId, draftId, "published", draft, userId);

  return { ok: true, draft };
}

export async function scheduleBanner(
  tenantId: string,
  draftId:  string,
  inicioAt: string,
  finAt:    string | null,
  userId:   string,
): Promise<{ ok: boolean; draft?: ShopifyBannerDraft; schedule?: ShopifyBannerSchedule; error?: string }> {
  const row = await execDb().findFirst({
    where: { id: draftId, tenantId, module: MODULE, operation: BANNER_OP },
  });
  if (!row) return { ok: false, error: "Banner no encontrado." };

  const existing = draftFromRow(row);
  if (existing.status !== "aprobado") {
    return { ok: false, error: "Solo se puede programar un banner aprobado." };
  }

  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  const updated = await execDb().update({
    where: { id: draftId },
    data: {
      status: "programado",
      metadataJson: {
        ...meta,
        inicioAt,
        finAt,
        version: (existing.version ?? 1) + 1,
      },
    },
  });

  const draft = draftFromRow(updated);
  await recordHistory(tenantId, draftId, "scheduled", draft, userId);

  const schedule: ShopifyBannerSchedule = {
    bannerId:    draftId,
    action:      "publish",
    scheduledAt: inicioAt,
    status:      "pending",
    executedAt:  null,
  };

  return { ok: true, draft, schedule };
}

export async function pauseBanner(
  tenantId: string, draftId: string, userId: string,
): Promise<{ ok: boolean; draft?: ShopifyBannerDraft; error?: string }> {
  return transitionStatus(tenantId, draftId, "pausado", "paused", userId, ["publicado", "programado"]);
}

export async function archiveBanner(
  tenantId: string, draftId: string, userId: string,
): Promise<{ ok: boolean; draft?: ShopifyBannerDraft; error?: string }> {
  return transitionStatus(tenantId, draftId, "archivado", "archived", userId,
    ["borrador", "en_revision", "aprobado", "programado", "pausado"],
  );
}

// ── History ──────────────────────────────────────────────────────────────────

export async function getBannerHistory(
  tenantId:  string,
  bannerId?: string,
  limit = 50,
): Promise<ShopifyBannerHistoryEntry[]> {
  const where: Record<string, unknown> = {
    tenantId,
    module:    MODULE,
    operation: HISTORY_OP,
  };

  if (bannerId) {
    where.metadataJson = { path: ["bannerId"], equals: bannerId };
  }

  const rows = await execDb().findMany({
    where,
    orderBy: { createdAt: "desc" },
    take:    limit,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => historyFromRow(r));
}

// ── Get single draft ─────────────────────────────────────────────────────────

export async function getBannerDraft(
  tenantId: string,
  draftId:  string,
): Promise<ShopifyBannerDraft | null> {
  const row = await execDb().findFirst({
    where: { id: draftId, tenantId, module: MODULE, operation: BANNER_OP },
  });
  return row ? draftFromRow(row) : null;
}

// ── Sofia hints (enhanced) ───────────────────────────────────────────────────

export function getBannerSofiaHints(
  draft: ShopifyBannerDraft | null,
  slot:  ShopifyBannerSlot,
): BannerSofiaHint[] {
  const all: BannerSofiaHint[] = [];

  if (!draft) {
    all.push({ message: `${slot.ubicacion} no tiene banner asignado. Selecciona un recurso aprobado de Biblioteca.`, type: "info" });
    return all.slice(0, 3);
  }

  if (!draft.asset) {
    all.push({ message: "Selecciona un asset aprobado de Biblioteca.", type: "warning" });
    return all.slice(0, 3);
  }

  if (!draft.asset.aprobadoAt) {
    all.push({ message: "El asset seleccionado no esta aprobado.", type: "error" });
  }

  // CTA validation
  if (!draft.ctaTexto && !draft.ctaUrl && draft.status === "borrador") {
    all.push({ message: "CTA vacio. Agrega un enlace para que el banner sea interactivo.", type: "info" });
  }

  if (draft.ctaUrl) {
    if (draft.ctaUrl.startsWith("javascript:") || draft.ctaUrl.startsWith("data:")) {
      all.push({ message: "URL del CTA no es segura. Usa una URL valida.", type: "error" });
    }
  }

  // Title length
  if (draft.titulo && draft.titulo.length > 60) {
    all.push({ message: "El titulo es largo. Considera acortarlo para mejor legibilidad.", type: "warning" });
  }

  // Scheduling
  if (draft.finAt && new Date(draft.finAt) < new Date()) {
    all.push({ message: "La fecha de fin ya paso. Puedes pausar o reprogramar.", type: "warning" });
  }

  // Status-specific
  switch (draft.status) {
    case "borrador":
      all.push({ message: "Este banner esta en borrador. Envíalo a revision cuando este listo.", type: "info" });
      break;
    case "en_revision":
      all.push({ message: "Este banner esta en revision. Apruebalo o rechazalo.", type: "info" });
      break;
    case "aprobado":
      if (slot.activeBanner) {
        all.push({ message: `Este banner reemplazara el banner actual de ${slot.ubicacion}.`, type: "warning" });
      }
      all.push({ message: "Este banner esta aprobado y listo para publicar.", type: "success" });
      break;
    case "programado":
      if (draft.inicioAt && new Date(draft.inicioAt) > new Date()) {
        all.push({ message: `Programado para publicar el ${new Date(draft.inicioAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}.`, type: "info" });
      }
      break;
    case "publicado":
      all.push({ message: "Este banner esta publicado y activo.", type: "success" });
      break;
    case "pausado":
      all.push({ message: "Este banner esta pausado. Puedes reactivarlo o archivarlo.", type: "warning" });
      break;
  }

  return all.slice(0, 3);
}

// ── CTA validation ───────────────────────────────────────────────────────────

const BLOCKED_PROTOCOLS = ["javascript:", "data:", "mailto:", "vbscript:"];
const ALLOWED_INTERNAL_PREFIXES = ["/collections/", "/products/", "/pages/", "/"];

export function validateCtaUrl(url: string): { valid: boolean; error?: string } {
  if (!url) return { valid: true };

  const lower = url.trim().toLowerCase();

  for (const proto of BLOCKED_PROTOCOLS) {
    if (lower.startsWith(proto)) {
      return { valid: false, error: `Protocolo no permitido: ${proto}` };
    }
  }

  if (url.startsWith("/")) {
    const isKnown = ALLOWED_INTERNAL_PREFIXES.some(p => url.startsWith(p));
    if (!isKnown) {
      return { valid: false, error: "Ruta interna no reconocida." };
    }
    return { valid: true };
  }

  if (url.startsWith("https://")) {
    return { valid: true };
  }

  if (url.startsWith("http://")) {
    return { valid: false, error: "Solo se permiten URLs con HTTPS." };
  }

  return { valid: false, error: "URL invalida. Usa una ruta interna (/) o URL con https://." };
}

// ── Usage metrics ────────────────────────────────────────────────────────────

export interface BannerUsageMetrics {
  timesPublished:    number;
  lastPublishedAt:   string | null;
  lastEditedAt:      string | null;
  lastEditedBy:      string | null;
  placement:         BannerPlacement;
  ubicacion:         string;
  associatedLanding: string | null;
  version:           number;
}

export async function getBannerUsageMetrics(
  tenantId: string,
  bannerId: string,
): Promise<BannerUsageMetrics | null> {
  const row = await execDb().findFirst({
    where: { id: bannerId, tenantId, module: MODULE, operation: BANNER_OP },
  });
  if (!row) return null;

  const draft = draftFromRow(row);

  // Count publish events from history
  const historyRows = await execDb().findMany({
    where: {
      tenantId,
      module:    MODULE,
      operation: HISTORY_OP,
      metadataJson: { path: ["bannerId"], equals: bannerId },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const publishEvents = historyRows.filter((r: any) => {
    const m = (r.metadataJson ?? {}) as Record<string, unknown>;
    return m.action === "published";
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastEdit = historyRows[0] as any | undefined;
  const lastEditMeta = lastEdit ? (lastEdit.metadataJson ?? {}) as Record<string, unknown> : null;

  return {
    timesPublished:    publishEvents.length,
    lastPublishedAt:   publishEvents.length > 0
      ? (publishEvents[0].createdAt instanceof Date ? publishEvents[0].createdAt.toISOString() : String(publishEvents[0].createdAt))
      : null,
    lastEditedAt:      draft.actualizadoAt,
    lastEditedBy:      lastEditMeta ? (lastEdit.createdBy as string) ?? null : null,
    placement:         draft.placement,
    ubicacion:         BANNER_PLACEMENT_LABEL[draft.placement],
    associatedLanding: null, // Future: link to published landing
    version:           draft.version,
  };
}
