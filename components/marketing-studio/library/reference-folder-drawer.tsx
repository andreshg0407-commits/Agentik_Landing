/**
 * components/marketing-studio/library/reference-folder-drawer.tsx
 *
 * MARKETING-LIBRARY-ACTIVE-ASSET-INGESTION-02A-R4 — Reference Folder Drawer
 *
 * Slide-over panel showing the full folder view for an inventory reference:
 *   - Header with reference identity (refCode, description, world, stock)
 *   - Tabs: Todos | Fotos | Videos | Banners/Piezas
 *   - Lazy-loaded asset gallery from /api/.../biblioteca/reference-assets
 *   - Upload engines: Subir archivo, Importar desde Drive, Foto Estudio
 *   - Empty state for references without assets
 *   - Loading / error states
 *
 * Uses the canonical MSDrawer system from MARKETING-STUDIO-UX-SYSTEM-03.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { FolderOpen, Upload, HardDrive, Camera } from "lucide-react";
import { C, T, S, R }          from "@/lib/ui/tokens";
import { MS_PALETTE, MS_SHADOWS, MS_CTA } from "@/lib/marketing-studio/ms-design-system";
import { UploadAssetsModal }    from "./upload-assets-modal";
import { MSDrawer }             from "@/components/marketing-studio/shared/ms-drawer";
import { MSDrawerHeader }       from "@/components/marketing-studio/shared/ms-drawer-header";
import { MSDrawerTabs }         from "@/components/marketing-studio/shared/ms-drawer-tabs";
import { MSDrawerSection }      from "@/components/marketing-studio/shared/ms-drawer-section";
import { WORLD_ACCENT }         from "@/lib/marketing-studio/library/world-classification";
import type { InventoryReference } from "@/lib/marketing-studio/library/inventory-reference-types";

// -- Asset type from API response --

interface ReferenceAsset {
  id:           string;
  assetUrl:     string | null;
  assetType:    string;
  role:         string;
  reviewStatus: string;
  sourceType:   string | null;
  createdAt:    string;
}

// -- Tab definitions --

const FOLDER_TABS = [
  { id: "todos",    label: "Todos" },
  { id: "fotos",    label: "Fotos" },
  { id: "videos",   label: "Videos" },
  { id: "banners",  label: "Banners / Piezas" },
];

// -- Filter logic --

function matchesTab(asset: ReferenceAsset, tab: string): boolean {
  if (tab === "todos") return true;
  const t = asset.assetType.toLowerCase();
  const r = asset.role.toLowerCase();
  if (tab === "fotos")   return t.includes("photo") || t.includes("image") || r === "hero" || r === "gallery" || r === "swatch";
  if (tab === "videos")  return t.includes("video");
  if (tab === "banners") return t.includes("banner") || t.includes("social") || r === "social" || r === "document";
  return true;
}

// -- Role labels --

const ROLE_LABELS: Record<string, string> = {
  hero:     "Principal",
  gallery:  "Galeria",
  social:   "Redes",
  video:    "Video",
  document: "Documento",
  swatch:   "Muestra",
};

const REVIEW_LABELS: Record<string, { label: string; color: string }> = {
  approved: { label: "Aprobado", color: C.green },
  pending:  { label: "Pendiente", color: C.amber },
  rejected: { label: "Rechazado", color: C.red },
};

// -- Status config for the header --

function stockStatusVariant(ref: InventoryReference): "ok" | "neutral" | "warning" | "error" {
  if (ref.isAvailable && ref.disponible > 0) return "ok";
  if (!ref.isAvailable) return "error";
  return "neutral";
}

function stockStatusLabel(ref: InventoryReference): string {
  if (ref.isAvailable) return `${ref.disponible} disponible`;
  return "Sin stock";
}

// -- Props --

interface ReferenceFolderDrawerProps {
  reference:      InventoryReference;
  orgSlug:        string;
  organizationId: string;
  onClose:        () => void;
}

// -- Component --

export function ReferenceFolderDrawer({
  reference, orgSlug, organizationId, onClose,
}: ReferenceFolderDrawerProps) {
  const [assets,    setAssets]    = useState<ReferenceAsset[]>([]);
  const [loading,   setLoading]  = useState(true);
  const [error,     setError]    = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("todos");

  // -- Upload engine state --
  // Write boundary: ProductEntity is created ONLY when user confirms upload,
  // never on modal open. Cancel = zero writes, zero orphan ProductEntity.
  const [showUploadModal,    setShowUploadModal]    = useState(false);
  const [showUploadConfirm,  setShowUploadConfirm]  = useState(false);
  const [resolvedProductId,  setResolvedProductId]  = useState<string | null>(reference.productId);
  const [ensuring, setEnsuring] = useState(false);
  const [driveStatus, setDriveStatus] = useState<"unknown" | "connected" | "disconnected">("unknown");

  const worldColor = WORLD_ACCENT[reference.world] ?? C.inkLight;

  // Lazy-load assets on mount or when reference changes
  const loadAssets = useCallback(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ refCode: reference.refCode });
    if (reference.productId) params.set("productId", reference.productId);

    fetch(`/api/orgs/${orgSlug}/marketing-studio/biblioteca/reference-assets?${params}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { ok: boolean; assets: ReferenceAsset[]; productId: string | null }) => {
        if (data.ok) setAssets(data.assets);
        else setError("No se pudieron cargar los recursos.");
      })
      .catch(err => {
        console.error("[reference-folder-drawer] fetch error:", err);
        setError("Error al cargar recursos de esta referencia.");
      })
      .finally(() => setLoading(false));
  }, [reference.refCode, reference.productId, orgSlug]);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  // Check Drive connection status on mount
  useEffect(() => {
    fetch(`/api/orgs/${orgSlug}/marketing-studio/drive?action=status`)
      .then(r => r.ok ? r.json() : { connected: false })
      .then((data: { connected: boolean }) => {
        setDriveStatus(data.connected ? "connected" : "disconnected");
      })
      .catch(() => setDriveStatus("disconnected"));
  }, [orgSlug]);

  // Upload click: if productId exists, open modal directly.
  // If not, show confirmation — NO write until user confirms.
  const handleUploadClick = useCallback(() => {
    if (resolvedProductId) {
      setShowUploadModal(true);
    } else {
      setShowUploadConfirm(true);
    }
  }, [resolvedProductId]);

  // User confirmed — NOW create ProductEntity, then open modal.
  const handleUploadConfirm = useCallback(async () => {
    setEnsuring(true);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/biblioteca/ensure-product`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refCode: reference.refCode, description: reference.description }),
      });
      const data = await res.json();
      if (data.ok && data.productId) {
        setResolvedProductId(data.productId);
        setShowUploadConfirm(false);
        setShowUploadModal(true);
      } else {
        setError("No se pudo preparar la referencia para carga.");
        setShowUploadConfirm(false);
      }
    } catch {
      setError("Error preparando referencia para carga.");
      setShowUploadConfirm(false);
    } finally {
      setEnsuring(false);
    }
  }, [orgSlug, reference.refCode, reference.description]);

  // Handle upload success — reload assets
  const handleUploadSuccess = useCallback(() => {
    setShowUploadModal(false);
    loadAssets();
  }, [loadAssets]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Filtered assets by tab
  const filtered = assets.filter(a => matchesTab(a, activeTab));

  // Tab counts
  const tabsWithCounts = FOLDER_TABS.map(tab => ({
    ...tab,
    count: assets.filter(a => matchesTab(a, tab.id)).length,
  }));

  return (
    <MSDrawer onClose={onClose}>
      {/* Header */}
      <MSDrawerHeader
        thumbnail={reference.primaryAssetUrl}
        domainColor={worldColor}
        name={reference.refCode}
        sku={reference.description}
        category={reference.worldLabel}
        statusVariant={stockStatusVariant(reference)}
        statusLabel={stockStatusLabel(reference)}
        onClose={onClose}
      />

      {/* Tabs */}
      <MSDrawerTabs
        tabs={tabsWithCounts}
        active={activeTab}
        onChange={setActiveTab}
      />

      {/* Scroll body */}
      <div style={{
        flex:      1,
        overflowY: "auto" as const,
        padding:   S[5],
      }}>
        {/* Reference metadata strip */}
        <div style={{
          display:      "flex",
          flexWrap:     "wrap" as const,
          gap:          S[3],
          marginBottom: S[5],
          padding:      `${S[3]}px ${S[4]}px`,
          background:   C.surface,
          borderRadius: R.md,
          border:       `1px solid ${C.lineSubtle}`,
        }}>
          <MetaItem label="Mundo" value={reference.worldLabel} />
          <MetaItem label="Linea SAG" value={reference.sagLine || "\u2014"} />
          <MetaItem label="Disponible" value={reference.isAvailable ? String(reference.disponible) : "0"} />
          <MetaItem label="Pedidos pend." value={reference.pendingOrdersQty > 0 ? String(reference.pendingOrdersQty) : "\u2014"} />
          <MetaItem label="Assets" value={String(reference.assetCount)} />
          <MetaItem label="Fuente" value={reference.source.toUpperCase()} />
          {reference.snapshotAt && (
            <MetaItem
              label="Snapshot"
              value={new Date(reference.snapshotAt).toLocaleDateString("es-CO", {
                day: "2-digit", month: "short", year: "numeric",
              })}
            />
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{
            display:        "flex",
            flexDirection:  "column" as const,
            alignItems:     "center",
            gap:            S[3],
            padding:        "48px 0",
          }}>
            <div style={{
              width: 24, height: 24,
              border: `2px solid ${C.lineSubtle}`,
              borderTopColor: worldColor,
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }} />
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.xs,
              color: C.inkFaint,
            }}>
              Cargando recursos...
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{
            padding:      `${S[4]}px`,
            background:   C.redLight,
            border:       `1px solid ${C.redBorder}`,
            borderRadius: R.md,
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            color:        C.red,
            textAlign:    "center" as const,
          }}>
            {error}
            <button
              onClick={loadAssets}
              style={{
                display:     "block",
                margin:      `${S[2]}px auto 0`,
                fontFamily:  T.mono,
                fontSize:    T.sz["2xs"],
                color:       C.blueDark,
                background:  "none",
                border:      "none",
                cursor:      "pointer",
                textDecoration: "underline",
              }}
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && assets.length === 0 && (
          <MSDrawerSection title="Recursos visuales">
            <div style={{
              display:        "flex",
              flexDirection:  "column" as const,
              alignItems:     "center",
              gap:            S[3],
              padding:        "40px 0",
            }}>
              <FolderOpen size={36} strokeWidth={1.2} color={C.inkGhost} />
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.sm,
                fontWeight: T.wt.semibold, color: C.inkMid,
                textAlign: "center" as const,
              }}>
                Esta referencia aun no tiene recursos visuales
              </div>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.xs,
                color: C.inkFaint, textAlign: "center" as const,
                maxWidth: 320, marginBottom: S[3],
              }}>
                Agrega recursos desde cualquiera de estas fuentes:
              </div>
              <UploadActionTray
                onUploadClick={handleUploadClick}
                ensuring={ensuring}
                driveStatus={driveStatus}
                orgSlug={orgSlug}
                refCode={reference.refCode}
              />
            </div>
          </MSDrawerSection>
        )}

        {/* Tab-filtered empty (has assets but not in this tab) */}
        {!loading && !error && assets.length > 0 && filtered.length === 0 && (
          <div style={{
            display:        "flex",
            flexDirection:  "column" as const,
            alignItems:     "center",
            gap:            S[2],
            padding:        "32px 0",
            fontFamily:     T.mono,
            fontSize:       T.sz.xs,
            color:          C.inkFaint,
            textAlign:      "center" as const,
          }}>
            Sin recursos en esta categoria.
            <button
              onClick={() => setActiveTab("todos")}
              style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"],
                color: C.blueDark, background: "none",
                border: "none", cursor: "pointer",
              }}
            >
              Ver todos
            </button>
          </div>
        )}

        {/* Asset gallery */}
        {!loading && !error && filtered.length > 0 && (
          <MSDrawerSection title={`${filtered.length} recurso${filtered.length !== 1 ? "s" : ""}`}>
            <div style={{
              display:             "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap:                 S[3],
            }}>
              {filtered.map(asset => (
                <AssetTile key={asset.id} asset={asset} />
              ))}
            </div>
          </MSDrawerSection>
        )}

        {/* Upload engines (always visible when not loading) */}
        {!loading && !error && assets.length > 0 && (
          <div style={{ marginTop: S[5] }}>
            <MSDrawerSection title="Agregar recursos">
              <UploadActionTray
                onUploadClick={handleUploadClick}
                ensuring={ensuring}
                driveStatus={driveStatus}
                orgSlug={orgSlug}
                refCode={reference.refCode}
              />
            </MSDrawerSection>
          </div>
        )}
      </div>

      {/* Upload confirm dialog — shown when no ProductEntity exists yet */}
      {showUploadConfirm && (
        <div style={{
          position: "fixed" as const, inset: 0,
          background: "rgba(0,0,0,0.4)", zIndex: 1100,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: C.white, borderRadius: R.md, padding: S[5],
            maxWidth: 380, width: "90%", boxShadow: MS_SHADOWS.card,
          }}>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
              color: C.ink, marginBottom: S[3],
            }}>
              Preparar referencia para carga
            </div>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid,
              marginBottom: S[4], lineHeight: 1.5,
            }}>
              Se creara un registro de producto para <strong>{reference.refCode}</strong> para
              poder vincular archivos. Esta accion es necesaria antes de la primera carga.
            </div>
            <div style={{ display: "flex", gap: S[2], justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowUploadConfirm(false)}
                disabled={ensuring}
                style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                  padding: `${S[2]}px ${S[3]}px`, borderRadius: R.md,
                  background: C.surface, border: `1px solid ${C.line}`,
                  color: C.inkMid, cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleUploadConfirm}
                disabled={ensuring}
                style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
                  padding: `${S[2]}px ${S[3]}px`, borderRadius: R.md,
                  background: MS_CTA.primaryButtonBg, border: "none",
                  color: "#fff", cursor: ensuring ? "wait" : "pointer",
                  boxShadow: MS_CTA.primaryBoxShadow,
                  opacity: ensuring ? 0.7 : 1,
                }}
              >
                {ensuring ? "Preparando..." : "Continuar y subir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal — only opens with a valid productId */}
      {showUploadModal && resolvedProductId && (
        <UploadAssetsModal
          organizationId={organizationId}
          orgSlug={orgSlug}
          productId={resolvedProductId}
          onSuccess={handleUploadSuccess}
          onClose={() => setShowUploadModal(false)}
        />
      )}
    </MSDrawer>
  );
}

// -- UploadActionTray --

function UploadActionTray({
  onUploadClick, ensuring, driveStatus, orgSlug, refCode,
}: {
  onUploadClick: () => void;
  ensuring:      boolean;
  driveStatus:   "unknown" | "connected" | "disconnected";
  orgSlug:       string;
  refCode:       string;
}) {
  const btnBase: React.CSSProperties = {
    display:      "flex",
    alignItems:   "center",
    gap:          S[2],
    fontFamily:   T.mono,
    fontSize:     T.sz.xs,
    fontWeight:   T.wt.semibold,
    padding:      `${S[2]}px ${S[3]}px`,
    borderRadius: R.md,
    cursor:       "pointer",
    transition:   "background .1s",
    border:       "none",
    width:        "100%",
    textAlign:    "left" as const,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2], width: "100%", maxWidth: 280 }}>
      {/* Manual upload */}
      <button
        onClick={onUploadClick}
        disabled={ensuring}
        style={{
          ...btnBase,
          background: MS_CTA.primaryButtonBg,
          color:      "#fff",
          boxShadow:  MS_CTA.primaryBoxShadow,
          opacity:    ensuring ? 0.7 : 1,
        }}
      >
        <Upload size={14} />
        {ensuring ? "Preparando..." : "Subir archivo"}
      </button>

      {/* Drive import */}
      <button
        disabled={driveStatus !== "connected"}
        onClick={() => {
          // Drive import — navigates to Drive picker (Phase 3)
          // For now, show connection status
        }}
        style={{
          ...btnBase,
          background: driveStatus === "connected" ? C.surface : `${C.surface}88`,
          color:      driveStatus === "connected" ? C.inkMid : C.inkFaint,
          border:     `1px solid ${C.line}`,
          opacity:    driveStatus === "connected" ? 1 : 0.6,
        }}
        title={driveStatus !== "connected" ? "Google Drive no conectado" : "Importar desde Drive"}
      >
        <HardDrive size={14} />
        {driveStatus === "unknown" ? "Drive..." :
         driveStatus === "disconnected" ? "Drive no conectado" :
         "Importar desde Drive"}
      </button>

      {/* Foto Estudio */}
      <a
        href={`/${orgSlug}/agentik/marketing-studio/foto-estudio/new?ref=${encodeURIComponent(refCode)}`}
        style={{
          ...btnBase,
          background:     C.surface,
          color:          C.inkMid,
          border:         `1px solid ${C.line}`,
          textDecoration: "none",
        }}
      >
        <Camera size={14} />
        Abrir Foto Estudio
      </a>
    </div>
  );
}

// -- MetaItem --

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 70 }}>
      <div style={{
        fontFamily: T.mono, fontSize: 8,
        color: C.inkFaint, textTransform: "uppercase" as const,
        letterSpacing: "0.05em", marginBottom: 1,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs,
        fontWeight: T.wt.semibold, color: C.ink,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
    </div>
  );
}

// -- AssetTile --

function AssetTile({ asset }: { asset: ReferenceAsset }) {
  const review = REVIEW_LABELS[asset.reviewStatus] ?? REVIEW_LABELS.pending;
  const roleLabel = ROLE_LABELS[asset.role] ?? asset.role;
  const isVideo = asset.assetType.toLowerCase().includes("video");

  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${C.line}`,
      borderRadius: R.md,
      overflow:     "hidden",
      boxShadow:    MS_SHADOWS.card,
    }}>
      {/* Preview */}
      <div style={{
        height:         120,
        background:     C.surface,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        overflow:       "hidden",
        position:       "relative" as const,
      }}>
        {asset.assetUrl ? (
          isVideo ? (
            <video
              src={asset.assetUrl}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              muted
              preload="metadata"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.assetUrl}
              alt={asset.assetType}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            />
          )
        ) : (
          <div style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"],
            color: C.inkGhost,
          }}>
            Sin preview
          </div>
        )}

        {/* Role badge */}
        <div style={{
          position:     "absolute" as const,
          top: 4, left: 4,
          fontFamily:   T.mono,
          fontSize:     7,
          fontWeight:   T.wt.bold,
          color:        C.white,
          background:   "rgba(0,0,0,0.55)",
          borderRadius: R.sm,
          padding:      "1px 4px",
          textTransform: "uppercase" as const,
        }}>
          {roleLabel}
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: `${S[2]}px ${S[2]}px` }}>
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{
            fontFamily: T.mono, fontSize: 8,
            color: review.color, fontWeight: T.wt.semibold,
          }}>
            {review.label}
          </div>
          <div style={{
            fontFamily: T.mono, fontSize: 7,
            color: C.inkGhost,
          }}>
            {new Date(asset.createdAt).toLocaleDateString("es-CO", {
              day: "2-digit", month: "short",
            })}
          </div>
        </div>
        {asset.sourceType && (
          <div style={{
            fontFamily: T.mono, fontSize: 7,
            color: C.inkFaint, marginTop: 1,
          }}>
            {asset.sourceType === "ai_generated" ? "IA" :
             asset.sourceType === "manual_upload" ? "Manual" :
             asset.sourceType === "external" ? "Externo" : asset.sourceType}
          </div>
        )}
      </div>
    </div>
  );
}
