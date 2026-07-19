# Agentik Copilot — Language System

**Sprint:** AGENTIK-COPILOT-LANGUAGE-SYSTEM-01
**Archivo fuente:** `lib/copilot/language/`
**Tipo:** Capa fundacional de arquitectura — sin UI, sin runtime, sin base de datos

---

## Propósito

El Language System es la capa oficial que separa el **lenguaje interno de ingeniería** del **lenguaje visible para usuarios empresariales**.

Sin esta capa, términos válidos de arquitectura (`insight`, `capability`, `snapshot`, `runtime`, `registry`) llegarían directamente a la interfaz y resultarían incomprensibles o inapropiados para los usuarios de Agentik en empresas latinoamericanas.

### El problema concreto

Un gerente de operaciones en Castillitos no entiende:

> "3 **insights** detectados — revisar **capabilities** disponibles en el **runtime**"

Sí entiende:

> "3 **hallazgos financieros** detectados — revisar **acciones disponibles**"

El Language System garantiza que la segunda versión sea la que siempre llegue a pantalla.

---

## Principio fundamental

Toda palabra visible para el usuario debe cumplir:

1. Entendible por un gerente no técnico.
2. Entendible por una empresa latinoamericana.
3. Sin terminología de IA.
4. Sin terminología SaaS.
5. Sin terminología de arquitectura.
6. Debe sonar como lenguaje empresarial cotidiano.

---

## Arquitectura

```
lib/copilot/language/
├── language-types.ts           # Interfaces y tipos — sin lógica
├── forbidden-terms.ts          # Términos prohibidos en UI
├── base-language.ts            # Diccionario empresarial genérico
├── agent-language-profiles.ts  # Vocabulario por agente (Diego, Luca, Mila…)
├── module-language-profiles.ts # Vocabulario por módulo (finanzas, cartera…)
├── language-resolver.ts        # Funciones puras de resolución
└── index.ts                    # Exports centralizados
```

### Cadena de resolución

Cuando un componente necesita mostrar un término, el resolver aplica esta cadena de prioridad:

```
module override  →  agent profile  →  base language  →  raw key (fallback)
```

La capa más específica gana. Si el módulo `conciliacion` define `insight` → `"movimiento por revisar"`, ese valor se usa aunque el agente Diego lo definiría como `"hallazgo financiero"`.

---

## Términos prohibidos

Los siguientes términos **JAMÁS** deben aparecer visibles para el usuario final.
Fuente autoritativa: `lib/copilot/language/forbidden-terms.ts`

### Terminología de IA / ML

| Término prohibido | Reemplazar con |
|---|---|
| `insight` / `insights` | hallazgo / hallazgos |
| `capability` / `capabilities` | acción disponible / capacidades disponibles |
| `recommendation engine` | recomendación |
| `scoring` | — (no exponer) |
| `embedding` / `embeddings` | — (no exponer) |
| `llm` | — (no exponer) |
| `prompt` | — (no exponer) |
| `inference` | — (no exponer) |
| `model` | — (no exponer en contexto IA) |

### Terminología de arquitectura

| Término prohibido | Reemplazar con |
|---|---|
| `runtime` | — (no exponer) |
| `snapshot` | resumen del momento |
| `registry` | — (no exponer) |
| `discovery` | — (no exponer) |
| `context resolver` | situación actual |
| `domain registry` | — (no exponer) |
| `action registry` | — (no exponer) |
| `viewmodel` / `view model` | — (no exponer) |
| `workspace` | oficina del agente |
| `agent presence` | estado del agente |
| `copilot slot` | — (no exponer) |
| `knowledge base` / `knowledge layer` | — (no exponer) |

### Términos de desarrollo / testing

| Término prohibido |
|---|
| `developer tools` |
| `debug` |
| `fixture` / `dev fixture` |
| `mock` / `stub` |
| `snapshot id` |
| `sprint` |

### Anglicismos SaaS / tecnología

| Término prohibido |
|---|
| `onboarding` |
| `pipeline` |
| `webhook` |
| `api` |
| `token` |
| `endpoint` |
| `deploy` / `deployment` |

---

## Diccionario base (BASE_LANGUAGE)

El diccionario base cubre todos los conceptos operacionales que Agentik puede mostrar, mapeados a español empresarial latinoamericano.

### Conceptos operacionales

| Clave interna | Etiqueta de usuario |
|---|---|
| `insight` | hallazgo |
| `insights` | hallazgos |
| `suggestion` | recomendación |
| `suggestions` | recomendaciones |
| `followup` | seguimiento |
| `followups` | seguimientos |
| `active_work` | trabajando ahora |
| `completed_work` | trabajo completado |
| `pending_approval` | esperando aprobación |
| `pending_approvals` | pendientes de aprobación |
| `request_inbox` | solicitudes |
| `agent_presence` | estado del agente |
| `opportunity` | oportunidad |
| `opportunities` | oportunidades detectadas |
| `attention` | punto de atención |
| `attention_items` | puntos de atención |
| `workspace` | oficina del agente |
| `context` | situación actual |
| `capability` | capacidad disponible |
| `snapshot` | resumen del momento |
| `domain` | área |

### Headers de sección

| Clave interna | Header visible |
|---|---|
| `section_active_work` | Trabajando en esto ahora |
| `section_pending_approvals` | Esperando tu aprobación |
| `section_completed_work` | Completado recientemente |
| `section_followups` | Seguimientos programados |
| `section_suggestions` | Recomendaciones |
| `section_insights` | Hallazgos |
| `section_opportunities` | Oportunidades detectadas |
| `section_request_inbox` | Solicitudes |
| `section_agent_presence` | Estado del agente |
| `section_attention_items` | Puntos de atención |

---

## Perfiles de agente

Cada agente tiene un vocabulario propio adaptado a su dominio. Los perfiles están en `lib/copilot/language/agent-language-profiles.ts`.

### Diego — Inteligencia Financiera

| Concepto | Etiqueta de Diego |
|---|---|
| insights | Hallazgos financieros |
| suggestions | Recomendaciones financieras |
| opportunities | Proyecciones y oportunidades |
| attention_items | Riesgos detectados |
| followups | Seguimientos financieros |
| pending_approvals | Pendientes de aprobación |
| active_work | Trabajando en esto ahora |
| completed_work | Completado recientemente |

### Luca — Inteligencia de Marketing

| Concepto | Etiqueta de Luca |
|---|---|
| insights | Oportunidades detectadas |
| suggestions | Campañas sugeridas |
| opportunities | Oportunidades de crecimiento |
| attention_items | Campañas por revisar |
| followups | Próximas publicaciones |
| pending_approvals | Contenido pendiente de aprobación |
| active_work | Campañas activas |
| completed_work | Publicaciones realizadas |

### Mila — Inteligencia Comercial

| Concepto | Etiqueta de Mila |
|---|---|
| insights | Clientes por contactar |
| suggestions | Oportunidades de venta |
| opportunities | Oportunidades comerciales |
| attention_items | Cuentas en riesgo |
| followups | Seguimientos comerciales |
| pending_approvals | Cotizaciones pendientes |
| active_work | Gestiones en curso |
| completed_work | Gestiones completadas |

### Pablo — Inteligencia Ejecutiva

| Concepto | Etiqueta de Pablo |
|---|---|
| insights | Aspectos relevantes |
| suggestions | Prioridades estratégicas |
| opportunities | Decisiones clave |
| attention_items | Puntos críticos |
| followups | Seguimientos ejecutivos |
| pending_approvals | Decisiones pendientes |
| active_work | En proceso |
| completed_work | Resuelto recientemente |

### Sofía — Inteligencia Creativa

| Concepto | Etiqueta de Sofía |
|---|---|
| insights | Revisiones pendientes |
| suggestions | Activos creativos sugeridos |
| opportunities | Activos creativos disponibles |
| attention_items | Contenidos por revisar |
| followups | Publicaciones programadas |
| pending_approvals | Revisiones pendientes |
| active_work | Contenido en producción |
| completed_work | Contenido publicado |

---

## Perfiles de módulo

Los módulos pueden sobreescribir el vocabulario del agente para adaptarse al contexto operativo específico. Los perfiles están en `lib/copilot/language/module-language-profiles.ts`.

| Módulo | `insights` | `suggestions` | `attention_items` |
|---|---|---|---|
| `finanzas` | Hallazgos financieros | Recomendaciones financieras | Riesgos financieros |
| `conciliacion` | Movimientos por revisar | Acciones de conciliación | Excepciones detectadas |
| `cartera` | Cobros pendientes | Acciones de cobro | Cuentas vencidas |
| `tesoreria` | Movimientos de caja | Acciones de tesorería | Alertas de liquidez |
| `cierre` | Diferencias detectadas | Ajustes sugeridos | Inconsistencias contables |
| `planeacion` | Proyecciones | Escenarios sugeridos | Riesgos de proyección |
| `marketing` | Oportunidades de campaña | Campañas sugeridas | Campañas por revisar |
| `comercial` | Clientes prioritarios | Oportunidades de venta | Clientes en riesgo |
| `produccion` | Alertas de producción | Ajustes sugeridos | Órdenes por atender |

---

## Ejemplos de uso

### Resolver un término con contexto completo

```typescript
import { resolveUserFacingTerm } from "@/lib/copilot/language";

// Módulo gana sobre agente
resolveUserFacingTerm("insight", { agentId: "diego", moduleId: "conciliacion" });
// → "movimiento por revisar"

// Sin módulo — usa perfil de agente
resolveUserFacingTerm("insight", { agentId: "mila" });
// → "cliente por contactar"

// Sin contexto — usa base language
resolveUserFacingTerm("insight");
// → "hallazgo"

// Conveniencia: getLanguageLabel es alias de resolveUserFacingTerm
import { getLanguageLabel } from "@/lib/copilot/language";
getLanguageLabel("pending_approvals", { agentId: "pablo" });
// → "Decisiones pendientes"
```

### Resolver todos los labels de sección a la vez

```typescript
import { resolveSectionLabels } from "@/lib/copilot/language";

const labels = resolveSectionLabels({ agentId: "diego", moduleId: "cartera" });
labels.insights         // → "Cobros pendientes"   (cartera wins over diego)
labels.pendingApprovals // → "Esperando tu aprobación"  (base language)
labels.followups        // → "Seguimientos de cobro"  (cartera wins)
```

### Validar que un string no contiene términos prohibidos

```typescript
import { isForbiddenUserFacingTerm, findForbiddenTerms } from "@/lib/copilot/language";

isForbiddenUserFacingTerm("3 insights detectados");   // → true
isForbiddenUserFacingTerm("3 hallazgos detectados");  // → false

findForbiddenTerms("Runtime: insights y capabilities activas");
// → ["runtime", "insight", "capabilities"]
```

### Acceder al perfil completo de un agente

```typescript
import { getAgentLanguageProfile } from "@/lib/copilot/language";

const profile = getAgentLanguageProfile("luca");
profile?.sectionLabels.activeWork   // → "Campañas activas"
profile?.sectionLabels.completedWork // → "Publicaciones realizadas"
profile?.dictionary["insight"]       // → "oportunidad de campaña"
```

---

## Regla arquitectónica obligatoria

A partir de este sprint, **ningún componente de Copilot** puede mostrar directamente:

```
insight        capability      runtime         snapshot
registry       discovery       workspace       context resolver
recommendation engine          action registry domain registry
viewmodel      fixture         developer tools debug
agent presence knowledge base  knowledge layer copilot slot
```

Todos estos conceptos deben pasar por el Language Resolver antes de renderizarse.

### Patrón correcto

```tsx
// ✅ CORRECTO
import { resolveUserFacingTerm } from "@/lib/copilot/language";

const label = resolveUserFacingTerm("insights", { agentId, moduleId });
<span>{label}</span>  // → "Hallazgos financieros"
```

### Patrón prohibido

```tsx
// ❌ PROHIBIDO
<span>Insights detectados</span>

// ❌ PROHIBIDO
<span>{item.type === "insight" ? "Insight" : "..."}</span>

// ❌ PROHIBIDO
<span>Runtime activo</span>
```

---

## Extensibilidad

### Agregar un nuevo término al diccionario base

Editar `lib/copilot/language/base-language.ts` y agregar la entrada al objeto `BASE_LANGUAGE`:

```typescript
my_new_concept: "mi concepto empresarial",
```

### Agregar un término prohibido

Editar `lib/copilot/language/forbidden-terms.ts` y agregar al array `FORBIDDEN_TERMS`:

```typescript
{
  term:        "nuevo término técnico",
  reason:      "Por qué no debe exponerse",
  suggestKeys: ["clave_alternativa"],
},
```

### Agregar un nuevo agente

Editar `lib/copilot/language/agent-language-profiles.ts`, definir un nuevo perfil siguiendo el patrón existente, y agregarlo al objeto `AGENT_LANGUAGE_PROFILES`.

### Agregar un nuevo módulo

Editar `lib/copilot/language/module-language-profiles.ts`, definir un nuevo `ModuleLanguageProfile`, y agregarlo a `MODULE_LANGUAGE_PROFILES`.

---

## Archivos del sistema

| Archivo | Propósito |
|---|---|
| `language-types.ts` | Interfaces y tipos — sin lógica |
| `forbidden-terms.ts` | Lista de términos que jamás deben aparecer en UI |
| `base-language.ts` | Diccionario empresarial genérico (fallback universal) |
| `agent-language-profiles.ts` | Vocabulario específico por agente |
| `module-language-profiles.ts` | Vocabulario específico por módulo operativo |
| `language-resolver.ts` | Funciones puras de resolución y validación |
| `index.ts` | Exports centralizados — importar solo desde aquí |

---

*Este documento es la fuente oficial para cualquier desarrollo futuro de Agentik Copilot que involucre lenguaje visible al usuario.*
