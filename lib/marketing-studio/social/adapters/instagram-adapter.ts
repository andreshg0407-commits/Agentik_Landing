/**
 * lib/marketing-studio/social/adapters/instagram-adapter.ts
 *
 * MS-16 — Social Publishing Execution Engine: Instagram adapter
 *
 * Mock execution layer. Future: Instagram Graph API + Facebook OAuth.
 *
 * SERVER ONLY.
 */

import { type SocialExecutionResult, type SocialChannel } from "../social-types";
import { classifyPublicationFailure } from "../social-retries";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface InstagramPublishInput {
  organizationId: string;
  publicationId:  string;
  mediaType:      "IMAGE" | "VIDEO" | "REELS" | "STORIES" | "CAROUSEL";
  assetUrl:       string | string[];  // string[] for CAROUSEL
  caption:        string;
  accessToken:    string;
  locationId?:    string;
  hashtags?:      string[];
  coverUrl?:      string;   // for video
  shareToFeed?:   boolean;  // for STORIES
  collaborators?: string[];
}

export interface InstagramMediaContainer {
  containerId:   string;
  mediaType:     string;
}

export interface InstagramPublishResult {
  success:        boolean;
  mediaId:        string | null;
  permalink:      string | null;
  errorCode:      number | null;
  errorMessage:   string | null;
  mediaContainers:InstagramMediaContainer[];
}

// ── Validation ─────────────────────────────────────────────────────────────────

export function validateInstagramPayload(input: InstagramPublishInput): string[] {
  const errors: string[] = [];

  if (!input.assetUrl || (Array.isArray(input.assetUrl) && input.assetUrl.length === 0)) {
    errors.push("URL del media requerida");
  }
  if (!input.caption) errors.push("Caption requerido");
  if (input.caption && input.caption.length > 2200) errors.push("Caption excede 2200 caracteres");
  if (!input.accessToken) errors.push("Access token no configurado");
  if (input.mediaType === "CAROUSEL" && Array.isArray(input.assetUrl) && input.assetUrl.length < 2) {
    errors.push("Carrusel requiere al menos 2 imágenes");
  }

  return errors;
}

// ── Mock executor ──────────────────────────────────────────────────────────────

export async function publishToInstagram(
  input: InstagramPublishInput,
): Promise<SocialExecutionResult> {
  const startAt = Date.now();

  // Simulate Graph API container creation + publishing delay
  await simulateDelay(600, 1800);

  const shouldFail = isMockFailure(input.publicationId, 0.08);

  if (shouldFail) {
    const errorMsg = pickMockError([
      "Error code 190: Invalid OAuth access token",
      "Error code 100: Invalid media format",
      "Error code 9004: Upload timeout",
      "Rate limit exceeded: Too many API calls",
    ]);
    return {
      publicationId:  input.publicationId,
      channel:        "instagram" as SocialChannel,
      success:        false,
      platformPostId: null,
      platformUrl:    null,
      errorType:      classifyPublicationFailure(errorMsg),
      errorMessage:   errorMsg,
      durationMs:     Date.now() - startAt,
      executedAt:     new Date().toISOString(),
    };
  }

  const mockMediaId = `17895695668004550_${Date.now()}`;
  return {
    publicationId:  input.publicationId,
    channel:        "instagram" as SocialChannel,
    success:        true,
    platformPostId: mockMediaId,
    platformUrl:    `https://www.instagram.com/p/${generateShortcode()}`,
    errorType:      null,
    errorMessage:   null,
    durationMs:     Date.now() - startAt,
    executedAt:     new Date().toISOString(),
  };
}

// ── Future stubs ──────────────────────────────────────────────────────────────

export async function getInstagramInsights(
  _mediaId:     string,
  _accessToken: string,
): Promise<{ impressions: number; reach: number; engagement: number } | null> {
  return null;
}

export async function uploadInstagramMedia(
  _assetUrl:    string,
  _accessToken: string,
  _mediaType:   string,
): Promise<{ containerId: string } | null> {
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function simulateDelay(min: number, max: number): Promise<void> {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

function isMockFailure(seed: string, rate: number): boolean {
  const hash = seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return (hash % 100) < rate * 100;
}

function pickMockError(errors: string[]): string {
  return errors[Math.floor(Math.random() * errors.length)];
}

function generateShortcode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  return Array.from({ length: 11 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
