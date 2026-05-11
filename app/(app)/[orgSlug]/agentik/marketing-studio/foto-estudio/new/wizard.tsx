"use client";

/**
 * FotoEstudioWizard — 4-step creative generation flow.
 *
 * Step 1: Upload photos (front required, back + 2 details optional)
 * Step 2: Choose output types (multi-select cards)
 * Step 3: Visual settings (style, background, format, count)
 * Step 4: Generation + asset approval
 *
 * UI: Spanish Latam. Code: English.
 * No Shopify, no social publishing, no commercial data — purely creative.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Link                              from "next/link";
import { C, T, S, R, E }               from "@/lib/ui/tokens";
import { Badge, Panel, PanelHeader } from "@/components/shell/primitives";
import {
  VISUAL_STYLE_LABELS,
  BACKGROUND_LABELS,
  ASPECT_RATIO_LABELS,
  GARMENT_TYPE_LABELS,
  BRAND_LINE_LABELS,
  BRAND_LINE_DESCRIPTIONS,
  SOCIAL_PUBLICATION_LABELS,
  SOCIAL_PUBLICATION_DESCRIPTIONS,
  MODEL_TYPE_LABELS,
  BODY_TYPE_LABELS,
  VISUAL_QUALITY_LABELS,
  FRAMING_TYPE_LABELS,
  KIDS_MODEL_TYPE_LABELS,
  KIDS_AGE_RANGE_LABELS,
  KIDS_VISUAL_TRAIT_LABELS,
  KIDS_VISUAL_STYLE_LABELS,
  KIDS_EXPRESSION_LABELS,
} from "@/lib/marketing-studio/foto-estudio-types";
import type {
  FotoOutputType,
  VisualStyle,
  BackgroundType,
  AspectRatio,
  GarmentType,
  BrandLine,
  SocialPublicationType,
  ModelType,
  BodyType,
  VisualQuality,
  FramingType,
  KidsModelType,
  KidsAgeRange,
  KidsVisualTrait,
  KidsVisualStyle,
  KidsExpression,
} from "@/lib/marketing-studio/foto-estudio-types";

// ── Types ─────────────────────────────────────────────────────────────────────

type WizardStep = "upload" | "choose_outputs" | "visual_settings" | "generation";

type GenerationIntent = "product_photo" | "social_photo" | "social_video" | "creative_template";

interface AssetState {
  id:               string;
  assetType:        string;
  generationStatus: string;
  assetUrl?:        string | null;
  reviewStatus:     string;
}

// ── Session ID generator ─────────────────────────────────────────────────────

function genSessionId(): string {
  return `ss_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ── Step label map ────────────────────────────────────────────────────────────

const STEP_LABELS: Record<WizardStep, string> = {
  upload:          "Fotos",
  choose_outputs:  "Generar",
  visual_settings: "Estilo",
  generation:      "Resultado",
};
const STEP_ORDER: WizardStep[] = ["upload", "choose_outputs", "visual_settings", "generation"];

// ── Output type card definitions ──────────────────────────────────────────────

const OUTPUT_CARDS: Array<{
  value:        FotoOutputType;
  icon:         string;
  label:        string;
  desc:         string;
  formats:      string;
  /** "front" = requires frontUrl, "back" = requires backUrl, "any" = requires either */
  requiresAngle: "front" | "back" | "any";
}> = [
  {
    value:        "catalog_photo",
    icon:         "📸",
    label:        "Foto frontal",
    desc:         "Fondo limpio, encuadre e-commerce. Lista para tienda.",
    formats:      "JPEG · PNG · hasta 4K",
    requiresAngle: "front",
  },
  {
    value:        "back_photo",
    icon:         "🔙",
    label:        "Foto trasera",
    desc:         "Vista trasera con fondo limpio. Ideal para fichas de producto.",
    formats:      "JPEG · PNG · hasta 4K",
    requiresAngle: "back",
  },
  {
    value:        "social_photo",
    icon:         "🖼️",
    label:        "Foto para redes",
    desc:         "Recortada y estilizada para feed de Instagram o TikTok.",
    formats:      "1:1 · 4:5 · 9:16",
    requiresAngle: "front",
  },
  {
    value:        "short_video",
    icon:         "🎬",
    label:        "Video corto",
    desc:         "Clip de 8 s en vertical — óptimo para Reels y TikTok.",
    formats:      "MP4 · 9:16 · 1080p",
    requiresAngle: "front",
  },
  {
    value:        "custom_template",
    icon:         "🎨",
    label:        "Plantilla personalizada",
    desc:         "Composición de marca — lookbook, flyer, banner.",
    formats:      "Según plantilla",
    requiresAngle: "front",
  },
];

// ── Visual styles ─────────────────────────────────────────────────────────────

const VISUAL_STYLES:    VisualStyle[]           = ["clean_studio", "editorial", "urban", "lifestyle", "luxury", "minimal"];
const BACKGROUNDS:      BackgroundType[]         = ["white", "light_gray", "black", "gradient", "outdoor_scene", "indoor_scene", "transparent"];
const ASPECT_RATIOS:    AspectRatio[]            = ["1:1", "9:16", "4:5", "4:3", "16:9"];
const SOCIAL_PUB_TYPES:    SocialPublicationType[]  = ["feed", "reel", "story"];
const MODEL_TYPES:         ModelType[]              = ["latina_rubia", "latina_morena", "europea_rubia", "morena_editorial", "luxury_curvy", "casual_urbana", "fitness", "premium_catalogo", "personalizada"];
const BODY_TYPES:          BodyType[]               = ["slim", "curvy", "voluptuosa", "atletica", "plus_size", "petite", "personalizada"];
const VISUAL_QUALITIES:    VisualQuality[]          = ["standard_hd", "full_hd", "2k_editorial", "4k_premium"];
const FRAMING_TYPES:       FramingType[]            = ["frontal_catalogo", "americano", "full_body_editorial", "close_up_producto", "back_view", "side_view", "tres_cuartos", "movimiento_lifestyle"];
// Kids profile option arrays (Castillitos)
const KIDS_MODEL_TYPES:    KidsModelType[]    = ["nino", "nina", "bebe_nino", "bebe_nina", "unisex_infantil", "sin_modelo", "flat_lay", "maniqui", "producto_ambientado"];
const KIDS_AGE_RANGES:     KidsAgeRange[]     = ["0_12m", "1_3", "4_6", "7_9", "10_12", "teen"];
const KIDS_VISUAL_TRAITS:  KidsVisualTrait[]  = ["latino", "afro", "rubio", "moreno", "mixto_internacional", "personalizado"];
const KIDS_VISUAL_STYLES:  KidsVisualStyle[]  = ["catalogo_comercial", "lifestyle_infantil", "escolar", "jugueton", "premium_retail", "marketplace"];
const KIDS_EXPRESSIONS:    KidsExpression[]   = ["sonriente", "natural", "activo", "formal_escolar", "neutro_catalogo"];

// ── Tenant-aware wizard options ───────────────────────────────────────────────

// TODO: Rename garmentTypes → productCategories (future sprint).
// These no longer represent garment types. They are BUSINESS categories.
// hiddenLines is already enforced at the data level — nothing from that array is rendered.
interface TenantWizardOptions {
  /** Product categories shown in Step 3 (replaces garment-type picker). */
  garmentTypes:        GarmentType[];
  /** Commercial lines shown in Step 3 — already excludes fiscal-only lines. */
  brandLines:          BrandLine[];
  /**
   * Lines intentionally hidden from the wizard UI (fiscal/contable only).
   * Not rendered; kept for documentation and future rule enforcement.
   */
  hiddenLines?:        BrandLine[];
  garmentSectionLabel: string;
  brandSectionLabel:   string;
  /** Show adult fashion model profile (Do Jeans). */
  showModelProfile:    boolean;
  /** Show kids visual context profile (Castillitos). */
  showKidsProfile:     boolean;
  // Step 1 labels
  step1PanelTitle:     string;
  frontLabel:          string;
  backLabel:           string;
  skuPlaceholder:      string;
}

function getTenantWizardOptions(tenantId: string): TenantWizardOptions {
  if (tenantId === "castillitos") {
    return {
      // Castillitos business categories — broad commercial segments, NOT garment subtypes.
      // Ropa niño/niña/bebé already contains bodies, pijamas, sets, etc.
      // Do NOT add subcategories like "bodys", "pijamas", "camisetas" here.
      garmentTypes: [
        "ropa_nino", "ropa_nina", "bebe",
        "juguete", "accesorio_bebe", "transporte", "aseo",
        "otro",
      ],
      // Commercial lines visible in wizard. Fiscal-only lines are in hiddenLines.
      brandLines:          ["kids_fun", "latin_kids", "importacion"],
      // Hidden from UI — fiscal/contable only, no marketing assets generated.
      hiddenLines:         ["otros", "institutional"],
      garmentSectionLabel: "Categoría de producto",
      brandSectionLabel:   "Línea",
      showModelProfile:    false,
      showKidsProfile:     true,
      step1PanelTitle:     "Sube las fotos del producto",
      frontLabel:          "Foto principal del producto",
      backLabel:           "Foto secundaria",
      skuPlaceholder:      "Ej. LK-SET-SONIC-228 / JUG-001 / ESCOLAR-045",
    };
  }
  // Default / Do Jeans fashion
  return {
    garmentTypes:        ["jean", "short", "falda", "body", "top", "chaqueta", "vestido", "otro"],
    brandLines:          ["luxury", "casual"],
    garmentSectionLabel: "Tipo de prenda",
    brandSectionLabel:   "Línea de marca",
    showModelProfile:    true,
    showKidsProfile:     false,
    step1PanelTitle:     "Sube las fotos del producto",
    frontLabel:          "Frontal",
    backLabel:           "Trasera",
    skuPlaceholder:      "Ej. PROD-001 / VAQUERO-AZ-32",
  };
}

// ── Tenant-aware output cards ─────────────────────────────────────────────────

type OutputCardDef = typeof OUTPUT_CARDS[number];

function getOutputCards(tenantId: string): OutputCardDef[] {
  if (tenantId === "castillitos") {
    return [
      {
        value:         "catalog_photo",
        icon:          "📸",
        label:         "Foto de producto",
        desc:          "Fondo limpio, encuadre catálogo. Lista para tienda y e-commerce.",
        formats:       "JPEG · PNG · hasta 4K",
        requiresAngle: "front",
      },
      {
        value:         "back_photo",
        icon:          "🔙",
        label:         "Foto secundaria",
        desc:          "Vista adicional del producto con fondo limpio.",
        formats:       "JPEG · PNG · hasta 4K",
        requiresAngle: "back",
      },
      {
        value:         "social_photo",
        icon:          "🖼️",
        label:         "Foto para redes",
        desc:          "Composición lista para feed de Instagram o TikTok.",
        formats:       "1:1 · 4:5 · 9:16",
        requiresAngle: "front",
      },
      {
        value:         "short_video",
        icon:          "🎬",
        label:         "Video corto para redes",
        desc:          "Clip de 8 s en vertical — óptimo para Reels y TikTok.",
        formats:       "MP4 · 9:16 · 1080p",
        requiresAngle: "front",
      },
      {
        value:         "custom_template",
        icon:          "🎨",
        label:         "Plantilla promocional",
        desc:          "Composición de marca — flyer, banner, promo campaña.",
        formats:       "Según plantilla",
        requiresAngle: "front",
      },
    ] as OutputCardDef[];
  }
  return OUTPUT_CARDS;
}

// ── Intent card definitions ───────────────────────────────────────────────────

const INTENT_CARDS: Array<{
  value: GenerationIntent;
  icon:  string;
  title: string;
  desc:  string;
  uses:  string;
}> = [
  {
    value: "product_photo",
    icon:  "📸",
    title: "Foto de producto",
    desc:  "Crea imágenes limpias para ecommerce, catálogo, Shopify y galería.",
    uses:  "Producto · catálogo · tienda · CRM",
  },
  {
    value: "social_photo",
    icon:  "🖼️",
    title: "Foto para redes",
    desc:  "Diseña piezas adaptadas para Instagram, TikTok, Facebook, WhatsApp o Google Ads.",
    uses:  "Feed · historias · reels · anuncios",
  },
  {
    value: "social_video",
    icon:  "🎬",
    title: "Video para redes",
    desc:  "Genera clips cortos con o sin modelo usando fotos de producto o una escena guiada.",
    uses:  "Reels · TikTok · shorts · campañas",
  },
  {
    value: "creative_template",
    icon:  "🎨",
    title: "Plantillas / catálogos / banners / carruseles",
    desc:  "Crea piezas comerciales usando productos y activos aprobados desde la Biblioteca Creativa.",
    uses:  "Flyers · banners · catálogos · carruseles",
  },
];

// ── Intent → output type auto-mapping ─────────────────────────────────────────

const INTENT_TO_OUTPUTS: Record<GenerationIntent, FotoOutputType[]> = {
  product_photo:     ["catalog_photo"],
  social_photo:      ["social_photo"],
  social_video:      ["short_video"],
  creative_template: ["custom_template"],
};

const ASSET_META: Record<string, { icon: string; label: string }> = {
  front_clean:    { icon: "📸", label: "Vista frontal" },
  back_clean:     { icon: "🔙", label: "Vista trasera" },
  social_image:   { icon: "🖼️", label: "Imagen redes" },
  social_video:   { icon: "🎬", label: "Video corto"  },
  product_photo:  { icon: "🎨", label: "Plantilla"    },
};

// ── Step 3 pill-button helper ─────────────────────────────────────────────────

function pillBtn(active: boolean, compact = false): React.CSSProperties {
  return {
    padding:      compact ? `${S[1] + 2}px ${S[2]}px` : `${S[2]}px ${S[3]}px`,
    border:       active ? `2px solid ${C.brand}` : `1px solid ${C.line}`,
    borderRadius: R.md,
    background:   active ? C.brandLight : C.surface,
    cursor:       "pointer",
    fontFamily:   T.mono,
    fontSize:     compact ? T.sz.xs : T.sz.sm,
    fontWeight:   active ? T.wt.bold : T.wt.normal,
    color:        active ? C.brand : C.inkMid,
    transition:   "border-color 0.1s",
  };
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", padding: `${S[1] + 2}px ${S[2]}px`,
  border: `1px solid ${C.line}`, borderRadius: R.sm,
  fontSize: T.sz.base, fontFamily: T.mono,
  background: C.white, color: C.ink, boxSizing: "border-box", outline: "none",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: T.sz.xs, fontWeight: T.wt.bold,
  color: C.inkLight, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: S[1],
};
const btnPrimary: React.CSSProperties = {
  padding: `${S[2]}px ${S[4]}px`, background: C.brand, color: C.white,
  border: "none", borderRadius: R.md, fontSize: T.sz.base, fontWeight: T.wt.bold,
  cursor: "pointer", fontFamily: T.mono,
};
const btnPrimaryDisabled: React.CSSProperties = {
  ...btnPrimary, background: C.inkGhost, cursor: "not-allowed",
};
const btnSecondary: React.CSSProperties = {
  padding: `${S[2]}px ${S[4]}px`, background: C.surface, color: C.inkMid,
  border: `1px solid ${C.line}`, borderRadius: R.md, fontSize: T.sz.base,
  fontWeight: T.wt.medium, cursor: "pointer", fontFamily: T.mono,
};

// ── Stepper ───────────────────────────────────────────────────────────────────

function Stepper({ currentStep }: { currentStep: WizardStep }) {
  const idx = STEP_ORDER.indexOf(currentStep);
  return (
    <div style={{ display: "flex", alignItems: "flex-start",
      background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.md,
      padding: `${S[3]}px ${S[4]}px`, marginBottom: S[5], boxShadow: E.xs }}>
      {STEP_ORDER.map((step, i) => (
        <div key={step} style={{ display: "contents" }}>
          {i > 0 && (
            <div style={{ flex: 1, height: 1, background: i <= idx ? C.brand : C.inkGhost,
              alignSelf: "center", marginTop: -14 }} />
          )}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 60 }}>
            <div style={{
              width: 28, height: 28, borderRadius: R.pill,
              background: i < idx ? C.green : i === idx ? C.brand : C.inkGhost,
              color: C.white, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: T.sz.xs, fontWeight: T.wt.bold,
              boxShadow: i === idx ? `0 0 0 3px ${C.brandBorder}` : "none",
            }}>
              {i < idx ? "✓" : i + 1}
            </div>
            <div style={{
              fontSize: T.sz["2xs"],
              color: i === idx ? C.brand : i < idx ? C.green : C.inkFaint,
              fontWeight: i === idx ? T.wt.bold : T.wt.normal,
              textAlign: "center",
            }}>
              {STEP_LABELS[step]}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Action row ────────────────────────────────────────────────────────────────

function ActionRow({
  onBack, onNext, nextLabel, canNext, showBack,
}: {
  onBack?:   () => void;
  onNext?:   () => void;
  nextLabel: string;
  canNext:   boolean;
  showBack?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: S[2],
      padding: `${S[3]}px ${S[4]}px`, borderTop: `1px solid ${C.line}`, background: C.surfaceAlt }}>
      {showBack && onBack && (
        <button onClick={onBack} style={btnSecondary}>← Atrás</button>
      )}
      {onNext && (
        <button onClick={canNext ? onNext : undefined}
          style={canNext ? { ...btnPrimary, marginLeft: "auto" } : { ...btnPrimaryDisabled, marginLeft: "auto" }}>
          {nextLabel}
        </button>
      )}
    </div>
  );
}

// ── Image upload zone ─────────────────────────────────────────────────────────

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "done";  url: string; filename: string }
  | { phase: "error"; message: string };

type UploadAngle = "front" | "back" | "detail1" | "detail2";

function ImageUploadZone({
  label, required, angle, tenantId, sessionId, onUploaded,
}: {
  label:      string;
  required:   boolean;
  angle:      UploadAngle;
  tenantId:   string;
  sessionId:  string;
  onUploaded: (url: string) => void;
}) {
  const [state,      setState]      = useState<UploadState>({ phase: "idle" });
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (file: File) => {
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
      setState({ phase: "error", message: "Usa JPEG, PNG, WebP o AVIF." });
      return;
    }
    setState({ phase: "uploading" });
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("tenantId", tenantId);
      fd.append("sessionId", sessionId); fd.append("angle", angle);
      const res  = await fetch("/api/internal/uploads/r2", { method: "POST", body: fd });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) { setState({ phase: "error", message: data.error ?? "Error al subir." }); return; }
      setState({ phase: "done", url: data.url, filename: file.name });
      onUploaded(data.url);
    } catch (e) {
      setState({ phase: "error", message: e instanceof Error ? e.message : "Error de red." });
    }
  }, [angle, tenantId, sessionId, onUploaded]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    const file = e.dataTransfer.files[0]; if (file) void upload(file);
  }, [upload]);

  const isDone = state.phase === "done";
  const isUploading = state.phase === "uploading";

  return (
    <div>
      <div style={{ marginBottom: S[1] }}>
        <span style={labelStyle}>{label}</span>
        {required && <span style={{ color: C.red, marginLeft: 3 }}>*</span>}
        {!required && <span style={{ fontSize: T.sz["2xs"], color: C.inkFaint, marginLeft: 6,
          fontWeight: T.wt.normal, textTransform: "none" as const, letterSpacing: 0 }}>(opcional)</span>}
      </div>
      <div
        style={{
          border:        `2px dashed ${isDragOver ? C.brand : isDone ? C.green : C.line}`,
          borderRadius:  R.lg,
          background:    isDragOver ? `${C.brand}10` : isDone ? `${C.green}10` : C.surface,
          padding:       `${S[3]}px`,
          cursor:        isUploading ? "default" : "pointer",
          textAlign:     "center" as const,
          minHeight:     100,
          display:       "flex", flexDirection: "column" as const,
          alignItems:    "center", justifyContent: "center", gap: S[1],
          transition:    "border-color 0.15s",
        }}
        role="button" tabIndex={0}
        onClick={() => !isUploading && inputRef.current?.click()}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
      >
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif"
          style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />

        {state.phase === "idle" && (
          <>
            <div style={{ fontSize: 24 }}>📁</div>
            <div style={{ fontSize: T.sz.xs, color: C.inkMid }}>Arrastra o haz clic</div>
            <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint }}>JPEG · PNG · WebP — máx. 20 MB</div>
          </>
        )}
        {state.phase === "uploading" && (
          <><div style={{ fontSize: 20 }}>⏳</div><div style={{ fontSize: T.sz.xs, color: C.inkMid }}>Subiendo…</div></>
        )}
        {state.phase === "done" && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={(state as { phase: "done"; url: string }).url} alt=""
              style={{ maxHeight: 64, maxWidth: "100%", borderRadius: R.md, objectFit: "contain" }} />
            <div style={{ fontSize: T.sz["2xs"], color: C.green, fontWeight: T.wt.bold }}>
              ✓ {(state as { phase: "done"; filename: string }).filename}
            </div>
            <button style={{ ...btnSecondary, padding: `2px ${S[2]}px`, fontSize: T.sz["2xs"], marginTop: 2 }}
              onClick={e => { e.stopPropagation(); setState({ phase: "idle" }); onUploaded(""); }}
              type="button">Cambiar</button>
          </>
        )}
        {state.phase === "error" && (
          <>
            <div style={{ fontSize: 20 }}>⚠️</div>
            <div style={{ fontSize: T.sz.xs, color: C.red }}>{(state as { phase: "error"; message: string }).message}</div>
            <button style={{ ...btnSecondary, padding: `2px ${S[2]}px`, fontSize: T.sz["2xs"] }}
              onClick={e => { e.stopPropagation(); setState({ phase: "idle" }); }}
              type="button">Reintentar</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Step 1: Upload ────────────────────────────────────────────────────────────

function UploadStep({
  frontUrl, setFrontUrl, backUrl, setBackUrl,
  detail1Url, setDetail1Url, detail2Url, setDetail2Url,
  referenceImageUrl, setReferenceImageUrl,
  sku, setSku, onNext, tenantId, sessionId, selectedOutputs, tenantOpts,
}: {
  frontUrl:              string;
  setFrontUrl:           (v: string) => void;
  backUrl:               string;
  setBackUrl:            (v: string) => void;
  detail1Url:            string;
  setDetail1Url:         (v: string) => void;
  detail2Url:            string;
  setDetail2Url:         (v: string) => void;
  referenceImageUrl:     string;
  setReferenceImageUrl:  (v: string) => void;
  sku:                   string;
  setSku:                (v: string) => void;
  onNext:                () => void;
  tenantId:              string;
  sessionId:             string;
  selectedOutputs:       FotoOutputType[];
  tenantOpts:            TenantWizardOptions;
}) {
  const hasCustomTemplate = selectedOutputs.includes("custom_template");

  return (
    <Panel style={{ marginBottom: 0 }}>
      <PanelHeader title={tenantOpts.step1PanelTitle} icon="📦" />
      <div style={{ padding: `${S[4]}px` }}>
        <div style={{ display: "grid", gap: S[4] }}>
          {/* SKU */}
          <div>
            <label style={labelStyle} htmlFor="sku-input">SKU del producto</label>
            <input id="sku-input" style={inputStyle} type="text"
              placeholder={tenantOpts.skuPlaceholder}
              value={sku} onChange={e => setSku(e.target.value)} autoComplete="off" />
            <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 4 }}>
              Opcional. Ayuda a organizar la biblioteca.
            </div>
          </div>

          {/* 2x2 upload grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
            <ImageUploadZone label={tenantOpts.frontLabel} required={false} angle="front"   tenantId={tenantId} sessionId={sessionId} onUploaded={setFrontUrl}   />
            <ImageUploadZone label={tenantOpts.backLabel}  required={false} angle="back"    tenantId={tenantId} sessionId={sessionId} onUploaded={setBackUrl}    />
            <ImageUploadZone label="Detalle 1"             required={false} angle="detail1" tenantId={tenantId} sessionId={sessionId} onUploaded={setDetail1Url} />
            <ImageUploadZone label="Detalle 2"             required={false} angle="detail2" tenantId={tenantId} sessionId={sessionId} onUploaded={setDetail2Url} />
          </div>

          {/* Reference image — only shown when custom_template is selected */}
          {hasCustomTemplate && (
            <div>
              <div style={{ fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.brand,
                textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: S[2] }}>
                🎨 Plantilla personalizada
              </div>
              <ImageUploadZone
                label="Imagen de referencia de estilo"
                required={false}
                angle={"detail1" as UploadAngle}
                tenantId={tenantId}
                sessionId={sessionId}
                onUploaded={setReferenceImageUrl}
              />
              <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 4 }}>
                La IA copiará la composición, paleta de colores y estilo de esta imagen de referencia.
              </div>
            </div>
          )}

          <div style={{ fontSize: T.sz.xs, color: C.inkFaint,
            padding: `${S[2]}px ${S[3]}px`, background: C.surfaceAlt, borderRadius: R.sm }}>
            Sube al menos una foto para continuar.
            Cuantas más ángulos incluyas, mejores serán los resultados generados.
          </div>
        </div>
      </div>
      <ActionRow nextLabel="Continuar →" canNext={frontUrl.trim().length > 0 || backUrl.trim().length > 0} onNext={onNext} />
    </Panel>
  );
}

// ── Step 2: Choose generation intent ─────────────────────────────────────────

function ChooseOutputsStep({
  intent, onSelectIntent, onNext, onBack,
}: {
  intent:         GenerationIntent | null;
  onSelectIntent: (v: GenerationIntent) => void;
  onNext:         () => void;
  onBack:         () => void;
}) {
  return (
    <Panel style={{ marginBottom: 0 }}>
      <PanelHeader
        title="Elige el tipo de contenido que vas a producir"
        icon="🎯"
        badge={<Badge variant={intent !== null ? "brand" : "neutral"}>{intent !== null ? "Listo" : "Selecciona uno"}</Badge>}
      />
      <div style={{ padding: `${S[4]}px` }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[4] }}>
          {INTENT_CARDS.map(card => {
            const isSelected = intent === card.value;
            return (
              <button
                key={card.value}
                onClick={() => onSelectIntent(card.value)}
                style={{
                  padding:      `${S[4]}px`,
                  border:       isSelected ? `2px solid ${C.brand}` : `1px solid ${C.line}`,
                  borderRadius: R.lg,
                  background:   isSelected ? C.brandLight : C.white,
                  cursor:       "pointer",
                  textAlign:    "left" as const,
                  fontFamily:   T.mono,
                  transition:   "border-color 0.12s, background 0.12s",
                  boxShadow:    isSelected ? E.sm : E.xs,
                  position:     "relative" as const,
                }}
              >
                {isSelected && (
                  <div style={{
                    position:       "absolute" as const,
                    top:            S[2],
                    right:          S[2],
                    width:          22,
                    height:         22,
                    borderRadius:   R.pill,
                    background:     C.brand,
                    color:          C.white,
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "center",
                    fontSize:       12,
                    fontWeight:     T.wt.bold,
                  }}>✓</div>
                )}
                <div style={{ fontSize: 30, lineHeight: 1, marginBottom: S[2] }}>{card.icon}</div>
                <div style={{
                  fontWeight:   T.wt.bold,
                  fontSize:     T.sz.base,
                  color:        isSelected ? C.brand : C.ink,
                  marginBottom: S[1],
                }}>
                  {card.title}
                </div>
                <div style={{
                  fontSize:     T.sz.xs,
                  color:        C.inkMid,
                  lineHeight:   1.6,
                  marginBottom: S[3],
                }}>
                  {card.desc}
                </div>
                <div style={{
                  fontSize:     T.sz["2xs"],
                  color:        isSelected ? C.brandDark : C.inkFaint,
                  background:   isSelected ? `${C.brand}15` : C.surface,
                  border:       `1px solid ${isSelected ? C.brandBorder : C.lineSubtle}`,
                  borderRadius: R.sm,
                  padding:      `${S[1]}px ${S[2]}px`,
                  fontWeight:   T.wt.medium,
                }}>
                  {card.uses}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <ActionRow
        nextLabel="Continuar →"
        canNext={intent !== null}
        onNext={onNext}
        onBack={onBack}
        showBack={true}
      />
    </Panel>
  );
}

// ── Step 3: Visual settings ───────────────────────────────────────────────────

function VisualSettingsStep({
  visualStyle, setVisualStyle, background, setBackground,
  aspectRatio, setAspectRatio, quantity, setQuantity,
  garmentType, setGarmentType, brandLine, setBrandLine,
  socialPublicationType, setSocialPublicationType,
  modelType, setModelType, bodyType, setBodyType,
  visualQuality, setVisualQuality, framingType, setFramingType,
  modelReferenceUrl, setModelReferenceUrl,
  kidsModelType, setKidsModelType,
  kidsAgeRange, setKidsAgeRange,
  kidsVisualTrait, setKidsVisualTrait,
  kidsVisualStyle, setKidsVisualStyle,
  kidsExpression, setKidsExpression,
  onNext, onBack, selectedOutputs,
  tenantId, sessionId,
  // Sprint 3 — intent-aware fields
  generationIntent,
  socialChannel, setSocialChannel,
  socialPubType, setSocialPubType,
  socialText, setSocialText,
  socialCta, setSocialCta,
  socialCampaign, setSocialCampaign,
  videoType, setVideoType,
  videoDuration, setVideoDuration,
  videoScene, setVideoScene,
  videoCameraMove, setVideoCameraMove,
  pieceType, setPieceType,
  templateIncludePrice, setTemplateIncludePrice,
  freePrompt, setFreePrompt,
}: {
  visualStyle:              VisualStyle;
  setVisualStyle:           (v: VisualStyle) => void;
  background:               BackgroundType;
  setBackground:            (v: BackgroundType) => void;
  aspectRatio:              AspectRatio;
  setAspectRatio:           (v: AspectRatio) => void;
  quantity:                 number;
  setQuantity:              (v: number) => void;
  garmentType:              GarmentType;
  setGarmentType:           (v: GarmentType) => void;
  brandLine:                BrandLine;
  setBrandLine:             (v: BrandLine) => void;
  socialPublicationType:    SocialPublicationType;
  setSocialPublicationType: (v: SocialPublicationType) => void;
  modelType:                ModelType;
  setModelType:             (v: ModelType) => void;
  bodyType:                 BodyType;
  setBodyType:              (v: BodyType) => void;
  visualQuality:            VisualQuality;
  setVisualQuality:         (v: VisualQuality) => void;
  framingType:              FramingType;
  setFramingType:           (v: FramingType) => void;
  modelReferenceUrl:        string;
  setModelReferenceUrl:     (v: string) => void;
  kidsModelType:            KidsModelType;
  setKidsModelType:         (v: KidsModelType) => void;
  kidsAgeRange:             KidsAgeRange;
  setKidsAgeRange:          (v: KidsAgeRange) => void;
  kidsVisualTrait:          KidsVisualTrait;
  setKidsVisualTrait:       (v: KidsVisualTrait) => void;
  kidsVisualStyle:          KidsVisualStyle;
  setKidsVisualStyle:       (v: KidsVisualStyle) => void;
  kidsExpression:           KidsExpression;
  setKidsExpression:        (v: KidsExpression) => void;
  onNext:                   () => void;
  onBack:                   () => void;
  selectedOutputs:          FotoOutputType[];
  tenantId:                 string;
  sessionId:                string;
  // Sprint 3 — new types
  generationIntent:         GenerationIntent | null;
  socialChannel:            string;
  setSocialChannel:         (v: string) => void;
  socialPubType:            string;
  setSocialPubType:         (v: string) => void;
  socialText:               string;
  setSocialText:            (v: string) => void;
  socialCta:                string;
  setSocialCta:             (v: string) => void;
  socialCampaign:           string;
  setSocialCampaign:        (v: string) => void;
  videoType:                string;
  setVideoType:             (v: string) => void;
  videoDuration:            string;
  setVideoDuration:         (v: string) => void;
  videoScene:               string;
  setVideoScene:            (v: string) => void;
  videoCameraMove:          string;
  setVideoCameraMove:       (v: string) => void;
  pieceType:                string;
  setPieceType:             (v: string) => void;
  templateIncludePrice:     boolean;
  setTemplateIncludePrice:  (v: boolean) => void;
  freePrompt:               string;
  setFreePrompt:            (v: string) => void;
  // TODO [Sprint 5 — Producto]: productDescription, productPrice, productColors,
  //   productSizes, productNotes — recolectar en paso de publicación post-aprobación.
}) {
  const tenantOpts = getTenantWizardOptions(tenantId);

  // ── Minimum validation per intent ──────────────────────────────────────
  const canNext = (() => {
    if (!generationIntent) return false;
    if (generationIntent === "product_photo") {
      // "Otro" requires freePrompt so the AI has enough context to generate.
      if (garmentType === "otro") return freePrompt.trim() !== "";
      return true;
    }
    if (generationIntent === "social_photo")      return socialChannel !== "" && socialPubType !== "";
    if (generationIntent === "social_video")      return videoDuration !== "";
    if (generationIntent === "creative_template") return pieceType !== "";
    return false;
  })();

  // ── Null safety guard ───────────────────────────────────────────────────
  if (!generationIntent) {
    return (
      <Panel style={{ marginBottom: 0 }}>
        <PanelHeader title="Ajustes de producción" icon="⚙️" />
        <div style={{ padding: `${S[6]}px ${S[4]}px`, textAlign: "center" as const }}>
          <div style={{ fontSize: 36, marginBottom: S[3] }}>⚠️</div>
          <div style={{ fontSize: T.sz.base, color: C.inkMid, marginBottom: S[4] }}>
            No se seleccionó ningún tipo de contenido. Vuelve al Paso 2 para elegir.
          </div>
          <button onClick={onBack} style={btnSecondary}>← Volver al Paso 2</button>
        </div>
      </Panel>
    );
  }

  // ── Intent-specific constants ───────────────────────────────────────────
  const SOCIAL_CHANNELS = [
    { value: "instagram",  label: "Instagram" },
    { value: "tiktok",     label: "TikTok" },
    { value: "facebook",   label: "Facebook" },
    { value: "whatsapp",   label: "Estados de WhatsApp" },
    { value: "google_ads", label: "Google Ads" },
  ];
  const SOCIAL_PUB_TYPES_EXT = [
    { value: "feed",       label: "Feed" },
    { value: "historia",   label: "Historia" },
    { value: "reel_cover", label: "Reel cover" },
    { value: "anuncio",    label: "Anuncio" },
    { value: "post_promo", label: "Post promocional" },
    { value: "carrusel",   label: "Carrusel" },
  ];
  const CHANNEL_FORMAT: Record<string, string> = {
    instagram:  "Feed: 1:1 · 4:5 | Historia: 9:16 | Reel: 9:16",
    tiktok:     "9:16 · 1080×1920px",
    facebook:   "Feed: 4:5 · 1:1 | Anuncio: 1.91:1",
    whatsapp:   "Estado: 9:16 · hasta 30s",
    google_ads: "Banner: 1.91:1 | Square: 1:1",
  };
  const VIDEO_TYPES = [
    { value: "con_modelo",          label: "Con modelo",              desc: "Modelo infantil con prenda" },
    { value: "sin_modelo",          label: "Sin modelo",              desc: "Producto solo, sin persona" },
    { value: "producto_ambientado", label: "Producto ambientado",     desc: "Producto en escena o contexto" },
    { value: "desde_fotos",         label: "Desde fotos de producto", desc: "Animación a partir de fotos" },
  ];
  const CAMERA_MOVES = ["Estático", "Zoom in", "Zoom out", "Pan lateral", "Travelling", "Drone / aéreo"];
  const PIECE_TYPES = [
    { value: "flyer",               label: "Flyer",               desc: "Piezas promocionales de campaña" },
    { value: "banner_shopify",      label: "Banner Shopify",      desc: "Cabeceras y banners de tienda" },
    { value: "catalogo",            label: "Catálogo",            desc: "Grilla organizada de productos" },
    { value: "carrusel",            label: "Carrusel",            desc: "Secuencia de slides para redes" },
    { value: "plantilla_shopify",   label: "Plantilla Shopify",   desc: "Layout reutilizable de producto" },
    { value: "landing_informativa", label: "Landing informativa", desc: "Página de colección o campaña" },
  ];

  const intentLabel =
    generationIntent === "product_photo"    ? "Foto de producto" :
    generationIntent === "social_photo"     ? "Foto para redes"  :
    generationIntent === "social_video"     ? "Video para redes" :
    "Plantillas / catálogos";

  const secHeaderStyle: React.CSSProperties = {
    fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkLight,
    textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: S[3],
  };
  const secBoxStyle: React.CSSProperties = {
    border: `1px solid ${C.lineSubtle}`, borderRadius: R.md,
    padding: `${S[3]}px`, background: C.surface,
  };

  return (
    <Panel style={{ marginBottom: 0 }}>
      <PanelHeader title="Ajustes de producción" icon="⚙️"
        badge={<Badge variant="brand">{intentLabel}</Badge>} />
      <div style={{ padding: `${S[4]}px` }}>
        <div style={{ display: "grid", gap: S[4] }}>

          {/* ══ PRODUCT PHOTO ═════════════════════════════════════════════ */}
          {generationIntent === "product_photo" && (<>

            <div style={secBoxStyle}>
              <div style={secHeaderStyle}>A. Información comercial</div>
              <div style={{ display: "grid", gap: S[3] }}>
                <div>
                  <div style={labelStyle}>{tenantOpts.garmentSectionLabel} *</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: S[2] }}>
                    {tenantOpts.garmentTypes.map(gt => (
                      <button key={gt} onClick={() => setGarmentType(gt)} style={pillBtn(garmentType === gt, true)}>
                        {GARMENT_TYPE_LABELS[gt]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={labelStyle}>{tenantOpts.brandSectionLabel} *</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[2] }}>
                    {tenantOpts.brandLines.map(bl => (
                      <button key={bl} onClick={() => setBrandLine(bl)} style={{
                        ...pillBtn(brandLine === bl), textAlign: "left" as const,
                      }}>
                        <div style={{ fontWeight: T.wt.bold, fontSize: T.sz.sm,
                          color: brandLine === bl ? C.brand : C.ink, marginBottom: 2 }}>
                          {BRAND_LINE_LABELS[bl]}
                        </div>
                        <div style={{ fontSize: T.sz.xs, color: brandLine === bl ? C.brandDark : C.inkLight }}>
                          {BRAND_LINE_DESCRIPTIONS[bl]}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                {/* TODO [Sprint 5 — Producto]: Después de aprobar el asset, recolectar aquí:
                    precio, tallas, colores, descripción, SKU.
                    Estos datos pertenecen al flujo de PUBLICACIÓN, no al de generación visual. */}
              </div>
            </div>

            <div style={{ padding: `${S[3]}px ${S[3]}px ${S[1]}px`,
              border: `1.5px solid ${C.brand}`, borderRadius: R.md, background: C.brandLight }}>
              <div style={{ fontWeight: T.wt.black, fontSize: T.sz.sm, color: C.brand,
                textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: S[3] }}>
                B. Contexto visual infantil
              </div>
              <div style={{ display: "grid", gap: S[4] }}>
                <div>
                  <div style={labelStyle}>Tipo de modelo</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[2] }}>
                    {KIDS_MODEL_TYPES.map(mt => (
                      <button key={mt} onClick={() => setKidsModelType(mt)} style={{
                        padding: `${S[2]}px ${S[2]}px`,
                        border: kidsModelType === mt ? `2px solid ${C.brand}` : `1px solid ${C.line}`,
                        borderRadius: R.md, background: kidsModelType === mt ? C.brand : C.white,
                        cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.xs,
                        fontWeight: kidsModelType === mt ? T.wt.bold : T.wt.normal,
                        color: kidsModelType === mt ? C.white : C.inkMid, transition: "all 0.1s",
                      }}>
                        {KIDS_MODEL_TYPE_LABELS[mt]}
                      </button>
                    ))}
                  </div>
                </div>
                {!["sin_modelo", "flat_lay", "producto_ambientado"].includes(kidsModelType) && (
                  <div>
                    <div style={labelStyle}>Rango de edad</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[2] }}>
                      {KIDS_AGE_RANGES.map(ar => (
                        <button key={ar} onClick={() => setKidsAgeRange(ar)} style={{
                          padding: `${S[2]}px ${S[2]}px`,
                          border: kidsAgeRange === ar ? `2px solid ${C.brand}` : `1px solid ${C.line}`,
                          borderRadius: R.md, background: kidsAgeRange === ar ? C.brand : C.white,
                          cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.xs,
                          fontWeight: kidsAgeRange === ar ? T.wt.bold : T.wt.normal,
                          color: kidsAgeRange === ar ? C.white : C.inkMid, transition: "all 0.1s",
                        }}>
                          {KIDS_AGE_RANGE_LABELS[ar]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {!["sin_modelo", "flat_lay", "maniqui", "producto_ambientado"].includes(kidsModelType) && (
                  <div>
                    <div style={labelStyle}>Características</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[2] }}>
                      {KIDS_VISUAL_TRAITS.map(vt => (
                        <button key={vt} onClick={() => setKidsVisualTrait(vt)} style={{
                          padding: `${S[2]}px ${S[2]}px`,
                          border: kidsVisualTrait === vt ? `2px solid ${C.brand}` : `1px solid ${C.line}`,
                          borderRadius: R.md, background: kidsVisualTrait === vt ? C.brand : C.white,
                          cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.xs,
                          fontWeight: kidsVisualTrait === vt ? T.wt.bold : T.wt.normal,
                          color: kidsVisualTrait === vt ? C.white : C.inkMid, transition: "all 0.1s",
                        }}>
                          {KIDS_VISUAL_TRAIT_LABELS[vt]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div style={labelStyle}>Estilo visual</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[2] }}>
                    {KIDS_VISUAL_STYLES.map(vs => (
                      <button key={vs} onClick={() => setKidsVisualStyle(vs)} style={{
                        padding: `${S[2]}px ${S[2]}px`,
                        border: kidsVisualStyle === vs ? `2px solid ${C.brand}` : `1px solid ${C.line}`,
                        borderRadius: R.md, background: kidsVisualStyle === vs ? C.brand : C.white,
                        cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.xs,
                        fontWeight: kidsVisualStyle === vs ? T.wt.bold : T.wt.normal,
                        color: kidsVisualStyle === vs ? C.white : C.inkMid, transition: "all 0.1s",
                      }}>
                        {KIDS_VISUAL_STYLE_LABELS[vs]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={labelStyle}>Fondo / escena</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
                    {BACKGROUNDS.map(bg => (
                      <button key={bg} onClick={() => setBackground(bg)} style={pillBtn(background === bg)}>
                        {BACKGROUND_LABELS[bg]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={labelStyle}>Formato</div>
                  <div style={{ display: "flex", gap: S[2] }}>
                    {ASPECT_RATIOS.map(r => (
                      <button key={r} onClick={() => setAspectRatio(r)} style={pillBtn(aspectRatio === r, true)}>
                        {ASPECT_RATIO_LABELS[r]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div style={labelStyle}>Prompt libre controlado{" "}
                <span style={{ fontWeight: T.wt.normal, textTransform: "none" as const, letterSpacing: 0, color: C.inkFaint }}>(opcional)</span>
              </div>
              <textarea value={freePrompt} onChange={e => setFreePrompt(e.target.value)}
                placeholder="Ej. niño sentado en parque, colores vibrantes, luz natural."
                rows={3} style={{ ...inputStyle, resize: "vertical" as const }} />
            </div>

          </>)}

          {/* ══ SOCIAL PHOTO ══════════════════════════════════════════════ */}
          {generationIntent === "social_photo" && (<>

            <div style={secBoxStyle}>
              <div style={secHeaderStyle}>A. Canal de publicación *</div>
              <div style={{ display: "grid", gap: S[3] }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[2] }}>
                  {SOCIAL_CHANNELS.map(ch => (
                    <button key={ch.value} onClick={() => setSocialChannel(ch.value)} style={pillBtn(socialChannel === ch.value)}>
                      {ch.label}
                    </button>
                  ))}
                </div>
                {socialChannel && (
                  <div style={{ fontSize: T.sz.xs, color: C.inkMid, background: C.white,
                    border: `1px solid ${C.lineSubtle}`, borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px` }}>
                    <span style={{ fontWeight: T.wt.bold, color: C.ink }}>Formato recomendado: </span>
                    {CHANNEL_FORMAT[socialChannel] ?? "—"}
                  </div>
                )}
              </div>
            </div>

            <div style={secBoxStyle}>
              <div style={secHeaderStyle}>B. Tipo de publicación *</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[2] }}>
                {SOCIAL_PUB_TYPES_EXT.map(pt => (
                  <button key={pt.value} onClick={() => setSocialPubType(pt.value)} style={pillBtn(socialPubType === pt.value)}>
                    {pt.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={secBoxStyle}>
              <div style={secHeaderStyle}>C. Contenido</div>
              <div style={{ display: "grid", gap: S[3] }}>
                <div>
                  <div style={labelStyle}>Texto principal</div>
                  <input value={socialText} onChange={e => setSocialText(e.target.value)}
                    placeholder="Ej. ¡Nueva colección Kids Fun ya disponible!" style={inputStyle} />
                </div>
                <div>
                  <div style={labelStyle}>CTA (llamada a la acción)</div>
                  <input value={socialCta} onChange={e => setSocialCta(e.target.value)}
                    placeholder="Ej. Ver colección, Comprar ahora, Descubrir" style={inputStyle} />
                </div>
                <div>
                  <div style={labelStyle}>Campaña / colección</div>
                  <input value={socialCampaign} onChange={e => setSocialCampaign(e.target.value)}
                    placeholder="Ej. Back to School 2026, Temporada Vacaciones" style={inputStyle} />
                </div>
              </div>
            </div>

            <div>
              <div style={labelStyle}>Prompt libre controlado{" "}
                <span style={{ fontWeight: T.wt.normal, textTransform: "none" as const, letterSpacing: 0, color: C.inkFaint }}>(opcional)</span>
              </div>
              <textarea value={freePrompt} onChange={e => setFreePrompt(e.target.value)}
                placeholder="Instrucciones de estilo, paleta de colores, referencias, contexto de la campaña…"
                rows={3} style={{ ...inputStyle, resize: "vertical" as const }} />
            </div>

          </>)}

          {/* ══ SOCIAL VIDEO ══════════════════════════════════════════════ */}
          {generationIntent === "social_video" && (<>

            <div style={secBoxStyle}>
              <div style={secHeaderStyle}>A. Tipo de video</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
                {VIDEO_TYPES.map(vt => (
                  <button key={vt.value} onClick={() => setVideoType(vt.value)} style={{
                    ...pillBtn(videoType === vt.value), textAlign: "left" as const, padding: `${S[3]}px`,
                  }}>
                    <div style={{ fontWeight: T.wt.bold, marginBottom: 3,
                      color: videoType === vt.value ? C.brand : C.ink }}>{vt.label}</div>
                    <div style={{ fontSize: T.sz.xs,
                      color: videoType === vt.value ? C.brandDark : C.inkLight }}>{vt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={secBoxStyle}>
              <div style={secHeaderStyle}>B. Configuración</div>
              <div style={{ display: "grid", gap: S[3] }}>
                <div>
                  <div style={labelStyle}>Duración *</div>
                  <div style={{ display: "flex", gap: S[2] }}>
                    {["15s", "60s"].map(d => (
                      <button key={d} onClick={() => setVideoDuration(d)} style={pillBtn(videoDuration === d)}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={labelStyle}>Formato</div>
                  <div style={{ display: "flex", gap: S[2] }}>
                    {(["9:16", "1:1", "16:9"] as AspectRatio[]).map(r => (
                      <button key={r} onClick={() => setAspectRatio(r)} style={pillBtn(aspectRatio === r)}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={labelStyle}>Calidad</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
                    {VISUAL_QUALITIES.map(vq => (
                      <button key={vq} onClick={() => setVisualQuality(vq)} style={pillBtn(visualQuality === vq)}>
                        {VISUAL_QUALITY_LABELS[vq]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={labelStyle}>Escena / fondo</div>
                  <input value={videoScene} onChange={e => setVideoScene(e.target.value)}
                    placeholder="Ej. Habitación infantil, parque, fondo blanco limpio" style={inputStyle} />
                </div>
                <div>
                  <div style={labelStyle}>Movimiento de cámara</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[2] }}>
                    {CAMERA_MOVES.map(cm => (
                      <button key={cm} onClick={() => setVideoCameraMove(cm)} style={pillBtn(videoCameraMove === cm, true)}>
                        {cm}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div style={labelStyle}>Prompt libre controlado{" "}
                <span style={{ fontWeight: T.wt.normal, textTransform: "none" as const, letterSpacing: 0, color: C.inkFaint }}>(opcional)</span>
              </div>
              <textarea value={freePrompt} onChange={e => setFreePrompt(e.target.value)}
                placeholder="Instrucciones adicionales para el clip. Ej: transiciones suaves, logo en esquina."
                rows={3} style={{ ...inputStyle, resize: "vertical" as const }} />
            </div>

          </>)}

          {/* ══ CREATIVE TEMPLATE ══════════════════════════════════════════ */}
          {generationIntent === "creative_template" && (<>

            <div style={secBoxStyle}>
              <div style={secHeaderStyle}>A. Tipo de pieza *</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[3] }}>
                {PIECE_TYPES.map(pt => (
                  <button key={pt.value} onClick={() => setPieceType(pt.value)} style={{
                    ...pillBtn(pieceType === pt.value), textAlign: "left" as const, padding: `${S[3]}px`,
                  }}>
                    <div style={{ fontWeight: T.wt.bold, marginBottom: 3,
                      color: pieceType === pt.value ? C.brand : C.ink }}>{pt.label}</div>
                    <div style={{ fontSize: T.sz.xs,
                      color: pieceType === pt.value ? C.brandDark : C.inkLight }}>{pt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={secBoxStyle}>
              <div style={secHeaderStyle}>B. Filtros de productos</div>
              <div style={{ display: "grid", gap: S[3] }}>
                <div>
                  <div style={labelStyle}>Categoría</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: S[2] }}>
                    {tenantOpts.garmentTypes.map(gt => (
                      <button key={gt} onClick={() => setGarmentType(gt)} style={pillBtn(garmentType === gt, true)}>
                        {GARMENT_TYPE_LABELS[gt]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={labelStyle}>Línea</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[2] }}>
                    {tenantOpts.brandLines.map(bl => (
                      <button key={bl} onClick={() => setBrandLine(bl)} style={pillBtn(brandLine === bl)}>
                        {BRAND_LINE_LABELS[bl]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={labelStyle}>Colección</div>
                  <input value={socialCampaign} onChange={e => setSocialCampaign(e.target.value)}
                    placeholder="Ej. Back to School 2026" style={inputStyle} />
                </div>
                {/* TODO [Sprint 5 — Producto]: Colores, tallas y precio se recolectarán
                    en el paso de publicación, después de aprobar el asset generado. */}
                <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                  <button onClick={() => setTemplateIncludePrice(!templateIncludePrice)} style={{
                    padding: `${S[1] + 2}px ${S[3]}px`,
                    border: `2px solid ${templateIncludePrice ? C.brand : C.line}`,
                    borderRadius: R.md,
                    background: templateIncludePrice ? C.brandLight : C.surface,
                    cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.sm,
                    fontWeight: T.wt.bold, color: templateIncludePrice ? C.brand : C.inkMid,
                  }}>
                    {templateIncludePrice ? "✓ Con precio" : "Sin precio"}
                  </button>
                  <span style={{ fontSize: T.sz.xs, color: C.inkFaint }}>
                    Incluir precio visible en la pieza
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: S[3], padding: `${S[3]}px ${S[4]}px`,
              background: "#fefce8", border: `1px solid #fde047`, borderRadius: R.md }}>
              <div style={{ fontSize: 18, flexShrink: 0 }}>ℹ️</div>
              <div style={{ fontSize: T.sz.xs, color: "#713f12", lineHeight: 1.6 }}>
                Los catálogos se organizarán automáticamente por categoría para evitar mezclar ropa, juguetes, accesorios y transporte sin lógica.
              </div>
            </div>

            <div>
              <div style={labelStyle}>Prompt libre controlado{" "}
                <span style={{ fontWeight: T.wt.normal, textTransform: "none" as const, letterSpacing: 0, color: C.inkFaint }}>(opcional)</span>
              </div>
              <textarea value={freePrompt} onChange={e => setFreePrompt(e.target.value)}
                placeholder="Instrucciones adicionales. Ej: fondo institucional, colores de la marca, incluir logo."
                rows={3} style={{ ...inputStyle, resize: "vertical" as const }} />
            </div>

          </>)}

        </div>
      </div>
      <ActionRow nextLabel="Generar →" canNext={canNext} onNext={onNext} onBack={onBack} showBack={true} />
    </Panel>
  );
}

// ── Step 4: Generation + approval ────────────────────────────────────────────

interface AssetCardProps {
  asset:           AssetState | null;
  onApprove:       (id: string) => void;
  onReject:        (id: string) => void;
  orgSlug:         string;
  sourceImageUrl?: string;
}

function AssetCard({ asset, onApprove, onReject, orgSlug, sourceImageUrl }: AssetCardProps) {
  const downloadHref = asset?.id
    ? `/api/orgs/${orgSlug}/marketing-studio/assets/${asset.id}/download`
    : undefined;
  const meta = asset
    ? (ASSET_META[asset.assetType] ?? { icon: "📄", label: asset.assetType })
    : { icon: "📷", label: "Activo" };

  const isReady    = asset?.generationStatus === "READY";
  const isFailed   = asset?.generationStatus === "FAILED";
  const isPending  = !isReady && !isFailed;
  const isApproved = asset?.reviewStatus === "approved";
  const isRejected = asset?.reviewStatus === "rejected";

  return (
    <div style={{
      border:       `1px solid ${isApproved ? C.greenBorder : isRejected ? C.redBorder : isFailed ? C.redBorder : C.line}`,
      borderRadius: R.md,
      background:   isApproved ? C.greenLight : isRejected ? "#fff0f0" : C.white,
      overflow:     "hidden",
      boxShadow:    E.xs,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: S[2],
        padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`,
        background: C.surfaceAlt }}>
        <span style={{ fontSize: 16 }}>{meta.icon}</span>
        <span style={{ fontWeight: T.wt.bold, fontSize: T.sz.sm, color: C.ink }}>{meta.label}</span>
        <div style={{ marginLeft: "auto" }}>
          {isApproved && <Badge variant="success">Aprobado</Badge>}
          {isRejected && <Badge variant="danger">Rechazado</Badge>}
          {!isApproved && !isRejected && isFailed   && <Badge variant="danger">Error</Badge>}
          {!isApproved && !isRejected && !isFailed && isReady  && <Badge variant="neutral">Listo</Badge>}
          {!isApproved && !isRejected && isPending  && <Badge variant="neutral">Generando</Badge>}
        </div>
      </div>

      {/* Preview */}
      <div style={{ padding: `${S[3]}px`, minHeight: 120,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: S[2] }}>
        {isReady && asset?.assetUrl ? (
          sourceImageUrl ? (
            // ── Side-by-side: Original vs Generado ────────────────────────
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr",
              gap: S[3], width: "100%", alignItems: "start" }}>
              <div>
                <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint, fontWeight: T.wt.medium,
                  textAlign: "center", marginBottom: S[1] }}>Original</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sourceImageUrl} alt="Original"
                  style={{ width: "100%", maxHeight: 260, borderRadius: R.sm,
                    objectFit: "contain", border: `1px solid ${C.line}`,
                    background: C.surfaceAlt }} />
              </div>
              <div>
                <div style={{ fontSize: T.sz["2xs"], color: C.green, fontWeight: T.wt.bold,
                  textAlign: "center", marginBottom: S[1] }}>✓ Generado</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.assetUrl} alt={meta.label}
                  style={{ width: "100%", maxHeight: 320, borderRadius: R.md,
                    objectFit: "contain", boxShadow: E.sm }} />
              </div>
            </div>
          ) : (
            // ── Solo generado (sin fuente para comparar) ───────────────────
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={asset.assetUrl} alt={meta.label}
              style={{ maxHeight: 320, maxWidth: "100%", borderRadius: R.md,
                objectFit: "contain", boxShadow: E.sm }} />
          )
        ) : isFailed ? (
          <div style={{ color: C.red, fontSize: T.sz.sm }}>La generación de este activo falló.</div>
        ) : (
          <><div style={{ fontSize: 30 }}>⏳</div>
          <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>Procesando…</div></>
        )}
      </div>

      {/* Actions */}
      {isReady && asset && !isApproved && !isRejected && (
        <div style={{ display: "flex", gap: S[2], padding: `${S[2]}px ${S[3]}px`,
          borderTop: `1px solid ${C.lineSubtle}`, background: C.surfaceAlt, flexWrap: "wrap" }}>
          <button onClick={() => onApprove(asset.id)} style={{
            padding: `4px ${S[2]}px`, background: C.greenLight, color: C.green,
            border: `1px solid ${C.greenBorder}`, borderRadius: R.sm, fontSize: T.sz.xs,
            fontWeight: T.wt.bold, cursor: "pointer", fontFamily: T.mono,
          }}>✓ Aprobar</button>
          <button onClick={() => onReject(asset.id)} style={{
            padding: `4px ${S[2]}px`, background: "#fff0f0", color: C.red,
            border: `1px solid ${C.redBorder}`, borderRadius: R.sm, fontSize: T.sz.xs,
            fontWeight: T.wt.bold, cursor: "pointer", fontFamily: T.mono,
          }}>✗ Rechazar</button>
          {downloadHref && (
            <a href={downloadHref} download
              style={{ marginLeft: "auto", padding: `4px ${S[2]}px`, background: C.surface,
                color: C.inkMid, border: `1px solid ${C.line}`, borderRadius: R.sm,
                fontSize: T.sz.xs, fontFamily: T.mono, textDecoration: "none" }}>
              ↓ Descargar
            </a>
          )}
        </div>
      )}
      {isApproved && asset && (
        <div style={{ display: "flex", gap: S[2], padding: `${S[2]}px ${S[3]}px`,
          borderTop: `1px solid ${C.greenBorder}`, background: C.greenLight }}>
          <span style={{ fontSize: T.sz.xs, color: C.greenDark }}>✓ Guardado en biblioteca creativa</span>
          {downloadHref && (
            <a href={downloadHref} download
              style={{ marginLeft: "auto", padding: `2px ${S[2]}px`, background: C.white,
                color: C.inkMid, border: `1px solid ${C.greenBorder}`, borderRadius: R.sm,
                fontSize: T.sz.xs, fontFamily: T.mono, textDecoration: "none" }}>
              ↓ Descargar
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Step 4: Generation view ───────────────────────────────────────────────────

function GenerationStep({
  assets, isGenerating, generateError, onGenerate,
  onApprove, onReject, onReset, onSaveAll, orgSlug,
  frontUrl, backUrl,
}: {
  assets:         AssetState[];
  isGenerating:   boolean;
  generateError:  string | null;
  onGenerate:     () => void;
  onApprove:      (id: string) => void;
  onReject:       (id: string) => void;
  onReset:        () => void;
  onSaveAll:      () => void;
  orgSlug:        string;
  frontUrl?:      string;
  backUrl?:       string;
}) {
  const readyCount    = assets.filter(a => a.generationStatus === "READY").length;
  const approvedCount = assets.filter(a => a.reviewStatus === "approved").length;
  const allSettled    = assets.length > 0 && assets.every(a => a.generationStatus === "READY" || a.generationStatus === "FAILED");
  const hasApproved   = approvedCount > 0;

  if (!isGenerating && assets.length === 0) {
    return (
      <Panel style={{ marginBottom: 0 }}>
        <PanelHeader title="Listo para generar" icon="🚀" />
        <div style={{ padding: `${S[4]}px` }}>
          <div style={{ padding: `${S[3]}px`, background: C.brandLight,
            border: `1px solid ${C.brandBorder}`, borderRadius: R.md,
            fontSize: T.sz.sm, color: C.brandDark, marginBottom: S[3] }}>
            Las imágenes se están generando con IA. Esto puede tardar entre 30 segundos y 2 minutos.
            Tus imágenes aparecerán aquí automáticamente al estar listas.
          </div>
          {generateError && (
            <div style={{ padding: `${S[2]}px ${S[3]}px`, background: "#fff0f0",
              border: `1px solid ${C.redBorder}`, borderRadius: R.md,
              color: C.red, fontSize: T.sz.sm, marginBottom: S[3] }}>
              {generateError}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: S[2], padding: `${S[3]}px ${S[4]}px`,
          borderTop: `1px solid ${C.line}`, background: C.surfaceAlt }}>
          <button onClick={onReset} style={{ ...btnSecondary, color: C.inkFaint }}>Empezar de nuevo</button>
          <button onClick={onGenerate} style={{ ...btnPrimary, marginLeft: "auto" }}>
            Generar activos →
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel style={{ marginBottom: 0 }}>
      <PanelHeader
        title={allSettled ? "Revisa y aprueba los resultados" : "Generando activos…"}
        icon={allSettled ? "✅" : "⚡"}
        badge={
          isGenerating ? <Badge variant="brand">PROCESANDO</Badge> :
          allSettled    ? <Badge variant="success">{readyCount} listos</Badge> :
          <Badge variant="neutral">En proceso</Badge>
        }
      />

      {/* Asset grid */}
      <div style={{ padding: `${S[4]}px` }}>
        {assets.length === 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
            {[0, 1].map(i => <AssetCard key={i} asset={null} onApprove={() => {}} onReject={() => {}} orgSlug={orgSlug} sourceImageUrl={frontUrl} />)}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: assets.length === 1 ? "1fr" : "1fr 1fr", gap: S[3] }}>
            {assets.map(a => (
              <AssetCard
                key={a.id}
                asset={a}
                onApprove={onApprove}
                onReject={onReject}
                orgSlug={orgSlug}
                sourceImageUrl={a.assetType === "back_clean" ? (backUrl || frontUrl) : frontUrl}
              />
            ))}
          </div>
        )}

        {!allSettled && assets.length > 0 && (
          <div style={{ marginTop: S[3], fontSize: T.sz.xs, color: C.inkFaint, textAlign: "center" }}>
            Las imágenes aparecerán automáticamente al completar la generación.
          </div>
        )}

        {allSettled && hasApproved && (
          <div style={{ marginTop: S[4], padding: `${S[3]}px`, background: C.greenLight,
            border: `1px solid ${C.greenBorder}`, borderRadius: R.md,
            display: "flex", alignItems: "center", gap: S[2] }}>
            <span style={{ fontSize: 20 }}>🗂️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: T.wt.bold, color: C.greenDark, fontSize: T.sz.sm }}>
                {approvedCount} activo{approvedCount !== 1 ? "s" : ""} aprobado{approvedCount !== 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: T.sz.xs, color: C.green }}>
                Guardados en la Biblioteca Creativa.
              </div>
            </div>
            <Link href={`/${orgSlug}/agentik/marketing-studio/biblioteca`}
              style={{ ...btnSecondary, textDecoration: "none", fontSize: T.sz.sm, padding: `${S[1]}px ${S[3]}px` }}>
              Ver biblioteca →
            </Link>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: S[2], padding: `${S[3]}px ${S[4]}px`,
        borderTop: `1px solid ${C.line}`, background: C.surfaceAlt }}>
        <button onClick={onReset} style={{ ...btnSecondary, color: C.inkFaint }}>Nueva sesión</button>
        {allSettled && hasApproved && (
          <button onClick={onSaveAll} style={{ ...btnPrimary, marginLeft: "auto" }}>
            Guardar todo en biblioteca →
          </button>
        )}
      </div>
    </Panel>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FotoEstudioWizard({
  orgSlug,
  tenantId,
  defaultBrandLine  = "casual",
  defaultGarmentType = "otro",
}: {
  orgSlug:            string;
  tenantId:           string;
  defaultBrandLine?:  BrandLine;
  defaultGarmentType?: GarmentType;
}) {
  // Session
  const [sessionId] = useState(() => genSessionId());
  const dbCreated   = useRef(false);

  // Step navigation
  const [step, setStep] = useState<WizardStep>("upload");

  // Step 1
  const [frontUrl,    setFrontUrl]    = useState("");
  const [backUrl,     setBackUrl]     = useState("");
  const [detail1Url,  setDetail1Url]  = useState("");
  const [detail2Url,  setDetail2Url]  = useState("");
  const [sku,         setSku]         = useState("");

  // Step 2
  const [selectedOutputs,  setSelectedOutputs]  = useState<FotoOutputType[]>([]);
  const [generationIntent, setGenerationIntent] = useState<GenerationIntent | null>(null);

  // Step 1 extra
  const [referenceImageUrl, setReferenceImageUrl] = useState("");

  // Step 3
  const [visualStyle,           setVisualStyle]           = useState<VisualStyle>("clean_studio");
  const [background,            setBackground]            = useState<BackgroundType>("white");
  const [aspectRatio,           setAspectRatio]           = useState<AspectRatio>("1:1");
  const [quantity,              setQuantity]              = useState(1);
  const [garmentType,           setGarmentType]           = useState<GarmentType>(defaultGarmentType);
  const [brandLine,             setBrandLine]             = useState<BrandLine>(defaultBrandLine);
  const [socialPublicationType, setSocialPublicationType] = useState<SocialPublicationType>("feed");
  const [modelType,         setModelType]         = useState<ModelType>("latina_rubia");
  const [bodyType,          setBodyType]           = useState<BodyType>("curvy");
  const [visualQuality,     setVisualQuality]      = useState<VisualQuality>("full_hd");
  const [framingType,       setFramingType]        = useState<FramingType>("frontal_catalogo");
  const [modelReferenceUrl, setModelReferenceUrl]  = useState("");
  // Kids visual profile (Castillitos)
  const [kidsModelType,   setKidsModelType]   = useState<KidsModelType>("sin_modelo");
  const [kidsAgeRange,    setKidsAgeRange]    = useState<KidsAgeRange>("4_6");
  const [kidsVisualTrait, setKidsVisualTrait] = useState<KidsVisualTrait>("latino");
  const [kidsVisualStyle, setKidsVisualStyle] = useState<KidsVisualStyle>("catalogo_comercial");
  const [kidsExpression,  setKidsExpression]  = useState<KidsExpression>("sonriente");

  // Intent-specific fields (Step 3 dynamic forms)
  const [socialChannel,        setSocialChannel]        = useState("");
  const [socialPubType,        setSocialPubType]        = useState("");
  const [socialText,           setSocialText]           = useState("");
  const [socialCta,            setSocialCta]            = useState("");
  const [socialCampaign,       setSocialCampaign]       = useState("");
  const [videoType,            setVideoType]            = useState("");
  const [videoDuration,        setVideoDuration]        = useState("");
  const [videoScene,           setVideoScene]           = useState("");
  const [videoCameraMove,      setVideoCameraMove]      = useState("");
  const [pieceType,            setPieceType]            = useState("");
  const [templateIncludePrice, setTemplateIncludePrice] = useState(false);
  const [freePrompt,           setFreePrompt]           = useState("");
  // TODO [Sprint 5 — Producto]: productDescription, productPrice, productColors,
  //   productSizes, productNotes — state will live in the post-approval publication step.

  // Step 4
  const [assets,        setAssets]        = useState<AssetState[]>([]);
  const [isGenerating,  setIsGenerating]  = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Create DB session on mount
  useEffect(() => {
    if (dbCreated.current) return;
    dbCreated.current = true;
    fetch(`/api/orgs/${orgSlug}/marketing-studio/sessions`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ sessionId, tenantId }),
    }).catch(err => console.warn("[wizard] failed to create DB session:", err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling cleanup
  useEffect(() => () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); }, []);

  // ── Toggle output type (kept for internal compatibility) ─────────────────
  function toggleOutput(type: FotoOutputType) {
    setSelectedOutputs(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type],
    );
  }

  // ── Select generation intent (Step 2) ────────────────────────────────────
  function selectIntent(intent: GenerationIntent) {
    setGenerationIntent(intent);
    setSelectedOutputs(INTENT_TO_OUTPUTS[intent]);
  }

  // ── Polling ──────────────────────────────────────────────────────────────
  const pollSession = useCallback(async () => {
    try {
      const res  = await fetch(`/api/orgs/${orgSlug}/marketing-studio/sessions/${sessionId}`);
      if (!res.ok) return;
      const data = await res.json() as {
        session?: { status: string; assets: Array<{ id: string; assetType: string; generationStatus: string; assetUrl?: string | null; reviewStatus: string }> };
      };
      const dbSession = data.session;
      if (!dbSession) return;
      setAssets(dbSession.assets ?? []);
      const dbStatus = dbSession.status.toUpperCase();
      if (dbStatus === "PUBLISHED" || dbStatus === "FAILED") {
        if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
      }
    } catch (e) {
      console.error("[wizard] poll error:", e);
    }
  }, [orgSlug, sessionId]);

  // ── Save settings to DB ──────────────────────────────────────────────────
  async function saveSettings() {
    await fetch(`/api/orgs/${orgSlug}/marketing-studio/sessions/${sessionId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_inputs",
        inputs: {
          frontImageUrl:        frontUrl,
          backImageUrl:         backUrl            || undefined,
          detail1Url:           detail1Url         || undefined,
          detail2Url:           detail2Url         || undefined,
          referenceImageUrl:    referenceImageUrl  || undefined,
          sku:                  sku                || undefined,
          selectedOutputs,
          visualStyle,
          background,
          aspectRatio,
          quantity,
          garmentType,
          brandLine,
          socialPublicationType,
          modelType,
          bodyType,
          visualQuality,
          framingType,
          modelReferenceUrl:    modelReferenceUrl   || undefined,
          kidsModelType,
          kidsAgeRange,
          kidsVisualTrait,
          kidsVisualStyle,
          kidsExpression,
        },
      }),
    }).catch(err => console.warn("[wizard] failed to save inputs:", err));
  }

  // ── Generate ─────────────────────────────────────────────────────────────
  async function handleGenerate() {
    setIsGenerating(true);
    setGenerateError(null);
    await saveSettings();

    // Mark session as publishing
    await fetch(`/api/orgs/${orgSlug}/marketing-studio/sessions/${sessionId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "start_publishing" }),
    }).catch(() => {});

    try {
      const res  = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/foto-estudio/sessions/${sessionId}/generate`,
        { method: "POST" },
      );
      const data = await res.json() as { ok?: boolean; error?: string; assetIds?: Array<{ id: string; assetType: string }> };
      if (!res.ok || data.error) {
        setGenerateError(data.error ?? "Error al iniciar la generación.");
        setIsGenerating(false);
        return;
      }
      // Seed local asset state with PENDING entries
      if (data.assetIds) {
        setAssets(data.assetIds.map(a => ({ id: a.id, assetType: a.assetType, generationStatus: "PENDING", reviewStatus: "pending" })));
      }
      setIsGenerating(false);
      // Start polling
      pollTimerRef.current = setInterval(() => { void pollSession(); }, 3000);
      void pollSession();
    } catch (err: unknown) {
      setGenerateError(err instanceof Error ? err.message : "Error de red.");
      setIsGenerating(false);
    }
  }

  // ── Approve ──────────────────────────────────────────────────────────────
  async function handleApprove(assetId: string) {
    setAssets(prev => prev.map(a => a.id === assetId ? { ...a, reviewStatus: "approved" } : a));
    await fetch(`/api/orgs/${orgSlug}/marketing-studio/sessions/${sessionId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "approve_items", itemIds: [assetId] }),
    }).catch(err => console.warn("[wizard] approve failed:", err));
  }

  // ── Reject ───────────────────────────────────────────────────────────────
  function handleReject(assetId: string) {
    setAssets(prev => prev.map(a => a.id === assetId ? { ...a, reviewStatus: "rejected" } : a));
  }

  // ── Save all approved ────────────────────────────────────────────────────
  async function handleSaveAll() {
    const readyIds = assets.filter(a => a.generationStatus === "READY" && a.reviewStatus !== "rejected").map(a => a.id);
    if (readyIds.length === 0) return;
    setAssets(prev => prev.map(a => readyIds.includes(a.id) ? { ...a, reviewStatus: "approved" } : a));
    await fetch(`/api/orgs/${orgSlug}/marketing-studio/sessions/${sessionId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "approve_items", itemIds: readyIds }),
    }).catch(err => console.warn("[wizard] save all failed:", err));
  }

  // ── Reset ────────────────────────────────────────────────────────────────
  function handleReset() {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    window.location.reload();
  }

  const tenantOpts = getTenantWizardOptions(tenantId);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      <Stepper currentStep={step} />

      {step === "upload" && (
        <UploadStep
          frontUrl={frontUrl}                   setFrontUrl={setFrontUrl}
          backUrl={backUrl}                     setBackUrl={setBackUrl}
          detail1Url={detail1Url}               setDetail1Url={setDetail1Url}
          detail2Url={detail2Url}               setDetail2Url={setDetail2Url}
          referenceImageUrl={referenceImageUrl} setReferenceImageUrl={setReferenceImageUrl}
          sku={sku}                             setSku={setSku}
          onNext={() => setStep("choose_outputs")}
          tenantId={tenantId} sessionId={sessionId}
          selectedOutputs={selectedOutputs}
          tenantOpts={tenantOpts}
        />
      )}

      {step === "choose_outputs" && (
        <ChooseOutputsStep
          intent={generationIntent}
          onSelectIntent={selectIntent}
          onNext={() => setStep("visual_settings")}
          onBack={() => setStep("upload")}
        />
      )}

      {step === "visual_settings" && (
        <VisualSettingsStep
          generationIntent={generationIntent}
          visualStyle={visualStyle}                   setVisualStyle={setVisualStyle}
          background={background}                     setBackground={setBackground}
          aspectRatio={aspectRatio}                   setAspectRatio={setAspectRatio}
          quantity={quantity}                         setQuantity={setQuantity}
          garmentType={garmentType}                   setGarmentType={setGarmentType}
          brandLine={brandLine}                       setBrandLine={setBrandLine}
          socialPublicationType={socialPublicationType} setSocialPublicationType={setSocialPublicationType}
          modelType={modelType}                       setModelType={setModelType}
          bodyType={bodyType}                         setBodyType={setBodyType}
          visualQuality={visualQuality}               setVisualQuality={setVisualQuality}
          framingType={framingType}                   setFramingType={setFramingType}
          modelReferenceUrl={modelReferenceUrl}       setModelReferenceUrl={setModelReferenceUrl}
          kidsModelType={kidsModelType}               setKidsModelType={setKidsModelType}
          kidsAgeRange={kidsAgeRange}                 setKidsAgeRange={setKidsAgeRange}
          kidsVisualTrait={kidsVisualTrait}           setKidsVisualTrait={setKidsVisualTrait}
          kidsVisualStyle={kidsVisualStyle}           setKidsVisualStyle={setKidsVisualStyle}
          kidsExpression={kidsExpression}             setKidsExpression={setKidsExpression}
          socialChannel={socialChannel}               setSocialChannel={setSocialChannel}
          socialPubType={socialPubType}               setSocialPubType={setSocialPubType}
          socialText={socialText}                     setSocialText={setSocialText}
          socialCta={socialCta}                       setSocialCta={setSocialCta}
          socialCampaign={socialCampaign}             setSocialCampaign={setSocialCampaign}
          videoType={videoType}                       setVideoType={setVideoType}
          videoDuration={videoDuration}               setVideoDuration={setVideoDuration}
          videoScene={videoScene}                     setVideoScene={setVideoScene}
          videoCameraMove={videoCameraMove}           setVideoCameraMove={setVideoCameraMove}
          pieceType={pieceType}                       setPieceType={setPieceType}
          templateIncludePrice={templateIncludePrice} setTemplateIncludePrice={setTemplateIncludePrice}
          freePrompt={freePrompt}                     setFreePrompt={setFreePrompt}
          tenantId={tenantId}                         sessionId={sessionId}
          onNext={() => setStep("generation")}
          onBack={() => setStep("choose_outputs")}
          selectedOutputs={selectedOutputs}
        />
      )}

      {step === "generation" && (
        <GenerationStep
          assets={assets}
          isGenerating={isGenerating}
          generateError={generateError}
          onGenerate={handleGenerate}
          onApprove={handleApprove}
          onReject={handleReject}
          onReset={handleReset}
          onSaveAll={handleSaveAll}
          orgSlug={orgSlug}
          frontUrl={frontUrl || undefined}
          backUrl={backUrl   || undefined}
        />
      )}
    </div>
  );
}
