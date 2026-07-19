"use client";
/**
 * components/marketing-studio/catalogs/catalog-qr-panel.tsx
 *
 * MARKETING-STUDIO-CATALOG-QR-SHARING-01 — QR Panel
 *
 * Shows a professional QR preview and download for a published catalog.
 * Reads link state from props; includes a lightweight refresh to sync with
 * the share panel when a link is created in the same session.
 *
 * ── ARCHITECTURE ──────────────────────────────────────────────────────────────
 *   CatalogPublicLink (from DB via parent)
 *     → resolvePublicLinkStatus()
 *     → if active: QR preview via GET /api/.../qr  (PNG, inline)
 *     → download:  GET /api/.../qr?download=true   (PNG, attachment)
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   The QR encodes only the public URL — no internal IDs are exposed.
 *   All API calls go through org-scoped routes (auth enforced server-side).
 *
 * ── EXTENSION POINTS ──────────────────────────────────────────────────────────
 *   SCAN_TRACKING_SLOT:  show scanCount/lastScanAt when available on link
 *   CAMPAIGN_SLOT:       append UTM params to qrApiUrl when campaign mode enabled
 *   PRODUCT_QR_SLOT:     per-product variant when productId prop added
 *   BRAND_SLOT:          custom QR colors when tenant branding enabled
 */

import { useState, useCallback }           from "react";
import { C, T, S, R, E }                   from "@/lib/ui/tokens";
import type { CatalogPublicLinkRecord }    from "@/lib/marketing-studio/catalogs/catalog-public-link-types";
import {
  resolvePublicLinkStatus,
  PUBLIC_LINK_STATUS_LABELS,
}                                           from "@/lib/marketing-studio/catalogs/catalog-public-link-types";
import { QR_UNAVAILABLE_MESSAGES }         from "@/lib/marketing-studio/catalogs/catalog-qr-types";
import type { CatalogQrUnavailableReason } from "@/lib/marketing-studio/catalogs/catalog-qr-types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug:      string;
  catalogId:    string;
  catalogName:  string;
  initialLink:  CatalogPublicLinkRecord | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPublicUrl(slug: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/c/${slug}`;
  }
  return `/c/${slug}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function UnavailableCard({
  reason,
  onRefresh,
  refreshing,
}: {
  reason:     CatalogQrUnavailableReason;
  onRefresh:  () => void;
  refreshing: boolean;
}) {
  return (
    <div style={{
      display:        "flex",
      flexDirection:  "column" as const,
      alignItems:     "center",
      gap:            S[3],
      padding:        `${S[8]}px ${S[6]}px`,
      background:     C.surface,
      border:         `1px dashed ${C.line}`,
      borderRadius:   R.md,
      textAlign:      "center" as const,
    }}>
      <div style={{ fontSize: 28, lineHeight: 1 }}>⬛</div>
      <div style={{
        fontFamily:  T.mono,
        fontSize:    T.sz.xs,
        color:       C.inkMid,
        maxWidth:    260,
        lineHeight:  1.5,
      }}>
        {QR_UNAVAILABLE_MESSAGES[reason]}
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        style={{
          fontFamily:   T.mono,
          fontSize:     T.sz["2xs"],
          color:        C.inkFaint,
          background:   "transparent",
          border:       "none",
          cursor:       refreshing ? "not-allowed" : "pointer",
          padding:      `${S[1]}px ${S[2]}px`,
          textDecoration: "underline",
        }}
      >
        {refreshing ? "Verificando…" : "Verificar estado"}
      </button>
    </div>
  );
}

function QrPreviewCard({
  qrApiUrl,
  publicUrl,
  catalogName,
  onDownload,
  downloading,
  onCopy,
  copied,
}: {
  qrApiUrl:    string;
  publicUrl:   string;
  catalogName: string;
  onDownload:  () => void;
  downloading: boolean;
  onCopy:      () => void;
  copied:      boolean;
}) {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return (
      <div style={{
        padding:    `${S[6]}px`,
        background: C.surface,
        border:     `1px solid ${C.line}`,
        borderRadius: R.md,
        textAlign:  "center" as const,
        fontFamily: T.mono,
        fontSize:   T.sz.xs,
        color:      C.inkFaint,
      }}>
        No se pudo cargar el QR. Recarga la página e intenta de nuevo.
      </div>
    );
  }

  const btnBase: React.CSSProperties = {
    fontFamily:   T.mono,
    fontSize:     T.sz["2xs"],
    fontWeight:   T.wt.semibold,
    padding:      `${S[1]}px ${S[3]}px`,
    borderRadius: R.sm,
    cursor:       "pointer",
    border:       `1px solid ${C.line}`,
    background:   C.white,
    color:        C.inkMid,
  };

  return (
    <div style={{
      display:       "flex",
      flexDirection: "column" as const,
      gap:           S[4],
    }}>
      {/* QR preview */}
      <div style={{
        display:        "flex",
        justifyContent: "center",
        padding:        `${S[4]}px`,
        background:     C.white,
        border:         `1px solid ${C.line}`,
        borderRadius:   R.md,
        boxShadow:      E.sm,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrApiUrl}
          alt={`Código QR — ${catalogName}`}
          width={200}
          height={200}
          style={{
            display:  "block",
            width:    200,
            height:   200,
            imageRendering: "pixelated",
          }}
          onError={() => setImgError(true)}
        />
      </div>

      {/* Catalog info */}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          fontWeight:   T.wt.semibold,
          color:        C.ink,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap" as const,
        }}>
          {catalogName}
        </div>
        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz["2xs"],
          color:        C.inkFaint,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap" as const,
        }}>
          {publicUrl}
        </div>
        <div style={{
          fontFamily: T.mono,
          fontSize:   T.sz["2xs"],
          color:      C.inkGhost,
          marginTop:  2,
        }}>
          1024 × 1024 px · PNG · Listo para impresión
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const }}>
        <button
          onClick={onDownload}
          disabled={downloading}
          style={{
            ...btnBase,
            background: C.blueDark,
            border:     `1px solid ${C.blueDark}`,
            color:      C.white,
          }}
        >
          {downloading ? "Descargando…" : "Descargar PNG"}
        </button>

        <button
          onClick={onCopy}
          style={{
            ...btnBase,
            background: copied ? C.green  : C.white,
            border:     `1px solid ${copied ? C.green : C.line}`,
            color:      copied ? C.white  : C.inkMid,
          }}
        >
          {copied ? "Enlace copiado ✓" : "Copiar enlace"}
        </button>
      </div>

      {/* Print guidance */}
      <div style={{
        fontFamily:   T.mono,
        fontSize:     T.sz["2xs"],
        color:        C.inkGhost,
        lineHeight:   1.5,
        paddingTop:   S[2],
        borderTop:    `1px solid ${C.lineSubtle}`,
      }}>
        Apto para catálogos impresos, empaques, stickers, ferias y material POP.
        El QR siempre abre el catálogo actualizado — no necesitas regenerarlo cuando cambien los productos.
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CatalogQrPanel({ orgSlug, catalogId, catalogName, initialLink }: Props) {
  const [link,        setLink]        = useState<CatalogPublicLinkRecord | null>(initialLink);
  const [refreshing,  setRefreshing]  = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copied,      setCopied]      = useState(false);

  const status    = resolvePublicLinkStatus(link);
  const isActive  = status === "active";
  const publicUrl = link && isActive ? buildPublicUrl(link.slug) : null;

  const qrApiBase = `/api/orgs/${orgSlug}/marketing-studio/catalog-definitions/${catalogId}/qr`;

  // ── Status badge color ───────────────────────────────────────────────────────

  const statusColor =
    status === "active"   ? C.green  :
    status === "inactive" ? C.inkFaint :
    status === "expired"  ? C.amber  :
    C.inkGhost;

  // ── Refresh: re-fetch link state from server ─────────────────────────────────
  // Needed when the user creates a link via the share panel in the same session.

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/catalog-definitions/${catalogId}/public-links`,
      );
      if (res.ok) {
        const data = await res.json() as { links: CatalogPublicLinkRecord[] };
        setLink(data.links?.[0] ?? null);
      }
    } catch {
      // Silent — user can retry
    } finally {
      setRefreshing(false);
    }
  }, [orgSlug, catalogId]);

  // ── Download PNG ─────────────────────────────────────────────────────────────

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${qrApiBase}?download=true`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `qr-${catalogName.toLowerCase().replace(/\s+/g, "-")}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Silent — preview still visible
    } finally {
      setDownloading(false);
    }
  }, [qrApiBase, catalogName]);

  // ── Copy public URL ──────────────────────────────────────────────────────────

  const handleCopy = useCallback(async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silent
    }
  }, [publicUrl]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{
      background:   C.surface,
      border:       `1px solid ${C.line}`,
      borderRadius: R.md,
      padding:      `${S[3]}px ${S[4]}px`,
      boxShadow:    E.xs,
      marginBottom: S[4],
    }}>

      {/* Panel header */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   S[3],
      }}>
        <div style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          fontWeight: T.wt.semibold,
          color:      C.ink,
        }}>
          Código QR
        </div>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          fontWeight:    T.wt.bold,
          padding:       "2px 8px",
          borderRadius:  R.pill,
          background:    statusColor + "18",
          color:         statusColor,
          border:        `1px solid ${statusColor}40`,
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
        }}>
          {PUBLIC_LINK_STATUS_LABELS[status]}
        </span>
      </div>

      {/* Body */}
      {isActive && publicUrl ? (
        <QrPreviewCard
          qrApiUrl={qrApiBase}
          publicUrl={publicUrl}
          catalogName={catalogName}
          onDownload={handleDownload}
          downloading={downloading}
          onCopy={handleCopy}
          copied={copied}
        />
      ) : (
        <UnavailableCard
          reason={
            status === "inactive" ? "link_inactive" :
            status === "expired"  ? "link_expired"  :
            "no_link"
          }
          onRefresh={() => void handleRefresh()}
          refreshing={refreshing}
        />
      )}

    </div>
  );
}
