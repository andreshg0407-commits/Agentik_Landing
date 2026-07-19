# AGENTIK-TREASURY-POLISH-04
## Tesorería Operativa — Drawer Profundo + Sistema Vivo + Demo Castillitos Final

**Sprint:** AGENTIK-TREASURY-POLISH-04
**Archivos modificados:**
- `app/(app)/[orgSlug]/finanzas/tesoreria/tesoreria-client.tsx` (reescritura completa)
- `components/workspace/collapsible-section.tsx` (acento visual en headers)
**Backend constraint:** NO Prisma, NO APIs, NO SAG changes, NO rail right changes

---

## Objetivo del sprint

POLISH-03 estableció la estructura del drawer y los 8 contextos básicos.
POLISH-04 profundiza el contenido de cada drawer con componentes internos ricos, da vida al sistema con metadatos dinámicos, y finaliza la preparación para demo Castillitos.

---

## TASK 01 — Componentes internos del drawer

Cinco componentes utilitarios definidos dentro de `tesoreria-client.tsx` (no exportados — uso exclusivo del módulo):

### `DrawerMetricGrid`

```tsx
function DrawerMetricGrid({ items }: {
  items: Array<{ label: string; value: string; accent?: string }>
})
```

- Grid de 2 columnas (`gridTemplateColumns: "1fr 1fr"`)
- Cada chip: `C.surface` background, `R.md` border radius, `1px solid C.lineSubtle` border
- Label: `T.mono`, `T.sz["2xs"]`, `C.inkFaint`, uppercase
- Value: `T.mono`, `T.sz.sm`, peso 700, color = `accent ?? C.ink`
- Padding: `S[3]` × `S[4]`

### `DrawerTimeline`

```tsx
function DrawerTimeline({ title, events }: {
  title?: string;
  events: Array<{ time: string; label: string; severity?: Severity }>
})
```

- Dot de color (`SEV_DOT[severity] ?? C.inkFaint`) + connector vertical (`minHeight: S[3]`, `width: 1px`, `C.lineSubtle`)
- Layout flex column — sin `position: absolute`
- Tiempo: `T.mono`, `T.sz["2xs"]`, `C.inkFaint`
- Label: `T.mono`, `T.sz.xs`, `C.inkMid`
- El último evento no muestra connector (`:last-of-type` no disponible en inline styles — se resuelve por índice)

### `DrawerRelatedItems`

```tsx
function DrawerRelatedItems({ title, items }: {
  title?: string;
  items: Array<{ label: string; value: string; tag: string }>
})
```

- Lista compacta con badge de tag (`C.surface`, `C.lineSubtle` border, `R.sm`)
- Value alineado a la derecha: `T.mono`, `T.sz.xs`, `C.ink`, peso 600
- Separador entre items: `1px solid C.lineSubtle`
- Contenedor: `C.surface` background, `R.md` radius, `1px solid C.lineSubtle` border

### `DrawerAIRecommendation`

```tsx
function DrawerAIRecommendation({ text }: { text: string })
```

- Background: `C.blueLight`
- `borderLeft: 3px solid ${C.blueDark}` — misma gramática que acento de secciones
- Label "Agentik IA": `T.mono`, `T.sz["2xs"]`, `C.blueDark`, uppercase, peso 700
- Texto: `T.mono`, `T.sz.xs`, `C.inkMid`, `lineHeight: 1.6`

### `DrawerTraceability`

```tsx
function DrawerTraceability({ source, updated }: {
  source: string;
  updated: string;
})
```

- Footer con `borderTop: 1px solid C.lineSubtle`, padding top `S[4]`, margin top `S[5]`
- "Fuente:" + source: `T.mono`, `T.sz["2xs"]`, `C.inkGhost`
- "Actualizado:" + updated: `T.mono`, `T.sz["2xs"]`, `C.inkGhost`

---

## TASK 02 — Constantes de contenido extendidas

### `BANK_TIMELINE`

```typescript
const BANK_TIMELINE: Record<string, Array<{
  time: string;
  label: string;
  severity?: Severity;
}>> = {
  bancolombia: [ /* 4 eventos de sincronización */ ],
  davivienda:  [ /* 3 eventos — incluye advertencia de conciliación pendiente */ ],
  payco:       [ /* extracto pendiente + anomalía */ ],
  ...
}
```

Cubre todos los IDs de `BANKS`. Si un banco no tiene entrada, el drawer muestra timeline vacío.

### `BANK_MOVEMENTS`

```typescript
const BANK_MOVEMENTS: Record<string, Array<{
  label: string;
  value: string;
  tag: string;
}>> = {
  bancolombia: [ /* 3 movimientos recientes */ ],
  ...
}
```

Usado en `DrawerRelatedItems` dentro del drawer de banco.

### Extensión de `AI_SIGNALS`

Campos nuevos agregados a cada señal:

| Campo | Tipo | Uso en drawer |
|-------|------|---------------|
| `impactAmt` | `string` | Mostrado en `DrawerMetricGrid` como "Impacto estimado" |
| `modulesAffected` | `string` | Badge chips en el grid |
| `cause` | `string` | Párrafo de causa raíz en `DNote` |
| `steps` | `string[]` | Lista numerada `DSteps` |
| `aiNote` | `string` | Texto para `DrawerAIRecommendation` |

### Extensión de `FORECAST_PERIODS`

Campos nuevos:

| Campo | Tipo | Uso en drawer |
|-------|------|---------------|
| `pressureTimeline` | `Array<{time, label, severity?}>` | `DrawerTimeline` en drawer de forecast |
| `aiNote` | `string` | `DrawerAIRecommendation` en drawer de forecast |

### `PLANS` (renombrado de PLAYBOOKS)

Campos nuevos:

| Campo | Tipo | Uso en drawer y card |
|-------|------|---------------------|
| `objective` | `string` | Descripción del objetivo en drawer |
| `modules` | `string` | Badge chips separados por " · " en card y drawer |
| `aiNote` | `string` | `DrawerAIRecommendation` en drawer de plan |

---

## TASK 03 — Contenido del drawer por contexto (mapa completo POLISH-04)

### `cash.*`

| Contexto | MetricGrid | Timeline | RelatedItems | AIRecommendation | Traceability |
|----------|-----------|----------|--------------|-----------------|--------------|
| `disponible` | 4 métricas (Bancos activos, Disponible libre, Comprometido, Proyección 7d) | — | Distribución por banco | Nota de optimización | SAG · hora actual |
| `hoy` | Cálculo (Apertura, Ingresos esperados, Egresos programados, Libre hoy) | — | — | Nota de riesgo intradía | cálculo interno |
| `comprometido` | Detalle (Órdenes pendientes, Obligaciones vence hoy, CxP próxima semana) | — | Obligaciones por categoría | Nota de flujo | AP · hora actual |
| `proyectado` | Horizonte 7d (día a día) | — | Variables de escenario | Nota proyección | modelo financiero |

### `signal.i`

- `DrawerMetricGrid`: Impacto estimado + Módulos afectados
- `DNote` (causa raíz): párrafo de causa
- `DSteps` (ruta de solución): lista numerada de `steps[]`
- `DrawerAIRecommendation`: `aiNote`
- `DActions`: CTA a ruta real

### `bank.id`

- `DrawerMetricGrid`: Saldo disponible + Saldo contable + Movimientos del día + Último extracto
- `DrawerTimeline`: `BANK_TIMELINE[bank.id]` — historial de sincronización
- `DrawerRelatedItems`: `BANK_MOVEMENTS[bank.id]` — movimientos recientes
- `DrawerAIRecommendation`: recomendación contextual según estado del banco
- `DActions`: CTAs a conciliación / extractos

### `obligation.i`

- `DrawerMetricGrid`: Monto + Categoría + Vencimiento completo (`dueLong`) + Estado
- `DrawerAIRecommendation`: nota según severidad
- `DActions`: CTA a cuentas por pagar

### `forecast.period`

- `DrawerMetricGrid`: Días de runway + Ingresos proyectados + Egresos proyectados + Balance
- `DrawerTimeline`: `pressureTimeline` — eventos de presión en el horizonte
- `DrawerAIRecommendation`: `aiNote`
- `DrawerTraceability`: modelo financiero · hora actual

### `plan.key`

- Estado actual (párrafo)
- `DSteps`: pasos del playbook
- `DrawerMetricGrid`: Módulos involucrados + Horizonte + Impacto esperado
- `DrawerAIRecommendation`: `aiNote`
- `DActions`: CTA si `href` existe

### `flow_tile.key`

- `DrawerMetricGrid`: métricas del ciclo según tipo (ingresos/egresos/identificados/sin_identificar/pendientes)
- `DrawerAIRecommendation`: nota contextual
- CTA a conciliación si `key === "sin_identificar"`

### `movement.i`

- `DrawerMetricGrid`: Monto + Tipo + Banco + Estado
- `DrawerAIRecommendation`: nota si movimiento está sin identificar
- CTA a conciliación si pendiente

---

## TASK 04 — Sistema vivo: metadatos dinámicos

### Helper `_fmtNow()`

```typescript
const _now = new Date();

function _fmtNow(): string {
  return `${_now.getHours().toString().padStart(2,"0")}:${_now.getMinutes().toString().padStart(2,"0")}`;
}
```

Calculado una sola vez al cargar el módulo — coherente con `_nextDow` y los demás helpers de fecha.

### Aplicación en secciones

| Sección | Metadato dinámico |
|---------|-------------------|
| Header subtitle | `ciclo ${_fmtNow()}` |
| Motor de Decisiones meta | `datos SAG · ${_fmtNow()}` |
| Estado Bancario meta | `● ${connectedCount} conectados · ▲ ${attnCount} requieren atención · sync hace 12 min` |
| Obligaciones meta | Total de obligaciones en `fmtM()` |
| `DrawerTraceability` | `updated: _fmtNow()` en drawers de banco y caja |

---

## TASK 05 — Centro de Decisiones: "Plan de acción"

### Cambio de terminología

`type: "playbook"` → `type: "plan"` en `DrawerCtx`.
`PLAYBOOKS` array → `PLANS`.

### Visual de cada card

```
[ CRITICAL/WARNING/etc. ]  [ horizonte ]
─────────────────────────────────────────
PLAN DE ACCIÓN                           ← label fijo en T.sz["2xs"] + C.inkFaint
[Título del plan]                        ← T.sz.sm, peso 700, C.ink
─────────────────────────────────────────
[Impacto esperado]                       ← C.green
[Estado actual]                          ← C.inkFaint
─────────────────────────────────────────
[Módulo A]  [Módulo B]  [Módulo C]       ← badge chips separados por " · "
─────────────────────────────────────────
[ CTA ]
```

Badge chips de módulos:
```tsx
{pb.modules.split(" · ").map(mod => (
  <span key={mod} style={{
    fontFamily:    T.mono,
    fontSize:      T.sz["2xs"],
    color:         C.inkMid,
    background:    C.surface,
    border:        `1px solid ${C.lineSubtle}`,
    borderRadius:  R.sm,
    padding:       `1px ${S[2]}px`,
  }}>{mod}</span>
))}
```

---

## TASK 06 — Estado Bancario: iconografía operativa

Meta del CollapsibleSection:

```typescript
const connectedCount = BANKS.filter(b => b.status !== "error").length;
const attnCount      = BANKS.filter(b => b.status === "warning" || b.status === "error").length;

meta={`● ${connectedCount} conectados · ▲ ${attnCount} requieren atención · sync hace 12 min`}
```

El operador ve estado de los bancos sin abrir la sección. `●` para conectados (C.green en contexto), `▲` para atención (sin color en meta — el texto habla solo).

---

## TASK 07 — CollapsibleSection: acento visual en headers

**Archivo:** `components/workspace/collapsible-section.tsx`

Cambio aplicado en el botón de header:

```tsx
// Antes
border:       `1px solid ${C.lineSubtle}`,

// Después
border:       `1px solid ${C.lineSubtle}`,
...(accent ? { borderLeft: `3px solid ${accent}` } : {}),
```

El `borderLeft: 3px` sobreescribe solo el lado izquierdo del `border: 1px` — top/right/bottom mantienen 1px. La diferencia de 2px no requiere ajuste de padding en layout enterprise.

Coherencia visual: el acento izquierdo es la misma gramática que:
- Señales en Motor de Decisiones
- Cards de obligación (`borderLeft: 3px solid SEV_DOT[sev]`)
- `DrawerAIRecommendation` (`borderLeft: 3px solid C.blueDark`)

---

## TASK 08 — Auditoria de affordance final

| Elemento | POLISH-03 | POLISH-04 |
|----------|-----------|-----------|
| Cards KPI (2×2) | onClick → drawer | Sin cambios |
| Filas banco | onClick → drawer | + DrawerTimeline + DrawerRelatedItems en contenido |
| Filas movimiento | onClick → drawer | + DrawerMetricGrid en contenido |
| Señales de riesgo | onClick → drawer | + DrawerMetricGrid + DrawerAIRecommendation deepened |
| Filas obligación | onClick → drawer | + DrawerMetricGrid + dueLong |
| Cards de forecast | onClick → drawer | + DrawerTimeline (pressureTimeline) + DrawerAIRecommendation |
| Cards de plan | onClick → drawer | + DrawerMetricGrid + módulos + DrawerAIRecommendation |
| Tiles de flujo | onClick → drawer | + DrawerMetricGrid |
| `PassiveAction` | ✅ para inactivos | Sin cambios |
| Links a rutas reales | ✅ `stopPropagation` | Sin cambios |

---

## TASK 09 — TypeScript compliance

- Cero nuevos errores introducidos.
- Total del proyecto: **160 errores** (baseline sin cambios).
- `DrawerCtx` con `type: "plan"` — discriminated union actualizada correctamente.
- `BANK_TIMELINE` y `BANK_MOVEMENTS` tipados como `Record<string, Array<...>>`.
- `DrawerMetricGrid`, `DrawerTimeline`, `DrawerRelatedItems` — props tipadas inline, sin export.
- `SEV_TO_DRAWER: Record<Severity, DrawerSeverity>` — sin cambios, sigue limpio.

---

## Pendientes backend real (sin cambios respecto a POLISH-03)

| Sección | Activación backend |
|---------|-------------------|
| Posición de Caja | `GET /api/orgs/[orgSlug]/tesoreria/position` |
| Motor de Decisiones | `GET /api/orgs/[orgSlug]/tesoreria/ai-signals` |
| Estado Bancario | Conector SAG + sync engine |
| Obligaciones | Prisma: `ApDocument` + `PaymentRecord` |
| Flujo del Día | `CollectionRecord` aggregate query |
| Proyección | Modelo de proyección financiera |
| Drawer contenido | Mismas fuentes — solo reemplazar objetos mock por queries |
| `BANK_TIMELINE` | SAG sync log + event store |
| `BANK_MOVEMENTS` | SAG movements query por banco |

---

## Narrativa demo Castillitos (actualizada)

> "Cada número en Tesorería tiene contexto. Al hacer click en Caja Disponible, se abre el detalle: distribución por banco, cuánto está comprometido, la proyección de los próximos 7 días. Al abrir un banco, se ve el historial de sincronización y los movimientos recientes.
>
> El Motor de Decisiones detecta riesgos activos — cartera vencida, pagos duplicados, bancos sin sincronización. Cada señal muestra la causa raíz, los módulos afectados, los pasos para resolver, y una recomendación de Agentik IA. Desde la señal se navega directamente al workspace de resolución.
>
> Los Planes de Acción agrupan las acciones disponibles por severidad: qué módulos involucran, cuál es el impacto esperado, qué hacer primero. Todo está conectado. El sistema se actualiza solo."

---

## Qué garantiza este sprint en demo

| Criterio | Estado |
|----------|--------|
| Cada drawer tiene al menos 3 bloques de contenido | ✅ MetricGrid + Nota/Timeline + Traceability mínimo |
| Ningún drawer abre vacío | ✅ Todos los contextos retornan `content` populated |
| El sistema se ve "vivo" sin backend | ✅ `_fmtNow()` + metadatos dinámicos en 4 secciones |
| La IA tiene presencia real | ✅ `DrawerAIRecommendation` en todos los contextos excepto `cash.hoy` |
| El lenguaje es 100% operativo español LATAM | ✅ UX-LANGUAGE-01 mantenida |
| Sin emojis en UI operativa | ✅ Solo `●` y `▲` como caracteres tipográficos |
