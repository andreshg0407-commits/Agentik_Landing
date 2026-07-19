/**
 * lib/marketing-studio/social/adapters/tiktok-adapter.ts
 *
 * MS-16 — Social Publishing Execution Engine: TikTok adapter
 *
 * Mock execution layer. Typed, realistic payloads, success/failure paths.
 * Future: integrate TikTok Content Publishing API + OAuth.
 *
 * SERVER ONLY.
 */

import { SOCIAL_FAILURE_TYPE, type SocialExecutionResult, type SocialChannel } from "../social-types";
import { classifyPublicationFailure } from "../social-retries";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TikTokPublishInput {
  organizationId:  string;
  publicationId:   string;
  assetUrl:        string;
  caption:         string;
  accessToken:     string;  // never logged
  hashtags?:       string[];
  soundId?:        string;
  privacy?:        "public_to_everyone" | "mutual_follow_friends" | "self_only";
  scheduledAt?:    string;
}

export interface TikTokPublishResult {
  success:       boolean;
  postId:        string | null;
  postUrl:       string | null;
  errorCode:     string | null;
  errorMessage:  string | null;
  uploadId:      string | null;
  videoDuration: number | null;  // seconds
}

// ── Validation ─────────────────────────────────────────────────────────────────

export function validateTikTokPayload(input: TikTokPublishInput): string[] {
  const errors: string[] = [];

  if (!input.assetUrl)          errors.push("URL del video requerida");
  if (!input.caption)           errors.push("Caption requerido");
  if (input.caption && input.caption.length > 2200) errors.push("Caption excede 2200 caracteres");
  if (!input.accessToken)       errors.push("Access token no configurado");

  // TikTok requires 9:16 vertical video
  // (ratio validated upstream from asset metadata)

  return errors;
}

// ── Mock executor ──────────────────────────────────────────────────────────────

export async function publishToTikTok(
  input: TikTokPublishInput,
): Promise<SocialExecutionResult> {
  const startAt = Date.now();

  // Simulate upload + processing delay
  await simulateDelay(800, 2200);

  // Simulate ~90% success rate in mock
  const shouldFail = isMockFailure(input.publicationId, 0.10);

  if (shouldFail) {
    const errorType    = pickMockError(["rate_limit", "network_failure", "timeout"]);
    const durationMs   = Date.now() - startAt;
    return {
      publicationId:  input.publicationId,
      channel:        "tiktok" as SocialChannel,
      success:        false,
      platformPostId: null,
      platformUrl:    null,
      errorType:      classifyPublicationFailure(errorType),
      errorMessage:   `TikTok API error: ${errorType}`,
      durationMs,
      executedAt:     new Date().toISOString(),
    };
  }

  const mockPostId = `tiktok_${input.publicationId.slice(0, 8)}_${Date.now()}`;
  const durationMs = Date.now() - startAt;

  return {
    publicationId:  input.publicationId,
    channel:        "tiktok" as SocialChannel,
    success:        true,
    platformPostId: mockPostId,
    platformUrl:    `https://www.tiktok.com/@account/video/${mockPostId}`,
    errorType:      null,
    errorMessage:   null,
    durationMs,
    executedAt:     new Date().toISOString(),
  };
}

// ── Future OAuth stub ──────────────────────────────────────────────────────────

export async function refreshTikTokToken(
  _refreshToken: string,
): Promise<{ accessToken: string; expiresAt: string } | null> {
  // Placeholder — implement with TikTok OAuth 2.0 when credentials available
  return null;
}

export async function getTikTokAccountMetrics(
  _accessToken: string,
): Promise<{ followerCount: number; avgViews: number } | null> {
  // Placeholder — implement with TikTok Research API
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function simulateDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  return new Promise(resolve => setTimeout(resolve, delay));
}

function isMockFailure(seed: string, rate: number): boolean {
  // Deterministic mock failure based on seed hash
  const hash = seed.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return (hash % 100) < rate * 100;
}

function pickMockError(errors: string[]): string {
  return errors[Math.floor(Math.random() * errors.length)];
}
