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
} from "@/lib/marketing-studio/foto-estudio-types";
import type {
  FotoOutputType,
  VisualStyle,
  BackgroundType,
  AspectRatio,
  GarmentType,
  BrandLine,
  SocialPublicationType,
} from "@/lib/marketing-studio/foto-estudio-types";

// ── Types ─────────────────────────────────────────────────────────────────────

type WizardStep = "upload" | "choose_outputs" | "visual_settings" | "generation";

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
const GARMENT_TYPES:    GarmentType[]            = ["jean", "short", "falda", "body", "top", "chaqueta", "vestido", "otro"];
const BRAND_LINES:      BrandLine[]              = ["luxury", "casual"];
const SOCIAL_PUB_TYPES: SocialPublicationType[]  = ["feed", "reel", "story"];

const ASSET_META: Record<string, { icon: string; label: string }> = {
  front_clean:    { icon: "📸", label: "Vista frontal" },
  back_clean:     { icon: "🔙", label: "Vista trasera" },
  social_image:   { icon: "🖼️", label: "Imagen redes" },
  social_video:   { icon: "🎬", label: "Video corto"  },
  product_photo:  { icon: "🎨", label: "Plantilla"    },
};

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
  sku, setSku, onNext, tenantId, sessionId, selectedOutputs,
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
}) {
  const hasCustomTemplate = selectedOutputs.includes("custom_template");

  return (
    <Panel style={{ marginBottom: 0 }}>
      <PanelHeader title="Sube las fotos del producto" icon="📦" />
      <div style={{ padding: `${S[4]}px` }}>
        <div style={{ display: "grid", gap: S[4] }}>
          {/* SKU */}
          <div>
            <label style={labelStyle} htmlFor="sku-input">SKU del producto</label>
            <input id="sku-input" style={inputStyle} type="text"
              placeholder="Ej. PROD-001 / VAQUERO-AZ-32"
              value={sku} onChange={e => setSku(e.target.value)} autoComplete="off" />
            <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 4 }}>
              Opcional. Ayuda a organizar la biblioteca.
            </div>
          </div>

          {/* 2x2 upload grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
            <ImageUploadZone label="Frontal"   required={false} angle="front"   tenantId={tenantId} sessionId={sessionId} onUploaded={setFrontUrl}   />
            <ImageUploadZone label="Trasera"   required={false} angle="back"    tenantId={tenantId} sessionId={sessionId} onUploaded={setBackUrl}    />
            <ImageUploadZone label="Detalle 1" required={false} angle="detail1" tenantId={tenantId} sessionId={sessionId} onUploaded={setDetail1Url} />
            <ImageUploadZone label="Detalle 2" required={false} angle="detail2" tenantId={tenantId} sessionId={sessionId} onUploaded={setDetail2Url} />
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

// ── Step 2: Choose outputs ────────────────────────────────────────────────────

function ChooseOutputsStep({
  selected, onToggle, onNext, onBack, hasFront, hasBack,
}: {
  selected:  FotoOutputType[];
  onToggle:  (v: FotoOutputType) => void;
  onNext:    () => void;
  onBack:    () => void;
  hasFront:  boolean;
  hasBack:   boolean;
}) {
  const visibleCards = OUTPUT_CARDS.filter(c =>
    (c.requiresAngle === "front" && hasFront) ||
    (c.requiresAngle === "back"  && hasBack)  ||
    (c.requiresAngle === "any"   && (hasFront || hasBack)),
  );

  return (
    <Panel style={{ marginBottom: 0 }}>
      <PanelHeader title="¿Qué quieres generar?" icon="🎯"
        badge={<Badge variant={selected.length > 0 ? "brand" : "neutral"}>{selected.length} seleccionados</Badge>} />
      <div style={{ padding: `${S[4]}px` }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
          {visibleCards.map(card => {
            const isSelected = selected.includes(card.value);
            return (
              <button key={card.value} onClick={() => onToggle(card.value)} style={{
                padding: `${S[3]}px ${S[4]}px`,
                border:  isSelected ? `2px solid ${C.brand}` : `1px solid ${C.line}`,
                borderRadius: R.md,
                background: isSelected ? C.brandLight : C.white,
                cursor: "pointer", textAlign: "left", fontFamily: T.mono,
                transition: "border-color 0.12s, background 0.12s",
                boxShadow: isSelected ? E.sm : E.xs,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: S[2] }}>
                  <div style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{card.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: T.wt.bold, fontSize: T.sz.base,
                      color: isSelected ? C.brand : C.ink, marginBottom: 4 }}>
                      {card.label}
                    </div>
                    <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginBottom: S[1] }}>
                      {card.desc}
                    </div>
                    <div style={{ fontSize: T.sz["2xs"], color: isSelected ? C.brandDark : C.inkFaint,
                      fontFamily: T.mono }}>
                      {card.formats}
                    </div>
                  </div>
                  {isSelected && (
                    <div style={{ flexShrink: 0, width: 20, height: 20, borderRadius: R.pill,
                      background: C.brand, color: C.white, display: "flex",
                      alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: T.wt.bold }}>
                      ✓
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <ActionRow nextLabel="Continuar →" canNext={selected.length > 0}
        onNext={onNext} onBack={onBack} showBack={true} />
    </Panel>
  );
}

// ── Step 3: Visual settings ───────────────────────────────────────────────────

function VisualSettingsStep({
  visualStyle, setVisualStyle, background, setBackground,
  aspectRatio, setAspectRatio, quantity, setQuantity,
  garmentType, setGarmentType, brandLine, setBrandLine,
  socialPublicationType, setSocialPublicationType,
  onNext, onBack, selectedOutputs,
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
  onNext:                   () => void;
  onBack:                   () => void;
  selectedOutputs:          FotoOutputType[];
}) {
  const hasVideo  = selectedOutputs.includes("short_video");
  const hasSocial = selectedOutputs.includes("social_photo");

  return (
    <Panel style={{ marginBottom: 0 }}>
      <PanelHeader title="Ajustes visuales" icon="🎨" />
      <div style={{ padding: `${S[4]}px` }}>
        <div style={{ display: "grid", gap: S[4] }}>

          {/* ── Tipo de prenda ─────────────────────────────────────────── */}
          <div>
            <div style={labelStyle}>Tipo de prenda</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: S[2] }}>
              {GARMENT_TYPES.map(gt => (
                <button key={gt} onClick={() => setGarmentType(gt)} style={{
                  padding: `${S[2]}px ${S[2]}px`,
                  border: garmentType === gt ? `2px solid ${C.brand}` : `1px solid ${C.line}`,
                  borderRadius: R.md,
                  background: garmentType === gt ? C.brandLight : C.surface,
                  cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.sm,
                  fontWeight: garmentType === gt ? T.wt.bold : T.wt.normal,
                  color: garmentType === gt ? C.brand : C.inkMid,
                  transition: "border-color 0.1s",
                }}>
                  {GARMENT_TYPE_LABELS[gt]}
                </button>
              ))}
            </div>
          </div>

          {/* ── Línea de marca ─────────────────────────────────────────── */}
          <div>
            <div style={labelStyle}>Línea de marca</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
              {BRAND_LINES.map(bl => (
                <button key={bl} onClick={() => setBrandLine(bl)} style={{
                  padding: `${S[3]}px ${S[3]}px`,
                  border: brandLine === bl ? `2px solid ${C.brand}` : `1px solid ${C.line}`,
                  borderRadius: R.md,
                  background: brandLine === bl ? C.brandLight : C.surface,
                  cursor: "pointer", fontFamily: T.mono,
                  textAlign: "left" as const,
                  transition: "border-color 0.1s",
                }}>
                  <div style={{ fontWeight: T.wt.bold, fontSize: T.sz.sm,
                    color: brandLine === bl ? C.brand : C.ink, marginBottom: 3 }}>
                    {BRAND_LINE_LABELS[bl]}
                  </div>
                  <div style={{ fontSize: T.sz.xs,
                    color: brandLine === bl ? C.brandDark : C.inkLight }}>
                    {BRAND_LINE_DESCRIPTIONS[bl]}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Tipo de publicación (solo para Foto para redes) ─────────── */}
          {hasSocial && (
            <div>
              <div style={labelStyle}>Tipo de publicación — Foto para redes</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[2] }}>
                {SOCIAL_PUB_TYPES.map(pt => (
                  <button key={pt} onClick={() => setSocialPublicationType(pt)} style={{
                    padding: `${S[3]}px ${S[2]}px`,
                    border: socialPublicationType === pt ? `2px solid ${C.brand}` : `1px solid ${C.line}`,
                    borderRadius: R.md,
                    background: socialPublicationType === pt ? C.brandLight : C.surface,
                    cursor: "pointer", fontFamily: T.mono,
                    textAlign: "left" as const,
                    transition: "border-color 0.1s",
                  }}>
                    <div style={{ fontWeight: T.wt.bold, fontSize: T.sz.sm,
                      color: socialPublicationType === pt ? C.brand : C.ink, marginBottom: 3 }}>
                      {SOCIAL_PUBLICATION_LABELS[pt]}
                    </div>
                    <div style={{ fontSize: T.sz["2xs"],
                      color: socialPublicationType === pt ? C.brandDark : C.inkFaint }}>
                      {SOCIAL_PUBLICATION_DESCRIPTIONS[pt]}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Estilo visual ──────────────────────────────────────────── */}
          <div>
            <div style={labelStyle}>Estilo visual</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[2] }}>
              {VISUAL_STYLES.map(style => (
                <button key={style} onClick={() => setVisualStyle(style)} style={{
                  padding: `${S[2]}px ${S[3]}px`,
                  border: visualStyle === style ? `2px solid ${C.brand}` : `1px solid ${C.line}`,
                  borderRadius: R.md,
                  background: visualStyle === style ? C.brandLight : C.surface,
                  cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.sm,
                  fontWeight: visualStyle === style ? T.wt.bold : T.wt.normal,
                  color: visualStyle === style ? C.brand : C.inkMid,
                  transition: "border-color 0.1s",
                }}>
                  {VISUAL_STYLE_LABELS[style]}
                </button>
              ))}
            </div>
          </div>

          {/* ── Fondo ──────────────────────────────────────────────────── */}
          <div>
            <div style={labelStyle}>Fondo</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
              {BACKGROUNDS.map(bg => (
                <button key={bg} onClick={() => setBackground(bg)} style={{
                  padding: `${S[1] + 2}px ${S[3]}px`,
                  border: background === bg ? `2px solid ${C.brand}` : `1px solid ${C.line}`,
                  borderRadius: R.sm,
                  background: background === bg ? C.brandLight : C.surface,
                  cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.sm,
                  fontWeight: background === bg ? T.wt.bold : T.wt.normal,
                  color: background === bg ? C.brand : C.inkMid,
                  textAlign: "left" as const,
                }}>
                  {BACKGROUND_LABELS[bg]}
                </button>
              ))}
            </div>
          </div>

          {/* ── Formato / aspect ratio (no aplica para video) ─────────── */}
          {!hasVideo && (
            <div>
              <div style={labelStyle}>Formato</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[2] }}>
                {ASPECT_RATIOS.map(ratio => (
                  <button key={ratio} onClick={() => setAspectRatio(ratio)} style={{
                    padding: `${S[1] + 2}px ${S[2]}px`,
                    border: aspectRatio === ratio ? `2px solid ${C.brand}` : `1px solid ${C.line}`,
                    borderRadius: R.sm,
                    background: aspectRatio === ratio ? C.brandLight : C.surface,
                    cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.xs,
                    color: aspectRatio === ratio ? C.brand : C.inkMid,
                  }}>
                    {ASPECT_RATIO_LABELS[ratio]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Variantes ─────────────────────────────────────────────── */}
          <div>
            <div style={labelStyle}>Variantes por tipo</div>
            <div style={{ display: "flex", gap: S[2] }}>
              {[1, 2, 3, 4].map(n => (
                <button key={n} onClick={() => setQuantity(n)} style={{
                  width: 44, height: 44,
                  border: quantity === n ? `2px solid ${C.brand}` : `1px solid ${C.line}`,
                  borderRadius: R.md,
                  background: quantity === n ? C.brandLight : C.surface,
                  cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.base,
                  fontWeight: quantity === n ? T.wt.bold : T.wt.normal,
                  color: quantity === n ? C.brand : C.inkMid,
                }}>
                  {n}
                </button>
              ))}
            </div>
            <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 4 }}>
              Cuántas variantes generar de cada tipo seleccionado.
            </div>
          </div>

        </div>
      </div>
      <ActionRow nextLabel="Generar →" canNext={true} onNext={onNext} onBack={onBack} showBack={true} />
    </Panel>
  );
}

// ── Step 4: Generation + approval ────────────────────────────────────────────

interface AssetCardProps {
  asset:     AssetState | null;
  onApprove: (id: string) => void;
  onReject:  (id: string) => void;
  orgSlug:   string;
}

function AssetCard({ asset, onApprove, onReject, orgSlug }: AssetCardProps) {
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
      <div style={{ padding: `${S[3]}px`, textAlign: "center",
        minHeight: 120, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: S[2] }}>
        {isReady && asset?.assetUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={asset.assetUrl} alt={meta.label}
            style={{ maxHeight: 180, maxWidth: "100%", borderRadius: R.md,
              objectFit: "contain", boxShadow: E.sm }} />
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
  sessionId:      string;
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
            {[0, 1].map(i => <AssetCard key={i} asset={null} onApprove={() => {}} onReject={() => {}} orgSlug={orgSlug} />)}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: assets.length === 1 ? "1fr" : "1fr 1fr", gap: S[3] }}>
            {assets.map(a => (
              <AssetCard key={a.id} asset={a} onApprove={onApprove} onReject={onReject} orgSlug={orgSlug} />
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

export function FotoEstudioWizard({ orgSlug, tenantId }: { orgSlug: string; tenantId: string }) {
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
  const [selectedOutputs, setSelectedOutputs] = useState<FotoOutputType[]>([]);

  // Step 1 extra
  const [referenceImageUrl, setReferenceImageUrl] = useState("");

  // Step 3
  const [visualStyle,           setVisualStyle]           = useState<VisualStyle>("clean_studio");
  const [background,            setBackground]            = useState<BackgroundType>("white");
  const [aspectRatio,           setAspectRatio]           = useState<AspectRatio>("1:1");
  const [quantity,              setQuantity]              = useState(1);
  const [garmentType,           setGarmentType]           = useState<GarmentType>("jean");
  const [brandLine,             setBrandLine]             = useState<BrandLine>("casual");
  const [socialPublicationType, setSocialPublicationType] = useState<SocialPublicationType>("feed");

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

  // ── Toggle output type ───────────────────────────────────────────────────
  function toggleOutput(type: FotoOutputType) {
    setSelectedOutputs(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type],
    );
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
        />
      )}

      {step === "choose_outputs" && (
        <ChooseOutputsStep
          selected={selectedOutputs}
          onToggle={toggleOutput}
          onNext={() => setStep("visual_settings")}
          onBack={() => setStep("upload")}
          hasFront={frontUrl.trim().length > 0}
          hasBack={backUrl.trim().length > 0}
        />
      )}

      {step === "visual_settings" && (
        <VisualSettingsStep
          visualStyle={visualStyle}                   setVisualStyle={setVisualStyle}
          background={background}                     setBackground={setBackground}
          aspectRatio={aspectRatio}                   setAspectRatio={setAspectRatio}
          quantity={quantity}                         setQuantity={setQuantity}
          garmentType={garmentType}                   setGarmentType={setGarmentType}
          brandLine={brandLine}                       setBrandLine={setBrandLine}
          socialPublicationType={socialPublicationType} setSocialPublicationType={setSocialPublicationType}
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
          sessionId={sessionId}
        />
      )}
    </div>
  );
}
