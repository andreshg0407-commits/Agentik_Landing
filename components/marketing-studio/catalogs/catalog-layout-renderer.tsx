"use client";
/**
 * components/marketing-studio/catalogs/catalog-layout-renderer.tsx
 *
 * MARKETING-STUDIO-CATALOG-LAYOUTS-01 — Catalog Layout Renderer
 *
 * Renders the organized catalog view: category sections + product items.
 * Supports GRID_STANDARD and LIST_STANDARD layouts.
 * Respects pricingMode and ctaMode from the catalog definition.
 *
 * ── ARCHITECTURE ─────────────────────────────────────────────────────────────
 *   CatalogLayoutResult → CatalogCategorySection[] → product items
 *   All rendering is deterministic — no client-side data fetching.
 *   Future layouts (MAGAZINE, COMPARISON, CHANNEL_SPECIFIC) add new branches.
 */

import { C, T, S, R, E }               from "@/lib/ui/tokens";
import type { CatalogLayout, PricingMode, CtaMode, CatalogTemplateKey } from "@/lib/marketing-studio/catalogs/catalog-definition-types";
import type { CatalogLayoutResult, CatalogCategorySection } from "@/lib/marketing-studio/catalogs/catalog-layout-engine";
import type { CatalogProductItem }     from "@/lib/marketing-studio/catalogs/catalog-query-service";
// WhatsApp brand color — external brand constant, not in C.*
const WA_GREEN = "#25D366";

// ── Props ─────────────────────────────────────────────────────────────────────

interface CatalogLayoutRendererProps {
  layoutResult:  CatalogLayoutResult;
  layout:        CatalogLayout;
  pricingMode:   PricingMode;
  ctaMode:       CtaMode;
  whatsAppPhone: string | null;
  catalogName:   string;
  templateKey:   CatalogTemplateKey;
}

// ── Template visual config ────────────────────────────────────────────────────

interface TemplateVisual {
  /** CSS grid minmax for GRID_STANDARD cards */
  gridMinWidth:     number;
  /** Image aspect ratio padding-top % (e.g. 75 = 4:3, 100 = 1:1, 130 = portrait) */
  imageRatio:       number;
  /** Whether to show the SKU line in cards */
  showSku:          boolean;
  /** Gap between grid cards */
  gridGap:          number;
  /** Section margin-bottom */
  sectionSpacing:   number;
  /** Category header border + badge accent color (template-specific) */
  accentColor:      string;
  /** Product name font size in cards */
  nameFontSize:     number;
  /** Category section label font size */
  sectionLabelSize: number;
  /** Card inner padding */
  cardPadding:      number;
}

function getTemplateVisual(templateKey: CatalogTemplateKey): TemplateVisual {
  switch (templateKey) {
    // B2B dense: tight grid, short images, SKU prominent, navy accent
    case "wholesale":
      return {
        gridMinWidth: 130, imageRatio: 55,  showSku: true,  gridGap: S[2], sectionSpacing: S[5],
        accentColor: C.titleDeep, nameFontSize: T.sz.xs,   sectionLabelSize: T.sz.sm,   cardPadding: S[2],
      };
    // Formal clean: wider cards, landscape images, dark accent, airy
    case "institutional":
      return {
        gridMinWidth: 210, imageRatio: 70,  showSku: true,  gridGap: S[4], sectionSpacing: S[8],
        accentColor: C.exec,      nameFontSize: T.sz.sm,   sectionLabelSize: T.sz.base,  cardPadding: S[3],
      };
    // Expressive campaign: hero images, large type, campaign red, very spacious
    case "campaign":
      return {
        gridMinWidth: 240, imageRatio: 130, showSku: false, gridGap: S[4], sectionSpacing: S[10],
        accentColor: C.red,       nameFontSize: T.sz.sm,   sectionLabelSize: T.sz.md,    cardPadding: S[3],
      };
    // B2C standard: balanced grid, portrait images, brand blue
    case "retail":
    default:
      return {
        gridMinWidth: 180, imageRatio: 85,  showSku: true,  gridGap: S[3], sectionSpacing: S[6],
        accentColor: C.blueDark,  nameFontSize: T.sz.xs,   sectionLabelSize: T.sz.sm,   cardPadding: S[3],
      };
  }
}

// ── WhatsApp URL builder ──────────────────────────────────────────────────────

function buildWaUrl(phone: string, productName: string, sku: string | null, catalogName: string): string {
  const normalized = phone.replace(/^\+/, "").replace(/\D/g, "");
  const skuPart    = sku ? ` (Ref: ${sku})` : "";
  const msg        = `Hola! Me interesa: ${productName}${skuPart} del catálogo "${catalogName}". ¿Está disponible?`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`;
}

// ── Category Section Header ───────────────────────────────────────────────────

function CategoryHeader({
  section, visual,
}: {
  section: CatalogCategorySection;
  visual:  TemplateVisual;
}) {
  const accent = section.isUncategorized ? C.inkFaint : visual.accentColor;
  return (
    <div style={{
      display:       "flex",
      alignItems:    "center",
      gap:           S[3],
      paddingBottom: S[3],
      marginBottom:  S[4],
      borderBottom:  `2px solid ${section.isUncategorized ? C.lineSubtle : visual.accentColor}`,
    }}>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      visual.sectionLabelSize,
        fontWeight:    T.wt.bold,
        color:         section.isUncategorized ? C.inkFaint : C.ink,
        letterSpacing: "-0.01em",
        lineHeight:    1.2,
      }}>
        {section.label}
      </div>
      <div style={{
        fontFamily:         T.mono,
        fontSize:           T.sz["2xs"],
        fontWeight:         T.wt.semibold,
        color:              C.white,
        background:         accent,
        padding:            "2px 8px",
        borderRadius:       R.pill,
        fontVariantNumeric: "tabular-nums",
        flexShrink:         0,
      }}>
        {section.count}
      </div>
    </div>
  );
}

// ── Grid Product Card ─────────────────────────────────────────────────────────

function GridCard({
  item, pricingMode, ctaMode, whatsAppPhone, catalogName, visual,
}: {
  item:          CatalogProductItem;
  pricingMode:   PricingMode;
  ctaMode:       CtaMode;
  whatsAppPhone: string | null;
  catalogName:   string;
  visual:        TemplateVisual;
}) {
  const showPrice = pricingMode === "with_prices" && item.price != null;
  const showCta   = ctaMode === "whatsapp_order" && !!whatsAppPhone;

  return (
    <div style={{
      background:    C.white,
      border:        `1px solid ${C.line}`,
      borderRadius:  R.md,
      overflow:      "hidden" as const,
      boxShadow:     E.xs,
      display:       "flex",
      flexDirection: "column" as const,
    }}>
      {/* Hero image — aspect-ratio box */}
      <div style={{
        width:      "100%",
        paddingTop: `${visual.imageRatio}%`,
        position:   "relative" as const,
        background: C.surfaceAlt,
        flexShrink: 0,
      }}>
        {item.heroAssetUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.heroAssetUrl}
            alt={item.name}
            loading="lazy"
            style={{
              position:  "absolute" as const,
              inset:     0,
              width:     "100%",
              height:    "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div style={{
            position:       "absolute" as const,
            inset:          0,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
          }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.base, color: C.inkGhost }}>
              ▭
            </span>
          </div>
        )}
      </div>

      {/* Card body — template-aware padding */}
      <div style={{
        padding:       `${visual.cardPadding}px`,
        flex:          1,
        display:       "flex",
        flexDirection: "column" as const,
        gap:           S[1],
      }}>
        {/* Product name — allows 2 lines, no truncation on mobile */}
        <div style={{
          fontFamily:  T.mono,
          fontSize:    visual.nameFontSize,
          fontWeight:  T.wt.semibold,
          color:       C.ink,
          lineHeight:  1.35,
          overflow:    "hidden",
          maxHeight:   `${visual.nameFontSize * 1.35 * 2 + 4}px`,
        }}>
          {item.name}
        </div>

        {visual.showSku && item.sku && (
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            {item.sku}
          </div>
        )}

        {showPrice && (
          <div style={{
            fontFamily:         T.mono,
            fontSize:           T.sz.sm,
            fontWeight:         T.wt.bold,
            color:              C.ink,
            fontVariantNumeric: "tabular-nums",
            marginTop:          "auto",
            paddingTop:         S[1],
          }}>
            {item.currency} {item.price!.toLocaleString("es-CO")}
          </div>
        )}

        {/* WhatsApp CTA — minimum 44px tap target for mobile accessibility */}
        {showCta && (
          <a
            href={buildWaUrl(whatsAppPhone!, item.name, item.sku, catalogName)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Pedir ${item.name} por WhatsApp`}
            style={{
              display:         "flex",
              alignItems:      "center",
              justifyContent:  "center",
              fontFamily:      T.mono,
              fontSize:        T.sz.xs,
              fontWeight:      T.wt.semibold,
              padding:         `${S[2]}px ${S[3]}px`,
              minHeight:       44,
              borderRadius:    R.md,
              background:      WA_GREEN,
              color:           C.white,
              textDecoration:  "none",
              marginTop:       S[2],
              boxSizing:       "border-box" as const,
            }}
          >
            Pedir por WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}

// ── List Product Row ──────────────────────────────────────────────────────────

function ListRow({
  item, pricingMode, ctaMode, whatsAppPhone, catalogName, visual,
}: {
  item:          CatalogProductItem;
  pricingMode:   PricingMode;
  ctaMode:       CtaMode;
  whatsAppPhone: string | null;
  catalogName:   string;
  visual:        TemplateVisual;
}) {
  const showPrice = pricingMode === "with_prices" && item.price != null;
  const showCta   = ctaMode === "whatsapp_order" && !!whatsAppPhone;

  return (
    <div style={{
      display:       "flex",
      alignItems:    "center",
      gap:           S[3],
      padding:       `${S[2]}px ${S[3]}px`,
      background:    C.white,
      borderBottom:  `1px solid ${C.lineSubtle}`,
    }}>
      {/* Thumb — always visible, placeholder when no image */}
      <div style={{
        width:        44,
        height:       44,
        borderRadius: R.sm,
        background:   C.surfaceAlt,
        flexShrink:   0,
        overflow:     "hidden" as const,
        border:       `1px solid ${C.line}`,
      }}>
        {item.heroAssetUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.heroAssetUrl}
            alt={item.name}
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{
            width:          "100%",
            height:         "100%",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
          }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkGhost, lineHeight: 1 }}>
              ▭
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          fontWeight:   T.wt.semibold,
          color:        C.ink,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap" as const,
        }}>
          {item.name}
        </div>
        {visual.showSku && item.sku && (
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
            Ref: {item.sku}
          </div>
        )}
      </div>

      {/* Price */}
      {showPrice && (
        <div style={{
          fontFamily:         T.mono,
          fontSize:           T.sz.xs,
          fontWeight:         T.wt.bold,
          color:              C.ink,
          fontVariantNumeric: "tabular-nums",
          flexShrink:         0,
        }}>
          {item.currency} {item.price!.toLocaleString("es-CO")}
        </div>
      )}

      {/* WhatsApp CTA — minimum 44px tap target for mobile */}
      {showCta && (
        <a
          href={buildWaUrl(whatsAppPhone!, item.name, item.sku, catalogName)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Pedir ${item.name} por WhatsApp`}
          style={{
            display:         "flex",
            alignItems:      "center",
            fontFamily:      T.mono,
            fontSize:        T.sz["2xs"],
            fontWeight:      T.wt.semibold,
            padding:         `${S[2]}px ${S[3]}px`,
            minHeight:       44,
            borderRadius:    R.md,
            background:      WA_GREEN,
            color:           C.white,
            textDecoration:  "none",
            flexShrink:      0,
            whiteSpace:      "nowrap" as const,
            boxSizing:       "border-box" as const,
          }}
        >
          WhatsApp
        </a>
      )}
    </div>
  );
}

// ── Section Renderer ──────────────────────────────────────────────────────────

function SectionBlock({
  section, layout, pricingMode, ctaMode, whatsAppPhone, catalogName, visual,
}: {
  section:       CatalogCategorySection;
  layout:        CatalogLayout;
  pricingMode:   PricingMode;
  ctaMode:       CtaMode;
  whatsAppPhone: string | null;
  catalogName:   string;
  visual:        TemplateVisual;
}) {
  return (
    <div style={{ marginBottom: visual.sectionSpacing }}>
      <CategoryHeader section={section} visual={visual} />

      {layout === "GRID_STANDARD" ? (
        <div style={{
          display:             "grid",
          gridTemplateColumns: `repeat(auto-fill, minmax(${visual.gridMinWidth}px, 1fr))`,
          gap:                 visual.gridGap,
        }}>
          {section.items.map(item => (
            <GridCard
              key={item.id}
              item={item}
              pricingMode={pricingMode}
              ctaMode={ctaMode}
              whatsAppPhone={whatsAppPhone}
              catalogName={catalogName}
              visual={visual}
            />
          ))}
        </div>
      ) : (
        <div style={{
          border:       `1px solid ${C.line}`,
          borderRadius: R.md,
          overflow:     "hidden" as const,
          boxShadow:    E.xs,
        }}>
          {section.items.map(item => (
            <ListRow
              key={item.id}
              item={item}
              pricingMode={pricingMode}
              ctaMode={ctaMode}
              whatsAppPhone={whatsAppPhone}
              catalogName={catalogName}
              visual={visual}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyCatalog({ catalogName }: { catalogName: string }) {
  return (
    <div style={{
      padding:        `${S[10]}px ${S[6]}px`,
      textAlign:      "center" as const,
      background:     C.surface,
      border:         `1px solid ${C.line}`,
      borderRadius:   R.md,
    }}>
      <div style={{
        fontSize: 28, marginBottom: S[4], lineHeight: 1,
      }}>
        📦
      </div>
      <div style={{
        fontFamily:   T.mono,
        fontSize:     T.sz.sm,
        fontWeight:   T.wt.semibold,
        color:        C.inkMid,
        marginBottom: S[2],
      }}>
        No hay productos disponibles
      </div>
      <div style={{
        fontFamily:  T.sans,
        fontSize:    T.sz.xs,
        color:       C.inkFaint,
        maxWidth:    340,
        margin:      "0 auto",
        lineHeight:  1.6,
      }}>
        Este catálogo no tiene productos disponibles en este momento.
        Contacta al vendedor para más información.
      </div>
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function CatalogLayoutRenderer({
  layoutResult, layout, pricingMode, ctaMode, whatsAppPhone, catalogName, templateKey,
}: CatalogLayoutRendererProps) {
  if (layoutResult.totalCount === 0) {
    return <EmptyCatalog catalogName={catalogName} />;
  }

  const visual = getTemplateVisual(templateKey);

  return (
    <div>
      {layoutResult.sections.map(section => (
        <SectionBlock
          key={section.key}
          section={section}
          layout={layout}
          pricingMode={pricingMode}
          ctaMode={ctaMode}
          whatsAppPhone={whatsAppPhone}
          catalogName={catalogName}
          visual={visual}
        />
      ))}
    </div>
  );
}
