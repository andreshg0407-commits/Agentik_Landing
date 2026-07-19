# CUSTOMER-GEOGRAPHY-RECOVERY-01 -- Sprint Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Problem

29,883 customer profiles had their city field overwritten from CRM DANE codes
(e.g. "05001" = Medellin) to SAG internal FK values (e.g. "1") that are not
resolvable without a SAG lookup table we don't have.

Root cause: SAG TERCEROS sync writes `ka_ni_ciudad` (integer FK) as `city`,
overwriting the correct DANE code that CRM already stored.

---

## Results

### Before

| Estado | Clientes | % |
|--------|----------|---|
| Ciudad texto legible | 0 | 0% |
| Ciudad codigo DANE | 3,132 | 9.4% |
| Ciudad FK SAG (inutil) | 29,208 | 87.9% |
| Sin ciudad | 889 | 2.7% |
| **Total** | **33,229** | |

### After

| Estado | Clientes | % |
|--------|----------|---|
| **Ciudad texto legible** | **29,883** | **89.9%** |
| Ciudad codigo numerico (sin CRM) | 2,457 | 7.4% |
| Sin ciudad | 889 | 2.7% |
| **Total** | **33,229** | |

| Metrica | Valor |
|---------|-------|
| Perfiles actualizados | 29,883 |
| Errores | 0 |
| Con departamento nombre | 29,880 |
| Cobertura DANE | 100% (0 codigos sin resolver) |

---

## Acciones Ejecutadas

### 1. Extension del catalogo DANE (dane-municipios.ts)

Agregados 19 codigos faltantes:

- Choco (27): Quibdo, Acandi, Atrato, Condoto, Istmina, Tado
- La Guajira (44): Riohacha, Barrancas, El Molino, Maicao, Manaure, San Juan del Cesar, Uribia
- Bolivar (13): Maria la Baja
- Antioquia (05): San Vicente Ferrer, Sabanalarga, Santa Fe de Antioquia, San Jose del Nus, Sopetran

Agregado `DANE_DEPARTAMENTOS` (33 departamentos) + `resolveDaneDepartment()`.

### 2. Correccion del SAG mapper (sag-pya-soap/mappers.ts)

`ka_ni_ciudad` y `ka_nl_departamento` ya NO se emiten como `city`/`state`.
SAG no tiene capacidad de resolver estos FKs sin tabla CIUDADES.

```typescript
// ANTES:
city:  cityCode,       // "1" (SAG FK) — overwrites DANE
state: stateCode,      // "1" (SAG FK)

// DESPUES:
city:  undefined,      // SAG does NOT write city
state: undefined,      // CRM DANE is authoritative
```

### 3. Correccion del SAG storage (sag-pya-soap/storage.ts)

Campos `city` y `department` removidos del `create` y `update` del upsert SAG.
Solo CRM escribe geografia.

### 4. Backfill desde rawCrmJson

Script `_backfill-customer-geography.ts` ejecutado:
- Lee `billing_address_city` (DANE 5 digitos) del rawCrmJson de cada perfil
- Resuelve a nombre via `resolveDaneCode()`
- Lee `billing_address_state` (DANE 2 digitos)
- Resuelve a departamento via `resolveDaneDepartment()`
- Actualiza `CustomerProfile.city` + `CustomerProfile.department`

---

## Top 15 Ciudades (despues del backfill)

| Ciudad | Clientes |
|--------|----------|
| Medellin | 27,060 |
| Cali | 171 |
| Briceno | 132 |
| Barranquilla | 119 |
| Cartagena de Indias | 119 |
| Cucuta | 87 |
| Girardota | 67 |
| La Estrella | 55 |
| Pereira | 51 |
| San Pedro de los Milagros | 50 |
| Bucaramanga | 49 |
| Armenia | 47 |
| Villavicencio | 45 |
| Manizales | 43 |
| Sincelejo | 41 |

---

## Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `lib/comercial/foundation/dane-municipios.ts` | +19 municipios (Choco, Guajira, Bolivar, Antioquia); `DANE_DEPARTAMENTOS` map + `resolveDaneDepartment()` |
| `lib/connectors/adapters/sag-pya-soap/mappers.ts` | `ka_ni_ciudad`/`ka_nl_departamento` ya no emitidos como city/state — undefined |
| `lib/connectors/adapters/sag-pya-soap/storage.ts` | `city` y `department` removidos del upsert SAG (solo CRM escribe geografia) |
| `scripts/_backfill-customer-geography.ts` | Script de backfill: lee DANE de rawCrmJson, resuelve, actualiza perfiles |

---

## Proteccion Futura

La proxima sincronizacion SAG **no sobreescribira** la geografia porque:
1. El mapper ya no emite city/state
2. El storage ya no escribe city/department en el upsert SAG
3. Solo el adaptador CRM (castillitos-crm/storage.ts) tiene autoridad sobre estos campos

---

## Pendientes (2,457 + 889 clientes)

| Grupo | Clientes | Situacion | Accion recomendada |
|-------|----------|-----------|-------------------|
| Sin rawCrmJson | ~2,967 | Solo tienen datos SAG, sin DANE | Solicitar tabla CIUDADES de SAG para mapear FK → nombre |
| Sin ciudad | 889 | Sin dato en ninguna fuente | Captura manual en proximo contacto comercial |

**Sprint recomendado:** CUSTOMER-GEOGRAPHY-SAG-LOOKUP-01 (tabla CIUDADES de SAG)

---

## Impacto Habilitado

Con 29,883 clientes (89.9%) con ciudad + departamento resueltos:

- Ventas por ciudad / departamento
- Cartera morosa por region
- Cobertura vendedores por zona
- Dashboard ejecutivo geografico
- David (Copilot): "Que ciudad compra mas?" → Medellin
- Segmentacion: ciudad + departamento + vendedor
- Inteligencia de rutas y cobertura
