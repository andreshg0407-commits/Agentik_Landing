"use client";
/**
 * components/marketing-studio/library/product-shopify-panel.tsx
 *
 * MARKETING-STUDIO-SHOPIFY-PUBLISHING-01 — Shopify Publishing Panel
 *
 * Block 9 inside product-detail-drawer.tsx — "Shopify".
 *
 * Shows:
 *   - Connection status (Shopify connected?)
 *   - Content readiness score + missing fields
 *   - Shopify override indicator (channel content active?)
 *   - Publication state (unpublished / published / archived)
 *   - Actions: Publicar / Actualizar / Archivar
 *   - Admin URL link when published
 *   - Last sync timestamp
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 *   Access token is NEVER sent to this component.
 *   All actions go through the org-scoped API route which fetches the token
 *   from the vault server-side.
 *
 * ── EXTENSION POINTS ──────────────────────────────────────────────────────────
 *   BULK_PUBLISH_SLOT:     "Publicar todos los listos" — batch publish action
 *   SHOPIFY_PREVIEW_SLOT:  embedded Shopify product preview iframe
 *   SCHEDULE_PUBLISH_SLOT: scheduled publication date/time picker
 */

import { useEffect, useState } from "react";
import { C, T, S, R, E }      from "@/lib/ui/tokens";
import { MS_PALETTE }          from "@/lib/marketing-studio/ms-design-system";

// ── Domain color ──────────────────────────────────────────────────────────────

const DOMAIN = MS_PALETTE.product;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShopifyStatus {
  score:               number;
  isPublishable:       boolean;
  missingRequired:     string[];
  warnings:            string[];
  hasShopifyOverrides: boolean;
  lastPublishedAt:     string | null;
  externalProductId:   string | null;
  shopifyHandle:       string | null;
  publicationStatus:   string;
  shopifyConnected:    boolean;
  shopifyShopDomain:   string | null;
}

interface ActionResult {
  success:          boolean;
  shopifyProductId: number | null;
  shopifyHandle:    string | null;
  adminUrl:         string | null;
  variantCount:     number;
  imageCount:       number;
  metafieldCount:   number;
  warnings:         string[];
  contentScore:     number;
  errorMessage:     string | null;
  error?:           string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string; border: string }> = {
    published:   { label: "Publicado",    bg: C.green   + "15", color: C.green,    border: C.green   + "40" },
    unpublished: { label: "Sin publicar", bg: C.inkFaint + "15", color: C.inkFaint, border: C.line },
    archived:    { label: "Archivado",    bg: C.amber   + "15", color: C.amber,    border: C.amber   + "40" },
    failed:      { label: "Error",        bg: C.red     + "15", color: C.red,      border: C.red     + "40" },
  };
  const c = cfg[status] ?? cfg.unpublished;
  return (
    <span style={{
      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
      padding: "2px 8px", borderRadius: R.pill,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      letterSpacing: "0.04em", whiteSpace: "nowrap" as const,
    }}>
      {c.label}
    </span>
  );
}

function ReadinessBar({ score }: { score: number }) {
  const color = score >= 70 ? C.green : score >= 40 ? C.amber : C.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
      <div style={{ flex: 1, height: 6, background: C.lineSubtle, borderRadius: R.pill, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: R.pill, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color, minWidth: 36 }}>
        {score}%
      </span>
    </div>
  );
}

function InfoCard({ label, value, dim }: { label: string; value: React.ReactNode; dim?: boolean }) {
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
        fontFamily:   T.mono,
        fontSize:     T.sz["2xs"],
        fontWeight:   T.wt.medium,
        color:        dim ? C.inkGhost : C.ink,
        fontStyle:    dim ? "italic" : "normal",
        overflow:     "hidden",
        textOverflow: "ellipsis",
        whiteSpace:   "nowrap" as const,
      }}>
        {value}
      </div>
    </div>
  );
}

function ActionButton({
  label, onClick, disabled, variant = "primary",
}: {
  label:    string;
  onClick:  () => void;
  disabled: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary:   { bg: C.blueDark,   border: C.blueDark,   color: C.white    },
    secondary: { bg: C.white,      border: C.line,        color: C.inkMid   },
    danger:    { bg: C.red+"15",   border: C.red+"50",    color: C.red      },
  }[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        fontWeight:   T.wt.semibold,
        padding:      `${S[2]}px ${S[4]}px`,
        borderRadius: R.sm,
        background:   disabled ? C.surface : styles.bg,
        color:        disabled ? C.inkFaint : styles.color,
        border:       `1px solid ${disabled ? C.line : styles.border}`,
        cursor:       disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug:   string;
  productId: string;
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProductShopifyPanel({ orgSlug, productId }: Props) {
  const [status,  setStatus]  = useState<ShopifyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const apiBase = `/api/orgs/${orgSlug}/marketing-studio/products/${productId}/shopify`;

  // ── Load status ─────────────────────────────────────────────────────────────
  function load() {
    setLoading(true);
    fetch(apiBase)
      .then(r => r.ok ? r.json() : null)
      .then((data: ShopifyStatus | null) => { if (data) setStatus(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [orgSlug, productId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function act(method: "POST" | "PUT" | "DELETE") {
    setActing(true);
    setMessage(null);
    try {
      const res  = await fetch(apiBase, { method });
      const data = await res.json() as ActionResult;
      if (res.ok && data.success) {
        const count = method === "POST" || method === "PUT"
          ? ` · ${data.imageCount} imágenes · ${data.metafieldCount} metafields`
          : "";
        setMessage({ type: "success", text: `✓ ${method === "DELETE" ? "Archivado" : method === "POST" ? "Publicado" : "Actualizado"}${count}` });
        load();
      } else {
        setMessage({ type: "error", text: data.error ?? data.errorMessage ?? "Error desconocido" });
      }
    } catch {
      setMessage({ type: "error", text: "Error de red. Inténtalo de nuevo." });
    } finally {
      setActing(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, padding: `${S[4]}px 0` }}>
        Cargando estado Shopify…
      </div>
    );
  }

  if (!status) {
    return (
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, padding: `${S[3]}px 0` }}>
        No se pudo cargar el estado.
      </div>
    );
  }

  const isPublished  = status.publicationStatus === "published";
  const isArchived   = status.publicationStatus === "archived";
  const canPublish   = status.shopifyConnected && status.isPublishable && !isPublished;
  const canUpdate    = status.shopifyConnected && isPublished;
  const canArchive   = status.shopifyConnected && (isPublished || isArchived);
  const adminUrl     = status.externalProductId && status.shopifyShopDomain
    ? `https://${status.shopifyShopDomain}/admin/products/${status.externalProductId}`
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>

      {/* ── Estado de conexión ─────────────────────────────────────────────── */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          S[3],
        padding:      `${S[2]}px ${S[3]}px`,
        background:   status.shopifyConnected ? C.green + "0A" : C.amber + "0A",
        border:       `1px solid ${status.shopifyConnected ? C.green + "30" : C.amber + "30"}`,
        borderRadius: R.md,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: status.shopifyConnected ? C.green : C.amber,
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: T.mono, fontSize: T.sz.xs,
          color: status.shopifyConnected ? C.green : C.amber,
        }}>
          {status.shopifyConnected
            ? `Tienda conectada · ${status.shopifyShopDomain ?? ""}`
            : "Tienda no conectada — ve a Integraciones para vincular tu tienda Shopify"}
        </span>
      </div>

      {/* ── Preparación para publicar ──────────────────────────────────────── */}
      <div style={{
        padding:       `${S[3]}px`,
        background:    C.surface,
        border:        `1px solid ${C.line}`,
        borderRadius:  R.md,
        display:       "flex",
        flexDirection: "column" as const,
        gap:           S[3],
      }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.xs,
            fontWeight: T.wt.semibold, color: C.ink,
          }}>
            Preparación para publicar en Shopify
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
            {status.hasShopifyOverrides && (
              <span style={{
                fontFamily:    T.mono, fontSize: 9, fontWeight: T.wt.bold,
                padding:       "1px 6px", borderRadius: R.pill,
                background:    C.blueDark + "12", color: C.blueDark,
                border:        `1px solid ${C.blueDark + "30"}`,
                letterSpacing: "0.02em",
              }}>
                Personalización activa
              </span>
            )}
            <StatusBadge status={status.publicationStatus} />
          </div>
        </div>

        {/* Readiness bar */}
        <ReadinessBar score={status.score} />

        {/* Campos faltantes — "Aspectos por revisar" */}
        {status.missingRequired.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
            <div style={{
              fontFamily:    T.mono, fontSize: 9, fontWeight: T.wt.semibold,
              color:         C.inkFaint, letterSpacing: "0.05em",
              textTransform: "uppercase" as const, marginBottom: 2,
            }}>
              Aspectos por completar
            </div>
            {status.missingRequired.map(f => (
              <div key={f} style={{
                display:      "flex",
                alignItems:   "center",
                gap:          S[2],
                padding:      `${S[1]}px ${S[2]}px`,
                background:   C.redLight,
                border:       `1px solid ${C.redBorder}`,
                borderRadius: R.sm,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.red, flexShrink: 0 }} />
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>{f}</span>
              </div>
            ))}
          </div>
        )}

        {/* Advertencias */}
        {status.warnings.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
            {status.warnings.map((w, i) => (
              <div key={i} style={{
                display:      "flex",
                alignItems:   "center",
                gap:          S[2],
                padding:      `${S[1]}px ${S[2]}px`,
                background:   C.amberLight,
                border:       `1px solid ${C.amberBorder}`,
                borderRadius: R.sm,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.amber, flexShrink: 0 }} />
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber }}>{w}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Información de publicación activa ─────────────────────────────── */}
      {(isPublished || isArchived) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
          {status.shopifyHandle && (
            <InfoCard
              label="Identificador en tienda"
              value={status.shopifyHandle}
            />
          )}
          <InfoCard
            label="Fecha de publicación"
            value={status.lastPublishedAt
              ? new Date(status.lastPublishedAt).toLocaleDateString("es-CO", {
                  day: "2-digit", month: "short", year: "numeric",
                })
              : "—"}
          />
          {adminUrl && (
            <div style={{
              gridColumn:   "1 / -1",
              background:   C.blueLight,
              border:       `1px solid ${C.blueBorder}`,
              borderRadius: R.md,
              padding:      `${S[2]}px ${S[3]}px`,
              display:      "flex",
              alignItems:   "center",
              justifyContent: "space-between",
            }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                Producto visible en tu tienda
              </span>
              <a
                href={adminUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily:     T.mono, fontSize: T.sz.xs,
                  fontWeight:     T.wt.semibold, color: C.blueDark,
                  textDecoration: "none",
                }}
              >
                Ver en Shopify →
              </a>
            </div>
          )}
        </div>
      )}

      {/* ── Acciones de publicación ────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const }}>
        {!isPublished && !isArchived && (
          <ActionButton
            label={acting ? "Publicando…" : "Publicar en Shopify"}
            onClick={() => void act("POST")}
            disabled={acting || !canPublish}
            variant="primary"
          />
        )}
        {isPublished && (
          <ActionButton
            label={acting ? "Actualizando…" : "Actualizar en Shopify"}
            onClick={() => void act("PUT")}
            disabled={acting || !canUpdate}
            variant="secondary"
          />
        )}
        {isArchived && (
          <ActionButton
            label={acting ? "Publicando…" : "Republicar en Shopify"}
            onClick={() => void act("POST")}
            disabled={acting || !status.shopifyConnected || !status.isPublishable}
            variant="primary"
          />
        )}
        {(isPublished || isArchived) && (
          <ActionButton
            label={acting ? "Archivando…" : "Archivar producto"}
            onClick={() => void act("DELETE")}
            disabled={acting || !canArchive}
            variant="danger"
          />
        )}
      </div>

      {/* ── Resultado de acción ────────────────────────────────────────────── */}
      {message && (
        <div style={{
          fontFamily:   T.mono, fontSize: T.sz.xs,
          color:        message.type === "success" ? C.green : C.red,
          padding:      `${S[2]}px ${S[3]}px`,
          background:   message.type === "success" ? C.green + "0A" : C.red + "0A",
          border:       `1px solid ${message.type === "success" ? C.green + "30" : C.red + "30"}`,
          borderRadius: R.sm,
        }}>
          {message.text}
        </div>
      )}

      {/* ── Guía para conectar tienda ──────────────────────────────────────── */}
      {!status.shopifyConnected && (
        <div style={{
          fontFamily: T.sans, fontSize: T.sz.xs, color: C.inkMid,
          lineHeight: 1.5, padding: `${S[2]}px 0`,
        }}>
          Conecta tu tienda Shopify desde <strong>Integraciones</strong> para habilitar la publicación.
          Una vez conectado, podrás publicar directamente desde esta ficha.
        </div>
      )}

      {/* ── Nota sobre contenido base ──────────────────────────────────────── */}
      {status.shopifyConnected && !status.hasShopifyOverrides && (
        <div style={{
          fontFamily: T.sans, fontSize: T.sz["2xs"], color: C.inkGhost, lineHeight: 1.5,
        }}>
          Usando información base del producto. Para personalizar el título, descripción
          o etiquetas específicos para esta tienda, edita el <strong>contenido personalizado por canal</strong> en la pestaña Por canal.
        </div>
      )}

      {/* BULK_PUBLISH_SLOT: "Publicar todos los listos" — batch publish future action */}
      {/* SCHEDULE_PUBLISH_SLOT: scheduled publication date/time picker */}
      {/* SHOPIFY_PREVIEW_SLOT: embedded product preview */}

    </div>
  );
}
