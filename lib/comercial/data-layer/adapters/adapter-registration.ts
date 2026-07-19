/**
 * adapters/adapter-registration.ts
 *
 * Registration metadata for adapters in the Commercial Data Layer.
 */

import type { AdapterHealthStatus } from "./adapter-contract";

// ── Adapter Registration ────────────────────────────────────────────────────

export interface AdapterRegistration {
  readonly adapterId: string;
  readonly tenantId: string;
  readonly domain: string;
  readonly system: string;
  readonly version: string;
  readonly priority: number;
  readonly enabled: boolean;
  readonly capabilities: string[];
  readonly health: AdapterHealthStatus;
  readonly registeredAt: Date;
}

// ── Resolve Query ───────────────────────────────────────────────────────────

export interface CommercialAdapterResolveQuery {
  readonly tenantId: string;
  readonly capability: string;
  readonly system?: string;
  readonly adapterId?: string;
  readonly requireHealthy?: boolean;
  readonly minimumVersion?: string;
}

// ── Registry Errors ─────────────────────────────────────────────────────────

export type AdapterRegistryErrorCode =
  | "ADAPTER_NOT_FOUND"
  | "ADAPTER_DUPLICATE"
  | "TENANT_REQUIRED"
  | "CAPABILITY_NOT_SUPPORTED"
  | "ADAPTER_UNHEALTHY"
  | "ADAPTER_AMBIGUOUS";

export interface AdapterRegistryError {
  readonly code: AdapterRegistryErrorCode;
  readonly message: string;
  readonly adapterId?: string;
  readonly tenantId?: string;
}

// ── Registry Result ─────────────────────────────────────────────────────────

export type AdapterRegistryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AdapterRegistryError };
