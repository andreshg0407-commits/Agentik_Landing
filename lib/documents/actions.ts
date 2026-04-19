import { DocumentType, EventStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface CreateDocumentParams {
  organizationId: string;
  workspaceId?: string | null;
  projectId?: string | null;
  type: DocumentType;
  title: string;
  description?: string | null;
  // Optional file to link: creates a FileObject and links it
  file?: {
    name: string;
    url: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
  } | null;
}

export async function createDocument(
  params: CreateDocumentParams,
  actorUserId: string
) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    // 1. Optionally create FileObject
    let fileObjectId: string | null = null;
    if (params.file?.url) {
      const fileObj = await tx.fileObject.create({
        data: {
          organizationId: params.organizationId,
          projectId: params.projectId ?? null,
          name: params.file.name,
          url: params.file.url,
          mimeType: params.file.mimeType ?? null,
          sizeBytes: params.file.sizeBytes ?? null,
        },
        select: { id: true },
      });
      fileObjectId = fileObj.id;
    }

    // 2. Create Document
    const document = await tx.document.create({
      data: {
        organizationId: params.organizationId,
        workspaceId: params.workspaceId ?? null,
        projectId: params.projectId ?? null,
        fileObjectId,
        type: params.type,
        title: params.title,
        description: params.description ?? null,
        createdById: actorUserId,
      },
      select: { id: true, title: true, type: true, status: true, createdAt: true },
    });

    // 3. Emit document.created event
    await tx.event.create({
      data: {
        organizationId: params.organizationId,
        projectId: params.projectId ?? null,
        type: "document.created",
        sourceType: "user",
        sourceId: actorUserId,
        payloadJson: {
          documentId: document.id,
          title: document.title,
          documentType: document.type,
          actorUserId,
          workspaceId: params.workspaceId ?? null,
          projectId: params.projectId ?? null,
        },
        status: EventStatus.PROCESSED,
        processedAt: now,
      },
    });

    return document;
  });
}
