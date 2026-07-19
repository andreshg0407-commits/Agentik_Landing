# VENDOR-SAMPLE-PRODUCTION-FILTER-01

**Sprint:** VENDOR-SAMPLE-PRODUCTION-FILTER-01
**Module:** Comercial > Maletas
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Problem

Production suggestions included imported accessories (teteros, rasca encias, cepillos, cubiertos) which are not manufactured internally. Only textile lines (LT, CS) should appear as production candidates.

## Change

`lib/comercial/maletas/vendor-sample-loader.ts` — added guard at the top of the production suggestions loop:

```typescript
if (ref.line !== "LT" && ref.line !== "CS") continue;
```

## Excluded

- `line = "IMPORT"` (productLine 5 — teteros, cepillos, rasca encias, cubiertos, baberos, chupos, vacenillas)
- `line = "OTRO"` (unclassified non-textile)
- Any line that is not LT or CS

## Included

- `line = "LT"` (Latin Kids — textile, minimum 30)
- `line = "CS"` (Castillitos — textile, minimum 20)
