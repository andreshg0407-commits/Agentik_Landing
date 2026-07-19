# CATALOG-SAG-SUBGROUP-ENRICHMENT-01

**Sprint:** CATALOG-SAG-SUBGROUP-ENRICHMENT-01
**Priority:** P0
**Status:** COMPLETE
**Date:** 2026-07-01
**TSC Baseline:** 160 (preserved)

---

## Objective

Enrich the central product catalog and commercial coverage snapshots with real SAG subgroup data (`subgrupoId` + `subgrupoSag`), enabling accurate replacement intelligence by subgroup instead of parsed descriptions or line-only fallback.

## Business Rule

> When a reference runs out, the replacement comes from the same SAG subgroup — NOT necessarily the same reference. The subgrupo SAG is the primary unit of replacement and production planning.

---

## Data Model

### Source: SAG

| Table | Field | Type | Description |
|---|---|---|---|
| `SUBGRUPOS` | `ka_ni_subgrupo` | int (PK) | Subgroup numeric ID |
| `SUBGRUPOS` | `sc_detalle_subgrupo` | string | Human-readable name (e.g. "PIJAMA CL 2-8") |
| `v_articulos` | `ka_ni_subgrupo` | int (FK) | Links article to subgroup |

### Destination: Prisma

| Model | Fields Added |
|---|---|
| `ProductEntity` | `subgrupoId Int?`, `subgrupoSag String?` |
| `CommercialCoverageSnapshot` | `subgrupoId Int?`, `subgrupoSag String?` |

### Migration

`prisma/migrations/20260701000000_sag_subgroup_enrichment/migration.sql`

---

## Data Flow

```
SAG SUBGRUPOS + v_articulos
        |
        v
  sag-articles-sync.ts  (Phase 3)
  - syncSagMasterLookups() loads SUBGRUPOS into maps.subgroups
  - resolveSubgroupName(maps, subgrupoId) -> name
  - Persists subgrupoId + subgrupoSag on ProductEntity create/update
        |
        v
  ProductEntity (subgrupoId, subgrupoSag)
        |
        v
  inventory-refresh-pipeline.ts  (Phase 4)
  - Reads subgrupoId/subgrupoSag from ProductEntity
  - Passes through to snapRows
  - normalizedRows carries subgrupoId/subgrupoSag
        |
        v
  sag-inventory-storage.ts  (Phase 4)
  - persistSagInventorySnapshot() writes subgrupoId/subgrupoSag
        |
        v
  CommercialCoverageSnapshot (subgrupoId, subgrupoSag)
        |
        v
  vendor-sample-loader.ts  (Phase 6)
  - Reads subgrupoSag from CommercialCoverageSnapshot
  - Replacement engine indexes candidates by subgrupoSag
  - Priority: same subgrupo > same line > suggest production
```

---

## Files Modified

| File | Change |
|---|---|
| `prisma/schema.prisma` | Added `subgrupoId`/`subgrupoSag` to ProductEntity and CommercialCoverageSnapshot |
| `lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-sync.ts` | Loads master lookups, resolves subgroup name, persists on create/update |
| `lib/integrations/sag/sag-inventory-contract.ts` | Added `subgrupoId?`/`subgrupoSag?` to `SagInventoryNormalizedRow` |
| `lib/integrations/sag/sag-inventory-storage.ts` | Passes `subgrupoId`/`subgrupoSag` to `createMany` |
| `lib/integrations/sag/inventory-refresh-pipeline.ts` | Reads subgrupo from ProductEntity, carries through to snapshot rows |
| `lib/comercial/maletas/vendor-sample-loader.ts` | Replacement engine uses `subgrupoSag` from full coverage catalog |

## Files Created

| File | Purpose |
|---|---|
| `prisma/migrations/20260701000000_sag_subgroup_enrichment/migration.sql` | Schema migration |
| `scripts/_backfill-sag-subgroups.ts` | Backfill existing ProductEntity + CoverageSnapshot records from SAG |
| `scripts/_validate-sag-subgroup-enrichment.ts` | Validate 50 refs across SAG/ProductEntity/CoverageSnapshot |

---

## Replacement Intelligence (Updated)

The maletas replacement engine (`vendor-sample-loader.ts`) now uses a two-tier priority:

1. **Same SAG subgrupo** — candidates from the full coverage catalog with matching `subgrupoSag` and `disponible >= minimum * 2`
2. **Same line** (LT/CS/IMPORT) — broader fallback from coverage catalog
3. **No match** — `suggestedAction = "Sugerir produccion"`

This replaces the prior approach that only matched within vendor refs or relied on parsed descriptions.

---

## Backfill

For existing data without subgrupo:

```bash
env $(grep -E '^[A-Z_]+=' .env | tr '\n' ' ') npx tsx scripts/_backfill-sag-subgroups.ts
```

Updates ProductEntity and latest CommercialCoverageSnapshot batch.

## Validation

```bash
env $(grep -E '^[A-Z_]+=' .env | tr '\n' ' ') npx tsx scripts/_validate-sag-subgroup-enrichment.ts
```

Samples 50 references and compares `subgrupoId`/`subgrupoSag` across SAG, ProductEntity, and CommercialCoverageSnapshot.

---

## Dependencies

- `syncSagMasterLookups()` from `lib/connectors/adapters/sag-pya-soap/catalog/sag-master-lookups-sync.ts`
- `resolveSubgroupName()` from same module
- `fetchSubgruposLookup()` from `lib/comercial/maletas/vendor-sample-presence-engine.ts`

---

## Success Criteria

- 100% of active catalog references have `subgrupoId`/`subgrupoSag` when SAG provides them
- Maletas replacement engine finds candidates by real SAG subgroup, not by parsed description
- CommercialCoverageSnapshot carries subgrupo through the full pipeline
- TSC baseline: 160 (zero new errors)
