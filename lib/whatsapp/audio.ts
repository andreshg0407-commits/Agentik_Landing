/**
 * lib/whatsapp/audio.ts
 *
 * Voice-note transcription contract for the Agentik WhatsApp module.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  CURRENT STATE: STUB — audio is NOT transcribed.                    ║
 * ║                                                                      ║
 * ║  The function returns null (= no transcript available).             ║
 * ║  The webhook pipeline gracefully falls back to intent SUPPORT        ║
 * ║  when null is returned, preserving the existing behaviour.          ║
 * ║                                                                      ║
 * ║  Enabling real transcription requires:                              ║
 * ║   1. A provider token in env vars (see commented block below)       ║
 * ║   2. Un-commenting the fetch → transcription call for your provider ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Provider contract:
 *   transcribeIncomingAudio() is the ONLY public surface.
 *   Internal provider implementations are swappable without touching callers.
 *   All providers must target SPANISH ("es") as the primary language
 *   (Colombia market); extend with per-org language config in a future sprint.
 *
 * How the webhook uses this:
 *   1. normalizeMetaWebhook returns messageType="audio", content="[audio]",
 *      and raw payload contains the Meta media object ID.
 *   2. The webhook extracts mediaId from raw, calls transcribeIncomingAudio.
 *   3. If a transcript is returned, it replaces "[audio]" as the text
 *      used for intent classification AND reply generation.
 *   4. The WhatsAppMessage.content stored in DB is the transcript (if available)
 *      or "[audio]" (if stub/error), so conversation history is readable.
 *   5. The original raw payload preserves the mediaId for future re-transcription.
 */

// ── Result type ───────────────────────────────────────────────────────────────

export interface AudioTranscriptionResult {
  /** Transcribed plain text. May be empty string if audio was silent. */
  transcript: string;
  /** Identifier of the provider that produced this transcript. */
  provider:   string;
  /**
   * Provider confidence [0–1] if available, null otherwise.
   * Can be used for future routing decisions (e.g. re-attempt if < 0.5).
   */
  confidence: number | null;
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Attempts to transcribe an incoming WhatsApp audio/voice-note.
 *
 * @param mediaId  Meta media object ID (from audio.id in the webhook payload).
 *                 Use GET /v19.0/{mediaId} with META_GRAPH_API_TOKEN to download.
 * @param orgId    Organization ID — reserved for future per-org provider routing.
 * @returns        Transcription result, or null if no provider is configured
 *                 or an error occurred. Null is never propagated as an error —
 *                 callers must handle it as "transcript unavailable".
 */
export async function transcribeIncomingAudio(
  mediaId: string,
  orgId:   string,
): Promise<AudioTranscriptionResult | null> {
  // ── NOT YET LIVE ─────────────────────────────────────────────────────────
  //
  // Step 1 — Download the audio file from Meta:
  //
  //   const token = process.env.META_GRAPH_API_TOKEN;
  //   if (!token) return null;
  //
  //   const metaRes  = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`,
  //     { headers: { Authorization: `Bearer ${token}` } });
  //   const { url }  = await metaRes.json();
  //   const audioRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  //   const buffer   = Buffer.from(await audioRes.arrayBuffer());
  //
  // Step 2a — OpenAI Whisper:
  //
  //   import OpenAI, { toFile } from "openai";
  //   const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  //   const file   = await toFile(buffer, "voice.ogg", { type: "audio/ogg; codecs=opus" });
  //   const result = await openai.audio.transcriptions.create({
  //     model: "whisper-1", file, language: "es",
  //   });
  //   return { transcript: result.text, provider: "openai_whisper", confidence: null };
  //
  // Step 2b — AssemblyAI (alternative):
  //
  //   const aaiToken = process.env.ASSEMBLYAI_API_KEY;
  //   if (!aaiToken) return null;
  //   // POST buffer to https://api.assemblyai.com/v2/upload, then POST transcript job
  //   // with language_code: "es", poll until status === "completed".
  //   // return { transcript: result.text, provider: "assemblyai", confidence: result.confidence };
  //
  // Step 2c — Google Cloud Speech-to-Text:
  //
  //   // Use @google-cloud/speech, set languageCode: "es-CO" for Colombia.
  //   // return { transcript: result.results[0].alternatives[0].transcript,
  //   //          provider: "google_stt",
  //   //          confidence: result.results[0].alternatives[0].confidence };
  //
  // ─────────────────────────────────────────────────────────────────────────

  // Suppress unused-parameter warnings until a provider is wired.
  void mediaId;
  void orgId;

  return null; // STUB: no transcription provider configured
}

// ── Helper: extract Meta media ID from raw webhook payload ───────────────────

/**
 * Extracts the Meta audio media object ID from the raw webhook change entry.
 *
 * The raw field on NormalizedIncomingMessage is the entire MetaChange object:
 *   { field: "messages", value: { messages: [{ audio: { id: "..." }, ... }] } }
 *
 * Returns null if the payload does not contain an audio ID (i.e., not an audio
 * message, or payload structure differs from expected).
 */
export function extractAudioMediaId(raw: unknown): string | null {
  try {
    const change = raw as {
      value?: { messages?: Array<{ audio?: { id?: string } }> };
    };
    return change?.value?.messages?.[0]?.audio?.id ?? null;
  } catch {
    return null;
  }
}
