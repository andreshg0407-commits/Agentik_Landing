/**
 * CursorStore — persists incremental sync position per connector × module.
 *
 * A cursor is an opaque string that the adapter knows how to interpret
 * (ISO timestamp, page token, sequential offset, etc.).
 * The SyncEngine never parses cursors — it stores and forwards them blindly.
 *
 * Backed by ConnectorCursor (Prisma). Survives process restarts.
 */

import { prisma } from "@/lib/prisma";

class CursorStore {
  /**
   * Retrieve the last persisted cursor for a module.
   * Returns `null` if no prior sync has completed (triggers full sync).
   */
  async get(connectorId: string, module: string): Promise<string | null> {
    const row = await prisma.connectorCursor.findUnique({
      where:  { connectorId_module: { connectorId, module } },
      select: { cursor: true },
    });
    return row?.cursor ?? null;
  }

  /**
   * Persist a new cursor value (upsert).
   * Called by the SyncEngine after each successful page.
   */
  async set(connectorId: string, module: string, cursor: string): Promise<void> {
    const orgId = await this._orgId(connectorId);
    await prisma.connectorCursor.upsert({
      where:  { connectorId_module: { connectorId, module } },
      update: { cursor },
      create: { connectorId, organizationId: orgId, module, cursor },
    });
  }

  /**
   * Delete the cursor for a single module (triggers full re-sync on next run).
   */
  async clear(connectorId: string, module: string): Promise<void> {
    await prisma.connectorCursor.deleteMany({ where: { connectorId, module } });
  }

  /**
   * Delete ALL cursors for a connector (full reset across all modules).
   */
  async clearAll(connectorId: string): Promise<void> {
    await prisma.connectorCursor.deleteMany({ where: { connectorId } });
  }

  private async _orgId(connectorId: string): Promise<string> {
    const c = await prisma.connector.findUniqueOrThrow({
      where:  { id: connectorId },
      select: { organizationId: true },
    });
    return c.organizationId;
  }
}

export const cursorStore = new CursorStore();
