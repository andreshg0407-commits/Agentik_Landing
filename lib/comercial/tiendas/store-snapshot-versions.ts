/**
 * lib/comercial/tiendas/store-snapshot-versions.ts
 *
 * AGENTIK-STORES-TRUTH-AUDIT-01 — F2: versiones compartidas del StoreSnapshot
 * (ajustes recomendados 1 y 2 del arquitecto).
 *
 * Constante única compartida por pipeline, servicio, suite y scripts A/B —
 * jamás literales dispersos. Dos ejes independientes de trazabilidad:
 *
 *   - SNAPSHOT_PIPELINE_VERSION: la MECÁNICA del pipeline (etapas, orden,
 *     forma del snapshot). Sube cuando cambia cómo se computa.
 *   - SNAPSHOT_RULES_VERSION: la LEY DE NEGOCIO aplicada (diccionario de
 *     KPIs F0, umbrales D1–D3, semáforo de salud). Sube cuando Yumeko o el
 *     arquitecto cambian una definición, aunque la mecánica quede intacta.
 *
 * Un snapshot declara ambos: dos corridas comparables exigen igualdad de los
 * dos ejes. STORE_SNAPSHOT_SCHEMA_VERSION versiona la FORMA del contrato
 * v1.2 (patrón SNAPSHOT_SCHEMA_VERSION del Sprint 7).
 */

export const STORE_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const SNAPSHOT_PIPELINE_VERSION = 1 as const;
/**
 * v2 — F3A: bloque presentationHints (actionKey por tienda, tonos de KPIs de
 * módulo, proyección certificada de Necesidades) + perStore.inventory
 * (unidades/referencias por tienda para paridad visual de cards).
 */
export const SNAPSHOT_RULES_VERSION = 2 as const;
