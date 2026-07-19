# CITY CODE AUDIT

**Sprint:** COMMERCIAL-DATA-FOUNDATION-01 Phase 6
**Generated:** 2026-07-03
**Tenant:** Castillitos

---

## Problem

CustomerProfile.city contains raw numeric codes. The question: are these DANE DIVIPOLA
codes (resolvable to city names) or SAG internal codes (unresolvable)?

---

## Findings

### Two Distinct Code Systems

| System | Field | Format | Example | Resolvable |
|---|---|---|---|---|
| SAG (ERP) | ka_ni_ciudad | Short internal FK | "1", "1111", "1142" | No |
| CRM (SuiteCRM) | billing_address_city | DANE DIVIPOLA 5-digit | "05001", "08001" | Yes |

### SAG City Codes

- Source: `CustomerOrderRecord.rawJson` and `CustomerProfile.rawErpJson`
- Format: Internal FK to a `CIUDADES` table in SAG (not accessible via API)
- Values observed: short numerics (1-4 digits), NOT DANE codes
- **Verdict: UNRESOLVABLE** without SAG CIUDADES master table

### CRM City Codes (DANE DIVIPOLA)

- Source: `CRM.billing_address_city` → stored in `CustomerProfile.rawCrmJson.raw.billing_address_city`
- Format: 5-digit DANE DIVIPOLA municipal codes (2-digit department + 3-digit municipality)
- Coverage: 29,856 of 30,235 CRM-sourced profiles (98.7%)
- **Verdict: RESOLVABLE** via dane-municipios.ts lookup table

### DANE DIVIPOLA Standard

Colombia's official municipal code system maintained by DANE (Departamento Administrativo
Nacional de Estadistica). Structure:

```
DD MMM
│  │
│  └── Municipality code (3 digits, unique within department)
└───── Department code (2 digits)

Examples:
  05001 = Medellin (Antioquia)
  08001 = Barranquilla (Atlantico)
  11001 = Bogota D.C.
  76001 = Cali (Valle del Cauca)
```

---

## Resolution Strategy (Implemented)

### city-resolver.ts (Updated)

```typescript
// 1. Try DANE DIVIPOLA lookup (handles CRM 5-digit codes stored in profile.city)
const daneName = resolveDaneCode(trimmed);
if (daneName) return daneName;

// 2. Suppress remaining pure-numeric values (SAG internal codes)
if (NUMERIC_ONLY.test(trimmed)) return null;

// 3. Pass through if already a city name string
return trimmed;
```

### client-loader.ts (Updated)

```typescript
// Try profile.city first, then fall back to CRM billing_address_city
const resolvedCity = resolveCity(p.city) ?? resolveCrmCity(crmBillingCity);
```

### dane-municipios.ts (Created)

- ~850+ entries covering all 32 departments + Bogota D.C.
- Handles zero-padding: "5001" → "05001" → "Medellin"
- Pure lookup, no external dependencies

---

## Coverage After Fix

| Source | Profiles | City Resolvable | Rate |
|---|---|---|---|
| CRM-sourced (with DANE code) | 30,235 | ~29,856 | 98.7% |
| SAG-sourced (internal FK) | 2,968 | 0 | 0% |
| **Total** | **33,203** | **~29,856** | **89.9%** |

### Before vs After

| Metric | Before (STABILIZATION-01) | After (FOUNDATION-01) |
|---|---|---|
| Cities resolved | 0 (all suppressed) | ~29,856 |
| Resolution source | None | DANE DIVIPOLA lookup |
| SAG codes shown | Suppressed | Still suppressed (correct) |

---

## Remaining Gap

- **SAG-sourced profiles (2,968):** City remains unresolvable until SAG provides
  CIUDADES master table or a name field alongside ka_ni_ciudad.
- **CRM profiles without billing_address_city (379):** ~1.3% of CRM profiles lack
  the field entirely.
