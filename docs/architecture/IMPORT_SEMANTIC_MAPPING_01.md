# Import Semantic Mapping Layer — Architecture

Sprint: IMPORT-SEMANTIC-MAPPING-01

---

## Problem

ERP document types (SAG fuentes) use arbitrary numeric IDs and codes that vary per tenant. Functional logic must NOT depend on raw ERP codes. We need a canonical semantic layer that classifies import/purchase documents into standardized types.

---

## Architecture

```
Importaciones Module (UI/KPIs)
        │
        ▼
Import Semantic Layer (this sprint)
        │
        ▼
Tenant/ERP Mapping (castillitos/SAG)
        │
        ▼
Commercial Data Sources (sag-direct)
        │
        ▼
SAG SOAP Transport
```

---

## Components

### 1. Semantic Types (`import-semantic-types.ts`)

- 17 `ImportDocumentSemanticType` values: `IMPORT_INVOICE`, `IMPORT_PROVISION`, `IMPORT_EXPENSE`, etc.
- 11 `ImportMovementSemanticType` values: `PURCHASE`, `IMPORT`, `RECEIPT`, etc.
- `InventoryEffect`: `INCREASE | DECREASE | TRANSFORM | NONE | UNKNOWN`
- `MappingStatus`: `CONFIRMED | PROBABLE | UNKNOWN | EXCLUDED`
- `ClassificationEvidence`: `{ description, weight, source }`
- `ImportSemanticClassificationResult`: full result with effects, counting rules, and evidence chain

### 2. Tenant Config (`import-semantic-config.ts`)

- `DocumentSemanticMapping`: externalId / Code / Name → semanticType + effects
- `WarehouseSemanticMapping`: warehouse ID → semantic type (`IMPORT_STAGING`, `STORE`, etc.)
- `PriceSemanticMapping`: price field → semantic type
- `ImportSemanticTenantConfig`: full tenant configuration struct
- Registry functions: `registerTenantConfig()`, `getTenantConfig()`, `listRegisteredTenants()`

### 3. Castillitos/SAG Mapping (`import-semantic-mapping.ts`)

- 20 document mappings based on SAG-IMPORT-RESEARCH-01 evidence
- 24 warehouse mappings with correct `ka_nl_bodega` → `ss_codigo` resolution
- 9 price mappings (mostly `UNKNOWN`, pending business validation)
- 13 name patterns for fallback resolution
- Auto-registers via `registerTenantConfig()` on module load

### 4. Classifier (`import-semantic-classifier.ts`)

- `classifyImportDocument(input, tenantConfig?)` → `ImportSemanticClassificationResult`
- 4-step resolution order: ID → Code → Alias → Name pattern → `UNKNOWN`
- Contextual adjustments: cancelled docs, quantity sign, warehouse context, mapping status
- Evidence chain with weights and sources attached to every result
- Safe defaults: `UNKNOWN` with zero confidence when no config found

---

## Key Design Decisions

1. **Multi-tenant from day one**: Registry pattern, not hardcoded tenant logic. Any tenant can register its own mapping without touching shared code.
2. **Evidence-based confidence**: Every classification carries a full evidence chain. No silent assumptions.
3. **Safe defaults**: `UNKNOWN` = zero confidence = no side effects. The system never fabricates a classification.
4. **No UI changes**: The layer sits strictly between data sources and functional logic. No pages, no components.
5. **No Prisma changes**: Pure TypeScript, no database dependency introduced by this sprint.
6. **Research-backed**: All mappings are grounded in SAG-IMPORT-RESEARCH-01 findings derived from analysis of 6,300+ rows.

---

## Critical Findings from Research (SAG-IMPORT-RESEARCH-01)

| Finding | Detail |
|---|---|
| C1/C2 NOT used for imports | Zero appearances in import product lifecycle across all analyzed rows |
| Real import fuentes | FI (182), PX (184), FT (189) |
| Import warehouses | `ka_nl_bodega` values 33, 36, 37, 41 — NOT the `ss_codigo` values |
| PX (184) is PROVISION | Should NOT count as an import receipt |
| DS (157) negative-only | Only appears with negative quantities — transforms, not purchases |

---

## Sprint Boundaries

### Does NOT modify
- UI pages or KPI components
- Recompra rules
- Maletas, Inventario, Produccion, Pedidos modules
- Prisma schema or migrations
- Active Importaciones logic currently in production

### Does NOT replace
- Any active data source or live query path

### Future sprints
- Will wire this semantic layer into active data sources
- Will surface confidence levels in KPI tooltips and audit panels
- Will extend price mappings once business validation is complete

---

## Pattern Specificity (IMPORT-SEMANTIC-MAPPING-SPECIFICITY-01)

Name pattern resolution uses **specificity-first** ordering, not declaration order:

1. Explicit `priority` (descending) — configurable per pattern
2. Pattern length (descending) — longer patterns are more specific
3. First declared — tiebreaker

When multiple patterns match:
- The most specific wins
- All competing matches are recorded in evidence
- If competing patterns resolve to different semantic types, confidence is reduced by 20%
- Conflict is documented in `unresolvedReasons`

The generic "IMPORTACION" pattern maps to **UNKNOWN** (not IMPORT_INVOICE). Specific sub-patterns like "DEVOLUCION IMPORTACION", "FACTURA.*IMPORTACION", "PROVISION IMPORTACION" have `priority: 10` and always win over the generic catch-all.

**Rule**: A devolución NEVER counts as import receipt, repurchase, or total imported.

---

## Double-Counting Risk (FI/FT/PX)

FI(182), FT(189), and PX(184) may belong to the **same import event**:
- FI = import invoice (national)
- FT = China purchase invoice
- PX = import provision (cost allocation)

These documents can overlap for the same goods shipment.

**14,368 units** = observed semantically classified volume, NOT confirmed imported total.

Do NOT assert "14,368 units imported confirmed" until a deduplication or document-precedence rule resolves potential double-counting across FI + FT + PX within the same import operation.

---

## Files

| File | Purpose |
|---|---|
| `lib/comercial/semantic/imports/import-semantic-types.ts` | Canonical semantic type definitions |
| `lib/comercial/semantic/imports/import-semantic-config.ts` | Multi-tenant config structures and registry |
| `lib/comercial/semantic/imports/import-semantic-mapping.ts` | Castillitos/SAG concrete mapping (auto-registers) |
| `lib/comercial/semantic/imports/import-semantic-classifier.ts` | Classification engine — 4-step resolution with evidence |
| `lib/comercial/semantic/imports/index.ts` | Barrel export for the entire layer |
| `scripts/audit-import-semantic-mapping.ts` | Offline audit script to validate mapping coverage |
