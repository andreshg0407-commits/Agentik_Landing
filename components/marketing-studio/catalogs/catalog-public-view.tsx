"use client";
/**
 * components/marketing-studio/catalogs/catalog-public-view.tsx
 *
 * MARKETING-STUDIO-CATALOG-PUBLIC-EXPERIENCE-01 — Commercial Public View
 *
 * Renders a professional public-facing catalog for anonymous visitors.
 * Template-aware: each templateKey produces a distinct commercial identity.
 *
 * ── ARCHITECTURE ──────────────────────────────────────────────────────────────
 *   PublicCatalogView → template accent → header → CatalogLayoutRenderer
 *   No second renderer. No new routes. Same security boundary.
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   Receives PublicCatalogView (already stripped of internal IDs).
 *   Never renders organizationId, userId, or admin metadata.
 *
 * ── BRANDING EXTENSION POINTS ─────────────────────────────────────────────────
 *   Future tenant branding sprint can hook into:
 *     BRAND_SLOT: logo — top of header
 *     BRAND_SLOT: accentColor — override template accent per org
 *     BRAND_SLOT: bannerImageUrl — hero image behind header
 *     BRAND_SLOT: footerCopy — custom org footer text
 */

import { C, T, S, R }             from "@/lib/ui/tokens";
import type { PublicCatalogView } from "@/lib/marketing-studio/catalogs/catalog-public-link-types";
import type { CatalogTemplateKey } from "@/lib/marketing-studio/catalogs/catalog-definition-types";
import { CatalogLayoutRenderer }  from "./catalog-layout-renderer";

interface Props {
  view: PublicCatalogView;
}

// ── Template accent system ─────────────────────────────────────────────────────
// Each commercial template has a distinct visual identity for public viewers.
// Uses existing C.* tokens — no new hex values introduced.

interface TemplateAccent {
  accentColor:  string;
  badgeBg:      string;
  badgeText:    string;
  templateLabel: string;
}

const TEMPLATE_ACCENTS: Record<CatalogTemplateKey, TemplateAccent> = {
  wholesale: {
    accentColor:   C.titleDeep,
    badgeBg:       C.blueLight,
    badgeText:     C.titleDeep,
    templateLabel: "Mayorista",
  },
  retail: {
    accentColor:   C.blueDark,
    badgeBg:       C.blueLight,
    badgeText:     C.blueDark,
    templateLabel: "Retail",
  },
  institutional: {
    accentColor:   C.exec,
    badgeBg:       C.execLight,
    badgeText:     C.exec,
    templateLabel: "Institucional",
  },
  campaign: {
    accentColor:   C.red,
    badgeBg:       C.redLight,
    badgeText:     C.red,
    templateLabel: "Campaña",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(date: Date | string): string {
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric", month: "long", day: "numeric",
  }).format(new Date(date));
}

// ── Unavailable page ──────────────────────────────────────────────────────────

function UnavailablePage({ reason }: { reason: "inactive" | "expired" }) {
  const title = reason === "expired"
    ? "Este catálogo ha expirado"
    : "Catálogo no disponible";
  const body  = reason === "expired"
    ? "El período de acceso a este catálogo finalizó. Contacta al vendedor para recibir el enlace actualizado."
    : "Este catálogo fue desactivado temporalmente. Contacta al vendedor para obtener acceso.";

  return (
    <div style={{
      minHeight:      "100vh",
      display:        "flex",
      flexDirection:  "column" as const,
      alignItems:     "center",
      justifyContent: "center",
      background:     C.white,
      padding:        `${S[8]}px ${S[5]}px`,
    }}>
      {/* Icon capsule */}
      <div style={{
        width:          52,
        height:         52,
        borderRadius:   R.xl,
        background:     C.surfaceAlt,
        border:         `1px solid ${C.line}`,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        marginBottom:   S[5],
        fontSize:       22,
      }}>
        📋
      </div>

      {/* Title */}
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.xl,
        fontWeight:    T.wt.bold,
        color:         C.ink,
        marginBottom:  S[3],
        textAlign:     "center" as const,
        letterSpacing: "-0.02em",
        lineHeight:    1.2,
      }}>
        {title}
      </div>

      {/* Body */}
      <div style={{
        fontFamily:   T.sans,
        fontSize:     T.sz.base,
        color:        C.inkMid,
        textAlign:    "center" as const,
        maxWidth:     360,
        lineHeight:   1.65,
        marginBottom: S[6],
      }}>
        {body}
      </div>

      {/* Trust note */}
      <div style={{
        fontFamily: T.mono,
        fontSize:   T.sz["2xs"],
        color:      C.inkGhost,
      }}>
        Catálogo gestionado con Agentik
      </div>
    </div>
  );
}

// ── Commercial header ──────────────────────────────────────────────────────────

function PublicCatalogHeader({
  view,
  accent,
}: {
  view:   PublicCatalogView;
  accent: TemplateAccent;
}) {
  const totalCount    = view.layoutResult.totalCount;
  const categoryCount = view.layoutResult.sections.filter(s => !s.isUncategorized).length;
  const updatedLabel  = fmtDate(view.catalogUpdatedAt);

  return (
    <div style={{ marginBottom: S[8] }}>

      {/* Template accent bar — primary visual identity per template */}
      <div style={{
        height:           4,
        background:       accent.accentColor,
        borderRadius:     `${R.xs}px ${R.xs}px 0 0`,
        marginBottom:     S[6],
      }} />

      {/* BRAND_SLOT: logo — render org logo here when tenant branding enabled */}

      {/* Org name + template badge row */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          S[2],
        marginBottom: S[3],
        flexWrap:     "wrap" as const,
      }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          fontWeight:    T.wt.semibold,
          color:         C.inkFaint,
          letterSpacing: "0.08em",
          textTransform: "uppercase" as const,
        }}>
          {view.orgDisplayName}
        </span>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          fontWeight:    T.wt.bold,
          color:         accent.badgeText,
          background:    accent.badgeBg,
          padding:       "2px 8px",
          borderRadius:  R.pill,
          letterSpacing: "0.04em",
        }}>
          {accent.templateLabel}
        </span>
      </div>

      {/* Catalog name — commercial headline */}
      {/* BRAND_SLOT: bannerImageUrl — hero image behind title when available */}
      <h1 style={{
        fontFamily:    T.mono,
        fontSize:      "clamp(22px, 4vw, 34px)",
        fontWeight:    T.wt.black,
        color:         C.ink,
        letterSpacing: "-0.03em",
        lineHeight:    1.1,
        margin:        0,
        marginBottom:  view.catalogDescription ? S[3] : S[5],
      }}>
        {view.catalogName}
      </h1>

      {/* Description — prose, uses T.sans */}
      {view.catalogDescription && (
        <p style={{
          fontFamily:   T.sans,
          fontSize:     T.sz.base,
          color:        C.inkMid,
          margin:       0,
          marginBottom: S[5],
          maxWidth:     640,
          lineHeight:   1.65,
        }}>
          {view.catalogDescription}
        </p>
      )}

      {/* Trust strip — product count, categories, last updated */}
      <div style={{
        display:     "flex",
        alignItems:  "center",
        gap:         S[2],
        flexWrap:    "wrap" as const,
        paddingTop:  S[4],
        borderTop:   `1px solid ${C.line}`,
      }}>
        {/* Product count */}
        <span style={{
          fontFamily:         T.mono,
          fontSize:           T.sz.sm,
          fontWeight:         T.wt.bold,
          color:              accent.accentColor,
          fontVariantNumeric: "tabular-nums",
        }}>
          {totalCount}
        </span>
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz["2xs"],
          color:      C.inkFaint,
        }}>
          {totalCount === 1 ? "producto" : "productos"}
        </span>

        {categoryCount > 0 && (
          <>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>·</span>
            <span style={{
              fontFamily:         T.mono,
              fontSize:           T.sz.sm,
              fontWeight:         T.wt.bold,
              color:              C.inkMid,
              fontVariantNumeric: "tabular-nums",
            }}>
              {categoryCount}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
              {categoryCount === 1 ? "categoría" : "categorías"}
            </span>
          </>
        )}

        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>·</span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          Actualizado {updatedLabel}
        </span>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function CatalogPublicView({ view }: Props) {
  if (view.linkStatus === "inactive" || view.linkStatus === "expired") {
    return <UnavailablePage reason={view.linkStatus} />;
  }

  const accent = TEMPLATE_ACCENTS[view.templateKey] ?? TEMPLATE_ACCENTS.retail;

  return (
    <div style={{ minHeight: "100vh", background: C.white }}>

      {/* Main content — max 960px, responsive horizontal padding */}
      <div style={{
        maxWidth: 960,
        margin:   "0 auto",
        padding:  `${S[6]}px ${S[4]}px ${S[12]}px`,
      }}>
        <PublicCatalogHeader view={view} accent={accent} />

        {/* Reuse existing renderer — no second renderer created */}
        <CatalogLayoutRenderer
          layoutResult={view.layoutResult}
          layout={view.layout}
          pricingMode={view.pricingMode}
          ctaMode={view.ctaMode}
          whatsAppPhone={view.whatsAppPhone}
          catalogName={view.catalogName}
          templateKey={view.templateKey}
        />
      </div>

      {/* Footer — BRAND_SLOT: footerCopy per org when branding enabled */}
      <div style={{
        borderTop:      `1px solid ${C.line}`,
        padding:        `${S[4]}px ${S[4]}px`,
        background:     C.surface,
      }}>
        <div style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          gap:            S[2],
          flexWrap:       "wrap" as const,
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>
            {view.orgDisplayName}
          </span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>·</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>
            Catálogo gestionado con Agentik
          </span>
        </div>
      </div>

    </div>
  );
}
