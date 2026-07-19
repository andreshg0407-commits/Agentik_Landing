/**
 * lib/marketing-studio/social/adapters/whatsapp-adapter.ts
 *
 * MS-16 — Social Publishing Execution Engine: WhatsApp adapter
 *
 * Mock execution layer. Future: WhatsApp Cloud API (Meta) + Catalog API.
 *
 * SERVER ONLY.
 */

import { type SocialExecutionResult, type SocialChannel } from "../social-types";
import { classifyPublicationFailure } from "../social-retries";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WhatsAppPublishInput {
  organizationId:  string;
  publicationId:   string;
  phoneNumberId:   string;  // WhatsApp Business account phone number ID
  mediaType:       "image" | "video" | "document" | "catalog_message" | "template";
  assetUrl:        string | null;
  caption:         string | null;
  accessToken:     string;
  templateName?:   string;   // for template messages
  templateParams?: string[]; // variable substitutions
  catalogId?:      string;
  productRetailerId?: string;
  recipients?:     string[]; // phone numbers (bulk)
}

export interface WhatsAppSendResult {
  success:     boolean;
  messageId:   string | null;
  errorCode:   string | null;
  errorMessage:string | null;
  sentCount:   number;
  failedCount: number;
}

// ── Validation ─────────────────────────────────────────────────────────────────

export function validateWhatsAppPayload(input: WhatsAppPublishInput): string[] {
  const errors: string[] = [];
  if (!input.phoneNumberId)  errors.push("Phone Number ID requerido");
  if (!input.accessToken)    errors.push("Access token de WhatsApp Business requerido");
  if (input.mediaType === "template" && !input.templateName) {
    errors.push("Nombre de template requerido para mensajes de template");
  }
  if (input.mediaType === "catalog_message" && !input.catalogId) {
    errors.push("Catalog ID requerido para catalog messages");
  }
  return errors;
}

// ── Mock executor ──────────────────────────────────────────────────────────────

export async function publishToWhatsApp(
  input: WhatsAppPublishInput,
): Promise<SocialExecutionResult> {
  const startAt = Date.now();
  await simulateDelay(300, 900);

  const shouldFail = isMockFailure(input.publicationId, 0.06);

  if (shouldFail) {
    const err = pickMockError([
      "Error 131030: Rate limit hit",
      "Error 100: Invalid parameter phoneNumberId",
      "Error 131031: Template does not exist",
    ]);
    return {
      publicationId:  input.publicationId,
      channel:        "whatsapp" as SocialChannel,
      success:        false,
      platformPostId: null,
      platformUrl:    null,
      errorType:      classifyPublicationFailure(err),
      errorMessage:   err,
      durationMs:     Date.now() - startAt,
      executedAt:     new Date().toISOString(),
    };
  }

  const mockMessageId = `wamid.${Buffer.from(input.publicationId).toString("base64").slice(0, 32)}`;
  return {
    publicationId:  input.publicationId,
    channel:        "whatsapp" as SocialChannel,
    success:        true,
    platformPostId: mockMessageId,
    platformUrl:    null,  // WhatsApp does not return a public URL
    errorType:      null,
    errorMessage:   null,
    durationMs:     Date.now() - startAt,
    executedAt:     new Date().toISOString(),
  };
}

// ── Future stubs ───────────────────────────────────────────────────────────────

export async function syncWhatsAppCatalog(
  _catalogId:   string,
  _accessToken: string,
): Promise<{ synced: boolean; productCount: number } | null> {
  return null;
}

export async function getWhatsAppDeliveryStats(
  _messageId:   string,
  _accessToken: string,
): Promise<{ delivered: number; read: number } | null> {
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
