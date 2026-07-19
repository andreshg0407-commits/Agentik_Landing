# COMMERCIAL_STABILIZATION_REPORT.md

COMMERCIAL-STABILIZATION-01 -- Entregable Final

Fecha: 2026-07-03
Tenant: Castillitos
TSC baseline: 160 (mantenido, 0 errores nuevos)

---

## Resumen de Cambios

### Phase 1: City Resolver (Clientes)

**Problema:** `CustomerProfile.city` contiene codigos internos SAG (ej: "1", "1111", "1994") — no son codigos DANE estandar y no existe tabla de mapping.

**Solucion:**
- Creado `lib/comercial/clientes/city-resolver.ts` con `resolveCity()` y `displayCity()`
- Codigos numericos puros se suprimen (retorna `null`)
- Nombres de ciudad reales (si existieran) pasan a traves sin cambio
- `client-loader.ts` actualizado: aplica `resolveCity()` antes de retornar datos
- UI ahora muestra "--" en lugar de codigos numericos sin sentido

**Archivos modificados:**
- `lib/comercial/clientes/city-resolver.ts` (NUEVO)
- `lib/comercial/clientes/client-loader.ts`

---

### Phase 2: KPIs y Columnas sin Datos (Clientes)

**Problema:** KPIs "Con vendedor" (0.1%), "Prospectos" (0 registros), "Ultimo movimiento" (0% poblado) mostraban datos sin valor. Columnas "Ciudad", "Vendedor", "Ventas L12" con <1% de datos utiles.

**Solucion:**
- Removidos 3 KPIs sin confianza del strip
- KPIs restantes: Total, Activos, Con cartera (3 KPIs confiables)
- Removidas 3 columnas sin datos de la tabla: Ciudad, Vendedor, Ventas L12
- Columnas restantes: Nombre, NIT, Cartera, Estado (4 columnas con datos reales)
- Removidos filtros muertos: "Inactivos" (0 registros), "Prospectos" (0 registros)
- Filtros restantes: Todos, Activos, Con cartera vencida
- Grid actualizado de 7 a 4 columnas

**Archivo modificado:** `app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx`

---

### Phase 3: Registro de Vendedores (Maletas)

**Problema:** `DEFAULT_VENDOR_REGISTRY` hardcodeaba 4 vendedores cuando CRM tiene 8 reales. Generaba falsa confianza en la cobertura.

**Solucion:**
- `getVendorRegistry()` ahora retorna `[]` (vacio)
- Documentado que requiere modelo `CommercialSalesRep` en Prisma
- Todos los consumidores ya manejan el caso vacio via `EmptyOperationalState`

**Archivo modificado:** `lib/comercial/maletas/maletas-normalizer.ts`

---

### Phase 4: KPIs sin Datos (Vendedores)

**Problema:** Team KPIs (Ventas Hoy/Mes, Pedidos, Clientes, Cumplimiento) mostraban ceros sin contexto cuando no hay vendedores configurados.

**Solucion:**
- Team KPI strip oculto cuando `vendors.length === 0`
- Header subtitle cambia a "Directorio comercial en construccion"
- Status label cambia a "Pendiente integracion CRM"
- EmptyOperationalState ya existente muestra "Sin vendedores configurados"

**Archivo modificado:** `app/(app)/[orgSlug]/comercial/vendedores/vendedores-client.tsx`

---

### Phase 5: KPIs Invalidos (Control Comercial)

**Problema:** 4 de 8 KPIs tenian confiabilidad NULA (Pedidos Totales/Pendientes = CRM stale, Vendedores Activos/Maletas en Riesgo = siempre 0).

**Solucion:**
- KPI strip reducido a 4 KPIs confiables: Refs Criticas, Refs Agotadas (SAG), Clientes Activos, Clientes con Cartera
- Resumen por modulo: removida card Maletas (3 KPIs siempre 0), removida card Pedidos (datos CRM stale)
- Resumen conserva: card Inventario (datos SAG reales), card Clientes (datos reales)
- Layout de 3 columnas a 2 columnas en resumen

**Archivo modificado:** `app/(app)/[orgSlug]/comercial/control/control-client.tsx`

---

### Phase 6: Alertas Falsas (Control Comercial)

**Problema:** Alerta "285 pedidos pendientes" era falso positivo permanente (todos CRMQuote son DRAFT). Alerta "maletas en riesgo" siempre 0.

**Solucion:**
- Removida generacion de alerta `alert-ped-pendientes` (CRM stale)
- Removida generacion de alerta `alert-mal-riesgo` (CommercialCase vacia)
- Alertas restantes: inventario agotadas (ALTA confianza), clientes con cartera (real pero requiere revision)

**Archivo modificado:** `lib/comercial/control/control-comercial-loader.ts`

---

### Phase 7: Consistencia de Status (Pedidos)

**Estado:** Ya implementado correctamente.

`order-service.ts` ya lee `rawCrmJson.raw.stage` (estado CRM real) via `crmStageToOrderStatus()`. No usa el campo muerto `CRMQuote.status` (Prisma enum, siempre DRAFT). No requiere cambios.

---

### Phase 8: Origin Badges (Pedidos)

**Estado:** Ya implementado correctamente.

La lista de pedidos ya muestra badges SAG/AGK con colores diferenciados. `orderStateLabel()` maneja correctamente los origenes "sag", "agentik". No requiere cambios.

---

### Phase 9: Observabilidad

**Solucion:**
- Log `[COMERCIAL] loadClientesSummary` con conteo de ciudades resueltas vs suprimidas
- Log `[COMERCIAL] loadControlComercial` con conteo de inventario, clientes y alertas

**Archivos modificados:**
- `lib/comercial/clientes/client-loader.ts`
- `lib/comercial/control/control-comercial-loader.ts`

---

## Archivos Tocados (Total: 7)

| Archivo | Tipo |
|---|---|
| `lib/comercial/clientes/city-resolver.ts` | NUEVO |
| `lib/comercial/clientes/client-loader.ts` | MODIFICADO |
| `app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx` | MODIFICADO |
| `lib/comercial/maletas/maletas-normalizer.ts` | MODIFICADO |
| `app/(app)/[orgSlug]/comercial/vendedores/vendedores-client.tsx` | MODIFICADO |
| `app/(app)/[orgSlug]/comercial/control/control-client.tsx` | MODIFICADO |
| `lib/comercial/control/control-comercial-loader.ts` | MODIFICADO |

## Lo que NO se toco

- Prisma schema: 0 cambios
- SAG adapters: 0 cambios
- CRM sync: 0 cambios
- Engine logic: 0 cambios
- Navegacion: 0 cambios
- Nuevas pantallas: 0

## Siguiente prioridad (del COMMERCIAL_DATA_AUDIT_MASTER.md roadmap)

| # | Tarea | Esfuerzo |
|---|---|---|
| P0-5 | Actualizar registro de vendedores (crear CommercialSalesRep model) | Medio |
| P1-1 | CRM sync: escribir sellerName/sellerSlug en CustomerProfile | Medio |
| P1-3 | CRM sync: resolver customerId en CRMQuote | Medio |
| P1-6 | Investigar 98% overdue en CustomerReceivable | Alto |
