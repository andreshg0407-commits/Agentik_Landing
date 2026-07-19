# TIENDAS-POLICY-FOUNDATION-01 — Sprint Report

## Objetivo
Disenar y construir la fundacion de reglas configurables para el modulo Tiendas.
Motor de politicas puro (sin DB), servicio de persistencia, API, UI minima, validacion completa.

## Conceptual Model

Tiendas != Maletas:

| Maletas | Tiendas |
|---|---|
| Cobertura por vendedor | Surtido por punto fisico |
| Reglas por subgrupo | Reglas por tienda + ref/talla/color |
| Sugiere produccion | Reposicion desde bodega principal |
| Optimiza oportunidad | Optimiza exhibicion y disponibilidad |
| Por referencia | Por variante (ref + talla + color) |

## New Files

### FASE 2 — Types
- `lib/comercial/tiendas/store-policy-types.ts`
  - `StoreProductClass`: textile | bulky | accessory | other
  - `StorePolicyScope`: variant | reference | subgroup | category | store
  - `StoreReplenishmentThreshold`, `StoreCapacityProfile`
  - `StorePolicyRule`, `StorePolicy`
  - `ReplenishmentStatus`: ok | low | out | overstock | blocked
  - `StoreReplenishmentNeed`, `StoreReplenishmentDecision`
  - Input types: `PolicyResolutionInput`, `ReplenishmentNeedInput`, `ReplenishmentDecisionInput`

### FASE 3+4+5+6 — Policy Engine
- `lib/comercial/tiendas/store-policy-engine.ts`
  - `getDefaultThresholds(productClass)` — safe defaults per class
  - `resolveStorePolicyForVariant(input, rules)` — resolution chain: variant > reference > subgroup > category > store > default
  - `calculateStoreReplenishmentNeed(input, rules)` — returns status + neededQty
  - `calculateReplenishmentDecision(input)` — transfer/replacement/production logic
  - Pure functions, no DB, no side effects

### FASE 4 — Default Rules
| Product Class | Min | Ideal | Max |
|---|---|---|---|
| Textile | 1 | 1 | 2 |
| Bulky | 1 | 1 | 1 |
| Accessory | 1 | 2 | 4 |
| Other | 1 | 1 | 2 |

### FASE 7 — Policy Service
- `lib/comercial/tiendas/store-policy-service.ts`
  - `listStorePolicies()`, `getStorePolicyByStoreId()`, `getStoreRules()`
  - `saveStorePolicy()`, `toggleStorePolicyActive()`
  - `addRuleToStore()`, `removeRuleFromStore()`
  - Persists in AgentExecution with operation `COMERCIAL_STORE_POLICY_RULES`

### FASE 8 — API Route
- `app/api/orgs/[orgSlug]/comercial/tiendas/policies/route.ts`
  - Actions: list, get_for_store, save, add_rule, remove_rule, toggle_active

### FASE 10 — Validation Script
- `scripts/validate-store-policy-engine.ts`
  - 26 checks, 26 PASS / 0 FAIL
  - Validates: default thresholds, resolution priority (variant > ref > subgroup > category > store), inactive rule skipping, replenishment status (out/low/ok/overstock), neededQty calculation, transfer decisions (full/partial/empty), production signal, replacement flag, default fallback

## Modified Files

### FASE 9 — UI
- `app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx`
  - Added "Politica" tab to store detail drawer
  - `PolicyTab`: loads policy rules via API, displays rules with scope/class/thresholds
  - `AddPolicyRuleForm`: scope-aware form (shows ref/talla/color for variant, subgroup for subgroup scope, etc.)
  - Shows defaults when no rules configured

## Not Modified
- No Prisma schema changes
- No engine changes (store-replenishment-engine.ts)
- No SAG adapter changes
- No Maletas changes
- No Control Comercial changes
- No WhatsApp changes
- No pedidos changes

## Validation Results

```
26 PASS / 0 FAIL

--- 1. Default Thresholds ---
  PASS  Textile defaults — min=1 ideal=1 max=2
  PASS  Bulky defaults — min=1 ideal=1 max=1
  PASS  Accessory defaults — min=1 ideal=2 max=4

--- 2. Policy Resolution Priority ---
  PASS  Variant match wins (most specific)
  PASS  Reference match wins when no variant
  PASS  Subgroup match wins when no ref
  PASS  Category match for accessory
  PASS  Store-wide fallback
  PASS  No match for different store
  PASS  Inactive rule skipped

--- 3. Replenishment Need Calculation ---
  PASS  Status=out when qty=0 (needed=3)
  PASS  NeededQty = idealQty when out
  PASS  Resolved by variant rule
  PASS  Status=low when qty < min
  PASS  NeededQty replenishes to ideal
  PASS  Status=ok when within range
  PASS  NeededQty=0 when ok
  PASS  Status=overstock when qty > max
  PASS  NeededQty=0 when overstock
  PASS  Falls back to default thresholds

--- 4. Replenishment Decision ---
  PASS  Full transfer when main has stock
  PASS  Partial transfer when main has less
  PASS  No transfer when main empty
  PASS  No action when status=ok
  PASS  Production signal when allowed by rule
  PASS  Replacement flag when allowed by rule
```

## TSC Baseline
160 errors (unchanged)

## Architecture Decisions

1. **Pure engine, no DB** — `store-policy-engine.ts` is pure functions. Rules are passed in, not fetched. This makes the engine testable without database and reusable across contexts.

2. **AgentExecution persistence** — Same pattern as warehouse configs. One row per store policy, rules stored as JSON array in `metadataJson`. No schema changes needed.

3. **Resolution priority is deterministic** — variant > reference > subgroup > category > store > default. Most specific always wins. No ambiguity.

4. **Defaults are conservative** — Textile 1/1/2 means: alert at 0, replenish to 1, never exceed 2. This prevents over-stocking franchise stores with limited space.

5. **Transfer before production** — Default behavior flags: `allowMainWarehouseTransfer: true`, `allowProductionSignal: false`, `allowReplacement: false`. Production signals must be explicitly enabled per rule.
