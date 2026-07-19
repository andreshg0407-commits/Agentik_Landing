# AGENTIK-UX-LANGUAGE-01
## Normalización de Lenguaje Financiero — Español Enterprise LATAM

**Sprint:** AGENTIK-UX-LANGUAGE-01
**File scope:** `app/(app)/[orgSlug]/finanzas/tesoreria/page.tsx` (origin)
**Alcance global:** Convención aplicable a todo el módulo Finanzas y futuros módulos

---

## Principio rector

Agentik es un sistema operativo empresarial LATAM.

La experiencia visual debe sentirse como software desarrollado para empresas latinoamericanas, no como SaaS americano traducido al español.

Regla simple:

> "¿Esto lo entendería naturalmente un gerente financiero LATAM sin parecer software importado?"

Si la respuesta es no → corregir.

---

## Convención UX-LANGUAGE-01

### Palabras PROHIBIDAS en la capa visual

| Anglicismo ❌ | Reemplazo ✅ |
|--------------|-------------|
| `runtime` | operativo · operación · activo |
| `forecast` | proyección |
| `runway` | horizonte |
| `engine` | motor |
| `signals` | señales |
| `insights` | señales · hallazgos |
| `financial` | financiero (sólo como adjetivo en español) |
| `banking` | bancario |
| `dashboard` | panel · vista ejecutiva |
| `pipeline` | flujo · proceso |
| `sync` | sincronización · sincronía |
| `cash` | caja · efectivo · liquidez |
| `status` | estado |
| `overview` | resumen · panorama |

### Palabras CORRECTAS en la capa visual

| Español operacional ✅ |
|----------------------|
| Operativo / Operativa |
| Proyección |
| Horizonte |
| Motor |
| Señales |
| Estado |
| Flujo |
| Conciliación |
| Posición |
| Riesgo |
| Operación |
| Sincronía / Sincronización |

---

## Cambios aplicados en AGENTIK-UX-LANGUAGE-01

| Ubicación | Antes | Después |
|-----------|-------|---------|
| Status strip label | `FORECAST 7D` | `PROYECCIÓN 7D` |
| Motor IA (sección 4) — header | `Financial Decision Engine` | `Motor de Decisiones` |
| Motor IA — CTA acción 4 | `Resolver sync` | `Activar sincronización` |
| Estado bancario (sección 6) — header | `Banking Runtime` | `Estado Bancario Operativo` |
| Estado bancario — columna tabla | `Última sync` | `Sincronía` |
| Proyección liquidez (sección 8) — header | `Financial Runway` | `Proyección de Liquidez` |
| Proyección — label junto a número | `runway` | `horizonte` |
| Centro de Decisiones — tier 3 label | `Estratégico · Forecast` | `Estratégico · Proyección` |
| Centro de Decisiones — acción tier 3 | `Actualizar forecast` | `Actualizar proyección` |

---

## Nombres de secciones — nomenclatura final

Estas son las referencias canónicas para Tesorería Operativa:

| Sección | Nombre visual |
|---------|--------------|
| 1 | (OperationalWorkspaceHeader) |
| 2 | Franja de estado operativo (sin título visible) |
| 3 | Posición de Caja |
| 4 | Motor de Decisiones |
| 5 | Flujo del Día |
| 6 | Estado Bancario Operativo |
| 7 | Obligaciones Pendientes |
| 8 | Proyección de Liquidez |
| 9 | Centro de Decisiones |

---

## Tono enterprise LATAM

El español visual de Agentik NO es:

- informal ("¡Mira tus pagos!")
- burocrático ("Módulo de gestión de tesorería contable")
- técnico-anglosajón ("Banking runtime synced")
- genérico ("No hay datos disponibles")

El español visual de Agentik ES:

- ejecutivo claro ("Posición de Caja · 5 cuentas")
- operacional directo ("Riesgo de liquidez el jueves")
- contextual preciso ("42% del flujo depende de cartera vencida")
- activo y urgente cuando corresponde ("3 sin identificar → Conciliar")

---

## Convención de siglas y abreviaturas

Estas abreviaturas son válidas en Agentik — son convenciones contables LATAM reconocidas por gerentes financieros:

| Sigla | Significado |
|-------|-------------|
| `CxP` | Cuentas por pagar |
| `CxC` | Cuentas por cobrar |
| `IVA` | Impuesto al valor agregado |
| `NIT` | Número de identificación tributaria |

NO usar:
- `AP` (accounts payable) → usar `CxP`
- `AR` (accounts receivable) → usar `CxC`
- `P&L` → usar `Estado de resultados` o `PyG`

---

## Extensión global — próximos módulos

Esta convención aplica a todos los módulos que se construyan o refinen:

| Módulo | Aplicación |
|--------|-----------|
| Conciliación Inteligente | No "matching engine" → "motor de conciliación" |
| Planeación Financiera | No "forecast model" → "modelo de proyección" |
| Centro Documental | No "document pipeline" → "flujo documental" |
| Cierre Financiero | No "closing engine" → "motor de cierre" |
| Torre de Control | No "financial signals" → "señales financieras" |
| Cobranza | No "collections pipeline" → "gestión de cobros" |
| Operaciones | No "operations dashboard" → "estado operativo" |

---

## Qué NO se cambió

- Nombres de variables, constantes y tipos en código (`CASH`, `BANKS`, `BankStatus`, `forecast_periods`, etc.) — el código puede mantenerse en inglés
- Lógica, componentes, estructura, datos, APIs, Prisma — sin cambios
- Comentarios técnicos en el código — sin cambios

---

## TypeScript compliance

- Zero nuevos errores introducidos.
- Total proyecto: 160 errores (baseline sin cambios).
