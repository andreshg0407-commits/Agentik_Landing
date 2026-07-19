# BUSINESS-PLANNING-ENGINE-01 — Operational Planning Engine

**Sprint:** BUSINESS-PLANNING-ENGINE-01
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained, zero regressions)

---

## Vision

Agentik does not improvise responses. When a business situation occurs, the system builds structured alternatives — each with costs, benefits, risks, dependencies, constraints, approval requirements, evaluation scores, and confidence levels.

The Planning Engine is the bridge between **governance** (Rule Engine) and **execution** (future Action Engine). It converts evaluated rules, signals, events, reasoning, and operational context into comparable, auditable plans pending approval.

**Business Planning Rule:** Plans do not belong to modules. Comercial does not create plans. Production does not create plans. Inventory does not create plans. Modules produce data, Signals, and Events. Rule Engine evaluates policies. Planning Engine builds alternatives. Action Engine (future) will execute approved plans.

---

## Architecture

```
RuleEvaluationResult / BusinessEvent / BusinessSignal
    ↓
PlanningContext (assembled by caller)
    ├─ ruleResults[]
    ├─ events[]
    ├─ signals[]
    ├─ reasoningContext
    ├─ knowledgeContext
    ├─ entitySnapshots[]
    ├─ workflowContext
    ├─ metrics
    └─ constraints
    ↓
IPlanningEngine.createPlan() / createFromRuleResult() / createFromEvent() / createFromSignal()
    ├─ generateAlternatives()        ← from PlanningRegistry strategies
    ├─ evaluateAlternative()         ← per-alternative scoring (7 criteria)
    ├─ evaluateAlternatives()        ← rank all alternatives
    └─ selectRecommendedAlternative() ← pick best
    ↓
BusinessPlan (suggestedOnly: true)
    ├─ alternatives[]                ← ranked PlanAlternative[]
    │   ├─ steps[]                   ← PlanStep[]
    │   ├─ constraints[]             ← PlanConstraint[]
    │   ├─ dependencies[]            ← PlanDependency[]
    │   ├─ costs[]                   ← PlanCost[]
    │   ├─ benefits[]                ← PlanBenefit[]
    │   ├─ risks[]                   ← PlanRisk[]
    │   ├─ approvalRequirements[]    ← PlanApprovalRequirement[]
    │   └─ evaluation                ← PlanEvaluation (score, rank, criteria)
    ├─ selectedAlternativeId         ← recommended alternative
    ├─ confidence                    ← overall confidence
    └─ trigger                       ← what originated the plan
```

---

## Files created (16)

| File | Purpose |
|---|---|
| `lib/business-planning/planning-types.ts` | PlanStatus(9), PlanSource(9), PlanPriority(5), PlanSeverity(5), PlanStrategy(10+), PlanEntityRef, all sub-types (CostType, BenefitType, StepType, ConstraintType, DependencyType, ApprovalType), nextPlanId() |
| `lib/business-planning/plan.ts` | BusinessPlan (18 fields, suggestedOnly:true), PlanTriggerRef, buildBusinessPlan() |
| `lib/business-planning/plan-alternative.ts` | PlanAlternative (18 fields), buildPlanAlternative() |
| `lib/business-planning/plan-step.ts` | PlanStep (14 fields), PlanStepType (13), buildPlanStep() |
| `lib/business-planning/plan-constraint.ts` | PlanConstraint (8 fields), PlanConstraintType (12), buildPlanConstraint() |
| `lib/business-planning/plan-dependency.ts` | PlanDependency (8 fields), PlanDependencyType (9), buildPlanDependency() |
| `lib/business-planning/plan-cost.ts` | PlanCost (6 fields), PlanCostType (7), buildPlanCost() |
| `lib/business-planning/plan-benefit.ts` | PlanBenefit (6 fields), PlanBenefitType (8), buildPlanBenefit() |
| `lib/business-planning/plan-risk.ts` | PlanRisk (9 fields), buildPlanRisk() with auto-severity from probability × impact |
| `lib/business-planning/plan-approval.ts` | PlanApprovalRequirement (7 fields), PlanApprovalType (8), buildPlanApproval() |
| `lib/business-planning/plan-evaluation.ts` | PlanEvaluation (10 fields), CriterionScore, PlanEvaluationCriterion (9), buildPlanEvaluation() with weighted scoring |
| `lib/business-planning/plan-context.ts` | PlanningContext (12 fields), PlanningEntitySnapshot, buildPlanningContext() |
| `lib/business-planning/planning-engine.ts` | IPlanningEngine (9 methods), InMemoryPlanningEngine |
| `lib/business-planning/planning-registry.ts` | PlanningStrategy contract, PlanningRegistry, 9 built-in strategies, DEFAULT_STRATEGIES |
| `lib/business-planning/planning-utils.ts` | 14 utilities (recommendedAlternative, rankedAlternatives, feasibleAlternatives, planSummary, etc.) |
| `lib/business-planning/index.ts` | Client-safe barrel export |

---

## Key contracts

### BusinessPlan

```typescript
interface BusinessPlan {
  planId: string;
  organizationId: string;
  title: string;
  description: string;
  status: PlanStatus;             // Planning Engine only produces "proposed"
  source: PlanSource;
  trigger: PlanTriggerRef;
  alternatives: PlanAlternative[];
  selectedAlternativeId: string | null;
  confidence: number;             // 0–100
  priority: PlanPriority;
  severity: PlanSeverity;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
  suggestedOnly: true;            // MANDATORY
}
```

### PlanAlternative

```typescript
interface PlanAlternative {
  alternativeId: string;
  planId: string;
  title: string;
  description: string;
  strategy: PlanStrategy;
  steps: PlanStep[];
  constraints: PlanConstraint[];
  dependencies: PlanDependency[];
  costs: PlanCost[];
  benefits: PlanBenefit[];
  risks: PlanRisk[];
  approvalRequirements: PlanApprovalRequirement[];
  evaluation: PlanEvaluation | null;
  estimatedDuration: string;
  expectedImpact: string;
  confidence: number;
  score: number;                  // 0–100, from evaluation
  rank: number;                   // 1 = best
  metadata: Record<string, unknown>;
}
```

### PlanningContext

```typescript
interface PlanningContext {
  organizationId: string;
  triggerDescription: string;
  ruleResults: RuleEvaluationResult[];
  events: BusinessEvent[];
  signals: BusinessSignal[];
  reasoningContext: Record<string, unknown>;
  knowledgeContext: Record<string, unknown>;
  entitySnapshots: PlanningEntitySnapshot[];
  workflowContext: Record<string, unknown>;
  metrics: Record<string, number>;
  constraints: Record<string, unknown>;
  metadata: Record<string, unknown>;
}
```

---

## Evaluation criteria

| Criterion | Weight | Scoring logic |
|---|---|---|
| benefit | 0.20 | Benefits count and total estimated value |
| cost | 0.15 | Lower cost = higher score |
| risk | 0.15 | Fewer/lower-impact risks = higher score |
| feasibility | 0.20 | Blocking constraints = 10, unmet deps = 40, clear = 80 |
| confidence | 0.10 | Direct from alternative confidence |
| approval_complexity | 0.10 | Fewer blocking approvals = higher score |
| operational_effort | 0.10 | Fewer steps = higher score |

---

## Built-in strategies (9)

| Strategy | Name | Applies when |
|---|---|---|
| remove_portfolio_sample | Retirar muestra de maleta | inventory absence signal or depleted portfolio metric |
| produce | Revisar produccion | open production orders or production signal |
| transfer_inventory | Traslado de inventario | alternative inventory available |
| contact_vendor | Contactar vendedor | affected vendors exist |
| contact_customer | Contactar clientes | affected customers exist |
| escalate_to_management | Escalar a gerencia | 5+ affected orders or critical rule match |
| wait_for_production | Esperar produccion | open production orders |
| review_data | Revisar calidad de datos | data quality issues or low-confidence evidence |
| do_nothing | No tomar accion | Always available (baseline alternative) |

Strategies are pluggable via `PlanningRegistry.registerStrategy()`.

---

## Castillitos case: Referencia agotada con maleta activa y pedidos

### Input

- RuleEvaluationResult: "Referencia agotada con pedidos abiertos" (critical)
- Signals: inventory_out_of_stock, portfolio_reference_out_of_stock, commercial_order_blocked
- Events: inventory_out_of_stock_detected, vendor_portfolio_reference_out_of_stock
- Metrics: affected_order_count=3, affected_vendor_count=2, depleted_portfolio_count=1, open_production_count=1, alternative_inventory_total=15

### Generated plan (6 alternatives)

| Rank | Alternative | Strategy | Score | Key factors |
|---|---|---|---|---|
| #1 | Retirar muestra de maleta | remove_portfolio_sample | ~75 | High confidence, low effort, protects vendor consistency |
| #2 | Contactar vendedor | contact_vendor | ~72 | Quick, proactive, high confidence |
| #3 | Traslado de inventario | transfer_inventory | ~65 | Recovers stock, but logistics cost + time |
| #4 | Revisar produccion | produce | ~62 | Aligns production, but depends on OP completion |
| #5 | Escalar a gerencia | escalate_to_management | ~60 | 3+ orders affected, high visibility |
| #6 | Esperar produccion | wait_for_production | ~50 | Low effort but high risk of delay |
| #7 | No tomar accion | do_nothing | ~30 | Always available, highest risk |

Each alternative includes steps, costs, benefits, risks, dependencies, and approval requirements.

---

## Relationships with other engines

| Engine | Relationship |
|---|---|
| **Rule Engine** | Planning Engine consumes RuleEvaluationResult. Does not modify or reevaluate rules. |
| **Event Engine** | Events can trigger plans via createFromEvent(). Does not modify Event Engine. |
| **Signal Engine** | Signals can trigger plans via createFromSignal(). Does not modify Signal Engine. |
| **Knowledge Graph** | Knowledge context provided via PlanningContext.knowledgeContext. |
| **Reasoning Engine** | Reasoning context provided via PlanningContext.reasoningContext. |
| **Executive Intelligence** | Can display plans and recommended alternatives. |
| **David / Copilot** | Explains plans. Does NOT invent them. |
| **Action Engine (future)** | Will consume approved plans. NOT implemented in this sprint. |

---

## What this sprint does NOT do

- Does NOT execute actions
- Does NOT send notifications
- Does NOT modify data
- Does NOT create production orders
- Does NOT update SAG
- Does NOT call AI/LLM
- Does NOT modify UI
- Does NOT build Action Engine
- Does NOT persist plans to database

---

## Roadmap

1. **ACTION-ENGINE-01** — Execute approved plans: consume plans where status = "approved", execute suggested actions with rollback support
2. **PLANNING-PERSISTENCE-01** — Persist plans to Prisma for audit trail and historical analysis
3. **PLANNING-UI-01** — Plan comparison UI: show alternatives side-by-side with costs, benefits, risks
4. **PLANNING-APPROVAL-FLOW-01** — Wire plan approvals into the approval lifecycle
5. **PLANNING-DAVID-INTEGRATION-01** — David explains plans using explainPlan() output

---

## Rules enforced

- No Prisma, React, AI, or UI imports — pure domain types
- Every plan carries `suggestedOnly: true`
- Planning Engine only produces `proposed` status — never `executed`
- All information arrives via PlanningContext — no direct module queries
- Plans belong to the Planning Engine, not to modules
- Strategies are pluggable via PlanningRegistry
- Evidence and confidence tracked throughout
- Missing information explicitly declared in evaluations
- BusinessEntity Isolation Rule maintained
- TSC baseline maintained at 160
