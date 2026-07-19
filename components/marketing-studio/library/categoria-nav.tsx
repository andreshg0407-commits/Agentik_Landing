/**
 * components/marketing-studio/library/categoria-nav.tsx
 *
 * MARKETING-STUDIO-LIBRARY-CATEGORY-NAVIGATION-01 — Phase 4
 *
 * Horizontal category navigation rail for Biblioteca.
 * Categories are derived from ProductEntity.category — no DB table required.
 *
 * ── Slots ─────────────────────────────────────────────────────────────────────
 *   "Todas"          → activeCategory = "all"
 *   "Sin categoría"  → activeCategory = "uncategorized"
 *   {category}       → activeCategory = category string (exact match)
 *
 * ── Design contract ───────────────────────────────────────────────────────────
 *   MS_PALETTE.product for active state
 *   C.* / T.* / S.* / R.* — no raw hex
 *   Horizontal scroll — no overflow visible on desktop
 */

"use client";

import { C, T, S, R }              from "@/lib/ui/tokens";
import { MS_PALETTE }               from "@/lib/marketing-studio/ms-design-system";
import type { ProductConsoleItem }  from "@/lib/marketing-studio/products/product-display";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CategoriaNavProps {
  /** Full unfiltered product list — used for per-category counts */
  allProducts:    ProductConsoleItem[];
  activeCategory: string;
  onSelect:       (cat: string) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DOMAIN = MS_PALETTE.product;

// ── Component ─────────────────────────────────────────────────────────────────

export function CategoriaNav({ allProducts, activeCategory, onSelect }: CategoriaNavProps) {
  // Derive sorted unique category list from the full unfiltered product array
  const seen = new Set<string>();
  for (const p of allProducts) {
    if (p.category) seen.add(p.category);
  }
  const categories = [...seen].sort((a, b) => a.localeCompare(b, "es"));

  const uncategorizedCount = allProducts.filter(p => !p.category).length;
  const totalCount         = allProducts.length;

  // Chip list: Todas → real categories → Sin categoría (only if uncategorized exist)
  const chips: { id: string; label: string; count: number }[] = [
    { id: "all", label: "Todas", count: totalCount },
    ...categories.map(cat => ({
      id:    cat,
      label: cat,
      count: allProducts.filter(p => p.category === cat).length,
    })),
  ];
  if (uncategorizedCount > 0) {
    chips.push({ id: "uncategorized", label: "Sin categoría", count: uncategorizedCount });
  }

  // Only render when there are categories or uncategorized items to navigate
  if (chips.length <= 1) return null;

  return (
    <div
      style={{
        display:         "flex",
        gap:             S[2],
        overflowX:       "auto",
        paddingBottom:   2,
        scrollbarWidth:  "none",
      } as React.CSSProperties}
    >
      {chips.map(chip => {
        const isActive = activeCategory === chip.id;
        return (
          <button
            key={chip.id}
            onClick={() => onSelect(chip.id)}
            style={{
              display:       "flex",
              alignItems:    "center",
              gap:           4,
              flexShrink:    0,
              fontFamily:    T.mono,
              fontSize:      "11px",
              fontWeight:    isActive ? T.wt.bold : T.wt.medium,
              color:         isActive ? DOMAIN.primary : C.inkMid,
              background:    isActive ? DOMAIN.selectedBg : C.surface,
              border:        isActive
                ? `1.5px solid ${DOMAIN.primary}55`
                : `1px solid ${C.line}`,
              borderRadius:  R.pill,
              padding:       "5px 12px",
              cursor:        "pointer",
              transition:    "all 0.12s",
              letterSpacing: isActive ? "-0.01em" : "0",
              whiteSpace:    "nowrap" as const,
            }}
          >
            {chip.label}
            <span style={{
              fontFamily:    T.mono,
              fontSize:      9,
              fontWeight:    T.wt.bold,
              color:         isActive ? DOMAIN.primary : C.inkFaint,
              background:    isActive ? `${DOMAIN.primary}18` : C.line,
              borderRadius:  R.pill,
              padding:       "1px 5px",
              letterSpacing: "0",
              lineHeight:    1.6,
              minWidth:      16,
              textAlign:     "center" as const,
              display:       "inline-block",
            }}>
              {chip.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
