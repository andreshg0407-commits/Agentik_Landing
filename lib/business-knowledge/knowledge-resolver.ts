/**
 * knowledge-resolver.ts
 *
 * BUSINESS-KNOWLEDGE-GRAPH-01
 * Resolver contracts for the Business Knowledge Graph.
 *
 * Resolvers populate the graph from domain-specific data sources.
 * Each entity type should have its own resolver that knows how
 * to build nodes and edges from its data.
 *
 * This sprint defines contracts only — implementations come in future sprints.
 *
 * No Prisma. No React. Pure domain types.
 */

import type { BusinessEntityType } from "./knowledge-types";
import type { KnowledgeNode } from "./knowledge-node";
import type { KnowledgeEdge } from "./knowledge-edge";

// -- Resolver Result -------------------------------------------------------

/** The output of a knowledge resolver. */
export interface KnowledgeResolverResult {
  /** Nodes created by this resolver. */
  nodes: KnowledgeNode[];
  /** Edges created by this resolver. */
  edges: KnowledgeEdge[];
  /** Warnings during resolution (non-blocking). */
  warnings: string[];
  /** ISO timestamp of resolution. */
  resolvedAt: string;
}

// -- Knowledge Resolver Contract -------------------------------------------

/**
 * Contract for a domain-specific knowledge resolver.
 *
 * Each entity domain (vendors, products, portfolios, stores, etc.)
 * implements this interface to contribute nodes and edges to the graph.
 *
 * Future resolvers:
 * - ProductKnowledgeResolver
 * - VendorKnowledgeResolver
 * - PortfolioKnowledgeResolver
 * - StoreKnowledgeResolver
 * - ProductionKnowledgeResolver
 * - OrderKnowledgeResolver
 * - CustomerKnowledgeResolver
 */
export interface IKnowledgeResolver {
  /** The entity type this resolver handles. */
  entityType: BusinessEntityType;

  /** Human-readable resolver name. */
  name: string;

  /**
   * Resolve all knowledge (nodes + edges) for an organization.
   * Returns nodes of the resolver's entity type and edges
   * connecting them to other known entities.
   */
  resolve(organizationId: string): Promise<KnowledgeResolverResult>;

  /**
   * Resolve knowledge for a single entity.
   * Returns the node and its outgoing edges.
   */
  resolveEntity(
    organizationId: string,
    entityId: string,
  ): Promise<KnowledgeResolverResult>;
}

// -- Resolver Registry Contract -------------------------------------------

/**
 * Central registry for knowledge resolvers.
 * The KnowledgeGraph implementation uses this to discover resolvers.
 */
export interface IKnowledgeResolverRegistry {
  /** Register a resolver. */
  register(resolver: IKnowledgeResolver): void;
  /** Get resolver for a specific entity type. */
  getResolver(entityType: BusinessEntityType): IKnowledgeResolver | null;
  /** List all registered entity types. */
  listRegisteredTypes(): BusinessEntityType[];
  /** Get all registered resolvers. */
  getAllResolvers(): IKnowledgeResolver[];
}
