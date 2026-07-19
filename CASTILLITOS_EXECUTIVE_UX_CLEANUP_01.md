# CASTILLITOS-EXECUTIVE-UX-CLEANUP-01

**Date:** 2026-06-28
**TSC Baseline:** 160 (maintained, zero regressions)

---

## Problema Detectado

El Centro de Control Ejecutivo mostraba la arquitectura interna de Agentik en lugar de resultados ejecutivos. El CEO veia:

- Signals Activos (motor interno)
- Timeline de Eventos (motor interno)
- Reglas Aplicadas (motor interno)
- Planes Recomendados (motor interno)
- Decisiones Recomendadas (motor interno)
- Acciones Pendientes (motor interno)
- Timeline Ejecutivo (vacio)
- Preguntas del CEO (cuestionario literal)

Estas secciones contaminaban el flujo principal con informacion tecnica irrelevante para decisiones gerenciales.

## Decision UX

**Regla principal:** El Dashboard Ejecutivo no muestra arquitectura interna. El CEO ve resultados, no motores.

**Regla de producto:** Cada seccion responde una pregunta ejecutiva real. Si no responde una pregunta util, se mueve a diagnostico.

## Nuevo Orden del Dashboard

| # | Seccion | Pregunta que responde |
|---|---|---|
| 1 | Resumen Ejecutivo del Dia | Que necesito saber ahora mismo? |
| 2 | Disponibilidad Comercial | Que puedo vender hoy? Que esta critico? |
| 3 | Gestion de Maletas | Que debo sacar de maletas? |
| 4 | Produccion y Recuperacion | Que debo producir? Que esta retrasado? |
| 5 | Reposicion Recomendada | Que referencias tienen reemplazo? |
| 6 | Salud de Vendedores | Que vendedor necesita gestion? |
| 7 | Calidad de Datos | Que datos no son confiables? |
| 8 | Diagnostico Interno Agentik | (colapsado, solo admins) |

## Secciones Eliminadas del Flujo Principal

Movidas a "Diagnostico Interno Agentik" (colapsado por defecto):

- Signals Activos
- Timeline de Eventos
- Reglas Aplicadas
- Planes Recomendados
- Decisiones Recomendadas
- Acciones Pendientes
- Cadenas de Razonamiento

## Secciones Eliminadas Completamente

- Preguntas del CEO (literal) — las respuestas ahora viven integradas en cada seccion
- Timeline Ejecutivo (highlights) — movido a diagnostico si tiene datos
- Salud del Negocio (score circulo) — reemplazado por alertas contextuales
- Preguntar a David — el copilot vive en el rail derecho, no en el dashboard

## Reglas de Presentacion

1. **Cards ejecutivas** (FASE 3): Maximo 6 KPIs en el resumen. Cada card tiene numero, descripcion corta, color de estado.

2. **Filtros en disponibilidad** (FASE 7): Disponibles | Criticas | Sin existencia | Ver todo. Default: Disponibles.

3. **Orden de referencias** (FASE 8): Disponibles primero, luego criticas, luego agotadas con produccion, luego agotadas sin produccion.

4. **Paginacion** (FASE 9): Todas las tablas limitan a 20 filas iniciales con boton "Ver mas (N restantes)".

5. **Disponibilidad por linea** (FASE 5): Castillitos / Latin Kids expandibles. No tabla gigante por defecto.

6. **Vendedores sin datos** (FASE 13): Si no hay TM sincronizado, muestra card honesta "Maletas pendientes de sincronizacion TM 206" con nombres de vendedores. No tabla de ceros.

7. **Maletas sin datos** (FASE 10): Si no hay datos de maletas, muestra estado honesto en lugar de 99+ sin detalle.

8. **Microcopy ejecutivo** (FASE 17):
   - "Commercial Availability" -> "Disponibilidad Comercial"
   - "Replenishment Intelligence" -> "Reposicion Recomendada"
   - "Production Flow" -> "Produccion y Recuperacion"
   - "UNSYNCED" -> "Pendiente sincronizar"
   - "suggestedOnly" -> implicitamente en la seccion de confianza

## Limitaciones Conocidas

1. **InventoryTransfer no migrado:** La seccion de Vendedores y Maletas muestra "Pendiente sincronizacion TM 206" porque la tabla no existe.

2. **CustomerOrderRecord sin PD abiertos:** Pedidos pendientes muestran 0. El campo `status` necesita revision de mapping.

3. **Filtros no persistentes:** El filtro de disponibilidad se reinicia al recargar la pagina. Futuro: persistir en URL params.

## Pendientes

- Drawer de detalle por referencia (click en fila -> detalle completo)
- SubGrupo grouping visual dentro de cada linea (FASE 6 parcial — rows ya vienen agrupadas pero sin header visual)
- Responsive testing en dispositivos moviles reales (FASE 18 — layout responsive via CSS grid)
- Role-based visibility para Diagnostico Interno (FASE 16 — actualmente colapsado para todos)

## Archivo Modificado

- `app/(app)/[orgSlug]/reports/executive-dashboard-client.tsx` — reescritura completa (2724 -> ~1200 lines)

## Validacion

```bash
npx tsc --noEmit
# 160 errors (all pre-existing, zero new)
```
