# PRODUCTION-DOMAIN-EXTRACTION-01

**Sprint:** PRODUCTION-DOMAIN-EXTRACTION-01
**Date:** 2026-06-30
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Razon de Extraccion

Produccion tenia suficiente independencia para ser un dominio de primer nivel:

- Modelo propio: ProductionOrder, ProductionEvent, ProductionEventLine
- Eventos propios: OP (3,376), CN (7,890), ET (3,640) — 14,906 eventos sincronizados
- Timelines propios: 3,387 timelines, 97% COMPLETE
- Etapas propias: 15 canonicas, 6 perfiles, motor de activacion (151 tests)
- Costos propios: $334.6M COP en consumos, 100% cobertura
- Metricas propias: executive snapshot, stage metrics, gap detection
- Agente futuro propio: Pablo (planta, cuellos de botella, prioridades)

Comercial consume producto terminado. Produccion genera producto terminado.
Mantenerlo como sub-item de Comercial creaba una jerarquia incorrecta.

---

## Cambios Realizados

### 1. Navegacion — Produccion como dominio principal

**Archivo:** `components/shell/module-nav-config.ts`

- ELIMINADO: `"Produccion"` como sub-item de Comercial (indent: 1, linea 214)
- ELIMINADO: `"produccion"` de Comercial pathKeys
- CREADO: Dominio `"produccion"` de primer nivel con:
  - id: `"produccion"`
  - label: `"Produccion"`
  - shortIcon: `"Pr"`
  - iconKey: `"produccion"`
  - accent: `"#b45309"` (amber — distinto de Comercial #0369a1)
  - pathKeys: `["produccion"]`
  - 8 items de navegacion en 2 secciones

### 2. Shell — Icono y color de dominio

**Archivo:** `components/shell/workspace-shell-client.tsx`

- AGREGADO: `Factory` (lucide-react) como icono de Produccion
- AGREGADO: `produccion: Factory` en DOMAIN_ICONS
- AGREGADO: `produccion: "#fbbf24"` en RAIL_ACCENTS (amber-400)

### 3. Layout — Flag de visibilidad

**Archivo:** `app/(app)/[orgSlug]/layout.tsx`

- AGREGADO: `hasProduction: mods.has("production")` en NavBuildOptions

**Archivo:** `components/shell/module-nav-config.ts`

- AGREGADO: `hasProduction: boolean` en NavBuildOptions interface

### 4. Rutas creadas

| Ruta | Estado | Proposito |
|---|---|---|
| `/produccion` | FUNCIONAL | Panel de Control de Produccion (existia) |
| `/produccion/ordenes` | PLACEHOLDER | Vista de ordenes de produccion |
| `/produccion/timeline` | PLACEHOLDER | Visualizacion del ciclo productivo |
| `/produccion/etapas` | PLACEHOLDER | Activacion de etapas y perfiles |
| `/produccion/consumos` | PLACEHOLDER | Consumos de materias primas |
| `/produccion/costos` | PLACEHOLDER | Costos de produccion |
| `/produccion/alertas` | PLACEHOLDER | Alertas operativas |

Todas las rutas placeholder usan `OperationalWorkspaceHeader` + `EmptyOperationalState`.

### 5. Barrel de dominio

**Archivo:** `lib/production/index.ts`

Re-exporta tipos y funciones de:
- `lib/production-events/` — Modelo universal de eventos
- `lib/production-timeline/` — Proyeccion de timelines
- `lib/production-stages/` — Motor de activacion de etapas
- `lib/production-control/` — Snapshot del control center

---

## Navegacion Final

```
Produccion (Pr) — #b45309
├── Operacion
│   ├── Panel de Produccion  → /produccion
│   ├── Ordenes              → /produccion/ordenes
│   ├── Timeline             → /produccion/timeline
│   └── Etapas               → /produccion/etapas
└── Analisis
    ├── Consumos             → /produccion/consumos
    ├── Costos               → /produccion/costos
    └── Alertas              → /produccion/alertas
```

---

## Decisiones de Arquitectura

### D1: No renombrar lib/production-control/

Se decidio conservar `lib/production-control/` como esta y crear un barrel
`lib/production/index.ts` que re-exporta todos los sub-dominios.
Razon: renombrar generaria churn en imports sin beneficio funcional.

### D2: No crear lib/production-domain/

El barrel `lib/production/index.ts` cumple el rol de punto de entrada unificado.
No es necesario un directorio adicional.

### D3: Color amber (#b45309) para Produccion

Diferenciacion clara de Comercial (#0369a1 blue) y Finanzas (#1e40af dark blue).
Amber connota operacion industrial/manufactura.

### D4: Icono Factory (lucide-react)

Factory es el icono mas apropiado para manufactura/produccion.
Alternativas evaluadas: Cog (demasiado generico), Wrench (mantenimiento).

### D5: ModuleKey "production" existente reutilizado

El moduleKey `"production"` ya existia en tenant/modules.ts como opt-in.
Se reutilizo sin cambios — compatible con la activacion por tenant.

---

## Roadmap de Submodulos

| Prioridad | Submodulo | Datos disponibles | Sprint estimado |
|---|---|---|---|
| P0 | Ordenes | ProductionOrder + OP events | PRODUCTION-ORDENES-01 |
| P0 | Timeline | ProductionTimeline (3,387 built) | PRODUCTION-TIMELINE-UX-01 |
| P1 | Etapas | ProductionStageActivation (151 tests) | PRODUCTION-ETAPAS-UX-01 |
| P1 | Consumos | CN events (81,367 lines, 100% cost) | PRODUCTION-CONSUMOS-01 |
| P2 | Costos | Cost foundation from CN lines | PRODUCTION-COSTOS-01 |
| P2 | Alertas | ProductionAlert engine exists | PRODUCTION-ALERTAS-01 |
| P3 | Configuracion | Production profiles | PRODUCTION-CONFIG-01 |

---

## Relacion con Comercial

- Comercial conserva: Maletas, Tiendas, Pedidos, Vendedores, Inventario
- Produccion se separo completamente de Comercial
- Comercial puede consumir datos de producto terminado via consultas a ProductionOrder
- No hay dependencias inversas: Produccion no importa nada de Comercial

## Relacion con Inventario

- Inventario Comercial (`/comercial/inventario`) se mantiene dentro de Comercial
- Inventario de planta (Bodegas 04, 14, 15) pertenece al dominio de Produccion
- Bodega 01 (Producto Terminado) es zona de interseccion:
  - Produccion la llena (ET)
  - Comercial la consume (despachos, ventas)

## Compatibilidad Multi-Tenant

- ModuleKey "production" es opt-in por tenant
- Todos los modelos son ERP-agnosticos (ProductionEvent, ProductionTimeline, ProductionStageActivation)
- Presets de configuracion: SAG_PYA, DEFAULT (safe)
- 6 perfiles productivos soportan distintos modelos de manufactura
- No hay hardcoded Castillitos en el modulo (excepto filter keys en UI, removibles)

## Compatibilidad con Bodega de Datos Futura

La bodega de datos podra entregar:
- ProductionEvents normalizados (via ProductionEvent model)
- ProductionOrders (via ProductionOrder model)
- ProductionTimelines derivados (via buildProductionTimelines())
- Perfiles productivos (via PRODUCTION_PROFILES)
- Costos (via ProductionEventLine.lineMetadata)
- Eventos de planta (via ProductionEventType union)

El modulo NO depende de SAG. SAG es un adaptador que alimenta los modelos universales.
Cualquier fuente de datos que produzca ProductionEvent puede alimentar el modulo.

---

## Agente Futuro: Pablo

**Nombre:** Pablo
**Dominio:** Produccion
**Rol:** Agente de inteligencia productiva

**Capacidades futuras:**
- Detectar OP retrasadas y sugerir prioridades
- Identificar cuellos de botella por etapa
- Explicar costos de produccion con evidencia
- Alertar sobre consumos anomalos
- Recomendar acciones de re-priorizacion
- Proyectar fechas de finalizacion basado en velocidad historica

**No implementar todavia.** Solo documentar para alineacion de roadmap.

---

## Riesgos Restantes

| Riesgo | Mitigacion |
|---|---|
| UI de filter keys tiene "castillitos"/"latin_kids" hardcoded | Migrar a configuracion por tenant |
| production-control-service.ts importa production-intelligence (V1) | Migrar a production-stages (V2) en sprint futuro |
| Produccion visible solo si `"production"` esta en enabled modules | Activar via seed o admin para Castillitos |

---

## Validacion Tecnica

- TSC: 160 errors (baseline maintained, 0 new)
- No broken imports
- No circular dependencies introduced
- All sub-route pages render with proper primitives
- Comercial navigation intact (Maletas, Tiendas, Pedidos, Vendedores, Inventario)
