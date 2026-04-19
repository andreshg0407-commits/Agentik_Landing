"use client";

/**
 * StudioWizard — 5-step guided content session wizard.
 *
 * Visibility rules:
 *   - User sees: step labels, objective choices, minimum fields, review cards, publish result.
 *   - HIDDEN: preset names, fidelity modes, detail locks, internal output profiles.
 *
 * State machine: studioReducer (lib/marketing-studio/guided-flow.ts)
 * Local state: sku, imageUrl (step 1), pendingObjective (step 2), colorsRaw (step 3)
 */

import { useReducer, useState, useEffect, useRef, useCallback } from "react";
import Link                                from "next/link";
import { C, T, S, R, E }                  from "@/lib/ui/tokens";
import { Badge, Panel, PanelHeader, SectionLabel } from "@/components/shell/primitives";
import {
  STUDIO_STEPS,
  studioReducer,
  createSession,
  canAdvanceFrom,
  getStepIndex,
  getRequiredFieldsForObjective,
  resolveWorkflow,
} from "@/lib/marketing-studio";
import type {
  UserObjective,
  ReviewItem,
  OutputAssetType,
  MinimumInputFields,
  GarmentCategory,
  SocialPlatform,
  StudioSession,
  ShopifyDraftPackage,
} from "@/lib/marketing-studio";
import { canAdvanceDoJeansStrict }    from "@/lib/marketing-studio/do-jeans-intake";
import { resolveDoJeansWorkflow }     from "@/lib/marketing-studio/do-jeans-workflow";
import { buildShopifyDraft }          from "@/lib/marketing-studio/shopify-draft-builder";
import {
  JEANS_POCKET_STYLES,
  DENIM_WASHES,
  JEANS_STITCHINGS,
  JEANS_RISES,
  JEANS_EMBELLISHMENTS,
  JEANS_HARDWARE_TYPES,
  JEANS_HARDWARE_FINISHES,
} from "@/lib/marketing-studio";

// ── Constants ─────────────────────────────────────────────────────────────────

const GARMENT_CATEGORIES: GarmentCategory[] = [
  "jeans", "pants", "shorts", "shirt", "blouse", "dress", "skirt",
  "jacket", "outerwear", "activewear", "accessories", "footwear", "other",
];

const PLATFORM_OPTIONS: SocialPlatform[] = ["tiktok", "instagram", "facebook"];

const SEASON_OPTIONS = ["spring", "summer", "fall", "winter", "all-season"];

const OBJECTIVE_OPTIONS: {
  value:       UserObjective;
  icon:        string;
  label:       string;
  description: string;
  outputs:     string[];
}[] = [
  {
    value:       "shopify_listing",
    icon:        "🛒",
    label:       "Tienda en línea",
    description: "Publica el producto en Shopify con foto y descripción lista.",
    outputs:     ["Foto del producto", "Borrador en Shopify"],
  },
  {
    value:       "social_campaign",
    icon:        "📱",
    label:       "Redes sociales",
    description: "Genera contenido visual y copy para publicar en TikTok o Instagram.",
    outputs:     ["Imagen para redes", "Video corto", "Copy + hashtags"],
  },
  {
    value:       "catalog_export",
    icon:        "📄",
    label:       "Catálogo",
    description: "Exporta imágenes de alta calidad para catálogo digital o impreso.",
    outputs:     ["Fotos de alta resolución"],
  },
  {
    value:       "all_channels",
    icon:        "🚀",
    label:       "Todo en uno",
    description: "Genera activos completos para tienda, redes y catálogo en un solo paso.",
    outputs:     ["Foto del producto", "Video", "Copy + hashtags", "Borrador en Shopify"],
  },
];

const ASSET_META: Record<OutputAssetType, {
  icon:         string;
  label:        string;
  desc:         string;
  mockContent?: string;
}> = {
  product_photo: {
    icon:  "📸",
    label: "Foto del producto",
    desc:  "Imagen limpia sobre fondo neutro — lista para e-commerce",
  },
  front_clean: {
    icon:  "📸",
    label: "Vista frontal",
    desc:  "Foto frontal con fondo blanco studio — fidelidad estricta",
  },
  back_clean: {
    icon:  "🔙",
    label: "Vista trasera",
    desc:  "Foto trasera con fondo blanco studio — fidelidad estricta",
  },
  social_image: {
    icon:  "🖼",
    label: "Imagen para redes",
    desc:  "Recortada y estilizada para feed — 1:1 o historia 9:16",
  },
  social_video: {
    icon:  "🎬",
    label: "Video corto",
    desc:  "Clip de 8 s en vertical — optimizado para TikTok / Reels",
  },
  copy_caption: {
    icon:        "✍️",
    label:       "Copy para publicación",
    desc:        "Texto adaptado al tono de la marca",
    mockContent: "El estilo que te define. Comodidad sin sacrificar actitud. ✨ Disponible ahora.",
  },
  hashtags: {
    icon:        "#️⃣",
    label:       "Hashtags sugeridos",
    desc:        "Set de etiquetas para máximo alcance orgánico",
    mockContent: "#moda #estilo #ootd #fashion #nuevacoleccion #tendencias",
  },
  product_draft: {
    icon:  "📦",
    label: "Borrador en tienda",
    desc:  "Borrador de producto listo para revisar y publicar en Shopify",
  },
};

// ── Shared inline styles ──────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width:       "100%",
  padding:     `${S[1] + 2}px ${S[2]}px`,
  border:      `1px solid ${C.line}`,
  borderRadius: R.sm,
  fontSize:    T.sz.base,
  fontFamily:  T.mono,
  background:  C.white,
  color:       C.ink,
  boxSizing:   "border-box",
  outline:     "none",
};

const labelStyle: React.CSSProperties = {
  display:       "block",
  fontSize:      T.sz.xs,
  fontWeight:    T.wt.bold,
  color:         C.inkLight,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom:  S[1],
};

const btnPrimary: React.CSSProperties = {
  padding:     `${S[2]}px ${S[4]}px`,
  background:  C.brand,
  color:       C.white,
  border:      "none",
  borderRadius: R.md,
  fontSize:    T.sz.base,
  fontWeight:  T.wt.bold,
  cursor:      "pointer",
  fontFamily:  T.mono,
};

const btnPrimaryDisabled: React.CSSProperties = {
  ...btnPrimary,
  background: C.inkGhost,
  cursor:     "not-allowed",
};

const btnSecondary: React.CSSProperties = {
  padding:     `${S[2]}px ${S[4]}px`,
  background:  C.surface,
  color:       C.inkMid,
  border:      `1px solid ${C.line}`,
  borderRadius: R.md,
  fontSize:    T.sz.base,
  fontWeight:  T.wt.medium,
  cursor:      "pointer",
  fontFamily:  T.mono,
};

// ── Review items builder (tenant-aware) ───────────────────────────────────────

function buildReviewItems(objective: UserObjective, tenantId: string): ReviewItem[] {
  const assets = (tenantId === "do-jeans" && objective === "shopify_listing")
    ? resolveDoJeansWorkflow().assets
    : resolveWorkflow(objective).assets;
  return assets.map((type, idx) => ({
    id:      `ri_${idx}_${type}`,
    type,
    content: ASSET_META[type].mockContent,
    status:  "pending" as const,
  }));
}

// ── Stepper bar ───────────────────────────────────────────────────────────────

function StepperBar({ stepIdx }: { stepIdx: number }) {
  return (
    <div style={{
      display:      "flex",
      alignItems:   "flex-start",
      background:   C.surface,
      border:       `1px solid ${C.line}`,
      borderRadius: R.md,
      padding:      `${S[3]}px ${S[4]}px`,
      marginBottom: S[5],
      boxShadow:    E.xs,
    }}>
      {STUDIO_STEPS.map((stepDef, i) => (
        <div key={stepDef.step} style={{ display: "contents" }}>
          {i > 0 && (
            <div style={{
              flex:       1,
              height:     1,
              background: i <= stepIdx ? C.brand : C.inkGhost,
              alignSelf:  "center",
              marginTop:  -16,
            }} />
          )}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 64 }}>
            <div style={{
              width:           28,
              height:          28,
              borderRadius:    R.pill,
              background:      i < stepIdx ? C.green : i === stepIdx ? C.brand : C.inkGhost,
              color:           C.white,
              display:         "flex",
              alignItems:      "center",
              justifyContent:  "center",
              fontSize:        T.sz.xs,
              fontWeight:      T.wt.bold,
              flexShrink:      0,
              boxShadow:       i === stepIdx ? `0 0 0 3px ${C.brandBorder}` : "none",
            }}>
              {i < stepIdx ? "✓" : i + 1}
            </div>
            <div style={{
              fontSize:   T.sz["2xs"],
              color:      i === stepIdx ? C.brand : i < stepIdx ? C.green : C.inkFaint,
              fontWeight: i === stepIdx ? T.wt.bold : T.wt.normal,
              textAlign:  "center",
              lineHeight: 1.3,
              maxWidth:   72,
            }}>
              {stepDef.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Action row (back / next) ──────────────────────────────────────────────────

function ActionRow({
  onBack,
  onNext,
  onReset,
  nextLabel,
  canNext,
  showBack,
  showReset,
}: {
  onBack?:   () => void;
  onNext?:   () => void;
  onReset?:  () => void;
  nextLabel: string;
  canNext:   boolean;
  showBack?: boolean;
  showReset?: boolean;
}) {
  return (
    <div style={{
      display:    "flex",
      alignItems: "center",
      gap:        S[2],
      padding:    `${S[3]}px ${S[4]}px`,
      borderTop:  `1px solid ${C.line}`,
      background: C.surfaceAlt,
    }}>
      {showBack && onBack && (
        <button onClick={onBack} style={btnSecondary}>← Atrás</button>
      )}
      {showReset && onReset && (
        <button onClick={onReset} style={{
          ...btnSecondary, color: C.inkFaint, marginLeft: "auto",
        }}>
          Empezar de nuevo
        </button>
      )}
      {onNext && (
        <button
          onClick={canNext ? onNext : undefined}
          style={canNext ? { ...btnPrimary, marginLeft: showBack ? "auto" : undefined } : btnPrimaryDisabled}
        >
          {nextLabel}
        </button>
      )}
    </div>
  );
}

// ── Step 1: Upload product ────────────────────────────────────────────────────

// ── Image upload zone ─────────────────────────────────────────────────────────

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "done";  url: string; filename: string }
  | { phase: "error"; message: string };

function ImageUploadZone({
  label,
  required,
  angle,
  tenantId,
  sessionId,
  onUploaded,
}: {
  label:      string;
  required:   boolean;
  angle:      "front" | "back";
  tenantId:   string;
  sessionId:  string;
  onUploaded: (url: string) => void;
}) {
  const [state,      setState]      = useState<UploadState>({ phase: "idle" });
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (file: File) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif"];
    if (!allowed.includes(file.type)) {
      setState({ phase: "error", message: "Formato no soportado. Usa JPEG, PNG, WebP o AVIF." });
      return;
    }
    setState({ phase: "uploading" });
    try {
      const fd = new FormData();
      fd.append("file",      file);
      fd.append("tenantId",  tenantId);
      fd.append("sessionId", sessionId);
      fd.append("angle",     angle);
      const res  = await fetch("/api/internal/uploads/r2", { method: "POST", body: fd });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setState({ phase: "error", message: data.error ?? "Error al subir la imagen." });
        return;
      }
      setState({ phase: "done", url: data.url, filename: file.name });
      onUploaded(data.url);
    } catch (e) {
      setState({ phase: "error", message: e instanceof Error ? e.message : "Error de red." });
    }
  }, [angle, tenantId, sessionId, onUploaded]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }, [upload]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = "";
  }, [upload]);

  const isDone      = state.phase === "done";
  const isUploading = state.phase === "uploading";

  const zoneStyle: React.CSSProperties = {
    border:       `2px dashed ${isDragOver ? C.brand : isDone ? C.green ?? "#22c55e" : C.line}`,
    borderRadius: R.lg,
    background:   isDragOver ? `${C.brand}10` : isDone ? `#22c55e10` : C.surface,
    padding:      `${S[4]}px`,
    cursor:       isUploading ? "default" : "pointer",
    transition:   "border-color 0.15s, background 0.15s",
    textAlign:    "center" as const,
    minHeight:    110,
    display:      "flex",
    flexDirection: "column" as const,
    alignItems:   "center",
    justifyContent: "center",
    gap:          S[2],
    position:     "relative" as const,
  };

  return (
    <div>
      <div style={{ marginBottom: S[1] }}>
        <span style={labelStyle}>{label}</span>
        {required && <span style={{ color: C.red, marginLeft: 3 }}>*</span>}
        {!required && (
          <span style={{ fontSize: T.sz["2xs"], color: C.inkFaint, marginLeft: 6, fontWeight: T.wt.normal, textTransform: "none" as const, letterSpacing: 0 }}>
            (opcional)
          </span>
        )}
      </div>

      {/* Drop zone */}
      <div
        style={zoneStyle}
        role="button"
        tabIndex={0}
        aria-label={`Subir imagen ${label}`}
        onClick={() => !isUploading && inputRef.current?.click()}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
      >
        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          style={{ display: "none" }}
          onChange={onFileChange}
        />

        {state.phase === "idle" && (
          <>
            <div style={{ fontSize: 28, lineHeight: 1 }}>📁</div>
            <div style={{ fontSize: T.sz.sm, color: C.inkMid, fontWeight: T.wt.medium }}>
              Arrastra una imagen o haz clic para seleccionar
            </div>
            <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>
              JPEG · PNG · WebP · AVIF — máx. 20 MB
            </div>
          </>
        )}

        {state.phase === "uploading" && (
          <>
            <div style={{ fontSize: 22 }}>⏳</div>
            <div style={{ fontSize: T.sz.sm, color: C.inkMid }}>Subiendo…</div>
          </>
        )}

        {state.phase === "done" && (
          <>
            {/* Thumbnail */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.url}
              alt="Vista previa"
              style={{
                maxHeight:    80,
                maxWidth:     "100%",
                borderRadius: R.md,
                objectFit:    "contain",
                marginBottom: S[1],
              }}
            />
            <div style={{ fontSize: T.sz.xs, color: C.inkMid, fontWeight: T.wt.medium }}>
              ✓ {state.filename}
            </div>
            <button
              style={{ ...btnSecondary, padding: `${S[1]}px ${S[3]}px`, fontSize: T.sz.xs, marginTop: S[1] }}
              onClick={e => { e.stopPropagation(); setState({ phase: "idle" }); onUploaded(""); }}
              type="button"
            >
              Cambiar imagen
            </button>
          </>
        )}

        {state.phase === "error" && (
          <>
            <div style={{ fontSize: 22 }}>⚠️</div>
            <div style={{ fontSize: T.sz.sm, color: C.red }}>{state.message}</div>
            <button
              style={{ ...btnSecondary, padding: `${S[1]}px ${S[3]}px`, fontSize: T.sz.xs, marginTop: S[1] }}
              onClick={e => { e.stopPropagation(); setState({ phase: "idle" }); }}
              type="button"
            >
              Reintentar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Step 1: Upload product ────────────────────────────────────────────────────

function UploadProductStep({
  sku, setSku, imageUrl, setImageUrl, backImageUrl, setBackImageUrl,
  onNext, canNext, isDoJeans, tenantId, sessionId,
}: {
  sku:               string;
  setSku:            (v: string) => void;
  imageUrl:          string;
  setImageUrl:       (v: string) => void;
  backImageUrl:      string;
  setBackImageUrl:   (v: string) => void;
  onNext:            () => void;
  canNext:           boolean;
  isDoJeans:         boolean;
  tenantId:          string;
  sessionId:         string;
}) {
  return (
    <Panel style={{ marginBottom: 0 }}>
      <PanelHeader title="Paso 1 — Sube tu producto" icon="📦" />
      <div style={{ padding: `${S[4]}px ${S[4]}px` }}>
        <div style={{ display: "grid", gap: S[4] }}>
          <div>
            <label style={labelStyle} htmlFor="sku">SKU del producto</label>
            <input
              id="sku"
              style={inputStyle}
              type="text"
              placeholder="Ej. PROD-001 / VAQUERO-AZ-32"
              value={sku}
              onChange={e => setSku(e.target.value)}
              autoComplete="off"
            />
            <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 4 }}>
              Identificador único del producto en tu sistema.
            </div>
          </div>

          <ImageUploadZone
            label="Imagen frontal"
            required={true}
            angle="front"
            tenantId={tenantId}
            sessionId={sessionId}
            onUploaded={setImageUrl}
          />

          {isDoJeans && (
            <ImageUploadZone
              label="Imagen trasera"
              required={false}
              angle="back"
              tenantId={tenantId}
              sessionId={sessionId}
              onUploaded={setBackImageUrl}
            />
          )}
        </div>
      </div>
      <ActionRow
        nextLabel="Continuar →"
        canNext={canNext}
        onNext={onNext}
        showBack={false}
      />
    </Panel>
  );
}

// ── Step 2: Choose objective ──────────────────────────────────────────────────

function ChooseObjectiveStep({
  pending,
  sessionObjective,
  onSelect,
  onConfirm,
  onBack,
}: {
  pending:         UserObjective | null;
  sessionObjective: UserObjective | null;
  onSelect:        (v: UserObjective) => void;
  onConfirm:       () => void;
  onBack:          () => void;
}) {
  const active = pending ?? sessionObjective;
  return (
    <Panel style={{ marginBottom: 0 }}>
      <PanelHeader title="Paso 2 — ¿Qué quieres hacer con este producto?" icon="🎯" />
      <div style={{ padding: `${S[4]}px ${S[4]}px` }}>
        <div style={{
          display:             "grid",
          gridTemplateColumns: "1fr 1fr",
          gap:                 S[3],
        }}>
          {OBJECTIVE_OPTIONS.map(opt => {
            const selected = active === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onSelect(opt.value)}
                style={{
                  padding:      `${S[3]}px ${S[4]}px`,
                  border:       selected ? `2px solid ${C.brand}` : `1px solid ${C.line}`,
                  borderRadius: R.md,
                  background:   selected ? C.brandLight : C.surface,
                  cursor:       "pointer",
                  textAlign:    "left",
                  fontFamily:   T.mono,
                  transition:   "border-color 0.12s, background 0.12s",
                  boxShadow:    selected ? E.sm : E.xs,
                }}
              >
                <div style={{ fontSize: 22, marginBottom: S[1] }}>{opt.icon}</div>
                <div style={{
                  fontWeight:   T.wt.bold,
                  fontSize:     T.sz.base,
                  color:        selected ? C.brand : C.ink,
                  marginBottom: 4,
                }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginBottom: S[2] }}>
                  {opt.description}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {opt.outputs.map(o => (
                    <span key={o} style={{
                      fontSize:     T.sz["2xs"],
                      padding:      "1px 6px",
                      borderRadius: R.pill,
                      background:   selected ? C.brandBorder : C.surfaceAlt,
                      color:        selected ? C.brandDark : C.inkLight,
                      fontWeight:   T.wt.medium,
                    }}>
                      {o}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <ActionRow
        nextLabel="Continuar →"
        canNext={active !== null}
        onNext={onConfirm}
        onBack={onBack}
        showBack={true}
      />
    </Panel>
  );
}

// ── Step 3: Minimum fields ────────────────────────────────────────────────────

function MinimumFieldsStep({
  objective,
  inputs,
  colorsRaw,
  onColorsChange,
  onPatch,
  onNext,
  onBack,
  canNext,
  isDoJeansJeans,
}: {
  objective:      UserObjective;
  inputs:         Partial<MinimumInputFields>;
  colorsRaw:      string;
  onColorsChange: (v: string) => void;
  onPatch:        (patch: Partial<MinimumInputFields>) => void;
  onNext:         () => void;
  onBack:         () => void;
  canNext:        boolean;
  isDoJeansJeans: boolean;
}) {
  const requirements = getRequiredFieldsForObjective(objective);

  return (
    <Panel style={{ marginBottom: 0 }}>
      <PanelHeader
        title="Paso 3 — Completa los detalles"
        icon="📋"
        badge={<Badge variant="neutral">{requirements.length} campos</Badge>}
      />
      <div style={{ padding: `${S[4]}px ${S[4]}px` }}>
        <div style={{ display: "grid", gap: S[4] }}>
          {requirements.map(req => (
            <div key={req.field}>
              <label style={labelStyle} htmlFor={`field-${req.field}`}>
                {req.label}
                {req.required && (
                  <span style={{ color: C.red, marginLeft: 3 }}>*</span>
                )}
              </label>

              {req.field === "category" && (
                <select
                  id="field-category"
                  style={{ ...inputStyle }}
                  value={inputs.category ?? ""}
                  onChange={e => onPatch({ category: e.target.value as GarmentCategory })}
                >
                  <option value="">Selecciona una categoría…</option>
                  {GARMENT_CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}

              {req.field === "colors" && (
                <>
                  <input
                    id="field-colors"
                    style={inputStyle}
                    type="text"
                    placeholder="negro, azul oscuro, blanco"
                    value={colorsRaw}
                    onChange={e => onColorsChange(e.target.value)}
                  />
                  <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 4 }}>
                    Separa los colores con comas.
                  </div>
                </>
              )}

              {req.field === "price" && (
                <input
                  id="field-price"
                  style={inputStyle}
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="89900"
                  value={inputs.price ?? ""}
                  onChange={e => onPatch({ price: e.target.value ? Number(e.target.value) : undefined })}
                />
              )}

              {req.field === "title" && (
                <input
                  id="field-title"
                  style={inputStyle}
                  type="text"
                  placeholder="Ej. Jean slim fit tiro alto negro"
                  value={inputs.title ?? ""}
                  onChange={e => onPatch({ title: e.target.value || undefined })}
                />
              )}

              {req.field === "season" && (
                <select
                  id="field-season"
                  style={{ ...inputStyle }}
                  value={inputs.season ?? ""}
                  onChange={e => onPatch({ season: e.target.value || undefined })}
                >
                  <option value="">Selecciona una temporada…</option>
                  {SEASON_OPTIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}

              {req.field === "targetPlatform" && (
                <select
                  id="field-targetPlatform"
                  style={{ ...inputStyle }}
                  value={inputs.targetPlatform ?? ""}
                  onChange={e => onPatch({ targetPlatform: e.target.value as SocialPlatform || undefined })}
                >
                  <option value="">Selecciona una plataforma…</option>
                  {PLATFORM_OPTIONS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              )}
            </div>
          ))}

          {/* ── Do Jeans strict detail locks ─────────────────────────────── */}
          {isDoJeansJeans && (
            <div style={{
              border:       `1px solid ${C.line}`,
              borderRadius: R.md,
              overflow:     "hidden",
              marginTop:    S[2],
            }}>
              <div style={{
                padding:    `${S[2]}px ${S[3]}px`,
                background: C.surfaceAlt,
                borderBottom: `1px solid ${C.line}`,
                fontSize:   T.sz.xs,
                fontWeight: T.wt.bold,
                color:      C.ink,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}>
                Características del jean
                <span style={{ color: C.red, marginLeft: 3 }}>*</span>
                <span style={{ fontSize: T.sz["2xs"], color: C.inkFaint, marginLeft: 8, fontWeight: T.wt.normal, textTransform: "none", letterSpacing: 0 }}>
                  requerido — fidelidad estricta
                </span>
              </div>
              <div style={{ padding: `${S[3]}px ${S[3]}px`, display: "grid", gap: S[3] }}>
                <div>
                  <label style={labelStyle} htmlFor="detail-pocket">Bolsillos<span style={{ color: C.red, marginLeft: 3 }}>*</span></label>
                  <select id="detail-pocket" style={{ ...inputStyle }}
                    value={inputs.detailPocket ?? ""}
                    onChange={e => onPatch({ detailPocket: e.target.value || undefined })}>
                    <option value="">Selecciona tipo de bolsillo…</option>
                    {JEANS_POCKET_STYLES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="detail-wash">Lavado<span style={{ color: C.red, marginLeft: 3 }}>*</span></label>
                  <select id="detail-wash" style={{ ...inputStyle }}
                    value={inputs.detailWash ?? ""}
                    onChange={e => onPatch({ detailWash: e.target.value || undefined })}>
                    <option value="">Selecciona lavado…</option>
                    {DENIM_WASHES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="detail-wash-detail">Descripción precisa del lavado</label>
                  <textarea id="detail-wash-detail"
                    rows={2}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                    placeholder="Ej: very dark navy denim finish with deep indigo undertone"
                    value={inputs.detailWashDetail ?? ""}
                    onChange={e => onPatch({ detailWashDetail: e.target.value || undefined })}
                  />
                  <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 4 }}>
                    Opcional. Cuando presente, reemplaza la etiqueta de lavado en el prompt — usa para colores o texturas con matiz exacto.
                  </div>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="detail-stitching">Costura<span style={{ color: C.red, marginLeft: 3 }}>*</span></label>
                  <select id="detail-stitching" style={{ ...inputStyle }}
                    value={inputs.detailStitching ?? ""}
                    onChange={e => onPatch({ detailStitching: e.target.value || undefined })}>
                    <option value="">Selecciona costura…</option>
                    {JEANS_STITCHINGS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="detail-rise">Tiro<span style={{ color: C.red, marginLeft: 3 }}>*</span></label>
                  <select id="detail-rise" style={{ ...inputStyle }}
                    value={inputs.detailRise ?? ""}
                    onChange={e => onPatch({ detailRise: e.target.value || undefined })}>
                    <option value="">Selecciona tiro…</option>
                    {JEANS_RISES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="detail-embellishments">Detalles / Embellecimientos<span style={{ color: C.red, marginLeft: 3 }}>*</span></label>
                  <select id="detail-embellishments" style={{ ...inputStyle }}
                    value={inputs.detailEmbellishments ?? ""}
                    onChange={e => onPatch({ detailEmbellishments: e.target.value || undefined })}>
                    <option value="">Selecciona (usa "none" si no aplica)…</option>
                    {JEANS_EMBELLISHMENTS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 4 }}>
                    Un solo valor. Selecciona &quot;none&quot; si el jean no tiene embellecimientos.
                  </div>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="detail-embellishment-detail">Geometría / detalle del emblecimiento</label>
                  <textarea id="detail-embellishment-detail"
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                    placeholder="Ej: patrón tribal de rhinestones en ambos bolsillos traseros, cobertura densa, piedras blancas cálidas, simetría exacta"
                    value={inputs.detailEmbellishmentDetail ?? ""}
                    onChange={e => onPatch({ detailEmbellishmentDetail: e.target.value || undefined })}
                  />
                  <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 4 }}>
                    Opcional. Describe forma, patrón y ubicación exacta — se inyecta verbatim en el prompt.
                  </div>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="detail-hardware-type">Tipo de cierre / herraje</label>
                  <select id="detail-hardware-type" style={{ ...inputStyle }}
                    value={inputs.detailHardwareType ?? ""}
                    onChange={e => onPatch({ detailHardwareType: e.target.value || undefined })}>
                    <option value="">Selecciona tipo de cierre…</option>
                    {JEANS_HARDWARE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="detail-hardware-finish">Acabado del herraje</label>
                  <select id="detail-hardware-finish" style={{ ...inputStyle }}
                    value={inputs.detailHardwareFinish ?? ""}
                    onChange={e => onPatch({ detailHardwareFinish: e.target.value || undefined })}>
                    <option value="">Selecciona acabado…</option>
                    {JEANS_HARDWARE_FINISHES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="detail-hardware-detail">Detalle de posición / cierre</label>
                  <textarea id="detail-hardware-detail"
                    rows={2}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                    placeholder="Ej: vertical stacked closure at center front waistband"
                    value={inputs.detailHardwareDetail ?? ""}
                    onChange={e => onPatch({ detailHardwareDetail: e.target.value || undefined })}
                  />
                  <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 4 }}>
                    Opcional. Describe orientación, posición o construcción del cierre.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <ActionRow
        nextLabel="Generar vista previa →"
        canNext={canNext}
        onNext={onNext}
        onBack={onBack}
        showBack={true}
      />
    </Panel>
  );
}

// ── Step 4: Review / approve ──────────────────────────────────────────────────

function ReviewApproveStep({
  reviewItems,
  onApproveItem,
  onRejectItem,
  onApproveAll,
  onNext,
  onBack,
  canNext,
}: {
  reviewItems:   ReviewItem[];
  onApproveItem: (id: string) => void;
  onRejectItem:  (id: string) => void;
  onApproveAll:  () => void;
  onNext:        () => void;
  onBack:        () => void;
  canNext:       boolean;
}) {
  const pendingCount  = reviewItems.filter(i => i.status === "pending").length;
  const approvedCount = reviewItems.filter(i => i.status === "approved").length;

  return (
    <Panel style={{ marginBottom: 0 }}>
      <PanelHeader
        title="Paso 4 — Revisa y aprueba"
        icon="✅"
        badge={
          <div style={{ display: "flex", gap: S[1] }}>
            <Badge variant={approvedCount === reviewItems.length ? "success" : "neutral"}>
              {approvedCount}/{reviewItems.length} aprobados
            </Badge>
            {pendingCount > 0 && (
              <Badge variant="warning">{pendingCount} pendiente{pendingCount > 1 ? "s" : ""}</Badge>
            )}
          </div>
        }
        cta={pendingCount > 0 ? undefined : undefined}
      />

      {/* Approve all shortcut */}
      {pendingCount > 0 && (
        <div style={{
          padding:     `${S[2]}px ${S[4]}px`,
          borderBottom: `1px solid ${C.line}`,
          background:  C.surface,
          display:     "flex",
          alignItems:  "center",
          gap:         S[3],
        }}>
          <span style={{ fontSize: T.sz.xs, color: C.inkLight }}>
            {pendingCount} elemento{pendingCount > 1 ? "s" : ""} por revisar
          </span>
          <button
            onClick={onApproveAll}
            style={{
              padding:      `4px ${S[2]}px`,
              background:   C.greenLight,
              color:        C.green,
              border:       `1px solid ${C.greenBorder}`,
              borderRadius: R.sm,
              fontSize:     T.sz.xs,
              fontWeight:   T.wt.bold,
              cursor:       "pointer",
              fontFamily:   T.mono,
            }}
          >
            Aprobar todo ✓
          </button>
        </div>
      )}

      {/* Review cards */}
      <div style={{ padding: `${S[3]}px ${S[4]}px`, display: "grid", gap: S[3] }}>
        {reviewItems.map(item => {
          const meta = ASSET_META[item.type];
          const isPending  = item.status === "pending";
          const isApproved = item.status === "approved";
          const isRejected = item.status === "rejected";

          return (
            <div key={item.id} style={{
              border:       `1px solid ${isApproved ? C.greenBorder : isRejected ? C.redBorder : C.line}`,
              borderRadius: R.md,
              background:   isApproved ? C.greenLight : isRejected ? C.redLight : C.white,
              overflow:     "hidden",
              boxShadow:    E.xs,
            }}>
              {/* Card header */}
              <div style={{
                display:      "flex",
                alignItems:   "center",
                gap:          S[2],
                padding:      `${S[2]}px ${S[3]}px`,
                borderBottom: `1px solid ${isApproved ? C.greenBorder : isRejected ? C.redBorder : C.line}`,
                background:   isApproved ? "#e8fdf0" : isRejected ? "#fff0f0" : C.surfaceAlt,
              }}>
                <span style={{ fontSize: 18 }}>{meta.icon}</span>
                <div>
                  <div style={{ fontWeight: T.wt.bold, fontSize: T.sz.base, color: C.ink }}>
                    {meta.label}
                  </div>
                  <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>{meta.desc}</div>
                </div>
                <div style={{ marginLeft: "auto" }}>
                  {isApproved && <Badge variant="success">Aprobado</Badge>}
                  {isRejected && <Badge variant="danger">Rechazado</Badge>}
                  {isPending  && <Badge variant="neutral">Pendiente</Badge>}
                </div>
              </div>

              {/* Card content (text assets) */}
              {item.content && (
                <div style={{
                  padding:    `${S[2]}px ${S[3]}px`,
                  fontSize:   T.sz.base,
                  color:      C.inkMid,
                  fontStyle:  "italic",
                  background: C.surface,
                  borderBottom: `1px solid ${C.lineSubtle}`,
                }}>
                  "{item.content}"
                </div>
              )}

              {/* Visual asset placeholder */}
              {!item.content && (
                <div style={{
                  height:          64,
                  background:      C.surfaceAlt,
                  display:         "flex",
                  alignItems:      "center",
                  justifyContent:  "center",
                  fontSize:        T.sz.xs,
                  color:           C.inkFaint,
                  borderBottom:    `1px solid ${C.lineSubtle}`,
                  fontStyle:       "italic",
                }}>
                  Vista previa generada en producción
                </div>
              )}

              {/* Approve / reject actions */}
              {isPending && (
                <div style={{
                  display:    "flex",
                  gap:        S[2],
                  padding:    `${S[2]}px ${S[3]}px`,
                }}>
                  <button
                    onClick={() => onApproveItem(item.id)}
                    style={{
                      padding:      `4px ${S[2]}px`,
                      background:   C.greenLight,
                      color:        C.green,
                      border:       `1px solid ${C.greenBorder}`,
                      borderRadius: R.sm,
                      fontSize:     T.sz.xs,
                      fontWeight:   T.wt.bold,
                      cursor:       "pointer",
                      fontFamily:   T.mono,
                    }}
                  >
                    ✓ Aprobar
                  </button>
                  <button
                    onClick={() => onRejectItem(item.id)}
                    style={{
                      padding:      `4px ${S[2]}px`,
                      background:   C.redLight,
                      color:        C.red,
                      border:       `1px solid ${C.redBorder}`,
                      borderRadius: R.sm,
                      fontSize:     T.sz.xs,
                      fontWeight:   T.wt.bold,
                      cursor:       "pointer",
                      fontFamily:   T.mono,
                    }}
                  >
                    ✗ Rechazar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ActionRow
        nextLabel="Confirmar y continuar →"
        canNext={canNext}
        onNext={onNext}
        onBack={onBack}
        showBack={true}
      />
    </Panel>
  );
}

// ── Shopify draft summary card ────────────────────────────────────────────────

function ShopifyDraftSummary({ draft }: { draft: ShopifyDraftPackage }) {
  return (
    <div style={{
      border:       `1px solid ${C.line}`,
      borderRadius: R.md,
      overflow:     "hidden",
      boxShadow:    E.xs,
    }}>
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          S[2],
        padding:      `${S[2]}px ${S[3]}px`,
        borderBottom: `1px solid ${C.line}`,
        background:   C.surfaceAlt,
      }}>
        <span style={{ fontSize: 18 }}>📦</span>
        <div>
          <div style={{ fontWeight: T.wt.bold, fontSize: T.sz.base, color: C.ink }}>Borrador Shopify</div>
          <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>Vista previa del producto que se creará</div>
        </div>
        <div style={{ marginLeft: "auto" }}><Badge variant="neutral">Draft</Badge></div>
      </div>
      <div style={{ padding: `${S[3]}px ${S[3]}px`, display: "grid", gap: S[2] }}>
        <div style={{ display: "flex", gap: S[2], fontSize: T.sz.sm }}>
          <span style={{ color: C.inkFaint, minWidth: 80 }}>Título:</span>
          <span style={{ color: C.ink, fontWeight: T.wt.medium }}>{draft.title}</span>
        </div>
        <div style={{ display: "flex", gap: S[2], fontSize: T.sz.sm }}>
          <span style={{ color: C.inkFaint, minWidth: 80 }}>Tipo:</span>
          <span style={{ color: C.ink }}>{draft.productType}</span>
        </div>
        <div style={{ display: "flex", gap: S[2], fontSize: T.sz.sm }}>
          <span style={{ color: C.inkFaint, minWidth: 80 }}>Precio:</span>
          <span style={{ color: C.ink }}>{draft.variants[0]?.price ?? "—"}</span>
        </div>
        {draft.variants[0]?.sku && (
          <div style={{ display: "flex", gap: S[2], fontSize: T.sz.sm }}>
            <span style={{ color: C.inkFaint, minWidth: 80 }}>SKU:</span>
            <code style={{ color: C.inkMid, fontFamily: T.mono, fontSize: T.sz.xs }}>{draft.variants[0].sku}</code>
          </div>
        )}
        <div style={{ display: "flex", gap: S[2], fontSize: T.sz.sm, flexWrap: "wrap", alignItems: "flex-start" }}>
          <span style={{ color: C.inkFaint, minWidth: 80 }}>Tags:</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {draft.tags.slice(0, 10).map(tag => (
              <span key={tag} style={{
                fontSize:     T.sz["2xs"],
                padding:      "1px 6px",
                borderRadius: R.pill,
                background:   C.surfaceAlt,
                color:        C.inkLight,
                border:       `1px solid ${C.line}`,
              }}>{tag}</span>
            ))}
            {draft.tags.length > 10 && (
              <span style={{ fontSize: T.sz["2xs"], color: C.inkFaint }}>+{draft.tags.length - 10} más</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: S[2], fontSize: T.sz.sm }}>
          <span style={{ color: C.inkFaint, minWidth: 80 }}>Imágenes:</span>
          <span style={{ color: C.ink }}>{draft.imageSlots.length} slot{draft.imageSlots.length !== 1 ? "s" : ""} ({draft.imageSlots.map(s => s.assetType).join(", ")})</span>
        </div>
      </div>
    </div>
  );
}

// ── Step 5: Publish / export ──────────────────────────────────────────────────

function PublishExportStep({
  session,
  onPublish,
  onReset,
  orgSlug,
  shopifyDraft,
}: {
  session:       StudioSession;
  onPublish:     () => void;
  onReset:       () => void;
  orgSlug:       string;
  shopifyDraft?: ShopifyDraftPackage;
}) {
  const isPublished  = session.status === "published";
  const isPublishing = session.status === "publishing";
  const result       = session.publishResult;

  if (isPublished && result) {
    return (
      <Panel style={{ marginBottom: 0 }}>
        <PanelHeader
          title="Sesión completada"
          icon="🎉"
          badge={<Badge variant="success">Publicado</Badge>}
        />
        <div style={{ padding: `${S[4]}px ${S[4]}px` }}>
          <div style={{ marginBottom: S[4] }}>
            {result.shopifyDraft && (
              <div style={{ marginBottom: S[4] }}>
                <div style={{ fontSize: T.sz.base, color: C.ink, fontWeight: T.wt.semibold, marginBottom: S[2] }}>
                  Borrador Shopify:
                </div>
                <ShopifyDraftSummary draft={result.shopifyDraft} />
              </div>
            )}
            <div style={{ fontSize: T.sz.base, color: C.ink, fontWeight: T.wt.semibold, marginBottom: S[3] }}>
              Acciones completadas:
            </div>
            <div style={{ display: "grid", gap: S[2] }}>
              {result.shopifyDraftId && (
                <div style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:          S[2],
                  padding:      `${S[2]}px ${S[3]}px`,
                  background:   C.greenLight,
                  border:       `1px solid ${C.greenBorder}`,
                  borderRadius: R.sm,
                }}>
                  <span>📦</span>
                  <span style={{ fontSize: T.sz.base, color: C.greenDark }}>
                    Borrador creado en Shopify
                  </span>
                  <code style={{
                    marginLeft:  "auto",
                    fontSize:    T.sz.xs,
                    color:       C.inkFaint,
                    fontFamily:  T.mono,
                  }}>
                    {result.shopifyDraftId}
                  </code>
                </div>
              )}
              {result.lucaJobId && (
                <div style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:          S[2],
                  padding:      `${S[2]}px ${S[3]}px`,
                  background:   C.blueLight,
                  border:       `1px solid ${C.blueBorder}`,
                  borderRadius: R.sm,
                }}>
                  <span>📱</span>
                  <span style={{ fontSize: T.sz.base, color: C.blueDark }}>
                    Publicación en redes enviada
                  </span>
                  <code style={{
                    marginLeft:  "auto",
                    fontSize:    T.sz.xs,
                    color:       C.inkFaint,
                    fontFamily:  T.mono,
                  }}>
                    {result.lucaJobId}
                  </code>
                </div>
              )}
              {result.exportUrl && (
                <div style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:          S[2],
                  padding:      `${S[2]}px ${S[3]}px`,
                  background:   C.brandLight,
                  border:       `1px solid ${C.brandBorder}`,
                  borderRadius: R.sm,
                }}>
                  <span>📄</span>
                  <span style={{ fontSize: T.sz.base, color: C.brandDark }}>
                    Catálogo exportado
                  </span>
                  <code style={{
                    marginLeft:  "auto",
                    fontSize:    T.sz.xs,
                    color:       C.inkFaint,
                    fontFamily:  T.mono,
                    overflow:    "hidden",
                    textOverflow: "ellipsis",
                    maxWidth:    260,
                    whiteSpace:  "nowrap",
                  }}>
                    {result.exportUrl}
                  </code>
                </div>
              )}
            </div>
          </div>
          <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>
            Publicado el {new Date(result.publishedAt).toLocaleString("es-CO")}
          </div>
        </div>
        <div style={{
          display:    "flex",
          gap:        S[2],
          padding:    `${S[3]}px ${S[4]}px`,
          borderTop:  `1px solid ${C.line}`,
          background: C.surfaceAlt,
        }}>
          <Link href={`/${orgSlug}/agentik/marketing-studio`}
            style={{ ...btnSecondary, textDecoration: "none" }}>
            ← Volver al estudio
          </Link>
          <button onClick={onReset} style={{ ...btnPrimary, marginLeft: "auto" }}>
            Nueva sesión
          </button>
        </div>
      </Panel>
    );
  }

  // Pre-publish confirmation
  const approvedItems = session.reviewItems.filter(i => i.status === "approved");

  return (
    <Panel style={{ marginBottom: 0 }}>
      <PanelHeader
        title="Paso 5 — Publicar y exportar"
        icon="🚀"
        badge={<Badge variant="info">{approvedItems.length} elementos aprobados</Badge>}
      />
      <div style={{ padding: `${S[4]}px ${S[4]}px` }}>
        <SectionLabel>Activos aprobados</SectionLabel>
        <div style={{ display: "grid", gap: S[2], marginBottom: S[4] }}>
          {approvedItems.map(item => {
            const meta = ASSET_META[item.type];
            return (
              <div key={item.id} style={{
                display:      "flex",
                alignItems:   "center",
                gap:          S[2],
                padding:      `${S[1] + 2}px ${S[3]}px`,
                background:   C.greenLight,
                border:       `1px solid ${C.greenBorder}`,
                borderRadius: R.sm,
              }}>
                <span>{meta.icon}</span>
                <span style={{ fontSize: T.sz.base, color: C.greenDark, fontWeight: T.wt.medium }}>
                  {meta.label}
                </span>
                <Badge variant="success" size="xs">aprobado</Badge>
              </div>
            );
          })}
        </div>

        {shopifyDraft && (
          <div style={{ marginBottom: S[4] }}>
            <SectionLabel>Vista previa del borrador Shopify</SectionLabel>
            <ShopifyDraftSummary draft={shopifyDraft} />
          </div>
        )}

        <SectionLabel style={{ marginTop: S[3] }}>Acciones que se ejecutarán</SectionLabel>
        {session.objective && (() => {
          const wf = resolveWorkflow(session.objective);
          return (
            <div style={{ display: "grid", gap: S[1] }}>
              {wf.createProductDraft && (
                <div style={{ display: "flex", alignItems: "center", gap: S[2],
                  fontSize: T.sz.base, color: C.inkMid }}>
                  <span>📦</span> Crear borrador de producto en Shopify
                </div>
              )}
              {wf.publishToLuca && (
                <div style={{ display: "flex", alignItems: "center", gap: S[2],
                  fontSize: T.sz.base, color: C.inkMid }}>
                  <span>📱</span> Publicar en redes sociales
                </div>
              )}
              {!wf.createProductDraft && !wf.publishToLuca && (
                <div style={{ display: "flex", alignItems: "center", gap: S[2],
                  fontSize: T.sz.base, color: C.inkMid }}>
                  <span>📄</span> Exportar activos del catálogo
                </div>
              )}
            </div>
          );
        })()}
      </div>
      <ActionRow
        nextLabel={isPublishing ? "Publicando…" : "Confirmar y publicar →"}
        canNext={!isPublishing && approvedItems.length > 0}
        onNext={onPublish}
        onBack={() => {/* publish step has no back — review is already committed */}}
        showBack={false}
        showReset={true}
        onReset={onReset}
      />
    </Panel>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export function StudioWizard({
  orgSlug,
  tenantId,
}: {
  orgSlug:  string;
  tenantId: string;
}) {
  const [session, dispatch] = useReducer(
    studioReducer,
    undefined,
    () => createSession(tenantId),
  );

  // ── Local state (not yet committed to session) ───────────────────────────

  const [sku,          setSku]          = useState("");
  const [imageUrl,     setImageUrl]     = useState("");
  const [backImageUrl, setBackImageUrl] = useState("");

  // Step 2: selected but not yet dispatched
  const [pendingObjective, setPendingObjective] = useState<UserObjective | null>(null);

  // Step 3: colors as raw string
  const [colorsRaw, setColorsRaw] = useState("");

  // Do Jeans draft — built when entering publish step
  const [shopifyDraft, setShopifyDraft] = useState<ShopifyDraftPackage | undefined>(undefined);

  // Track whether the DB session has been created (persists across re-renders)
  const dbCreated = useRef(false);

  // Create persistent DB session on first render
  useEffect(() => {
    if (dbCreated.current) return;
    dbCreated.current = true;
    fetch(`/api/orgs/${orgSlug}/marketing-studio/sessions`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ sessionId: session.id, tenantId }),
    }).catch((err) => {
      console.warn("[wizard] failed to create DB session:", err);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync pendingObjective from session when back-navigating to choose_objective
  useEffect(() => {
    if (session.step === "choose_objective") {
      setPendingObjective(session.objective);
    }
  }, [session.step, session.objective]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const isDoJeans      = tenantId === "do-jeans";
  const stepIdx        = getStepIndex(session.step);
  const canAdvance     = canAdvanceFrom(session);

  // For Do Jeans strict jeans, also check detail lock completeness
  const isDoJeansJeans =
    isDoJeans &&
    session.inputs.category === "jeans" &&
    session.objective === "shopify_listing";

  const doJeansLocksValid = !isDoJeansJeans || canAdvanceDoJeansStrict(
    { sku: sku.trim(), imageUrl: imageUrl.trim(), backImageUrl: backImageUrl.trim() || undefined },
    session.inputs,
  );

  const uploadCanNext = imageUrl.trim().length > 0;  // front image required; SKU optional

  const step3CanNext = canAdvance && doJeansLocksValid;

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleProductNext() {
    const u = imageUrl.trim();
    if (!u) return;
    dispatch({
      type:    "SET_PRODUCT",
      product: {
        sku:          sku.trim(),
        imageUrl:     u,
        backImageUrl: backImageUrl.trim() || undefined,
      },
    });
    // Persist back image URL in inputs so the execute route can read it
    if (backImageUrl.trim()) {
      dispatch({ type: "SET_INPUTS", inputs: { backImageUrl: backImageUrl.trim() } as Partial<MinimumInputFields> });
    }
  }

  function handleObjectiveConfirm() {
    if (!pendingObjective) return;
    dispatch({ type: "SET_OBJECTIVE", objective: pendingObjective });
  }

  function handleColorsChange(raw: string) {
    setColorsRaw(raw);
    const parsed = raw.split(",").map(c => c.trim()).filter(Boolean);
    dispatch({ type: "SET_INPUTS", inputs: { colors: parsed } });
  }

  function handlePatch(patch: Partial<MinimumInputFields>) {
    dispatch({ type: "SET_INPUTS", inputs: patch });
  }

  function handleGeneratePreview() {
    if (!session.objective) return;
    const items = buildReviewItems(session.objective, tenantId);
    dispatch({ type: "SUBMIT_FOR_REVIEW", reviewItems: items });
  }

  function handleAdvanceToPublish() {
    // Build Shopify draft package for Do Jeans before entering publish step
    if (isDoJeansJeans) {
      const frontItem = session.reviewItems.find(i => i.type === "front_clean");
      const backItem  = session.reviewItems.find(i => i.type === "back_clean");
      if (frontItem && backItem) {
        const draft = buildShopifyDraft({
          product:      { sku: sku.trim(), imageUrl: imageUrl.trim(), backImageUrl: backImageUrl.trim() || undefined },
          inputs:       session.inputs,
          frontAssetId: frontItem.id,
          backAssetId:  backItem.id,
        });
        setShopifyDraft(draft);
      }
    }
    dispatch({ type: "START_PUBLISHING" });
  }

  async function handlePublish() {
    if (!session.objective) return;
    dispatch({ type: "START_PUBLISHING" });
    try {
      const res  = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/sessions/${session.id}/execute`,
        { method: "POST" },
      );
      const data = await res.json() as {
        jobId?:    string;
        stubbed?:  boolean;
        error?:    string;
        details?:  string[];
      };
      if (!res.ok || data.error) {
        dispatch({ type: "PUBLISH_FAILED", reason: data.error ?? "Execution failed" });
        return;
      }
      const wf = isDoJeans && session.objective === "shopify_listing"
        ? resolveDoJeansWorkflow()
        : resolveWorkflow(session.objective);
      dispatch({
        type:   "PUBLISH_SUCCESS",
        result: {
          objective:      session.objective,
          shopifyDraftId: wf.createProductDraft ? data.jobId : undefined,
          lucaJobId:      wf.publishToLuca      ? data.jobId : undefined,
          exportUrl:      (!wf.createProductDraft && !wf.publishToLuca)
            ? `https://cdn.agentik.co/exports/catalog_${data.jobId}.zip`
            : undefined,
          publishedAt:    new Date().toISOString(),
          shopifyDraft:   shopifyDraft,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      dispatch({ type: "PUBLISH_FAILED", reason: msg });
    }
  }

  function handleReset() {
    setSku("");
    setImageUrl("");
    setBackImageUrl("");
    setColorsRaw("");
    setPendingObjective(null);
    setShopifyDraft(undefined);
    dispatch({ type: "RESET" });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      <StepperBar stepIdx={stepIdx} />

      {session.step === "upload_product" && (
        <UploadProductStep
          sku={sku}
          setSku={setSku}
          imageUrl={imageUrl}
          setImageUrl={setImageUrl}
          backImageUrl={backImageUrl}
          setBackImageUrl={setBackImageUrl}
          onNext={handleProductNext}
          canNext={uploadCanNext}
          isDoJeans={isDoJeans}
          tenantId={tenantId}
          sessionId={session.id}
        />
      )}

      {session.step === "choose_objective" && (
        <ChooseObjectiveStep
          pending={pendingObjective}
          sessionObjective={session.objective}
          onSelect={setPendingObjective}
          onConfirm={handleObjectiveConfirm}
          onBack={() => dispatch({ type: "GO_BACK" })}
        />
      )}

      {session.step === "minimum_fields" && session.objective && (
        <MinimumFieldsStep
          objective={session.objective}
          inputs={session.inputs}
          colorsRaw={colorsRaw}
          onColorsChange={handleColorsChange}
          onPatch={handlePatch}
          onNext={handleGeneratePreview}
          onBack={() => dispatch({ type: "GO_BACK" })}
          canNext={step3CanNext}
          isDoJeansJeans={isDoJeansJeans}
        />
      )}

      {session.step === "review_approve" && (
        <ReviewApproveStep
          reviewItems={session.reviewItems}
          onApproveItem={(id) => dispatch({ type: "APPROVE_ITEM", itemId: id })}
          onRejectItem={(id)  => dispatch({ type: "REJECT_ITEM",  itemId: id })}
          onApproveAll={() => dispatch({ type: "APPROVE_ALL" })}
          onNext={handleAdvanceToPublish}
          onBack={() => dispatch({ type: "GO_BACK" })}
          canNext={canAdvance}
        />
      )}

      {session.step === "publish_export" && (
        <PublishExportStep
          session={session}
          onPublish={handlePublish}
          onReset={handleReset}
          orgSlug={orgSlug}
          shopifyDraft={shopifyDraft}
        />
      )}
    </div>
  );
}
