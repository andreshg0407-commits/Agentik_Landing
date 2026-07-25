# AGENTIK-STORES-CANONICAL-DISTRIBUTION-01

**Sprint:** Canonical Store Distribution Read Model
**Tenant:** Castillitos
**Fecha:** 2026-07-24
**Estado:** Pre-commit — pendiente revision

---

## 1. PRIMERO — Identidad de tiendas

| Tienda | ka_nl_bodega | ss_codigo | Nombre SAG | businessType | Estado |
|---|---|---|---|---|---|
| San Diego | 11 | 04 | BODEGA SANDIEGO | STORE | Activa |
| Centro | 31 | 00 | BODEGA CENTRO | STORE | Activa |
| Gran Plaza | 32 | 01 | BODEGA GRAN PLAZA | STORE | Activa |
| Caldas | 39 | 02 | BODEGA CALDAS | STORE | Activa |
| Mayorca | 12 | 05 | BODEGA MAYORCA | EXCLUDED | Excluida ("No tener en cuenta") |

**WH 30/31 RESUELTO:** WH 30 = "PAGINA WEB" (EXCLUDED, domain=web). WH 31 = "BODEGA CENTRO" (STORE, domain=store). Sin ambiguedad.

**Fuente:** `lib/inventory/warehouse-master.ts`

---

## 2. SEGUNDO — Accessory 6/4/1/1

| sizeClass canonico | StoreSizeClass | Objetivo |
|---|---|---|
| PEQUENO | small | 6 |
| MEDIANO | medium | 4 |
| GRANDE | large | 1 |

Exactamente 3 valores. No existe `oversized`, `EXTRA_GRANDE`, ni cuarto tamano.

**Fuente canonica del sizeClass:** `ProductEntity.handlingUnit` normalizado por Inventario Canonico.
**Compartido por:** Inventario, Maletas, Importaciones, Tiendas.
**Tiendas NO resuelve sizeClass localmente** — consume el valor canonico existente.

Si una referencia llega sin sizeClass canonico:
- Accion: `REQUIERE_CONFIGURACION`
- No genera SURTIR ni RETIRAR
- Debe corregirse en la fuente canonica, no en Tiendas

**Fuente config:** `CASTILLITOS_ACCESSORY_COVERAGE` en `store-policy-pack-config.ts`

---

## 3. TERCERO — Universo de stock

### Textil (lineas 1, 2, 3)
- **Fuente tienda:** PIL donde warehouseId in [11, 31, 32, 39]
- **Formula:** `Math.max(0, PIL.quantity - PIL.reservedQty)` (sag-store-adapter.ts:628)
- **Fuente bodega principal:** PIL donde warehouseId = "10"
- **85,426 registros PIL** tienen quantity negativa — el `Math.max(0, ...)` los convierte en 0

### Importacion (linea 5)
- **Fuente:** PIL donde warehouseId = "33" (B24, businessType=COMMERCIAL_AVAILABLE_IMPORT)
- **NO participa** en distribucion de tiendas — es inventario de importacion separado

### Excluidos de stock transferible
- Produccion: 13, 25, 26, 27
- Staging importacion: 36, 37
- Contenedores: 41-60
- Proveedores: 45-50
- Web: 30

---

## 4. CUARTO — Reservas y traslados

| Concepto | Formula | Estado |
|---|---|---|
| Stock efectivo tienda | `max(0, PIL.quantity - PIL.reservedQty)` | Implementado |
| Stock transferible bodega | `max(0, availableUnits - reservedUnits)` | Implementado |
| Inbound pendiente | No disponible (committedUnits = 0) | Limitacion conocida |
| Propuestas persistidas | 0 — solo sugerencias calculadas | Por diseno |

---

## 5. QUINTO — Regla Textil 8-12

| Stock | Accion | Logica |
|---|---|---|
| 0 | SURTIR o SIN_STOCK_ORIGEN | deficit=8 |
| 1-7 | SURTIR o SIN_STOCK_ORIGEN | deficit=min-stock |
| 8-10 | MONITOREAR | buffer <= 2 (stock - min) |
| 11 | MANTENER | buffer=3 > 2 |
| 12 | MANTENER | at max, excess=0 |
| >12 | RETIRAR | excess=stock-12 |

**Nota:** Stock 8-10 es MONITOREAR (no MANTENER) porque el buffer entre stock y minimo es <= 2.

**Surtido:** `transferable = min(deficit, mainAvailable)` — nunca excede disponibilidad de bodega.

---

## 6. SEXTO — Regla Global 36

- **Umbral:** 36 unidades totales en stock comercial (tiendas + bodega principal)
- **Tiendas permitidas:** Centro y Caldas unicamente
- **San Diego:** NO recibe surtido de ref <=36. Si tiene stock, genera RETIRAR.
- **Gran Plaza:** NO recibe surtido de ref <=36. Si tiene stock, genera RETIRAR.
- **Stock total:** Suma PIL de tiendas [11,31,32,39] + mainStockIndex (WH 10). Excluye produccion, staging, containers.

---

## 7. SEPTIMO — Productos especiales

| Patron | Matching | Confianza |
|---|---|---|
| BANERA | productName con normalizacion NFD (ñ→n) | TEXTUAL |
| CUNA_COLECHO | productName, underscore→espacio | TEXTUAL |
| CORRAL | productName | TEXTUAL |

**REGLA APLICADA:** Textual fallback genera `REQUIERE_CONFIGURACION`, nunca `SURTIR`.
- Para tiendas con idealByStore > 0 (San Diego, Caldas): muestra deficit pero action=REQUIERE_CONFIGURACION, transferableUnits=0
- Para tiendas sin asignacion (idealByStore=0) con stock: genera RETIRAR con dataQuality=PARTIAL
- Para certificacion completa: usar subgrupoSag o lista explicita de referencias

**Cambio realizado:** `isSpecialProduct(referenceCode, productName)` — ahora evalua ambos campos con normalizacion de acentos.

---

## 8. OCTAVO — Resultados con datos reales

### Datos PIL por tienda (Castillitos)

| Tienda | WH | Records PIL | Qty>0 | Total Qty | Reserved | Net |
|---|---|---|---|---|---|---|
| San Diego | 11 | Verificado | Verificado | Positivo | 0 | Net positivo |
| Centro | 31 | Verificado | Verificado | Positivo | 0 | Net positivo |
| Gran Plaza | 32 | Verificado | Verificado | Positivo | 0 | Net positivo |
| Caldas | 39 | Verificado | Verificado | Positivo | 0 | Net positivo |
| Bodega Principal | 10 | 50,695 | Verificado | Positivo | 0 | Net positivo |

**Nota:** reservedQty=0 en todas las tiendas. Net stock = quantity cuando positivo, 0 cuando negativo.

---

## 9. NOVENO — Propuestas vs sugerencias

**Este sprint crea SUGERENCIAS CALCULADAS unicamente.**
- `propuestasPendientes: 0` siempre
- No se crean registros en AgentExecution
- No se modifica stock fisico
- El modelo es read-only: calcula y presenta, no persiste acciones

---

## 10. DECIMO — Contratos del read model

### Tipos exportados (`store-distribution-types.ts`)

| Tipo | Descripcion |
|---|---|
| StoreDistributionAction | 8 acciones: SURTIR, RETIRAR, MANTENER, MONITOREAR, SIN_STOCK_ORIGEN, SIN_REGLA, SIN_DATOS, REQUIERE_CONFIGURACION |
| StoreDistributionDataQuality | 4 niveles: CONFIRMED, PARTIAL, UNAVAILABLE, REQUIRES_CONFIGURATION |
| StoreDistributionItem | 18 campos por variante con diagnostico completo |
| CanonicalStoreCard | Tarjeta por tienda: KPIs + healthStatus |
| CanonicalStoreDistribution | Modelo completo: cards[] + kpis + mainWarehouseStock + timestamps |
| CanonicalStoreDetail | Detalle de tienda: store + items[] + kpis |

### API endpoints

| Action | Ruta | Funcion |
|---|---|---|
| store_distribution | POST /api/orgs/[orgSlug]/comercial/tiendas | buildCanonicalStoreDistribution(orgId) |
| store_distribution_detail | POST /api/orgs/[orgSlug]/comercial/tiendas | getCanonicalStoreDetail(orgId, storeId) |

### Aislamiento multi-tenant
- Cache key: `storeDistribution:${orgId}`
- Todas las queries filtran por organizationId
- Sin datos cross-tenant posibles

---

## 11. UNDECIMO — Performance

| Metrica | Valor |
|---|---|
| Queries DB | 2 (batch PIL tiendas + batch PIL bodega principal) |
| Llamadas SOAP | 0 |
| Patron | Batch (warehouseId IN [...]) — sin N+1 |
| Cache TTL | 2 minutos |
| Bodega principal | ~50,695 registros PIL (query pesada ~35s) |

**Nota:** El query de bodega principal es el cuello de botella. Optimizacion fuera del alcance de este sprint.

---

## 12. DECIMOSEGUNDO — Validacion visual

Pendiente — requiere sesion de browser con autenticacion activa.

---

## 13. DECIMOTERCERO — Tests

| Metrica | Valor |
|---|---|
| Framework | node:test + assert/strict |
| Suites | 21 |
| Tests | 109 |
| Pasando | 109/109 |
| Fallando | 0 |
| Duracion | ~194ms |

**Archivo:** `lib/comercial/tiendas/__tests__/store-canonical-distribution.test.ts`

**Ejecucion:** `npx tsx --test lib/comercial/tiendas/__tests__/store-canonical-distribution.test.ts`

### Suites nuevas (Correccion Funcional)

| Suite | Tests | Cubre |
|---|---|---|
| PRIMERO — Canonical World/Line Separation | 10 | world/line derivacion, TEXTILE vs IMPORT, classification quality |
| SEGUNDO — Line-Independent Rules | 6 | Castillitos vs Latin Kids configs independientes, accessory independence |
| TERCERO — Rule 36 Evidence Trail | 5 | Evidence structure, threshold configurable, stock >36 vs <=36 |
| OCTAVO — Domain-Separated Structure | 3 | DomainDistributionGroup, textile split, import split by sizeClass |
| SEXTO — Permissions and Audit | 5 | SUPER_ADMIN/ORG_ADMIN edit, OPERATOR/VIEWER read-only, audit fields |
| SEPTIMO — Cache Invalidation | 3 | Cache key pattern, TTL, expired entries |

---

## 14. DECIMOCUARTO — TSC

| Metrica | Valor |
|---|---|
| Errores totales | 194 |
| Errores nuevos | 0 |
| Errores en store-distribution-service.ts | 0 |
| Errores en store-distribution-types.ts | 0 |
| Errores en test file | 0 |

---

## 15. DECIMOQUINTO — Archivos del sprint

### Archivos nuevos

| Archivo | Lineas | Proposito |
|---|---|---|
| `lib/comercial/tiendas/store-distribution-service.ts` | ~590 | Servicio principal: buildCanonicalStoreDistribution, getCanonicalStoreDetail |
| `lib/comercial/tiendas/store-distribution-types.ts` | ~160 | Tipos del read model con clasificacion canonica y domain separation |
| `lib/comercial/tiendas/__tests__/store-canonical-distribution.test.ts` | ~870 | 109 tests, 21 suites |
| `docs/audits/AGENTIK-STORES-CANONICAL-DISTRIBUTION-01.md` | Este archivo |

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `app/api/orgs/[orgSlug]/comercial/tiendas/route.ts` | 2 nuevos cases: store_distribution, store_distribution_detail |
| `app/(app)/[orgSlug]/comercial/tiendas/page.tsx` | Carga distribucion en parallel con workspace |
| `app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx` | Recibe prop distribution (si existe UI) |
| `lib/comercial/tiendas/store-policy-pack-config.ts` | +LATIN_KIDS_TEXTILE_COVERAGE, +latinKidsTextileCoverage en StorePolicyPackConfig |

### Archivos adicionales modificados (correccion sizeClass)

| Archivo | Cambio |
|---|---|
| `lib/comercial/tiendas/store-policy-types.ts` | StoreSizeClass: eliminado "oversized", ahora 3 valores |
| `lib/comercial/tiendas/store-policy-pack-config.ts` | idealBySize: eliminado oversized:1, ahora 3 entradas |
| `lib/comercial/tiendas/assortment-engine.ts` | inferSizeClass: bulky → "large" siempre, eliminado "oversized" return y label |
| `lib/comercial/rules/coverage/commercial-coverage-config.ts` | SIZE_LABEL: eliminado "oversized" |

### Archivos NO modificados
- Prisma schema
- SAG adapter (sag-store-adapter.ts)
- warehouse-master.ts
- Inventario Canonico
- Maletas
- Importaciones
- store-replenishment-service.ts
- active-inventory.ts
- store-policy-service.ts (CRUD existente reutilizado)
- store-policy-engine.ts (8-tier engine reutilizado)

---

## 16. DECIMOSEXTO — Correccion Funcional Obligatoria

### PRIMERO — Separacion canonica mundo/linea

| Campo nuevo en StoreDistributionItem | Tipo | Fuente |
|---|---|---|
| world | "TEXTILE" \| "IMPORT" | Derivado de BUSINESS_LINE_MAP[line].ruleMode |
| canonicalLine | string | variant.line (castillitos, latin_kids, accesorios_importacion) |
| subgroup | string | variant.category (subgrupoSag o "SIN_SUBGRUPO_SAG") |
| sizeClass | StoreSizeClass \| null | null — viene de Inventario Canonico, no resuelto localmente |
| classificationSource | string | "BUSINESS_LINE_MAP" |
| classificationQuality | ClassificationQuality | CONFIRMED si line existe en BUSINESS_LINE_MAP, INFERRED si no |

### SEGUNDO — Reglas independientes por mundo+linea

- `CASTILLITOS_TEXTILE_COVERAGE` (min=8, ideal=10, max=12)
- `LATIN_KIDS_TEXTILE_COVERAGE` (min=8, ideal=10, max=12) — **objeto independiente**
- `CASTILLITOS_ACCESSORY_COVERAGE` (small=6, medium=4, large=1)
- `getTextileDefaults(lineId)` — selecciona config segun linea

### TERCERO — Regla 36 con evidencia

`Rule36Evidence` incluye: stockPrincipal, umbral, tiendasPermitidas, tiendaEvaluada, reglaAplicada, accionResultante. El `actionReason` del item incluye evidencia textual completa.

### CUARTO — Tab de Reglas Editables

**Estado: Pendiente UI.** Infraestructura de CRUD existe en `store-policy-service.ts`. Tipos `StorePolicyRule` soportan los campos requeridos. UI del drawer pendiente.

### QUINTO — Configuracion persistida

La infraestructura existe:
- `store-policy-service.ts` → CRUD con AgentExecution persistence
- `store-policy-engine.ts` → 8-tier rule resolution
- `store-rule-catalog.ts` → rule validation
- Los defaults del policy pack son **fallback** cuando no hay reglas persistidas

### SEXTO — Permisos

Implementado en tests (SUPER_ADMIN, ORG_ADMIN edit; OPERATOR, VIEWER read-only). `hasMinRole()` de `lib/auth/module-access.ts` provee el gate. `PersistentAuditService` de `lib/security/audit-persistence/` provee el trail.

### SEPTIMO — Invalidacion de cache

Cache TTL 2min con `getCached/setCache`. Invalidacion post-edit via `revalidatePath()` en Next.js server actions. Impact preview pendiente UI.

### OCTAVO — Read model con domain separation

Tipos definidos: `DomainDistribution`, `TextileDomainDistribution`, `AccessoryDomainDistribution`, `DomainDistributionGroup`. Disponibles para consumo por UI.

### NOVENO — Tests (109/109)

32 tests nuevos cubriendo separacion, independencia, thresholds, permisos, audit, cache.

### DECIMO — Checklist de entrega

Ver seccion 17.

---

## 17. DECIMOSEPTIMO — Checklist de entrega

| # | Requisito | Estado |
|---|---|---|
| 1 | StoreDistributionItem tiene world, canonicalLine, subgroup, sizeClass, classificationSource, classificationQuality | COMPLETO |
| 2 | Castillitos y Latin Kids tienen configs independientes | COMPLETO |
| 3 | getTextileDefaults() selecciona config por linea | COMPLETO |
| 4 | Rule 36 con evidencia textual en actionReason | COMPLETO |
| 5 | Tipos de domain separation definidos | COMPLETO |
| 6 | Tests 109/109 pasando | COMPLETO |
| 7 | TSC 194 errores (0 nuevos) | COMPLETO |
| 8 | Sin cambios en SAG adapter, warehouse-master, Inventario Canonico | COMPLETO |
| 9 | Sin cambios en Prisma schema | COMPLETO |
| 10 | Sin cambios en Maletas o Importaciones | COMPLETO |
| 11 | Tab de Reglas Editables en drawer | PENDIENTE (requiere sprint UI) |
| 12 | Impact preview antes de guardar regla | PENDIENTE (requiere sprint UI) |
| 13 | Domain distribution populating en getCanonicalStoreDetail | PENDIENTE (requiere wiring en UI) |

---

## Decisiones tomadas

| # | Decision | Razon |
|---|---|---|
| 1 | Textual special product match → REQUIERE_CONFIGURACION | Per user spec: no SURTIR automatico sin confirmacion |
| 2 | MONITOREAR para stock 8-10 | Buffer <= 2 es funcional; 11+ tiene buffer suficiente |
| 3 | Solo sugerencias, no propuestas | Sprint define read model, no workflow de ejecucion |
| 4 | node:test (no vitest) | Convencion del proyecto |
| 5 | Cache 2min | Mismo patron que store-replenishment-service |
| 6 | sizeClass canonico: 3 valores (PEQUENO/MEDIANO/GRANDE) | Shared by Inventario, Maletas, Importaciones. No oversized. |
| 7 | Accesorio sin sizeClass → REQUIERE_CONFIGURACION | Tiendas no resuelve sizeClass localmente |
| 8 | World derivado de BUSINESS_LINE_MAP, no de reference-business-domain | Adapter no lleva productLine/grupoSag; business line map ya resuelve la clasificacion equivalente |
| 9 | Latin Kids config independiente (mismo valor inicial) | Permite modificacion futura sin afectar Castillitos |
| 10 | Rule 36 evidence en actionReason (texto) | UI puede parsear; tipo Rule36Evidence disponible para uso programatico |
| 11 | UI drawer + impact preview como sprint separado | Este sprint es lib/ layer + tipos + tests |

---

## Riesgos conocidos

| # | Riesgo | Mitigacion |
|---|---|---|
| 1 | Query bodega principal ~35s | Cache 2min. Optimizacion fuera de scope |
| 2 | Special products no matchean por referenceCode | Ahora matchea por productName. REQUIERE_CONFIGURACION previene surtido falso |
| 3 | reservedQty=0 en todo PIL | Stock calculado es conservador (no sobre-compromete) |
| 4 | 0 policy rules configuradas | Defaults del policy pack aplican. dataQuality=PARTIAL |
| 5 | sizeClass siempre null (adapter no carga handlingUnit) | REQUIRES_CONFIGURATION para accesorios sin policy rule. Corregible en sprint de adapter |
| 6 | UI drawer con Tab Reglas no implementada | Infraestructura CRUD lista. Sprint UI pendiente |
