/**
 * components/marketing-studio/library/asset-card.tsx
 *
 * MS-04A.1 — Biblioteca Asset Card System
 *
 * The canonical reusable asset card for the Biblioteca.
 * Used by: Biblioteca grid, Approval queue, Catalog builder,
 *          Shopify export, Mila retrieval surface, Luca briefing.
 *
 * ── RULES ─────────────────────────────────────────────────────────────────────
 *   - Server component — CSS handles hover/focus (no client state needed)
 *   - Uses .ag-asset-card + modifier classes from design-system.css §MS
 *   - All colors from asset-visual-tokens.ts (never raw hex)
 *   - T.mono for ALL operational data
 *   - No Tailwind classes
 *
 * ── VISUAL STATES ─────────────────────────────────────────────────────────────
 *   Default         — clean card, hover lift
 *   selected        — blue ring + blue tint background
 *   review_pending  — amber left accent via CSS
 *   stale           — translucent overlay (90+ days unused)
 *   high_performer  — green left accent (10+ uses or 5+ channels)
 *   duplicate_risk  — red left accent
 *
 * ── PREPARED FOR MS-04B ───────────────────────────────────────────────────────
 *   Props include: isSelected, stale, highPerformer, duplicateRisk
 *   Click handler slot: href (detail drawer routing)
 *   Multi-select ready: isSelected prop + visual ring state
 */

import Link                  from "next/link";
import { C, T, S, R }       from "@/lib/ui/tokens";
import { StatusChip }        from "@/components/shell/operational-primitives";
import { ChannelBadgeGroup } from "./channel-badge";
import {
  resolveScoreTier,
  resolveStatusConfig,
  getThumbnailProfile,
  buildCardClasses,
  formatScore,
  type CardOperationalState,
} from "@/lib/marketing-studio/library/ui/asset-visual-tokens";

// ── Props ──────────────────────────────────────────────────────────────────────

export interface AssetCardProps {
  // ── Identity ────────────────────────────────────────────────────────────────
  id:           string;
  /** Direct URL to the asset image/video. */
  assetUrl:     string;
  /** Asset type slug (e.g. "product_photo", "short_video"). */
  assetType:    string;
  /** Human-readable asset name. Falls back to assetType + SKU. */
  name?:        string;
  /** Product SKU this asset represents. */
  sku?:         string;

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  /**
   * Lifecycle status.
   * Accepted: "approved" | "review_pending" | "generated" | "archived" | "rejected"
   */
  status:       string;

  // ── Intelligence layer (MS-03) ───────────────────────────────────────────────
  /** Destination channels this asset is cleared for. */
  channels:     string[];
  /** Number of times this asset has been published/deployed. */
  usageCount:   number;
  /** Number of channel variants derived from this asset. */
  variantCount: number;
  /**
   * Operational relevance score (0–1) from the scoring engine.
   * Drives the score badge and tier color.
   */
  score:        number;

  // ── Operational states ───────────────────────────────────────────────────────
  /** Asset has not been used in 90+ days. Applies gray overlay. */
  stale?:         boolean;
  /** Asset has 10+ uses or 5+ active channels. Applies green left accent. */
  highPerformer?: boolean;
  /** Near-duplicate detected. Applies red left accent. */
  duplicateRisk?: boolean;
  /** User has selected this card (bulk action mode). */
  isSelected?:    boolean;

  // ── Navigation ──────────────────────────────────────────────────────────────
  /**
   * When provided, wraps the card in a Link (detail drawer / MS-04B).
   * Typically `/${orgSlug}/agentik/marketing-studio/biblioteca/${id}`
   */
  href?:        string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AssetCard({
  id,
  assetUrl,
  assetType,
  name,
  sku,
  status,
  channels,
  usageCount,
  variantCount,
  score,
  stale         = false,
  highPerformer = false,
  duplicateRisk = false,
  isSelected    = false,
  href,
}: AssetCardProps) {
  const opState: CardOperationalState = { stale, highPerformer, duplicateRisk, isSelected };
  const cardClasses = buildCardClasses(status, opState);

  const thumb    = getThumbnailProfile(assetType);
  const tier     = resolveScoreTier(score);
  const statusCfg = resolveStatusConfig(status);

  // Display label: name > sku > formatted assetType
  const displayName = name ?? (sku ? `SKU ${sku}` : assetType.replace(/_/g, " "));

  const inner = (
    <>
      {/* ── Thumbnail ── */}
      <div className={`ag-thumb ${thumb.cssClass}${thumb.contain ? " ag-thumb--contain" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assetUrl} alt={displayName} loading="lazy" />

        {/* Score badge — top-right */}
        <div
          className="ag-thumb-score"
          style={{
            background: tier.surface,
            color:      tier.color,
            border:     `1px solid ${tier.border}`,
          }}
        >
          {formatScore(score)}
        </div>

        {/* Asset type — bottom-left */}
        <div className="ag-thumb-badge ag-thumb-badge--bl">
          {assetType.replace(/_/g, " ")}
        </div>

        {/* Stale indicator — top-left */}
        {stale && (
          <div className="ag-thumb-badge ag-thumb-badge--tl" style={{ background: "rgba(156,163,175,.8)" }}>
            Obsoleto
          </div>
        )}

        {/* High performer star — bottom-right */}
        {highPerformer && !stale && (
          <div
            className="ag-thumb-badge ag-thumb-badge--br"
            style={{ background: "rgba(22,163,74,.75)" }}
          >
            Top
          </div>
        )}

        {/* Duplicate risk — bottom-right (takes priority over high_performer) */}
        {duplicateRisk && (
          <div
            className="ag-thumb-badge ag-thumb-badge--br"
            style={{ background: "rgba(220,38,38,.75)" }}
          >
            Dup?
          </div>
        )}
      </div>

      {/* ── Meta ── */}
      <div className="ag-asset-card__meta">

        {/* Row 1: name + status chip */}
        <div className="ag-asset-card__row" style={{ justifyContent: "space-between" }}>
          <span className="ag-asset-card__sku" title={displayName}>
            {displayName}
          </span>
          <StatusChip variant={statusCfg.chipVariant}>
            {statusCfg.label}
          </StatusChip>
        </div>

        {/* Row 2: channel badges */}
        <ChannelBadgeGroup channels={channels} max={4} />

        {/* Row 3: usage + variants + score dot */}
        <div className="ag-asset-card__footer">
          <span
            className={`ag-asset-card__usage${usageCount > 5 ? " ag-asset-card__usage--active" : ""}`}
          >
            {usageCount} usos
          </span>
          {variantCount > 0 && (
            <span className="ag-asset-card__usage">
              · {variantCount} var.
            </span>
          )}
          {/* Score dot */}
          <span
            style={{
              marginLeft:  "auto",
              width:        7,
              height:       7,
              borderRadius: "50%",
              background:   tier.dot,
              display:      "inline-block",
              flexShrink:   0,
            }}
            title={`Score ${formatScore(score)} — ${tier.label}`}
          />
        </div>

      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cardClasses} style={{ textDecoration: "none" }}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={cardClasses}>
      {inner}
    </div>
  );
}

// ── AssetCardSkeleton ──────────────────────────────────────────────────────────

/**
 * AssetCardSkeleton — loading placeholder matching the AssetCard layout.
 *
 * Uses .ag-asset-skeleton + .ag-asset-skeleton__line classes from design-system.css.
 * Render N instances in the grid while data loads.
 */
export function AssetCardSkeleton({ thumbClass = "ag-thumb--square" }: { thumbClass?: string }) {
  return (
    <div className="ag-asset-skeleton">
      {/* Thumbnail placeholder */}
      <div className={`ag-asset-skeleton__thumb ${thumbClass}`} />
      {/* Meta placeholder */}
      <div style={{ padding: `${S[2]}px ${S[3]}px`, display: "flex", flexDirection: "column", gap: S[1] }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="ag-asset-skeleton__line ag-asset-skeleton__line--mid" />
          <div className="ag-asset-skeleton__line ag-asset-skeleton__line--short" style={{ height: 16, borderRadius: R.pill }} />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <div className="ag-asset-skeleton__line ag-asset-skeleton__line--short" style={{ height: 14 }} />
          <div className="ag-asset-skeleton__line ag-asset-skeleton__line--short" style={{ height: 14 }} />
        </div>
        <div className="ag-asset-skeleton__line ag-asset-skeleton__line--mid" style={{ marginTop: 2 }} />
      </div>
    </div>
  );
}
