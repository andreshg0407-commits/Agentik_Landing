/**
 * lib/marketing-studio/social/adapters/facebook-adapter.ts
 *
 * MS-16 — Social Publishing Execution Engine: Facebook adapter
 *
 * Mock execution layer. Future: Facebook Graph API + Page access tokens.
 *
 * SERVER ONLY.
 */

import { type SocialExecutionResult, type SocialChannel } from "../social-types";
import { classifyPublicationFailure } from "../social-retries";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FacebookPublishInput {
  organizationId: string;
  publicationId:  string;
  pageId:         string;
  mediaType:      "photo" | "video" | "reel" | "story";
  assetUrl:       string;
  caption:        string;
  accessToken:    string;
  targeting?: {
    ageMin?:     number;
    countries?:  string[];
  };
  scheduledPublishTime?: number;  // Unix timestamp
  published?:     boolean;
}

// ── Validation ─────────────────────────────────────────────────────────────────

export function validateFacebookPayload(input: FacebookPublishInput): string[] {
  const errors: string[] = [];
  if (!input.pageId)       errors.push("Page ID requerido");
  if (!input.assetUrl)     errors.push("URL del media requerida");
  if (!input.accessToken)  errors.push("Page access token requerido");
  if (input.caption && input.caption.length > 63_206) errors.push("Caption excede límite de Facebook");
  return errors;
}

// ── Mock executor ──────────────────────────────────────────────────────────────

export async function publishToFacebook(
  input: FacebookPublishInput,
): Promise<SocialExecutionResult> {
  const startAt = Date.now();
  await simulateDelay(400, 1400);

  const shouldFail = isMockFailure(input.publicationId, 0.07);

  if (shouldFail) {
    const err = pickMockError([
      "Error code 200: Application does not have permission for this action",
      "Error code 190: Invalid OAuth access token",
      "Error code 368: Temporarily blocked",
    ]);
    return {
      publicationId:  input.publicationId,
      channel:        "facebook" as SocialChannel,
      success:        false,
      platformPostId: null,
      platformUrl:    null,
      errorType:      classifyPublicationFailure(err),
      errorMessage:   err,
      durationMs:     Date.now() - startAt,
      executedAt:     new Date().toISOString(),
    };
  }

  const mockPostId = `${input.pageId}_${Date.now()}`;
  return {
    publicationId:  input.publicationId,
    channel:        "facebook" as SocialChannel,
    success:        true,
    platformPostId: mockPostId,
    platformUrl:    `https://www.facebook.com/${input.pageId}/posts/${Date.now()}`,
    errorType:      null,
    errorMessage:   null,
    durationMs:     Date.now() - startAt,
    executedAt:     new Date().toISOString(),
  };
}

// ── Future stubs ───────────────────────────────────────────────────────────────

export async function getFacebookPageMetrics(
  _pageId: string,
  _token:  string,
): Promise<{ followers: number; reach: number } | null> {
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
