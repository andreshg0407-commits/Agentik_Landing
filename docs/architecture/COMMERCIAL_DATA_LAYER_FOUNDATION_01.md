# COMMERCIAL DATA LAYER FOUNDATION

**Sprint:** COMMERCIAL-DATA-LAYER-FOUNDATION-01
**Date:** 2026-07-12
**Status:** IMPLEMENTED
**Location:** `lib/comercial/data-layer/`

---

## What was built

Infrastructure-only foundation for the Commercial Data Layer. No domain logic, no SAG integration, no Prisma implementation. Pure contracts and interfaces that all future domain implementations must follow.

---

## Directory Structure

```
lib/comercial/data-layer/
  index.ts                          # Top-level barrel (dependency rules documented)
  adapters/
    adapter-contract.ts             # CommercialAdapter<TInput, TOutput> interface
    index.ts
  contracts/
    canonical-record.ts             # CanonicalRecord, RecordState, RecordEnvelope
    commercial-identity.ts          # CommercialIdentity, CommercialDomain, CommercialTimestamp
    data-source-metadata.ts         # DataSourceMetadata, ExtractionMode
    domain-event.ts                 # DomainEvent<T>, EventMetadata
    external-reference.ts           # ExternalReference, ExternalSystem, ExternalSystemType
    quality-assessment.ts           # QualityAssessment, QualityDimensions, QualityLevel
    synchronization-context.ts      # SynchronizationContext, SynchronizationResult
    index.ts
  events/
    event-catalog.ts                # Official event types + EVENT_TYPES registry
    index.ts
  quality/
    quality-types.ts                # Confidence, Completeness, Consistency, Freshness, Validity, Origin
    index.ts
  repositories/
    repository-contract.ts          # CommercialRepository<T> interface
    index.ts
  semantic/
    semantic-contract.ts            # SemanticMappingContract, SemanticNormalizer, SemanticValidation
    index.ts
  shared/
    health-metrics.ts               # AdapterHealth, SyncMetrics, QualityMetrics, LatencyMetrics
    shared-types.ts                 # TenantContext, ERPIdentity, CanonicalId, AuditMetadata, etc.
    index.ts
  snapshots/
    snapshot-contract.ts            # SnapshotIdentity, SnapshotVersion, SnapshotMetadata
    index.ts
  synchronization/
    pipeline-contract.ts            # 9-stage pipeline: Discover→Extract→...→Metrics
    index.ts
  testing/
    mock-adapter.ts                 # createMockAdapter, createMockSyncContext, factories
    index.ts
```

---

## Key Contracts

### CommercialAdapter<TInput, TOutput>

Every domain adapter (Product, Customer, Sales, etc.) must implement:

| Method | Purpose |
|---|---|
| `discover()` | Identify available records in external system |
| `validate()` | Verify system reachability and schema compatibility |
| `normalize()` | Transform raw data into canonical form |
| `synchronize()` | Execute full sync cycle |
| `health()` | Report adapter health |
| `capabilities()` | Declare what the adapter supports |

### CommercialRepository<T>

Every domain repository must implement:

| Method | Purpose |
|---|---|
| `find()` | By canonical ID |
| `findByExternalId()` | By external system reference |
| `findMany()` | Filtered + paginated |
| `upsert()` | Idempotent insert/update |
| `bulkUpsert()` | Batch operations |
| `delete()` | Soft-delete only |
| `snapshot()` | Point-in-time capture |

### Synchronization Pipeline (9 stages)

```
Discover → Extract → Normalize → Validate → Quality → Persist → Snapshot → Events → Metrics
```

Each stage is an independent interface. Domains compose only the stages they need.

---

## Dependency Rules

```
ALLOWED:
  adapters → contracts → shared
  repositories → contracts → shared
  synchronization → contracts → shared
  quality → (standalone, no deps)
  snapshots → contracts
  events → contracts
  semantic → (standalone, no deps)
  testing → adapters + contracts

PROHIBITED:
  data-layer → UI (React, components)
  data-layer → Prisma (direct DB)
  data-layer → SAG (ERP-specific)
  data-layer → Rules Engine
  data-layer → Copilot
  data-layer → Marketing Studio
  UI → adapters (directly)
  Rules Engine → ERP (directly)
```

---

## How to implement a new domain

1. Create `lib/comercial/data-layer/domains/{domain-name}/`
2. Define domain-specific canonical entities extending `CanonicalRecord`
3. Implement `CommercialAdapter<TRaw, TCanonical>` for the ERP source
4. Implement `CommercialRepository<TCanonical>` backed by Prisma
5. Configure pipeline stages (only those needed)
6. Register events in event catalog
7. Add barrel export

---

## Answers to success criteria

| Question | Answer |
|---|---|
| Where does an adapter live? | `lib/comercial/data-layer/adapters/` (contract) + `lib/comercial/data-layer/domains/{domain}/adapters/` (implementation) |
| What contract must it implement? | `CommercialAdapter<TInput, TOutput>` from `adapters/adapter-contract.ts` |
| How does data enter the Data Layer? | Through the Synchronization Pipeline: Discover → Extract → Normalize → Validate → Quality → Persist |
| Where is data validated? | `ValidateStage<T>` in `synchronization/pipeline-contract.ts` |
| Where is quality measured? | `QualityStage<T>` in pipeline + `QualityAssessment` in `contracts/quality-assessment.ts` |
| Where are snapshots generated? | `SnapshotStage` in pipeline + `snapshots/snapshot-contract.ts` |
| Where are events generated? | `EventStage` in pipeline + `events/event-catalog.ts` |
| How to add a new ERP? | Implement a new `CommercialAdapter<TRaw, TCanonical>` — no other layer changes |
| How to add a new domain? | Follow the 7-step process above using existing contracts |

---

## Foundation Hotfix 01

**Date:** 2026-07-12
**Purpose:** Complete the minimal executable infrastructure before PRODUCT-DOMAIN-01.

### New Components

#### Adapter Registry (`adapters/commercial-adapter-registry.ts`)

Functional registry that resolves adapters by tenant + capability.

```typescript
const registry = createCommercialAdapterRegistry();
registry.register({ adapterId: "sag-product-v1", tenantId: "castillitos", ... });
const result = registry.resolve({ tenantId: "castillitos", capability: "PRODUCT_SYNC" });
```

Rules:
- Every adapter belongs to a tenant (TENANT_REQUIRED if missing)
- No duplicate tenantId + adapterId
- Resolution respects: priority → health → version
- Never resolves across tenants
- Typed errors: ADAPTER_NOT_FOUND, ADAPTER_DUPLICATE, TENANT_REQUIRED, CAPABILITY_NOT_SUPPORTED, ADAPTER_UNHEALTHY, ADAPTER_AMBIGUOUS

#### Domain Registry (`domains/commercial-domain-registry.ts`)

Functional registry enforcing unique entity ownership.

```typescript
const domains = createCommercialDomainRegistry();
domains.register(PRODUCT_DOMAIN);
domains.resolveOwner("ProductProfile"); // → "PRODUCT"
```

Official active domains: PRODUCT, CUSTOMER, INVENTORY, SALES, PURCHASING_IMPORT, STORE_OPERATIONS.
Future inactive: PRODUCTION, RECEIVABLES, WORKFORCE, LOGISTICS.

Rules:
- One entityType = one domain owner (no duplicates)
- Consumers don't imply ownership
- No SAG-specific names in registry

#### Quality Evaluator (`quality/commercial-quality-evaluator.ts`)

Evaluates real records and produces per-field quality assessments.

Statuses: CONFIRMED, PARTIAL, ESTIMATED, UNAVAILABLE, CONFLICTED, STALE.

```typescript
const result = evaluateCommercialQuality({
  record: { name: "Zapato", sku: "ZAP-001" },
  requiredFields: ["name", "sku", "price"],
  ...
});
// result.status === "PARTIAL", result.missingFields === ["price"]
```

#### Normalizers (`shared/normalizers.ts`)

14 normalizers that accept `unknown`, never throw, and return `NormalizerResult<T>`.

Each result includes: `ok`, `value`, `original`, `transformed`, `warnings`, `errorCode`.

Error codes distinguish EMPTY (null/undefined/blank) from INVALID (wrong format).

#### Identifiers (`shared/identifiers.ts`)

Canonical ID format: `{tenantId}:{domain}:{entityType}:{encodedKey}`

Functions: buildCanonicalId, parseCanonicalId, buildTenantScopedKey, buildExternalReferenceKey, buildNaturalKey, isCanonicalId, compareCanonicalIds.

Special characters encoded via percent-encoding to avoid separator collisions.

#### Freshness Evaluator (`shared/freshness-evaluator.ts`)

Evaluates data age against SLA. Injectable `now` for deterministic testing.

```typescript
const result = evaluateCommercialFreshness({
  observedAt, sourceUpdatedAt, now, slaSeconds: 900, syncMode: "INCREMENTAL"
});
// result.status: "FRESH" | "AGING" | "STALE" | "UNKNOWN"
```

### Multi-Tenant Rules

1. Adapter registry is tenant-scoped — never resolves across tenants
2. Canonical IDs embed tenantId — same naturalKey in different tenants = different identity
3. Domain registry is global (shared definitions) but adapters are per-tenant
4. clearTenant() removes only that tenant's registrations
5. Quality evaluation is tenant-agnostic (evaluates any record)
