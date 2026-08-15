# Jupiter — Tenant Isolation Rules

**Fecha:** 2026-08-14
**Estado:** DOCUMENTADO — regla permanente

---

## Jupiter tiene dos contextos distintos

### A. Jupiter como cliente de Castillitos

- Jupiter es un **cliente real** de Castillitos
- Aparece como `CustomerProfile` dentro del tenant Castillitos
- CLIENTE_ID en SAG (vw_agentik_cartera) corresponde a Jupiter como comprador
- Castillitos es el importador oficial de Jupiter
- Las operaciones que pertenecen a Castillitos permanecen en el tenant Castillitos

### B. Jupiter Pets como empresa/tenant independiente

- Jupiter Pets tendra su propio tenant/universo en Agentik
- Tendra su propia conexion SAG: `INDDIANAA_JUPITER_PETS`
- Su alcance inicial es **exclusivamente Importaciones**
- **No tiene modulo de Produccion**
- Sus datos, credenciales y operaciones no se mezclan con Castillitos

---

## Regla fundamental

> Relacion comercial != identidad de tenant

- Que Jupiter sea **cliente** de Castillitos NO significa que los datos del
  tenant Jupiter puedan utilizarse para alimentar o certificar el tenant Castillitos.

- Que Castillitos sea importador oficial de Jupiter NO significa que debamos
  duplicar las operaciones de Castillitos dentro del tenant Jupiter.

---

## Aislamiento requerido

| Dimension | Regla |
|---|---|
| organization_id | Consultas siempre filtradas por tenant |
| SAG credentials | Token de produccion de Jupiter separado (Vault) |
| Cache (import_intelligence_cache) | Keyed por organization_id — aislado |
| Cartera (vw_agentik_cartera) | Cada tenant consulta su propia conexion SAG |
| Metricas/KPIs | Nunca mezclar universos para obtener PASS |
| Modulos habilitados | Jupiter: solo Importaciones. No asumir mismos modulos que Castillitos |

---

## Distinguir siempre

| Concepto | Ejemplo |
|---|---|
| Jupiter como CustomerProfile | `CustomerProfile.name = "JUPITER GRUPO EMPRESARIAL SAS"` dentro de org castillitos |
| Jupiter como Organization | `Organization.slug = "jupiter"` — tenant independiente con sus propios datos |

---

## Mapa de bases de datos SAG

| Tenant | Variable | Base de datos | Proposito |
|---|---|---|---|
| Castillitos | `PYA_SAG_BD_CURRENT` | `INDDIANAA_INDU-LUDISAM` | Produccion actual (desde 2026-07-21) |
| Castillitos | `PYA_SAG_BD_HISTORICAL` | `INDDIANAA_CASTILLO-ALZATE` | Historico (hasta 2026-07-20) |
| Jupiter Pets | (pendiente) | `INDDIANAA_JUPITER_PETS` | Produccion independiente |

> **IMPORTANTE:** LUDISAM es la base de produccion actual de **Castillitos**, NO de Jupiter.
> No describir LUDISAM como fuente de Jupiter bajo ninguna circunstancia.

## Token de produccion de Jupiter Pets

- Ya disponible
- Cuando se configure la conexion, usar mecanismo seguro de credenciales/secretos
- **No hardcodear** ni dejar en el repositorio
- Usar Vault (`lib/security/vault/`) para almacenamiento seguro
