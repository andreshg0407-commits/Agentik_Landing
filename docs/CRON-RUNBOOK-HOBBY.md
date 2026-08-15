# AGENTIK-INFRA-VERCEL-CRON-01 — Runbook de crons en Vercel Hobby

**Regla vigente (docs Vercel, actualizadas jun 2026):** Hobby permite hasta 100 crons, pero con **intervalo mínimo de una vez al día** — cualquier expresión más frecuente **falla el deployment** ("Hobby accounts are limited to daily cron jobs"). La precisión es por hora (±59 min). El límite NO es de cantidad: es de frecuencia.

## Qué cambió en vercel.json (solo scheduling — CERO cambios en Route Handlers)

**Eliminados (los tres de la orden — sub-diarios, bloqueaban el deploy):**

| Cron | Schedule que tenía | Frecuencia esperada |
|---|---|---|
| `/api/cron/finance/runtime` | `*/30 * * * *` | cada 30 min |
| `/api/cron/video-render` | `*/2 * * * *` | cada 2 min |
| `/api/cron/reservation-expiry` | `0,30 * * * *` | cada 30 min |

**Ajuste adicional obligado por la MISMA regla (desviación declarada de la orden):** los dos `data-sync` corrían cada 6 h (`0 */6` y `30 */6`) — también son sub-diarios y **también fallan el deploy en Hobby**. Eliminarlos del todo dejaría sin sincronización automática al CRM y al SAG (la fuente de verdad de todo el módulo Tiendas), así que en lugar de retirarlos se **degradaron a diarios** (`0 4 * * *` y `30 4 * * *`, antes del inventory-refresh de las 5:00 y del financial-memory de las 6:00). Lógica intacta; solo schedule. Si prefieres retirarlos también, es quitar dos entries del JSON.

**Quedan en vercel.json (4, todos diarios — Hobby-compliant):** `financial-memory/capture` 6:00 · `data-sync?source=castillitos_crm` 4:00 · `data-sync?source=sag_pya_soap` 4:30 · `inventory-refresh` 5:00 (horas UTC, precisión ±59 min en Hobby).

## Seguridad — verificada en los 6 handlers (sin modificarlos)

Todos exigen secreto y devuelven 401 sin él. Dos mecanismos aceptados:

1. `x-internal-cron-secret: $INTERNAL_CRON_SECRET` (o `?secret=$INTERNAL_CRON_SECRET`)
2. `Authorization: Bearer $CRON_SECRET` (el header que envía Vercel Cron automáticamente — requiere la env var `CRON_SECRET` en el proyecto)

## Invocación externa de los 3 crons retirados (método · headers · frecuencia)

Los Route Handlers siguen desplegados y protegidos; para conservar su cadencia se invocan desde fuera (GitHub Actions scheduled, cron-job.org, o el propio Mac):

| Ruta | Método | Headers | Frecuencia esperada | Curl de referencia |
|---|---|---|---|---|
| `/api/cron/finance/runtime` | **GET** | `x-internal-cron-secret: $INTERNAL_CRON_SECRET` | cada 30 min | `curl -fsS -H "x-internal-cron-secret: $INTERNAL_CRON_SECRET" https://<dominio>/api/cron/finance/runtime` |
| `/api/cron/video-render` | **GET** | ídem | cada 2 min (o bajo demanda al encolar un render) | `curl -fsS -H "x-internal-cron-secret: $INTERNAL_CRON_SECRET" https://<dominio>/api/cron/video-render` |
| `/api/cron/reservation-expiry` | **GET** | ídem | cada 30 min | `curl -fsS -H "x-internal-cron-secret: $INTERNAL_CRON_SECRET" https://<dominio>/api/cron/reservation-expiry` |
| *(referencia)* `/api/cron/data-sync?source=…` | **GET** | ídem | ahora 1×/día por Vercel; invocable extra a demanda | `curl -fsS -H "x-internal-cron-secret: $INTERNAL_CRON_SECRET" "https://<dominio>/api/cron/data-sync?source=sag_pya_soap"` |
| *(referencia)* `/api/internal/financial-memory/capture` | **POST** | ídem | 1×/día por Vercel | — |

## Deploy + smoke (pasos en el Mac / Vercel)

1. Commit del `vercel.json` nuevo: `chore(infra): hobby-compatible cron schedules — remove sub-daily crons, daily data-sync (AGENTIK-INFRA-VERCEL-CRON-01)`.
2. `git push` → deploy de producción. Verificado: `009fa79` y `d33f7e0` **son ancestros de HEAD**, así que el deploy los incluye por construcción (confirmar en Vercel → Deployment → commit `8c7393a` o posterior).
3. Smoke de Tiendas en producción: abrir `/comercial/tiendas` → carga de KPIs + 4 cards; abrir drawer → Cobertura y Necesidades; desactivar/activar una tienda → refresco inmediato.
4. Evidencia a capturar: en Vercel → Logs, la entrada del POST de tiendas (`get_store_snapshot`): **status 200, duración** (con `maxDuration=60` de `d33f7e0` ya no muere a los 10 s) — y captura funcional de la pantalla cargada.
