/**
 * lib/security/mfa/session-binding.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA Session Binding — Associate MFA Verification with a Session
 *
 * No server-only. Pure domain logic. No DB.
 *
 * Prevents MFA verification replay across sessions.
 * Binds: userId + orgSlug + sessionId + method + verifiedAt.
 *
 * In production, MFA verification tokens should be stored in the session store
 * (e.g., NextAuth session JWT claims) not in-memory here.
 * This module provides the domain contract and an in-memory map for development.
 */

import type { MfaMethod } from "./mfa-types";
import { MFA_CHALLENGE_TTL_SECONDS } from "./mfa-types";

// ── Session MFA Token ─────────────────────────────────────────────────────────

export interface SessionMfaToken {
  /** Composite key: orgSlug + userId + sessionId */
  bindingKey:  string;
  orgSlug:     string;
  userId:      string;
  sessionId:   string;
  method:      MfaMethod;
  verifiedAt:  string;    // ISO 8601
  expiresAt:   string;    // ISO 8601
  challengeId: string;
}

// ── Session Binding Store ─────────────────────────────────────────────────────

class MfaSessionBindingStore {
  private readonly _tokens: Map<string, SessionMfaToken> = new Map();

  private _key(orgSlug: string, userId: string, sessionId: string): string {
    return `${orgSlug}::${userId}::${sessionId}`;
  }

  /**
   * bind — record that MFA was verified for a session.
   * TTL is enforced at read time.
   */
  bind(
    orgSlug:     string,
    userId:      string,
    sessionId:   string,
    method:      MfaMethod,
    challengeId: string,
    ttlSeconds:  number = MFA_CHALLENGE_TTL_SECONDS * 6,  // 30 minutes default
  ): SessionMfaToken {
    const now       = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

    const token: SessionMfaToken = {
      bindingKey:  this._key(orgSlug, userId, sessionId),
      orgSlug,
      userId,
      sessionId,
      method,
      verifiedAt:  now.toISOString(),
      expiresAt,
      challengeId,
    };

    this._tokens.set(token.bindingKey, token);
    return token;
  }

  /**
   * isBound — check if MFA is currently verified for this session.
   * Returns false if not found or expired.
   */
  isBound(orgSlug: string, userId: string, sessionId: string): boolean {
    const token = this.resolve(orgSlug, userId, sessionId);
    return token !== null;
  }

  /**
   * resolve — retrieve the active MFA token for a session.
   * Returns null if not found or expired.
   */
  resolve(orgSlug: string, userId: string, sessionId: string): SessionMfaToken | null {
    const key   = this._key(orgSlug, userId, sessionId);
    const token = this._tokens.get(key);
    if (!token) return null;

    // Enforce expiry
    if (new Date(token.expiresAt) <= new Date()) {
      this._tokens.delete(key);
      return null;
    }

    return token;
  }

  /**
   * revoke — remove MFA verification for a session (e.g., on logout).
   */
  revoke(orgSlug: string, userId: string, sessionId: string): void {
    this._tokens.delete(this._key(orgSlug, userId, sessionId));
  }

  /**
   * revokeAll — revoke all sessions for a user (e.g., on MFA disable).
   */
  revokeAll(orgSlug: string, userId: string): void {
    for (const [key, token] of this._tokens) {
      if (token.orgSlug === orgSlug && token.userId === userId) {
        this._tokens.delete(key);
      }
    }
  }

  count(): number {
    return this._tokens.size;
  }

  /** Reset for testing. */
  clear(): void {
    this._tokens.clear();
  }
}

/** Singleton session binding store. */
export const mfaSessionStore = new MfaSessionBindingStore();

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * buildSessionId — generate a deterministic session ID from available context.
 * In production this should be the NextAuth session token or JWT jti.
 */
export function buildSessionId(userId: string, requestId: string): string {
  return `session:${userId}:${requestId}`;
}

/**
 * isMfaValid — check if MFA is currently satisfied for a session binding.
 */
export function isMfaValid(
  orgSlug:   string,
  userId:    string,
  sessionId: string,
): boolean {
  return mfaSessionStore.isBound(orgSlug, userId, sessionId);
}
