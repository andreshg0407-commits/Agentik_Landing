# BUSINESS-SIGNALS-01 — Operational Signal Engine

**Sprint:** BUSINESS-SIGNALS-01
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained, zero regressions)

---

## What was built

The Operational Signal Engine — the intermediate layer between Observations and Reasoning. Business Signals represent the operational language of Agentik: a Signal declares that a significant business condition exists, without interpreting, recommending, or alerting.

**Rule:** Every relevant business condition MUST be represented as a BusinessSignal before any upper layer (Reasoning, Executive Intelligence, David) processes it.

---

## Architecture

```
Raw Data
    ↓
Business Entity
    ↓
Observation (raw fact, zero interpretation)
    ↓
Business Signal (relevant condition declared)      ← THIS SPRINT
    ↓
Reasoning (interpretation, analysis)
    ↓
Insight (understanding via Knowledge Graph)
    ↓
Recommendation (suggested action, suggestedOnly: true)
    ↓
Executive Intelligence
    ↓
David / Copilot
```

**Mandatory flow:** Never skip from Observation directly to Recommendation. Always pass through Signals.

---

## Files created

| File | Purpose |
|---|---|
| `lib/business-signals/signal-types.ts` | Core types: SignalEntityRef, nextSignalId() |
| `lib/business-signals/signal-category.ts` | SignalCategory (13 categories), SIGNAL_CATEGORIES, isSignalCategory() |
| `lib/business-signals/signal-severity.ts` | SignalSeverity (6 levels), compareSeverity(), meetsThreshold() |
| `lib/business-signals/signal-priority.ts` | SignalPriority (5 levels, independent of severity), comparePriority() |
| `lib/business-signals/signal-source.ts` | SignalSource (12 sources), SIGNAL_SOURCES |
| `lib/business-signals/signal-evidence.ts` | SignalEvidenceItem, SignalEvidence, builders |
| `lib/business-signals/signal-context.ts` | SignalContext (what/where/entity/related/metrics/missing), SignalContextMetric |
| `lib/business-signals/signal.ts` | BusinessSignal (26 fields), MergedSignal, SignalStatus (7 states), SignalType (15 condition types) |
| `lib/business-signals/signal-builder.ts` | buildSignal(), buildThresholdBreachSignal(), buildAbsenceSignal(), buildStateChangeSignal(), buildDeadlineSignal(), mergeSignals() |
| `lib/business-signals/signal-engine.ts` | ISignalEngine (14 methods), InMemorySignalEngine, SignalFilter, DeduplicationResult, SignalSummary |
| `lib/business-signals/signal-utils.ts` | 18 utility functions: filtering, sorting, aggregation, analysis |
| `lib/business-signals/index.ts` | Client-safe barrel export |

---

## Signal lifecycle

```
new → active → acknowledged → resolved
                             → expired
                             → ignored
                             → unknown
```

Terminal states: `resolved`, `expired`, `ignored`.

---

## Signal dimensions

### Severity (impact of the condition)
`info` < `low` < `medium` < `high` < `critical` | `unknown`

### Priority (processing order, INDEPENDENT of severity)
`lowest` < `low` < `normal` < `high` < `highest`

A low-severity signal CAN have highest priority. Example: routine inventory recount (low severity) for a VIP order (highest priority).

### Category (business domain)
`inventory` | `production` | `commercial` | `financial` | `customer` | `vendor` | `portfolio` | `store` | `workflow` | `quality` | `operations` | `system` | `custom`

### Source (system layer that detected the condition)
`inventory` | `workflow` | `reasoning` | `knowledge_graph` | `crm` | `sag` | `manual` | `external_api` | `system` | `computed` | `observation` | `future_data_warehouse`

### Type (condition pattern)
`threshold_breach` | `absence_detected` | `anomaly_detected` | `state_change` | `deadline_approaching` | `deadline_exceeded` | `target_reached` | `target_missed` | `relationship_change` | `pattern_detected` | `new_entity` | `entity_removed` | `sync_event` | `manual_flag` | `compound`

---

## Signal Engine contract

```typescript
interface ISignalEngine {
  // Lifecycle
  createSignal(signal: BusinessSignal): Promise<BusinessSignal>;
  updateStatus(signalId: string, status: SignalStatus): Promise<BusinessSignal | null>;
  resolveSignal(signalId: string, reason?: string): Promise<BusinessSignal | null>;

  // Queries
  findSignals(filter: SignalFilter): Promise<BusinessSignal[]>;
  findByEntity(orgId: string, entityId: string, entityType?: string): Promise<BusinessSignal[]>;
  findByCategory(orgId: string, category: SignalCategory): Promise<BusinessSignal[]>;
  getSignal(signalId: string): Promise<BusinessSignal | null>;

  // Aggregation
  groupSignals(filter: SignalFilter, groupBy: SignalGroupKey): Promise<SignalGroup[]>;
  getSummary(orgId: string): Promise<SignalSummary>;

  // Deduplication & Merging
  deduplicateSignals(signals: BusinessSignal[]): DeduplicationResult;
  mergeSignals(signals: BusinessSignal[]): MergedSignal | null;

  // Expiration
  expireSignals(orgId: string): Promise<number>;

  // Context
  buildContext(signal: BusinessSignal): Promise<BusinessSignal>;
}
```

---

## Signal Context

Every signal carries a `SignalContext` answering:

| Question | Field |
|---|---|
| What happened? | `what` |
| Where? | `where` |
| On which entity? | `primaryEntity` |
| Related entities? | `relatedEntities` |
| Current metrics? | `metrics` (key, value, unit, threshold) |
| What's missing? | `missingInformation` |
| Extra data? | `data` |

Context does NOT interpret or recommend. That belongs to Reasoning.

---

## Signal Evidence

Every signal MUST carry evidence explaining its origin. No signal without evidence is valid.

```typescript
interface SignalEvidence {
  observationIds: string[];      // Observations that triggered this
  entities: SignalEntityRef[];   // Business entities involved
  relationIds: string[];         // Knowledge Graph edges
  metricKeys: string[];          // Metrics that contributed
  items: SignalEvidenceItem[];   // Individual evidence items
  strength: number;              // 0-100
}
```

---

## Signal deduplication

Two different engines can detect the same condition:
- Inventory detects: Stock = 0
- Production detects: Order blocked by missing inventory

These must NOT create duplicate signals. The Signal Engine deduplicates via `deduplicationKey`:

```
{organizationId}:{entityId}:{category}:{type}:{title}
```

Equivalent signals are merged into a `MergedSignal` with combined evidence and highest severity/priority.

---

## Signal merging

Multiple related signals can be merged into a compound signal:

```
Stock critico          ┐
Pedidos afectados      ├→ "Referencia critica" (compound signal)
Produccion pendiente   ┘
```

This prevents saturating the executive with redundant signals.

---

## Relationship with Knowledge Graph

Signals may consult Knowledge Graph for context enrichment:

```
Product depleted
    ↓ Knowledge Graph
    → Related vendors
    → Related maletas
    → Related orders
    → Related customers
    → Enriched context
```

Signals NEVER query modules directly. Only BusinessEntity, Knowledge Graph, and Observation.

---

## Relationship with Reasoning

```
Observation = a fact ("Stock = 0")
Signal      = a condition ("Stock critico detected")
Insight     = an interpretation ("This blocks 5 pending orders")
```

Reasoning MUST consume Signals, never Observations directly. This ensures every business condition is properly declared before interpretation begins.

---

## Relationship with Executive Intelligence

Executive Intelligence consumes:
- Signals (operational conditions)
- Insights (interpretations)
- Recommendations (suggested actions)

Executive Intelligence does NOT consume raw Observations.

---

## Relationship with Business Event Engine (future)

Business Event Engine will use Signals as a primary event source:

```
Signal: Stock critico
    ↓
Business Event: InventoryCriticalDetected
    ↓
Rule Engine evaluation
    ↓
Action Engine execution
```

NOT implemented in this sprint — documented as architectural roadmap.

---

## Real Castillitos signal examples

| Signal | Category | Type | Severity |
|---|---|---|---|
| Referencia agotada | inventory | absence_detected | critical |
| Stock critico (< 10 unidades) | inventory | threshold_breach | high |
| Pedido bloqueado por inventario | commercial | absence_detected | high |
| OP retrasada (> 30 dias) | production | deadline_exceeded | medium |
| Produccion finalizada | production | state_change | info |
| Maleta desactualizada | portfolio | state_change | low |
| Cliente inactivo (> 60 dias) | customer | absence_detected | medium |
| Vendedor sin actividad | vendor | absence_detected | medium |
| Inventario en otra bodega | inventory | pattern_detected | info |
| Cartera vencida > 30 dias | financial | deadline_exceeded | high |

---

## Quick builders

| Builder | Signal Type | Use Case |
|---|---|---|
| `buildThresholdBreachSignal()` | threshold_breach | Metric exceeds configured limit |
| `buildAbsenceSignal()` | absence_detected | Something expected is missing |
| `buildStateChangeSignal()` | state_change | Entity transitioned states |
| `buildDeadlineSignal()` | deadline_approaching / deadline_exceeded | Time-based conditions |
| `buildSignal()` | any | General-purpose builder |

---

## Future domain-specific builders (not implemented)

| Builder | Domain | Sprint |
|---|---|---|
| InventorySignalBuilder | Inventory | Future |
| ProductionSignalBuilder | Production | Future |
| CommercialSignalBuilder | Commercial | Future |
| WorkflowSignalBuilder | Workflow | Future |
| FinancialSignalBuilder | Financial | Future |

---

## Roadmap

1. **BUSINESS-SIGNALS-02**: Domain-specific signal builders for Castillitos
2. **BUSINESS-SIGNALS-03**: Signal persistence (Prisma models)
3. **BUSINESS-SIGNALS-04**: Wire Reasoning Engine to consume Signals instead of Observations
4. **BUSINESS-SIGNALS-05**: Wire Executive Intelligence to consume Signals
5. **BUSINESS-EVENT-ENGINE-01**: Business Events consuming Signals
6. **BUSINESS-RULE-ENGINE-01**: Rule evaluation on Signals
7. **BUSINESS-ACTION-ENGINE-01**: Automated actions from evaluated rules

---

## Rules enforced

- No Prisma, no React, no UI, no server-only — pure domain contracts
- Every signal carries evidence (no signal without evidence)
- Signals are domain-agnostic (category identifies the domain)
- Priority is independent of severity
- Deduplication via deterministic deduplication key
- Signal Engine is interface-first (ISignalEngine contract)
- InMemorySignalEngine provided for testing only
- BusinessEntity Isolation Rule maintained (signals never query modules)
- Compatible with BusinessEntityType from business-entities/core
