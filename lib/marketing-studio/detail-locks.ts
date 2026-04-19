/**
 * lib/marketing-studio/detail-locks.ts
 *
 * Jeans detail lock system — non-negotiable garment attribute definitions.
 *
 * ── What "detail locks" mean ──────────────────────────────────────────────────
 *
 *   In strict fidelity mode, certain visual attributes of a garment MUST be
 *   preserved exactly in the generated photo/video.  For jeans these are:
 *
 *     pocket       — 5-pocket, coin-pocket, patch, flap, welt, no-pocket
 *     stitching    — thread colour/technique: contrast-yellow, tonal, white, etc.
 *     wash         — denim finish: raw, light-wash, mid-wash, dark-wash, etc.
 *     rise         — waistband position: low-rise, mid-rise, high-rise, ultra
 *     embellishments — decorative elements: embroidery, rhinestones, rips, etc.
 *
 *   These five axes are the minimum the AI generator must honour.
 *   Missing or misrepresenting any of them constitutes a fidelity failure.
 *
 * ── Standard vs. strict ───────────────────────────────────────────────────────
 *
 *   standard: all locks optional — used for mood/editorial shots where the brand
 *             accepts some artistic latitude from the AI generator.
 *
 *   strict:   pocket + stitching + wash + rise are ALL required.
 *             embellishments is required if any are present (including "none").
 *             Used by Do Jeans where garment identity must be product-accurate.
 *
 * Exports:
 *   JEANS_POCKET_STYLES     DENIM_WASHES     JEANS_RISES
 *   JEANS_STITCHINGS        JEANS_EMBELLISHMENTS
 *   JEANS_STRICT_REQUIRED   — keys required in strict mode
 *   validateJeansDetailLocks(locks?, mode)  → ValidationResult
 *   describeJeansDetailLocks(locks)         → human-readable string for prompts
 *   describeJeansEmbellishments(list)       → condensed embellishment phrase
 */

import type { GarmentDetailLocks, FidelityMode, ValidationResult } from "./types";

// ── Valid value sets ──────────────────────────────────────────────────────────

export const JEANS_POCKET_STYLES = [
  "5-pocket",
  "coin-pocket",
  "patch",
  "flap",
  "welt",
  "no-pocket",
] as const;
export type JeansPocketStyle = (typeof JEANS_POCKET_STYLES)[number];

export const DENIM_WASHES = [
  "raw",
  "light-wash",
  "mid-wash",
  "dark-wash",
  "black",
  "distressed",
  "acid-wash",
  "stonewash",
  "vintage-wash",
  "overdyed",
] as const;
export type DenimWash = (typeof DENIM_WASHES)[number];

export const JEANS_RISES = [
  "low-rise",
  "mid-rise",
  "high-rise",
  "ultra-high-rise",
] as const;
export type JeansRise = (typeof JEANS_RISES)[number];

export const JEANS_STITCHINGS = [
  "contrast-yellow",
  "tonal",
  "white",
  "orange",
  "red",
  "double-stitch",
  "chain-stitch",
  "flatlock",
  "none",
] as const;
export type JeansStitching = (typeof JEANS_STITCHINGS)[number];

export const JEANS_EMBELLISHMENTS = [
  "none",
  "embroidery",
  "patches",
  "rhinestones",
  "crystals",
  "studs",
  "rips",
  "distressed-knees",
  "fading",
  "paint-splatter",
  "bleach-spots",
  "laser-print",
] as const;
export type JeansEmbellishment = (typeof JEANS_EMBELLISHMENTS)[number];

// ── Hardware constants ────────────────────────────────────────────────────────

export const JEANS_HARDWARE_TYPES = [
  "single-button",
  "double-button",
  "triple-button",
  "zip-fly",
  "hook-and-bar",
  "snap-button",
] as const;
export type JeansHardwareType = (typeof JEANS_HARDWARE_TYPES)[number];

export const JEANS_HARDWARE_FINISHES = [
  "gold",
  "silver",
  "antique-brass",
  "black-nickel",
  "copper",
  "gunmetal",
  "rose-gold",
] as const;
export type JeansHardwareFinish = (typeof JEANS_HARDWARE_FINISHES)[number];

// ── Strict mode requirements ──────────────────────────────────────────────────

/**
 * Detail lock fields that are REQUIRED when fidelityMode = "strict" for jeans.
 * Validation fails if any of these are absent.
 */
export const JEANS_STRICT_REQUIRED: ReadonlyArray<keyof GarmentDetailLocks> = [
  "pocket",
  "stitching",
  "wash",
  "rise",
] as const;

/**
 * Fields recommended (but not required) in standard mode.
 * Their absence generates a warning, not an error.
 */
export const JEANS_STANDARD_RECOMMENDED: ReadonlyArray<keyof GarmentDetailLocks> = [
  "wash",
  "rise",
] as const;

// ── Validator ─────────────────────────────────────────────────────────────────

/**
 * Validates jeans detail locks for the given fidelity mode.
 *
 * Strict mode:  pocket + stitching + wash + rise are all required.
 *               Each value must be from its valid set.
 *               embellishments must be present (at least ["none"]).
 *
 * Standard mode: validates values when present, but does not require any field.
 */
export function validateJeansDetailLocks(
  locks:   GarmentDetailLocks | undefined,
  mode:    FidelityMode,
): ValidationResult {
  const errors: string[] = [];

  if (mode === "strict") {
    if (!locks) {
      errors.push(
        "detailLocks required in strict mode for jeans. " +
        `Required fields: ${JEANS_STRICT_REQUIRED.join(", ")}`,
      );
      return { valid: false, errors };
    }

    // Required fields presence
    for (const field of JEANS_STRICT_REQUIRED) {
      if (!locks[field]) {
        errors.push(`detailLocks.${field} is required in strict mode`);
      }
    }

    // embellishments: must be explicitly declared (even if ["none"])
    if (!locks.embellishments || locks.embellishments.length === 0) {
      errors.push(
        'detailLocks.embellishments is required in strict mode. ' +
        'Use ["none"] if the garment has no embellishments.',
      );
    }
  }

  if (!locks) return { valid: errors.length === 0, errors };

  // Value validation (applies regardless of mode when a value is present)
  if (locks.pocket && !(JEANS_POCKET_STYLES as readonly string[]).includes(locks.pocket)) {
    errors.push(
      `detailLocks.pocket "${locks.pocket}" is not a valid value. ` +
      `Allowed: ${JEANS_POCKET_STYLES.join(", ")}`,
    );
  }
  if (locks.wash && !(DENIM_WASHES as readonly string[]).includes(locks.wash)) {
    errors.push(
      `detailLocks.wash "${locks.wash}" is not a valid value. ` +
      `Allowed: ${DENIM_WASHES.join(", ")}`,
    );
  }
  if (locks.rise && !(JEANS_RISES as readonly string[]).includes(locks.rise)) {
    errors.push(
      `detailLocks.rise "${locks.rise}" is not a valid value. ` +
      `Allowed: ${JEANS_RISES.join(", ")}`,
    );
  }
  if (locks.stitching && !(JEANS_STITCHINGS as readonly string[]).includes(locks.stitching)) {
    errors.push(
      `detailLocks.stitching "${locks.stitching}" is not a valid value. ` +
      `Allowed: ${JEANS_STITCHINGS.join(", ")}`,
    );
  }
  if (locks.embellishments) {
    const invalid = locks.embellishments.filter(
      e => !(JEANS_EMBELLISHMENTS as readonly string[]).includes(e),
    );
    if (invalid.length > 0) {
      errors.push(
        `detailLocks.embellishments contains invalid values: ${invalid.join(", ")}. ` +
        `Allowed: ${JEANS_EMBELLISHMENTS.join(", ")}`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Prompt descriptors ────────────────────────────────────────────────────────

/**
 * Returns a human-readable, AI-prompt-safe description of a jeans detail lock set.
 *
 * Examples:
 *   "5-pocket, contrast-yellow stitching, mid-wash, high-rise"
 *   "5-pocket, tonal stitching, raw denim, mid-rise, embroidery and rhinestones"
 */
export function describeJeansDetailLocks(locks: GarmentDetailLocks): string {
  const parts: string[] = [];

  if (locks.pocket    && locks.pocket    !== "no-pocket") parts.push(`${locks.pocket} pockets`);
  if (locks.stitching && locks.stitching !== "none")       parts.push(`${locks.stitching} stitching`);
  if (locks.washDetail)                                    parts.push(locks.washDetail);
  else if (locks.wash)                                     parts.push(locks.wash);
  if (locks.rise)                                          parts.push(locks.rise);

  const embStr = describeJeansEmbellishments(locks.embellishments);
  if (embStr) parts.push(embStr);

  if (locks.hardwareType) {
    const hw = locks.hardwareFinish ? `${locks.hardwareFinish} ${locks.hardwareType}` : locks.hardwareType;
    parts.push(hw);
  }

  if (locks.embellishmentDetail) parts.push(locks.embellishmentDetail);

  return parts.join(", ");
}

/**
 * Returns a concise embellishment description for the AI prompt.
 * Returns empty string when embellishments is ["none"] or absent.
 */
export function describeJeansEmbellishments(
  embellishments: string[] | undefined,
): string {
  if (!embellishments || embellishments.length === 0) return "";
  const real = embellishments.filter(e => e !== "none");
  if (real.length === 0) return "";
  if (real.length === 1) return real[0];
  const last = real[real.length - 1];
  return real.slice(0, -1).join(", ") + " and " + last;
}

/**
 * Builds the strict-fidelity directive appended to AI prompts in strict mode.
 * This is the explicit "PRESERVE EXACTLY" instruction that constrains the generator.
 *
 * PRESERVE EXACTLY section — lists each lock attribute as a specific descriptor.
 * DO NOT section — dynamically enumerates only the axes that are actually locked,
 * so the instruction is precise rather than a generic catch-all.
 */
export function buildFidelityDirective(locks: GarmentDetailLocks): string {
  const mustPreserve: string[] = [];
  const doNotAxes:   string[] = [];

  // Wash — prefer free-text washDetail over enum phrase for fine-grained control
  if (locks.washDetail) {
    mustPreserve.push(locks.washDetail);
    doNotAxes.push("denim wash depth");
  } else if (locks.wash) {
    mustPreserve.push(`${locks.wash} denim finish`);
    doNotAxes.push("denim wash depth");
  }

  // Pocket construction
  if (locks.pocket && locks.pocket !== "no-pocket") {
    mustPreserve.push(`${locks.pocket} construction`);
    doNotAxes.push("pocket geometry");
  }

  // Stitching
  if (locks.stitching && locks.stitching !== "none") {
    mustPreserve.push(`${locks.stitching} seam stitching`);
    doNotAxes.push("thread colour");
  }

  // Rise
  if (locks.rise) {
    mustPreserve.push(`${locks.rise} waistband`);
    doNotAxes.push("waistband closure structure");
  }

  // Embellishment type list (structured)
  const embs = (locks.embellishments ?? []).filter(e => e !== "none");
  if (embs.length > 0) {
    // Only push the type list when no detail string is present (avoid redundancy)
    if (!locks.embellishmentDetail) {
      mustPreserve.push(describeJeansEmbellishments(embs) + " detail");
    }
    doNotAxes.push("embellishment geometry");
  }

  // Hardware — structured fields + optional free-text detail
  if (locks.hardwareType) {
    const base = locks.hardwareFinish
      ? `${locks.hardwareFinish} ${locks.hardwareType} closure`
      : `${locks.hardwareType} closure`;
    const hw = locks.hardwareDetail ? `${base}, ${locks.hardwareDetail}` : base;
    mustPreserve.push(hw);
    doNotAxes.push("hardware finish");
  }

  // Embellishment geometry — free text, injected verbatim (replaces type list in output)
  if (locks.embellishmentDetail) {
    mustPreserve.push(locks.embellishmentDetail);
    // ensure the axis is in doNotAxes (may already be there from embs check above)
    if (!doNotAxes.includes("embellishment geometry")) {
      doNotAxes.push("embellishment geometry");
    }
  }

  if (mustPreserve.length === 0) return "";

  const doNotLine = doNotAxes.length > 0
    ? `DO NOT alter ${doNotAxes.join(", ")}.`
    : "DO NOT alter garment construction or detailing.";

  return (
    "PRESERVE EXACTLY: " + mustPreserve.join(", ") + ".\n\n" +
    doNotLine + "\n" +
    "No artistic liberties with garment construction."
  );
}
