/**
 * components/marketing-studio/shared/ms-drawer-hero.tsx
 *
 * MARKETING-STUDIO-UX-SYSTEM-03 — Drawer Hero Strip
 *
 * Compact horizontal strip showing the entity's readiness dimensions
 * at a glance, directly below the header. Each dimension has a colored
 * dot + label: green = ok, red = missing, gray = unavailable.
 *
 * Usage:
 *   <MSDrawerHero dimensions={[
 *     { key: "assets",  label: "Assets",   ok: product.assetCount > 0 },
 *     { key: "shopify", label: "Shopify",  ok: product.readyDestinations.includes("shopify") },
 *   ]} />
 *
 * Server Component — pure display, no interaction.
 */

import { C, T, S } from "@/lib/ui/tokens";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MSDrawerDimension {
  /** Stable unique key */
  key:    string;
  /** Short display label, e.g. "Assets", "Vars", "SEO" */
  label:  string;
  /**
   * true  → green dot (ready)
   * false → red dot   (missing)
   * "na"  → gray dot  (not applicable / unknown)
   */
  ok:     boolean | "na";
  /** Optional raw value shown after label, e.g. "12 archivos" */
  value?: string;
}

export interface MSDrawerHeroProps {
  dimensions: MSDrawerDimension[];
  style?:     React.CSSProperties;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MSDrawerHero({ dimensions, style }: MSDrawerHeroProps) {
  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          S[3],
      padding:      `${S[2]}px ${S[5]}px`,
      borderBottom: `1px solid ${C.line}`,
      background:   C.white,
      flexShrink:   0,
      flexWrap:     "wrap" as const,
      ...style,
    }}>

      {/* Label */}
      <span style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        color:         C.inkGhost,
        letterSpacing: "0.05em",
        textTransform: "uppercase" as const,
        flexShrink:    0,
      }}>
        Preparación
      </span>

      {/* Dimensions */}
      {dimensions.map((dim, i) => {
        const dotColor =
          dim.ok === true  ? C.green :
          dim.ok === false ? C.red   :
          C.inkGhost;

        const textColor =
          dim.ok === true  ? C.green :
          dim.ok === false ? C.red   :
          C.inkFaint;

        return (
          <span key={dim.key} style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {/* Separator dot */}
            {i > 0 && (
              <span style={{
                color:      C.inkGhost,
                fontFamily: T.mono,
                fontSize:   9,
                marginRight: 2,
              }}>·</span>
            )}

            {/* Status dot */}
            <span style={{
              width:        5,
              height:       5,
              borderRadius: "50%",
              background:   dotColor,
              flexShrink:   0,
            }} />

            {/* Label */}
            <span style={{
              fontFamily: T.mono,
              fontSize:   T.sz["2xs"],
              color:      textColor,
              fontWeight: dim.ok !== "na" ? T.wt.medium : T.wt.normal,
            }}>
              {dim.label}
              {dim.value && (
                <span style={{ color: C.inkFaint, fontWeight: T.wt.normal }}>
                  {" "}{dim.value}
                </span>
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
}
