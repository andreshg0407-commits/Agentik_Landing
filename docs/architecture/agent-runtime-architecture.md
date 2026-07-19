# Agentik Agent Runtime Architecture

**Sprint:** AGENTIK-AGENT-RUNTIME-ARCHITECTURE-01
**Fecha:** 2026-05-23
**Estado:** Arquitectura base — no instala Mastra todavía
**Referencia en código:** `lib/agent-runtime/`

---

## Visión

Agentik no es una colección de dashboards con IA encima.
Agentik es un sistema operativo empresarial donde la inteligencia es transversal.

La diferencia:

```
Dashboard con IA:     Módulo → muestra datos → el usuario decide → ejecuta manualmente
Agentik OS:           Señales → Agente interpreta → recomienda → usuario aprueba → Agent ejecuta → queda en audit trail
```

Cada módulo es un workspace operativo. Los agentes son la capa de inteligencia que atraviesa todos los módulos,
interpreta el estado, recomienda decisiones y puede ejecutar acciones controladas.

---

## 1. Responsabilidades por capa

### 1.1 Copilot

**Qué es:** La interfaz ejecutiva transversal. Es el punto de entrada del usuario a la inteligencia de Agentik.

**Responsabilidades:**
- Interfaz conversacional / ejecutiva
- Muestra sugerencias contextuales del agente activo
- Explica por qué se generó una señal o recomendación
- Permite al usuario solicitar acciones con confirmación
- Presenta el estado del módulo activo de forma resumida
- Vive exclusivamente en el rail derecho (264px) — NUNCA invade el canvas operativo

**Lo que NO hace:**
- NO renderiza tablas operativas ni datos primarios
- NO ejecuta acciones directamente (pasa por Action Layer)
- NO sustituye al módulo como fuente de verdad visual
- NO genera datos propios — solo interpreta y presenta

**Arquitectura actual:** `lib/copilot/`, `components/copilot/`, `right-ops-rail.tsx`
**Resolver activo:** `resolveCopilotContext()` → `resolveAgentForRoute()` → `CopilotAgentDef`

---

### 1.2 Agente especializado

**Qué es:** Un agente de dominio con identidad, especialidad y acceso a tools específicas de su módulo.

**Responsabilidades:**
- Entiende profundamente un dominio (finanzas, comercial, marketing, cobranza...)
- Interpreta señales del módulo y las convierte en diagnósticos
- Genera recomendaciones contextuales con justificación
- Ejecuta tools permitidas para su dominio
- Produce AgentActions con status, severidad y payload
- Mantiene memoria del dominio (decisiones pasadas, preferencias, reglas)

**Lo que NO hace:**
- NO toca módulos fuera de su dominio sin delegación explícita
- NO ejecuta acciones irreversibles sin aprobación (salvo excepciones declaradas en `requiresApproval: false`)
- NO guarda credenciales ni datos sensibles directamente

**Agentes activos:**

| AgentRuntimeId | Nombre | Dominio | Módulos |
|----------------|--------|---------|---------|
| `diego_finance` | Diego | finance | /finanzas/* |
| `luca_marketing` | Luca | marketing | /agentik/marketing-studio/* |
| `david_commercial` | David | commercial | /comercial/* |
| `mila_collections` | Mila | collections | /pipeline/* |
| `agentik_copilot` | Copilot ejecutivo | executive | /, /torre-control, cualquier ruta sin agente específico |

**Agentes futuros:**
- `ops_operations` → /operaciones/* (producción, logística)
- `sofia_integrations` → /integrations/* (conectores, sync)

---

### 1.3 Módulo

**Qué es:** Un workspace operativo que vive en el canvas. Renderiza datos reales, estados y acciones del negocio.

**Responsabilidades:**
- Mostrar operación en tiempo real con datos de Prisma / SAG / APIs
- Contener estados operacionales (loading, empty, ready, blocked, syncing, stale, degraded)
- Exponer acciones disponibles (botones, formularios, aprobaciones)
- Ser completamente funcional sin depender del agente

**Regla clave:** El módulo SIEMPRE renderiza su contenido esencial aunque el agente no esté disponible.
El agente es una capa adicional de inteligencia — no es requisito para operar.

**Lo que NO hace:**
- NO contiene lógica de IA ni engine de decisiones
- NO importa Prisma en client components
- NO mezcla inteligencia del agente con datos del canvas

---

### 1.4 Tool

**Qué es:** Una función ejecutable controlada que un agente puede llamar para leer datos o ejecutar una acción puntual.

**Responsabilidades:**
- Encapsular una operación específica (lectura o escritura)
- Ser multi-tenant: requiere `organizationId` siempre
- Declarar sus permisos explícitamente
- Retornar un resultado tipado con éxito / error

**Atributos de una Tool:**

```typescript
AgentTool {
  id:            string             // Identificador único. ej: "finance.getCashFlowRisk"
  name:          string             // Nombre legible. ej: "Get Cash Flow Risk"
  domain:        AgentDomain        // Dominio al que pertenece
  description:   string             // Descripción para el agente (qué hace, cuándo usar)
  inputSchema:   ZodSchema          // Validación de entrada (zod)
  outputSchema:  ZodSchema          // Tipo de salida
  permission:    ToolPermission     // "read" | "write" | "admin"
  executionMode: ToolExecutionMode  // "instant" | "queued" | "supervised"
  requiresApproval: boolean         // Si true → pasa por Action Layer antes de ejecutar
  handlerRef:    string             // Path al handler: "lib/finance/tools/getCashFlowRisk"
}
```

**Tipos de tools por ejecución:**
- `instant`: se ejecuta de inmediato, sin aprobación (ej: leer datos)
- `queued`: se encola y ejecuta async (ej: generar reporte)
- `supervised`: requiere aprobación humana antes de ejecutar (ej: crear solicitud de producción)

---

### 1.5 Workflow

**Qué es:** Una secuencia de pasos que puede ejecutarse de forma orquestada con estados, retries y logs.

**Dos tipos de workflow:**

**a) Workflow operacional (n8n)**
- Webhooks, APIs externas, jobs programados, publicación en redes, SAG sync
- Orquestado por n8n — no necesita Mastra
- Ejemplos: sincronizar SAG → Prisma, publicar post en Instagram, enviar alerta de cobranza por WhatsApp

**b) Workflow de agente (interno / Mastra)**
- Secuencia de tool calls orquestada por un agente
- Estados: `queued → running → completed | failed | cancelled`
- Puede tener branch conditions basadas en output de tools
- Ejemplos: generar diagnóstico → recomendar acciones → esperar aprobación → ejecutar

**Atributos de un Workflow:**

```typescript
AgentWorkflow {
  id:          string
  agentId:     AgentRuntimeId
  domain:      AgentDomain
  steps:       WorkflowStep[]
  status:      WorkflowStatus       // queued | running | completed | failed | cancelled
  retryPolicy: RetryPolicy
  auditRef:    string               // FK a audit trail
}
```

---

### 1.6 Memory

**Qué es:** El sistema de persistencia contextual para agentes y módulos. Permite que los agentes aprendan del comportamiento del tenant y de sus propias decisiones pasadas.

**5 capas de memoria:**

| Capa | Alcance | Contenido | Persistencia |
|------|---------|-----------|-------------|
| `tenant` | Toda la organización | Reglas del negocio, fuentes de datos, umbrales configurados | Prisma |
| `module` | Por módulo | Historial de decisiones, acciones ejecutadas, señales resueltas | Prisma |
| `agent` | Por agente | Patrones aprendidos, preferencias de respuesta, casos especiales | Prisma / vector |
| `user` | Por usuario | Preferencias de formato, módulos frecuentes, permisos activos | Session / Prisma |
| `operational` | Eventos en vuelo | Señales activas, acciones pendientes, estado de workflows | Redis / Prisma |

**Regla de seguridad:** Ninguna capa de memoria almacena credenciales, tokens, ni datos financieros en plaintext.
Los datos sensibles van siempre a través del Vault (`lib/security/vault/`).

---

### 1.7 Context

**Qué es:** Un snapshot del estado actual del módulo y del entorno, construido en el momento de una invocación del agente.

**AgentContext:**

```typescript
AgentContext {
  organizationId: string
  orgSlug:        string
  userId:         string
  moduleKey:      string            // ej: "comercial.maletas"
  role:           UserRole
  permissions:    string[]
  sourceHealth:   SourceHealth      // estado de las fuentes de datos
  runtimeSnapshot: Record<string, unknown>  // snapshot del módulo actual
  activeSignals:  AgentSignal[]     // señales detectadas en este ciclo
  memoryRefs:     string[]          // IDs de memoria relevante recuperada
}
```

**El context se construye justo antes de invocar un agente**, nunca se guarda como estado global.
Es efímero — representa el "ahora" del módulo.

---

### 1.8 Action

**Qué es:** Una decisión ejecutable con trazabilidad completa. La manifestación concreta de una recomendación del agente.

**Ciclo de vida de una acción:**

```
Agente detecta señal
     ↓
Genera AgentAction con status: "suggested"
     ↓
Copilot presenta al usuario
     ↓
Usuario aprueba → status: "approved"
     ↓
Action Layer ejecuta (tool / n8n webhook / función interna)
     ↓
status: "executing" → "executed" | "failed"
     ↓
Queda en audit trail con timestamp, userId, payload, resultado
```

**AgentAction:**

```typescript
AgentAction {
  id:              string
  type:            string           // ej: "create_production_request"
  title:           string           // ej: "Producir 24 uds — Pijama Niña LT-023"
  domain:          AgentDomain
  severity:        ActionSeverity   // "low" | "medium" | "high" | "critical"
  status:          ActionStatus
  sourceAgentId:   AgentRuntimeId
  moduleKey:       string
  payload:         Record<string, unknown>
  requiresApproval: boolean
  auditTrail:      AuditEntry[]
}
```

**ActionStatus:**
```
suggested → pending_approval → approved → executing → executed
                                                    ↘ failed
              dismissed (en cualquier punto antes de executed)
```

---

## 2. Mapa completo de la arquitectura

```
Usuario
  │
  └── Copilot (rail derecho)
         │
         └── Agent Router
                │
                ├── diego_finance    → herramientas de finanzas
                ├── luca_marketing   → herramientas de marketing
                ├── david_commercial → herramientas comerciales
                ├── mila_collections → herramientas de cobranza
                └── agentik_copilot  → resumen ejecutivo transversal
                         │
                         └── Agente activo
                                │
                                ├── Context Engine  ← snapshot del módulo
                                │
                                ├── Tool Registry   ← tools del dominio
                                │
                                ├── Workflow Router ← n8n o interno
                                │
                                ├── Memory Layer    ← contexto histórico
                                │
                                └── Action Layer
                                       │
                                       ├── AgentAction (suggested)
                                       ├── Aprobación humana
                                       ├── Ejecución
                                       └── Audit / Events / Timeline
```

---

## 3. Mastra vs n8n — división de responsabilidades

### n8n gestiona:

| Caso de uso | Ejemplo |
|-------------|---------|
| Webhooks externos | SAG SOAP → parse → Prisma |
| Conectores de terceros | Instagram API, TikTok, WhatsApp Business |
| Jobs programados | Sync diario de cobertura comercial, snapshot financiero |
| Publicación en canales | Post en redes, envío de email campaña |
| Orquestación de integraciones | Shopify → inventario → Prisma |
| Llamadas a APIs externas con retry | DIAN, SAG, Meta Ads |
| Alertas operacionales por canal | WhatsApp cobranza, Slack notificaciones |

**Regla:** n8n mueve datos y ejecuta integraciones. No toma decisiones — solo ejecuta.

### Mastra gestionaría (si se adopta):

| Caso de uso | Ejemplo |
|-------------|---------|
| Agentes con tool calling | Diego llama `getReconciliationStatus()` y razona sobre el resultado |
| Routing entre agentes | Copilot delega a diego_finance cuando detecta señal financiera |
| Memoria de agentes | Diego recuerda que esta empresa siempre cierra el día 30 |
| Workflows de IA internos | Generar diagnóstico → recomendar → esperar aprobación → ejecutar |
| Razonamiento controlado | Evaluar contexto + señales → decidir qué action crear |
| Trazabilidad de razonamiento | Logs de por qué el agente tomó una decisión |

**Regla:** Mastra coordina inteligencia. No mueve datos de terceros — solo orquesta agentes internos.

### Tabla de separación clara:

| Responsabilidad | n8n | Mastra | Interno |
|-----------------|-----|--------|---------|
| Sync SAG → Prisma | ✓ | | |
| Publicación redes | ✓ | | |
| Job programado | ✓ | | |
| Razonamiento del agente | | ✓ | |
| Tool calling | | ✓ | |
| Routing de agentes | | ✓ | |
| Memoria contextual | | ✓ | ✓ |
| Action Layer (approval) | | | ✓ |
| Audit trail | | | ✓ |
| Canvas del módulo | | | ✓ |
| Context snapshot | | | ✓ |

**Importante:** Mastra y n8n NO deben solaparse. Si una tarea puede hacerse en n8n (mover datos), no va a Mastra.
Si una tarea requiere razonamiento del agente, no va a n8n.

---

## 4. Agent Router

El router resuelve qué agente está activo dado el pathname y los módulos del tenant.

### Tabla de routing:

| Patrón de ruta | Agente activo | Dominio |
|----------------|--------------|---------|
| `/[orgSlug]/finanzas/*` | `diego_finance` | finance |
| `/[orgSlug]/agentik/marketing-studio/*` | `luca_marketing` | marketing |
| `/[orgSlug]/comercial/*` | `david_commercial` | commercial |
| `/[orgSlug]/pipeline/*` | `mila_collections` | collections |
| `/[orgSlug]/integrations/*` | `sofia_integrations` | integrations |
| `/[orgSlug]/torre-control` | `agentik_copilot` | executive |
| `/[orgSlug]` (dashboard) | `agentik_copilot` | executive |
| Cualquier otra ruta | `agentik_copilot` | executive |

### Lógica del router:

```typescript
function routeToAgent(
  pathname: string,
  moduleKey: string,
  tenantModules: string[],
  userPermissions: string[],
): AgentRuntimeId
```

**Inputs que considera:**
1. `pathname` — patrón de ruta (primer criterio)
2. `moduleKey` — clave del módulo activo (override específico)
3. `tenantModules` — módulos habilitados para el tenant (no ofrecer agentes de módulos no activos)
4. `userPermissions` — si el usuario no tiene acceso al módulo, fallback a copilot ejecutivo

**Nota:** La implementación actual en `lib/copilot/copilot-context-resolver.ts` + `lib/agentik-agents/agent-resolver.ts` ya cubre este routing. El Agent Runtime Router es la capa conceptual; la implementación puede delegarse a los resolvers existentes.

---

## 5. Tool Registry — catálogo inicial

### Tools de Finanzas (diego_finance)

| Tool ID | Tipo | Acción | Requiere aprobación |
|---------|------|--------|---------------------|
| `finance.getRuntimeSnapshot` | read | Snapshot financiero completo del período | No |
| `finance.explainCashFlowRisk` | read | Diagnóstico de cobertura de tesorería | No |
| `finance.getReconciliationStatus` | read | Estado de conciliación por fuente | No |
| `finance.createCollectionAction` | write | Crear acción de cobranza para cliente crítico | Sí |
| `finance.reconcilePaymentCandidate` | write | Marcar ítem como candidato a conciliar | Sí |
| `finance.generateClosingDraft` | write | Generar borrador de cierre mensual | Sí |
| `finance.flagBudgetDeviation` | write | Marcar desviación presupuestaria para revisión | Sí |

### Tools Comerciales (david_commercial)

| Tool ID | Tipo | Acción | Requiere aprobación |
|---------|------|--------|---------------------|
| `commercial.getCoverageSnapshot` | read | Snapshot de cobertura por referencia | No |
| `commercial.getReferenceDecision` | read | Decisión operacional para una referencia | No |
| `commercial.getTopCriticalReferences` | read | Top 5 referencias más críticas | No |
| `commercial.createProductionRequestDraft` | write | Crear borrador de solicitud de producción | Sí |
| `commercial.markReferenceAsPaused` | write | Pausar referencia (agotado sin stock previsto) | Sí |
| `commercial.triggerReplenishmentAlert` | write | Notificar vendedor sobre reponer maleta | Sí |
| `commercial.updateCoverageRule` | write | Actualizar mínimo / ideal de una referencia | Sí |

### Tools de Marketing (luca_marketing)

| Tool ID | Tipo | Acción | Requiere aprobación |
|---------|------|--------|---------------------|
| `marketing.getCampaignStatus` | read | Estado actual de campañas activas | No |
| `marketing.analyzeCatalogHealth` | read | Salud del catálogo Shopify | No |
| `marketing.generateCampaignBrief` | write | Generar brief de campaña desde señales | Sí |
| `marketing.createCreativeTask` | write | Crear tarea de creación de contenido | Sí |
| `marketing.analyzePostPerformance` | read | Analizar rendimiento de publicaciones | No |
| `marketing.triggerCatalogSync` | write | Iniciar sync de catálogo con Shopify | Sí |

### Tools de Cobranza (mila_collections)

| Tool ID | Tipo | Acción | Requiere aprobación |
|---------|------|--------|---------------------|
| `collections.getAgingPortfolio` | read | Cartera por edad de vencimiento | No |
| `collections.getOverdueClients` | read | Clientes con saldo vencido crítico | No |
| `collections.createFollowupAction` | write | Crear gestión de cobro para cliente | Sí |
| `collections.sendReminderDraft` | write | Generar borrador de recordatorio de cobro | Sí |
| `collections.escalateToManager` | write | Escalar cliente a gerencia | Sí |

---

## 6. Action Layer — del diagnóstico a la ejecución

### Flujo de ejemplo completo:

```
David (david_commercial) detecta:
  referencia LT-023 tiene opState="producir_urgente"
  disponible=2, minRequired=24, suggestedProductionQty=22
                    ↓
Genera AgentAction:
  {
    type:            "create_production_request",
    title:           "Producir 22 uds — Pijama Niña Bebé LT-023",
    domain:          "commercial",
    severity:        "high",
    status:          "suggested",
    sourceAgentId:   "david_commercial",
    moduleKey:       "comercial.maletas",
    payload: {
      reference:    "LT-023",
      description:  "PIJAMA NIÑA BEBE EST S",
      quantity:     22,
      reason:       "disponible=2 / min=24 / presión PD=0.8",
      urgency:      "producir_urgente",
    },
    requiresApproval: true,
  }
                    ↓
Copilot lo muestra en rail derecho con botón "Aprobar"
                    ↓
Usuario aprueba → status: "approved"
                    ↓
Action Layer llama tool: commercial.createProductionRequestDraft
  → escribe en Prisma: ProductionRequest (futuro modelo)
  → o llama n8n webhook: /webhooks/production-request-created
                    ↓
status: "executed"
Audit trail: { userId, timestamp, agentId, action, payload, result }
```

### Ejecución — destinos posibles:

| Tipo de acción | Destino de ejecución |
|----------------|---------------------|
| Crear registro (draft) | Función interna → Prisma |
| Notificar por canal | n8n webhook → WhatsApp / Email |
| Sync de inventario | n8n workflow trigger |
| Generar reporte | Función interna → ScheduledReport |
| Escalar a gerencia | n8n → Slack / Email ejecutivo |
| Reconciliar pago | Función interna → Prisma update |

**Regla:** Las acciones destructivas o irreversibles siempre tienen `requiresApproval: true`.
Las acciones de lectura / generación de borradores pueden tener `requiresApproval: false`.

---

## 7. Memory Layer — diseño

### Tenant Memory
- Reglas de cobertura mínima por línea de producto
- Umbrales configurados (ej: treasury < 7 días = crítico)
- Fuentes de datos activas y su estado
- Preferencias de moneda, zona horaria, idioma de reportes
- **Almacén:** Prisma → tabla `TenantMemory` o extensión de `Organization`

### Module Memory
- Historial de acciones tomadas por módulo (últimas 30 acciones)
- Señales resueltas vs recurrentes
- Decisiones aprobadas vs descartadas (para aprendizaje)
- **Almacén:** Prisma → `ModuleMemoryEntry`

### Agent Memory
- Patrones aprendidos por dominio (ej: "esta empresa siempre paga los viernes")
- Casos especiales configurados por el tenant
- Historial de diagnósticos y su precisión
- **Almacén:** Prisma (estructurado) + vector DB (embeddings de contexto)

### User Memory
- Módulos más visitados
- Formato de datos preferido (resumen vs detalle)
- Permisos activos en sesión
- **Almacén:** Session + Prisma `UserPreference`

### Operational Memory
- Señales activas en el ciclo actual
- Acciones en status `suggested` o `pending_approval`
- Estado de workflows en ejecución
- **Almacén:** Redis (TTL) + Prisma para persistencia

---

## 8. Decisión sobre Mastra

### Pros de adoptar Mastra

| Beneficio | Relevancia para Agentik |
|-----------|------------------------|
| Estructura formal de agentes | Alta — evita que cada agente sea una función ad-hoc |
| Tool calling tipado | Alta — actualmente las tools son funciones dispersas |
| Memory integrada | Media — ya tenemos estructura propia |
| Agent orchestration | Alta — routing multi-agente no está formalizado |
| Tracing y logging | Alta — audit trail actual es manual |
| Integración con modelos LLM | Alta — no tenemos capa de inferencia real aún |
| Workflows de IA | Media — n8n cubre parte de esto |

### Contras de adoptar Mastra ahora

| Riesgo | Impacto |
|--------|---------|
| Framework lock-in | Medio — arquitectura debe ser portable |
| Duplicación con n8n | Bajo si separamos responsabilidades claramente |
| Curva de aprendizaje | Bajo — documentación buena |
| Sobreingeniería prematura | **Alto** — si los agentes actuales son deterministas (no LLM), Mastra agrega complejidad innecesaria |
| Impacto en producción actual | **Alto** si se instala sin preparación — puede romper módulos existentes |
| Costo adicional (compute LLM) | Medio — tool calling en producción tiene costo real |

### Decisión recomendada: NO instalar Mastra todavía

**Razón principal:** El 90% de los "agentes" actuales de Agentik son deterministas — no usan LLM.
Usan reglas, engines, scores. Mastra es valioso para agentes con razonamiento LLM real (tool calling,
chain-of-thought, memoria semántica). Instalarlo ahora sería sobreingeniería.

**Cuándo tiene sentido adoptar Mastra:**
1. Cuando tengamos tool calling real (agente LLM decide qué tool llamar)
2. Cuando necesitemos memoria semántica (no solo historial estructurado)
3. Cuando el routing multi-agente requiera razonamiento (no solo pathname matching)
4. Cuando el volumen de agentes active justifique la orquestación formal

**Preparación sin Mastra (ahora):**
- `lib/agent-runtime/` define los contratos que Mastra implementará
- Los tipos `AgentTool`, `AgentAction`, `AgentContext` son independientes del framework
- Cuando Mastra entre, implementa las interfaces — no rompe nada

**Resultado:** Mastra entra como implementación del Agent Runtime, no como núcleo impuesto.
La arquitectura es framework-agnostic por diseño.

---

## 9. Estructura de carpetas propuesta

```
lib/
├── agent-runtime/              ← NUEVO — contratos base del runtime
│   ├── agent-types.ts          ← AgentRuntimeId, AgentDomain, AgentContext, AgentTool, AgentAction
│   ├── agent-router.ts         ← routing pathname → agente
│   ├── agent-context.ts        ← builder de AgentContext
│   ├── agent-memory.ts         ← tipos de memoria por capa
│   ├── tool-registry.ts        ← catálogo de tools por dominio
│   ├── action-registry.ts      ← catálogo de actions + status lifecycle
│   ├── workflow-router.ts      ← routing n8n vs interno
│   ├── runtime-events.ts       ← eventos del runtime para audit
│   ├── audit.ts                ← audit trail types
│   └── index.ts                ← barrel export
│
├── copilot/                    ← EXISTENTE — UI del copilot (señales, context resolver)
│   └── ...
│
├── agentik/                    ← EXISTENTE — execution layer, action registry Prisma
│   └── ...
│
└── agentik-agents/             ← EXISTENTE — agent resolver, agent definitions
    └── ...
```

**Relación entre capas:**
```
lib/agent-runtime/   ← contratos y tipos base (NO depende de Prisma)
       ↓
lib/agentik/         ← implementación con Prisma (ejecuta acciones reales)
       ↓
lib/copilot/         ← presentación en el rail (señales, contexto, UI)
       ↓
components/copilot/  ← componentes React del rail derecho
```

---

## 10. Riesgos de implementación

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| Tool calling LLM con datos reales = costo no controlado | Alta | Alto | Rate limiting por tenant + aprobación para tools write |
| Agente ejecuta acción incorrecta sin aprobación | Media | Alto | `requiresApproval: true` por defecto en tools write |
| Memory leaks entre tenants | Baja | Crítico | `organizationId` obligatorio en todo — vault para datos sensibles |
| n8n y Mastra ejecutando la misma acción (duplicación) | Media | Medio | Separación estricta de responsabilidades documentada |
| Complejidad del routing multi-agente | Media | Bajo | Empezar con pathname matching simple — no razonamiento LLM |
| Audit trail incompleto | Alta | Alto | Audit como requisito de infraestructura — no optional |
| Framework lock-in si Mastra cambia su API | Baja | Medio | Interfaces propias en agent-runtime — Mastra es implementación |

---

## 11. Próximo sprint sugerido

### AGENTIK-AGENT-RUNTIME-TYPES-01

**Objetivo:** Crear los tipos base en `lib/agent-runtime/` sin implementación pesada.
- `agent-types.ts`: `AgentRuntimeId`, `AgentDomain`, `AgentContext`, `AgentTool`, `AgentAction`, `ActionStatus`
- `tool-registry.ts`: catálogo inicial de tools por dominio (tipos solamente, sin handlers)
- `action-registry.ts`: tipos de actions + lifecycle
- TSC: 160 exactos

### AGENTIK-AGENT-DAVID-COMMERCIAL-TOOLS-01 (después)

**Objetivo:** Primera tool real conectada al engine de Maletas.
- `commercial.getCoverageSnapshot` → lee CommercialCoverageSnapshot desde Prisma
- `commercial.createProductionRequestDraft` → crea record en Prisma
- David puede recomendar y el usuario aprobar desde el rail derecho

### AGENTIK-MASTRA-EVALUATION-01 (paralelo)

**Objetivo:** Evaluar Mastra en un branch de feature. Sin impacto en producción.
- Instalar Mastra en branch aislado
- Implementar UN agente (david_commercial) usando Mastra
- Comparar con implementación actual
- Decisión de adopción basada en datos

---

## Estado actual vs arquitectura objetivo

| Aspecto | Estado actual | Arquitectura objetivo |
|---------|--------------|----------------------|
| AgentId | 7 agentes en registry (luca/diego/laura/david/sofia/mila/pablo) | Mismos + `AgentRuntimeId` explícito con dominio |
| Routing | pathname → copilot-context-resolver | mismo + `agent-router.ts` formal |
| Tools | funciones ad-hoc dispersas | `AgentTool` tipado en `tool-registry.ts` |
| Actions | `lib/agentik/action-registry.ts` con Prisma | `AgentAction` tipado + execution en action layer |
| Memory | Partial: `lib/copilot/operational-memory.ts`, `strategic-memory.ts` | Formal: 5 capas en `agent-memory.ts` |
| Audit | `lib/agentik/execution-audit.ts` | `audit.ts` en agent-runtime |
| Mastra | No instalado | No instalado — compatible por diseño |
| n8n | Activo para integraciones | Sin cambios — dominio claro |
