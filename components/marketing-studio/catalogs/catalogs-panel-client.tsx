/**
 * components/marketing-studio/catalogs/catalogs-panel-client.tsx
 *
 * MARKETING-STUDIO-CATALOGS-POLISH-04
 *
 * Main panel for Catálogos. Two clear commercial paths:
 *   1. Catálogo rápido      — options + one click. Always actionable.
 *   2. Catálogo personalizado — 6 type cards, each opens the wizard.
 *
 * Design rules:
 *   - No CatalogSpec, readiness levels, metadata, or builder terms visible.
 *   - All tokens from C.*, T.*, S[n], R.*, E.*, MS_PALETTE, MS_SHADOWS.
 *   - T.mono for ALL operational text.
 *   - "Link vivo" is never used — always "Catálogo web".
 */

"use client";

import { useState }                          from "react";
import { C, T, S, R, E }                   from "@/lib/ui/tokens";
import { MS_PALETTE, MS_SHADOWS }           from "@/lib/marketing-studio/ms-design-system";
import { ReadinessLevel }                   from "@/lib/marketing-studio/products/domain/product-enums";
import type { ProductConsoleItem }          from "@/lib/marketing-studio/products/product-display";
import type { CatalogDefinitionRecord }     from "@/lib/marketing-studio/catalogs/catalog-definition-types";
import {
  CATALOG_TYPE_CONFIGS,
  type CatalogType,
}                                           from "@/lib/marketing-studio/catalogs/catalog-v2-types";
import { CatalogWizardClient }              from "./catalog-wizard-client";

// ── "Ideal para..." — commercial context per type ─────────────────────────────

const IDEAL_FOR: Record<string, string> = {
  retail:       "Ideal para clientes finales.",
  wholesale:    "Ideal para distribuidores y compras por volumen.",
  no_price:     "Ideal para compartir referencias sin valores comerciales.",
  launch:       "Ideal para presentar nuevas colecciones o campañas.",
  custom:       "Configuración avanzada con filtros y reglas específicas.",
  by_category:  "Ideal para concentrar un catálogo en una línea específica.",
};

// ── Mini layout preview per type ─────────────────────────────────────────────

function TypeCardPreview({ typeId }: { typeId: string }) {
  const box = {
    borderRadius: 2,
    background:   C.surface,
    border:       `1px solid ${C.line}`,
  } as const;

  if (typeId === "retail") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, height: 44, marginBottom: S[2] }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ ...box, position: "relative" as const }}>
            <span style={{ position: "absolute" as const, bottom: 2, right: 3,
              fontSize: 7, color: C.green, fontFamily: T.mono, fontWeight: T.wt.bold }}>$</span>
          </div>
        ))}
      </div>
    );
  }

  if (typeId === "wholesale") {
    return (
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 3, height: 44, marginBottom: S[2] }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ display: "flex", gap: 3, flex: 1 }}>
            <div style={{ ...box, width: 20, flexShrink: 0 }} />
            <div style={{ ...box, flex: 1 }} />
            <div style={{ ...box, width: 16, flexShrink: 0 }} />
          </div>
        ))}
      </div>
    );
  }

  if (typeId === "no_price") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, height: 44, marginBottom: S[2] }}>
        {[0, 1, 2, 3].map(i => <div key={i} style={box} />)}
      </div>
    );
  }

  if (typeId === "launch") {
    return (
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 3, height: 44, marginBottom: S[2] }}>
        <div style={{ ...box, flex: 2, background: C.blueLight, border: `1px solid ${C.blueDark}30` }} />
        <div style={{ display: "flex", gap: 3, flex: 1 }}>
          <div style={{ ...box, flex: 1 }} />
          <div style={{ ...box, flex: 1 }} />
        </div>
      </div>
    );
  }

  if (typeId === "custom") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3, height: 44, marginBottom: S[2] }}>
        {[0, 1, 2, 3, 4, 5].map(i => <div key={i} style={box} />)}
      </div>
    );
  }

  if (typeId === "by_category") {
    return (
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 3, height: 44, marginBottom: S[2] }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ display: "flex", gap: 3, flex: 1, alignItems: "center" }}>
            <div style={{ ...box, width: 12, height: 10, background: C.blueLight, flexShrink: 0 }} />
            <div style={{ ...box, flex: 1 }} />
          </div>
        ))}
      </div>
    );
  }

  return <div style={{ height: 44, marginBottom: S[2] }} />;
}

// ── Quick catalog option card ─────────────────────────────────────────────────

function OptionCard({
  selected, onClick, emoji, title, sublabel,
}: {
  selected:  boolean;
  onClick:   () => void;
  emoji:     string;
  title:     string;
  sublabel:  string;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        position: "relative" as const, cursor: "pointer",
        flex: "1 1 0", minWidth: 0,
        padding: `${S[3]}px ${S[2]}px`,
        background:   selected ? C.white : C.surface,
        border:       `${selected ? 2 : 1}px solid ${selected ? C.green : C.line}`,
        borderRadius: R.md,
        boxShadow:    selected ? MS_SHADOWS.cardHover(C.green) : "none",
        transition:   "all 0.15s ease",
      }}
    >
      {selected && (
        <span style={{
          position: "absolute" as const, top: S[1], right: S[1],
          width: 16, height: 16, borderRadius: R.pill,
          background: C.green, color: C.white,
          fontSize: 9, fontFamily: T.mono, fontWeight: T.wt.bold,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>✓</span>
      )}
      <div style={{ fontSize: 20, marginBottom: S[1] }}>{emoji}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
        color: C.ink, marginBottom: 2 }}>
        {title}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
        {sublabel}
      </div>
    </div>
  );
}

// ── Saved catalog card ────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  active:   C.green,
  draft:    C.amber,
  archived: C.inkFaint,
};

const STATUS_BADGE_LABEL: Record<string, string> = {
  active:   "EN VIVO",
  draft:    "BORRADOR",
  archived: "ARCHIVADO",
};

const TEMPLATE_BG: Record<string, string> = {
  wholesale:     MS_PALETTE.product.iconBg,
  retail:        MS_PALETTE.social.iconBg,
  institutional: MS_PALETTE.design.iconBg,
  campaign:      MS_PALETTE.video.iconBg,
};

function SavedCatalogCard({ cat, orgSlug }: { cat: CatalogDefinitionRecord; orgSlug: string }) {
  const dotColor   = STATUS_DOT[cat.status]   ?? C.inkFaint;
  const badgeLabel = STATUS_BADGE_LABEL[cat.status] ?? cat.status;
  const cardBg     = TEMPLATE_BG[cat.templateKey]   ?? C.surface;
  const updatedAt  = new Date(cat.updatedAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" });

  return (
    <a
      href={`/${orgSlug}/agentik/marketing-studio/catalogos/${cat.id}`}
      style={{
        display: "block", textDecoration: "none", flexShrink: 0,
        width: 180, borderRadius: R.md,
        border: `1px solid ${C.line}`,
        background: C.white, overflow: "hidden",
        boxShadow: E.xs,
      }}
    >
      <div style={{
        height: 90, background: cardBg,
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative" as const,
      }}>
        <span style={{ fontSize: 32 }}>
          {cat.templateKey === "wholesale" ? "📦" :
           cat.templateKey === "retail"    ? "🛍" :
           cat.templateKey === "campaign"  ? "🚀" : "🖼"}
        </span>
        <span style={{
          position: "absolute" as const, top: S[1], left: S[1],
          fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
          padding: "2px 6px", borderRadius: R.pill,
          background: dotColor + "22", color: dotColor,
          border: `1px solid ${dotColor}44`,
          textTransform: "uppercase" as const, letterSpacing: "0.06em",
        }}>
          {badgeLabel}
        </span>
      </div>
      <div style={{ padding: `${S[2]}px ${S[2]}px ${S[2]}px` }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink,
          whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
          {cat.name}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
          {cat.pricingMode === "with_prices" ? "Con precios" : "Sin precios"} · {updatedAt}
        </div>
      </div>
    </a>
  );
}

// ── By-category special type card ─────────────────────────────────────────────

interface SpecialTypeCard {
  id:          string;
  emoji:       string;
  label:       string;
  description: string;
  idealFor:    string;
  example:     string;
}

const BY_CATEGORY_CARD: SpecialTypeCard = {
  id:          "by_category",
  emoji:       "📂",
  label:       "Por categorías",
  description: "Crea un catálogo usando una o varias categorías de productos.",
  idealFor:    "Ideal para concentrar un catálogo en una línea específica.",
  example:     "\"Solo juguetes\" · \"Solo bebé\" · \"Solo niña\"",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface CatalogsPanelClientProps {
  products:      ProductConsoleItem[];
  savedCatalogs: CatalogDefinitionRecord[];
  orgSlug:       string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CatalogsPanelClient({ products, savedCatalogs, orgSlug }: CatalogsPanelClientProps) {

  // ── Quick catalog state ────────────────────────────────────────────────────
  const [quickShowPrices, setQuickShowPrices] = useState(true);
  const [quickDest,       setQuickDest]       = useState<"link" | "pdf">("link");
  const [quickCreated,    setQuickCreated]    = useState(false);
  const [quickFeedback,   setQuickFeedback]   = useState<string | null>(null);

  // ── Wizard state ───────────────────────────────────────────────────────────
  const [wizardOpen,        setWizardOpen]        = useState(false);
  const [wizardType,        setWizardType]        = useState<CatalogType | null>(null);
  const [wizardTemplateId,  setWizardTemplateId]  = useState<string | null>(null);
  const [wizardInitialStep, setWizardInitialStep] = useState<1|2|3|4|5>(1);
  const [wizardKey,         setWizardKey]         = useState(0);

  // ── Derived ────────────────────────────────────────────────────────────────
  const readyProducts      = products.filter(p => p.readinessLevel === ReadinessLevel.READY);
  const incompleteProducts = products.filter(p => p.readinessLevel !== ReadinessLevel.READY);
  const primaryTypes       = CATALOG_TYPE_CONFIGS.filter(c => c.primary);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openWizard(
    type?:       CatalogType,
    templateId?: string,
    step?:       1|2|3|4|5,
  ) {
    setWizardType(type ?? null);
    setWizardTemplateId(templateId ?? null);
    setWizardInitialStep(step ?? (type && templateId ? 3 : type ? 2 : 1));
    setWizardKey(k => k + 1);
    setWizardOpen(true);
    setTimeout(() => {
      document.getElementById("catalogs-wizard-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function closeWizard() {
    setWizardOpen(false);
    setWizardType(null);
    setWizardTemplateId(null);
  }

  // FASE 2 — always actionable: validate products first, then proceed or explain
  function handleQuickCreate() {
    setQuickFeedback(null);
    if (readyProducts.length === 0) {
      const msg = products.length === 0
        ? "Aún no tienes productos. Agrega y aprueba referencias en Foto Estudio primero."
        : `Tienes ${incompleteProducts.length} referencia${incompleteProducts.length !== 1 ? "s" : ""} pero ninguna está lista. Completa imágenes o información comercial para incluirlas.`;
      setQuickFeedback(msg);
      return;
    }
    setQuickCreated(true);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[6] }}>

      {/* ── 1. Alert strip — incomplete products ── */}
      {incompleteProducts.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: `${S[3]}px ${S[4]}px`,
          background: C.amber + "12", border: `1px solid ${C.amber}40`,
          borderRadius: R.md, gap: S[3],
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
            <span style={{ color: C.amber, fontSize: 14, flexShrink: 0 }}>⚠</span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
              Tienes <strong>{incompleteProducts.length}</strong>{" "}
              referencia{incompleteProducts.length !== 1 ? "s" : ""} que{" "}
              {incompleteProducts.length !== 1 ? "necesitan completar" : "necesita completar"}{" "}
              información para aparecer en catálogos.
            </span>
          </div>
          <a
            href={`/${orgSlug}/agentik/marketing-studio/biblioteca`}
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
              color: C.amber, textDecoration: "none",
              whiteSpace: "nowrap" as const, flexShrink: 0,
            }}
          >
            Ver y corregir →
          </a>
        </div>
      )}

      {/* ── 2. Catálogo rápido ── */}
      {quickCreated ? (
        /* Success state */
        <div style={{
          padding: `${S[5]}px`,
          background: C.white,
          border: `2px solid ${C.green}60`,
          borderRadius: R.lg,
          boxShadow: MS_SHADOWS.cardHover(C.green),
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[2] }}>
            <span style={{ fontSize: 18, color: C.green }}>✓</span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
              Catálogo listo
            </span>
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[3] }}>
            {quickShowPrices ? "Con precios" : "Sin precios"} ·{" "}
            {quickDest === "link" ? "Catálogo web" : "PDF"} ·{" "}
            {readyProducts.length} referencia{readyProducts.length !== 1 ? "s" : ""} incluidas
          </div>
          <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const }}>
            <button
              onClick={() => openWizard(quickShowPrices ? "retail" : "no_price")}
              style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                padding: `${S[2]}px ${S[3]}px`, borderRadius: R.md,
                background: C.blueDark, color: C.white,
                border: "none", cursor: "pointer",
              }}
            >
              Personalizar más →
            </button>
            <button
              onClick={() => { setQuickCreated(false); setQuickFeedback(null); }}
              style={{
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
                padding: `${S[2]}px ${S[3]}px`, borderRadius: R.md,
                background: "none", border: `1px solid ${C.line}`, cursor: "pointer",
              }}
            >
              Crear otro
            </button>
          </div>
        </div>
      ) : (
        /* Quick catalog block */
        <div style={{
          background:   MS_PALETTE.product.heroGradient,
          border:       `1px solid ${MS_PALETTE.product.primary}30`,
          borderRadius: R.lg,
          padding:      `${S[5]}px`,
          boxShadow:    MS_SHADOWS.card,
        }}>
          {/* Title row */}
          <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.bold, color: C.ink }}>
              ⚡ Catálogo rápido (15 segundos)
            </span>
            <span style={{
              fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
              padding: "2px 8px", borderRadius: R.pill,
              background: C.green + "22", color: C.green,
              border: `1px solid ${C.green}44`,
              textTransform: "uppercase" as const, letterSpacing: "0.08em",
            }}>
              Recomendado
            </span>
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[4] }}>
            Genera un catálogo completo con todas tus referencias en segundos.
          </div>

          {/* Options + CTA */}
          <div style={{ display: "flex", gap: S[5], alignItems: "flex-start" }}>

            {/* Left: option groups */}
            <div style={{ flex: 1, display: "flex", gap: S[5] }}>

              {/* Pricing */}
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                  color: C.inkLight, marginBottom: S[2], textTransform: "uppercase" as const,
                  letterSpacing: "0.06em" }}>
                  ¿Con o sin precios?
                </div>
                <div style={{ display: "flex", gap: S[2] }}>
                  <OptionCard
                    selected={quickShowPrices}
                    onClick={() => setQuickShowPrices(true)}
                    emoji="🏷"
                    title="Con precios"
                    sublabel="Incluye precios de venta"
                  />
                  <OptionCard
                    selected={!quickShowPrices}
                    onClick={() => setQuickShowPrices(false)}
                    emoji="🖼"
                    title="Sin precios"
                    sublabel="Solo referencias e imágenes"
                  />
                </div>
              </div>

              {/* Destination — FASE 1: "Catálogo web" replaces "Link vivo" */}
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                  color: C.inkLight, marginBottom: S[2], textTransform: "uppercase" as const,
                  letterSpacing: "0.06em" }}>
                  ¿Cómo lo vas a compartir?
                </div>
                <div style={{ display: "flex", gap: S[2] }}>
                  <OptionCard
                    selected={quickDest === "link"}
                    onClick={() => setQuickDest("link")}
                    emoji="🌐"
                    title="Catálogo web"
                    sublabel="Se actualiza automáticamente"
                  />
                  <OptionCard
                    selected={quickDest === "pdf"}
                    onClick={() => setQuickDest("pdf")}
                    emoji="📄"
                    title="PDF"
                    sublabel="Archivo descargable"
                  />
                </div>
              </div>
            </div>

            {/* Right: CTA — FASE 2: always clickable */}
            <div style={{
              flexShrink: 0, width: 200,
              display: "flex", flexDirection: "column" as const,
              alignItems: "stretch", gap: S[2], paddingTop: 22,
            }}>
              <button
                onClick={handleQuickCreate}
                style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
                  padding: `${S[3]}px ${S[4]}px`,
                  borderRadius: R.md, border: "none", cursor: "pointer",
                  background: C.blueDark, color: C.white,
                  boxShadow: E.sm, transition: "all 0.15s ease",
                }}
              >
                ⚡ Crear catálogo rápido
              </button>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                textAlign: "center" as const }}>
                Se generará al instante con la plantilla recomendada.
              </div>
            </div>
          </div>

          {/* FASE 2: inline feedback when no products available */}
          {quickFeedback && (
            <div style={{
              marginTop: S[3], padding: `${S[2]}px ${S[3]}px`,
              background: C.amber + "14", border: `1px solid ${C.amber}40`,
              borderRadius: R.md, display: "flex", alignItems: "flex-start", gap: S[2],
            }}>
              <span style={{ color: C.amber, flexShrink: 0 }}>⚠</span>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, marginBottom: 4 }}>
                  {quickFeedback}
                </div>
                <a
                  href={`/${orgSlug}/agentik/marketing-studio/foto-estudio/new`}
                  style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                    color: C.blueDark, textDecoration: "none",
                  }}
                >
                  Ir a Foto Estudio →
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 3. Catálogo personalizado — FASE 3, 4, 5 ── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
          <span style={{ fontSize: 16 }}>⚙</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
            Catálogo personalizado
          </span>
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[4] }}>
          Configura un catálogo según un objetivo comercial concreto.
          Usa plantillas, categorías y configuración avanzada.
        </div>

        {/* Type cards grid — 3 columns × 2 rows for 6 cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[3] }}>

          {/* Primary types from config */}
          {primaryTypes.map(type => (
            <div
              key={type.id}
              onClick={() => openWizard(type.id as CatalogType)}
              style={{
                background: C.white, border: `1px solid ${C.line}`, borderRadius: R.md,
                padding: `${S[3]}px ${S[3]}px ${S[3]}px`,
                cursor: "pointer", display: "flex", flexDirection: "column" as const,
                boxShadow: E.xs, transition: "box-shadow 0.15s ease, border-color 0.15s ease",
              }}
            >
              {/* FASE 5 — Mini layout preview */}
              <TypeCardPreview typeId={type.id} />

              <div style={{ fontSize: 22, marginBottom: S[1] }}>{type.emoji}</div>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                color: C.blueDark, marginBottom: 3,
              }}>
                {type.label}
              </div>

              {/* FASE 3 — "Ideal para..." */}
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.green,
                fontWeight: T.wt.semibold, marginBottom: S[1] }}>
                {IDEAL_FOR[type.id] ?? ""}
              </div>

              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                flex: 1, marginBottom: S[1] }}>
                {type.description}
              </div>

              {type.example && (
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost,
                  fontStyle: "italic", marginBottom: S[2] }}>
                  {type.example}
                </div>
              )}

              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                color: C.blueDark, marginTop: "auto" }}>
                Configurar →
              </div>
            </div>
          ))}

          {/* FASE 4 — "Por categorías" special card */}
          <div
            onClick={() => openWizard("custom", "clasico", 3)}
            style={{
              background: C.white, border: `1px solid ${C.line}`, borderRadius: R.md,
              padding: `${S[3]}px ${S[3]}px ${S[3]}px`,
              cursor: "pointer", display: "flex", flexDirection: "column" as const,
              boxShadow: E.xs, transition: "box-shadow 0.15s ease, border-color 0.15s ease",
            }}
          >
            <TypeCardPreview typeId="by_category" />

            <div style={{ fontSize: 22, marginBottom: S[1] }}>{BY_CATEGORY_CARD.emoji}</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
              color: C.blueDark, marginBottom: 3 }}>
              {BY_CATEGORY_CARD.label}
            </div>

            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.green,
              fontWeight: T.wt.semibold, marginBottom: S[1] }}>
              {BY_CATEGORY_CARD.idealFor}
            </div>

            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
              flex: 1, marginBottom: S[1] }}>
              {BY_CATEGORY_CARD.description}
            </div>

            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost,
              fontStyle: "italic", marginBottom: S[2] }}>
              {BY_CATEGORY_CARD.example}
            </div>

            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
              color: C.blueDark, marginTop: "auto" }}>
              Seleccionar categorías →
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. Info band — Catálogo web (FASE 1 + FASE 7) ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: `${S[3]}px ${S[4]}px`,
        background: C.blueDark + "0c", border: `1px solid ${C.blueDark}25`,
        borderRadius: R.md, gap: S[3],
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span style={{ color: C.blueDark, fontSize: 14, flexShrink: 0 }}>ⓘ</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
            Los Catálogos web se actualizan automáticamente cuando hay cambios en tus referencias.
            No necesitas regenerarlos.
          </span>
        </div>
        <a
          href={`/${orgSlug}/agentik/marketing-studio`}
          style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
            color: C.blueDark, textDecoration: "none",
            whiteSpace: "nowrap" as const, flexShrink: 0,
          }}
        >
          Conoce cómo funciona →
        </a>
      </div>

      {/* ── 5. Catálogos guardados ── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[3] }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
              Catálogos guardados
            </span>
            {savedCatalogs.length > 0 && (
              <span style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
                padding: "1px 7px", borderRadius: R.pill,
                background: C.surface, color: C.inkFaint,
                border: `1px solid ${C.line}`,
              }}>
                {savedCatalogs.length}
              </span>
            )}
          </div>
          {savedCatalogs.length > 0 && (
            <a
              href={`/${orgSlug}/agentik/marketing-studio/catalogos`}
              style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, textDecoration: "none" }}
            >
              Ver todos →
            </a>
          )}
        </div>

        {savedCatalogs.length === 0 ? (
          <div style={{
            padding: `${S[5]}px ${S[4]}px`,
            background: C.surface, border: `1px solid ${C.line}`,
            borderRadius: R.md, textAlign: "center" as const,
          }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              Aún no hay catálogos guardados. Crea el primero con alguna de las opciones de arriba.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: S[3], overflowX: "auto" as const, paddingBottom: S[1] }}>
            {savedCatalogs.map(cat => (
              <SavedCatalogCard key={cat.id} cat={cat} orgSlug={orgSlug} />
            ))}
          </div>
        )}
      </div>

      {/* ── 6. Wizard — opens inline when triggered ── */}
      {wizardOpen && (
        <div
          id="catalogs-wizard-section"
          style={{
            border: `1px solid ${C.line}`, borderRadius: R.lg,
            padding: `${S[5]}px`, background: C.white, boxShadow: E.sm,
          }}
        >
          <CatalogWizardClient
            key={wizardKey}
            products={products}
            orgSlug={orgSlug}
            initialType={wizardType}
            initialTemplateId={wizardTemplateId}
            initialStep={wizardInitialStep}
            onClose={closeWizard}
          />
        </div>
      )}

    </div>
  );
}
