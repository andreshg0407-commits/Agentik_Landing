/**
 * lib/marketing-studio/catalogs/catalog-qr-service.ts
 *
 * MARKETING-STUDIO-CATALOG-QR-SHARING-01 — QR Generation Service
 *
 * SERVER ONLY — never import from client components.
 *
 * Responsibilities:
 *   1. Verify the catalog exists (org-scoped, security boundary)
 *   2. Resolve the active CatalogPublicLink
 *   3. Compute the public URL from the link slug
 *   4. Generate a print-quality QR PNG via the qrcode library
 *   5. Return a buffer — the caller is responsible for streaming
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   The QR encodes ONLY the public URL — no internal IDs, no org data.
 *   organizationId is used only to scope the DB query (never leaves the server).
 *
 * ── QUALITY ───────────────────────────────────────────────────────────────────
 *   1024×1024px PNG — print-ready at 300dpi (~86mm × 86mm without margin)
 *   Error correction H (30% recovery) — survives partial damage on stickers/print
 *   Margin 2 modules — balanced quiet zone for scanners
 */

import QRCode                   from "qrcode";
import { prisma }               from "@/lib/prisma";
import { getCatalogDefinition } from "./catalog-definition-repository";
import type {
  CatalogQrDownload,
  CatalogQrReadiness,
} from "./catalog-qr-types";

// ── QR generation constants ───────────────────────────────────────────────────

/** Output size — print-quality, sufficient for physical materials */
const QR_SIZE_PX = 1024;

/** Quiet-zone margin in QR modules (ISO 18004 recommends ≥4, 2 is safe for digital) */
const QR_MARGIN = 2;

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildPublicUrl(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/$/, "")}/c/${slug}`;
}

async function resolveActiveLink(
  organizationId: string,
  catalogId:      string,
): Promise<{ slug: string; expiresAt: Date | null } | null> {
  const link = await (prisma as any).catalogPublicLink.findFirst({
    where:  { catalogId, organizationId, isActive: true },
    select: { slug: true, expiresAt: true },
  });
  return link ?? null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check whether a QR can be generated for this catalog.
 * Does NOT generate the QR — use this to drive UI readiness state.
 */
export async function checkCatalogQrReadiness(
  organizationId: string,
  catalogId:       string,
  baseUrl:         string,
): Promise<CatalogQrReadiness> {
  const catalog = await getCatalogDefinition(organizationId, catalogId);
  if (!catalog) throw new Error(`CatalogDefinition not found: ${catalogId}`);

  const link = await resolveActiveLink(organizationId, catalogId);

  if (!link) {
    return { available: false, reason: "no_link" };
  }
  if (link.expiresAt && link.expiresAt < new Date()) {
    return { available: false, reason: "link_expired" };
  }

  return {
    available:  true,
    definition: {
      publicUrl:   buildPublicUrl(baseUrl, link.slug),
      linkSlug:    link.slug,
      catalogName: catalog.name,
      generatedAt: new Date(),
    },
  };
}

/**
 * Generate a print-quality QR PNG for a catalog's active public link.
 *
 * Throws with coded messages on unavailability:
 *   "no_link"       — catalog is not published
 *   "link_expired"  — time-limited link expired
 *   "link_inactive" — link was manually deactivated (caught via isActive filter)
 *
 * SECURITY: Encodes only the public URL. No internal IDs are ever embedded.
 */
export async function generateCatalogQrPng(
  organizationId: string,
  catalogId:       string,
  baseUrl:         string,
): Promise<CatalogQrDownload> {
  const readiness = await checkCatalogQrReadiness(organizationId, catalogId, baseUrl);

  if (!readiness.available) {
    throw new Error(readiness.reason);
  }

  const { publicUrl, catalogName } = readiness.definition;

  // Generate PNG buffer — error correction H for maximum print resilience
  const raw = await QRCode.toBuffer(publicUrl, {
    type:                 "png",
    width:                QR_SIZE_PX,
    margin:               QR_MARGIN,
    errorCorrectionLevel: "H",
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  const buffer = Buffer.from(raw);

  // Build safe filename for download header
  const safeName = catalogName
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 50);
  const dateStr  = new Date().toISOString().slice(0, 10);
  const fileName = `qr-${safeName}-${dateStr}.png`;

  return { buffer, fileName, publicUrl };
}
