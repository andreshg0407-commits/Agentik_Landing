# COMMERCIAL-PRODUCTION-READINESS-01

Sprint de alistamiento operativo del modulo Comercial para Castillitos.

## Resultado

TSC: 160 (baseline preservado)
Rutas: 6/6 operativas
Navegacion: limpia, sin modulos ocultos expuestos

---

## Fase 1 — Menu Comercial

**Archivo:** `components/shell/module-nav-config.ts`

Estructura final:

```
Operacion
  Maletas           /comercial/maletas
  Inventario        /comercial/inventario
  Pedidos           /comercial/pedidos

Estructura Comercial
  Clientes          /comercial/clientes
  Vendedores        /comercial/vendedores

Gestion
  Control Comercial /comercial/control
```

Removidos: Tiendas (movido fuera de nav visible), Canales, Sucursales, Lineas, Inteligencia Operacional, customer-360, sales, pipeline.

PathKeys actualizados para que el domain rail se active correctamente en las 6 rutas.

---

## Fase 2 — Estado de Modulos

Cada modulo ahora tiene:
- Titulo claro (una palabra: "Maletas", "Inventario", "Pedidos", "Clientes", "Vendedores", "Control Comercial")
- Subtitulo comercial descriptivo
- Status derivado de datos reales (ok/warning/critical)
- StatusLabel con metricas contextuales
- Fallback si no hay datos (EmptyOperationalState o "En consolidacion")

---

## Fase 3 — Consistencia Visual

Unificaciones aplicadas:

| Elemento | Patron |
|---|---|
| Breadcrumbs | Todos usan `{ label: "Comercial", href: "/{org}/comercial/maletas" }` |
| Titulos | Una palabra. Subtitulo descriptivo. |
| KPI cards | `KpiCard` de primitives.tsx o inline con `ag-kpi-card` |
| Tablas | `ag-op-table` + `ag-op-row` |
| Filtros | `ag-action-ghost` + pill buttons con `C.blueDark` active |
| Empty states | `EmptyOperationalState` o inline con tokens |
| Status badges | dot + label con `STATE_COLORS` |
| Spacing | `S[n]` tokens, `R.sm/R.card/R.pill` |

---

## Fase 4 — Maletas (QA)

- Titulo simplificado: "Maletas" (antes "Maletas comerciales")
- Breadcrumb corregido: `comercial/maletas` (antes `comercial`)
- Drawer, inteligencia, subgrupo SAG, accesorios: sin cambios, estables

---

## Fase 5 — Inventario (QA)

- Titulo simplificado: "Inventario" (antes "Control de Inventario")
- Subtitulo enriquecido: "Disponibilidad comercial — Bodega 01 (Textil) + B36+B37 (Accesorios)"
- LT/CS/Accesorios visibles con secciones colapsables
- Subgrupo SAG real (desde CommercialCoverageSnapshot.subgrupoSag)
- Filtros incluyendo Accesorios y Escasez accesorios
- Sync status block visible

---

## Fase 6 — Pedidos

Agregado banner de estado SAG:

> Pedidos importados desde SAG. Sincronizacion en validacion.
> Los datos reflejan el ultimo snapshot disponible.

- Breadcrumb corregido: `comercial/maletas` (antes `pipeline`)
- No se simula actualidad
- Stats strip y salud comercial intactos

---

## Fase 7 — Clientes

**Archivos nuevos:**
- `lib/comercial/clientes/client-loader.ts` — server-only loader desde `CustomerProfile`
- `app/(app)/[orgSlug]/comercial/clientes/page.tsx` — server wrapper
- `app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx` — client component

Funcionalidad:
- KPI strip: Total, Activos, Con vendedor, Con cartera vencida, Prospectos, Ultimo movimiento
- Busqueda por nombre/NIT
- Filtros: Todos, Activos, Inactivos, Prospectos, Con cartera vencida
- Tabla: Nombre, NIT, Ciudad, Vendedor, Ventas L12, Cartera, Estado
- Paginacion (PAGE_SIZE=25)
- Empty state si total === 0: "Sin clientes registrados — se consolidan desde SAG y CRM"

---

## Fase 8 — Vendedores

- Titulo simplificado: "Vendedores" (antes "Centro de Rendimiento Comercial")
- Subtitulo: "Centro de rendimiento — N vendedor(es) activo(s)"
- Modulo existente completo: KPIs de equipo, cards de vendedor, panel de detalle con live fetch
- Sin cambios de logica

---

## Fase 9 — Control Comercial

**Archivos nuevos:**
- `lib/comercial/control/control-comercial-loader.ts` — server-only aggregator
- `app/(app)/[orgSlug]/comercial/control/page.tsx` — server wrapper
- `app/(app)/[orgSlug]/comercial/control/control-client.tsx` — executive dashboard

Funcionalidad:
- KPI strip (2 filas x 4): Pedidos totales, Pendientes, Refs criticas, Refs agotadas, Vendedores activos, Maletas en riesgo, Clientes activos, Clientes con cartera
- Alertas operativas: critical/warning/info con dot + badge de modulo + titulo + detalle
- Resumen por modulo: 3 cards (Pedidos, Inventario, Maletas) con MiniKpi grid y CTA "Ver X"
- Datos de CRMQuote (pedidos), CommercialCoverageSnapshot (inventario), CommercialCase (maletas), CustomerProfile + CustomerReceivable (clientes)
- Graceful degradation con try/catch si modelos no tienen datos

---

## Fase 10 — QA Final

| Check | Resultado |
|---|---|
| TSC baseline | 160 (preservado) |
| Rutas: maletas | OK |
| Rutas: inventario | OK |
| Rutas: pedidos | OK |
| Rutas: clientes | OK |
| Rutas: vendedores | OK |
| Rutas: control | OK |
| Breadcrumbs consistentes | OK |
| Titulos consistentes | OK |
| Sin overflow evidente | OK |
| Tokens correctos | OK |
| No raw hex nuevo | OK |

---

## Archivos Modificados

| Archivo | Cambio |
|---|---|
| `components/shell/module-nav-config.ts` | Menu reorganizado: 3 secciones, 6 items, sin items ocultos |
| `comercial/maletas/maletas-client.tsx` | Titulo + breadcrumb |
| `comercial/inventario/inventario-client.tsx` | Titulo + subtitulo |
| `comercial/pedidos/pedidos-client.tsx` | Banner SAG + breadcrumb |
| `comercial/vendedores/vendedores-client.tsx` | Titulo + subtitulo |

## Archivos Nuevos

| Archivo | Proposito |
|---|---|
| `lib/comercial/clientes/client-loader.ts` | Loader de clientes desde CustomerProfile |
| `comercial/clientes/page.tsx` | Server page |
| `comercial/clientes/clientes-client.tsx` | UI de clientes |
| `lib/comercial/control/control-comercial-loader.ts` | Aggregator multi-modulo |
| `comercial/control/page.tsx` | Server page |
| `comercial/control/control-client.tsx` | Dashboard ejecutivo |
