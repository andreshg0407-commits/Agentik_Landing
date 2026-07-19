/**
 * components/marketing-studio/video-editor/video-editor-client.tsx
 *
 * MARKETING-VIDEO-EDITOR-01 / MARKETING-ASSET-HUB-01 — Video Editor Client
 *
 * Professional video editing workspace for Marketing Studio.
 *
 * Layout:
 *   ┌────────────────────────────────┬───────────────────┐
 *   │  VIDEO PREVIEW (dominant)      │  TOOLS PANEL      │
 *   │  [overlays: text, subs, logo]  │  · Destino        │
 *   │  [TIMELINE BAR]                │  · Recorte        │
 *   │   ████ video                   │  · Subtítulos     │
 *   │   ░░░░ subtítulos              │  · Música         │
 *   │   ░░░░ música                  │  · Texto          │
 *   └────────────────────────────────┴───────────────────┘
 *   [ACCIONES: guardar / exportar / usar en contenido / anuncios]
 *
 * ASSET-HUB-01: "Abrir desde Biblioteca" working — fetches real assets.
 * Overlays visible in real time (no render required).
 * Destinations shown as platforms (Reel, Historia, etc.) not ratios.
 */

"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  Film,
  Type,
  Music2,
  Scissors,
  LayoutGrid,
  Image,
  Download,
  Send,
  Save,
  Check,
  AlertCircle,
  Loader2,
  RotateCcw,
  ChevronRight,
  Library,
  Volume2,
  VolumeX,
  X,
  Play,
  Trash2,
  Sparkles,
  Zap,
} from "lucide-react";
import { C, T, S, R, E }     from "@/lib/ui/tokens";
import {
  MS_PALETTE,
  MS_SHADOWS,
  MS_SECTION,
}                              from "@/lib/marketing-studio/ms-design-system";
import type {
  VideoEditorEstado,
  VideoDestino,
  VideoHerramienta,
  VideoEditorConfig,
  VideoExportResult,
  BibliotecaVideoAsset,
}                              from "@/lib/marketing-studio/video-editor/video-editor-types";
import type { MusicTrack }    from "@/lib/marketing-studio/video-editor/music/video-music-types";
import {
  MUSIC_MIME_ACCEPT,
  MUSIC_FORMAT_LABEL,
  formatMusicDuration,
  formatMusicSize,
}                              from "@/lib/marketing-studio/video-editor/music/video-music-types";
import type { VideoRenderJob } from "@/lib/marketing-studio/video-editor/render/video-render-types";
import { RENDER_STATUS_LABEL } from "@/lib/marketing-studio/video-editor/render/video-render-types";
import type { VideoDraft }     from "@/lib/marketing-studio/video-editor/drafts/video-draft-types";
import type {
  VideoSubtitleTrack,
  VideoSubtitleSegment,
}                              from "@/lib/marketing-studio/video-editor/subtitles/video-subtitle-types";
import {
  SUBTITLE_STATUS_LABEL,
  SUBTITLE_LANGUAGES,
  isActiveSubtitleStatus,
}                              from "@/lib/marketing-studio/video-editor/subtitles/video-subtitle-types";

// ── Reference selector type (VIDEO-UPLOAD-TO-ASSET-HUB-02A) ──────────────────
interface ReferenceOption {
  id:       string;
  sku:      string | null;
  name:     string;
  category: string | null;
}
import {
  DEFAULT_VIDEO_CONFIG,
  DESTINOS,
  DESTINO_TO_FORMATO,
  configurFormatoFromDestino,
}                              from "@/lib/marketing-studio/video-editor/video-editor-types";

// ── Constants ─────────────────────────────────────────────────────────────────

const VIDEO  = MS_PALETTE.video;
const ACCENT = VIDEO.primary;  // #c2410c

// ── Frame dimensions per format ───────────────────────────────────────────────

function frameSize(config: VideoEditorConfig): { w: number; h: number } {
  const fmt = configurFormatoFromDestino(config.destino);
  switch (fmt) {
    case "9:16": return { w: 215, h: 382 };
    case "1:1":  return { w: 300, h: 300 };
    case "16:9": return { w: 480, h: 270 };
  }
}

// ── Estado helpers ────────────────────────────────────────────────────────────

function estadoLabel(e: VideoEditorEstado): string {
  switch (e) {
    case "sin_video":      return "Sin video";
    case "cargando_asset": return "Cargando video desde Biblioteca…";
    case "error_carga":    return "Error al cargar video";
    case "cargado":        return "Video cargado";
    case "editando":       return "Editando";
    case "listo":          return "Listo para exportar";
    case "exportando":     return "Preparando exportación…";
    case "encolado":       return "Exportación en cola";
    case "exportado":      return "Exportado a Biblioteca";
    case "error":          return "Error al exportar";
  }
}

function estadoColor(e: VideoEditorEstado): string {
  switch (e) {
    case "sin_video":      return C.inkFaint;
    case "cargando_asset": return C.amber;
    case "error_carga":    return C.red;
    case "cargado":        return C.blue;
    case "editando":       return ACCENT;
    case "listo":          return C.green;
    case "exportando":     return C.amber;
    case "encolado":       return C.blue;
    case "exportado":      return C.green;
    case "error":          return C.red;
  }
}

function countEdits(c: VideoEditorConfig): number {
  let n = 0;
  if (c.recorteInicio > 0 || c.recorteFin !== null) n++;
  if (c.subtitulosActivos) n++;
  if (c.musicaActiva) n++;
  if (c.textoActivo && c.textoOverlay) n++;
  if (c.marcaActiva) n++;
  return n;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface VideoEditorClientProps {
  orgSlug:         string;
  organizationId:  string;
  /** Pre-load a Biblioteca asset. */
  initialAssetId?: string | null;
  /** Membership role — controls admin-only options in reference panel. */
  membershipRole?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VideoEditorClient({
  orgSlug,
  organizationId,
  initialAssetId,
  membershipRole,
}: VideoEditorClientProps) {

  // ── Core state ────────────────────────────────────────────────────────────
  const [estado, setEstado]               = useState<VideoEditorEstado>("sin_video");
  const [videoUrl, setVideoUrl]           = useState<string | null>(null);
  const [videoFile, setVideoFile]         = useState<File | null>(null);
  const [assetPadreId, setAssetPadreId]   = useState<string | null>(null);
  const [config, setConfig]               = useState<VideoEditorConfig>(DEFAULT_VIDEO_CONFIG);
  const [herramienta, setHerramienta]     = useState<VideoHerramienta>("destino");
  const [versionName, setVersionName]     = useState<string>("");
  const [exportando, setExportando]       = useState(false);
  const [exportResult, setExportResult]   = useState<VideoExportResult | null>(null);
  const [renderJob, setRenderJob]         = useState<VideoRenderJob | null>(null);
  const [isDraftSaved, setIsDraftSaved]   = useState(false);
  /** AgentExecution ID of the current persisted draft (null = not yet saved). */
  const [draftId, setDraftId]             = useState<string | null>(null);
  const [draftSaving, setDraftSaving]     = useState(false);
  const [draftsOpen, setDraftsOpen]       = useState(false);
  const [draftsList, setDraftsList]       = useState<VideoDraft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);

  // ── Subtitle track state ──────────────────────────────────────────────────
  const [subtitleTrack, setSubtitleTrack]         = useState<VideoSubtitleTrack | null>(null);
  /** All tracks for the current asset (one per language). */
  const [subtitleTracks, setSubtitleTracks]       = useState<VideoSubtitleTrack[]>([]);
  const [subtitleGenerating, setSubtitleGenerating] = useState(false);
  const [subtitleLanguage, setSubtitleLanguage]   = useState("es");
  const [subtitleSegmentEdits, setSubtitleSegmentEdits] = useState<VideoSubtitleSegment[]>([]);
  const [subtitleSaving, setSubtitleSaving]       = useState(false);
  const [subtitleRegenConfirm, setSubtitleRegenConfirm] = useState(false);
  /** Current playback position in seconds — drives the dynamic subtitle preview. */
  const [currentVideoTime, setCurrentVideoTime]   = useState(0);

  // ── Temp video URL (local file → R2, for subtitle generation) ───────────
  const [tempVideoUrl, setTempVideoUrl]     = useState<string | null>(null);

  // ── Music track state ─────────────────────────────────────────────────────
  const [musicTracks, setMusicTracks]               = useState<MusicTrack[]>([]);
  const [musicTracksLoading, setMusicTracksLoading] = useState(false);
  const [musicUploading, setMusicUploading]         = useState(false);
  const [musicUploadError, setMusicUploadError]     = useState<string | null>(null);

  // ── Reference association state (local file uploads) ─────────────────────
  const [localRef, setLocalRef]           = useState<ReferenceOption | null>(null);
  const [refPanelOpen, setRefPanelOpen]   = useState(false);
  const [refQuery, setRefQuery]           = useState("");
  const [refResults, setRefResults]       = useState<ReferenceOption[]>([]);
  const [refSearching, setRefSearching]   = useState(false);

  // ── Library selector state ────────────────────────────────────────────────
  const [libraryOpen, setLibraryOpen]       = useState(false);
  const [libraryAssets, setLibraryAssets]   = useState<BibliotecaVideoAsset[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  // ── Library-loaded asset tracking (for info strip + trazabilidad) ─────────
  const [loadedAsset, setLoadedAsset]       = useState<BibliotecaVideoAsset | null>(null);
  const [assetLoadError, setAssetLoadError] = useState<string | null>(null);

  // ── Version history ────────────────────────────────────────────────────────
  const [versiones, setVersiones]           = useState<import("@/lib/marketing-studio/video-editor/video-editor-types").VideoVersionEntry[]>([]);
  const [versionesLoading, setVersionesLoading] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef     = useRef<HTMLVideoElement>(null);

  // ── Load initial asset from Biblioteca (when navigated from drawer) ───────
  useEffect(() => {
    if (!initialAssetId) return;

    setEstado("cargando_asset");
    setAssetLoadError(null);

    fetch(`/api/orgs/${orgSlug}/marketing-studio/biblioteca/assets/${initialAssetId}`)
      .then(r => r.json())
      .then((data: { asset?: BibliotecaVideoAsset; error?: string }) => {
        if (data.asset?.assetUrl) {
          setLoadedAsset(data.asset);
          loadVideo(data.asset.assetUrl, data.asset.nombre, data.asset.id);
        } else {
          setEstado("error_carga");
          setAssetLoadError(data.error ?? "No pudimos cargar este video.");
        }
      })
      .catch(() => {
        setEstado("error_carga");
        setAssetLoadError("No pudimos conectar con Biblioteca.");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAssetId]);

  // ── Fetch version history when a parent asset is linked ───────────────────
  useEffect(() => {
    if (!assetPadreId) { setVersiones([]); return; }
    setVersionesLoading(true);
    fetch(`/api/orgs/${orgSlug}/marketing-studio/video-editor/versions?assetId=${assetPadreId}`)
      .then(r => r.json())
      .then((d: { versions?: import("@/lib/marketing-studio/video-editor/video-editor-types").VideoVersionEntry[] }) => {
        setVersiones(d.versions ?? []);
      })
      .catch(() => setVersiones([]))
      .finally(() => setVersionesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetPadreId]);

  // ── Load existing subtitle tracks when a Biblioteca asset is active ────────
  useEffect(() => {
    const assetId = loadedAsset?.id ?? assetPadreId;
    if (!assetId) { setSubtitleTracks([]); return; }
    fetch(`/api/orgs/${orgSlug}/marketing-studio/video-editor/subtitles?assetId=${assetId}`)
      .then(r => r.json())
      .then((d: { tracks?: VideoSubtitleTrack[] }) => {
        const tracks = d.tracks ?? [];
        setSubtitleTracks(tracks);
        // Auto-load the ready track for the current language, or the most recent ready track
        const match = tracks.find(t => t.language === subtitleLanguage && t.status === "ready")
          ?? tracks.find(t => t.status === "ready");
        if (match) {
          setSubtitleTrack(match);
          setSubtitleSegmentEdits(match.segments ?? []);
        }
      })
      .catch(() => setSubtitleTracks([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedAsset?.id, assetPadreId]);

  // ── Fetch music tracks when music panel is opened ─────────────────────────
  useEffect(() => {
    if (herramienta !== "musica") return;
    setMusicTracksLoading(true);
    fetch(`/api/orgs/${orgSlug}/marketing-studio/video-editor/music`)
      .then(r => r.json())
      .then((d: { tracks?: MusicTrack[] }) => setMusicTracks(d.tracks ?? []))
      .catch(() => { /* silent */ })
      .finally(() => setMusicTracksLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [herramienta]);

  // ── Render job polling (every 4s while job is active) ────────────────────
  useEffect(() => {
    if (!renderJob) return;
    if (renderJob.status === "completed" || renderJob.status === "failed" || renderJob.status === "cancelled") return;

    const poll = async () => {
      try {
        const res  = await fetch(
          `/api/orgs/${orgSlug}/marketing-studio/video-editor/render?executionId=${encodeURIComponent(renderJob.id)}`,
        );
        if (!res.ok) return;
        const data = await res.json() as { job?: VideoRenderJob };
        if (!data.job) return;
        setRenderJob(data.job);
        if (data.job.status === "completed") {
          setEstado("exportado");
        } else if (data.job.status === "failed") {
          setEstado("error");
        }
      } catch {
        /* ignore — will retry next interval */
      }
    };

    const interval = setInterval(poll, 4_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderJob?.id, renderJob?.status]);

  // ── Generate subtitles — always calls API (used by Generar + Regenerar) ───
  const generateSubtitlesFromApi = useCallback(async () => {
    if (!videoUrl || subtitleGenerating) return;

    // Resolve the effective video URL — blob: URLs are not server-accessible,
    // so we must upload the local file to R2 first (via temp-upload endpoint).
    let effectiveUrl = loadedAsset?.assetUrl ?? videoUrl;

    if (effectiveUrl.startsWith("blob:")) {
      // Use cached temp URL if already uploaded for this session
      if (tempVideoUrl) {
        effectiveUrl = tempVideoUrl;
      } else {
        if (!videoFile) return;
        setSubtitleGenerating(true);
        try {
          const form = new FormData();
          form.append("file", videoFile);
          const res  = await fetch(
            `/api/orgs/${orgSlug}/marketing-studio/video-editor/temp-upload`,
            { method: "POST", body: form },
          );
          const data = await res.json() as { url?: string | null; error?: string };
          if (data.url) {
            setTempVideoUrl(data.url);
            effectiveUrl = data.url;
          } else {
            // R2 not configured or upload rejected — show informative message
            const msg = data.error
              ?? "Puedo generar subtítulos para este video. Para habilitarlo, importa el video a Biblioteca primero.";
            setSubtitleTrack({
              id: "local", organizationId, assetId: null, assetOriginalId: null,
              videoUrl: videoUrl, language: subtitleLanguage, status: "failed", source: "auto",
              referenceSku: null, referenceName: null, createdBy: "user",
              createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
              segments: [], errorMessage: msg,
            });
            setSubtitleGenerating(false);
            return;
          }
        } catch {
          setSubtitleTrack({
            id: "error", organizationId, assetId: null, assetOriginalId: null,
            videoUrl: videoUrl, language: subtitleLanguage, status: "failed", source: "auto",
            referenceSku: null, referenceName: null, createdBy: "user",
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            segments: [], errorMessage: "No pudimos preparar el video. Intenta de nuevo.",
          });
          setSubtitleGenerating(false);
          return;
        }
      }
    }

    // effectiveUrl is now a publicly accessible HTTP URL
    setSubtitleGenerating(true);
    setSubtitleTrack(null);
    setSubtitleSegmentEdits([]);

    try {
      const res  = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/video-editor/subtitles`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            assetId:         loadedAsset?.id    ?? assetPadreId,
            assetOriginalId: loadedAsset?.parentAssetId ?? assetPadreId,
            videoUrl:        effectiveUrl,
            language:        subtitleLanguage,
            referenceSku:    localRef?.sku ?? loadedAsset?.sku ?? null,
            referenceName:   localRef?.name ?? loadedAsset?.productName ?? null,
          }),
        },
      );
      const data = await res.json() as { track?: VideoSubtitleTrack; error?: string };
      if (data.track) {
        setSubtitleTrack(data.track);
        setSubtitleSegmentEdits(data.track.segments ?? []);
        setSubtitleTracks(prev => {
          const without = prev.filter(t => t.language !== data.track!.language);
          return [...without, data.track!];
        });
        if (data.track.status === "ready" && data.track.segments.length > 0) {
          updateConfig({ subtitulosActivos: true });
        }
      } else {
        setSubtitleTrack({
          id: "error", organizationId, assetId: null, assetOriginalId: null,
          videoUrl: effectiveUrl, language: subtitleLanguage, status: "failed", source: "auto",
          referenceSku: null, referenceName: null, createdBy: "user",
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          segments: [], errorMessage: data.error ?? "No pudimos generar subtítulos.",
        });
      }
    } catch {
      setSubtitleTrack({
        id: "error", organizationId, assetId: null, assetOriginalId: null,
        videoUrl: videoUrl ?? "", language: subtitleLanguage, status: "failed", source: "auto",
        referenceSku: null, referenceName: null, createdBy: "user",
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        segments: [], errorMessage: "No pudimos conectar. Intenta de nuevo.",
      });
    } finally {
      setSubtitleGenerating(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl, loadedAsset, assetPadreId, subtitleLanguage, localRef, subtitleGenerating, tempVideoUrl, videoFile]);

  // ── "Generar subtítulos" — loads existing track for this language if found ─
  const handleGenerateSubtitles = useCallback(() => {
    const existing = subtitleTracks.find(t => t.language === subtitleLanguage && t.status === "ready");
    if (existing) {
      setSubtitleTrack(existing);
      setSubtitleSegmentEdits(existing.segments ?? []);
      if (existing.segments.length > 0) updateConfig({ subtitulosActivos: true });
      return;
    }
    void generateSubtitlesFromApi();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtitleTracks, subtitleLanguage, generateSubtitlesFromApi]);

  // ── Save subtitle edits ────────────────────────────────────────────────────
  const handleSaveSubtitles = useCallback(async () => {
    if (!subtitleTrack || subtitleTrack.id === "error" || subtitleTrack.id === "local") return;
    setSubtitleSaving(true);
    try {
      const res  = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/video-editor/subtitles`,
        {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ trackId: subtitleTrack.id, segments: subtitleSegmentEdits }),
        },
      );
      const data = await res.json() as { track?: VideoSubtitleTrack };
      if (data.track) setSubtitleTrack(data.track);
    } catch { /* ignore */ }
    finally { setSubtitleSaving(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtitleTrack, subtitleSegmentEdits]);

  // ── Switch to a different subtitle track (multi-language support) ─────────
  const handleTrackSelect = useCallback((track: VideoSubtitleTrack) => {
    setSubtitleTrack(track);
    setSubtitleSegmentEdits(track.segments ?? []);
    setSubtitleLanguage(track.language);
  }, []);

  // ── Regenerar subtítulos (with confirmation if manual edits exist) ─────────
  const handleRegenerateSubtitles = useCallback(() => {
    const hasEdits = subtitleSegmentEdits.some(s => s.edited);
    if (hasEdits) {
      setSubtitleRegenConfirm(true);
    } else {
      void generateSubtitlesFromApi();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtitleSegmentEdits, generateSubtitlesFromApi]);

  const handleConfirmRegenerate = useCallback(() => {
    setSubtitleRegenConfirm(false);
    void generateSubtitlesFromApi();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateSubtitlesFromApi]);

  const handleCancelRegenerate = useCallback(() => {
    setSubtitleRegenConfirm(false);
  }, []);

  // ── Music handlers ────────────────────────────────────────────────────────

  const handleMusicUpload = useCallback(async (file: File, nombre: string) => {
    setMusicUploading(true);
    setMusicUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("nombre", nombre);
      const res  = await fetch(`/api/orgs/${orgSlug}/marketing-studio/video-editor/music`, {
        method: "POST",
        body:   form,
      });
      const data = await res.json() as { ok?: boolean; track?: MusicTrack; error?: string };
      if (res.ok && data.track) {
        setMusicTracks(prev => [data.track!, ...prev]);
        updateConfig({ musicaTrackId: data.track!.id });
      } else {
        setMusicUploadError(data.error ?? "No pudimos subir la pista.");
      }
    } catch {
      setMusicUploadError("No pudimos subir la pista. Intenta de nuevo.");
    } finally {
      setMusicUploading(false);
    }
  }, [orgSlug]);

  const handleMusicDelete = useCallback(async (trackId: string) => {
    try {
      await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/video-editor/music?trackId=${trackId}`,
        { method: "DELETE" },
      );
      setMusicTracks(prev => prev.filter(t => t.id !== trackId));
      if (config.musicaTrackId === trackId) updateConfig({ musicaTrackId: null });
    } catch {
      /* silent */
    }
  }, [orgSlug, config.musicaTrackId]);

  // ── Reference search (debounced) ──────────────────────────────────────────
  useEffect(() => {
    if (!refPanelOpen) return;
    const tid = setTimeout(async () => {
      setRefSearching(true);
      try {
        const res  = await fetch(
          `/api/orgs/${orgSlug}/marketing-studio/video-editor/references?q=${encodeURIComponent(refQuery)}&limit=8`,
        );
        const data = await res.json() as { references?: ReferenceOption[] };
        setRefResults(data.references ?? []);
      } catch {
        setRefResults([]);
      } finally {
        setRefSearching(false);
      }
    }, 280);
    return () => clearTimeout(tid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refQuery, refPanelOpen]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const loadVideo = useCallback((url: string, name: string, padreId: string | null) => {
    setVideoUrl(url);
    setEstado("cargado");
    setVersionName(name);
    setAssetPadreId(padreId);
    setExportResult(null);
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith("video/")) return;
    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setTempVideoUrl(null);  // new file → invalidate any prior temp upload
    loadVideo(url, file.name.replace(/\.[^.]+$/, "").slice(0, 80), null);
  }, [loadVideo]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const updateConfig = useCallback((partial: Partial<VideoEditorConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }));
    setIsDraftSaved(false);
    setEstado(prev =>
      prev === "cargado" || prev === "editando" ? "editando" : prev,
    );
  }, []);

  const handleReset = () => {
    if (videoUrl && videoFile) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setVideoFile(null);
    setAssetPadreId(null);
    setConfig(DEFAULT_VIDEO_CONFIG);
    setEstado("sin_video");
    setExportResult(null);
    setRenderJob(null);
    setIsDraftSaved(false);
    setDraftId(null);
    setSubtitleTrack(null);
    setSubtitleGenerating(false);
    setSubtitleSegmentEdits([]);
    setSubtitleTracks([]);
    setSubtitleRegenConfirm(false);
    setCurrentVideoTime(0);
    setTempVideoUrl(null);
    setLocalRef(null);
    setRefQuery("");
    setRefResults([]);
    setRefPanelOpen(false);
    setVersionName("");
    setVideoDuration(null);
    setHerramienta("destino");
    setLoadedAsset(null);
    setAssetLoadError(null);
    setVersiones([]);
  };

  const openLibrary = async () => {
    setLibraryOpen(true);
    if (libraryAssets.length > 0) return;
    setLibraryLoading(true);
    try {
      const res  = await fetch(`/api/orgs/${orgSlug}/marketing-studio/video-editor/assets`);
      const data = await res.json() as { assets?: BibliotecaVideoAsset[] };
      setLibraryAssets(data.assets ?? []);
    } catch {
      setLibraryAssets([]);
    } finally {
      setLibraryLoading(false);
    }
  };

  const handleLibrarySelect = (asset: BibliotecaVideoAsset) => {
    setLoadedAsset(asset);
    loadVideo(asset.assetUrl, asset.nombre, asset.id);
    setLibraryOpen(false);
  };

  const handleExport = async () => {
    if (!videoUrl || exportando) return;
    setExportando(true);
    setEstado("exportando");

    try {
      const res = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/video-editor/render`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            assetPadreId,
            assetOriginalId:   loadedAsset?.parentAssetId ?? assetPadreId,
            videoOriginalUrl:  loadedAsset?.assetUrl ?? videoUrl ?? "library_video",
            versionName:       versionName.trim() || "Nueva versión",
            destino:           config.destino,
            subtitulosActivos: config.subtitulosActivos,
            subtitleTrackId:   (subtitleTrack?.status === "ready" ? subtitleTrack.id : null),
            musicaActiva:          config.musicaActiva,
            musicaTrackId:         config.musicaTrackId,
            musicaVolumen:         config.musicaVolumen,
            audioOriginalVolumen:  config.audioOriginalVolumen,
            musicaFadeIn:          config.musicaFadeIn,
            musicaFadeOut:         config.musicaFadeOut,
            textoActivo:       config.textoActivo,
            textoOverlay:      config.textoOverlay,
            logoActivo:        config.marcaActiva,
            logoUrl:           config.marcaUrl,
            recorteInicio:     config.recorteInicio,
            recorteFin:        config.recorteFin,
            referenceSku:      localRef?.sku ?? loadedAsset?.sku ?? null,
            referenceName:     localRef?.name ?? loadedAsset?.productName ?? null,
          }),
        },
      );

      const data = await res.json() as { ok?: boolean; job?: VideoRenderJob; executionId?: string; error?: string };

      if (res.ok && data.ok && data.job) {
        setRenderJob(data.job);
        setEstado("encolado");
        // Invalidate library cache so new version appears in Biblioteca
        setLibraryAssets([]);
      } else {
        setEstado("error");
      }
    } catch {
      setEstado("error");
    } finally {
      setExportando(false);
    }
  };

  // ── Draft save / restore / discard ────────────────────────────────────────

  const handleSaveDraft = useCallback(async () => {
    if (!videoUrl || draftSaving) return;
    setDraftSaving(true);

    const draftConfig = {
      ...config,
      subtitleSegments: subtitleSegmentEdits.length > 0 ? subtitleSegmentEdits : null,
      subtitleTrackId:  subtitleTrack?.status === "ready" ? subtitleTrack.id : null,
      musicTrackId:     config.musicaTrackId,
    };

    const effectiveVideoUrl = tempVideoUrl ?? (loadedAsset?.assetUrl ?? videoUrl);
    const source = loadedAsset ? "biblioteca" : "local_file";

    try {
      let res: Response;
      if (draftId) {
        res = await fetch(
          `/api/orgs/${orgSlug}/marketing-studio/video-editor/drafts?draftId=${draftId}`,
          {
            method:  "PATCH",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              nombre:        versionName.trim() || "Sin nombre",
              config:        draftConfig,
              videoUrl:      effectiveVideoUrl,
              referenceSku:  localRef?.sku  ?? loadedAsset?.sku         ?? null,
              referenceName: localRef?.name ?? loadedAsset?.productName ?? null,
            }),
          },
        );
      } else {
        res = await fetch(
          `/api/orgs/${orgSlug}/marketing-studio/video-editor/drafts`,
          {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              nombre:        versionName.trim() || "Sin nombre",
              source,
              videoUrl:      effectiveVideoUrl,
              assetPadreId:  assetPadreId,
              config:        draftConfig,
              referenceSku:  localRef?.sku  ?? loadedAsset?.sku         ?? null,
              referenceName: localRef?.name ?? loadedAsset?.productName ?? null,
            }),
          },
        );
      }
      const data = await res.json() as { draft?: VideoDraft; error?: string };
      if (data.draft) {
        setDraftId(data.draft.id);
        setIsDraftSaved(true);
      }
    } catch {
      /* non-fatal — user can retry */
    } finally {
      setDraftSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl, draftSaving, draftId, config, subtitleSegmentEdits, subtitleTrack, tempVideoUrl, loadedAsset, versionName, localRef, assetPadreId, orgSlug]);

  const handleOpenDrafts = useCallback(async () => {
    setDraftsOpen(true);
    setDraftsLoading(true);
    try {
      const res  = await fetch(`/api/orgs/${orgSlug}/marketing-studio/video-editor/drafts`);
      const data = await res.json() as { drafts?: VideoDraft[] };
      setDraftsList(data.drafts ?? []);
    } catch {
      setDraftsList([]);
    } finally {
      setDraftsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug]);

  const handleOpenDraft = useCallback((draft: VideoDraft) => {
    // Restore video URL
    setVideoUrl(draft.videoUrl);
    setVideoFile(null);
    setTempVideoUrl(draft.source === "local_file" ? draft.videoUrl : null);
    setAssetPadreId(draft.assetPadreId);
    // Restore config
    const { subtitleSegments, subtitleTrackId: _tid, musicTrackId: _mid, ...editorConfig } = draft.config;
    setConfig(editorConfig);
    setVersionName(draft.nombre);
    // Restore subtitle segments if any
    if (subtitleSegments && subtitleSegments.length > 0) {
      setSubtitleSegmentEdits(subtitleSegments);
    } else {
      setSubtitleSegmentEdits([]);
    }
    setSubtitleTrack(null);
    // Restore local reference
    if (draft.referenceSku || draft.referenceName) {
      setLocalRef({
        id:       draft.referenceSku ?? draft.id,
        sku:      draft.referenceSku,
        name:     draft.referenceName ?? "",
        category: null,
      });
    }
    // Restore draft identity
    setDraftId(draft.id);
    setIsDraftSaved(true);
    setEstado("editando");
    setExportResult(null);
    setRenderJob(null);
    setLoadedAsset(null);
    setDraftsOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDiscardDraft = useCallback(async (draft: VideoDraft) => {
    try {
      await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/video-editor/drafts?draftId=${draft.id}`,
        { method: "DELETE" },
      );
      setDraftsList(prev => prev.filter(d => d.id !== draft.id));
      // If the open draft was discarded, reset its tracking
      if (draftId === draft.id) {
        setDraftId(null);
        setIsDraftSaved(false);
      }
    } catch {
      /* non-fatal */
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, draftId]);

  // ── Derived ───────────────────────────────────────────────────────────────

  /** Subtitle text to show in the preview at the current playback time. */
  const activeSubtitleText: string | null = (() => {
    if (!config.subtitulosActivos) return null;
    if (subtitleSegmentEdits.length > 0) {
      return subtitleSegmentEdits.find(
        s => s.start <= currentVideoTime && s.end >= currentVideoTime,
      )?.text ?? null;
    }
    return config.subtitulosTexto || "— Subtítulos activos —";
  })();

  const hasVideo     = !!videoUrl;
  const isExported   = estado === "exportado";
  const isEncolado   = estado === "encolado";
  const isExportando = estado === "exportando" || exportando;
  /** True when user uploaded a file from device (no Biblioteca source). */
  const isLocalFile  = !!(videoFile && !loadedAsset);
  /** Ref must be set before export when video comes from a local file. */
  const needsRef     = isLocalFile && !localRef;
  /** True for roles that may bypass ref requirement and use Biblioteca general. */
  const isAdminUser  = ["SUPER_ADMIN", "AGENTIK_ADMIN", "ORG_ADMIN"].includes(membershipRole ?? "");
  const edits        = countEdits(config);
  const frame        = frameSize(config);
  const destinoDef   = DESTINOS.find(d => d.id === config.destino) ?? DESTINOS[0];
  const musicaTrack  = musicTracks.find(t => t.id === config.musicaTrackId) ?? null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: T.mono, marginTop: S[4], position: "relative" as const }}>

      {/* ── Library selector modal ── */}
      {libraryOpen && (
        <LibrarySelectorModal
          assets={libraryAssets}
          loading={libraryLoading}
          onSelect={handleLibrarySelect}
          onClose={() => setLibraryOpen(false)}
        />
      )}

      {/* ── Drafts panel ── */}
      {draftsOpen && (
        <DraftListPanel
          drafts={draftsList}
          loading={draftsLoading}
          currentDraftId={draftId}
          onOpen={handleOpenDraft}
          onDiscard={handleDiscardDraft}
          onClose={() => setDraftsOpen(false)}
        />
      )}

      {/* ── Status bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: S[3],
        padding: `${S[2]}px ${S[4]}px`,
        background: hasVideo ? VIDEO.iconBg : C.surface,
        border: `1px solid ${hasVideo ? `${ACCENT}22` : C.line}`,
        borderRadius: R.md,
        marginBottom: S[4],
      }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: estadoColor(estado), flexShrink: 0 }} />
        <span style={{ fontSize: T.sz.sm, color: estadoColor(estado), fontWeight: T.wt.semibold }}>
          {estadoLabel(estado)}
        </span>
        {hasVideo && destinoDef && (
          <span style={{
            padding: `1px ${S[2]}px`,
            background: `${ACCENT}14`,
            border: `1px solid ${ACCENT}22`,
            borderRadius: R.pill,
            fontSize: T.sz["2xs"],
            color: ACCENT,
            fontWeight: T.wt.semibold,
          }}>
            {destinoDef.label} · {destinoDef.formato}
          </span>
        )}
        {edits > 0 && (
          <span style={{
            padding: `1px ${S[2]}px`,
            background: `${ACCENT}0a`,
            border: `1px solid ${ACCENT}18`,
            borderRadius: R.pill,
            fontSize: T.sz["2xs"],
            color: ACCENT,
          }}>
            {edits} edición{edits > 1 ? "es" : ""}
          </span>
        )}
        {hasVideo && (
          <button onClick={handleReset} style={{
            marginLeft: "auto",
            display: "flex", alignItems: "center", gap: 4,
            padding: `2px ${S[2]}px`,
            background: "transparent",
            border: `1px solid ${C.line}`,
            borderRadius: R.pill,
            fontSize: T.sz["2xs"],
            color: C.inkLight,
            cursor: "pointer",
            fontFamily: T.mono,
          }}>
            <RotateCcw size={10} strokeWidth={1.8} />
            Cambiar video
          </button>
        )}
      </div>

      {/* ── Render status card (VIDEO-RENDER-WORKER-01) ── */}
      {renderJob && (estado === "encolado" || (renderJob.status === "completed" && estado === "exportado") || (renderJob.status === "failed" && estado === "error")) && (
        <div style={{
          display: "flex", alignItems: "center", gap: S[3],
          padding: `${S[3]}px ${S[4]}px`,
          background: renderJob.status === "completed"
            ? C.greenLight
            : renderJob.status === "failed"
              ? C.redLight
              : C.blueLight,
          border: `1px solid ${
            renderJob.status === "completed"
              ? C.greenBorder
              : renderJob.status === "failed"
                ? C.redBorder
                : C.blueBorder
          }`,
          borderRadius: R.md,
          marginBottom: S[4],
        }}>
          {renderJob.status === "completed" ? (
            <Check size={14} color={C.green} strokeWidth={2.5} />
          ) : renderJob.status === "failed" ? (
            <AlertCircle size={14} color={C.red} strokeWidth={2} />
          ) : (
            <Loader2 size={14} color={C.blue} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: T.sz.sm, fontWeight: T.wt.semibold,
              color: renderJob.status === "completed" ? C.greenDark : renderJob.status === "failed" ? C.red : C.blueDark,
            }}>
              {RENDER_STATUS_LABEL[renderJob.status]}
            </div>
            <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 }}>
              {renderJob.status === "failed" && renderJob.errorMessage
                ? renderJob.errorMessage
                : `${renderJob.versionName} · ${renderJob.destino.replace(/_/g, " ")} · Versión registrada en Biblioteca`}
            </div>
          </div>
          {renderJob.status !== "failed" && (
            <a href={`/${orgSlug}/agentik/marketing-studio/biblioteca`} style={{
              padding: `${S[1]}px ${S[3]}px`,
              background: renderJob.status === "completed" ? C.green : C.blue,
              color: C.white,
              borderRadius: R.sm,
              fontSize: T.sz["2xs"],
              fontWeight: T.wt.semibold,
              textDecoration: "none",
              fontFamily: T.mono,
              whiteSpace: "nowrap" as const,
            }}>
              Ver en Biblioteca
            </a>
          )}
          {renderJob.status === "failed" && (
            <button
              onClick={() => { setRenderJob(null); setEstado("listo"); }}
              style={{
                padding: `${S[1]}px ${S[3]}px`,
                background: "transparent",
                border: `1px solid ${C.redBorder}`,
                borderRadius: R.sm,
                fontSize: T.sz["2xs"],
                fontWeight: T.wt.semibold,
                color: C.red,
                cursor: "pointer",
                fontFamily: T.mono,
                whiteSpace: "nowrap" as const,
              }}
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      {/* ── Export success banner (legacy direct export) ── */}
      {isExported && exportResult && (
        <div style={{
          display: "flex", alignItems: "center", gap: S[3],
          padding: `${S[3]}px ${S[4]}px`,
          background: C.greenLight,
          border: `1px solid ${C.greenBorder}`,
          borderRadius: R.md,
          marginBottom: S[4],
        }}>
          <Check size={15} color={C.green} strokeWidth={2} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: T.sz.sm, color: C.greenDark, fontWeight: T.wt.semibold }}>
              v{exportResult.version ?? "?"} guardada en Biblioteca
            </div>
            <div style={{ fontSize: T.sz["2xs"], color: C.inkLight, marginTop: 1 }}>
              {versionName || "Nueva versión"} · {destinoDef.label}
            </div>
          </div>
          <a href={`/${orgSlug}/agentik/marketing-studio/biblioteca`} style={{
            padding: `${S[1]}px ${S[3]}px`,
            background: C.green,
            color: C.white,
            borderRadius: R.sm,
            fontSize: T.sz["2xs"],
            fontWeight: T.wt.semibold,
            textDecoration: "none",
            fontFamily: T.mono,
          }}>
            Ver en Biblioteca
          </a>
        </div>
      )}

      {/* ── Main workspace ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 292px",
        gap: S[4],
        alignItems: "start",
      }}>

        {/* ── LEFT: Preview + timeline ── */}
        <div style={{
          background: C.white,
          border: `1px solid ${C.line}`,
          borderRadius: R.lg,
          boxShadow: MS_SHADOWS.card,
          overflow: "hidden",
        }}>

          {/* Preview header */}
          <div style={{
            display: "flex", alignItems: "center", gap: S[2],
            padding: `${S[2]}px ${S[4]}px`,
            borderBottom: `1px solid ${C.line}`,
            background: C.surface,
          }}>
            <Film size={13} strokeWidth={1.8} color={ACCENT} />
            <span style={{ fontSize: T.sz.sm, color: C.inkMid, fontWeight: T.wt.semibold, flex: 1 }}>
              Vista previa
            </span>
            {hasVideo && (
              <>
                <span style={{
                  padding: `1px ${S[2]}px`,
                  background: `${ACCENT}14`,
                  border: `1px solid ${ACCENT}22`,
                  borderRadius: R.xs,
                  fontSize: T.sz["2xs"],
                  color: ACCENT,
                  fontWeight: T.wt.bold,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase" as const,
                }}>
                  {destinoDef.formato}
                </span>
                <span style={{ fontSize: T.sz["2xs"], color: C.inkFaint }}>
                  {destinoDef.label}
                </span>
              </>
            )}
          </div>

          {/* Preview area */}
          <div style={{
            minHeight: 420,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: S[5],
            background: hasVideo ? "#0c0c0c" : C.surface,
            position: "relative" as const,
          }}>
            {!hasVideo ? (
              // Empty / loading / error state
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={estado === "sin_video" ? handleDrop : undefined}
                style={{
                  width: "100%", maxWidth: 440,
                  display: "flex", flexDirection: "column" as const,
                  alignItems: "center", gap: S[4],
                  textAlign: "center" as const,
                }}
              >
                {/* Loading state */}
                {estado === "cargando_asset" && (
                  <div style={{
                    width: "100%", padding: `${S[8]}px ${S[6]}px`,
                    border: `1px solid ${C.line}`, borderRadius: R.xl,
                    background: C.white, display: "flex", flexDirection: "column" as const,
                    alignItems: "center", gap: S[3],
                  }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: R.xl,
                      background: VIDEO.iconBg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Loader2 size={24} color={ACCENT} strokeWidth={1.6} style={{ animation: "spin 1s linear infinite" }} />
                    </div>
                    <div style={{ fontSize: T.sz.sm, color: C.inkMid, fontWeight: T.wt.semibold }}>
                      Cargando video desde Biblioteca…
                    </div>
                  </div>
                )}

                {/* Error state */}
                {estado === "error_carga" && (
                  <div style={{
                    width: "100%", padding: `${S[6]}px`,
                    border: `1px solid ${C.redBorder ?? "#fecaca"}`, borderRadius: R.xl,
                    background: C.redLight ?? "#fef2f2",
                    display: "flex", flexDirection: "column" as const, alignItems: "center", gap: S[3],
                  }}>
                    <AlertCircle size={28} color={C.red} strokeWidth={1.6} />
                    <div>
                      <div style={{ fontSize: T.sz.sm, color: C.red, fontWeight: T.wt.semibold, marginBottom: 4 }}>
                        {assetLoadError ?? "No pudimos cargar este video."}
                      </div>
                      <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint }}>
                        Puedes seleccionar otro desde Biblioteca o subir uno nuevo.
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: S[2] }}>
                      <button
                        onClick={openLibrary}
                        style={{
                          padding: `${S[2]}px ${S[3]}px`,
                          background: `${ACCENT}0d`, border: `1px solid ${ACCENT}33`,
                          borderRadius: R.sm, fontSize: T.sz.xs, color: ACCENT,
                          cursor: "pointer", fontFamily: T.mono,
                        }}
                      >
                        Abrir desde Biblioteca
                      </button>
                      <button
                        onClick={() => { setEstado("sin_video"); setAssetLoadError(null); }}
                        style={{
                          padding: `${S[2]}px ${S[3]}px`,
                          background: "transparent", border: `1px solid ${C.line}`,
                          borderRadius: R.sm, fontSize: T.sz.xs, color: C.inkMid,
                          cursor: "pointer", fontFamily: T.mono,
                        }}
                      >
                        Subir video
                      </button>
                    </div>
                  </div>
                )}

                {/* Default drop zone */}
                {estado === "sin_video" && (
                <>
                <div style={{
                  width: "100%",
                  padding: `${S[8]}px ${S[6]}px`,
                  border: `2px dashed ${C.line}`,
                  borderRadius: R.xl,
                  background: C.white,
                  display: "flex", flexDirection: "column" as const, alignItems: "center", gap: S[3],
                  cursor: "pointer",
                }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div style={{
                    width: 56, height: 56, borderRadius: R.xl,
                    background: VIDEO.iconBg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: MS_SHADOWS.appIcon(ACCENT),
                  }}>
                    <Upload size={24} color={ACCENT} strokeWidth={1.6} />
                  </div>
                  <div>
                    <div style={{ fontSize: T.sz.lg, color: C.inkMid, fontWeight: T.wt.bold, marginBottom: 4 }}>
                      Sube un video
                    </div>
                    <div style={{ fontSize: T.sz.sm, color: C.inkFaint }}>
                      Arrastra o haz clic para seleccionar
                    </div>
                    <div style={{ fontSize: T.sz["2xs"], color: C.inkGhost, marginTop: S[1] }}>
                      MP4, MOV, WebM · máx 500 MB
                    </div>
                  </div>
                </div>

                {/* Separator */}
                <div style={{ display: "flex", alignItems: "center", gap: S[2], width: "100%", maxWidth: 340 }}>
                  <div style={{ flex: 1, height: 1, background: C.line }} />
                  <span style={{ fontSize: T.sz["2xs"], color: C.inkGhost }}>o</span>
                  <div style={{ flex: 1, height: 1, background: C.line }} />
                </div>

                {/* From Library */}
                <button
                  onClick={openLibrary}
                  style={{
                    display: "flex", alignItems: "center", gap: S[2],
                    padding: `${S[2]}px ${S[5]}px`,
                    background: `${ACCENT}0d`,
                    border: `1px solid ${ACCENT}33`,
                    borderRadius: R.md,
                    fontSize: T.sz.sm,
                    color: ACCENT,
                    fontWeight: T.wt.semibold,
                    cursor: "pointer",
                    fontFamily: T.mono,
                  }}
                >
                  <Library size={14} strokeWidth={1.6} />
                  Abrir desde Biblioteca
                </button>
                </>
                )}
              </div>
            ) : (
              // Video preview with format frame + overlays
              <div style={{ position: "relative" as const, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {/* Destination label */}
                <div style={{
                  position: "absolute" as const,
                  top: -26, left: "50%",
                  transform: "translateX(-50%)",
                  fontSize: T.sz["2xs"],
                  color: "rgba(255,255,255,.45)",
                  whiteSpace: "nowrap" as const,
                }}>
                  {destinoDef.label} · {destinoDef.formato}
                </div>

                {/* Format frame */}
                <div style={{
                  width: frame.w,
                  height: frame.h,
                  position: "relative" as const,
                  overflow: "hidden",
                  borderRadius: R.sm,
                  boxShadow: `0 0 0 2px ${ACCENT}, 0 12px 40px rgba(0,0,0,.7)`,
                  flexShrink: 0,
                }}>
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    onLoadedMetadata={e => setVideoDuration((e.target as HTMLVideoElement).duration)}
                    onTimeUpdate={e => setCurrentVideoTime((e.target as HTMLVideoElement).currentTime)}
                  />

                  {/* Text overlay — real-time */}
                  {config.textoActivo && config.textoOverlay && (
                    <div style={{
                      position: "absolute" as const,
                      bottom: config.subtitulosActivos ? 52 : 40,
                      left: 0, right: 0,
                      textAlign: "center" as const,
                      padding: `${S[1]}px ${S[3]}px`,
                      background: "rgba(0,0,0,.60)",
                      color: C.white,
                      fontSize: Math.max(11, Math.round(frame.w * 0.055)),
                      fontWeight: T.wt.bold,
                      textShadow: "0 1px 4px rgba(0,0,0,.8)",
                    }}>
                      {config.textoOverlay}
                    </div>
                  )}

                  {/* Subtitle preview — dynamic by playback time */}
                  {activeSubtitleText && (
                    <div style={{
                      position: "absolute" as const,
                      bottom: 14, left: 4, right: 4,
                      textAlign: "center" as const,
                      padding: `3px ${S[2]}px`,
                      background: "rgba(0,0,0,.78)",
                      color: C.white,
                      fontSize: Math.max(10, Math.round(frame.w * 0.045)),
                      borderRadius: 3,
                      lineHeight: 1.35,
                    }}>
                      {activeSubtitleText}
                    </div>
                  )}

                  {/* Logo/marca — real-time */}
                  {config.marcaActiva && (
                    <div style={{
                      position: "absolute" as const,
                      ...(config.marcaPosicion.includes("superior") ? { top: 8 } : { bottom: 8 }),
                      ...(config.marcaPosicion.includes("derecha")  ? { right: 8 } : { left: 8 }),
                      padding: `2px ${S[2]}px`,
                      background: "rgba(255,255,255,.18)",
                      border: "1px solid rgba(255,255,255,.28)",
                      borderRadius: R.xs,
                      fontSize: T.sz["2xs"],
                      color: C.white,
                      backdropFilter: "blur(4px)",
                    }}>
                      MARCA
                    </div>
                  )}

                  {/* Safe zone — 9:16 only (Reels, Historias) */}
                  {destinoDef.formato === "9:16" && (
                    <div style={{
                      position: "absolute" as const,
                      top: "12%", bottom: "12%", left: "5%", right: "5%",
                      border: `1px dashed rgba(255,255,255,.22)`,
                      borderRadius: 4,
                      pointerEvents: "none" as const,
                    }}>
                      <div style={{
                        position: "absolute" as const, top: -14, left: "50%",
                        transform: "translateX(-50%)",
                        fontSize: 9, color: "rgba(255,255,255,.28)",
                        whiteSpace: "nowrap" as const, fontFamily: T.mono,
                      }}>
                        zona segura
                      </div>
                    </div>
                  )}

                  {/* Música indicator */}
                  {config.musicaActiva && musicaTrack && (
                    <div style={{
                      position: "absolute" as const,
                      top: 8, left: "50%",
                      transform: "translateX(-50%)",
                      display: "flex", alignItems: "center", gap: 4,
                      padding: `2px ${S[2]}px`,
                      background: "rgba(0,0,0,.60)",
                      borderRadius: R.pill,
                      fontSize: T.sz["2xs"],
                      color: "rgba(255,255,255,.80)",
                      backdropFilter: "blur(4px)",
                      whiteSpace: "nowrap" as const,
                    }}>
                      <Music2 size={9} strokeWidth={2} />
                      {musicaTrack.nombre}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Timeline bar ── */}
          {hasVideo && (
            <div style={{
              borderTop: `1px solid #1e1e1e`,
              background: "#111111",
              padding: `${S[3]}px ${S[4]}px ${S[2]}px`,
            }}>
              {/* Time ruler */}
              <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[2] }}>
                <span style={{ fontSize: T.sz["2xs"], color: "rgba(255,255,255,.35)", fontFamily: T.mono, width: 60 }}>
                  {secondsToHHMM(config.recorteInicio)}
                </span>
                <div style={{ flex: 1, height: 2, background: "#2a2a2a", borderRadius: 1, position: "relative" as const }}>
                  {/* Playhead */}
                  <div style={{
                    position: "absolute" as const, top: -4,
                    left: "30%",
                    width: 2, height: 10,
                    background: ACCENT,
                    borderRadius: 1,
                  }} />
                </div>
                <span style={{ fontSize: T.sz["2xs"], color: "rgba(255,255,255,.35)", fontFamily: T.mono, width: 60, textAlign: "right" as const }}>
                  {videoDuration ? secondsToHHMM(videoDuration) : "--:--"}
                </span>
              </div>

              {/* Video track */}
              <TimelineTrack
                label="Video"
                color={ACCENT}
                filled={true}
                start={config.recorteInicio}
                end={config.recorteFin}
                total={videoDuration}
              />

              {/* Subtitle track */}
              <TimelineTrack
                label="Subtítulos"
                color="#6366f1"
                filled={config.subtitulosActivos}
                start={0}
                end={null}
                total={videoDuration}
              />

              {/* Music track */}
              <TimelineTrack
                label="Música"
                color="#22c55e"
                filled={config.musicaActiva}
                start={0}
                end={null}
                total={videoDuration}
              />
            </div>
          )}

          {/* File metadata strip — local upload */}
          {hasVideo && videoFile && (
            <div style={{
              padding: `${S[2]}px ${S[4]}px`,
              borderTop: `1px solid ${C.line}`,
              background: C.surface,
              display: "flex", gap: S[4], alignItems: "center",
              flexWrap: "wrap" as const,
            }}>
              <span style={{ fontSize: T.sz["2xs"], color: C.inkFaint }}>{videoFile.name}</span>
              <span style={{ fontSize: T.sz["2xs"], color: C.inkGhost }}>
                {(videoFile.size / 1024 / 1024).toFixed(1)} MB
              </span>
              {videoDuration && (
                <span style={{ fontSize: T.sz["2xs"], color: C.inkGhost }}>
                  {secondsToHHMM(videoDuration)}
                </span>
              )}
            </div>
          )}

          {/* Biblioteca asset info strip — library-loaded video */}
          {hasVideo && loadedAsset && !videoFile && (
            <div style={{
              padding: `${S[2]}px ${S[4]}px`,
              borderTop: `1px solid ${C.line}`,
              background: `${ACCENT}08`,
              display: "flex", gap: S[3], alignItems: "center",
              flexWrap: "wrap" as const,
            }}>
              <Library size={11} color={ACCENT} strokeWidth={1.8} />
              <span style={{ fontSize: T.sz["2xs"], color: ACCENT, fontWeight: T.wt.semibold }}>
                Video cargado desde Biblioteca
              </span>
              <span style={{ fontSize: T.sz["2xs"], color: C.inkFaint }}>
                {loadedAsset.nombre}
              </span>
              {loadedAsset.version !== null && (
                <span style={{ fontSize: T.sz["2xs"], color: C.inkGhost }}>
                  v{loadedAsset.version}
                </span>
              )}
              {videoDuration && (
                <span style={{ fontSize: T.sz["2xs"], color: C.inkGhost }}>
                  {secondsToHHMM(videoDuration)}
                </span>
              )}
              {loadedAsset.sku ? (
                <span style={{ marginLeft: "auto", fontSize: T.sz["2xs"], color: C.inkFaint, fontWeight: T.wt.semibold }}>
                  {loadedAsset.sku}
                </span>
              ) : (
                <span style={{ marginLeft: "auto", fontSize: T.sz["2xs"], color: C.inkGhost }}>
                  Sin referencia comercial · exportar crea nueva versión
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: Tools panel ── */}
        <div style={{
          background: C.white,
          border: `1px solid ${C.line}`,
          borderRadius: R.lg,
          boxShadow: MS_SHADOWS.card,
          overflow: "hidden",
          position: "sticky" as const,
          top: 16,
        }}>
          {/* Panel header */}
          <div style={{
            padding: `${S[2]}px ${S[4]}px`,
            borderBottom: `1px solid ${C.line}`,
            background: C.surface,
            display: "flex", alignItems: "center", gap: S[2],
          }}>
            <span style={{ ...MS_SECTION, color: C.inkFaint }}>Herramientas</span>
            {hasVideo && !isExported && (
              <button onClick={openLibrary} style={{
                marginLeft: "auto",
                display: "flex", alignItems: "center", gap: 4,
                padding: `2px ${S[2]}px`,
                background: "transparent",
                border: `1px solid ${C.line}`,
                borderRadius: R.pill,
                fontSize: T.sz["2xs"],
                color: C.inkLight,
                cursor: "pointer",
                fontFamily: T.mono,
              }}>
                <Library size={9} strokeWidth={2} />
                Biblioteca
              </button>
            )}
          </div>

          {/* Tool tabs */}
          <ToolTabs
            herramienta={herramienta}
            config={config}
            onSelect={setHerramienta}
            hasVideo={hasVideo}
          />

          {/* Tool content */}
          <div style={{ padding: S[4], minHeight: 200 }}>
            {herramienta === "destino" && (
              <DestinoPanel config={config} onUpdate={updateConfig} disabled={!hasVideo} />
            )}
            {herramienta === "recorte" && (
              <RecortePanel config={config} onUpdate={updateConfig} disabled={!hasVideo} />
            )}
            {herramienta === "subtitulos" && (
              <SubtitulosPanel
                config={config}
                onUpdate={updateConfig}
                disabled={!hasVideo}
                subtitleTrack={subtitleTrack}
                subtitleTracks={subtitleTracks}
                subtitleGenerating={subtitleGenerating}
                subtitleLanguage={subtitleLanguage}
                subtitleSegmentEdits={subtitleSegmentEdits}
                subtitleSaving={subtitleSaving}
                subtitleRegenConfirm={subtitleRegenConfirm}
                onLanguageChange={setSubtitleLanguage}
                onSegmentEdit={(idx, text) =>
                  setSubtitleSegmentEdits(prev =>
                    prev.map((s, i) => i === idx ? { ...s, text, edited: true } : s)
                  )
                }
                onGenerateSubtitles={handleGenerateSubtitles}
                onSaveSubtitles={handleSaveSubtitles}
                onTrackSelect={handleTrackSelect}
                onRegenerateSubtitles={handleRegenerateSubtitles}
                onConfirmRegenerate={handleConfirmRegenerate}
                onCancelRegenerate={handleCancelRegenerate}
              />
            )}
            {herramienta === "musica" && (
              <MusicaPanel
                config={config}
                onUpdate={updateConfig}
                disabled={!hasVideo}
                orgSlug={orgSlug}
                musicTracks={musicTracks}
                tracksLoading={musicTracksLoading}
                uploading={musicUploading}
                uploadError={musicUploadError}
                onUpload={handleMusicUpload}
                onDelete={handleMusicDelete}
                videoDuration={videoDuration}
              />
            )}
            {herramienta === "texto" && (
              <TextoPanel config={config} onUpdate={updateConfig} disabled={!hasVideo} />
            )}
            {herramienta === "marca" && (
              <MarcaPanel config={config} onUpdate={updateConfig} disabled={!hasVideo} />
            )}
            {herramienta === "exportacion" && (
              <ExportacionPanel
                config={config}
                versionName={versionName}
                onVersionNameChange={setVersionName}
                disabled={!hasVideo}
                edits={edits}
                musicaTrackNombre={musicaTrack?.nombre ?? null}
              />
            )}
          </div>

          {/* ── Copilot assist card ── */}
          {hasVideo && (
            <VideoCopilotCard
              herramienta={herramienta}
              config={config}
              estado={estado}
              subtitleTracks={subtitleTracks}
              subtitleGenerating={subtitleGenerating}
              subtitleSegmentEdits={subtitleSegmentEdits}
              musicTracks={musicTracks}
              videoDuration={videoDuration}
              renderJob={renderJob}
              isLocalFile={isLocalFile}
              localRef={localRef}
              isDraftSaved={isDraftSaved}
              orgSlug={orgSlug}
              onGenerateSubtitles={handleGenerateSubtitles}
              onRegenerateSubtitles={handleRegenerateSubtitles}
              onSaveSubtitles={handleSaveSubtitles}
              onExport={handleExport}
              onSaveDraft={() => void handleSaveDraft()}
              onUpdate={updateConfig}
            />
          )}
        </div>
      </div>

      {/* ── Reference association panel (local file uploads) ── */}
      {isLocalFile && hasVideo && !isEncolado && !isExported && (
        <div style={{
          marginTop: S[4],
          border: `1px solid ${localRef ? C.blueBorder : C.amberBorder}`,
          borderRadius: R.md,
          background: localRef ? C.blueLight : C.amberLight,
          overflow: "hidden",
        }}>
          {/* Header row */}
          <div style={{
            display: "flex", alignItems: "center", gap: S[3],
            padding: `${S[3]}px ${S[4]}px`,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {localRef ? (
                <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
                    Referencia
                  </div>
                  {/* Selected reference tag */}
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: S[2],
                    padding: `2px ${S[3]}px`,
                    background: C.blueDark, color: C.white,
                    borderRadius: R.pill,
                    fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                  }}>
                    {localRef.sku && <span style={{ opacity: 0.7 }}>{localRef.sku} ·</span>}
                    {localRef.name}
                  </div>
                  <button
                    onClick={() => { setLocalRef(null); setRefPanelOpen(true); }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blue }}
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.amberMid }}>
                    Video subido desde tu dispositivo
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 }}>
                    Asócialo a una referencia para guardar la versión final en Biblioteca.
                  </div>
                </div>
              )}
            </div>
            {!localRef && (
              <button
                onClick={() => setRefPanelOpen(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: S[1],
                  padding: `${S[2]}px ${S[3]}px`,
                  background: C.amber, color: C.white,
                  border: "none", borderRadius: R.sm,
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                  cursor: "pointer", flexShrink: 0,
                }}
              >
                Buscar referencia
              </button>
            )}
          </div>

          {/* Collapsible search panel */}
          {refPanelOpen && !localRef && (
            <div style={{
              borderTop: `1px solid ${C.amberBorder}`,
              padding: `${S[3]}px ${S[4]}px`,
              background: C.white,
            }}>
              {/* Search input */}
              <input
                type="text"
                autoFocus
                value={refQuery}
                onChange={e => setRefQuery(e.target.value)}
                placeholder="Buscar por nombre o SKU…"
                style={{
                  width: "100%", boxSizing: "border-box" as const,
                  padding: `${S[2]}px ${S[3]}px`,
                  border: `1px solid ${C.line}`, borderRadius: R.sm,
                  fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink,
                  background: C.surface, outline: "none",
                  marginBottom: S[2],
                }}
              />

              {/* Results */}
              {refSearching ? (
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, padding: `${S[2]}px 0` }}>
                  Buscando…
                </div>
              ) : refResults.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
                  {refResults.map(ref => (
                    <button
                      key={ref.id}
                      onClick={() => { setLocalRef(ref); setRefPanelOpen(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: S[3],
                        padding: `${S[2]}px ${S[3]}px`,
                        background: "none", border: `1px solid ${C.line}`,
                        borderRadius: R.sm, cursor: "pointer", textAlign: "left" as const,
                        width: "100%",
                      }}
                    >
                      {ref.sku && (
                        <span style={{
                          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.white,
                          background: C.blueDark, padding: `1px ${S[2]}px`, borderRadius: R.xs, flexShrink: 0,
                        }}>
                          {ref.sku}
                        </span>
                      )}
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {ref.name}
                      </span>
                      {ref.category && (
                        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, flexShrink: 0 }}>
                          {ref.category}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : refQuery ? (
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                  Sin resultados para "{refQuery}".
                </div>
              ) : (
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                  Escribe para buscar un producto o SKU.
                </div>
              )}

              {/* Draft / approval message */}
              <div style={{
                marginTop: S[3], paddingTop: S[3], borderTop: `1px solid ${C.line}`,
                display: "flex", flexDirection: "column" as const, gap: S[2],
              }}>
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, lineHeight: 1.6,
                }}>
                  Puedes guardar avances como borrador. Para aprobar o exportar este video, primero debes asociarlo a una referencia o colección.
                </div>
                {/* Guardar borrador — allowed without reference */}
                <button
                  onClick={() => { void handleSaveDraft(); setRefPanelOpen(false); }}
                  disabled={draftSaving}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: S[1],
                    background: "none", border: `1px solid ${C.line}`,
                    borderRadius: R.sm, cursor: draftSaving ? "not-allowed" : "pointer",
                    padding: `${S[1]}px ${S[3]}px`,
                    fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
                    alignSelf: "flex-start" as const,
                  }}
                >
                  {draftSaving ? "Guardando…" : "Guardar borrador"}
                </button>
                {/* Admin only: Biblioteca general */}
                {isAdminUser && (
                  <button
                    onClick={() => {
                      setLocalRef({ id: "__general__", sku: null, name: "Biblioteca general", category: null });
                      setRefPanelOpen(false);
                    }}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: S[1],
                      background: "none", border: `1px solid ${C.blueBorder}`,
                      borderRadius: R.sm, cursor: "pointer",
                      padding: `${S[1]}px ${S[3]}px`,
                      fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blue,
                      alignSelf: "flex-start" as const,
                    }}
                  >
                    Guardar en Biblioteca general
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Actions bar ── */}
      <div style={{
        marginTop: S[4],
        display: "flex", alignItems: "center", gap: S[3],
        padding: `${S[4]}px 0`,
        borderTop: `1px solid ${C.lineSubtle}`,
        flexWrap: "wrap" as const,
      }}>

        {/* Version name */}
        {hasVideo && !isExported && (
          <input
            type="text"
            value={versionName}
            onChange={e => setVersionName(e.target.value)}
            placeholder="Nombre de la versión…"
            maxLength={80}
            style={{
              flex: 1, minWidth: 140, maxWidth: 240,
              padding: `${S[2]}px ${S[3]}px`,
              border: `1px solid ${C.line}`,
              borderRadius: R.sm,
              fontSize: T.sz.sm,
              fontFamily: T.mono,
              color: C.inkMid,
              background: C.white,
              outline: "none",
            }}
          />
        )}

        {/* Mis borradores */}
        <button
          onClick={handleOpenDrafts}
          style={{
            display: "flex", alignItems: "center", gap: S[1],
            padding: `${S[2]}px ${S[3]}px`,
            background: "transparent",
            border: `1px solid ${C.line}`,
            borderRadius: R.sm,
            fontSize: T.sz.sm,
            color: C.inkLight,
            cursor: "pointer",
            fontFamily: T.mono,
          }}
        >
          <Library size={13} strokeWidth={1.6} />
          Mis borradores
        </button>

        {/* Guardar borrador — always allowed, no ref required */}
        <button
          disabled={!hasVideo || isEncolado || draftSaving}
          onClick={() => hasVideo && !isEncolado && void handleSaveDraft()}
          style={{
            display: "flex", alignItems: "center", gap: S[1],
            padding: `${S[2]}px ${S[4]}px`,
            background: isDraftSaved ? C.greenLight : "transparent",
            border: `1px solid ${isDraftSaved ? C.greenBorder : (!hasVideo || isEncolado) ? C.line : C.line}`,
            borderRadius: R.sm,
            fontSize: T.sz.sm,
            color: isDraftSaved ? C.greenDark : (!hasVideo || isEncolado) ? C.inkGhost : C.inkMid,
            cursor: (!hasVideo || isEncolado || draftSaving) ? "not-allowed" : "pointer",
            fontFamily: T.mono,
            transition: "background 0.15s, color 0.15s",
          }}
        >
          {draftSaving
            ? <Loader2 size={13} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
            : isDraftSaved
              ? <Check size={13} strokeWidth={2} />
              : <Save size={13} strokeWidth={1.6} />
          }
          {draftSaving ? "Guardando…" : isDraftSaved ? "Borrador guardado" : "Guardar borrador"}
        </button>

        {/* Exportar a Biblioteca */}
        <button
          onClick={handleExport}
          disabled={!hasVideo || isExportando || isExported || isEncolado || needsRef}
          style={{
            display: "flex", alignItems: "center", gap: S[1],
            padding: `${S[2]}px ${S[5]}px`,
            background: (!hasVideo || isExportando || isExported || isEncolado || needsRef)
              ? C.surface
              : `linear-gradient(135deg, ${ACCENT} 0%, #9a3412 100%)`,
            border: `1px solid ${(!hasVideo || isExportando || isExported || isEncolado || needsRef) ? C.line : "transparent"}`,
            borderRadius: R.sm,
            fontSize: T.sz.sm,
            fontWeight: T.wt.semibold,
            color: (!hasVideo || isExportando || isExported || isEncolado || needsRef) ? C.inkGhost : C.white,
            cursor: (!hasVideo || isExportando || isExported || isEncolado || needsRef) ? "not-allowed" : "pointer",
            fontFamily: T.mono,
            boxShadow: (hasVideo && !isExportando && !isExported && !isEncolado && !needsRef)
              ? `0 2px 8px ${ACCENT}40` : "none",
          }}
        >
          {isExportando
            ? <Loader2 size={13} strokeWidth={2} />
            : (isExported || isEncolado)
              ? <Check size={13} strokeWidth={2} />
              : <Download size={13} strokeWidth={1.8} />
          }
          {isExportando
            ? "Preparando exportación…"
            : isEncolado
              ? "En cola"
              : isExported
                ? "Exportado"
                : "Exportar a Biblioteca"}
        </button>

        {/* Usar en Contenido */}
        <button
          disabled={!isExported && !isEncolado}
          onClick={() => (isExported || isEncolado) && (window.location.href = `/${orgSlug}/agentik/marketing-studio/campaigns`)}
          style={{
            display: "flex", alignItems: "center", gap: S[1],
            padding: `${S[2]}px ${S[4]}px`,
            background: "transparent",
            border: `1px solid ${(isExported || isEncolado) ? C.blue : C.line}`,
            borderRadius: R.sm,
            fontSize: T.sz.sm,
            color: (isExported || isEncolado) ? C.blue : C.inkGhost,
            cursor: (isExported || isEncolado) ? "pointer" : "not-allowed",
            fontFamily: T.mono,
          }}
        >
          <Film size={13} strokeWidth={1.6} />
          Usar en Contenido
        </button>

        {/* Usar en Anuncios */}
        <button
          disabled={!isExported && !isEncolado}
          onClick={() => (isExported || isEncolado) && (window.location.href = `/${orgSlug}/agentik/marketing-studio/anuncios`)}
          style={{
            display: "flex", alignItems: "center", gap: S[1],
            padding: `${S[2]}px ${S[4]}px`,
            background: "transparent",
            border: `1px solid ${(isExported || isEncolado) ? C.blueDark : C.line}`,
            borderRadius: R.sm,
            fontSize: T.sz.sm,
            color: (isExported || isEncolado) ? C.blueDark : C.inkGhost,
            cursor: (isExported || isEncolado) ? "pointer" : "not-allowed",
            fontFamily: T.mono,
          }}
        >
          <Send size={13} strokeWidth={1.6} />
          Usar en Anuncios
        </button>

        {/* Error retry */}
        {estado === "error" && (
          <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
            <AlertCircle size={13} color={C.red} strokeWidth={2} />
            <span style={{ fontSize: T.sz.sm, color: C.red }}>Error al exportar.</span>
            <button
              onClick={() => setEstado("editando")}
              style={{
                background: "transparent", border: "none",
                color: C.blue, fontSize: T.sz.sm,
                cursor: "pointer", fontFamily: T.mono,
              }}
            >
              Reintentar
            </button>
          </div>
        )}
      </div>

      {/* ── Version history section ── */}
      {assetPadreId && (
        <div style={{
          marginTop: S[6],
          border: `1px solid ${C.line}`,
          borderRadius: R.lg,
          overflow: "hidden",
          background: C.white,
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: S[2],
            padding: `${S[3]}px ${S[4]}px`,
            borderBottom: `1px solid ${C.line}`,
            background: C.surface,
          }}>
            <Play size={13} color={ACCENT} strokeWidth={1.8} />
            <span style={{ fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.inkMid, flex: 1 }}>
              Historial de versiones
            </span>
            <span style={{ fontSize: T.sz["2xs"], color: C.inkGhost }}>
              {versiones.length} versión{versiones.length !== 1 ? "es" : ""}
            </span>
          </div>

          {/* Content */}
          <div style={{ padding: S[3] }}>
            {versionesLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: S[2], padding: `${S[3]}px 0` }}>
                <Loader2 size={14} color={ACCENT} strokeWidth={1.8} />
                <span style={{ fontSize: T.sz.sm, color: C.inkFaint }}>Cargando versiones…</span>
              </div>
            ) : versiones.length === 0 ? (
              <div style={{
                padding: `${S[4]}px 0`,
                textAlign: "center" as const,
                fontSize: T.sz.sm,
                color: C.inkFaint,
              }}>
                Este video aún no tiene versiones editadas.
              </div>
            ) : (
              <div style={{ paddingLeft: S[1] }}>
                {/* ── Original ── */}
                <div style={{ display: "flex", gap: S[2] }}>
                  {/* Dot + line */}
                  <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", flexShrink: 0, width: 14 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.inkLight, border: `2px solid ${C.white}`, boxShadow: `0 0 0 2px ${C.line}`, zIndex: 1, flexShrink: 0 }} />
                    {versiones.length > 0 && (
                      <div style={{ width: 2, flex: 1, minHeight: 20, background: C.line, marginTop: 2 }} />
                    )}
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, paddingBottom: versiones.length > 0 ? S[3] : 0, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                      {/* Thumbnail */}
                      <div style={{ width: 40, height: 32, borderRadius: R.xs, background: "#111", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {loadedAsset?.assetUrl ? (
                          <video src={loadedAsset.assetUrl} muted preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>▶</div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkMid }}>
                          Video original
                        </div>
                        <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          {loadedAsset?.nombre ?? "Original"}
                        </div>
                      </div>
                      <span style={{ fontSize: T.sz["2xs"], color: C.inkGhost, flexShrink: 0 }}>v1</span>
                    </div>
                  </div>
                </div>

                {/* ── Derived versions ── */}
                {versiones.map((v, i) => (
                  <div key={v.id} style={{ display: "flex", gap: S[2] }}>
                    {/* Dot + line */}
                    <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", flexShrink: 0, width: 14 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: ACCENT, border: `2px solid ${C.white}`, boxShadow: `0 0 0 2px ${ACCENT}44`, zIndex: 1, flexShrink: 0 }} />
                      {i < versiones.length - 1 && (
                        <div style={{ width: 2, flex: 1, minHeight: 20, background: C.line, marginTop: 2 }} />
                      )}
                    </div>
                    {/* Content */}
                    <div style={{ flex: 1, paddingBottom: i < versiones.length - 1 ? S[3] : 0, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: S[2] }}>
                        {/* Thumbnail */}
                        <div style={{ width: 40, height: 32, borderRadius: R.xs, background: "#111", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {v.assetUrl ? (
                            <video src={v.assetUrl} muted preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>▶</div>
                          )}
                        </div>
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                            {v.versionName}
                          </div>
                          <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint }}>
                            {new Date(v.exportedAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                            {" · "}{v.formato} · {v.creadoPor}
                          </div>
                        </div>
                        {/* Badges */}
                        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                          <span style={{ fontSize: T.sz["2xs"], color: ACCENT }}>v{v.version}</span>
                          <a
                            href={`/${orgSlug}/agentik/marketing-studio/video-editor?assetId=${v.id}`}
                            style={{ fontSize: T.sz["2xs"], color: C.blue, textDecoration: "none", padding: `1px ${S[1]}px`, border: `1px solid ${C.blueBorder}`, borderRadius: R.xs, background: C.blueLight, whiteSpace: "nowrap" as const }}
                          >
                            Abrir
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/mov,video/quicktime,video/webm,video/*"
        style={{ display: "none" }}
        onChange={handleInputChange}
      />
    </div>
  );
}

// ── Library selector modal ─────────────────────────────────────────────────────

function LibrarySelectorModal({
  assets, loading, onSelect, onClose,
}: {
  assets:   BibliotecaVideoAsset[];
  loading:  boolean;
  onSelect: (a: BibliotecaVideoAsset) => void;
  onClose:  () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed" as const, inset: 0,
          background: "rgba(0,0,0,.45)",
          zIndex: 400,
        }}
      />

      {/* Modal */}
      <div style={{
        position: "fixed" as const,
        top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        width: "min(520px, 90vw)",
        maxHeight: "70vh",
        background: C.white,
        border: `1px solid ${C.line}`,
        borderRadius: R.xl,
        boxShadow: "0 20px 60px rgba(0,0,0,.22)",
        zIndex: 401,
        display: "flex",
        flexDirection: "column" as const,
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: S[3],
          padding: `${S[3]}px ${S[4]}px`,
          borderBottom: `1px solid ${C.line}`,
          background: C.surface,
        }}>
          <Library size={15} color={ACCENT} strokeWidth={1.8} />
          <span style={{ flex: 1, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.inkMid }}>
            Seleccionar video de Biblioteca
          </span>
          <button onClick={onClose} style={{
            background: "transparent", border: "none",
            color: C.inkFaint, cursor: "pointer", padding: S[1],
          }}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: S[3] }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: S[8] }}>
              <Loader2 size={20} color={ACCENT} strokeWidth={1.8} />
              <span style={{ marginLeft: S[2], fontSize: T.sz.sm, color: C.inkFaint }}>
                Cargando videos…
              </span>
            </div>
          ) : assets.length === 0 ? (
            <div style={{ padding: S[8], textAlign: "center" as const }}>
              <Film size={28} color={C.inkGhost} strokeWidth={1.4} style={{ marginBottom: S[2] }} />
              <div style={{ fontSize: T.sz.sm, color: C.inkFaint }}>
                No hay videos en Biblioteca todavía.
              </div>
              <div style={{ fontSize: T.sz["2xs"], color: C.inkGhost, marginTop: S[1] }}>
                Genera videos con Foto Estudio o sube un video manualmente.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
              {assets.map(a => (
                <button
                  key={a.id}
                  onClick={() => onSelect(a)}
                  style={{
                    display: "flex", alignItems: "center", gap: S[3],
                    padding: S[3],
                    background: C.white,
                    border: `1px solid ${C.line}`,
                    borderRadius: R.md,
                    cursor: "pointer",
                    textAlign: "left" as const,
                    fontFamily: T.mono,
                    transition: "border-color .1s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = ACCENT)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.line)}
                >
                  {/* Thumbnail */}
                  <div style={{
                    width: 56, height: 56,
                    borderRadius: R.sm,
                    background: "#0c0c0c",
                    overflow: "hidden",
                    flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <video src={a.assetUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: T.sz.sm, color: C.inkMid, fontWeight: T.wt.semibold,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                    }}>
                      {a.nombre}
                    </div>
                    <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
                      {a.origen === "video_editor" ? "Editor de Video" : a.origen === "ai" ? "Foto Estudio IA" : "Manual"}
                      {a.version && ` · v${a.version}`}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 4, color: ACCENT, flexShrink: 0 }}>
                    <span style={{ fontSize: T.sz["2xs"], color: ACCENT }}>Usar</span>
                    <ChevronRight size={12} strokeWidth={2} color={ACCENT} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Tool tabs ─────────────────────────────────────────────────────────────────

interface ToolTabsDef {
  id:      VideoHerramienta;
  label:   string;
  icon:    React.ReactNode;
  hasEdit: boolean;
}

function ToolTabs({
  herramienta, config, onSelect, hasVideo,
}: {
  herramienta: VideoHerramienta;
  config:      VideoEditorConfig;
  onSelect:    (h: VideoHerramienta) => void;
  hasVideo:    boolean;
}) {
  const sz = 13;
  const sw = 1.6;

  const tabs: ToolTabsDef[] = [
    { id: "destino",     label: "Destino",     icon: <LayoutGrid size={sz} strokeWidth={sw} />, hasEdit: false },
    { id: "recorte",     label: "Recorte",     icon: <Scissors   size={sz} strokeWidth={sw} />, hasEdit: config.recorteInicio > 0 || config.recorteFin !== null },
    { id: "subtitulos",  label: "Subtítulos",  icon: <Type       size={sz} strokeWidth={sw} />, hasEdit: config.subtitulosActivos },
    { id: "musica",      label: "Música",      icon: <Music2     size={sz} strokeWidth={sw} />, hasEdit: config.musicaActiva },
    { id: "texto",       label: "Texto",       icon: <Type       size={sz} strokeWidth={sw} />, hasEdit: config.textoActivo && !!config.textoOverlay },
    { id: "marca",       label: "Marca",       icon: <Image      size={sz} strokeWidth={sw} />, hasEdit: config.marcaActiva },
    { id: "exportacion", label: "Exportación", icon: <Download   size={sz} strokeWidth={sw} />, hasEdit: false },
  ];

  return (
    <div style={{ borderBottom: `1px solid ${C.line}` }}>
      {tabs.map(tab => {
        const active = herramienta === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            disabled={!hasVideo && tab.id !== "destino"}
            style={{
              width: "100%",
              display: "flex", alignItems: "center", gap: S[2],
              padding: `${S[2]}px ${S[4]}px`,
              background: active ? `${ACCENT}0d` : "transparent",
              border: "none",
              borderLeft: `3px solid ${active ? ACCENT : "transparent"}`,
              cursor: (!hasVideo && tab.id !== "destino") ? "not-allowed" : "pointer",
              fontFamily: T.mono,
              opacity: (!hasVideo && tab.id !== "destino") ? 0.4 : 1,
            }}
          >
            <span style={{ color: active ? ACCENT : C.inkLight }}>{tab.icon}</span>
            <span style={{
              flex: 1, fontSize: T.sz.sm,
              color: active ? ACCENT : C.inkMid,
              fontWeight: active ? T.wt.semibold : T.wt.normal,
            }}>
              {tab.label}
            </span>
            {tab.hasEdit && (
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Destino panel ─────────────────────────────────────────────────────────────

function DestinoPanel({
  config, onUpdate, disabled,
}: {
  config:   VideoEditorConfig;
  onUpdate: (p: Partial<VideoEditorConfig>) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
      <div style={{ ...MS_SECTION, color: C.inkFaint, marginBottom: S[1] }}>Destino de publicación</div>
      {DESTINOS.map(d => {
        const selected = config.destino === d.id;
        return (
          <button
            key={d.id}
            onClick={() => !disabled && onUpdate({ destino: d.id })}
            disabled={disabled}
            style={{
              display: "flex", alignItems: "center", gap: S[3],
              padding: `${S[2]}px ${S[3]}px`,
              background: selected ? `${ACCENT}0d` : C.surface,
              border: `1px solid ${selected ? ACCENT : C.line}`,
              borderRadius: R.md,
              cursor: disabled ? "not-allowed" : "pointer",
              textAlign: "left" as const,
              fontFamily: T.mono,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {/* Format visual */}
            <div style={{
              flexShrink: 0,
              width:  d.formato === "16:9" ? 28 : d.formato === "1:1" ? 18 : 11,
              height: d.formato === "9:16" ? 28 : d.formato === "1:1" ? 18 : 16,
              border: `1.5px solid ${selected ? ACCENT : C.inkGhost}`,
              borderRadius: 2,
              background: selected ? `${ACCENT}14` : "transparent",
            }} />
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                color: selected ? ACCENT : C.inkMid,
              }}>
                {d.label}
              </div>
              <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 }}>
                {d.subtitulo}
              </div>
            </div>
            {selected && <Check size={12} color={ACCENT} strokeWidth={2.5} />}
          </button>
        );
      })}
    </div>
  );
}

// ── Recorte panel ─────────────────────────────────────────────────────────────

function RecortePanel({
  config, onUpdate, disabled,
}: {
  config: VideoEditorConfig; onUpdate: (p: Partial<VideoEditorConfig>) => void; disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
      <div style={{ ...MS_SECTION, color: C.inkFaint }}>Recortar video</div>
      <NumericField
        label="Inicio (segundos)"
        value={config.recorteInicio}
        min={0}
        disabled={disabled}
        onChange={v => onUpdate({ recorteInicio: v })}
      />
      <NumericFieldNullable
        label="Fin (vacío = hasta el final)"
        value={config.recorteFin}
        min={1}
        disabled={disabled}
        placeholder="hasta el final"
        onChange={v => onUpdate({ recorteFin: v })}
      />
      {(config.recorteInicio > 0 || config.recorteFin !== null) && (
        <GhostBtn label="Limpiar recorte" disabled={disabled}
          onClick={() => onUpdate({ recorteInicio: 0, recorteFin: null })} />
      )}
    </div>
  );
}

// ── Subtítulos panel ──────────────────────────────────────────────────────────

interface SubtitulosPanelProps {
  config:                 VideoEditorConfig;
  onUpdate:               (p: Partial<VideoEditorConfig>) => void;
  disabled:               boolean;
  subtitleTrack:          VideoSubtitleTrack | null;
  subtitleTracks:         VideoSubtitleTrack[];
  subtitleGenerating:     boolean;
  subtitleLanguage:       string;
  subtitleSegmentEdits:   VideoSubtitleSegment[];
  subtitleSaving:         boolean;
  subtitleRegenConfirm:   boolean;
  onLanguageChange:       (lang: string) => void;
  onSegmentEdit:          (idx: number, text: string) => void;
  onGenerateSubtitles:    () => void;
  onSaveSubtitles:        () => void;
  onTrackSelect:          (track: VideoSubtitleTrack) => void;
  onRegenerateSubtitles:  () => void;
  onConfirmRegenerate:    () => void;
  onCancelRegenerate:     () => void;
}

function SubtitulosPanel({
  config, onUpdate, disabled,
  subtitleTrack, subtitleTracks, subtitleGenerating,
  subtitleLanguage, subtitleSegmentEdits, subtitleSaving,
  subtitleRegenConfirm,
  onLanguageChange, onSegmentEdit,
  onGenerateSubtitles, onSaveSubtitles,
  onTrackSelect, onRegenerateSubtitles,
  onConfirmRegenerate, onCancelRegenerate,
}: SubtitulosPanelProps) {
  const isReady     = subtitleTrack?.status === "ready";
  const isFailed    = subtitleTrack?.status === "failed";
  const isActive    = subtitleTrack ? isActiveSubtitleStatus(subtitleTrack.status) : false;
  const hasEdits    = subtitleSegmentEdits.some(s => s.edited);

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3], position: "relative" as const }}>
      <div style={{ ...MS_SECTION, color: C.inkFaint }}>Subtítulos</div>

      {/* Multi-track pills — shown when more than one language track exists */}
      {subtitleTracks.length > 1 && (
        <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" as const }}>
          {subtitleTracks.map(t => {
            const active = t.id === subtitleTrack?.id;
            return (
              <button
                key={t.id}
                onClick={() => onTrackSelect(t)}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: `2px ${S[2]}px`,
                  background: active ? C.blueDark : C.surfaceAlt,
                  border: `1px solid ${active ? C.blueDark : C.line}`,
                  borderRadius: R.pill,
                  fontFamily: T.mono, fontSize: T.sz["2xs"],
                  color: active ? C.white : C.inkMid,
                  cursor: "pointer", fontWeight: active ? T.wt.semibold : T.wt.normal,
                }}
              >
                {t.language.toUpperCase()}
                {t.status === "ready" && <Check size={9} strokeWidth={2.5} />}
                {t.status !== "ready" && <Loader2 size={9} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />}
              </button>
            );
          })}
        </div>
      )}

      {/* Toggle */}
      <Toggle
        label="Incluir subtítulos en exportación"
        active={config.subtitulosActivos}
        disabled={disabled}
        onChange={v => onUpdate({ subtitulosActivos: v })}
      />

      {/* Generate section */}
      <div style={{
        padding: `${S[3]}px`,
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: R.md,
        display: "flex", flexDirection: "column" as const, gap: S[2],
      }}>
        <div style={{ display: "flex", gap: S[2], alignItems: "flex-end" }}>
          {/* Language selector */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: 3 }}>Idioma</div>
            <select
              value={subtitleLanguage}
              disabled={disabled || subtitleGenerating}
              onChange={e => onLanguageChange(e.target.value)}
              style={{
                width: "100%",
                padding: `${S[1]}px ${S[2]}px`,
                background: C.surfaceAlt,
                border: `1px solid ${C.line}`,
                borderRadius: R.sm,
                fontFamily: T.mono,
                fontSize: T.sz.xs,
                color: C.inkMid,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              {SUBTITLE_LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>

          {/* Generate / Regenerar buttons */}
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[1], flexShrink: 0 }}>
            <button
              onClick={onGenerateSubtitles}
              disabled={disabled || subtitleGenerating}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: `${S[1]}px ${S[3]}px`,
                background: disabled || subtitleGenerating ? C.surfaceAlt : C.blueDark,
                color: disabled || subtitleGenerating ? C.inkGhost : C.white,
                border: "none", borderRadius: R.sm,
                fontFamily: T.mono, fontSize: T.sz.xs,
                fontWeight: T.wt.semibold,
                cursor: disabled || subtitleGenerating ? "not-allowed" : "pointer",
                whiteSpace: "nowrap" as const,
              }}
            >
              {subtitleGenerating ? (
                <><Loader2 size={11} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} /> Generando</>
              ) : (
                <><Type size={11} strokeWidth={2} /> Generar subtítulos</>
              )}
            </button>
            {isReady && (
              <button
                onClick={onRegenerateSubtitles}
                disabled={disabled || subtitleGenerating}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: `${S[1]}px ${S[3]}px`,
                  background: "transparent",
                  color: disabled || subtitleGenerating ? C.inkGhost : C.inkFaint,
                  border: `1px solid ${C.line}`,
                  borderRadius: R.sm,
                  fontFamily: T.mono, fontSize: T.sz["2xs"],
                  cursor: disabled || subtitleGenerating ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap" as const,
                }}
              >
                <RotateCcw size={10} strokeWidth={1.8} />
                Regenerar
              </button>
            )}
          </div>
        </div>

        {/* Status indicator */}
        {subtitleTrack && (
          <div style={{
            display: "flex", alignItems: "center", gap: S[2],
            padding: `${S[1]}px ${S[2]}px`,
            background: isReady ? C.greenLight : isFailed ? C.redLight : C.amberLight,
            border: `1px solid ${isReady ? C.greenBorder : isFailed ? C.redBorder : C.amberBorder}`,
            borderRadius: R.sm,
          }}>
            {isActive && <Loader2 size={10} strokeWidth={2} style={{ animation: "spin 1s linear infinite", color: C.amber }} />}
            {isReady  && <Check   size={10} strokeWidth={2.5} color={C.green} />}
            {isFailed && <AlertCircle size={10} strokeWidth={2} color={C.red} />}
            <span style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"],
              color: isReady ? C.greenDark : isFailed ? C.red : C.amberMid,
            }}>
              {SUBTITLE_STATUS_LABEL[subtitleTrack.status]}
              {isReady && ` — ${subtitleSegmentEdits.length} segmento${subtitleSegmentEdits.length !== 1 ? "s" : ""}`}
              {isFailed && subtitleTrack.errorMessage ? ` — ${subtitleTrack.errorMessage}` : ""}
            </span>
          </div>
        )}
      </div>

      {/* Confirmation dialog — shown when regenerating with manual edits */}
      {subtitleRegenConfirm && (
        <div style={{
          position: "absolute" as const,
          inset: 0,
          background: "rgba(255,255,255,.96)",
          borderRadius: R.md,
          border: `1px solid ${C.amberBorder}`,
          display: "flex", flexDirection: "column" as const,
          alignItems: "center", justifyContent: "center",
          gap: S[3], padding: S[5],
          zIndex: 10,
        }}>
          <AlertCircle size={22} color={C.amber} strokeWidth={1.8} />
          <div style={{ textAlign: "center" as const }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.inkMid, marginBottom: 4 }}>
              ¿Regenerar subtítulos?
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, lineHeight: 1.5 }}>
              Se perderán los cambios manuales que hiciste en los segmentos.
            </div>
          </div>
          <div style={{ display: "flex", gap: S[2] }}>
            <button
              onClick={onCancelRegenerate}
              style={{
                padding: `${S[1]}px ${S[3]}px`,
                background: "transparent", border: `1px solid ${C.line}`,
                borderRadius: R.sm, fontFamily: T.mono, fontSize: T.sz.xs,
                color: C.inkMid, cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={onConfirmRegenerate}
              style={{
                padding: `${S[1]}px ${S[3]}px`,
                background: C.amber, border: "none",
                borderRadius: R.sm, fontFamily: T.mono, fontSize: T.sz.xs,
                fontWeight: T.wt.semibold, color: C.white, cursor: "pointer",
              }}
            >
              Regenerar
            </button>
          </div>
        </div>
      )}

      {/* Segment editor — shown when track is ready */}
      {isReady && subtitleSegmentEdits.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
          <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint, fontWeight: T.wt.semibold }}>
            Editar subtítulos
          </div>

          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[1], maxHeight: 260, overflowY: "auto" as const }}>
            {subtitleSegmentEdits.map((seg, idx) => (
              <div key={idx} style={{
                display: "grid",
                gridTemplateColumns: "52px 1fr",
                gap: S[2],
                alignItems: "flex-start",
              }}>
                {/* Timestamp */}
                <div style={{
                  fontFamily: T.mono, fontSize: 9, color: C.inkFaint,
                  paddingTop: 5, lineHeight: 1.4,
                  borderRight: `1px solid ${C.line}`,
                  paddingRight: S[1],
                }}>
                  {formatSecs(seg.start)}
                  <br />
                  <span style={{ color: C.inkGhost }}>→ {formatSecs(seg.end)}</span>
                </div>
                {/* Editable text */}
                <textarea
                  value={seg.text}
                  onChange={e => onSegmentEdit(idx, e.target.value)}
                  rows={2}
                  style={{
                    width: "100%",
                    padding: `${S[1]}px ${S[2]}px`,
                    background: seg.edited ? `${C.blueDark}08` : C.surfaceAlt,
                    border: `1px solid ${seg.edited ? C.blueBorder : C.line}`,
                    borderRadius: R.xs,
                    fontFamily: T.mono, fontSize: T.sz["2xs"],
                    color: C.inkMid,
                    resize: "none" as const,
                    lineHeight: 1.4,
                    boxSizing: "border-box" as const,
                  }}
                />
              </div>
            ))}
          </div>

          {/* Save button */}
          <button
            onClick={onSaveSubtitles}
            disabled={subtitleSaving || !hasEdits}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              padding: `${S[1]}px ${S[3]}px`,
              background: (!hasEdits || subtitleSaving) ? C.surfaceAlt : C.blueDark,
              color: (!hasEdits || subtitleSaving) ? C.inkGhost : C.white,
              border: "none", borderRadius: R.sm,
              fontFamily: T.mono, fontSize: T.sz.xs,
              fontWeight: T.wt.semibold,
              cursor: (!hasEdits || subtitleSaving) ? "not-allowed" : "pointer",
            }}
          >
            {subtitleSaving
              ? <><Loader2 size={11} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} /> Guardando</>
              : <><Save size={11} strokeWidth={2} /> Guardar cambios</>
            }
          </button>
        </div>
      )}

      {/* Fallback manual text — when no track and subtitles enabled */}
      {!subtitleTrack && config.subtitulosActivos && (
        <TextAreaField
          label="Texto manual"
          value={config.subtitulosTexto}
          disabled={disabled}
          placeholder="Escribe aquí el texto que aparecerá como subtítulo…"
          onChange={v => onUpdate({ subtitulosTexto: v })}
        />
      )}
    </div>
  );
}

/** Format seconds as mm:ss */
function formatSecs(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// ── Copilot assist card ───────────────────────────────────────────────────────

const HERRAMIENTA_LABEL: Record<VideoHerramienta, string> = {
  destino:     "Destino",
  recorte:     "Recorte",
  subtitulos:  "Subtítulos",
  musica:      "Música",
  texto:       "Texto",
  marca:       "Marca",
  exportacion: "Exportación",
};

interface CopilotAction {
  label:     string;
  primary?:  boolean;
  disabled?: boolean;
  callback:  () => void;
}

function VideoCopilotCard({
  herramienta, config, estado,
  subtitleTracks, subtitleGenerating, subtitleSegmentEdits,
  musicTracks, videoDuration,
  renderJob, isLocalFile, localRef, isDraftSaved,
  orgSlug,
  onGenerateSubtitles, onRegenerateSubtitles, onSaveSubtitles,
  onExport, onSaveDraft, onUpdate,
}: {
  herramienta:            VideoHerramienta;
  config:                 VideoEditorConfig;
  estado:                 VideoEditorEstado;
  subtitleTracks:         VideoSubtitleTrack[];
  subtitleGenerating:     boolean;
  subtitleSegmentEdits:   VideoSubtitleSegment[];
  musicTracks:            MusicTrack[];
  videoDuration:          number | null;
  renderJob:              VideoRenderJob | null;
  isLocalFile:            boolean;
  localRef:               { name: string } | null;
  isDraftSaved:           boolean;
  orgSlug:                string;
  onGenerateSubtitles:    () => void;
  onRegenerateSubtitles:  () => void;
  onSaveSubtitles:        () => void;
  onExport:               () => void;
  onSaveDraft:            () => void;
  onUpdate:               (p: Partial<VideoEditorConfig>) => void;
}) {
  const isEncolado  = estado === "encolado";
  const isExporting = estado === "exportando";
  const renderDone  = renderJob?.status === "completed";
  const renderFailed = renderJob?.status === "failed";

  let hints:   string[]        = [];
  let actions: CopilotAction[] = [];

  // ── Post-render override ─────────────────────────────────────────────────
  if (renderDone) {
    hints = ["La versión ya está lista."];
    actions = [
      {
        label:    "Descargar video",
        primary:  true,
        callback: () => { window.location.href = `/${orgSlug}/agentik/marketing-studio/biblioteca`; },
      },
      {
        label:    "Crear publicación",
        callback: () => { window.location.href = `/${orgSlug}/agentik/marketing-studio/campaigns`; },
      },
      {
        label:    "Ver en Biblioteca",
        callback: () => { window.location.href = `/${orgSlug}/agentik/marketing-studio/biblioteca`; },
      },
    ];
    return <CopilotCard hints={hints} actions={actions} label="Listo" maxActions={3} />;
  }

  if (renderFailed) {
    hints = ["No pudimos exportar el video. Revisa el error y vuelve a intentarlo."];
    return <CopilotCard hints={hints} actions={[]} label="Error" />;
  }

  if (isEncolado || isExporting) {
    hints = ["El video está siendo exportado. La versión aparecerá en Biblioteca al terminar."];
    return <CopilotCard hints={hints} actions={[]} label="Exportando" />;
  }

  // ── Per-herramienta context ──────────────────────────────────────────────
  switch (herramienta) {
    case "destino": {
      hints = ["Selecciona el destino según la plataforma donde publicarás el video."];
      break;
    }

    case "recorte": {
      const hasTrim = config.recorteInicio > 0 || config.recorteFin !== null;
      hints = hasTrim
        ? ["El video exportado incluirá solo el segmento seleccionado."]
        : ["Ajusta inicio y fin para recortar el clip antes de exportar."];
      break;
    }

    case "subtitulos": {
      const readyTrack = subtitleTracks.find(t => t.status === "ready");
      const hasUnsaved = subtitleSegmentEdits.some(s => s.edited);

      if (subtitleGenerating) {
        hints   = ["Generando subtítulos automáticos…"];
      } else if (readyTrack) {
        hints = [
          "Puedes revisar y corregir los segmentos antes de exportar.",
          ...(hasUnsaved ? ["Tienes cambios sin guardar."] : []),
        ];
        actions = [
          { label: "Regenerar subtítulos", primary: true, callback: onRegenerateSubtitles },
          ...(hasUnsaved ? [{ label: "Guardar cambios", callback: onSaveSubtitles }] : []),
        ];
      } else {
        hints   = ["Puedo ayudarte a generar subtítulos automáticos."];
        actions = [{ label: "Generar subtítulos", primary: true, callback: onGenerateSubtitles }];
      }
      break;
    }

    case "musica": {
      const selectedTrack = musicTracks.find(t => t.id === config.musicaTrackId) ?? null;
      const trackDur      = selectedTrack?.durationSeconds ?? null;
      const musicShorter  = trackDur !== null && videoDuration !== null && trackDur < videoDuration;
      const musicLonger   = trackDur !== null && videoDuration !== null && trackDur > videoDuration;

      if (!config.musicaActiva || !selectedTrack) {
        hints = ["Puedes subir una pista o reutilizar una ya cargada."];
        // No action buttons — the panel above already has upload + track list
      } else {
        const contextHints: string[] = [];
        if (musicShorter) contextHints.push("La pista es más corta que el video.");
        if (musicLonger)  contextHints.push("La pista es más larga que el video; se utilizará solo la parte necesaria.");
        if (config.musicaVolumen < 20) contextHints.push("El volumen de la música es muy bajo.");
        if (config.musicaVolumen > 80 && config.audioOriginalVolumen > 60) {
          contextHints.push("Puedes reducir el audio original si deseas destacar la música.");
        }
        if (contextHints.length > 0) hints = contextHints;
        // No action buttons — context is informational; controls are in the panel
      }
      break;
    }

    case "texto": {
      if (!config.textoActivo) {
        hints   = ["Agrega un texto superpuesto al video, visible en el clip exportado."];
        actions = [{ label: "Activar texto", primary: true, callback: () => onUpdate({ textoActivo: true }) }];
      } else if (!config.textoOverlay.trim()) {
        hints = ["Escribe el texto que aparecerá sobre el video."];
      }
      // Has valid text → nothing to show
      break;
    }

    case "marca": {
      if (!config.marcaActiva) {
        hints   = ["Agrega tu logo como marca de agua en el video exportado."];
        actions = [{ label: "Agregar logo", primary: true, callback: () => onUpdate({ marcaActiva: true }) }];
      } else {
        hints = ["El logo aparecerá en la posición seleccionada."];
      }
      break;
    }

    case "exportacion": {
      if (isDraftSaved) {
        hints   = ["Borrador guardado. Puedes retomarlo antes de enviarlo a Biblioteca."];
        actions = [{ label: "Exportar a Biblioteca", primary: true, callback: onExport }];
      } else if (isLocalFile && !localRef) {
        hints   = ["Asocia una referencia antes de guardar la versión final."];
        actions = [{ label: "Guardar borrador", callback: onSaveDraft }];
      } else {
        hints   = [
          "Revisa formato, subtítulos y música antes de exportar.",
          "Esta versión se guardará como nueva entrada en Biblioteca.",
        ];
        actions = [
          { label: "Exportar a Biblioteca", primary: true, callback: onExport },
          ...(!isDraftSaved ? [{ label: "Guardar borrador", callback: onSaveDraft }] : []),
        ];
      }
      break;
    }
  }

  if (hints.length === 0) return null;

  return (
    <CopilotCard
      hints={hints}
      actions={actions}
      label={HERRAMIENTA_LABEL[herramienta]}
    />
  );
}

function CopilotCard({ hints, actions, label, maxActions = 2 }: {
  hints:       string[];
  actions:     CopilotAction[];
  label:       string;
  maxActions?: number;
}) {
  if (hints.length === 0) return null;
  const visibleActions = actions.slice(0, maxActions);

  return (
    <div style={{
      borderTop: `1px solid ${C.line}`,
      padding:   S[4],
      background: `${ACCENT}06`,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: S[2],
        marginBottom: S[3],
      }}>
        <div style={{
          width: 18, height: 18,
          borderRadius: R.sm,
          background: `${ACCENT}18`,
          border: `1px solid ${ACCENT}28`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Sparkles size={9} color={ACCENT} strokeWidth={2} />
        </div>
        <span style={{
          fontSize: T.sz["2xs"],
          color: ACCENT,
          fontWeight: T.wt.semibold,
          letterSpacing: "0.04em",
        }}>
          Asistente · {label}
        </span>
      </div>

      {/* Hints */}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2], marginBottom: visibleActions.length > 0 ? S[3] : 0 }}>
        {hints.slice(0, 3).map((hint, i) => (
          <div
            key={i}
            style={{
              display: "flex", alignItems: "flex-start", gap: S[1],
              fontSize: T.sz["2xs"], color: C.inkMid, lineHeight: 1.4,
            }}
          >
            <span style={{ color: ACCENT, flexShrink: 0, fontSize: 10, marginTop: 1 }}>·</span>
            {hint}
          </div>
        ))}
      </div>

      {/* Quick actions */}
      {visibleActions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[2] }}>
          {visibleActions.map((action, i) => (
            <button
              key={i}
              onClick={action.callback}
              disabled={action.disabled}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: `${S[1]}px ${S[2]}px`,
                background: action.primary ? `${ACCENT}14` : "transparent",
                border: `1px solid ${action.primary ? ACCENT : C.line}`,
                borderRadius: R.sm,
                fontSize: T.sz["2xs"],
                color: action.disabled ? C.inkGhost : action.primary ? ACCENT : C.inkMid,
                cursor: action.disabled ? "not-allowed" : "pointer",
                fontFamily: T.mono,
                fontWeight: action.primary ? T.wt.semibold : T.wt.normal,
                opacity: action.disabled ? 0.5 : 1,
              }}
            >
              {i === 0 && action.primary && <Zap size={9} strokeWidth={2} />}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Música panel ──────────────────────────────────────────────────────────────

function MusicaPanel({
  config, onUpdate, disabled, orgSlug,
  musicTracks, tracksLoading, uploading, uploadError,
  onUpload, onDelete, videoDuration,
}: {
  config:         VideoEditorConfig;
  onUpdate:       (p: Partial<VideoEditorConfig>) => void;
  disabled:       boolean;
  orgSlug:        string;
  musicTracks:    MusicTrack[];
  tracksLoading:  boolean;
  uploading:      boolean;
  uploadError:    string | null;
  onUpload:       (file: File, nombre: string) => Promise<void>;
  onDelete:       (trackId: string) => Promise<void>;
  videoDuration:  number | null;
}) {
  const fileRef                                 = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile]           = useState<File | null>(null);
  const [uploadName, setUploadName]             = useState("");
  const [showUploadForm, setShowUploadForm]     = useState(false);

  const selectedTrack = musicTracks.find(t => t.id === config.musicaTrackId) ?? null;

  // Copilot signals
  const signals: string[] = [];
  if (config.musicaActiva && config.musicaVolumen < 20) {
    signals.push("El volumen de la música está muy bajo — considera subirlo.");
  }
  if (config.musicaActiva && config.audioOriginalVolumen < 10) {
    signals.push("El audio original está casi silenciado.");
  }
  if (config.musicaActiva && videoDuration !== null && selectedTrack?.durationSeconds !== null && selectedTrack?.durationSeconds !== undefined) {
    if (selectedTrack.durationSeconds < videoDuration) {
      signals.push("La pista de música es más corta que el video — se cortará al terminar.");
    }
  }
  if (config.musicaActiva && !config.musicaTrackId) {
    signals.push("Activa una pista para agregar música al video.");
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPendingFile(f);
    setUploadName(f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
    setShowUploadForm(true);
  };

  const handleConfirmUpload = async () => {
    if (!pendingFile || !uploadName.trim()) return;
    await onUpload(pendingFile, uploadName.trim());
    setPendingFile(null);
    setUploadName("");
    setShowUploadForm(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleCancelUpload = () => {
    setPendingFile(null);
    setUploadName("");
    setShowUploadForm(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
      <div style={{ ...MS_SECTION, color: C.inkFaint }}>Música de fondo</div>

      <Toggle
        label="Agregar música"
        active={config.musicaActiva}
        disabled={disabled}
        onChange={v => onUpdate({ musicaActiva: v })}
      />

      {config.musicaActiva && (
        <>
          {/* ── Track list ── */}
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: T.sz["2xs"], color: C.inkLight }}>Pistas disponibles</span>
              {!showUploadForm && (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={disabled || uploading}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    background: "none", border: "none",
                    fontSize: T.sz["2xs"], color: ACCENT,
                    cursor: disabled ? "not-allowed" : "pointer",
                    fontFamily: T.mono, padding: 0,
                  }}
                >
                  <Upload size={10} strokeWidth={2} />
                  Subir pista
                </button>
              )}
            </div>

            {/* Hidden file input */}
            <input
              ref={fileRef}
              type="file"
              accept={MUSIC_MIME_ACCEPT}
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            {/* Upload confirm form */}
            {showUploadForm && pendingFile && (
              <div style={{
                padding: S[2], background: C.blueLight,
                border: `1px solid ${C.blueBorder}`,
                borderRadius: R.sm,
                display: "flex", flexDirection: "column" as const, gap: S[2],
              }}>
                <div style={{ fontSize: T.sz["2xs"], color: C.inkMid }}>
                  {pendingFile.name} · {formatMusicSize(pendingFile.size)}
                </div>
                <input
                  type="text"
                  value={uploadName}
                  onChange={e => setUploadName(e.target.value)}
                  placeholder="Nombre de la pista"
                  maxLength={80}
                  style={{
                    padding: `${S[1]}px ${S[2]}px`,
                    border: `1px solid ${C.line}`,
                    borderRadius: R.sm,
                    fontSize: T.sz["2xs"],
                    fontFamily: T.mono,
                    color: C.inkMid,
                    background: C.white,
                    outline: "none",
                  }}
                />
                <div style={{ display: "flex", gap: S[2] }}>
                  <button
                    onClick={() => void handleConfirmUpload()}
                    disabled={!uploadName.trim() || uploading}
                    style={{
                      flex: 1, padding: `${S[1]}px`,
                      background: ACCENT, color: C.white,
                      border: "none", borderRadius: R.sm,
                      fontSize: T.sz["2xs"], fontFamily: T.mono,
                      cursor: uploading ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    }}
                  >
                    {uploading ? <Loader2 size={10} className="ag-spin" strokeWidth={2} /> : <Check size={10} strokeWidth={2.5} />}
                    {uploading ? "Subiendo…" : "Confirmar"}
                  </button>
                  <button
                    onClick={handleCancelUpload}
                    disabled={uploading}
                    style={{
                      padding: `${S[1]}px ${S[2]}px`,
                      background: "none", border: `1px solid ${C.line}`,
                      borderRadius: R.sm,
                      fontSize: T.sz["2xs"], fontFamily: T.mono,
                      color: C.inkMid, cursor: "pointer",
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Upload error */}
            {uploadError && (
              <div style={{
                padding: S[2], background: C.redLight,
                border: `1px solid ${C.redBorder}`,
                borderRadius: R.sm,
                fontSize: T.sz["2xs"], color: C.redDark,
                display: "flex", gap: S[1], alignItems: "flex-start",
              }}>
                <AlertCircle size={11} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                {uploadError}
              </div>
            )}

            {/* Track list */}
            {tracksLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: S[2], color: C.inkFaint, fontSize: T.sz["2xs"] }}>
                <Loader2 size={11} className="ag-spin" strokeWidth={2} />
                Cargando pistas…
              </div>
            ) : musicTracks.length === 0 ? (
              <div style={{
                padding: S[3],
                border: `1px dashed ${C.line}`,
                borderRadius: R.sm,
                textAlign: "center" as const,
                fontSize: T.sz["2xs"],
                color: C.inkGhost,
              }}>
                {MUSIC_FORMAT_LABEL}
                <br />
                <span style={{ color: C.inkFaint }}>Sube una pista para empezar</span>
              </div>
            ) : (
              musicTracks.map(track => {
                const sel = config.musicaTrackId === track.id;
                return (
                  <div
                    key={track.id}
                    style={{
                      display: "flex", alignItems: "center", gap: S[2],
                      padding: `${S[1]}px ${S[2]}px`,
                      background: sel ? `${ACCENT}0d` : C.surface,
                      border: `1px solid ${sel ? ACCENT : C.line}`,
                      borderRadius: R.sm,
                    }}
                  >
                    <button
                      onClick={() => !disabled && onUpdate({ musicaTrackId: sel ? null : track.id })}
                      disabled={disabled}
                      style={{
                        flex: 1, display: "flex", alignItems: "center", gap: S[2],
                        background: "none", border: "none",
                        cursor: disabled ? "not-allowed" : "pointer",
                        textAlign: "left" as const, fontFamily: T.mono, padding: 0,
                      }}
                    >
                      <Music2 size={11} color={sel ? ACCENT : C.inkFaint} strokeWidth={1.8} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: T.sz["2xs"], color: sel ? ACCENT : C.inkMid, fontWeight: sel ? T.wt.semibold : T.wt.normal }}>
                          {track.nombre}
                        </div>
                        <div style={{ fontSize: T.sz["2xs"] - 1, color: C.inkGhost }}>
                          {track.durationSeconds !== null ? formatMusicDuration(track.durationSeconds) : "—"} · {formatMusicSize(track.sizeBytes)}
                        </div>
                      </div>
                      {sel && <Check size={11} color={ACCENT} strokeWidth={2.5} />}
                    </button>
                    {/* Audio preview */}
                    {track.assetUrl && sel && (
                      <audio
                        src={track.assetUrl}
                        controls
                        style={{ height: 24, width: 80 }}
                      />
                    )}
                    {/* Delete */}
                    <button
                      onClick={() => void onDelete(track.id)}
                      disabled={disabled}
                      title="Eliminar pista"
                      style={{
                        background: "none", border: "none",
                        cursor: disabled ? "not-allowed" : "pointer",
                        color: C.inkGhost, padding: 2, flexShrink: 0,
                        display: "flex", alignItems: "center",
                      }}
                    >
                      <Trash2 size={10} strokeWidth={2} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Volume sliders ── */}
          <label style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: T.sz["2xs"], color: C.inkLight }}>Volumen música</span>
              <span style={{ fontSize: T.sz["2xs"], color: C.inkFaint }}>{config.musicaVolumen}%</span>
            </div>
            <input
              type="range" min={0} max={100} step={5}
              value={config.musicaVolumen}
              disabled={disabled}
              onChange={e => onUpdate({ musicaVolumen: Number(e.target.value) })}
              style={{ width: "100%", accentColor: ACCENT }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: T.sz["2xs"], color: C.inkLight }}>Volumen audio original</span>
              <span style={{ fontSize: T.sz["2xs"], color: C.inkFaint }}>{config.audioOriginalVolumen}%</span>
            </div>
            <input
              type="range" min={0} max={100} step={5}
              value={config.audioOriginalVolumen}
              disabled={disabled}
              onChange={e => onUpdate({ audioOriginalVolumen: Number(e.target.value) })}
              style={{ width: "100%", accentColor: ACCENT }}
            />
          </label>

          {/* ── Fade controls ── */}
          <label style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: T.sz["2xs"], color: C.inkLight }}>Fundido entrada</span>
              <span style={{ fontSize: T.sz["2xs"], color: C.inkFaint }}>{config.musicaFadeIn}s</span>
            </div>
            <input
              type="range" min={0} max={10} step={0.5}
              value={config.musicaFadeIn}
              disabled={disabled}
              onChange={e => onUpdate({ musicaFadeIn: Number(e.target.value) })}
              style={{ width: "100%", accentColor: ACCENT }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: T.sz["2xs"], color: C.inkLight }}>Fundido salida</span>
              <span style={{ fontSize: T.sz["2xs"], color: C.inkFaint }}>{config.musicaFadeOut}s</span>
            </div>
            <input
              type="range" min={0} max={10} step={0.5}
              value={config.musicaFadeOut}
              disabled={disabled}
              onChange={e => onUpdate({ musicaFadeOut: Number(e.target.value) })}
              style={{ width: "100%", accentColor: ACCENT }}
            />
          </label>

          {/* ── Copilot signal strip ── */}
          {signals.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
              {signals.map((sig, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: S[1],
                  padding: `${S[1]}px ${S[2]}px`,
                  background: C.amberLight,
                  border: `1px solid ${C.amberBorder}`,
                  borderRadius: R.sm,
                  fontSize: T.sz["2xs"], color: C.inkMid,
                }}>
                  <AlertCircle size={10} color={C.amber} strokeWidth={2} style={{ marginTop: 1, flexShrink: 0 }} />
                  {sig}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Texto panel ───────────────────────────────────────────────────────────────

function TextoPanel({
  config, onUpdate, disabled,
}: {
  config: VideoEditorConfig; onUpdate: (p: Partial<VideoEditorConfig>) => void; disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
      <div style={{ ...MS_SECTION, color: C.inkFaint }}>Texto sobre el video</div>
      <Toggle
        label="Mostrar texto"
        active={config.textoActivo}
        disabled={disabled}
        onChange={v => onUpdate({ textoActivo: v })}
      />
      {config.textoActivo && (
        <TextField
          label="Texto del overlay"
          value={config.textoOverlay}
          disabled={disabled}
          placeholder="Ej: ¡Descuento especial!"
          maxLength={120}
          onChange={v => onUpdate({ textoOverlay: v })}
        />
      )}
    </div>
  );
}

// ── Marca panel ───────────────────────────────────────────────────────────────

type MarcaPosicion = "superior-izquierda" | "superior-derecha" | "inferior-izquierda" | "inferior-derecha";

function MarcaPanel({
  config, onUpdate, disabled,
}: {
  config: VideoEditorConfig; onUpdate: (p: Partial<VideoEditorConfig>) => void; disabled: boolean;
}) {
  const positions: { id: MarcaPosicion; label: string }[] = [
    { id: "superior-izquierda", label: "↖ Sup. izq." },
    { id: "superior-derecha",   label: "↗ Sup. der." },
    { id: "inferior-izquierda", label: "↙ Inf. izq." },
    { id: "inferior-derecha",   label: "↘ Inf. der." },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
      <div style={{ ...MS_SECTION, color: C.inkFaint }}>Marca de agua</div>
      <Toggle
        label="Mostrar marca"
        active={config.marcaActiva}
        disabled={disabled}
        onChange={v => onUpdate({ marcaActiva: v })}
      />
      {config.marcaActiva && (
        <>
          <div style={{ fontSize: T.sz["2xs"], color: C.inkLight }}>Posición</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[1] }}>
            {positions.map(p => {
              const sel = config.marcaPosicion === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => !disabled && onUpdate({ marcaPosicion: p.id })}
                  disabled={disabled}
                  style={{
                    padding: `${S[1]}px`,
                    background: sel ? `${ACCENT}0d` : C.surface,
                    border: `1px solid ${sel ? ACCENT : C.line}`,
                    borderRadius: R.sm,
                    fontSize: T.sz["2xs"],
                    color: sel ? ACCENT : C.inkMid,
                    cursor: disabled ? "not-allowed" : "pointer",
                    fontFamily: T.mono,
                    fontWeight: sel ? T.wt.semibold : T.wt.normal,
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Exportación panel ─────────────────────────────────────────────────────────

function ExportacionPanel({
  config, versionName, onVersionNameChange, disabled, edits, musicaTrackNombre,
}: {
  config:               VideoEditorConfig;
  versionName:          string;
  onVersionNameChange:  (v: string) => void;
  disabled:             boolean;
  edits:                number;
  musicaTrackNombre:    string | null;
}) {
  const destino = DESTINOS.find(d => d.id === config.destino) ?? DESTINOS[0];

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
      <div style={{ ...MS_SECTION, color: C.inkFaint }}>Configuración de exportación</div>

      <label style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
        <span style={{ fontSize: T.sz["2xs"], color: C.inkLight }}>Nombre de versión</span>
        <input
          type="text" value={versionName} disabled={disabled} maxLength={80}
          onChange={e => onVersionNameChange(e.target.value)}
          placeholder="Ej: Vestido Primavera v2-reels"
          style={{
            padding: `${S[1]}px ${S[2]}px`,
            border: `1px solid ${C.line}`,
            borderRadius: R.sm,
            fontSize: T.sz.sm,
            fontFamily: T.mono,
            color: C.inkMid,
            background: disabled ? C.surface : C.white,
            outline: "none",
          }}
        />
      </label>

      {/* Summary */}
      <div style={{ padding: S[3], background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.sm }}>
        <div style={{ ...MS_SECTION, color: C.inkFaint, marginBottom: S[2] }}>Resumen</div>
        <SummaryRow label="Destino"    value={destino.label} />
        <SummaryRow label="Formato"    value={destino.formato} />
        <SummaryRow label="Recorte"    value={config.recorteInicio > 0 || config.recorteFin !== null ? `${config.recorteInicio}s → ${config.recorteFin ?? "fin"}` : "Sin recorte"} />
        <SummaryRow label="Subtítulos" value={config.subtitulosActivos ? "Activos" : "No"} />
        <SummaryRow label="Música"     value={config.musicaActiva ? (musicaTrackNombre ?? "Activa") : "No"} />
        <SummaryRow label="Texto"      value={config.textoActivo && config.textoOverlay ? config.textoOverlay.slice(0, 24) : "No"} />
        <SummaryRow label="Marca"      value={config.marcaActiva ? config.marcaPosicion : "No"} />
      </div>

      {edits === 0 && !disabled && (
        <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint }}>
          Aplica al menos una edición antes de exportar.
        </div>
      )}
    </div>
  );
}

// ── Timeline track ─────────────────────────────────────────────────────────────

function TimelineTrack({
  label, color, filled, start, end, total,
}: {
  label:  string;
  color:  string;
  filled: boolean;
  start:  number;
  end:    number | null;
  total:  number | null;
}) {
  const startPct = total && total > 0 ? (start / total) * 100 : 0;
  const endPct   = total && total > 0 && end !== null ? (end   / total) * 100 : 100;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
      <span style={{
        fontSize: T.sz["2xs"], color: "rgba(255,255,255,.30)",
        fontFamily: T.mono, width: 60, flexShrink: 0,
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 6, background: "#1e1e1e", borderRadius: 3, overflow: "hidden", position: "relative" as const }}>
        {filled ? (
          <div style={{
            position: "absolute" as const,
            left: `${startPct}%`,
            width: `${endPct - startPct}%`,
            height: "100%",
            background: color,
            borderRadius: 3,
            opacity: 0.85,
          }} />
        ) : (
          <div style={{
            position: "absolute" as const, inset: 0,
            background: `repeating-linear-gradient(90deg, ${color}22 0px, ${color}22 4px, transparent 4px, transparent 8px)`,
            borderRadius: 3,
          }} />
        )}
      </div>
    </div>
  );
}

// ── Shared form primitives ─────────────────────────────────────────────────────

function Toggle({ label, active, onChange, disabled }: {
  label: string; active: boolean; onChange: (v: boolean) => void; disabled: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!active)}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: `${S[2]}px ${S[3]}px`,
        background: active ? `${ACCENT}0d` : C.surface,
        border: `1px solid ${active ? `${ACCENT}33` : C.line}`,
        borderRadius: R.md,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: T.mono,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{ fontSize: T.sz.sm, color: active ? ACCENT : C.inkMid, fontWeight: T.wt.semibold }}>
        {label}
      </span>
      <div style={{
        width: 32, height: 18,
        borderRadius: R.pill,
        background: active ? ACCENT : C.inkGhost,
        position: "relative" as const,
      }}>
        <div style={{
          position: "absolute" as const,
          top: 3, left: active ? 15 : 3,
          width: 12, height: 12,
          borderRadius: "50%",
          background: C.white,
          transition: "left .12s",
          boxShadow: "0 1px 2px rgba(0,0,0,.2)",
        }} />
      </div>
    </button>
  );
}

function TextField({ label, value, onChange, disabled, placeholder, maxLength }: {
  label: string; value: string; onChange: (v: string) => void;
  disabled: boolean; placeholder?: string; maxLength?: number;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
      <span style={{ fontSize: T.sz["2xs"], color: C.inkLight }}>{label}</span>
      <input
        type="text" value={value} disabled={disabled}
        placeholder={placeholder} maxLength={maxLength}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: `${S[1]}px ${S[2]}px`,
          border: `1px solid ${C.line}`,
          borderRadius: R.sm,
          fontSize: T.sz.sm,
          fontFamily: T.mono,
          color: C.inkMid,
          background: disabled ? C.surface : C.white,
          outline: "none",
        }}
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange, disabled, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  disabled: boolean; placeholder?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
      <span style={{ fontSize: T.sz["2xs"], color: C.inkLight }}>{label}</span>
      <textarea
        rows={4} value={value} disabled={disabled} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: `${S[2]}px ${S[3]}px`,
          border: `1px solid ${C.line}`,
          borderRadius: R.sm,
          fontSize: T.sz.sm,
          fontFamily: T.mono,
          color: C.inkMid,
          background: disabled ? C.surface : C.white,
          outline: "none",
          resize: "vertical" as const,
        }}
      />
    </label>
  );
}

function NumericField({ label, value, min, onChange, disabled }: {
  label: string; value: number; min: number; onChange: (v: number) => void; disabled: boolean;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
      <span style={{ fontSize: T.sz["2xs"], color: C.inkLight }}>{label}</span>
      <input
        type="number" value={value} min={min} step={1} disabled={disabled}
        onChange={e => onChange(Math.max(min, Number(e.target.value)))}
        style={{
          padding: `${S[1]}px ${S[2]}px`,
          border: `1px solid ${C.line}`,
          borderRadius: R.sm,
          fontSize: T.sz.sm,
          fontFamily: T.mono,
          color: C.inkMid,
          background: disabled ? C.surface : C.white,
          outline: "none",
        }}
      />
    </label>
  );
}

function NumericFieldNullable({ label, value, min, onChange, disabled, placeholder }: {
  label: string; value: number | null; min: number; onChange: (v: number | null) => void;
  disabled: boolean; placeholder?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
      <span style={{ fontSize: T.sz["2xs"], color: C.inkLight }}>{label}</span>
      <input
        type="number" value={value ?? ""} min={min} step={1} disabled={disabled}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
        style={{
          padding: `${S[1]}px ${S[2]}px`,
          border: `1px solid ${C.line}`,
          borderRadius: R.sm,
          fontSize: T.sz.sm,
          fontFamily: T.mono,
          color: C.inkMid,
          background: disabled ? C.surface : C.white,
          outline: "none",
        }}
      />
    </label>
  );
}

function GhostBtn({ label, onClick, disabled }: {
  label: string; onClick: () => void; disabled: boolean;
}) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        padding: `${S[1]}px ${S[2]}px`,
        background: "transparent",
        border: `1px solid ${C.line}`,
        borderRadius: R.sm,
        fontSize: T.sz["2xs"],
        color: C.inkLight,
        cursor: "pointer",
        fontFamily: T.mono,
      }}
    >
      {label}
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
      <span style={{ fontSize: T.sz["2xs"], color: C.inkFaint, minWidth: 70 }}>{label}</span>
      <span style={{
        fontSize: T.sz["2xs"], color: C.inkMid,
        flex: 1, textAlign: "right" as const,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
      }}>
        {value}
      </span>
    </div>
  );
}

// ── DraftListPanel ────────────────────────────────────────────────────────────

function DraftListPanel({
  drafts,
  loading,
  currentDraftId,
  onOpen,
  onDiscard,
  onClose,
}: {
  drafts:         VideoDraft[];
  loading:        boolean;
  currentDraftId: string | null;
  onOpen:         (d: VideoDraft) => void;
  onDiscard:      (d: VideoDraft) => void;
  onClose:        () => void;
}) {
  return (
    <div style={{
      position: "fixed" as const, inset: 0,
      background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: C.white,
        borderRadius: R.lg,
        boxShadow: E.lg,
        width: 480, maxWidth: "92vw",
        maxHeight: "80vh",
        display: "flex", flexDirection: "column" as const,
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: `${S[4]}px ${S[5]}px`,
          borderBottom: `1px solid ${C.line}`,
        }}>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
              Mis borradores
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
              Trabajos guardados sin exportar a Biblioteca
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.inkLight, padding: 4 }}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" as const, padding: `${S[3]}px ${S[4]}px` }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: S[2], padding: `${S[4]}px 0`, justifyContent: "center" }}>
              <Loader2 size={16} color={C.inkFaint} />
              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint }}>Cargando borradores…</span>
            </div>
          ) : drafts.length === 0 ? (
            <div style={{
              textAlign: "center" as const, padding: `${S[8]}px 0`,
              fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint,
            }}>
              No hay borradores guardados.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
              {drafts.map(draft => {
                const isCurrent = draft.id === currentDraftId;
                const date      = new Date(draft.updatedAt);
                const dateStr   = date.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
                const timeStr   = date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
                return (
                  <div key={draft.id} style={{
                    display: "flex", alignItems: "center", gap: S[3],
                    padding: `${S[3]}px ${S[4]}px`,
                    border: `1px solid ${isCurrent ? C.blueBorder : C.line}`,
                    borderRadius: R.md,
                    background: isCurrent ? `${C.blueDark}08` : C.surface,
                  }}>
                    <Film size={18} color={isCurrent ? C.blueDark : C.inkLight} strokeWidth={1.5} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: T.wt.medium,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                      }}>
                        {draft.nombre}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 }}>
                        {dateStr} · {timeStr}
                        {draft.referenceName && ` · ${draft.referenceName}`}
                        {isCurrent && (
                          <span style={{ marginLeft: S[2], color: C.blueDark, fontWeight: T.wt.semibold }}>activo</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: S[2], flexShrink: 0 }}>
                      {!isCurrent && (
                        <button
                          onClick={() => onOpen(draft)}
                          style={{
                            padding: `${S[1]}px ${S[3]}px`,
                            background: C.blueDark, color: C.white,
                            border: "none", borderRadius: R.sm,
                            fontFamily: T.mono, fontSize: T.sz["2xs"],
                            fontWeight: T.wt.semibold, cursor: "pointer",
                          }}
                        >
                          Abrir
                        </button>
                      )}
                      <button
                        onClick={() => onDiscard(draft)}
                        style={{
                          padding: `${S[1]}px ${S[3]}px`,
                          background: "transparent",
                          border: `1px solid ${C.line}`,
                          borderRadius: R.sm,
                          fontFamily: T.mono, fontSize: T.sz["2xs"],
                          color: C.inkLight, cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 4,
                        }}
                      >
                        <Trash2 size={11} strokeWidth={1.8} />
                        Descartar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function secondsToHHMM(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
