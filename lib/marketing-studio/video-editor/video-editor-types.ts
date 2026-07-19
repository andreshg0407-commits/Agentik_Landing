/**
 * lib/marketing-studio/video-editor/video-editor-types.ts
 *
 * MARKETING-VIDEO-EDITOR-01 / MARKETING-ASSET-HUB-01 — Video Editor Types
 *
 * Domain types for the Editor de Video module.
 * Server and client safe — no server-only imports.
 */

// ── Editor state ───────────────────────────────────────────────────────────────

/** Operational states of the video editor session. */
export type VideoEditorEstado =
  | "sin_video"      // no video selected yet
  | "cargando_asset" // loading a Biblioteca asset by ID
  | "error_carga"    // failed to load asset from Biblioteca
  | "cargado"        // video loaded, ready to edit
  | "editando"       // user is actively making changes
  | "listo"          // all edits applied, ready to export
  | "exportando"     // render job POST in flight
  | "encolado"       // render job created — queued in system (VIDEO-RENDER-FOUNDATION-01)
  | "exportado"      // export complete — assetId available (legacy / direct export)
  | "error";         // unrecoverable error

// ── Format & destination types ─────────────────────────────────────────────────

/** Internal aspect ratio format for rendering. */
export type VideoFormato = "9:16" | "1:1" | "16:9";

/** User-facing export destination (maps to a VideoFormato internally). */
export type VideoDestino =
  | "reel_tiktok"      // 9:16 — Reels, TikTok, Shorts
  | "historia"         // 9:16 — Historias de Instagram y Facebook
  | "feed_instagram"   // 1:1  — Feed cuadrado
  | "facebook"         // 16:9 — Facebook timeline y anuncios
  | "youtube"          // 16:9 — YouTube y vídeos largos
  | "presentacion";    // 16:9 — Presentaciones y pantallas horizontales

/** Maps each VideoDestino to its internal VideoFormato. */
export const DESTINO_TO_FORMATO: Record<VideoDestino, VideoFormato> = {
  reel_tiktok:    "9:16",
  historia:       "9:16",
  feed_instagram: "1:1",
  facebook:       "16:9",
  youtube:        "16:9",
  presentacion:   "16:9",
};

/** Display metadata for each export destination. */
export interface DestinoDef {
  id:          VideoDestino;
  label:       string;
  subtitulo:   string;
  formato:     VideoFormato;
  aspecto:     string;  // CSS aspect-ratio
  /** Icon key for display (platform symbol). */
  icono:       string;
}

export const DESTINOS: DestinoDef[] = [
  { id: "reel_tiktok",    label: "Reel · TikTok",        subtitulo: "Reels, TikTok, YouTube Shorts",       formato: "9:16", aspecto: "9/16",  icono: "▶" },
  { id: "historia",       label: "Historia",              subtitulo: "Historias de Instagram y Facebook",    formato: "9:16", aspecto: "9/16",  icono: "◻" },
  { id: "feed_instagram", label: "Feed Instagram",        subtitulo: "Publicaciones cuadradas en el feed",  formato: "1:1",  aspecto: "1/1",   icono: "⊡" },
  { id: "facebook",       label: "Facebook",              subtitulo: "Timeline de Facebook y anuncios",     formato: "16:9", aspecto: "16/9",  icono: "f" },
  { id: "youtube",        label: "YouTube",               subtitulo: "Videos de YouTube y contenido largo", formato: "16:9", aspecto: "16/9",  icono: "▷" },
  { id: "presentacion",   label: "Presentación",          subtitulo: "Pantallas, presentaciones y landings", formato: "16:9", aspecto: "16/9", icono: "⊞" },
];

// ── Tool types ─────────────────────────────────────────────────────────────────

/** Active tool panel in the editor sidebar. */
export type VideoHerramienta =
  | "destino"
  | "recorte"
  | "subtitulos"
  | "musica"
  | "texto"
  | "marca"
  | "exportacion";

/** Logo position on the video frame. */
export type LogoPosicion =
  | "superior-izquierda"
  | "superior-derecha"
  | "inferior-izquierda"
  | "inferior-derecha";

// ── Music library ──────────────────────────────────────────────────────────────

/** A single track in the in-editor music library. */
export interface MusicaTrack {
  id:       string;
  nombre:   string;
  genero:   string;
  duracion: string;  // "mm:ss"
  /** URL to preview (null in V1 — audio integration in VIDEO-EDITOR-02). */
  previewUrl: string | null;
}

/** Built-in music library — V1 references only, no real audio in V1. */
export const MUSICA_LIBRARY: MusicaTrack[] = [
  { id: "energetic_01", nombre: "Energía Pop",          genero: "Pop",        duracion: "0:32", previewUrl: null },
  { id: "chill_01",     nombre: "Ambiente tranquilo",   genero: "Chill",      duracion: "0:45", previewUrl: null },
  { id: "upbeat_01",    nombre: "Ritmo dinámico",       genero: "Electrónica",duracion: "0:28", previewUrl: null },
  { id: "romantic_01",  nombre: "Suave y romántico",    genero: "Balada",     duracion: "0:40", previewUrl: null },
  { id: "corporate_01", nombre: "Corporativo moderno",  genero: "Corporativo",duracion: "0:35", previewUrl: null },
  { id: "tropical_01",  nombre: "Verano tropical",      genero: "Tropical",   duracion: "0:30", previewUrl: null },
];

// ── Editor configuration ───────────────────────────────────────────────────────

/** Full editor configuration — represents all edits applied to the video. */
export interface VideoEditorConfig {
  /** User-facing export destination. */
  destino:           VideoDestino;

  /** Trim start in seconds (0 = from beginning). */
  recorteInicio:     number;

  /** Trim end in seconds (null = until end of video). */
  recorteFin:        number | null;

  /** Whether auto-subtitles are enabled. */
  subtitulosActivos: boolean;

  /** Manual subtitle text (overrides auto when non-empty). */
  subtitulosTexto:   string;

  /** Whether background music is enabled. */
  musicaActiva:      boolean;

  /** ID of selected music track from MUSICA_LIBRARY (null = none). */
  musicaTrackId:     string | null;

  /** Music volume 0–100. */
  musicaVolumen:          number;

  /** Original video audio volume 0–100 (100 = unchanged). */
  audioOriginalVolumen:   number;

  /** Music fade-in duration in seconds (0 = no fade). */
  musicaFadeIn:           number;

  /** Music fade-out duration in seconds (0 = no fade). */
  musicaFadeOut:          number;

  /** Whether text overlay is enabled. */
  textoActivo:       boolean;

  /** Overlay text content. */
  textoOverlay:      string;

  /** Whether watermark/logo is enabled. */
  marcaActiva:       boolean;

  /** URL of the logo/watermark image. */
  marcaUrl:          string | null;

  /** Logo position on the frame. */
  marcaPosicion:     LogoPosicion;
}

/** Derived format from selected destino. */
export function configurFormatoFromDestino(destino: VideoDestino): VideoFormato {
  return DESTINO_TO_FORMATO[destino];
}

// ── Export payload ─────────────────────────────────────────────────────────────

/**
 * Data sent to the export service to create a versioned Biblioteca entry.
 * ASSET-HUB-01: includes full versioning and trazabilidad metadata.
 */
export interface VideoExportPayload {
  organizationId:    string;
  /** ID of the source asset in Biblioteca (null if uploaded directly from device). */
  assetPadreId:      string | null;
  /** ID of the top-most ancestor in the version chain (same as assetPadreId for first derivation). */
  assetOriginalId:   string | null;
  /** URL of the source video. */
  videoOriginalUrl:  string;
  /** Human name for this exported version. */
  versionName:       string;
  /** Version number within the reference (1 = original, 2+ = derived). */
  version:           number;
  /** Export origin module. */
  origen:            "video_editor" | "foto_estudio" | "importacion";
  /** Export destination platform. */
  destino:           VideoDestino;
  /** Internal aspect ratio. */
  formato:           VideoFormato;
  /** Video duration in seconds (null if unknown). */
  duracion:          number | null;
  /** Video resolution as "WxH" string (null if unknown). */
  resolucion:        string | null;
  subtitulosActivos: boolean;
  musicaActiva:      boolean;
  musicaTrackId:     string | null;
  textoActivo:       boolean;
  logoActivo:        boolean;
  /** Product SKU if the source asset is linked to a product. */
  referenceSku:      string | null;
  /** Product commercial name if available. */
  referenceName:     string | null;
  /** ISO 8601 export timestamp. */
  exportedAt:        string;
  /** Display name of the exporting user. */
  creadoPor:         string;
  /** True until a real render job produces the derived output URL. */
  pendingRender:     boolean;
}

// ── Export result ──────────────────────────────────────────────────────────────

/** Result returned by the export service. */
export interface VideoExportResult {
  success:      boolean;
  /** ID of the created Biblioteca asset (null on failure). */
  assetId:      string | null;
  /** URL of the exported video (null until render completes). */
  assetUrl:     string | null;
  /** Version number assigned. */
  version:      number | null;
  errorMessage: string | null;
}

// ── Version history ────────────────────────────────────────────────────────────

/** Version history entry shown in the editor and in Biblioteca. */
export interface VideoVersionEntry {
  id:          string;
  versionName: string;
  version:     number;
  destino:     VideoDestino;
  formato:     VideoFormato;
  exportedAt:  string;
  assetUrl:    string | null;
  creadoPor:   string;
}

// ── Biblioteca video asset (for library selector) ──────────────────────────────

/** Minimal shape of a Biblioteca video asset for the library selector modal. */
export interface BibliotecaVideoAsset {
  id:            string;
  nombre:        string;
  assetUrl:      string;
  assetType:     string;
  origen:        "ai" | "manual" | "video_editor";
  version:       number | null;
  /** ID of the parent asset in the version chain (null for originals). */
  parentAssetId: string | null;
  /** Product SKU if the asset is linked to a product session. */
  sku:           string | null;
  /** Commercial product name (from referenceName in export metadata). */
  productName:   string | null;
  createdAt:     string;
}

// ── Default config ─────────────────────────────────────────────────────────────

export const DEFAULT_VIDEO_CONFIG: VideoEditorConfig = {
  destino:           "reel_tiktok",
  recorteInicio:     0,
  recorteFin:        null,
  subtitulosActivos: false,
  subtitulosTexto:   "",
  musicaActiva:          false,
  musicaTrackId:         null,
  musicaVolumen:         80,
  audioOriginalVolumen:  100,
  musicaFadeIn:          0,
  musicaFadeOut:         0,
  textoActivo:           false,
  textoOverlay:      "",
  marcaActiva:       false,
  marcaUrl:          null,
  marcaPosicion:     "inferior-derecha",
};
