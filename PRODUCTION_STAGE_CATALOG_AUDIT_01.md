# PRODUCTION-STAGE-CATALOG-AUDIT-01

**Sprint:** PRODUCTION-STAGE-CATALOG-AUDIT-01
**Date:** 2026-06-29
**Type:** READ ONLY / ARCHITECTURE AUDIT
**TSC Baseline:** 160 (no code modified)
**Prerequisite:** PRODUCTION-STAGE-ACTIVATION-01

---

## Pregunta Central

> El catalogo actual de ProductionStage es suficientemente universal para convertirse en la base del modulo principal Produccion de Agentik?

---

## FASE 1 — CATALOGO ACTUAL COMPLETO

### 15 Etapas Canonicas

| # | code | label | category | order | isRequired | isTerminal | allowsReentry | evidencia actual | transforma producto | afecta costo | afecta inventario | observable hoy | universal vs especifica |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `production_order` | Orden de Produccion | PLANNING | 0 | Si | No | No | 3,376 OP (SAG f33) | No | No | No | Si (OP synced) | UNIVERSAL |
| 2 | `material_allocation` | Reserva de Material | PLANNING | 1 | No | No | No | Ninguna | No | No | Si (reserva) | No | UNIVERSAL |
| 3 | `material_consumption` | Consumo de Materiales | TRANSFORMATION | 2 | Si | No | No | 7,890 CN (SAG f80) | No | Si | Si (retiro MP) | Si (CN synced) | UNIVERSAL |
| 4 | `cutting` | Corte | TRANSFORMATION | 3 | No | No | No | Ninguna (ERP-invisible) | Si | Si | No | No | UNIVERSAL (textil, metal, alimentos) |
| 5 | `printing` | Estampacion | TRANSFORMATION | 4 | No | No | No | Ninguna (ERP-invisible) | Si | Si | No | No | Textil-sesgada, pero universal como "decoracion" |
| 6 | `embroidery` | Bordado | TRANSFORMATION | 5 | No | No | No | Ninguna (ERP-invisible) | Si | Si | No | No | TEXTIL-ESPECIFICA |
| 7 | `external_manufacturing` | Confeccion Externa | EXTERNAL | 6 | No | No | Si | 296 PC (SAG f99, NO synced) | Si | Si | Si | No (provisional) | UNIVERSAL |
| 8 | `assembly` | Ensamble | EXTERNAL | 7 | No | No | No | Ninguna (ERP-invisible) | Si | Si | No | No | UNIVERSAL |
| 9 | `third_party_services` | Servicios de Terceros | EXTERNAL | 8 | No | No | Si | 18,197 T1/T2/Y1 (SAG f129/f118/f119, NO synced) | Si | Si | No | No (provisional) | UNIVERSAL |
| 10 | `finishing` | Acabados | CONTROL | 9 | No | No | No | Ninguna (ERP-invisible) | Si | Si | No | No | UNIVERSAL |
| 11 | `quality_control` | Control de Calidad | CONTROL | 10 | No | No | Si | Ninguna | No | No | No | No | UNIVERSAL |
| 12 | `packaging` | Empaque | LOGISTICS | 11 | No | No | No | Ninguna (ERP-invisible) | Si | Si | No | No | UNIVERSAL |
| 13 | `finished_goods_entry` | Entrada Producto Terminado | LOGISTICS | 12 | Si | No | No | 3,640 ET (SAG f116) | No | No | Si (WIP->PT) | Si (ET synced) | UNIVERSAL |
| 14 | `warehouse_transfer` | Traslado de Bodega | LOGISTICS | 13 | No | No | No | 8,320 MV (SAG f115, NO synced) | No | No | Si | No (provisional) | UNIVERSAL |
| 15 | `commercially_available` | Disponible Comercial | COMMERCIAL | 14 | No | Si | No | Ninguna | No | No | No | No | UNIVERSAL |

### Resumen de Observabilidad

| Estado | Etapas | Porcentaje |
|---|---|---|
| Observable hoy (synced) | production_order, material_consumption, finished_goods_entry | 3/15 (20%) |
| Observable provisional (NO synced) | external_manufacturing, third_party_services, warehouse_transfer | 3/15 (20%) |
| No observable (ERP-invisible) | 9 etapas restantes | 9/15 (60%) |

### Hallazgo F1-01 (Positivo)

Las 3 etapas observables hoy (OP, CN, ET) corresponden exactamente a los 3 pilares del ciclo productivo: planificacion, transformacion, y logistica de entrada. Son suficientes para un modulo minimo viable.

### Hallazgo F1-02 (Critico)

`embroidery` es la UNICA etapa textil-especifica. Todas las demas son universales o tienen interpretacion industrial generica. Esto es un riesgo menor pero debe documentarse: un fabricante de electronica no tiene "bordado", pero si puede tener "decoracion" o "acabado superficial". La etapa se justifica porque Castillitos la usa como branch alternativa a `printing`.

### Hallazgo F1-03 (Observacion)

El campo `isRequired` no existe en `ProductionStageDefinition`. El design doc (PRODUCTION-STAGE-DOMAIN-01) lo define, pero la implementacion solo tiene `erpObservable`. Los campos `isTerminal`, `allowsReentry`, `allowsSkip`, `transformsProduct`, `affectsInventory`, `generatesCost`, `requiresExternalParty`, `isQualityGate` del design doc tampoco fueron implementados.

**Impacto:** Bajo a mediano. Estos campos son necesarios para Production Control Center v2 (bottleneck analysis, SLA, capacity planning) pero no para la activacion actual. Pueden agregarse incrementalmente.

---

## FASE 2 — AUDITORIA DE TAXONOMIA

### Categorias Actuales

| Categoria | Etapas | Cubre |
|---|---|---|
| PLANNING | production_order, material_allocation | Planificacion |
| TRANSFORMATION | material_consumption, cutting, printing, embroidery | Materiales + transformacion |
| EXTERNAL | external_manufacturing, assembly, third_party_services | Servicios externos |
| CONTROL | finishing, quality_control | Control |
| LOGISTICS | packaging, finished_goods_entry, warehouse_transfer | Logistica |
| COMMERCIAL | commercially_available | Comercial |

### Validacion contra Requisitos

| Requisito | Categoria actual | Veredicto |
|---|---|---|
| Planificacion | PLANNING | OK |
| Materiales | TRANSFORMATION (material_consumption) | OK — pero material_consumption no "transforma" producto, solo retira MP |
| Transformacion | TRANSFORMATION (cutting, printing, embroidery) | OK |
| Servicios externos | EXTERNAL | OK |
| Control | CONTROL | OK |
| Logistica | LOGISTICS | OK |
| Comercial | COMMERCIAL | OK |

### Hallazgo F2-01 (Critico)

**`material_consumption` esta mal categorizado como TRANSFORMATION.** Consumir materiales no transforma el producto — solo retira materia prima de bodega. Es un acto logistico/de preparacion. Sin embargo, en el flujo productivo tipico, el consumo de materiales es el primer paso de la transformacion fisica (retiras materiales PARA transformar). La decision de colocarlo en TRANSFORMATION se justifica operacionalmente aunque no sea semanticamente puro.

**Recomendacion:** Aceptar como esta. Una categoria separada "MATERIALS" seria sobre-ingenieria para un solo miembro. Si en el futuro se agregan `material_allocation` y `material_return`, reconsiderar.

### Hallazgo F2-02 (Observacion)

**`finishing` esta en CONTROL, pero es TRANSFORMATION segun el design doc.** El design doc (Phase 3) clasifica `finishing` como TRANSFORMATION (transforma producto: Si). La implementacion lo coloca en CONTROL.

**Impacto:** Inconsistencia entre design doc y codigo. El acabado si transforma el producto fisicamente (planchado, recorte, etiquetado). Deberia ser TRANSFORMATION.

### Hallazgo F2-03 (Observacion)

**`packaging` esta en LOGISTICS, pero es TRANSFORMATION segun el design doc.** El design doc clasifica `packaging` como TRANSFORMATION (transforma producto: Si — forma final). La implementacion lo coloca en LOGISTICS.

**Impacto:** Similar a F2-02. Empacar transforma la forma final del producto. Deberia ser TRANSFORMATION. Sin embargo, logisticamente el empaque es la transicion entre transformacion y despacho, asi que LOGISTICS no es incorrecto. Ambiguo.

### Hallazgo F2-04 (Positivo)

**No faltan categorias.** Las 6 categorias cubren el 100% de las fases productivas universales. No se necesita una categoria MATERIALS separada ni QUALITY separada de CONTROL.

---

## FASE 3 — AUDITORIA DE PERFILES

### 6 Perfiles Actuales

#### 1. textile_full

| Atributo | Valor |
|---|---|
| Etapas | 12 (production_order, material_allocation, material_consumption, cutting, printing, embroidery, external_manufacturing, third_party_services, finishing, quality_control, packaging, finished_goods_entry) |
| Etapas observables | 5 (production_order, material_consumption, external_manufacturing, third_party_services, finished_goods_entry) |
| Etapas requeridas | No definidas (falta campo requiredStages en ProductionProfile) |
| Flujo esperado | OP -> CN -> [cutting -> decoration] -> ext_mfg -> services -> finishing -> QC -> packaging -> ET |
| Empresa objetivo | Castillitos, textileras con confeccion externa |
| Multi-ERP | Si (SAG, Odoo, SAP) |
| Riesgo | `assembly` NO esta incluido pero SI esta en el design doc PRODUCTION-STAGE-DOMAIN-01 Phase 6 para textile_full |

#### 2. textile_basic

| Atributo | Valor |
|---|---|
| Etapas | 7 (production_order, material_consumption, cutting, finishing, quality_control, packaging, finished_goods_entry) |
| Etapas observables | 3 (production_order, material_consumption, finished_goods_entry) |
| Empresa objetivo | Pequeños fabricantes textiles, produccion interna |
| Multi-ERP | Si (Siigo, Alegra — ERPs de 3 etapas) |
| Riesgo | Ninguno significativo |

#### 3. external_manufacturing

| Atributo | Valor |
|---|---|
| Etapas | 5 (production_order, material_consumption, external_manufacturing, third_party_services, finished_goods_entry) |
| Etapas observables | 5 (todas) |
| Empresa objetivo | Empresas que subcontratan toda la manufactura |
| Multi-ERP | Si |
| Riesgo | Ninguno |

#### 4. import_reception

| Atributo | Valor |
|---|---|
| Etapas | 4 (production_order, finished_goods_entry, warehouse_transfer, commercially_available) |
| Etapas observables | 3 (production_order, finished_goods_entry, warehouse_transfer) |
| Empresa objetivo | Importadores de producto terminado |
| Multi-ERP | Si |
| Riesgo | `production_order` puede no aplicar a importadores puros (usan ordenes de compra, no de produccion) |

#### 5. contract_manufacturing

| Atributo | Valor |
|---|---|
| Etapas | 7 (production_order, material_consumption, cutting, assembly, quality_control, packaging, finished_goods_entry) |
| Etapas observables | 3 (production_order, material_consumption, finished_goods_entry) |
| Empresa objetivo | Maquiladores |
| Multi-ERP | Si |
| Riesgo | Ninguno |

#### 6. custom

| Atributo | Valor |
|---|---|
| Etapas | 15 (todas) |
| Etapas observables | 6 (todas las erpObservable=true) |
| Empresa objetivo | Cualquiera |
| Multi-ERP | Si |
| Riesgo | Demasiadas etapas SKIPPED pueden confundir |

### Hallazgo F3-01 (Critico)

**`ProductionProfile` no tiene `requiredStages` ni `optionalStages`.** El design doc (PRODUCTION-STAGE-DOMAIN-01 Phase 6) especifica ambos campos. La implementacion solo tiene `stages` y `observableStages`. Esto impide distinguir etapas que DEBEN ocurrir de etapas que PUEDEN ocurrir, lo cual es fundamental para gap detection y alerting.

**Impacto:** Alto para Production Control Center v2. Sin `requiredStages`, el sistema no puede generar alertas cuando una etapa obligatoria no se observa.

### Hallazgo F3-02 (Observacion)

**textile_full no incluye `assembly`**, pero el design doc lo lista como etapa activa. Esto es probablemente correcto — en Castillitos, `assembly` (confeccion) sucede en `external_manufacturing`. Pero para un textilero con confeccion INTERNA, `assembly` deberia estar en el perfil.

**Recomendacion:** Agregar `assembly` a textile_full como etapa opcional no-observable, entre `external_manufacturing` y `third_party_services`.

### Hallazgo F3-03 (Positivo)

**Los 6 perfiles cubren los 5 modelos de negocio principales** (textil completo, textil basico, manufactura externa, importacion, maquila) mas un perfil personalizable. Es un set inicial solido.

### Hallazgo F3-04 (Observacion)

**import_reception usa `production_order` como primera etapa.** Un importador no produce — compra. Usar `production_order` es semanticamente dudoso. Sin embargo, desde la perspectiva del flujo logistico de Agentik, toda entrada de producto terminado necesita una "orden" de referencia, asi que es aceptable como abstraccion.

---

## FASE 4 — AUDITORIA DE ACTIVATION RULES

### 12 Reglas Actuales

| # | eventType | sourceDocumentType | activatesStage | evidencia | confianza | universal | depende de SAG |
|---|---|---|---|---|---|---|---|
| 1 | PRODUCTION_ORDER_CREATED | null (any) | production_order | 3,376 OP | confirmed | Si | No |
| 2 | PRODUCTION_ORDER_UPDATED | null | production_order | 0 (no synced) | inferred | Si | No |
| 3 | MATERIAL_RESERVED | null | material_allocation | 0 | provisional | Si | No |
| 4 | MATERIAL_CONSUMED | null | material_consumption | 7,890 CN | confirmed | Si | No |
| 5 | EXTERNAL_SERVICE_STARTED | null | external_manufacturing | 296 PC (no synced) | provisional | Si | No |
| 6 | EXTERNAL_SERVICE_COMPLETED | null | third_party_services | 296 EC (no synced) | provisional | Si | No |
| 7 | PRODUCTION_MOVED_STAGE | null | third_party_services | 18,197 T1/T2/Y1 (no synced) | provisional | Parcial | Parcial (T1/T2/Y1 son SAG-especificos) |
| 8 | PRODUCTION_COMPLETED | null | finished_goods_entry | 3,640 ET | confirmed | Si | No |
| 9 | FINISHED_GOODS_RECEIVED | null | finished_goods_entry | 0 (inactive) | provisional | Si | No |
| 10 | PRODUCTION_TRANSFERRED | null | warehouse_transfer | 8,320 MV (no synced) | provisional | Si | No |
| 11 | QUALITY_CHECK_STARTED | null | quality_control | 0 | provisional | Si | No |
| 12 | QUALITY_CHECK_COMPLETED | null | quality_control | 0 | provisional | Si | No |

### Hallazgo F4-01 (Critico)

**Regla 7 (PRODUCTION_MOVED_STAGE -> third_party_services) es demasiado generica.** `PRODUCTION_MOVED_STAGE` es un evento catch-all para cualquier movimiento entre etapas. Mapearlo siempre a `third_party_services` es incorrecto para ERPs que emiten este evento para otros movimientos (ej: Odoo CO11N para cualquier operacion, SAP confirmacion de operacion interna).

**Impacto:** Alto. Un ERP rico en operaciones (Odoo, SAP) podria tener PRODUCTION_MOVED_STAGE para corte, ensamble, acabados, etc. La regla actual los mapearia todos a `third_party_services`.

**Recomendacion:** Esta regla deberia usar el `sourceDocumentType` filter para discriminar, o confiar en `stageFrom`/`stageTo` del evento en lugar de una regla estatica. Alternativa: remover esta regla generica y requerir reglas especificas por tenant/ERP.

### Hallazgo F4-02 (Observacion)

**Regla 6 (EXTERNAL_SERVICE_COMPLETED -> third_party_services) puede ser contra-intuitiva.** Cuando un servicio externo se completa, la etapa que se "activa" es `third_party_services`. Pero semanticamente, la completacion de un servicio externo deberia COMPLETAR `external_manufacturing` y ACTIVAR la siguiente etapa. La regla actual trata `third_party_services` como una etapa separada de `external_manufacturing`, lo cual es correcto para Castillitos (PC sale, EC regresa, luego T1/T2/Y1 son servicios adicionales) pero puede confundir en otros modelos.

**Impacto:** Bajo. La semantica es correcta para el modelo actual.

### Hallazgo F4-03 (Positivo)

**11 de 12 reglas son ERP-agnosticas.** No usan `sourceDocumentType` filter, lo que las hace universales. Solo la regla 7 tiene problemas de universalidad, y es por ser demasiado generica, no por ser SAG-especifica.

### Hallazgo F4-04 (Observacion)

**No existe regla para PRODUCTION_STARTED.** El evento `PRODUCTION_STARTED` (fuente 114, "Producto en proceso") no tiene regla de activacion. Solo tiene 1 movimiento y 248 lineas en SAG, pero deberia mapearse a alguna etapa (probablemente `material_consumption` o una nueva etapa `work_in_progress`).

**Impacto:** Bajo para Castillitos (1 solo movimiento). Medio para otros ERPs que si emiten este evento frecuentemente.

### Hallazgo F4-05 (Positivo)

**Las reglas no usan IDs de SAG ni codigos de fuente.** Todas operan sobre `ProductionEventType` universales. La capa de adaptacion SAG->Event->Stage esta correctamente separada.

---

## FASE 5 — VALIDACION CONTRA CASTILLITOS

### Realidad Observada

| Etapa Castillitos | Codigo canonico | Evidencia | Estado |
|---|---|---|---|
| Orden de Produccion | production_order | 3,376 OP synced | Observable por datos |
| Consumo de Insumos | material_consumption | 7,890 CN synced, 81,367 lineas | Observable por datos |
| Confeccion Externa (salida) | external_manufacturing | 296 PC en SAG, NO synced | Conocido por negocio, no observable |
| Confeccion Externa (regreso) | third_party_services | 296 EC + 18,197 T1/T2/Y1 en SAG, NO synced | Conocido por negocio, no observable |
| Entrada Producto Terminado | finished_goods_entry | 3,640 ET synced | Observable por datos |
| Traslado a Bodega 01 | warehouse_transfer | 8,320 MV en SAG, NO synced | Conocido por negocio, no observable |

### Etapas NO Observables en Castillitos

| Etapa | Estado | Razon |
|---|---|---|
| material_allocation | No existe en SAG | SAG PYA no tiene reserva explicita |
| cutting | Inferible por flujo | Ocurre entre CN y PC, SAG no lo registra |
| printing | Conocido por negocio | Branch opcional en produccion Castillitos |
| embroidery | Conocido por negocio | Branch alternativo a printing |
| assembly | Conocido por negocio | "Confeccion" — ocurre en external_manufacturing |
| finishing | Inferible por flujo | Ocurre entre EC y ET, SAG no lo registra |
| quality_control | No soportado | Castillitos no tiene QC formal en SAG |
| packaging | Inferible por flujo | Ocurre antes de ET, SAG no lo registra |
| commercially_available | No soportado | No hay evento SAG que lo marque |

### Hallazgo F5-01 (Positivo)

**El catalogo NO inventa etapas ficticias.** Las 15 etapas estan justificadas por evidencia arqueologica (PRODUCTION-STAGE-DOMAIN-01 Phase 1) o por conocimiento documentado del negocio. Ninguna etapa es especulativa.

### Hallazgo F5-02 (Positivo)

**La topologia de bodega esta correctamente representada.**
```
Bodega 14/15 (MP) --[CN]--> Bodega 04 (WIP) --[ET]--> Bodega 01 (PT)
```
Las etapas `material_consumption` (retiro de B14/15) y `finished_goods_entry` (entrada a B01) capturan exactamente las fronteras observables.

### Hallazgo F5-03 (Observacion)

**Bodega 04 (WIP) NO tiene etapa explicita.** El producto esta en Bodega 04 entre CN y ET. Esto es la zona de transformacion (cutting -> assembly -> finishing). No hay una etapa "work_in_process" en el catalogo.

**Impacto:** Bajo. WIP no es una etapa — es un estado. Las etapas cutting/assembly/finishing cubren LO QUE PASA en WIP. La bodega es una ubicacion, no una fase del proceso.

---

## FASE 6 — VALIDACION CONTRA OTROS MODELOS DE NEGOCIO

| Modelo | Etapas requeridas | Cubiertas? | Notas |
|---|---|---|---|
| Confeccion interna | OP, CN, cutting, assembly, finishing, packaging, ET | Si (textile_basic) | OK |
| Confeccion externa | OP, CN, ext_mfg, third_party, ET | Si (external_manufacturing) | OK |
| Maquila | OP, CN, cutting, assembly, QC, packaging, ET | Si (contract_manufacturing) | OK |
| Importacion | OP, ET, warehouse_transfer | Si (import_reception) | OK |
| Ensamblaje ligero | OP, CN, assembly, QC, ET | Si (custom) | No hay perfil dedicado |
| Fabricacion por pedido | OP, CN, cutting, assembly, finishing, ET | Si (textile_basic) | OK |
| Fabricacion por lote | OP, CN, [batch stages], ET | Parcial | Falta `batch_processing` |
| Manufactura sin inventario | OP, assembly, ET | Parcial | material_consumption no aplica |
| Manufactura con MP | OP, CN, [transformation], ET | Si | OK |

### Hallazgo F6-01 (Observacion)

**No hay etapa `batch_processing` ni `mixing`.** Industrias como alimentos, quimicos, o farmaceuticos usan procesamiento por lote (mezcla, coccion, reaccion) que no encaja en cutting/printing/embroidery. Sin embargo, estos modelos pueden usar el perfil `custom` con etapas personalizadas cuando se soporte la personalizacion de nombres.

**Impacto:** Bajo para Agentik 2026 (clientes textiles/manufactura ligera). Medio para expansion multi-industria.

### Hallazgo F6-02 (Positivo)

**Los 5 modelos de negocio principales estan cubiertos** por perfiles dedicados. Los modelos secundarios (ensamblaje ligero, manufactura sin inventario) funcionan con el perfil `custom`.

---

## FASE 7 — VALIDACION MULTI-ERP

| ERP | Etapas observables | Perfil recomendado | Compatible? | Riesgos |
|---|---|---|---|---|
| SAG PYA | OP, CN, PC/EC, T1/T2/Y1, ET, MV | textile_full | Si | Regla PRODUCTION_MOVED_STAGE demasiado generica |
| Siigo | Orden, Consumo, Entrada | textile_basic | Si | Solo 3 etapas — 80% del perfil sera SKIPPED/UNKNOWN |
| Alegra | Orden, Entrada | import_reception | Si | Solo 2 etapas — minimalista |
| Odoo | MO, Check Availability, Consume, Work Orders, Produce | textile_full | Si | PRODUCTION_MOVED_STAGE necesita discriminacion |
| SAP | CO01, MIGO-GI, CO11N, MIGO-GR | textile_full | Si | PRODUCTION_MOVED_STAGE necesita discriminacion |
| Business Central | Production Order, Consumption Journal, Output Journal | textile_basic | Si | Mapeo directo |
| Data Warehouse | fact_production_orders, fact_material_issues, fact_production_output | custom | Si | Configurable |

### Hallazgo F7-01 (Positivo)

**Ningun `code`, `label`, o `category` esta ligado a SAG o Castillitos.** Los identificadores son puramente universales. SAG-specific vocabulary (fuente, bodega, remision) vive exclusivamente en la capa de adaptacion.

### Hallazgo F7-02 (Critico — Reiteracion de F4-01)

**PRODUCTION_MOVED_STAGE es el unico punto de riesgo multi-ERP.** ERPs ricos (Odoo, SAP) emiten muchos eventos de tipo PRODUCTION_MOVED_STAGE para operaciones internas. La regla actual los mapea todos a `third_party_services`, lo cual es incorrecto.

**Solucion propuesta:** Usar `stageFrom`/`stageTo` del evento (ya disponible en ProductionTimelineEvent) en lugar de una regla estatica. Si `stageTo` coincide con un codigo canonico, activar esa etapa. Si no, ignorar. Esto haria la regla auto-adaptativa.

### Hallazgo F7-03 (Positivo)

**Los 7 ERPs pueden producir `ProductionEvent` sin cambios al catalogo.** La universalidad del catalogo esta validada: los codigos canonicos no necesitan cambios para soportar cualquier ERP listado.

---

## FASE 8 — AUDITORIA DE SKIPPED STAGES

### Mecanismo Actual

```typescript
// Non-observable stage with no evidence: check if surrounding stages have evidence
if (hasPredecessor && hasSuccessor) {
  return "SKIPPED";  // stages before AND after have evidence
}
return "UNKNOWN";
```

### Es correcto?

**Parcialmente.** La logica es razonable: si tienes evidencia ANTES y DESPUES de una etapa no-observable, esa etapa probablemente ocurrio. Pero "SKIPPED" es semanticamente incorrecto — "skipped" implica que la etapa fue deliberadamente omitida, cuando en realidad fue ATRAVESADA pero no observada.

### Cuando es peligroso?

| Escenario | Riesgo |
|---|---|
| Corte (entre CN y ET) | SKIPPED implica que no se corto, cuando en realidad si se corto pero SAG no lo registra |
| Quality Control | SKIPPED puede significar que NO se hizo QC (decision de negocio) o que se hizo pero no se registro. La diferencia es critica para compliance |
| Assembly | En external_manufacturing, assembly ocurre fuera de la planta. SKIPPED sugiere que no hubo ensamble, lo cual es falso |

### Debe existir INFERRED?

**Si, es recomendable.** La semantica correcta para "no-observable con evidencia circundante" es INFERRED (inferido), no SKIPPED.

### Debe diferenciarse SKIPPED de ASSUMED_TRAVERSED?

**Si.** Se necesitan al menos dos distinciones:

| Estado | Significado | Cuando usar |
|---|---|---|
| `SKIPPED` | Etapa deliberadamente omitida (decision de negocio) | Cuando el perfil marca la etapa como opcional Y no hay evidencia |
| `INFERRED` | Etapa probablemente atravesada pero no observable | Cuando hay evidencia antes y despues de la etapa |

### Hallazgo F8-01 (Critico)

**`SKIPPED` debe renombrarse a `INFERRED` para etapas no-observables con evidencia circundante.** El uso actual de SKIPPED es semanticamente engañoso. Un gerente de produccion que ve "Corte: SKIPPED" pensaria que no se corto el material, cuando en realidad se corto pero el ERP no lo registro.

**Recomendacion:** Agregar `INFERRED` al modelo de estados. `SKIPPED` se reserva para etapas que el perfil marca como opcionales y que efectivamente no ocurrieron (decision de negocio).

---

## FASE 9 — AUDITORIA DEL STATUS MODEL

### Estados Actuales

| Estado | Significado | Implementado |
|---|---|---|
| NOT_STARTED | Etapa en perfil, sin evidencia, observable | Si |
| ACTIVE | Tiene evidencia, sin sucesor con evidencia | Si |
| COMPLETED | Tiene evidencia, sucesor tiene evidencia | Si |
| SKIPPED | No-observable, con evidencia circundante | Si (pero semantica incorrecta — ver F8-01) |
| UNKNOWN | No-observable, sin evidencia circundante | Si |

### Estados Faltantes Evaluados

| Estado candidato | Necesario? | Justificacion |
|---|---|---|
| `INFERRED` | **Si** | Reemplaza el uso actual incorrecto de SKIPPED (ver F8-01) |
| `BLOCKED` | No (ahora) | Requiere SLA/gate logic. Futuro: Production Control Center v2 |
| `DELAYED` | No (ahora) | Requiere SLA con tiempos objetivo por etapa. Futuro |
| `WAITING_INPUT` | No | Demasiado granular para el nivel actual. Seria sub-estado de ACTIVE |
| `WAITING_EXTERNAL` | No | Subsumido por `external_manufacturing` + ACTIVE |
| `CANCELLED` | Si (futuro) | Necesario cuando se implementen OP canceladas. Ahora todos los eventos son status=active |

### Hallazgo F9-01 (Critico — Confirma F8-01)

**El modelo de estados necesita `INFERRED` antes de extraction a modulo principal.** Sin este estado, la UI de produccion mostraria informacion engañosa. Es el unico cambio de estados REQUERIDO antes de extraction.

### Hallazgo F9-02 (Observacion)

**`BLOCKED` y `DELAYED` son deseables pero no bloqueantes.** Requieren datos de SLA que aun no existen. Se pueden agregar incrementalmente cuando se construya el Control Center.

---

## FASE 10 — AUDITORIA DE METRICAS POR ETAPA

### Capacidad Actual

| Metrica | Soportado? | Como |
|---|---|---|
| Tiempo en etapa | Parcial | `durationDays` en ProductionActivatedStage (firstSeen a lastSeen) |
| Acumulacion WIP | No | Requiere conteo de OPs por etapa en un punto en el tiempo |
| Retrasos | No | Requiere SLA por etapa |
| Throughput | No | Requiere conteo de OPs completando etapa / periodo |
| Costos | No | material_consumption tiene costo (CN lines), pero no se propaga a la etapa activada |
| Unidades | No | Requiere quantity propagation desde ProductionEvent |
| Eficiencia | No | Requiere throughput + capacity |
| Cuello de botella | No | Requiere duration + accumulation + delay (3 señales) |

### Hallazgo F10-01 (Observacion)

**El catalogo SOPORTA metricas pero el engine no las computa todavia.** Las metricas definidas en PRODUCTION-STAGE-DOMAIN-01 Phase 8 (StageMetrics: wipCount, avgDurationDays, delayCount, throughputPerDay, utilizationRate, etc.) no estan implementadas. Esto es esperado — el sprint de metricas (PRODUCTION-STAGE-METRICS-01) es futuro.

### Hallazgo F10-02 (Critico)

**`durationDays` en ProductionActivatedStage mide duracion DENTRO de la evidencia, no tiempo real en etapa.** Si una etapa tiene 3 evidencias en 5 dias, `durationDays=5`. Pero el tiempo real en la etapa es desde que la etapa anterior completo hasta que esta etapa completo. Para eso se necesita `stageEntryDate` (fin de etapa anterior) y `stageExitDate` (inicio de etapa siguiente).

**Impacto:** Medio. Para Production Control Center, la duracion real por etapa es un KPI fundamental. La implementacion actual subestima la duracion de etapas con evidencia temprana.

### Hallazgo F10-03 (Positivo)

**La estructura de `ProductionStageEvidence` soporta trazabilidad completa.** Cada evidencia tiene `eventId`, `eventType`, `eventDate`, y `rule`. Esto permite drill-down desde una metrica de etapa hasta el evento fuente original.

---

## FASE 11 — PREPARACION PARA MODULO INDEPENDIENTE

### Evaluacion de Soportabilidad

| Capacidad requerida | Soportada? | Notas |
|---|---|---|
| Dashboard | Parcial | Metrics framework existe, pero falta WIP/throughput/bottleneck |
| OPs (ordenes) | Si | ProductionOrder + ProductionTimeline |
| Timeline | Si | ProductionTimeline con quality/profitability |
| Etapas | Si | ProductionStageActivation con progress/coverage/gap |
| Costos | Parcial | Material cost via CN, pero no propagado a etapas individuales |
| Cuellos de botella | No | Requiere PRODUCTION-STAGE-METRICS-01 |
| Alertas | No | Requiere SLA y anomaly detection |
| Capacidades futuras | Si | Profiles, custom rules, tenant config |
| Agente especializado | Parcial | Pablo existe como concepto, pero no como agente implementado |

### Hallazgo F11-01 (Positivo)

**La arquitectura pipeline es correcta y esta lista para extraction.**
```
ProductionEvent → ProductionTimeline → ProductionStageActivation → [ProductionControlCenter]
```
Cada capa consume la anterior sin acceso directo al ERP. La separation of concerns es limpia.

### Hallazgo F11-02 (Critico)

**3 cambios son REQUERIDOS antes de extraction a modulo principal:**

1. **Agregar `INFERRED` al modelo de estados** (F8-01, F9-01)
2. **Agregar `requiredStages` y `optionalStages` a ProductionProfile** (F3-01)
3. **Refinar regla PRODUCTION_MOVED_STAGE** para no mapear todo a third_party_services (F4-01)

### Hallazgo F11-03 (Observacion)

**5 cambios son DESEABLES pero no bloqueantes:**

1. Agregar campos enriquecidos a ProductionStageDefinition (isRequired, isTerminal, etc.) — F1-03
2. Reclasificar `finishing` como TRANSFORMATION — F2-02
3. Agregar `assembly` a textile_full — F3-02
4. Agregar regla para PRODUCTION_STARTED — F4-04
5. Computar duracion real por etapa (stageEntryDate/stageExitDate) — F10-02

---

## FASE 12 — RESUMEN

### Hallazgos Positivos (7)

| ID | Hallazgo |
|---|---|
| F1-01 | Las 3 etapas observables hoy son los 3 pilares del ciclo productivo |
| F2-04 | Las 6 categorias cubren el 100% de las fases productivas universales |
| F3-03 | Los 6 perfiles cubren los 5 modelos de negocio principales |
| F4-03 | 11/12 reglas son ERP-agnosticas |
| F4-05 | Las reglas no usan IDs de SAG ni codigos de fuente |
| F5-01 | El catalogo no inventa etapas ficticias |
| F7-01 | Ningun identificador esta ligado a SAG o Castillitos |

### Hallazgos Criticos (5)

| ID | Hallazgo | Bloqueante para extraction? |
|---|---|---|
| F3-01 | ProductionProfile no tiene requiredStages/optionalStages | SI |
| F4-01 | Regla PRODUCTION_MOVED_STAGE demasiado generica para multi-ERP | SI |
| F8-01 | SKIPPED debe ser INFERRED para etapas no-observables con evidencia circundante | SI |
| F9-01 | Modelo de estados necesita INFERRED | SI (confirma F8-01) |
| F10-02 | durationDays mide evidencia, no tiempo real en etapa | No (deseable) |

### Hallazgos Dudosos (3)

| ID | Hallazgo | Veredicto |
|---|---|---|
| F2-01 | material_consumption en TRANSFORMATION (no transforma producto) | Aceptar — operacionalmente correcto |
| F2-02 | finishing en CONTROL (deberia ser TRANSFORMATION) | Corregir si hay oportunidad |
| F3-04 | import_reception usa production_order (importadores no producen) | Aceptar — abstraccion valida |

### Riesgos

| # | Riesgo | Severidad | Mitigacion |
|---|---|---|---|
| R1 | SKIPPED engaña al usuario (sugiere omision deliberada) | Alta | Agregar INFERRED antes de UI |
| R2 | PRODUCTION_MOVED_STAGE rompe con ERPs ricos | Alta | Refinar regla o usar stageTo |
| R3 | Sin requiredStages, no se pueden generar alertas de etapas faltantes | Media | Agregar campo a ProductionProfile |
| R4 | 60% de etapas son ERP-invisibles — el perfil se vera mayormente SKIPPED/UNKNOWN | Media | Comunicar claramente en UI que son etapas internas no monitoreadas |
| R5 | embroidery es textil-especifica | Baja | Aceptar — perfil custom puede excluirla |
| R6 | No hay batch_processing para industrias de proceso | Baja | Custom profile. No es prioridad 2026 |

### Cambios Requeridos Antes de Production Domain Extraction

| # | Cambio | Complejidad | Impacto |
|---|---|---|---|
| C1 | Agregar `INFERRED` a ProductionStageStatus | Baja | Alto — semantica correcta |
| C2 | Actualizar determineStatus() para usar INFERRED en lugar de SKIPPED cuando no-observable + evidencia circundante | Baja | Alto — corrige la logica |
| C3 | Agregar `requiredStages` y `optionalStages` a ProductionProfile | Baja | Medio — habilita alerting |
| C4 | Refinar regla PRODUCTION_MOVED_STAGE: usar stageFrom/stageTo del evento si disponible, o requerir sourceDocumentType filter | Media | Alto — multi-ERP safety |

---

## VEREDICTO FINAL

# APPROVED WITH CHANGES

El catalogo actual de ProductionStage es **suficientemente universal** para convertirse en la base del modulo principal Produccion de Agentik.

**Las 15 etapas son correctas.** Las 6 categorias son completas. Los 6 perfiles cubren los modelos de negocio principales. Las reglas de activacion son mayoritariamente ERP-agnosticas. La arquitectura pipeline esta limpia.

**Pero 4 cambios son REQUERIDOS antes de extraction:**

1. Estado `INFERRED` (no confundir etapas no-observadas con etapas omitidas)
2. `requiredStages`/`optionalStages` en perfiles (necesario para alertas)
3. Regla PRODUCTION_MOVED_STAGE refinada (necesaria para multi-ERP)
4. `SKIPPED` reservado solo para etapas opcionales deliberadamente omitidas

Estos 4 cambios son de complejidad baja-media y no requieren cambios de Prisma, SAG, ni UI.

---

## TSC Validation

**TSC Baseline: 160 — no code modified.**
