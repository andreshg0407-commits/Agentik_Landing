/**
 * adapters/commercial-adapter-registry.ts
 *
 * Functional implementation of the adapter registry.
 * Resolves adapters by tenant, capability, and system.
 */

import type {
  AdapterRegistration,
  CommercialAdapterResolveQuery,
  AdapterRegistryResult,
  AdapterRegistryError,
} from "./adapter-registration";

// ── Commercial Adapter Registry ─────────────────────────────────────────────

export interface CommercialAdapterRegistry {
  register(registration: AdapterRegistration): AdapterRegistryResult<AdapterRegistration>;
  unregister(adapterId: string, tenantId: string): AdapterRegistryResult<void>;
  resolve(query: CommercialAdapterResolveQuery): AdapterRegistryResult<AdapterRegistration>;
  resolveAll(query: CommercialAdapterResolveQuery): AdapterRegistryResult<AdapterRegistration[]>;
  getById(adapterId: string, tenantId: string): AdapterRegistration | null;
  list(tenantId?: string): AdapterRegistration[];
  hasCapability(tenantId: string, capability: string): boolean;
  clearTenant(tenantId: string): number;
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createCommercialAdapterRegistry(): CommercialAdapterRegistry {
  const store = new Map<string, AdapterRegistration>();

  function key(adapterId: string, tenantId: string): string {
    return `${tenantId}::${adapterId}`;
  }

  function err(code: AdapterRegistryError["code"], message: string, extra?: Partial<AdapterRegistryError>): AdapterRegistryResult<never> {
    return { ok: false, error: { code, message, ...extra } };
  }

  function tenantEntries(tenantId: string): AdapterRegistration[] {
    const results: AdapterRegistration[] = [];
    for (const reg of store.values()) {
      if (reg.tenantId === tenantId) results.push(reg);
    }
    return results;
  }

  function compareAdapters(a: AdapterRegistration, b: AdapterRegistration): number {
    // Lower priority number = higher priority
    if (a.priority !== b.priority) return a.priority - b.priority;
    // Healthy > Degraded > Unhealthy > Unknown
    const healthOrder: Record<string, number> = { HEALTHY: 0, DEGRADED: 1, UNHEALTHY: 2, UNKNOWN: 3 };
    const ha = healthOrder[a.health] ?? 3;
    const hb = healthOrder[b.health] ?? 3;
    if (ha !== hb) return ha - hb;
    // Higher version wins
    if (a.version > b.version) return -1;
    if (a.version < b.version) return 1;
    return 0;
  }

  return {
    register(registration) {
      if (!registration.tenantId) {
        return err("TENANT_REQUIRED", "tenantId is required for adapter registration");
      }
      const k = key(registration.adapterId, registration.tenantId);
      if (store.has(k)) {
        return err("ADAPTER_DUPLICATE", `Adapter ${registration.adapterId} already registered for tenant ${registration.tenantId}`, {
          adapterId: registration.adapterId,
          tenantId: registration.tenantId,
        });
      }
      store.set(k, registration);
      return { ok: true, value: registration };
    },

    unregister(adapterId, tenantId) {
      if (!tenantId) {
        return err("TENANT_REQUIRED", "tenantId is required");
      }
      const k = key(adapterId, tenantId);
      if (!store.has(k)) {
        return err("ADAPTER_NOT_FOUND", `Adapter ${adapterId} not found for tenant ${tenantId}`, { adapterId, tenantId });
      }
      store.delete(k);
      return { ok: true, value: undefined };
    },

    resolve(query) {
      if (!query.tenantId) {
        return err("TENANT_REQUIRED", "tenantId is required in resolve query");
      }

      let candidates = tenantEntries(query.tenantId)
        .filter(r => r.enabled)
        .filter(r => r.capabilities.includes(query.capability));

      if (candidates.length === 0) {
        return err("CAPABILITY_NOT_SUPPORTED", `No adapter supports capability "${query.capability}" for tenant ${query.tenantId}`, { tenantId: query.tenantId });
      }

      if (query.system) {
        candidates = candidates.filter(r => r.system === query.system);
      }
      if (query.adapterId) {
        candidates = candidates.filter(r => r.adapterId === query.adapterId);
      }
      if (query.requireHealthy) {
        const healthy = candidates.filter(r => r.health === "HEALTHY");
        if (healthy.length === 0 && candidates.length > 0) {
          return err("ADAPTER_UNHEALTHY", `All adapters supporting "${query.capability}" are unhealthy for tenant ${query.tenantId}`, { tenantId: query.tenantId });
        }
        candidates = healthy;
      }
      if (query.minimumVersion) {
        candidates = candidates.filter(r => r.version >= query.minimumVersion!);
      }

      if (candidates.length === 0) {
        return err("ADAPTER_NOT_FOUND", `No adapter matched query for tenant ${query.tenantId}`, { tenantId: query.tenantId });
      }

      candidates.sort(compareAdapters);

      // Check ambiguity: top 2 have same priority+health+version
      if (candidates.length > 1 && compareAdapters(candidates[0], candidates[1]) === 0) {
        return err("ADAPTER_AMBIGUOUS", `Multiple adapters match with equal priority for tenant ${query.tenantId}`, { tenantId: query.tenantId });
      }

      return { ok: true, value: candidates[0] };
    },

    resolveAll(query) {
      if (!query.tenantId) {
        return err("TENANT_REQUIRED", "tenantId is required in resolve query");
      }

      let candidates = tenantEntries(query.tenantId)
        .filter(r => r.enabled)
        .filter(r => r.capabilities.includes(query.capability));

      if (query.system) {
        candidates = candidates.filter(r => r.system === query.system);
      }
      if (query.requireHealthy) {
        candidates = candidates.filter(r => r.health === "HEALTHY");
      }
      if (query.minimumVersion) {
        candidates = candidates.filter(r => r.version >= query.minimumVersion!);
      }

      candidates.sort(compareAdapters);
      return { ok: true, value: candidates };
    },

    getById(adapterId, tenantId) {
      return store.get(key(adapterId, tenantId)) ?? null;
    },

    list(tenantId?) {
      if (tenantId) return tenantEntries(tenantId);
      return Array.from(store.values());
    },

    hasCapability(tenantId, capability) {
      return tenantEntries(tenantId).some(r => r.enabled && r.capabilities.includes(capability));
    },

    clearTenant(tenantId) {
      let count = 0;
      for (const [k, reg] of store.entries()) {
        if (reg.tenantId === tenantId) {
          store.delete(k);
          count++;
        }
      }
      return count;
    },
  };
}
