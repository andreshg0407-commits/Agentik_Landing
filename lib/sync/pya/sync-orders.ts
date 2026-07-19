import { RunStatus, EventStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPyaConfig } from "@/lib/connectors/pya/auth";
import { fetchPyaOrders } from "@/lib/connectors/pya/client";
import { mapSagRowToOrder } from "@/lib/connectors/pya/mappers";
import type { PyaConnectorConfig } from "@/lib/connectors/pya/types";

const RUN_TYPE   = "integration.pya.sync_orders";
const EVENT_TYPE = "integration.pya.orders_synced";
const SOURCE_SYSTEM = "pya";

export interface SyncPyaOrdersParams {
  organizationId: string;
  integrationId:  string;
  workspaceId?:   string;
  projectId?:     string;
  since?:         string; // ISO timestamp — reserved for future query templating
}

export interface SyncPyaOrdersResult {
  runId:  string;
  synced: number;
  failed: number;
}

export async function syncPyaOrders(
  params: SyncPyaOrdersParams
): Promise<SyncPyaOrdersResult> {
  const { organizationId, integrationId, workspaceId, projectId, since } = params;
  const now = new Date();

  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { secretsJson: true, configJson: true },
  });
  if (!integration) throw new Error("INTEGRATION_NOT_FOUND");

  const config      = getPyaConfig(integration.secretsJson);
  const connConfig  = (integration.configJson ?? {}) as PyaConnectorConfig;
  const orderQuery  = connConfig.orderQuery;

  if (!orderQuery) {
    throw new Error(
      "PYA_MISSING_QUERY: orderQuery is not set in Integration.configJson"
    );
  }

  const run = await prisma.run.create({
    data: {
      organizationId,
      projectId: projectId ?? null,
      type:      RUN_TYPE,
      status:    RunStatus.RUNNING,
      startedAt: now,
      inputJson: since ? { since } : undefined,
    },
    select: { id: true },
  });

  let synced = 0;
  let failed = 0;

  try {
    const rows = await fetchPyaOrders(config, orderQuery, { since });

    for (const row of rows) {
      try {
        const mapped = mapSagRowToOrder(row);
        await prisma.orderSnapshot.upsert({
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
            status:       mapped.status,
            totalAmount:  mapped.totalAmount,
            currency:     mapped.currency,
            customerId:   mapped.customerId,
            customerName: mapped.customerName,
            orderedAt:    mapped.orderedAt,
            payloadJson:  mapped.payloadJson as object,
            syncedAt:     now,
          },
          update: {
            status:       mapped.status,
            totalAmount:  mapped.totalAmount,
            currency:     mapped.currency,
            customerId:   mapped.customerId,
            customerName: mapped.customerName,
            orderedAt:    mapped.orderedAt,
            payloadJson:  mapped.payloadJson as object,
            syncedAt:     now,
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
          payloadJson: { runId: run.id, synced, failed, since: since ?? null },
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
