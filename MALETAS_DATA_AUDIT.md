# MALETAS_DATA_AUDIT.md

COMMERCIAL-DATA-AUDIT-01 -- Fase 6: Auditoria de Datos Maletas

---

## Volumen

| Tabla | Registros |
|---|---|
| CommercialCase | **0** |
| CommercialCaseItem | **0** |
| CommercialCoverageSnapshot | 15,309 (compartido con Inventario) |
| CommercialSalesRepProfileSnapshot | desconocido |
| CommercialProductionSignal | desconocido |
| CommercialDeadStockSignal | desconocido |

**Las tablas core del modulo Maletas (CommercialCase, CommercialCaseItem) estan VACIAS.**

---

## Como Funciona el Modulo Actualmente

El modulo Maletas opera en **modo runtime** — NO en modo Prisma persistido:

```
Excel Workbooks
  MALETAS.xlsx (derrotero por vendedor × referencia)
  DISPONIBLE PARA MALETAS.xlsx (stock, SAG invoices)
    |
    v
maletas-runtime.ts :: loadMaletasContext()
    |
    v
maletas-engine.ts :: buildMaletasOperationalContext()
    | Calcula: cases, items, coverage, signals
    v
maletas-client.tsx (renderizado en vivo desde engine output)
```

El pipeline `persistFullMaletasSnapshot()` existe en `maletas-snapshots.ts` pero **nunca se invoca automaticamente**. Los datos se calculan en cada request y se descartan.

---

## Datos que SI Persisten (CommercialCoverageSnapshot)

El modulo Maletas genera coverage snapshots que se persisten a `CommercialCoverageSnapshot` (analizado en INVENTARIO_DATA_AUDIT.md):

| Campo | Estado |
|---|---|
| refCode | OK — 3,071 refs |
| disponible | OK — dato real |
| line (LT/CS) | OK |
| subgrupoSag | Parcial (67.7%) |
| dailyVelocity | NULO |

---

## Vendedores en Maletas

El modulo usa el mismo registro hardcoded de 4 vendedores:

| Vendedor | En Excel? | En SAG? | Completo? |
|---|---|---|---|
| CARLOS LEON | Si | sagName=null | No |
| CARLOS VILLA | Si | sagName=null | No |
| NESTOR | Si | NESTOR FERNANDO ALZATE JIMENEZ | Si |
| ORLANDO | Si | LUIS ORLANDO NARANJO | Si |

---

## Metricas Analizadas

### Cobertura (desde CommercialCoverageSnapshot)

| Metrica | Confianza | Observaciones |
|---|---|---|
| Referencias totales por vendedor | MEDIA | Funciona en runtime, no persiste |
| Referencias agotadas | ALTA | disponible <= 0, dato real |
| Referencias bajo minimo | MEDIA | Depende de reglas hardcoded en derrotero |
| Cobertura porcentual | BAJA | Depende de dailyVelocity (no poblado) |

### Riesgo Comercial

| Metrica | Confianza | Observaciones |
|---|---|---|
| riesgoComercial (bajo/medio/alto/critico) | NULA en DB | CommercialCase vacia |
| presionOperacional | NULA en DB | CommercialCase vacia |
| En runtime (UI) | MEDIA | Se calcula pero no se guarda |

### Accesorios

| Metrica | Confianza | Observaciones |
|---|---|---|
| Subgrupo SAG | MEDIA | 67.7% poblado, permite filtrar accesorios |
| Accesorios especificos | BAJA | Depende de la calidad del subgrupoSag |

### Reemplazos

| Metrica | Confianza | Observaciones |
|---|---|---|
| Refs para reemplazar | NULA en DB | refsAgotadas + refsBajoMinimo de CommercialCase, que tiene 0 rows |
| En runtime (UI) | MEDIA | Se calcula desde el engine |

---

## Problemas Criticos

### P0 — CommercialCase y CommercialCaseItem nunca se persisten

El pipeline `persistFullMaletasSnapshot()` existe pero no se invoca en produccion. Consecuencias:

- Control Comercial muestra "Vendedores activos: --", "Maletas en riesgo: --"
- El detalle de vendedor muestra "Sin maleta activa asignada"
- No hay historial temporal de maletas
- No hay tendencias

**Solucion requerida:** Invocar `persistFullMaletasSnapshot()` despues de cada carga de maletas (ya sea via cron o via la UI de ingestion Excel).

### P1 — Datos de maletas se pierden entre sesiones

Cada vez que un usuario carga la pagina, el engine procesa el Excel y genera los datos en vivo. Si el Excel no esta disponible, la pagina muestra un estado vacio. No hay cache ni persistencia.

### P1 — Solo 4 de 8 vendedores reales

(Ver VENDEDORES_DATA_AUDIT.md para detalle completo)

### P2 — Reglas de derrotero hardcoded

Los umbrales de minimo por referencia, las asignaciones vendedor-referencia, y los batch labels estan hardcoded en `maletas-normalizer.ts`. No hay configuracion por tenant.

---

## Confianza General

| Aspecto | Confianza |
|---|---|
| Datos de maletas en DB | **NULA** — tablas vacias |
| Datos de maletas en runtime (UI) | **MEDIA** — funciona pero se pierde |
| Cobertura de referencias | **ALTA** (via CommercialCoverageSnapshot.disponible) |
| Riesgo por vendedor | **NULA en DB / MEDIA en runtime** |
| Accesorios | **MEDIA** (depende de subgrupoSag) |
| Historico temporal | **NULO** — no se persiste |
