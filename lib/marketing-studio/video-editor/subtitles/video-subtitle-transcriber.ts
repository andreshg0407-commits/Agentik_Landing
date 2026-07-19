/**
 * lib/marketing-studio/video-editor/subtitles/video-subtitle-transcriber.ts
 *
 * MARKETING-VIDEO-SUBTITLES-01 — Transcription Adapter
 *
 * Wraps the OpenAI Whisper API to transcribe a video URL into subtitle segments.
 *
 * ENVIRONMENT:
 *   OPENAI_API_KEY — required for real transcription.
 *   If not set, returns a controlled failure with a user-facing Spanish message.
 *
 * V1 SCOPE:
 *   - Downloads source video to /tmp.
 *   - Calls Whisper audio transcription with word-level timestamps.
 *   - Converts Whisper segments to VideoSubtitleSegment[].
 *   - Returns null segments on any failure (caller handles fail state).
 *
 * NOT IN V1:
 *   - Speaker diarization.
 *   - Translation (only transcription in the original language).
 *   - Multiple speakers.
 *
 * Server-only — never import from client components.
 */

import "server-only";

import os   from "os";
import path from "path";
import fs   from "fs";
import type { VideoSubtitleSegment } from "./video-subtitle-types";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TranscriptionInput {
  videoUrl:  string;
  language:  string;
  jobId:     string;
}

export interface TranscriptionOutput {
  segments: VideoSubtitleSegment[];
}

// ── Whisper response shape (subset) ────────────────────────────────────────────

interface WhisperSegment {
  start: number;
  end:   number;
  text:  string;
  // avg_logprob present but optional in some model versions
  avg_logprob?: number;
}

interface WhisperVerboseResponse {
  segments: WhisperSegment[];
}

// ── Availability check ─────────────────────────────────────────────────────────

export function isTranscriptionAvailable(): boolean {
  return !!(process.env.OPENAI_API_KEY);
}

// ── Main transcription ─────────────────────────────────────────────────────────

/**
 * Transcribes a video URL into subtitle segments via Whisper.
 *
 * Returns segments on success.
 * Throws a user-facing Spanish error on any failure — caller must catch.
 *
 * @throws Error with LATAM Spanish message
 */
export async function transcribeVideo(
  input: TranscriptionInput,
): Promise<TranscriptionOutput> {
  if (!isTranscriptionAvailable()) {
    throw new Error(
      "No pudimos generar subtítulos en este entorno. " +
      "Contacta al equipo de Agentik para activar esta función.",
    );
  }

  const safeId    = input.jobId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
  const videoPath = path.join(os.tmpdir(), `agentik_sub_${safeId}.mp4`);

  try {
    // ── 1. Download video ────────────────────────────────────────────────────
    const res = await fetch(input.videoUrl, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) {
      throw new Error(`No pudimos descargar el video para transcribir (${res.status}).`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0) {
      throw new Error("El video está vacío — no se puede transcribir.");
    }

    const maxBytes = Number(process.env.RENDER_MAX_SOURCE_MB ?? "500") * 1024 * 1024;
    if (buf.byteLength > maxBytes) {
      throw new Error(
        `El video es demasiado grande para generar subtítulos ` +
        `(${(buf.byteLength / 1024 / 1024).toFixed(0)} MB).`,
      );
    }

    fs.writeFileSync(videoPath, buf);

    // ── 2. Send to Whisper ────────────────────────────────────────────────────
    const formData = new FormData();
    formData.append("file", new Blob([fs.readFileSync(videoPath)], { type: "video/mp4" }), "video.mp4");
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("language", input.language === "auto" ? "" : input.language);
    formData.append("timestamp_granularities[]", "segment");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method:  "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body:    formData,
      signal:  AbortSignal.timeout(Number(process.env.SUBTITLE_TIMEOUT_MS ?? String(3 * 60 * 1000))),
    });

    if (!whisperRes.ok) {
      const errBody = await whisperRes.text().catch(() => "");
      console.error(`[subtitle-transcriber] Whisper error ${whisperRes.status}: ${errBody.slice(0, 200)}`);
      throw new Error("No pudimos generar subtítulos. Intenta de nuevo o contacta soporte.");
    }

    const data = await whisperRes.json() as WhisperVerboseResponse;

    if (!data.segments?.length) {
      // Empty transcription — video may have no speech
      return { segments: [] };
    }

    // ── 3. Map to domain segments ─────────────────────────────────────────────
    const segments: VideoSubtitleSegment[] = data.segments.map(seg => ({
      start:      Math.max(0, Number(seg.start.toFixed(2))),
      end:        Math.max(0, Number(seg.end.toFixed(2))),
      text:       seg.text.trim(),
      confidence: typeof seg.avg_logprob === "number"
        // avg_logprob is negative (0 = perfect). Convert to 0–1 range.
        ? Math.max(0, Math.min(1, Math.exp(seg.avg_logprob)))
        : null,
      edited: false,
    })).filter(s => s.text.length > 0 && s.end > s.start);

    return { segments };

  } finally {
    // Always clean up temp video file
    try { if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath); } catch { /* ignore */ }
  }
}
