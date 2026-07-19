/**
 * components/marketing-studio/shared/ms-drawer-header.tsx
 *
 * MARKETING-STUDIO-UX-SYSTEM-03 — Drawer Header
 *
 * Canonical identity header for all Marketing Studio entity fichas.
 * Shows: domain-tinted thumbnail capsule | name + SKU + category |
 *        status badge | readiness bar | close button.
 *
 * Replaces: every custom header built directly inside drawer components.
 *
 * Client Component — close button requires onClick.
 */

"use client";

import { X, Package } from "lucide-react";
import { C, T, S, R }    from "@/lib/ui/tokens";
import { MS_SHADOWS } from "@/lib/marketing-studio/ms-design-system";
import { MSStatusBadge }  from "./ms-status-badge";
import type { MSStatusVariant } from "./ms-status-badge";

export interface MSDrawerHeaderProps {
  /** Thumbnail image URL — falls back to Package icon */
  thumbnail?:      string | null;
  /** Domain accent color — e.g. MS_PALETTE.product.primary */
  domainColor:     string;
  /** Primary entity name */
  name:            string;
  /** Secondary identity — e.g. SKU */
  sku?:            string | null;
  /** Tertiary identity — e.g. category */
  category?:       string | null;
  /** Status badge semantic variant */
  statusVariant:   MSStatusVariant;
  /** Status badge display label */
  statusLabel:     string;
  /** 0–100 readiness score; omit to hide bar */
  readinessScore?: number;
  /**
   * Thumbnail capsule size in px — default 72.
   * Larger than MS_APP_ICON.size (56) to give product primacy in the drawer.
   */
  thumbnailSize?:  number;
  /** Close handler */
  onClose:         () => void;
}

export function MSDrawerHeader({
  thumbnail, domainColor, name, sku, category,
  statusVariant, statusLabel, readinessScore,
  thumbnailSize = 72, onClose,
}: MSDrawerHeaderProps) {
  const iconSize = thumbnailSize;

  return (
    <div style={{
      padding:      `${S[4]}px ${S[5]}px ${S[3]}px`,
      paddingTop:   S[4],
      borderBottom: `1px solid ${C.line}`,
      borderTop:    `3px solid ${domainColor}`,
      background:   C.white,
      flexShrink:   0,
      display:      "flex",
      alignItems:   "flex-start",
      gap:          S[3],
    }}>

      {/* Thumbnail capsule */}
      <div style={{
        width:          iconSize,
        height:         iconSize,
        borderRadius:   R.xl,
        background:     `linear-gradient(145deg, rgba(255,255,255,0.9) 0%, ${domainColor}15 100%)`,
        boxShadow:      MS_SHADOWS.appIcon(domainColor),
        border:         `1.5px solid ${domainColor}22`,
        overflow:       "hidden",
        flexShrink:     0,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
      }}>
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail}
            alt={name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Package size={24} strokeWidth={1.4} color={domainColor} />
        )}
      </div>

      {/* Identity block */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Name */}
        <div style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.lg,
          fontWeight:    T.wt.bold,
          color:         C.ink,
          letterSpacing: "-0.02em",
          lineHeight:    1.25,
          whiteSpace:    "nowrap",
          overflow:      "hidden",
          textOverflow:  "ellipsis",
        }}>
          {name}
        </div>

        {/* SKU · Category */}
        {(sku || category) && (
          <div style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            color:         C.inkFaint,
            marginTop:     2,
            letterSpacing: "0.01em",
          }}>
            {[sku, category].filter(Boolean).join(" · ")}
          </div>
        )}

        {/* Status + Readiness row */}
        <div style={{
          display:    "flex",
          alignItems: "center",
          gap:        S[2],
          marginTop:  S[1],
          flexWrap:   "wrap" as const,
        }}>
          <MSStatusBadge label={statusLabel} variant={statusVariant} />

          {readinessScore !== undefined && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* Bar */}
              <div style={{
                width:        60,
                height:       4,
                borderRadius: R.pill,
                background:   C.lineSubtle,
                overflow:     "hidden",
              }}>
                <div style={{
                  width:        `${readinessScore}%`,
                  height:       "100%",
                  background:
                    readinessScore >= 80 ? C.green :
                    readinessScore >= 50 ? C.amber :
                    C.red,
                  borderRadius: R.pill,
                }} />
              </div>
              {/* Score */}
              <span style={{
                fontFamily:         T.mono,
                fontSize:           T.sz["2xs"],
                color:              C.inkFaint,
                fontVariantNumeric: "tabular-nums",
              }}>
                {readinessScore}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        aria-label="Cerrar"
        style={{
          background:    "none",
          border:        "none",
          cursor:        "pointer",
          padding:       S[1],
          color:         C.inkLight,
          flexShrink:    0,
          borderRadius:  R.sm,
          display:       "flex",
          alignItems:    "center",
          justifyContent:"center",
        }}
      >
        <X size={16} strokeWidth={1.8} />
      </button>
    </div>
  );
}
