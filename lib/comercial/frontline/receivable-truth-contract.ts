/**
 * lib/comercial/frontline/receivable-truth-contract.ts
 *
 * Client-safe receivable truth types and constants.
 *
 * This module contains ONLY serializable types, string constants,
 * and pure predicates. It MUST NOT import prisma, pg, or any
 * server-only module.
 *
 * Server-side certification logic lives in receivable-truth-status.ts.
 */

// ── Truth status types ───────────────────────────────────────────────────────

export type ReceivableTruthStatus =
  | "CERTIFIED"
  | "UNVERIFIED"
  | "STALE"
  | "SOURCE_CONFLICT"
  | "MISSING_APPLICATION_DETAIL";

export type ReceivableTruthState = "CERTIFIED" | "UNVERIFIED";

// ── Constants ────────────────────────────────────────────────────────────────

export const RECEIVABLE_NOT_CERTIFIED_REASON = "RECEIVABLE_DATA_NOT_CERTIFIED" as const;

export const UNVERIFIED_RECEIVABLE_LABEL = "Información de cartera en validación";

// ── Discriminated result types ───────────────────────────────────────────────

export type CertifiedResult<T> = {
  truthState: "CERTIFIED";
  items: T;
};

export type UnverifiedResult<T> = {
  truthState: "UNVERIFIED";
  reason: string;
  items: T;
};

export type TruthGatedResult<T> = CertifiedResult<T> | UnverifiedResult<T>;

// ── Pure predicates ──────────────────────────────────────────────────────────

export function isTruthStateCertified(state: ReceivableTruthState | undefined | null): boolean {
  return state === "CERTIFIED";
}
