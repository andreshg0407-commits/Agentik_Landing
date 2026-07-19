/**
 * lib/security/mfa/mfa-repository.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA Repository Contract + In-Memory Implementation
 *
 * No server-only. Pure interface contract + test implementation.
 * Prisma implementation: persistence/prisma-mfa-repository.ts
 *
 * CRITICAL:
 *   - All operations are tenant-scoped (orgSlug required)
 *   - Repository never stores plain secrets or codes
 *   - Cross-tenant access returns CRITICAL error
 */

import type { MfaEnrollment, MfaMethod, MfaResult, MfaStatus } from "./mfa-types";

// ── Recovery Code Record ───────────────────────────────────────────────────────

export interface MfaRecoveryCodeRecord {
  id:        string;
  orgSlug:   string;
  userId:    string;
  codeHash:  string;      // scrypt hash — never the plain code
  usedAt?:   string;      // ISO 8601 — undefined = not yet used
  createdAt: string;      // ISO 8601
}

// ── Enrollment Update ─────────────────────────────────────────────────────────

export type MfaEnrollmentUpdate = Partial<Pick<
  MfaEnrollment,
  "status" | "enabledAt" | "lastUsedAt" | "failCount"
>>;

// ── MfaRepository ─────────────────────────────────────────────────────────────

/**
 * MfaRepository — persistence contract for MFA state.
 * All methods return MfaResult or plain values (never throw).
 */
export interface MfaRepository {
  /** Save a new enrollment. Returns saved record. */
  saveEnrollment(enrollment: MfaEnrollment): Promise<MfaResult<MfaEnrollment>>;

  /** Get enrollment for user + method. Returns null if not found. */
  getEnrollment(orgSlug: string, userId: string, method: MfaMethod): Promise<MfaEnrollment | null>;

  /** Update enrollment fields. */
  updateEnrollment(id: string, orgSlug: string, updates: MfaEnrollmentUpdate): Promise<MfaResult<MfaEnrollment>>;

  /** Disable (soft-delete) an enrollment. */
  disableEnrollment(orgSlug: string, userId: string, method: MfaMethod): Promise<MfaResult<{ disabled: boolean }>>;

  /** List all enrollments for a user. */
  listEnrollments(orgSlug: string, userId: string): Promise<MfaEnrollment[]>;

  /** List all enrollments by status for a tenant. */
  listEnrollmentsByStatus(orgSlug: string, status: MfaStatus): Promise<MfaEnrollment[]>;

  /** Count enrollments by status for a tenant. */
  countEnrollments(orgSlug: string, status?: MfaStatus): Promise<number>;

  /** Save hashed recovery codes for a user. */
  saveRecoveryCodes(orgSlug: string, userId: string, codeHashes: string[]): Promise<MfaResult<{ count: number }>>;

  /** Get all recovery code records for a user. */
  getRecoveryCodes(orgSlug: string, userId: string): Promise<MfaRecoveryCodeRecord[]>;

  /** Mark a specific recovery code as used. */
  markRecoveryCodeUsed(orgSlug: string, userId: string, codeId: string): Promise<MfaResult<{ marked: boolean }>>;

  /** Delete all recovery codes for a user (e.g., when regenerating). */
  deleteRecoveryCodes(orgSlug: string, userId: string): Promise<MfaResult<{ deleted: number }>>;
}

// ── InMemoryMfaRepository ─────────────────────────────────────────────────────

let _idCounter = 0;
function _genId(): string {
  return `mem-mfa-${Date.now()}-${++_idCounter}`;
}

export class InMemoryMfaRepository implements MfaRepository {
  private readonly _enrollments: Map<string, MfaEnrollment> = new Map();
  private readonly _codes: Map<string, MfaRecoveryCodeRecord[]> = new Map();

  private _enrollKey(orgSlug: string, userId: string, method: MfaMethod): string {
    return `${orgSlug}::${userId}::${method}`;
  }

  private _codesKey(orgSlug: string, userId: string): string {
    return `${orgSlug}::${userId}`;
  }

  async saveEnrollment(enrollment: MfaEnrollment): Promise<MfaResult<MfaEnrollment>> {
    const key = this._enrollKey(enrollment.orgSlug, enrollment.userId, enrollment.method);
    this._enrollments.set(key, { ...enrollment });
    return { ok: true, value: { ...enrollment } };
  }

  async getEnrollment(orgSlug: string, userId: string, method: MfaMethod): Promise<MfaEnrollment | null> {
    const key = this._enrollKey(orgSlug, userId, method);
    return this._enrollments.get(key) ?? null;
  }

  async updateEnrollment(id: string, orgSlug: string, updates: MfaEnrollmentUpdate): Promise<MfaResult<MfaEnrollment>> {
    for (const [, enrollment] of this._enrollments) {
      if (enrollment.id === id && enrollment.orgSlug === orgSlug) {
        const updated = { ...enrollment, ...updates };
        const key = this._enrollKey(orgSlug, enrollment.userId, enrollment.method);
        this._enrollments.set(key, updated);
        return { ok: true, value: { ...updated } };
      }
    }
    return { ok: false, error: "enrollment_not_found", riskLevel: "HIGH" };
  }

  async disableEnrollment(orgSlug: string, userId: string, method: MfaMethod): Promise<MfaResult<{ disabled: boolean }>> {
    const key = this._enrollKey(orgSlug, userId, method);
    const enrollment = this._enrollments.get(key);
    if (!enrollment) return { ok: false, error: "enrollment_not_found", riskLevel: "HIGH" };
    this._enrollments.set(key, { ...enrollment, status: "DISABLED" });
    return { ok: true, value: { disabled: true } };
  }

  async listEnrollments(orgSlug: string, userId: string): Promise<MfaEnrollment[]> {
    return Array.from(this._enrollments.values()).filter(
      e => e.orgSlug === orgSlug && e.userId === userId,
    );
  }

  async listEnrollmentsByStatus(orgSlug: string, status: MfaStatus): Promise<MfaEnrollment[]> {
    return Array.from(this._enrollments.values()).filter(
      e => e.orgSlug === orgSlug && e.status === status,
    );
  }

  async countEnrollments(orgSlug: string, status?: MfaStatus): Promise<number> {
    return Array.from(this._enrollments.values()).filter(
      e => e.orgSlug === orgSlug && (status ? e.status === status : true),
    ).length;
  }

  async saveRecoveryCodes(orgSlug: string, userId: string, codeHashes: string[]): Promise<MfaResult<{ count: number }>> {
    const key   = this._codesKey(orgSlug, userId);
    const now   = new Date().toISOString();
    const codes: MfaRecoveryCodeRecord[] = codeHashes.map(h => ({
      id:        _genId(),
      orgSlug,
      userId,
      codeHash:  h,
      createdAt: now,
    }));
    this._codes.set(key, codes);
    return { ok: true, value: { count: codes.length } };
  }

  async getRecoveryCodes(orgSlug: string, userId: string): Promise<MfaRecoveryCodeRecord[]> {
    return this._codes.get(this._codesKey(orgSlug, userId)) ?? [];
  }

  async markRecoveryCodeUsed(orgSlug: string, userId: string, codeId: string): Promise<MfaResult<{ marked: boolean }>> {
    const key   = this._codesKey(orgSlug, userId);
    const codes = this._codes.get(key) ?? [];
    const idx   = codes.findIndex(c => c.id === codeId);
    if (idx === -1) return { ok: false, error: "code_not_found", riskLevel: "HIGH" };
    codes[idx] = { ...codes[idx], usedAt: new Date().toISOString() };
    this._codes.set(key, codes);
    return { ok: true, value: { marked: true } };
  }

  async deleteRecoveryCodes(orgSlug: string, userId: string): Promise<MfaResult<{ deleted: number }>> {
    const key   = this._codesKey(orgSlug, userId);
    const codes = this._codes.get(key) ?? [];
    const count = codes.length;
    this._codes.delete(key);
    return { ok: true, value: { deleted: count } };
  }

  /** Reset for testing. */
  clear(): void {
    this._enrollments.clear();
    this._codes.clear();
  }
}

export const inMemoryMfaRepository = new InMemoryMfaRepository();
