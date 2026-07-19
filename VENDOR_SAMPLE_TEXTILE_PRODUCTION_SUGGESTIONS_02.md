# VENDOR-SAMPLE-TEXTILE-PRODUCTION-SUGGESTIONS-02

**Sprint:** VENDOR-SAMPLE-TEXTILE-PRODUCTION-SUGGESTIONS-02
**Module:** Comercial > Maletas
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Correction

Production suggestions were using bag quantity (vendorWarehouseQty) to calculate demand and urgency. This is wrong — the vendor's bodega is a **showroom** (mostrario). The OP decision is based exclusively on **central/principal inventory**.

## Rules

| Metric | Source | Used for |
|---|---|---|
| `centralAvailable` | CommercialCoverageSnapshot | OP decision, shortfall, urgency |
| `minimumRequired` | Business rules (LT=30, CS=20) | Threshold for triggering suggestion |
| `shortfall` | `max(minimum - centralAvailable, 0)` | Quantity to produce |
| `quantityInBag` | ProductInventoryLevel | Informational only — samples in field |

## Urgency (based on central level)

| Condition | Urgency |
|---|---|
| `centralAvailable = 0` | alta |
| `centralAvailable < minimum / 2` | media |
| `centralAvailable < minimum` | baja |

## suggestedQty

```
suggestedQty = max(minimumRequired - centralAvailable, 0)
```

No arbitrary multipliers. The suggestion is to reach the operational minimum.

## Type Changes

`ProductionSuggestion` in `vendor-sample-types.ts`:

| Field | Before | After |
|---|---|---|
| `totalDemand` | bag qty drove OP | Removed |
| `samplesInField` | — | New: total quantityInBag across vendors (informational) |
| `minimumRequired` | — | New: LT=30, CS=20 |
| `shortfall` | — | New: max(min - central, 0) |
| `suggestedQty` | `min * vendors * 1.5` | `shortfall` (reach minimum) |
| `urgency` | vendor count driven | central inventory level driven |

## UI Changes

Table columns: Referencia, Descripcion, **Central**, **Min**, **Faltante**, Vendedores, Urgencia

Subtitle: "Referencias textiles en maletas cuyo inventario central esta por debajo del minimo operativo"

## Files Modified

- `lib/comercial/maletas/vendor-sample-types.ts` — ProductionSuggestion interface
- `lib/comercial/maletas/vendor-sample-loader.ts` — production suggestion builder
- `lib/comercial/maletas/vendor-sample-service.ts` — production suggestion builder (engine path)
- `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx` — table columns and subtitle
