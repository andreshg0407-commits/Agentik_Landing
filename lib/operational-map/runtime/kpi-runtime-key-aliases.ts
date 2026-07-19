/**
 * lib/operational-map/runtime/kpi-runtime-key-aliases.ts
 *
 * KPI Runtime Key Aliases — AGENTIK-RUNTIME-KPI-KEY-ALIGNMENT-01
 *
 * Maps alternate/legacy runtime key forms to canonical audit entityKey strings.
 * The canonical keys are the ones used in operational-kpi-registry.ts.
 *
 * Safe to extend: add new aliases without touching the detector or hydrator.
 */

/**
 * Normalize a KPI key to its canonical form for safe map lookups.
 * Canonical form: lowercase, trim, spaces → underscores.
 * Used in: detector, hydrator, sourceMap build, sourceMap lookups.
 */
export function normalizeKpiKey(key: string): string {
  return key.toLowerCase().trim().replace(/\s+/g, "_");
}

/** Maps any non-canonical key → canonical audit entityKey */
export const KPI_RUNTIME_KEY_ALIASES: Record<string, string> = {
  // Ventas shorthand aliases
  ventas_dia_f1:          "ventas_dia_fuente1",
  ventas_f1:              "ventas_dia_fuente1",
  ventas_dia:             "ventas_dia_fuente1",
  ventas_brutas_f1:       "ventas_brutas_fuente1",
  ventas_bruto:           "ventas_brutas_fuente1",

  // Recaudos
  recaudos:               "recaudos_dia",
  cobros_dia:             "recaudos_dia",
  recaudos_tesoreria:     "recaudos_dia_tesoreria",

  // Pedidos
  pedidos:                "pedidos_dia",
  pedidos_crm:            "pedidos_dia_crm",
  pedidos_consolidado:    "pedidos_dia_consolidado",

  // Cartera
  cartera_vencida:        "cartera_vencida_total",
  cartera:                "cartera_cobrar_entradas",

  // Banco
  saldo_banco:            "saldo_cuentas_bancarias",
  disponible_banco:       "disponible_banco_hoy",

  // Cobertura
  cobertura:              "tasa_cobertura",
  dias_cobertura:         "dias_cobertura_promedio",
};

/**
 * Resolves a runtime kpiKey to its canonical audit entityKey.
 *
 * Resolution order:
 *   1. Exact match in auditEntityKeys  → return as-is
 *   2. Alias lookup                    → return canonical
 *   3. No match                        → return null (key is unresolvable)
 */
export function resolveRuntimeKpiKey(
  key: string,
  auditEntityKeys: Set<string>,
): string | null {
  if (auditEntityKeys.has(key)) return key;
  const aliased = KPI_RUNTIME_KEY_ALIASES[key];
  if (aliased && auditEntityKeys.has(aliased)) return aliased;
  return null;
}
