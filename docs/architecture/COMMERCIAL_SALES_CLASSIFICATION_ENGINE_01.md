# COMMERCIAL_SALES_CLASSIFICATION_ENGINE_01

**Sprint:** COMMERCIAL-SALES-CLASSIFICATION-ENGINE-01
**Fecha:** 2026-07-09
**Layer:** Commercial Intelligence

---

## Purpose

Reusable multi-evidence engine that determines the sales channel (DETAL vs MAYORISTA) for each transaction line. Belongs to the Commercial Intelligence layer, consumed by Importaciones and future commercial modules.

## Architecture

```
lib/comercial/intelligence/
  sales-classification-types.ts    — Domain types
  sales-classification-config.ts   — Per-tenant configuration
  sales-classification-engine.ts   — Classification engine
```

## Evidence Model

The engine evaluates 5 evidence types per transaction line:

| Evidence | Weight (Castillitos) | Data Status |
|---|---|---|
| Price comparison (unitValue vs PV3/PV4) | 1.0 | Available — primary signal |
| Sale origin (sourceCode, rawJson) | 0.0 | Unavailable — sourceCode="PD" always, rawJson={} |
| Customer type (customerType, segment) | 0.0 | Unavailable — all B2B, no segment |
| Price list | 0.0 | Field does not exist in schema |
| Operation type (documentType) | 0.0 | Unavailable — no document type data |

### Price Comparison Logic

PV3 = precio detal (SAG v_articulos.n_valor_venta_promocion)
PV4 = precio mayorista (SAG v_articulos.nd_valor_venta4)

1. If unitValue matches PV3 within tolerance (8%) -> strong detal signal
2. If unitValue matches PV4 within tolerance (8%) -> strong mayorista signal
3. If both PV3 and PV4 available -> proximity scoring (closer = higher score)
4. If unitValue > PV3 -> weak detal signal (surcharge)
5. If unitValue < PV3 -> weak mayorista signal (discount)

## Confidence Model

```
confidence = spread * 0.6 + maxScore * 0.2 + strengthBonus * 0.2
```

- `spread`: absolute difference between detal and mayorista weighted scores
- `maxScore`: highest weighted score
- `strengthBonus`: average evidence strength (STRONG=1.0, MODERATE=0.6, WEAK=0.3)

If confidence < threshold (0.6): channel = PENDIENTE

## Per-Tenant Configuration

Each tenant has:
- Evidence weights (which signals to trust)
- Price tolerance (margin for price matching)
- Confidence threshold (minimum to classify)
- Channel-specific source codes, customer types, document types

Default config = Castillitos (only price comparison active).

## Consumer: Importaciones

`import-service.ts` collects `unitValue` from each `CustomerOrderLine`, builds `ClassificationInput[]`, and calls `classifyBulk()` per product reference.

Channel splits (salesDetal6m, soldDetal, etc.) are estimated from classification ratios applied to total sales.

Monthly detail in drawer uses per-line `classifySale()` for detal/mayorista split.

## Boundary Rules

- Engine is pure computation — no Prisma, no SAG, no I/O
- Config is static per-tenant — no database queries
- Consumers (Importaciones, future Maletas) provide the data
- Engine never guesses — insufficient evidence = PENDIENTE
- All decisions are explainable via `evidence[]` array

## Future Consumers

| Module | When | Signal |
|---|---|---|
| Importaciones | Now | unitValue vs PV3/PV4 |
| Maletas | Future | Same engine, different config |
| Inventario | Future | Demand by channel |
| Executive | Future | Channel performance KPIs |
