/**
 * domains/commercial-domain-registry.ts
 *
 * Functional implementation of the domain registry.
 * Enforces unique entity ownership across domains.
 */

import type { CommercialDomainDescriptor } from "./commercial-domain-descriptors";

// ── Domain Registry Interface ───────────────────────────────────────────────

export interface CommercialDomainRegistry {
  register(descriptor: CommercialDomainDescriptor): DomainRegistryResult;
  get(domainId: string): CommercialDomainDescriptor | null;
  list(): CommercialDomainDescriptor[];
  listActive(): CommercialDomainDescriptor[];
  has(domainId: string): boolean;
  validateOwnership(entityType: string): OwnershipValidation;
  resolveOwner(entityType: string): string | null;
}

// ── Result Types ────────────────────────────────────────────────────────────

export interface DomainRegistryResult {
  readonly ok: boolean;
  readonly error?: string;
}

export interface OwnershipValidation {
  readonly valid: boolean;
  readonly owner: string | null;
  readonly duplicates: string[];
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createCommercialDomainRegistry(): CommercialDomainRegistry {
  const domains = new Map<string, CommercialDomainDescriptor>();
  const entityOwnership = new Map<string, string>();

  return {
    register(descriptor) {
      if (domains.has(descriptor.id)) {
        return { ok: false, error: `Domain ${descriptor.id} already registered` };
      }

      // Check for ownership conflicts
      for (const entityType of descriptor.entityTypes) {
        const existingOwner = entityOwnership.get(entityType);
        if (existingOwner && existingOwner !== descriptor.id) {
          return {
            ok: false,
            error: `Entity ${entityType} already owned by ${existingOwner}, cannot assign to ${descriptor.id}`,
          };
        }
      }

      // Register domain and claim ownership
      domains.set(descriptor.id, descriptor);
      for (const entityType of descriptor.entityTypes) {
        entityOwnership.set(entityType, descriptor.id);
      }

      return { ok: true };
    },

    get(domainId) {
      return domains.get(domainId) ?? null;
    },

    list() {
      return Array.from(domains.values());
    },

    listActive() {
      return Array.from(domains.values()).filter(d => d.active);
    },

    has(domainId) {
      return domains.has(domainId);
    },

    validateOwnership(entityType) {
      const owner = entityOwnership.get(entityType) ?? null;
      const duplicates: string[] = [];

      // Check if multiple domains claim this entity
      for (const [id, descriptor] of domains.entries()) {
        if (descriptor.entityTypes.includes(entityType) && id !== owner) {
          duplicates.push(id);
        }
      }

      return {
        valid: owner !== null && duplicates.length === 0,
        owner,
        duplicates,
      };
    },

    resolveOwner(entityType) {
      return entityOwnership.get(entityType) ?? null;
    },
  };
}
