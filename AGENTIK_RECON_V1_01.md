# AGENTIK-FINANCE-RECON-V1-01
## Conciliación Inteligente — Laboratorio Operacional V1

**Sprint:** AGENTIK-FINANCE-RECON-V1-01
**Archivos creados/modificados:**
- `app/(app)/[orgSlug]/finanzas/conciliacion/page.tsx` (nuevo)
- `app/(app)/[orgSlug]/finanzas/conciliacion/conciliacion-client.tsx` (nuevo)
- `components/shell/module-nav-config.ts` (nav actualizado)
**Backend constraint:** NO Prisma, NO APIs, NO SAG changes, NO engine changes. Todo mock.

---

## Visión Operacional

Conciliación Inteligente es el módulo de matching y trazabilidad financiera de Agentik.
Su rol en el sistema operacional:

- **Compara fuentes** (ERP, bancos, documentos) buscando coincidencias campo a campo.
- **Mapea con IA** — el Motor IA asigna un score de confianza a cada par de campos.
- **Clasifica resultados** — conciliados, pendientes, duplicados, inconsistentes, huérfanos, a revisión.
- **Gestiona excepciones** — cada excepción tiene timeline de estados y flujo de resolución.
- **Construye reglas** — el operador define condiciones que el motor aplica automáticamente.
- **Exporta** — PDF ejecutivo, XML DIAN, XLSX, reporte de auditoría.

No reemplaza `/reconciliation` (modulo legacy de AR). Es una capa nueva de laboratorio
de conciliación multi-fuente con inteligencia artificial embebida.

---

## Arquitectura Narrativa

```
page.tsx (Server Component)
  └── requireOrgAccess(orgSlug)
  └── <ConciliacionClient orgSlug={orgSlug} />

ConciliacionClient ("use client")
  ├── Estado: drawerCtx (DrawerCtx | null)
  ├── Sección 1: OperationalWorkspaceHeader — "Conciliación Inteligente"
  ├── Sección 2: Franja operacional — 5 KPIs (fuentes, pendientes, coincidencias, excepciones, riesgo)
  ├── Sección 3: Laboratorio — 3 paneles (Fuente A | Motor IA | Fuente B)
  ├── Sección 4: Motor IA Mapeo — tabla 3-col (campo A | confianza | campo B)
  ├── Sección 5: Resultados + Excepciones — grid 3×2 + lista con drawers
  ├── Sección 6: Constructor de Reglas — tabla + preview de condiciones
  ├── Sección 7: CollapsibleSection "Historial" — tabla de sesiones pasadas
  ├── Sección 8: Exportación — 4 cards (PDF/XML/XLSX/Reporte)
  └── OperationalSideDrawer — resolver por DrawerCtx
```

---

## Sistema IA

### Motor de Mapeo

El Motor IA es el núcleo del laboratorio. Para cada par de campos (campo_A, campo_B):

| Métrica | Detalle |
|---------|---------|
| Score de confianza | 0–100% calculado por similaridad semántica + histórico |
| Threshold auto | > 85% → conciliado automático |
| Threshold revisión | 60–85% → requiere confirmación manual |
| Threshold rechazo | < 60% → no mapea |

### Campos mapeados (mock V1)

| Campo Fuente A | Campo Fuente B | Confianza |
|---------------|---------------|-----------|
| Número Factura | Referencia Pago | 94% |
| Monto Neto | Valor Transacción | 88% |
| NIT Cliente | Identificación Emisor | 76% |
| Fecha Emisión | Fecha Valor | 71% |
| Código Cuenta | Centro de Costo | 58% |
| Descripción | Concepto Pago | 42% |

### Clasificación de resultados

| Estado | Color | Criterio |
|--------|-------|---------|
| Conciliados | Verde | Match automático ≥ 85% en campos clave |
| Pendientes | Ámbar | Match parcial — falta confirmación |
| Duplicados | Naranja | Mismo documento mapeado dos veces |
| Inconsistentes | Rojo | Match encontrado pero valores divergen |
| Huérfanos | Gris | Sin par en la fuente opuesta |
| A revisión | Azul | Escalado por operador o IA |

---

## Laboratorio 3 Paneles

```
┌─────────────────┐   ⇄   ┌──────────────────────────────────┐   ⇄   ┌─────────────────┐
│   Fuente A      │       │         Motor IA                  │       │   Fuente B      │
│   SAG ERP       │       │  Mapeo semántico multi-campo      │       │  Bancolombia    │
│   2,847 registros│      │  Confianza promedio: 71.5%        │       │  1,203 registros│
│   Última sync:  │       │  Campos mapeados: 6               │       │  Última sync:   │
│   hace 2h       │       │  Pending review: 8                │       │  hace 45min     │
│                 │       │                                   │       │                 │
│  Campo: Factura │       │  [Ejecutar mapeo completo]        │       │  Campo: Ref Pago│
│  Tipo: String   │       │  [Ver configuración]              │       │  Tipo: String   │
│  Nulos: 0.3%    │       │                                   │       │  Nulos: 1.2%    │
└─────────────────┘       └──────────────────────────────────┘       └─────────────────┘
```

El panel central (Motor IA) es la interfaz de control del mapeo:
- Muestra estado del último run (timestamp, registros procesados, duración).
- Expone las acciones primarias del laboratorio.
- Es el único panel con `ag-action-primary`.

---

## Reglas de Conciliación

### Estructura de una regla

```typescript
type ReconRule = {
  id:         string;
  name:       string;
  conditions: string[];   // e.g. ["monto > 0", "fecha_diff <= 3", "nit match exact"]
  action:     string;     // e.g. "auto-conciliar"
  priority:   number;     // 1 = highest
  active:     boolean;
}
```

### Reglas V1 (mock)

| Regla | Condiciones | Acción | Prioridad |
|-------|-------------|--------|-----------|
| Match exacto NIT+Factura | NIT idéntico + Número Factura idéntico | auto-conciliar | 1 |
| Tolerancia monto ±0.5% | Monto dentro del 0.5% + Fecha ±1 día | auto-conciliar | 2 |
| Escalar inconsistencias | Campo monto diverge > 5% | escalar-revisión | 3 |

---

## Drawers

### DrawerCtx variants

| Tipo | Trigger | Contenido |
|------|---------|-----------|
| `result_group` | Click card de resultado | KPIs del grupo + lista de registros + IA recomendación |
| `exception` | Click fila de excepción | Timeline de estados + resolución + IA recomendación |
| `match_field` | Click fila de campo mapeado | Confianza detallada + ejemplos + IA recomendación |
| `rule` | Click fila de regla | Condiciones + impacto + historial de aplicación |
| `session` | Click fila de historial | Métricas de la sesión + comparativa vs anterior |

### Patrón de drawer

Todos los drawers siguen el mismo stack visual:
1. `DrawerMetricGrid` — KPIs en chips 2×N
2. `DrawerTimeline` — historial de estados
3. `DrawerRelatedItems` — links a entidades relacionadas
4. `DrawerAIRecommendation` — badge IA + "Agentik detecta" + texto
5. `DrawerTraceability` — dot verde + "fuente · actualizado"
6. `DActions` — CTA primary → secondary → ghost/passive

---

## Exportación

| Formato | Label | Descripción |
|---------|-------|-------------|
| PDF | Reporte Ejecutivo | Resumen para dirección financiera |
| XML | Exportar DIAN | Archivo XML para obligaciones DIAN |
| XLSX | Exportar Excel | Dataset completo para auditoría |
| Reporte | Reporte Auditoría | Pista de auditoría completa con trazabilidad |

Todos los botones de exportación son `PassiveAction` en V1 (sin backend real).

---

## Decisiones UX

### 1. Ruta nueva vs reemplazo
Se creó `/finanzas/conciliacion` como ruta independiente.
La ruta `/reconciliation` (AR legacy) permanece intacta.
La nav apunta al nuevo módulo.

### 2. Laboratorio como espacio operacional
El laboratorio no es un wizard paso-a-paso. Es un workspace persistente
donde el operador puede ver el estado de mapeo en cualquier momento y tomar acciones.

### 3. Motor IA como panel central
El panel central del laboratorio es el Motor, no los datos.
Poner los datos en los extremos y la inteligencia en el centro
comunica visualmente que el sistema procesa activamente las fuentes.

### 4. Confianza como barra visual + número
La confianza se muestra como:
- Número `94%` (legibilidad)
- Barra de progreso (percepción intuitiva del nivel)
- Color (verde ≥ 85%, ámbar 60–84%, rojo < 60%)
Los tres canales simultáneos eliminan ambigüedad.

### 5. PassiveAction para todas las acciones sin backend
Exportar, ejecutar mapeo, crear regla — todas son `PassiveAction` en V1.
Comunica honestidad al usuario: "esto existe, pero no está listo".
No genera frustración ni expectativas falsas.

---

## Integración con el sistema operacional

| Componente reutilizado | Origen |
|----------------------|--------|
| `OperationalWorkspaceHeader` | `components/workspace/operational-workspace-header.tsx` |
| `OperationalSideDrawer` | `components/workspace/operational-side-drawer.tsx` |
| `CollapsibleSection` | `components/workspace/collapsible-section.tsx` |
| `C.*`, `T.*`, `S.*`, `R.*` | `lib/ui/tokens.ts` |
| `ag-kpi-card`, `ag-op-row`, `ag-op-table` | `app/design-system.css` |
| `ag-action-primary/secondary/ghost` | `app/design-system.css` |

Cero componentes nuevos creados. Todo construido con los primitivos existentes.

---

## TypeScript compliance

- Cero nuevos errores introducidos.
- Total del proyecto: **160 errores** (baseline mantenido).
- `DrawerCtx` — unión discriminada completa; todos los `case` cubiertos en `getDrawerProps`.
- `DrawerSeverity` — importado de `operational-side-drawer.tsx`.
- Todos los arrays de mock const sin `as const` para evitar problemas de inferencia en JSX.

---

## Próximos pasos V2

| Área | Tarea | Prioridad |
|------|-------|-----------|
| Backend | `GET /api/orgs/[orgSlug]/conciliacion/sessions` | Alta |
| Backend | `GET /api/orgs/[orgSlug]/conciliacion/matches` | Alta |
| Backend | `POST /api/orgs/[orgSlug]/conciliacion/run` | Alta |
| Motor IA | Integrar embeddings para matching semántico real | Alta |
| Reglas | CRUD real de reglas en Prisma | Media |
| Exportación | PDF con Puppeteer / XML DIAN schema | Media |
| Historial | Persistencia de sesiones en `ConciliacionSession` table | Media |
| Exceptions | Workflow de resolución con estado en BD | Media |
| Real-time | WebSocket para progress del motor durante run | Baja |
| Multitenancy | Reglas aisladas por org — Prisma `orgId` FK | Baja |
