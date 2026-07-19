/**
 * shared/external-reference-helpers.ts
 *
 * Helpers for building and comparing external references.
 */

import type { ExternalReference, ExternalSystem, ExternalSystemType } from "../contracts";

// ── Build External Reference ────────────────────────────────────────────────

export function buildExternalReference(params: {
  externalId: string;
  systemType: ExternalSystemType;
  instanceId: string;
  resource: string;
  label?: string;
  secondaryId?: string;
}): ExternalReference {
  const system: ExternalSystem = {
    type: params.systemType,
    instanceId: params.instanceId,
    label: params.label ?? params.systemType,
  };

  return {
    externalId: params.externalId,
    system,
    resource: params.resource,
    secondaryId: params.secondaryId,
  };
}

// ── Validate External Reference ─────────────────────────────────────────────

export interface ExternalReferenceValidation {
  readonly valid: boolean;
  readonly issues: string[];
}

export function validateExternalReference(ref: ExternalReference): ExternalReferenceValidation {
  const issues: string[] = [];

  if (!ref.externalId || ref.externalId.trim() === "") {
    issues.push("externalId is empty");
  }
  if (!ref.system) {
    issues.push("system is missing");
  } else {
    if (!ref.system.type) issues.push("system.type is missing");
    if (!ref.system.instanceId) issues.push("system.instanceId is missing");
  }
  if (!ref.resource || ref.resource.trim() === "") {
    issues.push("resource is empty");
  }

  return { valid: issues.length === 0, issues };
}

// ── Compare External References ─────────────────────────────────────────────

export function externalReferenceEquals(a: ExternalReference, b: ExternalReference): boolean {
  return (
    a.externalId === b.externalId &&
    a.system.type === b.system.type &&
    a.system.instanceId === b.system.instanceId &&
    a.resource === b.resource
  );
}
