# Sales Portfolio — Terminology Architecture

**Sprint:** AGENTIK-COMERCIAL-SALES-PORTFOLIO-TERMINOLOGY-01
**Status:** Active
**Last updated:** 2026-05-25

---

## The Problem

"Maletas" is the internal vocabulary used by Castillitos (the first active tenant) to describe the commercial portfolio of products assigned to each sales rep for a season. This term makes perfect sense for their operations — a "maleta" is the physical bag of samples they carry.

However, Agentik is a multi-tenant enterprise OS. Hardcoding "Maletas" in core components would:
- Make Agentik impossible to sell to other industries
- Conflate tenant vocabulary with platform architecture
- Create confusion in documentation, support, and onboarding

---

## The Solution

**Rule:** The Agentik core domain uses generic language. The UI adapts terminology per tenant.

| Layer | Term |
|---|---|
| Agentik core domain | Sales Portfolio |
| Spanish default | Portafolio de venta |
| Castillitos override | Maleta / Maletas |
| API routes (current) | `/comercial/maletas/...` (backward compat) |

---

## What is a Sales Portfolio?

A **Sales Portfolio** is a commercial portfolio assigned to one sales rep for one season.

```
Sales Portfolio
  ├── salesRepId       — which vendor owns it
  ├── season           — "Junio 2026", "Escolar 2026"
  ├── status           — borrador | activa | pausada | archivada
  └── items[]
        ├── reference          — product/SKU code
        ├── assignedQty        — units committed from warehouse
        ├── soldQty            — units consumed via orders
        ├── availableToSellQty — assignedQty - soldQty  (maintained atomically)
        ├── minQty             — minimum before pressure fires
        └── status             — ok | bajo_minimo | agotado | pausado
```

Core invariant (enforced by the persistence layer):
```
availableToSellQty = assignedQty - soldQty
```

---

## Terminology Registry

The single source of truth for tenant-aware vocabulary:

```typescript
// lib/comercial/terminology.ts
getCommercialTerminology(orgSlug?: string): CommercialTerminology
```

Current tenant overrides:
- `"castillitos"` → Maletas vocabulary
- `default` → Portafolio de venta vocabulary

To add a new tenant override, add a case in `terminology.ts`. Do not add tenant checks elsewhere.

---

## Import Paths

### For UI components (tenant-aware label only)
```typescript
import { getCommercialTerminology } from "@/lib/comercial/terminology";
const term = getCommercialTerminology(orgSlug);
// term.salesPortfolioPlural → "Maletas" for castillitos, "Portafolios de venta" for others
```

### For new Agentik domain code (generic types)
```typescript
import type { SalesPortfolio, SalesPortfolioItem } from "@/lib/comercial/sales-portfolio";
```

### For legacy/existing code (backward compat — do not use in new code)
```typescript
import type { VendorCommercialBag, VendorBagItem } from "@/lib/comercial/maletas/vendor-bag-types";
```

---

## Prisma Model Names

Current Prisma model names use Castillitos-era vocabulary:
- `VendorCommercialBag` — maps to `SalesPortfolio`
- `VendorBagItem` — maps to `SalesPortfolioItem`
- `VendorBagOrderLine` — maps to `SalesPortfolioOrderLine`

**These will NOT be migrated destructively.** When a safe migration window exists:
1. Create new models with generic names
2. Migrate data
3. Update repository layer
4. Remove old models

Until then, the type aliases in `vendor-bag-types.ts` provide the generic interface.

---

## API Route Future Migration

Current routes (Castillitos-era, backward compatible):
```
GET  /api/orgs/[orgSlug]/comercial/maletas/bags
POST /api/orgs/[orgSlug]/comercial/maletas/bags
POST /api/orgs/[orgSlug]/comercial/maletas/orders/ingest
```

Future routes (when multi-tenant rollout is needed):
```
GET  /api/orgs/[orgSlug]/comercial/portafolios
POST /api/orgs/[orgSlug]/comercial/portafolios
POST /api/orgs/[orgSlug]/comercial/portafolios/orders/ingest
```

**Do not change routes in this sprint.** The `/maletas` path is stable for Castillitos.

---

## UI Route Future Migration

Current:
```
/[orgSlug]/comercial/maletas
```

Future options (not decided):
```
/[orgSlug]/comercial/portafolios
/[orgSlug]/comercial/sales-portfolios
```

The nav label is already tenant-aware (`term.salesPortfolioPlural`).
The URL path change requires a redirect and nav config update — plan separately.

---

## Rules for New Code

1. **Never** hardcode "Maleta" or "Maletas" in new components.
2. **Always** use `getCommercialTerminology(orgSlug)` for visible labels.
3. **Prefer** `SalesPortfolio*` type names in new service/domain code.
4. **Keep** `VendorBag*` names in repository layer until safe migration.
5. **Add** new tenant overrides only in `lib/comercial/terminology.ts`.
