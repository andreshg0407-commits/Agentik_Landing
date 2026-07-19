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

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { FotoStudioLiveState } from "@/lib/marketing-studio/foto-studio-live-context";
import Link                              from "next/link";
import { C, T, S, R, E }               from "@/lib/ui/tokens";
import { Camera, Smartphone, Clapperboard, LayoutTemplate, FileText, SlidersHorizontal, Eye, type LucideIcon } from "lucide-react";
import { Badge, Panel, PanelHeader } from "@/components/shell/primitives";
import {
  VISUAL_STYLE_LABELS,
  BACKGROUND_LABELS,
  ASPECT_RATIO_LABELS,
  GARMENT_TYPE_LABELS,
  PRODUCT_CATEGORY_LABELS,
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
import type { VisualFormat, StoredVisualFormat } from "@/lib/marketing-studio/visual-format-types";
import {
  CASTILLITOS_FORMATS,
  getDefaultVisualFormat,
  getCastillitosFormatForCategory,
} from "@/lib/marketing-studio/visual-format-types";

import type {
  FotoOutputType,
  VisualStyle,
  BackgroundType,
  AspectRatio,
  GarmentType,
  ProductCategory,
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

type WizardStep = "intent" | "source" | "configuration" | "generation";

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
  intent:        "¿Qué crear?",
  source:        "Material",
  configuration: "Configuración",
  generation:    "Revisión",
};
const STEP_SUBTITLES: Record<WizardStep, string> = {
  intent:        "Tipo de contenido",
  source:        "Fuentes y archivos",
  configuration: "Estilo y detalles",
  generation:    "Vista previa final",
};
const STEP_ORDER: WizardStep[] = ["intent", "source", "configuration", "generation"];

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

interface TenantWizardOptions {
  /**
   * "fashion" → fashion tenant (Do Jeans): shows garmentTypes selector.
   * "retail"  → retail tenant (Castillitos): shows productCategories selector.
   */
  tenantMode:           "fashion" | "retail";
  /** Fashion garment subtypes — shown when tenantMode = "fashion". */
  garmentTypes:         GarmentType[];
  /** Retail product categories — shown when tenantMode = "retail". */
  productCategories:    ProductCategory[];
  /** Commercial lines shown in Step 3 — already excludes fiscal-only lines. */
  brandLines:           BrandLine[];
  /**
   * Lines intentionally hidden from the wizard UI (fiscal/contable only).
   * Not rendered; kept for documentation and future rule enforcement.
   */
  hiddenLines?:         BrandLine[];
  garmentSectionLabel:  string;
  brandSectionLabel:    string;
  /** Show adult fashion model profile (Do Jeans). */
  showModelProfile:     boolean;
  /** Show kids visual context profile (Castillitos). */
  showKidsProfile:      boolean;
  // Step 1 labels
  step1PanelTitle:      string;
  frontLabel:           string;
  backLabel:            string;
  skuPlaceholder:       string;
}

function getTenantWizardOptions(tenantId: string): TenantWizardOptions {
  if (tenantId === "castillitos") {
    return {
      tenantMode: "retail",
      // Retail path — productCategories drives the selector, garmentTypes unused.
      // These are broad commercial segments (NOT garment subtypes like jean/body/pijama).
      // Ropa niño/niña/bebé already cover all clothing subcategories internally.
      productCategories: [
        "ropa_nino", "ropa_nina", "bebe",
        "juguete", "accesorio_bebe", "transporte", "aseo",
        "otro",
      ],
      garmentTypes:        [],   // unused for retail tenants
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
      skuPlaceholder:      "Ej. Conjunto infantil dinosaurio / Jean cargo beige / Body floral bebé",
    };
  }
  // Default / Do Jeans — fashion path
  return {
    tenantMode:          "fashion",
    garmentTypes:        ["jean", "short", "falda", "body", "top", "chaqueta", "vestido", "otro"],
    productCategories:   [],   // unused for fashion tenants
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
        icon:          "📱",
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
        icon:          "⊞",
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
    icon:  "📱",
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
    icon:  "⊞",
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
    border:       active ? `2px solid ${C.blueDark}` : `1px solid ${C.line}`,
    borderRadius: R.md,
    background:   active ? C.blueLight : C.surface,
    cursor:       "pointer",
    fontFamily:   T.mono,
    fontSize:     compact ? T.sz.xs : T.sz.sm,
    fontWeight:   active ? T.wt.bold : T.wt.normal,
    color:        active ? C.blueDark : C.inkMid,
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
  padding: `${S[2]}px ${S[4]}px`, background: C.blueDark, color: C.white,
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

// ── Stepper ─────────────────────────────────────────────────────────────────────────────────

const STEP_ICONS: Record<WizardStep, LucideIcon> = {
  intent:        Camera,
  source:        FileText,
  configuration: SlidersHorizontal,
  generation:    Eye,
};

function Stepper({ currentStep }: { currentStep: WizardStep }) {
  const idx = STEP_ORDER.indexOf(currentStep);

  const stepItems = STEP_ORDER.flatMap((step, i) => {
    const isActive   = i === idx;
    const isComplete = i < idx;
    const StepIcon   = STEP_ICONS[step];
    const result: React.ReactNode[] = [];

    if (i > 0) {
      result.push(
        <div key={`line-${i}`} style={{
          flex:         1,
          height:       0,
          margin:       `0 ${S[2]}px`,
          marginBottom: 24,
          borderTop:    `1.5px dashed ${isComplete ? C.blueDark + "55" : "#dde1ea"}`,
        }} />
      );
    }

    result.push(
      <div key={step} style={{
        display:       "flex",
        flexDirection: "column" as const,
        alignItems:    "center",
        gap:           6,
        minWidth:      88,
        zIndex:        1,
      }}>
        {/* Badge */}
        <div style={{
          width:          isActive ? 44 : 34,
          height:         isActive ? 44 : 34,
          borderRadius:   R.pill,
          background:     isActive
            ? `linear-gradient(135deg, ${C.blueDark} 0%, #6d28d9 100%)`
            : isComplete ? C.blueDark : "#f0f2f6",
          color:          isActive || isComplete ? C.white : "#8b93a5",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          boxShadow:      isActive
            ? `0 0 0 4px rgba(0,74,173,0.15), 0 4px 14px rgba(0,74,173,0.22)`
            : "none",
          transition:     "all 0.25s ease",
          flexShrink:     0,
        }}>
          {isComplete ? (
            <span style={{ fontSize: 14 }}>&#x2713;</span>
          ) : isActive ? (
            <span style={{ fontSize: T.sz.sm, fontWeight: T.wt.black, fontFamily: T.mono }}>{i + 1}</span>
          ) : (
            <StepIcon size={16} strokeWidth={1.8} />
          )}
        </div>

        {/* Labels */}
        <div style={{ textAlign: "center" as const, lineHeight: 1.3 }}>
          <div style={{
            fontSize:   T.sz.xs,
            fontWeight: isActive ? T.wt.bold : T.wt.medium,
            color:      isActive ? C.ink : isComplete ? C.blueDark : "#8b93a5",
            fontFamily: T.mono,
            whiteSpace: "nowrap" as const,
          }}>
            {STEP_LABELS[step]}
          </div>
          <div style={{
            fontSize:   "10px",
            color:      isActive ? C.inkMid : "#b0b8c9",
            fontFamily: T.mono,
            marginTop:  2,
            whiteSpace: "nowrap" as const,
          }}>
            {STEP_SUBTITLES[step]}
          </div>
          {isActive && (
            <div style={{
              width:        24,
              height:       2,
              borderRadius: 2,
              background:   `linear-gradient(90deg, ${C.blueDark} 0%, #7c3aed 100%)`,
              margin:       "4px auto 0",
            }} />
          )}
        </div>
      </div>
    );

    return result;
  });

  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      background:   C.white,
      border:       `1px solid ${C.line}`,
      borderRadius: R.xl,
      padding:      `${S[4]}px ${S[8]}px`,
      marginBottom: S[5],
      boxShadow:    E.sm,
    }}>
      {stepItems}
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
          border:        `2px dashed ${isDragOver ? C.blueDark : isDone ? C.green : C.line}`,
          borderRadius:  R.lg,
          background:    isDragOver ? `${C.blueDark}10` : isDone ? `${C.green}10` : C.surface,
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
  sku, setSku, onNext, onBack, tenantId, sessionId, selectedOutputs, tenantOpts,
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
  onBack?:               () => void;
  tenantId:              string;
  sessionId:             string;
  selectedOutputs:       FotoOutputType[];
  tenantOpts:            TenantWizardOptions;
}) {
  const hasCustomTemplate = selectedOutputs.includes("custom_template");

  return (
    <Panel style={{ marginBottom: 0 }}>
      <PanelHeader title={tenantOpts.step1PanelTitle} icon="📷" />
      <div style={{ padding: `${S[4]}px` }}>
        <div style={{ display: "grid", gap: S[4] }}>
          {/* SKU */}
          <div>
            <label style={labelStyle} htmlFor="sku-input">Nombre del producto</label>
            <input id="sku-input" style={inputStyle} type="text"
              placeholder={tenantOpts.skuPlaceholder}
              value={sku} onChange={e => setSku(e.target.value)} autoComplete="off" />
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
              <div style={{ fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.blueDark,
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
      <ActionRow nextLabel="Continuar →" canNext={frontUrl.trim().length > 0 || backUrl.trim().length > 0} onNext={onNext} onBack={onBack} showBack={!!onBack} />
    </Panel>
  );
}


// ── Source material selector ──────────────────────────────────────────────────

function SourceMaterialSelector() {
  return (
    <div style={{
      display:      "flex",
      gap:          S[3],
      marginBottom: S[4],
    }}>
      {/* Option 1: Upload — active by default */}
      <div style={{
        flex:         1,
        padding:      `${S[3]}px ${S[4]}px`,
        border:       `2px solid ${C.blueDark}`,
        borderRadius: R.md,
        background:   C.blueLight,
        fontFamily:   T.mono,
        cursor:       "default",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span style={{ fontSize: 18 }}>📤</span>
          <div>
            <div style={{ fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.blueDark }}>
              Subir fotos nuevas
            </div>
            <div style={{ fontSize: T.sz.xs, color: C.inkMid, marginTop: 2 }}>
              Carga imágenes desde tu dispositivo
            </div>
          </div>
          <div style={{
            marginLeft: "auto", width: 20, height: 20, borderRadius: R.pill,
            background: C.blueDark, color: C.white,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: T.wt.bold,
          }}>✓</div>
        </div>
      </div>
      {/* Option 2: Library — placeholder */}
      <div style={{
        flex:         1,
        padding:      `${S[3]}px ${S[4]}px`,
        border:       `1px solid ${C.line}`,
        borderRadius: R.md,
        background:   C.surface,
        fontFamily:   T.mono,
        opacity:      0.55,
        cursor:       "not-allowed",
        position:     "relative" as const,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span style={{ fontSize: 18 }}>🗂️</span>
          <div>
            <div style={{ fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
              Desde Biblioteca
            </div>
            <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
              Selecciona activos aprobados
            </div>
          </div>
          <div style={{
            marginLeft: "auto",
            fontSize: T.sz["2xs"], color: C.inkFaint,
            background: C.surfaceAlt, border: `1px solid ${C.line}`,
            borderRadius: R.sm, padding: `2px ${S[2]}px`,
            fontWeight: T.wt.medium,
          }}>Próximamente</div>
        </div>
      </div>
    </div>
  );
}

// ── Step 1 (new): Choose generation intent ──────────────────────────────────────

// Icon + accent metadata per intent — visual only, no logic change
const INTENT_VISUAL: Record<GenerationIntent, {
  Icon:         LucideIcon;
  iconBg:       string;
  iconColor:    string;
  heroGradient: string;
  cardBg:       string;
  badge:        string;
  tags:         string[];
}> = {
  product_photo: {
    Icon:         Camera,
    iconBg:       "#e8f1ff",
    iconColor:    "#004AAD",
    heroGradient: "linear-gradient(145deg, #edf4ff 0%, #d6e8ff 55%, #bfdbfe 100%)",
    cardBg:       "linear-gradient(135deg, #fdfdff 0%, #f5f8ff 100%)",
    badge:        "Ecommerce",
    tags:         ["Catálogo", "Shopify", "CRM"],
  },
  social_photo: {
    Icon:         Smartphone,
    iconBg:       "#f3e8ff",
    iconColor:    "#7c3aed",
    heroGradient: "linear-gradient(145deg, #f5f0ff 0%, #e9dffd 55%, #d8c8fa 100%)",
    cardBg:       "linear-gradient(135deg, #fefcff 0%, #f9f5ff 100%)",
    badge:        "Redes sociales",
    tags:         ["Feed", "Historias", "Reels"],
  },
  social_video: {
    Icon:         Clapperboard,
    iconBg:       "#fff7ed",
    iconColor:    "#c2410c",
    heroGradient: "linear-gradient(145deg, #fff7f0 0%, #feebd8 55%, #fdd5aa 100%)",
    cardBg:       "linear-gradient(135deg, #fffefb 0%, #fff8f2 100%)",
    badge:        "Video",
    tags:         ["TikTok", "Reels", "Shorts"],
  },
  creative_template: {
    Icon:         LayoutTemplate,
    iconBg:       "#f0fdf4",
    iconColor:    "#166534",
    heroGradient: "linear-gradient(145deg, #f0fdf4 0%, #d8f8e2 55%, #b8f0cc 100%)",
    cardBg:       "linear-gradient(135deg, #fbfffc 0%, #f4fdf6 100%)",
    badge:        "Diseño",
    tags:         ["Banners", "Catálogos", "Carruseles"],
  },
};

function ChooseOutputsStep({
  intent, onSelectIntent, onNext, onBack,
}: {
  intent:         GenerationIntent | null;
  onSelectIntent: (v: GenerationIntent) => void;
  onNext:         () => void;
  onBack?:        () => void;
}) {
  const [hovered, setHovered] = useState<GenerationIntent | null>(null);

  return (
    <div style={{ fontFamily: T.mono }}>
      {/* Heading */}
      <div style={{ marginBottom: S[4] }}>
        <h2 style={{
          margin:        0,
          fontSize:      "24px",
          fontWeight:    T.wt.black,
          color:         C.ink,
          letterSpacing: "-0.03em",
          lineHeight:    1.1,
        }}>
          ¿Qué deseas crear?
        </h2>
        <p style={{
          margin:     `${S[1] + 2}px 0 0`,
          fontSize:   T.sz.xs,
          color:      C.inkLight,
          fontFamily: T.mono,
          lineHeight: 1.5,
        }}>
          Elige el tipo de contenido que quieres generar. Puedes cambiar esto después.
        </p>
      </div>

      {/* Cards 2×2 — single surface, vertical */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr 1fr",
        gap:                 S[3],
        marginBottom:        S[4],
      }}>
        {INTENT_CARDS.map(card => {
          const isSelected = intent === card.value;
          const isHovered  = hovered === card.value && !isSelected;
          const meta       = INTENT_VISUAL[card.value];
          const { Icon }   = meta;

          return (
            <button
              key={card.value}
              onClick={() => onSelectIntent(card.value)}
              onMouseEnter={() => setHovered(card.value)}
              onMouseLeave={() => setHovered(null)}
              style={{
                padding:       `${S[3]}px ${S[3]}px ${S[2] + 2}px`,
                border:        isSelected
                  ? `1.5px solid ${meta.iconColor}bb`
                  : `1px solid ${isHovered ? meta.iconColor + "44" : "#e8eaed"}`,
                borderRadius:  R.xl,
                background:    isSelected
                  ? `linear-gradient(145deg, ${meta.iconBg}55 0%, ${meta.iconBg}22 60%, white 100%)`
                  : meta.cardBg,
                cursor:        "pointer",
                textAlign:     "left" as const,
                fontFamily:    T.mono,
                transition:    "all 0.2s ease",
                boxShadow:     isSelected
                  ? [
                      `0 0 0 3px ${meta.iconColor}22`,
                      `0 8px 28px ${meta.iconColor}1c`,
                      `0 2px 6px rgba(0,0,0,0.06)`,
                      `inset 0 1px 0 rgba(255,255,255,0.9)`,
                    ].join(", ")
                  : isHovered
                    ? [
                        `0 8px 28px ${meta.iconColor}14`,
                        `0 2px 8px rgba(0,0,0,0.07)`,
                        `inset 0 1px 0 rgba(255,255,255,0.9)`,
                      ].join(", ")
                    : [
                        `0 1px 3px rgba(0,0,0,0.05)`,
                        `0 4px 12px rgba(0,0,0,0.05)`,
                        `inset 0 1px 0 rgba(255,255,255,0.8)`,
                      ].join(", "),
                transform:     isHovered ? "translateY(-3px)" : "none",
                outline:       "none",
                overflow:      "hidden" as const,
                boxSizing:     "border-box" as const,
                minWidth:      0,
                display:       "flex",
                flexDirection: "column" as const,
                height:        166,
                position:      "relative" as const,
              }}
            >
              {/* Badge — top right absolute */}
              <div style={{
                position:      "absolute" as const,
                top:           S[2] + 2,
                right:         S[3],
                fontSize:      "9px",
                color:         meta.iconColor,
                background:    isSelected
                  ? `${meta.iconBg}ff`
                  : `${meta.iconBg}cc`,
                border:        `1px solid ${meta.iconColor}${isSelected ? "50" : "28"}`,
                borderRadius:  R.pill,
                padding:       `2px ${S[2]}px`,
                fontWeight:    T.wt.bold,
                letterSpacing: "0.08em",
                textTransform: "uppercase" as const,
                transition:    "all 0.2s",
              }}>
                {meta.badge}
              </div>

              {/* App icon capsule */}
              <div style={{
                width:          56,
                height:         56,
                borderRadius:   16,
                background:     `linear-gradient(145deg, #ffffff 0%, ${meta.iconBg}cc 100%)`,
                border:         `1px solid ${meta.iconColor}14`,
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                flexShrink:     0,
                marginBottom:   S[2],
                boxShadow:      [
                  `0 4px 16px ${meta.iconColor}22`,
                  `0 1px 4px rgba(0,0,0,0.08)`,
                  `inset 0 1px 1px rgba(255,255,255,1)`,
                  `inset 0 -1px 2px rgba(0,0,0,0.04)`,
                ].join(", "),
                transition:     "transform 0.2s ease, box-shadow 0.2s ease",
                transform:      isHovered ? "scale(1.04)" : "none",
              }}>
                <Icon
                  size={28}
                  color={meta.iconColor}
                  strokeWidth={1.6}
                />
              </div>

              {/* Title */}
              <div style={{
                fontSize:      T.sz.sm,
                fontWeight:    T.wt.black,
                color:         isSelected ? meta.iconColor : C.ink,
                letterSpacing: "-0.02em",
                lineHeight:    1.2,
                marginBottom:  4,
                paddingRight:  S[8],
                transition:    "color 0.2s",
                whiteSpace:    "nowrap" as const,
                overflow:      "hidden" as const,
                textOverflow:  "ellipsis",
              }}>
                {card.title}
              </div>

              {/* Description — 1 line */}
              <div style={{
                fontSize:     T.sz["2xs"],
                color:        C.inkMid,
                lineHeight:   1.5,
                flex:         1,
                overflow:     "hidden" as const,
                whiteSpace:   "nowrap" as const,
                textOverflow: "ellipsis",
              }}>
                {card.desc}
              </div>

              {/* Tags + radio row */}
              <div style={{
                display:    "flex",
                alignItems: "center",
                gap:        4,
                marginTop:  S[1] + 2,
                flexWrap:   "nowrap" as const,
                overflow:   "hidden" as const,
              }}>
                {meta.tags.slice(0, 3).map(tag => (
                  <span key={tag} style={{
                    fontSize:     "9px",
                    color:        isSelected ? meta.iconColor : C.inkFaint,
                    background:   isSelected ? `${meta.iconBg}cc` : "#f1f3f5",
                    border:       `1px solid ${isSelected ? meta.iconColor + "30" : "transparent"}`,
                    borderRadius: 4,
                    padding:      `1px 5px`,
                    fontWeight:   T.wt.semibold,
                    whiteSpace:   "nowrap" as const,
                    transition:   "all 0.2s",
                  }}>
                    {tag}
                  </span>
                ))}
                <div style={{ flex: 1 }} />
                {/* Selection indicator */}
                <div style={{
                  width:          16,
                  height:         16,
                  borderRadius:   R.pill,
                  flexShrink:     0,
                  border:         isSelected ? "none" : `1.5px solid #d0d5dd`,
                  background:     isSelected ? meta.iconColor : "transparent",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  boxShadow:      isSelected
                    ? `0 0 0 3px ${meta.iconColor}28, 0 2px 6px ${meta.iconColor}30`
                    : "none",
                  transition:     "all 0.2s",
                }}>
                  {isSelected && (
                    <div style={{
                      width:        5,
                      height:       5,
                      borderRadius: R.pill,
                      background:   "rgba(255,255,255,0.95)",
                    }} />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* CTA bar */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          S[4],
        padding:      `${S[2] + 2}px ${S[4]}px`,
        background:   C.surfaceAlt,
        border:       `1px solid ${C.line}`,
        borderRadius: R.lg,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2], flex: 1 }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>&#x1f4a1;</span>
          <span style={{ fontSize: T.sz.xs, color: C.inkMid, fontFamily: T.mono }}>
            Puedes cambiar el tipo de contenido en cualquier momento desde la configuración.
          </span>
        </div>
        <button
          onClick={intent !== null ? onNext : undefined}
          disabled={intent === null}
          style={{
            padding:      `${S[2]}px ${S[5]}px`,
            borderRadius: R.lg,
            border:       "none",
            background:   intent !== null
              ? `linear-gradient(135deg, ${C.blueDark} 0%, #1e40af 100%)`
              : C.inkGhost,
            color:        C.white,
            fontSize:     T.sz.sm,
            fontWeight:   T.wt.bold,
            fontFamily:   T.mono,
            cursor:       intent !== null ? "pointer" : "not-allowed",
            boxShadow:    intent !== null ? `0 2px 10px rgba(0,74,173,0.28)` : "none",
            transition:   "all 0.15s",
            whiteSpace:   "nowrap" as const,
            flexShrink:   0,
          }}
        >
          Continuar →
        </button>
      </div>
    </div>
  );
}

// ── Visual format selector (Castillitos retail path only) ─────────────────────

function VisualFormatSelector({
  value, onChange,
  systemFormats,
  customFormats, onCustomFormatSaved,
  orgSlug,
  recommendedFormatId,
}: {
  value:                VisualFormat | null;
  onChange:             (f: VisualFormat) => void;
  /** System formats to show (CASTILLITOS_FORMATS for retail tenants). */
  systemFormats:        VisualFormat[];
  /** Persisted custom formats for this tenant. */
  customFormats:        StoredVisualFormat[];
  /** Called after a new custom format is successfully saved to the server. */
  onCustomFormatSaved:  (f: StoredVisualFormat) => void;
  /** Org slug — used to build the save endpoint URL. */
  orgSlug:              string;
  /** Format id recommended for the current product category — shown with a "Sugerido" badge. */
  recommendedFormatId?: string;
}) {
  const [showCustom,    setShowCustom]    = useState(false);
  const [customName,    setCustomName]    = useState("");
  const [customWidth,   setCustomWidth]   = useState("820");
  const [customHeight,  setCustomHeight]  = useState("1200");
  const [customTop,     setCustomTop]     = useState("60");
  const [customBottom,  setCustomBottom]  = useState("60");
  const [customLeft,    setCustomLeft]    = useState("40");
  const [customRight,   setCustomRight]   = useState("40");
  const [saving,        setSaving]        = useState(false);
  const [saveError,     setSaveError]     = useState<string | null>(null);

  async function handleSaveAndUse() {
    setSaving(true);
    setSaveError(null);

    const w = parseInt(customWidth,  10) || 820;
    const h = parseInt(customHeight, 10) || 1200;
    const t = parseInt(customTop,    10) || 0;
    const b = parseInt(customBottom, 10) || 0;
    const l = parseInt(customLeft,   10) || 0;
    const r = parseInt(customRight,  10) || 0;

    const safeArea = { width: Math.max(1, w - l - r), height: Math.max(1, h - t - b) };
    const compositionNotes =
      `Product centered in safe area (${safeArea.width}×${safeArea.height} px). ` +
      `Maintain margins — top: ${t} px, bottom: ${b} px, left: ${l} px, right: ${r} px.`;

    try {
      const res = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/foto-estudio/visual-formats`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            name:             customName.trim() || "Formato personalizado",
            width:            w,
            height:           h,
            margins:          { top: t, bottom: b, left: l, right: r },
            safeArea,
            compositionNotes,
          }),
        },
      );
      const data = await res.json() as { ok?: boolean; format?: StoredVisualFormat; error?: string };
      if (!res.ok || data.error) {
        setSaveError(data.error ?? "Error al guardar el formato.");
        setSaving(false);
        return;
      }
      const saved = data.format!;
      onCustomFormatSaved(saved);
      onChange(saved);
      setShowCustom(false);
      // Reset form for next use
      setCustomName(""); setCustomWidth("820"); setCustomHeight("1200");
      setCustomTop("60"); setCustomBottom("60"); setCustomLeft("40"); setCustomRight("40");
    } catch {
      setSaveError("Error de red. Verifica tu conexión e intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  const pillBtn = (active: boolean) => ({
    padding:      `${S[2]}px ${S[3]}px`,
    borderRadius: R.sm,
    border:       `1.5px solid ${active ? C.blueDark : C.line}`,
    background:   active ? C.blueLight : C.surface,
    color:        active ? C.blueDark  : C.ink,
    fontFamily:   T.mono,
    fontSize:     T.sz.sm,
    fontWeight:   active ? T.wt.semibold : T.wt.normal,
    cursor:       "pointer" as const,
    textAlign:    "left"  as const,
    transition:   "border-color 0.15s, background 0.15s",
  });

  const inputSm = {
    padding:      `${S[1]}px ${S[2]}px`,
    border:       `1px solid ${C.line}`,
    borderRadius: R.sm,
    fontFamily:   T.mono,
    fontSize:     T.sz.xs,
    color:        C.ink,
    background:   C.surface,
    width:        "100%",
  };

  const allFormats: VisualFormat[] = [...systemFormats, ...customFormats];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
      {/* System + custom formats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
        {allFormats.map(fmt => {
          const active = value?.id === fmt.id;
          return (
            <button key={fmt.id} onClick={() => onChange(fmt)} style={pillBtn(active)}>
              <div style={{ display: "flex", alignItems: "center", gap: S[1], flexWrap: "wrap" }}>
                <span style={{ fontWeight: active ? T.wt.semibold : T.wt.medium }}>{fmt.name}</span>
                {fmt.id === recommendedFormatId && (
                  <span style={{
                    fontSize:     T.sz["2xs"],
                    color:        active ? C.blueDark : C.inkFaint,
                    border:       `1px solid ${active ? C.blueDark : C.line}`,
                    borderRadius: R.sm, padding: "0 4px", lineHeight: "1.4",
                    fontFamily:   T.mono,
                  }}>sugerido</span>
                )}
                {fmt.isCustom && (
                  <span style={{
                    fontSize:      T.sz["2xs"], color: active ? C.blueDark : C.inkGhost,
                    border:        `1px solid ${active ? C.blueDark : C.line}`,
                    borderRadius:  R.sm, padding: "0 4px", lineHeight: "1.4",
                    fontFamily:    T.mono,
                  }}>custom</span>
                )}
              </div>
              <div style={{ fontSize: T.sz["2xs"], color: active ? C.blueDark : C.inkFaint, marginTop: 2 }}>
                {fmt.width}×{fmt.height} px
              </div>
              <div style={{ fontSize: T.sz["2xs"], color: active ? C.blueDark : C.inkFaint }}>
                {fmt.description}
              </div>
            </button>
          );
        })}
      </div>

      {/* Custom format form toggle */}
      {!showCustom ? (
        <button onClick={() => setShowCustom(true)} style={{
          padding:      `${S[2]}px ${S[3]}px`,
          borderRadius: R.sm,
          border:       `1.5px dashed ${C.line}`,
          background:   "transparent",
          color:        C.inkGhost,
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          cursor:       "pointer" as const,
          textAlign:    "left" as const,
        }}>
          + Formato personalizado
        </button>
      ) : (
        <div style={{
          border:        `1.5px solid ${C.line}`,
          borderRadius:  R.md,
          padding:       `${S[3]}px`,
          background:    C.surfaceAlt,
          display:       "flex",
          flexDirection: "column" as const,
          gap:           S[2],
        }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, fontWeight: T.wt.medium }}>
            Nuevo formato personalizado
          </div>
          <input
            value={customName}
            onChange={e => setCustomName(e.target.value)}
            placeholder="Nombre del formato"
            style={inputSm}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
            <div>
              <div style={{ fontSize: T.sz["2xs"], color: C.inkGhost, fontFamily: T.mono, marginBottom: 2 }}>Ancho (px)</div>
              <input value={customWidth}  onChange={e => setCustomWidth(e.target.value)}  type="number" style={inputSm} />
            </div>
            <div>
              <div style={{ fontSize: T.sz["2xs"], color: C.inkGhost, fontFamily: T.mono, marginBottom: 2 }}>Alto (px)</div>
              <input value={customHeight} onChange={e => setCustomHeight(e.target.value)} type="number" style={inputSm} />
            </div>
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>Márgenes (px)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: S[2] }}>
            {([
              ["Sup",  customTop,    setCustomTop],
              ["Inf",  customBottom, setCustomBottom],
              ["Izq",  customLeft,   setCustomLeft],
              ["Der",  customRight,  setCustomRight],
            ] as const).map(([label, val, setter]) => (
              <div key={label}>
                <div style={{ fontSize: T.sz["2xs"], color: C.inkGhost, fontFamily: T.mono, marginBottom: 2 }}>{label}</div>
                <input value={val} onChange={e => setter(e.target.value)} type="number" style={inputSm} />
              </div>
            ))}
          </div>
          {/* Save error */}
          {saveError && (
            <div style={{
              fontFamily:   T.mono, fontSize: T.sz.xs,
              color:        "#b91c1c",
              background:   "#fef2f2",
              border:       "1px solid #fecaca",
              borderRadius: R.sm,
              padding:      `${S[1]}px ${S[2]}px`,
            }}>
              {saveError}
            </div>
          )}
          <div style={{ display: "flex", gap: S[2] }}>
            <button
              onClick={handleSaveAndUse}
              disabled={saving}
              style={{
                padding:      `${S[1]}px ${S[3]}px`,
                borderRadius: R.sm,
                border:       `1.5px solid ${C.blueDark}`,
                background:   saving ? C.blueLight : C.blueDark,
                color:        saving ? C.blueDark  : C.white,
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                fontWeight:   T.wt.medium,
                cursor:       saving ? "not-allowed" as const : "pointer" as const,
                opacity:      saving ? 0.7 : 1,
              }}
            >
              {saving ? "Guardando…" : "Guardar y usar"}
            </button>
            <button onClick={() => { setShowCustom(false); setSaveError(null); }} style={{
              padding:      `${S[1]}px ${S[3]}px`,
              borderRadius: R.sm,
              border:       `1.5px solid ${C.line}`,
              background:   "transparent",
              color:        C.inkGhost,
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              cursor:       "pointer" as const,
            }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Active format summary */}
      {value && (
        <div style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, paddingTop: S[1],
        }}>
          {value.isCustom ? "Personalizado" : "Formato"}: {value.name} · {value.width}×{value.height} px
          · área útil {value.safeArea.width}×{value.safeArea.height} px
        </div>
      )}

      {/* Format guide — composition reference for the operator */}
      <div style={{
        borderTop:   `1px solid ${C.lineSubtle}`,
        paddingTop:  S[2],
        marginTop:   S[1],
        display:     "flex",
        flexDirection: "column" as const,
        gap:         3,
      }}>
        {([
          ["Prendas superiores",     "Camisas, camisetas, blusas, buzos y prendas de torso."],
          ["Cuerpo completo",        "Conjuntos, vestidos, enterizos y prendas largas."],
          ["Accesorios y juguetes",  "Juguetes, accesorios y productos pequeños."],
          ["Estándar Castillitos",   "Recomendado cuando el tipo de prenda no está definido."],
        ] as const).map(([label, hint]) => (
          <div key={label} style={{ display: "flex", gap: S[2], fontFamily: T.mono, fontSize: T.sz["2xs"] }}>
            <span style={{ color: C.inkGhost, minWidth: 140, flexShrink: 0 }}>{label}</span>
            <span style={{ color: C.inkFaint }}>{hint}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 3: Visual settings ───────────────────────────────────────────────────

function VisualSettingsStep({
  visualStyle, setVisualStyle, background, setBackground,
  aspectRatio, setAspectRatio, quantity, setQuantity,
  garmentType, setGarmentType,
  productCategory, setProductCategory,
  brandLine, setBrandLine,
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
  visualFormat, setVisualFormat,
  systemFormats, customFormats, onCustomFormatSaved,
  recommendedFormatId,
}: {
  visualStyle:              VisualStyle;
  setVisualStyle:           (v: VisualStyle) => void;
  background:               BackgroundType;
  setBackground:            (v: BackgroundType) => void;
  aspectRatio:              AspectRatio;
  setAspectRatio:           (v: AspectRatio) => void;
  quantity:                 number;
  setQuantity:              (v: number) => void;
  /** Fashion path (Do Jeans) — unused for retail tenants. */
  garmentType:              GarmentType;
  setGarmentType:           (v: GarmentType) => void;
  /** Retail path (Castillitos) — unused for fashion tenants. */
  productCategory:          ProductCategory;
  setProductCategory:       (v: ProductCategory) => void;
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
  /** Retail canvas format (Castillitos only). Non-retail tenants use aspectRatio instead. */
  visualFormat:             VisualFormat | null;
  setVisualFormat:          (v: VisualFormat) => void;
  /** System formats to display in the retail selector. */
  systemFormats:            VisualFormat[];
  /** Persisted custom formats for this tenant. */
  customFormats:            StoredVisualFormat[];
  /** Called after a new custom format is successfully saved. Updates parent state. */
  onCustomFormatSaved:      (f: StoredVisualFormat) => void;
  /** Format id recommended for the current product category. */
  recommendedFormatId?:     string;
  // TODO [Sprint 5 — Producto]: productDescription, productPrice, productColors,
  //   productSizes, productNotes — recolectar en paso de publicación post-aprobación.
}) {
  const tenantOpts = getTenantWizardOptions(tenantId);

  // ── Minimum validation per intent ──────────────────────────────────────
  const canNext = (() => {
    if (!generationIntent) return false;
    if (generationIntent === "product_photo") {
      // "Otro" requires freePrompt so the AI has enough context to generate.
      const isOther = tenantOpts.tenantMode === "retail"
        ? productCategory === "otro"
        : garmentType === "otro";
      if (isOther) return freePrompt.trim() !== "";
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
    { value: "instagram",  label: "Instagram",        icon: "IG", color: "#E1306C" },
    { value: "tiktok",     label: "TikTok",           icon: "TT", color: "#010101" },
    { value: "facebook",   label: "Facebook",         icon: "F",  color: "#1877F2" },
    { value: "whatsapp",   label: "WhatsApp",         icon: "W",  color: "#25D366" },
    { value: "google_ads", label: "Google Ads",       icon: "G",  color: "#4285F4" },
  ];
  const SOCIAL_PUB_TYPES_EXT = [
    { value: "feed",       label: "Feed",             icon: "▦" },
    { value: "historia",   label: "Historia",         icon: "◷" },
    { value: "reel_cover", label: "Reel cover",       icon: "▶" },
    { value: "anuncio",    label: "Anuncio",          icon: "⚡" },
    { value: "post_promo", label: "Post promo",       icon: "🎯" },
    { value: "carrusel",   label: "Carrusel",         icon: "↔" },
  ];
  const CHANNEL_FORMAT: Record<string, string> = {
    instagram:  "Feed: 1:1 · 4:5 | Historia: 9:16 | Reel: 9:16",
    tiktok:     "9:16 · 1080×1920px",
    facebook:   "Feed: 4:5 · 1:1 | Anuncio: 1.91:1",
    whatsapp:   "Estado: 9:16 · hasta 30s",
    google_ads: "Banner: 1.91:1 | Square: 1:1",
  };
  const VIDEO_TYPES = [
    { value: "con_modelo",          label: "Con modelo",              desc: "Modelo infantil usando la prenda en escena", icon: "🧒" },
    { value: "sin_modelo",          label: "Sin modelo",              desc: "Producto solo, fondo limpio o ambientado",  icon: "📦" },
    { value: "producto_ambientado", label: "Producto ambientado",     desc: "Producto integrado en escena o contexto",   icon: "🌅" },
    { value: "desde_fotos",         label: "Animar desde fotos",      desc: "Clips animados a partir de fotos subidas",  icon: "🎞️" },
  ];
  const CAMERA_MOVES = [
    "Estático",
    "Zoom suave",
    "Zoom dramático",
    "Pan lateral",
    "Travelling",
    "Aéreo / drone",
  ];
  const PIECE_TYPES = [
    { value: "flyer",               label: "Flyer",               desc: "Piezas promocionales de campaña",   icon: "🗞️" },
    { value: "banner_shopify",      label: "Banner Shopify",      desc: "Cabeceras y banners de tienda",     icon: "🏪" },
    { value: "catalogo",            label: "Catálogo",            desc: "Grilla organizada de productos",    icon: "📋" },
    { value: "carrusel",            label: "Carrusel",            desc: "Secuencia de slides para redes",    icon: "🎠" },
    { value: "plantilla_shopify",   label: "Plantilla Shopify",   desc: "Layout reutilizable de producto",   icon: "🧩" },
    { value: "landing_informativa", label: "Landing informativa", desc: "Página de colección o campaña",     icon: "🚀" },
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
                    {tenantOpts.tenantMode === "retail"
                      ? tenantOpts.productCategories.map(pc => (
                          <button key={pc} onClick={() => setProductCategory(pc)} style={pillBtn(productCategory === pc, true)}>
                            {PRODUCT_CATEGORY_LABELS[pc]}
                          </button>
                        ))
                      : tenantOpts.garmentTypes.map(gt => (
                          <button key={gt} onClick={() => setGarmentType(gt)} style={pillBtn(garmentType === gt, true)}>
                            {GARMENT_TYPE_LABELS[gt]}
                          </button>
                        ))
                    }
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
                          color: brandLine === bl ? C.blueDark : C.ink, marginBottom: 2 }}>
                          {BRAND_LINE_LABELS[bl]}
                        </div>
                        <div style={{ fontSize: T.sz.xs, color: brandLine === bl ? C.blueDark : C.inkLight }}>
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
              border: `1.5px solid ${C.blueDark}`, borderRadius: R.md, background: C.blueLight }}>
              <div style={{ fontWeight: T.wt.black, fontSize: T.sz.sm, color: C.blueDark,
                textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: S[3] }}>
                B. Dirección visual
              </div>
              <div style={{ display: "grid", gap: S[4] }}>
                <div>
                  <div style={labelStyle}>Tipo de modelo</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[2] }}>
                    {KIDS_MODEL_TYPES.map(mt => (
                      <button key={mt} onClick={() => setKidsModelType(mt)} style={{
                        padding: `${S[2]}px ${S[2]}px`,
                        border: kidsModelType === mt ? `2px solid ${C.blueDark}` : `1px solid ${C.line}`,
                        borderRadius: R.md, background: kidsModelType === mt ? C.blueDark : C.white,
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
                          border: kidsAgeRange === ar ? `2px solid ${C.blueDark}` : `1px solid ${C.line}`,
                          borderRadius: R.md, background: kidsAgeRange === ar ? C.blueDark : C.white,
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
                          border: kidsVisualTrait === vt ? `2px solid ${C.blueDark}` : `1px solid ${C.line}`,
                          borderRadius: R.md, background: kidsVisualTrait === vt ? C.blueDark : C.white,
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
                        border: kidsVisualStyle === vs ? `2px solid ${C.blueDark}` : `1px solid ${C.line}`,
                        borderRadius: R.md, background: kidsVisualStyle === vs ? C.blueDark : C.white,
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
                  {tenantOpts.tenantMode === "retail" ? (
                    /* Retail path (Castillitos) — canvas format selector */
                    <VisualFormatSelector
                      value={visualFormat}
                      onChange={setVisualFormat}
                      systemFormats={systemFormats}
                      customFormats={customFormats}
                      onCustomFormatSaved={onCustomFormatSaved}
                      orgSlug={tenantId}
                      recommendedFormatId={recommendedFormatId}
                    />
                  ) : (
                    /* Fashion path (Do Jeans) — existing aspect ratio pills */
                    <div style={{ display: "flex", gap: S[2] }}>
                      {ASPECT_RATIOS.map(r => (
                        <button key={r} onClick={() => setAspectRatio(r)} style={pillBtn(aspectRatio === r, true)}>
                          {ASPECT_RATIO_LABELS[r]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{
              border:       `1.5px solid ${C.blueBorder}`,
              borderRadius: R.md,
              background:   `linear-gradient(135deg, ${C.blueLight} 0%, rgba(240,247,255,0.4) 100%)`,
              padding:      `${S[3]}px`,
              boxShadow:    `0 0 0 3px ${C.blueDark}0A`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[2] }}>
                <div style={labelStyle}>Dirección creativa IA</div>
                <div style={{
                  background:    C.blueDark,
                  color:         C.white,
                  fontSize:      9,
                  fontWeight:    T.wt.black,
                  fontFamily:    T.mono,
                  letterSpacing: "0.08em",
                  padding:       "2px 6px",
                  borderRadius:  R.sm,
                  flexShrink:    0,
                }}>IA</div>
                <span style={{ fontSize: T.sz.xs, color: C.inkFaint, fontFamily: T.mono, fontWeight: T.wt.normal }}>opcional</span>
              </div>
              <textarea value={freePrompt} onChange={e => setFreePrompt(e.target.value)}
                placeholder="Ej. Playa en Italia · Europa invierno · Editorial Vogue · Calle urbana en Tokio"
                rows={3} style={{
                  ...inputStyle,
                  resize:     "vertical" as const,
                  border:     `1px solid ${C.blueBorder}`,
                  background: C.white,
                  boxShadow:  `0 0 0 2px ${C.blueDark}08`,
                }} />
              <div style={{ fontSize: T.sz.xs, color: C.blueDark, marginTop: S[1], opacity: 0.8 }}>
                Describe el ambiente, estilo o contexto. Agentik IA lo usará para construir la escena final.
              </div>
            </div>

          </>)}

          {/* ══ SOCIAL PHOTO ══════════════════════════════════════════════ */}
          {generationIntent === "social_photo" && (<>

            <div style={secBoxStyle}>
              <div style={secHeaderStyle}>A. Canal de publicación *</div>
              <div style={{ display: "grid", gap: S[3] }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[2] }}>
                  {SOCIAL_CHANNELS.map(ch => {
                    const isActive = socialChannel === ch.value;
                    return (
                      <button key={ch.value} onClick={() => setSocialChannel(ch.value)} style={{
                        padding:      `${S[2]}px ${S[2]}px`,
                        border:       isActive ? `2px solid ${ch.color}` : `1px solid ${C.line}`,
                        borderRadius: R.md,
                        background:   isActive ? `${ch.color}12` : C.white,
                        cursor:       "pointer",
                        fontFamily:   T.mono,
                        display:      "flex",
                        flexDirection: "column" as const,
                        alignItems:   "center",
                        gap:          S[1],
                        transition:   "all 0.12s",
                        boxShadow:    isActive ? `0 0 0 3px ${ch.color}22` : "none",
                      }}>
                        <div style={{
                          width:          28,
                          height:         28,
                          borderRadius:   R.sm,
                          background:     isActive ? ch.color : `${ch.color}22`,
                          color:          isActive ? C.white : ch.color,
                          display:        "flex",
                          alignItems:     "center",
                          justifyContent: "center",
                          fontSize:       T.sz.xs,
                          fontWeight:     T.wt.black,
                          letterSpacing:  "0.02em",
                        }}>{ch.icon}</div>
                        <div style={{
                          fontSize:   T.sz.xs,
                          fontWeight: isActive ? T.wt.bold : T.wt.normal,
                          color:      isActive ? ch.color : C.inkMid,
                        }}>{ch.label}</div>
                      </button>
                    );
                  })}
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
                {SOCIAL_PUB_TYPES_EXT.map(pt => {
                  const isActive = socialPubType === pt.value;
                  return (
                    <button key={pt.value} onClick={() => setSocialPubType(pt.value)} style={{
                      padding:      `${S[2]}px ${S[2]}px`,
                      border:       isActive ? `2px solid ${C.blueDark}` : `1px solid ${C.line}`,
                      borderRadius: R.md,
                      background:   isActive ? C.blueLight : C.white,
                      cursor:       "pointer",
                      fontFamily:   T.mono,
                      display:      "flex",
                      alignItems:   "center",
                      gap:          S[1],
                      transition:   "all 0.1s",
                    }}>
                      <span style={{ fontSize: T.sz.base, color: isActive ? C.blueDark : C.inkLight }}>{pt.icon}</span>
                      <span style={{
                        fontSize:   T.sz.xs,
                        fontWeight: isActive ? T.wt.bold : T.wt.normal,
                        color:      isActive ? C.blueDark : C.inkMid,
                      }}>{pt.label}</span>
                    </button>
                  );
                })}
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
                    placeholder="Ej. Temporada Verano 2026, Temporada Vacaciones" style={inputStyle} />
                </div>
              </div>
            </div>

            <div style={{
              border:       `1.5px solid ${C.blueBorder}`,
              borderRadius: R.md,
              background:   `linear-gradient(135deg, ${C.blueLight} 0%, rgba(240,247,255,0.4) 100%)`,
              padding:      `${S[3]}px`,
              boxShadow:    `0 0 0 3px ${C.blueDark}0A`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[2] }}>
                <div style={labelStyle}>Dirección creativa IA</div>
                <div style={{
                  background:    C.blueDark,
                  color:         C.white,
                  fontSize:      9,
                  fontWeight:    T.wt.black,
                  fontFamily:    T.mono,
                  letterSpacing: "0.08em",
                  padding:       "2px 6px",
                  borderRadius:  R.sm,
                  flexShrink:    0,
                }}>IA</div>
                <span style={{ fontSize: T.sz.xs, color: C.inkFaint, fontFamily: T.mono, fontWeight: T.wt.normal }}>opcional</span>
              </div>
              <textarea value={freePrompt} onChange={e => setFreePrompt(e.target.value)}
                placeholder="Ej. Playa en Italia · Editorial Vogue · Ambiente navideño · Tokio urbano"
                rows={3} style={{
                  ...inputStyle,
                  resize:     "vertical" as const,
                  border:     `1px solid ${C.blueBorder}`,
                  background: C.white,
                  boxShadow:  `0 0 0 2px ${C.blueDark}08`,
                }} />
              <div style={{ fontSize: T.sz.xs, color: C.blueDark, marginTop: S[1], opacity: 0.8 }}>
                Describe el ambiente, estilo o contexto. Agentik IA lo usará para construir la escena final.
              </div>
            </div>

          </>)}

          {/* ══ SOCIAL VIDEO ══════════════════════════════════════════════ */}
          {generationIntent === "social_video" && (<>

            <div style={secBoxStyle}>
              <div style={secHeaderStyle}>A. Tipo de video</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
                {VIDEO_TYPES.map(vt => {
                  const isActive = videoType === vt.value;
                  return (
                    <button key={vt.value} onClick={() => setVideoType(vt.value)} style={{
                      padding:      `${S[3]}px`,
                      border:       isActive ? `2px solid ${C.blueDark}` : `1px solid ${C.line}`,
                      borderRadius: R.md,
                      background:   isActive ? C.blueLight : C.white,
                      cursor:       "pointer",
                      textAlign:    "left" as const,
                      fontFamily:   T.mono,
                      boxShadow:    isActive ? `0 0 0 3px ${C.blueDark}14` : E.xs,
                      transition:   "all 0.12s",
                    }}>
                      <div style={{ fontSize: 22, marginBottom: S[1], lineHeight: 1 }}>{vt.icon}</div>
                      <div style={{ fontWeight: T.wt.bold, fontSize: T.sz.sm, marginBottom: 3,
                        color: isActive ? C.blueDark : C.ink }}>{vt.label}</div>
                      <div style={{ fontSize: T.sz.xs,
                        color: isActive ? C.blueDark : C.inkLight, lineHeight: 1.5 }}>{vt.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={secBoxStyle}>
              <div style={secHeaderStyle}>B. Configuración</div>
              <div style={{ display: "grid", gap: S[3] }}>
                <div>
                  <div style={labelStyle}>Duración *</div>
                  <div style={{ display: "flex", gap: S[2] }}>
                    {[
                      { value: "15s", label: "15 seg", hint: "Reel · TikTok" },
                      { value: "60s", label: "60 seg", hint: "Story extendida" },
                    ].map(d => {
                      const isActive = videoDuration === d.value;
                      return (
                        <button key={d.value} onClick={() => setVideoDuration(d.value)} style={{
                          padding:      `${S[2]}px ${S[3]}px`,
                          border:       isActive ? `2px solid ${C.blueDark}` : `1px solid ${C.line}`,
                          borderRadius: R.md,
                          background:   isActive ? C.blueLight : C.white,
                          cursor:       "pointer",
                          fontFamily:   T.mono,
                          textAlign:    "left" as const,
                          transition:   "all 0.1s",
                        }}>
                          <div style={{ fontWeight: T.wt.black, fontSize: T.sz.base,
                            color: isActive ? C.blueDark : C.ink }}>{d.label}</div>
                          <div style={{ fontSize: T.sz.xs, color: isActive ? C.blueDark : C.inkFaint, marginTop: 1 }}>{d.hint}</div>
                        </button>
                      );
                    })}
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

            <div style={{
              border:       `1.5px solid ${C.blueBorder}`,
              borderRadius: R.md,
              background:   `linear-gradient(135deg, ${C.blueLight} 0%, rgba(240,247,255,0.4) 100%)`,
              padding:      `${S[3]}px`,
              boxShadow:    `0 0 0 3px ${C.blueDark}0A`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[2] }}>
                <div style={labelStyle}>Dirección creativa IA</div>
                <div style={{
                  background:    C.blueDark,
                  color:         C.white,
                  fontSize:      9,
                  fontWeight:    T.wt.black,
                  fontFamily:    T.mono,
                  letterSpacing: "0.08em",
                  padding:       "2px 6px",
                  borderRadius:  R.sm,
                  flexShrink:    0,
                }}>IA</div>
                <span style={{ fontSize: T.sz.xs, color: C.inkFaint, fontFamily: T.mono, fontWeight: T.wt.normal }}>opcional</span>
              </div>
              <textarea value={freePrompt} onChange={e => setFreePrompt(e.target.value)}
                placeholder="Ej. Playa en Italia · Ambiente vibrante · Luz de hora dorada · Estilo editorial"
                rows={3} style={{
                  ...inputStyle,
                  resize:     "vertical" as const,
                  border:     `1px solid ${C.blueBorder}`,
                  background: C.white,
                  boxShadow:  `0 0 0 2px ${C.blueDark}08`,
                }} />
              <div style={{ fontSize: T.sz.xs, color: C.blueDark, marginTop: S[1], opacity: 0.8 }}>
                Describe el ambiente, estilo o contexto. Agentik IA lo usará para construir la escena final.
              </div>
            </div>

          </>)}

          {/* ══ CREATIVE TEMPLATE ══════════════════════════════════════════ */}
          {generationIntent === "creative_template" && (<>

            <div style={secBoxStyle}>
              <div style={secHeaderStyle}>A. Tipo de pieza *</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[3] }}>
                {PIECE_TYPES.map(pt => {
                  const isActive = pieceType === pt.value;
                  return (
                    <button key={pt.value} onClick={() => setPieceType(pt.value)} style={{
                      padding:      `${S[3]}px`,
                      border:       isActive ? `2px solid ${C.blueDark}` : `1px solid ${C.line}`,
                      borderRadius: R.md,
                      background:   isActive ? C.blueLight : C.white,
                      cursor:       "pointer",
                      textAlign:    "left" as const,
                      fontFamily:   T.mono,
                      boxShadow:    isActive ? `0 0 0 3px ${C.blueDark}14` : E.xs,
                      transition:   "all 0.12s",
                    }}>
                      <div style={{ fontSize: 20, marginBottom: S[1], lineHeight: 1 }}>{pt.icon}</div>
                      <div style={{ fontWeight: T.wt.bold, fontSize: T.sz.sm, marginBottom: 3,
                        color: isActive ? C.blueDark : C.ink }}>{pt.label}</div>
                      <div style={{ fontSize: T.sz.xs,
                        color: isActive ? C.blueDark : C.inkLight, lineHeight: 1.4 }}>{pt.desc}</div>
                    </button>
                  );
                })}
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
                    placeholder="Ej. Temporada Verano 2026" style={inputStyle} />
                </div>
                {/* TODO [Sprint 5 — Producto]: Colores, tallas y precio se recolectarán
                    en el paso de publicación, después de aprobar el asset generado. */}
                <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                  <button onClick={() => setTemplateIncludePrice(!templateIncludePrice)} style={{
                    padding: `${S[1] + 2}px ${S[3]}px`,
                    border: `2px solid ${templateIncludePrice ? C.blueDark : C.line}`,
                    borderRadius: R.md,
                    background: templateIncludePrice ? C.blueLight : C.surface,
                    cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.sm,
                    fontWeight: T.wt.bold, color: templateIncludePrice ? C.blueDark : C.inkMid,
                  }}>
                    {templateIncludePrice ? "✓ Con precio" : "Sin precio"}
                  </button>
                  <span style={{ fontSize: T.sz.xs, color: C.inkFaint }}>
                    Incluir precio visible en la pieza
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: S[3], padding: `${S[3]}px`,
              background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: R.md }}>
              <div style={{ fontSize: 16, flexShrink: 0 }}>ℹ️</div>
              <div style={{ fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.6, fontFamily: T.mono }}>
                Los catálogos se organizarán automáticamente por categoría para evitar mezclar ropa, juguetes, accesorios y transporte sin lógica.
              </div>
            </div>

            <div style={{
              border:       `1.5px solid ${C.blueBorder}`,
              borderRadius: R.md,
              background:   `linear-gradient(135deg, ${C.blueLight} 0%, rgba(240,247,255,0.4) 100%)`,
              padding:      `${S[3]}px`,
              boxShadow:    `0 0 0 3px ${C.blueDark}0A`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[2] }}>
                <div style={labelStyle}>Dirección creativa IA</div>
                <div style={{
                  background:    C.blueDark,
                  color:         C.white,
                  fontSize:      9,
                  fontWeight:    T.wt.black,
                  fontFamily:    T.mono,
                  letterSpacing: "0.08em",
                  padding:       "2px 6px",
                  borderRadius:  R.sm,
                  flexShrink:    0,
                }}>IA</div>
                <span style={{ fontSize: T.sz.xs, color: C.inkFaint, fontFamily: T.mono, fontWeight: T.wt.normal }}>opcional</span>
              </div>
              <textarea value={freePrompt} onChange={e => setFreePrompt(e.target.value)}
                placeholder="Ej. Colores de marca vibrantes · Sin logo · Fondo blanco institucional · Estilo minimalista"
                rows={3} style={{
                  ...inputStyle,
                  resize:     "vertical" as const,
                  border:     `1px solid ${C.blueBorder}`,
                  background: C.white,
                  boxShadow:  `0 0 0 2px ${C.blueDark}08`,
                }} />
              <div style={{ fontSize: T.sz.xs, color: C.blueDark, marginTop: S[1], opacity: 0.8 }}>
                Describe el ambiente, estilo o contexto. Agentik IA lo usará para construir la escena final.
              </div>
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

// ── Approval metadata ─────────────────────────────────────────────────────────

interface ApprovalMeta {
  name:        string;
  category:    string;
  colors:      string;
  price:       string;
  collection:  string;
  tags:        string;
  channel:     string;
  shopifySync: boolean;
  crmSync:     boolean;
}

// ── Correction chips ──────────────────────────────────────────────────────────

const CORRECTION_CHIPS = [
  { id: "fix_face",        label: "Corregir rostro" },
  { id: "fix_hands",       label: "Corregir manos" },
  { id: "remove_object",   label: "Quitar objeto" },
  { id: "improve_light",   label: "Mejorar iluminación" },
  { id: "improve_sharp",   label: "Mejorar nitidez" },
  { id: "fix_proportions", label: "Corregir proporciones" },
  { id: "replace_bg",      label: "Reemplazar fondo" },
  { id: "bigger_product",  label: "Producto más grande" },
  { id: "improve_realism", label: "Mejorar realismo" },
  { id: "regen_scene",     label: "Regenerar escena" },
] as const;

// ── Approval modal ────────────────────────────────────────────────────────────

const APPROVAL_CHANNELS = ["Shopify", "Instagram", "TikTok", "WhatsApp", "Catálogo", "Biblioteca"];

function ApprovalModal({
  assetUrl, onConfirm, onCancel,
}: {
  assetUrl:  string;
  onConfirm: (meta: ApprovalMeta) => void;
  onCancel:  () => void;
}) {
  const [name,        setName]        = useState("");
  const [category,    setCategory]    = useState("");
  const [colors,      setColors]      = useState("");
  const [price,       setPrice]       = useState("");
  const [collection,  setCollection]  = useState("");
  const [tags,        setTags]        = useState("");
  const [channel,     setChannel]     = useState("");
  const [shopifySync, setShopifySync] = useState(false);
  const [crmSync,     setCrmSync]     = useState(false);

  return (
    <div style={{
      position:   "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.45)",
      display:    "flex", alignItems: "center", justifyContent: "center",
      padding:    `${S[4]}px`,
    }}>
      <div style={{
        background:   C.white, borderRadius: R.xl,
        boxShadow:    E.lg, width: "100%", maxWidth: 520,
        maxHeight:    "90vh", overflowY: "auto",
        border:       `1px solid ${C.line}`,
      }}>
        {/* Header */}
        <div style={{
          padding:      `${S[3]}px ${S[4]}px`,
          borderBottom: `1px solid ${C.line}`,
          display:      "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontFamily: T.mono, fontWeight: T.wt.bold, fontSize: T.sz.base, color: C.ink }}>
              Guardar en Biblioteca
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
              Completa los datos del producto antes de aprobar.
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl} alt=""
            style={{ width: 56, height: 56, borderRadius: R.md, objectFit: "cover",
              border: `1px solid ${C.line}`, flexShrink: 0 }} />
        </div>

        {/* Form */}
        <div style={{ padding: `${S[4]}px`, display: "grid", gap: S[3] }}>
          <div>
            <label style={labelStyle}>Nombre del producto</label>
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)}
              placeholder="Ej. Conjunto infantil dinosaurio azul" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
            <div>
              <label style={labelStyle}>Categoría</label>
              <input style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}
                placeholder="Ej. Ropa niño" />
            </div>
            <div>
              <label style={labelStyle}>Precio</label>
              <input style={inputStyle} value={price} onChange={e => setPrice(e.target.value)}
                placeholder="Ej. $45.000" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
            <div>
              <label style={labelStyle}>Colores</label>
              <input style={inputStyle} value={colors} onChange={e => setColors(e.target.value)}
                placeholder="Azul, blanco" />
            </div>
            <div>
              <label style={labelStyle}>Colección</label>
              <input style={inputStyle} value={collection} onChange={e => setCollection(e.target.value)}
                placeholder="Ej. Verano 2026" />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Tags</label>
            <input style={inputStyle} value={tags} onChange={e => setTags(e.target.value)}
              placeholder="dinosaurio, infantil, algodón" />
          </div>

          <div>
            <label style={labelStyle}>Canal destino</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: S[1] + 2, marginTop: S[1] }}>
              {APPROVAL_CHANNELS.map(ch => (
                <button key={ch} type="button"
                  onClick={() => setChannel(prev => prev === ch ? "" : ch)}
                  style={{
                    padding:      `${S[1]}px ${S[2] + 2}px`,
                    borderRadius: R.pill,
                    border:       channel === ch ? `2px solid ${C.blueDark}` : `1px solid ${C.line}`,
                    background:   channel === ch ? C.blueLight : C.surface,
                    color:        channel === ch ? C.blueDark : C.inkMid,
                    fontFamily:   T.mono, fontSize: T.sz.xs,
                    fontWeight:   channel === ch ? T.wt.bold : T.wt.normal,
                    cursor:       "pointer",
                  }}>
                  {ch}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: S[4] }}>
            {([
              { label: "Sync con Shopify", val: shopifySync, set: setShopifySync },
              { label: "Sync con CRM",     val: crmSync,     set: setCrmSync },
            ] as const).map(({ label, val, set }) => (
              <label key={label} style={{ display: "flex", alignItems: "center", gap: S[1] + 2, cursor: "pointer" }}>
                <input type="checkbox" checked={val} onChange={e => (set as (v: boolean) => void)(e.target.checked)}
                  style={{ accentColor: C.blueDark, width: 14, height: 14 }} />
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding:   `${S[3]}px ${S[4]}px`,
          borderTop: `1px solid ${C.line}`,
          display:   "flex", gap: S[2], justifyContent: "flex-end",
          background: C.surfaceAlt,
        }}>
          <button type="button" onClick={onCancel} style={btnSecondary}>Cancelar</button>
          <button type="button"
            onClick={() => onConfirm({ name, category, colors, price, collection, tags, channel, shopifySync, crmSync })}
            style={btnPrimary}>
            Confirmar y guardar →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Creative review workspace ─────────────────────────────────────────────────

function CreativeReviewWorkspace({
  assets, orgSlug, frontUrl, backUrl, onApprove, onReject, onReset, onRefine,
}: {
  assets:    AssetState[];
  orgSlug:   string;
  frontUrl?: string;
  backUrl?:  string;
  onApprove: (id: string, meta: ApprovalMeta) => void;
  onReject:  (id: string) => void;
  onReset:   () => void;
  onRefine:  (chip: string, freeText: string) => void;
}) {
  const readyAssets = assets.filter(a => a.generationStatus === "READY" && a.assetUrl);

  const [selectedIdx,    setSelectedIdx]    = useState(0);
  const [refinementOpen, setRefinementOpen] = useState(false);
  const [selectedChip,   setSelectedChip]   = useState<string | null>(null);
  const [refinementText, setRefinementText] = useState("");
  const [approvalOpen,   setApprovalOpen]   = useState(false);
  const [showOriginal,   setShowOriginal]   = useState(false);
  // PLACEHOLDER — replace with backend versioning when fal.ai refinement API is ready
  const [versionMap, setVersionMap] = useState<Record<string, string[]>>(() => {
    const m: Record<string, string[]> = {};
    for (const a of readyAssets) { if (a.assetUrl) m[a.id] = [a.assetUrl]; }
    return m;
  });
  const [activeVerIdx, setActiveVerIdx] = useState(0);

  const activeAsset    = readyAssets[Math.min(selectedIdx, Math.max(0, readyAssets.length - 1))];
  const activeVersions = activeAsset ? (versionMap[activeAsset.id] ?? [activeAsset.assetUrl ?? ""]) : [];
  const activeUrl      = activeVersions[Math.min(activeVerIdx, Math.max(0, activeVersions.length - 1))] ?? activeAsset?.assetUrl ?? "";
  const isApproved     = activeAsset?.reviewStatus === "approved";
  const sourceUrl      = activeAsset?.assetType === "back_clean" ? (backUrl || frontUrl) : frontUrl;

  useEffect(() => {
    if (activeAsset) setActiveVerIdx((versionMap[activeAsset.id]?.length ?? 1) - 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAsset?.id]);

  function handleRefine() {
    if (!selectedChip && !refinementText.trim()) return;
    const chipLabel = CORRECTION_CHIPS.find(c => c.id === selectedChip)?.label ?? "";
    const combined  = [chipLabel, refinementText.trim()].filter(Boolean).join(" — ");
    onRefine(combined, refinementText.trim());
    setRefinementOpen(false);
    setSelectedChip(null);
    setRefinementText("");
  }

  if (!activeAsset) return null;

  return (
    <>
      {approvalOpen && activeAsset.assetUrl && (
        <ApprovalModal
          assetUrl={activeUrl}
          onCancel={() => setApprovalOpen(false)}
          onConfirm={meta => { onApprove(activeAsset.id, meta); setApprovalOpen(false); }}
        />
      )}

      <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: R.lg, overflow: "hidden", boxShadow: E.sm }}>

        {/* Asset tabs — only when multiple ready assets */}
        {readyAssets.length > 1 && (
          <div style={{ display: "flex", borderBottom: `1px solid ${C.line}`, background: C.surfaceAlt, overflowX: "auto" }}>
            {readyAssets.map((a, i) => {
              const meta   = ASSET_META[a.assetType] ?? { icon: "📄", label: a.assetType };
              const active = i === selectedIdx;
              return (
                <button key={a.id} onClick={() => { setSelectedIdx(i); setActiveVerIdx(0); }}
                  style={{
                    padding:      `${S[2]}px ${S[3]}px`,
                    fontFamily:   T.mono, fontSize: T.sz.xs,
                    fontWeight:   active ? T.wt.bold : T.wt.normal,
                    color:        active ? C.blueDark : C.inkMid,
                    background:   active ? C.white : "transparent",
                    border:       "none",
                    borderBottom: active ? `2px solid ${C.blueDark}` : "2px solid transparent",
                    cursor:       "pointer", whiteSpace: "nowrap" as const,
                  }}>
                  {meta.icon} {meta.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Workspace body */}
        <div style={{ display: "grid", gridTemplateColumns: refinementOpen ? "1fr 272px" : "1fr" }}>

          {/* Artboard */}
          <div style={{ padding: `${S[4]}px`, borderRight: refinementOpen ? `1px solid ${C.line}` : "none" }}>

            {/* Status bar */}
            <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[3] }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                {ASSET_META[activeAsset.assetType]?.label ?? activeAsset.assetType}
              </span>
              {activeVersions.length > 1 && (
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark,
                  background: C.blueLight, border: `1px solid ${C.blueBorder}`,
                  borderRadius: R.pill, padding: `1px ${S[1] + 2}px`,
                }}>
                  v{activeVerIdx + 1}
                </span>
              )}
              {isApproved && (
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.greenDark,
                  background: C.greenLight, border: `1px solid ${C.greenBorder}`,
                  borderRadius: R.pill, padding: `1px ${S[1] + 2}px`,
                }}>
                  ✓ Aprobado
                </span>
              )}
              {sourceUrl && (
                <button onClick={() => setShowOriginal(p => !p)} style={{
                  marginLeft:   "auto",
                  padding:      `2px ${S[2]}px`,
                  background:   showOriginal ? C.blueLight : C.surface,
                  border:       `1px solid ${showOriginal ? C.blueBorder : C.line}`,
                  borderRadius: R.pill,
                  fontFamily:   T.mono, fontSize: T.sz["2xs"],
                  color:        showOriginal ? C.blueDark : C.inkFaint,
                  cursor:       "pointer",
                }}>
                  {showOriginal ? "Ver generado" : "Ver original"}
                </button>
              )}
            </div>

            {/* Main image — artboard */}
            <div style={{
              background:   C.surfaceAlt, borderRadius: R.lg,
              display:      "flex", alignItems: "center", justifyContent: "center",
              minHeight:    360, overflow: "hidden",
              border:       `1px solid ${C.lineSubtle}`,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={showOriginal && sourceUrl ? sourceUrl : activeUrl}
                alt={showOriginal ? "Original" : "Generado"}
                style={{ maxHeight: 480, maxWidth: "100%", objectFit: "contain", borderRadius: R.md }}
              />
            </div>

            {/* Version strip */}
            {activeVersions.length > 1 && (
              <div style={{ display: "flex", gap: S[1] + 2, marginTop: S[3], alignItems: "center" }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, flexShrink: 0 }}>
                  Versiones
                </span>
                {activeVersions.map((url, vi) => (
                  <button key={vi} onClick={() => setActiveVerIdx(vi)} style={{
                    width: 44, height: 44, borderRadius: R.md, overflow: "hidden",
                    border:  vi === activeVerIdx ? `2px solid ${C.blueDark}` : `1px solid ${C.line}`,
                    padding: 0, cursor: "pointer", background: C.surfaceAlt, flexShrink: 0,
                    boxShadow: vi === activeVerIdx ? E.xs : "none",
                  }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`v${vi + 1}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Refinement panel */}
          {refinementOpen && (
            <div style={{
              padding:       `${S[4]}px`,
              display:       "flex", flexDirection: "column" as const, gap: S[3],
              borderLeft:    `1px solid ${C.line}`,
            }}>
              <div style={{ fontFamily: T.mono, fontWeight: T.wt.bold, fontSize: T.sz.sm, color: C.ink }}>
                Corrección IA
              </div>

              {/* Chips */}
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[1] + 2 }}>
                {CORRECTION_CHIPS.map(chip => (
                  <button key={chip.id} type="button"
                    onClick={() => setSelectedChip(p => p === chip.id ? null : chip.id)}
                    style={{
                      padding:      `${S[1]}px ${S[2]}px`,
                      borderRadius: R.pill,
                      border:       selectedChip === chip.id ? `2px solid ${C.blueDark}` : `1px solid ${C.line}`,
                      background:   selectedChip === chip.id ? C.blueLight : C.surface,
                      color:        selectedChip === chip.id ? C.blueDark : C.inkMid,
                      fontFamily:   T.mono, fontSize: T.sz["2xs"],
                      fontWeight:   selectedChip === chip.id ? T.wt.bold : T.wt.normal,
                      cursor:       "pointer",
                    }}>
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Free text */}
              <div>
                <label style={{ ...labelStyle, marginBottom: S[1] }}>O describe el cambio</label>
                <textarea
                  value={refinementText}
                  onChange={e => setRefinementText(e.target.value)}
                  placeholder="Ej. Fondo blanco puro · producto más centrado…"
                  rows={4}
                  style={{ ...inputStyle, resize: "none" as const }}
                />
              </div>

              <button type="button" onClick={handleRefine}
                disabled={!selectedChip && !refinementText.trim()}
                style={{
                  ...(!selectedChip && !refinementText.trim() ? btnPrimaryDisabled : btnPrimary),
                  width: "100%",
                }}>
                Aplicar corrección IA →
              </button>

              <button type="button" onClick={onReset}
                style={{ ...btnSecondary, color: C.red, borderColor: C.redBorder, width: "100%", fontSize: T.sz.xs }}>
                Empezar desde cero
              </button>
            </div>
          )}
        </div>

        {/* Action bar */}
        <div style={{
          display:    "flex", alignItems: "center", gap: S[2],
          padding:    `${S[3]}px ${S[4]}px`,
          borderTop:  `1px solid ${C.line}`,
          background: C.surfaceAlt,
        }}>
          <button onClick={onReset} style={{ ...btnSecondary, color: C.inkFaint, fontSize: T.sz.sm }}>
            ← Nueva sesión
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setRefinementOpen(p => !p)}
            style={{
              ...btnSecondary, fontSize: T.sz.sm,
              color:       refinementOpen ? C.blueDark : C.inkMid,
              borderColor: refinementOpen ? C.blueBorder : C.line,
              background:  refinementOpen ? C.blueLight : C.surface,
            }}>
            {refinementOpen ? "✕ Cancelar" : "Corregir / mejorar"}
          </button>
          {!isApproved && (
            <button onClick={() => setApprovalOpen(true)} style={{ ...btnPrimary, fontSize: T.sz.sm }}>
              Aprobar y guardar →
            </button>
          )}
          {isApproved && (
            <Link href={`/${orgSlug}/agentik/marketing-studio/biblioteca`}
              style={{ ...btnPrimary, textDecoration: "none", fontSize: T.sz.sm }}>
              Ver en biblioteca →
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

// ── Step 4: Generation view ───────────────────────────────────────────────────

function GenerationStep({
  assets, isGenerating, generateError, onGenerate,
  onApprove, onReject, onReset, orgSlug,
  frontUrl, backUrl, isReady, onRefine,
}: {
  assets:        AssetState[];
  isGenerating:  boolean;
  generateError: string | null;
  onGenerate:    () => void;
  onApprove:     (id: string, meta: ApprovalMeta) => void;
  onReject:      (id: string) => void;
  onReset:       () => void;
  orgSlug:       string;
  frontUrl?:     string;
  backUrl?:      string;
  isReady?:      boolean;
  onRefine:      (chip: string, freeText: string) => void;
}) {
  const hasReadyAsset = assets.some(a => a.generationStatus === "READY");

  // ── Pre-generation launch pad ─────────────────────────────────────────────
  if (!isGenerating && assets.length === 0) {
    const canGenerate = isReady !== false;
    return (
      <Panel style={{ marginBottom: 0 }}>
        <PanelHeader title="Generar" icon="⚡" />
        <div style={{ padding: `${S[4]}px` }}>
          {generateError && (
            <div style={{ padding: `${S[2]}px ${S[3]}px`, background: "#fff0f0",
              border: `1px solid ${C.redBorder}`, borderRadius: R.md,
              color: C.red, fontSize: T.sz.sm, marginBottom: S[3] }}>
              {generateError}
            </div>
          )}
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, lineHeight: 1.5 }}>
            Los resultados se guardarán en Biblioteca para aprobación.
          </div>
        </div>
        <div style={{ display: "flex", gap: S[2], padding: `${S[3]}px ${S[4]}px`,
          borderTop: `1px solid ${C.line}`, background: C.surfaceAlt, alignItems: "center" }}>
          <button onClick={onReset} style={{ ...btnSecondary, color: C.inkFaint }}>Nueva sesión</button>
          <button
            onClick={canGenerate ? onGenerate : undefined}
            style={{ ...(canGenerate ? btnPrimary : btnPrimaryDisabled), marginLeft: "auto" }}>
            {canGenerate ? "Generar con Agentik IA →" : "Completa los datos para generar"}
          </button>
        </div>
      </Panel>
    );
  }

  // ── Generating / pending ──────────────────────────────────────────────────
  if (isGenerating || (assets.length > 0 && !hasReadyAsset)) {
    return (
      <Panel style={{ marginBottom: 0 }}>
        <PanelHeader title="Generando…" icon="⚡" badge={<Badge variant="brand">PROCESANDO</Badge>} />
        <div style={{
          padding:        `${S[4]}px`,
          display:        "flex", flexDirection: "column" as const,
          alignItems:     "center", justifyContent: "center",
          gap:            S[3], minHeight: 200,
        }}>
          <div style={{ fontSize: 32, lineHeight: 1 }}>⏳</div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>
            Agentik está construyendo la escena…
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            Las imágenes aparecerán automáticamente al completar.
          </div>
        </div>
      </Panel>
    );
  }

  // ── Creative review workspace ─────────────────────────────────────────────
  return (
    <CreativeReviewWorkspace
      assets={assets}
      orgSlug={orgSlug}
      frontUrl={frontUrl}
      backUrl={backUrl}
      onApprove={onApprove}
      onReject={onReject}
      onReset={onReset}
      onRefine={onRefine}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FotoEstudioWizard({
  orgSlug,
  tenantId,
  defaultBrandLine       = "casual",
  defaultGarmentType     = "otro",
  defaultProductCategory = "ropa_nino",
  initialCustomFormats   = [],
  onContextUpdate,
}: {
  orgSlug:                 string;
  tenantId:                string;
  defaultBrandLine?:       BrandLine;
  /** Fashion path (Do Jeans). Ignored for retail tenants. */
  defaultGarmentType?:     GarmentType;
  /** Retail path (Castillitos). Ignored for fashion tenants. */
  defaultProductCategory?: ProductCategory;
  /** Persisted custom formats loaded server-side. Shown alongside system formats. */
  initialCustomFormats?:   StoredVisualFormat[];
  /** Called on every relevant state change. Feeds the Luca live panel. */
  onContextUpdate?:        (state: FotoStudioLiveState) => void;
}) {
  // Session
  const [sessionId] = useState(() => genSessionId());
  const dbCreated   = useRef(false);

  // Step navigation
  const [step, setStep] = useState<WizardStep>("intent");

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
  const [productCategory,       setProductCategory]       = useState<ProductCategory>(defaultProductCategory);
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
  // Visual format — retail canvas spec (Castillitos only)
  // Initialized from the category-aware mapping so the right grid is pre-selected.
  const [visualFormat,    setVisualFormat]    = useState<VisualFormat | null>(() => {
    if (tenantId === "castillitos") return getCastillitosFormatForCategory(defaultProductCategory as string);
    return getDefaultVisualFormat(tenantId);
  });
  // Track whether the user has explicitly overridden the format (disables auto-update on category change)
  const visualFormatUserOverridden = useRef(false);
  // Custom formats — persisted per-tenant, loaded server-side, extendable via save
  const [customFormats,   setCustomFormats]   = useState<StoredVisualFormat[]>(initialCustomFormats);
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

  // Auto-update format when product category changes (retail tenants only).
  // Skipped if the user has explicitly overridden the format with a manual selection.
  useEffect(() => {
    if (tenantId !== "castillitos" || visualFormatUserOverridden.current) return;
    setVisualFormat(getCastillitosFormatForCategory(productCategory as string));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productCategory]);

  // ── Live context — feeds Luca panel without prop drilling ──────────────────
  const liveContextSnapshot = useMemo<FotoStudioLiveState>(() => ({
    currentStep:     step,
    tenantId,
    intent:          generationIntent,
    productCategory,
    brandLine,
    sku,
    background,
    aspectRatio,
    visualStyle,
    kidsModelType,
    kidsAgeRange,
    kidsVisualStyle,
    socialChannel,
    socialPubType,
    videoType,
    videoDuration,
    pieceType,
    freePrompt,
    imageCount: [frontUrl, backUrl, detail1Url, detail2Url].filter(u => u.trim() !== "").length,
  }), [
    step, tenantId, generationIntent, productCategory, brandLine, sku,
    background, aspectRatio, visualStyle, kidsModelType, kidsAgeRange,
    kidsVisualStyle, socialChannel, socialPubType, videoType, videoDuration,
    pieceType, freePrompt, frontUrl, backUrl, detail1Url, detail2Url,
  ]);

  useEffect(() => {
    onContextUpdate?.(liveContextSnapshot);
  }, [liveContextSnapshot, onContextUpdate]);

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
          // Tenant-path split: retail uses productCategory, fashion uses garmentType.
          // garmentType is always written as a string for generation pipeline backwards compat
          // (generate route reads settings.garmentType — must remain populated for both paths).
          garmentType:          tenantId === "castillitos"
            ? (productCategory as unknown as GarmentType)
            : garmentType,
          productCategory:      tenantId === "castillitos" ? productCategory : undefined,
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
          freePrompt:           freePrompt || undefined,
          // Retail canvas format — Castillitos only; absent for fashion tenants.
          visualFormat:         visualFormat ?? undefined,
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

  // ── Approve (with metadata from ApprovalModal) ───────────────────────────
  async function handleApprove(assetId: string, meta: ApprovalMeta) {
    setAssets(prev => prev.map(a => a.id === assetId ? { ...a, reviewStatus: "approved" } : a));
    // PLACEHOLDER — wire meta to asset enrichment API (Sprint AGENTIK-FOTOESTUDIO-ENRICH-01)
    console.log("[foto-estudio] approve meta:", meta);
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

  // ── Refine (wires chip+text to generation pipeline) ─────────────────────
  function handleRefine(chip: string, freeText: string) {
    // PLACEHOLDER — wire to fal.ai refinement API (Sprint AGENTIK-FOTOESTUDIO-FAL-01)
    const combined = [chip, freeText].filter(Boolean).join(" — ");
    setFreePrompt(prev => prev ? `${prev} · ${combined}` : combined);
    // TODO: auto-trigger handleGenerate() after freePrompt update (requires useEffect pattern)
  }

  // ── Reset ────────────────────────────────────────────────────────────────
  function handleReset() {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    window.location.reload();
  }

  const tenantOpts = getTenantWizardOptions(tenantId);

  // ── Readiness ─────────────────────────────────────────────────────────────
  const imageCount = [frontUrl, backUrl, detail1Url, detail2Url].filter(u => u.trim() !== "").length;
  const isReady    = imageCount > 0 && generationIntent !== null;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      <Stepper currentStep={step} />

      {/* Context micro-bar — 1 line, shows intent+format when selected */}
      {step !== "generation" && generationIntent && (
        <div style={{
          display:      "flex", alignItems: "center", gap: S[2],
          marginBottom: S[3],
          fontFamily:   T.mono, fontSize: T.sz.xs, color: C.inkMid,
        }}>
          <span style={{ color: C.blueDark, fontSize: 12, lineHeight: 1, flexShrink: 0 }}>⚡</span>
          <span>
            {generationIntent === "product_photo" ? "Foto de producto"
              : generationIntent === "social_photo" ? "Foto para redes"
              : generationIntent === "social_video" ? "Video corto"
              : "Plantilla promocional"}
            {step === "configuration" && (
              <> {" · "}{BACKGROUND_LABELS[background] ?? background}{" · "}{ASPECT_RATIO_LABELS[aspectRatio] ?? aspectRatio}</>
            )}
          </span>
        </div>
      )}

      {step === "intent" && (
        <ChooseOutputsStep
          intent={generationIntent}
          onSelectIntent={selectIntent}
          onNext={() => setStep("source")}
        />
      )}

      {step === "source" && (
        <>
          <SourceMaterialSelector />
          <UploadStep
            frontUrl={frontUrl}                   setFrontUrl={setFrontUrl}
            backUrl={backUrl}                     setBackUrl={setBackUrl}
            detail1Url={detail1Url}               setDetail1Url={setDetail1Url}
            detail2Url={detail2Url}               setDetail2Url={setDetail2Url}
            referenceImageUrl={referenceImageUrl} setReferenceImageUrl={setReferenceImageUrl}
            sku={sku}                             setSku={setSku}
            onNext={() => setStep("configuration")}
            onBack={() => setStep("intent")}
            tenantId={tenantId} sessionId={sessionId}
            selectedOutputs={selectedOutputs}
            tenantOpts={tenantOpts}
          />
        </>
      )}

      {step === "configuration" && (
        <VisualSettingsStep
          generationIntent={generationIntent}
          visualStyle={visualStyle}                   setVisualStyle={setVisualStyle}
          background={background}                     setBackground={setBackground}
          aspectRatio={aspectRatio}                   setAspectRatio={setAspectRatio}
          quantity={quantity}                         setQuantity={setQuantity}
          garmentType={garmentType}                   setGarmentType={setGarmentType}
          productCategory={productCategory}           setProductCategory={setProductCategory}
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
          visualFormat={visualFormat}
          setVisualFormat={(f) => {
            visualFormatUserOverridden.current = true;
            setVisualFormat(f);
          }}
          systemFormats={tenantId === "castillitos" ? CASTILLITOS_FORMATS : []}
          customFormats={customFormats}
          onCustomFormatSaved={(f) => {
            visualFormatUserOverridden.current = true;
            setCustomFormats(prev => [...prev, f]);
          }}
          recommendedFormatId={
            tenantId === "castillitos"
              ? getCastillitosFormatForCategory(productCategory as string).id
              : undefined
          }
          tenantId={tenantId}                         sessionId={sessionId}
          onNext={() => setStep("generation")}
          onBack={() => setStep("source")}
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
          onRefine={handleRefine}
          orgSlug={orgSlug}
          frontUrl={frontUrl || undefined}
          backUrl={backUrl   || undefined}
          isReady={isReady}
        />
      )}
    </div>
  );
}
