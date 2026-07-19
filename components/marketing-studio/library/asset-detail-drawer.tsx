/**
 * components/marketing-studio/library/asset-detail-drawer.tsx
 *
 * MS-04B / MS-04C — Asset Detail Drawer + Operational Review Layer
 *
 * Right-panel drawer surfacing the full operational context of a single asset:
 * what it is, where it came from, what it's ready for, what it's missing,
 * what metadata is needed, and what Luca/Mila recommend.
 *
 * ── RULES ─────────────────────────────────────────────────────────────────────
 *   - "use client" — drawer open/close state lives in BibliotecaClient
 *   - All colors from C.* tokens — no raw hex in JSX
 *   - T.mono for ALL operational data
 *   - Readiness computed from readiness.ts — not inline
 *   - onApprove callback triggers ApprovalMetadataPanel (no direct approval)
 *
 * ── SECTIONS ──────────────────────────────────────────────────────────────────
 *   1. Preview principal
 *   2. Identidad del asset
 *   3. Lifecycle / estado
 *   4. Metadata operacional
 *   5. Destination readiness (from readiness.ts)
 *   6. Variantes
 *   7. Uso e historial
 *   8. Señales Luca / Mila
 *   9. Acciones (Aprobar → triggers ApprovalMetadataPanel)
 */

"use client";

import { useState, useEffect } from "react";
import { C, T, S, R }  from "@/lib/ui/tokens";
import type { VideoVersionEntry } from "@/lib/marketing-studio/video-editor/video-editor-types";
import { ChannelBadgeGroup } from "./channel-badge";
import {
  resolveScoreTier,
  formatScore,
  resolveStatusConfig,
  getThumbnailProfile,
} from "@/lib/marketing-studio/library/ui/asset-visual-tokens";
import {
  computeDestinationReadiness,
  buildMetadataSnapshot,
  computeReadinessSummary,
} from "@/lib/marketing-studio/library/readiness";
import {
  computePropagationImpact,
} from "@/lib/marketing-studio/library/product-attributes";
import { StatusChip } from "@/components/shell/operational-primitives";

// ── Public asset shape ─────────────────────────────────────────────────────────

export interface BibliotecaAssetDisplay {
  id:            string;
  assetUrl:      string;
  assetType:     string;
  name:          string;
  sku:           string | null;
  /** Commercial product name linked to this asset (from video export metadata). */
  productName?:  string | null;
  status:        string;
  channels:      string[];
  usageCount:    number;
  variantCount:  number;
  score:         number;
  highPerformer: boolean;
  stale:         boolean;
  duplicateRisk?: boolean;
  createdAt:     string;
  origin:        "ai" | "manual";
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface AssetDetailDrawerProps {
  asset:      BibliotecaAssetDisplay | null;
  onClose:    () => void;
  onApprove?: () => void;
  orgSlug?:   string;
}

// ── Local helpers ──────────────────────────────────────────────────────────────

interface VariantSlot {
  label:     string;
  ratio:     string;
  status:    "exists" | "missing";
  lucaNote?: string;
}

function computeVariantSlots(asset: BibliotecaAssetDisplay): VariantSlot[] {
  return [
    { label: "Original",   ratio: "Nativo",  status: "exists" },
    { label: "1:1",        ratio: "1/1",     status: asset.variantCount > 0 ? "exists" : "missing" },
    { label: "4:5",        ratio: "4/5",     status: asset.variantCount > 1 ? "exists" : "missing" },
    { label: "9:16 Reel",  ratio: "9/16",    status: asset.variantCount > 2 ? "exists" : "missing", lucaNote: "Luca recomienda para campañas" },
    { label: "Banner",     ratio: "4/1",     status: asset.variantCount > 3 ? "exists" : "missing" },
    { label: "Thumbnail",  ratio: "1/1",     status: asset.variantCount > 4 ? "exists" : "missing" },
  ];
}

type StepState = "done" | "current" | "pending";

function computeLifecycleSteps(status: string): { label: string; state: StepState }[] {
  const idx =
    status === "generated"      ? 0 :
    status === "review_pending" ? 1 :
    status === "approved"       ? 2 : 2;

  return [
    { label: "Generado",  state: idx > 0 ? "done" : "current" },
    { label: "Revisión",  state: idx > 1 ? "done" : idx === 1 ? "current" : "pending" },
    { label: "Aprobado",  state: idx > 2 ? "done" : idx === 2 ? "current" : "pending" },
    { label: "Publicado", state: "pending" },
  ];
}

function computeLucaSignals(asset: BibliotecaAssetDisplay): string[] {
  const s: string[] = [];
  if (asset.variantCount === 0)   s.push("Sin variantes de canal — crear versión 9:16 antes de publicar en campañas");
  if (asset.variantCount > 0 && asset.variantCount < 3)
                                  s.push("Variante 9:16 faltante — requerida para Ads y Stories");
  if (asset.usageCount === 0)     s.push("Recurso no utilizado — evaluar reutilización antes de generar nuevos similares");
  if (asset.highPerformer)        s.push("Alto rendimiento — candidato prioritario para campaña estacional");
  if (asset.stale)                s.push("Recurso obsoleto — verificar relevancia para temporada actual");
  if (asset.duplicateRisk)        s.push("Posible duplicado detectado — verificar antes de publicar");
  if (!asset.channels.includes("ads") && asset.score >= 0.75)
                                  s.push("Score alto — recomendado para Ads: agregar canal y variantes");
  if (s.length === 0)             s.push("Sin observaciones pendientes — recurso en estado operacional óptimo");
  return s;
}

function computeMilaSignals(asset: BibliotecaAssetDisplay): string[] {
  const s: string[] = [];
  if (asset.channels.includes("whatsapp"))  s.push("Listo para incluir en catálogo personalizado de WhatsApp");
  if (!asset.channels.includes("catalog"))  s.push("No asignado a catálogo — agregar para habilitar venta directa vía Mila");
  if (asset.channels.includes("shopify"))   s.push("Disponible para carrusel Shopify — verificar precio y disponibilidad antes de activar");
  if (!asset.sku)                           s.push("Sin SKU — Mila no puede relacionar el asset con inventario para responder clientes");
  if (asset.usageCount === 0)               s.push("Sin historial de uso — Mila priorizará assets con más publicaciones al armar catálogos");
  if (s.length === 0)                       s.push("Mila requiere catálogo habilitado para generar señales de venta");
  return s;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function AssetDetailDrawer({ asset, onClose, onApprove, orgSlug }: AssetDetailDrawerProps) {
  // ── Version history (for short_video assets) ─────────────────────────────
  const [versiones, setVersiones]               = useState<VideoVersionEntry[]>([]);
  const [versionesLoading, setVersionesLoading] = useState(false);

  // ── Subtitle info (for short_video assets) ────────────────────────────────
  const [subtitleInfo, setSubtitleInfo] = useState<{
    status: string; language: string; updatedAt: string; trackId: string;
  } | null>(null);

  useEffect(() => {
    if (!asset || asset.assetType !== "short_video" || !orgSlug) return;
    setVersionesLoading(true);
    fetch(`/api/orgs/${orgSlug}/marketing-studio/video-editor/versions?assetId=${asset.id}`)
      .then(r => r.json())
      .then((d: { versions?: VideoVersionEntry[] }) => setVersiones(d.versions ?? []))
      .catch(() => setVersiones([]))
      .finally(() => setVersionesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id, orgSlug]);

  useEffect(() => {
    if (!asset || asset.assetType !== "short_video" || !orgSlug) return;
    setSubtitleInfo(null);
    fetch(`/api/orgs/${orgSlug}/marketing-studio/video-editor/subtitles?assetId=${asset.id}`)
      .then(r => r.json())
      .then((d: { tracks?: { id: string; status: string; language: string; updatedAt: string }[] }) => {
        const ready = d.tracks?.find(t => t.status === "ready") ?? d.tracks?.[0];
        if (ready) {
          setSubtitleInfo({ status: ready.status, language: ready.language, updatedAt: ready.updatedAt, trackId: ready.id });
        }
      })
      .catch(() => { /* non-fatal */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id, orgSlug]);

  if (!asset) return null;

  const tier        = resolveScoreTier(asset.score);
  const statusCfg   = resolveStatusConfig(asset.status);
  const thumb       = getThumbnailProfile(asset.assetType);
  const variants    = computeVariantSlots(asset);
  const steps       = computeLifecycleSteps(asset.status);
  const lucaSignals = computeLucaSignals(asset);
  const milaSignals = computeMilaSignals(asset);

  // Readiness from rule system (readiness.ts)
  const metaSnapshot  = buildMetadataSnapshot(asset);
  const readiness     = computeDestinationReadiness(metaSnapshot);
  const readinessSummary = computeReadinessSummary(readiness);

  // Propagation preview (for metadata section)
  const missingMetaFields = ["commercialName", "category", "hasPrice", "hasDescription"];
  const propagation = computePropagationImpact(asset.id, missingMetaFields, asset.channels);

  const isReviewable   = asset.status === "generated" || asset.status === "review_pending";
  const metaIncomplete = !metaSnapshot.name || !metaSnapshot.category || !metaSnapshot.hasPrice;

  return (
    <>
      {/* Backdrop */}
      <div className="ag-drawer-overlay" onClick={onClose} aria-hidden="true" />

      {/* Drawer panel */}
      <div className="ag-asset-drawer" role="dialog" aria-modal="true" aria-label={`Detalle: ${asset.name}`}>

        {/* ── Header ── */}
        <div className="ag-asset-drawer__header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
              {asset.assetType.replace(/_/g, " ")} · {asset.origin === "ai" ? "IA" : "Manual"}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {asset.name}
            </div>
          </div>
          <StatusChip variant={statusCfg.chipVariant}>{statusCfg.label}</StatusChip>
          <button className="ag-drawer-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="ag-asset-drawer__body">

          {/* 1. Preview principal */}
          <div className="ag-drawer-section" style={{ padding: 0 }}>
            <div style={{
              position:    "relative",
              aspectRatio: thumb.ratio,
              maxHeight:   300,
              background:  C.surface,
              overflow:    "hidden",
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asset.assetUrl}
                alt={asset.name}
                style={{ width: "100%", height: "100%", objectFit: thumb.contain ? "contain" : "cover", display: "block" }}
              />
              {/* Score */}
              <div style={{
                position: "absolute", top: S[2], right: S[2],
                background: tier.surface, color: tier.color, border: `1px solid ${tier.border}`,
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
                padding: `2px ${S[2]}px`, borderRadius: R.pill,
              }}>
                {formatScore(asset.score)} · {tier.label}
              </div>
              {/* Origin */}
              <div style={{
                position: "absolute", top: S[2], left: S[2],
                background: "rgba(0,0,0,.55)", color: "rgba(255,255,255,.9)",
                fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
                padding: `2px 6px`, borderRadius: R.pill, backdropFilter: "blur(4px)",
              }}>
                {asset.origin === "ai" ? "IA · Foto Estudio" : "Manual"}
              </div>
              {/* Stale */}
              {asset.stale && (
                <div style={{
                  position: "absolute", inset: 0,
                  background: "rgba(248,249,251,.60)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkLight,
                }}>
                  Obsoleto · +90 días sin uso
                </div>
              )}
            </div>
            {/* Channels + readiness summary */}
            <div style={{ padding: `${S[2]}px ${S[4]}px`, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: S[2] }}>
              <ChannelBadgeGroup channels={asset.channels} max={6} size="sm" />
              <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: 8, color: C.inkFaint, whiteSpace: "nowrap" }}>
                {readinessSummary}
              </span>
            </div>
          </div>

          {/* 2. Identidad */}
          <div className="ag-drawer-section">
            <div className="ag-drawer-section-title">Identidad</div>
            <div className="ag-meta-block">
              <MetaField label="Nombre"   value={asset.name} />
              <MetaField label="SKU"      value={asset.sku ?? "—"} />
              <MetaField label="Tipo"     value={asset.assetType.replace(/_/g, " ")} />
              <MetaField label="Origen"   value={asset.origin === "ai" ? "Foto Estudio IA" : "Manual"} />
              <MetaField label="Canales"  value={asset.channels.length > 0 ? `${asset.channels.length} destinos` : "Sin canal"} />
              <MetaField label="Creado"   value={asset.createdAt} />
            </div>
          </div>

          {/* 3. Lifecycle */}
          <div className="ag-drawer-section">
            <div className="ag-drawer-section-title">Estado operacional</div>
            <div className="ag-lifecycle-steps" style={{ marginBottom: S[2] }}>
              {steps.map((step, i) => (
                <div key={step.label} className="ag-lifecycle-step">
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div className={`ag-lifecycle-step__node ag-lifecycle-step__node--${step.state}`}>
                      {step.state === "done" ? "✓" : step.state === "current" ? "●" : "○"}
                    </div>
                    <div className={`ag-lifecycle-step__label ag-lifecycle-step__label--${step.state}`}>
                      {step.label}
                    </div>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`ag-lifecycle-step__line${step.state === "done" ? " ag-lifecycle-step__line--done" : ""}`} />
                  )}
                </div>
              ))}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
              Aprobado ≠ Publicado — el asset debe enviarse explícitamente a su destino.
            </div>
          </div>

          {/* 4. Metadata operacional */}
          <div className="ag-drawer-section">
            <div className="ag-drawer-section-title">Metadata operacional</div>

            {metaIncomplete && (
              <div style={{
                marginBottom: S[3],
                padding: `${S[2]}px ${S[3]}px`,
                background: C.amberLight, border: `1px solid ${C.amberBorder}`,
                borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberMid,
              }}>
                Metadata incompleta — este asset aún no está listo para CRM, Shopify o Catálogo.
                Completa los datos mínimos al aprobar.
              </div>
            )}

            <MetaGroup label="Requerida">
              <MetaField label="Tipo de asset"  value={asset.assetType.replace(/_/g, " ")} />
              <MetaField label="SKU / producto" value={asset.sku ?? "No asignado"} />
            </MetaGroup>

            <MetaGroup label="Comercial">
              <MetaField label="Nombre comercial"  value="— completar al aprobar" />
              <MetaField label="Categoría"         value="— completar al aprobar" />
              <MetaField label="Precio base"       value="— completar al aprobar" />
            </MetaGroup>

            <MetaGroup label="Canal">
              <MetaField label="Canales activos"   value={asset.channels.join(", ") || "Ninguno"} />
              <MetaField label="Uso permitido"     value="— completar al aprobar" />
            </MetaGroup>

            <MetaGroup label="Catálogo">
              <MetaField label="Categoría catálogo" value="— completar al aprobar" />
              <MetaField label="Argumento CRM"      value="— completar al aprobar" />
            </MetaGroup>

            {/* Propagation notice */}
            {propagation.affectedDestinations.length > 0 && (
              <div style={{
                padding: `${S[2]}px ${S[3]}px`,
                background: C.blueLight, border: `1px solid ${C.blueBorder}`,
                borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark,
              }}>
                Al completar metadata, este asset puede actualizar:{" "}
                {propagation.affectedDestinations.join(", ")}.
                {propagation.requiresApproval && " Shopify y CRM requieren revisión adicional."}
              </div>
            )}
          </div>

          {/* 5. Destination readiness — from readiness.ts */}
          <div className="ag-drawer-section">
            <div className="ag-drawer-section-title">Destination readiness</div>
            {readiness.map(dest => (
              <div key={dest.destination} className="ag-readiness-row">
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkMid, minWidth: 100 }}>
                  {dest.label}
                </span>
                <span className={`ag-readiness-indicator ag-readiness-indicator--${dest.status === "ready" ? "ready" : dest.status === "partial" ? "partial" : "not-ready"}`}>
                  {dest.status === "ready" ? "Listo" : dest.status === "partial" ? "Parcial" : "No listo"}
                </span>
                {dest.missing.length > 0 && (
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, flex: 1, textAlign: "right" }}>
                    Falta: {dest.missing[0]}{dest.missing.length > 1 ? ` +${dest.missing.length - 1}` : ""}
                  </span>
                )}
              </div>
            ))}
            <div style={{ marginTop: S[2], fontFamily: T.mono, fontSize: 8, color: C.inkGhost }}>
              Completa los datos mínimos al aprobar para mejorar el readiness.
            </div>
          </div>

          {/* 6. Variantes */}
          <div className="ag-drawer-section">
            <div className="ag-drawer-section-title">Variantes de formato</div>
            <div className="ag-variant-grid">
              {variants.map(v => (
                <div key={v.label} className={`ag-variant-slot ag-variant-slot--${v.status}`}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: v.status === "exists" ? C.blueDark : C.inkFaint }}>
                    {v.label}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>
                    {v.ratio}
                  </div>
                  {v.status === "missing" && v.lucaNote && (
                    <div style={{ fontFamily: T.mono, fontSize: 8, color: C.amber, marginTop: 2 }}>
                      {v.lucaNote}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {asset.variantCount < 3 && (
              <div style={{
                marginTop: S[2],
                padding: `${S[2]}px ${S[3]}px`,
                background: C.amberLight, border: `1px solid ${C.amberBorder}`,
                borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberMid,
              }}>
                Luca recomienda crear versión 9:16 para campañas en Ads y Stories.
              </div>
            )}
          </div>

          {/* 6b. Historial de versiones — timeline visual para videos */}
          {asset.assetType === "short_video" && (
            <div className="ag-drawer-section">
              <div className="ag-drawer-section-title">Historial de versiones</div>
              {versionesLoading ? (
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, padding: `${S[2]}px 0` }}>
                  Cargando versiones…
                </div>
              ) : (
                <div style={{ paddingLeft: S[1] }}>

                  {/* ── Original (siempre presente) ── */}
                  <div style={{ display: "flex", gap: S[2] }}>
                    {/* Dot + line */}
                    <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", flexShrink: 0, width: 14 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.inkLight, border: `2px solid ${C.white}`, boxShadow: `0 0 0 2px ${C.line}`, zIndex: 1, flexShrink: 0 }} />
                      {versiones.length > 0 && (
                        <div style={{ width: 2, flex: 1, minHeight: 20, background: C.line, marginTop: 2 }} />
                      )}
                    </div>
                    {/* Content */}
                    <div style={{ flex: 1, paddingBottom: versiones.length > 0 ? S[3] : 0, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                        {/* Thumbnail */}
                        <div style={{ width: 40, height: 32, borderRadius: R.xs, background: "#111", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <video src={asset.assetUrl} muted preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkMid }}>
                            Video original
                          </div>
                          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                            {asset.name}
                          </div>
                        </div>
                        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, flexShrink: 0 }}>v1</span>
                      </div>
                    </div>
                  </div>

                  {/* ── Derived versions ── */}
                  {versiones.length === 0 ? (
                    <div style={{ marginLeft: S[4], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, fontStyle: "italic" as const }}>
                      Este video aún no tiene versiones editadas.
                    </div>
                  ) : versiones.map((v, i) => (
                    <div key={v.id} style={{ display: "flex", gap: S[2] }}>
                      {/* Dot + line */}
                      <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", flexShrink: 0, width: 14 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#c2410c", border: `2px solid ${C.white}`, boxShadow: "0 0 0 2px #c2410c44", zIndex: 1, flexShrink: 0 }} />
                        {i < versiones.length - 1 && (
                          <div style={{ width: 2, flex: 1, minHeight: 20, background: C.line, marginTop: 2 }} />
                        )}
                      </div>
                      {/* Content */}
                      <div style={{ flex: 1, paddingBottom: i < versiones.length - 1 ? S[3] : 0, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: S[2] }}>
                          {/* Thumbnail */}
                          <div style={{ width: 40, height: 32, borderRadius: R.xs, background: "#111", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {v.assetUrl ? (
                              <video src={v.assetUrl} muted preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              <div style={{ fontFamily: T.mono, fontSize: 9, color: "rgba(255,255,255,.3)" }}>▶</div>
                            )}
                          </div>
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                              {v.versionName}
                            </div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                              {new Date(v.exportedAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                              {" · "}{v.formato} · {v.creadoPor}
                            </div>
                          </div>
                          {/* Version badge + open link */}
                          <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: "#c2410c" }}>v{v.version}</span>
                            {orgSlug && (
                              <a
                                href={`/${orgSlug}/agentik/marketing-studio/video-editor?assetId=${v.id}`}
                                style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blue, textDecoration: "none", padding: `1px ${S[1]}px`, border: `1px solid ${C.blueBorder}`, borderRadius: R.xs, background: C.blueLight, whiteSpace: "nowrap" as const }}
                              >
                                Abrir
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 6b-2. Subtítulos — for short_video assets */}
          {asset.assetType === "short_video" && (
            <div className="ag-drawer-section">
              <div className="ag-drawer-section-title">Subtítulos</div>
              {!subtitleInfo ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: S[2] }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                    Este video aún no tiene subtítulos.
                  </div>
                  {orgSlug && (
                    <a
                      href={`/${orgSlug}/agentik/marketing-studio/video-editor?assetId=${asset.id}`}
                      style={{
                        fontFamily: T.mono, fontSize: T.sz["2xs"],
                        color: C.blueDark, textDecoration: "none",
                        padding: `2px ${S[2]}px`,
                        border: `1px solid ${C.blueBorder}`,
                        borderRadius: R.xs,
                        background: C.blueLight,
                        whiteSpace: "nowrap" as const, flexShrink: 0,
                      }}
                    >
                      Generar en Editor
                    </a>
                  )}
                </div>
              ) : (
                <div style={{
                  padding: `${S[2]}px ${S[3]}px`,
                  background: subtitleInfo.status === "ready" ? C.greenLight : C.surface,
                  border: `1px solid ${subtitleInfo.status === "ready" ? C.greenBorder : C.line}`,
                  borderRadius: R.md,
                  display: "flex", gap: S[3], alignItems: "center",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: subtitleInfo.status === "ready" ? C.greenDark : C.inkMid }}>
                      {subtitleInfo.status === "ready" ? "Subtítulos disponibles" : "Subtítulos en proceso"}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
                      {subtitleInfo.language.toUpperCase()}
                      {" · "}
                      {new Date(subtitleInfo.updatedAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                    </div>
                  </div>
                  {orgSlug && subtitleInfo.status === "ready" && (
                    <div style={{ display: "flex", flexDirection: "column" as const, gap: 4, flexShrink: 0 }}>
                      <a
                        href={`/${orgSlug}/agentik/marketing-studio/video-editor?assetId=${asset.id}`}
                        style={{
                          fontFamily: T.mono, fontSize: T.sz["2xs"],
                          color: C.green, textDecoration: "none",
                          padding: `1px ${S[1]}px`,
                          border: `1px solid ${C.greenBorder}`,
                          borderRadius: R.xs,
                          background: C.greenLight,
                          whiteSpace: "nowrap" as const, textAlign: "center" as const,
                        }}
                      >
                        Editar en Editor
                      </a>
                      <a
                        href={`/${orgSlug}/agentik/marketing-studio/video-editor?assetId=${asset.id}`}
                        style={{
                          fontFamily: T.mono, fontSize: T.sz["2xs"],
                          color: C.inkFaint, textDecoration: "none",
                          padding: `1px ${S[1]}px`,
                          border: `1px solid ${C.line}`,
                          borderRadius: R.xs,
                          background: "transparent",
                          whiteSpace: "nowrap" as const, textAlign: "center" as const,
                        }}
                      >
                        Regenerar
                      </a>
                    </div>
                  )}
                  {orgSlug && subtitleInfo.status !== "ready" && (
                    <a
                      href={`/${orgSlug}/agentik/marketing-studio/video-editor?assetId=${asset.id}`}
                      style={{
                        fontFamily: T.mono, fontSize: T.sz["2xs"],
                        color: C.inkFaint, textDecoration: "none",
                        padding: `1px ${S[1]}px`,
                        border: `1px solid ${C.line}`,
                        borderRadius: R.xs,
                        background: "transparent",
                        whiteSpace: "nowrap" as const,
                      }}
                    >
                      Ver en Editor
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 6c. Referencia comercial — visible cuando hay SKU */}
          {asset.sku && (
            <div className="ag-drawer-section">
              <div className="ag-drawer-section-title">Referencia comercial</div>
              <div style={{
                padding: `${S[3]}px`,
                background: C.blueLight, border: `1px solid ${C.blueBorder}`,
                borderRadius: R.md, display: "flex", gap: S[3], alignItems: "flex-start",
              }}>
                {/* SKU pill */}
                <div style={{
                  flexShrink: 0,
                  padding: `${S[1]}px ${S[2]}px`,
                  background: C.blueDark, borderRadius: R.sm,
                  fontFamily: T.mono, fontSize: T.sz.xs, color: "#fff", fontWeight: T.wt.bold,
                  letterSpacing: "0.04em",
                }}>
                  {asset.sku}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {asset.productName ? (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.blueDark, fontWeight: T.wt.semibold, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {asset.productName}
                    </div>
                  ) : (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, marginBottom: 2, fontStyle: "italic" as const }}>
                      Nombre no disponible
                    </div>
                  )}
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                    Referencia comercial · Producto vinculado
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 7. Uso e historial */}
          <div className="ag-drawer-section">
            <div className="ag-drawer-section-title">Uso e historial</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[2], marginBottom: S[3] }}>
              <UsageStat label="Publicaciones"   value={String(asset.usageCount)}    highlight={asset.highPerformer} />
              <UsageStat label="Variantes"        value={String(asset.variantCount)} />
              <UsageStat label="Canales activos"  value={String(asset.channels.length)} />
            </div>
            <div className="ag-meta-block">
              <MetaField label="Última vez usado"   value="— PLACEHOLDER" />
              <MetaField label="Campañas"           value="— PLACEHOLDER" />
              <MetaField label="Catálogo asociado"  value="— PLACEHOLDER" />
            </div>
          </div>

          {/* 7b. Asset Hub — usado en */}
          {asset.assetType === "short_video" && (
            <div className="ag-drawer-section">
              <div className="ag-drawer-section-title">Activo en Agentik</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[2] }}>
                {([
                  { label: "Publicaciones", icon: "◼", path: "redes",    count: 0 },
                  { label: "Anuncios",      icon: "▲", path: "pauta",    count: 0 },
                  { label: "Contenido",     icon: "◉", path: "contenido", count: 0 },
                ] as const).map(rel => (
                  <div key={rel.label} style={{
                    padding: `${S[3]}px ${S[2]}px`,
                    background: C.surface,
                    border: `1px solid ${C.line}`,
                    borderRadius: R.md,
                    display: "flex", flexDirection: "column" as const, alignItems: "center", gap: S[1],
                    textAlign: "center" as const,
                  }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>{rel.icon}</div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.inkMid, fontVariantNumeric: "tabular-nums" }}>
                      {rel.count}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{rel.label}</div>
                    {orgSlug ? (
                      <a
                        href={`/${orgSlug}/agentik/marketing-studio/${rel.path}`}
                        style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blue, textDecoration: "none", padding: `1px ${S[1]}px`, border: `1px solid ${C.blueBorder}`, borderRadius: R.xs, background: C.blueLight, whiteSpace: "nowrap" as const }}
                      >
                        Ver →
                      </a>
                    ) : (
                      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>—</span>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, marginTop: S[2] }}>
                Integración con módulos habilitada en MS-05+
              </div>
            </div>
          )}

          {/* 8. Señales Luca / Mila */}
          <div className="ag-drawer-section">
            <div className="ag-drawer-section-title">Inteligencia operacional</div>

            <div style={{ marginBottom: S[3] }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.inkFaint, marginBottom: S[1] }}>
                Luca · Estrategia de contenido y reutilización
              </div>
              {lucaSignals.map((sig, i) => (
                <div key={i} className="ag-agent-signal-block ag-agent-signal-block--luca">
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,.5)", flexShrink: 0, marginTop: 2 }} />
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: "rgba(255,255,255,.85)", lineHeight: 1.5 }}>
                    {sig}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.inkFaint, marginBottom: S[1] }}>
                Mila · Venta directa, CRM y catálogos
              </div>
              {milaSignals.map((sig, i) => (
                <div key={i} className="ag-agent-signal-block ag-agent-signal-block--mila">
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.greenDark, lineHeight: 1.5 }}>
                    {sig}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>{/* end scrollable body */}

        {/* 9. Actions footer */}
        <div className="ag-drawer-action-footer">
          {/* Video actions — only for short_video assets */}
          {asset.assetType === "short_video" && orgSlug && (
            <>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                Acciones de video
              </div>
              <div className="ag-action-tray" style={{ marginBottom: 4 }}>
                <a
                  href={`/${orgSlug}/agentik/marketing-studio/video-editor?assetId=${asset.id}`}
                  className="ag-action-primary"
                  style={{ flex: 1, textAlign: "center", textDecoration: "none" }}
                >
                  Editar video →
                </a>
                <button className="ag-action-secondary" disabled style={{ opacity: 0.6, cursor: "not-allowed" }}>
                  Duplicar
                </button>
              </div>
              <div className="ag-action-tray" style={{ marginBottom: 8 }}>
                <button className="ag-action-ghost" disabled style={{ opacity: 0.6, cursor: "not-allowed" }}>
                  Crear versión
                </button>
                <button className="ag-action-ghost" disabled style={{ opacity: 0.6, cursor: "not-allowed" }}>
                  Usar en Contenido
                </button>
                <button className="ag-action-ghost" disabled style={{ opacity: 0.6, cursor: "not-allowed" }}>
                  Usar en Anuncios
                </button>
                <button className="ag-action-ghost" disabled style={{ opacity: 0.6, cursor: "not-allowed" }}>
                  Ver historial
                </button>
              </div>
            </>
          )}

          {isReviewable ? (
            <>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.amber, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Modo revisión · completa metadata antes de aprobar
              </div>
              <div className="ag-action-tray">
                <button
                  className="ag-action-primary"
                  onClick={onApprove}
                  style={{ flex: 1 }}
                >
                  Aprobar →
                </button>
                <button className="ag-action-secondary" disabled style={{ opacity: 0.6, cursor: "not-allowed" }}>
                  Requiere cambios
                </button>
                <button className="ag-action-ghost" disabled style={{ opacity: 0.6, cursor: "not-allowed", color: C.red }}>
                  Rechazar
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="ag-action-tray">
                <button className="ag-action-secondary" disabled style={{ opacity: 0.6, cursor: "not-allowed" }}>
                  Completar metadata
                </button>
                <button className="ag-action-secondary" disabled style={{ opacity: 0.6, cursor: "not-allowed" }}>
                  Crear variante
                </button>
              </div>
              <div className="ag-action-tray">
                <button className="ag-action-ghost" disabled style={{ opacity: 0.6, cursor: "not-allowed" }}>
                  Enviar a Shopify
                </button>
                <button className="ag-action-ghost" disabled style={{ opacity: 0.6, cursor: "not-allowed" }}>
                  Agregar a catálogo
                </button>
                <button className="ag-action-ghost" disabled style={{ opacity: 0.6, cursor: "not-allowed" }}>
                  Preparar WhatsApp
                </button>
                <button className="ag-action-ghost" disabled style={{ opacity: 0.6, cursor: "not-allowed", color: C.inkFaint }}>
                  Archivar
                </button>
              </div>
            </>
          )}
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, textAlign: "center" }}>
            Persistencia y sync habilitados en MS-05+
          </div>
        </div>

      </div>
    </>
  );
}

// ── Local sub-components ───────────────────────────────────────────────────────

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="ag-meta-field">
      <div style={{ fontFamily: T.mono, fontSize: 8, fontWeight: T.wt.bold, textTransform: "uppercase", letterSpacing: "0.06em", color: C.inkGhost }}>
        {label}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

function MetaGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: S[3] }}>
      <div style={{ fontFamily: T.mono, fontSize: 8, fontWeight: T.wt.bold, textTransform: "uppercase", letterSpacing: "0.06em", color: C.inkGhost, marginBottom: S[1] }}>
        {label}
      </div>
      <div className="ag-meta-block">
        {children}
      </div>
    </div>
  );
}

function UsageStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      textAlign:    "center",
      padding:      `${S[2]}px ${S[1]}px`,
      background:   highlight ? C.blueLight : C.surface,
      border:       `1px solid ${highlight ? C.blueBorder : C.line}`,
      borderRadius: R.md,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: highlight ? C.blueDark : C.ink, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint }}>
        {label}
      </div>
    </div>
  );
}
