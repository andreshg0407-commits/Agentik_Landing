/**
 * components/marketing-studio/library/library-reference-card.tsx
 *
 * MARKETING-STUDIO-LIBRARY-REFERENCE-MODE-01 — Phase 3 / Phase 9
 *
 * Premium product reference card for the Biblioteca product grid.
 * Replaces operational ProductCard with MS Design System visual language.
 *
 * ── Design contract ────────────────────────────────────────────────────────────
 *   - All tokens from MS_PALETTE / MS_SHADOWS / MS_APP_ICON / MS_TYPOGRAPHY
 *   - App-icon capsule style for category representation
 *   - Asset role groups: HERO × n, GAL × n, SWA × n, VID × n
 *   - Readiness bar using domain color
 *   - Channel readiness dots (ready / partial / blocked / none)
 *   - No raw hex values — all colors via C.* or MS_PALETTE
 *   - No Tailwind color classes
 *
 * ── Phase 4 (asset grouping) ───────────────────────────────────────────────────
 *   role groups come from ProductConsoleItem.assetRoleGroups[]
 *   (pre-computed server-side from ProductAssetLink.role)
 *
 * ── Canonical rule (Phase 2) ──────────────────────────────────────────────────
 *   ProductEntity is ALWAYS the primary reference when products.length > 0.
 *   This card is the visual expression of that rule.
 */

"use client";

import { Package } from "lucide-react";
import { C, T, S, R } from "@/lib/ui/tokens";
import {
  MS_PALETTE,
  MS_SHADOWS,
  MS_APP_ICON,
  MS_CARD,
  MS_TYPOGRAPHY,
} from "@/lib/marketing-studio/ms-design-system";
import type { ProductConsoleItem } from "@/lib/marketing-studio/products/product-display";

// ── Domain ─────────────────────────────────────────────────────────────────────
// All products in Biblioteca are product entities → product domain (blue).

const DOMAIN = MS_PALETTE.product;

// ── Role labels (human-readable) ──────────────────────────────────────────────

const ROLE_FULL: Record<string, string> = {
  hero:     "Principal",
  gallery:  "Galería",
  swatch:   "Muestra",
  video:    "Video",
  document: "Documento",
};

// ── Channel labels (human-readable) ───────────────────────────────────────────

const CHANNEL_LABEL: Record<string, string> = {
  shopify:  "Shopify",
  crm:      "CRM",
  whatsapp: "WhatsApp",
  catalog:  "Catálogo",
  ads:      "Anuncios",
  landing:  "Página de destino",
};

const ALL_CHANNELS = ["shopify", "crm", "whatsapp", "catalog", "ads", "landing"] as const;

// ── Readiness bar ──────────────────────────────────────────────────────────────

function ReadinessBar({ score }: { score: number }) {
  const color =
    score >= 70 ? C.green :
    score >= 30 ? C.amber :
    C.red;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
      <div style={{
        flex: 1, height: 3, borderRadius: R.pill,
        background: C.line, overflow: "hidden",
      }}>
        <div style={{
          width: `${Math.min(100, score)}%`, height: "100%",
          background: color, borderRadius: R.pill,
        }} />
      </div>
      <span style={{
        fontFamily:        T.mono,
        fontSize:          MS_TYPOGRAPHY.tagSize,
        fontWeight:        T.wt.bold,
        color,
        minWidth:          22,
        textAlign:         "right" as const,
        fontVariantNumeric: "tabular-nums",
      }}>
        {score}
      </span>
    </div>
  );
}

// ── Identity field helper ──────────────────────────────────────────────────────
// Renders a single "Label: value" row. Hides entirely when value is null.

function IdentityField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "baseline", overflow: "hidden" }}>
      <span style={{
        fontFamily:   T.mono,
        fontSize:     9,
        color:        C.inkFaint,
        flexShrink:   0,
        letterSpacing: "0.02em",
        whiteSpace:   "nowrap" as const,
      }}>
        {label}:
      </span>
      <span style={{
        fontFamily:   T.mono,
        fontSize:     MS_TYPOGRAPHY.descSize,
        color:        C.inkMid,
        overflow:     "hidden",
        textOverflow: "ellipsis",
        whiteSpace:   "nowrap" as const,
      }}>
        {value}
      </span>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

interface LibraryReferenceCardProps {
  product:   ProductConsoleItem;
  selected?: boolean;
  onClick?:  () => void;
}

export function LibraryReferenceCard({ product, selected, onClick }: LibraryReferenceCardProps) {
  const primaryColor = DOMAIN.primary;

  const borderColor  = selected ? `${primaryColor}bb` : "#e8eaed";
  const bg           = selected ? DOMAIN.selectedBg : DOMAIN.cardBg;
  const boxShadow    = selected
    ? MS_SHADOWS.cardSelected(primaryColor)
    : MS_SHADOWS.card;

  const STATUS_LABEL: Record<string, string> = {
    approved: "Aprobado",
    pending:  "Pendiente",
    draft:    "Borrador",
    review:   "En revisión",
    rejected: "Rechazado",
  };
  const isOk         = product.status === "approved";
  const isError      = product.status === "rejected";
  const statusLabel  = STATUS_LABEL[product.status] ?? product.status;
  const statusBg     = isOk ? C.greenLight : isError ? C.redLight  : C.amberLight;
  const statusColor  = isOk ? C.green      : isError ? C.red       : C.amber;
  const statusBorder = isOk ? C.greenBorder : isError ? C.redBorder : C.amberBorder;

  return (
    <button
      onClick={onClick}
      style={{
        display:        "flex",
        flexDirection:  "column" as const,
        minHeight:      188,
        width:          "100%",
        background:     bg,
        border:         `${selected ? 1.5 : 1}px solid ${borderColor}`,
        borderRadius:   MS_CARD.borderRadius,
        padding:        MS_CARD.padding,
        textAlign:      "left" as const,
        cursor:         "pointer",
        boxSizing:      "border-box" as const,
        minWidth:       0,
        overflow:       "hidden" as const,
        boxShadow,
        transition:     "box-shadow 0.15s, border-color 0.15s",
      }}
      aria-pressed={selected}
    >
      {/* ── Row 1: Thumbnail + identity + status badge (flex row, no overlap) ── */}
      <div style={{ display: "flex", gap: S[2], alignItems: "flex-start", marginBottom: S[2] }}>
        {/* Thumbnail: real asset when available, icon capsule as fallback */}
        <div style={{
          width:          MS_APP_ICON.size,
          height:         MS_APP_ICON.size,
          borderRadius:   MS_APP_ICON.borderRadius,
          background:     product.primaryAssetUrl
            ? C.line
            : `linear-gradient(145deg, rgba(255,255,255,0.92) 0%, ${DOMAIN.iconBg} 100%)`,
          boxShadow:      MS_SHADOWS.appIcon(primaryColor),
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          flexShrink:     0,
          overflow:       "hidden" as const,
        }}>
          {product.primaryAssetUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.primaryAssetUrl}
              alt={product.name}
              style={{
                width:      "100%",
                height:     "100%",
                objectFit:  "cover",
                display:    "block",
              }}
              loading="lazy"
              decoding="async"
              onError={e => {
                // Hide broken image — parent div background acts as fallback
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <Package
              size={MS_APP_ICON.iconSize}
              strokeWidth={MS_APP_ICON.strokeWidth}
              color={primaryColor}
            />
          )}
        </div>

        {/* Name + labeled identity — constrained, never bleeds into badge */}
        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          <div style={{
            fontFamily:   T.mono,
            fontSize:     MS_TYPOGRAPHY.cardTitleSize,
            fontWeight:   T.wt.bold,
            color:        C.ink,
            letterSpacing: "-0.02em",
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap" as const,
            lineHeight:   1.3,
          }}>
            {product.name}
          </div>

          {/* Labeled identity fields — Referencia · Categoría · Línea */}
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 2, marginTop: 3 }}>
            <IdentityField label="Referencia" value={product.sku} />
            <IdentityField label="Categoría"  value={product.category} />
            {product.productLine && (
              <IdentityField label="Línea" value={product.productLine} />
            )}
          </div>
        </div>

        {/* Status badge — flex sibling, never overlaps text */}
        <div style={{
          flexShrink:    0,
          alignSelf:     "flex-start",
          fontFamily:    T.mono,
          fontSize:      MS_TYPOGRAPHY.badgeSize,
          fontWeight:    T.wt.bold,
          letterSpacing: MS_TYPOGRAPHY.badgeTracking,
          textTransform: "uppercase" as const,
          padding:       "2px 5px",
          borderRadius:  R.pill,
          background:    statusBg,
          color:         statusColor,
          border:        `1px solid ${statusBorder}`,
          whiteSpace:    "nowrap" as const,
        }}>
          {statusLabel}
        </div>
      </div>

      {/* ── Row 2: Readiness bar ── */}
      <div style={{ marginBottom: S[2] }}>
        <ReadinessBar score={product.readinessScore} />
      </div>

      {/* ── Row 3: Asset role groups (Phase 4) ── */}
      {product.assetRoleGroups.length > 0 ? (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const, marginBottom: S[2] }}>
          {product.assetRoleGroups.map(g => (
            <span key={g.role} style={{
              fontFamily:    T.mono,
              fontSize:      MS_TYPOGRAPHY.tagSize,
              fontWeight:    T.wt.semibold,
              padding:       "2px 6px",
              borderRadius:  R.sm,
              background:    DOMAIN.iconBg,
              color:         primaryColor,
              border:        `1px solid ${primaryColor}33`,
            }}>
              {ROLE_FULL[g.role] ?? g.role} ({g.count})
            </span>
          ))}
        </div>
      ) : product.assetCount > 0 ? (
        <div style={{
          marginBottom: S[2],
          fontFamily:   T.mono,
          fontSize:     MS_TYPOGRAPHY.tagSize,
          color:        C.inkFaint,
        }}>
          {product.assetCount} recurso{product.assetCount !== 1 ? "s" : ""} visual{product.assetCount !== 1 ? "es" : ""}
        </div>
      ) : (
        <div style={{
          marginBottom: S[2],
          fontFamily:   T.mono,
          fontSize:     MS_TYPOGRAPHY.tagSize,
          color:        C.inkFaint,
          fontStyle:    "italic",
        }}>
          Sin recursos visuales
        </div>
      )}

      {/* ── Row 4: Channel readiness dots — pushed to bottom ── */}
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" as const, marginTop: "auto" }}>
        {ALL_CHANNELS.map(ch => {
          const status =
            product.readyDestinations.includes(ch as never)   ? "ready"   :
            product.partialDestinations.includes(ch as never) ? "partial" :
            product.blockedDestinations.includes(ch as never) ? "blocked" :
            "none" as const;

          const dotColor =
            status === "ready"   ? C.green  :
            status === "partial" ? C.amber  :
            status === "blocked" ? C.red    :
            C.line;
          const dotBg =
            status === "ready"   ? C.greenLight  :
            status === "partial" ? C.amberLight  :
            status === "blocked" ? C.redLight    :
            C.surface;

          return (
            <span key={ch} style={{
              fontFamily:    T.mono,
              fontSize:      8,
              fontWeight:    T.wt.bold,
              padding:       "1px 4px",
              borderRadius:  R.sm,
              background:    dotBg,
              color:         dotColor,
              border:        `1px solid ${dotColor}`,
              letterSpacing: "0.04em",
              opacity:       status === "none" ? 0.35 : 1,
            }}>
              {CHANNEL_LABEL[ch] ?? ch}
            </span>
          );
        })}
      </div>
    </button>
  );
}
