/**
 * lib/marketing-studio/catalogs/catalog-pdf-renderer.tsx
 *
 * MARKETING-STUDIO-CATALOG-EXPORTS-01 — PDF Renderer
 *
 * React PDF component tree for catalog export.
 * Uses @react-pdf/renderer v4 (server-side rendering via renderToBuffer).
 *
 * ── ARCHITECTURE ─────────────────────────────────────────────────────────────
 *   Receives CatalogLayoutResult (already resolved by catalog-query-service)
 *   → applies template visual config → renders PDF document.
 *
 *   NO data fetching here. All data arrives pre-resolved.
 *   NO business logic. Pure rendering.
 *
 * ── TEMPLATE VISUAL CONFIG ───────────────────────────────────────────────────
 *   wholesale:     4 cols, compact, small images, SKU visible, dense
 *   retail:        3 cols, standard, large images, price prominent
 *   institutional: 3 cols, clean, no price emphasis
 *   campaign:      2 cols, spacious, hero images
 *
 * SERVER ONLY — import only from API routes or server services.
 */

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  Link,
  StyleSheet,
} from "@react-pdf/renderer";

import type {
  CatalogLayout,
  CatalogTemplateKey,
  CtaMode,
  PricingMode,
} from "./catalog-definition-types";
import type { CatalogLayoutResult, CatalogCategorySection } from "./catalog-layout-engine";
import type { CatalogProductItem } from "./catalog-query-service";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CatalogPdfRenderProps {
  catalogName:        string;
  catalogDescription: string | null;
  orgDisplayName:     string;
  layout:             CatalogLayout;
  pricingMode:        PricingMode;
  ctaMode:            CtaMode;
  whatsAppPhone:      string | null;
  templateKey:        CatalogTemplateKey;
  layoutResult:       CatalogLayoutResult;
  generatedAt:        Date;
}

// ── Template visual config ────────────────────────────────────────────────────

interface PdfTemplateConfig {
  cols:        number;
  imageHeight: number;
  showSku:     boolean;
  cardPadding: number;
  titleSize:   number;
  bodySize:    number;
  captionSize: number;
  sectionGap:  number;
}

function getPdfTemplateConfig(templateKey: CatalogTemplateKey): PdfTemplateConfig {
  switch (templateKey) {
    case "wholesale":
      return { cols: 4, imageHeight: 55,  showSku: true,  cardPadding: 5,  titleSize: 8,  bodySize: 7,  captionSize: 6,  sectionGap: 10 };
    case "institutional":
      return { cols: 3, imageHeight: 75,  showSku: true,  cardPadding: 7,  titleSize: 9,  bodySize: 8,  captionSize: 7,  sectionGap: 14 };
    case "campaign":
      return { cols: 2, imageHeight: 130, showSku: false, cardPadding: 9,  titleSize: 10, bodySize: 8,  captionSize: 7,  sectionGap: 18 };
    case "retail":
    default:
      return { cols: 3, imageHeight: 90,  showSku: true,  cardPadding: 7,  titleSize: 9,  bodySize: 8,  captionSize: 7,  sectionGap: 14 };
  }
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const PDF_COLORS = {
  ink:       "#0F172A",
  inkMid:    "#475569",
  inkFaint:  "#94A3B8",
  inkGhost:  "#CBD5E1",
  blueDark:  "#004AAD",
  green:     "#16A34A",
  surface:   "#F8FAFC",
  line:      "#E2E8F0",
  white:     "#FFFFFF",
  coverBg:   "#001F4D",
};

const PAGE = {
  width:   595.28,
  height:  841.89,
  marginH: 36,
  marginV: 40,
};
const CONTENT_WIDTH = PAGE.width - PAGE.marginH * 2;  // 523.28pt

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  // ── Pages ──
  page: {
    fontFamily:      "Helvetica",
    paddingTop:      PAGE.marginV,
    paddingBottom:   PAGE.marginV + 16,  // extra for footer
    paddingHorizontal: PAGE.marginH,
    backgroundColor: PDF_COLORS.white,
  },
  coverPage: {
    fontFamily:      "Helvetica",
    backgroundColor: PDF_COLORS.white,
    padding:         0,
  },

  // ── Cover ──
  coverHeader: {
    backgroundColor: PDF_COLORS.coverBg,
    padding:         40,
    paddingBottom:   48,
    minHeight:       220,
    justifyContent:  "flex-end",
  },
  coverOrgLabel: {
    fontSize:      8,
    fontFamily:    "Helvetica",
    color:         PDF_COLORS.inkGhost,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom:  10,
  },
  coverTitle: {
    fontSize:      28,
    fontFamily:    "Helvetica-Bold",
    color:         PDF_COLORS.white,
    lineHeight:    1.2,
    marginBottom:  12,
  },
  coverDescription: {
    fontSize:      11,
    fontFamily:    "Helvetica",
    color:         "#94A3B8",
    lineHeight:    1.6,
    maxWidth:      400,
  },
  coverBody: {
    padding:        40,
    flex:           1,
  },
  coverMetaGrid: {
    flexDirection: "row",
    flexWrap:      "wrap",
    gap:           12,
    marginTop:     32,
  },
  coverMetaChip: {
    backgroundColor: PDF_COLORS.surface,
    border:          "1pt solid #E2E8F0",
    borderRadius:    4,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  coverMetaLabel: {
    fontSize:   7,
    fontFamily: "Helvetica",
    color:      PDF_COLORS.inkFaint,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  coverMetaValue: {
    fontSize:   9,
    fontFamily: "Helvetica-Bold",
    color:      PDF_COLORS.ink,
  },
  coverFooter: {
    borderTop:    "1pt solid #E2E8F0",
    paddingTop:   12,
    paddingHorizontal: 40,
    paddingBottom:    20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems:     "center",
  },
  coverFooterBrand: {
    fontSize:   8,
    fontFamily: "Helvetica",
    color:      PDF_COLORS.inkFaint,
  },
  coverFooterDate: {
    fontSize:   8,
    fontFamily: "Helvetica",
    color:      PDF_COLORS.inkFaint,
  },

  // ── Section header ──
  sectionHeader: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            8,
    paddingBottom:  6,
    marginBottom:   10,
    borderBottom:   "2pt solid #004AAD",
    marginTop:      4,
  },
  sectionHeaderUncategorized: {
    borderBottomColor: "#E2E8F0",
  },
  sectionLabel: {
    fontSize:   11,
    fontFamily: "Helvetica-Bold",
    color:      PDF_COLORS.ink,
  },
  sectionLabelUncategorized: {
    color: PDF_COLORS.inkFaint,
  },
  sectionBadge: {
    fontSize:        7,
    fontFamily:      "Helvetica-Bold",
    color:           PDF_COLORS.white,
    backgroundColor: PDF_COLORS.blueDark,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius:    10,
  },
  sectionBadgeUncategorized: {
    backgroundColor: PDF_COLORS.inkFaint,
  },

  // ── Product grid ──
  grid: {
    flexDirection: "row",
    flexWrap:      "wrap",
    marginHorizontal: -4,
  },

  // ── Product card (grid) ──
  gridCard: {
    flexDirection: "column",
    borderRadius:  4,
    overflow:      "hidden",
    border:        "1pt solid #E2E8F0",
    backgroundColor: PDF_COLORS.white,
    margin:        4,
  },
  gridImageContainer: {
    width:         "100%",
    backgroundColor: "#F1F5F9",
  },
  gridImage: {
    width:    "100%",
    objectFit: "cover",
  },
  gridPlaceholder: {
    backgroundColor: "#F1F5F9",
    width:           "100%",
    alignItems:      "center",
    justifyContent:  "center",
  },
  gridPlaceholderText: {
    fontSize:  7,
    fontFamily: "Helvetica",
    color:     PDF_COLORS.inkGhost,
  },
  gridBody: {
    flexDirection: "column",
    gap:           2,
  },
  gridProductName: {
    fontFamily: "Helvetica-Bold",
    color:      PDF_COLORS.ink,
    lineHeight: 1.3,
  },
  gridProductSku: {
    fontFamily: "Helvetica",
    color:      PDF_COLORS.inkFaint,
  },
  gridProductPrice: {
    fontFamily: "Helvetica-Bold",
    color:      PDF_COLORS.ink,
  },
  gridProductCta: {
    fontFamily: "Helvetica",
    color:      PDF_COLORS.green,
  },

  // ── Product list row ──
  listRow: {
    flexDirection: "row",
    alignItems:    "center",
    borderBottom:  "1pt solid #F1F5F9",
    paddingVertical: 6,
    gap:           10,
  },
  listThumb: {
    width:         44,
    height:        44,
    borderRadius:  3,
    backgroundColor: "#F1F5F9",
    overflow:      "hidden",
    flexShrink:    0,
  },
  listThumbImage: {
    width:  44,
    height: 44,
    objectFit: "cover",
  },
  listInfo: {
    flex:    1,
    flexDirection: "column",
    gap:     2,
  },
  listProductName: {
    fontFamily: "Helvetica-Bold",
    fontSize:   8.5,
    color:      PDF_COLORS.ink,
  },
  listProductSku: {
    fontFamily: "Helvetica",
    fontSize:   7,
    color:      PDF_COLORS.inkFaint,
  },
  listProductPrice: {
    fontFamily: "Helvetica-Bold",
    fontSize:   8.5,
    color:      PDF_COLORS.ink,
    flexShrink: 0,
    textAlign:  "right",
  },
  listProductCta: {
    fontFamily: "Helvetica",
    fontSize:   7,
    color:      PDF_COLORS.green,
    flexShrink: 0,
    textAlign:  "right",
  },

  // ── Footer ──
  pageFooter: {
    position:   "absolute",
    bottom:     16,
    left:       PAGE.marginH,
    right:      PAGE.marginH,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems:  "center",
    borderTop:   "1pt solid #E2E8F0",
    paddingTop:  5,
  },
  footerText: {
    fontSize:   7,
    fontFamily: "Helvetica",
    color:      PDF_COLORS.inkFaint,
  },
  footerPageNum: {
    fontSize:   7,
    fontFamily: "Helvetica-Bold",
    color:      PDF_COLORS.inkFaint,
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric", month: "long", day: "numeric",
  }).format(date);
}

function formatPrice(price: number, currency: string): string {
  return `${currency} ${price.toLocaleString("es-CO")}`;
}

const TEMPLATE_LABELS: Record<CatalogTemplateKey, string> = {
  wholesale:     "Mayorista",
  retail:        "Retail",
  institutional: "Institucional",
  campaign:      "Campaña",
};

// ── Cover Page ────────────────────────────────────────────────────────────────

function CoverPage({
  catalogName, catalogDescription, orgDisplayName,
  templateKey, totalCount, generatedAt,
}: {
  catalogName:        string;
  catalogDescription: string | null;
  orgDisplayName:     string;
  templateKey:        CatalogTemplateKey;
  totalCount:         number;
  generatedAt:        Date;
}) {
  return (
    <Page size="A4" style={S.coverPage}>
      {/* Dark header band */}
      <View style={S.coverHeader}>
        <Text style={S.coverOrgLabel}>{orgDisplayName}</Text>
        <Text style={S.coverTitle}>{catalogName}</Text>
        {catalogDescription && (
          <Text style={S.coverDescription}>{catalogDescription}</Text>
        )}
      </View>

      {/* Metadata */}
      <View style={S.coverBody}>
        <View style={S.coverMetaGrid}>
          <View style={S.coverMetaChip}>
            <Text style={S.coverMetaLabel}>Plantilla</Text>
            <Text style={S.coverMetaValue}>{TEMPLATE_LABELS[templateKey]}</Text>
          </View>
          <View style={S.coverMetaChip}>
            <Text style={S.coverMetaLabel}>Productos</Text>
            <Text style={S.coverMetaValue}>{totalCount}</Text>
          </View>
          <View style={S.coverMetaChip}>
            <Text style={S.coverMetaLabel}>Generado</Text>
            <Text style={S.coverMetaValue}>{formatDate(generatedAt)}</Text>
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={S.coverFooter}>
        <Text style={S.coverFooterBrand}>Catálogo generado con Agentik</Text>
        <Text style={S.coverFooterDate}>{formatDate(generatedAt)}</Text>
      </View>
    </Page>
  );
}

// ── Product Card (Grid) ───────────────────────────────────────────────────────

function GridProductCard({
  item, config, pricingMode, ctaMode, whatsAppPhone, cardWidth,
}: {
  item:          CatalogProductItem;
  config:        PdfTemplateConfig;
  pricingMode:   PricingMode;
  ctaMode:       CtaMode;
  whatsAppPhone: string | null;
  cardWidth:     number;
}) {
  const showPrice = pricingMode === "with_prices" && item.price != null;
  const showCta   = ctaMode === "whatsapp_order" && !!whatsAppPhone;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (
    <View style={{ ...S.gridCard, width: cardWidth } as any}>
      {item.heroAssetUrl ? (
        <View style={{ ...S.gridImageContainer, height: config.imageHeight } as any}>
          <Image style={{ ...S.gridImage, height: config.imageHeight } as any} src={item.heroAssetUrl} />
        </View>
      ) : (
        <View style={{ ...S.gridPlaceholder, height: config.imageHeight } as any}>
          <Text style={S.gridPlaceholderText}>Sin imagen</Text>
        </View>
      )}

      <View style={{ ...S.gridBody, padding: config.cardPadding } as any}>
        <Text style={{ ...S.gridProductName, fontSize: config.titleSize } as any}>
          {item.name}
        </Text>

        {config.showSku && item.sku && (
          <Text style={{ ...S.gridProductSku, fontSize: config.captionSize } as any}>
            Ref: {item.sku}
          </Text>
        )}

        {showPrice && (
          <Text style={{ ...S.gridProductPrice, fontSize: config.bodySize, marginTop: 2 } as any}>
            {formatPrice(item.price!, item.currency)}
          </Text>
        )}

        {showCta && (
          <Text style={{ ...S.gridProductCta, fontSize: config.captionSize, marginTop: 2 } as any}>
            WhatsApp {whatsAppPhone}
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Product Row (List) ────────────────────────────────────────────────────────

function ListProductRow({
  item, pricingMode, ctaMode, whatsAppPhone,
}: {
  item:          CatalogProductItem;
  pricingMode:   PricingMode;
  ctaMode:       CtaMode;
  whatsAppPhone: string | null;
}) {
  const showPrice = pricingMode === "with_prices" && item.price != null;
  const showCta   = ctaMode === "whatsapp_order" && !!whatsAppPhone;

  return (
    <View style={S.listRow}>
      {/* Thumbnail */}
      <View style={S.listThumb}>
        {item.heroAssetUrl ? (
          <Image style={S.listThumbImage} src={item.heroAssetUrl} />
        ) : (
          <View style={{ width: 44, height: 44, backgroundColor: "#F1F5F9", borderRadius: 3, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 6, color: PDF_COLORS.inkGhost, fontFamily: "Helvetica" }}>—</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={S.listInfo}>
        <Text style={S.listProductName}>{item.name}</Text>
        {item.sku && (
          <Text style={S.listProductSku}>Ref: {item.sku}</Text>
        )}
      </View>

      {/* Price + CTA */}
      <View style={{ flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
        {showPrice && (
          <Text style={S.listProductPrice}>{formatPrice(item.price!, item.currency)}</Text>
        )}
        {showCta && (
          <Text style={S.listProductCta}>WhatsApp</Text>
        )}
      </View>
    </View>
  );
}

// ── Category Section ──────────────────────────────────────────────────────────

function CategorySection({
  section, layout, config, pricingMode, ctaMode, whatsAppPhone, cardWidth,
}: {
  section:       CatalogCategorySection;
  layout:        CatalogLayout;
  config:        PdfTemplateConfig;
  pricingMode:   PricingMode;
  ctaMode:       CtaMode;
  whatsAppPhone: string | null;
  cardWidth:     number;
}) {
  return (
    <View style={{ marginBottom: config.sectionGap }}>
      {/* Section header */}
      <View style={section.isUncategorized
        ? [S.sectionHeader, S.sectionHeaderUncategorized]
        : S.sectionHeader
      }>
        <Text style={section.isUncategorized
          ? [S.sectionLabel, S.sectionLabelUncategorized]
          : S.sectionLabel
        }>
          {section.label}
        </Text>
        <Text style={section.isUncategorized
          ? [S.sectionBadge, S.sectionBadgeUncategorized]
          : S.sectionBadge
        }>
          {section.count}
        </Text>
      </View>

      {/* Products */}
      {layout === "GRID_STANDARD" ? (
        <View style={S.grid}>
          {section.items.map(item => (
            <GridProductCard
              key={item.id}
              item={item}
              config={config}
              pricingMode={pricingMode}
              ctaMode={ctaMode}
              whatsAppPhone={whatsAppPhone}
              cardWidth={cardWidth}
            />
          ))}
        </View>
      ) : (
        <View>
          {section.items.map(item => (
            <ListProductRow
              key={item.id}
              item={item}
              pricingMode={pricingMode}
              ctaMode={ctaMode}
              whatsAppPhone={whatsAppPhone}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ── Page Footer ───────────────────────────────────────────────────────────────

function PageFooter({ catalogName, generatedAt }: { catalogName: string; generatedAt: Date }) {
  return (
    <View style={S.pageFooter} fixed>
      <Text style={S.footerText}>{catalogName}</Text>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Text
        style={S.footerPageNum}
        render={({ pageNumber, totalPages }: any) => `${pageNumber} / ${totalPages}`}
      />
      <Text style={S.footerText}>{formatDate(generatedAt)}</Text>
    </View>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyCatalogPage({ catalogName }: { catalogName: string }) {
  return (
    <Page size="A4" style={S.page}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: PDF_COLORS.inkMid, marginBottom: 8 }}>
          Sin productos
        </Text>
        <Text style={{ fontSize: 9, fontFamily: "Helvetica", color: PDF_COLORS.inkFaint, textAlign: "center", maxWidth: 300 }}>
          El catálogo "{catalogName}" no contiene productos que cumplan los filtros configurados.
        </Text>
      </View>
      <PageFooter catalogName={catalogName} generatedAt={new Date()} />
    </Page>
  );
}

// ── Main Document ─────────────────────────────────────────────────────────────

export function CatalogPdfDocument({
  catalogName, catalogDescription, orgDisplayName,
  layout, pricingMode, ctaMode, whatsAppPhone,
  templateKey, layoutResult, generatedAt,
}: CatalogPdfRenderProps) {
  const config    = getPdfTemplateConfig(templateKey);
  const cardWidth = (CONTENT_WIDTH - 8) / config.cols - 8;  // account for margins

  return (
    <Document
      title={catalogName}
      author={orgDisplayName}
      subject={`Catálogo ${TEMPLATE_LABELS[templateKey]}`}
      creator="Agentik Marketing Studio"
      producer="@react-pdf/renderer"
    >
      {/* Cover page */}
      <CoverPage
        catalogName={catalogName}
        catalogDescription={catalogDescription}
        orgDisplayName={orgDisplayName}
        templateKey={templateKey}
        totalCount={layoutResult.totalCount}
        generatedAt={generatedAt}
      />

      {/* Content: empty state OR category sections */}
      {layoutResult.totalCount === 0 ? (
        <EmptyCatalogPage catalogName={catalogName} />
      ) : (
        <Page size="A4" style={S.page}>
          {layoutResult.sections.map(section => (
            <CategorySection
              key={section.key}
              section={section}
              layout={layout}
              config={config}
              pricingMode={pricingMode}
              ctaMode={ctaMode}
              whatsAppPhone={whatsAppPhone}
              cardWidth={cardWidth}
            />
          ))}
          <PageFooter catalogName={catalogName} generatedAt={generatedAt} />
        </Page>
      )}
    </Document>
  );
}
