/**
 * components/marketing-studio/catalogs/catalog-builder-client.tsx
 *
 * MS-08 — Catalog Builder Client Workspace
 *
 * Interactive catalog construction over ProductConsoleItem[].
 * State: purpose, category filter, minimum readiness, require-asset toggle.
 * Computes filter → readiness → channel context on every state change.
 *
 * Architecture:
 *   page.tsx (server) → CatalogBuilderClient (client)
 *     → filterProductsForCatalog (catalog-query-engine)
 *     → computeCatalogReadiness  (catalog-readiness)
 *     → buildCatalogDisplayItem  (catalog-display)
 *     → CatalogProductCard       (per-product display)
 */

"use client";

import { useState, useMemo } from "react";
import { C, T, S, R, E }    from "@/lib/ui/tokens";
import type { ProductConsoleItem } from "@/lib/marketing-studio/products/product-display";
import type { CatalogDisplayItem } from "@/lib/marketing-studio/catalogs/catalog-display";
import type { CatalogRecommendation } from "@/lib/marketing-studio/catalogs/catalog-recommendations";
import type { CatalogPurpose, CatalogChannel, CatalogRule } from "@/lib/marketing-studio/catalogs/catalog-types";
import {
  CatalogPurpose as CP,
  CATALOG_PURPOSE_LABEL,
  CATALOG_CHANNEL_LABEL,
  PURPOSE_DEFAULT_CHANNEL,
  PURPOSE_DEFAULT_RULES,
  CatalogReadinessLevel,
} from "@/lib/marketing-studio/catalogs/catalog-types";
import { filterProductsForCatalog, rankCatalogProducts } from "@/lib/marketing-studio/catalogs/catalog-query-engine";
import { computeCatalogReadiness }                        from "@/lib/marketing-studio/catalogs/catalog-readiness";
import { CatalogProductCard }                             from "./catalog-product-card";

// ── Preset purpose order (matches page.tsx: whatsapp, shopify, campaign) ──────

const PRESET_PURPOSES: CatalogPurpose[] = [
  CP.WHATSAPP_SALES,
  CP.SHOPIFY_COLLECTION,
  CP.SEASONAL_CAMPAIGN,
];

// ── Purpose chips ──────────────────────────────────────────────────────────────

const PURPOSE_CHIPS: { id: CatalogPurpose; emoji: string }[] = [
  { id: CP.WHATSAPP_SALES,     emoji: "💬" },
  { id: CP.SHOPIFY_COLLECTION, emoji: "🛍" },
  { id: CP.SEASONAL_CAMPAIGN,  emoji: "📢" },
  { id: CP.WHOLESALE,          emoji: "📦" },
  { id: CP.RETAIL,             emoji: "🏪" },
  { id: CP.ADS,                emoji: "📊" },
  { id: CP.CRM_SEGMENT,        emoji: "👤" },
];

// ── Readiness visual ──────────────────────────────────────────────────────────

const READINESS_COLOR: Record<string, string> = {
  ready:   C.green,
  partial: C.amber,
  blocked: C.red,
  empty:   C.inkFaint,
};

function ReadinessStrip({ readiness, channel }: {
  readiness: CatalogDisplayItem["readiness"];
  channel:   CatalogChannel;
}) {
  const color     = READINESS_COLOR[readiness.level] ?? C.inkFaint;
  const levelLabel = readiness.level === "ready" ? "Listo" : readiness.level === "partial" ? "Parcial" : readiness.level === "blocked" ? "Bloqueado" : "Vacío";

  return (
    <div style={{
      display:      "grid",
      gridTemplateColumns: "1fr 1fr 1fr 1fr",
      gap:          S[3],
      padding:      `${S[3]}px ${S[4]}px`,
      background:   C.surface,
      borderRadius: R.md,
      border:       `1px solid ${C.line}`,
      marginBottom: S[4],
    }}>
      <div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color, lineHeight: 1 }}>
          {readiness.score}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 2 }}>
          Preparación · {levelLabel}
        </div>
      </div>
      <div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.green, lineHeight: 1 }}>
          {readiness.includedCount}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 2 }}>Incluidos</div>
      </div>
      <div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.amber, lineHeight: 1 }}>
          {readiness.partialCount}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 2 }}>Parciales</div>
      </div>
      <div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.red, lineHeight: 1 }}>
          {readiness.blockedCount}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 2 }}>No incluidos</div>
      </div>
    </div>
  );
}

// ── Channel context blocks ────────────────────────────────────────────────────

function WhatsAppContextBlock({ ctx }: { ctx: NonNullable<CatalogDisplayItem["whatsappContext"]> }) {
  return (
    <div style={{
      padding:      `${S[3]}px ${S[4]}px`,
      background:   C.greenLight, border: `1px solid ${C.greenBorder}`,
      borderRadius: R.md, marginBottom: S[4],
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.greenDark, marginBottom: S[2] }}>
        Vista previa de mensaje WhatsApp
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid, marginBottom: S[2],
        padding: `${S[2]}px ${S[3]}px`, background: C.white, borderRadius: R.sm,
        border: `1px solid ${C.greenBorder}`, fontStyle: "italic" as const }}>
        "{ctx.suggestedIntroText}"
      </div>
      <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const }}>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: C.green }}>
          ✓ {ctx.productCount} productos incluidos
        </span>
        {ctx.blockedCount > 0 && (
          <span style={{ fontFamily: T.mono, fontSize: 9, color: C.red }}>
            ✕ {ctx.blockedCount} excluidos
          </span>
        )}
        {ctx.missingAvailability > 0 && (
          <span style={{ fontFamily: T.mono, fontSize: 9, color: C.amber }}>
            ◆ {ctx.missingAvailability} sin disponibilidad
          </span>
        )}
      </div>
    </div>
  );
}

function ShopifyContextBlock({ ctx }: { ctx: NonNullable<CatalogDisplayItem["shopifyContext"]> }) {
  return (
    <div style={{
      padding:      `${S[3]}px ${S[4]}px`,
      background:   C.blueLight, border: `1px solid ${C.blueBorder}`,
      borderRadius: R.md, marginBottom: S[4],
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.blueDark, marginBottom: S[2] }}>
        Colección Shopify — "{ctx.collectionTitle}"
      </div>
      <div style={{ display: "flex", gap: S[4], flexWrap: "wrap" as const }}>
        {[
          { label: "En colección",      value: ctx.productCount,       color: C.blueDark },
          { label: "Sin publicar",      value: ctx.pendingPublication, color: ctx.pendingPublication > 0 ? C.amber : C.green },
          { label: "Sin precio",        value: ctx.missingPrice,       color: ctx.missingPrice > 0 ? C.red : C.green },
          { label: "Sin imagen",        value: ctx.missingAssets,      color: ctx.missingAssets > 0 ? C.red : C.green },
          { label: "Sincronización pendiente", value: ctx.missingSync, color: ctx.missingSync > 0 ? C.amber : C.green },
        ].map(item => (
          <div key={item.label}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: item.color, lineHeight: 1 }}>
              {item.value}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, marginTop: 1 }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Recommendation card ───────────────────────────────────────────────────────

function RecommendationCard({
  rec,
  onApply,
}: {
  rec:     CatalogRecommendation;
  onApply: (purpose: CatalogPurpose, filterHint?: string) => void;
}) {
  const urgencyColor = rec.urgency === "high" ? C.red : rec.urgency === "medium" ? C.amber : C.inkLight;
  const urgencyBg    = rec.urgency === "high" ? C.redLight : rec.urgency === "medium" ? C.amberLight : C.surface;
  const urgencyBdr   = rec.urgency === "high" ? C.redBorder : rec.urgency === "medium" ? C.amberBorder : C.line;

  return (
    <div style={{
      background: urgencyBg, border: `1px solid ${urgencyBdr}`,
      borderRadius: R.md, padding: `${S[3]}px ${S[4]}px`,
      display: "flex", alignItems: "flex-start", gap: S[3],
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
          color: urgencyColor, marginBottom: 3 }}>
          {rec.title}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid, marginBottom: S[2] }}>
          {rec.detail}
        </div>
        <div style={{ display: "flex", gap: S[3], alignItems: "center" }}>
          <span style={{ fontFamily: T.mono, fontSize: 8, color: urgencyColor }}>
            {rec.readyCount} / {rec.candidateCount} listos
          </span>
          <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkGhost }}>
            {rec.candidateCount} productos candidatos
          </span>
        </div>
      </div>
      <button
        onClick={() => onApply(rec.purpose, rec.filterHint)}
        style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          padding: `${S[1]}px ${S[3]}px`, borderRadius: R.md,
          background: urgencyColor, color: C.white, border: "none",
          cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" as const,
        }}
      >
        Construir →
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface CatalogBuilderClientProps {
  products:        ProductConsoleItem[];
  presets:         CatalogDisplayItem[];      // server-computed preset catalogs
  recommendations: CatalogRecommendation[];
  orgSlug:         string;
}

export function CatalogBuilderClient({
  products,
  presets,
  recommendations,
  orgSlug,
}: CatalogBuilderClientProps) {
  const [activePurpose,  setActivePurpose]  = useState<CatalogPurpose>(CP.WHATSAPP_SALES);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [minReadiness,   setMinReadiness]   = useState<"any" | "partial" | "ready">("any");
  const [requireAsset,   setRequireAsset]   = useState(false);
  const [showExcluded,   setShowExcluded]   = useState(false);

  const channel = PURPOSE_DEFAULT_CHANNEL[activePurpose];

  // ── Build rules from UI state ──────────────────────────────────────────────
  const rules = useMemo((): CatalogRule[] => {
    const base: CatalogRule[] = [...PURPOSE_DEFAULT_RULES[activePurpose]];

    if (categoryFilter.trim()) {
      base.push({ field: "category", operator: "contains", value: categoryFilter.trim() });
    }
    if (minReadiness === "ready") {
      base.push({ field: "readiness_score", operator: "gte", value: 70 });
    } else if (minReadiness === "partial") {
      base.push({ field: "readiness_score", operator: "gte", value: 30 });
    }
    if (requireAsset) {
      base.push({ field: "has_primary_asset", operator: "eq", value: true });
    }

    return base;
  }, [activePurpose, categoryFilter, minReadiness, requireAsset]);

  // ── Run filter + readiness ─────────────────────────────────────────────────
  const { filterResult, readiness, displayItem } = useMemo(() => {
    const result       = filterProductsForCatalog(products, rules);
    const ranked       = rankCatalogProducts(result.included);
    const rd           = computeCatalogReadiness(ranked, result.partial, result.excluded, channel);

    // Build lightweight display for context blocks
    const whatsappCtx = channel === "whatsapp"
      ? {
          suggestedName:       CATALOG_PURPOSE_LABEL[activePurpose],
          productCount:        ranked.length,
          blockedCount:        result.excluded.length,
          missingAvailability: ranked.filter(p => p.milaSignals.some(s => s.key === "missing_availability")).length,
          suggestedIntroText:  ranked.length > 0
            ? `Hola 👋 Te comparto nuestro catálogo con ${ranked.length} producto${ranked.length > 1 ? "s" : ""} disponible${ranked.length > 1 ? "s" : ""}. ¡Escríbeme para más info!`
            : "Catálogo en preparación.",
        }
      : undefined;

    const shopifyCtx = channel === "shopify"
      ? {
          collectionTitle:    CATALOG_PURPOSE_LABEL[activePurpose],
          productCount:       ranked.length,
          missingSync:        ranked.filter(p => p.syncSummary.some(s => s.channel === "shopify" && s.status !== "synced")).length,
          missingPrice:       ranked.filter(p => p.milaSignals.some(s => s.key === "missing_commercial_data")).length,
          missingAssets:      ranked.filter(p => !p.primaryAssetUrl).length,
          pendingPublication: ranked.filter(p => p.publicationSummary.find(pub => pub.channel === "shopify")?.publicationStatus !== "published").length,
        }
      : undefined;

    return {
      filterResult: { ...result, included: ranked },
      readiness:    rd,
      displayItem:  { whatsappContext: whatsappCtx, shopifyContext: shopifyCtx },
    };
  }, [products, rules, channel, activePurpose]);

  function applyRecommendation(purpose: CatalogPurpose, filterHint?: string) {
    setActivePurpose(purpose);
    if (filterHint) setCategoryFilter(filterHint);
    setMinReadiness("any");
    setRequireAsset(false);
  }

  return (
    <>
      {/* ── Preset catalog cards (interactive) ── */}
      {presets.length > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: S[3], marginBottom: S[5],
        }}>
          {presets.map((p, i) => {
            const purpose  = PRESET_PURPOSES[i];
            const isActive = activePurpose === purpose;
            const rd       = p.readiness;
            const dotColor =
              rd.level === "ready"   ? C.green   :
              rd.level === "partial" ? C.amber   :
              rd.level === "blocked" ? C.red     : C.inkFaint;
            const sub = [
              rd.partialCount > 0 ? `+${rd.partialCount} con información parcial` : "",
              rd.blockedCount > 0 ? `${rd.blockedCount} no incluidos`              : "",
            ].filter(Boolean).join(" · ");
            return (
              <button
                key={i}
                onClick={() => setActivePurpose(purpose)}
                style={{
                  fontFamily:    T.mono,
                  textAlign:     "left" as const,
                  cursor:        "pointer",
                  padding:       `${S[3]}px ${S[4]}px`,
                  background:    isActive ? C.blueLight : C.surface,
                  border:        `1px solid ${isActive ? C.blueBorder : C.line}`,
                  borderRadius:  R.md,
                  boxShadow:     isActive ? E.sm : "none",
                  transition:    "all .12s",
                }}
              >
                <div style={{ fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                  color: isActive ? C.blueDark : C.inkMid, marginBottom: 2 }}>
                  {p.purposeLabel}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: S[1], marginBottom: 2 }}>
                  <span style={{ fontSize: T.sz.xl, fontWeight: T.wt.bold, color: dotColor, lineHeight: 1 }}>
                    {rd.includedCount}
                  </span>
                  <span style={{ fontSize: 9, color: C.inkFaint }}>listos</span>
                </div>
                {sub && (
                  <div style={{ fontSize: 9, color: C.inkFaint }}>{sub}</div>
                )}
                {isActive && (
                  <div style={{ marginTop: S[1], fontSize: 8, color: C.blueDark, fontWeight: T.wt.semibold }}>
                    ✓ Seleccionado
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Recommendations ── */}
      {recommendations.length > 0 && (
        <div style={{ marginBottom: S[5] }}>
          <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
            color: C.inkFaint, textTransform: "uppercase" as const,
            letterSpacing: "0.06em", marginBottom: S[2] }}>
            Recomendaciones de catálogo
          </div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
            {recommendations.slice(0, 4).map(rec => (
              <RecommendationCard key={rec.id} rec={rec} onApply={applyRecommendation} />
            ))}
          </div>
        </div>
      )}

      {/* ── Builder workspace ── */}
      <div style={{
        background: C.white, border: `1px solid ${C.line}`,
        borderRadius: R.md, padding: S[4], boxShadow: E.sm,
      }}>
        {/* Section label */}
        <div style={{ marginBottom: S[4] }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
            color: C.ink, marginBottom: 2 }}>
            Arma tu catálogo
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            ¿Para qué canal y qué tipo de producto quieres preparar este catálogo?
          </div>
        </div>

        {/* Purpose selector */}
        <div style={{ marginBottom: S[4] }}>
          <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
            color: C.inkFaint, textTransform: "uppercase" as const,
            letterSpacing: "0.06em", marginBottom: S[2] }}>
            Propósito
          </div>
          <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const }}>
            {PURPOSE_CHIPS.map(({ id, emoji }) => {
              const isActive = activePurpose === id;
              return (
                <button
                  key={id}
                  onClick={() => setActivePurpose(id)}
                  className={`ag-preset-chip${isActive ? " ag-preset-chip--active" : ""}`}
                  style={{
                    background:  isActive ? C.blueDark : C.surface,
                    borderColor: isActive ? C.blueDark : C.line,
                    color:       isActive ? C.white    : C.inkLight,
                    cursor: "pointer",
                    gap: 4,
                  }}
                >
                  <span style={{ marginRight: 2 }}>{emoji}</span>
                  {CATALOG_PURPOSE_LABEL[id]}
                  <span style={{ marginLeft: 4, opacity: 0.55, fontSize: 9 }}>
                    · {CATALOG_CHANNEL_LABEL[PURPOSE_DEFAULT_CHANNEL[id]]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter row */}
        <div style={{ display: "flex", gap: S[3], marginBottom: S[4], flexWrap: "wrap" as const, alignItems: "center" }}>
          {/* Category search */}
          <div style={{
            flex: "1 1 180px", display: "flex", alignItems: "center", gap: S[2],
            background: C.white, border: `1px solid ${categoryFilter ? C.blueBorder : C.line}`,
            borderRadius: R.md, padding: `5px ${S[3]}px`,
          }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.base, color: C.inkFaint, flexShrink: 0 }}>⌕</span>
            <input
              type="text"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              placeholder="Filtrar por categoría…"
              style={{
                flex: 1, border: "none", outline: "none", background: "transparent",
                fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink,
              }}
            />
            {categoryFilter && (
              <button onClick={() => setCategoryFilter("")}
                style={{ border: "none", background: "none", cursor: "pointer",
                  fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, padding: 0 }}>
                ✕
              </button>
            )}
          </div>

          {/* Readiness filter */}
          <div style={{ display: "flex", background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.md, padding: 2 }}>
            {(["any", "partial", "ready"] as const).map(level => (
              <button
                key={level}
                onClick={() => setMinReadiness(level)}
                style={{
                  fontFamily: T.mono, fontSize: T.sz.xs,
                  padding: `4px ${S[2]}px`, borderRadius: R.sm, border: "none",
                  background: minReadiness === level ? C.white : "transparent",
                  color:      minReadiness === level ? C.ink   : C.inkFaint,
                  fontWeight: minReadiness === level ? T.wt.semibold : T.wt.normal,
                  cursor: "pointer",
                  boxShadow: minReadiness === level ? E.xs : "none",
                }}
              >
                {level === "any" ? "Todos los productos" : level === "partial" ? "Con información parcial" : "Listos para publicar"}
              </button>
            ))}
          </div>

          {/* Require asset toggle */}
          <button
            onClick={() => setRequireAsset(v => !v)}
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs, padding: `5px ${S[3]}px`,
              borderRadius: R.md, border: `1px solid ${requireAsset ? C.blueBorder : C.line}`,
              background: requireAsset ? C.blueLight : C.surface,
              color: requireAsset ? C.blueDark : C.inkLight,
              cursor: "pointer",
            }}
          >
            {requireAsset ? "✓ " : ""}Con imagen principal
          </button>
        </div>

        {/* Readiness strip */}
        <ReadinessStrip readiness={readiness} channel={channel} />

        {/* Channel context blocks */}
        {displayItem.whatsappContext && (
          <WhatsAppContextBlock ctx={displayItem.whatsappContext} />
        )}
        {displayItem.shopifyContext && filterResult.included.length > 0 && (
          <ShopifyContextBlock ctx={displayItem.shopifyContext} />
        )}

        {/* Issues + suggestions */}
        {(readiness.issues.length > 0 || readiness.suggestions.length > 0) && (
          <div style={{
            padding: `${S[3]}px ${S[4]}px`,
            background: C.amberLight, border: `1px solid ${C.amberBorder}`,
            borderRadius: R.md, marginBottom: S[4],
          }}>
            {readiness.issues.map((issue, i) => (
              <div key={i} style={{ fontFamily: T.mono, fontSize: 9, color: C.amber,
                marginBottom: 2, display: "flex", alignItems: "flex-start", gap: S[1] }}>
                <span style={{ flexShrink: 0 }}>▲</span>
                <span>{issue}</span>
              </div>
            ))}
            {readiness.suggestions.map((s, i) => (
              <div key={`s${i}`} style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid,
                marginTop: 2, display: "flex", alignItems: "flex-start", gap: S[1] }}>
                <span style={{ flexShrink: 0, color: C.inkFaint }}>→</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
        )}

        {/* Included products grid */}
        {filterResult.included.length > 0 ? (
          <>
            <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
              color: C.inkFaint, textTransform: "uppercase" as const,
              letterSpacing: "0.06em", marginBottom: S[2] }}>
              Productos incluidos ({filterResult.included.length})
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: S[2], marginBottom: S[4],
            }}>
              {filterResult.included.map(p => (
                <CatalogProductCard
                  key={p.productId}
                  product={p}
                  inclusion="included"
                  targetChannel={channel}
                />
              ))}
            </div>
          </>
        ) : (
          <div style={{
            padding: `${S[6]}px ${S[4]}px`, textAlign: "center" as const,
            fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint,
            marginBottom: S[4],
          }}>
            No hay productos listos para este catálogo.
            <div style={{ fontSize: T.sz.xs, marginTop: S[2], color: C.inkGhost }}>
              Prueba cambiando el propósito, ajustando los filtros o completando
              la información de los productos en Revisión.
            </div>
          </div>
        )}

        {/* Partial products (summary only) */}
        {filterResult.partial.length > 0 && (
          <div style={{
            padding: `${S[2]}px ${S[3]}px`,
            background: C.amberLight, border: `1px solid ${C.amberBorder}`,
            borderRadius: R.md, marginBottom: S[3],
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber,
          }}>
            ◆ {filterResult.partial.length} producto{filterResult.partial.length > 1 ? "s" : ""} con información incompleta — completa los datos para incluirlos en el catálogo
          </div>
        )}

        {/* Excluded products (collapsible) */}
        {filterResult.excluded.length > 0 && (
          <>
            <button
              onClick={() => setShowExcluded(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: S[2],
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                background: "none", border: "none", cursor: "pointer",
                padding: 0, marginBottom: S[2],
              }}
            >
              <span style={{ transform: showExcluded ? "rotate(90deg)" : "rotate(0deg)",
                display: "inline-block", transition: "transform .15s" }}>›</span>
              {filterResult.excluded.length} producto{filterResult.excluded.length > 1 ? "s" : ""} no incluido{filterResult.excluded.length > 1 ? "s" : ""} — ver razones
            </button>
            {showExcluded && (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: S[2], marginBottom: S[3],
              }}>
                {filterResult.excluded.map(({ product, reason }) => (
                  <CatalogProductCard
                    key={product.productId}
                    product={product}
                    inclusion="excluded"
                    exclusionReason={reason}
                    targetChannel={channel}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Action tray */}
        <div style={{
          display: "flex", gap: S[2], alignItems: "center",
          paddingTop: S[4], borderTop: `1px solid ${C.lineSubtle}`,
          flexWrap: "wrap" as const,
        }}>
          <button
            disabled
            title={filterResult.included.length === 0
              ? "Agrega al menos un producto al catálogo para poder guardarlo"
              : "Guardar catálogos estará disponible próximamente"}
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
              padding: `${S[2]}px ${S[4]}px`, borderRadius: R.md,
              background: C.surface, color: C.inkGhost,
              border: `1px solid ${C.line}`, cursor: "not-allowed", opacity: 0.7,
            }}
          >
            Guardar catálogo
            {filterResult.included.length === 0 && (
              <span style={{ marginLeft: S[1], fontSize: 9, fontWeight: T.wt.normal }}>
                — agrega productos primero
              </span>
            )}
          </button>
          <button
            disabled
            title="La publicación directa al canal estará disponible próximamente"
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
              padding: `${S[2]}px ${S[4]}px`, borderRadius: R.md,
              background: C.surface, color: C.inkGhost,
              border: `1px solid ${C.line}`, cursor: "not-allowed", opacity: 0.6,
            }}
          >
            Publicar en{" "}
            {channel === "whatsapp" ? "WhatsApp" :
             channel === "shopify"  ? "Shopify"  :
             channel === "ads"      ? "Ads"      : "el canal"}
          </button>
          <a
            href={`/${orgSlug}/agentik/marketing-studio/review`}
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs,
              color: C.inkFaint, marginLeft: "auto", textDecoration: "none",
            }}
          >
            → Completar productos en Revisión
          </a>
        </div>
      </div>
    </>
  );
}
