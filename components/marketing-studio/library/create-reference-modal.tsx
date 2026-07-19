/**
 * components/marketing-studio/library/create-reference-modal.tsx
 *
 * MARKETING-STUDIO-REFERENCE-CREATION-01 — Phase 5
 *
 * Modal form for creating a standalone ProductEntity directly from Biblioteca.
 * Does NOT require a GeneratedAsset — assets are linked later.
 *
 * ── Fields ────────────────────────────────────────────────────────────────────
 *   Name        required  string
 *   SKU         optional  string
 *   Category    optional  string
 *   Price       optional  number (COP)
 *   Product line optional  string
 *
 * ── Design contract ──────────────────────────────────────────────────────────
 *   All tokens from MS_PALETTE / MS_CTA / MS_TYPOGRAPHY
 *   No raw hex values — all colors via C.* or MS_PALETTE.product
 *   No Tailwind color classes
 */

"use client";

import { useTransition, useState } from "react";
import { X, Package }              from "lucide-react";
import { C, T, S, R }              from "@/lib/ui/tokens";
import {
  MS_PALETTE,
  MS_SHADOWS,
  MS_APP_ICON,
  MS_CTA,
  MS_TYPOGRAPHY,
} from "@/lib/marketing-studio/ms-design-system";
import { createReference }         from "@/app/actions/marketing-studio/products";

// ── Constants ──────────────────────────────────────────────────────────────────

const DOMAIN = MS_PALETTE.product;

// ── Component ──────────────────────────────────────────────────────────────────

interface CreateReferenceModalProps {
  organizationId:      string;
  onSuccess:           (productId: string) => void;
  onClose:             () => void;
  /** List of category strings already in use — powers the datalist */
  existingCategories?: string[];
  /** Pre-selected category (e.g. when opening from an active category filter) */
  selectedCategory?:   string;
}

export function CreateReferenceModal({
  organizationId,
  onSuccess,
  onClose,
  existingCategories = [],
  selectedCategory,
}: CreateReferenceModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError]            = useState<string | null>(null);

  const [name,        setName]        = useState("");
  const [sku,         setSku]         = useState("");
  const [category,    setCategory]    = useState(selectedCategory ?? "");
  const [price,       setPrice]       = useState("");
  const [productLine, setProductLine] = useState("");

  const datalistId = "create-ref-category-list";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("El nombre del producto es requerido");
      return;
    }

    startTransition(async () => {
      const result = await createReference({
        organizationId,
        name:        name.trim(),
        sku:         sku.trim() || undefined,
        category:    category.trim() || undefined,
        price:       price.trim() ? Number(price.trim()) : undefined,
        productLine: productLine.trim() || undefined,
      });

      if (result.success && result.productId) {
        onSuccess(result.productId);
      } else {
        setError(result.error ?? "Error al crear la referencia");
      }
    });
  }

  return (
    // ── Overlay ──────────────────────────────────────────────────────────────
    <div
      style={{
        position:        "fixed",
        inset:           0,
        background:      "rgba(10, 15, 30, 0.45)",
        backdropFilter:  "blur(3px)",
        zIndex:          9000,
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        padding:         S[4],
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* ── Panel ────────────────────────────────────────────────────────── */}
      <div style={{
        background:   "#fff",
        border:       `1px solid ${C.line}`,
        borderRadius: 16,
        boxShadow:    [
          "0 24px 64px rgba(0,0,0,0.12)",
          "0 4px 16px rgba(0,0,0,0.06)",
          "inset 0 1px 0 rgba(255,255,255,0.9)",
        ].join(", "),
        width:        "100%",
        maxWidth:     440,
        padding:      "24px",
        display:      "flex",
        flexDirection: "column" as const,
        gap:          S[4],
      }}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: S[3] }}>
          {/* App icon capsule */}
          <div style={{
            width:          MS_APP_ICON.size,
            height:         MS_APP_ICON.size,
            borderRadius:   MS_APP_ICON.borderRadius,
            background:     `linear-gradient(145deg, rgba(255,255,255,0.92) 0%, ${DOMAIN.iconBg} 100%)`,
            boxShadow:      MS_SHADOWS.appIcon(DOMAIN.primary),
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            flexShrink:     0,
          }}>
            <Package
              size={MS_APP_ICON.iconSize}
              strokeWidth={MS_APP_ICON.strokeWidth}
              color={DOMAIN.primary}
            />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      MS_TYPOGRAPHY.cardTitleSize,
              fontWeight:    T.wt.bold,
              color:         C.ink,
              letterSpacing: "-0.02em",
              lineHeight:    1.3,
            }}>
              Nueva referencia de producto
            </div>
            <div style={{
              fontFamily: T.mono,
              fontSize:   MS_TYPOGRAPHY.descSize,
              color:      C.inkMid,
              marginTop:  4,
            }}>
              Sin assets por ahora — los vincularás desde la biblioteca
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              display:         "flex",
              alignItems:      "center",
              justifyContent:  "center",
              width:           28,
              height:          28,
              borderRadius:    R.pill,
              border:          `1px solid ${C.line}`,
              background:      C.surface,
              cursor:          "pointer",
              flexShrink:      0,
              color:           C.inkMid,
            }}
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>

        {/* ── Form ─────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>

          {/* Name — required */}
          <Field label="Nombre" required>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ej. Maleta Ejecutiva 24 Pulgadas"
              disabled={isPending}
              style={inputStyle}
            />
          </Field>

          {/* SKU + Category — 2 columns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
            <Field label="SKU">
              <input
                type="text"
                value={sku}
                onChange={e => setSku(e.target.value)}
                placeholder="ej. MAL-EJ-24"
                disabled={isPending}
                style={inputStyle}
              />
            </Field>
            <Field label="Categoría">
              <>
                <input
                  type="text"
                  list={datalistId}
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  placeholder="ej. Ropa bebé"
                  disabled={isPending}
                  style={inputStyle}
                />
                {existingCategories.length > 0 && (
                  <datalist id={datalistId}>
                    {existingCategories.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                )}
              </>
            </Field>
          </div>

          {/* Price + Product line — 2 columns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
            <Field label="Precio (COP)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="ej. 350000"
                disabled={isPending}
                style={inputStyle}
              />
            </Field>
            <Field label="Línea de producto">
              <input
                type="text"
                value={productLine}
                onChange={e => setProductLine(e.target.value)}
                placeholder="ej. Ejecutiva"
                disabled={isPending}
                style={inputStyle}
              />
            </Field>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              fontFamily:   T.mono,
              fontSize:     MS_TYPOGRAPHY.descSize,
              color:        C.red,
              background:   C.redLight,
              border:       `1px solid ${C.redBorder}`,
              borderRadius: R.sm,
              padding:      "8px 12px",
            }}>
              {error}
            </div>
          )}

          {/* CTA bar */}
          <div style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "flex-end",
            gap:            S[2],
            paddingTop:     S[1],
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              style={{
                fontFamily:    T.mono,
                fontSize:      MS_TYPOGRAPHY.descSize,
                fontWeight:    T.wt.semibold,
                color:         C.inkMid,
                background:    "transparent",
                border:        "none",
                cursor:        "pointer",
                padding:       "8px 12px",
                borderRadius:  R.sm,
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending || !name.trim()}
              style={{
                fontFamily:    T.mono,
                fontSize:      "12px",
                fontWeight:    T.wt.bold,
                color:         "#fff",
                background:    isPending || !name.trim()
                  ? C.inkGhost
                  : MS_CTA.primaryButtonBg,
                border:        "none",
                borderRadius:  R.sm,
                padding:       "9px 18px",
                cursor:        isPending || !name.trim() ? "not-allowed" : "pointer",
                boxShadow:     isPending || !name.trim() ? "none" : MS_CTA.primaryBoxShadow,
                transition:    "background 0.15s, box-shadow 0.15s",
                letterSpacing: "-0.01em",
              }}
            >
              {isPending ? "Creando…" : "Crear referencia →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  children,
}: {
  label:     string;
  required?: boolean;
  children:  React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
      <label style={{
        fontFamily:    T.mono,
        fontSize:      MS_TYPOGRAPHY.tagSize,
        fontWeight:    T.wt.bold,
        color:         C.inkMid,
        letterSpacing: "0.06em",
        textTransform: "uppercase" as const,
      }}>
        {label}{required && <span style={{ color: C.red, marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

// ── Input style ───────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  fontFamily:   T.mono,
  fontSize:     "12px",
  color:        C.ink,
  background:   C.surface,
  border:       `1px solid ${C.line}`,
  borderRadius: R.sm,
  padding:      "8px 10px",
  width:        "100%",
  boxSizing:    "border-box",
  outline:      "none",
};
