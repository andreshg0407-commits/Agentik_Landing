# COMMERCIAL FOUNDATION REPORT

**Sprint:** COMMERCIAL-DATA-FOUNDATION-01
**Generated:** 2026-07-03
**Tenant:** Castillitos
**TSC Baseline:** 160 (maintained)

---

## Executive Summary

The Commercial Data Foundation establishes the definitive data layer for the Comercial module.
Six service files + one validation script + four audit documents form the foundation for
Vendedores 360, Clientes 360, Control Comercial, and Tiendas.

---

## Phase Completion

| Phase | Deliverable | Status |
|---|---|---|
| 1 | commercial-identity-map.ts + COMMERCIAL_IDENTITY_MAP.md | COMPLETE |
| 2 | seller-directory.ts | COMPLETE |
| 3 | client-seller-linker.ts | COMPLETE |
| 4 | ORDER_TRACEABILITY_AUDIT.md | COMPLETE |
| 5 | seller-metrics.ts | COMPLETE |
| 6 | dane-municipios.ts + city-resolver.ts update + CITY_CODE_AUDIT.md | COMPLETE |
| 7 | control-commercial-trust-matrix.ts | COMPLETE |
| 8 | Observability logs | COMPLETE |
| 9 | validate-commercial-foundation.ts | COMPLETE |
| 10 | COMMERCIAL_FOUNDATION_REPORT.md (this file) | COMPLETE |

---

## Validation Results (Castillitos, July 2026)

### 1. Seller Directory

- **8 real sellers** from CRM data (no hardcodes)
- Sellers: Manuela Tamayo Perez, Nestor Fernando Alzate Jimenez, Luis Orlando Naranjo,
  Fredy Velez, Carlos Agudelo, Juan Valencia, Carlos Villa, Yuliana Ospina Tabares
- Source: CRMQuote.sellerName (285 quotes)

### 2. Client-Seller Linking

- **145 customers** have CRM quote history
- **140 linked** to a primary seller (>= 60% confidence)
  - 139 high confidence (>= 80%)
  - 1 medium confidence (60-79%)
  - 5 unlinked (< 60% confidence — NO guessing)
- 33,058 customers without CRM quotes (no seller assignment possible)

### 3. Order Traceability

- **272/285 CRM quotes (95.4%)** have id_sag_c
- **272/272 (100%)** match to a real SAG CustomerOrderRecord
- CRM stage lifecycle confirmed: Facturado (142), Gestionado_Parcialmente (48),
  No_Gestionado (46), Remisionado (31), Anulado (12), Pendiente (5), Confirmado (1)

### 4. City Resolution (DANE)

- **29,800 profiles (90%)** resolved to city names via DANE DIVIPOLA codes
- 2,514 SAG-sourced profiles remain unresolvable (SAG internal FK, no lookup table)
- 889 profiles have no city data at all
- **Before:** 0% city resolution (all codes suppressed)
- **After:** 90% city resolution

### 5. Trust Matrix

- 20 KPIs tracked across 5 modules
- **7 ALTA** (fully reliable), **7 MEDIA** (usable with caveats), **6 BAJA** (blocked)
- **14 allowed** on dashboard, **6 blocked** until data source is fixed

---

## Foundation Files

All in `lib/comercial/foundation/`:

| File | Purpose | Lines |
|---|---|---|
| commercial-identity-map.ts | Cross-system identity audit | ~180 |
| seller-directory.ts | Dynamic seller directory from CRM | ~153 |
| client-seller-linker.ts | Customer→Seller linking with confidence | ~165 |
| seller-metrics.ts | Seller performance from CRM data | ~177 |
| dane-municipios.ts | DANE DIVIPOLA 5-digit code→city lookup | ~900 |
| control-commercial-trust-matrix.ts | KPI trust classification | ~270 |

Updated files:

| File | Change |
|---|---|
| lib/comercial/clientes/city-resolver.ts | Added DANE resolution + resolveCrmCity() |
| lib/comercial/clientes/client-loader.ts | CRM billing_address_city fallback for city |

---

## Module Readiness Assessment

### Vendedores 360

| Question | Answer |
|---|---|
| Can we show a seller directory? | YES — seller-directory.ts (8 real sellers) |
| Can we show seller metrics? | YES — seller-metrics.ts (quotes, customers, traceability) |
| Can we link sellers to customers? | YES — client-seller-linker.ts (140 linked, 96.5% high confidence) |
| Blockers | CRM sync stopped since Mar 2026. Only 285 quotes available. |

### Clientes 360

| Question | Answer |
|---|---|
| Can we show customer identity? | YES — name, nit, crmId, city (90% resolved) |
| Can we show customer seller? | PARTIAL — only 145/33,203 have CRM quote history |
| Can we show customer orders? | YES — via CRM billing_account_id → crmId (98.6% match) |
| Blockers | sellerName on CustomerProfile is empty (0.05%). Must use quote-based linking. |

### Control Comercial

| Question | Answer |
|---|---|
| Can we show trust levels per KPI? | YES — control-commercial-trust-matrix.ts |
| Can we filter blocked KPIs? | YES — getAllowedKpis() / getBlockedKpis() |
| Are the 14 allowed KPIs reliable? | YES — all ALTA or MEDIA trust level |
| Blockers | 6 KPIs blocked: dailyVelocity, refsConOp, clientesConVendedor, ventasL12, maletas (2) |

### Tiendas

| Question | Answer |
|---|---|
| Is the foundation ready for Tiendas? | YES — identity map, seller directory, city resolver all available |
| Can Tiendas use seller data? | YES — seller-directory.ts and client-seller-linker.ts |
| Blockers | Tiendas needs SAG store-level data (already handled by tiendas/ module) |

---

## Observability

All foundation services emit structured logs:

- `[SELLER] buildSellerDirectory: N sellers (M active) from K CRM quotes`
- `[SELLER] buildSellerMetrics: N sellers, M active, total K quotes`
- `[CLIENT_LINK] buildClientSellerLinks: N customers with quotes, M linked`
- `[COMERCIAL] loadClientesSummary: N clients, M cities resolved (K from DANE lookup)`

---

## Key Decisions

1. **Confidence threshold = 60%** for seller linking. Below that, returns null (no guessing).
2. **DANE codes** are the reliable city source (CRM), not SAG internal codes.
3. **CRM stage is the real lifecycle** — Prisma `status` enum is dead.
4. **id_sag_c is stored as string in CRM, erpMovId as integer in SAG** — must compare with String() coercion.
5. **No new Prisma models** — all services operate over existing tables.
6. **No new screens or navigation** — foundation is service-only.

---

## Next Steps (Post-Foundation)

1. **Reactivate CRM sync** — quotes stopped in March 2026
2. **Wire seller-directory into vendedores UI** — replace empty getVendorRegistry()
3. **Wire client-seller-linker into clientes UI** — show seller assignment
4. **Wire city resolution into clientes UI** — city column now resolvable
5. **Implement daily velocity** — from SaleRecord or CustomerOrderLine
6. **CRM quote lines sync** — AOS_Products_Quotes (see SAG-ORDER-LINES-SYNC-01)
7. **SAG CIUDADES table** — request from SAG team to resolve remaining 2,514 profiles
