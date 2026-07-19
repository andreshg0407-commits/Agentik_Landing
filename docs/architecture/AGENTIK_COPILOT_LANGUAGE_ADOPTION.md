# Agentik Copilot — Language Adoption

**Sprint:** AGENTIK-COPILOT-LANGUAGE-ADOPTION-01
**Prerequisite:** `AGENTIK_COPILOT_LANGUAGE_SYSTEM.md`
**Type:** Migration record + architectural contract

---

## Objetivo completado

Todo el vocabulario visible de Agentik Copilot está ahora gobernado por el Language System.
Ningún componente depende de strings hardcodeados para títulos, secciones o conceptos operativos.

---

## Componentes migrados

| Componente | Términos migrados | Estado |
|---|---|---|
| `CopilotActiveWork` | section header → `section_active_work` | ✓ |
| `CopilotPendingApprovals` | section header → `section_pending_approvals` | ✓ |
| `CopilotCompletedWork` | section header → `section_completed_work` | ✓ |
| `CopilotFollowups` | section header → `section_followups` | ✓ |
| `CopilotRequestInbox` | section header → `section_request_inbox` | ✓ |
| `CopilotSuggestionsList` | section header, empty state, context note, overflow | ✓ |
| `CopilotInsightsList` | section header (forbidden fix), empty state (forbidden fix), overflow (forbidden fix), related label | ✓ |
| `CopilotWorkBoard` | board label, 3 column titles, 5 badge types, 3 empty states | ✓ |
| `CopilotAgentStatus` | working label, in-progress badge, last update, next objective | ✓ |
| `CopilotMemoryTimeline` | section header, subtitle | ✓ |
| `CopilotNextAction` | action header, priority label prefix | ✓ |
| `CopilotAgentChat` | chat header, other topic chip, capabilities label | ✓ |
| `CopilotPanel` | resolveSectionLabels() integration, passes labels to all children | ✓ |

---

## Términos prohibidos encontrados y corregidos

| Término prohibido | Archivo | Texto original | Texto corregido |
|---|---|---|---|
| `insights` | `copilot-insights-list.tsx` | "Contexto e insights" | `sectionLabel` (→ "Hallazgos") |
| `insights` | `copilot-insights-list.tsx` | "Sin insights para el contexto actual." | `insights_empty` (→ "Sin hallazgos para esta situación.") |
| `insights` | `copilot-insights-list.tsx` | "+N insights adicionales" | `insights_overflow` (→ "hallazgos adicionales") |

---

## Términos que permanecen técnicos (permitidos)

Los siguientes términos son exclusivamente internos del Preview, no visibles para el usuario final:

| Término | Ubicación | Razón |
|---|---|---|
| "Developer Tools" | `preview-client.tsx` | Herramienta interna, no llega a producción |
| "Fixture Snapshot" | `preview-client.tsx` | Herramienta interna |
| "Snapshot ID" | `preview-client.tsx` | Herramienta interna |
| "Language System" | `preview-client.tsx` | Herramienta interna de Language Adoption |

---

## Integración por agente (E16)

El Preview incluye constantes configurables para alternar el agente activo:

```typescript
// app/(app)/[orgSlug]/agentik/copilot-preview/preview-client.tsx

const PREVIEW_AGENT_ID:  string        = "diego"; // "luca" | "mila" | "pablo"
const PREVIEW_MODULE_ID: LanguageModule = "conciliacion";
```

Al cambiar `PREVIEW_AGENT_ID`, el Developer Tools muestra automáticamente:
- Perfil del agente activo
- Labels de sección específicos del agente
- Resolución final (módulo override > agente > base)

### Verificación por agente

| Agente | `insights` label | `suggestions` label | `activeWork` label |
|---|---|---|---|
| diego | Hallazgos financieros | Recomendaciones financieras | Trabajando en esto ahora |
| luca | Oportunidades detectadas | Campañas sugeridas | Campañas activas |
| mila | Clientes por contactar | Oportunidades de venta | Gestiones en curso |
| pablo | Aspectos relevantes | Prioridades estratégicas | En proceso |
| sofia | Revisiones pendientes | Activos creativos sugeridos | Contenido en producción |

---

## Integración por módulo (E17)

Al cambiar `PREVIEW_MODULE_ID`, el Developer Tools muestra:
- Nombre del módulo activo
- Todos los overrides del módulo (keys + valores)

### Verificación de precedencia módulo > agente

```
resolveSectionLabels({ agentId: "diego", moduleId: "cartera" })
  .insights
// → "Cobros pendientes"   ← módulo cartera gana sobre agente diego ("Hallazgos financieros")
```

| Módulo | `insights` override | Gana sobre agente |
|---|---|---|
| `finanzas` | Hallazgos financieros | diego: igual, luca: cambia |
| `conciliacion` | Movimientos por revisar | todos los agentes |
| `cartera` | Cobros pendientes | todos los agentes |
| `tesoreria` | Movimientos de caja | todos los agentes |
| `marketing` | Oportunidades de campaña | todos los agentes |
| `comercial` | Clientes prioritarios | todos los agentes |

---

## Auditoría automática (E18)

El módulo `lib/copilot/language/language-audit.ts` provee:

```typescript
import {
  auditUserFacingText,     // Detecta términos prohibidos en un string
  auditComponentLabels,    // Audita todos los labels de un componente
  generateLanguageAudit,   // Genera reporte completo para múltiples componentes
  formatAuditReport,       // Formatea el reporte como string legible
  findForbiddenTermsInText, // Lista términos prohibidos encontrados
  COPILOT_COMPONENT_LABELS, // Snapshot de labels actuales para CI
} from "@/lib/copilot/language";
```

### Uso en tests o CI

```typescript
import { auditUserFacingText } from "@/lib/copilot/language";

// En un test:
expect(auditUserFacingText("Hallazgos financieros").length).toBe(0); // ✓
expect(auditUserFacingText("Insights detectados").length).toBeGreaterThan(0); // ✓
```

```typescript
import { generateLanguageAudit, formatAuditReport } from "@/lib/copilot/language";

const report = generateLanguageAudit({
  "CopilotInsightsList": ["Hallazgos", "Sin hallazgos para esta situación."],
  "CopilotSuggestionsList": ["Recomendaciones", "Sin recomendaciones activas"],
});

console.log(formatAuditReport(report));
// Language Audit — 2026-06-01T...
// Components: 2 | Pass: 2 | Fail: 0
// ✓ All components pass the language contract.
```

---

## Cómo funciona el panel

`CopilotPanel` es el punto central de resolución:

```typescript
// copilot-panel.tsx

const agentId  = viewModel.leadAgent.agentId;
const moduleId = /* last segment of viewModel.module path */;
const sections = resolveSectionLabels({ agentId, moduleId });

// sections.activeWork      → "Campañas activas" (para Luca)
// sections.insights        → "Movimientos por revisar" (para módulo conciliacion)
// sections.pendingApprovals → "Cotizaciones pendientes" (para Mila)
```

Luego pasa los labels como props a los componentes hijos:

```tsx
<CopilotActiveWork     items={...} sectionLabel={sections.activeWork}       />
<CopilotPendingApprovals items={...} sectionLabel={sections.pendingApprovals} />
<CopilotSuggestionsList  suggestions={...} sectionLabel={sections.suggestions} />
<CopilotInsightsList     insights={...}    sectionLabel={sections.insights}     />
<CopilotCompletedWork  items={...} sectionLabel={sections.completedWork}    />
<CopilotFollowups      items={...} sectionLabel={sections.followups}        />
```

Los componentes usan `BASE_LANGUAGE` como default cuando no reciben prop — garantizando que nunca queden vacíos.

---

## Reglas para desarrollos futuros

### Al agregar un nuevo componente de Copilot

1. **No hardcodear** ningún string de sección, estado, o concepto operativo.
2. Importar `BASE_LANGUAGE` o recibir `sectionLabel?: string` como prop.
3. Consultar la lista de términos prohibidos en `forbidden-terms.ts`.
4. Usar `auditUserFacingText(miLabel)` para validar antes de hacer PR.

### Al agregar un nuevo agente

1. Crear un `AgentLanguageProfile` en `agent-language-profiles.ts`.
2. Agregarlo a `AGENT_LANGUAGE_PROFILES`.
3. No modificar ningún componente — los labels se resuelven automáticamente.

### Al agregar un nuevo módulo

1. Crear un `ModuleLanguageProfile` en `module-language-profiles.ts`.
2. Agregarlo a `MODULE_LANGUAGE_PROFILES`.
3. No modificar ningún componente.

### Al cambiar vocabulario de un agente o módulo

1. Editar únicamente el perfil en `agent-language-profiles.ts` o `module-language-profiles.ts`.
2. El cambio se propaga automáticamente a toda la UI de Copilot.
3. **Nunca editar los componentes React para cambiar vocabulario.**

---

## Archivos del sistema de adopción

| Archivo | Propósito |
|---|---|
| `lib/copilot/language/language-audit.ts` | Auditoría automática de términos prohibidos |
| `docs/architecture/AGENTIK_COPILOT_LANGUAGE_SYSTEM.md` | Fundación del Language System |
| `docs/architecture/AGENTIK_COPILOT_LANGUAGE_ADOPTION.md` | Este documento — registro de adopción |

---

## Estado final

```
TSC baseline: 160 errores (sin regresiones)
Términos prohibidos en UI: 0
Componentes migrados: 13
Componentes con sectionLabel prop: 7
Componentes con BASE_LANGUAGE: 5 adicionales
Resolución central: CopilotPanel → resolveSectionLabels()
Agentes con perfiles completos: 7 (diego, luca, mila, pablo, sofia, david, laura)
Módulos con perfiles completos: 9
```

*Agentik Copilot habla como un colaborador empresarial. No como una plataforma de IA.*
