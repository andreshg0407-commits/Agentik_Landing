/**
 * lib/marketing-studio/catalogs/catalog-filter-engine.ts
 *
 * MARKETING-STUDIO-CATALOG-BUILDER-01 — Catalog Filter Engine
 *
 * Translates CatalogFilterRule[] into a Prisma WHERE object for ProductEntity.
 * SERVER ONLY — never import from client components.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   - Scalar fields (status, category, price, …) → top-level WHERE conditions
 *   - syncChannel:* → WHERE syncStates.some(channel = X)
 *   - publicationChannel:* → WHERE publicationStates.some(channel = X)
 *   - attribute:{key} → WHERE attributes.some(key = K AND value matches)
 *   - Unknown/invalid fields are silently skipped (fail-open for display)
 *   - Never throws — returns {} on empty rules
 */

import type { CatalogFilterRule, FilterOperator } from "./catalog-definition-types";

// ── Prisma WHERE shape (partial, typed for ProductEntity) ────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaWhere = Record<string, any>;

// ── Scalar field registry ─────────────────────────────────────────────────────

/** Fields that map directly to top-level ProductEntity columns. */
const SCALAR_FIELDS = new Set([
  "status",
  "commercialStatus",
  "category",
  "productLine",
  "name",
  "sku",
  "price",
  "readinessLevel",
  "usagePermission",
  "segment",
  "currency",
]);

// ── Operator → Prisma condition builder ──────────────────────────────────────

function buildScalarCondition(
  operator: FilterOperator,
  value: string | number | boolean | string[] | undefined,
): PrismaWhere | null {
  switch (operator) {
    case "equals":      return { equals: value };
    case "not_equals":  return { not: value };
    case "contains":    return { contains: String(value ?? ""), mode: "insensitive" };
    case "not_contains":
      return { not: { contains: String(value ?? ""), mode: "insensitive" } };
    case "starts_with":
      return { startsWith: String(value ?? ""), mode: "insensitive" };
    case "in":
      return { in: Array.isArray(value) ? value : [String(value ?? "")] };
    case "not_in":
      return { notIn: Array.isArray(value) ? value : [String(value ?? "")] };
    case "gt":          return { gt: value };
    case "gte":         return { gte: value };
    case "lt":          return { lt: value };
    case "lte":         return { lte: value };
    case "is_true":     return { equals: true };
    case "is_false":    return { equals: false };
    case "is_set":      return { not: null };
    case "is_not_set":  return null; // handled as { field: null }
    default:            return null;
  }
}

// ── Attribute sub-filter builder ──────────────────────────────────────────────

function buildAttributeFilter(
  key: string,
  operator: FilterOperator,
  value: string | number | boolean | string[] | undefined,
): PrismaWhere | null {
  const keyCondition = { key };

  switch (operator) {
    case "equals":
      return {
        attributes: {
          some: {
            ...keyCondition,
            OR: [
              { valueText:    { equals: String(value ?? "") } },
              { valueNumber:  { equals: typeof value === "number" ? value : undefined } },
            ],
          },
        },
      };

    case "not_equals":
      return {
        attributes: {
          some: {
            ...keyCondition,
            NOT: {
              OR: [
                { valueText:   { equals: String(value ?? "") } },
                { valueNumber: { equals: typeof value === "number" ? value : undefined } },
              ],
            },
          },
        },
      };

    case "contains":
      return {
        attributes: {
          some: { ...keyCondition, valueText: { contains: String(value ?? ""), mode: "insensitive" } },
        },
      };

    case "in":
      return {
        attributes: {
          some: {
            ...keyCondition,
            valueText: { in: Array.isArray(value) ? value : [String(value ?? "")] },
          },
        },
      };

    case "not_in":
      return {
        attributes: {
          some: {
            ...keyCondition,
            valueText: { notIn: Array.isArray(value) ? value : [String(value ?? "")] },
          },
        },
      };

    case "gt":
      return { attributes: { some: { ...keyCondition, valueNumber: { gt: Number(value) } } } };
    case "gte":
      return { attributes: { some: { ...keyCondition, valueNumber: { gte: Number(value) } } } };
    case "lt":
      return { attributes: { some: { ...keyCondition, valueNumber: { lt: Number(value) } } } };
    case "lte":
      return { attributes: { some: { ...keyCondition, valueNumber: { lte: Number(value) } } } };

    case "is_true":
      return { attributes: { some: { ...keyCondition, valueBoolean: true } } };
    case "is_false":
      return { attributes: { some: { ...keyCondition, valueBoolean: false } } };

    case "is_set":
      return { attributes: { some: { key } } };
    case "is_not_set":
      return { attributes: { none: { key } } };

    default:
      return null;
  }
}

// ── Sync channel filter ───────────────────────────────────────────────────────

function buildSyncChannelFilter(
  channel: string,
  operator: FilterOperator,
): PrismaWhere | null {
  if (operator === "equals" || operator === "in") {
    return {
      syncStates: {
        some: { channel },
      },
    };
  }
  if (operator === "not_equals" || operator === "not_in") {
    return {
      syncStates: {
        none: { channel },
      },
    };
  }
  if (operator === "is_set") {
    return { syncStates: { some: { channel } } };
  }
  if (operator === "is_not_set") {
    return { syncStates: { none: { channel } } };
  }
  return null;
}

// ── Publication channel filter ────────────────────────────────────────────────

function buildPublicationChannelFilter(
  channel: string,
  operator: FilterOperator,
): PrismaWhere | null {
  if (operator === "equals" || operator === "in") {
    return {
      publicationStates: {
        some: { channel, publicationStatus: "published" },
      },
    };
  }
  if (operator === "not_equals" || operator === "not_in") {
    return {
      publicationStates: {
        none: { channel, publicationStatus: "published" },
      },
    };
  }
  if (operator === "is_set") {
    return { publicationStates: { some: { channel } } };
  }
  if (operator === "is_not_set") {
    return { publicationStates: { none: { channel } } };
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * buildCatalogWhereClause
 *
 * Converts a CatalogFilterRule[] into a Prisma-compatible AND-chained WHERE
 * object for ProductEntity queries. Always includes organizationId scoping.
 *
 * Caller is responsible for merging with `{ organizationId }` base condition.
 */
export function buildCatalogWhereClause(
  organizationId: string,
  rules: CatalogFilterRule[],
): PrismaWhere {
  const andConditions: PrismaWhere[] = [{ organizationId }];

  for (const rule of rules) {
    const { field, operator, value } = rule;

    // ── Attribute subquery: "attribute:{key}" ────────────────────────────────
    if (field.startsWith("attribute:")) {
      const attrKey = field.slice("attribute:".length);
      if (attrKey) {
        const cond = buildAttributeFilter(attrKey, operator, value);
        if (cond) andConditions.push(cond);
      }
      continue;
    }

    // ── Sync channel: "syncChannel:{channel}" ────────────────────────────────
    if (field.startsWith("syncChannel:")) {
      const channel = field.slice("syncChannel:".length);
      if (channel) {
        const cond = buildSyncChannelFilter(channel, operator);
        if (cond) andConditions.push(cond);
      }
      continue;
    }

    // ── Publication channel: "publicationChannel:{channel}" ─────────────────
    if (field.startsWith("publicationChannel:")) {
      const channel = field.slice("publicationChannel:".length);
      if (channel) {
        const cond = buildPublicationChannelFilter(channel, operator);
        if (cond) andConditions.push(cond);
      }
      continue;
    }

    // ── Scalar field ─────────────────────────────────────────────────────────
    if (SCALAR_FIELDS.has(field)) {
      if (operator === "is_not_set") {
        andConditions.push({ [field]: null });
        continue;
      }
      const condition = buildScalarCondition(operator, value);
      if (condition) {
        andConditions.push({ [field]: condition });
      }
      continue;
    }

    // Unknown field — skip silently
  }

  if (andConditions.length === 1) {
    // Only the organizationId base condition — return it directly
    return { organizationId };
  }

  return { AND: andConditions };
}
