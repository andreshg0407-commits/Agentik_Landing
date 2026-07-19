# CASTILLITOS-EXECUTIVE-REPORTS-01

**Sprint:** Informes Ejecutivos Castillitos — Capacidades Base
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Architecture

```
lib/commercial-intelligence/           (5 files)
  availability-types.ts                Domain types for availability + maletas
  availability-engine.ts               buildAvailabilityReport() — Disponible Real
  maleta-replacement-engine.ts         buildMaletaReplacementReport() — replacement detection
  availability-signals.ts              buildAvailabilitySignals() + buildMaletaReplacementSignals()
  capability-catalog.ts                2 registered capabilities
  index.ts                             Client-safe barrel

lib/production-intelligence/           (5 files)
  production-types.ts                  Domain types for production + stage inference
  production-stage-inference.ts        inferProductionStage() — configurable stage inference
  production-engine.ts                 buildProductionReport() — production in process
  production-signals.ts                buildProductionSignals()
  capability-catalog.ts                2 registered capabilities
  index.ts                             Client-safe barrel

app/(app)/[orgSlug]/reports/
  page.tsx                             Server page — passes report props
  executive-dashboard-client.tsx       Updated — 2 new sections + table components
```

---

## Informe 1: Disponibilidad Comercial Real

**Pregunta:** ¿Cuanto inventario tengo realmente disponible para vender?

**Formula:**
```
Disponible Real = Inventario Bodega 01 - Pedidos Pendientes
```

### Fuentes SAG
- Inventario: Bodega 01 (bodega principal)
- Pedidos: Pedidos comerciales activos (PD)

### Agrupacion
```
SubLinea (LATIN KIDS / CASTILLITOS / IMPORTACION)
  └─ SubGrupo (tipo de producto)
       └─ Referencia
            └─ Variantes (size × color)
```

### Salida por referencia
| Campo | Descripcion |
|-------|-------------|
| Referencia | Codigo SAG |
| Descripcion | Nombre producto |
| SubGrupo | Tipo de producto |
| SubLinea | Linea comercial |
| Existencia Bodega 01 | Inventario fisico |
| Pedidos Pendientes | Demanda pendiente |
| Disponible Real | Existencia - Pedidos |
| Estado | disponible / comprometido / sobre_comprometido / sin_existencia |

### Ordenamiento
1. SubLinea (alfa)
2. SubGrupo (alfa)
3. Disponible Real (ascendente — mas criticos primero)

---

## Gestion de Maletas

### Reglas operativas (definidas por CEO)

| SubLinea | Umbral | Signal |
|----------|--------|--------|
| LATIN KIDS | <= 30 | MALLETA_REPLACEMENT_REQUIRED |
| CASTILLITOS | <= 20 | MALLETA_REPLACEMENT_REQUIRED |

### Bodegas de vendedores

| Vendedor | Bodega |
|----------|--------|
| Orlando | 35 |
| Carlos Leon | 36 |
| Luis | 37 |
| Nestor | 38 |
| Carlos Villa | 39 |

### Salida por referencia
| Campo | Descripcion |
|-------|-------------|
| Referencia | Codigo SAG |
| Descripcion | Nombre producto |
| Existencia actual | Bodega 01 |
| Linea | SubLinea |
| Vendedores afectados | Quienes tienen la referencia en maleta |
| Motivo | Por que necesita reemplazo |
| Recomendacion | Accion sugerida (texto, no ejecutable) |

---

## Informe 2: Produccion en Proceso

**Pregunta:** ¿Que tengo actualmente en produccion y en que etapa va?

### Fuente SAG
- Bodega 04: Producto en Proceso
- Documentos: OP, CN, PC, EC, ET, T1, T2, Y1

### Production Stage Inference

**Configurable — no hardcodeado.** Etapas definidas via `ProductionStageDefinition[]`.

Default stages (Castillitos):

| Orden | Etapa | Documentos SAG |
|-------|-------|----------------|
| 1 | Orden de Produccion | OP |
| 2 | Consumo de Insumos | CN |
| 3 | Confeccion Externa | PC, EC |
| 4 | Servicios (T1/T2/T3) | T1, T2, Y1 |
| 5 | Entrada Producto Terminado | ET |

**Estrategia de inferencia:**
- Encontrar la etapa mas avanzada con evidencia documental SAG
- Si no hay evidencia suficiente: `etapa = "indeterminada"` con confidence reducido
- Nunca inventar estados

### Salida por referencia
| Campo | Descripcion |
|-------|-------------|
| Referencia | Codigo SAG |
| Descripcion | Nombre producto |
| SubGrupo | Tipo de producto |
| SubLinea | Linea comercial |
| Fecha Activacion OP | Fecha mas temprana de OP |
| Estado Produccion | en_proceso / completado / detenido / indeterminado |
| Etapa Actual | Inferida de evidencia SAG |
| Dias en Produccion | Desde activacion OP |
| Observaciones | Auto-generadas de evidencia |

### ProductionStageInference

```typescript
interface ProductionStageInference {
  stageId: string;                    // ID configurado o "indeterminada"
  stageLabel: string;                 // Label display
  stageOrder: number;                 // Orden en el flujo
  evidence: ProductionStageEvidence[]; // Documentos SAG encontrados
  confidence: ProductionStageConfidence; // Score + reason + determined flag
}
```

---

## Business Signals

| Signal | Category | Trigger |
|--------|----------|---------|
| INVENTORY_UNAVAILABLE | inventory | Existencia = 0 |
| INVENTORY_LOW (sobre-comprometido) | inventory | Pedidos > Existencia |
| INVENTORY_LOW (comprometido) | inventory | Pedidos = Existencia |
| MALLETA_REPLACEMENT_REQUIRED | portfolio | Existencia <= umbral SubLinea |
| PRODUCTION_IN_PROGRESS | production | Referencia activa en produccion |
| PRODUCTION_DELAY_RISK | production | >45 dias en proceso, o detenido |

Todos integrados con: Business Signal Engine, Executive Dashboard, Decision Engine.

---

## Capability Catalog

| ID | Nombre | Domain |
|----|--------|--------|
| commercial_availability_intelligence | Commercial Availability Intelligence | commercial |
| portfolio_replacement_intelligence | Portfolio Replacement Intelligence | commercial |
| production_in_progress_intelligence | Production In Progress Intelligence | production |
| production_stage_inference | Production Stage Inference | production |

---

## David — Preguntas preparadas

El motor produce estructuras que David puede consumir para responder:

1. ¿Que referencias debo sacar de maletas?
2. ¿Que vendedores tienen muestras criticas?
3. ¿Que referencias tienen inventario comprometido?
4. ¿Que esta actualmente en produccion?
5. ¿Que referencias llevan mas tiempo en proceso?

David consume `CommercialAvailabilityReport`, `MaletaReplacementReport`, y `ProductionInProgressReport`. No crea consultas propias.

---

## Validacion

- `npx tsc --noEmit`: 160 errores (baseline mantenido)
- 0 errores nuevos introducidos
- Todos los archivos son client-safe (no Prisma, no server-only)
- Todas las capacidades registradas en catalogo
- Signals integrados con `buildSignal()` de `lib/business-signals`
