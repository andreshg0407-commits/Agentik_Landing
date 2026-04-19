import { prisma } from "@/lib/prisma";

export type DocumentAlert = {
  id:         string;
  type:       string;
  title:      string;
  severity:   string;
  status:     string;
  createdAt:  Date;
  resolvedAt: Date | null;
};

export async function getDocumentAlerts(
  documentId:    string,
  organizationId: string
): Promise<DocumentAlert[]> {
  return prisma.alert.findMany({
    where: {
      organizationId,
      metadataJson: { path: ["documentId"], equals: documentId },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id:         true,
      type:       true,
      title:      true,
      severity:   true,
      status:     true,
      createdAt:  true,
      resolvedAt: true,
    },
  }) as Promise<DocumentAlert[]>;
}

const workspaceSelect = { id: true, name: true, slug: true } as const;
const projectSelect = { id: true, name: true, key: true } as const;
const fileSelect = { name: true, mimeType: true, sizeBytes: true, url: true } as const;

export async function listDocuments(organizationId: string) {
  return prisma.document.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      createdAt: true,
      workspace: { select: workspaceSelect },
      project: { select: projectSelect },
    },
  });
}

export async function getDocument(documentId: string, organizationId: string) {
  return prisma.document.findFirst({
    where: { id: documentId, organizationId, deletedAt: null },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      category: true,
      description: true,
      documentDate: true,
      amount: true,
      currency: true,
      issuerName: true,
      issuerId: true,
      receiverName: true,
      receiverId: true,
      extractedJson: true,
      createdAt: true,
      updatedAt: true,
      workspace: { select: workspaceSelect },
      project: { select: projectSelect },
      file: { select: fileSelect },
    },
  });
}
