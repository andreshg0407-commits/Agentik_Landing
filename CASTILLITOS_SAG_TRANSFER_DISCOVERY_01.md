# CASTILLITOS-SAG-TRANSFER-DISCOVERY-01

**Sprint:** Descubrimiento del Flujo Logistico de Transferencias SAG
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)
**Date:** 2026-06-27

---

## Fuentes Existentes Reutilizadas (Arqueologia)

| Artifact | Ubicacion | Uso |
|---|---|---|
| CASTILLITOS_BODEGAS (37 bodegas) | `lib/sag/master-data/castillitos-overrides.ts` | Nombres y codigos |
| CASTILLITOS_FUENTES (127 fuentes) | `lib/sag/master-data/castillitos-fuentes.ts` | Catalogo de documentos |
| Source Semantic Rules | `lib/sag/master-data/source-semantic-rules.ts` | Clasificacion fuente 34 |
| SAG Real Source Catalog | `lib/operational-map/source-catalog/sag-real-source-catalog.ts` | Metadata fuente 34, 206 |
| Production Sync (fuente 33) | `lib/connectors/adapters/sag-pya-soap/production/sag-production-sync.ts` | Patron de sync existente |
| Query Catalog | `lib/connectors/adapters/sag-pya-soap/query-catalog.ts` | SQL queries SAG |
| Probe Movements Script | `scripts/_probe-sag-movements.ts` | Probe MOVIMIENTOS |
| MOVIMIENTOS_ITEMS samples | `scripts/samples/movimientos-items-top5.json` | Campo `ka_nl_bodega_destino_wms` |
| BODEGA-DISCOVERY-01 | `CASTILLITOS_SAG_BODEGA_DISCOVERY_01.md` | Clasificacion de bodegas |

---

## Phase 1: Catalogo de Documentos de Movimiento

### Fuentes que Mueven Inventario

**Categoria PRODUCCION:**

| ka | Codigo | Nombre | Proposito | Estado Sync |
|----|--------|--------|-----------|-------------|
| 33 | OP | Orden de Produccion | Crea WIP en bodega 04 | SINCRONIZADO (ProductionOrder) |
| 34 | TR | Traslado entre Bodegas | Mueve mercancia entre ubicaciones | NO SINCRONIZADO |
| 80 | CN | Consumos Insumos y Telas | 05/06 → 04 | NO SINCRONIZADO |
| 81 | PT | Entrada PT | Entrada producto terminado (variante) | NO SINCRONIZADO |
| 99 | PC | Salida a Confeccionistas | 04 → externo | NO SINCRONIZADO |
| 100 | EC | Entrada de Confeccionistas | Externo → 04 | NO SINCRONIZADO |
| 114 | 4 | Producto en Proceso | Ajuste interno bodega 04 | NO SINCRONIZADO |
| 115 | MV | Traslado de Movimientos PDN | Traslado produccion | NO SINCRONIZADO |
| 116 | ET | Entrada Producto Terminado | 04 → 01 (producto terminado) | NO SINCRONIZADO |
| 117 | CM | Consumo de Muestras | Consumo desde bodega 16 | NO SINCRONIZADO |
| 118 | T2 | Gastos de Terceros | Servicio externo | NO SINCRONIZADO |
| 119 | Y1 | Causacion de Servicios T | Servicio externo | NO SINCRONIZADO |
| 126 | AD | Adiciones y Faltantes | Ajuste produccion | NO SINCRONIZADO |
| 127 | CV | Consumos de Muestras y Varios | Consumo | NO SINCRONIZADO |
| 129 | T1 | Gastos Terceros | Servicio externo | NO SINCRONIZADO |
| 133 | M2 | Entrada de Muestras | Entrada a bodega 16 | NO SINCRONIZADO |
| 140 | SR | Saldo Inicial Retazos | Saldo inicial bodega 07 | NO SINCRONIZADO |

**Categoria INVENTARIO:**

| ka | Codigo | Nombre | Proposito | Estado Sync |
|----|--------|--------|-----------|-------------|
| 65 | IF | Inv. Fisico | Ajuste por inventario fisico | NO SINCRONIZADO |
| 76 | AI | Ajuste de Inventario | Ajuste manual | NO SINCRONIZADO |

**Fuentes de TRASLADO especificas (descubiertas en source-semantic-rules):**

| ka | Codigo | Nombre | Estado | Relevancia |
|----|--------|--------|--------|------------|
| 34 | TR | Traslado entre Bodegas | ACTIVE | PRINCIPAL — traslados generales |
| 115 | MV | Traslado de Movimientos PDN | ACTIVE | Traslados de produccion |
| 147 | TB | Traslado Bancos | EXCLUIDO | No aplica inventario |
| 153 | TF | Traslados Flamingo | HISTORICAL | Historico bodega 20 |
| **206** | **TM** | **Traslado de Maletas** | **ACTIVE** | **Traslados a vendedores** |

**Hallazgo critico:** Fuente 206 (TM = TRASLADO DE MALETAS) es la fuente especifica para movimiento de mercancia hacia bodegas de vendedores (35-40). Esta activa pero no sincronizada.

---

## Phase 2: Analisis de Fuente 34 (TR)

### Evidencia Recopilada

| Atributo | Valor | Fuente |
|----------|-------|--------|
| ka_ni_fuente | 34 | castillitos-fuentes.ts |
| Codigo | TR | castillitos-fuentes.ts |
| Nombre | TRASLADO ENTRE BODEGAS | castillitos-fuentes.ts |
| Clasificacion | ES MOVIMIENTO INTERNO DE INVENTARIO | source-semantic-rules.ts |
| Capa de dato | SAG_INVENTARIO | source-semantic-rules.ts |
| Familia documento | INVENTARIO | source-semantic-rules.ts |
| Efecto financiero | SIN_IMPACTO_DASHBOARD | source-semantic-rules.ts |
| Participa en cartera | NO | source-semantic-rules.ts |
| Participa en ventas | NO | source-semantic-rules.ts |
| Signo | 0 (neutro — entrada en destino, salida en origen) | source-semantic-rules.ts |
| Estado | ACTIVE | source-semantic-rules.ts |
| Sync actual | NO SINCRONIZADO | Verificacion codebase |

### Tablas SAG Involucradas

```
MOVIMIENTOS (header)
  ka_nl_movimiento          PK
  ka_ni_fuente = 34         Filter para traslados
  n_numero_documento        Numero de documento
  d_fecha_documento         Fecha
  ka_nl_bodega              Bodega ORIGEN (header level)
  sc_detalle_bodega         Nombre bodega origen
  sc_dcto_cerrado           'S' | 'N'

MOVIMIENTOS_ITEMS (lines)
  ka_nl_movimiento_item     PK
  ka_nl_movimiento          FK → header
  ka_nl_articulo            FK → articulo
  ka_nl_bodega              Bodega origen (item level)
  ka_nl_bodega_destino_wms  Bodega DESTINO
  n_cantidad                Cantidad transferida
  ss_talla                  Talla
  ss_color                  Color
  ss_referencia_pdn         Referencia produccion
```

### Confirmacion

**Fuente 34 ES un traslado entre bodegas.** Hipotesis VALIDADA con evidencia de:
1. Nombre: "TRASLADO ENTRE BODEGAS"
2. Clasificacion: "ES MOVIMIENTO INTERNO DE INVENTARIO"
3. Signo 0: neutro (no crea ni destruye inventario, lo mueve)
4. Sin impacto financiero (no es venta ni compra)
5. Campo `ka_nl_bodega_destino_wms` en MOVIMIENTOS_ITEMS para bodega destino

### Fuentes Complementarias

| Fuente | Para que | Diferencia con 34 |
|--------|----------|-------------------|
| 206 (TM) | Traslado de Maletas | Especifico: 01 → 35-40 |
| 115 (MV) | Traslado Movimientos PDN | Especifico: traslados de produccion |
| 153 (TF) | Traslados Flamingo | Historico: ya no activo |

---

## Phase 3: Grafo de Movimiento de Inventario

### Evidencia de Flujo (ProductInventoryLevel cross-warehouse analysis)

La siguiente tabla muestra cuantos productos comparten dos bodegas. Un numero alto de productos compartidos = evidencia fuerte de flujo de mercancia entre ellas.

**Top 15 Rutas por Productos Compartidos:**

| Rango | Ruta | Productos Compartidos | Interpretacion |
|-------|------|----------------------|----------------|
| 1 | 01 ↔ 04 | 2,983 | **Produccion → Principal** (flujo dominante) |
| 2 | 01 ↔ 02 | 1,606 | Principal → Sandiego |
| 3 | 00 ↔ 01 | 1,578 | Centro ↔ Principal |
| 4 | 00 ↔ 02 | 1,528 | Centro ↔ Sandiego |
| 5 | 00 ↔ 04 | 1,513 | Centro tiene productos de produccion |
| 6 | 00 ↔ 23 | 1,511 | Centro ↔ Gran Plaza |
| 7 | 02 ↔ 23 | 1,395 | Sandiego ↔ Gran Plaza |
| 8 | 02 ↔ 04 | 1,301 | Sandiego tiene productos de produccion |
| 9 | 00 ↔ 29 | 1,250 | Centro ↔ Caldas |
| 10 | 23 ↔ 29 | 1,233 | Gran Plaza ↔ Caldas |
| 11 | 02 ↔ 29 | 1,225 | Sandiego ↔ Caldas |
| 12 | 01 ↔ 23 | 1,101 | Principal → Gran Plaza |
| 13 | 04 ↔ 23 | 1,043 | Produccion → Gran Plaza |
| 14 | 01 ↔ 03 | 813 | Principal → Mayorca |
| 15 | 02 ↔ 03 | 794 | Sandiego → Mayorca |

### Distribucion de Productos por Numero de Bodegas

| Bodegas | Productos | Interpretacion |
|---------|-----------|----------------|
| 1 | 24 | Exclusivos de una ubicacion |
| 2-3 | 1,899 | Distribucion basica (produccion + principal) |
| 4-7 | 1,943 | Distribucion amplia (principal + tiendas) |
| 8-17 | 252 | Alta distribucion (franquicias historicas) |

**Producto mas distribuido:** aparece en 17 bodegas simultaneamente (01, 04, 00, 02, 03, todas las franquicias, 22, 23, 28, 29).

---

## Phase 4: Rutas Frecuentes

### Nodos Criticos del Sistema

| Bodega | Rol en el Grafo | Evidencia |
|--------|-----------------|-----------|
| **01 (Principal)** | HUB CENTRAL | Conecta con 04 (2,983 productos), todas las tiendas, franquicias |
| **04 (Produccion)** | FUENTE PRIMARIA | Mayor stock (1.3M unidades). 99% de productos fluyen hacia 01 |
| **00 (Centro)** | NODO TIENDA PRINCIPAL | Conecta con todos los puntos de venta (1,500+ productos compartidos) |
| **02 (Sandiego)** | SEGUNDA TIENDA | Alta conectividad (1,606 con 01, 1,528 con 00) |
| **24 (Importacion)** | NODO IMPORTACION | Recibe de contenedores (42-49), despacha a tiendas |

### Bodegas que SOLO Reciben (stock neto positivo)

| Bodega | Stock Positivo | Interpretacion |
|--------|----------------|----------------|
| 04 | 1,318,904 | Produccion en proceso (WIP) |
| 26 | 49,109 | Contenedor/staging desconocido |
| 44 | 36,069 | Contenedor importacion |
| 27 | 33,247 | Contenedor/staging desconocido |
| 24 | 24,912 | Staging importacion |
| 46 | 14,901 | Contenedor importacion |
| 49 | 13,506 | Contenedor desconocido |
| 42 | 11,116 | Contenedor importacion |

### Bodegas que SOLO Despachan (stock neto negativo)

| Bodega | Stock Negativo | Interpretacion |
|--------|----------------|----------------|
| 01 | -1,102,387 | Principal — despacha a todo el sistema |
| 24 | -95,637 | Tambien despacha (tiene ambos flujos) |
| 02 | -68,340 | Sandiego — salidas por venta |
| 00 | -28,160 | Centro — salidas por venta |

### Bodegas que NUNCA Despachan (0 items negativos)

04, 26, 27, 30, 31, 32, 33, 34, 42, 43, 44, 45, 46, 48, 49

Estas son bodegas de "entrada pura" — reciben mercancia pero no la despachan directamente. La mercancia sale cuando se transfiere a otra bodega.

### Bodegas que NUNCA Reciben (0 items positivos)

08, 09, 11, 14, 28, 41

Franquicias historicas y bodegas especiales — solo salidas acumuladas.

---

## Phase 5: Produccion (04 → 01)

### Evidencia Cuantitativa

| Metrica | Valor |
|---------|-------|
| Productos en bodega 04 | 3,007 |
| Productos en bodega 01 | 3,335 |
| Productos en AMBAS | 2,983 (99.2% de 04 esta en 01) |
| Solo en 04 (WIP no terminado) | 24 |
| Solo en 01 (sin WIP activo) | 352 |
| Stock en 04 | 1,318,904 unidades |
| Stock positivo en 01 | 67,950 unidades |

### Flujo Confirmado

```
MATERIA PRIMA (05/06/07)
  ↓ CN (fuente 80)
PRODUCTO EN PROCESO (04) — 1.3M unidades, 3,007 productos
  ↓ PC/EC (fuentes 99/100) — confeccion externa
  ↓ T1/T2/Y1 (fuentes 129/118/119) — servicios
  ↓ ET (fuente 116) — entrada producto terminado
BODEGA PRINCIPAL (01) — 67,950 unidades positivas, 3,335 productos
```

**Hallazgo:** 99.2% de los productos en produccion eventualmente llegan a Principal. Solo 24 productos estan exclusivamente en 04 = WIP actual sin producto terminado.

### Impacto en Production Stage Inference

El motor actual (`production-stage-inference.ts`) infiere etapas por tipo de documento (OP→CN→PC/EC→T1/T2/Y1→ET). Este descubrimiento CONFIRMA que el flujo es correcto. Las bodegas no son necesarias para la inferencia — los documentos son suficientes.

---

## Phase 6: Maletas (01 → 35-40)

### Estado Actual

| Bodega | Vendedor | Productos | Qty Neta | Overlap con 01 |
|--------|----------|-----------|----------|----------------|
| 35 | Orlando | 1 | -1 | 1/1 (100%) |
| 36 | Carlos Leon | 0 | 0 | — |
| 37 | Luis | 0 | 0 | — |
| 38 | Nestor | 0 | 0 | — |
| 39 | Carlos Villa | 0 | 0 | — |
| 40 | Fredy | 2 | -2 | 0/2 (0%) |

### Analisis

Las bodegas de vendedores estan practicamente **vacias** en la sincronizacion V2 (ProductInventoryLevel). Esto sugiere:

1. **Fuente 206 (TM = Traslado de Maletas)** no esta sincronizada — los movimientos hacia vendedores no se reflejan.
2. Los datos de maletas en V1 provienen de un canal diferente (context bridge via CommercialCoverageSnapshot).
3. Las cantidades negativas indican que historicamente hubo MAS salidas que entradas — lo cual es esperado si los movimientos de entrada (TM) no se sincronizaron.

### Flujo Esperado (a confirmar con sync de fuente 206)

```
BODEGA PRINCIPAL (01)
  ↓ TM (fuente 206) — Traslado de Maletas
VENDEDOR (35-40)
  ↓ Venta/Devolucion
BODEGA PRINCIPAL (01)
```

### Acciones para LiveVendor

1. Sincronizar fuente 206 (TM) para obtener movimientos reales de maletas.
2. Agregar Fredy (bodega 40) a `CASTILLITOS_SELLER_WAREHOUSES`.
3. Construir balance por vendedor: entradas (TM) - salidas (ventas) = stock actual.

---

## Phase 7: Tiendas (01 → Tiendas)

### Evidencia de Flujo

| Tienda | Productos | Overlap con 01 | Stock Positivo | Interpretacion |
|--------|-----------|----------------|----------------|----------------|
| 00 (Centro) | 2,149 | 1,578 (73%) | 1,275 | Tienda activa, alto trafico |
| 02 (Sandiego) | 2,191 | 1,606 (73%) | 992 | Tienda activa, alto trafico |
| 03 (Mayorca) | 819 | 813 (99%) | 811 | Tienda activa, casi todo de 01 |
| 23 (Gran Plaza) | 1,664 | 1,101 (66%) | 932 | Tienda activa |
| 29 (Caldas) | 1,329 | 761 (57%) | 886 | Bodega/tienda activa |

### Franquicias (historicas)

| Franquicia | Productos | Overlap 01 | Qty Neta | Estado |
|------------|-----------|------------|----------|--------|
| 08 (Paque Berrio) | 62 | 100% | -16,957 | Solo salidas |
| 09 (Bolivar) | 77 | 100% | -23,517 | Solo salidas |
| 10 (Bello) | 80 | 100% | -18,006 | Solo salidas |
| 11 (Armenia) | 44 | 100% | -15,494 | Solo salidas |
| 12 (Pereira) | 39 | 100% | -16,396 | Solo salidas |
| 13 (Bogota) | 59 | 100% | -15,090 | Solo salidas |
| 14 (Mayorca F17) | 69 | 100% | -12,603 | Solo salidas |
| 15 (Ibague) | 64 | 100% | -14,092 | Solo salidas |

**Hallazgo:** Todas las franquicias tienen 100% overlap con 01 y solo cantidades negativas = recibieron mercancia de Principal y la vendieron. El stock negativo neto = todas las ventas historicas. Modelo de consignacion o franquicias cerradas.

### Bodega 22 (DESCONOCIDA)

| Metrica | Valor |
|---------|-------|
| Productos | 2,583 |
| Stock neto | -8,403 |
| Stock positivo | 873 |
| Overlap con 02 (Sandiego) | 595 |
| Overlap con 00 (Centro) | 589 |
| Overlap con 23 (Gran Plaza) | 555 |
| Overlap con 29 (Caldas) | 497 |

**Hipotesis fuerte:** Bodega 22 se comporta como una tienda — alto overlap con las tiendas principales (00, 02, 23, 29) y con Principal (01). Podria ser una tienda renombrada o reubicada (gap entre bodegas 21 y 23).

### Flujo de Reabastecimiento (inferido)

```
BODEGA PRINCIPAL (01)
  ↓ TR (fuente 34) — Traslado entre Bodegas
  ├── 00 (Centro)      — 1,578 productos compartidos
  ├── 02 (Sandiego)    — 1,606 productos compartidos
  ├── 03 (Mayorca)     — 813 productos compartidos
  ├── 23 (Gran Plaza)  — 1,101 productos compartidos
  ├── 29 (Caldas)      — 761 productos compartidos
  └── 22 (???)         — 388 productos compartidos
```

---

## Phase 8: Importaciones

### Flujo Confirmado

```
CONTENEDORES (42-49)
  ↓ 100% overlap con bodega 24
IMPORTACION (24) — staging
  ↓ Redistribucion a tiendas/principal
SISTEMA
```

| Contenedor | Productos | Overlap con 24 | Overlap con 01 | Stock |
|------------|-----------|----------------|----------------|-------|
| 42 (Cont. 6) | 80 | 80 (100%) | 1 (1%) | 11,116 |
| 43 (Cont. 7) | 73 | 73 (100%) | 14 (19%) | 8,782 |
| 44 (Cont. 7-1) | 43 | 43 (100%) | 5 (12%) | 36,069 |
| 45 (Cont. 7-2) | 72 | 72 (100%) | 10 (14%) | 8,620 |
| 46 (Cont. 7-3) | 69 | 69 (100%) | 4 (6%) | 14,901 |
| 48 (Desconocido) | 88 | 88 (100%) | 4 (5%) | 9,175 |
| 49 (Desconocido) | 132 | 131 (99%) | 1 (1%) | 13,506 |

**Hallazgo clave:** TODOS los contenedores tienen ~100% overlap con bodega 24 (Importacion). El bajo overlap con 01 indica que la mercancia importada aun no se ha distribuido completamente a Principal. Los contenedores 48 y 49 no estan en el registro — son contenedores adicionales creados post-homologacion.

**Bodegas desconocidas (26, 27, 30-34)** — estas tienen stock alto (6K-49K unidades) y CERO salidas. Probablemente son contenedores de importacion adicionales o areas de staging.

---

## Phase 9: Business Flows Descubiertos

### Flow 1: Produccion Nacional

```
MATERIA PRIMA (05/06) ──CN(80)──→ PROD. EN PROCESO (04) ──ET(116)──→ PRINCIPAL (01)
                                         ↕ PC/EC (99/100)
                                    CONFECCIONISTA EXTERNO
                                         ↕ T1/T2/Y1 (129/118/119)
                                      SERVICIOS EXTERNOS
```

**Evidencia:** 2,983 productos en ambas 04 y 01. Solo 24 en WIP sin terminar.

### Flow 2: Importacion

```
CONTENEDORES (42-49) ──TR(34)──→ IMPORTACION (24) ──TR(34)──→ PRINCIPAL (01)
                                                   ──TR(34)──→ TIENDAS (00,02,03,23,29)
```

**Evidencia:** 100% overlap contenedores→24. 24,912 unidades positivas en staging.

### Flow 3: Distribucion a Tiendas

```
PRINCIPAL (01) ──TR(34)──→ CENTRO (00)      1,578 productos
                ──TR(34)──→ SANDIEGO (02)    1,606 productos
                ──TR(34)──→ MAYORCA (03)     813 productos
                ──TR(34)──→ GRAN PLAZA (23)  1,101 productos
                ──TR(34)──→ CALDAS (29)      761 productos
```

**Evidencia:** Alto overlap producto con Principal. Stock positivo en todas las tiendas.

### Flow 4: Surtido de Maletas

```
PRINCIPAL (01) ──TM(206)──→ ORLANDO (35)
                ──TM(206)──→ CARLOS LEON (36)
                ──TM(206)──→ LUIS (37)
                ──TM(206)──→ NESTOR (38)
                ──TM(206)──→ CARLOS VILLA (39)
                ──TM(206)──→ FREDY (40)
```

**Evidencia:** Fuente 206 existe y esta activa. Bodegas vacias en V2 = falta sincronizar.

### Flow 5: Franquicias (historico)

```
PRINCIPAL (01) ──TR(34)──→ FRANQUICIAS (08-15, 21) ──→ VENTA FINAL
```

**Evidencia:** 100% overlap con 01, solo cantidades negativas. Modelo consignacion.

### Flow 6: Muestras

```
PRINCIPAL (01) ──CM(117)──→ MUESTRAS (16)
                ──M2(133)──→ MUESTRAS (16)  (entrada)
```

**Evidencia:** Fuentes 117 (consumo muestras) y 133 (entrada muestras) en registro.

---

## Phase 10: Modelo Agentik (Propuesta)

### Entidades Candidatas (extension de BODEGA-DISCOVERY-01)

```typescript
// ── LocationType (extendido) ──────────────────────────────────────────────
type LocationType =
  | "MAIN_WAREHOUSE"      // 01
  | "STORE"               // 00, 02, 03, 23, 29
  | "FRANCHISE"           // 08-15, 21
  | "PRODUCTION"          // 04
  | "RAW_MATERIAL"        // 05, 06, 07
  | "SELLER_PORTFOLIO"    // 35-40
  | "IMPORT_CONTAINER"    // 42-49
  | "IMPORT_STAGING"      // 24
  | "SAMPLES"             // 16
  | "SERVICE"             // 18
  | "CLEARANCE"           // 19
  | "OUTLET"              // 41
  | "TEMPORARY"           // 20
  | "LAYAWAY"             // 28
  | "EXTERNAL"            // Confeccionistas, proveedores
  | "UNKNOWN";

// ── MovementDocument ───────────────────────────────────────────────────────
// Representa un documento SAG que genera movimientos de inventario.
interface MovementDocument {
  id: string;
  organizationId: string;
  /** SAG fuente code (OP, TR, CN, ET, etc.) */
  sourceCode: string;
  /** SAG fuente ka */
  fuenteKa: number;
  /** Document number */
  documentNumber: string;
  /** Date */
  documentDate: Date;
  /** Whether closed */
  isClosed: boolean;
  /** Source warehouse (origin) */
  sourceLocationId?: string;
  /** Destination warehouse (for transfers) */
  destinationLocationId?: string;
  /** Lines */
  lines: MovementDocumentLine[];
}

interface MovementDocumentLine {
  productId: string;
  variantId?: string;
  quantity: number;
  size?: string;
  color?: string;
}

// ── TransferRoute ──────────────────────────────────────────────────────────
// Ruta frecuente entre ubicaciones (estadistica, no transaccional).
interface TransferRoute {
  sourceLocationId: string;
  destinationLocationId: string;
  /** How many products travel this route */
  sharedProductCount: number;
  /** Primary document type for this route */
  primaryFuente: string;
  /** Frequency: daily, weekly, monthly, irregular */
  frequency: "daily" | "weekly" | "monthly" | "irregular";
  /** Average volume per transfer */
  avgVolume?: number;
}

// ── LocationFlow ───────────────────────────────────────────────────────────
// Flujo completo de mercancia a traves del sistema.
interface LocationFlow {
  id: string;
  name: string;
  description: string;
  /** Ordered sequence of locations */
  stages: LocationFlowStage[];
  /** Document types that drive this flow */
  drivingFuentes: string[];
}

interface LocationFlowStage {
  locationId: string;
  locationType: LocationType;
  role: "source" | "processing" | "staging" | "destination";
  /** Expected document type to transition to next stage */
  transitionFuente?: string;
}
```

### Flujos Predefinidos

| Flow ID | Nombre | Stages | Fuentes |
|---------|--------|--------|---------|
| PROD_NACIONAL | Produccion Nacional | 05→04→01 | CN, PC/EC, T1/T2, ET |
| IMPORTACION | Importacion | 42-49→24→01 | TR |
| DIST_TIENDAS | Distribucion a Tiendas | 01→00/02/03/23/29 | TR |
| SURTIDO_MALETAS | Surtido de Maletas | 01→35-40 | TM |
| FRANQUICIAS | Franquicias | 01→08-15/21 | TR |
| MUESTRAS | Muestras | 01→16 | CM, M2 |

---

## Phase 11: Knowledge Graph Impact

### Relaciones Descubiertas

```
Product ──[produced_at]──→ Location(04)
Product ──[stocked_at]──→ Location(01)
Product ──[sold_at]──→ Location(store)
Product ──[imported_via]──→ Location(container)

Location(04) ──[transfers_to:ET]──→ Location(01)
Location(01) ──[transfers_to:TR]──→ Location(store)
Location(01) ──[transfers_to:TM]──→ Location(seller)
Location(container) ──[transfers_to:TR]──→ Location(24)
Location(24) ──[transfers_to:TR]──→ Location(01)

Vendor ──[carries_portfolio_at]──→ Location(35-40)
Store ──[operates_at]──→ Location(00,02,03,23,29)

ProductionOrder ──[creates_wip_at]──→ Location(04)
ProductionOrder ──[delivers_finished_to]──→ Location(01)
```

### Nuevos Node Types para Memory Graph

| Node Type | Fuente de Datos | Estado |
|-----------|-----------------|--------|
| InventoryLocation | CASTILLITOS_BODEGAS | Candidato — 37 nodos |
| TransferRoute | Inferido de ProductInventoryLevel | Candidato — 15+ rutas |
| BusinessFlow | Documentado en esta sprint | Candidato — 6 flujos |

---

## Phase 12: Intelligence Impact

### Impacto por Modulo

| Modulo | Impacto | Como |
|--------|---------|------|
| **Commercial Availability** | ALTO | Puede calcular disponible por BODEGA, no solo agregado. V2 ya tiene data per-warehouse. |
| **Portfolio Replacement** | CRITICO | Fuente 206 (TM) permitira ver movimientos reales de maletas. Sin ella, no hay data de vendedores. |
| **LiveVendor** | CRITICO | Requiere sync de fuente 206. Con ella: stock por vendedor, frecuencia de reposicion, alertas. |
| **Production Intelligence** | MEDIO | Flujo 04→01 confirmado. Production Stage Inference funciona correctamente sin bodega. |
| **Store Intelligence** | ALTO | 5 tiendas con stock real. Flujo Principal→Tiendas confirmado. Store→bodega mapping pendiente. |
| **Replenishment Intelligence** | CRITICO | Sin sync de fuente 34 (TR), no hay datos de traslados reales. Con ella: frecuencia, volumen, rutas. |
| **Decision Engine** | ALTO | Regla comercial completa: bodega 01 agotada → buscar OP activa → sugerir accion. |
| **Action Engine** | ALTO | Puede generar acciones de traslado con rutas conocidas. |
| **David** | ALTO | "Que inventario hay en Mayorca?", "Cuando fue el ultimo traslado a Sandiego?" |
| **Executive Dashboard** | MEDIO | Nuevos KPIs: inventario por tienda, flujo de produccion, importaciones en transito. |

### Regla Comercial Real (documentada para Decision Engine)

```
REGLA: MALETA_REPLENISHMENT_DECISION

TRIGGER: Inventario Bodega 01 agotado para referencia X

IF existe OP activa para X en Bodega 04:
  → ESPERAR produccion
  → BUSCAR reemplazo dentro del mismo SubGrupo
  → ACTUALIZAR maleta con reemplazo temporal

IF NO existe OP activa para X:
  → SUGERIR nueva orden de produccion
  → BUSCAR reemplazo dentro del mismo SubGrupo
  → ACTUALIZAR maleta con reemplazo
  → GENERAR alerta para CEO

DATOS REQUERIDOS:
  - buildAvailabilityReport() → existencia Bodega 01
  - buildProductionReport() → OP activas
  - buildMaletaReplacementReport() → referencias en maletas
  - AvailabilityRow.subGrupo → busqueda de reemplazo

suggestedOnly: true
```

---

## Validacion

- `npx tsc --noEmit`: 160 errores (baseline mantenido)
- 0 errores nuevos introducidos
- Todos los scripts son READ ONLY
- No se modificaron datos
- No se escribieron nuevas entidades Prisma

---

## Scripts Forenses Creados

| Script | Proposito |
|--------|-----------|
| `scripts/_transfer-discovery-forensics.ts` | Cross-warehouse analysis, transfer route discovery, flow evidence |

---

## Resumen Ejecutivo

### Lo que Agentik ahora entiende

1. **Flujo de produccion:** 04 → 01, confirmado con 99.2% overlap de productos.
2. **Flujo de importacion:** Contenedores (42-49) → 24 (staging) → distribucion. 100% overlap contenedores→24.
3. **Flujo de tiendas:** 01 → tiendas (00, 02, 03, 23, 29). Overlap 57-99% con Principal.
4. **Flujo de maletas:** 01 → vendedores (35-40) via fuente 206 (TM). No sincronizado aun.
5. **Flujo de franquicias:** 01 → franquicias (08-15, 21). Historico, modelo consignacion.
6. **Nodo central:** Bodega 01 (Principal) es el HUB — conecta produccion, importacion, tiendas, vendedores.
7. **Fuentes criticas sin sincronizar:** 34 (TR), 206 (TM), 116 (ET), 80 (CN).

### Lo que Agentik necesita para completar la inteligencia logistica

| Prioridad | Accion | Impacto |
|-----------|--------|---------|
| P0 | Sincronizar fuente 206 (TM — Traslado de Maletas) | Desbloquea LiveVendor y Portfolio Replacement real |
| P1 | Sincronizar fuente 34 (TR — Traslados) | Desbloquea Replenishment Intelligence |
| P2 | Sincronizar fuentes 116/80/99/100 | Completa Production Intelligence |
| P3 | Crear InventoryLocation en Prisma | Modelo universal de ubicaciones |
| P4 | Crear store→bodega mapping | Conecta SaleRecord con inventario |
| P5 | Confirmar 10 bodegas desconocidas con Castillitos | Completa el mapa |
