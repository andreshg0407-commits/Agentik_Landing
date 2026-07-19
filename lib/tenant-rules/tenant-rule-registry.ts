/**
 * tenant-rule-registry.ts
 *
 * TENANT-BUSINESS-RULES-CONFIG-01 — Phase 4: Initial Rule Sets.
 *
 * Registers tenant business rules. Code-level registry with
 * future DB override support.
 *
 * IMPORTANT: Engines NEVER import rules directly from here.
 * They consume them via the resolver (tenant-rule-resolver.ts).
 *
 * No React. No Prisma. No server-only. Pure domain logic.
 */

import type {
  TenantBusinessRule,
  TenantRuleSet,
} from "./tenant-rule-types";

// ── Phase 4: Castillitos Initial Rule Set ───────────────────────────────────

/**
 * Castillitos CEO-validated inventory threshold rules.
 * Source: Gerencia Castillitos, validated in operational meetings.
 */
const CASTILLITOS_RULES: TenantBusinessRule[] = [
  // Rule 1: LATIN KIDS — Bodega 01 <= 30
  {
    ruleId: "castillitos_inv_latin_kids_30",
    orgSlug: "castillitos",
    name: "Inventario LATIN KIDS <= 30",
    description: "Cuando el inventario de Bodega 01 para referencias de LATIN KIDS cae a 30 o menos, generar alerta operativa, revisar produccion, revisar maletas, sugerir reemplazo.",
    category: "INVENTORY",
    scope: {
      type: "SUB_LINEA",
      target: "LATIN KIDS",
      secondaryTarget: "01",
    },
    condition: {
      type: "INVENTORY_THRESHOLD",
      field: "existenciaBodega01",
      operator: "lte",
      threshold: 30,
      unit: "unidades",
    },
    suggestedActions: [
      { type: "GENERATE_ALERT", label: "Generar alerta operativa", order: 1, suggestedOnly: true },
      { type: "REVIEW_PRODUCTION", label: "Revisar produccion", order: 2, suggestedOnly: true },
      { type: "REVIEW_PORTFOLIOS", label: "Revisar maletas", order: 3, suggestedOnly: true },
      { type: "SUGGEST_REPLACEMENT", label: "Sugerir reemplazo si aplica", order: 4, suggestedOnly: true },
    ],
    severity: "high",
    priority: "high",
    status: "active",
    source: {
      type: "CEO_DIRECTIVE",
      author: "CEO Castillitos",
      definedAt: "2026-04-01T00:00:00Z",
      context: "Regla validada en reunion de gerencia. Umbral confirmado para linea LATIN KIDS.",
    },
    version: 1,
    governance: {
      createdAt: "2026-04-01T00:00:00Z",
      updatedAt: "2026-06-27T00:00:00Z",
      updatedBy: "system",
      confidence: 95,
      changeReason: "Migrado a sistema de reglas configurables",
    },
    metadata: {},
  },

  // Rule 2: CASTILLITOS — Bodega 01 <= 20
  {
    ruleId: "castillitos_inv_castillitos_20",
    orgSlug: "castillitos",
    name: "Inventario CASTILLITOS <= 20",
    description: "Cuando el inventario de Bodega 01 para referencias de CASTILLITOS cae a 20 o menos, generar alerta operativa, revisar produccion, revisar maletas, sugerir reemplazo.",
    category: "INVENTORY",
    scope: {
      type: "SUB_LINEA",
      target: "CASTILLITOS",
      secondaryTarget: "01",
    },
    condition: {
      type: "INVENTORY_THRESHOLD",
      field: "existenciaBodega01",
      operator: "lte",
      threshold: 20,
      unit: "unidades",
    },
    suggestedActions: [
      { type: "GENERATE_ALERT", label: "Generar alerta operativa", order: 1, suggestedOnly: true },
      { type: "REVIEW_PRODUCTION", label: "Revisar produccion", order: 2, suggestedOnly: true },
      { type: "REVIEW_PORTFOLIOS", label: "Revisar maletas", order: 3, suggestedOnly: true },
      { type: "SUGGEST_REPLACEMENT", label: "Sugerir reemplazo si aplica", order: 4, suggestedOnly: true },
    ],
    severity: "high",
    priority: "high",
    status: "active",
    source: {
      type: "CEO_DIRECTIVE",
      author: "CEO Castillitos",
      definedAt: "2026-04-01T00:00:00Z",
      context: "Regla validada en reunion de gerencia. Umbral confirmado para linea CASTILLITOS.",
    },
    version: 1,
    governance: {
      createdAt: "2026-04-01T00:00:00Z",
      updatedAt: "2026-06-27T00:00:00Z",
      updatedBy: "system",
      confidence: 95,
      changeReason: "Migrado a sistema de reglas configurables",
    },
    metadata: {},
  },

  // Rule 3: IMPORTACION — pendiente definicion
  {
    ruleId: "castillitos_inv_importacion_pending",
    orgSlug: "castillitos",
    name: "Inventario IMPORTACION — pendiente",
    description: "Regla de umbral para linea IMPORTACION. Umbral aun no definido por gerencia.",
    category: "INVENTORY",
    scope: {
      type: "SUB_LINEA",
      target: "IMPORTACION",
      secondaryTarget: "01",
    },
    condition: {
      type: "INVENTORY_THRESHOLD",
      field: "existenciaBodega01",
      operator: "lte",
      threshold: 0,
      unit: "unidades",
    },
    suggestedActions: [
      { type: "GENERATE_ALERT", label: "Generar alerta operativa", order: 1, suggestedOnly: true },
    ],
    severity: "info",
    priority: "low",
    status: "draft",
    source: {
      type: "CEO_DIRECTIVE",
      author: "CEO Castillitos",
      definedAt: "2026-06-27T00:00:00Z",
      context: "Pendiente definicion de umbral. No inventar valores.",
    },
    version: 1,
    governance: {
      createdAt: "2026-06-27T00:00:00Z",
      updatedAt: "2026-06-27T00:00:00Z",
      updatedBy: "system",
      confidence: 10,
      changeReason: "Placeholder — pendiente confirmacion de gerencia",
    },
    metadata: { pendingDefinition: true },
  },
];

// ── Phase 13: Multi-Tenant Validation ───────────────────────────────────────

/**
 * Example: Hypothetical "do-jeans" tenant with different thresholds.
 * Demonstrates that the model supports multiple tenants without code changes.
 * These rules are NOT active — they exist only to prove multi-tenant capability.
 */
const DO_JEANS_EXAMPLE_RULES: TenantBusinessRule[] = [
  {
    ruleId: "dojeans_inv_jeans_100",
    orgSlug: "do-jeans",
    name: "Inventario Jeans <= 100",
    description: "Regla hipotetica: cuando Jeans cae a 100 o menos en Bodega 01.",
    category: "INVENTORY",
    scope: { type: "SUB_LINEA", target: "JEANS", secondaryTarget: "01" },
    condition: {
      type: "INVENTORY_THRESHOLD",
      field: "existenciaBodega01",
      operator: "lte",
      threshold: 100,
      unit: "unidades",
    },
    suggestedActions: [
      { type: "GENERATE_ALERT", label: "Generar alerta", order: 1, suggestedOnly: true },
      { type: "REVIEW_PRODUCTION", label: "Revisar produccion", order: 2, suggestedOnly: true },
    ],
    severity: "high",
    priority: "high",
    status: "draft",
    source: {
      type: "SYSTEM_DEFAULT",
      author: "system",
      definedAt: "2026-06-27T00:00:00Z",
      context: "Ejemplo hipotetico para validacion multi-tenant. No activar.",
    },
    version: 1,
    governance: {
      createdAt: "2026-06-27T00:00:00Z",
      updatedAt: "2026-06-27T00:00:00Z",
      updatedBy: "system",
      confidence: 0,
      changeReason: "Ejemplo multi-tenant — no real",
    },
    metadata: { hypothetical: true },
  },
];

// ── Registry ────────────────────────────────────────────────────────────────

/** All registered rule sets, keyed by orgSlug. */
const TENANT_RULE_REGISTRY: Map<string, TenantBusinessRule[]> = new Map([
  ["castillitos", CASTILLITOS_RULES],
  ["do-jeans", DO_JEANS_EXAMPLE_RULES],
]);

/** Get the full rule set for a tenant. Returns empty array if no rules configured. */
export function getTenantRuleSet(orgSlug: string): TenantRuleSet {
  const rules = TENANT_RULE_REGISTRY.get(orgSlug) ?? [];
  return {
    orgSlug,
    rules,
    assembledAt: new Date().toISOString(),
    version: 1,
  };
}

/** Get all active rules for a tenant. */
export function getActiveTenantRules(orgSlug: string): TenantBusinessRule[] {
  const rules = TENANT_RULE_REGISTRY.get(orgSlug) ?? [];
  return rules.filter((r) => r.status === "active");
}

/** Get rules for a tenant by category. */
export function getTenantRulesByCategory(
  orgSlug: string,
  category: string,
): TenantBusinessRule[] {
  return getActiveTenantRules(orgSlug).filter((r) => r.category === category);
}

/** Get all registered tenant slugs. */
export function getRegisteredTenants(): string[] {
  return Array.from(TENANT_RULE_REGISTRY.keys());
}
