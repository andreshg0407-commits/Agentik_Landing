import { RunStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createDocumentIndexedEvent } from "./knowledge-events";

function deriveContent(doc: {
  description: string | null;
  category: string | null;
}): string | null {
  const parts: string[] = [];
  if (doc.description?.trim()) parts.push(doc.description.trim());
  if (doc.category?.trim()) parts.push(`Category: ${doc.category.trim()}`);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

export async function indexDocumentAsKnowledge(
  documentId: string,
  organizationId: string,
  userId: string
) {
  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId, deletedAt: null },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      projectId: true,
    },
  });

  if (!document) throw new Error("DOCUMENT_NOT_FOUND");

  const content = deriveContent(document);
  if (!content) throw new Error("NO_USABLE_CONTENT");

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    // 1. Create Run to record the indexing operation
    const run = await tx.run.create({
      data: {
        organizationId,
        projectId: document.projectId ?? null,
        type: "document.index",
        status: RunStatus.RUNNING,
        startedAt: now,
      },
      select: { id: true },
    });

    // 2. Create KnowledgeItem
    // sourceType/sourceId stored in contentJson and tags for traceability
    // since KnowledgeItem has no dedicated sourceType/sourceId fields
    const knowledgeItem = await tx.knowledgeItem.create({
      data: {
        organizationId,
        projectId: document.projectId ?? null,
        title: document.title,
        content,
        contentJson: {
          sourceType: "document",
          sourceId: document.id,
          runId: run.id,
          indexedAt: now.toISOString(),
          indexedBy: userId,
        },
        tags: [`source:document`, `documentId:${document.id}`],
      },
      select: { id: true, title: true, content: true, createdAt: true },
    });

    // 3. Mark Run as SUCCEEDED
    await tx.run.update({
      where: { id: run.id },
      data: { status: RunStatus.SUCCEEDED, endedAt: now },
    });

    // 4. Emit document.indexed event
    await createDocumentIndexedEvent(tx, {
      organizationId,
      projectId: document.projectId ?? null,
      documentId: document.id,
      knowledgeItemId: knowledgeItem.id,
      runId: run.id,
      actorUserId: userId,
      now,
    });

    return knowledgeItem;
  });
}
