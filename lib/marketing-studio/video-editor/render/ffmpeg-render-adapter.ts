/**
 * lib/marketing-studio/video-editor/render/ffmpeg-render-adapter.ts
 *
 * MARKETING-VIDEO-RENDER-WORKER-01 — FFmpeg Render Adapter
 *
 * Builds and executes FFmpeg commands for V1 video render.
 * Server-only — uses Node.js child_process, os, fs.
 *
 * V1 SCOPE:
 *   - Download source video from URL → /tmp
 *   - Apply trim (recorteInicio / recorteFin) if present
 *   - Output MP4 H.264 + AAC, faststart for web streaming
 *   - Return local output path for storage upload
 *
 * NOT IN V1:
 *   - Subtitles, music, text overlay, logo, watermark
 *   - Crop/pad for format change (aspect ratio preserved, format recorded)
 *   - Multiple simultaneous formats
 *   - AI transcription
 *
 * PRODUCTION SETUP:
 *   FFmpeg must be available in the execution environment.
 *   Options:
 *     a) Vercel: add `ffmpeg` via nix in build step or use a Lambda layer
 *     b) Docker: include `apt-get install -y ffmpeg` in Dockerfile
 *     c) npm:    `npm i @ffmpeg.wasm/core` for WASM fallback (slower, no child_process)
 *
 * ENVIRONMENT VARIABLE (optional):
 *   FFMPEG_PATH — override path to ffmpeg binary (default: "ffmpeg" from PATH)
 */

import os   from "os";
import path  from "path";
import fs    from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import type { VideoSubtitleSegment } from "../subtitles/video-subtitle-types";

const execFileAsync = promisify(execFile);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FFmpegRenderInput {
  /** URL of the source video (must be publicly accessible or a signed URL). */
  sourceUrl:              string;
  /** Trim start in seconds (0 = from beginning). */
  recorteInicio:          number;
  /** Trim end in seconds (null = until end). */
  recorteFin:             number | null;
  /** Unique ID used to name temp files (executionId or similar). */
  jobId:                  string;
  /** Subtitle segments to burn into the video (null = no subtitles). */
  subtitleSegments?:      VideoSubtitleSegment[] | null;
  /** Public URL of the music track to mix (null = no music). */
  musicTrackUrl?:         string | null;
  /** Music track volume 0–100 (default 80). */
  musicVolume?:           number;
  /** Original video audio volume 0–100 (default 100). */
  originalAudioVolume?:   number;
  /** Fade-in seconds for music (0 = no fade). */
  musicFadeIn?:           number;
  /** Fade-out seconds for music (0 = no fade). */
  musicFadeOut?:          number;
}

export interface FFmpegRenderOutput {
  /** Absolute path to the rendered MP4 in /tmp. Delete after upload. */
  outputPath: string;
  /** Duration of the rendered video in seconds (from FFmpeg probe). */
  duration:   number | null;
  /** File size in bytes. */
  fileSize:   number;
}

// ── FFmpeg path ───────────────────────────────────────────────────────────────

function ffmpegBin(): string {
  return process.env.FFMPEG_PATH ?? "ffmpeg";
}

// ── Availability check ────────────────────────────────────────────────────────

let _ffmpegAvailable: boolean | null = null;

/**
 * Returns true if the ffmpeg binary is reachable.
 * Result is cached for the process lifetime.
 */
export async function isFfmpegAvailable(): Promise<boolean> {
  if (_ffmpegAvailable !== null) return _ffmpegAvailable;

  try {
    await execFileAsync(ffmpegBin(), ["-version"], { timeout: 5_000 });
    _ffmpegAvailable = true;
  } catch {
    _ffmpegAvailable = false;
  }
  return _ffmpegAvailable;
}

// ── Source video download ─────────────────────────────────────────────────────

/**
 * Downloads a video URL to a temp file in /tmp.
 * Returns the absolute path to the downloaded file.
 */
async function downloadVideoToTmp(url: string, jobId: string): Promise<string> {
  const safeId   = jobId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
  const inputPath = path.join(os.tmpdir(), `agentik_render_in_${safeId}.mp4`);

  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    throw new Error(`No pudimos descargar el video original (${response.status}).`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer      = Buffer.from(arrayBuffer);

  if (buffer.byteLength === 0) {
    throw new Error("El video original está vacío.");
  }

  const maxBytes = Number(process.env.RENDER_MAX_SOURCE_MB ?? "500") * 1024 * 1024;
  if (buffer.byteLength > maxBytes) {
    throw new Error(
      `El video original es demasiado grande para procesar (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB).`,
    );
  }

  fs.writeFileSync(inputPath, buffer);
  return inputPath;
}

// ── SRT generation ────────────────────────────────────────────────────────────

/**
 * Converts seconds to SRT timestamp format: HH:MM:SS,mmm
 */
function secondsToSrt(s: number): string {
  const ms  = Math.round((s % 1) * 1000);
  const sec = Math.floor(s) % 60;
  const min = Math.floor(s / 60) % 60;
  const hr  = Math.floor(s / 3600);
  return [
    String(hr).padStart(2, "0"),
    String(min).padStart(2, "0"),
    String(sec).padStart(2, "0"),
  ].join(":") + "," + String(ms).padStart(3, "0");
}

/**
 * Writes subtitle segments as an SRT file to /tmp.
 * Returns the absolute path to the SRT file.
 * Returns null if segments is empty or null.
 */
function writeSrtFile(
  segments: VideoSubtitleSegment[] | null | undefined,
  jobId:    string,
): string | null {
  if (!segments?.length) return null;

  const safeId  = jobId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
  const srtPath = path.join(os.tmpdir(), `agentik_srt_${safeId}.srt`);

  const content = segments
    .filter(s => s.text.trim().length > 0 && s.end > s.start)
    .map((seg, i) => [
      String(i + 1),
      `${secondsToSrt(seg.start)} --> ${secondsToSrt(seg.end)}`,
      seg.text.trim(),
      "",
    ].join("\n"))
    .join("\n");

  if (!content.trim()) return null;

  fs.writeFileSync(srtPath, content, "utf-8");
  return srtPath;
}

// ── Music track download ──────────────────────────────────────────────────────

/**
 * Downloads a music track URL to a temp file in /tmp.
 * Returns the absolute path to the downloaded file.
 */
async function downloadMusicToTmp(url: string, jobId: string): Promise<string> {
  const safeId    = jobId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
  const musicPath = path.join(os.tmpdir(), `agentik_music_in_${safeId}.mp3`);

  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`No pudimos descargar la pista de música (${response.status}).`);
  }
  const ab = await response.arrayBuffer();
  if (ab.byteLength === 0) throw new Error("La pista de música está vacía.");

  fs.writeFileSync(musicPath, Buffer.from(ab));
  return musicPath;
}

// ── FFmpeg command ────────────────────────────────────────────────────────────

/**
 * Subtitle style string for the subtitles= filter.
 */
function buildSubtitleStyle(): string {
  return [
    "FontSize=20",
    "PrimaryColour=&H00FFFFFF",   // white text
    "OutlineColour=&H80000000",   // semi-transparent black outline
    "BackColour=&H80000000",      // semi-transparent black background
    "Outline=2",
    "Shadow=0",
    "MarginV=30",                 // bottom safe zone
    "Alignment=2",                // bottom-center
  ].join(",");
}

/**
 * Builds the FFmpeg argument list for the render pipeline.
 *
 * Handles four cases:
 *   A) No subtitles, no music  → simple re-encode
 *   B) Subtitles only          → -vf subtitles= filter
 *   C) Music only              → filter_complex audio mix
 *   D) Subtitles + music       → filter_complex with video + audio graphs
 *
 * Trim:  -ss before -i (fast keyframe seek) + -t for duration.
 * Video: H.264 libx264, CRF 23, fast preset, faststart.
 * Audio: AAC 128k.
 */
function buildFfmpegArgs(params: {
  inputPath:           string;
  outputPath:          string;
  recorteInicio:       number;
  recorteFin:          number | null;
  srtPath:             string | null;
  musicPath:           string | null;
  musicVolume:         number;         // 0–100
  originalAudioVolume: number;         // 0–100
  musicFadeIn:         number;         // seconds
  musicFadeOut:        number;         // seconds
  videoDuration:       number | null;  // probed duration for fade-out calc
}): string[] {
  const {
    inputPath, outputPath, recorteInicio, recorteFin,
    srtPath, musicPath,
    musicVolume, originalAudioVolume,
    musicFadeIn, musicFadeOut, videoDuration,
  } = params;

  const hasSubtitles = !!srtPath;
  const hasMusic     = !!musicPath;

  const args: string[] = [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
  ];

  // ── Inputs ─────────────────────────────────────────────────────────────────

  // Fast seek before first input
  if (recorteInicio > 0) args.push("-ss", String(recorteInicio));
  args.push("-i", inputPath);

  // Trim duration
  if (recorteFin !== null) {
    const dur = recorteFin - recorteInicio;
    if (dur > 0) args.push("-t", String(dur));
  }

  // Music as second input (no seek — always use from beginning)
  if (hasMusic) {
    args.push("-i", musicPath!);
  }

  // ── Filter graph ───────────────────────────────────────────────────────────

  if (!hasSubtitles && !hasMusic) {
    // Case A: simple re-encode
    args.push(
      "-c:v", "libx264", "-preset", "fast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k",
    );

  } else if (hasSubtitles && !hasMusic) {
    // Case B: subtitle burn-in only
    const esc   = srtPath!.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "'\\''");
    const style = buildSubtitleStyle();
    args.push(
      "-vf", `subtitles='${esc}':force_style='${style}'`,
      "-c:v", "libx264", "-preset", "fast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k",
    );

  } else if (!hasSubtitles && hasMusic) {
    // Case C: audio mix only (no subtitle)
    const musicVol = (musicVolume / 100).toFixed(3);
    const origVol  = (originalAudioVolume / 100).toFixed(3);

    const audioParts: string[] = [];

    // Original audio chain
    audioParts.push(`[0:a]volume=${origVol}[oa]`);

    // Music chain: volume + optional fades
    let musicChain = `[1:a]volume=${musicVol}`;
    if (musicFadeIn > 0) {
      musicChain += `,afade=t=in:st=0:d=${musicFadeIn}`;
    }
    if (musicFadeOut > 0 && videoDuration !== null) {
      const fadeStart = Math.max(0, videoDuration - musicFadeOut);
      musicChain += `,afade=t=out:st=${fadeStart.toFixed(3)}:d=${musicFadeOut}`;
    }
    audioParts.push(`${musicChain}[ma]`);

    // Mix: use video duration, gentle dropout
    audioParts.push("[oa][ma]amix=inputs=2:duration=first:dropout_transition=2[outa]");

    args.push(
      "-filter_complex", audioParts.join(";"),
      "-map", "0:v",
      "-map", "[outa]",
      "-c:v", "libx264", "-preset", "fast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k",
    );

  } else {
    // Case D: subtitles + music — full filter_complex
    const esc   = srtPath!.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "'\\''");
    const style = buildSubtitleStyle();
    const musicVol = (musicVolume / 100).toFixed(3);
    const origVol  = (originalAudioVolume / 100).toFixed(3);

    const graphParts: string[] = [];

    // Video: subtitle burn-in
    graphParts.push(`[0:v]subtitles='${esc}':force_style='${style}'[outv]`);

    // Audio: original
    graphParts.push(`[0:a]volume=${origVol}[oa]`);

    // Audio: music
    let musicChain = `[1:a]volume=${musicVol}`;
    if (musicFadeIn > 0) {
      musicChain += `,afade=t=in:st=0:d=${musicFadeIn}`;
    }
    if (musicFadeOut > 0 && videoDuration !== null) {
      const fadeStart = Math.max(0, videoDuration - musicFadeOut);
      musicChain += `,afade=t=out:st=${fadeStart.toFixed(3)}:d=${musicFadeOut}`;
    }
    graphParts.push(`${musicChain}[ma]`);

    // Mix
    graphParts.push("[oa][ma]amix=inputs=2:duration=first:dropout_transition=2[outa]");

    args.push(
      "-filter_complex", graphParts.join(";"),
      "-map", "[outv]",
      "-map", "[outa]",
      "-c:v", "libx264", "-preset", "fast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k",
    );
  }

  args.push("-movflags", "+faststart", outputPath);
  return args;
}

// ── Probe duration ────────────────────────────────────────────────────────────

/**
 * Attempts to read the video duration from the output file using ffprobe.
 * Returns null if ffprobe is unavailable or duration cannot be read.
 */
async function probeDuration(filePath: string): Promise<number | null> {
  try {
    const ffprobeBin = process.env.FFPROBE_PATH ?? "ffprobe";
    const { stdout } = await execFileAsync(ffprobeBin, [
      "-v", "quiet",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      filePath,
    ], { timeout: 10_000 });

    const parsed = parseFloat(stdout.trim());
    return isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

// ── Main render ───────────────────────────────────────────────────────────────

/**
 * Executes a full V1 render pipeline:
 *   1. Validate FFmpeg is available.
 *   2. Download source video to /tmp.
 *   3. Build and run FFmpeg command.
 *   4. Return output path + metadata.
 *
 * The caller is responsible for:
 *   - Uploading the output file to permanent storage.
 *   - Deleting temp files after upload (cleanupRenderTempFiles).
 *
 * @throws Error with user-facing Spanish message on any failure.
 */
export async function renderVideoWithFfmpeg(
  input: FFmpegRenderInput,
): Promise<FFmpegRenderOutput> {
  // 1. Check availability
  const available = await isFfmpegAvailable();
  if (!available) {
    throw new Error(
      "No pudimos procesar el video en este entorno. " +
      "Contacta al equipo de Agentik para activar el render de video.",
    );
  }

  const safeId     = input.jobId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
  const outputPath = path.join(os.tmpdir(), `agentik_render_out_${safeId}.mp4`);
  let inputPath:  string | null = null;
  let srtPath:    string | null = null;
  let musicPath:  string | null = null;

  try {
    // 2. Download source video
    console.log(`[render] Downloading source video for job ${input.jobId}`);
    inputPath = await downloadVideoToTmp(input.sourceUrl, input.jobId);
    console.log(`[render] Source downloaded: ${inputPath} (${fs.statSync(inputPath).size} bytes)`);

    // Probe source duration (needed for music fade-out calculation)
    const sourceDuration = await probeDuration(inputPath);

    // 2b. Write SRT file if subtitle segments provided
    if (input.subtitleSegments?.length) {
      srtPath = writeSrtFile(input.subtitleSegments, input.jobId);
      if (srtPath) {
        console.log(`[render] SRT written: ${srtPath} (${input.subtitleSegments.length} segments)`);
      }
    }

    // 2c. Download music track if requested
    if (input.musicTrackUrl) {
      console.log(`[render] Downloading music track for job ${input.jobId}`);
      musicPath = await downloadMusicToTmp(input.musicTrackUrl, input.jobId);
      console.log(`[render] Music downloaded: ${musicPath} (${fs.statSync(musicPath).size} bytes)`);
    }

    // 3. Build and run FFmpeg
    const args = buildFfmpegArgs({
      inputPath,
      outputPath,
      recorteInicio:       input.recorteInicio,
      recorteFin:          input.recorteFin,
      srtPath,
      musicPath,
      musicVolume:         input.musicVolume         ?? 80,
      originalAudioVolume: input.originalAudioVolume ?? 100,
      musicFadeIn:         input.musicFadeIn         ?? 0,
      musicFadeOut:        input.musicFadeOut        ?? 0,
      videoDuration:       sourceDuration,
    });
    console.log(`[render] Running: ${ffmpegBin()} ${args.slice(0, 6).join(" ")} ...`);

    await execFileAsync(ffmpegBin(), args, {
      timeout:    Number(process.env.RENDER_TIMEOUT_MS ?? String(4 * 60 * 1000)), // 4 min
      maxBuffer:  10 * 1024 * 1024, // 10 MB for stderr
    });

    // 4. Verify output
    if (!fs.existsSync(outputPath)) {
      throw new Error("FFmpeg no generó un archivo de salida.");
    }
    const stat = fs.statSync(outputPath);
    if (stat.size === 0) {
      throw new Error("El archivo de salida está vacío — el render falló silenciosamente.");
    }

    const duration = await probeDuration(outputPath);
    console.log(`[render] Render completed: ${outputPath} (${stat.size} bytes, ${duration ?? "?"}s)`);

    return { outputPath, duration, fileSize: stat.size };

  } catch (err) {
    // Clean up output if it exists
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch { /* ignore */ }

    const raw = err instanceof Error ? err.message : String(err);

    // Re-throw user-facing messages as-is; wrap technical errors
    if (raw.startsWith("No pudimos") || raw.startsWith("El video") || raw.startsWith("El archivo") || raw.startsWith("La pista")) {
      throw err;
    }

    // FFmpeg not found
    if (raw.includes("ENOENT") || raw.includes("not found") || raw.includes("command not found")) {
      throw new Error(
        "No pudimos procesar el video en este entorno. " +
        "Contacta al equipo de Agentik para activar el render de video.",
      );
    }

    console.error(`[render] FFmpeg error for job ${input.jobId}:`, raw.slice(0, 500));
    throw new Error("No pudimos procesar el video. Intenta de nuevo o contacta soporte.");
  } finally {
    // Always delete temp files
    if (inputPath) {
      try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    }
    if (srtPath) {
      try { if (fs.existsSync(srtPath)) fs.unlinkSync(srtPath); } catch { /* ignore */ }
    }
    if (musicPath) {
      try { if (fs.existsSync(musicPath)) fs.unlinkSync(musicPath); } catch { /* ignore */ }
    }
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

/**
 * Deletes the rendered output temp file after it has been uploaded to storage.
 * Safe to call multiple times — does not throw if file is already gone.
 */
export function cleanupRenderTempFile(outputPath: string): void {
  try {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  } catch {
    /* non-fatal — OS will reclaim /tmp eventually */
  }
}
