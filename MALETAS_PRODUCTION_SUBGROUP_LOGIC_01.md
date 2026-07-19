# MALETAS-PRODUCTION-SUBGROUP-LOGIC-01 — Sprint Report

## Problema corregido

La tabla "Sugerencias de produccion" comunicaba incorrectamente:

> "Producir L-1308."

La logica correcta de Castillitos es: textil se produce por necesidad de **subgrupo SAG**, no por referencia exacta. La referencia es evidencia del deficit, no la instruccion de produccion.

## Logica anterior

- Una sugerencia por **referencia** (`productionMap.get(ref.reference)`)
- Tabla mostraba: Referencia | Descripcion | Linea | Disponible | Minimo | Faltante | Urgencia
- Urgencia basada en inventario individual de la referencia
- Detalle decia "producir esta referencia"

## Logica nueva

- Una sugerencia por **linea + subgrupoSag** (`subgroupProdMap.get(line|sg)`)
- Tabla muestra: Subgrupo | Linea | Disp. subgrupo | Requerido | Faltante | Maletas | Urgencia
- Urgencia basada en shortfall total del subgrupo y cantidad de maletas afectadas
- Detalle dice "producir unidades del subgrupo" con referencias solo como evidencia

## Formula de calculo

```
Para cada linea + subgrupoSag:

availableSubgroupQty = sum(centralAvailable) de todas las refs con requiresProductionSuggestion del subgrupo
requiredSubgroupQty  = sum(minimumRequired) de todas las refs del subgrupo que requieren produccion
shortfall            = max(requiredSubgroupQty - availableSubgroupQty, 0)
suggestedQty         = shortfall

Solo generar sugerencia si suggestedQty > 0.
```

### Urgencia por subgrupo

| Nivel | Condicion |
|---|---|
| Alta  | shortfall >= 50 o maletas afectadas >= 3 |
| Media | shortfall >= 20 o maletas afectadas >= 2 |
| Baja  | menor a eso |

## Ejemplos

### Antes
```
Referencia: L-1308
Descripcion: PIJAMA NINA CC 18-22
Disponible: 2
Minimo: 30
Faltante: 28
Accion: Detalle
```
Interpretacion erronea: "Producir L-1308"

### Despues
```
Subgrupo: PIJAMA CC 18-22
Linea: Castillitos
Disp. subgrupo: 5
Requerido: 44
Faltante: 39
Maletas: 2
Urgencia: MEDIA
Accion: Detalle
```
Interpretacion correcta: "PIJAMA CC 18-22 tiene faltante de 39 unidades en 2 maletas"

### Detalle drawer

- "Por que se sugiere producir este subgrupo"
- "No se recomienda producir necesariamente la misma referencia. Se recomienda producir unidades nuevas del mismo subgrupo para recuperar cobertura comercial en maletas."
- Referencias evidencia: L-1308 (2 disp.), L-1310 (3 disp.)
- "Se produce para reemplazar faltantes del subgrupo: PIJAMA CC 18-22"

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `vendor-sample-types.ts` | ProductionSuggestion extendido: subgrupoSag, evidenceRefs, reasonType, ProductionReasonType |
| `vendor-sample-loader.ts` | Generacion reescrita: agrupa por line+subgrupoSag, suma faltantes, urgencia por subgrupo |
| `vendor-sample-service.ts` | Adaptado al nuevo tipo (backward compat para path Prisma) |
| `maletas-client.tsx` | Tabla: columnas subgrupo. ProductionRow y ProductionDetailDrawer reescritos |
| `validate-maletas-production-subgroup-logic.ts` | 33 checks, 33 PASS |

## TSC baseline

160 (sin cambios).

## Regla obligatoria (documentada)

En Maletas:
- referencia agotada = dato diagnostico
- referencia en riesgo = dato diagnostico
- referencia disponible = candidato operativo
- **subgrupo SAG = unidad de decision**

Nunca sugerir reemplazar/producir una referencia solo porque coincide la misma referencia.

## Limitaciones

- La logica Prisma (vendor-sample-service.ts) aun genera 1 sugerencia por referencia (path legacy, no usado por Castillitos)
- El subgrupoSag depende de datos SAG sincronizados; si no existe, usa "SIN_SUBGRUPO_SAG"
- No se implementa flujo complejo de produccion (OPs, lotes, etc.)
