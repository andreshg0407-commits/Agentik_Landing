"use client";
/**
 * components/marketing-studio/library/product-channel-content-panel.tsx
 *
 * MARKETING-STUDIO-PRODUCT-CHANNEL-CONTENT-01 — Channel Content Editor
 *
 * Block 8 inside product-detail-drawer.tsx — "Canales de contenido".
 *
 * ── UX PRINCIPLE ──────────────────────────────────────────────────────────────
 *   Each channel tab shows two layers:
 *     1. Inherited fields (read-only): "usando maestro" badge — value from ProductContent
 *     2. Override fields (editable):   operator-written channel-specific copy
 *
 *   This makes inheritance visible and prevents silent duplication of work.
 *
 * ── Design rules ──────────────────────────────────────────────────────────────
 *   C.* / T.* / S.* / R.* only — no raw hex
 *   MS_PALETTE.product for domain color
 *   T.mono for ALL operational data
 *
 * ── EXTENSION POINTS ──────────────────────────────────────────────────────────
 *   AI_GENERATION_SLOT per channel: "Generar con IA" button below each field group
 *   PUBLISHING_INTEGRATION_SLOT:    "Publicar en {channel}" CTA when publishing sprint lands
 */

import { useEffect, useState, useCallback } from "react";
import { C, T, S, R, E }                   from "@/lib/ui/tokens";
import { MS_PALETTE }                       from "@/lib/marketing-studio/ms-design-system";
import type {
  ChannelType,
  ChannelReadinessResult,
  ResolvedChannelContent,
  ResolvedField,
  FieldSource,
  ShopifyChannelPayload,
  WhatsAppChannelPayload,
  InstagramChannelPayload,
  FacebookChannelPayload,
  TikTokChannelPayload,
  MarketplaceChannelPayload,
  PdfChannelPayload,
} from "@/lib/marketing-studio/products/product-channel-content-types";
import {
  ALL_CHANNELS,
  CHANNEL_LABELS,
} from "@/lib/marketing-studio/products/product-channel-content-types";

// ── Domain color ──────────────────────────────────────────────────────────────

const DOMAIN = MS_PALETTE.product;

// ── Channel icons ─────────────────────────────────────────────────────────────

const CHANNEL_ICONS: Record<ChannelType, string> = {
  shopify:     "🛒",
  whatsapp:    "💬",
  instagram:   "📸",
  facebook:    "📘",
  tiktok:      "🎵",
  marketplace: "🏪",
  pdf:         "📄",
};

// ── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: FieldSource }) {
  const cfg = {
    channel: { label: "override",     bg: C.blueDark + "15", color: C.blueDark, border: C.blueDark + "30" },
    master:  { label: "maestro",      bg: C.green    + "15", color: C.green,    border: C.green    + "30" },
    missing: { label: "sin contenido",bg: C.line,            color: C.inkFaint, border: C.line },
  }[source];
  return (
    <span style={{
      fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
      padding: "1px 6px", borderRadius: R.pill,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      letterSpacing: "0.04em", whiteSpace: "nowrap" as const,
    }}>
      {cfg.label}
    </span>
  );
}

// ── Read-only inherited value ─────────────────────────────────────────────────

function InheritedField({ label, field }: { label: string; field: ResolvedField }) {
  const display = Array.isArray(field.value)
    ? field.value.join(", ")
    : (field.value ?? "—");
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{label}</span>
        <SourceBadge source={field.source} />
      </div>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: field.source === "missing" ? C.inkGhost : C.inkMid,
        padding: `${S[1]}px ${S[2]}px`,
        background: C.surface, borderRadius: R.sm,
        fontStyle: field.source === "missing" ? "italic" : "normal",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
      }}>
        {field.source === "missing" ? "Sin valor en maestro" : display}
      </div>
    </div>
  );
}

// ── Editable field ────────────────────────────────────────────────────────────

function OverrideField({
  label, value, onChange, placeholder, multiline, rows,
  hint, masterValue,
}: {
  label:        string;
  value:        string;
  onChange:     (v: string) => void;
  placeholder?: string;
  multiline?:   boolean;
  rows?:        number;
  hint?:        string;
  masterValue?: string | null;
}) {
  const hasOverride = value.trim() !== "";
  const inputStyle: React.CSSProperties = {
    width: "100%", fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
    background: C.white, border: `1px solid ${hasOverride ? C.blueDark + "60" : C.line}`,
    borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`,
    outline: "none", boxSizing: "border-box" as const,
    resize: "vertical" as const, lineHeight: 1.5,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
      <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkMid }}>
          {label}
        </span>
        {hasOverride && <SourceBadge source="channel" />}
      </div>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? masterValue ?? ""}
          rows={rows ?? 3}
          style={inputStyle}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? masterValue ?? ""}
          style={inputStyle}
        />
      )}
      {hint && (
        <span style={{ fontFamily: T.sans, fontSize: T.sz["2xs"], color: C.inkGhost, lineHeight: 1.4 }}>
          {hint}
        </span>
      )}
    </div>
  );
}

// ── List override field ───────────────────────────────────────────────────────

function ListOverrideField({
  label, items, onChange, placeholder, addLabel,
}: {
  label:       string;
  items:       string[];
  onChange:    (items: string[]) => void;
  placeholder?: string;
  addLabel?:    string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => { const v = draft.trim(); if (v) { onChange([...items, v]); setDraft(""); } };
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkMid }}>
        {label}
      </span>
      {items.map((item, idx) => (
        <div key={idx} style={{
          display: "flex", alignItems: "center", gap: S[2],
          padding: `${S[1]}px ${S[2]}px`,
          background: C.blueDark + "0A", border: `1px solid ${C.blueDark + "25"}`,
          borderRadius: R.sm,
        }}>
          <span style={{ flex: 1, fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{item}</span>
          <button onClick={() => remove(idx)} style={{
            fontFamily: T.mono, fontSize: 10, color: C.inkFaint,
            background: "transparent", border: "none", cursor: "pointer",
          }}>×</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: S[2] }}>
        <input
          type="text" value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          style={{
            flex: 1, fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
            background: C.white, border: `1px solid ${C.line}`,
            borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`, outline: "none",
          }}
        />
        <button onClick={add} style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
          padding: `${S[1]}px ${S[3]}px`, borderRadius: R.sm,
          background: DOMAIN.primary, color: C.white, border: "none", cursor: "pointer",
        }}>{addLabel ?? "+ Agregar"}</button>
      </div>
    </div>
  );
}

// ── Readiness bar ─────────────────────────────────────────────────────────────

function ReadinessBar({ r }: { r: ChannelReadinessResult | null }) {
  if (!r) return null;
  const color = r.score >= 70 ? C.green : r.score >= 40 ? C.amber : C.inkFaint;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
      <div style={{ flex: 1, height: 5, background: C.lineSubtle, borderRadius: R.pill, overflow: "hidden" }}>
        <div style={{ width: `${r.score}%`, height: "100%", background: color, borderRadius: R.pill, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color, whiteSpace: "nowrap" as const }}>
        {r.score}% {r.ready ? "· Listo" : ""}
      </span>
      {r.overrideCount > 0 && (
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>
          {r.overrideCount} override{r.overrideCount !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

// ── Per-channel editors ───────────────────────────────────────────────────────

function ShopifyEditor({
  resolved, onChange,
}: {
  resolved: ResolvedChannelContent;
  onChange: (p: ShopifyChannelPayload) => void;
}) {
  const f = resolved.fields;
  const [title,    setTitle]    = useState(resolved.effective.shopifyTitle    as string ?? "");
  const [desc,     setDesc]     = useState(resolved.effective.shopifyDescription as string ?? "");
  const [seoTitle, setSeoTitle] = useState(resolved.effective.shopifySeoTitle as string ?? "");
  const [seoDesc,  setSeoDesc]  = useState(resolved.effective.shopifySeoDescription as string ?? "");
  const [tags,     setTags]     = useState<string[]>((resolved.effective.shopifyTags   as string[]) ?? []);
  const [handle,   setHandle]   = useState(resolved.effective.shopifyHandle   as string ?? "");

  const emit = useCallback(() => {
    onChange({
      shopifyTitle:          title    || null,
      shopifyDescription:    desc     || null,
      shopifySeoTitle:       seoTitle || null,
      shopifySeoDescription: seoDesc  || null,
      shopifyTags:           tags,
      shopifyHandle:         handle   || null,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, desc, seoTitle, seoDesc, tags, handle]);

  useEffect(() => { emit(); }, [emit]);

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
        <InheritedField label="Título maestro" field={f.shopifyTitle ?? { value: null, source: "missing" }} />
        <InheritedField label="SEO maestro"     field={f.shopifySeoTitle ?? { value: null, source: "missing" }} />
      </div>
      <OverrideField label="Título Shopify" value={title} onChange={setTitle}
        hint="Override del título comercial maestro para Shopify."
        masterValue={f.shopifyTitle?.value as string | null} />
      <OverrideField label="Descripción Shopify" value={desc} onChange={setDesc}
        multiline rows={4} hint="Aparecerá como body_html en Shopify."
        masterValue={f.shopifyDescription?.value as string | null} />
      <OverrideField label="Título SEO Shopify" value={seoTitle} onChange={setSeoTitle}
        hint="Override del título SEO maestro."
        masterValue={f.shopifySeoTitle?.value as string | null} />
      <OverrideField label="Descripción SEO Shopify" value={seoDesc} onChange={setSeoDesc}
        multiline rows={2}
        masterValue={f.shopifySeoDescription?.value as string | null} />
      <ListOverrideField label="Tags" items={tags} onChange={setTags}
        placeholder="Agregar tag…" addLabel="+ Tag" />
      <OverrideField label="Handle (URL)" value={handle} onChange={setHandle}
        hint="Deja vacío para usar el nombre del producto automáticamente." />
      {/* SHOPIFY_PUBLISHING_SLOT: connect to Shopify Publishing sprint */}
      {/* AI_GENERATION_SLOT: "Generar contenido Shopify con IA" */}
    </div>
  );
}

function WhatsAppEditor({
  resolved, onChange,
}: {
  resolved: ResolvedChannelContent;
  onChange: (p: WhatsAppChannelPayload) => void;
}) {
  const f = resolved.fields;
  const [pitch,    setPitch]    = useState(resolved.effective.whatsAppShortPitch    as string ?? "");
  const [sales,    setSales]    = useState(resolved.effective.whatsAppSalesMessage  as string ?? "");
  const [followUp, setFollowUp] = useState(resolved.effective.whatsAppFollowUpMessage as string ?? "");
  const [keywords, setKeywords] = useState<string[]>((resolved.effective.whatsAppKeywords as string[]) ?? []);

  const emit = useCallback(() => {
    onChange({
      whatsAppShortPitch:      pitch    || null,
      whatsAppSalesMessage:    sales    || null,
      whatsAppFollowUpMessage: followUp || null,
      whatsAppKeywords:        keywords,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitch, sales, followUp, keywords]);

  useEffect(() => { emit(); }, [emit]);

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
      <InheritedField label="Descripción corta (maestro)" field={f.whatsAppShortPitch ?? { value: null, source: "missing" }} />
      <OverrideField label="Mensaje corto (≤80 car.)" value={pitch} onChange={setPitch}
        hint="Primera línea del mensaje — debe capturar la atención inmediatamente."
        masterValue={f.whatsAppShortPitch?.value as string | null} />
      <OverrideField label="Mensaje de venta completo" value={sales} onChange={setSales}
        multiline rows={4}
        masterValue={f.whatsAppSalesMessage?.value as string | null} />
      <OverrideField label="Mensaje de seguimiento" value={followUp} onChange={setFollowUp}
        multiline rows={3} hint="Mensaje para re-enganchar al cliente interesado." />
      <ListOverrideField label="Palabras clave (clasificación)" items={keywords} onChange={setKeywords}
        placeholder="Agregar palabra clave…" />
      {/* WHATSAPP_AUTOMATION_SLOT: templateId, catalogItemId */}
      {/* AI_GENERATION_SLOT: "Generar pitch WhatsApp con IA" */}
    </div>
  );
}

function InstagramEditor({
  resolved, onChange,
}: {
  resolved: ResolvedChannelContent;
  onChange: (p: InstagramChannelPayload) => void;
}) {
  const f = resolved.fields;
  const [caption,  setCaption]  = useState(resolved.effective.instagramCaption as string ?? "");
  const [hashtags, setHashtags] = useState<string[]>((resolved.effective.instagramHashtags as string[]) ?? []);
  const [hook,     setHook]     = useState(resolved.effective.instagramHook as string ?? "");
  const [cta,      setCta]      = useState(resolved.effective.instagramCallToAction as string ?? "");

  const emit = useCallback(() => {
    onChange({
      instagramCaption:      caption  || null,
      instagramHashtags:     hashtags,
      instagramHook:         hook     || null,
      instagramCallToAction: cta      || null,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caption, hashtags, hook, cta]);

  useEffect(() => { emit(); }, [emit]);

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
      <InheritedField label="Descripción corta (maestro)" field={f.instagramCaption ?? { value: null, source: "missing" }} />
      <OverrideField label="Hook (primera línea)" value={hook} onChange={setHook}
        hint="Las primeras palabras detienen el scroll — sé específico." />
      <OverrideField label="Caption completo" value={caption} onChange={setCaption}
        multiline rows={4} masterValue={f.instagramCaption?.value as string | null} />
      <OverrideField label="Call to action" value={cta} onChange={setCta}
        placeholder="Ej. Escríbenos por DM para precio…" />
      <ListOverrideField label="Hashtags (sin #)" items={hashtags} onChange={setHashtags}
        placeholder="Agregar hashtag…" />
      {/* SOCIAL_PUBLISHING_SLOT: scheduledAt, boostBudget */}
      {/* AI_GENERATION_SLOT: "Generar caption Instagram con IA" */}
    </div>
  );
}

function FacebookEditor({
  resolved, onChange,
}: {
  resolved: ResolvedChannelContent;
  onChange: (p: FacebookChannelPayload) => void;
}) {
  const f = resolved.fields;
  const [caption, setCaption] = useState(resolved.effective.facebookCaption as string ?? "");
  const [cta,     setCta]     = useState(resolved.effective.facebookCallToAction as string ?? "");
  const [desc,    setDesc]    = useState(resolved.effective.facebookDescription as string ?? "");

  const emit = useCallback(() => {
    onChange({
      facebookCaption:      caption || null,
      facebookCallToAction: cta     || null,
      facebookDescription:  desc    || null,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caption, cta, desc]);

  useEffect(() => { emit(); }, [emit]);

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
      <InheritedField label="Descripción corta (maestro)" field={f.facebookCaption ?? { value: null, source: "missing" }} />
      <OverrideField label="Caption Facebook" value={caption} onChange={setCaption}
        multiline rows={3} masterValue={f.facebookCaption?.value as string | null} />
      <OverrideField label="Descripción extendida" value={desc} onChange={setDesc}
        multiline rows={3} masterValue={f.facebookDescription?.value as string | null} />
      <OverrideField label="Call to action" value={cta} onChange={setCta} placeholder="Ej. Comprar ahora" />
      {/* SOCIAL_PUBLISHING_SLOT: pageId, adSetId */}
    </div>
  );
}

function TikTokEditor({
  resolved, onChange,
}: {
  resolved: ResolvedChannelContent;
  onChange: (p: TikTokChannelPayload) => void;
}) {
  const f = resolved.fields;
  const [caption,  setCaption]  = useState(resolved.effective.tiktokCaption as string ?? "");
  const [hook,     setHook]     = useState(resolved.effective.tiktokHook as string ?? "");
  const [keywords, setKeywords] = useState<string[]>((resolved.effective.tiktokKeywords as string[]) ?? []);
  const [cta,      setCta]      = useState(resolved.effective.tiktokCallToAction as string ?? "");

  const emit = useCallback(() => {
    onChange({
      tiktokCaption:      caption  || null,
      tiktokHook:         hook     || null,
      tiktokKeywords:     keywords,
      tiktokCallToAction: cta      || null,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caption, hook, keywords, cta]);

  useEffect(() => { emit(); }, [emit]);

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
      <InheritedField label="Descripción corta (maestro)" field={f.tiktokCaption ?? { value: null, source: "missing" }} />
      <OverrideField label="Hook (primeros 3 seg.)" value={hook} onChange={setHook}
        hint="Texto que aparece en los primeros 3 segundos del video." />
      <OverrideField label="Caption TikTok" value={caption} onChange={setCaption}
        multiline rows={3} masterValue={f.tiktokCaption?.value as string | null} />
      <OverrideField label="Call to action" value={cta} onChange={setCta} placeholder="Ej. Toca el link en bio" />
      <ListOverrideField label="Palabras clave" items={keywords} onChange={setKeywords}
        placeholder="Agregar palabra clave…" />
      {/* SOCIAL_PUBLISHING_SLOT: creatorId, duetEnabled */}
      {/* AI_GENERATION_SLOT: "Generar hook TikTok con IA" */}
    </div>
  );
}

function MarketplaceEditor({
  resolved, onChange,
}: {
  resolved: ResolvedChannelContent;
  onChange: (p: MarketplaceChannelPayload) => void;
}) {
  const f = resolved.fields;
  const [title,    setTitle]    = useState(resolved.effective.marketplaceTitle as string ?? "");
  const [desc,     setDesc]     = useState(resolved.effective.marketplaceDescription as string ?? "");
  const [category, setCategory] = useState(resolved.effective.marketplaceCategory as string ?? "");
  const [bullets,  setBullets]  = useState<string[]>((resolved.effective.marketplaceBulletPoints as string[]) ?? []);
  const [keywords, setKeywords] = useState<string[]>((resolved.effective.marketplaceKeywords as string[]) ?? []);
  const [gtin,     setGtin]     = useState(resolved.effective.marketplaceGtin as string ?? "");
  const [platform, setPlatform] = useState(resolved.effective.marketplacePlatform as string ?? "");

  const emit = useCallback(() => {
    onChange({
      marketplaceTitle:        title    || null,
      marketplaceDescription:  desc     || null,
      marketplaceCategory:     category || null,
      marketplaceBulletPoints: bullets,
      marketplaceKeywords:     keywords,
      marketplaceGtin:         gtin     || null,
      marketplacePlatform:     platform || null,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, desc, category, bullets, keywords, gtin, platform]);

  useEffect(() => { emit(); }, [emit]);

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
      <InheritedField label="Título maestro" field={f.marketplaceTitle ?? { value: null, source: "missing" }} />
      <OverrideField label="Título marketplace" value={title} onChange={setTitle}
        masterValue={f.marketplaceTitle?.value as string | null} />
      <OverrideField label="Descripción marketplace" value={desc} onChange={setDesc}
        multiline rows={4} masterValue={f.marketplaceDescription?.value as string | null} />
      <OverrideField label="Categoría (ruta)" value={category} onChange={setCategory}
        placeholder="Ej. Ropa > Accesorios > Bolsos" />
      <ListOverrideField label="Puntos clave (bullet points)" items={bullets} onChange={setBullets}
        placeholder="Agregar punto…" addLabel="+ Punto" />
      <ListOverrideField label="Palabras clave" items={keywords} onChange={setKeywords}
        placeholder="Agregar palabra clave…" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
        <OverrideField label="GTIN (EAN / UPC)" value={gtin} onChange={setGtin}
          placeholder="Código de barras" />
        <OverrideField label="Plataforma" value={platform} onChange={setPlatform}
          placeholder="amazon · mercadolibre · falabella…" />
      </div>
      {/* MARKETPLACE_PUBLISHING_SLOT: listingId, syncEnabled */}
      {/* AI_GENERATION_SLOT: "Generar descripción marketplace con IA" */}
    </div>
  );
}

function PdfEditor({
  resolved, onChange,
}: {
  resolved: ResolvedChannelContent;
  onChange: (p: PdfChannelPayload) => void;
}) {
  const f = resolved.fields;
  const [desc,     setDesc]     = useState(resolved.effective.pdfShortDescription as string ?? "");
  const [benefits, setBenefits] = useState<string[]>((resolved.effective.pdfHighlightBenefits as string[]) ?? []);
  const [notes,    setNotes]    = useState(resolved.effective.pdfCommercialNotes as string ?? "");

  const emit = useCallback(() => {
    onChange({
      pdfShortDescription:  desc     || null,
      pdfHighlightBenefits: benefits,
      pdfCommercialNotes:   notes    || null,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desc, benefits, notes]);

  useEffect(() => { emit(); }, [emit]);

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
      <InheritedField label="Descripción corta (maestro)" field={f.pdfShortDescription ?? { value: null, source: "missing" }} />
      <OverrideField label="Descripción para catálogo impreso" value={desc} onChange={setDesc}
        multiline rows={3} hint="Texto impreso en tarjeta de producto o ficha técnica."
        masterValue={f.pdfShortDescription?.value as string | null} />
      <ListOverrideField label="Beneficios destacados (bullets para impresión)" items={benefits} onChange={setBenefits}
        placeholder="Agregar beneficio…" />
      <OverrideField label="Notas comerciales internas" value={notes} onChange={setNotes}
        multiline rows={2} hint="Notas para el diseñador de catálogo — no aparecen al público." />
      {/* CATALOG_INTELLIGENCE_SLOT: templateId, printConfig */}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug:   string;
  productId: string;
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProductChannelContentPanel({ orgSlug, productId }: Props) {
  const [activeChannel, setActiveChannel]     = useState<ChannelType>("shopify");
  const [resolved,      setResolved]          = useState<ResolvedChannelContent | null>(null);
  const [readiness,     setReadiness]         = useState<ChannelReadinessResult | null>(null);
  const [loading,       setLoading]           = useState(true);
  const [saving,        setSaving]            = useState(false);
  const [dirty,         setDirty]             = useState(false);
  const [saved,         setSaved]             = useState(false);
  const [error,         setError]             = useState<string | null>(null);

  // Current channel payload draft
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [draft, setDraft] = useState<any>(null);

  // Load channel content when channel changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDirty(false);
    setSaved(false);

    fetch(`/api/orgs/${orgSlug}/marketing-studio/products/${productId}/channel-content?channel=${activeChannel}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { resolved: ResolvedChannelContent; readiness: ChannelReadinessResult } | null) => {
        if (cancelled) return;
        if (data) {
          setResolved(data.resolved);
          setReadiness(data.readiness);
        }
      })
      .catch(() => { if (!cancelled) setError("No se pudo cargar el contenido."); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [orgSlug, productId, activeChannel]);

  // Save
  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/products/${productId}/channel-content`,
        {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: activeChannel, content: draft }),
        },
      );
      if (res.ok) {
        const data = await res.json() as { resolved: ResolvedChannelContent; readiness: ChannelReadinessResult };
        setResolved(data.resolved);
        setReadiness(data.readiness);
        setDirty(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError("Error al guardar. Inténtalo de nuevo.");
      }
    } catch {
      setError("Error al guardar. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  function handleDraftChange<P>(p: P) {
    setDraft(p);
    setDirty(true);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>

      {/* Channel tab bar */}
      <div style={{
        display: "flex", gap: S[1], flexWrap: "wrap" as const,
        borderBottom: `1px solid ${C.line}`, paddingBottom: S[2],
      }}>
        {ALL_CHANNELS.map(ch => (
          <button
            key={ch}
            onClick={() => setActiveChannel(ch)}
            style={{
              fontFamily:   T.mono,
              fontSize:     T.sz["2xs"],
              fontWeight:   activeChannel === ch ? T.wt.bold : T.wt.normal,
              padding:      `${S[1]}px ${S[3]}px`,
              borderRadius: R.sm,
              border:       `1px solid ${activeChannel === ch ? DOMAIN.primary : C.line}`,
              background:   activeChannel === ch ? DOMAIN.primary + "12" : C.white,
              color:        activeChannel === ch ? DOMAIN.primary : C.inkMid,
              cursor:       "pointer",
              display:      "flex",
              alignItems:   "center",
              gap:          S[1],
            }}
          >
            <span>{CHANNEL_ICONS[ch]}</span>
            <span>{CHANNEL_LABELS[ch]}</span>
          </button>
        ))}
      </div>

      {/* Readiness bar */}
      <ReadinessBar r={readiness} />

      {/* Content editor */}
      {loading ? (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, padding: `${S[3]}px 0` }}>
          Cargando contenido del canal…
        </div>
      ) : resolved ? (
        <>
          {/* Inheritance legend */}
          <div style={{
            display: "flex", alignItems: "center", gap: S[3],
            padding: `${S[2]}px ${S[3]}px`,
            background: C.surface, border: `1px solid ${C.line}`,
            borderRadius: R.sm,
          }}>
            <SourceBadge source="channel" />
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>Override — escrito para este canal</span>
            <SourceBadge source="master" />
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>Del contenido maestro</span>
            <SourceBadge source="missing" />
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>Sin valor</span>
          </div>

          {/* Per-channel form */}
          {activeChannel === "shopify"     && <ShopifyEditor     resolved={resolved} onChange={handleDraftChange} />}
          {activeChannel === "whatsapp"    && <WhatsAppEditor    resolved={resolved} onChange={handleDraftChange} />}
          {activeChannel === "instagram"   && <InstagramEditor   resolved={resolved} onChange={handleDraftChange} />}
          {activeChannel === "facebook"    && <FacebookEditor    resolved={resolved} onChange={handleDraftChange} />}
          {activeChannel === "tiktok"      && <TikTokEditor      resolved={resolved} onChange={handleDraftChange} />}
          {activeChannel === "marketplace" && <MarketplaceEditor resolved={resolved} onChange={handleDraftChange} />}
          {activeChannel === "pdf"         && <PdfEditor         resolved={resolved} onChange={handleDraftChange} />}
        </>
      ) : null}

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: S[3], paddingTop: S[2] }}>
        <button
          onClick={() => void handleSave()}
          disabled={saving || !dirty}
          style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            fontWeight:   T.wt.semibold,
            padding:      `${S[2]}px ${S[4]}px`,
            borderRadius: R.sm,
            background:   saving ? C.inkGhost : dirty ? C.blueDark : C.surface,
            color:        dirty ? C.white : C.inkFaint,
            border:       `1px solid ${dirty ? C.blueDark : C.line}`,
            cursor:       saving || !dirty ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Guardando…" : `Guardar ${CHANNEL_LABELS[activeChannel]}`}
        </button>
        {saved  && <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green }}>✓ Guardado</span>}
        {error  && <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red }}>{error}</span>}
      </div>

    </div>
  );
}
