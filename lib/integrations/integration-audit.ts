/**
 * lib/integrations/integration-audit.ts
 *
 * MS-10 — Integration Audit Layer
 *
 * Records integration lifecycle events to the database.
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   NEVER log token values, secrets, or credentials in event payloads.
 *   Payloads must contain only safe metadata:
 *     provider, connectionId, externalAccountId, statusCode, scopes, etc.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   recordIntegrationAuditEvent() is fire-and-forget.
 *   Audit failures must NOT interrupt the calling operation.
 *   Server-side only — never import from client components.
 */

import type { IntegrationEventType } from "./integration-events";
import { prisma } from "@/lib/prisma";

// ── Input type ────────────────────────────────────────────────────────────────

export interface AuditEventInput {
  organizationId: string;
  connectionId?:  string | null;
  provider:       string;
  eventType:      IntegrationEventType;
  /** Safe payload — MUST NOT contain token values or secrets */
  payload?:       Record<string, unknown>;
  actorId?:       string | null;
}

// ── Recorder ─────────────────────────────────────────────────────────────────

export async function recordIntegrationAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    await prisma.integrationEvent.create({
      data: {
        organizationId: input.organizationId,
        connectionId:   input.connectionId ?? null,
        provider:       input.provider,
        eventType:      input.eventType,
        payload:        (input.payload ?? {}) as object,
        actorId:        input.actorId ?? null,
        occurredAt:     new Date(),
      },
    });
  } catch {
    // Audit failure is non-fatal — route to observability pipeline in production
    // Do NOT re-throw: never let audit failure break the calling operation
  }
}

// ── Batch recorder ────────────────────────────────────────────────────────────

export async function recordIntegrationAuditEvents(
  events: AuditEventInput[],
): Promise<void> {
  if (events.length === 0) return;
  try {
    await prisma.integrationEvent.createMany({
      data: events.map(input => ({
        organizationId: input.organizationId,
        connectionId:   input.connectionId ?? null,
        provider:       input.provider,
        eventType:      input.eventType,
        payload:        (input.payload ?? {}) as object,
        actorId:        input.actorId ?? null,
        occurredAt:     new Date(),
      })),
    });
  } catch {
    // Non-fatal
  }
}
