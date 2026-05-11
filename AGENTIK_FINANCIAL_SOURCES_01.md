# AGENTIK-FINANCIAL-SOURCES-01
## Financial Sources Mapping Foundation

**Sprint closed:** 2026-05-10
**Files created:** 2 (`lib/financial/bank-account-registry.ts`, `AGENTIK_FINANCIAL_SOURCES_01.md`)
**Files modified:** 1 (`lib/connectors/adapters/sag-pya-soap/query-catalog.ts`)
**TypeScript errors before:** 162 | **after:** 162 — no regressions

---

## Objective

Build the foundational financial sources mapping layer: connect the 10 real bank accounts and payment platforms (provided by gerencia) to their SAG PUC accounting codes. Foundation only — no reconciliation logic, no Prisma writes, no SAG writes.

---

## Sources Registered (10 total)

Provided by gerencia 2026-05-10:

| BANCO / FUENTE               | CUENTA SAG | TYPE                  | SAG Link | Status              |
|------------------------------|------------|-----------------------|----------|---------------------|
| BANCOLOMBIA AHORRO 0313      | 11200501   | BANK_ACCOUNT_SAVINGS  | H1 ✓     | pending_validation  |
| BANCOLOMBIA CORRIENTE 0711   | 11100501   | BANK_ACCOUNT_CHECKING | B1 ✓     | pending_validation  |
| BANCO OCCIDENTE              | 11100503   | BANK_ACCOUNT_CHECKING | —        | pending_validation  |
| BANCO CAJA SOCIAL            | 11100504   | BANK_ACCOUNT_CHECKING | —        | pending_validation  |
| BANCO DE BOGOTA              | 11100502   | BANK_ACCOUNT_CHECKING | B2 ✓     | pending_validation  |
| TARJETA CREDITO BOGOTA       | 211535     | CREDIT_CARD           | —        | pending_validation  |
| TARJETA CREDITO OCCIDENTE    | 21102503   | CREDIT_CARD           | —        | pending_validation  |
| PLATAFORMA PAYCO             | 13803      | PAYMENT_PLATFORM      | —        | pending_validation  |
| PLATAFORMA MERCADOPAGO       | 130526     | PAYMENT_PLATFORM      | —        | pending_validation  |
| PLATAFORMA ENVIOCLICK        | 130528     | PAYMENT_PLATFORM      | —        | pending_validation  |

---

## Architecture: Two Orthogonal Layers

This sprint clarified and formalized the two distinct financial mapping layers in the codebase:

```
lib/marketing-studio/source-registry.ts   — SAG DOCUMENT CODES (FE, R1, B1, CP...)
                                             Transaction layer: what kind of SAG event
                                             Already existed; not modified.

lib/financial/bank-account-registry.ts    — FINANCIAL ACCOUNTS (banks, platforms)
  (NEW)                                    Account layer: where money lives in PUC
```

Both are required for full bank reconciliation:
```
SAG document (R1, B1...) ──→ source-registry      ──→ what happened (event type)
SAG PUC code (11200501...)──→ bank-account-registry──→ where it lives (account)
```

---

## Cross-References with Existing source-registry.ts

Three accounts already had partial linkage via PENDING_DEPOSIT source codes:

| Bank Account          | PUC      | source-registry code | Alignment      |
|-----------------------|----------|----------------------|----------------|
| Bancolombia Ahorro 0313 | 11200501 | H1                 | ✓ name matches |
| Bancolombia Corriente 0711 | 11100501 | B1              | ✓ name matches |
| Banco de Bogotá 9945  | 11100502 | B2                   | ✓ name matches |

**Gap identified:** H2 in source-registry = "Bancolombia Ahorros 6827" — account 6827 is NOT in gerencia's 10-account list. Flagged as `requires_review` gap. Confirm with gerencia whether account 6827 is active.

---

## PUC Range Analysis

The 10 accounts span three PUC ranges with different reconciliation patterns:

| PUC Range | Type                    | Accounts                             | Reconciliation Pattern     |
|-----------|-------------------------|--------------------------------------|----------------------------|
| 11xxxx    | Bank accounts (assets)  | Bancolombia ×2, Occidente, Caja Social, Bogotá | Inbound cobros; match to v_pagosnew |
| 13xxxx    | Debtors/platforms       | PayCo (13803), MercadoPago (130526), EnvíoClick (130528) | Platform settlement; match API to bank transfer |
| 21xxxx    | Liabilities (CC)        | TC Bogotá (211535), TC Occidente (21102503) | Outflow/expense matching; not inbound cobros |

---

## What Was Created

### 1. `lib/financial/bank-account-registry.ts` (NEW)

Full type system + static registry for all 10 sources.

**Types exported:**
- `FinancialSourceType` — what kind of instrument (5 variants)
- `FinancialSourceStatus` — integration lifecycle state (6 variants)
- `ReconciliationReadiness` — declarative metadata for future reconciliation engine
- `BankAccountSource` — full source record (14 fields)
- `SagValidationSummary` — audit report shape

**Constants:**
- `BANK_ACCOUNT_SOURCES` — the authoritative 10-source registry (Readonly Record)

**Helper functions:**
- `getSourcesByTenant(tenantId)` — multi-tenant filter
- `getSourceBySagCode(sagAccountCode)` — lookup by PUC code
- `getSourceByPendingDepositCode(sagCode)` — lookup by source-registry code (H1, B1, B2)
- `getBankAccounts()` — filter: savings + checking only
- `getPaymentPlatforms()` — filter: platforms only
- `getCreditCards()` — filter: credit cards only
- `getLinkedSources()` — filter: have relatedSagSourceCode
- `getAllSagAccountCodes()` — all PUC codes as string[] (for batch validation)
- `getCopilotHint(sourceId, vars)` — fill Copilot hint template with runtime values
- `getSagValidationSummary()` — audit report

**Type guards:**
- `isBankAccount(source)`
- `isPaymentPlatform(source)`
- `hasLinkedPendingDeposit(source)`
- `isReconciliationReady(source)`

### 2. `lib/connectors/adapters/sag-pya-soap/query-catalog.ts` (MODIFIED)

Added new `ACCOUNTS` domain with 2 read-only validation queries:

| Key | Purpose | Status |
|-----|---------|--------|
| `accounts.byCode` | Confirm a single PUC code exists in SAG chart of accounts | placeholder |
| `accounts.allActive` | Pull all active PUC accounts for initial bulk validation | placeholder |

Both queries are:
- SAFE READ-ONLY — no mutations
- status: "placeholder" — table name (CUENTAS vs PLAN_CUENTAS) not yet confirmed with DBA
- Never called automatically — only via explicit admin/validation scripts

`QUERY_CATALOG` export updated to include `accounts` domain.

---

## What Was NOT Touched

- `lib/marketing-studio/source-registry.ts` — zero modifications
- `prisma/schema.prisma` — zero modifications
- Any existing query in `query-catalog.ts` — zero modifications
- Any reconciliation logic, SAG writes, or Prisma writes
- Any existing KPI calculations, data fetching, or APIs
- Any routing, shell, or UI components

---

## Reconciliation Readiness: Current State

All 10 sources are `pending_validation`. Future lifecycle:

```
pending_validation
  → (confirm PUC in SAG CUENTAS) → integration_pending
  → (configure bank feed / platform API) → ready_for_reconciliation
  → (auto-recon engine live) → connected
```

ReconciliationReadiness metadata per source is declarative only — no engine exists yet. This is the foundation layer.

---

## Pending Items (Next Sprint)

| Item | Priority | Note |
|------|----------|------|
| Run `accounts.allActive` against live SAG | HIGH | Confirm CUENTAS table name; validate all 10 PUC codes |
| Update source statuses post-SAG confirmation | HIGH | pending_validation → integration_pending (or missing_in_sag) |
| Investigate H2 (Bancolombia 6827) gap | MEDIUM | Not in gerencia's 10-account list — confirm with treasury |
| Confirm Occidente + Caja Social account suffixes | MEDIUM | Suffix not provided; need for statement matching |
| Confirm credit card suffixes (TC Bogotá, TC Occidente) | LOW | Need for expense reconciliation |
| Map PayCo / MercadoPago / EnvíoClick to SAG source codes | MEDIUM | Check if CP or new source codes cover these platforms |
| Connect platform APIs (MercadoPago v1, PayCo, EnvíoClick) | LOW | Future sprint — integration layer |

---

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | 10 fuentes mapeadas con PUC SAG de gerencia | ✅ Todos en BANK_ACCOUNT_SOURCES |
| 2 | Tipos TypeScript para el sistema de fuentes | ✅ FinancialSourceType, FinancialSourceStatus, ReconciliationReadiness, BankAccountSource |
| 3 | Cross-reference con source-registry.ts (H1, B1, B2) | ✅ relatedSagSourceCode documentado y validado |
| 4 | Sistema de estado de integración | ✅ FinancialSourceStatus con 6 variantes del ciclo de vida |
| 5 | Metadata de reconciliación como fundación | ✅ ReconciliationReadiness — declarativo, sin lógica activa |
| 6 | Copilot hints en cada fuente | ✅ Templates con {count}, {amount}, {sagAccountCode} |
| 7 | Consulta SAG de validación PUC (solo lectura segura) | ✅ accounts.byCode + accounts.allActive en query-catalog.ts (status: placeholder) |
| 8 | Helpers de búsqueda y filtrado | ✅ 10 funciones helper exportadas |
| 9 | Diseño multi-tenant | ✅ tenantId en todas las fuentes; getSourcesByTenant() |
| 10 | Cero Prisma writes / SAG writes / lógica de reconciliación | ✅ Solo configuración estática |
| 11 | No se rompió nada existente | ✅ TypeScript 162 → 162 |
| 12 | Auditoría de arquitectura previa (source-registry, fpa-queries, cobros-breakdown, payment-service, Prisma, SAG catalog) | ✅ Completada antes de escribir código |

---

## Risks Flagged

- **H2 account gap**: source-registry.ts H2 = "Bancolombia Ahorros 6827" is not in gerencia's 10-account list. This could mean the account is inactive, was replaced by 0313, or was omitted. Must confirm before building reconciliation logic.
- **PUC table name unknown**: `accounts.byCode` uses `CUENTAS` as placeholder. SAG PYA may use `PLAN_CUENTAS` or `PLAN_DE_CUENTAS`. Test with one code before batch run.
- **Credit cards are liability accounts**: TC Bogotá (211535) and TC Occidente (21102503) are PUC 21xxxx (obligaciones). They do NOT appear in inbound cobros — they represent expense obligations. Reconciliation for these requires a different flow (expense matching, not cobros matching).
- **Platform settlement lag**: PayCo, MercadoPago, EnvíoClick settle funds with T+1 to T+5 delay. PUC 13xxxx reflects the receivable (funds owed by platform), not the bank deposit. Full reconciliation requires platform API to detect when settlement actually hits the bank.
