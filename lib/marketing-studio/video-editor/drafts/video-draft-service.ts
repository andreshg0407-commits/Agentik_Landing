/**
 * lib/marketing-studio/video-editor/drafts/video-draft-service.ts
 *
 * MARKETING-VIDEO-DRAFT-WORKSPACE-01 — Draft Service
 *
 * Persists video editor drafts as AgentExecution rows:
 *   module:    "marketing_studio"
 *   operation: "VIDEO_DRAFT"
 *   status:    matches VideoDraftStatus
 *   metadataJson: full VideoDraft payload (minus id/organizationId/createdAt)
 *
 * No Prisma migration required — reuses the existing AgentExecution table.
 * Tenant boundary: every query filters by tenantId === organizationId.
 *
 * Server-only — never import from client components.
 */

import "server-only";

import { prisma }               from "@/lib/prisma";
import type {
  VideoDraft,
  VideoDraftStatus,
  CreateVideoDraftInput,
  UpdateVideoDraftInput,
  MarkDraftExportedInput,
}                                from "./video-draft-types";

// ── Constants ─────────────────────────────────────────────────────────────────

const MODULE    = "marketing_studio" as const;
const OPERATION = "VIDEO_DRAFT"     as const;

// ── DB helper ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => (prisma as any).agentExecution;

// ── Row → VideoDraft ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToDraft(row: any): VideoDraft {
  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  return {
    id:              row.id,
    organizationId:  row.tenantId,
    nombre:          (meta.nombre        as string)        ?? "Sin nombre",
    status:          (row.status         as VideoDraftStatus),
    source:          (meta.source        as "local_file" | "biblioteca") ?? "local_file",
    videoUrl:        (meta.videoUrl      as string)        ?? "",
    assetPadreId:    (meta.assetPadreId  as string | null) ?? null,
    config:          (meta.config        as VideoDraft["config"]) ?? {} as VideoDraft["config"],
    referenceSku:    (meta.referenceSku  as string | null) ?? null,
    referenceName:   (meta.referenceName as string | null) ?? null,
    createdAt:       row.createdAt instanceof Date
                       ? row.createdAt.toISOString()
                       : String(row.createdAt),
    updatedAt:       row.updatedAt instanceof Date
                       ? row.updatedAt.toISOString()
                       : row.createdAt instanceof Date
                         ? row.createdAt.toISOString()
                         : String(row.createdAt),
    exportedAt:      (meta.exportedAt    as string | null) ?? null,
    exportedAssetId: (meta.exportedAssetId as string | null) ?? null,
    createdBy:       row.createdBy       ?? "usuario",
  };
}

// ── createVideoDraft ──────────────────────────────────────────────────────────

export async function createVideoDraft(
  input: CreateVideoDraftInput,
): Promise<VideoDraft> {
  const row = await db().create({
    data: {
      tenantId:    input.organizationId,
      module:      MODULE,
      operation:   OPERATION,
      status:      "draft" satisfies VideoDraftStatus,
      intent:      `Borrador: ${input.nombre.slice(0, 100)}`,
      createdBy:   input.createdBy,
      metadataJson: {
        nombre:        input.nombre,
        source:        input.source,
        videoUrl:      input.videoUrl,
        assetPadreId:  input.assetPadreId,
        config:        input.config,
        referenceSku:  input.referenceSku,
        referenceName: input.referenceName,
        exportedAt:      null,
        exportedAssetId: null,
      },
    },
  });
  return rowToDraft(row);
}

// ── updateVideoDraft ──────────────────────────────────────────────────────────

export async function updateVideoDraft(
  draftId:        string,
  organizationId: string,
  input:          UpdateVideoDraftInput,
): Promise<VideoDraft | null> {
  const existing = await db().findFirst({
    where: {
      id:        draftId,
      tenantId:  organizationId,
      module:    MODULE,
      operation: OPERATION,
    },
  });
  if (!existing) return null;

  const prevMeta = (existing.metadataJson ?? {}) as Record<string, unknown>;

  const updatedMeta: Record<string, unknown> = {
    ...prevMeta,
    ...(input.nombre        !== undefined ? { nombre:        input.nombre }        : {}),
    ...(input.videoUrl      !== undefined ? { videoUrl:      input.videoUrl }      : {}),
    ...(input.config        !== undefined ? { config:        input.config }        : {}),
    ...(input.referenceSku  !== undefined ? { referenceSku:  input.referenceSku }  : {}),
    ...(input.referenceName !== undefined ? { referenceName: input.referenceName } : {}),
  };

  // Update intent label if nombre changed
  const nombre = (input.nombre ?? prevMeta.nombre as string ?? "Sin nombre").slice(0, 100);

  const row = await db().update({
    where: { id: draftId },
    data: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      intent:       `Borrador: ${nombre}`,
      metadataJson: updatedMeta,
    },
  });
  return rowToDraft(row);
}

// ── getVideoDraft ──────────────────────────────────────────────────────────────

export async function getVideoDraft(
  draftId:        string,
  organizationId: string,
): Promise<VideoDraft | null> {
  const row = await db().findFirst({
    where: {
      id:        draftId,
      tenantId:  organizationId,
      module:    MODULE,
      operation: OPERATION,
    },
  });
  return row ? rowToDraft(row) : null;
}

// ── listVideoDrafts ────────────────────────────────────────────────────────────

export async function listVideoDrafts(
  organizationId: string,
  opts?: { limit?: number; includeExported?: boolean },
): Promise<VideoDraft[]> {
  const limit           = Math.min(opts?.limit ?? 20, 50);
  const includeExported = opts?.includeExported ?? false;

  const statusFilter = includeExported
    ? { notIn: ["abandoned"] }
    : { in: ["draft", "ready_to_export"] };

  const rows = await db().findMany({
    where: {
      tenantId:  organizationId,
      module:    MODULE,
      operation: OPERATION,
      status:    statusFilter,
    },
    orderBy: { createdAt: "desc" },
    take:    limit,
  });
  return rows.map(rowToDraft);
}

// ── markDraftExported ─────────────────────────────────────────────────────────

export async function markDraftExported(
  draftId:        string,
  organizationId: string,
  input:          MarkDraftExportedInput,
): Promise<VideoDraft | null> {
  const existing = await db().findFirst({
    where: {
      id:        draftId,
      tenantId:  organizationId,
      module:    MODULE,
      operation: OPERATION,
    },
  });
  if (!existing) return null;

  const prevMeta = (existing.metadataJson ?? {}) as Record<string, unknown>;
  const exportedAt = new Date().toISOString();

  const row = await db().update({
    where: { id: draftId },
    data: {
      status: "exported" satisfies VideoDraftStatus,
      metadataJson: {
        ...prevMeta,
        exportedAt,
        exportedAssetId: input.exportedAssetId,
      },
    },
  });
  return rowToDraft(row);
}

// ── deleteVideoDraft ──────────────────────────────────────────────────────────

export async function deleteVideoDraft(
  draftId:        string,
  organizationId: string,
): Promise<boolean> {
  const existing = await db().findFirst({
    where: {
      id:        draftId,
      tenantId:  organizationId,
      module:    MODULE,
      operation: OPERATION,
    },
  });
  if (!existing) return false;

  // Soft-delete: mark as abandoned rather than physically deleting
  await db().update({
    where: { id: draftId },
    data:  { status: "abandoned" satisfies VideoDraftStatus },
  });
  return true;
}
