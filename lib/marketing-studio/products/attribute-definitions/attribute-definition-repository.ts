/**
 * lib/marketing-studio/products/attribute-definitions/attribute-definition-repository.ts
 *
 * MARKETING-STUDIO-PRODUCT-ATTRIBUTES-01 — Attribute Definition Repository
 *
 * All Prisma CRUD operations for ProductAttributeDefinition.
 * SERVER ONLY — never import from client components.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   - All ops are organizationId-scoped
 *   - Options are replaced atomically (delete-then-create) on update
 *   - No partial returns — always returns full AttributeDefinition with options
 */

import { prisma } from "@/lib/prisma";
import {
  attributeValueTypeGuard,
} from "../domain/product-guards";
import type {
  AttributeDefinition,
  AttributeDefinitionOption,
  CreateAttributeDefinitionInput,
  UpdateAttributeDefinitionInput,
} from "./attribute-definition-types";

// ── Row mapper ─────────────────────────────────────────────────────────────────

function mapDefinition(row: {
  id: string;
  organizationId: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  sortOrder: number;
  helpText: string | null;
  destination: string | null;
  source: string;
  externalRef: string | null;
  createdAt: Date;
  updatedAt: Date;
  options: {
    id: string;
    definitionId: string;
    value: string;
    label: string;
    sortOrder: number;
    source: string;
    externalRef: string | null;
  }[];
}): AttributeDefinition {
  return {
    id:             row.id,
    organizationId: row.organizationId,
    key:            row.key,
    label:          row.label,
    type:           attributeValueTypeGuard.parse(row.type),
    required:       row.required,
    sortOrder:      row.sortOrder,
    helpText:       row.helpText,
    destination:    row.destination,
    source:         row.source,
    externalRef:    row.externalRef,
    createdAt:      row.createdAt,
    updatedAt:      row.updatedAt,
    options:        row.options.map(mapOption),
  };
}

function mapOption(row: {
  id: string;
  definitionId: string;
  value: string;
  label: string;
  sortOrder: number;
  source: string;
  externalRef: string | null;
}): AttributeDefinitionOption {
  return {
    id:           row.id,
    definitionId: row.definitionId,
    value:        row.value,
    label:        row.label,
    sortOrder:    row.sortOrder,
    source:       row.source,
    externalRef:  row.externalRef,
  };
}

const DEFINITION_WITH_OPTIONS = {
  options: {
    orderBy: { sortOrder: "asc" as const },
  },
};

// ── Read ───────────────────────────────────────────────────────────────────────

/**
 * listAttributeDefinitions — returns all definitions for an org,
 * ordered by sortOrder then label.
 */
export async function listAttributeDefinitions(
  organizationId: string,
): Promise<AttributeDefinition[]> {
  const rows = await prisma.productAttributeDefinition.findMany({
    where:   { organizationId },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    include: DEFINITION_WITH_OPTIONS,
  });
  return rows.map(mapDefinition);
}

export async function getAttributeDefinition(
  organizationId: string,
  definitionId:   string,
): Promise<AttributeDefinition | null> {
  const row = await prisma.productAttributeDefinition.findFirst({
    where:   { id: definitionId, organizationId },
    include: DEFINITION_WITH_OPTIONS,
  });
  return row ? mapDefinition(row) : null;
}

// ── Create ─────────────────────────────────────────────────────────────────────

export async function createAttributeDefinition(
  input: CreateAttributeDefinitionInput,
): Promise<AttributeDefinition> {
  const { organizationId, key, label, type, required, sortOrder, helpText, destination, source, externalRef, options } = input;

  const row = await prisma.productAttributeDefinition.create({
    data: {
      organizationId,
      key,
      label,
      type,
      required:    required    ?? false,
      sortOrder:   sortOrder   ?? 0,
      helpText:    helpText    ?? null,
      destination: destination ?? null,
      source:      source      ?? "manual",
      externalRef: externalRef ?? null,
      options: options && options.length > 0 ? {
        create: options.map((o, i) => ({
          value:     o.value,
          label:     o.label,
          sortOrder: o.sortOrder ?? i,
        })),
      } : undefined,
    },
    include: DEFINITION_WITH_OPTIONS,
  });

  return mapDefinition(row);
}

// ── Update ─────────────────────────────────────────────────────────────────────

/**
 * updateAttributeDefinition — patches scalar fields.
 * If options are provided, replaces all options atomically.
 * Note: type is immutable after creation to preserve existing attribute values.
 */
export async function updateAttributeDefinition(
  organizationId: string,
  definitionId:   string,
  input:          UpdateAttributeDefinitionInput,
): Promise<AttributeDefinition | null> {
  const existing = await prisma.productAttributeDefinition.findFirst({
    where: { id: definitionId, organizationId },
  });
  if (!existing) return null;

  const { options, ...fields } = input;

  if (options !== undefined) {
    // Replace options atomically
    await prisma.$transaction([
      prisma.productAttributeDefinitionOption.deleteMany({
        where: { definitionId },
      }),
      ...(options.length > 0
        ? [prisma.productAttributeDefinitionOption.createMany({
            data: options.map((o, i) => ({
              definitionId,
              value:     o.value,
              label:     o.label,
              sortOrder: o.sortOrder ?? i,
            })),
          })]
        : []
      ),
    ]);
  }

  const row = await prisma.productAttributeDefinition.update({
    where:   { id: definitionId },
    data:    { ...fields, updatedAt: new Date() },
    include: DEFINITION_WITH_OPTIONS,
  });

  return mapDefinition(row);
}

// ── Delete ─────────────────────────────────────────────────────────────────────

export async function deleteAttributeDefinition(
  organizationId: string,
  definitionId:   string,
): Promise<boolean> {
  const result = await prisma.productAttributeDefinition.deleteMany({
    where: { id: definitionId, organizationId },
  });
  return result.count > 0;
}
