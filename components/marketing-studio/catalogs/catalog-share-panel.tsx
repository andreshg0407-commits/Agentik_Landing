"use client";
/**
 * components/marketing-studio/catalogs/catalog-share-panel.tsx
 *
 * MARKETING-STUDIO-CATALOG-PUBLIC-LINKS-01 — Catalog Share Panel
 *
 * Shows the public link state and provides actions:
 *   - Create link (first-time publish)
 *   - Copy link to clipboard
 *   - Open public URL
 *   - Deactivate / Reactivate
 *   - Regenerate slug (old link stops working, confirm required)
 *
 * Receives the initial link state from the server page.
 * All mutations go through the org-scoped API routes.
 */

import { useState, useCallback }             from "react";
import { C, T, S, R, E }                     from "@/lib/ui/tokens";
import type { CatalogPublicLinkRecord }       from "@/lib/marketing-studio/catalogs/catalog-public-link-types";
import {
  resolvePublicLinkStatus,
  PUBLIC_LINK_STATUS_LABELS,
}                                             from "@/lib/marketing-studio/catalogs/catalog-public-link-types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug:    string;
  catalogId:  string;
  /** Initial link state from server — null if no link exists yet. */
  initialLink: CatalogPublicLinkRecord | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPublicUrl(slug: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/c/${slug}`;
  }
  return `/c/${slug}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CatalogSharePanel({ orgSlug, catalogId, initialLink }: Props) {
  const [link,    setLink]    = useState<CatalogPublicLinkRecord | null>(initialLink);
  const [working, setWorking] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [copied,  setCopied]  = useState(false);

  const status = resolvePublicLinkStatus(link);
  const publicUrl = link ? buildPublicUrl(link.slug) : null;

  const baseUrl = `/api/orgs/${orgSlug}/marketing-studio/catalog-definitions/${catalogId}/public-links`;

  // ── API helpers ─────────────────────────────────────────────────────────────

  const callCreate = useCallback(async () => {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(baseUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({}),
      });
      if (!res.ok) { setError("Error al crear enlace"); return; }
      const data = await res.json() as { link: CatalogPublicLinkRecord };
      setLink(data.link);
    } catch {
      setError("Error de red");
    } finally {
      setWorking(false);
    }
  }, [baseUrl]);

  const callPatch = useCallback(async (body: Record<string, unknown>) => {
    if (!link) return;
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/${link.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (!res.ok) { setError("Error al actualizar enlace"); return; }
      const data = await res.json() as { link: CatalogPublicLinkRecord };
      setLink(data.link);
    } catch {
      setError("Error de red");
    } finally {
      setWorking(false);
    }
  }, [baseUrl, link]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleCreate = useCallback(() => {
    void callCreate();
  }, [callCreate]);

  const handleDeactivate = useCallback(() => {
    void callPatch({ isActive: false });
  }, [callPatch]);

  const handleReactivate = useCallback(() => {
    void callPatch({ isActive: true });
  }, [callPatch]);

  const handleRegenerate = useCallback(() => {
    if (!confirm(
      "¿Regenerar el enlace público? El enlace anterior dejará de funcionar inmediatamente."
    )) return;
    void callPatch({ regenerate: true });
  }, [callPatch]);

  const handleCopy = useCallback(async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text in a dummy input
      setError("No se pudo copiar — copia el enlace manualmente");
    }
  }, [publicUrl]);

  // ── Styles ──────────────────────────────────────────────────────────────────

  const statusColor =
    status === "active"   ? C.green :
    status === "inactive" ? C.inkFaint :
    status === "expired"  ? C.amber :
    C.inkGhost;

  const btnBase: React.CSSProperties = {
    fontFamily:   T.mono,
    fontSize:     T.sz["2xs"],
    fontWeight:   T.wt.semibold,
    padding:      "3px 10px",
    borderRadius: R.sm,
    cursor:       working ? "not-allowed" : "pointer",
    border:       `1px solid ${C.line}`,
    background:   C.white,
    color:        C.inkMid,
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{
      background:   C.surface,
      border:       `1px solid ${C.line}`,
      borderRadius: R.md,
      padding:      `${S[3]}px ${S[4]}px`,
      boxShadow:    E.xs,
      marginBottom: S[4],
    }}>

      {/* Header */}
      <div style={{
        display:       "flex",
        alignItems:    "center",
        justifyContent: "space-between",
        marginBottom:  S[3],
      }}>
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs,
          fontWeight: T.wt.semibold, color: C.ink,
        }}>
          Compartir catálogo
        </div>

        {/* Status badge */}
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

      {/* No link yet */}
      {status === "not_published" && (
        <div>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"],
            color: C.inkFaint, marginBottom: S[3],
          }}>
            Este catálogo aún no tiene un enlace público. Crea uno para compartirlo.
          </div>
          <button
            onClick={handleCreate}
            disabled={working}
            style={{
              ...btnBase,
              background: C.blueDark,
              border:     `1px solid ${C.blueDark}`,
              color:      C.white,
            }}
          >
            {working ? "Creando…" : "Crear enlace público"}
          </button>
        </div>
      )}

      {/* Link exists */}
      {link && status !== "not_published" && (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>

          {/* URL display */}
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:          S[2],
            background:   C.white,
            border:       `1px solid ${C.line}`,
            borderRadius: R.sm,
            padding:      `${S[1]}px ${S[2]}px`,
          }}>
            <span style={{
              fontFamily:  T.mono,
              fontSize:    T.sz["2xs"],
              color:       status === "active" ? C.ink : C.inkFaint,
              flex:        1,
              overflow:    "hidden",
              textOverflow: "ellipsis",
              whiteSpace:  "nowrap" as const,
            }}>
              {publicUrl}
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const }}>

            {/* Copy link */}
            {status === "active" && (
              <button
                onClick={() => void handleCopy()}
                disabled={working}
                style={{
                  ...btnBase,
                  background: copied ? C.green : C.white,
                  color:      copied ? C.white : C.inkMid,
                  border:     `1px solid ${copied ? C.green : C.line}`,
                }}
              >
                {copied ? "Enlace copiado ✓" : "Copiar enlace"}
              </button>
            )}

            {/* Open public page */}
            {status === "active" && publicUrl && (
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...btnBase,
                  textDecoration: "none",
                  display:        "inline-block",
                }}
              >
                Ver catálogo público ↗
              </a>
            )}

            {/* Deactivate / Reactivate */}
            {status === "active" && (
              <button
                onClick={handleDeactivate}
                disabled={working}
                style={{ ...btnBase, color: C.amber, borderColor: `${C.amber}40` }}
              >
                Desactivar
              </button>
            )}
            {status === "inactive" && (
              <button
                onClick={handleReactivate}
                disabled={working}
                style={{
                  ...btnBase,
                  background: C.green,
                  border:     `1px solid ${C.green}`,
                  color:      C.white,
                }}
              >
                Reactivar
              </button>
            )}

            {/* Regenerate slug */}
            <button
              onClick={handleRegenerate}
              disabled={working}
              style={{ ...btnBase, color: C.red, borderColor: `${C.red}40` }}
            >
              Regenerar enlace
            </button>
          </div>

          {/* Access stats */}
          <div style={{
            display:    "flex",
            gap:        S[3],
            flexWrap:   "wrap" as const,
          }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
              {link.accessCount} visita{link.accessCount !== 1 ? "s" : ""}
            </span>
            {link.lastAccessAt && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                · Última visita: {new Intl.DateTimeFormat("es-CO", {
                  day: "numeric", month: "short", year: "numeric",
                }).format(new Date(link.lastAccessAt))}
              </span>
            )}
            {link.expiresAt && (
              <span style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"],
                color: status === "expired" ? C.red : C.amber,
              }}>
                · Expira: {new Intl.DateTimeFormat("es-CO", {
                  day: "numeric", month: "short", year: "numeric",
                }).format(new Date(link.expiresAt))}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz["2xs"],
          color:        C.red,
          background:   "#fff1f0",
          border:       `1px solid ${C.red}40`,
          borderRadius: R.sm,
          padding:      `${S[1]}px ${S[2]}px`,
          marginTop:    S[2],
        }}>
          {error}
        </div>
      )}

    </div>
  );
}
