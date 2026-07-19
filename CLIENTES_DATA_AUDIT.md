# CLIENTES_DATA_AUDIT.md

COMMERCIAL-DATA-AUDIT-01 -- Fase 2: Auditoria de Datos Clientes

---

## Volumen

| Metrica | Valor |
|---|---|
| Total registros | 33,203 |
| Fuente ERP (erpId) | 32,296 (97.3%) |
| Fuente CRM (crmId) | 30,235 (91.1%) |
| Solo ERP | ~2,968 |
| Solo CRM | ~907 |
| Ambas fuentes | ~30,235 |

---

## Completitud por Campo

| Campo | Poblado | % | Confianza | Observaciones |
|---|---|---|---|---|
| name | 33,203 | 100% | ALTA | 4 registros basura, 3 nombres cortos |
| nit | 32,987 | 99.3% | ALTA | 0 duplicados NIT. 216 sin NIT |
| city | 32,314 | 97.3% | **BAJA** | Contiene CODIGOS DANE numericos (1, 28, 1994), NO nombres de ciudad |
| sellerName | 18 | **0.1%** | **NULA** | Solo 18 tienen "Vendedor Generico". Campo sin poblar |
| sellerSlug | ~18 | **0.1%** | **NULA** | Derivado de sellerName, igualmente vacio |
| status | 33,203 | 100% | **BAJA** | TODOS son ACTIVE. No hay segmentacion real |
| segment | ~0 | **0%** | NULA | Campo no poblado |
| totalSalesL12 | 1 | **0.0%** | **NULA** | Solo 1 registro tiene ventas L12 |
| lastPurchaseAt | 1 | **0.0%** | **NULA** | Solo 1 registro tiene fecha |
| totalReceivable | via joins | ~87% | MEDIA | 28,801 clientes con receivables (via CustomerReceivable) |
| overdueReceivable | via joins | ~87% | MEDIA | 126,316 registros overdue de 128,471 total |
| erpSyncedAt | 32,296 | 97.3% | ALTA | Confirmado sincronizado desde SAG |
| crmSyncedAt | 30,235 | 91.1% | ALTA | Confirmado sincronizado desde CRM |

---

## Identidad

| Estado | Cantidad | % |
|---|---|---|
| VERIFIED | 28,557 | 86.0% |
| NEEDS_REVIEW | 4,642 | 14.0% |
| DUPLICATE | 3 | 0.0% |
| CONSUMIDOR_FINAL | 1 | 0.0% |

---

## Registros Basura Detectados

| Tipo | Cantidad | Ejemplos |
|---|---|---|
| Nombres basura | 4 | "CONSUMIDOR FINAL" (x2), "0", "VARIOS" |
| Nombres cortos (<=2 chars) | 3 | Nombres de 1-2 caracteres |
| NIT nulo | 216 | Sin NIT registrado |
| NIT duplicado | 0 | Cero duplicados |

**Volumen real estimado: ~33,196 (99.98% limpio en nombre)**

---

## Problemas Criticos

### P0 — Campo `city` contiene codigos DANE, no nombres

Los 32,314 registros con "ciudad" contienen codigos numericos del DANE (1, 28, 1994, 1001, etc), NO nombres legibles. La UI muestra estos codigos directamente al usuario.

**Impacto:** El campo "Ciudad" en la tabla de clientes muestra numeros sin sentido.

**Solucion requerida:** Tabla de traduccion DANE -> nombre de ciudad, o enrichment en el sync.

### P1 — sellerName sin poblar (0.1%)

El campo `sellerName` en CustomerProfile no se escribe durante el sync. Solo 18 registros tienen "Vendedor Generico".

**Impacto:**
- La columna "Vendedor" en la tabla de clientes esta vacia para 33,185 registros.
- El modulo Vendedores NO puede asociar clientes a vendedores via CustomerProfile.sellerSlug.
- computeVendorCustomerSummary() retorna 0 clientes por vendedor.

**Solucion requerida:** El CRM sync debe escribir sellerName/sellerSlug desde el campo de vendedor asignado en SuiteCRM.

### P2 — totalSalesL12 sin poblar (0.0%)

El campo `totalSalesL12` existe en el schema pero nunca se computa ni escribe. Solo 1 registro lo tiene.

**Impacto:** KPI "Ventas L12" en la tabla muestra "--" para todos.

**Solucion requerida:** Agregar calculo de ventas L12 al sync (sumar CRMQuote.amount por cliente en ultimos 12 meses), o crear un cron de consolidacion.

### P3 — lastPurchaseAt sin poblar (0.0%)

Igual que totalSalesL12. Campo existe, no se escribe.

### P4 — Todos los clientes son ACTIVE

No hay segmentacion de clientes por estado. Los 33,203 son ACTIVE.

**Impacto:** Los filtros "Inactivos" y "Prospectos" siempre muestran 0 resultados.

**Solucion requerida:** Logica de inactivacion basada en recencia de compra (ej: sin compras en 6+ meses = INACTIVE).

### P5 — 98.3% de receivables estan overdue

126,316 de 128,471 CustomerReceivable tienen daysOverdue > 0.

**Posible causa:** Los registros de cartera no se actualizan con pagos, o el calculo de daysOverdue no se refresca. Requiere investigacion.
