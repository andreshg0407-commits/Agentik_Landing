/**
 * lib/marketing-studio/library/operations/relations.ts
 *
 * MARKETING-STUDIO-LIBRARY-OPS — Sprint MS-02
 *
 * Asset relation graph — how assets connect to products, campaigns, workflows,
 * agents, catalogs, Shopify, publications, and other assets.
 *
 * ── PURPOSE ───────────────────────────────────────────────────────────────────
 *
 *   Every MarketingAsset can be connected to N other entities via AssetRelation records.
 *   This graph is the foundation for:
 *
 *     - Intelligent reuse  — "find all assets related to this product"
 *     - Mila routing       — "find the WhatsApp asset for this campaign"
 *     - Luca briefing      — "find approved lifestyle photos for this collection"
 *     - Ads intelligence   — "which ad creatives are linked to this product?"
 *     - Analytics          — "which assets are most used across channels?"
 *     - Recommendations    — "similar products have these assets; suggest reuse"
 *     - Deduplication      — "this asset already exists under a different name"
 *
 * ── GRAPH STRUCTURE ───────────────────────────────────────────────────────────
 *
 *   Node:  MarketingAsset (identified by assetId)
 *   Edge:  AssetRelation (type + referenceId)
 *
 *   The graph is directional:
 *     asset → product   (this asset belongs to product X)
 *     asset → campaign  (this asset was created for campaign Y)
 *     asset → agent     (this asset was produced by Luca / Mila)
 *     asset → asset     (parent/child: a variant or derivative)
 *
 * ── FUTURE ────────────────────────────────────────────────────────────────────
 *
 *   Semantic search (embeddings) will traverse this graph to power:
 *     - "find assets similar to this one"
 *     - "find all assets for the back-to-school campaign"
 *     - "find unused assets for this product"
 */

import type { AssetRelation } from "../types";

// ── Relation types (extended from core types.ts) ───────────────────────────────

/**
 * RelationType — all valid relation types in the asset graph.
 * Extends the base AssetRelation.type with more specific variants.
 */
export type RelationType =
  | "product"           // links to an internal product record
  | "campaign"          // links to a marketing campaign (Pauta IA)
  | "catalog"           // links to a catalog compilation job
  | "shopify_product"   // links to a Shopify product by product ID
  | "workflow"          // links to an n8n workflow execution
  | "agent"             // links to the Agentik agent that produced this
  | "parent_asset"      // this asset is a derivative of another asset
  | "child_asset"       // this asset has a derivative
  | "publication"       // links to a published post/listing record
  | "collection"        // links to a product collection (editorial grouping)
  | "batch_job";        // links to a BatchGenerationJob

/**
 * TypedAssetRelation — AssetRelation with the full RelationType set.
 */
export interface TypedAssetRelation extends Omit<AssetRelation, "type"> {
  type: RelationType;
  /** When this relation was established. ISO timestamp. */
  linkedAt?: string;
  /** UserId of the operator or system that created this relation. */
  linkedBy?: string;
}

// ── Relation graph node ────────────────────────────────────────────────────────

/**
 * RelationGraphNode — a single asset node with its full relation map.
 *
 * Used by the Biblioteca detail panel, Luca agent, and future recommendation engine.
 */
export interface RelationGraphNode {
  assetId:       string;
  assetName?:    string;
  assetType?:    string;
  relations:     TypedAssetRelation[];
  /** Direct parent asset (if this is a derivative/variant). */
  parentAssetId?: string;
  /** Direct children (derivatives/variants of this asset). */
  childAssetIds?: string[];
}

// ── Relation queries ───────────────────────────────────────────────────────────

/**
 * RelationQuery — finds assets related to a specific entity.
 *
 * Example uses:
 *   { type: "product", referenceId: "prod_123" }
 *     → find all library assets for product prod_123
 *
 *   { type: "campaign", referenceId: "campaign_regreso_clases_2026" }
 *     → find all assets created for the back-to-school campaign
 *
 *   { type: "agent", referenceId: "luca" }
 *     → find all assets produced by Luca
 */
export interface RelationQuery {
  /** Filter by relation type. */
  type?:        RelationType;
  /** Filter by the referenced entity's ID. */
  referenceId?: string;
  /** Filter by tenant. */
  tenantId?:    string;
  /** Also include child/derived assets (follow parent_asset → child_asset links). */
  includeDerivatives?: boolean;
  /** Maximum depth to traverse (default: 1). Used when includeDerivatives = true. */
  depth?:       number;
}

// ── Relation graph operations ──────────────────────────────────────────────────

/**
 * addRelation — returns the updated relations array with the new relation added.
 * Pure function — does not mutate the input array.
 * Deduplicates: if a relation with the same type + referenceId already exists, it is not re-added.
 */
export function addRelation(
  existing:    TypedAssetRelation[],
  newRelation: TypedAssetRelation,
): TypedAssetRelation[] {
  const alreadyExists = existing.some(
    r => r.type === newRelation.type && r.referenceId === newRelation.referenceId,
  );
  if (alreadyExists) return existing;
  return [...existing, newRelation];
}

/**
 * removeRelation — returns the updated relations array with the matching relation removed.
 * Pure function.
 */
export function removeRelation(
  existing:    TypedAssetRelation[],
  type:        RelationType,
  referenceId: string,
): TypedAssetRelation[] {
  return existing.filter(r => !(r.type === type && r.referenceId === referenceId));
}

/**
 * findRelations — filters relations by type and/or referenceId.
 */
export function findRelations(
  relations:    TypedAssetRelation[],
  query:        Pick<RelationQuery, "type" | "referenceId">,
): TypedAssetRelation[] {
  return relations.filter(r => {
    if (query.type        && r.type        !== query.type)        return false;
    if (query.referenceId && r.referenceId !== query.referenceId) return false;
    return true;
  });
}

/**
 * hasRelation — checks if a specific relation exists.
 */
export function hasRelation(
  relations:   TypedAssetRelation[],
  type:        RelationType,
  referenceId: string,
): boolean {
  return relations.some(r => r.type === type && r.referenceId === referenceId);
}

/**
 * buildRelationGraph — constructs a RelationGraphNode for a single asset.
 * Separates parent/child links from other relation types.
 */
export function buildRelationGraph(
  assetId:   string,
  relations: TypedAssetRelation[],
  assetName?: string,
  assetType?: string,
): RelationGraphNode {
  const parentRel   = relations.find(r => r.type === "parent_asset");
  const childRelIds = relations
    .filter(r => r.type === "child_asset")
    .map(r => r.referenceId);

  return {
    assetId,
    assetName,
    assetType,
    relations,
    parentAssetId: parentRel?.referenceId,
    childAssetIds: childRelIds,
  };
}

// ── Convenience builders ───────────────────────────────────────────────────────

/**
 * productRelation — builds a relation linking an asset to a product.
 */
export function productRelation(
  productId:    string,
  productLabel?: string,
  linkedBy?:    string,
): TypedAssetRelation {
  return { type: "product", referenceId: productId, label: productLabel, linkedBy, linkedAt: new Date().toISOString() };
}

/**
 * campaignRelation — builds a relation linking an asset to a campaign.
 */
export function campaignRelation(
  campaignId:    string,
  campaignLabel?: string,
  linkedBy?:     string,
): TypedAssetRelation {
  return { type: "campaign", referenceId: campaignId, label: campaignLabel, linkedBy, linkedAt: new Date().toISOString() };
}

/**
 * agentRelation — links an asset to the Agentik agent that produced it.
 * agentId: "luca" | "mila" | "diego" | "sofi" | "foto-estudio-wizard"
 */
export function agentRelation(
  agentId:    string,
  agentLabel?: string,
): TypedAssetRelation {
  return { type: "agent", referenceId: agentId, label: agentLabel, linkedAt: new Date().toISOString() };
}

/**
 * parentAssetRelation — marks this asset as a derivative of a master asset.
 */
export function parentAssetRelation(
  parentId:  string,
  linkedBy?: string,
): TypedAssetRelation {
  return { type: "parent_asset", referenceId: parentId, linkedBy, linkedAt: new Date().toISOString() };
}

/**
 * shopifyRelation — links an asset to a Shopify product ID.
 */
export function shopifyRelation(
  shopifyProductId: string,
  productTitle?:    string,
): TypedAssetRelation {
  return { type: "shopify_product", referenceId: shopifyProductId, label: productTitle, linkedAt: new Date().toISOString() };
}

/**
 * batchJobRelation — links an asset to the BatchGenerationJob it came from.
 */
export function batchJobRelation(
  batchJobId: string,
  batchName?: string,
): TypedAssetRelation {
  return { type: "batch_job", referenceId: batchJobId, label: batchName, linkedAt: new Date().toISOString() };
}
