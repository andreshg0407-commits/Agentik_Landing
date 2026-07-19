/**
 * lib/marketing-studio/commerce/shopify-experiences-templates.ts
 *
 * SHOPIFY-EXPERIENCES-ARCHITECTURE-01 — Template Registry
 *
 * Pure data — no server-only, no DB, no Shopify API.
 * Client and server safe.
 *
 * Templates represent the available layout types for generating
 * landings and banners. They define what assets are required,
 * where the result goes in Shopify, and how long generation takes.
 *
 * TENANT NOTE:
 *   Templates tagged "castillitos" are pre-configured for the
 *   Castillitos category portfolio (infantil, juguetes, bebé, etc.).
 *   All tenants see the generic templates. Castillitos also sees theirs.
 */

import type { ExperienceTemplate } from "./shopify-experiences-types";

// ── Generic templates ──────────────────────────────────────────────────────────

const GENERIC_TEMPLATES: ExperienceTemplate[] = [
  {
    id:            "landing_producto_basica",
    nombre:        "Landing de producto",
    descripcion:   "Página informativa por producto con imagen principal, precio y descripción.",
    destino:       "landing_producto",
    etiquetas:     ["producto", "basica"],
    requiere: {
      imagenPrincipal: true,
      video:           false,
      precio:          true,
      descripcion:     true,
      sku:             true,
      coleccion:       false,
    },
    activa:        true,
    orden:         1,
    tiempoEstimado: "~30 seg",
    soportaMasiva: true,
  },
  {
    id:            "landing_producto_video",
    nombre:        "Landing de producto con video",
    descripcion:   "Página de producto destacando video + galería de imágenes aprobadas.",
    destino:       "landing_producto",
    etiquetas:     ["producto", "video"],
    requiere: {
      imagenPrincipal: true,
      video:           true,
      precio:          true,
      descripcion:     false,
      sku:             true,
      coleccion:       false,
    },
    activa:        true,
    orden:         2,
    tiempoEstimado: "~45 seg",
    soportaMasiva: false,
  },
  {
    id:            "landing_coleccion",
    nombre:        "Landing de colección",
    descripcion:   "Página de colección con grid de productos, banner superior y filtros.",
    destino:       "landing_coleccion",
    etiquetas:     ["coleccion"],
    requiere: {
      imagenPrincipal: true,
      video:           false,
      precio:          false,
      descripcion:     true,
      sku:             false,
      coleccion:       true,
    },
    activa:        true,
    orden:         3,
    tiempoEstimado: "~1 min",
    soportaMasiva: false,
  },
  {
    id:            "landing_temporada",
    nombre:        "Landing de temporada",
    descripcion:   "Página estacional con banner hero + selección de productos destacados.",
    destino:       "landing_temporada",
    etiquetas:     ["temporada", "campaña"],
    requiere: {
      imagenPrincipal: true,
      video:           false,
      precio:          false,
      descripcion:     true,
      sku:             false,
      coleccion:       false,
    },
    activa:        true,
    orden:         4,
    tiempoEstimado: "~1 min",
    soportaMasiva: false,
  },
  {
    id:            "banner_home",
    nombre:        "Banner de home",
    descripcion:   "Banner principal para la página de inicio de la tienda.",
    destino:       "banner_home",
    etiquetas:     ["banner", "home"],
    requiere: {
      imagenPrincipal: true,
      video:           false,
      precio:          false,
      descripcion:     false,
      sku:             false,
      coleccion:       false,
    },
    activa:        true,
    orden:         5,
    tiempoEstimado: "~20 seg",
    soportaMasiva: false,
  },
  {
    id:            "banner_coleccion",
    nombre:        "Banner de colección",
    descripcion:   "Banner superior para la página de una colección específica.",
    destino:       "banner_coleccion",
    etiquetas:     ["banner", "coleccion"],
    requiere: {
      imagenPrincipal: true,
      video:           false,
      precio:          false,
      descripcion:     false,
      sku:             false,
      coleccion:       true,
    },
    activa:        true,
    orden:         6,
    tiempoEstimado: "~20 seg",
    soportaMasiva: true,
  },
  {
    id:            "banner_categoria",
    nombre:        "Banner de categoría",
    descripcion:   "Banner para páginas de categoría (filtro de colección).",
    destino:       "banner_categoria",
    etiquetas:     ["banner", "categoria"],
    requiere: {
      imagenPrincipal: true,
      video:           false,
      precio:          false,
      descripcion:     false,
      sku:             false,
      coleccion:       false,
    },
    activa:        true,
    orden:         7,
    tiempoEstimado: "~20 seg",
    soportaMasiva: true,
  },
  {
    id:            "bloque_footer",
    nombre:        "Bloque de footer",
    descripcion:   "Bloque visual o de enlace rápido en el pie de página de la tienda.",
    destino:       "bloque_footer",
    etiquetas:     ["banner", "footer"],
    requiere: {
      imagenPrincipal: false,
      video:           false,
      precio:          false,
      descripcion:     true,
      sku:             false,
      coleccion:       false,
    },
    activa:        true,
    orden:         8,
    tiempoEstimado: "~15 seg",
    soportaMasiva: false,
  },
];

// ── Castillitos-specific templates ────────────────────────────────────────────

const CASTILLITOS_TEMPLATES: ExperienceTemplate[] = [
  {
    id:            "castillitos_producto_infantil",
    nombre:        "Producto infantil",
    descripcion:   "Landing con paleta infantil, imagen de contexto y edad recomendada.",
    destino:       "landing_producto",
    etiquetas:     ["castillitos", "infantil", "producto"],
    requiere: {
      imagenPrincipal: true,
      video:           false,
      precio:          true,
      descripcion:     true,
      sku:             true,
      coleccion:       false,
    },
    activa:        true,
    orden:         10,
    tiempoEstimado: "~30 seg",
    soportaMasiva: true,
  },
  {
    id:            "castillitos_coleccion_juguetes",
    nombre:        "Colección de juguetes",
    descripcion:   "Landing de colección con estilo lúdico, filtros por edad y precio.",
    destino:       "landing_coleccion",
    etiquetas:     ["castillitos", "juguetes", "coleccion"],
    requiere: {
      imagenPrincipal: true,
      video:           false,
      precio:          false,
      descripcion:     true,
      sku:             false,
      coleccion:       true,
    },
    activa:        true,
    orden:         11,
    tiempoEstimado: "~1 min",
    soportaMasiva: false,
  },
  {
    id:            "castillitos_bebe",
    nombre:        "Producto bebé",
    descripcion:   "Landing de producto con paleta suave, certificaciones y detalles de seguridad.",
    destino:       "landing_producto",
    etiquetas:     ["castillitos", "bebé", "producto"],
    requiere: {
      imagenPrincipal: true,
      video:           false,
      precio:          true,
      descripcion:     true,
      sku:             true,
      coleccion:       false,
    },
    activa:        true,
    orden:         12,
    tiempoEstimado: "~35 seg",
    soportaMasiva: true,
  },
  {
    id:            "castillitos_temporada_importacion",
    nombre:        "Temporada de importación",
    descripcion:   "Landing estacional para colecciones de importación con badge de novedad.",
    destino:       "landing_temporada",
    etiquetas:     ["castillitos", "temporada", "importacion"],
    requiere: {
      imagenPrincipal: true,
      video:           false,
      precio:          false,
      descripcion:     true,
      sku:             false,
      coleccion:       false,
    },
    activa:        true,
    orden:         13,
    tiempoEstimado: "~1 min",
    soportaMasiva: false,
  },
  {
    id:            "castillitos_banner_promocion",
    nombre:        "Banner de promoción",
    descripcion:   "Banner home con cinta de descuento, imagen principal y CTA.",
    destino:       "banner_home",
    etiquetas:     ["castillitos", "banner", "promocion"],
    requiere: {
      imagenPrincipal: true,
      video:           false,
      precio:          false,
      descripcion:     false,
      sku:             false,
      coleccion:       false,
    },
    activa:        true,
    orden:         14,
    tiempoEstimado: "~25 seg",
    soportaMasiva: false,
  },
  {
    id:            "castillitos_coleccion_bebes_banner",
    nombre:        "Banner colección bebés",
    descripcion:   "Banner de colección para la línea bebé con paleta suave.",
    destino:       "banner_coleccion",
    etiquetas:     ["castillitos", "banner", "bebé", "coleccion"],
    requiere: {
      imagenPrincipal: true,
      video:           false,
      precio:          false,
      descripcion:     false,
      sku:             false,
      coleccion:       true,
    },
    activa:        true,
    orden:         15,
    tiempoEstimado: "~20 seg",
    soportaMasiva: true,
  },
  {
    id:            "castillitos_producto_video_infantil",
    nombre:        "Producto infantil con video",
    descripcion:   "Landing con video demostración + galería de imágenes de juguete en uso.",
    destino:       "landing_producto",
    etiquetas:     ["castillitos", "video", "infantil", "producto"],
    requiere: {
      imagenPrincipal: true,
      video:           true,
      precio:          true,
      descripcion:     true,
      sku:             true,
      coleccion:       false,
    },
    activa:        true,
    orden:         16,
    tiempoEstimado: "~50 seg",
    soportaMasiva: false,
  },
];

// ── Registry ───────────────────────────────────────────────────────────────────

/**
 * Full template registry.
 * Generic templates are always included.
 * Tenant-specific templates are identified by their etiquetas.
 */
export const EXPERIENCE_TEMPLATES: ExperienceTemplate[] = [
  ...GENERIC_TEMPLATES,
  ...CASTILLITOS_TEMPLATES,
];

/**
 * Returns templates filtered by destino type.
 */
export function getTemplatesByDestino(
  destino: ExperienceTemplate["destino"],
): ExperienceTemplate[] {
  return EXPERIENCE_TEMPLATES.filter(t => t.activa && t.destino === destino)
    .sort((a, b) => a.orden - b.orden);
}

/**
 * Returns templates suitable for bulk landing generation.
 */
export function getBulkTemplates(): ExperienceTemplate[] {
  return EXPERIENCE_TEMPLATES.filter(t => t.activa && t.soportaMasiva)
    .sort((a, b) => a.orden - b.orden);
}

/**
 * Returns templates tagged for the given tenant.
 * Always includes generic templates; tenant-specific ones come first.
 */
export function getTemplatesForTenant(
  tenantTag: string | null,
): ExperienceTemplate[] {
  const sorted = [...EXPERIENCE_TEMPLATES]
    .filter(t => t.activa)
    .sort((a, b) => {
      // Tenant-specific first, then generic
      const aHasTag = tenantTag ? a.etiquetas.includes(tenantTag) : false;
      const bHasTag = tenantTag ? b.etiquetas.includes(tenantTag) : false;
      if (aHasTag && !bHasTag) return -1;
      if (!aHasTag && bHasTag) return 1;
      return a.orden - b.orden;
    });
  return sorted;
}
