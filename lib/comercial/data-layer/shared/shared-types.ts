/**
 * shared/shared-types.ts
 *
 * Cross-cutting types used by all layers of the Commercial Data Layer.
 */

// ── Tenant Context ──────────────────────────────────────────────────────────

export interface TenantContext {
  readonly tenantId: string;
  readonly orgSlug: string;
}

// ── Organization Context ────────────────────────────────────────────────────

export interface OrganizationContext extends TenantContext {
  readonly orgName: string;
  readonly timezone: string;
  readonly locale: string;
}

// ── External System Reference ───────────────────────────────────────────────

export interface ExternalSystemReference {
  readonly systemType: string;
  readonly instanceId: string;
  readonly connectionId: string;
}

// ── ERP Identity ────────────────────────────────────────────────────────────

export interface ERPIdentity {
  readonly type: string;
  readonly version: string;
  readonly instanceId: string;
  readonly tenantId: string;
}

// ── Canonical ID ────────────────────────────────────────────────────────────

export interface CanonicalId {
  readonly value: string;
  readonly domain: string;
  readonly tenantId: string;
}

// ── Version Info ────────────────────────────────────────────────────────────

export interface VersionInfo {
  readonly current: number;
  readonly previous: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ── Audit Metadata ──────────────────────────────────────────────────────────

export interface AuditMetadata {
  readonly operationId: string;
  readonly performedBy: string;
  readonly performedAt: Date;
  readonly reason?: string;
}

// ── Correlation ID ──────────────────────────────────────────────────────────

export interface CorrelationId {
  readonly value: string;
  readonly parentId?: string;
  readonly rootId: string;
}

// ── Execution Context ───────────────────────────────────────────────────────

export interface ExecutionContext {
  readonly correlationId: CorrelationId;
  readonly tenant: TenantContext;
  readonly startedAt: Date;
  readonly timeout: number;
}
