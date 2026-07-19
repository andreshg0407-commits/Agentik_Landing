/**
 * lib/marketing-studio/intake-schema.ts
 *
 * Canonical intake request — factory, validation, and ID generation.
 *
 * ── Responsibility ────────────────────────────────────────────────────────────
 *
 *   This module owns the shape and lifecycle of an IntakeRequest:
 *     • createIntakeRequest() — builds a canonical IntakeRequest from inputs
 *     • validateIntakeRequest() — validates fields before sending downstream
 *     • newRequestId()          — deterministic-ish short ID
 *
 *   It does NOT persist to DB — Marketing Studio v1 is stateless.
 *   Persistence will be added in a later sprint once the DB model is agreed.
 */

import type {
  IntakeRequest,
  GarmentFingerprint,
  ContentConfig,
  PublishingConfig,
  IntakeMeta,
  ValidationResult,
  SessionOverrides,
} from "./types";
import { getTenantConfig, resolveEffectivePreset } from "./tenant-config";
import { getPreset } from "./preset-registry";
import { validateCategoryInputs } from "./category-requirements";
import { getEffectiveFidelityMode } from "./luca-hooks";

// ── ID generation ─────────────────────────────────────────────────────────────

let _seq = 0;

/**
 * Returns a short, sortable intake request ID.
 * Format: ms_{timestamp_base36}_{random_base36}{seq_base36}
 * Not cryptographically secure — for display / tracing only.
 */
export function newRequestId(): string {
  const ts  = Date.now().toString(36).slice(-6);
  const rnd = Math.random().toString(36).slice(2, 6);
  const seq = ((_seq++ & 0xfff)).toString(36).padStart(3, "0");
  return `ms_${ts}${rnd}${seq}`;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export interface CreateIntakeOptions {
  tenantId:    string;
  garment:     GarmentFingerprint;
  presetId?:   string;          // defaults to tenant default
  overrides?:  SessionOverrides;
  content:     Omit<ContentConfig, "locale"> & { locale?: string };
  publishing?: PublishingConfig;
  meta:        Omit<IntakeMeta, "createdAt"> & { createdAt?: string };
}

/**
 * Creates a fully-typed IntakeRequest with defaults filled in from the
 * tenant config and preset registry.
 *
 * Returns the request and any non-fatal warnings (e.g. preset not found,
 * fallback applied).
 */
export function createIntakeRequest(
  opts: CreateIntakeOptions,
): { request: IntakeRequest; warnings: string[] } {
  const warnings: string[] = [];
  const config   = getTenantConfig(opts.tenantId);

  // Resolve preset — fall back to tenant default, then to studio_clean_white
  let presetId = opts.presetId ?? config?.defaultPresetId ?? "studio_clean_white";
  if (config && !config.allowedPresets.includes(presetId)) {
    warnings.push(`Preset "${presetId}" not in tenant allowedPresets; falling back to "${config.defaultPresetId}"`);
    presetId = config.defaultPresetId ?? "studio_clean_white";
  }
  if (!getPreset(presetId)) {
    warnings.push(`Preset "${presetId}" not found in registry; falling back to "studio_clean_white"`);
    presetId = "studio_clean_white";
  }

  const request: IntakeRequest = {
    requestId: newRequestId(),
    tenantId:  opts.tenantId,
    garment:   opts.garment,
    presetId,
    overrides: opts.overrides,
    content: {
      locale:           opts.content.locale          ?? "es-CO",
      generateCopy:     opts.content.generateCopy    ?? true,
      generateHashtags: opts.content.generateHashtags ?? true,
      targetPlatforms:  opts.content.targetPlatforms ??
        config?.luca.defaultPlatforms ?? ["tiktok"],
      objective:        opts.content.objective ?? config?.luca.defaultObjective,
      tone:             opts.content.tone,
    },
    publishing: opts.publishing,
    meta: {
      priority:    opts.meta.priority   ?? "NORMAL",
      source:      opts.meta.source     ?? "manual",
      operatorId:  opts.meta.operatorId,
      notes:       opts.meta.notes,
      sessionId:   opts.meta.sessionId,
      createdAt:   opts.meta.createdAt  ?? new Date().toISOString(),
    },
  };

  return { request, warnings };
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validates an IntakeRequest against business rules.
 * Returns { valid, errors } — errors is empty when valid.
 */
export function validateIntakeRequest(req: IntakeRequest): ValidationResult {
  const errors: string[] = [];

  if (!req.requestId) errors.push("requestId is required");
  if (!req.tenantId)  errors.push("tenantId is required");

  // Garment
  if (!req.garment?.id)       errors.push("garment.id is required");
  if (!req.garment?.tenantId) errors.push("garment.tenantId is required");
  if (!req.garment?.attributes?.category) errors.push("garment.attributes.category is required");
  if (!req.garment?.attributes?.colors?.length) errors.push("garment.attributes.colors must have at least one entry");
  if (!req.garment?.attributes?.gender) errors.push("garment.attributes.gender is required");

  // Preset
  const preset = getPreset(req.presetId);
  if (!preset) errors.push(`presetId "${req.presetId}" not found in registry`);

  // Tenant allowed preset check
  const config = getTenantConfig(req.tenantId);
  if (config && preset && !config.allowedPresets.includes(req.presetId)) {
    errors.push(`Preset "${req.presetId}" is not allowed for tenant "${req.tenantId}"`);
  }

  // Overrides policy check
  if (req.overrides && preset) {
    if (req.overrides.background && !preset.overridePolicy.background) {
      errors.push(`Preset "${req.presetId}" does not allow background override`);
    }
    if (req.overrides.lighting && !preset.overridePolicy.lighting) {
      errors.push(`Preset "${req.presetId}" does not allow lighting override`);
    }
    if (req.overrides.style && !preset.overridePolicy.style) {
      errors.push(`Preset "${req.presetId}" does not allow style override`);
    }
    if (req.overrides.angles && !preset.overridePolicy.angles) {
      errors.push(`Preset "${req.presetId}" does not allow angles override`);
    }
  }

  // Content
  if (!req.content) {
    errors.push("content is required");
  } else {
    if (!req.content.targetPlatforms?.length) errors.push("content.targetPlatforms must have at least one entry");
    if (!req.content.locale)                  errors.push("content.locale is required");
  }

  // Tenant cross-check
  if (req.garment?.tenantId && req.garment.tenantId !== req.tenantId) {
    errors.push(`garment.tenantId "${req.garment.tenantId}" does not match request tenantId "${req.tenantId}"`);
  }

  // Category + fidelity requirements
  if (req.garment?.attributes) {
    const fidelityMode = config
      ? getEffectiveFidelityMode(req, config)
      : (req.fidelityMode ?? "standard");
    const categoryResult = validateCategoryInputs(req.garment.attributes, fidelityMode);
    errors.push(...categoryResult.errors);
  }

  return { valid: errors.length === 0, errors };
}

// ── Override validation ───────────────────────────────────────────────────────

/**
 * Validates that all requested session overrides are permitted by the preset policy.
 * Returns a list of policy violation messages (empty = all permitted).
 */
export function validateOverrides(
  presetId:  string,
  overrides: SessionOverrides,
): string[] {
  const preset = getPreset(presetId);
  if (!preset) return [`Preset "${presetId}" not found`];

  const violations: string[] = [];
  if (overrides.background && !preset.overridePolicy.background) {
    violations.push(`background override not permitted by preset "${presetId}"`);
  }
  if (overrides.lighting && !preset.overridePolicy.lighting) {
    violations.push(`lighting override not permitted by preset "${presetId}"`);
  }
  if (overrides.style && !preset.overridePolicy.style) {
    violations.push(`style override not permitted by preset "${presetId}"`);
  }
  if (overrides.angles && !preset.overridePolicy.angles) {
    violations.push(`angles override not permitted by preset "${presetId}"`);
  }
  if (overrides.modelGender && !preset.overridePolicy.modelGender) {
    violations.push(`modelGender override not permitted by preset "${presetId}"`);
  }
  return violations;
}
