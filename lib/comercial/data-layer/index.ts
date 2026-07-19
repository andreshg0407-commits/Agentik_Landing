/**
 * lib/comercial/data-layer/index.ts
 *
 * Top-level barrel export for the Commercial Data Layer foundation.
 *
 * Dependency rules:
 *   adapters → contracts → shared
 *   repositories → contracts → shared
 *   synchronization → contracts → shared
 *   quality → (standalone)
 *   snapshots → contracts
 *   events → contracts
 *   semantic → (standalone)
 *   testing → adapters + contracts
 *
 * NEVER import from:
 *   - UI (React, components)
 *   - Prisma (direct DB access)
 *   - SAG/ERP (specific implementations)
 *   - Rules Engine (business logic)
 *   - Copilot (AI layer)
 */

// Foundation contracts
export * from "./contracts";

// Adapter contract
export * from "./adapters";

// Repository contract
export * from "./repositories";

// Synchronization pipeline
export * from "./synchronization";

// Data quality
export * from "./quality";

// Snapshots
export * from "./snapshots";

// Domain events
export * from "./events";

// Shared types
export * from "./shared";

// Semantic layer
export * from "./semantic";

// Domain registry
export * from "./domains";
