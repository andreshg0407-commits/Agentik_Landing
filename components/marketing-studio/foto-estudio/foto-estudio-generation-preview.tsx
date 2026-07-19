"use client";

/**
 * components/marketing-studio/foto-estudio/foto-estudio-generation-preview.tsx
 *
 * Live preview card — "Agentik generará"
 * Updates in real-time as the user configures the wizard.
 * Pure display — no state, no side effects.
 *
 * Sprint: AGENTIK-FOTOESTUDIO-OS-LEVEL-01
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import {
  PRODUCT_CATEGORY_LABELS,
  BRAND_LINE_LABELS,
  VISUAL_STYLE_LABELS,
  BACKGROUND_LABELS,
  ASPECT_RATIO_LABELS,
} from "@/lib/marketing-studio/foto-estudio-types";
import type {
  ProductCategory,
  BrandLine,
  VisualStyle,
  BackgroundType,
  AspectRatio,
} from "@/lib/marketing-studio/foto-estudio-types";

// ── Types ─────────────────────────────────────────────────────────────────────

type GenerationIntent = "product_photo" | "social_photo" | "social_video" | "creative_template";
type WizardStep = "upload" | "choose_outputs" | "visual_settings" | "generation";

export interface FotoEstudioGenerationPreviewProps {
  generationIntent: GenerationIntent | null;
  productCategory:  ProductCategory;
  brandLine:        BrandLine;
  sku:              string;
  aspectRatio:      AspectRatio;
  visualStyle:      VisualStyle;
  background:       BackgroundType;
  freePrompt:       string;
  imageCount:       number;
  step:             WizardStep;
  tenantId:         string;
}

// ── Derived labels ────────────────────────────────────────────────────────────

const INTENT_LABELS: Record<GenerationIntent, string> = {
  product_photo:     "Foto de producto para catálogo y tienda",
  social_photo:      "Foto optimizada para redes sociales",
  social_video:      "Video corto para Reels y TikTok",
  creative_template: "Plantilla promocional de marca",
};

const INTENT_DESTINATIONS: Record<GenerationIntent, string[]> = {
  product_photo:     ["Biblioteca", "Shopify", "Catálogo"],
  social_photo:      ["Biblioteca", "Instagram", "TikTok"],
  social_video:      ["Biblioteca", "TikTok", "Instagram Reels"],
  creative_template: ["Biblioteca", "Contenido", "WhatsApp"],
};

// ── Row helper ────────────────────────────────────────────────────────────────

function PreviewRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: S[2], alignItems: "flex-start", marginBottom: 5 }}>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
        letterSpacing: "0.04em", minWidth: 88, flexShrink: 0,
        paddingTop: 1,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
        fontWeight: T.wt.medium, lineHeight: 1.4,
      }}>
        {value}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FotoEstudioGenerationPreview({
  generationIntent,
  productCategory,
  brandLine,
  sku,
  aspectRatio,
  visualStyle,
  background,
  freePrompt,
  imageCount,
  step,
  tenantId,
}: FotoEstudioGenerationPreviewProps) {

  const isReady         = imageCount > 0 && generationIntent !== null;
  const destinations    = generationIntent ? INTENT_DESTINATIONS[generationIntent] : null;
  const intentLabel     = generationIntent ? INTENT_LABELS[generationIntent] : null;
  const categoryLabel   = tenantId === "castillitos"
    ? (PRODUCT_CATEGORY_LABELS[productCategory] ?? productCategory)
    : null;
  const brandLabel      = BRAND_LINE_LABELS[brandLine] ?? brandLine;
  const styleLabel      = `${BACKGROUND_LABELS[background] ?? background} · ${VISUAL_STYLE_LABELS[visualStyle] ?? visualStyle}`;
  const formatLabel     = ASPECT_RATIO_LABELS[aspectRatio] ?? aspectRatio;

  // On steps where we don't have full data yet, show placeholder rows
  const showStyleRows = step === "visual_settings" || step === "generation";

  return (
    <div style={{
      background:   C.blueLight,
      border:       `1px solid ${C.blueBorder}`,
      borderRadius: R.lg,
      marginBottom: S[4],
      overflow:     "hidden",
    }}>

      {/* Header */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          S[2],
        padding:      `${S[2] + 2}px ${S[3]}px`,
        borderBottom: `1px solid ${C.blueBorder}`,
        background:   `${C.blueDark}08`,
      }}>
        <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>⚡</span>
        <span style={{
          fontFamily:    T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
          color:         C.blueDark, letterSpacing: "0.02em", flex: 1,
        }}>
          Agentik generará
        </span>
        {/* Live readiness dot */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: isReady ? "#10b981" : C.inkGhost,
            boxShadow: isReady ? "0 0 0 2px #10b98120" : "none",
            display: "inline-block",
          }} />
          <span style={{
            fontFamily: T.mono, fontSize: 9, color: isReady ? "#059669" : C.inkFaint,
            letterSpacing: "0.04em",
          }}>
            {isReady ? "listo" : "esperando"}
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: `${S[3]}px ${S[3]}px ${S[2]}px` }}>

        {/* Intent label */}
        {intentLabel ? (
          <div style={{
            fontFamily:   T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
            color:        C.blueDark, marginBottom: S[3], lineHeight: 1.3,
          }}>
            {intentLabel}
          </div>
        ) : (
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
            marginBottom: S[3], fontStyle: "italic",
          }}>
            Elige el tipo de contenido en el paso siguiente…
          </div>
        )}

        {/* Key rows */}
        {sku && <PreviewRow label="Producto" value={sku} />}
        {categoryLabel && <PreviewRow label="Categoría" value={categoryLabel} />}
        <PreviewRow label="Línea" value={brandLabel} />
        {showStyleRows && <PreviewRow label="Estilo" value={styleLabel} />}
        {showStyleRows && <PreviewRow label="Formato" value={formatLabel} />}
        {freePrompt.trim() && (
          <PreviewRow label="Dirección IA" value={`"${freePrompt.trim()}"`} />
        )}
        {imageCount > 0 && (
          <PreviewRow
            label="Fotos"
            value={`${imageCount} foto${imageCount !== 1 ? "s" : ""} subida${imageCount !== 1 ? "s" : ""}`}
          />
        )}

      </div>

      {/* Destinations footer */}
      {destinations && (
        <div style={{
          padding:     `${S[2]}px ${S[3]}px`,
          borderTop:   `1px solid ${C.blueBorder}`,
          background:  `${C.blueDark}05`,
          display:     "flex", alignItems: "center", gap: S[2], flexWrap: "wrap",
        }}>
          <span style={{
            fontFamily: T.mono, fontSize: 9, color: C.inkFaint,
            letterSpacing: "0.06em", textTransform: "uppercase",
            flexShrink: 0,
          }}>
            Destino
          </span>
          {destinations.map((dest, i) => (
            <span key={dest} style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark,
              background: `${C.blueDark}10`, border: `1px solid ${C.blueBorder}`,
              borderRadius: R.pill, padding: `1px 8px`,
              fontWeight: T.wt.medium,
            }}>
              {dest}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
