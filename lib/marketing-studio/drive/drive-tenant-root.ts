/**
 * lib/marketing-studio/drive/drive-tenant-root.ts
 *
 * MARKETING-DRIVE-BULK-ASSET-INGESTION-04A — Drive Tenant Root
 *
 * Stores and resolves the tenant's authorized Drive root folder.
 * Uses IntegrationResource (provider=google_drive, resourceType=root_folder)
 * linked to the org's IntegrationConnection. No migration needed.
 *
 * SECURITY:
 * - tenantRootFolderId resolved server-side by organizationId
 * - Client cannot substitute tenantRootFolderId
 * - Set by AGENTIK_ADMIN/ORG_ADMIN only
 * - Associated to a specific Google Drive connection
 * - No secrets stored (only folderId + folderName)
 */

import { prisma } from "@/lib/prisma";

const DRIVE_PROVIDER   = "google_drive";
const ROOT_FOLDER_TYPE = "root_folder";

export interface TenantDriveRoot {
  folderId:     string;
  folderName:   string;
  connectionId: string;
  resourceId:   string;
}

/**
 * Resolves the tenant's authorized Drive root folder.
 * Returns null if no root is configured.
 */
export async function getTenantDriveRoot(
  organizationId: string,
): Promise<TenantDriveRoot | null> {
  const resource = await prisma.integrationResource.findFirst({
    where: {
      organizationId,
      provider:     DRIVE_PROVIDER,
      resourceType: ROOT_FOLDER_TYPE,
      selected:     true,
    },
    select: {
      id:           true,
      externalId:   true,
      externalName: true,
      connectionId: true,
      metadataJson: true,
    },
  });

  if (!resource || !resource.connectionId) return null;

  return {
    folderId:     resource.externalId,
    folderName:   resource.externalName,
    connectionId: resource.connectionId,
    resourceId:   resource.id,
  };
}

/**
 * Sets the tenant's authorized Drive root folder.
 * Upserts an IntegrationResource with the folder info.
 * Only callable by AGENTIK_ADMIN/ORG_ADMIN (enforced by caller).
 */
export async function setTenantDriveRoot(params: {
  organizationId: string;
  connectionId:   string;
  folderId:       string;
  folderName:     string;
}): Promise<TenantDriveRoot> {
  const { organizationId, connectionId, folderId, folderName } = params;

  // Deselect any existing root for this org
  await prisma.integrationResource.updateMany({
    where: {
      organizationId,
      provider:     DRIVE_PROVIDER,
      resourceType: ROOT_FOLDER_TYPE,
      selected:     true,
    },
    data: { selected: false },
  });

  // Upsert the new root
  const resource = await prisma.integrationResource.upsert({
    where: {
      organizationId_provider_externalId: {
        organizationId,
        provider:   DRIVE_PROVIDER,
        externalId: folderId,
      },
    },
    create: {
      organizationId,
      connectionId,
      provider:     DRIVE_PROVIDER,
      resourceType: ROOT_FOLDER_TYPE,
      externalId:   folderId,
      externalName: folderName,
      selected:     true,
      metadataJson: { setAt: new Date().toISOString(), setBy: "admin" },
    },
    update: {
      connectionId,
      externalName: folderName,
      selected:     true,
      metadataJson: { setAt: new Date().toISOString(), setBy: "admin" },
    },
  });

  return {
    folderId,
    folderName,
    connectionId,
    resourceId: resource.id,
  };
}
