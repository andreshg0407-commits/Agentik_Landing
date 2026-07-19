/**
 * components/marketing-studio/shopify/publication-detail-drawer.tsx
 *
 * MS-09B — Publication Detail Drawer
 * MARKETING-STUDIO-UX-SYSTEM-03D — Product Workspace Drawer.
 *
 * Structure: Header → Tabs → Scrollable body → Footer
 * Resumen:   image gallery (edge-to-edge, min 320px, object-fit contain)
 *            → thumbnail strip → compact stats row → aspects by review.
 * Other tabs: standard padded sections.
 *
 * Structural changes vs 03C:
 * - MSDrawerHero removed from fixed chrome (between header and tabs).
 * - Tabs immediately follow header — no height wasted before content.
 * - Image never cropped: object-fit contain, neutral bg, full proportions.
 * - KPI cards replaced by compact inline stats row.
 * - Image gallery is primary visual; text is secondary.
 *
 * Business logic, data props, and API surface unchanged.
 */

"use client";

import { useState, useEffect } from "react";
import { C, T, S, R }     from "@/lib/ui/tokens";
import { MS_PALETTE }      from "@/lib/marketing-studio/ms-design-system";
import { MSDrawer }        from "../shared/ms-drawer";
import { MSDrawerHeader }  from "../shared/ms-drawer-header";
import { MSDrawerTabs }    from "../shared/ms-drawer-tabs";
import { MSDrawerSection } from "../shared/ms-drawer-section";
import { MSDrawerFooter }  from "../shared/ms-drawer-footer";
import type { MSStatusVariant }      from "../shared/ms-status-badge";
import type { PublicationQueueItem } from "@/lib/marketing-studio/commerce/publication-engine";
import type { IssueSeverity }        from "@/lib/marketing-studio/commerce/commerce-types";
import {
  PUBLICATION_STATUS_LABEL,
  SYNC_HEALTH_LABEL,
  ISSUE_SEVERITY,
  DESTINATION_LABEL,
} from "@/lib/marketing-studio/commerce/commerce-types";

// ── Visual config ─────────────────────────────────────────────────────────────

const HEALTH_COLOR: Record<string, string> = {
  healthy:      C.green,
  warning:      C.amber,
  critical:     C.red,
  disconnected: C.inkGhost,
};

function pubStatusToVariant(status: string): MSStatusVariant {
  switch (status) {
    case "published":                          return "ok";
    case "partial":                            return "warning";
    case "failed":                             return "error";
    case "archived":                           return "archived";
    case "paused":                             return "neutral";
    case "draft": case "queued": case "syncing":
    default:                                   return "info";
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/**
 * ProductImageGallery — main visual workspace for the product.
 * Image never crops: object-fit contain, neutral background, full proportions.
 * Height grows with viewport (clamp), minimum 320px.
 * Thumbnail strip prepared for multiple images.
 */
function ProductImageGallery({
  primaryUrl, altText, imageCount,
}: {
  primaryUrl: string | null;
  altText:    string;
  imageCount: number;
}) {
  return (
    <div style={{ flexShrink: 0 }}>
      {/* Main image — full width, contained, never cropped */}
      <div style={{
        height:         "clamp(320px, 45vh, 480px)",
        background:     C.surface,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        overflow:       "hidden",
        borderBottom:   `1px solid ${C.line}`,
      }}>
        {primaryUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primaryUrl}
            alt={altText}
            style={{
              maxWidth:  "100%",
              maxHeight: "100%",
              objectFit: "contain" as const,
              display:   "block",
            }}
          />
        ) : (
          <div style={{
            display:       "flex",
            flexDirection: "column" as const,
            alignItems:    "center",
            gap:           S[2],
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: R.lg,
              background: C.lineSubtle,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontFamily: T.mono, fontSize: 22, color: C.inkGhost, lineHeight: 1 }}>▢</span>
            </div>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkGhost }}>
              Sin imagen principal
            </span>
          </div>
        )}
      </div>

      {/* Thumbnail strip — gallery-ready, horizontal scroll */}
      <div style={{
        display:      "flex",
        gap:          S[2],
        padding:      `${S[2]}px ${S[4]}px`,
        borderBottom: `1px solid ${C.line}`,
        background:   C.white,
        overflowX:    "auto" as const,
        minHeight:    72,
        alignItems:   "center",
      }}>
        {/* Active thumb — primary asset */}
        {primaryUrl ? (
          <div style={{
            width: 52, height: 52, flexShrink: 0,
            borderRadius: R.sm,
            border:       `2px solid ${MS_PALETTE.product.primary}`,
            overflow:     "hidden",
            background:   C.surface,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={primaryUrl}
              alt={altText}
              style={{ width: "100%", height: "100%", objectFit: "contain" as const }}
            />
          </div>
        ) : (
          <div style={{
            width: 52, height: 52, flexShrink: 0,
            borderRadius: R.sm,
            border: `1px dashed ${C.line}`,
            background: C.surface,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkGhost }}>—</span>
          </div>
        )}

        {/* Placeholder thumbs for additional images (future-ready) */}
        {imageCount > 1 && Array.from({ length: Math.min(imageCount - 1, 5) }).map((_, i) => (
          <div key={i} style={{
            width: 52, height: 52, flexShrink: 0,
            borderRadius: R.sm,
            border:     `1px dashed ${C.line}`,
            background: C.surface,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkGhost }}>
              {i + 2}
            </span>
          </div>
        ))}

        {/* Overflow badge */}
        {imageCount > 6 && (
          <div style={{
            width: 52, height: 52, flexShrink: 0,
            borderRadius: R.sm,
            background: C.surfaceAlt,
            border: `1px solid ${C.line}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint }}>
              +{imageCount - 6}
            </span>
          </div>
        )}

        {/* Empty state */}
        {imageCount === 0 && !primaryUrl && (
          <span style={{
            fontFamily: T.mono, fontSize: 9, color: C.inkGhost, alignSelf: "center",
          }}>
            Sin recursos visuales
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * CompactStats — 4-column inline stat row. No cards, no shadows.
 * Value is prominent; label is secondary. Attention stays on the product.
 */
function CompactStats({ items }: {
  items: Array<{ label: string; value: string | number; color: string }>;
}) {
  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: `repeat(${items.length}, 1fr)`,
      gap:                 S[3],
    }}>
      {items.map(item => (
        <div key={item.label}>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
            color: item.color, lineHeight: 1, marginBottom: 2,
          }}>
            {item.value}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function IssueRow({ severity, label, detail, field }: {
  severity: IssueSeverity; label: string; detail: string; field?: string; code?: string;
}) {
  const isBlocking = severity === ISSUE_SEVERITY.BLOCKING;
  const isWarning  = severity === ISSUE_SEVERITY.WARNING;
  const color  = isBlocking ? C.red  : isWarning ? C.amber  : C.inkFaint;
  const bg     = isBlocking ? C.redLight   : isWarning ? C.amberLight  : C.surface;
  const border = isBlocking ? C.redBorder  : isWarning ? C.amberBorder : C.line;

  return (
    <div style={{
      display: "flex", gap: S[2], alignItems: "flex-start",
      padding: `${S[2]}px ${S[3]}px`,
      background: bg, border: `1px solid ${border}`,
      borderRadius: R.md, marginBottom: S[2],
    }}>
      <span style={{
        width: 16, height: 16, borderRadius: "50%", background: color,
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: T.mono, fontSize: 8, fontWeight: T.wt.bold, color: C.white,
      }}>
        {isBlocking ? "!" : isWarning ? "▲" : "i"}
      </span>
      <div>
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
          color, marginBottom: 2,
        }}>
          {label}
          {field && (
            <span style={{ fontWeight: T.wt.normal, opacity: 0.7, marginLeft: S[2] }}>
              · {field}
            </span>
          )}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid }}>
          {detail}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, truncate = false }: {
  label: string; value: string | number | boolean | null; truncate?: boolean;
}) {
  const display = value === null ? "—" : String(value);
  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "140px 1fr",
      gap:                 S[2],
      padding:             `${S[1]}px 0`,
      borderBottom:        `1px solid ${C.lineSubtle}`,
    }}>
      <span style={{
        fontFamily: T.mono, fontSize: 9,
        color: C.inkGhost, fontWeight: T.wt.semibold,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily:   T.mono, fontSize: 9, color: C.inkMid,
        overflow:     truncate ? "hidden"  : "visible",
        textOverflow: truncate ? "ellipsis" : "clip",
        whiteSpace:   truncate ? "nowrap" as const : "normal" as const,
      }}>
        {display}
      </span>
    </div>
  );
}

// ── Live Shopify state types (client-safe, no server-only imports) ────────────

interface LiveShopifyState {
  status:       string;
  title:        string;
  handle:       string;
  publishedAt:  string | null;
  updatedAt:    string;
  variantCount: number;
  imageCount:   number;
  fetchedAt:    string;
  /** Direct link to the product page in the Shopify admin panel. */
  adminUrl:     string | null;
}

const SHOPIFY_STATUS_LABEL: Record<string, string> = {
  active:   "Activo",
  draft:    "Borrador",
  archived: "Archivado",
};
const SHOPIFY_STATUS_COLOR: Record<string, string> = {
  active:   C.green,
  draft:    C.amber,
  archived: C.inkFaint,
};

// ── Main drawer ───────────────────────────────────────────────────────────────

interface PublicationDetailDrawerProps {
  item:    PublicationQueueItem | null;
  orgSlug: string;
  onClose: () => void;
}

export function PublicationDetailDrawer({
  item, orgSlug, onClose,
}: PublicationDetailDrawerProps) {
  const [activeTab,        setActiveTab]        = useState("resumen");
  const [liveState,        setLiveState]        = useState<LiveShopifyState | null>(null);
  const [liveStateLoading, setLiveStateLoading] = useState(false);
  const [liveStateError,   setLiveStateError]   = useState<string | null>(null);

  // Auto-fetch live Shopify state when the publicacion tab is active and
  // the product has been published (has externalId).
  useEffect(() => {
    if (activeTab !== "publicacion" || !item?.externalId) return;
    setLiveStateLoading(true);
    setLiveState(null);
    setLiveStateError(null);

    fetch(
      `/api/orgs/${orgSlug}/marketing-studio/shopify/catalog/product-state/${item.productId}`,
    )
      .then(r => r.json())
      .then((data: {
        ok?: boolean;
        adminUrl?: string | null;
        state?: {
          status: string; title: string; handle: string;
          publishedAt: string | null; updatedAt: string;
          variants: unknown[]; images: unknown[]; fetchedAt: string;
        };
        errorMessage?: string;
      }) => {
        if (data.ok && data.state) {
          setLiveState({
            status:       data.state.status,
            title:        data.state.title,
            handle:       data.state.handle,
            publishedAt:  data.state.publishedAt,
            updatedAt:    data.state.updatedAt,
            variantCount: data.state.variants?.length ?? 0,
            imageCount:   data.state.images?.length   ?? 0,
            fetchedAt:    data.state.fetchedAt,
            adminUrl:     data.adminUrl ?? null,
          });
        } else {
          setLiveStateError(data.errorMessage ?? "No se pudo consultar Shopify");
        }
      })
      .catch(() => setLiveStateError("Error de red al consultar Shopify"))
      .finally(() => setLiveStateLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, item?.productId, item?.externalId, orgSlug]);

  if (!item) return null;

  const healthColor = HEALTH_COLOR[item.syncHealth] ?? C.inkGhost;
  const payload     = item.shopifyPayload;
  const blocking    = item.publicationIssues.filter(i => i.severity === ISSUE_SEVERITY.BLOCKING);
  const warnings    = item.publicationIssues.filter(i => i.severity === ISSUE_SEVERITY.WARNING);
  const issueCount  = blocking.length + warnings.length + payload.missingForPublish.length;

  // ── Tabs ──
  const TABS = [
    { id: "resumen",        label: "Resumen" },
    { id: "publicacion",    label: "Publicación" },
    { id: "aspectos",       label: "Aspectos",        ...(issueCount > 0 ? { count: issueCount } : {}) },
    { id: "sincronizacion", label: "Sincronización" },
    ...(item.lucaSignals.length > 0
      ? [{ id: "senales", label: "Señales", count: item.lucaSignals.length }]
      : []),
  ];

  // ── Footer actions ──
  const footerActions = [
    {
      label:    item.externalId ? "Ya publicado en Shopify" : "Publicar en Shopify",
      primary:  true,
      disabled: !!item.externalId,
      href:     !item.externalId ? `#publish-${item.productId}` : undefined,
    },
    {
      label: "Abrir producto en Biblioteca",
      href:  `/${orgSlug}/agentik/marketing-studio/biblioteca?product=${item.productId}`,
    },
  ];

  return (
    <MSDrawer onClose={onClose}>

      {/* ── Header (fixed) ── */}
      <MSDrawerHeader
        thumbnail={item.primaryAssetUrl ?? undefined}
        domainColor={MS_PALETTE.product.primary}
        name={item.productName}
        sku={item.sku ?? undefined}
        category={DESTINATION_LABEL[item.destination as keyof typeof DESTINATION_LABEL] ?? item.destination}
        statusVariant={pubStatusToVariant(item.publicationStatus)}
        statusLabel={
          PUBLICATION_STATUS_LABEL[item.publicationStatus as keyof typeof PUBLICATION_STATUS_LABEL]
          ?? item.publicationStatus
        }
        readinessScore={item.readinessScore}
        onClose={onClose}
      />

      {/* ── Tabs (fixed, immediately after header) ── */}
      <MSDrawerTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* ── Scrollable body (flex: 1, minHeight: 0 for proper scroll) ── */}
      <div style={{
        flex:      1,
        minHeight: 0,
        overflowY: "auto" as const,
        overflowX: "hidden" as const,
      }}>

        {/* ════ RESUMEN — image-first layout ════ */}
        {activeTab === "resumen" && (
          <div style={{ display: "flex", flexDirection: "column" as const }}>

            {/* Gallery — full width, no padding, image contained */}
            <ProductImageGallery
              primaryUrl={item.primaryAssetUrl}
              altText={item.productName}
              imageCount={payload.images.length}
            />

            {/* Text content — padded */}
            <div style={{
              padding:       S[4],
              display:       "flex",
              flexDirection: "column" as const,
              gap:           S[4],
              paddingBottom: 32,
            }}>

              {/* Compact stats row */}
              <CompactStats items={[
                {
                  label: "Preparación",
                  value: `${item.readinessScore}%`,
                  color: item.readinessScore >= 70 ? C.green
                       : item.readinessScore >= 40 ? C.amber
                       : C.red,
                },
                {
                  label: "Bloqueos",
                  value: blocking.length,
                  color: blocking.length > 0 ? C.red : C.green,
                },
                {
                  label: "Avisos",
                  value: warnings.length,
                  color: warnings.length > 0 ? C.amber : C.inkFaint,
                },
                {
                  label: "Variantes",
                  value: item.variantCount,
                  color: C.inkMid,
                },
              ]} />

              {/* Readiness bar — thin, low-visual-weight */}
              <div style={{
                background: C.lineSubtle, borderRadius: R.pill,
                height: 3, overflow: "hidden",
              }}>
                <div style={{
                  width:        `${item.readinessScore}%`,
                  height:       "100%",
                  background:   item.readinessScore >= 70 ? C.green
                              : item.readinessScore >= 40 ? C.amber
                              : C.red,
                  borderRadius: R.pill,
                }} />
              </div>

              {/* Aspectos por revisar — inline in Resumen (blocking + missing only) */}
              {(blocking.length > 0 || payload.missingForPublish.length > 0) && (
                <MSDrawerSection title="Aspectos por revisar">
                  {blocking.map(issue => (
                    <IssueRow key={issue.code} {...issue} />
                  ))}

                  {payload.missingForPublish.length > 0 && (
                    <div style={{
                      padding:      `${S[2]}px ${S[3]}px`,
                      background:   C.redLight,
                      border:       `1px solid ${C.redBorder}`,
                      borderRadius: R.md,
                    }}>
                      <div style={{
                        fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold,
                        color: C.red, marginBottom: S[1],
                      }}>
                        Campos requeridos para publicar
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[1] }}>
                        {payload.missingForPublish.map((field, i) => (
                          <span key={i} style={{
                            fontFamily: T.mono, fontSize: 9, color: C.red,
                            padding: "1px 6px", borderRadius: R.pill,
                            background: "rgba(220,38,38,0.08)",
                            border: `1px solid ${C.redBorder}`,
                          }}>
                            {field}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {warnings.length > 0 && (
                    <div style={{
                      fontFamily: T.mono, fontSize: 9, color: C.amber,
                    }}>
                      {warnings.length} {warnings.length === 1 ? "advertencia" : "advertencias"}
                      {" "}— ver pestaña Aspectos
                    </div>
                  )}
                </MSDrawerSection>
              )}

              {/* All clear state */}
              {issueCount === 0 && (
                <div style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:          S[2],
                  padding:      `${S[2]}px ${S[3]}px`,
                  background:   C.greenLight,
                  border:       `1px solid ${C.greenBorder}`,
                  borderRadius: R.md,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, flexShrink: 0 }} />
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: C.green }}>
                    Producto listo para publicar en Shopify
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════ Non-Resumen tabs — standard padded layout ════ */}
        {activeTab !== "resumen" && (
          <div style={{
            padding:       S[4],
            display:       "flex",
            flexDirection: "column" as const,
            gap:           S[5],
            paddingBottom: 32,
          }}>

            {/* ── PUBLICACIÓN ── */}
            {activeTab === "publicacion" && (
              <>
                <MSDrawerSection title="Estado en Shopify">
                  {/* ── Live state from Shopify API ── */}
                  {item.externalId ? (
                    liveStateLoading ? (
                      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, padding: `${S[2]}px 0` }}>
                        Consultando estado en Shopify…
                      </div>
                    ) : liveStateError ? (
                      <div style={{
                        padding: `${S[2]}px ${S[3]}px`,
                        background: C.redLight, border: `1px solid ${C.redBorder}`,
                        borderRadius: R.md, fontFamily: T.mono, fontSize: 9, color: C.red,
                      }}>
                        {liveStateError}
                      </div>
                    ) : liveState ? (
                      <>
                        {/* Status badge */}
                        <div style={{
                          display:      "inline-flex", alignItems: "center", gap: S[1],
                          padding:      `${S[1]}px ${S[2]}px`,
                          background:   liveState.status === "active" ? C.greenLight
                                      : liveState.status === "draft"  ? C.amberLight
                                      : C.surface,
                          border:       `1px solid ${liveState.status === "active" ? C.greenBorder : liveState.status === "draft" ? C.amberBorder : C.line}`,
                          borderRadius: R.pill, marginBottom: S[3],
                        }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                            background: SHOPIFY_STATUS_COLOR[liveState.status] ?? C.inkFaint,
                          }} />
                          <span style={{
                            fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold,
                            color: SHOPIFY_STATUS_COLOR[liveState.status] ?? C.inkFaint,
                          }}>
                            {SHOPIFY_STATUS_LABEL[liveState.status] ?? liveState.status}
                            {liveState.status === "draft" && " — no visible en la tienda"}
                            {liveState.status === "active" && " — visible en la tienda"}
                          </span>
                        </div>

                        {/* Live data rows */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3], marginBottom: S[3] }}>
                          {[
                            { label: "Handle en tienda", value: liveState.handle || "—" },
                            { label: "Actualizado en Shopify", value: new Date(liveState.updatedAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) },
                            { label: "Variantes", value: liveState.variantCount },
                            { label: "Imágenes", value: liveState.imageCount },
                          ].map(row => (
                            <div key={row.label}>
                              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.ink, lineHeight: 1, marginBottom: 2 }}>
                                {row.value}
                              </div>
                              <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                                {row.label}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Drift detection */}
                        {item.lastSyncAt && new Date(liveState.updatedAt) > new Date(item.lastSyncAt) && (
                          <div style={{
                            padding: `${S[2]}px ${S[3]}px`,
                            background: C.amberLight, border: `1px solid ${C.amberBorder}`,
                            borderRadius: R.md, fontFamily: T.mono, fontSize: 9, color: C.amber,
                          }}>
                            ▲ Cambios detectados — Shopify fue actualizado desde la última sincronización de Agentik.
                          </div>
                        )}

                        <div style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          marginTop: S[2],
                        }}>
                          <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkGhost }}>
                            Consultado: {new Date(liveState.fetchedAt).toLocaleTimeString("es-MX")}
                          </div>
                          {liveState.adminUrl && (
                            <a
                              href={liveState.adminUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontFamily:     T.mono,
                                fontSize:       9,
                                color:          C.blueDark,
                                fontWeight:     T.wt.semibold,
                                textDecoration: "none",
                                display:        "inline-flex",
                                alignItems:     "center",
                                gap:            3,
                              }}
                            >
                              Abrir en Shopify →
                            </a>
                          )}
                        </div>
                      </>
                    ) : null
                  ) : (
                    <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                      Producto no publicado en Shopify todavía. Publica el producto para ver su estado en tiempo real.
                    </div>
                  )}
                </MSDrawerSection>

                <MSDrawerSection title="Información enviada a Shopify">
                  <InfoRow label="Título"                  value={payload.title}              truncate />
                  <InfoRow label="Identificador en tienda" value={payload.handle}             truncate />
                  <InfoRow label="Tipo de producto"        value={payload.productType || "—"} />
                  <InfoRow label="Marca"                   value={payload.vendor} />
                  <InfoRow label="SKU"                     value={item.sku} />
                  <InfoRow label="Variantes"               value={payload.variants.length} />
                  <InfoRow label="Imágenes"                value={payload.images.length} />
                  <InfoRow label="Estado"                  value={payload.status} />
                  <InfoRow label="Inventario"              value={payload.tracksInventory ? "Rastreado" : "Sin rastreo"} />
                </MSDrawerSection>

                <MSDrawerSection title="Etiquetas">
                  {payload.tags.length > 0 ? (
                    <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" as const }}>
                      {payload.tags.map(tag => (
                        <span key={tag} style={{
                          fontFamily: T.mono, fontSize: 8, padding: "1px 6px",
                          borderRadius: R.pill, background: C.surface,
                          color: C.inkMid, border: `1px solid ${C.line}`,
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                      Sin etiquetas
                    </span>
                  )}
                </MSDrawerSection>

                <MSDrawerSection title="Colecciones sugeridas">
                  {payload.suggestedCollections.length > 0 ? (
                    <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" as const }}>
                      {payload.suggestedCollections.map(col => (
                        <span key={col} style={{
                          fontFamily: T.mono, fontSize: 8, padding: "1px 6px",
                          borderRadius: R.pill, background: C.blueLight,
                          color: C.blueDark, border: `1px solid ${C.blueBorder}`,
                        }}>
                          {col}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                      Sin colecciones sugeridas
                    </span>
                  )}
                </MSDrawerSection>

                <MSDrawerSection title="SEO">
                  <InfoRow label="Título SEO"       value={payload.seo.title} />
                  <InfoRow label="Descripción SEO"  value={payload.seo.description} />
                  {!payload.seo.title && (
                    <div style={{
                      fontFamily: T.mono, fontSize: 9, color: C.amber, marginTop: S[2],
                    }}>
                      ▲ Sin título SEO — se generará automáticamente desde el nombre del producto.
                    </div>
                  )}
                </MSDrawerSection>
              </>
            )}

            {/* ── ASPECTOS ── */}
            {activeTab === "aspectos" && (
              <>
                {blocking.length === 0 && warnings.length === 0 && payload.missingForPublish.length === 0 ? (
                  <div style={{
                    textAlign: "center", padding: `40px ${S[4]}px`,
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                  }}>
                    Sin aspectos por revisar — producto listo para publicar.
                  </div>
                ) : (
                  <>
                    {blocking.length > 0 && (
                      <MSDrawerSection title={`Requisitos bloqueantes (${blocking.length})`}>
                        {blocking.map(issue => (
                          <IssueRow key={issue.code} {...issue} />
                        ))}
                      </MSDrawerSection>
                    )}

                    {warnings.length > 0 && (
                      <MSDrawerSection title={`Advertencias (${warnings.length})`}>
                        {warnings.map(issue => (
                          <IssueRow key={issue.code} {...issue} />
                        ))}
                      </MSDrawerSection>
                    )}

                    {payload.missingForPublish.length > 0 && (
                      <MSDrawerSection title="Campos requeridos para publicar">
                        <>
                          {payload.missingForPublish.map((field, i) => (
                            <div key={i} style={{
                              display: "flex", alignItems: "center", gap: S[2],
                              padding: `${S[1]}px ${S[3]}px`,
                              background: C.redLight, border: `1px solid ${C.redBorder}`,
                              borderRadius: R.md, marginBottom: S[1],
                            }}>
                              <span style={{ fontFamily: T.mono, fontSize: 9, color: C.red }}>✕</span>
                              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red }}>
                                {field}
                              </span>
                            </div>
                          ))}
                          <div style={{
                            fontFamily: T.mono, fontSize: 9,
                            color: C.inkFaint, marginTop: S[2],
                          }}>
                            Completa estos campos en Biblioteca → editar producto
                          </div>
                        </>
                      </MSDrawerSection>
                    )}
                  </>
                )}
              </>
            )}

            {/* ── SINCRONIZACIÓN ── */}
            {activeTab === "sincronizacion" && (
              <>
                <MSDrawerSection title="Estado de sincronización">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
                    {[
                      {
                        label: "Última sincronización",
                        value: item.lastSyncAt
                          ? new Date(item.lastSyncAt).toLocaleDateString("es-MX")
                          : "Nunca",
                      },
                      {
                        label: "Diferencia (días)",
                        value: item.syncDriftDays !== null ? `${item.syncDriftDays} días` : "—",
                      },
                      { label: "ID externo",  value: item.externalId ?? "—" },
                      { label: "Reintentos",  value: item.retryCount },
                    ].map(s => (
                      <div key={s.label}>
                        <div style={{
                          fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
                          color: C.ink, lineHeight: 1, marginBottom: 2,
                        }}>
                          {s.value}
                        </div>
                        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                          {s.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {item.syncDriftDays !== null && item.syncDriftDays > 7 && (
                    <div style={{
                      padding:      `${S[2]}px ${S[3]}px`,
                      background:   item.syncDriftDays > 30 ? C.redLight   : C.amberLight,
                      border:       `1px solid ${item.syncDriftDays > 30 ? C.redBorder : C.amberBorder}`,
                      borderRadius: R.md,
                      fontFamily:   T.mono, fontSize: 9,
                      color:        item.syncDriftDays > 30 ? C.red : C.amber,
                    }}>
                      {item.syncDriftDays > 30
                        ? `Sincronización crítica: ${item.syncDriftDays} días sin actualizar`
                        : `Aviso: ${item.syncDriftDays} días desde la última sincronización`}
                    </div>
                  )}
                </MSDrawerSection>

                <MSDrawerSection title="Reconciliación con Shopify">
                  {item.externalId ? (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
                        {[
                          { label: "ID externo",              value: item.externalId },
                          {
                            label: "Última sincronización",
                            value: item.lastSyncAt
                              ? new Date(item.lastSyncAt).toLocaleDateString("es-MX")
                              : "—",
                          },
                          {
                            label: "Diferencia (días)",
                            value: item.syncDriftDays !== null ? `${item.syncDriftDays} días` : "—",
                          },
                          { label: "Reintentos", value: item.retryCount },
                        ].map(row => (
                          <div key={row.label}>
                            <div style={{
                              fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
                              color: C.ink, marginBottom: 2,
                            }}>
                              {row.value}
                            </div>
                            <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                              {row.label}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{
                        padding: `${S[2]}px ${S[3]}px`,
                        background: C.blueLight, border: `1px solid ${C.blueBorder}`,
                        borderRadius: R.md, fontFamily: T.mono, fontSize: 9, color: C.blueDark,
                      }}>
                        Para ver diferencias en tiempo real, ejecuta verificación de
                        sincronización desde el panel de Shopify Commerce OS.
                      </div>
                    </>
                  ) : (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                      Producto no publicado en Shopify — sin reconciliación disponible.
                    </div>
                  )}
                </MSDrawerSection>
              </>
            )}

            {/* ── SEÑALES ── */}
            {activeTab === "senales" && item.lucaSignals.length > 0 && (
              <MSDrawerSection title="Señales de Luca">
                {item.lucaSignals.map(signal => (
                  <div key={signal.key} style={{
                    display: "flex", gap: S[2], alignItems: "flex-start",
                    padding: `${S[2]}px ${S[3]}px`,
                    background:
                      signal.level === "opportunity" ? C.blueLight  :
                      signal.level === "warning"     ? C.amberLight :
                      C.surface,
                    border: `1px solid ${
                      signal.level === "opportunity" ? C.blueBorder  :
                      signal.level === "warning"     ? C.amberBorder :
                      C.line
                    }`,
                    borderRadius: R.md, marginBottom: S[2],
                  }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: "50%",
                      flexShrink: 0, marginTop: 4,
                      background:
                        signal.level === "opportunity" ? C.blueDark :
                        signal.level === "warning"     ? C.amber    :
                        C.inkLight,
                    }} />
                    <div>
                      <div style={{
                        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
                        color:
                          signal.level === "opportunity" ? C.blueDark :
                          signal.level === "warning"     ? C.amber    :
                          C.inkMid,
                        marginBottom: 2,
                      }}>
                        {signal.label}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid }}>
                        {signal.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </MSDrawerSection>
            )}

          </div>
        )}

      </div>

      {/* ── Footer (fixed) ── */}
      <MSDrawerFooter actions={footerActions} />

    </MSDrawer>
  );
}
