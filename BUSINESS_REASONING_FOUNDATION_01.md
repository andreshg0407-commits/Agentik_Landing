# BUSINESS-REASONING-FOUNDATION-01

## Business Reasoning Engine — Structured Enterprise Reasoning

**Estado:** Completo
**Fecha:** 2026-06-25
**TSC Baseline:** 160 (sin regresion)

---

## 1. Vision

David NO piensa directamente sobre tablas, Prisma, eventos o Business Entities.

David consume una estructura de razonamiento ya construida.

Toda conclusion empresarial sigue la misma cadena:

```
Datos
  → Business Entities
    → Knowledge Graph
      → Reasoning
        → Executive Intelligence
          → David / Copilot
```

Nunca al contrario.

---

## 2. Arquitectura

```
lib/business-reasoning/
  reasoning-types.ts        — EntityRef, severities, categories, decision types
  observation.ts            — Hechos observados sin interpretacion
  evidence.ts               — Evidencia que soporta toda conclusion
  reasoning-confidence.ts   — Modelo de confianza estructurado
  finding.ts                — Hallazgos derivados de observaciones
  insight.ts                — Comprension derivada del Knowledge Graph
  risk.ts                   — Riesgos empresariales identificados
  opportunity.ts            — Oportunidades identificadas
  decision.ts               — Decisiones sugeridas (no ejecutadas)
  recommendation.ts         — Recomendaciones ejecutivas (suggestedOnly: true)
  reasoning-chain.ts        — Cadena completa de razonamiento
  reasoning-context.ts      — Paquete de inteligencia para David/Copilot
  reasoning-engine.ts       — Contrato del motor (IReasoningEngine)
  reasoning-utils.ts        — Helpers: filtrado, ordenamiento, narrativa
  index.ts                  — Barrel export (client-safe)
```

---

## 3. Pipeline de Razonamiento

```
observe()
  → buildFindings()
    → buildInsights()      ← Knowledge Graph
      → analyzeRisks()
      → analyzeOpportunities()
        → suggestDecisions()
          → buildRecommendations()
            → ReasoningChain
              → ReasoningContext
                → David / Copilot / Executive
```

Cada paso enlaza al anterior. Nunca cajas negras.

---

## 4. Contratos

### 4.1 Observation

Un hecho observado. Sin interpretacion.

| Campo | Tipo |
|---|---|
| id | string |
| entity | EntityRef |
| metric | string |
| value | string / number / boolean |
| expectedValue | string / number / boolean / null |
| isAnomaly | boolean |
| category | ReasoningCategory |
| source | ReasoningSource |
| confidence | number (0-100) |
| observedAt | string (ISO) |

### 4.2 Evidence

Toda conclusion lleva evidencia.

| Campo | Tipo |
|---|---|
| id | string |
| items | EvidenceItem[] |
| observationIds | string[] |
| entities | EntityRef[] |
| relationIds | string[] |
| eventIds | string[] |
| ruleIds | string[] |
| metricKeys | string[] |
| strength | number (0-100) |

EvidenceType: observation, entity_state, entity_relation, knowledge_path, business_event, rule_evaluation, metric_value, historical_pattern, external_data.

### 4.3 ReasoningConfidence

No solo un numero. Explica POR QUE la confianza es alta o baja.

| Campo | Tipo |
|---|---|
| score | number (0-100) |
| level | very_high / high / moderate / low / very_low / unknown |
| reason | string |
| missingInformation | string[] |
| assumptions | string[] |
| evidenceCount | number |
| dataComplete | boolean |

### 4.4 Finding

Hallazgo derivado de observaciones.

| Campo | Tipo |
|---|---|
| id | string |
| title | string |
| description | string |
| severity | ReasoningSeverity |
| importance | number (1-10) |
| category | ReasoningCategory |
| primaryEntity | EntityRef |
| affectedEntities | EntityRef[] |
| evidence | Evidence |
| confidence | ReasoningConfidence |
| sourceObservationIds | string[] |

### 4.5 Insight

Comprension derivada de hallazgos + Knowledge Graph.

| Campo | Tipo |
|---|---|
| id | string |
| title | string |
| description | string |
| businessMeaning | string |
| severity | ReasoningSeverity |
| impacts | InsightImpact[] |
| primaryEntity | EntityRef |
| knowledgeDependencies | string[] |
| evidence | Evidence |
| confidence | ReasoningConfidence |
| sourceFindingIds | string[] |

### 4.6 Risk

Riesgo empresarial identificado.

| Campo | Tipo |
|---|---|
| id | string |
| title | string |
| severity | ReasoningSeverity |
| probability | number (0-100) |
| impact | number (1-10) |
| urgency | immediate / today / this_week / this_month / no_rush |
| estimatedValueAtRisk | number / null |
| primaryEntity | EntityRef |
| preventiveActions | PreventiveAction[] (suggestedOnly: true) |
| evidence | Evidence |
| confidence | ReasoningConfidence |
| sourceInsightIds | string[] |

### 4.7 Opportunity

Oportunidad identificada.

| Campo | Tipo |
|---|---|
| id | string |
| title | string |
| estimatedValue | number / null |
| effort | trivial / low / medium / high / major |
| priority | number |
| primaryEntity | EntityRef |
| evidence | Evidence |
| confidence | ReasoningConfidence |
| sourceInsightIds | string[] |

### 4.8 Decision

Decision sugerida. NO ejecutada.

| Campo | Tipo |
|---|---|
| id | string |
| title | string |
| decisionType | 14 tipos |
| reason | string |
| urgency | Urgency |
| expectedImpact | ExpectedImpact |
| requiresApproval | boolean (default true) |
| primaryEntity | EntityRef |
| evidence | Evidence |
| confidence | ReasoningConfidence |
| sourceRiskIds | string[] |
| sourceOpportunityIds | string[] |

DecisionType: start_production, transfer_inventory, contact_customer, update_portfolio, visit_vendor, adjust_price, escalate, approve, reject, defer, investigate, replenish, cancel, notify.

### 4.9 Recommendation

Recomendacion ejecutiva. SIEMPRE suggestedOnly: true.

| Campo | Tipo |
|---|---|
| id | string |
| title | string |
| expectedBenefit | string |
| estimatedValue | number / null |
| requiredData | string[] |
| evidence | Evidence |
| confidence | ReasoningConfidence |
| sourceDecisionIds | string[] |
| suggestedOnly | true (literal) |

### 4.10 ReasoningChain

La cadena completa de razonamiento.

| Campo | Tipo |
|---|---|
| id | string |
| title | string |
| narrative | string |
| steps | ChainStep[] |
| observations | Observation[] |
| findings | Finding[] |
| insights | Insight[] |
| risks | Risk[] |
| opportunities | Opportunity[] |
| decisions | Decision[] |
| recommendations | Recommendation[] |
| evidence | Evidence |
| confidence | ReasoningConfidence |

ChainStepType: observation, finding, insight, risk, opportunity, decision, recommendation.

### 4.11 ReasoningContext

Lo que David y Copilot consumen.

| Campo | Tipo |
|---|---|
| id | string |
| primaryEntity | EntityRef |
| observations | Observation[] |
| findings | Finding[] |
| insights | Insight[] |
| risks | Risk[] |
| opportunities | Opportunity[] |
| decisions | Decision[] |
| recommendations | Recommendation[] |
| chains | ReasoningChain[] |
| confidence | ReasoningConfidence |
| freshness | DataFreshnessLevel |
| keyFacts | string[] |
| suggestedQuestions | string[] |

### 4.12 IReasoningEngine

```typescript
interface IReasoningEngine {
  observe(request): Promise<Observation[]>
  buildFindings(observations): Promise<Finding[]>
  buildInsights(findings, request): Promise<Insight[]>
  analyzeRisks(insights, request): Promise<Risk[]>
  analyzeOpportunities(insights, request): Promise<Opportunity[]>
  suggestDecisions(risks, opportunities, request): Promise<Decision[]>
  buildRecommendations(decisions, request): Promise<Recommendation[]>
  buildReasoning(request): Promise<ReasoningResult>
}
```

---

## 5. Caso Castillitos: Referencia Agotada

```
OBSERVATION
  metric: "stock_level"
  value: 0
  entity: { entityId: "REF-CJ-4031425", entityType: "product", label: "CJ-4031425" }
  isAnomaly: true

  ↓

FINDING
  title: "Referencia CJ-4031425 agotada"
  severity: "critical"
  evidence: [observation stock_level=0]

  ↓

INSIGHT
  title: "Referencia agotada en maleta del vendedor Carlos Leon"
  businessMeaning: "La referencia esta en la maleta activa y bloquea 3 pedidos"
  knowledgeDependencies: ["edge:product→portfolio", "edge:portfolio→vendor", "edge:vendor→orders"]
  impacts: [
    { area: "commercial", severity: "high", affectedCount: 3 },
    { area: "customer", severity: "medium", affectedCount: 2 },
  ]

  ↓

RISK
  title: "Riesgo de perder $2.4M en pedidos bloqueados"
  probability: 85
  impact: 8
  urgency: "immediate"
  preventiveActions: [
    { actionType: "start_production", suggestedOnly: true },
    { actionType: "transfer_inventory", suggestedOnly: true },
  ]

  ↓

OPPORTUNITY
  title: "Produccion OP-5678 termina manana — puede desbloquear pedidos"
  estimatedValue: 2400000
  effort: "low"

  ↓

DECISION
  title: "Iniciar despacho inmediato al completarse OP-5678"
  decisionType: "start_production"
  requiresApproval: true
  reason: "Produccion en curso puede cubrir pedidos bloqueados"

  ↓

RECOMMENDATION
  title: "Contactar a Carlos Leon para preparar despacho"
  expectedBenefit: "Desbloquear 3 pedidos por $2.4M"
  suggestedOnly: true

  ↓

REASONING CHAIN
  steps: [obs→finding→insight→risk→opportunity→decision→recommendation]
  confidence: { score: 78, level: "high", reason: "Datos SAG + CRM disponibles" }

  ↓

REASONING CONTEXT
  → David genera explicacion conversacional
  → Executive Dashboard muestra riesgo
  → Copilot sugiere accion
```

---

## 6. Compatibilidad

### Knowledge Graph
Todo Insight se construye usando el Knowledge Graph.
`buildInsights()` consulta el grafo para descubrir relaciones y caminos.
Nunca recorre modulos directamente.

### Business Event Engine (futuro)
Los eventos alimentaran nuevas observaciones automaticamente.
`order.created` → Observation con metric "order_created".
`stage.completed` → Observation con metric "stage_completed".

### Executive Intelligence
Executive Intelligence dejara de consumir datos directamente.
Consumira `ReasoningContext`.

### David / Copilot
David nunca razonara directamente.
David recibira `ReasoningContext` y generara la explicacion conversacional.
Otros agentes (Mila, Luca, Pablo) reutilizan el mismo contexto.

### Rule Engine (futuro)
Las reglas evaluaran `Finding` y `Insight` para generar `Risk` y `Opportunity`.
`buildInsights()` y `analyzeRisks()` delegaran a reglas configurables.

### Action Engine (futuro)
`Decision` con `requiresApproval: false` sera ejecutable por Action Engine.
Hasta entonces, toda `Recommendation` lleva `suggestedOnly: true`.

---

## 7. Archivos del Sprint

| Archivo | Proposito |
|---|---|
| `reasoning-types.ts` | EntityRef, 5 severities, 10 categories, 8 sources, 5 urgencies, 14 decision types, 5 effort levels |
| `observation.ts` | Observation (12 campos), buildObservation() |
| `evidence.ts` | Evidence (10 campos), EvidenceItem, 9 evidence types, builders |
| `reasoning-confidence.ts` | ReasoningConfidence (7 campos), scoreToLevel(), aggregateConfidence() |
| `finding.ts` | Finding (13 campos), buildFinding() |
| `insight.ts` | Insight (15 campos), InsightImpact, buildInsight() |
| `risk.ts` | Risk (18 campos), PreventiveAction (suggestedOnly), builders |
| `opportunity.ts` | Opportunity (14 campos), buildOpportunity() |
| `decision.ts` | Decision (18 campos), ExpectedImpact, buildDecision() |
| `recommendation.ts` | Recommendation (16 campos, suggestedOnly: true), buildRecommendation() |
| `reasoning-chain.ts` | ReasoningChain (16 campos), ChainStep, buildReasoningChain() |
| `reasoning-context.ts` | ReasoningContext (16 campos), topRisk(), topRecommendation(), contextCounts() |
| `reasoning-engine.ts` | IReasoningEngine (8 methods), ReasoningRequest, ReasoningResult |
| `reasoning-utils.ts` | sortBySeverity, anomalous/filtered observations, extractEntities, chainSummary, contextOneLiner |
| `index.ts` | Barrel export (client-safe) |

---

## 8. Roadmap

### Phase 2: Domain Reasoners
- [ ] VendorReasoner (uses LiveVendor + Knowledge Graph)
- [ ] ProductReasoner (uses SAG catalog + Knowledge Graph)
- [ ] OrderReasoner (uses CRM quotes + Knowledge Graph)
- [ ] ProductionReasoner (uses SAG OPs + Knowledge Graph)

### Phase 3: Rule-Driven Reasoning
- [ ] Configurable risk rules per tenant
- [ ] Configurable opportunity rules per tenant
- [ ] Rule Engine integration in analyzeRisks() / analyzeOpportunities()

### Phase 4: Event-Driven Observations
- [ ] Business Event Engine feeds observe()
- [ ] Real-time observations from events
- [ ] Historical observation storage

### Phase 5: Agent Integration
- [ ] David consumes ReasoningContext exclusively
- [ ] Copilot right rail shows reasoning summary
- [ ] Executive Dashboard shows top risks/opportunities
- [ ] Intelligent Reports use ReasoningChain for narrative

### Phase 6: Action Engine
- [ ] Decision execution with approval workflows
- [ ] Recommendation → Action conversion
- [ ] Impact tracking after action execution
