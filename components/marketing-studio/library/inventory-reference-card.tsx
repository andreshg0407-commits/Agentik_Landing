"use client";

/**
 * components/marketing-studio/library/inventory-reference-card.tsx
 *
 * MARKETING-LIBRARY-INVENTORY-TRUTH-02A — Inventory Reference Card
 *
 * Displays a single inventory reference with:
 *   - Miniatura principal o placeholder
 *   - Referencia + descripción
 *   - Mundo / línea comercial
 *   - Disponibilidad real
 *   - Cantidad de assets
 *   - Estado visual
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import { MS_CARD, MS_SHADOWS } from "@/lib/marketing-studio/ms-design-system";
import { WORLD_ACCENT } from "@/lib/marketing-studio/library/world-classification";
import type { InventoryReference, InventoryRefVisualState } from "@/lib/marketing-studio/library/inventory-reference-types";

interface InventoryReferenceCardProps {
  reference:   InventoryReference;
  onClick:     () => void;
  isSelected?: boolean;
}

const STATE_CONFIG: Record<InventoryRefVisualState, {
  label: string; color: string; bg: string;
}> = {
  with_hero:      { label: "Con imagen principal", color: C.green,    bg: C.greenLight },
  with_assets:    { label: "Con assets, sin principal", color: C.amber, bg: C.amberLight },
  no_assets:      { label: "Sin recursos visuales", color: C.inkFaint, bg: C.surface },
  sin_clasificar: { label: "Sin clasificar",      color: C.amber,    bg: C.amberLight },
  inactive:       { label: "Inactiva",             color: C.red,      bg: C.redLight },
};

export function InventoryReferenceCard({ reference, onClick, isSelected }: InventoryReferenceCardProps) {
  const worldAccent = WORLD_ACCENT[reference.world];
  const stateConf = STATE_CONFIG[reference.visualState];

  return (
    <button
      onClick={onClick}
      aria-label={`Abrir carpeta ${reference.refCode} — ${reference.description}`}
      style={{
        display:       "flex",
        flexDirection: "column" as const,
        background:    C.white,
        border:        isSelected ? `2px solid ${C.blueDark}` : `1px solid ${C.line}`,
        borderRadius:  MS_CARD.borderRadius,
        overflow:      "hidden",
        cursor:        "pointer",
        textAlign:     "left" as const,
        boxShadow:     isSelected ? `0 0 0 2px ${C.blueDark}22` : MS_SHADOWS.card,
        transition:    "border-color .12s, box-shadow .12s",
        width:         "100%",
        outline:       "none",
      }}
    >
      {/* Thumbnail */}
      <div style={{
        height:     MS_CARD.height,
        background: C.surface,
        display:    "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow:   "hidden",
        position:   "relative" as const,
      }}>
        {reference.primaryAssetUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={reference.primaryAssetUrl}
            alt={reference.description}
            style={{
              maxWidth: "100%", maxHeight: "100%",
              objectFit: "contain", display: "block",
            }}
          />
        ) : (
          <div style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"],
            color: C.inkGhost, textAlign: "center" as const,
          }}>
            Sin imagen
          </div>
        )}

        {/* World badge (top-left) */}
        <div style={{
          position:     "absolute" as const,
          top: 6, left: 6,
          fontFamily:   T.mono,
          fontSize:     8,
          fontWeight:   T.wt.bold,
          color:        worldAccent,
          background:   `${worldAccent}12`,
          border:       `1px solid ${worldAccent}33`,
          borderRadius: R.sm,
          padding:      "2px 5px",
          textTransform: "uppercase" as const,
          letterSpacing: "0.04em",
        }}>
          {reference.worldLabel}
        </div>

        {/* Availability badge (top-right) */}
        <div style={{
          position:     "absolute" as const,
          top: 6, right: 6,
          fontFamily:   T.mono,
          fontSize:     9,
          fontWeight:   T.wt.bold,
          color:        reference.isAvailable ? C.green : C.red,
          background:   reference.isAvailable ? C.greenLight : C.redLight,
          borderRadius: R.sm,
          padding:      "2px 5px",
          fontVariantNumeric: "tabular-nums",
        }}>
          {reference.isAvailable
            ? `${reference.disponible} disp.`
            : "Sin stock"}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: `${S[3]}px ${S[3]}px ${S[2]}px` }}>
        {/* Reference code */}
        <div style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.bold,
          color:         C.ink,
          overflow:      "hidden",
          textOverflow:  "ellipsis",
          whiteSpace:    "nowrap" as const,
          marginBottom:  2,
        }}>
          {reference.refCode}
        </div>

        {/* Description */}
        <div style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          color:         C.inkMid,
          overflow:      "hidden",
          textOverflow:  "ellipsis",
          whiteSpace:    "nowrap" as const,
          marginBottom:  S[2],
        }}>
          {reference.description}
        </div>

        {/* Bottom row: visual state + asset count */}
        <div style={{
          display:    "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap:        S[2],
        }}>
          {/* Visual state badge */}
          <div style={{
            fontFamily:   T.mono,
            fontSize:     8,
            fontWeight:   T.wt.semibold,
            color:        stateConf.color,
            background:   stateConf.bg,
            borderRadius: R.sm,
            padding:      "1px 5px",
            flexShrink:   0,
          }}>
            {stateConf.label}
          </div>

          {/* Asset count */}
          {reference.assetCount > 0 && (
            <div style={{
              fontFamily: T.mono,
              fontSize:   8,
              color:      C.inkFaint,
              flexShrink: 0,
            }}>
              {reference.assetCount} asset{reference.assetCount !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
