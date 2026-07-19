/**
 * lib/connectors/adapters/sag-pya-soap/catalog/sag-master-lookups-sync.ts
 *
 * Sync service for SAG master lookup tables.
 *
 * Reads each master table from SAG, normalizes, and returns in-memory maps.
 * No DB persistence yet — maps are used to enrich ProductEntity descriptions.
 *
 * Future: SAG-MASTER-PERSISTENCE-01 will add a dedicated Prisma model.
 *
 * Sprint: SAG-MASTER-LOOKUPS-01
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import {
  LOOKUP_TABLE_CONFIGS,
  normalizeLookupRows,
} from "./sag-master-lookups-normalizer";
import type {
  SagLookupMaps,
  SagLookupNormalized,
  SagMasterLookupSyncResult,
  SagMasterLookupFullResult,
} from "./sag-master-lookups-types";

// ── Main sync function ──────────────────────────────────────────────────────

export async function syncSagMasterLookups(
  config: PyaApiConfig,
  options: { dryRun?: boolean } = {},
): Promise<SagMasterLookupFullResult> {
  const t0 = Date.now();
  const { dryRun = false } = options;

  const tables: SagMasterLookupSyncResult[] = [];
  const allNormalized: SagLookupNormalized[] = [];

  for (const tableConfig of LOOKUP_TABLE_CONFIGS) {
    try {
      const rows = await consultaSagJson(
        config,
        `SELECT * FROM ${tableConfig.tableName}`,
      );

      const { normalized, errors } = normalizeLookupRows(rows, tableConfig);
      allNormalized.push(...normalized);

      tables.push({
        kind: tableConfig.kind,
        tableName: tableConfig.tableName,
        totalRows: rows.length,
        normalized: normalized.length,
        errors,
        dryRun,
      });
    } catch (e) {
      // Table doesn't exist or SAG error — log and continue
      console.error(
        `[SAG-LOOKUPS] Failed to fetch ${tableConfig.tableName}: ${(e as Error).message.slice(0, 100)}`,
      );
      tables.push({
        kind: tableConfig.kind,
        tableName: tableConfig.tableName,
        totalRows: 0,
        normalized: 0,
        errors: 1,
        dryRun,
      });
    }
  }

  // Build maps keyed by string ID (how they appear in ARTICULOS)
  const maps = buildLookupMaps(allNormalized);

  return {
    tables,
    maps,
    durationMs: Date.now() - t0,
    dryRun,
  };
}

// ── Build in-memory maps ────────────────────────────────────────────────────

function buildLookupMaps(entries: SagLookupNormalized[]): SagLookupMaps {
  const maps: SagLookupMaps = {
    groups:     new Map(),
    subgroups:  new Map(),
    lines:      new Map(),
    sizes:      new Map(),
    colors:     new Map(),
    warehouses: new Map(),
    brands:     new Map(),
  };

  for (const entry of entries) {
    const key = String(entry.sagId);
    switch (entry.kind) {
      case "product_group":    maps.groups.set(key, entry); break;
      case "product_subgroup": maps.subgroups.set(key, entry); break;
      case "product_line":     maps.lines.set(key, entry); break;
      case "size":             maps.sizes.set(key, entry); break;
      case "color":            maps.colors.set(key, entry); break;
      case "warehouse":        maps.warehouses.set(key, entry); break;
      case "brand":            maps.brands.set(key, entry); break;
    }
  }

  return maps;
}

// ── Resolve helpers ─────────────────────────────────────────────────────────

/** Resolve a group ID to its name, or return the original ID if not found */
export function resolveGroupName(maps: SagLookupMaps, groupId: string): string {
  return maps.groups.get(groupId)?.name ?? groupId;
}

/** Resolve a subgroup ID to its name */
export function resolveSubgroupName(maps: SagLookupMaps, subgroupId: string): string {
  return maps.subgroups.get(subgroupId)?.name ?? subgroupId;
}

/** Resolve a line ID to its name */
export function resolveLineName(maps: SagLookupMaps, lineId: string): string {
  return maps.lines.get(lineId)?.name ?? lineId;
}

/** Resolve a brand ID to its name */
export function resolveBrandName(maps: SagLookupMaps, brandId: string): string {
  return maps.brands.get(brandId)?.name ?? brandId;
}
