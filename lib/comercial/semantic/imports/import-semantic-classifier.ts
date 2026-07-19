/**
 * lib/comercial/semantic/imports/import-semantic-classifier.ts
 *
 * Classifies ERP document/movement data into canonical semantic types.
 *
 * Resolution order:
 *   1. Exact ID match (externalId)
 *   2. Exact code match (externalCode)
 *   3. Code alias match
 *   4. Name pattern match (substring/regex fallback)
 *   5. UNKNOWN with low confidence
 *
 * Post-resolution adjustments:
 *   - Cancelled documents → no counting effects
 *   - Negative quantity on IMPORT_INVOICE → reduce confidence, add unresolved
 *   - Missing tenant config → safe defaults
 *
 * Sprint: IMPORT-SEMANTIC-MAPPING-01
 */

import type {
  ImportDocumentInput,
  ImportSemanticClassificationResult,
  ClassificationEvidence,
  ImportDocumentSemanticType,
  ImportMovementSemanticType,
  InventoryEffect,
} from "./import-semantic-types";
import type {
  ImportSemanticTenantConfig,
  DocumentSemanticMapping,
} from "./import-semantic-config";
import { getTenantConfig } from "./import-semantic-config";

const RULE_VERSION = "IMPORT_SEMANTIC_V2";

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Classify an import document into semantic types.
 *
 * If no tenantConfig is provided, looks up the registry by tenantId.
 * If no config found, returns UNKNOWN with safe defaults.
 */
export function classifyImportDocument(
  input: ImportDocumentInput,
  tenantConfig?: ImportSemanticTenantConfig,
): ImportSemanticClassificationResult {
  const config = tenantConfig ?? getTenantConfig(input.tenantId);

  // No config → safe UNKNOWN
  if (!config) {
    return buildUnknownResult(input, [
      { description: `No semantic config for tenant "${input.tenantId}"`, weight: 0, source: "DEFAULT" },
    ]);
  }

  const evidence: ClassificationEvidence[] = [];
  const unresolvedReasons: string[] = [];

  // ── Step 1: Resolve mapping ───────────────────────────────────────────
  let mapping: DocumentSemanticMapping | undefined;
  let resolvedBy: "ID" | "CODE" | "ALIAS" | "NAME" | "NONE" = "NONE";

  // 1a. Exact ID match
  mapping = config.documentMappings.find(
    m => m.enabled && m.externalId === input.sourceId,
  );
  if (mapping) {
    resolvedBy = "ID";
    evidence.push({
      description: `Exact ID match: externalId="${mapping.externalId}" → ${mapping.semanticType}`,
      weight: 0.9,
      source: "MAPPING_ID",
    });
  }

  // 1b. Exact code match
  if (!mapping && input.sourceCode) {
    mapping = config.documentMappings.find(
      m => m.enabled && m.externalCode === input.sourceCode,
    );
    if (mapping) {
      resolvedBy = "CODE";
      evidence.push({
        description: `Exact code match: externalCode="${mapping.externalCode}" → ${mapping.semanticType}`,
        weight: 0.8,
        source: "MAPPING_CODE",
      });
    }
  }

  // 1c. Code alias
  if (!mapping && input.sourceCode && config.codeAliases[input.sourceCode]) {
    const aliasCode = config.codeAliases[input.sourceCode];
    mapping = config.documentMappings.find(
      m => m.enabled && m.externalCode === aliasCode,
    );
    if (mapping) {
      resolvedBy = "ALIAS";
      evidence.push({
        description: `Alias match: "${input.sourceCode}" → "${aliasCode}" → ${mapping.semanticType}`,
        weight: 0.7,
        source: "MAPPING_CODE",
      });
    }
  }

  // 1d. Name pattern match (weakest) — specificity-first resolution.
  //     Collects ALL matches, sorts by specificity (priority desc, pattern length desc),
  //     picks the most specific, and records conflicts as evidence.
  if (!mapping && input.sourceName) {
    const upperName = input.sourceName.toUpperCase();

    // Collect every matching pattern with its reference mapping
    const matches: { np: typeof config.namePatterns[number]; refMapping: DocumentSemanticMapping }[] = [];
    const unmappedMatches: typeof config.namePatterns[number][] = [];
    for (const np of config.namePatterns) {
      if (new RegExp(np.pattern, "i").test(upperName)) {
        const refMapping = config.documentMappings.find(
          m => m.enabled && m.semanticType === np.semanticType,
        );
        if (refMapping) {
          matches.push({ np, refMapping });
        } else {
          unmappedMatches.push(np);
        }
      }
    }

    if (matches.length > 0) {
      // Sort by specificity: explicit priority (desc), then pattern length (desc)
      matches.sort((a, b) => {
        const prioA = a.np.priority ?? 0;
        const prioB = b.np.priority ?? 0;
        if (prioA !== prioB) return prioB - prioA;
        return b.np.pattern.length - a.np.pattern.length;
      });

      const winner = matches[0];
      mapping = { ...winner.refMapping };
      mapping.confidence = Math.min(mapping.confidence, winner.np.confidence);
      resolvedBy = "NAME";

      evidence.push({
        description: `Name pattern match: "${winner.np.pattern}" on "${input.sourceName}" → ${winner.np.semanticType} (specificity: priority=${winner.np.priority ?? 0}, len=${winner.np.pattern.length})`,
        weight: 0.4,
        source: "MAPPING_NAME",
      });

      // Record conflicts: other patterns that also matched but lost
      const allCompeting = [
        ...matches.slice(1).map(m => ({ pattern: m.np.pattern, type: m.np.semanticType, priority: m.np.priority ?? 0, mapped: true })),
        ...unmappedMatches.map(u => ({ pattern: u.pattern, type: u.semanticType, priority: u.priority ?? 0, mapped: false })),
      ];

      for (const loser of allCompeting) {
        evidence.push({
          description: `Competing pattern "${loser.pattern}" → ${loser.type} also matched but lost to more specific "${winner.np.pattern}"${loser.mapped ? "" : " (no mapping available)"} (priority=${loser.priority}, len=${loser.pattern.length})`,
          weight: 0.1,
          source: "MAPPING_NAME",
        });
      }

      if (allCompeting.length > 0) {
        // Collect all distinct types including unmapped for conflict assessment
        const allTypes = new Set([winner.np.semanticType, ...allCompeting.map(c => c.type)]);
        if (allTypes.size > 1) {
          mapping.confidence *= 0.8;
          unresolvedReasons.push(
            `Pattern conflict: ${1 + allCompeting.length} patterns matched "${input.sourceName}" → ${[...allTypes].join(", ")}. Selected "${winner.np.semanticType}" by specificity.`,
          );
        }
      }
    }
  }

  // No mapping found → UNKNOWN
  if (!mapping) {
    evidence.push({
      description: `No mapping found for sourceId="${input.sourceId}", sourceCode="${input.sourceCode}", sourceName="${input.sourceName}"`,
      weight: 0,
      source: "DEFAULT",
    });
    return buildUnknownResult(input, evidence);
  }

  // ── Step 2: Build base result from mapping ────────────────────────────
  let confidence = mapping.confidence;
  let docType: ImportDocumentSemanticType = mapping.semanticType;
  let movType: ImportMovementSemanticType = mapping.movementType;
  let invEffect: InventoryEffect = mapping.inventoryEffect;
  let countReceipt = mapping.countAsImportReceipt;
  let countRepurchase = mapping.countAsRepurchase;
  let countTotal = mapping.countInTotalImported;
  let affectsStock = mapping.affectsCommercialStock;

  // ── Step 3: Apply contextual adjustments ──────────────────────────────

  // 3a. Cancelled document → disable all counting
  if (input.cancelled) {
    countReceipt = false;
    countRepurchase = false;
    countTotal = false;
    affectsStock = false;
    confidence *= 0.3;
    evidence.push({
      description: "Document is cancelled — all counting disabled",
      weight: 0.9,
      source: "CANCELLED_STATUS",
    });
  }

  // 3b. Quantity sign checks
  if (input.quantity < 0) {
    evidence.push({
      description: `Negative quantity (${input.quantity})`,
      weight: 0.5,
      source: "QUANTITY_SIGN",
    });

    // Negative qty on IMPORT_INVOICE is contradictory → reduce confidence
    if (docType === "IMPORT_INVOICE" || docType === "IMPORT_RECEIPT") {
      confidence *= 0.5;
      unresolvedReasons.push(
        `Negative quantity (${input.quantity}) on ${docType} — expected positive for import receipt`,
      );
      countReceipt = false;
      countTotal = false;
    }

    // Negative qty → effect is DECREASE
    if (invEffect === "INCREASE") {
      invEffect = "DECREASE";
    }
  }

  if (input.quantity > 0) {
    evidence.push({
      description: `Positive quantity (${input.quantity})`,
      weight: 0.3,
      source: "QUANTITY_SIGN",
    });
  }

  // 3c. Zero quantity → no inventory effect
  if (input.quantity === 0) {
    invEffect = "NONE";
    countTotal = false;
    evidence.push({
      description: "Zero quantity — no inventory effect",
      weight: 0.3,
      source: "QUANTITY_SIGN",
    });
  }

  // 3d. Warehouse context
  if (input.warehouseId) {
    const whMapping = config.warehouseMappings.find(
      w => w.externalId === input.warehouseId,
    );
    if (whMapping) {
      const isImportWh =
        whMapping.semanticType === "IMPORT_STAGING" ||
        whMapping.semanticType === "IMPORT_CONTAINER";
      if (isImportWh && (docType === "IMPORT_INVOICE" || docType === "IMPORT_RECEIPT")) {
        confidence = Math.min(confidence + 0.05, 1.0);
        evidence.push({
          description: `Import warehouse "${whMapping.externalName}" (${whMapping.semanticType}) supports import classification`,
          weight: 0.5,
          source: "WAREHOUSE",
        });
      }
    }
  }

  // 3e. Mapping status adjustments
  if (mapping.status === "UNKNOWN") {
    confidence *= 0.7;
    unresolvedReasons.push(`Mapping status is UNKNOWN for ${mapping.externalCode}(${mapping.externalId})`);
  } else if (mapping.status === "EXCLUDED") {
    confidence *= 0.1;
    unresolvedReasons.push(`Mapping is EXCLUDED for ${mapping.externalCode}(${mapping.externalId})`);
  }

  // ── Step 4: Clamp confidence ──────────────────────────────────────────
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    documentSemanticType: docType,
    movementSemanticType: movType,
    confidence,
    evidence,
    tenantId: input.tenantId,
    erpSource: input.erp,
    externalDocumentTypeId: input.sourceId,
    externalDocumentCode: input.sourceCode,
    externalDocumentName: input.sourceName,
    inventoryEffect: invEffect,
    purchaseEffect: docType === "IMPORT_INVOICE" || docType === "DOMESTIC_PURCHASE_INVOICE" || docType === "IMPORT_RECEIPT",
    importEffect: docType === "IMPORT_INVOICE" || docType === "IMPORT_PROVISION" || docType === "IMPORT_EXPENSE" || docType === "IMPORT_LIQUIDATION" || docType === "IMPORT_RETURN" || docType === "IMPORT_RECEIPT",
    shouldCountAsImportReceipt: countReceipt,
    shouldCountAsRepurchase: countRepurchase,
    shouldCountInTotalImported: countTotal,
    shouldAffectCommercialStock: affectsStock,
    unresolvedReasons,
    ruleVersion: RULE_VERSION,
  };
}

// ── Helper ──────────────────────────────────────────────────────────────────

function buildUnknownResult(
  input: ImportDocumentInput,
  evidence: ClassificationEvidence[],
): ImportSemanticClassificationResult {
  return {
    documentSemanticType: "UNKNOWN",
    movementSemanticType: "UNKNOWN",
    confidence: 0,
    evidence,
    tenantId: input.tenantId,
    erpSource: input.erp,
    externalDocumentTypeId: input.sourceId,
    externalDocumentCode: input.sourceCode,
    externalDocumentName: input.sourceName,
    inventoryEffect: "UNKNOWN",
    purchaseEffect: false,
    importEffect: false,
    shouldCountAsImportReceipt: false,
    shouldCountAsRepurchase: false,
    shouldCountInTotalImported: false,
    shouldAffectCommercialStock: false,
    unresolvedReasons: ["No classification possible — insufficient evidence"],
    ruleVersion: RULE_VERSION,
  };
}
