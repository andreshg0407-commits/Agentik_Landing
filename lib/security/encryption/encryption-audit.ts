/**
 * lib/security/encryption/encryption-audit.ts
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * Encryption Foundation — Encryption Audit Log
 *
 * Records all encryption and decryption operations for auditability.
 * Integrates with the persistent audit layer from
 * AGENTIK-SECURITY-AUDIT-PERSISTENCE-01.
 *
 * Rules:
 *   - NEVER log plaintext data
 *   - NEVER log ciphertext (unnecessary and wastes storage)
 *   - NEVER log key material
 *   - Log: tenant, asset type, key version, result, duration
 *   - All events are fire-and-forget (never block operations)
 *
 * No Prisma. No server-only. Pure audit domain.
 */

// ── Encryption Audit Event Types ──────────────────────────────────────────────

/**
 * All audit event types for the encryption layer.
 */
export type EncryptionAuditEventType =
  | "DATA_ENCRYPTED"
  | "DATA_DECRYPTED"
  | "DECRYPTION_DENIED"
  | "INVALID_PAYLOAD"
  | "KEY_VERSION_MISMATCH";

// ── Encryption Audit Event ────────────────────────────────────────────────────

/**
 * EncryptionAuditEvent — a record of one encryption or decryption operation.
 *
 * NEVER includes:
 *   - Plaintext
 *   - Ciphertext
 *   - Key material
 */
export interface EncryptionAuditEvent {
  /** Unique ID for this event. */
  id:          string;
  /** Event type. */
  type:        EncryptionAuditEventType;
  /** Tenant that triggered the operation. */
  orgSlug:     string;
  /** The encrypted asset type (e.g., "COPILOT_MEMORY", "PLAYBOOK"). */
  assetType:   string;
  /** Key version used or attempted. */
  keyVersion:  string;
  /** Whether the operation succeeded. */
  success:     boolean;
  /** Failure reason (safe — no secrets). */
  reason?:     string;
  /** Duration in milliseconds. */
  durationMs:  number;
  /** ISO 8601 timestamp. */
  occurredAt:  string;
}

// ── In-memory Audit Log ───────────────────────────────────────────────────────

/**
 * EncryptionAuditLog — in-memory, append-only log of encryption events.
 * Thread-safe for single-process use (Node.js is single-threaded).
 * Integrates with PersistentAuditService via fire-and-forget adapter.
 */
export class EncryptionAuditLog {
  private readonly _entries: EncryptionAuditEvent[] = [];
  private readonly _maxSize: number;

  constructor(maxSize = 1000) {
    this._maxSize = maxSize;
  }

  /** Record an encryption audit event. Never throws. */
  push(event: EncryptionAuditEvent): void {
    try {
      if (this._entries.length >= this._maxSize) {
        this._entries.shift(); // drop oldest
      }
      this._entries.push(event);
    } catch {
      // never throws
    }
  }

  /** Get all events for a tenant. Never throws. */
  getByTenant(orgSlug: string): EncryptionAuditEvent[] {
    try {
      return this._entries.filter(e => e.orgSlug === orgSlug);
    } catch {
      return [];
    }
  }

  /** Get the N most recent events. Never throws. */
  getRecent(limit = 50): EncryptionAuditEvent[] {
    try {
      return this._entries.slice(-limit).reverse();
    } catch {
      return [];
    }
  }

  /** Get events by type. Never throws. */
  getByType(type: EncryptionAuditEventType): EncryptionAuditEvent[] {
    try {
      return this._entries.filter(e => e.type === type);
    } catch {
      return [];
    }
  }

  /** Get failure events. Never throws. */
  getFailures(): EncryptionAuditEvent[] {
    try {
      return this._entries.filter(e => !e.success);
    } catch {
      return [];
    }
  }

  /** Total events recorded. */
  get size(): number {
    return this._entries.length;
  }

  /** Reset — for tests only. */
  _reset(): void {
    this._entries.length = 0;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/** Global in-memory encryption audit log. */
export const globalEncryptionAuditLog = new EncryptionAuditLog();

// ── Event Factory ─────────────────────────────────────────────────────────────

let _counter = 0;

/**
 * Create an EncryptionAuditEvent.
 * Never includes plaintext, ciphertext, or key material.
 */
export function createEncryptionAuditEvent(params: {
  type:        EncryptionAuditEventType;
  orgSlug:     string;
  assetType:   string;
  keyVersion:  string;
  success:     boolean;
  reason?:     string;
  durationMs:  number;
}): EncryptionAuditEvent {
  return {
    id:         `enc-audit-${Date.now()}-${++_counter}`,
    type:       params.type,
    orgSlug:    params.orgSlug,
    assetType:  params.assetType,
    keyVersion: params.keyVersion,
    success:    params.success,
    reason:     params.reason,
    durationMs: params.durationMs,
    occurredAt: new Date().toISOString(),
  };
}

// ── Persistent Adapter ────────────────────────────────────────────────────────

/**
 * PersistentEncryptionAuditAdapter — bridges EncryptionAuditLog to the
 * Persistent Security Audit layer (AGENTIK-SECURITY-AUDIT-PERSISTENCE-01).
 *
 * Fire-and-forget: never blocks the caller.
 * Lazy: imports PersistentAuditService only when first event fires.
 */
export class PersistentEncryptionAuditAdapter extends EncryptionAuditLog {
  override push(event: EncryptionAuditEvent): void {
    super.push(event);
    void this._persist(event);
  }

  private async _persist(event: EncryptionAuditEvent): Promise<void> {
    try {
      const { getPersistentAuditService } = await import(
        "@/lib/security/audit-persistence/persistent-audit-service"
      );
      const svc = getPersistentAuditService();
      await svc.recordEvent({
        orgSlug:   event.orgSlug,
        eventType: this._toPersistentType(event.type) as any,
        category:  "SYSTEM",
        severity:  event.success ? "LOW" : "HIGH",
        metadata:  {
          encryptionAuditType: event.type,
          assetType:           event.assetType,
          keyVersion:          event.keyVersion,
          durationMs:          String(event.durationMs),
          reason:              event.reason ?? "",
        },
      });
    } catch {
      // fire-and-forget — never throws
    }
  }

  private _toPersistentType(type: EncryptionAuditEventType): string {
    const map: Record<EncryptionAuditEventType, string> = {
      DATA_ENCRYPTED:       "DATA_WRITE",
      DATA_DECRYPTED:       "DATA_READ",
      DECRYPTION_DENIED:    "ACCESS_DENIED",
      INVALID_PAYLOAD:      "POLICY_VIOLATION",
      KEY_VERSION_MISMATCH: "POLICY_VIOLATION",
    };
    return map[type] ?? "SYSTEM_ERROR";
  }
}

/** Global persistent encryption audit adapter singleton. */
export const persistentEncryptionAuditAdapter = new PersistentEncryptionAuditAdapter();
