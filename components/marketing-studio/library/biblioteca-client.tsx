/**
 * components/marketing-studio/library/biblioteca-client.tsx
 *
 * MS-04B / MS-04C — Biblioteca Client Workspace
 *
 * Client wrapper managing:
 *   - Preset selection (active preset chip + client-side asset filtering)
 *   - Search text filter (name, SKU, type, channel)
 *   - Drawer open/close (selectedAsset state)
 *   - Approval panel trigger (approvalAsset state)
 *
 * ── Architecture ───────────────────────────────────────────────────────────────
 *   page.tsx (server) → BibliotecaClient (client) → AssetCard + drawer + approval
 *
 * ── Filtering ─────────────────────────────────────────────────────────────────
 *   Presets filter client-side over BibliotecaAssetDisplay[].
 *   MS-05+ will delegate filtering to the server intelligence layer.
 */

"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter }                   from "next/navigation";
import Link                            from "next/link";
import { C, T, S, R, E }              from "@/lib/ui/tokens";
import { AssetCard }                   from "./asset-card";
import {
  AssetDetailDrawer,
  type BibliotecaAssetDisplay,
}                                      from "./asset-detail-drawer";
import { ApprovalMetadataPanel }       from "./approval-metadata-panel";
import { LibraryReferenceCard }        from "./library-reference-card";
import { CreateReferenceModal }        from "./create-reference-modal";
import { ProductDetailDrawer }         from "./product-detail-drawer";
import { ImportCatalogWizard }         from "./import-catalog-wizard";
import { CategoriaNav }               from "./categoria-nav";
import { BIBLIOTECA_EMPTY_STATES }     from "@/lib/marketing-studio/library/ui/asset-visual-tokens";
import { MS_CARD, MS_CTA, MS_METRIC_CARD, MS_SHADOWS } from "@/lib/marketing-studio/ms-design-system";

const MS_CARD_GAP = MS_CARD.gap;
import { EmptyOperationalState }       from "@/components/shell/operational-primitives";
import type { ProductConsoleItem }     from "@/lib/marketing-studio/products/product-display";
import {
  filterProductsByPreset,
  filterProductsBySearch,
  filterProductsByCategory,
  deriveCategoryList,
}                                      from "@/lib/marketing-studio/products/product-display";
import {
  detectProductDuplicates,
  type DuplicateCandidate,
}                                      from "@/lib/marketing-studio/library/duplicate-detection";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PresetItem {
  id:           string;
  label:        string;
  accent?:      string;
  description?: string;
}

interface BibliotecaClientProps {
  assets:          BibliotecaAssetDisplay[];   // legacy asset mode
  products?:       ProductConsoleItem[];        // product console mode (MS-06+)
  orgSlug:         string;
  organizationId:  string;
  presets:         PresetItem[];
}

// ── Preset accent styles ───────────────────────────────────────────────────────

const ACCENT: Record<string, { bg: string; text: string; border: string }> = {
  green:  { bg: C.greenLight,  text: C.green,    border: C.greenBorder  },
  blue:   { bg: C.blueLight,   text: C.blueDark,  border: C.blueBorder   },
  amber:  { bg: C.amberLight,  text: C.amber,    border: C.amberBorder  },
  purple: { bg: C.brandLight,  text: C.brand,    border: C.brandBorder  },
  gray:   { bg: C.surface,     text: C.inkLight, border: C.line         },
  red:    { bg: C.redLight,    text: C.red,      border: C.redBorder    },
};

// ── KpiActionCard ─────────────────────────────────────────────────────────────

function KpiActionCard({
  value, label, sub, dotColor, variant = "neutral", onClick, active,
}: {
  value:    number;
  label:    string;
  sub?:     string;
  dotColor: string;
  variant?: "neutral" | "ok" | "warning" | "critical";
  onClick:  () => void;
  active:   boolean;
}) {
  const valueColor =
    variant === "critical" ? C.red   :
    variant === "warning"  ? C.amber :
    variant === "ok"       ? C.green :
    C.ink;

  return (
    <button
      onClick={onClick}
      style={{
        background:   active ? `${dotColor}0a` : C.white,
        border:       `${active ? 1.5 : 1}px solid ${active ? `${dotColor}99` : C.line}`,
        borderRadius: MS_METRIC_CARD.borderRadius,
        padding:      MS_METRIC_CARD.padding,
        boxShadow:    active ? MS_SHADOWS.cardSelected(dotColor) : MS_SHADOWS.card,
        position:     "relative" as const,
        overflow:     "hidden" as const,
        textAlign:    "left" as const,
        cursor:       "pointer",
        width:        "100%",
        transition:   "border-color .12s, box-shadow .12s, background .12s",
        boxSizing:    "border-box" as const,
      }}
    >
      {/* Left accent bar */}
      <div style={{
        position:     "absolute" as const,
        left: 0, top: 0, bottom: 0,
        width:        MS_METRIC_CARD.accentWidth,
        background:   dotColor,
        borderRadius: `${R.md}px 0 0 ${R.md}px`,
      }} />
      {/* Value */}
      <div style={{
        fontFamily:         T.mono,
        fontSize:           MS_METRIC_CARD.valueSize,
        fontWeight:         T.wt.bold,
        color:              active ? dotColor : valueColor,
        lineHeight:         1,
        fontVariantNumeric: "tabular-nums",
        marginBottom:       S[1],
      }}>
        {value}
      </div>
      {/* Label */}
      <div style={{
        fontFamily:   T.mono,
        fontSize:     MS_METRIC_CARD.labelSize,
        fontWeight:   T.wt.semibold,
        color:        C.inkMid,
        marginBottom: sub ? 2 : 0,
      }}>
        {label}
      </div>
      {/* Sub */}
      {sub && (
        <div style={{ fontFamily: T.mono, fontSize: MS_METRIC_CARD.subSize, color: C.inkFaint }}>
          {sub}
        </div>
      )}
      {/* Active indicator */}
      {active && (
        <div style={{
          position: "absolute" as const, top: S[2], right: S[2],
          fontFamily: T.mono, fontSize: 8, color: dotColor, opacity: 0.7,
        }}>
          filtrado ▾
        </div>
      )}
    </button>
  );
}

// ── ReviewQueueRow ────────────────────────────────────────────────────────────

function ReviewQueueRow({
  product, onApprove, onReject, onOpen, updating,
}: {
  product:   ProductConsoleItem;
  onApprove: () => void;
  onReject:  () => void;
  onOpen:    () => void;
  updating:  boolean;
}) {
  return (
    <div style={{
      display:    "flex",
      alignItems: "center",
      gap:        S[3],
      padding:    `${S[3]}px ${S[4]}px`,
      background: C.white,
      border:     `1px solid ${C.line}`,
      borderRadius: R.md,
      opacity:    updating ? 0.6 : 1,
      transition: "opacity .15s",
    }}>
      {/* Thumbnail */}
      <div style={{
        width: 36, height: 36, borderRadius: R.sm, flexShrink: 0,
        background: C.surface, overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {product.primaryAssetUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.primaryAssetUrl} alt={product.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint }}>–</span>
        )}
      </div>
      {/* Identity */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
        }}>
          {product.name}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          {product.sku ? `Ref. ${product.sku}` : "Sin referencia"}
          {product.category ? ` · Cat. ${product.category}` : ""}
        </div>
      </div>
      {/* Readiness score */}
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, flexShrink: 0,
        minWidth: 32, textAlign: "right" as const,
        color: product.readinessScore >= 70 ? C.green : product.readinessScore >= 30 ? C.amber : C.red,
      }}>
        {product.readinessScore}
      </div>
      {/* Quick actions */}
      <div style={{ display: "flex", gap: S[2], flexShrink: 0 }}>
        <button onClick={onApprove} disabled={updating} style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
          padding: "4px 10px", borderRadius: R.sm,
          background: C.greenLight, border: `1px solid ${C.greenBorder}`,
          color: C.green, cursor: updating ? "not-allowed" : "pointer",
        }}>Aprobar</button>
        <button onClick={onReject} disabled={updating} style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
          padding: "4px 10px", borderRadius: R.sm,
          background: C.redLight, border: `1px solid ${C.redBorder}`,
          color: C.red, cursor: updating ? "not-allowed" : "pointer",
        }}>Rechazar</button>
        <button onClick={onOpen} style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"],
          padding: "4px 10px", borderRadius: R.sm,
          background: C.surface, border: `1px solid ${C.line}`,
          color: C.inkMid, cursor: "pointer",
        }}>Ver →</button>
      </div>
    </div>
  );
}

// ── DuplicateResolutionView ───────────────────────────────────────────────────

function DuplicateCard({ candidate }: { candidate: DuplicateCandidate }) {
  const [resolved, setResolved] = useState<string | null>(null);

  const { primary: a, secondary: b, score, reasons } = candidate;

  const confidence =
    score >= 80 ? { label: "Alta",   color: C.red   } :
    score >= 60 ? { label: "Media",  color: C.amber } :
                  { label: "Baja",   color: C.inkMid };

  if (resolved) {
    return (
      <div style={{
        padding: `${S[3]}px ${S[4]}px`, textAlign: "center" as const,
        background: C.greenLight, border: `1px solid ${C.greenBorder}`,
        borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz.xs, color: C.green,
      }}>
        ✓ {resolved}
      </div>
    );
  }

  return (
    <div style={{
      background: C.white, border: `1px solid ${C.line}`,
      borderRadius: R.md, padding: S[4],
    }}>
      {/* Header: label + confidence + motivos */}
      <div style={{
        display: "flex", alignItems: "center", gap: S[3],
        marginBottom: S[3],
      }}>
        <div style={{
          fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
          color: C.inkFaint, textTransform: "uppercase" as const,
          letterSpacing: "0.06em", flex: 1,
        }}>
          Coincidencia detectada
        </div>
        {/* Confidence badge */}
        <div style={{
          fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
          color: confidence.color, padding: "2px 7px", borderRadius: R.pill,
          border: `1px solid ${confidence.color}44`,
          background: `${confidence.color}0d`,
        }}>
          Confianza {confidence.label}
        </div>
      </div>

      {/* Motivos */}
      <div style={{
        display: "flex", gap: S[1], flexWrap: "wrap" as const,
        marginBottom: S[4],
      }}>
        {reasons.map(r => (
          <span key={r.label} style={{
            fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold,
            padding: "2px 6px", borderRadius: R.sm,
            background: C.surface, border: `1px solid ${C.line}`,
            color: C.inkMid,
          }}>
            {r.label}
          </span>
        ))}
      </div>

      {/* Product comparison grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[4], marginBottom: S[4] }}>
        {([
          { product: a, role: "Referencia principal" },
          { product: b, role: "Referencia relacionada" },
        ] as { product: ProductConsoleItem; role: string }[]).map(({ product: p, role }) => (
          <div key={p.productId} style={{
            background: C.surface, borderRadius: R.md, padding: S[3],
            border: `1px solid ${C.line}`,
          }}>
            <div style={{
              fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginBottom: S[2],
              textTransform: "uppercase" as const, letterSpacing: "0.06em",
            }}>
              {role}
            </div>
            {/* Image — contain so product is never cropped */}
            <div style={{
              height: 160, borderRadius: R.md, marginBottom: S[2],
              background: C.white, border: `1px solid ${C.line}`,
              padding: S[2], display: "flex",
              alignItems: "center", justifyContent: "center",
              overflow: "hidden",
            }}>
              {p.primaryAssetUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.primaryAssetUrl}
                  alt={p.name}
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                />
              ) : (
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>
                  Sin imagen
                </span>
              )}
            </div>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
              color: C.ink, marginBottom: 2,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
            }}>
              {p.name}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
              {p.sku ? `Ref. ${p.sku}` : "Sin referencia"}
              {p.category ? ` · Cat. ${p.category}` : ""}
            </div>
          </div>
        ))}
      </div>

      {/* Actions — local state only (no merge backend yet) */}
      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const, alignItems: "center" }}>
        <button onClick={() => setResolved("Marcada como fusionada")} style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          padding: `${S[2]}px ${S[3]}px`, borderRadius: R.md,
          background: C.blueDark, color: C.white, border: "none", cursor: "pointer",
        }}>Marcar como fusionada</button>
        <button onClick={() => setResolved("Ambas referencias conservadas")} style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          padding: `${S[2]}px ${S[3]}px`, borderRadius: R.md,
          background: C.surface, color: C.inkMid, border: `1px solid ${C.line}`, cursor: "pointer",
        }}>Conservar ambas</button>
        <button onClick={() => setResolved("Sugerencia ignorada")} style={{
          fontFamily: T.mono, fontSize: T.sz.xs,
          padding: `${S[2]}px ${S[3]}px`, borderRadius: R.md,
          background: "none", color: C.inkFaint, border: "none", cursor: "pointer",
        }}>Ignorar sugerencia</button>
      </div>
    </div>
  );
}

function DuplicateResolutionView({
  candidates, onClose,
}: {
  candidates: DuplicateCandidate[];
  onClose:    () => void;
}) {
  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: S[4],
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.ink }}>
          Posibles duplicados
          {candidates.length > 0 && (
            <span style={{
              marginLeft: S[2], fontFamily: T.mono, fontSize: T.sz["2xs"],
              fontWeight: T.wt.normal, color: C.inkFaint,
            }}>
              {candidates.length} coincidencia{candidates.length !== 1 ? "s" : ""} detectada{candidates.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button onClick={onClose} style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
          background: "none", border: "none", cursor: "pointer", padding: 0,
        }}>← Volver a Biblioteca</button>
      </div>

      {candidates.length === 0 ? (
        <div style={{
          padding: "48px 0", textAlign: "center" as const,
          fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint,
        }}>
          No encontramos posibles duplicados con la información actual.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
          {candidates.map((c, i) => (
            <DuplicateCard key={`${c.primary.productId}|${c.secondary.productId}|${i}`} candidate={c} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Client-side preset filtering ───────────────────────────────────────────────

function filterByPreset(assets: BibliotecaAssetDisplay[], presetId: string): BibliotecaAssetDisplay[] {
  switch (presetId) {
    case "recently_approved":  return assets; // no dates yet — show all
    case "whatsapp_ready":     return assets.filter(a => a.channels.includes("whatsapp"));
    case "shopify_ready":      return assets.filter(a => a.channels.includes("shopify"));
    case "catalog_ready":      return assets.filter(a => a.channels.includes("catalog"));
    case "pending_review":     return assets.filter(a => a.status === "review_pending");
    case "high_performers":    return assets.filter(a => a.highPerformer);
    case "missing_variants":   return assets.filter(a => a.variantCount === 0);
    case "for_luca":           return assets.filter(a => a.usageCount === 0 || a.variantCount === 0);
    case "stale_assets":       return assets.filter(a => a.stale);
    case "duplicate_risk":     return assets.filter(a => a.duplicateRisk);
    default:                   return assets;
  }
}

function filterBySearch(assets: BibliotecaAssetDisplay[], text: string): BibliotecaAssetDisplay[] {
  if (!text.trim()) return assets;
  const q = text.toLowerCase();
  return assets.filter(a =>
    a.name.toLowerCase().includes(q) ||
    (a.sku?.toLowerCase().includes(q) ?? false) ||
    a.assetType.toLowerCase().includes(q) ||
    a.channels.some(ch => ch.includes(q))
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

const FILTER_LABELS = ["Categoría", "Canal", "Estado", "Tipo", "Temporada"];

// ── Component ──────────────────────────────────────────────────────────────────

export function BibliotecaClient({ assets, products, orgSlug, organizationId, presets }: BibliotecaClientProps) {
  const router = useRouter();

  // ── Mode: product console or legacy asset grid ──
  // productMode activates when the server passes a products array (even empty),
  // so the product console UI (with "Nueva referencia" CTA) is always available.
  const productMode = products !== undefined;

  // ── State ──
  const [selectedAsset,    setSelectedAsset]    = useState<BibliotecaAssetDisplay | null>(null);
  const [selectedProduct,  setSelectedProduct]  = useState<ProductConsoleItem | null>(null);
  const [approvalAsset,    setApprovalAsset]    = useState<BibliotecaAssetDisplay | null>(null);
  const [activePreset,     setActivePreset]     = useState<string | null>(null);
  const [activeCategory,   setActiveCategory]   = useState<string>("all");
  const [searchText,       setSearchText]       = useState("");
  const [showCreateModal,  setShowCreateModal]  = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [showDuplicateMode, setShowDuplicateMode] = useState(false);
  const [updatingProducts, setUpdatingProducts] = useState<Set<string>>(new Set());

  // Auto-open a specific product when navigating from an external link (?product=productId).
  // Reads window.location.search on mount — avoids Suspense requirement of useSearchParams.
  useEffect(() => {
    if (!products?.length) return;
    const productParam = new URLSearchParams(window.location.search).get("product");
    if (!productParam) return;
    const found = products.find(p => p.productId === productParam);
    if (found) setSelectedProduct(found);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleReferenceCreated(_productId: string) {
    setShowCreateModal(false);
    router.refresh();
  }

  // ── Derived categories (product mode) ──
  const derivedCategories = useMemo(
    () => deriveCategoryList(products ?? []),
    [products],
  );

  // ── Filtered assets (legacy mode) ──
  const filteredAssets = useMemo(() => {
    let result = assets;
    if (activePreset) result = filterByPreset(result, activePreset);
    if (searchText)   result = filterBySearch(result, searchText);
    return result;
  }, [assets, activePreset, searchText]);

  // ── Filtered products (product mode) ──
  const filteredProducts = useMemo(() => {
    let result = products ?? [];
    if (activeCategory !== "all")    result = filterProductsByCategory(result, activeCategory);
    if (activePreset === "approved") result = result.filter(p => p.status === "approved");
    else if (activePreset)           result = filterProductsByPreset(result, activePreset);
    if (searchText)                  result = filterProductsBySearch(result, searchText);
    return result;
  }, [products, activeCategory, activePreset, searchText]);

  // Active preset metadata (for description strip)
  const activePresetMeta = activePreset ? presets.find(p => p.id === activePreset) : null;

  // ── KPI counts (product mode) ──
  const kpis = useMemo(() => {
    const all = products ?? [];
    return {
      approved: all.filter(p => p.status === "approved").length,
      pending:  all.filter(p => p.status === "pending").length,
      whatsapp: all.filter(p => p.readyDestinations.includes("whatsapp" as never)).length,
    };
  }, [products]);

  // ── Per-preset counts for chip badges ──
  const presetCounts = useMemo(() => {
    const all = products ?? [];
    const counts: Record<string, number> = {};
    for (const preset of presets) {
      if (preset.id === "approved") counts[preset.id] = all.filter(p => p.status === "approved").length;
      else counts[preset.id] = filterProductsByPreset(all, preset.id).length;
    }
    return counts;
  }, [products, presets]);

  // ── Real duplicate detection ──
  const duplicateCandidates = useMemo(
    () => detectProductDuplicates(products ?? []),
    [products],
  );

  // ── Handlers ──
  function handlePresetClick(id: string) {
    setActivePreset(prev => prev === id ? null : id); // toggle
    setSelectedAsset(null);
    setShowDuplicateMode(false);
  }

  function handleQuickStatus(productId: string, status: "approved" | "rejected") {
    setUpdatingProducts(prev => new Set(prev).add(productId));
    fetch(`/api/orgs/${orgSlug}/marketing-studio/products/${productId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status }),
    })
      .then(() => router.refresh())
      .finally(() => {
        setUpdatingProducts(prev => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      });
  }

  function handleApprove() {
    if (!selectedAsset) return;
    setApprovalAsset(selectedAsset);
  }

  function handleApprovalConfirm() {
    setApprovalAsset(null);
    setSelectedAsset(null);
  }

  return (
    <>
      {/* ── Operational KPI Strip ── */}
      {productMode && (
        <div style={{
          display:             "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap:                 S[3],
          marginBottom:        S[5],
        }}>
          <KpiActionCard
            value={kpis.approved}
            label="Aprobadas"
            sub="listas para publicar"
            dotColor={C.blueDark}
            onClick={() => { setActivePreset("approved"); setShowDuplicateMode(false); setSelectedProduct(null); }}
            active={activePreset === "approved" && !showDuplicateMode}
          />
          <KpiActionCard
            value={kpis.pending}
            label="Pendientes revisión"
            sub="requieren acción"
            dotColor={C.amber}
            variant="warning"
            onClick={() => { setActivePreset("pending"); setShowDuplicateMode(false); setSelectedProduct(null); }}
            active={activePreset === "pending" && !showDuplicateMode}
          />
          <KpiActionCard
            value={kpis.whatsapp}
            label="Listos para WhatsApp"
            sub="canal habilitado"
            dotColor={C.green}
            variant="ok"
            onClick={() => { setActivePreset("whatsapp_ready"); setShowDuplicateMode(false); setSelectedProduct(null); }}
            active={activePreset === "whatsapp_ready" && !showDuplicateMode}
          />
          <KpiActionCard
            value={duplicateCandidates.length}
            label="Posibles duplicados"
            sub="coincidencias detectadas"
            dotColor={duplicateCandidates.length > 0 ? C.amber : C.inkFaint}
            variant={duplicateCandidates.length > 0 ? "warning" : "neutral"}
            onClick={() => { setShowDuplicateMode(true); setActivePreset(null); setSelectedProduct(null); }}
            active={showDuplicateMode}
          />
        </div>
      )}

      {/* ── Preset Chips ── */}
      <div style={{ marginBottom: activePresetMeta ? S[2] : S[5] }}>
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between", marginBottom: S[2],
        }}>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
            color: C.inkFaint, textTransform: "uppercase" as const,
            letterSpacing: "0.06em",
          }}>
            Vistas inteligentes
          </div>
          {productMode && (
            <div style={{ display: "flex", gap: S[2], alignItems: "center" }}>
              <button
                onClick={() => setShowImportWizard(true)}
                style={{
                  fontFamily:    T.mono,
                  fontSize:      "11px",
                  fontWeight:    T.wt.semibold,
                  color:         C.inkMid,
                  background:    C.surface,
                  border:        `1px solid ${C.line}`,
                  borderRadius:  6,
                  padding:       "5px 12px",
                  cursor:        "pointer",
                  letterSpacing: "-0.01em",
                  flexShrink:    0,
                }}
              >
                ↑ Importar catálogo
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  fontFamily:    T.mono,
                  fontSize:      "11px",
                  fontWeight:    T.wt.bold,
                  color:         "#fff",
                  background:    MS_CTA.primaryButtonBg,
                  border:        "none",
                  borderRadius:  6,
                  padding:       "5px 12px",
                  cursor:        "pointer",
                  boxShadow:     MS_CTA.primaryBoxShadow,
                  letterSpacing: "-0.01em",
                  flexShrink:    0,
                }}
              >
                + Nueva referencia
              </button>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const }}>
          {presets.map(preset => {
            const isActive = activePreset === preset.id;
            const a = ACCENT[preset.accent ?? "gray"];
            return (
              <button
                key={preset.id}
                onClick={() => handlePresetClick(preset.id)}
                className={`ag-preset-chip${isActive ? " ag-preset-chip--active" : ""}`}
                style={{ background: a.bg, borderColor: a.border, color: a.text, cursor: "pointer" }}
                title={preset.description}
              >
                {preset.label}
                {productMode && presetCounts[preset.id] !== undefined && (
                  <span style={{
                    marginLeft: 5, fontFamily: T.mono, fontSize: 9,
                    fontWeight: T.wt.bold, opacity: isActive ? 1 : 0.55,
                  }}>
                    {presetCounts[preset.id]}
                  </span>
                )}
              </button>
            );
          })}
          {(activePreset || showDuplicateMode) && (
            <button
              onClick={() => { setActivePreset(null); setShowDuplicateMode(false); }}
              className="ag-preset-chip"
              style={{ background: C.surface, borderColor: C.line, color: C.inkFaint, cursor: "pointer" }}
            >
              ✕ Limpiar filtro
            </button>
          )}
        </div>
      </div>

      {/* ── Category navigation rail (product mode only) ── */}
      {productMode && (
        <div style={{ marginBottom: S[4] }}>
          <CategoriaNav
            allProducts={products ?? []}
            activeCategory={activeCategory}
            onSelect={cat => {
              setActiveCategory(cat);
              setSelectedProduct(null);
            }}
          />
        </div>
      )}

      {/* Active preset description strip */}
      {activePresetMeta && (
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:          S[2],
          padding:      `${S[2]}px ${S[3]}px`,
          background:   C.blueLight,
          border:       `1px solid ${C.blueBorder}`,
          borderRadius: R.md,
          marginBottom: S[5],
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.blueDark, flexShrink: 0 }} />
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.blueDark }}>
            {activePresetMeta.label}
          </div>
          {activePresetMeta.description && (
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
              · {activePresetMeta.description}
            </div>
          )}
          <div style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            {productMode
              ? `${filteredProducts.length} ${activeCategory !== "all" ? `en ${activeCategory === "uncategorized" ? "sin categoría" : activeCategory}` : "productos"}`
              : `${filteredAssets.length} assets`}
          </div>
        </div>
      )}

      {/* ── Search + Filters ── */}
      <div style={{ display: "flex", gap: S[2], marginBottom: S[5], flexWrap: "wrap" as const, alignItems: "center" }}>
        {/* Search input — wired */}
        <div style={{
          flex: "1 1 240px", display: "flex", alignItems: "center", gap: S[2],
          background: C.white, border: `1px solid ${searchText ? C.blueBorder : C.line}`,
          borderRadius: R.md, padding: `6px ${S[3]}px`,
          boxShadow: searchText ? `0 0 0 2px rgba(0,74,173,.10)` : E.xs,
          transition: "border-color .1s, box-shadow .1s",
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.base, color: C.inkFaint, flexShrink: 0 }}>⌕</span>
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Buscar por nombre, SKU, tipo, canal…"
            style={{
              flex: 1, border: "none", outline: "none", background: "transparent",
              fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink,
            }}
          />
          {searchText && (
            <button
              onClick={() => setSearchText("")}
              style={{
                border: "none", background: "none", cursor: "pointer",
                fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint,
                padding: 0, lineHeight: 1, flexShrink: 0,
              }}
            >✕</button>
          )}
        </div>

        {/* Filter dropdowns (static — MS-05+) */}
        {FILTER_LABELS.map(f => (
          <div key={f} style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: `5px ${S[2]}px`, background: C.surface,
            border: `1px solid ${C.line}`, borderRadius: R.md,
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
            cursor: "not-allowed", whiteSpace: "nowrap" as const, opacity: 0.7,
          }}
            title="Filtros avanzados disponibles en MS-05+"
          >
            {f}
            <span style={{ color: C.inkGhost, fontSize: T.sz["2xs"] }}>▾</span>
          </div>
        ))}

        {/* Grid / List toggle */}
        <div style={{ display: "flex", gap: 2, background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.md, padding: 3 }}>
          {["⊞ Grid", "≡ Lista"].map((v, i) => (
            <div key={v} style={{
              padding: `4px ${S[2]}px`, borderRadius: R.sm,
              background: i === 0 ? C.white : "transparent",
              border: i === 0 ? `1px solid ${C.line}` : "1px solid transparent",
              fontFamily: T.mono, fontSize: T.sz.xs,
              color: i === 0 ? C.inkMid : C.inkFaint,
              cursor: "pointer", fontWeight: i === 0 ? T.wt.semibold : T.wt.normal,
              boxShadow: i === 0 ? E.xs : "none",
            }}>
              {v}
            </div>
          ))}
        </div>

        {/* Result count */}
        {(searchText || activePreset || activeCategory !== "all") && (
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            {productMode
              ? `${filteredProducts.length} / ${(products ?? []).length} productos`
              : `${filteredAssets.length} / ${assets.length} assets`}
          </div>
        )}
      </div>

      {/* ── Duplicate Resolution Mode ── */}
      {productMode && showDuplicateMode && (
        <DuplicateResolutionView
          candidates={duplicateCandidates}
          onClose={() => setShowDuplicateMode(false)}
        />
      )}

      {/* ── Grid (product console mode) ── */}
      {productMode && !showDuplicateMode && (
        filteredProducts.length === 0 ? (
          searchText || activePreset ? (
            <EmptyOperationalState
              message="Sin productos para este filtro"
              detail="Ajusta los filtros o busca con otro término."
              action={{ label: "Limpiar filtros", href: `/${orgSlug}/agentik/marketing-studio/biblioteca` }}
            />
          ) : activeCategory === "uncategorized" ? (
            <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: S[3], padding: "48px 0" }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.inkMid }}>
                No hay referencias sin categoría
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textAlign: "center" as const, maxWidth: 320 }}>
                Todas las referencias tienen categoría asignada.
              </div>
            </div>
          ) : activeCategory !== "all" ? (
            <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: S[3], padding: "48px 0" }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.inkMid }}>
                No hay referencias en "{activeCategory}"
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textAlign: "center" as const, maxWidth: 320 }}>
                Crea la primera referencia en esta categoría.
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  fontFamily: T.mono, fontSize: "12px", fontWeight: T.wt.bold,
                  color: "#fff", background: MS_CTA.primaryButtonBg, border: "none",
                  borderRadius: 6, padding: "8px 16px", cursor: "pointer",
                  boxShadow: MS_CTA.primaryBoxShadow, letterSpacing: "-0.01em",
                }}
              >
                + Nueva referencia en "{activeCategory}"
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: S[3], padding: "48px 0" }}>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                color: C.inkMid,
              }}>
                No hay referencias todavía
              </div>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textAlign: "center" as const, maxWidth: 320,
              }}>
                Crea una referencia manualmente o aprueba un asset desde Foto Estudio.
              </div>
              <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const, justifyContent: "center" }}>
                <button
                  onClick={() => setShowCreateModal(true)}
                  style={{
                    fontFamily:    T.mono,
                    fontSize:      "12px",
                    fontWeight:    T.wt.bold,
                    color:         "#fff",
                    background:    MS_CTA.primaryButtonBg,
                    border:        "none",
                    borderRadius:  6,
                    padding:       "8px 16px",
                    cursor:        "pointer",
                    boxShadow:     MS_CTA.primaryBoxShadow,
                    letterSpacing: "-0.01em",
                  }}
                >
                  + Nueva referencia
                </button>
                <Link
                  href={`/${orgSlug}/agentik/marketing-studio/foto-estudio/new`}
                  style={{
                    fontFamily:    T.mono,
                    fontSize:      "12px",
                    fontWeight:    T.wt.semibold,
                    color:         C.inkMid,
                    background:    C.surface,
                    border:        `1px solid ${C.line}`,
                    borderRadius:  6,
                    padding:       "8px 16px",
                    cursor:        "pointer",
                    textDecoration: "none",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Crear desde Foto Estudio →
                </Link>
              </div>
            </div>
          )
        ) : activePreset === "pending" ? (
          // ── Review Queue: inline quick-action list ──
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: S[2],
            }}>
              <div style={{
                fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
                color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em",
              }}>
                Cola de revisión — {filteredProducts.length} referencia{filteredProducts.length !== 1 ? "s" : ""}
              </div>
            </div>
            {filteredProducts.map(product => (
              <ReviewQueueRow
                key={product.productId}
                product={product}
                onApprove={() => handleQuickStatus(product.productId, "approved")}
                onReject={() => handleQuickStatus(product.productId, "rejected")}
                onOpen={() => setSelectedProduct(product)}
                updating={updatingProducts.has(product.productId)}
              />
            ))}
          </div>
        ) : (
          <div style={{
            display:             "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap:                 MS_CARD_GAP,
          }}>
            {filteredProducts.map(product => (
              <LibraryReferenceCard
                key={product.productId}
                product={product}
                selected={selectedProduct?.productId === product.productId}
                onClick={() => setSelectedProduct(product)}
              />
            ))}
          </div>
        )
      )}

      {/* ── Grid (legacy asset mode) ── */}
      {!productMode && (
        filteredAssets.length === 0 ? (
          <EmptyOperationalState
            message={
              searchText
                ? BIBLIOTECA_EMPTY_STATES.search.message
                : activePreset
                ? `Sin assets en "${activePresetMeta?.label ?? activePreset}"`
                : BIBLIOTECA_EMPTY_STATES.default.message
            }
            detail={
              searchText
                ? BIBLIOTECA_EMPTY_STATES.search.detail
                : BIBLIOTECA_EMPTY_STATES.default.detail
            }
            action={
              searchText || activePreset
                ? { label: "Limpiar filtros", href: `/${orgSlug}/agentik/marketing-studio/biblioteca` }
                : { label: "Crear primera sesión en Foto Estudio", href: `/${orgSlug}/agentik/marketing-studio/foto-estudio/new` }
            }
          />
        ) : (
          <div style={{
            display:             "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap:                 S[3],
          }}>
            {filteredAssets.map(asset => (
              <div
                key={asset.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedAsset(asset)}
                onKeyDown={e => (e.key === "Enter" || e.key === " ") && setSelectedAsset(asset)}
                style={{ cursor: "pointer", outline: "none" }}
              >
                <AssetCard
                  id={asset.id}
                  assetUrl={asset.assetUrl}
                  assetType={asset.assetType}
                  name={asset.name}
                  sku={asset.sku ?? undefined}
                  status={asset.status}
                  channels={asset.channels}
                  usageCount={asset.usageCount}
                  variantCount={asset.variantCount}
                  score={asset.score}
                  highPerformer={asset.highPerformer}
                  stale={asset.stale}
                  isSelected={selectedAsset?.id === asset.id}
                />
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Product Detail Drawer (product mode) ── */}
      {selectedProduct && (
        <ProductDetailDrawer
          product={selectedProduct}
          orgSlug={orgSlug}
          organizationId={organizationId}
          onClose={() => setSelectedProduct(null)}
          onAssetsUploaded={() => router.refresh()}
        />
      )}

      {/* ── Asset Detail Drawer (legacy mode) ── */}
      {!productMode && (
        <AssetDetailDrawer
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onApprove={handleApprove}
          orgSlug={orgSlug}
        />
      )}

      {/* ── Approval Metadata Panel ── */}
      {approvalAsset && (
        <ApprovalMetadataPanel
          asset={approvalAsset}
          organizationId={organizationId}
          onConfirm={handleApprovalConfirm}
          onCancel={() => setApprovalAsset(null)}
        />
      )}

      {/* ── Create Reference Modal ── */}
      {showCreateModal && (
        <CreateReferenceModal
          organizationId={organizationId}
          onSuccess={handleReferenceCreated}
          onClose={() => setShowCreateModal(false)}
          existingCategories={derivedCategories}
          selectedCategory={
            activeCategory !== "all" && activeCategory !== "uncategorized"
              ? activeCategory
              : undefined
          }
        />
      )}

      {/* ── Import Catalog Wizard ── */}
      {showImportWizard && (
        <ImportCatalogWizard
          orgSlug={orgSlug}
          organizationId={organizationId}
          onSuccess={() => {
            setShowImportWizard(false);
            router.refresh();
          }}
          onClose={() => setShowImportWizard(false)}
        />
      )}
    </>
  );
}
