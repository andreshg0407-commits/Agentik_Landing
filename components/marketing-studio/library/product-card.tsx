/**
 * components/marketing-studio/library/product-card.tsx
 *
 * MS-06 — Operational Product Card
 *
 * Renders a ProductConsoleItem as an enterprise-grade operational card
 * for the Biblioteca product grid.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   - Visual tokens: C.* / T.* / S.* / R.* only — no raw hex
 *   - ag-* CSS classes for structural patterns
 *   - Readiness score bar communicates operational health at a glance
 *   - Sync ≠ Publication — shown separately
 *   - No decorative chrome — every visual element carries information
 */

"use client";

import { C, T, S, R } from "@/lib/ui/tokens";
import type { ProductConsoleItem } from "@/lib/marketing-studio/products/product-display";

// ── Readiness bar ──────────────────────────────────────────────────────────────

function ReadinessBar({ score, level }: { score: number; level: string }) {
  const color =
    level === "ready"    ? C.green  :
    level === "partial"  ? C.amber  :
    C.red;
  const bg =
    level === "ready"    ? C.greenLight  :
    level === "partial"  ? C.amberLight  :
    C.redLight;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
      <div style={{
        flex: 1, height: 4, borderRadius: R.pill,
        background: C.line, overflow: "hidden",
      }}>
        <div style={{
          width: `${score}%`, height: "100%",
          background: color, borderRadius: R.pill,
          transition: "width 0.3s ease",
        }} />
      </div>
      <span style={{
        fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
        color, minWidth: 28, textAlign: "right" as const,
      }}>
        {score}
      </span>
    </div>
  );
}

// ── Channel dot ────────────────────────────────────────────────────────────────

const CHANNEL_SHORT: Record<string, string> = {
  shopify:  "SHO",
  crm:      "CRM",
  whatsapp: "WA",
  catalog:  "CAT",
  ads:      "ADS",
  landing:  "LND",
};

function ChannelDot({ channel, status }: { channel: string; status: "ready" | "partial" | "blocked" | "none" }) {
  const color =
    status === "ready"   ? C.green  :
    status === "partial" ? C.amber  :
    status === "blocked" ? C.red    :
    C.line;
  const bg =
    status === "ready"   ? C.greenLight  :
    status === "partial" ? C.amberLight  :
    status === "blocked" ? C.redLight    :
    C.surface;

  return (
    <span style={{
      fontFamily:  T.mono, fontSize: 8, fontWeight: T.wt.bold,
      padding:     "1px 4px", borderRadius: R.sm,
      background:  bg, color,
      border:      `1px solid ${color}`,
      letterSpacing: "0.04em",
    }}>
      {CHANNEL_SHORT[channel] ?? channel.toUpperCase().slice(0, 3)}
    </span>
  );
}

// ── Sync status chip ───────────────────────────────────────────────────────────

const SYNC_COLORS: Record<string, { color: string; label: string }> = {
  pending:        { color: C.amber,    label: "Pendiente" },
  synced:         { color: C.green,    label: "Sync OK" },
  failed:         { color: C.red,      label: "Sync falló" },
  outdated:       { color: C.inkFaint, label: "Desact." },
  not_configured: { color: C.line,     label: "—" },
};

// ── Skeleton ───────────────────────────────────────────────────────────────────

export function ProductCardSkeleton() {
  return (
    <div className="ag-product-card ag-product-card--skeleton">
      <div className="ag-product-card__image" style={{ background: C.surfaceAlt }} />
      <div className="ag-product-card__body">
        <div style={{ height: 12, borderRadius: R.sm, background: C.surfaceAlt, marginBottom: S[2] }} />
        <div style={{ height: 10, borderRadius: R.sm, background: C.surfaceAlt, width: "60%" }} />
      </div>
    </div>
  );
}

// ── Product Card ───────────────────────────────────────────────────────────────

interface ProductCardProps {
  product:  ProductConsoleItem;
  onClick?: () => void;
  selected?: boolean;
}

export function ProductCard({ product, onClick, selected }: ProductCardProps) {
  const allChannels = ["shopify", "crm", "whatsapp", "catalog", "ads", "landing"] as const;

  const channelStatus = (ch: string): "ready" | "partial" | "blocked" | "none" => {
    if (product.readyDestinations.includes(ch as never))    return "ready";
    if (product.partialDestinations.includes(ch as never))  return "partial";
    if (product.blockedDestinations.includes(ch as never))  return "blocked";
    return "none";
  };

  const hasSyncIssue = product.syncSummary.some(s => s.status === "failed");
  const activeChannelCount =
    product.readyDestinations.length + product.partialDestinations.length;

  return (
    <div
      className="ag-product-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onClick?.()}
      style={{
        outline: selected ? `2px solid ${C.blueDark}` : "none",
        outlineOffset: 2,
      }}
    >
      {/* ── Image zone ── */}
      <div className="ag-product-card__image">
        {product.primaryAssetUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={product.primaryAssetUrl}
            alt={product.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: C.surfaceAlt,
          }}>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, textTransform: "uppercase" as const }}>
              Sin imagen
            </span>
          </div>
        )}

        {/* Status badge overlay */}
        <div style={{
          position: "absolute", top: S[2], right: S[2],
          fontFamily: T.mono, fontSize: 8, fontWeight: T.wt.bold,
          padding: "2px 5px", borderRadius: R.pill,
          background: product.status === "approved" ? C.greenLight : C.amberLight,
          color:      product.status === "approved" ? C.green      : C.amber,
          border: `1px solid ${product.status === "approved" ? C.greenBorder : C.amberBorder}`,
          textTransform: "uppercase" as const, letterSpacing: "0.06em",
        }}>
          {product.status === "approved" ? "Aprobado" : product.status}
        </div>

        {/* Sync failure indicator */}
        {hasSyncIssue && (
          <div style={{
            position: "absolute", top: S[2], left: S[2],
            width: 8, height: 8, borderRadius: "50%",
            background: C.red,
            boxShadow: `0 0 0 2px ${C.white}`,
          }} title="Sync fallido en al menos un canal" />
        )}
      </div>

      {/* ── Body ── */}
      <div className="ag-product-card__body">

        {/* Name */}
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
          color: C.ink, lineHeight: 1.3,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
        }}>
          {product.name}
        </div>

        {/* SKU + category row */}
        <div style={{
          display: "flex", gap: S[2], marginTop: 2,
          overflow: "hidden",
        }}>
          {product.sku && (
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkLight, flexShrink: 0 }}>
              {product.sku}
            </span>
          )}
          {product.category && (
            <span style={{
              fontFamily: T.mono, fontSize: 9, color: C.inkFaint,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
            }}>
              {product.category}
            </span>
          )}
        </div>

        {/* Readiness bar */}
        <div style={{ marginTop: S[2] }}>
          <ReadinessBar score={product.readinessScore} level={product.readinessLevel} />
        </div>

        {/* Channel dots */}
        <div style={{ display: "flex", gap: 3, marginTop: S[2], flexWrap: "wrap" as const }}>
          {allChannels.map(ch => (
            <ChannelDot key={ch} channel={ch} status={channelStatus(ch)} />
          ))}
        </div>

        {/* Footer row: asset count + variant count */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginTop: S[2], paddingTop: S[2],
          borderTop: `1px solid ${C.line}`,
        }}>
          <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
            {product.assetCount} asset{product.assetCount !== 1 ? "s" : ""}
            {product.variantCount > 0 ? ` · ${product.variantCount} var.` : ""}
          </span>
          <span style={{
            fontFamily: T.mono, fontSize: 9,
            color: activeChannelCount > 0 ? C.blueDark : C.inkFaint,
          }}>
            {activeChannelCount > 0 ? `${activeChannelCount} destinos` : "Sin destinos"}
          </span>
        </div>
      </div>
    </div>
  );
}
