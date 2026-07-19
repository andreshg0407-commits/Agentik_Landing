"use client";

/**
 * components/marketing-studio/shopify/publish-ready-button.tsx
 *
 * SHOPIFY-CATALOG-OPERATIONS-01B — Bulk Publish CTA with Confirmation
 *
 * Flow:
 *   idle → previewing (dryRun fetch) → confirming (show summary)
 *        → publishing (real publish)  → done (show result)
 *
 * The user must confirm before any real Shopify API call is made.
 * Cancelling at the confirming step leaves Shopify untouched.
 */

import { useState } from "react";
import { C, T, S, R } from "@/lib/ui/tokens";

interface Props {
  orgSlug:     string;
  readyCount:  number;
  isConnected: boolean;
}

// ── Local types (client-safe — no server-only imports) ────────────────────────

interface DryRunPreview {
  publishableCount:      number;
  updateableCount:       number;
  blockedCount:          number;
  alreadyPublishedCount: number;
  autoFixAvailable:      boolean;
}

interface PublishResult {
  published: number;
  failed:    number;
  error?:    string;
}

type ButtonState = "idle" | "previewing" | "confirming" | "publishing" | "done";

// ── Component ─────────────────────────────────────────────────────────────────

export function PublishReadyButton({ orgSlug, readyCount, isConnected }: Props) {
  const [state,   setState]   = useState<ButtonState>("idle");
  const [preview, setPreview] = useState<DryRunPreview | null>(null);
  const [result,  setResult]  = useState<PublishResult | null>(null);

  const apiBase = `/api/orgs/${orgSlug}/marketing-studio/shopify/catalog/publish-ready`;

  // ── Disabled ────────────────────────────────────────────────────────────────
  if (!isConnected || readyCount === 0) {
    return (
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
        padding: `${S[1]}px ${S[3]}px`,
        border: `1px solid ${C.line}`, borderRadius: R.md,
        cursor: "default",
      }}>
        {!isConnected ? "Conecta Shopify para publicar" : "Sin productos listos"}
      </span>
    );
  }

  // ── Step 1: user clicks → fetch dryRun preview ──────────────────────────────
  async function handleClick() {
    setState("previewing");
    try {
      const res  = await fetch(apiBase, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ dryRun: true }),
      });
      const data = await res.json() as {
        ok?: boolean;
        publishableCount?: number;
        updateableCount?: number;
        blockedCount?: number;
        alreadyPublishedCount?: number;
        autoFixAvailable?: boolean;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        setState("done");
        setResult({ published: 0, failed: 0, error: data.error ?? "Error al analizar" });
        return;
      }

      setPreview({
        publishableCount:      data.publishableCount      ?? 0,
        updateableCount:       data.updateableCount       ?? 0,
        blockedCount:          data.blockedCount          ?? 0,
        alreadyPublishedCount: data.alreadyPublishedCount ?? 0,
        autoFixAvailable:      data.autoFixAvailable      ?? false,
      });
      setState("confirming");
    } catch {
      setState("done");
      setResult({ published: 0, failed: 0, error: "Error de red al analizar" });
    }
  }

  // ── Step 2: user confirms → real publish ────────────────────────────────────
  async function handleConfirm() {
    setState("publishing");
    try {
      const res  = await fetch(apiBase, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ dryRun: false }),
      });
      const data = await res.json() as {
        ok?: boolean;
        published?: number;
        failed?: number;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        setResult({ published: 0, failed: 0, error: data.error ?? "Error al publicar" });
      } else {
        setResult({ published: data.published ?? 0, failed: data.failed ?? 0 });
      }
    } catch {
      setResult({ published: 0, failed: 0, error: "Error de red" });
    } finally {
      setState("done");
    }
  }

  function reset() {
    setState("idle");
    setPreview(null);
    setResult(null);
  }

  // ── Previewing ──────────────────────────────────────────────────────────────
  if (state === "previewing") {
    return (
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
        padding: `${S[1]}px ${S[3]}px`,
      }}>
        Analizando…
      </span>
    );
  }

  // ── Confirming — show compact summary panel ─────────────────────────────────
  if (state === "confirming" && preview) {
    const total = preview.publishableCount + preview.updateableCount;
    return (
      <div style={{
        border:       `1px solid ${C.line}`,
        borderRadius: R.md,
        background:   C.white,
        boxShadow:    "0 4px 16px rgba(0,0,0,0.10)",
        padding:      `${S[3]}px`,
        minWidth:     220,
        maxWidth:     300,
      }}>
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
          color: C.ink, marginBottom: S[2],
        }}>
          Confirmación de publicación
        </div>

        <div style={{ marginBottom: S[3], display: "flex", flexDirection: "column" as const, gap: 3 }}>
          {total === 0 ? (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              No hay productos para publicar en este momento.
            </span>
          ) : (
            <>
              {preview.publishableCount > 0 && (
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green }}>
                  ✓ {preview.publishableCount} se {preview.publishableCount === 1 ? "publicará" : "publicarán"}
                </span>
              )}
              {preview.updateableCount > 0 && (
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark }}>
                  ↑ {preview.updateableCount} se {preview.updateableCount === 1 ? "actualizará" : "actualizarán"}
                </span>
              )}
              {preview.blockedCount > 0 && (
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber }}>
                  ▲ {preview.blockedCount} {preview.blockedCount === 1 ? "requiere completar información" : "requieren completar información"}
                </span>
              )}
              {preview.alreadyPublishedCount > 0 && (
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                  — {preview.alreadyPublishedCount} ya {preview.alreadyPublishedCount === 1 ? "está publicado" : "están publicados"}
                </span>
              )}
              {preview.autoFixAvailable && (
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark,
                  marginTop: S[1],
                  padding: `${S[1]}px ${S[2]}px`,
                  background: "#EEF4FF",
                  borderRadius: R.md,
                  border: `1px solid ${C.blueBorder}`,
                }}>
                  ✦ Copilot podrá completar información antes de publicar.
                </span>
              )}
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: S[2] }}>
          {total > 0 && (
            <button
              onClick={handleConfirm}
              style={{
                fontFamily:   T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                padding:      `${S[1]}px ${S[3]}px`, borderRadius: R.md,
                border:       "none", background: C.blueDark, color: "#fff",
                cursor:       "pointer",
              }}
            >
              Confirmar
            </button>
          )}
          <button
            onClick={reset}
            style={{
              fontFamily:   T.mono, fontSize: T.sz.xs,
              padding:      `${S[1]}px ${S[3]}px`, borderRadius: R.md,
              border:       `1px solid ${C.line}`, background: C.white,
              color:        C.inkMid, cursor: "pointer",
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ── Publishing ──────────────────────────────────────────────────────────────
  if (state === "publishing") {
    return (
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
        padding: `${S[1]}px ${S[3]}px`,
      }}>
        Publicando…
      </span>
    );
  }

  // ── Done — show result ──────────────────────────────────────────────────────
  if (state === "done" && result) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
        {result.error ? (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red }}>
            {result.error}
          </span>
        ) : (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green }}>
            {result.published} publicado{result.published !== 1 ? "s" : ""}
            {result.failed > 0 ? ` · ${result.failed} fallido${result.failed !== 1 ? "s" : ""}` : ""}
          </span>
        )}
        <button
          onClick={reset}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: C.inkFaint, fontFamily: T.mono, fontSize: T.sz.xs,
            padding: "0 4px", lineHeight: 1,
          }}
          aria-label="Cerrar"
        >
          ×
        </button>
      </div>
    );
  }

  // ── Idle — main button ──────────────────────────────────────────────────────
  return (
    <button
      onClick={handleClick}
      style={{
        fontFamily:   T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
        padding:      `${S[1]}px ${S[3]}px`, borderRadius: R.md,
        border:       "none", background: C.blueDark, color: "#fff",
        cursor:       "pointer", transition: "opacity 0.15s",
      }}
    >
      Publicar {readyCount} {readyCount === 1 ? "listo" : "listos"}
    </button>
  );
}
