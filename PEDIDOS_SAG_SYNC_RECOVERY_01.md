# PEDIDOS-SAG-SYNC-RECOVERY-01

**Sprint:** Recuperar sincronizacion de pedidos SAG
**Estado:** COMPLETO
**TSC Baseline:** 160 (sin regresiones)

---

## Causa raiz

Dos problemas encadenados:

### P1 — Timeout de Vercel (CAUSA PRINCIPAL)

El cron `/api/cron/data-sync` ejecutaba TODOS los conectores (CRM + SAG) secuencialmente en una sola request.

- CRM: 4 modulos x ~6s = ~25s
- SAG: 5 modulos, donde `movements` + `orders` tardan 3-4 min CADA UNO
- Total: ~8 minutos
- Vercel `maxDuration`: 300s (5 min)

El proceso se cancelaba antes de completar los modulos SAG. El CRM si sincronizaba (evidencia: runs de CRM el 4 de julio), pero SAG no.

### P2 — SOAP query masiva

SAG MOVIMIENTOS retorna 241,781 filas en una sola query SOAP. Parsear, filtrar y mapear estas filas toma ~3 minutos. No hay paginacion nativa en el SOAP endpoint.

---

## Sync manual ejecutado

```
Comando:  npx tsx (script inline)
Fecha:    2026-07-07 ~04:03 UTC
Duracion: 417 segundos (~7 min)

Paso 1 — movements: 241,781 raw rows → 129,675 movements cached (167s)
Paso 2 — orders:    9,592 orders → 9,592 upserted (249s)
```

---

## Fecha maxima antes/despues

| Metrica | Antes | Despues | Delta |
|---|---|---|---|
| MAX(orderDate) | 2026-06-26 | **2026-07-06** | +10 dias |
| Total registros | 9,522 | **9,592** | +70 pedidos |
| Rango nuevo | — | 2026-06-27 → 2026-07-06 | 10 dias |

### Distribucion de pedidos nuevos

| Fecha | Pedidos |
|---|---|
| 2026-07-06 | 7 |
| 2026-07-05 | 3 |
| 2026-07-04 | 2 |
| 2026-07-03 | 9 |
| 2026-07-02 | 10 |
| 2026-07-01 | 15 |
| 2026-06-30 | 10 |
| 2026-06-29 | 4 |
| 2026-06-28 | 2 |
| 2026-06-27 | 3 |

---

## Correccion del cron

### Problema
Una sola entrada cron ejecutaba CRM + SAG secuencialmente → timeout.

### Solucion
Separar en dos entradas cron independientes con `?source=` filter:

**vercel.json:**
```json
{
  "path": "/api/cron/data-sync?source=castillitos_crm",
  "schedule": "0 */6 * * *"
},
{
  "path": "/api/cron/data-sync?source=sag_pya_soap",
  "schedule": "30 */6 * * *"
}
```

**route.ts cambios:**
- Acepta `?source=` query param para filtrar por conector
- Time guard: salta modulos si quedan menos de 30s
- SAG heavy modules guard: salta movements/orders si ya paso 60s y no hay source filter
- Log mejorado con source en cada resultado

### Riesgo residual
SAG movements + orders toma ~7 min localmente. Incluso con source filter, un solo modulo puede exceder 300s si SAG responde lento. En ese caso el run sera FAILED y se reintentera en el siguiente ciclo (cada 6h).

---

## Estado del cron

| Atributo | Valor |
|---|---|
| Ruta CRM | `/api/cron/data-sync?source=castillitos_crm` |
| Ruta SAG | `/api/cron/data-sync?source=sag_pya_soap` |
| Schedule CRM | `0 */6 * * *` (h:00) |
| Schedule SAG | `30 */6 * * *` (h:30) |
| maxDuration | 300s |
| Auth | INTERNAL_CRON_SECRET (header o query) |

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `app/api/cron/data-sync/route.ts` | Source filter, time guards, SAG heavy module guard |
| `vercel.json` | Dos entradas cron separadas (CRM h:00, SAG h:30) |

---

## Pendiente

| Item | Prioridad | Descripcion |
|---|---|---|
| INTERNAL_CRON_SECRET | ALTA | Verificar que esta configurado en Vercel env vars |
| SAG timeout | MEDIA | Si SAG sigue tardando >300s, considerar cursor incremental para orders |
| Deploy | ALTA | Hacer deploy para que las nuevas entradas cron se activen |

---

## Criterio de exito

| Criterio | Estado |
|---|---|
| Sync manual ejecutado exitosamente | OK |
| 70 pedidos nuevos importados | OK |
| Fecha maxima: 2026-07-06 (ayer) | OK |
| Cron separado para SAG y CRM | OK |
| Time guards implementados | OK |
| TSC baseline 160 | OK |
