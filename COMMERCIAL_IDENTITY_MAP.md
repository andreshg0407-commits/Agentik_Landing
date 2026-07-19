# COMMERCIAL IDENTITY MAP

**Sprint:** COMMERCIAL-DATA-FOUNDATION-01 Phase 1
**Generated:** 2026-07-03
**Tenant:** Castillitos

---

## Purpose

This document maps every commercial entity across three source systems (SAG, CRM, Agentik)
and documents the identity keys, matching rates, and gaps.

---

## 1. Customer Identity Chain

```
CRM (SuiteCRM V8)                    Agentik (Prisma)                    SAG (ERP)
───────────────                       ──────────────                      ────────
billing_account_id  ──────────────>  CustomerProfile.crmId
                                     CustomerProfile.nit  ─────────────> ka_nl_tercero
                                     CustomerProfile.erpId ────────────> ka_nl_tercero
```

### Matching Rates (Castillitos, July 2026)

| Metric | Value | Rate |
|---|---|---|
| Total CustomerProfiles | 33,203 | — |
| With crmId (CRM-sourced) | 30,235 | 91.1% |
| With nit | 28,832 | 86.8% |
| With erpId (SAG-sourced) | 2,968 | 8.9% |
| CRM billing_account_id → crmId match | 281/285 quotes | 98.6% |
| NIT → SAG ka_nl_tercero match | 144/1,592 unique SAG NITs | 9.0% |

### Key Findings

- **CRM→Profile linking is excellent** (98.6% via billing_account_id → crmId)
- **NIT matching is weak** — only 9% of SAG order NITs match a CustomerProfile.
  Most SAG orders are for customers NOT in the profile table (SAG has 6+ years of history,
  CRM sync only covers recent customers).
- **sellerName** on CustomerProfile is nearly empty (18/33,203 = 0.05%). The actual seller
  association must come from CRM quote history (see Phase 3: client-seller-linker.ts).

---

## 2. Order Identity Chain

```
CRM (SuiteCRM V8)                    SAG (ERP)
───────────────                       ────────
CRMQuote.rawCrmJson.raw.id_sag_c  ──> CustomerOrderRecord.erpMovId
CRMQuote.sellerName                   (rawJson is empty — no seller in SAG orders)
CRMQuote.rawCrmJson.raw.stage         CustomerOrderRecord.status
```

### Matching Rates

| Metric | Value | Rate |
|---|---|---|
| Total CRM Quotes | 285 | — |
| With id_sag_c | 272 | 95.4% |
| id_sag_c matches SAG order | 272/272 | 100% |
| Total SAG Orders | 9,522 | — |

### Key Findings

- **CRM→SAG traceability is confirmed** — 95.4% of CRM quotes have an SAG order ID,
  and ALL of those match a real SAG order.
- **SAG→CRM reverse lookup** is limited — only 272 of 9,522 SAG orders (2.9%) have a
  corresponding CRM quote. CRM sync only covers Jan-Mar 2026.
- **CRM stage is the real lifecycle** — the Prisma `status` enum (all DRAFT) is dead.
  Real stages: Facturado (142), Gestionado_Parcialmente (48), No_Gestionado (46),
  Remisionado (31), Anulado (12), Pendiente (5), Confirmado (1).

---

## 3. Seller Identity

| Metric | Value |
|---|---|
| Distinct sellers in CRM quotes | 8 |
| CustomerProfile.sellerName populated | 18 of 33,203 (0.05%) |
| sellerSlug = "vendedor-generico" | 18 |

### Sellers from CRM (real)

Derived from CRMQuote.sellerName — see `seller-directory.ts` for the dynamic directory.

### Gap

CustomerProfile.sellerName is essentially empty. The client-seller-linker.ts service
computes the primary seller for each customer from CRM quote history, with confidence scoring.

---

## 4. City/Location Identity

| Metric | Value |
|---|---|
| CustomerProfile.city (SAG internal FK) | Numeric codes, no lookup available |
| CRM billing_address_city (DANE DIVIPOLA) | 29,856 of 30,235 CRM profiles (98.7%) |
| DANE lookup table entries | ~850+ municipalities |

### Resolution Strategy

1. Try profile.city through DANE lookup (handles CRM-sourced profiles with DANE codes)
2. Fall back to CRM rawCrmJson.raw.billing_address_city through DANE lookup
3. Suppress remaining pure-numeric values (SAG internal codes)

Implemented in: `city-resolver.ts` + `dane-municipios.ts`

---

## 5. Foundation Service Files

| File | Phase | Purpose |
|---|---|---|
| `commercial-identity-map.ts` | 1 | Cross-system identity audit service |
| `seller-directory.ts` | 2 | Dynamic seller directory from CRM |
| `client-seller-linker.ts` | 3 | Customer→Seller linking with confidence |
| `seller-metrics.ts` | 5 | Seller performance metrics |
| `dane-municipios.ts` | 6 | DANE DIVIPOLA code→city lookup |
| `control-commercial-trust-matrix.ts` | 7 | KPI trust classification |

All files in: `lib/comercial/foundation/`
