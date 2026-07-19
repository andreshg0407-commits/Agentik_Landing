/**
 * lib/operational-map/source-catalog/source-catalog-service.ts
 *
 * Operational Data Source Catalog — Service Layer.
 *
 * INTERNAL ONLY: SUPER_ADMIN / AGENTIK_ADMIN
 *
 * CRUD for OperationalDataSource. These are the reusable "available sources"
 * catalog for an org. Actual KPI assignments live in OperationalKpiSource.
 *
 * Sprint: AGENTIK-MEETING-SOURCE-MAPPING-01
 */

import { prisma } from "@/lib/prisma";
import type { SourcePreset } from "./source-catalog-presets";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DataSourceRecord {
  id:             string;
  organizationId: string;
  provider:       string;
  sourceType:     string;
  name:           string;
  label:          string;
  description:    string | null;
  system:         string | null;
  tableName:      string | null;
  viewName:       string | null;
  endpoint:       string | null;
  fields:         string[] | null;
  filters:        string[] | null;
  owner:          string | null;
  status:         string;
  notes:          string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface DataSourceCreateInput {
  organizationId: string;
  provider:       string;
  sourceType:     string;
  name:           string;
  label:          string;
  description?:   string;
  system?:        string;
  tableName?:     string;
  viewName?:      string;
  endpoint?:      string;
  fields?:        string[];
  filters?:       string[];
  owner?:         string;
  status?:        string;
  notes?:         string;
}

export interface DataSourceUpdateInput {
  label?:       string;
  description?: string;
  system?:      string;
  tableName?:   string;
  viewName?:    string;
  endpoint?:    string;
  fields?:      string[];
  filters?:     string[];
  owner?:       string;
  status?:      string;
  notes?:       string;
}

// ─── Delegate guard ───────────────────────────────────────────────────────────

function getDelegate() {
  const d = prisma.operationalDataSource;
  if (!d) {
    console.warn(
      "[OperationalDataSource] Prisma delegate not found. " +
      "Run: npx prisma generate && npx prisma db push, then restart the dev server.",
    );
    throw new Error("PRISMA_DELEGATE_MISSING: operationalDataSource");
  }
  return d;
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): DataSourceRecord {
  return {
    id:             r.id,
    organizationId: r.organizationId,
    provider:       r.provider,
    sourceType:     r.sourceType,
    name:           r.name,
    label:          r.label,
    description:    r.description ?? null,
    system:         r.system ?? null,
    tableName:      r.tableName ?? null,
    viewName:       r.viewName ?? null,
    endpoint:       r.endpoint ?? null,
    fields:         Array.isArray(r.fields) ? r.fields : null,
    filters:        Array.isArray(r.filters) ? r.filters : null,
    owner:          r.owner ?? null,
    status:         r.status,
    notes:          r.notes ?? null,
    createdAt:      r.createdAt.toISOString(),
    updatedAt:      r.updatedAt.toISOString(),
  };
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getAllDataSources(
  organizationId: string,
  provider?:      string,
): Promise<DataSourceRecord[]> {
  const rows = await getDelegate().findMany({
    where:   provider ? { organizationId, provider } : { organizationId },
    orderBy: [{ provider: "asc" }, { label: "asc" }],
  });
  return rows.map(mapRow);
}

export async function getDataSourceById(id: string): Promise<DataSourceRecord | null> {
  const row = await getDelegate().findUnique({ where: { id } });
  return row ? mapRow(row) : null;
}

export async function createDataSource(
  input: DataSourceCreateInput,
): Promise<DataSourceRecord> {
  const row = await getDelegate().create({
    data: {
      organizationId: input.organizationId,
      provider:       input.provider,
      sourceType:     input.sourceType,
      name:           input.name,
      label:          input.label,
      description:    input.description ?? null,
      system:         input.system ?? null,
      tableName:      input.tableName ?? null,
      viewName:       input.viewName ?? null,
      endpoint:       input.endpoint ?? null,
      fields:         input.fields ?? undefined,
      filters:        input.filters ?? undefined,
      owner:          input.owner ?? null,
      status:         input.status ?? "active",
      notes:          input.notes ?? null,
    },
  });
  return mapRow(row);
}

export async function upsertDataSource(
  input: DataSourceCreateInput,
): Promise<DataSourceRecord> {
  const row = await getDelegate().upsert({
    where: {
      organizationId_provider_name: {
        organizationId: input.organizationId,
        provider:       input.provider,
        name:           input.name,
      },
    },
    create: {
      organizationId: input.organizationId,
      provider:       input.provider,
      sourceType:     input.sourceType,
      name:           input.name,
      label:          input.label,
      description:    input.description ?? null,
      system:         input.system ?? null,
      tableName:      input.tableName ?? null,
      viewName:       input.viewName ?? null,
      endpoint:       input.endpoint ?? null,
      fields:         input.fields ?? undefined,
      filters:        input.filters ?? undefined,
      owner:          input.owner ?? null,
      status:         input.status ?? "active",
      notes:          input.notes ?? null,
    },
    update: {
      label:          input.label,
      description:    input.description ?? undefined,
      tableName:      input.tableName ?? undefined,
      viewName:       input.viewName ?? undefined,
      endpoint:       input.endpoint ?? undefined,
      fields:         input.fields ?? undefined,
      filters:        input.filters ?? undefined,
      notes:          input.notes ?? undefined,
    },
  });
  return mapRow(row);
}

export async function updateDataSource(
  id:    string,
  input: DataSourceUpdateInput,
): Promise<DataSourceRecord> {
  const row = await getDelegate().update({
    where: { id },
    data: {
      label:       input.label,
      description: input.description,
      system:      input.system,
      tableName:   input.tableName,
      viewName:    input.viewName,
      endpoint:    input.endpoint,
      fields:      input.fields as string[] | undefined,
      filters:     input.filters as string[] | undefined,
      owner:       input.owner,
      status:      input.status,
      notes:       input.notes,
    },
  });
  return mapRow(row);
}

export async function deleteDataSource(id: string): Promise<void> {
  await getDelegate().delete({ where: { id } });
}

/**
 * Seed the org catalog from static presets.
 * Idempotent — uses upsert so safe to call multiple times.
 */
export async function seedFromPresets(
  organizationId: string,
  presets:        SourcePreset[],
): Promise<number> {
  let count = 0;
  for (const preset of presets) {
    await upsertDataSource({
      organizationId,
      provider:    preset.provider,
      sourceType:  preset.sourceType,
      name:        preset.name,
      label:       preset.label,
      description: preset.description,
      system:      preset.system,
      tableName:   preset.tableName,
      endpoint:    preset.endpoint,
      fields:      preset.fields,
    });
    count++;
  }
  return count;
}
