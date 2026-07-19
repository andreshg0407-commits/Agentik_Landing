# PRODUCTION-EXECUTIVE-DASHBOARD-01

**Sprint:** PRODUCTION-EXECUTIVE-DASHBOARD-01
**Date:** 2026-06-30
**TSC Baseline:** 160 (maintained)
**Prerequisite:** PRODUCTION-OPERATIONS-WORKSPACE-HARDENING-01 (readiness 8.3/10)

---

## Resumen

Capa ejecutiva sobre el workspace operativo de Produccion.
Responde preguntas de gerencia con datos, no con senales tecnicas.

Pipeline: `ProductionOperationsSnapshot` -> `buildProductionExecutiveSnapshot()` -> `ProductionExecutiveSnapshot`

La proyeccion es **pura y determinista**: no consulta Prisma, no importa SAG, no tiene `server-only`.

---

## Secciones del Dashboard Ejecutivo

### 1. Health Banner
- Nivel: OK / ATTENTION / CRITICAL
- Un resumen en espanol de una linea
- Senales de soporte (max 4)
- Color semantico por nivel (verde/ambar/rojo)

### 2. KPI Strip (6 tarjetas)
| KPI | Clave | Descripcion |
|---|---|---|
| OPs Activas | `activas` | Ordenes no completadas |
| Detenidas | `detenidas` | Sin actividad en 30+ dias |
| Sin consumo | `sin_consumo` | Orden creada sin retiro de materiales |
| Completadas | `completadas` | Flujo completo OP->CN->ET |
| Costo activo | `costo_activo` | Material comprometido en produccion activa |
| Duracion prom. | `duracion` | Dias promedio OP a ET |

### 3. Prioridades (max 5)
- Cada prioridad: titulo, impacto, evidencia, severidad, accion
- Orden: critical -> high -> medium
- Fuentes: OPs detenidas, sin consumo, ciclo largo, concentracion de costo, frescura de datos

### 4. Cuellos de Botella
- Distribucion de OPs activas por etapa actual
- Top 3 etapas con mayor concentracion
- Observacion cuando >40% de OPs en una etapa
- Alerta cuando 0 OPs en entrada de PT

### 5. Costos
- Costo material activo total y promedio por OP
- Top 5 OPs por costo material
- Top 5 referencias por costo material (agregado)

### 6. Confianza de Datos
- Nivel: CONFIABLE / PARCIAL / INSUFICIENTE
- Criterios: cobertura de costos (>=90%), consistencia cronologica (>=95%)
- Fechas: ultima OP, ultimo consumo, ultima entrada PT, ultimo sync

---

## Archivos

| Archivo | Cambio |
|---|---|
| `lib/production/production-executive-types.ts` | NUEVO -- tipos puros del snapshot ejecutivo |
| `lib/production/production-executive-service.ts` | NUEVO -- proyeccion determinista desde ProductionOperationsSnapshot |
| `app/(app)/[orgSlug]/produccion/produccion-client.tsx` | MODIFICADO -- dashboard ejecutivo encima del workspace operativo |
| `app/(app)/[orgSlug]/produccion/page.tsx` | MODIFICADO -- construye y pasa executive prop |

---

## Arquitectura

```
page.tsx (Server)
  |-- buildProductionOperationsSnapshot()  [Prisma, server-only]
  |-- buildProductionExecutiveSnapshot()   [puro, sin Prisma]
  |
  v
ProduccionClient (Client)
  |-- ExecutiveHealthBanner
  |-- KPI Grid (6 cards)
  |-- Priorities + Bottlenecks + Costs (2-col layout)
  |-- DataTrustStrip
  |-- [separador]
  |-- Workspace Operativo (tabla, filtros, tabs) [sin cambios]
```

---

## Validacion

- `npx tsc --noEmit` -- 160 errores (baseline mantenida, 0 nuevos)
- Ningun cambio en: ProductionEvent, ProductionTimeline, ProductionStageActivation, Prisma, SAG adapters
- Ningun cambio en: production-operations-service.ts, production-operations-types.ts

---

## Decisiones de Diseno

1. **Proyeccion pura**: El servicio ejecutivo no tiene `server-only` porque no toca DB. Se puede llamar desde page.tsx sin restriccion.
2. **Sin duplicacion**: El dashboard ejecutivo no repite columnas de la tabla operativa. Son capas complementarias.
3. **Lenguaje gerencial**: Todo en espanol, sin terminos tecnicos (no "timeline", no "stage activation", no "gap level").
4. **Colores semanticos**: Health/Priority/Trust usan paletas consistentes derivadas de tokens del design system.
5. **Responsive**: KPIs en grid 3x2 desktop, 2x3 tablet, 1x6 mobile. Prioridades/Costos en 2-col desktop, stack mobile.

---

*Sprint: PRODUCTION-EXECUTIVE-DASHBOARD-01*
*Fecha: 2026-06-30*
*TSC Baseline: 160 (confirmado)*
