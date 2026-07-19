/**
 * components/marketing-studio/library/product-detail-drawer.tsx
 *
 * MARKETING-STUDIO-REFERENCE-DETAIL-01
 * Refactored per MARKETING-STUDIO-UX-SYSTEM-03
 *
 * Full operational reference ficha for a ProductConsoleItem.
 * Nine tabs: Resumen · Assets · Producción · Canales · Publicaciones ·
 *             Atributos · Contenido · C·Canales · Shopify
 *
 * ── Design rules ───────────────────────────────────────────────────────────────
 *   - C.* / T.* / S.* / R.* only — no raw hex
 *   - MS_PALETTE.product for domain color
 *   - All status pills via MSStatusBadge — no inline StatusChip
 *   - All sections via MSDrawerSection
 *   - Header via MSDrawerHeader
 *   - Hero strip via MSDrawerHero
 *   - Tabs via MSDrawerTabs
 *   - Footer via MSDrawerFooter
 *   - No mocks. No placeholders. Only persisted data.
 */

"use client";

import { useEffect, useState }          from "react";
import Link                             from "next/link";
import {
  ImageIcon, Video, Layers,
  Globe, Share2, Upload, MoreHorizontal,
} from "lucide-react";

// ── MS Drawer System ──────────────────────────────────────────────────────────
import { MSDrawer }         from "@/components/marketing-studio/shared/ms-drawer";
import { MSDrawerHeader }   from "@/components/marketing-studio/shared/ms-drawer-header";
import { MSDrawerHero }     from "@/components/marketing-studio/shared/ms-drawer-hero";
import type { MSDrawerDimension } from "@/components/marketing-studio/shared/ms-drawer-hero";
import { MSDrawerTabs }     from "@/components/marketing-studio/shared/ms-drawer-tabs";
import { MSDrawerSection }  from "@/components/marketing-studio/shared/ms-drawer-section";
import { MSDrawerFooter }   from "@/components/marketing-studio/shared/ms-drawer-footer";
import { MSStatusBadge }    from "@/components/marketing-studio/shared/ms-status-badge";
import type { MSStatusVariant } from "@/components/marketing-studio/shared/ms-status-badge";

// ── Library sub-panels ────────────────────────────────────────────────────────
import { UploadAssetsModal }             from "./upload-assets-modal";
import type { UploadedAsset }            from "./upload-assets-modal";
import { ProductAttributesPanel }        from "./product-attributes-panel";
import type { AttributeRow }             from "./product-attributes-panel";
import { ProductContentPanel }           from "./product-content-panel";
import { ProductChannelContentPanel }    from "./product-channel-content-panel";
import { ProductShopifyPanel }           from "./product-shopify-panel";

// ── Design tokens ─────────────────────────────────────────────────────────────
import { C, T, S, R }     from "@/lib/ui/tokens";
import {
  MS_PALETTE, MS_SHADOWS, MS_APP_ICON, MS_CTA,
} from "@/lib/marketing-studio/ms-design-system";
import type { ProductConsoleItem } from "@/lib/marketing-studio/products/product-display";

// ── Domain constants ──────────────────────────────────────────────────────────

const DOMAIN = MS_PALETTE.product;

const SYNC_CHANNELS = [
  "shopify", "crm", "whatsapp", "catalog", "ads", "landing",
] as const;

const PUB_CHANNELS = [
  "shopify", "whatsapp", "catalog", "instagram", "facebook", "tiktok",
] as const;

const CHANNEL_LABELS: Record<string, string> = {
  shopify:   "Shopify",
  crm:       "CRM",
  whatsapp:  "WhatsApp",
  catalog:   "Catálogo",
  ads:       "Anuncios",
  landing:   "Página de destino",
  instagram: "Instagram",
  facebook:  "Facebook",
  tiktok:    "TikTok",
};

const ROLE_ORDER   = ["hero", "gallery", "social", "video", "document"] as const;
const ROLE_LABELS: Record<string, string> = {
  hero:     "Imagen principal",
  gallery:  "Galería",
  social:   "Redes sociales",
  video:    "Video",
  document: "Documentos",
};

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { id: "resumen",           label: "Resumen"          },
  { id: "assets",            label: "Recursos"         },
  { id: "produccion",        label: "Producción"       },
  { id: "canales",           label: "Sincronización"   },
  { id: "publicaciones",     label: "Publicación"      },
  { id: "atributos",         label: "Atributos"        },
  { id: "contenido",         label: "Contenido"        },
  { id: "contenido-canales", label: "Por canal"        },
  { id: "shopify",           label: "Shopify"          },
];

// ── Status mapping ────────────────────────────────────────────────────────────

function commercialStatusVariant(s: string): MSStatusVariant {
  switch (s) {
    case "active":   return "ok";
    case "draft":    return "neutral";
    case "archived": return "archived";
    case "review":   return "warning";
    default:         return "neutral";
  }
}

function commercialStatusLabel(s: string): string {
  switch (s) {
    case "active":   return "Activo";
    case "draft":    return "Borrador";
    case "archived": return "Archivado";
    case "review":   return "En revisión";
    default:         return s;
  }
}

function pubStatusVariant(s: string | undefined): MSStatusVariant {
  switch (s) {
    case "published": return "ok";
    case "scheduled": return "info";
    case "paused":    return "warning";
    case "archived":  return "archived";
    default:          return "neutral";
  }
}

function pubStatusLabel(s: string | undefined, hasEntry: boolean): string {
  if (!hasEntry) return "Sin publicar";
  switch (s) {
    case "published": return "Publicado";
    case "scheduled": return "Programado";
    case "paused":    return "Pausado";
    case "archived":  return "Archivado";
    default:          return "Sin publicar";
  }
}

// ── Lazy-load payload ─────────────────────────────────────────────────────────

interface DetailPayload {
  attributes:     AttributeRow[];
  activityEvents: {
    id:         string;
    eventType:  string;
    actorLabel: string | null;
    occurredAt: string;
  }[];
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProductDetailDrawerProps {
  product:           ProductConsoleItem;
  orgSlug:           string;
  organizationId:    string;
  onClose:           () => void;
  onAssetsUploaded?: () => void;
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProductDetailDrawer({
  product, orgSlug, organizationId, onClose, onAssetsUploaded,
}: ProductDetailDrawerProps) {

  const [detail,            setDetail]            = useState<DetailPayload | null>(null);
  const [detailLoading,     setDetailLoading]     = useState(true);
  const [activeTab,         setActiveTab]          = useState("resumen");
  const [localAssetDetails, setLocalAssetDetails] = useState(product.assetDetails);
  const [showUploadModal,   setShowUploadModal]   = useState(false);
  const [assetError,        setAssetError]        = useState<string | null>(null);

  // Lazy-load attributes + activityEvents
  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    fetch(`/api/orgs/${orgSlug}/marketing-studio/products/${product.productId}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: {
        item: unknown;
        attributes: DetailPayload["attributes"];
        activityEvents: DetailPayload["activityEvents"];
      } | null) => {
        if (!cancelled && data) {
          setDetail({ attributes: data.attributes, activityEvents: data.activityEvents });
        }
      })
      .catch(() => {/* fire-and-forget — drawer still renders without detail */})
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [product.productId, orgSlug]);

  function fmtDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-CO", {
      day: "2-digit", month: "short", year: "numeric",
    });
  }

  // ── Asset management handlers — persistent ───────────────────────────────

  const assetBase = `/api/orgs/${orgSlug}/marketing-studio/products/${product.productId}/assets`;

  async function handleMarkAsPrimary(assetId: string) {
    // Optimistic update
    setLocalAssetDetails(prev => prev.map(a => ({
      ...a,
      role: a.id === assetId ? "hero" : (a.role === "hero" ? "gallery" : a.role),
    })));
    setAssetError(null);

    try {
      const res = await fetch(`${assetBase}/${assetId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ role: "hero" }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      // Rollback optimistic update
      setLocalAssetDetails(product.assetDetails);
      setAssetError(err instanceof Error ? err.message : "Error al marcar como principal");
    }
  }

  async function handleDeleteAsset(assetId: string) {
    setAssetError(null);

    try {
      const res = await fetch(`${assetBase}/${assetId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as {
        ok: boolean;
        wasHero: boolean;
        promotedAssetId: string | null;
      };

      // Remove the deleted asset and apply any server-side auto-promotion
      setLocalAssetDetails(prev => {
        const remaining = prev.filter(a => a.id !== assetId);
        if (!data.promotedAssetId) return remaining;
        // Server promoted another asset to hero — reflect it locally
        return remaining.map(a => ({
          ...a,
          role: a.id === data.promotedAssetId ? "hero" : a.role,
        }));
      });
    } catch (err) {
      // Do NOT hide the asset — show error instead
      setAssetError(err instanceof Error ? err.message : "Error al eliminar el recurso");
    }
  }

  // Asset grouping by role
  const assetsByRole = ROLE_ORDER.reduce<Record<string, typeof localAssetDetails>>(
    (acc, role) => {
      acc[role] = localAssetDetails.filter(a => a.role === role);
      return acc;
    },
    {} as Record<string, typeof localAssetDetails>,
  );
  const otherRoles = [...new Set(
    localAssetDetails
      .filter(a => !ROLE_ORDER.includes(a.role as typeof ROLE_ORDER[number]))
      .map(a => a.role),
  )];

  // Readiness color for KpiMini
  const readinessColor =
    product.readinessScore >= 70 ? C.green :
    product.readinessScore >= 30 ? C.amber :
    C.red;

  // Hero strip dimensions — business language for non-technical users
  const heroDimensions: MSDrawerDimension[] = [
    {
      key:   "assets",
      label: "Recursos visuales",
      ok:    localAssetDetails.length > 0,
      value: localAssetDetails.length > 0 ? `${localAssetDetails.length}` : undefined,
    },
    {
      key:   "vars",
      label: "Variantes",
      ok:    product.variantCount > 0,
    },
    {
      key:   "shopify",
      label: "Shopify",
      ok:    product.readyDestinations.includes("shopify" as never),
    },
    {
      key:   "pub",
      label: "Publicado",
      ok:    product.publicationSummary.some(p => p.publicationStatus === "published"),
    },
  ];

  // Contextual footer actions — business-oriented, changes per active tab
  const isPublishedOnShopify = product.readyDestinations.includes("shopify" as never)
    || product.publicationSummary.some(
        p => p.channel === "shopify" && p.publicationStatus === "published",
      );

  const footerActions = [
    {
      label:   "Crear contenido visual",
      href:    `/${orgSlug}/agentik/marketing-studio/foto-estudio/new`,
      primary: true,
    },
    ...(activeTab !== "contenido" ? [{
      label:   "Editar contenido",
      onClick: () => setActiveTab("contenido"),
    }] : []),
    ...(activeTab !== "shopify" ? [{
      label:   isPublishedOnShopify ? "Ver en Shopify" : "Publicar en Shopify",
      onClick: () => setActiveTab("shopify"),
    }] : []),
  ].slice(0, 3);

  // Tabs with asset count badge
  const tabs = TABS.map(t =>
    t.id === "assets" && localAssetDetails.length > 0
      ? { ...t, count: localAssetDetails.length }
      : t,
  );

  return (
    <>
      <MSDrawer onClose={onClose} zIndexBase={800}>

        {/* ── Header ── */}
        <MSDrawerHeader
          thumbnail={product.primaryAssetUrl}
          domainColor={DOMAIN.primary}
          name={product.name}
          sku={product.sku}
          category={product.category}
          statusVariant={commercialStatusVariant(product.commercialStatus)}
          statusLabel={commercialStatusLabel(product.commercialStatus)}
          readinessScore={product.readinessScore}
          onClose={onClose}
        />

        {/* ── Readiness hero strip ── */}
        <MSDrawerHero dimensions={heroDimensions} />

        {/* ── Tab navigation ── */}
        <MSDrawerTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        {/* ── Block content — scrollable body ── */}
        <div style={{
          flex:          1,
          overflowY:     "auto" as const,
          padding:       S[5],
          paddingBottom: 24,  // clearance above the fixed footer
        }}>

          {/* ─────────────────── RESUMEN ─────────────────── */}
          {activeTab === "resumen" && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>

              {/* ── Indicadores clave ── */}
              <MSDrawerSection title="Indicadores">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
                  <KpiMini
                    value={String(localAssetDetails.length || product.assetCount)}
                    label="Recursos visuales"
                    color={(localAssetDetails.length || product.assetCount) > 0
                      ? DOMAIN.primary : C.inkFaint}
                  />
                  <KpiMini
                    value={`${product.readinessScore}%`}
                    label="Preparación para publicar"
                    color={readinessColor}
                  />
                  <KpiMini
                    value={String(product.readyDestinations.length)}
                    label="Canales preparados"
                    color={product.readyDestinations.length > 0 ? C.green : C.inkFaint}
                  />
                  <KpiMini
                    value={String(
                      product.publicationSummary.filter(p => p.publicationStatus === "published").length,
                    )}
                    label="Contenido activo"
                    color={C.blueDark}
                  />
                </div>
              </MSDrawerSection>

              {/* ── Información del producto (attribute cards, no table) ── */}
              <MSDrawerSection title="Información del producto">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>

                  {/* Name — full row */}
                  <div style={{
                    gridColumn:   "1 / -1",
                    background:   C.surface,
                    border:       `1px solid ${C.line}`,
                    borderRadius: R.md,
                    padding:      `${S[2]}px ${S[3]}px`,
                  }}>
                    <div style={{
                      fontFamily: T.mono, fontSize: 9, color: C.inkFaint,
                      letterSpacing: "0.04em", textTransform: "uppercase" as const, marginBottom: 3,
                    }}>
                      Nombre del producto
                    </div>
                    <div style={{
                      fontFamily: T.mono, fontSize: T.sz.sm,
                      fontWeight: T.wt.semibold, color: C.ink,
                    }}>
                      {product.name}
                    </div>
                  </div>

                  {/* SKU */}
                  <FieldCard label="Referencia (SKU)" value={product.sku ?? "Sin referencia"} />

                  {/* Category */}
                  <FieldCard label="Categoría" value={product.category ?? "Sin categoría"} />

                  {/* Precio */}
                  {product.price != null && (
                    <FieldCard
                      label="Precio"
                      value={`$${product.price.toLocaleString("es-CO")} COP`}
                      accent
                    />
                  )}

                  {/* Línea */}
                  {product.productLine && (
                    <FieldCard label="Línea de producto" value={product.productLine} />
                  )}

                  {/* Estado — with badge */}
                  <div style={{
                    background:   C.surface,
                    border:       `1px solid ${C.line}`,
                    borderRadius: R.md,
                    padding:      `${S[2]}px ${S[3]}px`,
                  }}>
                    <div style={{
                      fontFamily: T.mono, fontSize: 9, color: C.inkFaint,
                      letterSpacing: "0.04em", textTransform: "uppercase" as const, marginBottom: 4,
                    }}>
                      Estado
                    </div>
                    <MSStatusBadge
                      label={commercialStatusLabel(product.commercialStatus)}
                      variant={commercialStatusVariant(product.commercialStatus)}
                    />
                  </div>
                </div>

                {/* Dates — secondary, inline */}
                <div style={{ display: "flex", gap: S[3], paddingTop: S[2] }}>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                    Creado {fmtDate(product.createdAt)}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkGhost }}>·</span>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                    Actualizado {fmtDate(product.updatedAt)}
                  </span>
                </div>
              </MSDrawerSection>

              {/* ── Aspectos por revisar (warnings + opportunities) ── */}
              {(product.lucaSignals.length > 0 || product.milaSignals.length > 0) && (
                <MSDrawerSection title="Aspectos por revisar">
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
                    {[...product.lucaSignals, ...product.milaSignals].slice(0, 3).map(s => {
                      const isWarning     = s.level === "warning";
                      const isOpportunity = s.level === "opportunity";
                      return (
                        <div key={s.key} style={{
                          display:      "flex",
                          gap:          S[2],
                          padding:      `${S[2]}px ${S[3]}px`,
                          background:   isOpportunity ? C.greenLight  :
                                        isWarning     ? C.amberLight  : C.surface,
                          border:       `1px solid ${
                            isOpportunity ? C.greenBorder :
                            isWarning     ? C.amberBorder : C.line}`,
                          borderRadius: R.sm,
                          alignItems:   "flex-start",
                        }}>
                          {/* Semantic icon */}
                          <span style={{
                            fontFamily: T.mono, fontSize: 10,
                            color:      isOpportunity ? C.green :
                                        isWarning     ? C.amber : C.inkFaint,
                            flexShrink: 0, marginTop: 1, lineHeight: 1,
                          }}>
                            {isOpportunity ? "✓" : isWarning ? "!" : "·"}
                          </span>
                          <div>
                            <div style={{
                              fontFamily: T.mono, fontSize: T.sz["2xs"],
                              color: C.ink, fontWeight: T.wt.medium,
                            }}>
                              {s.label}
                            </div>
                            {s.detail && (
                              <div style={{
                                fontFamily: T.mono, fontSize: T.sz["2xs"],
                                color: C.inkFaint, marginTop: 2,
                              }}>
                                {s.detail}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </MSDrawerSection>
              )}

              {/* ── Historial reciente ── */}
              {detail && detail.activityEvents.length > 0 && (
                <MSDrawerSection title="Historial reciente">
                  {detail.activityEvents.slice(0, 5).map(e => (
                    <ActivityRow
                      key={e.id}
                      eventType={e.eventType}
                      occurredAt={e.occurredAt}
                      actorLabel={e.actorLabel}
                    />
                  ))}
                </MSDrawerSection>
              )}
            </div>
          )}

          {/* ─────────────────── RECURSOS VISUALES ─────────────────── */}
          {activeTab === "assets" && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>

              {/* Section heading — no floating action buttons */}
              <div style={{
                fontFamily:    T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                color:         C.inkLight, letterSpacing: "0.06em", textTransform: "uppercase" as const,
              }}>
                Recursos visuales
              </div>

              {/* Inline error banner */}
              {assetError && (
                <div style={{
                  fontFamily:   T.mono, fontSize: T.sz.xs, color: C.red,
                  background:   C.redLight, border: `1px solid ${C.redBorder}`,
                  borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`,
                }}>
                  {assetError}
                </div>
              )}

              {/* Asset list — or empty state */}
              {localAssetDetails.length === 0 ? (
                <div style={{
                  display:       "flex",
                  flexDirection: "column" as const,
                  alignItems:    "center",
                  gap:           S[3],
                  padding:       `${S[6]}px ${S[4]}px`,
                  background:    C.surface,
                  borderRadius:  R.md,
                  border:        `1px dashed ${C.line}`,
                  textAlign:     "center" as const,
                }}>
                  <ImageIcon size={28} strokeWidth={1.2} color={C.inkGhost} />
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: S[1], alignItems: "center" }}>
                    <div style={{
                      fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.inkMid,
                    }}>
                      No hay recursos visuales
                    </div>
                    <div style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost, lineHeight: 1.5, maxWidth: 260,
                    }}>
                      Agrega imágenes o crea contenido desde Foto Estudio para comenzar.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const, justifyContent: "center" }}>
                    <button
                      onClick={() => setShowUploadModal(true)}
                      style={{
                        display:       "inline-flex", alignItems: "center", gap: 5,
                        fontFamily:    T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
                        color:         "#fff", background: MS_CTA.primaryButtonBg,
                        border:        "none", borderRadius: R.sm,
                        padding:       "6px 12px", cursor: "pointer",
                        boxShadow:     MS_CTA.primaryBoxShadow, letterSpacing: "-0.01em",
                      }}
                    >
                      <Upload size={10} strokeWidth={2} />
                      Agregar recurso
                    </button>
                    <Link
                      href={`/${orgSlug}/agentik/marketing-studio/foto-estudio/new`}
                      style={{
                        display:        "inline-flex", alignItems: "center", gap: 5,
                        fontFamily:     T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                        color:          DOMAIN.primary, background: DOMAIN.iconBg,
                        border:         `1px solid ${DOMAIN.primary}33`,
                        borderRadius:   R.sm, padding: "6px 12px",
                        textDecoration: "none", cursor: "pointer",
                      }}
                    >
                      Crear desde Foto Estudio
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  {[...ROLE_ORDER, ...otherRoles].map(role => {
                    const group = role in assetsByRole
                      ? assetsByRole[role as typeof ROLE_ORDER[number]]
                      : localAssetDetails.filter(a => a.role === role);
                    if (group.length === 0) return null;
                    return (
                      <div key={role}>
                        <div style={{
                          fontFamily:    T.mono,
                          fontSize:      T.sz["2xs"],
                          fontWeight:    T.wt.bold,
                          color:         DOMAIN.primary,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase" as const,
                          marginBottom:  S[2],
                        }}>
                          {ROLE_LABELS[role] ?? role} ({group.length})
                        </div>
                        <div style={{
                          display:             "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                          gap:                 S[3],
                          marginBottom:        S[3],
                        }}>
                          {group.map(asset => (
                            <AssetThumbnail
                              key={asset.id}
                              asset={asset}
                              onMarkAsPrimary={() => handleMarkAsPrimary(asset.id)}
                              onDelete={() => handleDeleteAsset(asset.id)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* ── Zona de acciones unificada ── */}
              <div style={{
                display:       "flex",
                flexDirection: "column" as const,
                gap:           S[2],
                paddingTop:    S[3],
                borderTop:     `1px solid ${C.lineSubtle}`,
              }}>
                <button
                  onClick={() => setShowUploadModal(true)}
                  style={{
                    display:       "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    fontFamily:    T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
                    color:         "#fff", background: MS_CTA.primaryButtonBg,
                    border:        "none", borderRadius: R.sm,
                    padding:       "9px 16px", cursor: "pointer",
                    boxShadow:     MS_CTA.primaryBoxShadow, letterSpacing: "-0.01em",
                    width:         "100%",
                  }}
                >
                  <Upload size={12} strokeWidth={2} />
                  Agregar recurso
                </button>
                <Link
                  href={`/${orgSlug}/agentik/marketing-studio/foto-estudio/new`}
                  style={{
                    display:        "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    fontFamily:     T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                    color:          DOMAIN.primary, background: DOMAIN.iconBg,
                    border:         `1px solid ${DOMAIN.primary}33`,
                    borderRadius:   R.sm, padding: "9px 16px",
                    textDecoration: "none", width: "100%",
                    boxSizing:      "border-box" as const,
                  }}
                >
                  Crear desde Foto Estudio
                </Link>
              </div>

            </div>
          )}

          {/* ─────────────────── PRODUCCIÓN IA ─────────────────── */}
          {activeTab === "produccion" && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
              <MSDrawerSection title="Producción IA">
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
                }}>
                  Genera contenido visual para esta referencia directamente desde Foto Estudio.
                </div>
              </MSDrawerSection>

              <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
                {[
                  {
                    icon:  <ImageIcon size={16} strokeWidth={1.6} color={DOMAIN.primary} />,
                    title: "Foto ecommerce",
                    desc:  "Foto de producto sobre fondo neutro, lista para Shopify",
                    href:  `/${orgSlug}/agentik/marketing-studio/foto-estudio/new`,
                  },
                  {
                    icon:  <Share2 size={16} strokeWidth={1.6} color={DOMAIN.primary} />,
                    title: "Foto para redes",
                    desc:  "Imagen lifestyle optimizada para Instagram y Facebook",
                    href:  `/${orgSlug}/agentik/marketing-studio/foto-estudio/new`,
                  },
                  {
                    icon:  <Video size={16} strokeWidth={1.6} color={DOMAIN.primary} />,
                    title: "Video corto",
                    desc:  "Clip de producto para Reels, TikTok y Shorts",
                    href:  `/${orgSlug}/agentik/marketing-studio/foto-estudio/new`,
                  },
                  {
                    icon:  <Layers size={16} strokeWidth={1.6} color={DOMAIN.primary} />,
                    title: "Banner",
                    desc:  "Pieza gráfica para catálogo o campaña de ads",
                    href:  `/${orgSlug}/agentik/marketing-studio/foto-estudio/new`,
                  },
                ].map(action => (
                  <Link
                    key={action.title}
                    href={action.href}
                    style={{
                      display:        "flex",
                      alignItems:     "center",
                      gap:            S[3],
                      padding:        S[3],
                      background:     DOMAIN.cardBg,
                      border:         `1px solid ${DOMAIN.primary}22`,
                      borderRadius:   R.md,
                      textDecoration: "none",
                    }}
                  >
                    <div style={{
                      width:          36, height: 36,
                      borderRadius:   R.md,
                      background:     `linear-gradient(145deg, rgba(255,255,255,0.9) 0%, ${DOMAIN.iconBg} 100%)`,
                      boxShadow:      MS_SHADOWS.appIcon(DOMAIN.primary),
                      display:        "flex",
                      alignItems:     "center",
                      justifyContent: "center",
                      flexShrink:     0,
                    }}>
                      {action.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontFamily: T.mono, fontSize: T.sz["2xs"],
                        fontWeight: T.wt.semibold, color: C.ink,
                      }}>
                        {action.title}
                      </div>
                      <div style={{
                        fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 2,
                      }}>
                        {action.desc}
                      </div>
                    </div>
                    <span style={{ fontFamily: T.mono, fontSize: 11, color: DOMAIN.primary }}>→</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ─────────────────── SINCRONIZACIÓN ─────────────────── */}
          {activeTab === "canales" && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
              <MSDrawerSection title="Sincronización por canal">
                <div style={{
                  background:   C.blueLight,
                  borderRadius: R.sm,
                  padding:      `${S[2]}px ${S[3]}px`,
                  fontFamily:   T.mono,
                  fontSize:     T.sz["2xs"],
                  color:        C.inkFaint,
                  border:       `1px solid ${C.blueBorder}`,
                }}>
                  Sincronización: envío de información de este producto hacia cada canal de venta.
                  Diferente de publicación.
                </div>
              </MSDrawerSection>

              <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
                {SYNC_CHANNELS.map(ch => {
                  const sync = product.syncSummary.find(s => s.channel === ch) ?? null;
                  const readiness =
                    product.readyDestinations.includes(ch as never)   ? "ready"   :
                    product.partialDestinations.includes(ch as never) ? "partial" :
                    product.blockedDestinations.includes(ch as never) ? "blocked" :
                    "none";

                  const readinessDot =
                    readiness === "ready"   ? C.green :
                    readiness === "partial" ? C.amber :
                    readiness === "blocked" ? C.red   :
                    C.line;

                  const syncLabel =
                    sync == null                    ? "No configurado"   :
                    sync.status === "synced"        ? "Sincronizado"     :
                    sync.status === "pending"       ? "Pendiente"        :
                    sync.status === "failed"        ? "Falló"            :
                    sync.status === "outdated"      ? "Desactualizado"   :
                    sync.status;

                  const syncColor =
                    sync?.status === "synced"  ? C.green :
                    sync?.status === "pending" ? C.amber :
                    sync?.status === "failed"  ? C.red   :
                    C.inkFaint;

                  return (
                    <div key={ch} style={{
                      display:      "flex",
                      alignItems:   "center",
                      gap:          S[3],
                      padding:      S[3],
                      background:   C.surface,
                      border:       `1px solid ${C.line}`,
                      borderRadius: R.md,
                    }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: readinessDot, flexShrink: 0,
                      }} />
                      <span style={{
                        fontFamily:  T.mono, fontSize: T.sz["2xs"],
                        color:       C.ink, fontWeight: T.wt.medium,
                        minWidth:    80, flexShrink: 0,
                      }}>
                        {CHANNEL_LABELS[ch]}
                      </span>
                      <span style={{
                        fontFamily: T.mono, fontSize: T.sz.xs, color: syncColor, flex: 1,
                      }}>
                        {syncLabel}
                      </span>
                      {sync?.lastSyncAt && (
                        <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                          {fmtDate(sync.lastSyncAt)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─────────────────── PUBLICACIONES ─────────────────── */}
          {activeTab === "publicaciones" && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
              <MSDrawerSection title="Estado de publicación">
                <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
                  {PUB_CHANNELS.map(ch => {
                    const pub = product.publicationSummary.find(p => p.channel === ch) ?? null;
                    return (
                      <div key={ch} style={{
                        display:      "flex",
                        alignItems:   "center",
                        gap:          S[3],
                        padding:      S[3],
                        background:   pub?.publicationStatus === "published"
                          ? `${C.greenLight}80` : C.surface,
                        border:       `1px solid ${
                          pub?.publicationStatus === "published" ? C.greenBorder : C.line}`,
                        borderRadius: R.md,
                      }}>
                        <Globe
                          size={14}
                          strokeWidth={1.6}
                          color={pub?.publicationStatus === "published" ? C.green : C.inkFaint}
                        />
                        <span style={{
                          fontFamily: T.mono, fontSize: T.sz["2xs"],
                          color:      C.ink, fontWeight: T.wt.medium,
                          minWidth:   80, flexShrink: 0,
                        }}>
                          {CHANNEL_LABELS[ch]}
                        </span>
                        <MSStatusBadge
                          label={pubStatusLabel(pub?.publicationStatus, pub !== null)}
                          variant={pubStatusVariant(pub?.publicationStatus)}
                        />
                        {pub?.publishedAt && (
                          <span style={{
                            fontFamily: T.mono, fontSize: 9,
                            color: C.inkFaint, marginLeft: "auto",
                          }}>
                            {fmtDate(pub.publishedAt)}
                          </span>
                        )}
                        {pub?.publicationUrl && (
                          <a
                            href={pub.publicationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontFamily:     T.mono, fontSize: 9,
                              color:          C.blueDark, marginLeft: "auto",
                              textDecoration: "none",
                            }}
                          >
                            Ver →
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </MSDrawerSection>

              {product.publicationSummary.length === 0 && (
                <EmptyBlock message="Esta referencia no tiene publicaciones registradas." />
              )}
            </div>
          )}

          {/* ─────────────────── ATRIBUTOS ─────────────────── */}
          {activeTab === "atributos" && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
              <MSDrawerSection
                title="Atributos de producto"
                action={{ label: "Configurar definiciones", href: `/${orgSlug}/agentik/marketing-studio/biblioteca/atributos` }}
              >
                {detailLoading ? (
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                    padding: `${S[3]}px 0`,
                  }}>
                    Cargando atributos…
                  </div>
                ) : (
                  <ProductAttributesPanel
                    orgSlug={orgSlug}
                    productId={product.productId}
                    attributes={detail?.attributes ?? []}
                    onSaved={() => {
                      fetch(`/api/orgs/${orgSlug}/marketing-studio/products/${product.productId}`)
                        .then(r => r.ok ? r.json() : null)
                        .then((data: {
                          item: unknown;
                          attributes: AttributeRow[];
                          activityEvents: DetailPayload["activityEvents"];
                        } | null) => {
                          if (data) setDetail({
                            attributes:     data.attributes,
                            activityEvents: data.activityEvents,
                          });
                        })
                        .catch(() => {});
                    }}
                  />
                )}
              </MSDrawerSection>
            </div>
          )}

          {/* ─────────────────── CONTENIDO ─────────────────── */}
          {activeTab === "contenido" && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
              <MSDrawerSection title="Contenido comercial">
                <ProductContentPanel orgSlug={orgSlug} productId={product.productId} />
              </MSDrawerSection>
            </div>
          )}

          {/* ─────────────────── CANALES DE CONTENIDO ─────────────────── */}
          {activeTab === "contenido-canales" && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
              <MSDrawerSection title="Canales de contenido">
                <ProductChannelContentPanel orgSlug={orgSlug} productId={product.productId} />
              </MSDrawerSection>
            </div>
          )}

          {/* ─────────────────── SHOPIFY ─────────────────── */}
          {activeTab === "shopify" && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
              <MSDrawerSection title="Shopify">
                <ProductShopifyPanel orgSlug={orgSlug} productId={product.productId} />
              </MSDrawerSection>
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        <MSDrawerFooter actions={footerActions} />

      </MSDrawer>

      {/* ── Upload Assets Modal (above drawer) ── */}
      {showUploadModal && (
        <UploadAssetsModal
          organizationId={organizationId}
          orgSlug={orgSlug}
          productId={product.productId}
          onSuccess={(newAssets: UploadedAsset[]) => {
            setLocalAssetDetails(prev => [
              ...prev,
              ...newAssets.map(a => ({
                id:        a.id,
                assetUrl:  a.assetUrl,
                role:      a.role,
                createdAt: a.createdAt,
              })),
            ]);
            setShowUploadModal(false);
            onAssetsUploaded?.();
          }}
          onClose={() => setShowUploadModal(false)}
        />
      )}
    </>
  );
}

// ── Sub-components (drawer-specific, not shared) ──────────────────────────────

// ─── FieldCard ─────────────────────────────────────────────────────────────────
// Attribute card for "Información del producto" grid — replaces table rows.
function FieldCard({
  label, value, accent,
}: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      background:   C.surface,
      border:       `1px solid ${C.line}`,
      borderRadius: R.md,
      padding:      `${S[2]}px ${S[3]}px`,
    }}>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      9,
        color:         C.inkFaint,
        letterSpacing: "0.04em",
        textTransform: "uppercase" as const,
        marginBottom:  3,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.mono,
        fontSize:   T.sz["2xs"],
        fontWeight: T.wt.medium,
        color:      accent ? C.blueDark : C.ink,
      }}>
        {value}
      </div>
    </div>
  );
}

function KpiMini({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div style={{
      background:    C.surface,
      border:        `1px solid ${C.line}`,
      borderRadius:  R.md,
      padding:       `${S[2]}px ${S[3]}px`,
      display:       "flex",
      flexDirection: "column" as const,
      gap:           2,
    }}>
      <div style={{
        fontFamily:         T.mono,
        fontSize:           20,
        fontWeight:         T.wt.bold,
        color,
        lineHeight:         1,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
        {label}
      </div>
    </div>
  );
}

// ── Asset card helpers ─────────────────────────────────────────────────────────

const ROLE_TYPE_LABELS: Record<string, string> = {
  hero:     "Imagen principal",
  gallery:  "Galería",
  social:   "Redes sociales",
  video:    "Video",
  document: "Documento",
};

function fmtAssetDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("es-CO", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return "";
  }
}

// ── Shared menu item styles ────────────────────────────────────────────────────

const menuItemBase: React.CSSProperties = {
  display:        "block",
  width:          "100%",
  textAlign:      "left",
  fontFamily:     T.mono,
  fontSize:       T.sz.xs,
  fontWeight:     T.wt.medium,
  color:          C.ink,
  background:     "none",
  border:         "none",
  borderBottom:   `1px solid ${C.lineSubtle}`,
  padding:        "9px 13px",
  cursor:         "pointer",
  textDecoration: "none",
  lineHeight:     1,
  boxSizing:      "border-box",
};

// ── Asset card ─────────────────────────────────────────────────────────────────
// Vertical card: image area (fixed height, contain) + info strip below.
// No aspect-ratio lock — eliminates wasted empty space.

function AssetThumbnail({
  asset,
  onMarkAsPrimary,
  onDelete,
}: {
  asset:            { id: string; assetUrl: string | null; role: string; createdAt: string };
  onMarkAsPrimary?: () => void;
  onDelete?:        () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isPrimary = asset.role === "hero";
  const typeLabel = ROLE_TYPE_LABELS[asset.role] ?? asset.role;
  const dateLabel = fmtAssetDate(asset.createdAt);

  return (
    <div style={{
      display:      "flex",
      flexDirection:"column" as const,
      borderRadius: R.md,
      border:       `1.5px solid ${isPrimary ? DOMAIN.primary + "99" : C.line}`,
      background:   C.white,
      overflow:     "hidden",
      boxShadow:    isPrimary ? MS_SHADOWS.cardSelected(DOMAIN.primary) : MS_SHADOWS.card,
      transition:   "box-shadow 0.15s, border-color 0.15s",
    }}>

      {/* ── Image area — fixed height, always contain ── */}
      <div style={{
        position:   "relative" as const,
        height:     180,
        flexShrink: 0,
        background: C.surface,  // neutral bg for any image proportion
      }}>
        {asset.assetUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.assetUrl}
            alt={typeLabel}
            style={{
              width:          "100%",
              height:         "100%",
              objectFit:      "contain",
              objectPosition: "center",
              display:        "block",
            }}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div style={{
            width:          "100%",
            height:         "100%",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
          }}>
            <ImageIcon size={24} strokeWidth={1.2} color={C.inkGhost} />
          </div>
        )}

        {/* Principal badge — top left */}
        {isPrimary && (
          <div style={{
            position:      "absolute" as const,
            top:           7,
            left:          7,
            background:    DOMAIN.primary,
            color:         "#fff",
            fontFamily:    T.mono,
            fontSize:      8,
            fontWeight:    T.wt.bold,
            letterSpacing: "0.07em",
            padding:       "2px 7px",
            borderRadius:  R.pill,
            textTransform: "uppercase" as const,
            pointerEvents: "none",
          }}>
            Principal
          </div>
        )}

        {/* Context menu trigger — top right */}
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
          style={{
            position:       "absolute" as const,
            top:            7,
            right:          7,
            width:          26,
            height:         26,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            background:     "rgba(0,0,0,0.48)",
            border:         "none",
            borderRadius:   R.sm,
            cursor:         "pointer",
            color:          "#fff",
            padding:        0,
          }}
          aria-label="Opciones del recurso"
        >
          <MoreHorizontal size={13} strokeWidth={2} />
        </button>

        {/* Dropdown menu */}
        {menuOpen && (
          <>
            <div
              onClick={() => setMenuOpen(false)}
              style={{ position: "fixed" as const, inset: 0, zIndex: 40 }}
            />
            <div style={{
              position:     "absolute" as const,
              top:          37,
              right:        7,
              background:   C.white,
              border:       `1px solid ${C.line}`,
              borderRadius: R.md,
              boxShadow:    MS_SHADOWS.cardSelected(DOMAIN.primary),
              zIndex:       50,
              minWidth:     176,
              overflow:     "hidden",
            }}>
              {/* Ver recurso */}
              {asset.assetUrl && (
                <a
                  href={asset.assetUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMenuOpen(false)}
                  style={menuItemBase}
                >
                  Ver recurso
                </a>
              )}

              {/* Descargar recurso */}
              {asset.assetUrl && (
                <a
                  href={asset.assetUrl}
                  download
                  onClick={() => setMenuOpen(false)}
                  style={menuItemBase}
                >
                  Descargar recurso
                </a>
              )}

              {/* Marcar como principal — oculto si ya lo es */}
              {!isPrimary && onMarkAsPrimary && (
                <button
                  onClick={() => { onMarkAsPrimary(); setMenuOpen(false); }}
                  style={menuItemBase}
                >
                  Marcar como principal
                </button>
              )}

              {/* Eliminar recurso */}
              {onDelete && (
                <button
                  onClick={() => {
                    if (!window.confirm("¿Eliminar este recurso de la referencia? El archivo no se borrará globalmente.")) return;
                    setMenuOpen(false);
                    onDelete();
                  }}
                  style={{ ...menuItemBase, color: C.red, borderBottom: "none" }}
                >
                  Eliminar recurso
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Info strip — role type + date ── */}
      <div style={{
        padding:       `${S[2]}px ${S[3]}px`,
        borderTop:     `1px solid ${C.lineSubtle}`,
        display:       "flex",
        flexDirection: "column" as const,
        gap:           2,
      }}>
        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          fontWeight:   T.wt.semibold,
          color:        isPrimary ? DOMAIN.primary : C.ink,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap" as const,
        }}>
          {typeLabel}
        </div>
        {dateLabel && (
          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
            {dateLabel}
          </div>
        )}
      </div>

    </div>
  );
}

const EVENT_LABELS: Record<string, string> = {
  PRODUCT_CREATED:           "Referencia creada",
  PRODUCT_APPROVED:          "Aprobado",
  PRODUCT_UPDATED:           "Metadata actualizada",
  PRODUCT_ATTRIBUTE_UPDATED: "Atributos actualizados",
  PRODUCT_READINESS_CHANGED: "Preparación recalculada",
  PRODUCT_SYNC_FAILED:       "Sincronización fallida",
  PRODUCT_PUBLISHED:         "Publicado",
  PRODUCT_ASSET_LINKED:      "Recurso vinculado",
};

function ActivityRow({
  eventType, occurredAt, actorLabel,
}: { eventType: string; occurredAt: string; actorLabel: string | null }) {
  const date  = new Date(occurredAt);
  const diff  = Date.now() - date.getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  const rel   =
    mins  < 1  ? "Ahora mismo" :
    mins  < 60 ? `Hace ${mins}m` :
    hours < 24 ? `Hace ${hours}h` :
    days  < 7  ? `Hace ${days}d` :
    date.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });

  return (
    <div style={{
      display:      "flex",
      gap:          S[2],
      alignItems:   "flex-start",
      padding:      `${S[1]}px 0`,
      borderBottom: `1px solid ${C.line}`,
    }}>
      <div style={{
        width: 5, height: 5, borderRadius: "50%",
        background: C.blueDark, flexShrink: 0, marginTop: 4,
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
          {EVENT_LABELS[eventType] ?? eventType}
        </div>
        {actorLabel && (
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            {actorLabel}
          </div>
        )}
      </div>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"],
        color: C.inkFaint, flexShrink: 0,
      }}>
        {rel}
      </span>
    </div>
  );
}

function EmptyBlock({
  message,
  actions = [],
}: {
  message:  string;
  actions?: { label: string; href: string; primary?: boolean }[];
}) {
  return (
    <div style={{
      display:       "flex",
      flexDirection: "column" as const,
      alignItems:    "center",
      gap:           S[3],
      padding:       "32px 0",
      textAlign:     "center" as const,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
        {message}
      </div>
      {actions.map(a => (
        <Link
          key={a.label}
          href={a.href}
          style={{
            fontFamily:     T.mono,
            fontSize:       T.sz.sm,
            fontWeight:     T.wt.bold,
            color:          a.primary ? "#fff" : C.inkMid,
            background:     a.primary ? MS_CTA.primaryButtonBg : C.surface,
            border:         a.primary ? "none" : `1px solid ${C.line}`,
            borderRadius:   R.sm,
            padding:        "7px 14px",
            textDecoration: "none",
            boxShadow:      a.primary ? MS_CTA.primaryBoxShadow : "none",
          }}
        >
          {a.label}
        </Link>
      ))}
    </div>
  );
}
