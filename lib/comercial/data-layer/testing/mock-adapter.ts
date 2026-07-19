/**
 * testing/mock-adapter.ts
 *
 * Testing utilities for the Commercial Data Layer.
 * Provides mock implementations for unit testing domain adapters.
 */

import type { CommercialAdapter, DiscoveryResult, ValidationResult, NormalizationResult, AdapterHealthReport, AdapterCapabilities } from "../adapters";
import type { SynchronizationContext, SynchronizationResult, QualityAssessment } from "../contracts";

// ── Mock Adapter ────────────────────────────────────────────────────────────

export function createMockAdapter<TInput, TOutput>(
  overrides?: Partial<CommercialAdapter<TInput, TOutput>>
): CommercialAdapter<TInput, TOutput> {
  return {
    id: "mock-adapter",
    version: "0.0.0-test",
    domain: "MOCK",
    discover: async () => createMockDiscovery(),
    validate: async () => createMockValidation(),
    normalize: async () => createMockNormalization<TOutput>(),
    synchronize: async () => createMockSyncResult(),
    health: async () => createMockHealth(),
    capabilities: () => createMockCapabilities(),
    ...overrides,
  };
}

// ── Mock Factories ──────────────────────────────────────────────────────────

export function createMockDiscovery(overrides?: Partial<DiscoveryResult>): DiscoveryResult {
  return {
    totalRecords: 100,
    newRecords: 5,
    modifiedRecords: 10,
    deletedRecords: 0,
    discoveredAt: new Date(),
    ...overrides,
  };
}

export function createMockValidation(overrides?: Partial<ValidationResult>): ValidationResult {
  return {
    valid: true,
    issues: [],
    validatedAt: new Date(),
    ...overrides,
  };
}

export function createMockNormalization<T>(overrides?: Partial<NormalizationResult<T>>): NormalizationResult<T> {
  return {
    normalized: null,
    quality: createMockQuality(),
    skipped: false,
    ...overrides,
  };
}

export function createMockSyncResult(overrides?: Partial<SynchronizationResult>): SynchronizationResult {
  return {
    correlationId: "mock-correlation-id",
    status: "SUCCESS",
    stats: {
      discovered: 100,
      extracted: 100,
      normalized: 95,
      validated: 90,
      persisted: 90,
      rejected: 5,
      unchanged: 5,
    },
    completedAt: new Date(),
    durationMs: 1500,
    errors: [],
    ...overrides,
  };
}

export function createMockHealth(overrides?: Partial<AdapterHealthReport>): AdapterHealthReport {
  return {
    status: "HEALTHY",
    lastSuccessfulSync: new Date(),
    lastError: null,
    latencyMs: 200,
    checkedAt: new Date(),
    ...overrides,
  };
}

export function createMockCapabilities(overrides?: Partial<AdapterCapabilities>): AdapterCapabilities {
  return {
    supportsIncremental: true,
    supportsWebhook: false,
    supportsDiscovery: true,
    supportsBulk: true,
    maxBatchSize: 500,
    estimatedLatencyMs: 300,
    ...overrides,
  };
}

export function createMockQuality(overrides?: Partial<QualityAssessment>): QualityAssessment {
  return {
    level: "HIGH",
    dimensions: {
      completeness: 0.95,
      consistency: 0.98,
      freshness: 0.90,
      validity: 0.99,
      confidence: 0.92,
    },
    issues: [],
    assessedAt: new Date(),
    assessorId: "mock-assessor",
    ...overrides,
  };
}

// ── Mock Context Factory ────────────────────────────────────────────────────

export function createMockSyncContext(overrides?: Partial<SynchronizationContext>): SynchronizationContext {
  return {
    tenantId: "test-tenant",
    domain: "PRODUCT",
    sourceSystem: "SAG_PYA",
    mode: "FULL",
    correlationId: "mock-" + Date.now().toString(36),
    startedAt: new Date(),
    lastSyncAt: null,
    ...overrides,
  };
}
