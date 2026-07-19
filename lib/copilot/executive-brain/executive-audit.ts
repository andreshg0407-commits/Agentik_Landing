/**
 * lib/copilot/executive-brain/executive-audit.ts
 *
 * Agentik — Executive Brain — Audit Trail
 * Sprint: AGENTIK-EXECUTIVE-BRAIN-01
 *
 * Audit events for all Executive Brain operations.
 * All events are JSON-serializable objects.
 * No Prisma. No persistence yet.
 *
 * Pure domain. No server-only. No React.
 */

// ── Event types ───────────────────────────────────────────────────────────────

export type ExecutiveAuditEventType =
  | "SIGNALS_COLLECTED"
  | "SIGNALS_RANKED"
  | "INSIGHTS_GENERATED"
  | "CONTEXT_BUILT";

// ── Event shape ───────────────────────────────────────────────────────────────

export interface ExecutiveAuditEvent {
  id:         string;
  orgSlug:    string;
  type:       ExecutiveAuditEventType;
  message:    string;
  metadata:   Record<string, unknown>;
  occurredAt: string;
}

// ── ID generator ──────────────────────────────────────────────────────────────

let _seq = 0;

function nextAuditId(): string {
  _seq = (_seq + 1) % 1_000_000;
  return `ebaud-${Date.now()}-${String(_seq).padStart(6, "0")}`;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createExecutiveAuditEvent(
  orgSlug:  string,
  type:     ExecutiveAuditEventType,
  message:  string,
  metadata: Record<string, unknown> = {},
): ExecutiveAuditEvent {
  return {
    id:         nextAuditId(),
    orgSlug,
    type,
    message,
    metadata,
    occurredAt: new Date().toISOString(),
  };
}

// ── Typed event constructors ──────────────────────────────────────────────────

export function auditSignalsCollected(
  orgSlug: string,
  count:   number,
  sources: string[],
): ExecutiveAuditEvent {
  return createExecutiveAuditEvent(
    orgSlug,
    "SIGNALS_COLLECTED",
    `${count} executive signal(s) collected from ${sources.join(", ")}.`,
    { count, sources },
  );
}

export function auditSignalsRanked(
  orgSlug:       string,
  totalBefore:   number,
  totalAfter:    number,
  criticalCount: number,
  highCount:     number,
): ExecutiveAuditEvent {
  return createExecutiveAuditEvent(
    orgSlug,
    "SIGNALS_RANKED",
    `${totalAfter}/${totalBefore} signals retained after ranking. CRITICAL=${criticalCount} HIGH=${highCount}.`,
    { totalBefore, totalAfter, criticalCount, highCount },
  );
}

export function auditInsightsGenerated(
  orgSlug:       string,
  insightCount:  number,
  signalCount:   number,
): ExecutiveAuditEvent {
  return createExecutiveAuditEvent(
    orgSlug,
    "INSIGHTS_GENERATED",
    `${insightCount} insight(s) generated from ${signalCount} signal(s).`,
    { insightCount, signalCount },
  );
}

export function auditContextBuilt(
  orgSlug:      string,
  signalCount:  number,
  insightCount: number,
  durationMs:   number,
): ExecutiveAuditEvent {
  return createExecutiveAuditEvent(
    orgSlug,
    "CONTEXT_BUILT",
    `ExecutiveContext built: ${signalCount} signals, ${insightCount} insights in ${durationMs}ms.`,
    { signalCount, insightCount, durationMs },
  );
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export class ExecutiveAuditLog {
  private _events: ExecutiveAuditEvent[] = [];

  push(event: ExecutiveAuditEvent): void {
    this._events.push(event);
  }

  getAll(): ExecutiveAuditEvent[] {
    return [...this._events];
  }

  getByType(type: ExecutiveAuditEventType): ExecutiveAuditEvent[] {
    return this._events.filter(e => e.type === type);
  }

  getByOrg(orgSlug: string): ExecutiveAuditEvent[] {
    return this._events.filter(e => e.orgSlug === orgSlug);
  }

  count(): number {
    return this._events.length;
  }

  clear(): void {
    this._events = [];
  }
}

// ── Global audit log ──────────────────────────────────────────────────────────

/**
 * Process-level Executive Brain audit log.
 * AGENTIK-SECURITY-AUDIT-PERSISTENCE-01: now also persists via adapter below.
 */
export const globalExecutiveAuditLog = new ExecutiveAuditLog();

// ── Persistent Adapter (AGENTIK-SECURITY-AUDIT-PERSISTENCE-01) ───────────────

/**
 * PersistentExecutiveAuditAdapter
 *
 * Bridge from ExecutiveAuditLog (in-memory) to the persistent audit layer.
 * Persistence is fire-and-forget — never blocks the executive brain operation.
 *
 * Persists: SIGNALS_COLLECTED, SIGNALS_RANKED, INSIGHTS_GENERATED, CONTEXT_BUILT
 */
export class PersistentExecutiveAuditAdapter {
  constructor(private readonly memoryLog: ExecutiveAuditLog) {}

  push(event: ExecutiveAuditEvent): void {
    this.memoryLog.push(event);
    void this._persist(event);
  }

  private async _persist(event: ExecutiveAuditEvent): Promise<void> {
    try {
      const { getPersistentAuditService } = await import(
        "@/lib/security/audit-persistence/persistent-audit-service"
      );
      const svc = getPersistentAuditService();
      await svc.recordEvent({
        orgSlug:   event.orgSlug,
        eventType: event.type as any,
        category:  "EXECUTIVE_BRAIN",
        severity:  "LOW",
        metadata:  { message: event.message, ...event.metadata },
      });
    } catch {
      // Persistence failures must never propagate
    }
  }
}

/** Global persistent executive audit adapter. */
export const persistentExecutiveAuditAdapter = new PersistentExecutiveAuditAdapter(
  globalExecutiveAuditLog,
);
