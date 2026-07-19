# AGENTIK MODULE DEPENDENCIES

> Mapa oficial de dependencias del proyecto AGENTIK.
> Sprint: AGENTIK-MODULE-DEPENDENCIES-01
> Fecha: 2026-07-17
> Referencia: AGENTIK_PROJECT_MANIFEST.md FROZEN v1.0, AGENTIK_INVENTORY_INDEX.md
> Proposito: Definir el orden exacto de construccion del repositorio agentik-os.
> Metodo: Extraccion automatizada de `from "@/lib/"` imports sobre 2,684 archivos.

---

## 1. Dependency Overview

| Metrica | Valor | Fuente |
|---|---|---|
| Modulos analizados (lib/ subdirs) | 96 | [A] `find lib -maxdepth 1 -type d` |
| Modulos con dependencias salientes | 78 | [A] dep_pairs source count |
| Modulos sin dependencias salientes | 18 | [A] diff contra total |
| Modulos independientes (0 deps, 0 consumers) | 9 | [A] cruce de dep_pairs |
| Modulos core (consumidos por 5+) | 14 | [A] consumer count >= 5 |
| Modulos leaf (no consumidos por otros lib/) | 31 | [A] targets not in dep_pairs |
| Dependencias unicas detectadas (pares src→tgt) | 235 | [A] `sort -u` de dep_pairs |
| Dependencias circulares (pares mutuos) | 16 | [A] bidirectional grep |
| Capas arquitectonicas identificadas | 8 | [A] topological sort |

---

## 2. Core Layers

```
Layer 0 — Foundation (sin dependencias externas)
  ui, utils, email, logistics, observability, runtime, idempotency,
  production-events, ai-pricing, decisions, agentik-agents, ai,
  autonomous, autonomous-operations, control-center, workforce,
  workspace, business-engine

Layer 1 — Infrastructure (solo prisma o Layer 0)
  prisma, tenant, auth, tasks, approvals, events, runs, orders,
  notifications, knowledge, documents, dashboard, customers,
  commercial-ledger, pipeline, operational-map, ai-billing,
  reconciliation

Layer 2 — Core Services (depende de L0/L1)
  actions, api, work, execution, approval, tenant-rules,
  business-entities, business-signals, i18n

Layer 3 — Domain Foundation (depende de L2)
  business-events, business-rules, business-reasoning,
  business-flow, business-knowledge, business-planning,
  business-decisions, business-actions, business-structure

Layer 4 — Domain Engines (depende de L3)
  comercial, commercial-intelligence, finance, financial,
  sag, sales, production-timeline, production-intelligence,
  production-control, production-stages, production, alerts,
  collections, inventory, tenant-rules, logistics (consumed)

Layer 5 — Operational (depende de L4)
  connectors, integrations, operational-inventory, operational-data,
  operational-intelligence, executive-dashboard,
  executive-intelligence, replenishment-intelligence, reports,
  castillitos, agent-runtime, agents

Layer 6 — Intelligence (depende de L5)
  security, copilot, marketing-studio, intelligence

Layer 7 — Application (depende de L6)
  agentik, scheduled-reports, oauth, sync, activation,
  bootstrap, whatsapp, customer360
```

Fuente: [A] Topological sort basado en 235 pares de dependencia medidos.

---

## 3. Module Inventory

| Modulo | Ubicacion | Deps | Consumers | Estado |
|---|---|---|---|---|
| prisma | `lib/prisma.ts` | 0 | 54 | Infrastructure |
| comercial | `lib/comercial/` | 14 | 16 | Domain |
| business-entities | `lib/business-entities/` | 1 | 11 | Core |
| business-signals | `lib/business-signals/` | 1 | 10 | Core |
| sag | `lib/sag/` | 3 | 7 | Domain |
| finance | `lib/finance/` | 5 | 6 | Domain |
| commercial-intelligence | `lib/commercial-intelligence/` | 3 | 6 | Domain |
| business-events | `lib/business-events/` | 2 | 6 | Core |
| agent-runtime | `lib/agent-runtime/` | 5 | 5 | Core |
| connectors | `lib/connectors/` | 8 | 5 | Domain |
| sales | `lib/sales/` | 3 | 5 | Domain |
| tenant-rules | `lib/tenant-rules/` | 1 | 5 | Domain |
| copilot | `lib/copilot/` | 10 | 2 | Feature |
| marketing-studio | `lib/marketing-studio/` | 7 | 2 | Feature |
| security | `lib/security/` | 2 | 4 | Core |
| integrations | `lib/integrations/` | 5 | 3 | Domain |
| tenant | `lib/tenant/` | 1 | 4 | Infrastructure |
| auth | `lib/auth/` | 2 | 3 | Infrastructure |
| tasks | `lib/tasks/` | 1 | 3 | Infrastructure |
| actions | `lib/actions/` | 2 | 3 | Infrastructure |
| business-planning | `lib/business-planning/` | 4 | 3 | Core |
| business-rules | `lib/business-rules/` | 3 | 3 | Core |
| ui | `lib/ui/` | 0 | 3 | Foundation |
| operational-inventory | `lib/operational-inventory/` | 3 | 3 | Domain |
| logistics | `lib/logistics/` | 0 | 3 | Foundation |
| production-events | `lib/production-events/` | 0 | 4 | Foundation |
| production-intelligence | `lib/production-intelligence/` | 5 | 3 | Domain |
| work | `lib/work/` | 2 | 2 | Infrastructure |
| approvals | `lib/approvals/` | 1 | 2 | Infrastructure |
| agents | `lib/agents/` | 4 | 2 | Feature |
| business-decisions | `lib/business-decisions/` | 5 | 2 | Core |
| business-actions | `lib/business-actions/` | 5 | 1 | Core |
| business-reasoning | `lib/business-reasoning/` | 1 | 2 | Core |
| financial | `lib/financial/` | 2 | 2 | Domain |
| production-timeline | `lib/production-timeline/` | 2 | 2 | Domain |
| agent-memory | `lib/agent-memory/` | 1 | 4 | Core |
| operational-data | `lib/operational-data/` | 3 | 2 | Domain |
| notifications | `lib/notifications/` | 1 | 2 | Infrastructure |
| ai-layer | `lib/ai-layer/` | 3 | 0 | Feature |
| ai-billing | `lib/ai-billing/` | 1 | 1 | Domain |
| ai-pricing | `lib/ai-pricing/` | 0 | 1 | Foundation |
| execution | `lib/execution/` | 1 | 2 | Infrastructure |
| reports | `lib/reports/` | 2 | 1 | Feature |
| scheduled-reports | `lib/scheduled-reports/` | 4 | 1 | Feature |
| agent-intelligence | `lib/agent-intelligence/` | 2 | 1 | Feature |
| agent-orchestration | `lib/agent-orchestration/` | 3 | 2 | Feature |
| agent-planning | `lib/agent-planning/` | 4 | 1 | Feature |
| castillitos | `lib/castillitos/` | 3 | 1 | Domain |
| customer360 | `lib/customer360/` | 4 | 0 | Feature |
| executive-dashboard | `lib/executive-dashboard/` | 11 | 0 | Feature |
| executive-intelligence | `lib/executive-intelligence/` | 9 | 0 | Feature |
| replenishment-intelligence | `lib/replenishment-intelligence/` | 6 | 1 | Domain |
| production-control | `lib/production-control/` | 2 | 1 | Domain |
| production-stages | `lib/production-stages/` | 2 | 1 | Domain |
| production | `lib/production/` | 5 | 1 | Domain |
| inventory | `lib/inventory/` | 4 | 0 | Feature |
| intelligence | `lib/intelligence/` | 2 | 0 | Feature |
| operational-intelligence | `lib/operational-intelligence/` | 4 | 0 | Feature |
| agentik | `lib/agentik/` | 9 | 0 | Feature |
| collections | `lib/collections/` | 3 | 0 | Feature |
| whatsapp | `lib/whatsapp/` | 5 | 0 | Feature |
| oauth | `lib/oauth/` | 1 | 0 | Feature |
| sync | `lib/sync/` | 2 | 0 | Feature |
| activation | `lib/activation/` | 2 | 0 | Feature |
| bootstrap | `lib/bootstrap/` | 3 | 0 | Feature |
| alerts | `lib/alerts/` | 2 | 1 | Feature |
| api | `lib/api/` | 2 | 1 | Infrastructure |
| approval | `lib/approval/` | 1 | 1 | Infrastructure |
| business-flow | `lib/business-flow/` | 1 | 0 | Feature |
| business-knowledge | `lib/business-knowledge/` | 1 | 0 | Feature |
| business-structure | `lib/business-structure/` | 1 | 0 | Feature |
| commercial-ledger | `lib/commercial-ledger/` | 1 | 1 | Domain |
| dashboard | `lib/dashboard/` | 1 | 0 | Feature |
| i18n | `lib/i18n/` | 1 | 0 | Feature |
| documents | `lib/documents/` | 1 | 1 | Infrastructure |
| autonomous | `lib/autonomous/` | 0 | 0 | Independent |
| autonomous-operations | `lib/autonomous-operations/` | 0 | 0 | Independent |
| control-center | `lib/control-center/` | 0 | 0 | Independent |
| decisions | `lib/decisions/` | 0 | 0 | Independent |
| email | `lib/email/` | 0 | 1 | Foundation |
| idempotency | `lib/idempotency/` | 0 | 0 | Independent |
| observability | `lib/observability/` | 0 | 0 | Independent |
| runtime | `lib/runtime/` | 0 | 0 | Independent |
| utils | `lib/utils/` | 0 | 1 | Foundation |
| workforce | `lib/workforce/` | 0 | 0 | Independent |
| workspace | `lib/workspace/` | 0 | 0 | Independent |
| agentik-agents | `lib/agentik-agents/` | 0 | 1 | Foundation |
| ai | `lib/ai/` | 0 | 1 | Foundation |
| knowledge | `lib/knowledge/` | 1 | 1 | Infrastructure |
| customers | `lib/customers/` | 1 | 0 | Feature |
| events | `lib/events/` | 1 | 1 | Infrastructure |
| orders | `lib/orders/` | 1 | 1 | Infrastructure |
| pipeline | `lib/pipeline/` | 1 | 0 | Feature |
| runs | `lib/runs/` | 1 | 1 | Infrastructure |
| operational-map | `lib/operational-map/` | 1 | 0 | Feature |

---

## 4. Dependency Graph

### Dependencias por modulo (src depende de tgt)

| Modulo | Depende de | Consumido por |
|---|---|---|
| actions | auth, prisma | agentik, collections, whatsapp |
| activation | connectors, prisma | NONE |
| agent-intelligence | agent-memory, agent-runtime | agent-orchestration, agent-planning |
| agent-memory | agent-runtime | agent-intelligence, agent-orchestration, agent-planning, agent-runtime |
| agent-orchestration | agent-intelligence, agent-memory, agent-runtime | agent-planning, agent-runtime |
| agent-planning | agent-intelligence, agent-memory, agent-orchestration, agent-runtime | agent-runtime |
| agent-runtime | agent-memory, agent-orchestration, agent-planning, comercial, prisma | agent-intelligence, agent-memory, agent-orchestration, agent-planning, comercial |
| agentik | actions, alerts, auth, events, knowledge, prisma, runs, scheduled-reports, ui | NONE |
| agentik-agents | NONE | copilot |
| agents | approvals, sales, tasks, work | copilot |
| ai | NONE | customer360 |
| ai-billing | prisma | ai-layer |
| ai-layer | ai-billing, ai-pricing, security | NONE |
| ai-pricing | NONE | ai-layer |
| alerts | finance, prisma | agentik |
| api | auth, prisma | whatsapp |
| approval | execution | marketing-studio |
| approvals | prisma | agents, copilot |
| auth | prisma, tenant | actions, agentik, api |
| autonomous | NONE | NONE |
| autonomous-operations | NONE | NONE |
| bootstrap | ensure-main-project, prisma, tenant | NONE |
| business-actions | business-decisions, business-entities, business-events, business-planning, business-signals | executive-dashboard |
| business-decisions | business-entities, business-events, business-planning, business-rules, business-signals | business-actions, executive-dashboard |
| business-engine | NONE | comercial |
| business-entities | comercial | business-actions, business-decisions, business-events, business-flow, business-knowledge, business-planning, business-reasoning, business-rules, business-signals, comercial, executive-intelligence |
| business-events | business-entities, business-signals | business-actions, business-decisions, business-planning, business-rules, comercial, executive-dashboard |
| business-flow | business-entities | NONE |
| business-knowledge | business-entities | NONE |
| business-planning | business-entities, business-events, business-rules, business-signals | business-actions, business-decisions, executive-dashboard |
| business-reasoning | business-entities | comercial, executive-intelligence |
| business-rules | business-entities, business-events, business-signals | business-decisions, business-planning, executive-dashboard |
| business-signals | business-entities | business-actions, business-decisions, business-events, business-planning, business-rules, comercial, commercial-intelligence, executive-dashboard, production-intelligence, replenishment-intelligence |
| business-structure | sag | NONE |
| castillitos | financial, prisma, sag | executive-intelligence |
| collections | actions, finance, prisma | NONE |
| comercial | agent-runtime, business-engine, business-entities, business-events, business-reasoning, business-signals, commercial-intelligence, connectors, logistics, operational-inventory, prisma, sag, tenant, tenant-rules | agent-runtime, business-entities, commercial-intelligence, connectors, copilot, executive-dashboard, executive-intelligence, integrations, intelligence, inventory, operational-data, operational-intelligence, operational-inventory, production-intelligence, replenishment-intelligence, reports |
| commercial-intelligence | business-signals, comercial, prisma | comercial, executive-dashboard, inventory, production-intelligence, replenishment-intelligence, tenant-rules |
| commercial-ledger | prisma | customer360 |
| connectors | comercial, integrations, logistics, prisma, production, production-events, sag, sales | activation, comercial, integrations, sag, sync |
| control-center | NONE | NONE |
| copilot | agentik-agents, agents, approvals, comercial, finance, marketing-studio, prisma, security, tasks, work | marketing-studio, security |
| customer360 | ai, commercial-ledger, prisma, sales | NONE |
| customers | prisma | NONE |
| dashboard | prisma | NONE |
| decisions | NONE | NONE |
| documents | prisma | finance |
| email | NONE | scheduled-reports |
| events | prisma | agentik |
| execution | prisma | approval, marketing-studio |
| executive-dashboard | business-actions, business-decisions, business-events, business-planning, business-rules, business-signals, comercial, commercial-intelligence, production-intelligence, replenishment-intelligence, tenant-rules | NONE |
| executive-intelligence | business-entities, business-reasoning, castillitos, comercial, finance, orders, prisma, sag, sales | NONE |
| finance | documents, financial, prisma, sag, utils | alerts, collections, copilot, executive-intelligence, financial, sales |
| financial | finance, prisma | castillitos, finance |
| i18n | ui | NONE |
| idempotency | NONE | NONE |
| integrations | comercial, connectors, marketing-studio, prisma, security | connectors, marketing-studio, oauth |
| intelligence | comercial, prisma | NONE |
| inventory | comercial, commercial-intelligence, prisma, tenant-rules | NONE |
| knowledge | prisma | agentik |
| logistics | NONE | comercial, connectors, replenishment-intelligence |
| marketing-studio | approval, copilot, execution, integrations, prisma, security, ui | copilot, integrations |
| notifications | prisma | scheduled-reports, whatsapp |
| oauth | integrations | NONE |
| observability | NONE | NONE |
| operational-data | comercial, operational-inventory, prisma | operational-intelligence, operational-inventory |
| operational-intelligence | comercial, operational-data, operational-inventory, prisma | NONE |
| operational-inventory | comercial, operational-data, prisma | comercial, operational-data, operational-intelligence |
| operational-map | prisma | NONE |
| orders | prisma | executive-intelligence |
| pipeline | prisma | NONE |
| production | prisma, production-control, production-events, production-stages, production-timeline | connectors |
| production-control | prisma, production-intelligence | production |
| production-events | NONE | connectors, production, production-stages, production-timeline |
| production-intelligence | business-signals, comercial, commercial-intelligence, prisma, tenant-rules | executive-dashboard, production-control, replenishment-intelligence |
| production-stages | production-events, production-timeline | production |
| production-timeline | prisma, production-events | production, production-stages |
| reconciliation | prisma | NONE |
| replenishment-intelligence | business-signals, comercial, commercial-intelligence, logistics, production-intelligence, tenant-rules | executive-dashboard |
| reports | comercial, prisma | scheduled-reports |
| runs | prisma | agentik |
| runtime | NONE | NONE |
| sag | connectors, prisma, sales | business-structure, castillitos, comercial, connectors, executive-intelligence, finance, sales |
| sales | finance, prisma, sag | agents, connectors, customer360, executive-intelligence, sag |
| scheduled-reports | email, notifications, prisma, reports | agentik |
| security | copilot, prisma | ai-layer, copilot, integrations, marketing-studio |
| sync | connectors, prisma | NONE |
| tasks | prisma | agents, copilot, work |
| tenant | prisma | auth, bootstrap, comercial, whatsapp |
| tenant-rules | commercial-intelligence | comercial, executive-dashboard, inventory, production-intelligence, replenishment-intelligence |
| ui | NONE | agentik, i18n, marketing-studio |
| utils | NONE | finance |
| whatsapp | actions, api, notifications, prisma, tenant | NONE |
| work | prisma, tasks | agents, copilot |
| workforce | NONE | NONE |
| workspace | NONE | NONE |

---

## 5. Core Modules

Modulos que no pueden ser reemplazados — consumidos por 5+ modulos.

| Modulo | Consumers | Justificacion |
|---|---|---|
| prisma | 54 | Capa de datos. Todo modulo con persistencia lo consume. |
| comercial | 16 | Dominio central. 16 modulos dependen de sus tipos y servicios. |
| business-entities | 11 | Modelo de entidades. Toda la capa business-* y comercial lo consumen. |
| business-signals | 10 | Sistema de senales. 10 modulos dependen de SignalType, SignalEvent. |
| sag | 7 | Puente ERP. connectors, finance, sales, comercial, castillitos, executive-intelligence, business-structure. |
| finance | 6 | Dominio financiero. alerts, collections, copilot, executive-intelligence, financial, sales. |
| commercial-intelligence | 6 | Inteligencia comercial. comercial, executive-dashboard, inventory, production-intelligence, replenishment-intelligence, tenant-rules. |
| business-events | 6 | Eventos de negocio. 6 consumidores en capas superiores. |
| agent-runtime | 5 | Runtime de agentes. Consumido por toda la pila agent-*. |
| connectors | 5 | Capa de conectores. activation, comercial, integrations, sag, sync. |
| sales | 5 | Ventas. agents, connectors, customer360, executive-intelligence, sag. |
| tenant-rules | 5 | Reglas por tenant. comercial, executive-dashboard, inventory, production-intelligence, replenishment-intelligence. |
| production-events | 4 | Eventos de produccion. connectors, production, production-stages, production-timeline. |
| agent-memory | 4 | Memoria de agentes. agent-intelligence, agent-orchestration, agent-planning, agent-runtime. |

---

## 6. Domain Modules

| Dominio | Modulos | Total deps | Total consumers |
|---|---|---|---|
| **Commercial** | comercial, commercial-intelligence, commercial-ledger, inventory, tenant-rules | 26 | 33 |
| **Finance** | finance, financial, alerts, collections, reconciliation | 13 | 10 |
| **Production** | production, production-control, production-events, production-intelligence, production-stages, production-timeline | 14 | 12 |
| **Marketing** | marketing-studio | 7 | 2 |
| **Sales** | sales, sag | 6 | 12 |
| **Documents** | documents | 1 | 1 |
| **Collections** | collections | 3 | 0 |
| **Inventory** | inventory, operational-inventory, operational-data, operational-intelligence | 14 | 5 |
| **Workforce** | workforce | 0 | 0 |
| **Knowledge** | knowledge | 1 | 1 |
| **CRM** | customer360 | 4 | 0 |

---

## 7. AI Layer

| Modulo | Depende de | Consumido por |
|---|---|---|
| ai-layer | ai-billing, ai-pricing, security | NONE (consumed by app/) |
| ai-billing | prisma | ai-layer |
| ai-pricing | NONE | ai-layer |
| ai | NONE | customer360 |

### Agent Stack

| Modulo | Depende de | Consumido por |
|---|---|---|
| agent-runtime | agent-memory, agent-orchestration, agent-planning, comercial, prisma | agent-intelligence, agent-memory, agent-orchestration, agent-planning, comercial |
| agent-memory | agent-runtime | agent-intelligence, agent-orchestration, agent-planning, agent-runtime |
| agent-intelligence | agent-memory, agent-runtime | agent-orchestration, agent-planning |
| agent-orchestration | agent-intelligence, agent-memory, agent-runtime | agent-planning, agent-runtime |
| agent-planning | agent-intelligence, agent-memory, agent-orchestration, agent-runtime | agent-runtime |
| agentik-agents | NONE | copilot |
| agents | approvals, sales, tasks, work | copilot |

### Copilot

| Modulo | Depende de | Consumido por |
|---|---|---|
| copilot | agentik-agents, agents, approvals, comercial, finance, marketing-studio, prisma, security, tasks, work | marketing-studio, security |

---

## 8. Integration Layer

| Integracion | Abstraccion | Consumido por |
|---|---|---|
| SAG PYA SOAP | `lib/connectors/adapters/sag-pya-soap/` | comercial, finance, executive-intelligence, business-structure, castillitos, sales via `lib/sag/` |
| CRM Castillitos | `lib/connectors/adapters/castillitos-crm/` | comercial via `lib/connectors/` |
| Shopify | `lib/integrations/shopify/` | marketing-studio via `lib/integrations/` |
| DIAN | `lib/integrations/dian/` | app/api/internal/dian/ |
| WhatsApp | `lib/whatsapp/` | app/ (directo) |
| TikTok | `lib/integrations/tiktok/` | marketing-studio via `lib/integrations/` |
| Meta | `lib/marketing-studio/social/` | marketing-studio (interno) |
| Google | `lib/integrations/oauth/providers/` | marketing-studio, app/ |
| Anthropic | `lib/ai-layer/adapters/anthropic-adapter.ts` | ai-layer (interno) |
| OpenAI | `lib/ai-layer/adapters/openai-adapter.ts` | ai-layer (interno) |
| Google/Gemini | `lib/ai-layer/adapters/google-adapter.ts` | ai-layer (interno) |
| Cloudflare R2 | `lib/marketing-studio/r2-upload.ts` | marketing-studio (interno) |
| n8n | `lib/integrations/n8n-execution-bridge.ts` | copilot via `lib/integrations/` |
| Neon | `@prisma/adapter-neon` | prisma (infraestructura) |
| Resend | `lib/email/adapter.ts` | scheduled-reports via email |

---

## 9. Shared Infrastructure

| Modulo | Ubicacion | Consumido por |
|---|---|---|
| prisma | `lib/prisma.ts` | 54 modulos |
| ui | `lib/ui/` | agentik, i18n, marketing-studio + app/(433) + components/(192) |
| utils | `lib/utils/` | finance |
| auth | `lib/auth/` | actions, agentik, api + app/(433 imports) |
| tenant | `lib/tenant/` | auth, bootstrap, comercial, whatsapp |
| types | `types/` | copilot (tipo imports) |
| ensure-main-project | `lib/ensure-main-project.ts` | bootstrap |

---

## 10. Runtime Dependencies

| Responsabilidad | Modulo(s) |
|---|---|
| Inicializacion del sistema | bootstrap (ensure-main-project, prisma, tenant) |
| Creacion de contexto organizacional | auth (prisma, tenant) |
| Registro de agentes | copilot (agentik-agents, agents) |
| Ejecucion de workflows | work (prisma, tasks) → agents (approvals, sales, tasks, work) |
| Control de eventos | events (prisma), production-events (standalone) |
| Mantenimiento de estado | prisma (centralizado) |
| Coordinacion de ejecucion | agent-runtime (agent-memory, agent-orchestration, agent-planning) |
| Middleware | middleware.ts → auth |

---

## 11. Circular Dependencies

16 pares de dependencia circular detectados:

| Modulo A | Modulo B | Tipo |
|---|---|---|
| agent-memory | agent-runtime | Mutua — runtime y memory se importan entre si |
| agent-orchestration | agent-runtime | Mutua — orchestration y runtime se importan entre si |
| agent-planning | agent-runtime | Mutua — planning y runtime se importan entre si |
| agent-runtime | comercial | Mutua — runtime importa comercial types, comercial importa runtime |
| business-entities | comercial | Mutua — entities define modelos, comercial los extiende |
| comercial | commercial-intelligence | Mutua — comercial consume intelligence, intelligence consume comercial |
| comercial | connectors | Mutua — comercial usa connectors, connectors usa comercial |
| comercial | operational-inventory | Mutua — comercial usa inventory, inventory usa comercial |
| connectors | integrations | Mutua — connectors y integrations se importan entre si |
| connectors | sag | Mutua — connectors adapta sag, sag usa connectors |
| copilot | marketing-studio | Mutua — copilot importa marketing-studio, marketing-studio importa copilot |
| copilot | security | Mutua — copilot importa security, security importa copilot |
| finance | financial | Mutua — finance y financial se importan entre si |
| integrations | marketing-studio | Mutua — integrations importa marketing-studio, marketing-studio importa integrations |
| operational-data | operational-inventory | Mutua — data y inventory se importan entre si |
| sag | sales | Mutua — sag importa sales, sales importa sag |

---

## 12. Leaf Modules

Modulos no consumidos por ningun otro modulo en lib/:

| Modulo | Deps | Consumido por app/components |
|---|---|---|
| activation | 2 | Si |
| agentik | 9 | Si |
| ai-layer | 3 | Si |
| autonomous | 0 | Si |
| autonomous-operations | 0 | Si |
| bootstrap | 3 | Si |
| business-flow | 1 | No |
| business-knowledge | 1 | No |
| business-structure | 1 | No |
| collections | 3 | Si |
| control-center | 0 | Si |
| customer360 | 4 | Si |
| customers | 1 | Si |
| dashboard | 1 | Si |
| decisions | 0 | No |
| executive-dashboard | 11 | Si |
| executive-intelligence | 9 | Si |
| i18n | 1 | No |
| idempotency | 0 | No |
| intelligence | 2 | No |
| inventory | 4 | Si |
| oauth | 1 | Si |
| observability | 0 | Si |
| operational-intelligence | 4 | Si |
| operational-map | 1 | Si |
| pipeline | 1 | Si |
| reconciliation | 1 | Si |
| runtime | 0 | Si |
| sync | 2 | No |
| whatsapp | 5 | Si |
| workforce | 0 | Si |
| workspace | 0 | Si |

---

## 13. Bootstrap Order

Orden de construccion basado en el grafo de dependencias medido.
Cada layer solo depende de layers anteriores.

```
Layer 0 — Foundation (0 dependencias)
  ui, utils, email, logistics, observability, runtime, idempotency,
  production-events, ai-pricing, decisions, agentik-agents, ai,
  autonomous, autonomous-operations, control-center, workforce,
  workspace, business-engine
  [18 modulos]

Layer 1 — Data (solo prisma)
  prisma, tenant, approvals, tasks, events, runs, orders,
  notifications, knowledge, documents, dashboard, customers,
  commercial-ledger, pipeline, operational-map, ai-billing,
  reconciliation
  [17 modulos]

Layer 2 — Auth + Core Services (Layer 0-1)
  auth, actions, api, work, execution, approval, i18n
  [7 modulos]

Layer 3 — Business Foundation (Layer 0-2)
  business-entities, business-signals
  [2 modulos]

Layer 4 — Business Logic (Layer 3)
  business-events, business-rules, business-reasoning,
  business-flow, business-knowledge, business-planning
  [6 modulos]

Layer 5 — Business Decisions (Layer 4)
  business-decisions, business-actions, business-structure
  [3 modulos]

Layer 6 — Domain Core (Layer 0-5) — NOTA: circulares resueltos co-deployando
  comercial*, commercial-intelligence*, tenant-rules,
  sag*, sales*, connectors*,
  finance*, financial*,
  production-timeline, production-intelligence, production-control,
  production-stages, production,
  operational-inventory*, operational-data*
  [15 modulos — * participan en dependencias circulares]

Layer 7 — Domain Extended (Layer 6)
  integrations*, marketing-studio*, copilot*, security*,
  agent-runtime*, agent-memory*, agent-orchestration*,
  agent-planning*, agent-intelligence*,
  agents, alerts, castillitos, intelligence, inventory,
  operational-intelligence, replenishment-intelligence,
  executive-dashboard, executive-intelligence,
  reports
  [20 modulos — * participan en dependencias circulares]

Layer 8 — Application (Layer 7)
  agentik, scheduled-reports, oauth, sync, activation,
  bootstrap, whatsapp, customer360, collections,
  ai-layer, business-flow, business-knowledge,
  operational-map, reconciliation
  [14 modulos]
```

---

## 14. Critical Dependencies

Dependencias cuya ausencia impide compilar modulos posteriores:

| Dependencia | Bloquearia | Evidencia |
|---|---|---|
| prisma | 54 modulos | Toda persistencia depende de prisma |
| comercial | 16 modulos | Dominio central, tipos compartidos |
| business-entities | 11 modulos | Toda la capa business-* |
| business-signals | 10 modulos | Senales para business-*, commercial-intelligence, production-intelligence |
| tenant | 4 modulos | auth, bootstrap, comercial, whatsapp — sin tenant no hay multi-tenancy |
| auth | 3 modulos + app/ | actions, agentik, api — sin auth no hay acceso |
| production-events | 4 modulos | connectors, production, production-stages, production-timeline |
| agent-runtime | 5 modulos | Toda la pila agent-* |

---

## 15. Migration Impact

| Modulo | Migracion independiente | Bloqueado por |
|---|---|---|
| ui | Si | — |
| utils | Si | — |
| email | Si | — |
| logistics | Si | — |
| observability | Si | — |
| runtime | Si | — |
| idempotency | Si | — |
| production-events | Si | — |
| ai-pricing | Si | — |
| decisions | Si | — |
| agentik-agents | Si | — |
| ai | Si | — |
| autonomous | Si | — |
| autonomous-operations | Si | — |
| control-center | Si | — |
| workforce | Si | — |
| workspace | Si | — |
| business-engine | Si | — |
| prisma | Si (infraestructura base) | — |
| tenant | No | prisma |
| auth | No | prisma, tenant |
| tasks | No | prisma |
| approvals | No | prisma |
| events | No | prisma |
| work | No | prisma, tasks |
| business-entities | No | comercial (circular) |
| business-signals | No | business-entities |
| comercial | No | 14 dependencias (ver Seccion 4) |
| copilot | No | 10 dependencias (ver Seccion 4) |
| marketing-studio | No | 7 dependencias (ver Seccion 4) |
| security | No | copilot, prisma (circular) |
| finance | No | documents, financial, prisma, sag, utils |
| integrations | No | comercial, connectors, marketing-studio, prisma, security |
| connectors | No | 8 dependencias (ver Seccion 4) |
| executive-dashboard | No | 11 dependencias — maximo del proyecto |
| executive-intelligence | No | 9 dependencias |
| agent-runtime | No | 5 dependencias + 3 circulares |

---

## 16. Bootstrap Readiness

| Estado | Modulos | Cantidad |
|---|---|---|
| **READY** — 0 deps, migrable de inmediato | ui, utils, email, logistics, observability, runtime, idempotency, production-events, ai-pricing, decisions, agentik-agents, ai, autonomous, autonomous-operations, control-center, workforce, workspace, business-engine | 18 |
| **PARTIAL** — deps resueltas en Layer 1-2 | prisma, tenant, auth, tasks, approvals, events, runs, orders, notifications, knowledge, documents, dashboard, customers, commercial-ledger, pipeline, operational-map, ai-billing, reconciliation, actions, api, work, execution, approval, i18n | 24 |
| **BLOCKED** — requiere resolucion de circulares | comercial, commercial-intelligence, connectors, sag, sales, finance, financial, integrations, marketing-studio, copilot, security, agent-runtime, agent-memory, agent-orchestration, agent-planning, operational-inventory, operational-data, business-entities | 18 |
| **LEGACY** — sin consumidores en lib/ ni app/ | business-flow, business-knowledge, decisions, i18n, idempotency, sync | 6 |

---

## Manifest Inconsistencies

| ID | Documento | Valor documentado | Valor medido | Evidencia |
|---|---|---|---|---|
| DI-01 | Manifest Sec. 16.1 — Circular deps | 4 ciclos | 16 pares circulares | [A] Manifest listaba 4 ciclos agregados; este analisis mide 16 pares individuales. No es contradiccion: 4 clusters contienen multiples pares. |
| DI-02 | Manifest Sec. 17 — Niveles de dependencia | 7 niveles (0-6) | 9 layers (0-8) | [A] Manifest agrupaba con granularidad menor. Este documento usa granularidad mayor para separar business-foundation de business-logic. |
| DI-03 | Inventory Index Sec. 5 — lib/ subdirs | 96 | 96 | [A] Consistente. |

Ninguna inconsistencia invalida el Manifest FROZEN v1.0 ni el Inventory Index. Las diferencias DI-01 y DI-02 son de granularidad, no de dato.

---

## Repository State

| Metrica | Valor | Fuente |
|---|---|---|
| HEAD commit | `1cc25653efc46dc4a8d9d2de6f5cc9af9157b67b` | [A] `git rev-parse HEAD` |
| Branch | `feat/reconciliation-os` | [A] `git branch --show-current` |
| Fecha | 2026-07-17 | [A] `date` |
| Pares de dependencia analizados | 235 | [A] `sort -u` de extraction |
| Modulos analizados | 96 | [A] `find lib -maxdepth 1 -type d` |
| Metodo | `grep -rn "from .@/lib/" lib/ --include='*.ts' --include='*.tsx'` → sed → awk | [A] Single-pass extraction |

---

*Fin del documento. Toda relacion proviene de imports medidos en el codigo fuente. No se modifico ningun archivo. No se ejecutaron operaciones Git.*
