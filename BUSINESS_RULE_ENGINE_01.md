# BUSINESS-RULE-ENGINE-01 — Operational Rule Engine

**Sprint:** BUSINESS-RULE-ENGINE-01
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained, zero regressions)

---

## What was built

The Operational Rule Engine — a declarative, tenant-configurable business governance layer. Rules evaluate conditions against data contexts and suggest outcomes. They do NOT execute actions.

Rules formalize business logic that was previously embedded in reasoning chains. They consume Business Events, Business Signals, workflow transitions, and entity state changes produced by upstream engines.

---

## Architecture

```
Business Events / Signals / Workflow Transitions / Entity State Changes
    ↓
RuleEvaluationContext (flattened data map)
    ↓
IRuleEngine.evaluate()
    ├─ findApplicableRules()     ← trigger + scope matching
    ├─ per rule:
    │   ├─ evaluateRule()        ← condition tree evaluation
    │   ├─ buildEvidence()       ← evidence from condition results
    │   └─ suggestedOutcome      ← only if matched
    ↓
RuleEvaluationResult
    ├─ evaluations[]             ← full audit trail per rule
    ├─ suggestedOutcomes[]       ← outcomes from matched rules
    ├─ suggestedActions[]        ← flattened actions (suggestedOnly: true)
    └─ evidence + confidence     ← data completeness tracking
```

---

## Files created (13)

| File | Purpose |
|---|---|
| `lib/business-rules/rule-types.ts` | RuleCategory (14), RuleSeverity (5), RulePriority (5), RuleEntityRef, nextRuleId() |
| `lib/business-rules/rule.ts` | BusinessRule (22 fields), RuleStatus, RuleSuggestedAction, RuleSuggestedOutcome |
| `lib/business-rules/rule-scope.ts` | RuleScope (12 dimensions), buildRuleScope(), globalScope(), orgScope(), matchesScope() |
| `lib/business-rules/rule-trigger.ts` | RuleTriggerType (7), RuleTrigger, eventTrigger(), signalTrigger(), workflowTrigger(), manualTrigger(), matchesTrigger() |
| `lib/business-rules/rule-condition.ts` | ConditionOperator (14), ConditionSource (16), SimpleCondition, CompoundCondition, evaluateCondition() |
| `lib/business-rules/rule-context.ts` | RuleEvaluationContext, buildRuleEvaluationContext() |
| `lib/business-rules/rule-evidence.ts` | RuleEvidence, RuleEvidenceItem, buildRuleEvidence(), emptyRuleEvidence() |
| `lib/business-rules/rule-evaluation.ts` | RuleEvaluation (audit record), RuleEvaluationStatus (4 states) |
| `lib/business-rules/rule-result.ts` | RuleEvaluationResult (aggregate), buildRuleEvaluationResult() |
| `lib/business-rules/rule-engine.ts` | IRuleEngine (3 methods), InMemoryRuleEngine |
| `lib/business-rules/rule-registry.ts` | RuleRegistry (register, query, activeForOrg, byCategory), RuleFilter |
| `lib/business-rules/rule-utils.ts` | 10 utilities (matchedEvaluations, hasMatchAtSeverity, evaluationSummary, averageConfidence, etc.) |
| `lib/business-rules/index.ts` | Client-safe barrel export |

---

## Key design decisions

### 1. Declarative conditions

Conditions are a tree of simple comparisons and compound logic:

```typescript
// Simple: field operator value
simpleCondition("inventory_available", "equals", 0, "entity.state")

// Compound: all/any/none
allConditions(
  simpleCondition("inventory_available", "equals", 0, "entity.state"),
  simpleCondition("order_count", "greater_than", 0, "entity.metrics"),
)
```

14 operators: equals, not_equals, greater_than, greater_or_equal, less_than, less_or_equal, contains, not_contains, exists, not_exists, in, not_in, between, matches.

### 2. Multi-dimensional scope

Rules can target any combination of 12 scope dimensions:

- organizationIds, entityTypes, entityIds, domains
- workflowDefinitionIds, workflowStages
- vendorIds, portfolioIds, storeIds, customerIds
- productReferences, locationIds

Null = matches all. Array = matches any (OR within dimension). Multiple dimensions = AND across dimensions.

### 3. Multiple trigger types

7 trigger types: business_event, business_signal, workflow_transition, entity_state_change, manual_evaluation, scheduled_evaluation, reasoning_finding.

A rule can have multiple triggers (OR — any matching trigger activates evaluation).

### 4. Evidence and confidence

Every evaluation carries evidence:
- What data points were examined
- What values were found vs expected
- What fields were missing
- Confidence score based on data completeness

### 5. suggestedOnly: true

All outcomes, actions, and results carry `suggestedOnly: true`. The Rule Engine evaluates and suggests — the future Action Engine will execute.

---

## Condition operators

| Operator | Description | Value type |
|---|---|---|
| equals | Strict equality | any |
| not_equals | Strict inequality | any |
| greater_than | Numeric > | number |
| greater_or_equal | Numeric >= | number |
| less_than | Numeric < | number |
| less_or_equal | Numeric <= | number |
| contains | String includes | string |
| not_contains | String not includes | string |
| exists | Field is present and non-null | null |
| not_exists | Field is missing or null | null |
| in | Value in array | array |
| not_in | Value not in array | array |
| between | Numeric range [min, max] | [number, number] |
| matches | Regex test | string (pattern) |

---

## Trigger types

| Type | Activated by | Example |
|---|---|---|
| business_event | BusinessEvent emission | inventory_out_of_stock_detected |
| business_signal | BusinessSignal creation | stock_critical signal |
| workflow_transition | Workflow stage change | pedido moved to "despachado" |
| entity_state_change | Entity field mutation | store status → "deshabilitada" |
| manual_evaluation | User/admin request | Manual policy check |
| scheduled_evaluation | Cron/scheduler | Nightly compliance scan |
| reasoning_finding | Reasoning engine output | Risk finding above threshold |

---

## Castillitos example rules

### Rule 1: Referencia agotada con pedidos abiertos

```typescript
const rule: BusinessRule = {
  ruleId: "castillitos-inv-001",
  orgSlug: "castillitos",
  name: "Referencia agotada con pedidos abiertos",
  category: "inventory",
  severity: "critical",
  priority: "highest",
  status: "active",
  triggers: [eventTrigger("inventory_out_of_stock_detected")],
  scope: orgScope("castillitos"),
  condition: allConditions(
    simpleCondition("inventory_available", "equals", 0, "entity.state"),
    simpleCondition("open_order_count", "greater_than", 0, "entity.metrics"),
  ),
  outcome: {
    severity: "critical",
    summary: "Referencia agotada con pedidos activos",
    description: "Inventario en 0 mientras existen pedidos pendientes de despacho",
    suggestedActions: [
      { actionId: "a1", label: "Retirar de maletas activas", actionType: "withdraw_from_portfolio", priority: 1, parameters: {}, suggestedOnly: true },
      { actionId: "a2", label: "Revisar producción abierta", actionType: "review_production", priority: 2, parameters: {}, suggestedOnly: true },
    ],
    tags: ["agotado", "pedidos-bloqueados"],
    suggestedOnly: true,
  },
  // ...
};
```

### Rule 2: Maleta con referencias agotadas

```typescript
condition: allConditions(
  simpleCondition("portfolio_status", "equals", "active", "entity.state"),
  simpleCondition("depleted_reference_count", "greater_than", 0, "entity.metrics"),
)
// outcome: suggest portfolio review, severity: high
```

### Rule 3: Stock crítico sin producción abierta

```typescript
condition: allConditions(
  simpleCondition("inventory_available", "between", [1, 10], "entity.state"),
  simpleCondition("open_production_count", "equals", 0, "entity.metrics"),
)
// outcome: suggest creating production order, severity: medium
```

---

## Relationships with other engines

| Engine | Relationship |
|---|---|
| Business Events | Events trigger rule evaluation via `business_event` triggers |
| Business Signals | Signals trigger rule evaluation via `business_signal` triggers |
| Workflow Engine | Workflow transitions trigger via `workflow_transition` triggers |
| Knowledge Graph | Rule scope can reference entity relationships discovered by KG |
| Reasoning Engine | Reasoning findings can trigger rules; rule results feed back to reasoning |
| Executive Intelligence | Rule evaluation results available to executive pipeline |
| Action Engine (future) | Will consume `suggestedActions` from rule results |

---

## Rules enforced

- No Prisma, React, AI, or UI imports — pure domain types
- Every action carries `suggestedOnly: true`
- Every outcome carries `suggestedOnly: true`
- Every result carries `suggestedOnly: true`
- Evidence tracks missing data explicitly
- Confidence is computed from data completeness
- Rules don't execute — they evaluate and suggest
- BusinessEntity Isolation Rule maintained
- TSC baseline maintained at 160
