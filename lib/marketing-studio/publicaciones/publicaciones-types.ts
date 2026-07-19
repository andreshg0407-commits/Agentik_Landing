/**
 * lib/marketing-studio/publicaciones/publicaciones-types.ts
 *
 * MARKETING-PUBLICACIONES-ARCHITECTURE-02
 * Modelo de datos editorial unificado para el módulo Publicaciones.
 *
 * Tres capas separadas:
 *   1. Información editorial  — título, descripción, miniatura, tipo, autor
 *   2. Distribución por canal — PublicacionPaso (estado + integración)
 *   3. Métricas por canal     — MetricasCanal
 *
 * Tipos serializables. Sin Prisma. Sin Date objects (solo ISO strings).
 * Safe para RSC → client boundary.
 */

// ── Estado normalizado (lenguaje editorial empresarial) ────────────────────────

export type PublicacionEstado =
  | "borrador"
  | "programada"
  | "en_revision"
  | "publicada"
  | "parcial"
  | "error"
  | "cancelada";

export const PUBLICACION_ESTADO_LABEL: Record<PublicacionEstado, string> = {
  borrador:    "Borrador",
  programada:  "Programada",
  en_revision: "En revisión",
  publicada:   "Publicada",
  parcial:     "Publicación parcial",
  error:       "Error",
  cancelada:   "Cancelada",
};

// ── Canal ──────────────────────────────────────────────────────────────────────

export type PublicacionCanal =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "linkedin"
  | "x"
  | "pinterest"
  | "shopify"
  | "landing"
  | "catalog"
  | "ads"
  | "email"
  | "whatsapp";

export const PUBLICACION_CANAL_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook:  "Facebook",
  tiktok:    "TikTok",
  youtube:   "YouTube",
  linkedin:  "LinkedIn",
  x:         "X",
  pinterest: "Pinterest",
  shopify:   "Shopify",
  landing:   "Landing",
  catalog:   "Catálogo",
  ads:       "Anuncios",
  email:     "Email",
  whatsapp:  "WhatsApp",
};

export const PUBLICACION_CANAL_COLOR: Record<string, string> = {
  instagram: "#E1306C",
  facebook:  "#1877F2",
  tiktok:    "#010101",
  youtube:   "#FF0000",
  linkedin:  "#0A66C2",
  x:         "#000000",
  pinterest: "#E60023",
  shopify:   "#96BF48",
  landing:   "#004AAD",
  catalog:   "#7c3aed",
  ads:       "#004AAD",
  email:     "#059669",
  whatsapp:  "#25D366",
};

// ── Canales editoriales (solo redes sociales — excluye WhatsApp, Shopify, etc.) ─

export const EDITORIAL_CANALES = new Set([
  "instagram", "facebook", "tiktok", "youtube",
  "linkedin", "x", "twitter", "pinterest",
]);

export function editorialCanales(canales: string[]): string[] {
  return canales.filter(c => EDITORIAL_CANALES.has(c));
}

// ── Origen ─────────────────────────────────────────────────────────────────────

export type PublicacionOrigen =
  | "campaña"
  | "manual"
  | "catalogo"
  | "producto"
  | "automatico";

// ── Métricas por canal (Capa 3) ────────────────────────────────────────────────
// Siempre desacopladas del estado editorial.
// Analítica consume esta capa directamente — nunca llama a APIs externas.

export interface MetricasCanal {
  canal:                      string;
  alcance:                    number | null;
  impresiones:                number | null;
  reproducciones:             number | null;
  interacciones:              number | null;
  clics:                      number | null;
  compartidos:                number | null;
  comentarios:                number | null;
  conversiones:               number | null;
  ultimaActualizacionMetricas: string | null;
}

// ── Distribución por canal / Paso (Capa 2) ─────────────────────────────────────
// Estado editorial + campos de integración (internos — nunca mostrar al usuario).

export interface PublicacionPaso {
  // ── Estado editorial ──
  id:           string;
  canal:        string;
  estado:       PublicacionEstado;
  error:        string | null;
  completadoEn: string | null;
  programadoEn: string | null;
  intentos:     number;
  // ── Integración (internos — no mostrar al usuario final) ──
  externalId:                  string | null;
  urlPublica:                  string | null;
  fechaEfectiva:               string | null;
  ultimaSincronizacion:        string | null;
  estadoSincronizacion:        "ok" | "pending" | "error" | "unknown";
  ultimaActualizacionMetricas: string | null;
  // ── Métricas por canal (puede ser null hasta primera sincronización) ──
  metricas:                    MetricasCanal | null;
}

// ── Ítem de publicación ────────────────────────────────────────────────────────

export type PublicacionTipo =
  | "post"
  | "reel"
  | "video"
  | "historia"
  | "carrusel";

export const PUBLICACION_TIPO_LABEL: Record<PublicacionTipo, string> = {
  post:     "Publicación",
  reel:     "Reel",
  video:    "Video",
  historia: "Historia",
  carrusel: "Carrusel",
};

// ── Contenido editorial unificado (Capa 1 + agregación) ───────────────────────
// Una única entidad de contenido que se distribuye a múltiples canales.
// Los campos de métricas (alcance, reproducciones, interacciones) son
// agregados entre todos los canales — el detalle está en PublicacionPaso.metricas.

export interface PublicacionItem {
  // ── Capa 1: Información editorial ──
  id:              string;
  titulo:          string;
  descripcion:     string | null;
  autor:           string | null;
  tipo:            PublicacionTipo | null;
  miniatura:       string | null;
  // ── Distribución ──
  canales:         string[];
  estado:          PublicacionEstado;
  prioridad:       "critica" | "alta" | "media" | "baja";
  origen:          PublicacionOrigen;
  programadaEn:    string | null;
  publicadaEn:     string | null;
  actualizadaEn:   string;
  progreso:        number;
  cantidadCanales: number;
  tieneErrores:    boolean;
  pasos:           PublicacionPaso[];
  // ── Métricas agregadas (suma de todos los canales) ──
  alcance:         number | null;
  reproducciones:  number | null;
  interacciones:   number | null;
  // ── Referencias internas (navegación cross-module) ──
  campaignId:      string | null;
  productId:       string | null;
  catalogId:       string | null;
}

// ── Resumen operativo ──────────────────────────────────────────────────────────

export interface PublicacionesResumen {
  publicadasHoy:   number;
  programadas:     number;
  programadasHoy:  number;
  publicadas:      number;
  borradores:      number;
  enRevision:      number;
  conError:        number;
  total:           number;
  ultimaSincronizacion: string;
}

// ── API response ───────────────────────────────────────────────────────────────

export interface PublicacionesApiResponse {
  resumen:              PublicacionesResumen;
  publicaciones:        PublicacionItem[];
  ultimaSincronizacion: string;
}
