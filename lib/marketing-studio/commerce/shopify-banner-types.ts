/**
 * lib/marketing-studio/commerce/shopify-banner-types.ts
 *
 * SHOPIFY-BANNERS-PRODUCTION-01 — Banner Domain Types
 *
 * Types for store-location banners (NOT per-product).
 * Banners belong to placements: home, colección, categoría, etc.
 * Safe for RSC → client boundary (all plain JSON values).
 */

import type { BannerPlacement } from "./shopify-experiences-types";

// ── Banner status ─────────────────────────────────────────────────────────────

export type ShopifyBannerStatus =
  | "sin_banner"
  | "borrador"
  | "en_revision"
  | "aprobado"
  | "programado"
  | "publicado"
  | "pausado"
  | "archivado"
  | "error";

export const BANNER_STATUS_LABEL: Record<ShopifyBannerStatus, string> = {
  sin_banner:  "Sin banner",
  borrador:    "Borrador",
  en_revision: "En revisión",
  aprobado:    "Aprobado",
  programado:  "Programado",
  publicado:   "Publicado",
  pausado:     "Pausado",
  archivado:   "Archivado",
  error:       "Error",
};

export const BANNER_STATUS_COLOR: Record<ShopifyBannerStatus, string> = {
  sin_banner:  "#94a3b8",
  borrador:    "#64748b",
  en_revision: "#f59e0b",
  aprobado:    "#3b82f6",
  programado:  "#8b5cf6",
  publicado:   "#22c55e",
  pausado:     "#f97316",
  archivado:   "#94a3b8",
  error:       "#ef4444",
};

// ── Banner asset reference ───────────────────────────────────────────────────

export interface ShopifyBannerAsset {
  assetId:     string;
  assetType:   "product_photo" | "hero" | "lifestyle_photo" | "banner" | "short_video";
  nombre:      string;
  url:         string | null;
  thumbnailUrl: string | null;
  referencia:  string | null;
  coleccion:   string | null;
  aprobadoAt:  string | null;
}

// ── Banner draft ──────────────────────────────────────────────────────────────

export interface ShopifyBannerDraft {
  id:           string;
  tenantId:     string;
  placement:    BannerPlacement;
  targetId:     string | null;
  targetName:   string | null;
  status:       ShopifyBannerStatus;
  asset:        ShopifyBannerAsset | null;
  titulo:       string | null;
  subtitulo:    string | null;
  ctaTexto:     string | null;
  ctaUrl:       string | null;
  inicioAt:     string | null;
  finAt:        string | null;
  creadoPor:    string;
  creadoAt:     string;
  actualizadoAt: string;
  version:      number;
}

// ── Banner slot (enriched view) ──────────────────────────────────────────────

export interface ShopifyBannerSlot {
  placement:     BannerPlacement;
  ubicacion:     string;
  activeBanner:  ShopifyBannerDraft | null;
  draftBanner:   ShopifyBannerDraft | null;
  draftCount:    number;
  lastPublishedAt: string | null;
}

// ── Banner publication ───────────────────────────────────────────────────────

export interface ShopifyBannerPublication {
  id:           string;
  bannerId:     string;
  placement:    BannerPlacement;
  shopifyPageId: string | null;
  shopifySectionId: string | null;
  status:       "pending" | "published" | "updated" | "failed" | "removed";
  publishedAt:  string | null;
  removedAt:    string | null;
  error:        string | null;
}

// ── Banner history entry ─────────────────────────────────────────────────────

export type BannerHistoryAction =
  | "created"
  | "updated"
  | "submitted_review"
  | "approved"
  | "rejected"
  | "scheduled"
  | "published"
  | "paused"
  | "resumed"
  | "archived"
  | "replaced"
  | "removed"
  | "error";

export interface ShopifyBannerHistoryEntry {
  id:           string;
  bannerId:     string;
  action:       BannerHistoryAction;
  placement:    BannerPlacement;
  ubicacion:    string;
  assetNombre:  string | null;
  assetId:      string | null;
  usuario:      string;
  fecha:        string;
  resultado:    "ok" | "error";
  error:        string | null;
  version:      number;
}

// ── Scheduled banner action ──────────────────────────────────────────────────

export interface ShopifyBannerSchedule {
  bannerId:    string;
  action:      "publish" | "pause" | "remove";
  scheduledAt: string;
  status:      "pending" | "executed" | "cancelled" | "failed";
  executedAt:  string | null;
}

// ── Create/update inputs ─────────────────────────────────────────────────────

export interface CreateBannerDraftInput {
  placement:   BannerPlacement;
  targetId?:   string | null;
  targetName?: string | null;
  asset:       ShopifyBannerAsset;
  titulo?:     string | null;
  subtitulo?:  string | null;
  ctaTexto?:   string | null;
  ctaUrl?:     string | null;
  inicioAt?:   string | null;
  finAt?:      string | null;
}

export interface UpdateBannerDraftInput {
  asset?:      ShopifyBannerAsset;
  titulo?:     string | null;
  subtitulo?:  string | null;
  ctaTexto?:   string | null;
  ctaUrl?:     string | null;
  inicioAt?:   string | null;
  finAt?:      string | null;
}

// ── Sofia hint ────────────────────────────────────────────────────────────────

export interface BannerSofiaHint {
  message: string;
  type:    "info" | "warning" | "success" | "error";
}
