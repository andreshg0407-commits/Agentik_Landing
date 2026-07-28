/**
 * lib/comercial/clientes/sag-customer-master-sync.ts
 *
 * Sync service that fetches customer master data from SAG vw_agentik_clientes
 * and upserts into the existing CustomerProfile model.
 *
 * Sprint: AGENTIK-CUSTOMERS-CANONICAL-IDENTITY-RECOVERY-01
 *
 * Pipeline:
 *   1. Fetch all rows from vw_agentik_clientes via consultaSagJson
 *   2. Map each row through mapSagCustomerMasterRow()
 *   3. Upsert into CustomerProfile using (organizationId, sagTerceroId) as
 *      canonical identity key — NOT slug, NOT NIT
 *   4. Return sync report with counts and quality stats
 *
 * Canonical identity: organizationId + sagTerceroId (CLIENTE_ID from SAG).
 * NIT is a mutable tax attribute, not identity. Slug is for URLs only.
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import {
  mapSagCustomerMasterRow,
  buildCustomerSlug,
  SAG_CUSTOMER_MASTER_QUERY,
  type MappedCustomerMaster,
  type CustomerMasterDataQuality,
} from "./sag-customer-master-adapter";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SagCustomerMasterSyncConfig {
  /** SAG SOAP API config (token, endpointUrl, database) */
  token: string;
  endpointUrl?: string;
  database?: string;
  /** Optional SQL override (default: SELECT * FROM vw_agentik_clientes) */
  query?: string;
  /** Max rows to process (for testing) */
  limit?: number;
  /** Dry run — map and validate but do not write to DB */
  dryRun?: boolean;
}

export interface SagCustomerMasterSyncReport {
  totalFetched: number;
  totalMapped: number;
  totalSkipped: number;
  /** Rows skipped because sagTerceroId (CLIENTE_ID) was null or 0 */
  totalSkippedNoId: number;
  totalUpserted: number;
  totalErrored: number;
  qualityBreakdown: Record<CustomerMasterDataQuality, number>;
  newFields: {
    withCity: number;
    withSeller: number;
    withLastPurchase: number;
    withPortfolio: number;
    withLegalName: number;
    withStatus: number;
  };
  durationMs: number;
  dryRun: boolean;
}

// ── Batch upsert (by sagTerceroId — canonical identity) ──────────────────

const BATCH_SIZE = 500;

/**
 * Build SAG-enriched data fields for create/update.
 * CRM fields (crmId, rawCrmJson, crmSyncedAt) are NEVER touched — owned by CRM adapter.
 */
function buildSagData(m: MappedCustomerMaster, now: Date) {
  return {
    // SAG identity
    sagTerceroId: m.sagTerceroId > 0 ? m.sagTerceroId : null,
    erpId: m.sagCustomerCode ?? (m.nit ?? String(m.sagTerceroId)),
    nit: m.nit,
    nitNormalized: m.nitNormalized,
    name: m.name,
    legalName: m.legalName !== "SIN NOMBRE" ? m.legalName : null,
    status: m.status,
    // Location
    address: m.address,
    city: m.city,
    department: m.department,
    // Contact — only overwrite if SAG has a value
    ...(m.email ? { email: m.email } : {}),
    ...(m.phone || m.mobile ? { phone: m.phone ?? m.mobile } : {}),
    // Commercial
    ...(m.sellerName ? {
      sellerName: m.sellerName,
      sellerSlug: toSlug(m.sellerName),
    } : {}),
    ...(m.customerType ? { customerType: m.customerType } : {}),
    ...(m.channel ? { segment: m.channel } : {}),
    // Financial
    ...(m.portfolioBalance > 0 ? { totalReceivable: m.portfolioBalance } : {}),
    // Dates
    ...(m.lastPurchaseAt ? { lastPurchaseAt: m.lastPurchaseAt } : {}),
    // Sync metadata
    erpSyncedAt: now,
    rawErpJson: {
      source: "vw_agentik_clientes",
      syncedAt: now.toISOString(),
      dataQuality: m.dataQuality.quality,
      raw: m.rawRow,
    } as object,
  };
}

async function upsertCustomerBatch(
  orgId: string,
  batch: MappedCustomerMaster[],
): Promise<{ upserted: number; errored: number; skippedNoId: number }> {
  let upserted = 0;
  let errored = 0;
  let skippedNoId = 0;
  const now = new Date();

  for (const m of batch) {
    // Gate: must have sagTerceroId (CLIENTE_ID) — skip otherwise
    if (!m.sagTerceroId || m.sagTerceroId <= 0) {
      skippedNoId++;
      continue;
    }

    try {
      // Find by canonical identity: organizationId + sagTerceroId
      const existing = await (prisma as any).customerProfile.findFirst({
        where: { organizationId: orgId, sagTerceroId: m.sagTerceroId },
        select: { id: true, slug: true },
      });

      if (existing) {
        // Update existing profile — preserve its slug (URL stability)
        await prisma.customerProfile.update({
          where: { id: existing.id },
          data: buildSagData(m, now),
        });
      } else {
        // Create new profile — generate slug for URL
        let slug = buildCustomerSlug(m);

        // Handle slug collision (different sagTerceroId, same NIT/name)
        const slugExists = await (prisma as any).customerProfile.findUnique({
          where: { organizationId_slug: { organizationId: orgId, slug } },
        });
        if (slugExists) {
          slug = `${slug}-${m.sagTerceroId}`;
        }

        await prisma.customerProfile.create({
          data: {
            organizationId: orgId,
            slug,
            ...buildSagData(m, now),
            // Default customerType for new records
            customerType: m.customerType ?? "B2B",
          },
        });
      }

      upserted++;
    } catch (e) {
      console.error(
        `[SagCustomerMasterSync] Upsert failed sagTerceroId=${m.sagTerceroId} nit="${m.nit}":`,
        (e as Error).message,
      );
      errored++;
    }
  }

  return { upserted, errored, skippedNoId };
}

// ── Slug helper (mirrors storage.ts) ───────────────────────────────────────

function toSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
}

// ── Main sync function ─────────────────────────────────────────────────────

/**
 * Fetch customer master data from SAG vw_agentik_clientes and upsert
 * into CustomerProfile.
 *
 * This replaces the old TERCEROS-only sync for the Clientes module,
 * providing resolved city names, department names, seller names,
 * last purchase dates, and portfolio balances that the raw TERCEROS
 * query cannot deliver.
 */
export async function syncSagCustomerMaster(
  orgId: string,
  config: SagCustomerMasterSyncConfig,
): Promise<SagCustomerMasterSyncReport> {
  const startMs = Date.now();

  const endpoint = config.endpointUrl
    ?? process.env.PYA_SOAP_ENDPOINT
    ?? "https://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  const token = config.token
    || process.env.PYA_SOAP_TOKEN?.trim()
    || process.env.SAG_TEST_TOKEN?.trim()
    || "";

  const database = config.database ?? process.env.PYA_SAG_BD;

  const query = config.query ?? SAG_CUSTOMER_MASTER_QUERY;

  console.log(`[SagCustomerMasterSync] Fetching from SAG: query="${query.slice(0, 80)}" db="${database}"`);

  // Fetch from SAG
  const rows = await consultaSagJson(
    { token, endpointUrl: endpoint, database },
    query,
  );

  const totalFetched = rows.length;
  console.log(`[SagCustomerMasterSync] Fetched ${totalFetched} rows from SAG`);

  // Map rows
  const mapped: MappedCustomerMaster[] = [];
  let totalSkipped = 0;

  const limit = config.limit ?? Infinity;

  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    const row = rows[i] as Record<string, unknown>;
    const result = mapSagCustomerMasterRow(row);
    if (result) {
      mapped.push(result);
    } else {
      totalSkipped++;
    }
  }

  // Quality breakdown
  const qualityBreakdown: Record<CustomerMasterDataQuality, number> = {
    VALID: 0,
    INCOMPLETE: 0,
    SUSPICIOUS: 0,
  };
  const newFields = {
    withCity: 0,
    withSeller: 0,
    withLastPurchase: 0,
    withPortfolio: 0,
    withLegalName: 0,
    withStatus: 0,
  };

  for (const m of mapped) {
    qualityBreakdown[m.dataQuality.quality]++;
    if (m.city) newFields.withCity++;
    if (m.sellerName) newFields.withSeller++;
    if (m.lastPurchaseAt) newFields.withLastPurchase++;
    if (m.portfolioBalance > 0) newFields.withPortfolio++;
    if (m.legalName !== "SIN NOMBRE") newFields.withLegalName++;
    if (m.status === "ACTIVE" || m.status === "INACTIVE") newFields.withStatus++;
  }

  // Upsert (or skip for dry run)
  let totalUpserted = 0;
  let totalErrored = 0;
  let totalSkippedNoId = 0;

  if (!config.dryRun) {
    for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
      const batch = mapped.slice(i, i + BATCH_SIZE);
      const { upserted, errored, skippedNoId } = await upsertCustomerBatch(orgId, batch);
      totalUpserted += upserted;
      totalErrored += errored;
      totalSkippedNoId += skippedNoId;

      if ((i + BATCH_SIZE) % 2000 === 0 || i + BATCH_SIZE >= mapped.length) {
        console.log(
          `[SagCustomerMasterSync] Progress: ${Math.min(i + BATCH_SIZE, mapped.length)}/${mapped.length} ` +
          `(upserted=${totalUpserted}, errored=${totalErrored}, skippedNoId=${totalSkippedNoId})`,
        );
      }
    }
  }

  const durationMs = Date.now() - startMs;

  const report: SagCustomerMasterSyncReport = {
    totalFetched,
    totalMapped: mapped.length,
    totalSkipped,
    totalSkippedNoId,
    totalUpserted,
    totalErrored,
    qualityBreakdown,
    newFields,
    durationMs,
    dryRun: !!config.dryRun,
  };

  console.log(`[SagCustomerMasterSync] Complete:`, JSON.stringify(report, null, 2));

  return report;
}
