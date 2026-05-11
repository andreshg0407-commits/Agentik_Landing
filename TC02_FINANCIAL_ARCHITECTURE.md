# TC-02 — Financial Architecture
## Torre de Control · Nuevo Bloque Financiero Ejecutivo

**Sprint:** TC-02
**Date:** 2026-05-07
**Supersedes:** Block E (Obligaciones) — current implementation
**Status:** APPROVED FOR IMPLEMENTATION

---

## PARTE I — ESTRUCTURA CONCEPTUAL FINAL

### Narrativa Ejecutiva

El CEO entra a Torre de Control y en menos de 10 segundos debe responder:

1. **¿Cuánto debo pagar y a quién?** → Obligaciones Operativas
2. **¿Tengo caja para pagarlo?** → Presión de Caja
3. **¿Cómo voy vs el plan?** → Control Presupuestal

Esto reemplaza el bloque actual de "Obligaciones" y añade el bloque "Control Presupuestal"
que hoy no existe en Torre de Control.

---

## PARTE II — JERARQUÍA DE BLOQUES

```
TORRE DE CONTROL
├── A — Información del día         (existente)
├── B — Información del mes         (existente)
├── C — Vendedores                  (existente)
├── D — Clientes y Líneas           (existente)
│
├── E — OBLIGACIONES Y PRESUPUESTO  (REDISEÑO COMPLETO)
│   │
│   ├── E1 — Obligaciones con Proveedores
│   │   ├── KPI: Total pendiente de pago
│   │   ├── KPI: Vencen próximos 7 días
│   │   ├── Tabla: Obligaciones por proveedor (manual/futura integración)
│   │   └── CTA: Registrar obligación → Agentik
│   │
│   ├── E2 — Bancos y Créditos Activos
│   │   ├── KPI: Total deuda bancaria activa
│   │   ├── KPI: Próxima cuota (fecha + monto)
│   │   ├── Tabla: Créditos registrados (manual)
│   │   └── CTA: Registrar crédito → Agentik
│   │
│   └── E3 — Presión de Caja — Próximos 30 días
│       ├── KPI: Ingreso esperado (AR inflow — desde CustomerReceivable)
│       ├── KPI: Compromisos de pago (manual AP entries)
│       ├── KPI: Posición neta proyectada
│       └── Señal: POSITIVO / AJUSTADO / CRÍTICO
│
└── F — CONTROL PRESUPUESTAL        (BLOQUE NUEVO)
    │
    ├── F1 — Presupuesto vs Ejecución (mes actual)
    │   ├── KPI: Ventas plan vs real
    │   ├── KPI: Varianza absoluta
    │   ├── KPI: % de cumplimiento
    │   ├── Barra de progreso por dimensión (si hay presupuesto configurado)
    │   └── Empty state: "Configura presupuesto para ver varianza"
    │
    └── F2 — Proyección de Cierre
        ├── KPI: Proyección mes (extrapolación lineal de SaleRecord)
        ├── KPI: Target del mes (Budget)
        ├── KPI: Gap proyectado
        └── Signal: EN RUTA / RIESGO / CRÍTICO

Y BLOQUE G — Tareas y Alertas (lo que hoy es Bloque F, reordenado al final)
```

---

## PARTE III — DISEÑO DETALLADO DE CADA SUBSECCIÓN

### E1 — Obligaciones con Proveedores

**Propósito:** Qué tengo que pagar y qué puede explotar si no pago.

**Fuente de datos (actual):** Manual via Agentik / ActionTask con metadata
**Fuente de datos (futura):** `SupplierPayable` model (sprint posterior)

**KPIs en la sección:**
```
┌─────────────────────┬─────────────────────┬─────────────────────┐
│ TOTAL PENDIENTE     │ VENCEN 7 DÍAS       │ PROVEEDORES ACTIVOS │
│ $X                  │ $X · N facturas     │ N                   │
│ N obligaciones      │ ⚠ urgente si > 0   │                     │
└─────────────────────┴─────────────────────┴─────────────────────┘
```

**Tabla de obligaciones:**

| Proveedor | NIT | Concepto | Vence | Monto | Estado | Acción |
|-----------|-----|----------|-------|-------|--------|--------|
| (manual)  | ... | ...      | ...   | ...   | PENDIENTE / VENCIDO | Pagar |

**Empty state (sin datos):**
```
Sin obligaciones con proveedores registradas.
Para registrar una obligación, usa Agentik o espera la integración SAG CXP.
[Registrar obligación →]  [¿Qué es esto? →]
```

**Estado vacío es INTENCIONAL y COHERENTE.** No sugiere error.

---

### E2 — Bancos y Créditos Activos

**Propósito:** Centralizar compromisos financieros bancarios. Lo que le debo al banco.

**Fuente de datos (actual):** Manual via Agentik / ActionTask con metadata estructurada
**Fuente de datos (futura):** `BankObligation` model + bank feed integration

**KPIs en la sección:**
```
┌─────────────────────┬─────────────────────┬─────────────────────┐
│ DEUDA BANCARIA      │ PRÓXIMA CUOTA       │ CUOTAS ESTE MES     │
│ $X total            │ $X · dd/mm/aaaa     │ N · $X total        │
│ N créditos activos  │ banco · tipo        │                     │
└─────────────────────┴─────────────────────┴─────────────────────┘
```

**Tabla de créditos:**

| Banco | Tipo | Cuota mensual | Próximo pago | Saldo | Estado |
|-------|------|---------------|--------------|-------|--------|
| (manual) | Libranza/Libre inversión/Leasing | $X | dd/mm | $X | AL DÍA / PRÓXIMO / ATRASADO |

**Empty state (sin datos):**
```
Sin créditos bancarios registrados.
Cuando registres un crédito, aparecerá aquí con su calendario de pagos.
[Registrar crédito →]
```

---

### E3 — Presión de Caja — Próximos 30 días

**Propósito:** Señal ejecutiva directa: ¿tengo caja para lo que viene?

**Fuente de datos:**
- **Ingresos esperados:** `CustomerReceivable` — saldo de docs con dueDate en los próximos 30 días (YA disponible via `getFpaCashFlow()`)
- **Compromisos de pago:** suma de E1 + E2 con vencimiento en 30 días (manual)
- **Posición neta:** ingresos esperados − compromisos

**KPIs:**
```
┌─────────────────────────────────────────────────────────────────┐
│  PRESIÓN DE CAJA — PRÓXIMOS 30 DÍAS                             │
│                                                                 │
│  INGRESO ESPERADO (AR)    COMPROMISOS          POSICIÓN NETA   │
│  $X (N facturas)          $X (N obligac.)      $X              │
│  cobranza proyectada      AP + bancos          POSITIVO        │
│                                                                 │
│  Signal: [POSITIVO / AJUSTADO / CRITICO]                       │
│                                                                 │
│  → Proyección conservadora: $X (60% de AR)                     │
│  → Proyección base: $X (75%)                                    │
└─────────────────────────────────────────────────────────────────┘
```

**Signal rules:**
```
POSITIVO  = posición neta base > 0 AND ingresos > compromisos × 1.2
AJUSTADO  = posición neta base > 0 AND ingresos < compromisos × 1.2
CRÍTICO   = posición neta base ≤ 0 (compromisos superan ingresos esperados)
```

**Nota:** Si no hay datos de AP (E1/E2 vacíos), la señal se basa solo en AR inflow.
Muestra aviso: "Compromisos AP no registrados — solo incluye cobranza proyectada."

---

### F1 — Presupuesto vs Ejecución

**Propósito:** ¿Cómo voy vs el plan este mes?

**Fuente de datos:** `Budget` model + `SaleRecord` actuals via `getFpaVariance()`

**Estado sin presupuesto configurado:**
```
┌─────────────────────────────────────────────────────────────────┐
│  PRESUPUESTO VS EJECUCIÓN                                        │
│                                                                  │
│  No hay presupuesto configurado para este período.               │
│  Para activar el control presupuestal, define las metas          │
│  de ventas mensuales en el módulo de Finanzas.                   │
│                                                                  │
│  [Configurar presupuesto →]   (→ /finance con tab=presupuesto)  │
└─────────────────────────────────────────────────────────────────┘
```

**Estado con presupuesto configurado:**
```
┌──────────────┬──────────────┬──────────────┬──────────────────┐
│ PLAN MES     │ EJECUCIÓN    │ VARIANZA     │ CUMPLIMIENTO     │
│ $X           │ $X           │ +$X / -$X    │ XX%              │
│ presupuesto  │ ventas real  │ vs plan      │ [barra progreso] │
└──────────────┴──────────────┴──────────────┴──────────────────┘

Tabla: varianza por dimensión
┌─────────────────┬────────────┬────────────┬──────────┬────────┐
│ Dimensión       │ Plan       │ Real       │ Varianza │ %      │
├─────────────────┼────────────┼────────────┼──────────┼────────┤
│ Total           │ $X         │ $X         │ +$X      │ +X%   │
│ Sucursal Centro │ $X         │ $X         │ -$X      │ -X%   │
│ Canal Web       │ $X         │ $X         │ +$X      │ +X%   │
└─────────────────┴────────────┴────────────┴──────────┴────────┘
```

---

### F2 — Proyección de Cierre

**Propósito:** ¿Voy a cumplir el mes?

**Fuente de datos:** `SaleRecord` actuals + `Budget` via `getFpaRevenueForecast()`

**KPIs:**
```
┌─────────────────────┬─────────────────────┬─────────────────────┐
│ TARGET DEL MES      │ PROYECCIÓN          │ GAP                 │
│ $X                  │ $X (extrapolado)    │ +$X EN RUTA         │
│ presupuesto         │ a ritmo actual      │ o -$X EN RIESGO     │
└─────────────────────┴─────────────────────┴─────────────────────┘
```

**Signal rules:**
```
EN RUTA   = proyección ≥ target × 0.95
EN RIESGO = proyección entre target × 0.80 y × 0.95
CRÍTICO   = proyección < target × 0.80
```

---

## PARTE IV — PRIORIDAD DE IMPLEMENTACIÓN

### Fase 1 — Inmediata (sin nuevos modelos)
Implementable ahora con lo que existe.

| Componente | Datos | Complejidad |
|-----------|-------|-------------|
| F1 Presupuesto vs Ejecución | `Budget` + `SaleRecord` → `getFpaVariance()` | BAJA |
| F2 Proyección de Cierre | `SaleRecord` → `getFpaRevenueForecast()` | BAJA |
| E3 Ingreso esperado AR | `CustomerReceivable` → `getFpaCashFlow()` | BAJA |
| E1/E2 Empty states coherentes | — (solo UI) | MUY BAJA |
| E3 Señal POSITIVO/AJUSTADO/CRÍTICO | Derivada de AR + manuales | BAJA |

### Fase 2 — Corto plazo (entrada manual via Agentik)
Requiere formulario simple de registro de obligaciones.

| Componente | Approach |
|-----------|----------|
| E1 Registro de proveedores | `ActionTask` con metadata JSON estructurada |
| E2 Registro de créditos bancarios | `ActionTask` con metadata JSON estructurada |
| Suma compromisos en E3 | Leer ActionTasks de tipo FINANCIAL_OBLIGATION |

### Fase 3 — Sprint posterior (nuevos modelos)
Requiere migración Prisma aprobada.

| Modelo | Propósito |
|--------|-----------|
| `SupplierPayable` | AP real: facturas de proveedores recibidas |
| `BankObligation` | Créditos bancarios con calendario de cuotas |
| `TreasurySnapshot` | Saldo de caja disponible por fecha |

---

## PARTE V — NAVEGACIÓN Y FLUJO MENTAL

### Flujo del CEO al entrar a Torre de Control

```
1. ABRE TORRE DE CONTROL
   → Ve header con estado del día y fecha de último sync

2. ESCANEA BLOQUE A — ¿QUÉ PASÓ HOY?
   → Pedidos / Ventas / Facturas / Cobros del día
   → Clic → Detalle inline

3. BAJA A BLOQUE B — ¿CÓMO VA EL MES?
   → Ventas vs target, cartera vencida, flujo comprometido
   → Clic en Cartera vencida → Customer 360 filtrado

4. BAJA A BLOQUE C/D — ¿QUIÉN VENDE / QUIÉN DEBE?
   → Top vendedores, top deudores
   → Clic → Ficha de vendedor / cliente

5. BAJA A BLOQUE E — ¿QUÉ DEBO PAGAR?
   → E1: Proveedores — total + urgentes
   → E2: Bancos — cuota próxima
   → E3: Presión de caja — señal verde/amarillo/rojo

6. BAJA A BLOQUE F — ¿CÓMO VOY VS EL PLAN?
   → F1: Presupuesto vs real
   → F2: Proyección de cierre del mes

7. BLOQUE G — ¿QUÉ REQUIERE MI ATENCIÓN?
   → Alertas activas (con severidad)
   → Tareas pendientes (con prioridad)
```

### Principio de navegación cero ambigüedad

Cada número en pantalla debe llevar a:
- la tabla que lo compone, O
- la entidad que lo genera, O
- la acción para resolverlo

Sin excepciones.

---

## PARTE VI — REGLAS DE DISEÑO DE SEÑALES

### Señales de riesgo en obligaciones

| Señal | Color | Condición |
|-------|-------|-----------|
| AL DÍA | verde | sin vencimientos en próximos 7 días |
| PRÓXIMO | ámbar | vencimientos en próximos 7 días |
| URGENTE | rojo | vencimientos hoy o vencidos |

### Señales de cumplimiento presupuestal

| Señal | Color | Condición |
|-------|-------|-----------|
| EN RUTA | verde | ejecución ≥ 95% del plan |
| AJUSTADO | ámbar | ejecución entre 80–95% |
| CRÍTICO | rojo | ejecución < 80% |

### Señales de presión de caja

| Señal | Color | Condición |
|-------|-------|-----------|
| POSITIVO | verde | ingresos proyectados > compromisos × 1.2 |
| AJUSTADO | ámbar | ingresos proyectados entre compromisos × 1.0 y × 1.2 |
| CRÍTICO | rojo | ingresos proyectados < compromisos |

---

## PARTE VII — EMPTY STATES (ESTÁNDAR OBLIGATORIO)

Cada sección sin datos debe comunicar:
1. **Por qué está vacía** (sin datos, sin integración, sin configuración)
2. **Qué se verá cuando haya datos** (descripción operacional)
3. **Cómo activarlo** (acción clara)

### Plantilla de empty state

```
[ICONO CONTEXTUAL]
[Título: qué datos faltan]
[Descripción: qué aparecerá aquí y por qué importa]
[CTA primario → acción inmediata disponible]
[CTA secundario → integración futura (opcional)]
```

### Ejemplos concretos

**E1 sin proveedores:**
```
Sin obligaciones con proveedores
Cuando registres facturas de proveedores, verás aquí
el total pendiente, vencimientos y proveedores críticos.
[Registrar obligación →]
```

**E2 sin créditos:**
```
Sin créditos bancarios registrados
Los créditos activos aparecerán aquí con su
calendario de cuotas y fecha de próximo pago.
[Registrar crédito →]
```

**F1 sin presupuesto:**
```
Presupuesto no configurado
Define las metas de ventas mensuales para ver
la varianza entre plan y ejecución real.
[Ir a configurar presupuesto →]  (→ /finance)
```

---

## PARTE VIII — DEPENDENCIAS TÉCNICAS

### Para Fase 1 (inmediata)

| Dependencia | Disponible | Notas |
|------------|-----------|-------|
| `getFpaVariance(orgId, year, month)` | SÍ | En `lib/finance/fpa-queries.ts` |
| `getFpaRevenueForecast(orgId)` | SÍ | En `lib/finance/fpa-queries.ts` |
| `getFpaCashFlow(orgId)` | SÍ | En `lib/finance/fpa-queries.ts` |
| `Budget` model query | SÍ | Via Prisma |
| `SaleRecord` aggregates | SÍ | Via Prisma |
| `CustomerReceivable` aggregates | SÍ | Via Prisma |
| UI tokens (C, T, S, R, E) | SÍ | `@/lib/ui/tokens` |

### Para Fase 2 (manual entry)

| Dependencia | Disponible | Notas |
|------------|-----------|-------|
| `ActionTask` model with metadata JSON | SÍ | Schema exists |
| Structured ActionTask creation via Agentik | SÍ | Agentik route exists |
| Financial obligation ActionTask type | PARTIAL | `FINANCIAL_OBLIGATION` type needs adding |

### Para Fase 3 (nuevos modelos)

| Modelo | Sprint | Aprobación requerida |
|--------|--------|---------------------|
| `SupplierPayable` | TC-04 | SÍ |
| `BankObligation` | TC-04 | SÍ |
| `TreasurySnapshot` | TC-05 | SÍ |

---

## PARTE IX — PROPUESTA VISUAL ESTRUCTURAL

### Layout del nuevo Bloque E+F

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
E — OBLIGACIONES Y TESORERÍA
¿Qué debo pagar? · ¿Tengo caja para pagarlo?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌──────────────────┬──────────────────┬──────────────────┐
│ PROVEEDORES      │ BANCOS/CRÉDITOS  │ PRESIÓN DE CAJA  │
│                  │                  │                  │
│ $X pendiente     │ $X deuda total   │ [POSITIVO]       │
│ N obligaciones   │ cuota $X · fecha │                  │
│ N vencen 7d      │ N créditos       │ AR entrada: $X   │
│                  │ activos          │ Compromisos: $X  │
│ [Sin datos →     │ [Sin datos →     │ Neto: $X         │
│  Registrar]      │  Registrar]      │                  │
└──────────────────┴──────────────────┴──────────────────┘

[detalle proveedores — tabla — solo si hay datos o ?focus=obligaciones]
[detalle créditos    — tabla — solo si hay datos o ?focus=creditos]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
F — CONTROL PRESUPUESTAL
¿Cómo voy vs el plan?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌──────────────────┬──────────────────┬──────────────────┐
│ PLAN MES         │ EJECUCIÓN REAL   │ PROYECCIÓN       │
│ $X               │ $X               │ $X               │
│ presupuesto      │ ventas F1        │ a ritmo actual   │
│                  │ [barra %]        │ [EN RUTA]        │
└──────────────────┴──────────────────┴──────────────────┘

[tabla varianza por dimensión — si hay Budget configurado]
[empty state coherente     — si no hay Budget configurado]
```

### Jerarquía visual de información

```
NIVEL 1 (3 segundos):     KPI tiles con señal de color
NIVEL 2 (30 segundos):    Tabla de detalle (expandida por clic o siempre visible)
NIVEL 3 (drill-down):     Link a módulo específico (/finance, /sales, /agentik)
```

---

## PARTE X — CHECKLIST DE IMPLEMENTACIÓN

### Para TC-02 Fase 1 (este sprint)

- [ ] Reemplazar Block E PendingTiles ×4 con estructura E1/E2/E3
- [ ] Implementar E3 señal de presión de caja usando `getFpaCashFlow()`
- [ ] Implementar F1 presupuesto vs ejecución usando `getFpaVariance()`
- [ ] Implementar F2 proyección de cierre usando `getFpaRevenueForecast()`
- [ ] Empty states coherentes y ejecutivos en E1/E2 cuando no hay datos
- [ ] Eliminar CardPanel "Módulo de obligaciones — pendiente de activación"
- [ ] TypeScript clean
- [ ] Zero nuevos modelos Prisma

### Para TC-04 (sprint posterior — pendiente aprobación)

- [ ] Proponer `SupplierPayable` model con campos mínimos
- [ ] Proponer `BankObligation` model con calendar de cuotas
- [ ] Formulario de registro manual en Agentik
- [ ] Migración Prisma

---

*Documento aprobado — Proceder con implementación Fase 1*
