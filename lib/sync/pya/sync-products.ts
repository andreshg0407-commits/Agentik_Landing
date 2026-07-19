import { RunStatus, EventStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPyaConfig } from "@/lib/connectors/pya/auth";
import { fetchPyaProducts } from "@/lib/connectors/pya/client";
import { mapSagRowToProduct } from "@/lib/connectors/pya/mappers";
import type { PyaConnectorConfig } from "@/lib/connectors/pya/types";

const RUN_TYPE   = "integration.pya.sync_products";
const EVENT_TYPE = "integration.pya.products_synced";
const SOURCE_SYSTEM = "pya";

export interface SyncPyaProductsParams {
  organizationId: string;
  integrationId:  string;
  workspaceId?:   string;
  projectId?:     string;
}

export interface SyncPyaProductsResult {
  runId:  string;
  synced: number;
  failed: number;
}

export async function syncPyaProducts(
  params: SyncPyaProductsParams
): Promise<SyncPyaProductsResult> {
  const { organizationId, integrationId, workspaceId, projectId } = params;
  const now = new Date();

  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { secretsJson: true, configJson: true },
  });
  if (!integration) throw new Error("INTEGRATION_NOT_FOUND");

  const config       = getPyaConfig(integration.secretsJson);
  const connConfig   = (integration.configJson ?? {}) as PyaConnectorConfig;
  const productQuery = connConfig.productQuery;

  if (!productQuery) {
    throw new Error(
      "PYA_MISSING_QUERY: productQuery is not set in Integration.configJson"
    );
  }

  const run = await prisma.run.create({
    data: {
      organizationId,
      projectId: projectId ?? null,
      type:      RUN_TYPE,
      status:    RunStatus.RUNNING,
      startedAt: now,
    },
    select: { id: true },
  });

  let synced = 0;
  let failed = 0;

  try {
    const rows = await fetchPyaProducts(config, productQuery);

    for (const row of rows) {
      try {
        const mapped = mapSagRowToProduct(row);
        await prisma.productSnapshot.upsert({
          where: {
            organizationId_sourceSystem_sourceId: {
              organizationId,
              sourceSystem: SOURCE_SYSTEM,
              sourceId:     mapped.sourceId,
            },
          },
          create: {
            organizationId,
            workspaceId:  workspaceId ?? null,
            sourceSystem: mapped.sourceSystem,
            sourceId:     mapped.sourceId,
            name:         mapped.name,
            sku:          mapped.sku,
            description:  mapped.description,
            category:     mapped.category,
            price:        mapped.price,
            currency:     mapped.currency,
            status:       mapped.status,
            imageUrl:     mapped.imageUrl,
            payloadJson:  mapped.payloadJson as object,
            syncedAt:     now,
          },
          update: {
            name:        mapped.name,
            sku:         mapped.sku,
            description: mapped.description,
            category:    mapped.category,
            price:       mapped.price,
            currency:    mapped.currency,
            status:      mapped.status,
            imageUrl:    mapped.imageUrl,
            payloadJson: mapped.payloadJson as object,
            syncedAt:    now,
          },
        });
        synced++;
      } catch {
        failed++;
      }
    }

    await prisma.$transaction([
      prisma.run.update({
        where: { id: run.id },
        data: {
          status:     RunStatus.SUCCEEDED,
          endedAt:    new Date(),
          outputJson: { synced, failed, total: rows.length },
        },
      }),
      prisma.event.create({
        data: {
          organizationId,
          projectId:   projectId ?? null,
          type:        EVENT_TYPE,
          sourceType:  "integration",
          sourceId:    integrationId,
          payloadJson: { runId: run.id, synced, failed },
          status:      EventStatus.PROCESSED,
          processedAt: new Date(),
        },
      }),
    ]);

    return { runId: run.id, synced, failed };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await prisma.run.update({
      where: { id: run.id },
      data: {
        status:    RunStatus.FAILED,
        endedAt:   new Date(),
        errorJson: { message: errorMessage },
      },
    });
    throw err;
  }
}
