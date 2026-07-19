# Agentik Operational Source Map
### Versión 1.0 — Mayo 2026
### Clasificación: Documento técnico-operacional interno

---

## 1. Propósito y alcance

Este documento es el contrato arquitectónico maestro entre Agentik, SAG/PYA y el
negocio. Define:

- Qué sistema es fuente de verdad (source-of-truth) para cada entidad operacional
- Qué fluye en cada dirección (SAG → Agentik, CRM → Agentik, Agentik → SAG)
- Qué computa Agentik de forma autónoma vs. qué consume de sistemas externos
- Qué preguntas deben validarse con el equipo SAG antes de avanzar

Este documento **NO es un dashboard**. Es la base contractual para:
- Reunión técnica SAG × Agentik × negocio
- Diseño del conector ODBC (V2)
- Gobierno de datos y resolución de ambigüedades de campo
- Onboarding de nuevos tenants
- Copilot y agentes IA (base de conocimiento del dominio)
- Formularios de validación de fuentes

---

## 2. Filosofía de source-of-truth

### Regla fundamental

> **SAG es la verdad fiscal y física. Agentik es la inteligencia operacional.**

Ningún sistema compite. Se complementan:

| SAG                                 | Agentik                               |
|-------------------------------------|---------------------------------------|
| Factura legal                       | Inteligencia operacional              |
| Inventario físico (kardex)          | Disponibilidad operacional calculada  |
| Cartera oficial (AR)                | Presión de cobranza + scoring         |
| Documentos fiscales (DIAN)          | Conciliación + anomalías              |
| Pagos recibidos oficiales           | Flujo de caja proyectado              |
| Pedidos registrados (PD)            | Reservas operacionales propias        |
| Maestro de artículos                | Señales de producción + portafolio    |
| Maestro de clientes (TERCEROS)      | Customer 360 + scoring CRM            |

### Por qué Agentik NO usa el `disponible` SAG como verdad operacional

Hallazgo confirmado con equipo SAG:

> *"El disponible SAG depende de parametrización por empresa. Algunas descuentan PD
> autorizados. Otras no. No existe una vista operacional consolidada única."*

Por tanto, Agentik computa su propia disponibilidad operacional:

```
operationalAvailableQty =
    physicalQty (SAG: SALDO en INVENTARIO)
  − reservedQty (Agentik: OperationalReservation)
  − salesAssignedQty (Agentik: VendorBagItem)
  − pendingTransfersQty (Agentik: internal)
```

El `disponible` SAG se almacena como referencia informacional, nunca como
fuente de decisión.

---

## 3. Diagrama de flujo macro

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              SAG / PYA ERP                              │
│                                                                         │
│  TERCEROS ──→ clientes        INVENTARIO ──→ saldos físicos             │
│  CARTERA  ──→ cuentas × cobrar DOCUMENTOS ──→ facturas (FV/NC/ND)      │
│  ARTICULOS──→ catálogo        MOVIMIENTOS ──→ recibos, pagos            │
│  PEDIDOS  ──→ órdenes (PD)    LISTAS_PRECIOS ──→ precios               │
│  PRODUCCIÓN──→ OPs            BODEGAS ──→ warehouses                    │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ SAG → Agentik sync
                           │ V1: Excel manual
                           │ V2: ODBC consultaSagJson (en desarrollo)
                           │ V3: Event polling (futuro)
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        AGENTIK — Capa de Ingesta                        │
│                                                                         │
│  SaleRecord (OFICIAL/REMISION)    CustomerProfile (desde TERCEROS)      │
│  CollectionRecord (MOVIMIENTOS)   CustomerReceivable (desde CARTERA)    │
│  CommercialCoverageSnapshot       BankMovement (extractor bancario)      │
│  ProductSnapshot                  CRMOpportunity (desde CRM connector)  │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ motores Agentik
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    AGENTIK — Inteligencia Operacional                   │
│                                                                         │
│  OperationalInventory (disponibilidad propia)                           │
│  OperationalReservation (reservas propias)                              │
│  VendorCommercialBag + VendorBagItem (portafolio de venta)              │
│  CommercialProductionSignal (señales de producción)                     │
│  ReconciliationEngine (conciliación documental)                         │
│  FinancialRuntimeSnapshot (salud financiera)                            │
│  OperationalIntelligenceSnapshot (dashboard explicativo)                │
│  CopilotSignalRecord (señales para agentes IA)                          │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ Agentik → SAG (futuro)
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              AGENTIK → SAG (write-back layer — V4 futuro)               │
│                                                                         │
│  SagWriteOperation (pedidos confirmados → SAG PD)                       │
│  Reservas → SAG hold (opcional, requiere validación SAG)                │
└─────────────────────────────────────────────────────────────────────────┘

                           ┌───────────────────────┐
                           │         CRM           │
                           │  CRMOpportunity       │
                           │  CRMQuote             │
                           │  CRMActivity          │
                           │  CustomerOrderRecord  │
                           └──────────┬────────────┘
                                      │ CRM → Agentik bridge
                                      ▼
                           OperationalOrder (demand signal)
                           OperationalReservation (pre-commit)
```

---

## 4. Reglas de ownership

### Regla 1 — SAG es soberano en documentos fiscales
Ningún documento en SAG puede ser creado, modificado o anulado por Agentik sin
aprobación explícita de un operador humano. La capa `SagWriteOperation` es la
única puerta de write-back y está sujeta a governance.

### Regla 2 — Agentik es soberano en su capa operacional
Las reservas, portafolios, señales y proyecciones de Agentik son 100%
propiedad de Agentik. SAG no conoce estos conceptos.

### Regla 3 — Deduplicación por ERP ID
Cada `SaleRecord`, `CollectionRecord` y `CustomerReceivable` tiene un campo
`erpMovId` / `erpId` que apunta al registro SAG de origen. Esto garantiza
idempotencia en los imports.

### Regla 4 — FUENTE_1 vs FUENTE_2 es la frontera legal
- `FUENTE_1` (OFICIAL / FV): crea cuentas por cobrar, reconoce ingreso, genera
  expectativa DIAN XML.
- `FUENTE_2` (REMISION): es señal operacional de despacho. NO crea AR. NO es
  ingreso reconocido. SÍ es señal de demanda para pronóstico.

Esta distinción es el núcleo del modelo de datos. Todo downstream la respeta.

### Regla 5 — Campos `SAG_CONFIRMAR`
Cualquier campo marcado `SAG_CONFIRMAR` en la matriz (Documento 2) debe ser
validado en la reunión técnica SAG. **No asumir nombre de campo, tipo, o
comportamiento de filtros WHERE en SAG PYA sin confirmación.**

---

## 5. Dominios operacionales

### D01 — Torre de Control
Agregado maestro del estado operacional del negocio. Consume de todos los
demás dominios. No tiene fuente SAG directa — es composición Agentik.

**Entidades propias de Agentik:**
- FinancialRuntimeSnapshot (salud financiera en tiempo real)
- OperationalIntelligenceSnapshot (snapshot explicativo)
- CopilotSignalRecord (señales activas)
- BusinessAlert (alertas operacionales)

**Dependencias:** todos los dominios.

---

### D02 — Comercial / Coberturas
Gestión del portafolio de venta por vendedor. Señales de presión por referencia.

**SAG consumido:**
- `CommercialCoverageSnapshot` ← SAG INVENTARIO (saldos por referencia)
- `SaleRecord` ← SAG DOCUMENTOS (FV/REMISION)
- Actualmente: SAG INVENTARIO = status `pending` en query-catalog

**Agentik propio:**
- `VendorCommercialBag` — portafolio asignado por vendedor
- `VendorBagItem` — ítems en portafolio con qty mínima/ideal
- `CommercialCaseItem` — asignaciones de cobertura
- `OperationalReservation` — reservas previas a despacho
- `CommercialProductionSignal` — señales urgentes de producción
- `CommercialDeadStockSignal` — referencias sin rotación

**Pregunta abierta SAG:** ¿Cómo está configurado el `disponible` en
Castillitos? ¿Descuenta PD autorizados? → Ver `operational-inventory-types.ts`
para el hallazgo documentado.

---

### D03 — Inventario
Disponibilidad física de producto en bodega.

**SAG consumido:**
- INVENTARIO (CODIGO, BODEGA, SALDO) → `CommercialCoverageSnapshot`
- ARTICULOS (catálogo maestro) → `ProductSnapshot`

**Agentik propio:**
- `OperationalInventoryItem` (capa de inteligencia sobre SAG físico)
- Fórmula propia de disponibilidad operacional (ver Regla #1 arriba)

**Estado actual:** import manual vía Excel (V1). ODBC query `inventory.all`
confirmado en query-catalog como `status: pending` — requiere homologación
de nombre de tabla y campos (`SALDO` vs `EXISTENCIA` vs `CANTIDAD`).

---

### D04 — Producción
Señales de producción basadas en presión de inventario y portafolios.

**SAG consumido (futuro):**
- Órdenes de Producción (OP) — tabla `SAG_CONFIRMAR`
- Estado completado de OP → actualizar inventario físico

**Agentik propio:**
- `CommercialProductionSignal` — señal generada cuando stock < mínimo
  en portafolios activos
- `CommercialDeadStockSignal` — alerta de stock sin rotación

**Estado actual:** señales generadas internamente. No hay feed SAG de OPs.
Requiere tabla de OPs en reunión técnica.

---

### D05 — Cartera (Cuentas por Cobrar)
Estado legal de lo que los clientes deben a la empresa.

**SAG es source-of-truth absoluto para cartera legal.**

**SAG consumido:**
- `SELECT * FROM CARTERA` → `CustomerReceivable`
  - Status: `validated` en query-catalog
  - Campos clave: NIT, NUMERO_DOC, SALDO, FECHA_VENCIMIENTO, DIAS_MORA

**Agentik propio (sobre cartera):**
- `PaymentRecord` (registro Agentik de pagos cruzados)
- `PaymentAllocation` (imputación de pagos a facturas)
- Scoring de cobranza (priorización por riesgo)

**FUENTE_1 gate:** Solo facturas FUENTE_1 crean `CustomerReceivable`.
Remisiones (FUENTE_2) NO generan AR en Agentik.

---

### D06 — Cobranza
Gestión operacional del recaudo. Acciones sobre la cartera.

**SAG consumido:**
- MOVIMIENTOS (recibos de caja, R1/R2/RS) → `CollectionRecord`
  - Estos son los pagos aplicados en SAG
  - Campo clave: `ka_nl_movimiento` como ID estable

**Agentik propio:**
- `CollectionAllocation` (imputación operacional antes de SAG)
- `CopilotSignalRecord` (señales de cobranza para agente Laura/David)
- Scoring y priorización de gestión

---

### D07 — Tesorería
Posición de caja real y proyectada.

**SAG consumido (indirecto):**
- SAG no expone cuentas bancarias directamente
- Los movimientos bancarios vienen de extractos bancarios (CSV/OFX/manual)
- SAG MOVIMIENTOS provee recibos de caja que confirman entradas

**Agentik propio:**
- `BankAccount` — cuentas bancarias registradas
- `BankMovement` — movimientos de extracto
- `BankSyncSession` — sesión de sincronización bancaria
- `BankReconciliation` — conciliación banco vs SAG
- `FinancialRuntimeSnapshot` — posición de liquidez en tiempo real

**Pregunta abierta:** ¿SAG tiene vista de saldos bancarios o solo movimientos
de caja? → `SAG_CONFIRMAR`

---

### D08 — Finanzas / Cierre
Consolidación del período. P&L, balance, presupuesto vs ejecución.

**SAG es source-of-truth para datos históricos contables.**

**SAG consumido:**
- `SaleRecord` (FUENTE_1) → ingresos reconocidos
- `CollectionRecord` → recaudo efectivo
- `CustomerReceivable` → cartera vigente

**Agentik propio:**
- `Budget` — presupuesto vivo con líneas y períodos
- `FinancialRuntimeSnapshot` — KPIs de cierre en tiempo real
- `ReconciliationSession` — sesiones de conciliación documental
- Motor FP&A (tendencias, alertas de desvío)

**FUENTE_1 gate:** Solo FUENTE_1 cuenta para P&L. FUENTE_2 es pronóstico.

---

### D09 — CRM / Pedidos
Pipeline comercial. Oportunidades, cotizaciones, órdenes.

**CRM es la fuente para pedidos pre-SAG.**

**CRM consumido:**
- `CRMOpportunity` (pipeline etapas)
- `CRMQuote` / `CRMQuoteLine` (cotizaciones)
- `CustomerOrderRecord` (pedidos ingresados en CRM)

**Bridge CRM → Agentik:**
- `CustomerOrderRecord` → `OperationalReservation` (pre-commit de inventario)
- Pedidos confirmados en CRM → candidatos a `SagWriteOperation` (PD en SAG)

**Agentik propio:**
- Validación de disponibilidad operacional antes de confirmar pedido
- Señal de demanda hacia `CommercialProductionSignal`

---

### D10 — Customer 360
Vista unificada del cliente cruzando CRM, SAG y comportamiento.

**SAG consumido:**
- TERCEROS → `CustomerProfile`
  - Status: `validated` en query-catalog
- CARTERA by NIT → historial de cartera por cliente
- DOCUMENTOS by NIT → historial de compras

**CRM consumido:**
- `CRMOpportunity` → pipeline activo del cliente
- `CRMActivity` → interacciones

**Agentik propio:**
- `CustomerProfile` (enriquecido con scoring)
- Historial de portafolios (`VendorBagOrderLine`)
- Señales copilot por cliente

---

### D11 — Logística
Despachos y movimientos de mercancía.

**SAG consumido (futuro):**
- Remisiones (FUENTE_2) como señal de despacho confirmado
- BODEGAS — catálogo de bodegas → `SAG_CONFIRMAR`
- Movimientos de traslado entre bodegas → `SAG_CONFIRMAR`

**Agentik propio:**
- `CommercialCoverageSnapshot.line` (LT/CS distingue línea)
- Portafolio por vendedor como proxy de "ruta de despacho"

**Estado:** dominio parcialmente cubierto. Sin modelo logístico propio aún.

---

### D12 — Inteligencia Operacional
Motor de explicabilidad y señales cruzadas.

**Completamente propio de Agentik — ninguna fuente SAG directa.**

- `OperationalIntelligenceSnapshot` — estado de todas las referencias
- `OperationalIntelligenceReference` — por referencia: why[], impacts[], suggestions[]
- `CopilotSignalRecord` — señales activas para agentes IA
- `BusinessAlert` — alertas de negocio con severidad

Consume de: todos los dominios.
Genera: señales hacia copilot, alertas, recomendaciones, sugerencias de producción.

---

### D13 — Conciliación
Cruce y resolución de diferencias entre fuentes.

**Agentik propio:**
- `ReconciliationSession` — una sesión de conciliación (período / tipo)
- `ReconciliationRun` — ejecución del motor
- `ReconciliationEvent` — evento detectado (MATCH, MISMATCH, ONLY_IN_A...)
- `ReconciliationException` — excepción que requiere acción humana

Cruza: `SaleRecord` vs `BankMovement`, `CustomerReceivable` vs `CollectionRecord`,
`CommercialCoverageSnapshot` vs `OperationalReservation`.

---

## 6. Mapa de dependencias cruzadas

```
D09 (CRM/Pedidos) ────────────→ D03 (Inventario) [disponibilidad]
D09 (CRM/Pedidos) ────────────→ D04 (Producción) [señal demanda]
D02 (Comercial)   ────────────→ D03 (Inventario) [snapshot cobertura]
D02 (Comercial)   ────────────→ D04 (Producción) [señal presión]
D05 (Cartera)     ────────────→ D08 (Finanzas)   [AR para P&L]
D06 (Cobranza)    ────────────→ D07 (Tesorería)  [entradas de caja]
D07 (Tesorería)   ────────────→ D08 (Finanzas)   [posición liquidez]
D05 + D06 + D07   ────────────→ D13 (Conciliación)
D03 + D04 + D09   ────────────→ D12 (Inteligencia Operacional)
D12               ────────────→ D01 (Torre de Control)
todos             ────────────→ D12 (Inteligencia Operacional)
```

---

## 7. Estado de integración SAG — resumen ejecutivo

| Query SAG            | Tabla           | Status       | Usado hoy              |
|----------------------|-----------------|--------------|------------------------|
| `customers.all`      | TERCEROS        | **validated**| CustomerProfile sync   |
| `receivables.all`    | CARTERA         | **validated**| CustomerReceivable sync|
| `inventory.all`      | INVENTARIO      | **pending**  | CoverageSnapshot (V1 Excel hoy) |
| `articles.all`       | ARTICULOS       | **pending**  | ProductSnapshot (sin sync live) |
| `orders.recentInvoices` | DOCUMENTOS   | placeholder  | SaleRecord (CSV import hoy) |
| `orders.pendingOrders`  | PEDIDOS       | placeholder  | No implementado        |
| `prices.allLists`    | LISTAS_PRECIOS  | placeholder  | No implementado        |
| Órdenes Producción   | SAG_CONFIRMAR   | —            | No implementado        |
| Traslados bodega     | SAG_CONFIRMAR   | —            | No implementado        |
| Saldos bancarios     | SAG_CONFIRMAR   | —            | Probablemente no en SAG|

---

## 8. Preguntas de validación para reunión técnica SAG

Estas preguntas deben resolverse antes de avanzar al ODBC connector (V2):

### Inventario
1. Tabla real de saldos: ¿`INVENTARIO`, `SALDOS`, `EXISTENCIAS`, o `SALDOS_INVENTARIO`?
2. Campo de cantidad: ¿`SALDO`, `EXISTENCIA`, o `CANTIDAD`?
3. ¿El `disponible` (o equivalente) descuenta PD autorizados en Castillitos? ¿O no?
4. ¿Existe un campo `FECHA_MODIFICACION` para incremental sync?
5. ¿Hay vistas consolidadas o solo tablas base?

### Artículos
6. ¿Nombre exacto de tabla: `ARTICULOS`, `PRODUCTOS`, o `ITEMS`?
7. ¿Campo de precio: `PRECIO`, `PRECIO_1`, `PV1`?
8. ¿Campo activo: `ACTIVO = 1` o `ACTIVO = 'S'`?
9. ¿Existe `FECHA_MODIFICACION` para incremental?

### Documentos / Facturas
10. ¿Tabla de documentos: `DOCUMENTOS` o `FACTURAS`?
11. ¿`TIPO_DOC` = `'FV'` para factura de venta en Castillitos?
12. ¿`ESTADO` values: `APLICADO`, `ANULADO`, `PENDIENTE`?
13. ¿`TOTAL` incluye IVA o va en campo separado?

### Pedidos
14. ¿Existe tabla `PEDIDOS` en Castillitos?
15. ¿Qué `ESTADO` distingue pedido abierto vs. facturado?
16. ¿Qué campo distingue PD de OC?

### Producción
17. ¿Existe tabla de Órdenes de Producción? ¿Nombre?
18. ¿Campos: número OP, artículo, cantidad, estado, fecha estimada completación?
19. ¿SAG actualiza automáticamente inventario al completar OP?

### Cartera / Cobranza
20. Confirmar: `SALDO` vs `SALDO_ACTUAL` en CARTERA
21. Confirmar: formato de fecha `YYYY-MM-DD` vs `DD/MM/YYYY`
22. ¿Las CARTERA rows con `SALDO = 0` están incluidas o excluidas del query?

### SOAP / Conectividad
23. ¿`consultaSagJson` soporta cláusulas `WHERE` con filtros numéricos?
24. ¿`consultaSagJson` soporta `WHERE` con filtros de texto (string)?
25. ¿Qué límite de rows devuelve cada llamada antes de timeout?
26. ¿Hay endpoint separado `consultaSagJson2` y qué diferencia tiene?

---

## 9. Evolución de la integración

| Versión | Descripción                               | Estado         |
|---------|-------------------------------------------|----------------|
| V1      | Import manual Excel/CSV desde SAG         | **Activo**     |
| V2      | ODBC read-only vía SAG SOAP connector     | En desarrollo  |
| V3      | Event polling — SAG pushea cambios        | Futuro         |
| V4      | Bidireccional: Agentik → SAG PD/OP        | Futuro         |

---

## 10. Glosario

| Término           | Definición                                                                   |
|-------------------|------------------------------------------------------------------------------|
| FUENTE_1          | Factura oficial SAG (OFICIAL). Crea AR. Ingreso reconocido. Expectativa DIAN.|
| FUENTE_2          | Remisión/despacho SAG. Señal operacional. No crea AR. No es ingreso.        |
| PD                | Pedido pendiente SAG. Presión de demanda. No es revenue.                     |
| AP                | Limpieza de pedidos SAG. Nunca afecta stock. Nunca genera producción.        |
| disponible SAG    | Campo propio de SAG. **No confiable como verdad operacional** (ver §2).      |
| operationalAvailableQty | Disponibilidad Agentik = physicalQty − reservas Agentik − portafolios. |
| SAG_CONFIRMAR     | Campo/tabla/comportamiento que debe validarse en reunión técnica con SAG.    |
| CommercialCoverageSnapshot | Snapshot Agentik de inventario SAG por referencia. Fuente para portafolios. |
| VendorCommercialBag | Portafolio de venta asignado a un vendedor en Agentik.                    |
| OperationalReservation | Reserva Agentik de inventario para un pedido/portfolio no aún en SAG.  |
| SagWriteOperation | Operación de escritura hacia SAG. Requiere aprobación humana.               |

---

*Sprint: AGENTIK-OPERATIONAL-SOURCE-MAP-01*
*Próxima revisión: post-reunión técnica SAG*
