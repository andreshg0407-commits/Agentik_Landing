import { prisma } from "@/lib/prisma";

// Safely extracts known traceability fields from contentJson.
// contentJson is Prisma.JsonValue — we narrow it to a plain object.
export function extractTraceability(contentJson: unknown): {
  sourceType: string | null;
  sourceId: string | null;
  runId: string | null;
  indexedAt: string | null;
  indexedBy: string | null;
} {
  const empty = { sourceType: null, sourceId: null, runId: null, indexedAt: null, indexedBy: null };
  if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) return empty;
  const j = contentJson as Record<string, unknown>;
  return {
    sourceType: typeof j.sourceType === "string" ? j.sourceType : null,
    sourceId:   typeof j.sourceId   === "string" ? j.sourceId   : null,
    runId:      typeof j.runId      === "string" ? j.runId      : null,
    indexedAt:  typeof j.indexedAt  === "string" ? j.indexedAt  : null,
    indexedBy:  typeof j.indexedBy  === "string" ? j.indexedBy  : null,
  };
}

export interface KnowledgeSearchFilters {
  query?: string;  // searches title + content (case-insensitive)
  tag?: string;    // exact match on a tag value
}

export async function listKnowledgeItems(
  organizationId: string,
  filters: KnowledgeSearchFilters = {}
) {
  const { query, tag } = filters;

  return prisma.knowledgeItem.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(query
        ? {
            OR: [
              { title:   { contains: query, mode: "insensitive" } },
              { content: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(tag ? { tags: { has: tag } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      content: true,
      tags: true,
      contentJson: true,
      createdAt: true,
    },
  });
}

export async function getKnowledgeItem(knowledgeId: string, organizationId: string) {
  return prisma.knowledgeItem.findFirst({
    where: { id: knowledgeId, organizationId, deletedAt: null },
    select: {
      id: true,
      title: true,
      content: true,
      tags: true,
      contentJson: true,
      createdAt: true,
      updatedAt: true,
      project: { select: { id: true, name: true, key: true } },
    },
  });
}
