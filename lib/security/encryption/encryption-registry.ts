/**
 * lib/security/encryption/encryption-registry.ts
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * Encryption Foundation — Encryptable Asset Registry
 *
 * Central catalog of all asset types that can be encrypted by the
 * Agentik Encryption Layer. Each entry drives policy enforcement,
 * health checks, and migration planning.
 *
 * To add a new protectable asset:
 *   1. Add an entry here with requiresEncryption = true/false
 *   2. Build an adapter in the appropriate domain (memory, playbooks, etc.)
 *   3. Update AGENTIK-SECURITY-ENCRYPTION-01 migration planner
 *
 * No Prisma. No server-only. Pure domain data.
 */

import type { EncryptionClassification } from "./encryption-types";

// ── Registry Entry ────────────────────────────────────────────────────────────

/**
 * EncryptionRegistryEntry — describes one asset type and its encryption policy.
 */
export interface EncryptionRegistryEntry {
  /** Stable, unique identifier for this asset type. */
  id:                  string;
  /** Human-readable name. */
  name:                string;
  /** Description of the data this asset type contains. */
  description:         string;
  /** Sensitivity classification. */
  classification:      EncryptionClassification;
  /** Whether this asset type must be encrypted before storage. */
  requiresEncryption:  boolean;
  /** Domain that owns this asset type. */
  owner:               string;
  /** The adapter path that handles encryption for this asset. */
  adapterPath?:        string;
  /** Whether an encryption adapter has been implemented for this asset. */
  adapterReady:        boolean;
  /**
   * Notes on migration state.
   * Tracks how far along the encryption adoption is for this asset.
   */
  migrationNotes:      string;
}

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * ENCRYPTION_REGISTRY — the canonical list of encryptable asset types.
 */
export const ENCRYPTION_REGISTRY: ReadonlyArray<EncryptionRegistryEntry> = [
  // ── Copilot Memory ─────────────────────────────────────────────────────────
  {
    id:                 "COPILOT_MEMORY",
    name:               "Copilot Memory",
    description:        "Strategic and operational business memory stored by the Copilot Memory Engine. Contains business insights, priorities, and operational history.",
    classification:     "CONFIDENTIAL",
    requiresEncryption: true,
    owner:              "copilot",
    adapterPath:        "lib/copilot/memory/security/memory-encryption-adapter.ts",
    adapterReady:       true,
    migrationNotes:     "Adapter created. Data migration deferred to AGENTIK-SECURITY-ENCRYPTION-02.",
  },

  // ── Playbook ───────────────────────────────────────────────────────────────
  {
    id:                 "PLAYBOOK",
    name:               "Playbook",
    description:        "Structured operational knowledge including procedures, escalation rules, and business logic. May contain sensitive business intelligence.",
    classification:     "CONFIDENTIAL",
    requiresEncryption: true,
    owner:              "copilot",
    adapterPath:        "lib/copilot/playbooks/security/playbook-encryption-adapter.ts",
    adapterReady:       true,
    migrationNotes:     "Adapter created. Data migration deferred to AGENTIK-SECURITY-ENCRYPTION-02.",
  },

  // ── Executive Context ──────────────────────────────────────────────────────
  {
    id:                 "EXECUTIVE_CONTEXT",
    name:               "Executive Context",
    description:        "Contextual snapshots built for executive decision-making. Includes financial summaries, operational signals, and strategic priorities.",
    classification:     "CONFIDENTIAL",
    requiresEncryption: true,
    owner:              "copilot",
    adapterPath:        "lib/copilot/executive-brain/security/executive-encryption-adapter.ts",
    adapterReady:       true,
    migrationNotes:     "Adapter created. Data migration deferred to AGENTIK-SECURITY-ENCRYPTION-02.",
  },

  // ── Financial Record ───────────────────────────────────────────────────────
  {
    id:                 "FINANCIAL_RECORD",
    name:               "Financial Record",
    description:        "Individual financial data points — transactions, reconciliation results, cash positions, payment records. Contains sensitive monetary data.",
    classification:     "CONFIDENTIAL",
    requiresEncryption: true,
    owner:              "finance",
    adapterPath:        undefined,
    adapterReady:       false,
    migrationNotes:     "Adapter pending — AGENTIK-SECURITY-FINANCE-ENCRYPTION-01.",
  },

  // ── Customer Record ────────────────────────────────────────────────────────
  {
    id:                 "CUSTOMER_RECORD",
    name:               "Customer Record",
    description:        "Customer personal data, contact information, purchase history, and communication preferences.",
    classification:     "CONFIDENTIAL",
    requiresEncryption: true,
    owner:              "commercial",
    adapterPath:        undefined,
    adapterReady:       false,
    migrationNotes:     "Adapter pending — AGENTIK-SECURITY-CUSTOMER-ENCRYPTION-01.",
  },

  // ── Employee Record ────────────────────────────────────────────────────────
  {
    id:                 "EMPLOYEE_RECORD",
    name:               "Employee Record",
    description:        "Employee personal data, salary, roles, and employment history. Classified RESTRICTED due to regulatory requirements.",
    classification:     "RESTRICTED",
    requiresEncryption: true,
    owner:              "operations",
    adapterPath:        undefined,
    adapterReady:       false,
    migrationNotes:     "Adapter pending — AGENTIK-SECURITY-HR-ENCRYPTION-01.",
  },

  // ── Agent Configuration ────────────────────────────────────────────────────
  {
    id:                 "AGENT_CONFIGURATION",
    name:               "Agent Configuration",
    description:        "Agent behavioral configuration, capability settings, tenant preferences, and policy overrides.",
    classification:     "CONFIDENTIAL",
    requiresEncryption: true,
    owner:              "agentik",
    adapterPath:        undefined,
    adapterReady:       false,
    migrationNotes:     "Adapter pending — AGENTIK-SECURITY-AGENT-ENCRYPTION-01.",
  },
] as const;

// ── Lookup Helpers ────────────────────────────────────────────────────────────

/** Find a registry entry by its id. Returns undefined if not found. */
export function getEncryptionRegistryEntry(id: string): EncryptionRegistryEntry | undefined {
  return ENCRYPTION_REGISTRY.find(e => e.id === id);
}

/** Get all entries that require encryption. */
export function getRequiredEncryptionEntries(): EncryptionRegistryEntry[] {
  return ENCRYPTION_REGISTRY.filter(e => e.requiresEncryption);
}

/** Get all entries with a ready adapter. */
export function getAdapterReadyEntries(): EncryptionRegistryEntry[] {
  return ENCRYPTION_REGISTRY.filter(e => e.adapterReady);
}

/** Get all entries with a pending adapter. */
export function getPendingAdapterEntries(): EncryptionRegistryEntry[] {
  return ENCRYPTION_REGISTRY.filter(e => e.requiresEncryption && !e.adapterReady);
}

/** Get all entries owned by a given domain. */
export function getEntriesByOwner(owner: string): EncryptionRegistryEntry[] {
  return ENCRYPTION_REGISTRY.filter(e => e.owner === owner);
}

/** Summary of registry state. */
export function getEncryptionRegistrySummary(): {
  total:          number;
  requireEncrypt: number;
  adapterReady:   number;
  adapterPending: number;
} {
  const req     = getRequiredEncryptionEntries();
  const ready   = getAdapterReadyEntries();
  const pending = getPendingAdapterEntries();
  return {
    total:          ENCRYPTION_REGISTRY.length,
    requireEncrypt: req.length,
    adapterReady:   ready.length,
    adapterPending: pending.length,
  };
}
