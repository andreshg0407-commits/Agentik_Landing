# AGENTIK-COMERCIAL-MALETAS-DISCOVERY-01
**Sprint de descubrimiento técnico — Módulo Maletas**
**Fecha:** 2026-05-21
**Tenant:** castillitos
**Estado:** LISTO PARA REVISIÓN — no se ha tocado código

---

## 1. Resumen del proceso actual

El proceso de maletas es el sistema de **control de muestras comerciales** que los vendedores llevan a sus rutas. Existen dos archivos de trabajo activos que el equipo comercial mantiene manualmente en Excel:

- **MALETAS.xlsx** — derrotero maestro (qué debe llevar cada maleta) + estado actual de cada vendedor por referencia
- **DISPONIBLE PARA MALETAS.xlsx** — fuente de disponibilidad cruzada contra SAG

El proceso manual hoy es:
1. Se define el **derrotero** por línea y categoría (mínimos por tipo de prenda)
2. Se construye la maleta de cada vendedor: listado de referencias asignadas (LT o CS)
3. La columna `UNIDADES` de cada referencia se calcula con VLOOKUP contra disponibilidad SAG
4. Si `UNIDADES < 1` → no hay stock para reponer la maleta
5. Los lotes de producción "EN PROCESO" se registran manualmente en columnas adicionales como señal de reposición futura
6. No hay alertas automáticas — el equipo revisa el Excel y decide

---

## 2. Estructura detectada en los archivos Excel

### MALETAS.xlsx — 5 hojas

| Hoja | Filas | Propósito |
|---|---|---|
| `DISPONIBLE INFO` | 3,440 | Pivot de disponibilidad SAG: `código → inventario / pedidos / disponible` |
| `DERROTERO` | 76 | Mínimos por línea/categoría/prenda. Es el "rulebook" de qué debe ir en cada maleta |
| `LT.` | 192 | Maleta Latin Kids: 170 referencias activas, 4 vendedores, 5 lotes EN PROCESO |
| `CS` | 168 | Maleta Castillitos: 139 referencias activas, 4 vendedores, 4 lotes EN PROCESO |
| `PRECIOS LT` | 20 | Precios de venta Latin Kids por categoría/estilo/talla |

### DISPONIBLE PARA MALETAS.xlsx — 14 hojas

| Hoja | Filas | Propósito |
|---|---|---|
| `DISPONIBLE PARA MALETA` | 3,443 | Pivot principal (mismo que MALETAS `DISPONIBLE INFO`) |
| `Hoja8` | 20 | Extracto SAG de facturas: fecha, cliente, fuente (F1/F2/FE), vendedor, totales |
| `FORMATO LT` | 138 | Composición detallada de maleta LT: ref → cantidad disponible |
| `FORMATO CS` | 127 | Composición detallada de maleta CS: por segmento (NIÑA KIDS / NIÑA BB / NIÑO KIDS / NIÑO BB) |
| `Hoja4` | 163 | LT: todas las refs con VLOOKUP a disponible (vista operativa) |
| `Hoja3` | 166 | CS: todas las refs con VLOOKUP a disponible (vista operativa) |
| `LT` | 40 | Derrotero histórico LT Q1 2024 (referencia) |
| `CS` | 62 | Derrotero mínimos CS por prenda × segmento |
| `Hoja5` | 26 | Derrotero alternativo CS (posiblemente temporada anterior) |
| `Hoja6` | 553 | Disponibilidad de SKUs adicionales (accesorios, otros) |
| `Hoja7` | 75 | Disponibilidad con columna `PENDIENTE DESPACHO` |
| `Hoja1/2/Detalle1` | — | Detalles SAG por SKU individual (debug/auditoría) |

---

## 3. Modelo operativo detectado

### Vendedores (4 activos)

| Nombre en Excel | Nombre en SAG (Hoja8) |
|---|---|
| CARLOS LEON | (por confirmar) |
| CARLOS VILLA | (por confirmar) |
| NESTOR | NESTOR FERNANDO ALZATE JIMENEZ |
| ORLANDO | LUIS ORLANDO NARANJO |

> **Nota:** La hoja SAG (Hoja8) también muestra a JARLENYS PEREA DAVILA — puede ser un vendedor adicional no incluido en maletas todavía.

### Líneas comerciales (2)

| Línea | Código | Prefijo referencias | Segmentos |
|---|---|---|---|
| Latin Kids | LT | `L-XXXX` | Niña/Niño Kids + Bebé (pijamas, conjuntos) |
| Castillitos | CS | `C-`, `CT-`, `CF-`, `CGJ-`, `CP-`, `CJ-`, `CG-` | Niña BB / Niña Kids / Niño BB / Niño Kids |

### Lógica de asignación por vendedor

En las hojas `LT.` y `CS`:
- Valor `1` en columna vendedor = **este vendedor lleva esta referencia**
- Valor `None`/vacío = **no asignada a este vendedor**
- Columna `UNIDADES` = VLOOKUP a DISPONIBLE INFO (stock disponible actual de SAG)

### Lotes de producción EN PROCESO

| Línea | Lotes detectados |
|---|---|
| LT | ABRIL 7 / ABRIL 16 / ABRIL 28 / MAYO 11 / MAYO 20 EN PROCESO |
| CS | ENERO 19 / FEBRERO 25 / MARZO 30 / MAYO 15 EN PROCESO |

Estas columnas están siempre vacías en los datos actuales — la presencia de la columna es la señal. **La fecha del lote = fecha esperada de llegada.**

---

## 4. Derrotero — reglas mínimas detectadas

El DERROTERO define cuántas unidades de cada tipo de prenda debe contener una maleta.

### Latin Kids (LT)

| Segmento | Categoría | Mínimo |
|---|---|---|
| NIÑO | CL 2-8 | 5 conjuntos |
| NIÑO | CC 2-8 | 4 conjuntos |
| NIÑO | LL 2-8 | 3 conjuntos |
| NIÑO | CL 10-16 | 4 |
| NIÑO | CC 10-16 | 3 |
| NIÑO | LL 10-16 | 3 |
| General | 60 CONJUNTOS (panta) | 3 colores |
| General | 20 CONJUNTOS PANTALONETA | 5 |
| Pijamas Bebé NIÑA CL | - | 3 |
| Pijamas Bebé NIÑO CL | - | 3 |
| Pijamas Bebé NIÑA LL | - | 3 |
| Pijamas Bebé NIÑO LL | - | 3 |
| Pijamas Grandes NIÑA CL 18-22 | - | 2 |
| Pijamas Grandes NIÑO CL 18-22 | - | 2 |
| Pijamas Grandes NIÑA CC 18-22 | - | 2 |
| Pijamas Grandes NIÑO CC 18-22 | - | 2 |

### Castillitos (CS)

| Segmento | Prenda | Mínimo |
|---|---|---|
| NIÑA BEBE | PIJAMA LL | 2 |
| NIÑO BEBE | PIJAMA LL | 2 |
| NIÑA KIDS | PIJAMA LL | 2 |
| NIÑO KIDS | PIJAMA LL | 2 |
| NIÑA BEBE | PIJAMA CL | 3 |
| NIÑO BEBE | PIJAMA CL | 3 |
| NIÑA KIDS | PIJAMA CL | 3 |
| NIÑO KIDS | PIJAMA CL | 3 |
| NIÑA BEBE | CONJUNTO CC | 2 |
| NIÑO BEBE | CONJUNTO CC | 3 (BERMUDA) |
| NIÑA KIDS | CONJUNTO CC | 2 |
| NIÑO KIDS | CONJUNTO CC | 3 |
| NIÑA BEBE | CONJUNTO CL | 2 |
| NIÑO BEBE | CONJUNTO CL | 3 |
| (todos) | VESTIDO | 3 (niña) / 2 (niño) |
| (todos) | BLUSA / CAMISETA | 1 |
| (todos) | BUZO/CAMIBUSO | 1 |
| (todos) | MAMELUCOS | 1 |

> El derrotero de CS también existe en hoja `CS` de DISPONIBLE PARA MALETAS — **las dos fuentes deben unificarse**.

---

## 5. Mapeo de fuentes de datos

| Dato | Fuente | Observaciones |
|---|---|---|
| Lista de referencias por maleta | Excel MALETAS (LT./CS) | Se convierte en `CaseItem` estático configurable |
| Asignación vendedor × referencia | Excel MALETAS (valor 1/null) | Se convierte en `CaseItemAssignment` |
| Disponibilidad actual | SAG → `DISPONIBLE INFO` / `DISPONIBLE PARA MALETA` | SAG es fuente de verdad. VLOOKUP = query a SAG |
| Derrotero / mínimos | Excel DERROTERO | Se convierte en `DerroteroRule` configurable |
| Lotes en proceso | Columnas "FECHA EN PROCESO" en LT/CS | Requieren entidad `ProductionBatch` |
| Ventas por vendedor | SAG Hoja8 (facturas: fuente F1/F2/FE, nit, total, vendedor) | Permite priorización por volumen de ventas |
| Precios | Excel PRECIOS LT | Informativo — sin lógica de alerta directa |
| Disponible con despacho pendiente | Hoja7 (PENDIENTE DESPACHO) | Distinto a pedidos — stock asignado no despachado |

### Qué viene de SAG (fuente principal)
- `cantidad_en_inventario_para_disponible`
- `cantidad_en_pedidos`
- `cantidad_disponible` = inventario − pedidos
- Facturas por vendedor (ventas reales)
- Grupos, líneas, subgrupos, segmentos de producto

### Qué viene del Excel (se migrará a Prisma)
- Derrotero (mínimos por categoría)
- Asignación referencias → vendedores
- Lotes de producción en proceso

### Qué debe ser calculado
- **Estado de maleta**: `OK` | `PARCIAL` | `FALTANTE` | `CRÍTICO`
- **Gap de reposición**: `unidades_asignadas - disponible_SAG`
- **Acción recomendada**: `REPONER` (hay disponible) | `PRODUCIR` (sin stock) | `EN_PROCESO` (lote esperado)
- **Prioridad de alerta**: basada en ventas SAG del vendedor + días sin reponer

---

## 6. Reglas de negocio

```
REGLA 1 — Alerta de faltante
  IF disponible_SAG(ref) < min_qty(ref, vendedor)
    → ALERT tipo=FALTANTE severity=alta

REGLA 2 — Sin stock
  IF disponible_SAG(ref) == 0 AND no hay lote_en_proceso
    → ALERT tipo=SIN_STOCK severity=urgente

REGLA 3 — En proceso (mitigación)
  IF disponible_SAG(ref) == 0 AND EXISTS lote_en_proceso(ref)
    → ALERT tipo=EN_PROCESO severity=normal
    → mostrar fecha esperada del lote

REGLA 4 — Reponer si hay disponible
  IF disponible_SAG(ref) >= min_qty(ref) AND estado_maleta(vendedor, ref) == FALTANTE
    → accion=REPONER (hay stock, es decisión operativa)

REGLA 5 — Producir si no hay disponible
  IF disponible_SAG(ref) == 0 AND no hay lote_en_proceso
    → accion=SOLICITAR_PRODUCCION

REGLA 6 — Prioridad multi-vendedor
  IF varios vendedores tienen faltante del mismo ref
    → prioridad por vendedor = f(ventas_SAG_últimos_30d)
    → vendedor con más ventas tiene prioridad de reposición

REGLA 7 — Prioridad derrotero
  IF faltante es en categoría de alto mínimo (≥3)
    → severity escalada a urgente
  IF faltante es en categoría de mínimo 1
    → severity=normal

REGLA 8 — Disponible negativo
  IF disponible_SAG(ref) < 0 (existen pedidos > inventario)
    → ALERT tipo=SOBRE_COMPROMETIDO severity=urgente
    → No reponer hasta resolver
```

---

## 7. Modelo de datos Prisma sugerido

```prisma
// Línea comercial (LT = Latin Kids, CS = Castillitos)
model CommercialLine {
  id          String  @id @default(cuid())
  orgId       String
  code        String  // "LT" | "CS"
  name        String  // "Latin Kids" | "Castillitos"
  cases       CommercialCase[]
  rules       DerroteroRule[]
  batches     ProductionBatch[]
  org         Organization @relation(fields: [orgId], references: [id])
  @@unique([orgId, code])
}

// Maleta de un vendedor en un período
model CommercialCase {
  id          String   @id @default(cuid())
  orgId       String
  lineId      String
  vendorName  String   // "CARLOS LEON" | "CARLOS VILLA" | "NESTOR" | "ORLANDO"
  sagVendorId String?  // link al vendedor en SAG si existe
  period      String   // "2026-Q2"
  status      String   // "active" | "inactive"
  line        CommercialLine  @relation(fields: [lineId], references: [id])
  items       CaseItem[]
  alerts      CaseAlert[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// Ítem (referencia) asignado a una maleta
model CaseItem {
  id          String   @id @default(cuid())
  caseId      String
  refCode     String   // e.g. "L-2407", "CGJ-1312465B"
  description String
  minQty      Int      @default(1)
  assigned    Boolean  @default(true) // false = referencia existe pero no asignada a este vendedor
  case        CommercialCase @relation(fields: [caseId], references: [id])
}

// Regla del derrotero: mínimo por línea × segmento × prenda
model DerroteroRule {
  id          String  @id @default(cuid())
  orgId       String
  lineId      String
  segment     String  // "NIÑA KIDS" | "NIÑO BEBE" | "NIÑA BEBE" | "NIÑO KIDS"
  prendaType  String  // "PIJAMA CL" | "CONJUNTO CC" | "BLUSA" | "VESTIDO" ...
  minQty      Int
  line        CommercialLine @relation(fields: [lineId], references: [id])
}

// Snapshot de disponibilidad importado desde SAG
model CaseInventorySnapshot {
  id          String   @id @default(cuid())
  orgId       String
  refCode     String
  description String
  line        String?  // "LT" | "CS"
  segment     String?  // grupo SAG
  inventario  Int
  pedidos     Int
  disponible  Int      // inventario - pedidos (puede ser negativo)
  snapshotAt  DateTime @default(now())
  @@index([orgId, refCode])
}

// Lote de producción en proceso
model ProductionBatch {
  id          String    @id @default(cuid())
  orgId       String
  lineId      String
  label       String    // "MAYO 20 EN PROCESO"
  expectedAt  DateTime?
  status      String    // "en_proceso" | "entregado" | "cancelado"
  line        CommercialLine @relation(fields: [lineId], references: [id])
  createdAt   DateTime  @default(now())
}

// Alerta operativa de maleta
model CaseAlert {
  id          String    @id @default(cuid())
  orgId       String
  caseId      String
  refCode     String
  alertType   String    // "faltante" | "sin_stock" | "en_proceso" | "sobre_comprometido"
  severity    String    // "urgente" | "alta" | "normal"
  accion      String?   // "REPONER" | "SOLICITAR_PRODUCCION" | "ESPERAR_LOTE"
  resolvedAt  DateTime?
  case        CommercialCase @relation(fields: [caseId], references: [id])
  createdAt   DateTime  @default(now())
}
```

---

## 8. Flujo Agentik propuesto

```
SAG (ProductReference/SaleRecord)
        │
        ▼
CaseInventorySnapshot  ←  importación periódica (diaria o bajo demanda)
        │
        ▼
[motor de maletas] ← DerroteroRule + CaseItem + CaseAlert
        │
        ├── CANVAS: /comercial/maletas
        │     ├── Estado por vendedor (OK / PARCIAL / CRÍTICO)
        │     ├── Cola de alertas activas (severity × línea × ref)
        │     ├── Lotes en proceso con fecha
        │     └── Disponible vs. asignado por referencia
        │
        └── RAIL DERECHO: David (agente comercial)
              ├── "Nestor tiene 12 faltantes en LT — prioridad alta por ventas"
              ├── "L-2407 sin stock, próximo lote MAYO 20"
              └── "CS Orlando tiene 3 urgentes con stock disponible hoy"
```

### Agente responsable

**David** (agente comercial de Agentik) — via `copilot-agent-registry.ts`, ruta `/comercial/*` → David.

---

## 9. Ubicación en sidebar

```
Comercial
├── Pipeline
├── Maletas ← nuevo
│     ├── Latin Kids
│     └── Castillitos
├── Clientes
└── ...
```

Ruta sugerida: `/[orgSlug]/comercial/maletas`

**No crear módulo `/comercial` todavía si no existe.** Verificar `module-nav-config.ts` antes de implementar.

---

## 10. Relación con otros módulos

| Módulo | Relación |
|---|---|
| **Inventario / SAG** | Fuente única de verdad para `disponible`. `CaseInventorySnapshot` se alimenta de SAG |
| **Producción** | Cuando `accion=SOLICITAR_PRODUCCION` → genera señal hacia módulo de producción (futura integración) |
| **Ventas (SAG)** | Facturas por vendedor → prioridad de reposición (más ventas = más prioridad) |
| **Copilot / David** | David observa alertas, interpreta tendencias, recomienda acciones |

---

## 11. Riesgos y dudas abiertas

| # | Riesgo / Duda | Severidad |
|---|---|---|
| 1 | **Disponibilidad negativa en SAG**: algunos refs tienen `disponible < 0` (pedidos > inventario). El sistema debe manejar esto explícitamente | Alta |
| 2 | **Mapeo vendedor Excel → SAG**: "CARLOS LEON" y "CARLOS VILLA" no aparecen en la muestra de Hoja8. Hay que confirmar nombres exactos en SAG | Media |
| 3 | **Múltiples versiones del derrotero**: existen al menos 3 tablas de derrotero (MALETAS DERROTERO, DISPONIBLE CS, DISPONIBLE Hoja5). Hay que definir cuál es la oficial | Alta |
| 4 | **Jarlenys Perea Davila** aparece en SAG como vendedor pero no en maletas — ¿debe incluirse? | Baja |
| 5 | **Periodicidad del snapshot SAG**: ¿cada cuánto se actualiza disponibilidad? ¿en tiempo real o batch diario? | Media |
| 6 | **Lotes EN PROCESO sin refs asignadas**: las columnas de lote no tienen referencias específicas — solo la cantidad del lote. ¿Cómo se mapea lote → ref específica? | Alta |
| 7 | **Precios LT incompletos**: solo LT tiene precios. CS no tiene tabla de precios en el Excel | Baja |
| 8 | **Hoja7 con PENDIENTE DESPACHO**: es una columna distinta a "pedidos". ¿Es un estado SAG diferente o un campo externo? | Media |

---

## 12. Sprint siguiente sugerido: AGENTIK-MALETAS-V1-01

### Alcance mínimo viable

**Fase 1 — Prisma (sin UI)**
- Agregar los 6 modelos al `schema.prisma`
- No tocar ningún modelo existente
- Migration + seed con datos de los Excel

**Fase 2 — Lib/queries**
- `lib/comercial/maletas-queries.ts` — leer estado de maletas
- `lib/comercial/maletas-alerts.ts` — motor de alertas (reglas 1-8)
- `lib/comercial/maletas-import.ts` — importar snapshot desde SAG

**Fase 3 — UI mínima**
- `/[orgSlug]/comercial/maletas/page.tsx` (Server Component)
- `maletas-client.tsx` — Canvas: tabla por vendedor × línea × estado
- Drawer por vendedor: lista de refs, disponible, severity, acción
- Right rail: David con alertas operativas

**Entregables NO incluidos en V1**
- Integración automática con SAG (manual import primero)
- Formulario de configuración de derrotero
- Módulo de producción conectado
- Histórico de reposiciones

---

*Documento generado por AGENTIK-COMERCIAL-MALETAS-DISCOVERY-01. No se tocó código. TSC no aplica.*
