# VENDOR-SAMPLE-LEDGER-UI-CORRECTION-01

**Sprint:** VENDOR-SAMPLE-LEDGER-UI-CORRECTION-01
**Module:** Comercial > Maletas
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Problem

VENDOR-SAMPLE-LEDGER-01 assigned all 3,071 CoverageSnapshot refs to every vendor identically. This was semantically wrong:

- A vendor's maleta should contain ONLY refs physically present in their warehouse
- Refs with qty=0 in a vendor's bodega do NOT belong in that maleta
- 3,071 refs per vendor is a coverage matrix, not a bag inventory

---

## Rule

```
A reference belongs to a vendor's maleta ONLY IF:
  ProductInventoryLevel.quantity > 0
  WHERE warehouseId = vendor's warehouse code
```

---

## Architecture (Corrected)

```
ProductInventoryLevel (PIL)         CommercialCoverageSnapshot
  warehouseId IN ('35'..'40')         3,071 unique refs
  quantity > 0                        central availability
        |                                    |
        v                                    v
vendor-sample-loader.ts  ──── LEFT JOIN ────────
        |
        ├── actualBagItems per vendor (qty > 0 in their warehouse)
        ├── coverageGaps (central inventory, 0 vendor presence)
        └── productionSuggestions (bag items with depleted central)
```

### Data Sources

| Source | Purpose | Rows |
|---|---|---|
| `ProductInventoryLevel` | Real per-warehouse stock | ~443 rows with qty > 0 across B36/B37/B39 |
| `ProductEntity` | SKU, name, productLine | JOIN on productId |
| `CommercialCoverageSnapshot` | Central availability, line, description | LEFT JOIN on sku = refCode |

### ProductLine Mapping

| ProductEntity.productLine | CoverageSnapshot.line | Business |
|---|---|---|
| "1" | "LT" | Latin Kids — minimum 30 |
| "2" | "CS" | Castillitos — minimum 20 |
| "5" | "IMPORT" | Imported accessories — minimum 10 |

---

## Real Vendor Data

| Warehouse | Vendor | Refs (qty>0) | Total Units | Notes |
|---|---|---|---|---|
| B35 | Orlando | 0 | 0 | No PIL data |
| B36 | Carlos Leon | 84 | 49,109 | All imports (productLine 5) |
| B37 | Luis | 106 | 33,247 | All imports |
| B38 | Nestor | 0 | 0 | 354 PIL rows but all qty=0 |
| B39 | Carlos Villa | 253 | 884 | 155 match CoverageSnapshot |
| B40 | Fredy | 0 | 0 | No PIL data |

---

## Changes

### 1. vendor-sample-loader.ts — REWRITTEN

**Before:** Read CoverageSnapshot, assign all 3,071 refs to all 6 vendors.
**After:** Query PIL per vendor warehouse (qty > 0), JOIN ProductEntity, LEFT JOIN CoverageSnapshot.

Key query:
```sql
SELECT pil."warehouseId", pe.sku, pe.name, pe."productLine",
       SUM(pil.quantity)::int AS "vendorQty",
       cs.disponible::int, cs.description, cs.line
FROM "ProductInventoryLevel" pil
JOIN "ProductEntity" pe ON pe.id = pil."productId"
LEFT JOIN LATERAL (
  SELECT disponible, description, line
  FROM "CommercialCoverageSnapshot" c
  WHERE c."refCode" = pe.sku
  ORDER BY c."snapshotAt" DESC LIMIT 1
) cs ON true
WHERE pil."warehouseId" = ANY($2) AND pil.quantity > 0
GROUP BY ...
```

### 2. maletas-client.tsx — REWRITTEN

- Cards now show real per-vendor counts (84, 106, 253 — not 3,071)
- `totalUnits` = sum of `quantityInBag` (actual bag units, not central available)
- Empty vendors (B35/B38/B40) show as "Sin datos" with reduced opacity
- Vendors sorted by totalRefs (active vendors first)

### 3. Drawer UX

- Width: `wide` (680px) via new `size` prop on OperationalSideDrawer
- Search input for reference/description filtering
- State filter tabs with counts
- Results counter
- Pagination: shows 50 refs initially, "Ver mas" button
- Table columns: Ref, Descripcion, Linea, **Maleta** (bag qty), Central, Min, Estado
- Empty state message when no refs match

### 4. OperationalSideDrawer

- Added `size` prop: `"default"` (420px) | `"wide"` (680px) | `"full"` (960px)
- Backwards compatible — default remains 420px

### 5. Coverage Opportunities

- Redesigned as compact section with subtitle
- Shows max 10 initially, "Ver todas" button
- Only refs with central disponible >= 20 and NOT present in any vendor warehouse

### 6. Production Suggestions

- Only includes refs actually present in vendor bags where central is depleted
- `affectedVendors` now reflects real vendor presence (not all 6)

---

## State Derivation (Corrected)

For refs that ARE in a vendor's bag (vendorQty > 0):

| Central Available | State | Meaning |
|---|---|---|
| >= minimum | `saludable` | Central can replenish |
| > 0 but < minimum | `riesgo` | Central running low |
| <= 0 | `critica` | Central depleted, bag will empty |

The replacement engine then upgrades `riesgo`/`critica` to `reemplazar` if a same-line/category candidate exists in CoverageSnapshot with high availability.

---

## Validation

```
B36 (Carlos Leon): 84 refs in drawer (not 3,071)
B37 (Luis): 106 refs in drawer
B39 (Carlos Villa): 253 refs in drawer
B35/B38/B40: "Sin referencias en maleta" (0 PIL stock)

TSC: 160 (maintained)
```
