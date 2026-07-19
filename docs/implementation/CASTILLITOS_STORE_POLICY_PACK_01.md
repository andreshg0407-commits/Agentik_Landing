# CASTILLITOS-STORE-POLICY-PACK-01

**Sprint:** CASTILLITOS-STORE-POLICY-PACK-01
**Status:** COMPLETE
**Date:** 2026-07-14
**TSC Baseline:** 160 (preserved)
**QA:** 178/178 PASS
**Validation:** 69/69 PASS

---

## Overview

This Policy Pack configures all operational behavior for Castillitos stores using the existing Business Policy Engine. No new infrastructure was created. All rules are fully configurable and produce `CommercialEvidence` explaining their reasoning.

**Scope:** Tiendas exclusively. No maletas, vendedores, pedidos, or produccion.

---

## Policies

### 1. Cobertura Textil (FASE 2)
**ID:** `csp-textile-coverage-v1`
**Category:** COVERAGE
**Scope:** Per reference, per store

| Parameter | Value | Unit |
|-----------|-------|------|
| minimumUnits | 8 | und |
| idealUnits | 10 | und |
| maximumUnits | 12 | und |

**Behavior:** Flags references below minimum, below ideal, or above maximum. Does not execute transfers — only suggests.

### 2. Regla 36 — Stock Global Bajo (FASE 3)
**ID:** `csp-global-low-stock-v1`
**Category:** STORE
**Scope:** Global (all warehouses)

| Parameter | Value |
|-----------|-------|
| threshold | 36 und |
| allowedStores | Centro, Caldas |

**Behavior:** When a textile reference has 36 units or less across ALL warehouses, it must only remain in Centro and Caldas. Other stores receive a transfer suggestion (never automatic).

### 3. Cobertura Accesorios (FASE 4)
**ID:** `csp-accessory-coverage-v1`
**Category:** COVERAGE
**Scope:** Per store, per size class

| Size Class | Ideal Units |
|------------|-------------|
| small | 6 |
| medium | 4 |
| large | 1 |
| oversized | 1 |

**Behavior:** For stores only. Does not use maleta derrotero.

### 4. Productos Especiales (FASE 5)
**ID:** `csp-special-products-v1`
**Category:** STORE

| Product | San Diego | Caldas | Others |
|---------|-----------|--------|--------|
| Banera | 3 | 3 | 0 |
| Cuna Colecho | 3 | 3 | 0 |
| Corral | 3 | 3 | 0 |

**Behavior:** Generates alert when state changes. Products in unauthorized stores (ideal=0) get high-severity alerts.

### 5. Descuentos Automaticos (FASE 6)
**ID:** `csp-automatic-markdown-v1`
**Category:** MARKDOWN
**Applies to:** Centro, Caldas only

| Months | Discount |
|--------|----------|
| 3 | 10% |
| 6 | 30% |
| 9 | 50% |
| 12 | 70% |

**Behavior:** Generates a Suggested Markdown document with evidence. Never applies automatically.

### 6. Baja Rotacion (FASE 7)
**ID:** `csp-slow-rotation-v1`
**Category:** ALERT

| Parameter | Value |
|-----------|-------|
| minimumDaysThreshold | 90 days |

**Behavior:** Generates alert showing days, months, inventory, and suggested discount.

### 7. Sugerencia de Surtido (FASE 8)
**ID:** `csp-assortment-suggestion-v1`
**Category:** REPLENISHMENT

**Behavior:** When a store needs replenishment, prioritizes references by THAT store's sales history. Never uses global sales.

### 8. Informe Comparativo (FASE 9)
**ID:** `csp-comparative-report-v1`
**Category:** REPORT

**Answers:**
- Which store sells the most?
- Which store has the best rotation?
- Which store generates the highest margin?
- Which references work in one store but not another?

---

## Precedence

Policies are evaluated independently — they do not conflict because each addresses a different dimension:

| Priority | Policy | Dimension |
|----------|--------|-----------|
| 200 | Regla 36 | Global stock distribution |
| 150 | Productos Especiales | Product-specific placement |
| 100 | Cobertura Textil | Per-reference coverage |
| 90 | Cobertura Accesorios | Size-based coverage |
| 80 | Descuentos Automaticos | Aging-based pricing |
| 70 | Baja Rotacion | Aging alerts |
| 60 | Sugerencia de Surtido | Replenishment priority |
| 50 | Informe Comparativo | Cross-store analysis |

When Regla 36 triggers, it takes precedence over individual store coverage — a reference that should concentrate in Centro/Caldas will not receive surtido suggestions for other stores.

---

## Evidence Contract

Every policy produces a `StorePolicyEvidenceItem` that answers three questions:

1. **Why did it activate?** (`activationReason`)
2. **What data did it use?** (`dataUsed`)
3. **What action does it recommend and why?** (`recommendedAction` + `actionRationale`)

Plus: `confidence` (0-1), `severity`, `evaluatedAt`.

---

## Configuration

All values live in `lib/comercial/tiendas/store-policy-pack-config.ts`.

**To modify a rule without changing code:**
1. Open `store-policy-pack-config.ts`
2. Change the value (e.g., `threshold: 36` to `threshold: 40`)
3. Re-run the engine

The engine (`store-decision-engine.ts`) reads all thresholds from the config object. No magic numbers in the evaluator.

**Future:** These values will migrate to Prisma (per-tenant configuration).

---

## Files

| File | Purpose |
|------|---------|
| `lib/comercial/tiendas/store-decision-types.ts` | Domain types for all policy results |
| `lib/comercial/tiendas/store-policy-pack-config.ts` | All configurable values (FASE 11) |
| `lib/comercial/tiendas/store-decision-engine.ts` | Pure evaluation functions |
| `lib/comercial/tiendas/store-policy-pack.ts` | Business Policy Engine registration |
| `scripts/_test-castillitos-store-policy-pack-01.ts` | 178 functional tests |
| `scripts/_validate-castillitos-store-policy-pack-01.ts` | 69 structural validations |

---

## What the Store Decision Engine Can Answer

With these 8 policies configured:

- Which stores are below textile coverage?
- Which references must be transferred (Regla 36)?
- Which products qualify for discount?
- Which accessories are outside their coverage?
- Which special products don't meet their ideal state?
- Which store needs replenishment?
- Which references should remain only in Centro and Caldas?
- What is the explanation and evidence for each recommendation?
