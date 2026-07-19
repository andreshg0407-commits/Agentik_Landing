/**
 * lib/security/mfa/mfa-query.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA Query Helpers — Read-Only Queries on MFA State
 *
 * No AI. No server-only. Pure domain query helpers.
 * Operates against in-memory repository for platform-wide queries.
 */

import type { MfaEnrollment, MfaMethod, MfaStatus } from "./mfa-types";
import type { MfaRecoveryCodeRecord } from "./mfa-repository";
import { inMemoryMfaRepository } from "./mfa-repository";
import { mfaAuditLog } from "./mfa-audit";

// ── getUserMfaStatus ──────────────────────────────────────────────────────────

export interface UserMfaStatus {
  orgSlug:      string;
  userId:       string;
  enrollments:  MfaEnrollment[];
  hasAnyEnabled: boolean;
  enabledMethods: MfaMethod[];
  hasTOTP:       boolean;
  hasRecoveryCodes: boolean;
  isLocked:      boolean;
}

export async function getUserMfaStatus(orgSlug: string, userId: string): Promise<UserMfaStatus> {
  const enrollments    = await inMemoryMfaRepository.listEnrollments(orgSlug, userId);
  const enabled        = enrollments.filter(e => e.status === "ENABLED");
  const enabledMethods = enabled.map(e => e.method);

  const codes = await inMemoryMfaRepository.getRecoveryCodes(orgSlug, userId);
  const hasActive = codes.some(c => !c.usedAt);

  return {
    orgSlug,
    userId,
    enrollments,
    hasAnyEnabled:    enabled.length > 0,
    enabledMethods,
    hasTOTP:          enabledMethods.includes("TOTP"),
    hasRecoveryCodes: hasActive,
    isLocked:         enrollments.some(e => e.status === "LOCKED"),
  };
}

// ── getTenantMfaCoverage ──────────────────────────────────────────────────────

export interface TenantMfaCoverage {
  orgSlug:           string;
  totalEnrollments:  number;
  enabledEnrollments: number;
  pendingEnrollments: number;
  lockedEnrollments:  number;
  coveragePercent:   number;
  methodBreakdown:   Record<MfaMethod, number>;
}

export async function getTenantMfaCoverage(orgSlug: string): Promise<TenantMfaCoverage> {
  const all     = await inMemoryMfaRepository.countEnrollments(orgSlug);
  const enabled = await inMemoryMfaRepository.countEnrollments(orgSlug, "ENABLED");
  const pending = await inMemoryMfaRepository.countEnrollments(orgSlug, "PENDING");
  const locked  = await inMemoryMfaRepository.countEnrollments(orgSlug, "LOCKED");

  const enabledList = await inMemoryMfaRepository.listEnrollmentsByStatus(orgSlug, "ENABLED");
  const methodBreakdown: Record<MfaMethod, number> = {
    TOTP: 0, EMAIL: 0, SMS: 0, PASSKEY: 0, WEBAUTHN: 0, RECOVERY_CODE: 0,
  };
  for (const e of enabledList) {
    methodBreakdown[e.method] = (methodBreakdown[e.method] ?? 0) + 1;
  }

  const coveragePercent = all > 0 ? Math.round((enabled / all) * 100) : 0;

  return {
    orgSlug,
    totalEnrollments:   all,
    enabledEnrollments: enabled,
    pendingEnrollments: pending,
    lockedEnrollments:  locked,
    coveragePercent,
    methodBreakdown,
  };
}

// ── getEnabledMethods ─────────────────────────────────────────────────────────

export async function getEnabledMethods(orgSlug: string, userId: string): Promise<MfaMethod[]> {
  const enrollments = await inMemoryMfaRepository.listEnrollments(orgSlug, userId);
  return enrollments.filter(e => e.status === "ENABLED").map(e => e.method);
}

// ── getRecoveryUsage ──────────────────────────────────────────────────────────

export interface RecoveryUsageSummary {
  orgSlug:        string;
  userId:         string;
  totalCodes:     number;
  usedCodes:      number;
  remainingCodes: number;
  lastUsedAt?:    string;
}

export async function getRecoveryUsage(orgSlug: string, userId: string): Promise<RecoveryUsageSummary> {
  const codes     = await inMemoryMfaRepository.getRecoveryCodes(orgSlug, userId);
  const used      = codes.filter(c => !!c.usedAt);
  const remaining = codes.filter(c => !c.usedAt);

  const sortedUsed = used
    .map(c => c.usedAt!)
    .sort()
    .reverse();

  return {
    orgSlug,
    userId,
    totalCodes:     codes.length,
    usedCodes:      used.length,
    remainingCodes: remaining.length,
    lastUsedAt:     sortedUsed[0],
  };
}

// ── getRecentMfaFailures ──────────────────────────────────────────────────────

export function getRecentMfaFailures(
  orgSlug:     string,
  windowHours: number = 24,
): { count: number; byUser: Record<string, number> } {
  const cutoff = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
  const events = mfaAuditLog.getFailedEvents(orgSlug).filter(e => e.occurredAt >= cutoff);

  const byUser: Record<string, number> = {};
  for (const e of events) {
    byUser[e.subjectId] = (byUser[e.subjectId] ?? 0) + 1;
  }

  return { count: events.length, byUser };
}
