/**
 * lib/whatsapp/config.ts
 *
 * Per-tenant WhatsApp configuration service.
 *
 * Each organization has at most one WhatsAppConfig row (@@unique on organizationId).
 * Config includes Meta credentials, display settings, and an extensible JSON blob
 * for per-intent configuration (FAQs, schedules, escalation rules).
 *
 * All writes are upserts — safe to call from setup wizards or API routes.
 */

import { prisma }        from "@/lib/prisma";
import type { WaConfig, WaConfigInput, WaIntentConfig, WaBrandVoice } from "./types";

// ── intentConfig parser ───────────────────────────────────────────────────────

/**
 * Safely parses the untyped Prisma Json blob into a typed WaIntentConfig.
 * Returns an empty object on null or invalid input — callers should handle
 * missing fields gracefully since all config properties are optional.
 */
export function parseIntentConfig(raw: Record<string, unknown> | null): WaIntentConfig {
  if (!raw || typeof raw !== "object") return {};
  // Shallow cast — intentConfig is tenant-controlled JSON so we trust the shape
  // was set correctly via the API. The reply engine defensively accesses every field.
  return raw as WaIntentConfig;
}

/**
 * Safely parses the untyped brandConfig Prisma Json blob into a typed WaBrandVoice.
 * Returns an empty object (= no brand customization) when null or invalid.
 */
export function parseBrandConfig(raw: Record<string, unknown> | null): WaBrandVoice {
  if (!raw || typeof raw !== "object") return {};
  return raw as WaBrandVoice;
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Returns the WhatsApp config for an org, or null if not yet configured.
 */
export async function getWhatsAppConfig(
  organizationId: string,
): Promise<WaConfig | null> {
  const row = await (prisma as any).whatsAppConfig.findUnique({
    where: { organizationId },
  });
  return row ?? null;
}

/**
 * Returns the active WhatsApp config identified by its Meta phone_number_id.
 * Used in the webhook handler to route incoming messages to the correct org.
 * Returns null if no active config matches.
 */
export async function getActiveConfigByPhoneNumberId(
  phoneNumberId: string,
): Promise<WaConfig | null> {
  const row = await (prisma as any).whatsAppConfig.findFirst({
    where: { phoneNumberId, active: true },
  });
  return row ?? null;
}

/**
 * Returns the active WhatsApp config identified by its webhook secret (verify token).
 * Used during Meta webhook verification (GET hub.verify_token check).
 */
export async function getActiveConfigByWebhookSecret(
  webhookSecret: string,
): Promise<WaConfig | null> {
  const row = await (prisma as any).whatsAppConfig.findFirst({
    where: { webhookSecret, active: true },
  });
  return row ?? null;
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Creates or updates the WhatsApp config for an org.
 * Safe to call multiple times — uses upsert on organizationId.
 *
 * IMPORTANT: webhookSecret must be set in the Meta App Dashboard to match.
 * phoneNumberId and wabaId must come from the Meta Business Manager.
 */
export async function upsertWhatsAppConfig(
  organizationId: string,
  input:          WaConfigInput,
): Promise<WaConfig> {
  return (prisma as any).whatsAppConfig.upsert({
    where:  { organizationId },
    create: {
      organizationId,
      phoneNumberId:  input.phoneNumberId,
      wabaId:         input.wabaId,
      webhookSecret:  input.webhookSecret,
      displayName:    input.displayName,
      welcomeMessage: input.welcomeMessage ?? null,
      intentConfig:   input.intentConfig   ?? null,
      brandConfig:    input.brandConfig    ?? null,
      active:         input.active          ?? false,
    },
    update: {
      phoneNumberId:  input.phoneNumberId,
      wabaId:         input.wabaId,
      webhookSecret:  input.webhookSecret,
      displayName:    input.displayName,
      welcomeMessage: input.welcomeMessage ?? null,
      intentConfig:   input.intentConfig   ?? null,
      brandConfig:    input.brandConfig    ?? null,
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
}

/**
 * Activates or deactivates the WhatsApp config for an org.
 * The webhook handler silently acks messages for inactive configs.
 */
export async function setWhatsAppConfigActive(
  organizationId: string,
  active:         boolean,
): Promise<void> {
  await (prisma as any).whatsAppConfig.updateMany({
    where: { organizationId },
    data:  { active },
  });
}
