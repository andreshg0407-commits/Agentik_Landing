# BUSINESS-KNOWLEDGE-GRAPH-01

## Business Knowledge Graph — Logical Business Intelligence Structure

**Estado:** Completo
**Fecha:** 2026-06-25
**TSC Baseline:** 160 (sin regresion)

---

## 1. Vision

Agentik necesita razonar sobre el negocio completo sin que los modulos se consulten entre si.

El Business Knowledge Graph es un grafo logico de entidades vivas y relaciones que permite:

- Descubrir que entidades estan relacionadas con cualquier entidad
- Analizar el impacto de un cambio en una entidad
- Construir contexto inteligente para David, Copilot e Informes
- Encontrar caminos entre entidades (Product → Portfolio → Vendor → Customer)
- Preparar consultas para Rule Engine, Action Engine y Data Warehouse

El grafo NO depende de Neo4j ni de ninguna base de datos de grafos.
Es un grafo logico construido sobre contratos puros.

---

## 2. Reglas Arquitectonicas

### BUSINESS KNOWLEDGE RULE
No se permite que un motor deduzca relaciones recorriendo modulos o tablas directamente.
Toda inferencia entre entidades se resuelve mediante BusinessEntityRelation o Business Knowledge Graph.

### BUSINESS ENTITY ISOLATION RULE
Ninguna Business Entity importa directamente otra Business Entity.
LiveVendor no importa LivePortfolio.
LiveProduct no importa LiveProductionOrder.
Las relaciones se resuelven por BusinessEntityRelation, Business Entity Engine, o Business Knowledge Graph.

---

## 3. Arquitectura

```
lib/business-knowledge/
  knowledge-types.ts        — Tipos base: KnowledgeRelationType, ImpactType, ConfidenceTier
  knowledge-node.ts         — KnowledgeNode: entidad en el grafo
  knowledge-edge.ts         — KnowledgeEdge: relacion entre nodos
  knowledge-query.ts        — KnowledgeQuery + query builders
  knowledge-path.ts         — KnowledgePath: caminos entre entidades
  knowledge-impact.ts       — KnowledgeImpact: analisis de impacto
  knowledge-context.ts      — KnowledgeContext: paquete de inteligencia para IA
  knowledge-resolver.ts     — IKnowledgeResolver: contrato de resolucion
  knowledge-graph.ts        — IKnowledgeGraph + InMemoryKnowledgeGraph
  knowledge-utils.ts        — Conversion, dedup, filtrado, normalizacion
  index.ts                  — Barrel export (client-safe)
```

---

## 4. Contratos

### 4.1 KnowledgeNode

Representacion ligera de una Business Entity en el grafo.

| Campo | Tipo |
|---|---|
| nodeId | string |
| organizationId | string |
| entityId | string |
| entityType | BusinessEntityType |
| label | string |
| description | string or null |
| health | HealthDimensionLevel |
| severity | BusinessEntitySeverity |
| active | boolean |
| tags | string[] |
| freshness | DataFreshnessLevel |
| metadata | Record |
| createdAt | string (ISO) |
| updatedAt | string (ISO) |

### 4.2 KnowledgeEdge

Relacion entre dos nodos con metadatos de confianza y temporalidad.

| Campo | Tipo |
|---|---|
| edgeId | string |
| organizationId | string |
| sourceNodeId | string |
| targetNodeId | string |
| sourceEntityId / targetEntityId | string |
| sourceEntityType / targetEntityType | BusinessEntityType |
| relationType | KnowledgeRelationType |
| direction | outgoing / incoming / both |
| weight | number (0-100) |
| confidence | number (0-100) |
| source | string |
| validFrom / validTo | string or null |
| metadata | Record |

### 4.3 KnowledgeRelationType

Extiende RelationType de Business Entities Core:

```
owns | assigned_to | contains | sold_by | ordered_by | stored_in |
produced_by | blocked_by | depends_on | affects | belongs_to |
supplies | consumes | transfers_to | unlocks | risks
```

### 4.4 KnowledgeQuery

Consulta estructurada con filtros opcionales:

- entityId, entityType, relationType, direction
- depth, maxResults, includeInactive, includeWeakRelations
- minConfidence, tags, organizationId

Query builders: `relatedToQuery()`, `dependenciesOfQuery()`, `affectedByQuery()`, `entitiesByTypeQuery()`, `subgraphQuery()`

### 4.5 KnowledgePath

Camino ordenado entre dos entidades.

| Campo | Tipo |
|---|---|
| pathId | string |
| nodes | KnowledgeNode[] |
| edges | KnowledgeEdge[] |
| length | number |
| confidence | number (0-100, product of edge confidences) |
| explanation | string |
| metadata | Record |

### 4.6 KnowledgeImpact

Analisis de impacto de una entidad sobre otras.

| Campo | Tipo |
|---|---|
| sourceEntityId | string |
| sourceEntityType | BusinessEntityType |
| sourceLabel | string |
| impactType | ImpactType (9 types) |
| severity | BusinessEntitySeverity |
| affectedEntities | AffectedEntity[] |
| affectedCounts | Record<string, number> |
| estimatedValue | number or null |
| confidence | number (0-100) |
| explanation | string |
| recommendedActions | ImpactAction[] (suggestedOnly: true) |
| metadata | Record |

### 4.7 KnowledgeContext

Paquete de inteligencia para consumo por David, Copilot e Informes.

| Campo | Tipo |
|---|---|
| entity | KnowledgeNode |
| relatedEntities | KnowledgeNode[] |
| importantRelations | KnowledgeEdge[] |
| paths | KnowledgePath[] |
| impacts | KnowledgeImpact[] |
| alerts | ContextAlert[] |
| recommendations | ContextRecommendation[] |
| facts | ContextFact[] |
| risks | string[] |
| opportunities | string[] |
| suggestedQuestions | string[] |
| freshness | DataFreshnessLevel |
| assembledAt | string (ISO) |

### 4.8 IKnowledgeResolver

Contrato para resolvers de dominio:

```typescript
interface IKnowledgeResolver {
  entityType: BusinessEntityType;
  name: string;
  resolve(organizationId: string): Promise<KnowledgeResolverResult>;
  resolveEntity(organizationId: string, entityId: string): Promise<KnowledgeResolverResult>;
}
```

Resolvers futuros: ProductKnowledgeResolver, VendorKnowledgeResolver, PortfolioKnowledgeResolver, StoreKnowledgeResolver, ProductionKnowledgeResolver, OrderKnowledgeResolver, CustomerKnowledgeResolver.

### 4.9 IKnowledgeGraph

API central del Knowledge Graph (16 metodos):

```typescript
interface IKnowledgeGraph {
  // Mutation
  addNode, addEdge, removeNode, removeEdge
  // Lookup
  getNode, getNodeByEntity, getEdge, getEdgesFrom, getEdgesTo, getNeighbors
  // Query
  query(q: KnowledgeQuery): KnowledgeQueryResult
  // Paths
  findPaths(from, to, maxDepth): KnowledgePath[]
  // Impact
  analyzeImpact(nodeId, depth): KnowledgeImpact
  // Context
  buildContext(nodeId): KnowledgeContext
  // Snapshot
  snapshot(organizationId): KnowledgeGraphSnapshot
  // Stats
  nodeCount(), edgeCount()
}
```

---

## 5. InMemoryKnowledgeGraph

Implementacion in-memory suficiente para validar contratos.

- Map<nodeId, KnowledgeNode> para nodos
- Map<edgeId, KnowledgeEdge> para edges
- Map<"entityId:entityType", nodeId> para indice de entidades
- DFS para findPaths
- BFS con profundidad para analyzeImpact
- Traversal con filtros para query()

---

## 6. Compatibilidad con Business Entities Core

| Contrato Core | Usado en Knowledge Graph |
|---|---|
| BusinessEntity | → entityToNode() |
| BusinessEntitySnapshot | → snapshotToNode() |
| BusinessEntityRelation | → relationToEdge() |
| RelationType | Extendido por KnowledgeRelationType |
| HealthDimensionLevel | En KnowledgeNode.health |
| BusinessEntitySeverity | En KnowledgeNode.severity, ImpactAction |
| DataFreshnessLevel | En KnowledgeNode.freshness |
| BusinessEntityType | En todos los nodos y edges |

---

## 7. Caso Castillitos: Referencia Agotada

```
LiveProduct (REF-001 agotada)
    ↓ contained_in
LivePortfolio (Maleta vendedor)
    ↓ assigned_to
LiveVendor (Carlos Leon)
    ↓ sold_by (reverse)
Order (Pedido P-1234)
    ↓ ordered_by
Customer (Distribuciones El Roble)
    ↓ produced_by (reverse lookup)
LiveProductionOrder (OP-5678)
    ↓ stored_in (reverse)
Store / Warehouse (Bodega Principal)
```

### Preguntas que el Knowledge Graph responde:

1. **Que vendedores se afectan?** → `relatedToQuery(productId)` → filter vendors
2. **Que maletas contienen la referencia?** → `getNeighbors(productNodeId)` → filter portfolios
3. **Que clientes tienen pedidos bloqueados?** → `findPaths(productNodeId, customerNodeId)`
4. **Que produccion existe?** → `getEdgesFrom(productNodeId)` → filter produced_by
5. **Que tiendas tienen inventario?** → `getNeighbors(productNodeId)` → filter stores
6. **Que acciones deberia sugerir David?** → `buildContext(productNodeId)` → recommendations

---

## 8. Relacion con Otros Motores

### Business Flow Engine
- WorkflowInstance.entityBinding se convierte en KnowledgeNode
- Stage transitions generan edges temporales
- WorkflowDefinition → nodo tipo "process" en el grafo

### Business Event Engine (futuro)
- Cada evento enriquecera el grafo con edges temporales
- stage.completed → nuevo edge entre stages
- order.created → edge entre vendor y customer

### Rule Engine (futuro)
- Las reglas consultaran el Knowledge Graph para condiciones complejas
- "Si el producto tiene mas de 3 dependencias bloqueadas → escalar"

### Action Engine (futuro)
- Las acciones se informaran por el impacto del Knowledge Graph
- "Notificar a todos los vendedores afectados por referencia agotada"

### Executive Intelligence Engine
- El Knowledge Graph alimenta el contexto ejecutivo
- Los agentes (David, Mila, Luca) consultan buildContext() para razonar

---

## 9. Data Warehouse Readiness

El Knowledge Graph podra ser alimentado por:

| Fuente | Mecanismo |
|---|---|
| PostgreSQL | IKnowledgeResolver implementations |
| BigQuery | Resolver with BigQuery client |
| Snowflake | Resolver with Snowflake connector |
| Fabric | Resolver with Fabric API |
| Databricks | Resolver with Databricks SQL |
| ClickHouse | Resolver with ClickHouse client |
| APIs externas | Resolver with HTTP client |
| SAG | Resolver that reads SAG tables |

El grafo no depende del origen. Los resolvers abstraen la fuente.

---

## 10. Archivos del Sprint

| Archivo | Proposito |
|---|---|
| `knowledge-types.ts` | KnowledgeRelationType (16 types), ImpactType (9), ConfidenceTier, direction, re-exports |
| `knowledge-node.ts` | KnowledgeNode (15 campos), buildNode(), nextNodeId() |
| `knowledge-edge.ts` | KnowledgeEdge (20 campos), buildEdge(), nextEdgeId() |
| `knowledge-query.ts` | KnowledgeQuery, KnowledgeQueryResult, 5 query builders |
| `knowledge-path.ts` | KnowledgePath (7 campos), buildPath(), computePathConfidence(), describePathSteps() |
| `knowledge-impact.ts` | KnowledgeImpact (12 campos), AffectedEntity, ImpactAction, builders |
| `knowledge-context.ts` | KnowledgeContext (13 campos), ContextAlert, ContextRecommendation, ContextFact |
| `knowledge-resolver.ts` | IKnowledgeResolver, IKnowledgeResolverRegistry (future resolver registry) |
| `knowledge-graph.ts` | IKnowledgeGraph (16 methods), InMemoryKnowledgeGraph, KnowledgeGraphSnapshot |
| `knowledge-utils.ts` | snapshotToNode(), entityToNode(), relationToEdge(), dedup, filtering, sorting |
| `index.ts` | Barrel export (client-safe) |

---

## 11. Roadmap

### Phase 2: Domain Resolvers
- [ ] VendorKnowledgeResolver (desde LiveVendor)
- [ ] ProductKnowledgeResolver (desde catalogo SAG)
- [ ] PortfolioKnowledgeResolver (desde maletas)
- [ ] OrderKnowledgeResolver (desde pedidos CRM)
- [ ] StoreKnowledgeResolver (desde tiendas)
- [ ] ProductionKnowledgeResolver (desde OPs SAG)

### Phase 3: Persistence
- [ ] Prisma models: KnowledgeNode, KnowledgeEdge
- [ ] PrismaKnowledgeGraph implementation of IKnowledgeGraph
- [ ] Graph snapshot storage and retrieval

### Phase 4: Intelligence Integration
- [ ] David queries Knowledge Graph for vendor context
- [ ] Copilot context builders use buildContext()
- [ ] Impact analysis in executive dashboard
- [ ] Intelligent reports with graph-based reasoning

### Phase 5: Event-Driven Graph
- [ ] Business Event Engine feeds graph with temporal edges
- [ ] Stage transitions create edges automatically
- [ ] Real-time graph updates on entity changes

### Phase 6: Data Warehouse
- [ ] BigQuery resolver for historical graph
- [ ] Graph-based KPI computation
- [ ] Cross-entity trend analysis
