/**
 * components/comercial/commercial-reference-thumbnail.tsx
 *
 * Shared product thumbnail for all commercial reference lists.
 * Used by: Maletas, Importaciones (Recompras, Rotacion, Inventario lento),
 * and future modules (Pedidos, Tiendas, Vendedores).
 *
 * Data source: ProductAssetLink (role="hero") -> GeneratedAsset.assetUrl
 * Image must come pre-loaded in the server dataset — no per-row queries.
 *
 * Sprint: AGENTIK-IMPORTS-REORDER-NAVIGATION-01
 */

"use client";

import { useState } from "react";
import { C, T, R } from "@/lib/ui/tokens";

interface CommercialReferenceThumbnailProps {
  /** CDN URL for the product hero image (null = no image available) */
  imageUrl: string | null;
  /** Product reference code — used for initials fallback */
  reference: string;
  /** Full product description — used as alt text */
  description: string;
  /** Thumbnail size in px (default: 32) */
  size?: number;
  /** Accessible alt text override (defaults to description) */
  alt?: string;
}

/**
 * Compact product thumbnail with three states:
 *  1. Image loaded — renders the hero image with object-fit: cover
 *  2. No image / error — renders a neutral placeholder with initials
 *  3. Loading — same placeholder box (no layout shift via fixed dimensions)
 */
export function CommercialReferenceThumbnail({
  imageUrl,
  reference,
  description,
  size = 32,
  alt,
}: CommercialReferenceThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const showImage = imageUrl && !failed;

  // Extract up to 2 initials from reference code (e.g. "C8-838-5" → "C8")
  const initials = reference.replace(/[^A-Z0-9]/gi, "").slice(0, 2).toUpperCase();

  return (
    <div
      style={{ width: size, height: size, flexShrink: 0, position: "relative" }}
      role="img"
      aria-label={alt ?? description}
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt={alt ?? description}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{
            width: size,
            height: size,
            objectFit: "cover" as const,
            borderRadius: R.xs,
            border: `1px solid ${C.line}`,
            display: "block",
          }}
        />
      ) : (
        <div
          title={imageUrl === null ? "Sin imagen disponible" : "Error cargando imagen"}
          style={{
            width: size,
            height: size,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: R.xs,
            border: `1px solid ${C.line}`,
            background: C.surfaceAlt,
            color: C.inkFaint,
            fontFamily: T.mono,
            fontSize: Math.max(9, Math.floor(size * 0.35)),
            fontWeight: 500,
            userSelect: "none",
          }}
        >
          {initials}
        </div>
      )}
    </div>
  );
}
