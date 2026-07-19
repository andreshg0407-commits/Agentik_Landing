# VENDEDORES_CLEANUP_01

**Sprint:** VENDEDORES-CLEANUP-01
**Fecha:** 2026-07-04
**TSC:** 160 (sin cambios)

---

## Cambios realizados

### Fase 1 — Corregir alerta de inteligencia comercial

**Archivo:** `app/(app)/[orgSlug]/comercial/vendedores/vendedores-client.tsx`

```diff
- title: `Sync CRM pausado`,
- detail: `${enAtencion.length} vendedor(es) con presencia comercial pero sin actividad reciente (<90d). Verificar sincronizacion CRM.`,
+ title: "Actividad CRM baja",
+ detail: `No se encontraron cotizaciones recientes en SuiteCRM. Validar si el equipo comercial esta registrando cotizaciones y pedidos en CRM.`,
```

El mensaje ahora refleja realidad operativa (el equipo no genera cotizaciones) en vez de un problema tecnico (sync pausado) que ya fue corregido.

### Fase 2 — Ajustar terminologia

Auditoria completa de lenguaje en:
- `vendedores-client.tsx` — 0 instancias de "sync/connector/stale/pausado"
- `vendedor-360-loader.ts` — 0 instancias tecnicas (usa "No se registran cotizaciones recientes")

No se encontro lenguaje tecnico restante. Los mensajes actuales son operativos:
- "Actividad CRM baja"
- "X dias sin actividad CRM"
- "No se registran cotizaciones recientes"
- "Actividad comercial baja"

### Fase 3 — Documentar discrepancia de clientes

**Entregable:** `VENDEDORES_CLIENT_COUNT_DISCREPANCY.md`

Documenta:
- Card usa `Set(billing_account_id).size` (count de CRM accounts)
- Drawer usa `CustomerProfile.findMany({ crmId: in [...] })` (solo perfiles existentes)
- Impacto: cosmético, no funcional
- Tres opciones de fix futuro documentadas

### Fase 4 — Alerta reutilizable para control comercial

**Archivo creado:** `lib/comercial/alerts/crm-activity-alert.ts`

Exporta:
- `CrmActivityAlert` — tipo de la alerta
- `evaluateCrmActivityAlert(lastActivityAt)` — pure function, no DB, no server-only

Regla:
- >60 dias sin cotizaciones → severity "warning"
- >120 dias → severity "critical"
- null (nunca hubo actividad) → severity "critical"

Consumible por: Vendedores, Control Comercial, Dashboard Ejecutivo, Copilot.

### Fase 5 — Validacion

| Check | Estado |
|---|---|
| No aparece "Sync CRM pausado" | OK |
| Alerta refleja realidad operativa | OK |
| No se modifican metricas | OK |
| No se modifican loaders | OK |
| TSC baseline 160 | OK |
| VENDEDORES_CLIENT_COUNT_DISCREPANCY.md | OK |
| VENDEDORES_CLEANUP_01.md | OK |

---

## Archivos tocados

| Archivo | Tipo cambio |
|---|---|
| `app/(app)/[orgSlug]/comercial/vendedores/vendedores-client.tsx` | Texto de insight (1 linea) |
| `lib/comercial/alerts/crm-activity-alert.ts` | Nuevo (helper reutilizable) |
| `VENDEDORES_CLIENT_COUNT_DISCREPANCY.md` | Nuevo (documentacion) |
| `VENDEDORES_CLEANUP_01.md` | Nuevo (este archivo) |
