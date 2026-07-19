import { EventStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Tx = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export async function createDocumentIndexedEvent(
  tx: Tx,
  params: {
    organizationId: string;
    projectId: string | null;
    documentId: string;
    knowledgeItemId: string;
    runId: string;
    actorUserId: string;
    now: Date;
  }
) {
  await tx.event.create({
    data: {
      organizationId: params.organizationId,
      projectId: params.projectId,
      type: "document.indexed",
      sourceType: "user",
      sourceId: params.actorUserId,
      payloadJson: {
        documentId: params.documentId,
        knowledgeItemId: params.knowledgeItemId,
        runId: params.runId,
        actorUserId: params.actorUserId,
      },
      status: EventStatus.PROCESSED,
      processedAt: params.now,
    },
  });
}
