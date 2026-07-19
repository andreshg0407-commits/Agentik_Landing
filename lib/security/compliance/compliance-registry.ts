/**
 * lib/security/compliance/compliance-registry.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance & Governance — Control Registry
 *
 * Centralized registry of all compliance controls.
 * Controls are registered once and looked up by ID.
 *
 * No server-only. No Prisma. Pure domain registry.
 */

import type { ComplianceControl, ComplianceFramework, ComplianceSeverity } from "./compliance-types";

// ── ComplianceRegistry ────────────────────────────────────────────────────────

/**
 * ComplianceRegistry — in-memory registry of all compliance controls.
 * Thread-safe for concurrent reads (no mutations after boot).
 */
export class ComplianceRegistry {
  private readonly _controls = new Map<string, ComplianceControl>();

  /**
   * Register a control. Idempotent — re-registering with same ID overwrites.
   * Never throws — fails silently on invalid input.
   */
  registerControl(control: ComplianceControl): void {
    try {
      if (!control?.id) return;
      this._controls.set(control.id, control);
    } catch {
      // never throw — fail closed
    }
  }

  /**
   * Get a control by ID. Returns undefined if not found.
   * Never throws.
   */
  getControl(id: string): ComplianceControl | undefined {
    try {
      return this._controls.get(id);
    } catch {
      return undefined;
    }
  }

  /**
   * List all registered controls. Optionally filter by framework.
   * Never throws — returns [] on error.
   */
  listControls(options?: {
    framework?: ComplianceFramework;
    enabled?:   boolean;
  }): ComplianceControl[] {
    try {
      let controls = Array.from(this._controls.values());
      if (options?.framework !== undefined) {
        controls = controls.filter(c => c.frameworks.includes(options.framework!));
      }
      if (options?.enabled !== undefined) {
        controls = controls.filter(c => c.enabled === options.enabled);
      }
      return controls;
    } catch {
      return [];
    }
  }

  /**
   * Resolve a control — returns the control or throws a typed error.
   * Use getControl() when you want null-safe lookup.
   * Use resolveControl() when a missing control is a programming error.
   */
  resolveControl(id: string): ComplianceControl {
    const control = this._controls.get(id);
    if (!control) throw new Error(`ComplianceRegistry: control "${id}" not registered`);
    return control;
  }

  /** Count of registered controls. */
  size(): number {
    return this._controls.size;
  }

  /** IDs of all registered controls. */
  ids(): string[] {
    return Array.from(this._controls.keys());
  }

  /** Controls with a given violation severity. */
  getBySeverity(severity: ComplianceSeverity): ComplianceControl[] {
    try {
      return Array.from(this._controls.values())
        .filter(c => c.violationSeverity === severity);
    } catch {
      return [];
    }
  }

  /** All enabled controls required for a given framework. */
  getRequiredForFramework(framework: ComplianceFramework): ComplianceControl[] {
    try {
      return Array.from(this._controls.values())
        .filter(c => c.enabled && c.frameworks.includes(framework));
    } catch {
      return [];
    }
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

/**
 * complianceRegistry — the global compliance control registry.
 * Populated by control-catalog.ts on import.
 */
export const complianceRegistry = new ComplianceRegistry();

// ── Convenience functions ──────────────────────────────────────────────────────

/** Register a control in the global registry. */
export function registerControl(control: ComplianceControl): void {
  complianceRegistry.registerControl(control);
}

/** Get a control by ID from the global registry. */
export function getControl(id: string): ComplianceControl | undefined {
  return complianceRegistry.getControl(id);
}

/** List controls from the global registry. */
export function listControls(options?: {
  framework?: ComplianceFramework;
  enabled?:   boolean;
}): ComplianceControl[] {
  return complianceRegistry.listControls(options);
}

/** Resolve a control (throws if missing). */
export function resolveControl(id: string): ComplianceControl {
  return complianceRegistry.resolveControl(id);
}
