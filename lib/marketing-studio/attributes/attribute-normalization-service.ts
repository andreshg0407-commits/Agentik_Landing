/**
 * lib/marketing-studio/attributes/attribute-normalization-service.ts
 *
 * AGENTIK-ATTRIBUTE-IMPORT-01 — Core Normalization Service
 *
 * Takes external product data (SAG, Shopify, generic ERP) and idempotently
 * creates or reuses attribute definitions, option values, and product
 * attribute assignments.
 *
 * ── Responsibilities ──────────────────────────────────────────────────────────
 *   1. Map raw field names to Agentik attribute keys (via field map)
 *   2. Find or create the AttributeDefinition (no duplicates)
 *   3. For select/multiselect: find or create the option value (no duplicates)
 *   4. Assign the attribute to the product (upsert)
 *   5. Queue unmapped/ambiguous fields for human review
 *   6. Tag all created rows with source + externalRef for full provenance
 *
 * ── Idempotency ───────────────────────────────────────────────────────────────
 *   Running the same import twice produces the same result.
 *   - Definition: findFirst by (organizationId, key) — creates only if missing
 *   - Option: compared via normalizeAttributeValue() — adds only if new
 *   - Product attribute: upsert by (productId, key) — updates only if changed
 *
 * ── Error handling ────────────────────────────────────────────────────────────
 *   Per-field try/catch — one bad field never aborts the whole product.
 *   Errors are collected in result.errors, not thrown.
 *
 * SERVER ONLY — uses Prisma directly.
 */

import "server-only";
import { prisma }                  from "@/lib/prisma";
import { lookupField }             from "./attribute-field-map";
import {
  normalizeAttributeValue,
  toTitleCase,
  valueMatchesExisting,
}                                  from "./attribute-text-normalizer";
import type {
  AttributeImportResult,
  ExternalProductData,
  ImportReviewItem,
}                                  from "./attribute-import-types";

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Normalize and assign all attributes from one external product record.
 *
 * @param productId      Agentik ProductEntity.id to assign attributes to
 * @param organizationId Org scope for all DB operations
 * @param tenantSlug     Used to resolve the correct field map
 * @param data           Raw external product data
 */
export async function normalizeAndAssignAttributes(
  productId:      string,
  organizationId: string,
  tenantSlug:     string,
  data:           ExternalProductData,
): Promise<AttributeImportResult> {
  const result: AttributeImportResult = {
    productId,
    definitionsCreated: [],
    valuesCreated:      [],
    attributesAssigned: [],
    attributesSkipped:  [],
    pendingReview:      [],
    errors:             [],
  };

  for (const { externalField, externalValue } of data.fields) {
    // ── Guard: skip empty values ─────────────────────────────────────────────
    if (!externalValue?.trim()) {
      result.pendingReview.push({
        externalField,
        externalValue,
        reason:     "EMPTY_VALUE",
        confidence: "low",
      });
      continue;
    }

    // ── Look up field mapping ────────────────────────────────────────────────
    const mapping = lookupField(externalField, tenantSlug);
    if (!mapping) {
      result.pendingReview.push({
        externalField,
        externalValue,
        reason:     "UNMAPPED_FIELD",
        confidence: "low",
      });
      continue;
    }

    const { agentikKey, agentikLabel, type, confidence, required, valueTransform } = mapping;

    try {
      // ── 1. Find or create the attribute definition ───────────────────────
      let definition = await prisma.productAttributeDefinition.findFirst({
        where:   { organizationId, key: agentikKey },
        include: { options: { orderBy: { sortOrder: "asc" } } },
      });

      if (!definition) {
        definition = await prisma.productAttributeDefinition.create({
          data: {
            organizationId,
            key:         agentikKey,
            label:       agentikLabel,
            type,
            required:    required ?? false,
            sortOrder:   0,
            source:      data.source,
            externalRef: externalField,
          },
          include: { options: { orderBy: { sortOrder: "asc" } } },
        });
        result.definitionsCreated.push(agentikKey);
      }

      // ── 2. Determine canonical value ─────────────────────────────────────
      const rawValue        = externalValue.trim();
      const transformedValue = valueTransform ? valueTransform(rawValue) : toTitleCase(rawValue);

      let canonicalValue = transformedValue;

      if (type === "select" || type === "multiselect") {
        // Check if option already exists (case/diacritic insensitive)
        const existingOption = definition.options.find(o =>
          valueMatchesExisting(rawValue, o.value),
        );

        if (!existingOption) {
          // Create new option and mark as imported
          await prisma.productAttributeDefinitionOption.create({
            data: {
              definitionId: definition.id,
              value:        canonicalValue,
              label:        canonicalValue,
              sortOrder:    definition.options.length,
              source:       data.source,
              externalRef:  rawValue,
            },
          });
          result.valuesCreated.push(`${agentikKey}:${canonicalValue}`);
        } else {
          // Use canonical stored value (preserves manual edits)
          canonicalValue = existingOption.value;
        }
      }

      // ── 3. Assign attribute to product (upsert) ──────────────────────────
      const existing = await prisma.productAttribute.findUnique({
        where: { productId_key: { productId, key: agentikKey } },
      });

      if (existing) {
        // Only update if value has changed
        const currentValue = existing.valueText ?? "";
        if (normalizeAttributeValue(currentValue) !== normalizeAttributeValue(canonicalValue)) {
          await prisma.productAttribute.update({
            where: { productId_key: { productId, key: agentikKey } },
            data: {
              valueText:   type === "text" || type === "select" ? canonicalValue : null,
              source:      data.source,
              externalRef: externalField,
              updatedAt:   new Date(),
            },
          });
          result.attributesAssigned.push(agentikKey);
        } else {
          result.attributesSkipped.push(agentikKey);
        }
      } else {
        await prisma.productAttribute.create({
          data: {
            productId,
            organizationId,
            key:         agentikKey,
            label:       agentikLabel,
            type,
            valueText:   type === "text" || type === "select" ? canonicalValue : null,
            source:      data.source,
            externalRef: externalField,
          },
        });
        result.attributesAssigned.push(agentikKey);
      }

      // Low-confidence mappings still proceed but are flagged for review
      if (confidence === "low" || confidence === "medium") {
        const reviewItem: ImportReviewItem = {
          externalField,
          externalValue: rawValue,
          reason:        "AMBIGUOUS_VALUE",
          confidence,
          suggestion:    `${agentikLabel}: ${canonicalValue}`,
        };
        result.pendingReview.push(reviewItem);
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`[${externalField}] ${msg}`);
    }
  }

  return result;
}
