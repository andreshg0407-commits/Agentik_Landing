# PRODUCTION-MODULE-VISIBILITY-FIX-01

**Sprint:** PRODUCTION-MODULE-VISIBILITY-FIX-01
**Date:** 2026-06-30
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Causa Raiz

Produccion no aparecia visible en la navegacion de Castillitos porque:

1. `"production"` es un ModuleKey **opt-in** en `lib/tenant/modules.ts` (linea 170).
2. Modulos opt-in requieren una fila explicita `TenantModule(enabled: true)` para aparecer.
3. El seed de Castillitos (`prisma/seed.ts`) no creaba filas TenantModule.
4. El bundle `"operations"` en `lib/bootstrap/module-bundles.ts` no incluia `"production"`.
5. Por lo tanto `getEnabledModules()` retornaba un Set sin `"production"`.
6. `layout.tsx` pasaba `hasProduction: false` a `buildNavDomains()`.
7. El dominio Produccion nunca se renderizaba en la navegacion.

**Cadena completa:**

```
seed.ts → no TenantModule rows
  → getEnabledModules() → "production" NOT in Set (opt-in, no row = disabled)
    → filterModulesByRole() → mods without "production"
      → layout.tsx → hasProduction: mods.has("production") → false
        → buildNavDomains() → if (opts.hasProduction) → skipped
          → Produccion invisible
```

---

## Fix Aplicado

### 1. Seed — Habilitar modulos opt-in para Castillitos

**Archivo:** `prisma/seed.ts`

Agregado bloque que crea filas `TenantModule(enabled: true)` para:
- `"production"` — modulo de Produccion
- `"inventory"` — modulo de Inventario
- `"marketing_studio"` — Marketing Studio
- `"copilot"` — IA Copilot

Usa upsert — idempotente.

### 2. Bundle operations — Incluir production e inventory

**Archivo:** `lib/bootstrap/module-bundles.ts`

El bundle `"operations"` ahora incluye `"production"` e `"inventory"`.
Esto asegura que futuros tenants con template `manufacturing-lite` obtengan Produccion automaticamente.

### 3. Script de activacion standalone

**Archivo:** `scripts/enable-production-module.ts`

Script idempotente para habilitar production+inventory en Castillitos sin re-seed:
```bash
npx tsx scripts/enable-production-module.ts
```

---

## Como se Habilita un Modulo en Agentik

### Flujo completo

1. `ModuleKey` se define en `lib/tenant/modules.ts` (MODULE_KEYS array)
2. Modulo se marca como opt-in en `OPT_IN_MODULES` set (o queda open-by-default)
3. Para modulos opt-in: se crea fila `TenantModule(organizationId, moduleKey, enabled: true)` via:
   - `setModuleEnabled()` — funcion programatica
   - `seedTenantModules()` — durante bootstrap de tenant
   - `prisma.tenantModule.upsert()` — directo en seed/scripts
4. `getEnabledModules(orgId)` lee filas y construye Set<ModuleKey>
5. `filterModulesByRole()` intersecta con permisos del rol
6. `layout.tsx` pasa flags booleanos a `buildNavDomains()`
7. `module-nav-config.ts` condiciona renderizado del dominio

### Para agregar un nuevo modulo opt-in

1. Agregar key a MODULE_KEYS en `lib/tenant/modules.ts`
2. Agregar a OPT_IN_MODULES si es opt-in
3. Agregar a ROLE_MODULES para los roles que deben verlo
4. Agregar a module-bundles.ts en el bundle relevante
5. Agregar flag `hasX` a NavBuildOptions + layout.tsx
6. Agregar dominio o items en module-nav-config.ts
7. Agregar icono + accent en workspace-shell-client.tsx
8. Crear ruta en app/(app)/[orgSlug]/
9. Activar para tenants existentes via script o seed

---

## Validacion

- TSC: 160 (baseline maintained)
- Produccion aparece como dominio top-level (no sub-item de Comercial)
- Comercial pathKeys no contiene "produccion"
- Comercial items intactos: Maletas, Tiendas, Pedidos, Vendedores, Inventario
- Bundle "operations" incluye "production" + "inventory"
- Seed crea TenantModule rows para Castillitos
- Script standalone disponible para activacion sin re-seed

---

## Riesgos Restantes

| Riesgo | Mitigacion |
|---|---|
| Tenants existentes sin row TenantModule | Script standalone disponible |
| Produccion visible solo para SUPER_ADMIN/ORG_ADMIN con "production" | Correcto — es opt-in by design |
| Seed solo corre en dev/staging | Script standalone para prod |
