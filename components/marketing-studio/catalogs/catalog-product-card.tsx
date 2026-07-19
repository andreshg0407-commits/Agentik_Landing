/**
 * components/marketing-studio/catalogs/catalog-product-card.tsx
 *
 * MS-08 — Catalog Product Card
 *
 * Compact card for products within a catalog context.
 * Shows inclusion state (included / partial / excluded) prominently.
 * Visually distinct from the full ProductCard used in Biblioteca.
 */

"use client";

import { C, T, S, R } from "@/lib/ui/tokens";
import type { ProductConsoleItem } from "@/lib/marketing-studio/products/product-display";

// ── Inclusion state ───────────────────────────────────────────────────────────

export type CatalogInclusionState = "included" | "partial" | "excluded";

interface CatalogProductCardProps {
  product:        ProductConsoleItem;
  inclusion:      CatalogInclusionState;
  exclusionReason?: string;
  targetChannel?: string;
}

// ── Channel short labels ──────────────────────────────────────────────────────

const CHANNEL_LABEL: Record<string, string> = {
  shopify:  "Shopify", crm: "CRM", whatsapp: "WhatsApp",
  catalog: "Catálogo", ads: "Anuncios", landing: "Página de destino",
};

// ── Inclusion badge config ─────────────────────────────────────────────────────

const INCLUSION_CONFIG: Record<CatalogInclusionState, {
  bg: string; border: string; text: string; label: string; dotColor: string;
}> = {
  included: { bg: C.greenLight,  border: C.greenBorder,  text: C.green,    label: "Incluido",  dotColor: C.green  },
  partial:  { bg: C.amberLight,  border: C.amberBorder,  text: C.amber,    label: "Parcial",   dotColor: C.amber  },
  excluded: { bg: C.redLight,    border: C.redBorder,    text: C.red,      label: "No incluido", dotColor: C.red    },
};

// ── Readiness bar ─────────────────────────────────────────────────────────────

function MiniReadinessBar({ score, level }: { score: number; level: string }) {
  const color = level === "ready" ? C.green : level === "partial" ? C.amber : C.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ flex: 1, height: 3, background: C.line, borderRadius: R.pill, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: R.pill }} />
      </div>
      <span style={{ fontFamily: T.mono, fontSize: 8, color, minWidth: 20, textAlign: "right" as const }}>
        {score}
      </span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CatalogProductCard({
  product,
  inclusion,
  exclusionReason,
  targetChannel,
}: CatalogProductCardProps) {
  const cfg = INCLUSION_CONFIG[inclusion];

  const channelStatus = (ch: string): "ready" | "partial" | "blocked" | "none" => {
    if (product.readyDestinations.includes(ch as never))    return "ready";
    if (product.partialDestinations.includes(ch as never))  return "partial";
    if (product.blockedDestinations.includes(ch as never))  return "blocked";
    return "none";
  };

  const channelColor = (status: string) =>
    status === "ready" ? C.green : status === "partial" ? C.amber : status === "blocked" ? C.red : C.line;

  return (
    <div className="ag-catalog-product-card" style={{
      border:       `1px solid ${cfg.border}`,
      background:   inclusion === "excluded" ? C.surfaceAlt : C.white,
      opacity:      inclusion === "excluded" ? 0.75 : 1,
    }}>
      {/* Inclusion state left accent */}
      <div style={{
        position: "absolute" as const, left: 0, top: 0, bottom: 0,
        width: 3, background: cfg.dotColor,
        borderRadius: `${R.sm}px 0 0 ${R.sm}px`,
      }} />

      {/* Image */}
      <div style={{
        width: 44, height: 44, borderRadius: R.md, overflow: "hidden",
        background: C.surfaceAlt, flexShrink: 0,
        border: `1px solid ${C.line}`,
      }}>
        {product.primaryAssetUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={product.primaryAssetUrl} alt={product.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center",
            justifyContent: "center" }}>
            <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkGhost }}>—</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Name + inclusion badge */}
        <div style={{ display: "flex", alignItems: "center", gap: S[1], marginBottom: 3 }}>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
            color: inclusion === "excluded" ? C.inkLight : C.ink,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, flex: 1,
          }}>
            {product.name}
          </span>
          <span style={{
            fontFamily: T.mono, fontSize: 8, fontWeight: T.wt.bold,
            padding: "1px 5px", borderRadius: R.pill,
            background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`,
            flexShrink: 0, textTransform: "uppercase" as const, letterSpacing: "0.06em",
          }}>
            {cfg.label}
          </span>
        </div>

        {/* SKU + category — labeled */}
        <div style={{ display: "flex", gap: S[2], marginBottom: 3, flexWrap: "wrap" as const }}>
          {product.sku && (
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
              <span style={{ color: C.inkGhost }}>Ref. </span>{product.sku}
            </span>
          )}
          {product.category && (
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              <span style={{ color: C.inkGhost }}>Cat. </span>{product.category}
            </span>
          )}
        </div>

        {/* Readiness bar or exclusion reason */}
        {inclusion === "excluded" && exclusionReason ? (
          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.red }}>
            {exclusionReason}
          </div>
        ) : (
          <MiniReadinessBar score={product.readinessScore} level={product.readinessLevel} />
        )}

        {/* Channel dots — only show target channel and neighbors */}
        {inclusion !== "excluded" && (
          <div style={{ display: "flex", gap: 3, marginTop: S[1], flexWrap: "wrap" as const }}>
            {["shopify", "whatsapp", "catalog", "crm", "ads"].map(ch => {
              const status = channelStatus(ch);
              const isTarget = ch === targetChannel;
              if (status === "none" && !isTarget) return null;
              return (
                <span key={ch} style={{
                  fontFamily: T.mono, fontSize: 8, fontWeight: T.wt.bold,
                  padding: "1px 4px", borderRadius: R.sm,
                  background: status === "none" ? C.surfaceAlt : status === "ready" ? C.greenLight : status === "partial" ? C.amberLight : C.redLight,
                  color: channelColor(status),
                  border: `1px solid ${channelColor(status)}`,
                  letterSpacing: "0.04em",
                  outline: isTarget ? `1px solid ${cfg.dotColor}` : "none",
                  outlineOffset: 1,
                }}>
                  {CHANNEL_LABEL[ch] ?? ch}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
