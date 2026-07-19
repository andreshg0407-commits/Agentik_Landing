/**
 * ConnectorRegistry — maps source identifiers to adapter constructors.
 *
 * Adapters register themselves once at startup (e.g. in lib/connectors/adapters/index.ts).
 * The SyncEngine uses `registry.create()` to instantiate the correct adapter.
 *
 * This module exports a singleton `registry`. Do not instantiate ConnectorRegistry
 * directly in application code.
 *
 * Usage:
 *
 *   // Register (startup / adapter file):
 *   import { registry } from "@/lib/connectors/core/connector-registry";
 *   registry.register("shopify", ShopifyAdapter);
 *
 *   // Instantiate (SyncEngine / tests):
 *   const adapter = registry.create("shopify", orgId, config);
 */

import type { BaseAdapter, AdapterConstructor } from "./base-adapter";
import type { AdapterConfig } from "./types";

class ConnectorRegistry {
  private readonly adapters = new Map<string, AdapterConstructor>();

  /**
   * Register an adapter class for a source identifier.
   * Warns if the source is already registered (allows hot-reload override in dev).
   */
  register(source: string, ctor: AdapterConstructor): void {
    if (this.adapters.has(source)) {
      console.warn(
        `[ConnectorRegistry] Overwriting adapter for source "${source}". ` +
        `If this is unexpected, check that adapters are registered only once.`
      );
    }
    this.adapters.set(source, ctor);
  }

  /**
   * Instantiate an adapter for the given source.
   * Throws `Error` if no adapter is registered for the source.
   */
  create(source: string, orgId: string, config: AdapterConfig): BaseAdapter {
    const Ctor = this.adapters.get(source);
    if (!Ctor) {
      throw new Error(
        `[ConnectorRegistry] No adapter registered for source "${source}". ` +
        `Known sources: ${this.list().join(", ") || "(none registered yet)"}`
      );
    }
    return new Ctor(orgId, config);
  }

  /** Returns true if an adapter is registered for this source. */
  has(source: string): boolean {
    return this.adapters.has(source);
  }

  /** List all registered source identifiers. */
  list(): string[] {
    return [...this.adapters.keys()].sort();
  }

  /** Remove an adapter (useful in tests to reset state between runs). */
  unregister(source: string): void {
    this.adapters.delete(source);
  }

  /** Remove all registered adapters (full reset for tests). */
  clear(): void {
    this.adapters.clear();
  }
}

// Singleton — the single registry for the entire application.
export const registry = new ConnectorRegistry();

// Pre-declare the sources the platform plans to support.
// Actual registration happens in lib/connectors/adapters/index.ts.
export const KNOWN_SOURCES = [
  "sag_pya",
  "shopify",
  "hubspot",
  "csv",
  "google_sheets",
  "odoo",
  "siigo",
  "sap",
] as const;
