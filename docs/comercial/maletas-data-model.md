# Maletas — Proposed Prisma Data Model
**Sprint:** AGENTIK-COMERCIAL-MALETAS-ENGINE-01
**Status:** PROPOSED — do NOT migrate yet. Engine validated with Excel first.

---

## When to migrate

Migrate when:
1. The `/api/internal/comercial/maletas/preview` endpoint returns correct operational context.
2. The UI sprint (AGENTIK-MALETAS-UI-01) is approved.
3. SAG vendor name mapping is fully confirmed for all 4 vendors.

---

## Prisma models

```prisma
// ──────────────────────────────────────────────────────────
// Commercial Sales Rep — replaces static VENDOR_REGISTRY
// ──────────────────────────────────────────────────────────
model CommercialSalesRep {
  id          String   @id @default(cuid())
  orgId       String
  excelName   String   // "CARLOS LEON" — as appears in Excel column header
  sagName     String?  // "NESTOR FERNANDO ALZATE JIMENEZ" — confirmed SAG name
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  cases       CommercialCase[]
  alerts      CommercialCaseAlert[]

  org         Organization @relation(fields: [orgId], references: [id])
  @@unique([orgId, excelName])
  @@index([orgId])
}

// ──────────────────────────────────────────────────────────
// Commercial Case — one maleta per sales rep per line
// ──────────────────────────────────────────────────────────
model CommercialCase {
  id          String   @id @default(cuid())
  orgId       String
  salesRepId  String
  line        String   // "LT" | "CS"
  period      String   // "2026-Q2"
  status      String   @default("active") // "active" | "inactive"
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  salesRep    CommercialSalesRep @relation(fields: [salesRepId], references: [id])
  items       CommercialCaseItem[]
  alerts      CommercialCaseAlert[]

  org         Organization @relation(fields: [orgId], references: [id])
  @@unique([orgId, salesRepId, line, period])
  @@index([orgId, line])
}

// ──────────────────────────────────────────────────────────
// Commercial Case Item — one ref per case (seeded from Excel)
// ──────────────────────────────────────────────────────────
model CommercialCaseItem {
  id          String  @id @default(cuid())
  caseId      String
  refCode     String  // "L-2407" | "CGJ-1312465B"
  description String
  minimumQty  Int     @default(1) // item-level minimum

  case        CommercialCase @relation(fields: [caseId], references: [id])
  @@index([caseId])
  @@index([refCode])
}

// ──────────────────────────────────────────────────────────
// Derrotero Rule — category/garment minimums (from Excel DERROTERO)
// ──────────────────────────────────────────────────────────
model CommercialCaseRule {
  id              String  @id @default(cuid())
  orgId           String
  line            String  // "LT" | "CS"
  category        String  // "NIÑA BEBE" | "NIÑO KIDS" | "PIJAMAS BEBÉ NIÑA"
  garmentType     String  // "PIJAMA CL" | "CONJUNTO CC" | "VESTIDO"
  sizeRange       String? // "2-8" | "10-16" | "NIÑA 18-22" | null
  minimumRequired Int
  priorityWeight  Int     @default(1)

  org             Organization @relation(fields: [orgId], references: [id])
  @@index([orgId, line])
}

// ──────────────────────────────────────────────────────────
// Inventory Snapshot — availability from SAG (replaces Excel DISPONIBLE INFO)
// ──────────────────────────────────────────────────────────
model CommercialInventorySnapshot {
  id          String   @id @default(cuid())
  orgId       String
  refCode     String
  description String
  line        String?  // "LT" | "CS" | null (if not line-specific)
  segment     String?  // SAG grupo/subgrupo
  inventario  Int
  pedidos     Int
  disponible  Int      // inventario - pedidos (may be negative)
  snapshotAt  DateTime @default(now())

  org         Organization @relation(fields: [orgId], references: [id])
  @@index([orgId, refCode])
  @@index([orgId, snapshotAt])
}

// ──────────────────────────────────────────────────────────
// Production Batch — "EN PROCESO" entries (from Excel column headers)
// ──────────────────────────────────────────────────────────
model CommercialProductionBatch {
  id          String    @id @default(cuid())
  orgId       String
  line        String    // "LT" | "CS"
  label       String    // "MAYO 20 EN PROCESO"
  expectedAt  DateTime?
  status      String    @default("en_proceso") // "en_proceso" | "entregado" | "cancelado"
  createdAt   DateTime  @default(now())

  org         Organization @relation(fields: [orgId], references: [id])
  @@index([orgId, line])
}

// ──────────────────────────────────────────────────────────
// Case Alert — computed operational alerts (engine output)
// ──────────────────────────────────────────────────────────
model CommercialCaseAlert {
  id                  String    @id @default(cuid())
  orgId               String
  caseId              String
  salesRepId          String
  refCode             String
  alertType           String    // "BAJO_MINIMO" | "SIN_STOCK" | "EN_PROCESO" | "SOBRE_COMPROMETIDO"
  severity            String    // "urgente" | "alta" | "normal"
  recommendedAction   String    // "REPONER_MALETA" | "PRODUCIR" | "ESPERAR_LOTE" | "REVISAR"
  reason              String
  currentUnits        Int
  minimumRequired     Int
  availableToReplenish Int
  resolvedAt          DateTime?
  createdAt           DateTime  @default(now())

  case                CommercialCase @relation(fields: [caseId], references: [id])
  salesRep            CommercialSalesRep @relation(fields: [salesRepId], references: [id])
  org                 Organization @relation(fields: [orgId], references: [id])
  @@index([orgId, severity])
  @@index([orgId, refCode])
}
```

---

## Organization back-relations to add

When migrating, add to the `Organization` model:

```prisma
commercialSalesReps         CommercialSalesRep[]
commercialCases             CommercialCase[]
commercialCaseRules         CommercialCaseRule[]
commercialInventorySnapshots CommercialInventorySnapshot[]
commercialProductionBatches CommercialProductionBatch[]
commercialCaseAlerts        CommercialCaseAlert[]
```

---

## Migration strategy

1. **Seed phase**: Read Excel files → populate all models via `prisma/seed.ts`
2. **Bootstrap phase**: Engine reads from Prisma instead of Excel
3. **Live phase**: SAG sync job populates `CommercialInventorySnapshot` daily
4. **Retire Excel**: Once Prisma data is validated against Excel for 2 sprints

---

## SAG connection points

| Prisma field | SAG source |
|---|---|
| `CommercialInventorySnapshot.inventario` | `CANTIDAD_EN_INVENTARIO_PARA_DISPONIBLE` |
| `CommercialInventorySnapshot.pedidos` | `CANTIDAD_EN_PEDIDOS` |
| `CommercialInventorySnapshot.disponible` | `CANTIDAD_DISPONIBLE` |
| `CommercialSalesRep.sagName` | `vendedor` field in SAG invoice export |

---

## SAG source code mapping (confirmed by Castillitos administration)

Patch: AGENTIK-COMERCIAL-MALETAS-SAG-SOURCES-PATCH-01

| Source code | Label | Role in Maletas | Affects velocity | Affects demand | Notes |
|---|---|---|---|---|---|
| `OFICIAL` | Factura oficial | Completed sale | ✅ Yes | ✅ Yes | Primary velocity signal |
| `REMISION` | Remisión | Completed sale | ✅ Yes | ✅ Yes | Counted same as OFICIAL for velocity |
| `PD` | Pedidos | Pending orders | ❌ No | ✅ Yes | Commercial demand pressure only — NOT a completed sale |
| `AP` | Limpieza de pedidos | Order cleanup | ❌ No | ❌ No | **Excluded from ALL calculations** |

### Disponible operativo (canonical formula)

```
availableForCases = bodega_inicial - reservas
                  = inventario     - pedidos
```

- `inventario` (bodega inicial) = raw warehouse quantity
- `pedidos` (reservas) = quantities reserved via PD source — already netted out
- `disponible` = the only value that should drive coverage calculations
- **Never use `inventario` alone for coverage** — it overstates real availability

### PD pressure behavior

When `pedidos > 0` for a ref:
- `buildPendingOrdersMap()` extracts it as commercial pressure
- `computeOperationalScore()` boosts urgency proportional to coverage status
- `sin_stock + PD > 0` → score capped at 100 (maximum urgency)
- `cobertura_baja + PD > 0` → +10 score boost
- `cobertura_alta + PD > 0` → +3 score boost (mild awareness)

### AP exclusion rules

AP records must be excluded at all layers:
- `normalizeSaleRecordToHint()` returns `null` for AP source
- `buildSaleHintQuery()` excludes `"AP"` from the WHERE clause
- AP never contributes to `SagSaleHint[]`, velocity, or demand pressure
- AP can only be used for trazabilidad / audit purposes (not implemented yet)
| Sales priority (future) | `SaleRecord` by vendor, last 30 days |
