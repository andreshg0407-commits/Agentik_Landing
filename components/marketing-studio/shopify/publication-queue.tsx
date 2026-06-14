/**
 * components/marketing-studio/shopify/publication-queue.tsx
 *
 * SHOPIFY-CATALOG-BULK-FILTERS-02 — Catálogo Shopify · Centro Operativo
 * SHOPIFY-CATALOG-BULK-FILTERS-02B — Capa de presentación pura
 *
 * Responsabilidades de este archivo:
 *   - Estado UI (filtro activo, selección, drawer, bulk op)
 *   - Render de filtros, cards, panel de bloqueos, drawer
 *   - Selección múltiple
 *   - BulkOpDialog (dryRun → confirm → ejecutar)
 *   - Llamadas a endpoints de API
 *
 * Toda la lógica de negocio vive en:
 *   lib/marketing-studio/commerce/shopify-catalog-ui-selectors.ts
 */

"use client";

import { useState, useMemo, useEffect }  from "react";
import { Package }                        from "lucide-react";
import { C, T, S, R }                    from "@/lib/ui/tokens";
import {
  MS_PALETTE,
  MS_SHADOWS,
  MS_CARD,
  MS_TYPOGRAPHY,
}                                         from "@/lib/marketing-studio/ms-design-system";
import type { PublicationQueueItem }     from "@/lib/marketing-studio/commerce/publication-engine";
import {
  PUBLICATION_STATUS_LABEL,
  PUBLICATION_STATUS,
}                                         from "@/lib/marketing-studio/commerce/commerce-types";
import {
  applyShopifyCatalogFilters,
  getShopifyCatalogStatusChips,
  getShopifyCatalogDisplayBlockers,
}                                         from "@/lib/marketing-studio/commerce/shopify-catalog-ui-selectors";
import type {
  ShopifyCatalogFilterId,
  ShopifyCatalogStatusChip,
}                                         from "@/lib/marketing-studio/commerce/shopify-catalog-ui-selectors";
import { PublicationDetailDrawer }       from "./publication-detail-drawer";

// ── Domain ──────────────────────────────────────────────────────────────────

const DOMAIN  = MS_PALETTE.product;
const PRIMARY = DOMAIN.primary;

// ── Visual status config ─────────────────────────────────────────────────────

const PUB_STATUS_CONFIG: Record<string, { bg: string; border: string; text: string }> = {
  draft:     { bg: C.surface,    border: C.line,         text: C.inkLight },
  queued:    { bg: C.amberLight, border: C.amberBorder,  text: C.amber    },
  syncing:   { bg: C.blueLight,  border: C.blueBorder,   text: C.blueDark },
  published: { bg: C.greenLight, border: C.greenBorder,  text: C.green    },
  partial:   { bg: C.amberLight, border: C.amberBorder,  text: C.amber    },
  failed:    { bg: C.redLight,   border: C.redBorder,    text: C.red      },
  archived:  { bg: C.surface,    border: C.line,         text: C.inkFaint },
  paused:    { bg: C.surfaceAlt, border: C.line,         text: C.inkLight },
};

const SYNC_HEALTH_CONFIG: Record<string, { dot: string; label: string }> = {
  healthy:      { dot: C.green,    label: "Saludable"    },
  warning:      { dot: C.amber,    label: "Advertencia"  },
  critical:     { dot: C.red,      label: "Crítico"      },
  disconnected: { dot: C.inkFaint, label: "Desconectado" },
};

// ── Filter presentation ──────────────────────────────────────────────────────
// Labels only — predicate logic lives in shopify-catalog-ui-selectors.ts

const FILTER_CHIPS: { id: ShopifyCatalogFilterId; label: string }[] = [
  { id: "all",             label: "Todos"                          },
  { id: "ready",           label: "Listos para publicar"           },
  { id: "need_enrichment", label: "Requieren completar información" },
  { id: "published",       label: "Ya publicados"                  },
  { id: "modified",        label: "Modificados"                    },
  { id: "blocking",        label: "Con errores"                    },
];

// ── Bulk operation types ─────────────────────────────────────────────────────

type BulkOperation = "publish" | "update" | "activate";

const BULK_LABELS: Record<BulkOperation, { gerund: string; doneCount: string }> = {
  publish:  { gerund: "Publicando…",   doneCount: "publicados"   },
  update:   { gerund: "Actualizando…", doneCount: "actualizados" },
  activate: { gerund: "Activando…",    doneCount: "activados"    },
};

interface BulkPreview {
  operation:          BulkOperation;
  publishableCount?:  number;
  updateableCount?:   number;
  blockedCount?:      number;
  alreadyDoneCount?:  number;
  autoFixAvailable?:  boolean;
  total?:             number;
}

interface BulkDone { successCount: number; failedCount: number; error?: string }

type DialogStep =
  | { step: "previewing" }
  | { step: "confirming"; preview: BulkPreview }
  | { step: "executing" }
  | { step: "error"; message: string };

// ── BulkOpDialog ─────────────────────────────────────────────────────────────

function BulkOpDialog({
  operation, productIds, orgSlug, onClose,
}: {
  operation:  BulkOperation;
  productIds: string[];
  orgSlug:    string;
  onClose:    (result?: BulkDone) => void;
}) {
  const [dialogStep, setDialogStep] = useState<DialogStep>({ step: "previewing" });
  const labels = BULK_LABELS[operation];

  const API_PATH: Record<BulkOperation, string> = {
    publish:  `/api/orgs/${orgSlug}/marketing-studio/shopify/catalog/publish-ready`,
    update:   `/api/orgs/${orgSlug}/marketing-studio/shopify/catalog/update-modified`,
    activate: `/api/orgs/${orgSlug}/marketing-studio/shopify/catalog/activate-drafts`,
  };

  useEffect(() => {
    let cancelled = false;
    fetch(API_PATH[operation], {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ dryRun: true, productIds }),
    })
      .then(r => r.json())
      .then((data: Record<string, unknown>) => {
        if (cancelled) return;
        if (!data.ok) {
          setDialogStep({ step: "error", message: String(data.error ?? "Error al analizar") });
          return;
        }
        const preview: BulkPreview = { operation };
        if (operation === "publish") {
          preview.publishableCount = Number(data.publishableCount ?? 0);
          preview.updateableCount  = Number(data.updateableCount  ?? 0);
          preview.blockedCount     = Number(data.blockedCount     ?? 0);
          preview.alreadyDoneCount = Number(data.alreadyPublishedCount ?? 0);
          preview.autoFixAvailable = !!data.autoFixAvailable;
        } else {
          preview.total = Number(data.total ?? 0);
        }
        setDialogStep({ step: "confirming", preview });
      })
      .catch(() => {
        if (!cancelled) setDialogStep({ step: "error", message: "Error de red al analizar" });
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConfirm() {
    setDialogStep({ step: "executing" });
    try {
      const res  = await fetch(API_PATH[operation], {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ dryRun: false, productIds }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok || !data.ok) {
        onClose({ successCount: 0, failedCount: 0, error: String(data.error ?? "Error al ejecutar") });
      } else {
        const success =
          operation === "publish"  ? Number(data.published  ?? 0) :
          operation === "update"   ? Number(data.updated    ?? 0) :
                                     Number(data.activated  ?? 0);
        onClose({ successCount: success, failedCount: Number(data.failed ?? 0) });
      }
    } catch {
      onClose({ successCount: 0, failedCount: 0, error: "Error de red" });
    }
  }

  const hasAction =
    dialogStep.step === "confirming" && (
      operation === "publish"
        ? (dialogStep.preview.publishableCount ?? 0) + (dialogStep.preview.updateableCount ?? 0) > 0
        : (dialogStep.preview.total ?? 0) > 0
    );

  return (
    <div
      onClick={() => onClose()}
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.white, borderRadius: R.lg,
          border: `1px solid ${C.line}`,
          boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
          padding: `${S[5]}px`, width: 400, maxWidth: "90vw",
        }}
      >
        {dialogStep.step === "previewing" && (
          <>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink, marginBottom: S[2] }}>
              {labels.gerund}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              Analizando {productIds.length} producto{productIds.length !== 1 ? "s" : ""}…
            </div>
          </>
        )}

        {dialogStep.step === "confirming" && (
          <>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink, marginBottom: S[1] }}>
              Resumen de la operación
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[4] }}>
              {productIds.length} producto{productIds.length !== 1 ? "s" : ""} en el subconjunto seleccionado
            </div>

            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2], marginBottom: S[4] }}>
              {operation === "publish" ? (
                <>
                  {(dialogStep.preview.publishableCount ?? 0) > 0 && (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green }}>
                      ✓ {dialogStep.preview.publishableCount} se {dialogStep.preview.publishableCount === 1 ? "publicará" : "publicarán"}
                    </div>
                  )}
                  {(dialogStep.preview.updateableCount ?? 0) > 0 && (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark }}>
                      ↑ {dialogStep.preview.updateableCount} se {dialogStep.preview.updateableCount === 1 ? "actualizará" : "actualizarán"}
                    </div>
                  )}
                  {(dialogStep.preview.blockedCount ?? 0) > 0 && (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber }}>
                      ▲ {dialogStep.preview.blockedCount} {dialogStep.preview.blockedCount === 1 ? "requiere completar información" : "requieren completar información"}
                    </div>
                  )}
                  {(dialogStep.preview.alreadyDoneCount ?? 0) > 0 && (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                      — {dialogStep.preview.alreadyDoneCount} ya {dialogStep.preview.alreadyDoneCount === 1 ? "está publicado" : "están publicados"}
                    </div>
                  )}
                  {dialogStep.preview.autoFixAvailable && (
                    <div style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark,
                      padding: `${S[2]}px ${S[3]}px`,
                      background: C.blueLight, borderRadius: R.md, border: `1px solid ${C.blueBorder}`,
                    }}>
                      ✦ Algunos productos podrán completarse con Copilot antes de publicarse.
                    </div>
                  )}
                  {!hasAction && (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                      Sin productos para publicar en este subconjunto.
                    </div>
                  )}
                </>
              ) : (
                (dialogStep.preview.total ?? 0) > 0 ? (
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green }}>
                    ✓ {dialogStep.preview.total} producto{(dialogStep.preview.total ?? 0) !== 1 ? "s" : ""} {labels.doneCount === "actualizados" ? "se actualizarán" : "se activarán"}
                  </div>
                ) : (
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                    Sin candidatos para {operation === "update" ? "actualizar" : "activar"} en este subconjunto.
                  </div>
                )
              )}
            </div>

            <div style={{ display: "flex", gap: S[2] }}>
              {hasAction && (
                <button
                  onClick={handleConfirm}
                  style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                    padding: `${S[2]}px ${S[4]}px`, borderRadius: R.md,
                    border: "none", background: C.blueDark, color: C.white, cursor: "pointer",
                  }}
                >
                  Confirmar
                </button>
              )}
              <button
                onClick={() => onClose()}
                style={{
                  fontFamily: T.mono, fontSize: T.sz.xs,
                  padding: `${S[2]}px ${S[3]}px`, borderRadius: R.md,
                  border: `1px solid ${C.line}`, background: C.white, color: C.inkMid, cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          </>
        )}

        {dialogStep.step === "executing" && (
          <>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink, marginBottom: S[2] }}>
              {labels.gerund}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              Aplicando cambios en Shopify…
            </div>
          </>
        )}

        {dialogStep.step === "error" && (
          <>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red, marginBottom: S[3] }}>
              {dialogStep.message}
            </div>
            <button
              onClick={() => onClose()}
              style={{
                fontFamily: T.mono, fontSize: T.sz.xs,
                padding: `${S[2]}px ${S[3]}px`, borderRadius: R.md,
                border: `1px solid ${C.line}`, background: C.white, color: C.inkMid, cursor: "pointer",
              }}
            >
              Cerrar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── BlockedProductsPanel ──────────────────────────────────────────────────────
// List view for products in the "Con errores" filter.
// Blockers derived via getShopifyCatalogDisplayBlockers (domain selector).

function BlockedProductsPanel({
  items,
  onSelect,
}: {
  items:    PublicationQueueItem[];
  onSelect: (item: PublicationQueueItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div style={{
        padding: `${S[8]}px ${S[4]}px`, textAlign: "center" as const,
        fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
      }}>
        <div style={{ marginBottom: S[2], color: C.inkFaint, opacity: 0.5 }}>
          <Package size={28} strokeWidth={1.4} />
        </div>
        Sin productos con errores.
      </div>
    );
  }

  return (
    <div className="ag-op-table">
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 100px 1fr",
        gap: `0 ${S[3]}px`, padding: `${S[1]}px ${S[3]}px`,
        borderBottom: `1px solid ${C.line}`,
        fontFamily: T.mono, fontSize: 9, color: C.inkFaint,
        textTransform: "uppercase" as const, letterSpacing: "0.04em",
      }}>
        <span>Producto</span>
        <span>Bloqueos</span>
        <span>Motivo · Resolución</span>
      </div>

      {items.map(item => {
        const blockers = getShopifyCatalogDisplayBlockers(item);
        return (
          <div
            key={item.productId}
            onClick={() => onSelect(item)}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onSelect(item); }}
            className="ag-op-row"
            style={{
              display: "grid", gridTemplateColumns: "1fr 100px 1fr",
              gap: `0 ${S[3]}px`, padding: `${S[3]}px ${S[3]}px`,
              borderBottom: `1px solid ${C.lineSubtle}`, cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.medium, color: C.ink }}>
                {item.productName}
              </div>
              {item.sku && (
                <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 2 }}>
                  {item.sku}
                </div>
              )}
              {item.category && (
                <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                  {item.category}
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", paddingTop: 2 }}>
              <span style={{
                fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
                padding: "1px 6px", borderRadius: R.pill,
                background: C.redLight, border: `1px solid ${C.redBorder}`, color: C.red,
              }}>
                {item.blockingCount} {item.blockingCount === 1 ? "bloqueo" : "bloqueos"}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
              {blockers.slice(0, 5).map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{
                    fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold, flexShrink: 0,
                    color: b.canCopilotFix ? C.green : C.red,
                  }}>
                    {b.canCopilotFix ? "✓" : "✕"}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: C.ink }}>{b.label}</span>
                  {b.canCopilotFix && (
                    <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                      · Copilot podrá completarlo
                    </span>
                  )}
                </div>
              ))}
              {blockers.length > 5 && (
                <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                  +{blockers.length - 5} más — clic para ver detalle
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── EmptyQueue ────────────────────────────────────────────────────────────────

function EmptyQueue({ filter }: { filter: ShopifyCatalogFilterId }) {
  const messages: Partial<Record<ShopifyCatalogFilterId, string>> = {
    ready:           "Sin productos listos para publicar en este momento.",
    published:       "No hay productos publicados en este canal.",
    blocking:        "Sin productos con errores activos.",
    modified:        "Sin productos modificados desde la última sincronización.",
    need_enrichment: "Sin productos que requieran completar información.",
  };
  return (
    <div style={{
      padding: `${S[8]}px ${S[4]}px`, textAlign: "center" as const,
      fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
    }}>
      <div style={{ marginBottom: S[2], color: C.inkFaint, opacity: 0.5 }}>
        <Package size={28} strokeWidth={1.4} />
      </div>
      {messages[filter] ?? "Sin productos en el catálogo."}
    </div>
  );
}

// ── ShopifyProductCard ────────────────────────────────────────────────────────
// Pure presentation: receives isChecked, chips from domain selectors.

function ShopifyProductCard({
  item, isChecked, onToggle, onClick,
}: {
  item:      PublicationQueueItem;
  isChecked: boolean;
  onToggle:  () => void;
  onClick:   () => void;
}) {
  const pubCfg   = PUB_STATUS_CONFIG[item.publicationStatus] ?? PUB_STATUS_CONFIG.draft;
  const pubLabel = PUBLICATION_STATUS_LABEL[item.publicationStatus as keyof typeof PUBLICATION_STATUS_LABEL] ?? item.publicationStatus;
  const syncCfg  = SYNC_HEALTH_CONFIG[item.syncHealth] ?? SYNC_HEALTH_CONFIG.disconnected;
  const rdColor  = item.readinessScore >= 70 ? C.green : item.readinessScore >= 40 ? C.amber : C.red;

  // Domain selectors — no business logic here
  const chips: ShopifyCatalogStatusChip[] = getShopifyCatalogStatusChips(item);

  const identity   = [item.sku, item.category].filter(Boolean).join(" · ") || "Sin identificación";
  const driftLabel = item.syncDriftDays !== null ? (item.syncDriftDays === 0 ? "Hoy" : `${item.syncDriftDays}d`) : "—";
  const driftColor = item.syncDriftDays !== null && item.syncDriftDays > 14 ? C.amber : C.inkFaint;

  const dims: Array<{ key: string; label: string; ok: boolean }> = [
    { key: "assets", label: "Recursos visuales",  ok: item.assetCount > 0                        },
    { key: "vars",   label: "Variantes",           ok: item.variantCount > 0                      },
    { key: "seo",    label: "SEO",                 ok: !!(item.shopifyPayload?.seo?.title)        },
    { key: "cont",   label: "Descripción",         ok: !!(item.shopifyPayload?.bodyHtml?.trim())  },
    { key: "sho",    label: "Publicado",           ok: item.publicationStatus === PUBLICATION_STATUS.PUBLISHED || !!item.externalId },
  ];

  return (
    <div style={{
      display: "flex", flexDirection: "column" as const,
      width: "100%",
      background:   isChecked ? `rgba(0,74,173,0.04)` : DOMAIN.cardBg,
      border:       `1px solid ${isChecked ? C.blueDark : "#e8eaed"}`,
      borderRadius: MS_CARD.borderRadius,
      padding:      MS_CARD.padding,
      textAlign:    "left" as const,
      boxSizing:    "border-box" as const,
      minWidth:     0,
      boxShadow:    isChecked ? "none" : MS_SHADOWS.card,
      transition:   "box-shadow 0.15s, border-color 0.15s",
      position:     "relative" as const,
      cursor:       "pointer",
    }}>
      {/* Checkbox — top left */}
      <input
        type="checkbox"
        checked={isChecked}
        onChange={onToggle}
        onClick={e => e.stopPropagation()}
        aria-label={`Seleccionar ${item.productName}`}
        style={{
          position: "absolute" as const, top: 8, left: 8,
          width: 14, height: 14, cursor: "pointer",
          accentColor: C.blueDark, zIndex: 2,
        }}
      />

      {/* Publication status badge — top right */}
      <span
        onClick={onClick}
        style={{
          position:      "absolute" as const, top: 8, right: 8,
          fontFamily:    T.mono, fontSize: MS_TYPOGRAPHY.badgeSize,
          fontWeight:    T.wt.bold, letterSpacing: MS_TYPOGRAPHY.badgeTracking,
          textTransform: "uppercase" as const,
          padding: "2px 5px", borderRadius: R.pill,
          background: pubCfg.bg, color: pubCfg.text, border: `1px solid ${pubCfg.border}`,
          lineHeight: "1.4", whiteSpace: "nowrap" as const, cursor: "pointer",
        }}
      >
        {pubLabel}
      </span>

      {/* Clickable content */}
      <div onClick={onClick} style={{ flex: 1, display: "flex", flexDirection: "column" as const, paddingLeft: 18 }}>

        {/* Row 1: Thumbnail + name */}
        <div style={{ display: "flex", gap: S[2], alignItems: "flex-start", marginBottom: S[3] }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0, overflow: "hidden" as const,
            background: item.primaryAssetUrl
              ? C.line
              : `linear-gradient(145deg, rgba(255,255,255,0.92) 0%, ${DOMAIN.iconBg} 100%)`,
            boxShadow: MS_SHADOWS.appIcon(PRIMARY),
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {item.primaryAssetUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.primaryAssetUrl} alt={item.productName}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                loading="lazy" decoding="async"
              />
            ) : (
              <Package size={18} strokeWidth={1.6} color={PRIMARY} opacity={0.55} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 48, paddingTop: 1 }}>
            <div style={{
              fontFamily: T.mono, fontSize: MS_TYPOGRAPHY.cardTitleSize, fontWeight: T.wt.bold,
              color: C.ink, letterSpacing: "-0.02em",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, lineHeight: 1.3,
            }}>
              {item.productName}
            </div>
            <div style={{
              fontFamily: T.mono, fontSize: MS_TYPOGRAPHY.descSize, color: C.inkMid, marginTop: 2,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
            }}>
              {identity}
            </div>
          </div>
        </div>

        {/* Row 2: Readiness bar */}
        <div style={{ marginBottom: S[2] }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontFamily: T.mono, fontSize: MS_TYPOGRAPHY.tagSize, color: C.inkFaint }}>
              Preparación Shopify
            </span>
            <span style={{ fontFamily: T.mono, fontSize: MS_TYPOGRAPHY.tagSize, fontWeight: T.wt.bold, color: rdColor, fontVariantNumeric: "tabular-nums" }}>
              {item.readinessScore}%
            </span>
          </div>
          <div style={{ height: 3, borderRadius: R.pill, background: C.line, overflow: "hidden" }}>
            <div style={{ width: `${item.readinessScore}%`, height: "100%", background: rdColor, borderRadius: R.pill }} />
          </div>
        </div>

        {/* Row 3: Checklist */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 2, columnGap: S[2], marginBottom: S[2] }}>
          {dims.map(d => (
            <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
              <span style={{
                fontFamily: T.mono, fontSize: MS_TYPOGRAPHY.tagSize,
                color: d.ok ? C.green : C.red, fontWeight: T.wt.bold, flexShrink: 0, lineHeight: "18px",
              }}>
                {d.ok ? "✓" : "✕"}
              </span>
              <span style={{
                fontFamily: T.mono, fontSize: MS_TYPOGRAPHY.tagSize,
                color: d.ok ? C.inkLight : C.ink,
                lineHeight: "18px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
              }}>
                {d.label}
              </span>
            </div>
          ))}
        </div>

        {/* Row 4: Status chips — from domain selector */}
        {chips.length > 0 && (
          <div style={{ display: "flex", gap: S[1], marginBottom: S[2], flexWrap: "wrap" as const }}>
            {chips.map(chip => (
              <span key={chip.label} style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.medium,
                padding: "2px 6px", borderRadius: R.pill,
                background: chip.bg, border: `1px solid ${chip.border}`, color: chip.text,
                whiteSpace: "nowrap" as const,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: chip.dot, flexShrink: 0 }} />
                {chip.label}
              </span>
            ))}
          </div>
        )}

        {/* Row 5: Sync footer */}
        <div style={{
          display: "flex", alignItems: "center", gap: S[2],
          marginTop: "auto", borderTop: `1px solid ${C.lineSubtle}`, paddingTop: S[2],
        }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontFamily: T.mono, fontSize: MS_TYPOGRAPHY.tagSize, color: syncCfg.dot,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: syncCfg.dot, flexShrink: 0 }} />
            {syncCfg.label}
          </span>

          {item.blockingCount > 0 && (
            <span style={{
              fontFamily: T.mono, fontSize: MS_TYPOGRAPHY.tagSize, fontWeight: T.wt.bold,
              padding: "1px 5px", borderRadius: R.sm,
              background: C.redLight, border: `1px solid ${C.redBorder}`, color: C.red,
            }}>
              {item.blockingCount} {item.blockingCount === 1 ? "bloqueo" : "bloqueos"}
            </span>
          )}

          <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: MS_TYPOGRAPHY.tagSize, color: driftColor }}>
            {driftLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── PublicationQueue ──────────────────────────────────────────────────────────

interface PublicationQueueProps {
  queue:      PublicationQueueItem[];
  orgSlug:    string;
  categories: string[];
}

interface ActiveBulkOp { operation: BulkOperation; productIds: string[] }

export function PublicationQueue({ queue, orgSlug, categories }: PublicationQueueProps) {
  const [activeFilter,   setActiveFilter]   = useState<ShopifyCatalogFilterId>("all");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search,         setSearch]         = useState("");
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set());
  const [drawerItem,     setDrawerItem]     = useState<PublicationQueueItem | null>(null);
  const [activeBulkOp,   setActiveBulkOp]  = useState<ActiveBulkOp | null>(null);
  const [lastResult,     setLastResult]     = useState<{ op: BulkOperation; done: BulkDone } | null>(null);

  // Domain selector — single source of truth for what "filtered" means
  const filtered = useMemo(
    () => applyShopifyCatalogFilters(queue, { filter: activeFilter, category: activeCategory, search }),
    [queue, activeFilter, activeCategory, search],
  );

  const filteredIds  = useMemo(() => filtered.map(i => i.productId), [filtered]);
  const selectedList = useMemo(() => [...selectedIds], [selectedIds]);
  const hasSelection = selectedList.length > 0;
  const allVisible   = filtered.length > 0 && filtered.every(i => selectedIds.has(i.productId));

  function toggleItem(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allVisible) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(i => next.delete(i.productId));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(i => next.add(i.productId));
        return next;
      });
    }
  }

  function startBulkOp(operation: BulkOperation) {
    const productIds = hasSelection ? selectedList : filteredIds;
    if (productIds.length === 0) return;
    setActiveBulkOp({ operation, productIds });
    setLastResult(null);
  }

  function handleBulkClose(result?: BulkDone) {
    const op = activeBulkOp?.operation;
    setActiveBulkOp(null);
    if (op && result) setLastResult({ op, done: result });
  }

  const scopeLabel = hasSelection
    ? `${selectedList.length} seleccionado${selectedList.length !== 1 ? "s" : ""}`
    : `${filtered.length} filtrado${filtered.length !== 1 ? "s" : ""}`;

  return (
    <>
      {/* ── Result notification ── */}
      {lastResult && (
        <div style={{
          display: "flex", alignItems: "center", gap: S[2],
          padding: `${S[2]}px ${S[3]}px`,
          background: lastResult.done.error ? C.redLight : C.greenLight,
          border: `1px solid ${lastResult.done.error ? C.redBorder : C.greenBorder}`,
          borderRadius: R.md, marginBottom: S[3],
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: lastResult.done.error ? C.red : C.green }}>
            {lastResult.done.error
              ? lastResult.done.error
              : `${lastResult.done.successCount} ${BULK_LABELS[lastResult.op].doneCount}${lastResult.done.failedCount > 0 ? ` · ${lastResult.done.failedCount} fallidos` : ""}`}
          </span>
          <button
            onClick={() => setLastResult(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.inkFaint, fontFamily: T.mono, fontSize: T.sz.xs, marginLeft: "auto" }}
          >
            ×
          </button>
        </div>
      )}

      {/* ── Filter bar ── */}
      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const, marginBottom: S[3], alignItems: "center" }}>
        <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" as const, flex: 1 }}>
          {FILTER_CHIPS.map(chip => {
            const isActive = activeFilter === chip.id;
            return (
              <button
                key={chip.id}
                onClick={() => setActiveFilter(chip.id)}
                style={{
                  padding: `${S[1]}px ${S[3]}px`, borderRadius: R.pill,
                  border:      `1px solid ${isActive ? C.blueDark : C.line}`,
                  background:  isActive ? C.blueDark : C.white,
                  color:       isActive ? C.white : C.inkLight,
                  fontFamily:  T.mono, fontSize: "10px",
                  fontWeight:  isActive ? T.wt.bold : T.wt.medium,
                  cursor:      "pointer", transition: "all 0.15s",
                  letterSpacing: "0.02em", whiteSpace: "nowrap" as const,
                }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {categories.length > 0 && (
          <select
            value={activeCategory ?? ""}
            onChange={e => setActiveCategory(e.target.value || null)}
            style={{
              padding: `${S[1]}px ${S[2]}px`,
              border: `1px solid ${activeCategory ? C.blueDark : C.line}`,
              borderRadius: R.md,
              background: activeCategory ? C.blueLight : C.white,
              color: activeCategory ? C.blueDark : C.inkLight,
              fontFamily: T.mono, fontSize: "10px",
              cursor: "pointer", outline: "none",
            }}
          >
            <option value="">Categoría</option>
            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        )}

        <input
          type="text"
          placeholder="Buscar referencia, SKU…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: `${S[1]}px ${S[3]}px`,
            border: `1px solid ${C.line}`, borderRadius: R.md,
            background: C.white, color: C.ink,
            fontFamily: T.mono, fontSize: T.sz.xs,
            outline: "none", width: 190, flexShrink: 0,
          }}
        />
      </div>

      {/* ── Bulk actions bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: S[2],
        padding: `${S[2]}px ${S[3]}px`,
        background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.md,
        marginBottom: S[4], flexWrap: "wrap" as const,
      }}>
        <label style={{ display: "flex", alignItems: "center", gap: S[1], cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={allVisible}
            onChange={toggleAll}
            style={{ width: 13, height: 13, accentColor: C.blueDark, cursor: "pointer" }}
          />
          <span style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight }}>
            {allVisible ? "Deseleccionar visibles" : "Seleccionar todos los visibles"}
          </span>
        </label>

        {hasSelection && (
          <>
            <span style={{ fontFamily: T.mono, fontSize: "10px", color: C.blueDark, fontWeight: T.wt.medium }}>
              {selectedList.length} seleccionado{selectedList.length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => setSelectedIds(new Set())}
              style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkFaint, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Limpiar
            </button>
          </>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: S[2], flexWrap: "wrap" as const }}>
          <span style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkFaint, alignSelf: "center" }}>
            {scopeLabel}
          </span>
          {(["publish", "update", "activate"] as BulkOperation[]).map(op => {
            const verbs: Record<BulkOperation, string> = { publish: "Publicar", update: "Actualizar", activate: "Activar" };
            const count = hasSelection ? selectedList.length : filtered.length;
            return (
              <button
                key={op}
                onClick={() => startBulkOp(op)}
                disabled={count === 0}
                style={{
                  fontFamily: T.mono, fontSize: "10px", fontWeight: T.wt.semibold,
                  padding: `${S[1]}px ${S[3]}px`, borderRadius: R.md,
                  border:     `1px solid ${count === 0 ? C.line : C.blueDark}`,
                  background: count === 0 ? C.surface : op === "publish" ? C.blueDark : C.white,
                  color:      count === 0 ? C.inkFaint : op === "publish" ? C.white : C.blueDark,
                  cursor:     count === 0 ? "default" : "pointer",
                  transition: "all 0.15s", whiteSpace: "nowrap" as const,
                }}
              >
                {verbs[op]} {hasSelection ? "seleccionados" : "filtrados"}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content area ── */}
      {filtered.length === 0 ? (
        <EmptyQueue filter={activeFilter} />
      ) : activeFilter === "blocking" ? (
        <BlockedProductsPanel items={filtered} onSelect={item => setDrawerItem(item)} />
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: MS_CARD.gap,
        }}>
          {filtered.map(item => (
            <ShopifyProductCard
              key={item.productId}
              item={item}
              isChecked={selectedIds.has(item.productId)}
              onToggle={() => toggleItem(item.productId)}
              onClick={() => setDrawerItem(item)}
            />
          ))}
        </div>
      )}

      {/* ── Count ── */}
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[3] }}>
        {filtered.length} de {queue.length} productos
        {hasSelection && ` · ${selectedList.length} seleccionados`}
      </div>

      {/* ── Detail drawer ── */}
      {drawerItem && (
        <PublicationDetailDrawer
          item={drawerItem}
          orgSlug={orgSlug}
          onClose={() => setDrawerItem(null)}
        />
      )}

      {/* ── Bulk op dialog ── */}
      {activeBulkOp && (
        <BulkOpDialog
          operation={activeBulkOp.operation}
          productIds={activeBulkOp.productIds}
          orgSlug={orgSlug}
          onClose={handleBulkClose}
        />
      )}
    </>
  );
}
