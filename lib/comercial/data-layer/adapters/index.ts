/**
 * adapters/index.ts — Barrel export for adapter contracts and registry.
 */

export type {
  CommercialAdapter,
  DiscoveryResult,
  ValidationResult,
  ValidationIssue,
  NormalizationResult,
  AdapterHealthReport,
  AdapterHealthStatus,
  AdapterCapabilities,
} from "./adapter-contract";

export type {
  AdapterRegistration,
  CommercialAdapterResolveQuery,
  AdapterRegistryErrorCode,
  AdapterRegistryError,
  AdapterRegistryResult,
} from "./adapter-registration";

export type { CommercialAdapterRegistry } from "./commercial-adapter-registry";
export { createCommercialAdapterRegistry } from "./commercial-adapter-registry";
