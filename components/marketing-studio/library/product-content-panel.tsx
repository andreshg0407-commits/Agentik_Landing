"use client";
/**
 * components/marketing-studio/library/product-content-panel.tsx
 *
 * MARKETING-STUDIO-PRODUCT-CONTENT-01 — Content Editor Panel
 *
 * Renders inside product-detail-drawer.tsx as block 7 "Contenido".
 * Lazy-loads the content record from the API when first mounted.
 * Progressive disclosure: 4 collapsible sections mirror the 4 content tiers.
 *
 * ── Design rules ──────────────────────────────────────────────────────────────
 *   C.* / T.* / S.* / R.* only — no raw hex
 *   MS_PALETTE.product for domain color
 *   T.mono for ALL operational data
 *   T.sans ONLY for multi-sentence prose hints
 *
 * ── EXTENSION POINTS ──────────────────────────────────────────────────────────
 *   AI_GENERATION_SLOT:  "Generar con IA" button per field (shortDescription, keyBenefits)
 *   SHOPIFY_PREVIEW_SLOT: live Shopify card preview when integration active
 *   TRANSLATION_SLOT:    locale selector + per-locale content variant editor
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { C, T, S, R, E }                           from "@/lib/ui/tokens";
import { MS_PALETTE }                               from "@/lib/marketing-studio/ms-design-system";
import type {
  ProductContentRecord,
  ProductContentReadiness,
  FaqItem,
  ContentTier,
} from "@/lib/marketing-studio/products/product-content-types";
import { CONTENT_TIER_LABELS }                     from "@/lib/marketing-studio/products/product-content-types";

// ── Domain color ──────────────────────────────────────────────────────────────

const DOMAIN = MS_PALETTE.product;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug:    string;
  productId:  string;
}

interface ContentState {
  content:   ProductContentRecord | null;
  readiness: ProductContentReadiness | null;
}

// ── Tier color ────────────────────────────────────────────────────────────────

function tierColor(tier: ContentTier): string {
  switch (tier) {
    case "advanced":   return C.green;
    case "seo":        return C.blueDark;
    case "commercial": return C.amber;
    case "basic":      return C.inkFaint;
    default:           return C.inkGhost;
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
      color: C.inkMid, marginBottom: S[1],
    }}>
      {children}
    </div>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: T.sans, fontSize: T.sz["2xs"], color: C.inkGhost,
      marginTop: S[1], lineHeight: 1.4,
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ label, complete, count }: { label: string; complete: boolean; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
        color: C.ink,
      }}>
        {label}
      </span>
      {count !== undefined && (
        <span style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost,
        }}>
          ({count} campos)
        </span>
      )}
      {complete && (
        <span style={{
          fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
          padding: "1px 6px", borderRadius: R.pill,
          background: C.green + "18", color: C.green, border: `1px solid ${C.green}40`,
        }}>
          COMPLETO
        </span>
      )}
    </div>
  );
}

// ── Textarea helper ───────────────────────────────────────────────────────────

function Textarea({
  value, onChange, placeholder, rows = 3,
}: {
  value:       string;
  onChange:    (v: string) => void;
  placeholder?: string;
  rows?:        number;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width:        "100%",
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        color:        C.ink,
        background:   C.white,
        border:       `1px solid ${C.line}`,
        borderRadius: R.sm,
        padding:      `${S[2]}px ${S[3]}px`,
        resize:       "vertical" as const,
        outline:      "none",
        boxSizing:    "border-box" as const,
        lineHeight:   1.5,
      }}
    />
  );
}

function TextInput({
  value, onChange, placeholder,
}: {
  value:       string;
  onChange:    (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width:        "100%",
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        color:        C.ink,
        background:   C.white,
        border:       `1px solid ${C.line}`,
        borderRadius: R.sm,
        padding:      `${S[2]}px ${S[3]}px`,
        outline:      "none",
        boxSizing:    "border-box" as const,
      }}
    />
  );
}

// ── List editor (for keyBenefits / keyFeatures / searchKeywords) ──────────────

function ListEditor({
  items, onChange, placeholder, addLabel,
}: {
  items:       string[];
  onChange:    (items: string[]) => void;
  placeholder?: string;
  addLabel?:    string;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const val = draft.trim();
    if (!val) return;
    onChange([...items, val]);
    setDraft("");
  }

  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
      {items.map((item, idx) => (
        <div key={idx} style={{
          display: "flex", alignItems: "center", gap: S[2],
          padding: `${S[1]}px ${S[2]}px`,
          background: C.surface, border: `1px solid ${C.line}`,
          borderRadius: R.sm,
        }}>
          <span style={{
            flex: 1, fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
          }}>
            {item}
          </span>
          <button
            onClick={() => remove(idx)}
            style={{
              fontFamily: T.mono, fontSize: 10, color: C.inkFaint,
              background: "transparent", border: "none", cursor: "pointer",
              padding: "2px 4px",
            }}
          >
            ×
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: S[2] }}>
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          style={{
            flex: 1, fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
            background: C.white, border: `1px solid ${C.line}`,
            borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`,
            outline: "none",
          }}
        />
        <button
          onClick={add}
          style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
            padding: `${S[1]}px ${S[3]}px`, borderRadius: R.sm,
            background: DOMAIN.primary, color: C.white,
            border: "none", cursor: "pointer",
          }}
        >
          {addLabel ?? "+ Agregar"}
        </button>
      </div>
    </div>
  );
}

// ── FAQ editor ────────────────────────────────────────────────────────────────

function FaqEditor({ items, onChange }: { items: FaqItem[]; onChange: (items: FaqItem[]) => void }) {
  const [draftQ, setDraftQ] = useState("");
  const [draftA, setDraftA] = useState("");

  function add() {
    const q = draftQ.trim();
    const a = draftA.trim();
    if (!q || !a) return;
    onChange([...items, { q, a }]);
    setDraftQ("");
    setDraftA("");
  }

  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
      {items.map((item, idx) => (
        <div key={idx} style={{
          padding: `${S[2]}px ${S[3]}px`,
          background: C.surface, border: `1px solid ${C.line}`,
          borderRadius: R.sm,
        }}>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
            color: C.ink, marginBottom: S[1],
          }}>
            P: {item.q}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
            R: {item.a}
          </div>
          <button
            onClick={() => remove(idx)}
            style={{
              marginTop: S[1], fontFamily: T.mono, fontSize: 10, color: C.inkFaint,
              background: "transparent", border: "none", cursor: "pointer", padding: 0,
            }}
          >
            Eliminar
          </button>
        </div>
      ))}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
        <TextInput value={draftQ} onChange={setDraftQ} placeholder="Pregunta…" />
        <Textarea value={draftA} onChange={setDraftA} placeholder="Respuesta…" rows={2} />
        <button
          onClick={add}
          style={{
            alignSelf: "flex-start" as const,
            fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
            padding: `${S[1]}px ${S[3]}px`, borderRadius: R.sm,
            background: DOMAIN.primary, color: C.white,
            border: "none", cursor: "pointer",
          }}
        >
          + Agregar pregunta
        </button>
      </div>
    </div>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────────

function CollapsibleSection({
  label, complete, defaultOpen, children,
}: {
  label:       string;
  complete:    boolean;
  defaultOpen?: boolean;
  children:    React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div style={{
      border: `1px solid ${C.line}`, borderRadius: R.md,
      overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          justifyContent: "space-between",
          padding: `${S[2]}px ${S[3]}px`,
          background: open ? C.surfaceAlt : C.white,
          border: "none", cursor: "pointer",
          borderBottom: open ? `1px solid ${C.line}` : "none",
        }}
      >
        <SectionTitle label={label} complete={complete} />
        <span style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div style={{ padding: `${S[3]}px ${S[3]}px` }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Save button ───────────────────────────────────────────────────────────────

function SaveButton({ saving, dirty, onClick }: { saving: boolean; dirty: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
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
      {saving ? "Guardando…" : "Guardar contenido"}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProductContentPanel({ orgSlug, productId }: Props) {
  const [state,   setState]   = useState<ContentState>({ content: null, readiness: null });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [dirty,   setDirty]   = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // ── Editable form state ───────────────────────────────────────────────────────
  const [commercialTitle,  setCommercialTitle]  = useState("");
  const [subtitle,         setSubtitle]         = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [longDescription,  setLongDescription]  = useState("");
  const [keyBenefits,      setKeyBenefits]      = useState<string[]>([]);
  const [keyFeatures,      setKeyFeatures]      = useState<string[]>([]);
  const [materials,        setMaterials]        = useState("");
  const [dimensions,       setDimensions]       = useState("");
  const [weight,           setWeight]           = useState("");
  const [careInstructions, setCareInstructions] = useState("");
  const [usageInstructions,setUsageInstructions]= useState("");
  const [recommendedAge,   setRecommendedAge]   = useState("");
  const [faq,              setFaq]              = useState<FaqItem[]>([]);
  const [seoTitle,         setSeoTitle]         = useState("");
  const [seoDescription,   setSeoDescription]   = useState("");
  const [searchKeywords,   setSearchKeywords]   = useState<string[]>([]);

  const initializedRef = useRef(false);

  // ── Load ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/orgs/${orgSlug}/marketing-studio/products/${productId}/content`)
      .then(r => r.ok ? r.json() : null)
      .then((data: ContentState | null) => {
        if (cancelled) return;
        if (data) {
          setState(data);
          const c = data.content;
          if (c) {
            setCommercialTitle(c.commercialTitle  ?? "");
            setSubtitle(c.subtitle                ?? "");
            setShortDescription(c.shortDescription ?? "");
            setLongDescription(c.longDescription  ?? "");
            setKeyBenefits(c.keyBenefits);
            setKeyFeatures(c.keyFeatures);
            setMaterials(c.materials              ?? "");
            setDimensions(c.dimensions            ?? "");
            setWeight(c.weight                    ?? "");
            setCareInstructions(c.careInstructions ?? "");
            setUsageInstructions(c.usageInstructions ?? "");
            setRecommendedAge(c.recommendedAge    ?? "");
            setFaq(c.faq);
            setSeoTitle(c.seoTitle                ?? "");
            setSeoDescription(c.seoDescription   ?? "");
            setSearchKeywords(c.searchKeywords);
          }
          initializedRef.current = true;
        }
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo cargar el contenido.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [orgSlug, productId]);

  // ── Dirty detection — only after initial load ─────────────────────────────────

  const markDirty = useCallback(() => {
    if (initializedRef.current) setDirty(true);
  }, []);

  // Wrap each setter to mark dirty
  function d<T>(setter: (v: T) => void): (v: T) => void {
    return (v: T) => { setter(v); markDirty(); };
  }

  // ── Save ──────────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/products/${productId}/content`,
        {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commercialTitle:   commercialTitle  || null,
            subtitle:          subtitle         || null,
            shortDescription:  shortDescription || null,
            longDescription:   longDescription  || null,
            keyBenefits,
            keyFeatures,
            materials:         materials         || null,
            dimensions:        dimensions        || null,
            weight:            weight            || null,
            careInstructions:  careInstructions  || null,
            usageInstructions: usageInstructions || null,
            recommendedAge:    recommendedAge    || null,
            faq,
            seoTitle:          seoTitle          || null,
            seoDescription:    seoDescription    || null,
            searchKeywords,
          }),
        },
      );
      if (res.ok) {
        const data = await res.json() as ContentState;
        setState(data);
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

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
        padding: `${S[4]}px 0`,
      }}>
        Cargando contenido…
      </div>
    );
  }

  const readiness  = state.readiness;
  const tier       = readiness?.tier ?? "none";
  const score      = readiness?.score ?? 0;
  const tierLabel  = CONTENT_TIER_LABELS[tier];
  const color      = tierColor(tier);

  const basicTier      = readiness?.tiers.find(t => t.tier === "basic");
  const commercialTier = readiness?.tiers.find(t => t.tier === "commercial");
  const seoTier        = readiness?.tiers.find(t => t.tier === "seo");
  const advancedTier   = readiness?.tiers.find(t => t.tier === "advanced");

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>

      {/* Readiness strip */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          S[3],
        padding:      `${S[2]}px ${S[3]}px`,
        background:   C.surface,
        border:       `1px solid ${C.line}`,
        borderRadius: R.sm,
        boxShadow:    E.xs,
      }}>
        <div style={{
          flex: 1, height: 6, background: C.lineSubtle, borderRadius: R.pill, overflow: "hidden",
        }}>
          <div style={{
            width: `${score}%`, height: "100%",
            background: color, borderRadius: R.pill,
            transition: "width 0.3s ease",
          }} />
        </div>
        <span style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
          color, whiteSpace: "nowrap" as const,
        }}>
          {score}% · {tierLabel}
        </span>
      </div>

      {/* ── Tier 1: Basic ────────────────────────────────────────────────────── */}
      <CollapsibleSection
        label="Títulos y descripción corta"
        complete={basicTier?.complete ?? false}
        defaultOpen={true}
      >
        <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
          <div>
            <FieldLabel>Título comercial</FieldLabel>
            <TextInput
              value={commercialTitle}
              onChange={d(setCommercialTitle)}
              placeholder="Nombre de venta — más descriptivo que el nombre técnico"
            />
            <FieldHint>Aparece en el catálogo público, Shopify y WhatsApp.</FieldHint>
          </div>
          <div>
            <FieldLabel>Subtítulo</FieldLabel>
            <TextInput
              value={subtitle}
              onChange={d(setSubtitle)}
              placeholder="Complemento breve al título"
            />
          </div>
          <div>
            <FieldLabel>Descripción corta</FieldLabel>
            <Textarea
              value={shortDescription}
              onChange={d(setShortDescription)}
              placeholder="1–2 oraciones. Ideal para tarjetas de catálogo y fichas de WhatsApp."
              rows={2}
            />
            {/* AI_GENERATION_SLOT: "Generar con IA" button here */}
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Tier 2: Commercial ────────────────────────────────────────────────── */}
      <CollapsibleSection
        label="Contenido comercial completo"
        complete={commercialTier?.complete ?? false}
      >
        <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
          <div>
            <FieldLabel>Descripción larga</FieldLabel>
            <Textarea
              value={longDescription}
              onChange={d(setLongDescription)}
              placeholder="Descripción extendida para página de producto, landing y Shopify."
              rows={5}
            />
          </div>
          <div>
            <FieldLabel>Beneficios clave</FieldLabel>
            <ListEditor
              items={keyBenefits}
              onChange={d(setKeyBenefits)}
              placeholder="Agregar beneficio…"
              addLabel="+ Beneficio"
            />
            {/* AI_GENERATION_SLOT: "Generar con IA" button here */}
          </div>
          <div>
            <FieldLabel>Características principales</FieldLabel>
            <ListEditor
              items={keyFeatures}
              onChange={d(setKeyFeatures)}
              placeholder="Agregar característica…"
              addLabel="+ Característica"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Tier 3: SEO ──────────────────────────────────────────────────────── */}
      <CollapsibleSection
        label="SEO y visibilidad digital"
        complete={seoTier?.complete ?? false}
      >
        <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
          <div>
            <FieldLabel>Título SEO</FieldLabel>
            <TextInput
              value={seoTitle}
              onChange={d(setSeoTitle)}
              placeholder="Título optimizado para motores de búsqueda (máx. 60 caracteres)"
            />
          </div>
          <div>
            <FieldLabel>Descripción SEO</FieldLabel>
            <Textarea
              value={seoDescription}
              onChange={d(setSeoDescription)}
              placeholder="Meta descripción para Google (máx. 160 caracteres)"
              rows={2}
            />
          </div>
          <div>
            <FieldLabel>Palabras clave</FieldLabel>
            <ListEditor
              items={searchKeywords}
              onChange={d(setSearchKeywords)}
              placeholder="Agregar palabra clave…"
              addLabel="+ Palabra clave"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Tier 4: Advanced ─────────────────────────────────────────────────── */}
      <CollapsibleSection
        label="Especificaciones y FAQ"
        complete={advancedTier?.complete ?? false}
      >
        <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[2] }}>
            <div>
              <FieldLabel>Materiales</FieldLabel>
              <TextInput value={materials} onChange={d(setMaterials)} placeholder="Ej. Cuero, algodón" />
            </div>
            <div>
              <FieldLabel>Dimensiones</FieldLabel>
              <TextInput value={dimensions} onChange={d(setDimensions)} placeholder="Ej. 30×20×10 cm" />
            </div>
            <div>
              <FieldLabel>Peso</FieldLabel>
              <TextInput value={weight} onChange={d(setWeight)} placeholder="Ej. 500g" />
            </div>
          </div>
          <div>
            <FieldLabel>Instrucciones de cuidado</FieldLabel>
            <Textarea value={careInstructions} onChange={d(setCareInstructions)} placeholder="Lavado, almacenamiento…" rows={2} />
          </div>
          <div>
            <FieldLabel>Instrucciones de uso</FieldLabel>
            <Textarea value={usageInstructions} onChange={d(setUsageInstructions)} placeholder="Cómo usar el producto…" rows={2} />
          </div>
          <div>
            <FieldLabel>Edad recomendada</FieldLabel>
            <TextInput value={recommendedAge} onChange={d(setRecommendedAge)} placeholder="Ej. +18, 3–8 años" />
          </div>
          <div>
            <FieldLabel>Preguntas frecuentes (FAQ)</FieldLabel>
            <FaqEditor items={faq} onChange={d(setFaq)} />
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Actions ────────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
        <SaveButton saving={saving} dirty={dirty} onClick={() => void handleSave()} />
        {saved && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green }}>
            ✓ Guardado
          </span>
        )}
        {error && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red }}>
            {error}
          </span>
        )}
      </div>

    </div>
  );
}
