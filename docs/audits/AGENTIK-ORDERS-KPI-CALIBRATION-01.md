# AGENTIK-ORDERS-KPI-CALIBRATION-01

Sprint: Orders KPI Calibration
Tenant: Castillitos
Date: 2026-07-23

---

## 1. Bug — Causa exacta

**Linea 610 de pedidos-client.tsx (antes del fix):**

```typescript
const opStats = computeOperationalStats(orders);
```

`orders` era un unico `useState<OrderCard[]>` que se **reemplazaba** al hacer clic en un KPI:

```typescript
const loadOrders = useCallback(async (statusFilter?: string) => {
  const data = await orderApi(orgSlug, { action: "list", status: statusFilter });
  setOrders(data.orders ?? []);  // <-- reemplaza el dataset maestro
}, [orgSlug]);
```

Al seleccionar un KPI, se llamaba `loadOrders(statusFilter)` que reemplazaba `orders` con el subconjunto filtrado. Los KPIs, que se calculaban sobre `orders`, se recalculaban con datos parciales. El KPI seleccionado mostraba su propio conteo y los demas caian a 0 o cambiaban.

**Patron roto:**

```
click KPI "Sincronizados" →
  loadOrders("sincronizado") →
    setOrders([solo sincronizados]) →
      computeOperationalStats([solo sincronizados]) →
        borradores=0, simulacion=0, sincronizados=X  ← BUG
```

---

## 2. Arquitectura — allOrders vs filteredOrders

### Despues del fix

```
allOrders (estado maestro, nunca filtrado)
  ├── computeCalibratedKpiStats(allOrders)  ← KPIs SIEMPRE estables
  └── filteredOrders = applyQuickFilter(allOrders, quickFilter)  ← solo para tabla
```

| Estado | Proposito | Mutado por |
|---|---|---|
| `allOrders` | Dataset completo para KPIs + filtrado | `reloadAllOrders()` (post-mutation) |
| `quickFilter` | Filtro rapido activo | `handleQuickFilter()` / `handleKpiClick()` |
| `activeKpi` | KPI seleccionado | `handleKpiClick()` |
| `filteredOrders` | Derivado de allOrders + quickFilter | Computado (no es estado) |

### Reglas implementadas

- Hacer clic en un KPI: filtra la tabla via `quickFilter`, KPIs no cambian.
- Segundo clic en KPI activo: desactiva filtro, tabla vuelve a "todos".
- Hacer clic en filtro rapido: desactiva KPI activo, filtra tabla.
- `reloadAllOrders()`: recarga dataset maestro despues de mutaciones (save/submit/cancel).
- **Cero llamadas al servidor** por seleccionar un KPI.

---

## 3. Cinco KPIs finales

| # | Key | Label | Regla | Color activo |
|---|---|---|---|---|
| 1 | `valor_pedidos_hoy` | Valor pedidos hoy | `sum(totalValue)` de pedidos con fecha comercial = hoy, excluye cancelados | ink |
| 2 | `pedidos_de_hoy` | Pedidos de hoy | `count` de pedidos con fecha comercial = hoy, excluye cancelados | ink |
| 3 | `pendientes_envio_sag` | Pendientes de envio a SAG | AGENTIK_NATIVE + status in [listo_para_enviar, pendiente_sag, conflicto retryable]. Excluye SAG_HISTORICAL, CRM_LEGACY, borradores | blueDark |
| 4 | `sincronizados_agentik` | Sincronizados con SAG | AGENTIK_NATIVE + sincronizado. NO incluye SAG_HISTORICAL | green |
| 5 | `con_conflicto` | Con conflicto | Cualquier origen: status=conflicto, reserva expirada, conflicto de reserva | red |

### Fecha comercial

- Usa `createdAt` como proxy (header.orderDate solo disponible en OrderDraft, no en OrderCard).
- Respeta timezone del tenant (COT = -300 minutos).
- Cancelados excluidos de "hoy".

### Formato monetario

- `$X.XXX.XXX` usando `toLocaleString("es-CO")`.
- Cero muestra em dash (`—`).
- Font size menor que los demas KPIs para evitar numeros excesivamente grandes.

---

## 4. Reglas exactas

### Pendientes de envio a SAG

| Incluye | Excluye |
|---|---|
| AGENTIK_NATIVE + listo_para_enviar | SAG_HISTORICAL (cualquier status) |
| AGENTIK_NATIVE + pendiente_sag | CRM_LEGACY (cualquier status) |
| AGENTIK_NATIVE + conflicto sin sagError (retryable) | Borradores |
| | Sincronizados |
| | Cancelados |

### Sincronizados con SAG

| Incluye | Excluye |
|---|---|
| AGENTIK_NATIVE + sincronizado | SAG_HISTORICAL + sincronizado (9,562 registros) |
| | CRM_LEGACY |
| | Cualquier otro status |

### Con conflicto

| Incluye | Excluye |
|---|---|
| status = conflicto (cualquier origen) | Warnings informativos |
| Reserva expirada (no sincronizado, no cancelado) | Sincronizados con hasConflict |
| Conflicto de reserva (no sincronizado, no cancelado) | Cancelados con hasConflict |

---

## 5. Conteos reales (Castillitos)

### KPIs con datos actuales

| KPI | Valor |
|---|---|
| Valor pedidos hoy | $0 (no hay pedidos hoy) |
| Pedidos de hoy | 0 |
| Pendientes de envio a SAG | 0 (no existen AGENTIK_NATIVE en cola) |
| Sincronizados con SAG | 0 (no existen AGENTIK_NATIVE sincronizados) |
| Con conflicto | 0 |

### Distribucion de datos en DB

| Fuente | Status | Count |
|---|---|---|
| CustomerOrderRecord | FACTURADO | 9,562 |
| CustomerOrderRecord | PENDIENTE | 115 |
| CustomerOrderRecord | CANCELADO | 1 |
| CRMQuote | Facturado | 142 |
| CRMQuote | Gestionado_Parcialmente | 48 |
| CRMQuote | No_Gestionado | 46 |
| CRMQuote | Remisionado | 31 |
| CRMQuote | Pendiente | 25 |
| CRMQuote | Anulado | 12 |
| CRMQuote | Confirmado | 1 |
| AgentExecution | (ninguno) | 0 |

---

## 6. Explicacion de los 222 borradores

### Composicion exacta

El numero 222 en la captura proviene de **221 CRMQuotes con stages no mapeados**:

| Stage CRM | Count | Mapeo en `crmStageToOrderStatus()` |
|---|---|---|
| Facturado | 142 | `default → "borrador"` |
| Gestionado_Parcialmente | 48 | `default → "borrador"` |
| Remisionado | 31 | `default → "borrador"` |
| **Subtotal** | **221** | |

La diferencia 305 - 221 = 84 corresponde a stages **con mapeo conocido**:

| Stage | Count | Mapeo |
|---|---|---|
| No_Gestionado | 46 | `listo_para_enviar` |
| Pendiente | 25 | `pendiente_sag` |
| Anulado | 12 | `cancelado` |
| Confirmado | 1 | `sincronizado` |
| **Subtotal** | **84** | |

La discrepancia 222 vs 221: posiblemente 1 AgentExecution que existio temporalmente durante la captura, o un efecto de la paginacion (AgentExecution take=200, CRMQuote take=500).

### Resolucion

Con KPI-CALIBRATION-01, estos 221 CRM_LEGACY borradores:
- **NO aparecen** en "Pedidos por completar" (requiere AGENTIK_NATIVE).
- **NO aparecen** en "Pendientes de envio a SAG" (requiere AGENTIK_NATIVE).
- **Son accesibles** via el filtro rapido "Todos" y por busqueda.
- **Conservan su origen** CRM_LEGACY y su badge "CRM" en la tabla.

---

## 7. Modo SIMULATION

### Antes

"En simulacion" era un KPI con 115 pedidos (COR PENDIENTE mapeados).

### Despues

El modo de simulacion se muestra como **estado operativo del conector**:

```
[dot] Sincronizacion SAG · [Modo simulacion]
```

- Badge ambar con tooltip explicativo.
- Tooltip: "Los pedidos se validan y preparan, pero todavia no se envian al entorno productivo de SAG."
- Se actualiza desde configuracion cuando cambie a LIVE.
- No hardcodea "Castillitos".

---

## 8. Filtros rapidos

| Filtro | Label | Definicion |
|---|---|---|
| todos | Todos | Sin filtro |
| hoy | Hoy | Fecha comercial = hoy, excluye cancelados |
| por_completar | Por completar | AGENTIK_NATIVE + status borrador |
| pendientes_sag | Pendientes SAG | AGENTIK_NATIVE + [listo_para_enviar, pendiente_sag, conflicto retryable] |
| sincronizados | Confirmados | status = sincronizado (cualquier origen) |
| conflictos | Conflictos | conflicto + reserva expirada + conflicto de reserva |

"Borradores" renombrado a "Por completar" con definicion: pedidos AGENTIK_NATIVE que requieren edicion antes de SAG.
CRM_LEGACY NO se clasifica como borrador Agentik.

---

## 9. Inconsistencia de los 805 pedidos

### Causa exacta

`listOrders()` merges 3 sources with hard `take` limits:

| Source | `take` | DB real | Loaded |
|---|---|---|---|
| AgentExecution | 200 | 0 | 0 |
| CRMQuote | 500 | 305 | 305 |
| CustomerOrderRecord | 500 | 9,678 | **500** (truncated) |
| **Total** | | **9,983** | **805** |

`getOrderStats()` ALSO had `take: 500` on COR — `stats.today = 805`, not 9,983.

El header `805 pedidos · 805 desde SAG` llamaba "total" a una pagina parcial (8% del dataset real).

### Resolucion

1. Nueva funcion `computeServerKpiStats(orgId)` — usa COUNT/SUM/aggregate contra la DB completa, sin `take`.
2. KPIs vienen del servidor (source of truth) y se almacenan en `serverKpiStats` (inmutables hasta reload).
3. `allOrders` es solo para display de tabla (paginado, 805 filas) — NUNCA para KPIs.
4. Header ahora muestra `Mostrando 805 de 9.983 pedidos`.
5. `reloadAllOrders()` recarga tanto la tabla como los KPIs del servidor.

---

## 10. Arquitectura KPI server-side

```
computeServerKpiStats(orgId)  ← FULL DB, no take limits
  ├── AgentExecution.findMany (sin take)  → AGENTIK_NATIVE KPIs
  ├── CRMQuote.count + .findMany(today)   → CRM_LEGACY totales + hoy
  └── COR.count + .aggregate(today)       → SAG_HISTORICAL totales + hoy

page.tsx  ← Server Component
  ├── computeServerKpiStats(orgId)  → initialServerKpiStats
  └── listOrders(orgId)             → initialOrders (paginated, 805)

pedidos-client.tsx  ← Client Component
  ├── serverKpiStats (immutable state from server)
  │     └── KPI cards render from THIS, never from table rows
  ├── allOrders (paginated table display only)
  ├── quickFilter (client-side filter on allOrders)
  └── activeKpi (unified with quickFilter — no dual state)
```

### API nueva

```
POST { action: "kpi_stats" }
→ { kpiStats: ServerKpiStats }
```

### Contrato ServerKpiStats

```typescript
interface ServerKpiStats {
  valorPedidosHoy: number;
  pedidosDeHoy: number;
  pendientesEnvioSag: number;
  sincronizadosAgentik: number;
  conConflicto: number;
  totalOrders: number;       // 9,983
  loadedOrders: number;      // 805
  generatedAt: string;       // ISO timestamp
  timezone: string;          // "America/Bogota"
  currency: string;          // "COP"
}
```

---

## 11. Unificacion KPI + Quick Filter

### Antes (doble estado independiente)

- `activeKpi` y `quickFilter` eran independientes.
- Hacer clic en KPI "Valor pedidos hoy" no sincronizaba el filtro rapido "Hoy".
- Tener KPI activo + quick filter activo simultaneamente = confuso.

### Despues (estado unificado)

- Hacer clic en KPI "Valor pedidos hoy" → `activeKpi = valor_pedidos_hoy` + `quickFilter = hoy`.
- Hacer clic en filtro rapido "Hoy" → `quickFilter = hoy` + `activeKpi = valor_pedidos_hoy`.
- Segundo clic o "Todos" → limpia ambos.
- La barra rapida siempre refleja el estado del KPI y viceversa.
- Cero estados duplicados equivalentes.

---

## 12. Alcance temporal de cada KPI

| KPI | Alcance | Fuentes | Exclusiones |
|---|---|---|---|
| Valor pedidos hoy | Fecha actual tenant (COT) | Todas las fuentes | Cancelados |
| Pedidos de hoy | Fecha actual tenant (COT) | Todas las fuentes | Cancelados |
| Pendientes envio SAG | Sin limite temporal | Solo AgentExecution | SAG_HISTORICAL, CRM_LEGACY, borradores, cancelados |
| Sincronizados con SAG | Sin limite temporal | Solo AgentExecution | SAG_HISTORICAL (9,562), CRM_LEGACY |
| Con conflicto | Sin limite temporal | Todas las fuentes | Errores historicos cerrados (sincronizado, cancelado) |

---

## 13. Los 222 borradores — resolucion final

221 CRM_LEGACY borradores provienen de stages CRM no mapeados:

| Stage CRM | Count |
|---|---|
| Facturado | 142 |
| Gestionado_Parcialmente | 48 |
| Remisionado | 31 |
| **Subtotal** | **221** |

El registro #222: el numero de la captura mostrada originalmente era **222**. La diferencia de 1 puede ser:
- 1 AgentExecution temporal durante la captura (efecto de la ventana de take=200).
- Efecto de redondeo o UI transitorio.
- No existe en la DB actual: 0 AgentExecution COMERCIAL_ORDER_DRAFT.

**Confirmacion:**
- "Por completar" solo incluye AGENTIK_NATIVE + borrador → 0 CRM_LEGACY.
- 221 CRM_LEGACY permanecen como historico CRM accesibles via filtro "Todos".
- No aparecen en pendientes operacionales de Agentik.

---

## 14. Pruebas

58 tests across 16 suites (node:test runner):

| Suite | Tests |
|---|---|
| computeCalibratedKpiStats | 15 |
| KPI stability — allOrders vs visibleOrders | 3 |
| buildCalibratedKpis | 4 |
| kpiKeyToQuickFilter | 5 |
| applyQuickFilter | 7 |
| QUICK_FILTER_LABELS | 2 |
| timezone-aware today calculation | 2 |
| Castillitos real distribution | 3 |
| KPI zero state | 1 |
| Server-side KPI architecture contracts | 3 |
| Header differentiates visible vs total | 2 |
| KPI and quick filter share unified state | 4 |
| 221 CRM_LEGACY never count as Por completar | 2 |
| SAG_HISTORICAL sincronizados never inflate Agentik KPI | 2 |
| Server KPI timezone respect | 2 |
| KPI values stable across page changes | 1 |

Run: `npx tsx --test lib/comercial/pedidos/__tests__/order-kpi-calibration.test.ts`

Existing tests (53) also pass: `npx tsx --test lib/comercial/pedidos/__tests__/order-operations-refinement.test.ts`

---

## 15. TSC

194 errors (baseline, 0 new). Zero errors in sprint files.

---

## 16. Archivos modificados

### Modified

| File | Change |
|---|---|
| `lib/comercial/pedidos/order-service.ts` | Added `computeServerKpiStats()` — full DB aggregation for KPIs |
| `lib/comercial/pedidos/order-operational-state.ts` | Added calibrated KPI types/functions, quick filter system |
| `app/(app)/[orgSlug]/comercial/pedidos/page.tsx` | Pass `initialServerKpiStats` to client |
| `app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx` | Server KPIs, unified KPI/filter state, honest header |
| `app/api/orgs/[orgSlug]/comercial/pedidos/route.ts` | Added `kpi_stats` action |

### New

| File | Purpose |
|---|---|
| `lib/comercial/pedidos/__tests__/order-kpi-calibration.test.ts` | 58 tests covering calibrated KPIs, server architecture, filters, timezone |
| `docs/audits/AGENTIK-ORDERS-KPI-CALIBRATION-01.md` | This document |

---

## 17. No regresion

- Drawer: not modified.
- Wizard: not modified.
- Reservation adapter: not modified.
- SAG write adapter: not modified.
- SAG historical read: not modified.
- Prisma schema: not modified.
- Existing tests (53): all pass.
- TSC: 194 (baseline preserved).

---

## 18. Propuesta de commit

```
fix(commercial): server-side KPI aggregation for pedidos — full DB stats independent of paginated table
```

Files:
- `lib/comercial/pedidos/order-service.ts`
- `lib/comercial/pedidos/order-operational-state.ts`
- `app/(app)/[orgSlug]/comercial/pedidos/page.tsx`
- `app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx`
- `app/api/orgs/[orgSlug]/comercial/pedidos/route.ts`
- `lib/comercial/pedidos/__tests__/order-kpi-calibration.test.ts`
- `docs/audits/AGENTIK-ORDERS-KPI-CALIBRATION-01.md`

---

## 19. What was NOT changed

- Order creation logic
- Order drawer (3 tabs)
- Reservation system
- SAG write adapter
- SAG historical read
- Prisma schema
- SAG LIVE activation
- Backfills
- Existing panel design
- `listOrders()` take limits (table pagination stays as-is)

---

## 20. Nota de escalabilidad

AgentExecution actualmente tiene volumen cero para COMERCIAL_ORDER_DRAFT en Castillitos. `computeServerKpiStats()` usa `findMany` sin `take` para esta tabla. Si el volumen crece, sus estadisticas deberan resolverse mediante `count`/`aggregate`/`groupBy` en lugar de `findMany` completo, siguiendo el mismo patron que ya se usa para CustomerOrderRecord.
