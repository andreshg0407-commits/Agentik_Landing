# AGENTIK-FINANCE-PLANNING-ARCH-01
## Arquitectura del Módulo: Planeación Financiera

**Sprint:** AGENTIK-FINANCE-PLANNING-ARCH-01
**Fecha:** 2026-05-13
**Estado:** Arquitectura aprobada — pendiente de sprint de UI

---

## 1. Definición del Módulo

**Planeación Financiera** no es una hoja de cálculo. Es el módulo que responde a una pregunta operacional concreta:

> "¿Estamos gastando lo que planeamos gastar, en el ritmo que planeamos gastarlo?"

Es la capa predictiva del sistema financiero de Agentik. Toma datos reales de Tesorería, Cierre y Conciliación, los contrasta con presupuestos activos, y genera señales de desvío, riesgo y ajuste antes de que el daño ocurra.

**Diferencia clave respecto a BI tradicional:** No reporta lo que pasó. Proyecta lo que va a pasar si el ritmo actual continúa.

---

## 2. Fuentes de Datos

| Fuente | Qué aporta | Frecuencia de consumo |
|--------|-----------|----------------------|
| `CollectionRecord` (Tesorería) | Cobros reales, fechas, montos, estado | Tiempo real (por evento) |
| `SaleRecord` (SAG) | Ventas realizadas por canal/tienda/línea | Diaria (sync SAG) |
| `ApDocumentRecord` (CxP) | Obligaciones de pago, vencimientos, montos | Por sync o ingesta documental |
| `FinancialClose` (Cierre) | Totales consolidados por período, estado de cierre | Por cierre ejecutado |
| `ReconciliationRecord` (Conciliación) | Movimientos validados vs. no validados | Por run de conciliación |
| Presupuesto (nuevo — ver sección 12) | Budget activo con dimensiones y períodos | Mutable (ajustes con trazabilidad) |

**Regla de oro:** Planeación nunca es la fuente primaria. Solo consume. Las fuentes primarias no cambian.

---

## 3. Modelo del Presupuesto Vivo

El presupuesto en Agentik es una **entidad operacional con estado**, no un archivo estático.

### Estados del presupuesto

```
activo        → vigente, consumiendo dentro de parámetros normales
en_riesgo     → velocidad de consumo proyecta agotamiento antes del fin del período
desviado      → ejecución real supera el presupuesto ajustado en más del umbral
pausado       → congelado por decisión (no genera alertas activas)
agotado       → consumo 100% — sin margen disponible
cumplido      → período finalizado con ejecución dentro del rango objetivo
cerrado       → período finalizado y validado en Cierre Financiero
```

### Ciclo de vida

```
CREADO → ACTIVO ─→ EN_RIESGO ─→ DESVIADO
                ↘                   ↓
                 PAUSADO         AGOTADO
                ↗
              ACTIVO
                ↓
             CUMPLIDO → CERRADO
```

### Propiedades clave de un Budget activo

- `monto_aprobado` — valor original firmado
- `monto_ajustado` — valor actual (incluye todos los ajustes con trazabilidad)
- `ejecutado_real` — consumo acumulado de fuentes reales
- `comprometido` — obligaciones contraídas pero no pagadas (CxP pendiente)
- `disponible` — `monto_ajustado - ejecutado_real - comprometido`
- `velocidad_consumo` — consumo diario proyectado
- `fecha_proyeccion_agotamiento` — fecha calculada donde `disponible = 0`

---

## 4. Dimensiones Presupuestarias

Las dimensiones son los ejes por los cuales se puede cortar un presupuesto. Son acumulativas: un presupuesto puede tener múltiples dimensiones simultáneas.

| Dimensión | Entidad fuente | Ejemplo |
|-----------|---------------|---------|
| `empresa` | `Org` | Castillitos S.A. |
| `tienda` | `SaleChannel` (almacén) | Tienda Chapinero |
| `ciudad` | Derivado de tienda | Bogotá |
| `área` | `BudgetDimension` libre | Logística, Marketing |
| `canal` | `SaleChannel` (tipo) | Mostrador, SAG-PYA |
| `línea` | `ProductCategory` | Línea Premium, Mascotas |
| `campaña` | `BudgetDimension` libre | Black Friday 2026 |
| `proyecto` | `BudgetDimension` libre | Apertura Medellín |
| `temporada` | `BudgetPeriod` tipo | Q1, Navidad |
| `proveedor` | `SagSupplier` | Proveedor X |
| `producto` | `SagProduct` | Producto específico |
| `categoría` | `SagCategory` | Alimento seco |
| `centro de costo` | `BudgetDimension` libre | CC-001 |
| `unidad operativa` | `BudgetDimension` libre | UO-Ventas |

**Regla:** Las dimensiones no se inventan en la UI. Se definen al crear el presupuesto y no cambian sin trazabilidad.

---

## 5. Tipos de Presupuesto

| Tipo | Descripción | Comportamiento |
|------|-------------|---------------|
| `límite` | Techo máximo — no se puede superar sin ajuste aprobado | Genera alerta crítica si `ejecutado > monto_ajustado` |
| `objetivo` | Meta a alcanzar — ejecución por debajo es señal negativa | Alerta si ejecución < 80% del objetivo al 90% del período |
| `flexible` | Se ajusta automáticamente por % de ventas reales | `monto_ajustado = base × (ventas_reales / ventas_proyectadas)` |
| `proyectado_ia` | Generado por modelo IA basado en histórico + estacionalidad | Read-only — sirve como referencia, no como techo |
| `estratégico` | Presupuesto plurianual de alto nivel | No genera alertas operacionales, solo desvíos anuales |
| `personalizado` | Lógica de cálculo definida por el tenant | Requiere función de evaluación custom |

---

## 6. Reglas de Ajuste

Todo ajuste al presupuesto genera un registro `BudgetAdjustment` inmutable.

### Campos obligatorios de un ajuste

```
tipo          → incremento | reducción | reasignación | corrección_error | cierre_anticipado
delta         → monto del cambio (positivo o negativo)
motivo        → texto libre obligatorio (min 10 chars)
aprobado_por  → userId del aprobador
fecha_efecto  → cuándo entra en vigor
origen        → manual | automatico_ia | regla_flexible | cierre
```

### Reglas de validación

1. Un ajuste de reducción no puede llevar `disponible` a negativo si hay compromisos activos
2. Una reasignación debe especificar el budget destino y validar que sea de la misma empresa
3. Los ajustes automáticos IA requieren flag `requiere_aprobacion = true` hasta que el usuario confirme
4. No se pueden ajustar presupuestos en estado `cerrado`

---

## 7. Velocidad de Consumo

La velocidad es el KPI central de Planeación. No interesa cuánto se ha gastado — interesa a qué ritmo.

### Fórmula

```
velocidad_diaria = ejecutado_real / días_transcurridos_en_período

fecha_proyeccion_agotamiento = hoy + (disponible / velocidad_diaria)

cobertura_restante_días = disponible / velocidad_diaria

porcentaje_tiempo_consumido = días_transcurridos / duración_total_período
porcentaje_presupuesto_consumido = ejecutado_real / monto_ajustado

índice_desvío_velocidad = porcentaje_presupuesto_consumido / porcentaje_tiempo_consumido
  → < 0.85  : subejecutado (riesgo de no uso)
  → 0.85–1.15: en ritmo
  → 1.15–1.35: sobre-ritmo (atención)
  → > 1.35  : ritmo crítico (alerta inmediata)
```

### Velocidad ajustada por estacionalidad

Si el tenant tiene histórico de ventas, la velocidad puede normalizarse contra el patrón histórico del mismo período del año anterior. Esto evita falsas alarmas en picos estacionales conocidos.

---

## 8. Ejecución vs. Planeado

Este es el corazón visual del módulo. Cada presupuesto tiene un estado de salud calculado en tiempo real.

### Estados de salud

| Estado | Condición | Color operacional |
|--------|-----------|------------------|
| `en_ritmo` | índice_desvío entre 0.85 y 1.15 | Verde |
| `subejecutado` | índice < 0.85 y período > 50% | Azul (atención informativa) |
| `sobre_ritmo` | índice entre 1.15 y 1.35 | Ámbar |
| `critico` | índice > 1.35 o fecha_agotamiento < hoy + 7 días | Rojo |
| `agotado` | disponible ≤ 0 | Rojo sólido |
| `pausado` | estado del budget = pausado | Gris |

### Vista de comparación

La vista principal muestra, por cada budget activo:
- Barra doble: planeado vs. ejecutado en el mismo eje temporal
- Indicador de velocidad: ritmo actual vs. ritmo objetivo
- Proyección: curva extrapolada hasta fin de período
- Delta: diferencia porcentual con semáforo operacional

---

## 9. Simulaciones

Las simulaciones son escenarios hipotéticos anclados en datos reales. No modifican el budget activo.

### Tipos de simulación

| Tipo | Descripción |
|------|-------------|
| `what_if_velocidad` | "¿Qué pasa si el ritmo actual continúa 30 días más?" |
| `what_if_evento` | "¿Qué impacto tiene un gasto extraordinario de X?" |
| `what_if_ajuste` | "Si reduzco el presupuesto en 15%, ¿cuántos días de cobertura gano?" |
| `escenario_optimista` | Proyección con reducción de velocidad al 80% del actual |
| `escenario_pesimista` | Proyección con aceleración de velocidad al 130% del actual |

### Reglas

- Las simulaciones son server-side (nunca cálculo en cliente)
- Se guardan como `BudgetSimulation` con snapshot del estado en el momento de creación
- No generan alertas ni afectan el estado del budget
- El Copilot puede referenciar simulaciones previas en su contexto

---

## 10. Recomendaciones IA

El motor de recomendaciones consume cuatro señales simultáneas:

| Señal | Fuente | Peso |
|-------|--------|------|
| Desvío de velocidad | `índice_desvío_velocidad` | Alto |
| Compromisos próximos | `ApDocumentRecord` venciendo en 15 días | Alto |
| Estado de Cierre anterior | `FinancialClose.progreso` del período previo | Medio |
| Liquidez disponible | `CollectionRecord` proyección 30 días | Medio |

### Tipos de recomendación

```
AJUSTE_PREVENTIVO   → "Reducir budget X en Y% para evitar agotamiento anticipado"
REASIGNACION        → "Reasignar Z de budget infrautilizado a budget en riesgo"
ALERTA_COMPROMISO   → "CxP vencimiento crítico en 7 días — revisar disponible"
ACCION_CIERRE       → "Budget período anterior sin cerrar — bloquea consolidación"
OPORTUNIDAD         → "Budget A tiene 22% sin usar en período final — ¿planear uso?"
```

Las recomendaciones tienen `confianza` (0.0–1.0) y `urgencia` (baja/media/alta/crítica). Solo se muestran en UI si `confianza ≥ 0.65`.

---

## 11. Integración con Copilot

El Copilot de Planeación Financiera tiene acceso a:

- Estado actual de todos los budgets activos del tenant
- Historial de ajustes (últimos 90 días)
- Simulaciones guardadas
- Recomendaciones activas no atendidas
- Señales de Tesorería (cobros proyectados, CxP próximos)
- Estado del último Cierre Financiero

### Capacidades del Copilot

```
CONSULTA         → "¿Cuánto presupuesto de marketing queda para Q2?"
SIMULACION       → "Simula qué pasa si duplicamos el gasto en logística este mes"
COMPARACION      → "Compara la ejecución de este Q1 vs. el Q1 del año pasado"
ALERTA_PROACTIVA → El Copilot puede iniciar conversación si detecta riesgo crítico
AJUSTE_ASISTIDO  → Genera borrador de ajuste que el usuario aprueba o descarta
```

**Restricción de seguridad:** El Copilot nunca ejecuta ajustes directamente. Solo genera propuestas con `requiere_aprobacion = true`.

---

## 12. Modelo Prisma Conceptual

```prisma
// Budget — entidad central del presupuesto vivo
model Budget {
  id              String   @id @default(cuid())
  orgId           String
  nombre          String
  tipo            BudgetTipo
  estado          BudgetEstado  @default(activo)
  montoAprobado   Decimal
  montoAjustado   Decimal
  ejecutadoReal   Decimal       @default(0)
  comprometido    Decimal       @default(0)
  periodoInicio   DateTime
  periodoFin      DateTime
  moneda          String        @default("COP")
  creadoPor       String
  aprobadoPor     String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  org             Org           @relation(fields: [orgId], references: [id])
  dimensiones     BudgetDimension[]
  periodos        BudgetPeriod[]
  ajustes         BudgetAdjustment[]
  snapshots       BudgetExecutionSnapshot[]
  alertas         BudgetAlertRule[]
  simulaciones    BudgetSimulation[]
  recomendaciones BudgetRecommendation[]
}

// Dimensiones del presupuesto (ejes de corte)
model BudgetDimension {
  id        String  @id @default(cuid())
  budgetId  String
  tipo      String  // empresa | tienda | área | canal | línea | campaña | proyecto | etc.
  valor     String
  etiqueta  String?

  budget    Budget  @relation(fields: [budgetId], references: [id])
}

// Sub-períodos (mensual, quincenal, semanal dentro del budget)
model BudgetPeriod {
  id            String   @id @default(cuid())
  budgetId      String
  label         String   // "Enero 2026", "Q1-2026"
  inicio        DateTime
  fin           DateTime
  montoAsignado Decimal
  ejecutado     Decimal  @default(0)

  budget        Budget   @relation(fields: [budgetId], references: [id])
}

// Trazabilidad de ajustes — inmutable
model BudgetAdjustment {
  id            String   @id @default(cuid())
  budgetId      String
  tipo          AjusteTipo
  delta         Decimal
  motivo        String
  aprobadoPor   String
  solicitadoPor String
  fechaEfecto   DateTime
  origen        AjusteOrigen
  createdAt     DateTime @default(now())

  budget        Budget   @relation(fields: [budgetId], references: [id])
}

// Snapshot diario de ejecución (para gráficas históricas)
model BudgetExecutionSnapshot {
  id              String   @id @default(cuid())
  budgetId        String
  fecha           DateTime
  ejecutadoReal   Decimal
  comprometido    Decimal
  velocidadDiaria Decimal
  indiceDesvio    Decimal
  proyeccionFin   DateTime?

  budget          Budget   @relation(fields: [budgetId], references: [id])

  @@index([budgetId, fecha])
}

// Reglas de alerta configurables por budget
model BudgetAlertRule {
  id           String  @id @default(cuid())
  budgetId     String
  tipo         String  // velocidad | disponible_pct | agotamiento_dias | desvio_indice
  umbral       Decimal
  urgencia     String  // baja | media | alta | critica
  activa       Boolean @default(true)
  notificarA   String[] // userIds

  budget       Budget  @relation(fields: [budgetId], references: [id])
}

// Simulaciones guardadas
model BudgetSimulation {
  id              String   @id @default(cuid())
  budgetId        String
  tipo            String
  parametros      Json
  resultadoJson   Json
  creadoPor       String
  createdAt       DateTime @default(now())

  budget          Budget   @relation(fields: [budgetId], references: [id])
}

// Recomendaciones IA
model BudgetRecommendation {
  id            String   @id @default(cuid())
  budgetId      String
  tipo          String
  descripcion   String
  accionSugeri  String?
  confianza     Float
  urgencia      String
  atendida      Boolean  @default(false)
  descartada    Boolean  @default(false)
  createdAt     DateTime @default(now())

  budget        Budget   @relation(fields: [budgetId], references: [id])
}

enum BudgetTipo {
  limite
  objetivo
  flexible
  proyectado_ia
  estrategico
  personalizado
}

enum BudgetEstado {
  activo
  en_riesgo
  desviado
  pausado
  agotado
  cumplido
  cerrado
}

enum AjusteTipo {
  incremento
  reduccion
  reasignacion
  correccion_error
  cierre_anticipado
}

enum AjusteOrigen {
  manual
  automatico_ia
  regla_flexible
  cierre
}
```

---

## 13. Riesgos Antes de Construir la UI

### Riesgo 1 — Ausencia de datos presupuestarios reales
**Descripción:** Castillitos no tiene presupuestos cargados en Agentik. El módulo arrancaría completamente en vacío.
**Mitigación:** Diseñar el empty state como un flujo de onboarding activo, no como un error. El primer presupuesto se crea desde la propia UI.

### Riesgo 2 — Sincronización de ejecutado_real
**Descripción:** El campo `ejecutado_real` debe actualizarse cada vez que ocurre un gasto real. No hay un trigger automático todavía.
**Mitigación:** Implementar un job de reconciliación diaria que agrega `CollectionRecord`, `ApDocumentRecord` y `SaleRecord` contra los presupuestos activos por dimensión.

### Riesgo 3 — Granularidad de dimensiones
**Descripción:** Los registros de SAG no tienen todas las dimensiones presupuestarias etiquetadas (ej: "área" no existe en SAG).
**Mitigación:** Las dimensiones no-SAG se mapean manualmente al crear el presupuesto. El sistema acepta que no toda dimensión tiene fuente automática.

### Riesgo 4 — Velocidad de consumo en períodos cortos
**Descripción:** Si el presupuesto lleva menos de 5 días activo, la velocidad calculada es estadísticamente inestable.
**Mitigación:** Mostrar velocidad solo si `días_transcurridos ≥ 7`. Antes de ese umbral, mostrar "en calibración".

### Riesgo 5 — Aprobación de ajustes sin flujo definido
**Descripción:** El campo `aprobado_por` requiere un flujo de aprobación que no existe en el sistema actual.
**Mitigación:** En V1, el mismo usuario que crea el ajuste puede aprobarlo. El campo existe para V2 con flujo de aprobación real.

### Riesgo 6 — Presupuesto plurianual vs. operacional
**Descripción:** Los presupuestos estratégicos plurianuales tienen lógica distinta a los operacionales.
**Mitigación:** Implementar solo presupuestos operacionales en V1 (`límite`, `objetivo`, `flexible`). Los tipos `estratégico` y `proyectado_ia` se reservan para V2.

---

## 14. Recomendación de Siguiente Sprint

**AGENTIK-FINANCE-PLANNING-V1-01 — Presupuesto Operacional Vivo**

Alcance mínimo viable para el sprint:

1. **Migración Prisma:** Agregar modelos `Budget`, `BudgetDimension`, `BudgetAdjustment`, `BudgetExecutionSnapshot` al schema.
2. **Seed inicial Castillitos:** Crear 2-3 presupuestos de prueba con datos reales de Q1 2026.
3. **Job de ejecución diaria:** Script que calcula `ejecutado_real` aggregando fuentes reales por dimensión.
4. **Página `/finanzas/planeacion`:** Lista de presupuestos activos con estado de salud, velocidad, índice de desvío.
5. **Detalle de presupuesto:** Barra doble planeado/ejecutado, proyección, historial de ajustes.
6. **Crear/ajustar presupuesto:** Formulario de creación con dimensiones + formulario de ajuste con trazabilidad.

**Lo que NO entra en V1:**
- Simulaciones (V2)
- Recomendaciones IA (V2)
- Integración Copilot (V2)
- Tipos `estratégico` y `proyectado_ia` (V2)
- Flujo de aprobación multi-usuario (V2)

**Pre-requisito hard:** El sprint de Cierre Financiero debe estar en estado `cumplido` para que los datos de cierre alimenten la validación del primer presupuesto cerrado.
