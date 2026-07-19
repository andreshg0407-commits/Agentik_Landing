# CASTILLITOS-MALLET-POLICIES-01 — Mallet Assortment Policies

**Sprint:** CASTILLITOS-MALLET-POLICIES-01
**Depends on:** BUSINESS-POLICY-ENGINE-01, BUSINESS-POLICY-PACKS-01, STORE-POLICY-TEMPLATES-01, CASTILLITOS-BUSINESS-RULE-SPECIFICATION-01
**Status:** Complete
**TSC Baseline:** No regression (160)

---

## What This Is

Configurable assortment policies for vendor maletas (suitcases).
Three catalogs define the target composition for Castillitos:

1. **Castillitos Textil** — 4 groups, 32 entries (from DERROTERO CS.xlsx)
2. **Latin Kids Textil** — 6 groups, 23 entries (from existing derrotero rules)
3. **Importación / Accesorios** — 1 group, 3 entries by sizeClass

---

## Critical Scope Boundary

**MALETAS ONLY** — These catalogs apply EXCLUSIVELY to vendor maletas (suitcases).
They do NOT apply to tiendas (stores).

Store policies are separate:
- Coverage min/max (STORE_COVERAGE template)
- Rotation (future STORE_ROTATION)
- Assortment by sales (future)
- Transfers (future STORE_TRANSFER)
- Stock restrictions (STORE_STOCK_RESTRICTION template)
- Markdown/discounts (future STORE_MARKDOWN)

The evaluator never consumes store rules. Store policies never consume mallet derroteros.

---

## Castillitos Derrotero (DERROTERO CS.xlsx)

### CS Niña Bebé (9 entries)
| Subgrupo | Target |
|---|---|
| Pijama Niña BB CL | 3 |
| Pijama Niña BB LL | 2 |
| Conjunto Niña BB CC | 3 |
| Conjunto Niña BB CL | 2 |
| Blusas | 2 |
| Vestido | 3 |
| Camiseta | 1 |
| Mameluco | 1 |
| Buzo / Camibuso | 1 |

### CS Niño Bebé (8 entries)
| Subgrupo | Target |
|---|---|
| Pijama Niño BB CL | 3 |
| Pijama Niño BB LL | 2 |
| Conjunto Niño BB CC | 2 |
| Conjunto Niño BB CL | 3 |
| Camiseta | 2 |
| Mameluco | 1 |
| Buzo / Camibuso | 1 |
| Polo | 1 |

### CS Niña Kids (8 entries)
| Subgrupo | Target |
|---|---|
| Pijama Niña Kids CL | 3 |
| Pijama Niña Kids LL | 2 |
| Conjunto Niña Kids CC | 2 |
| Conjunto Niña Kids CL | 2 |
| Blusa | 2 |
| Vestido | 3 |
| Camiseta | 1 |
| Buzo / Camibuso | 1 |

### CS Niño Kids (7 entries)
| Subgrupo | Target |
|---|---|
| Pijama Niño Kids CL | 3 |
| Pijama Niño Kids LL | 2 |
| Conjunto Niño Kids CC | 2 |
| Conjunto Niño Kids CL | 3 |
| Camiseta | 2 |
| Buzo / Camibuso | 1 |
| Polo | 1 |

---

## Latin Kids Derrotero

Adapted from existing DERROTERO_RULES in maletas-normalizer.ts.
6 groups: Conjuntos, Niño, Niña, Pijamas Bebé Niña, Pijamas Bebé Niño, Pijamas Grandes.
23 entries total. Values preserved exactly from existing rules.

---

## Importación / Accesorios

| Size Class | Target |
|---|---|
| Pequeño | 10 |
| Mediano | 10 |
| Grande | 3 |

Dimension: commercialWorld + sizeClass.
If sizeClass is not available from Product Domain, evaluation produces INSUFFICIENT_DATA.

---

## Precedence

Mallet assortment catalogs are per-tenant, per-brand, per-commercial-world.
Resolution order: tenantId → commercialWorld → brand → ACTIVE status.

---

## Evaluation

evaluateMalletAssortment() evaluates a mallet's current items against the applicable catalog.
Produces per-group results: complete/missing/excess/unresolved entries.
Overall status: COMPLETE / INCOMPLETE / OVER_ASSORTED / CONFLICTED / INSUFFICIENT_DATA.

---

## Suggestions

### ADD suggestions
For each missing entry, the evaluator searches available inventory matching the group+subgroup.
Candidates are sorted by availability then quality.
suggestedQty is capped at min(deficit, availableUnits).
If no candidates exist, a suggestion with reference=null explains why.

### SWAP suggestions
When a group has excess in one subgroup and deficit in another, the evaluator suggests swaps.
The commercial responsible makes the final decision — no automatic replacements.

---

## Data Gaps

If classification data (groupCode, subgroupCode, sizeClass) is missing:
- The entry is NOT classified arbitrarily
- Status: INSUFFICIENT_DATA
- unresolvedReason is recorded
- The reference appears in unresolvedEntries

---

## How to Update a Derrotero

1. Modify the group/entry constants in castillitos-mallet-assortment-catalog.ts
2. Increment the catalog version
3. Run test and validation scripts
4. No evaluator or engine code changes needed

---

## File Structure

```
lib/comercial/maletas/assortment-catalog/
  mallet-assortment-types.ts              — Types and constants
  mallet-assortment-catalog.ts            — Multi-tenant catalog registry
  mallet-assortment-validation.ts         — Catalog + input validation
  mallet-assortment-evaluator.ts          — Core evaluation engine
  mallet-assortment-evidence.ts           — Evidence builders + CDL bridge
  castillitos-mallet-assortment-catalog.ts — Castillitos tenant catalogs
  index.ts                                — Barrel exports
```

---

## Constraints

- No store policy consumption
- No Prisma, React, Next, UI
- No SAG adapter changes
- No Coverage Engine imports
- No tiendas/maletas engine coupling
- Catalogs are data — evaluator is logic — separated cleanly
- Multi-tenant: catalog registry is tenant-scoped
