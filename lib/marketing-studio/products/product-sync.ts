/**
 * lib/marketing-studio/products/product-sync.ts
 *
 * MS-05C / MS-05F — Sync State Initialization & Propagation Engine
 *
 * Builds initial sync states for a new product and computes
 * propagation jobs when attributes change.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   - buildInitialSyncStates() — creates one SyncState per channel
 *   - computePropagationImpact() — maps changed fields → affected channels
 *   - createPropagationJobs() — generates typed PropagationJob records
 *
 * ── NO SIDE EFFECTS ───────────────────────────────────────────────────────────
 *   These functions return data structures only.
 *   Persistence is the repository's responsibility.
 */

import {
  SyncChannel,
  SyncStatus,
  type ProductEventType,
} from "./domain/product-enums";
import {
  ALL_SYNC_CHANNELS,
  INITIAL_SYNC_STATUS,
  DISABLED_SYNC_STATUS,
  PROPAGATION_PRIORITY_HIGH,
  PROPAGATION_PRIORITY_NORMAL,
  PROPAGATION_PRIORITY_LOW,
} from "./domain/product-constants";

// ── Sync state initialization ──────────────────────────────────────────────────

export interface SyncStateInit {
  channel: SyncChannel;
  status:  SyncStatus;
}

/**
 * buildInitialSyncStates — creates a SyncState record for each channel.
 * Enabled channels start as "pending"; all others as "not_configured".
 */
export function buildInitialSyncStates(enabledChannels: SyncChannel[]): SyncStateInit[] {
  const enabled = new Set(enabledChannels);
  return ALL_SYNC_CHANNELS.map(channel => ({
    channel,
    status: enabled.has(channel) ? INITIAL_SYNC_STATUS : DISABLED_SYNC_STATUS,
  }));
}

// ── Propagation impact mapping ─────────────────────────────────────────────────

/**
 * Fields → channels that must be re-synced when those fields change.
 * Priority is also encoded: high-priority fields trigger faster re-sync.
 */
const FIELD_CHANNEL_MAP: Record<string, { channels: SyncChannel[]; priority: number }> = {
  name:           { channels: [SyncChannel.SHOPIFY, SyncChannel.CATALOG, SyncChannel.CRM, SyncChannel.WHATSAPP, SyncChannel.ADS], priority: PROPAGATION_PRIORITY_HIGH },
  commercialName: { channels: [SyncChannel.SHOPIFY, SyncChannel.CATALOG, SyncChannel.CRM, SyncChannel.WHATSAPP, SyncChannel.ADS], priority: PROPAGATION_PRIORITY_HIGH },
  sku:            { channels: [SyncChannel.SHOPIFY, SyncChannel.CRM],                                                              priority: PROPAGATION_PRIORITY_HIGH },
  price:          { channels: [SyncChannel.SHOPIFY, SyncChannel.CRM, SyncChannel.WHATSAPP],                                       priority: PROPAGATION_PRIORITY_HIGH },
  category:       { channels: [SyncChannel.SHOPIFY, SyncChannel.CATALOG, SyncChannel.ADS],                                        priority: PROPAGATION_PRIORITY_NORMAL },
  description:    { channels: [SyncChannel.SHOPIFY, SyncChannel.CATALOG, SyncChannel.ADS, SyncChannel.LANDING],                   priority: PROPAGATION_PRIORITY_NORMAL },
  crmName:        { channels: [SyncChannel.CRM],                                                                                   priority: PROPAGATION_PRIORITY_NORMAL },
  productLine:    { channels: [SyncChannel.CRM, SyncChannel.CATALOG],                                                             priority: PROPAGATION_PRIORITY_NORMAL },
  salesArgument:  { channels: [SyncChannel.CRM, SyncChannel.WHATSAPP],                                                            priority: PROPAGATION_PRIORITY_NORMAL },
  availability:   { channels: [SyncChannel.SHOPIFY, SyncChannel.CRM, SyncChannel.WHATSAPP],                                       priority: PROPAGATION_PRIORITY_NORMAL },
  notes:          { channels: [SyncChannel.CRM],                                                                                   priority: PROPAGATION_PRIORITY_LOW },
  // Dynamic attribute keys
  color:          { channels: [SyncChannel.SHOPIFY, SyncChannel.CATALOG, SyncChannel.CRM],                                        priority: PROPAGATION_PRIORITY_NORMAL },
  size:           { channels: [SyncChannel.SHOPIFY, SyncChannel.CRM, SyncChannel.WHATSAPP],                                       priority: PROPAGATION_PRIORITY_NORMAL },
  material:       { channels: [SyncChannel.SHOPIFY, SyncChannel.CATALOG],                                                          priority: PROPAGATION_PRIORITY_LOW },
  volume:         { channels: [SyncChannel.SHOPIFY, SyncChannel.CATALOG, SyncChannel.WHATSAPP],                                   priority: PROPAGATION_PRIORITY_LOW },
  weight_g:       { channels: [SyncChannel.SHOPIFY, SyncChannel.CATALOG],                                                          priority: PROPAGATION_PRIORITY_LOW },
  dimensions:     { channels: [SyncChannel.SHOPIFY, SyncChannel.CATALOG],                                                          priority: PROPAGATION_PRIORITY_LOW },
};

export interface PropagationImpact {
  channel:  SyncChannel;
  priority: number;
}

/**
 * computePropagationImpact — maps changed field keys + active channels
 * to the set of channels that need re-sync, with their propagation priority.
 */
export function computePropagationImpact(
  changedFields:  string[],
  activeChannels: SyncChannel[],
): PropagationImpact[] {
  const activeSet = new Set(activeChannels);
  const result    = new Map<SyncChannel, number>();

  for (const field of changedFields) {
    const mapping = FIELD_CHANNEL_MAP[field];
    if (!mapping) continue;
    for (const ch of mapping.channels) {
      if (!activeSet.has(ch)) continue;
      const current = result.get(ch) ?? 10;
      // Lower number = higher priority; keep the most urgent
      if (mapping.priority < current) result.set(ch, mapping.priority);
    }
  }

  return [...result.entries()].map(([channel, priority]) => ({ channel, priority }));
}

/**
 * createPropagationJobs — builds PropagationJob inputs for changed fields.
 * These are persisted by createPropagationJobRecords() in the repository.
 */
export function createPropagationJobs(opts: {
  organizationId: string;
  productId:      string;
  triggerEvent:   ProductEventType;
  changedFields:  string[];
  activeChannels: SyncChannel[];
  payload?:       Record<string, unknown>;
}): Array<{
  eventType: ProductEventType;
  channel:   SyncChannel;
  priority:  number;
  payload:   Record<string, unknown>;
}> {
  const impacts = computePropagationImpact(opts.changedFields, opts.activeChannels);
  if (impacts.length === 0) return [];

  return impacts.map(({ channel, priority }) => ({
    eventType: opts.triggerEvent,
    channel,
    priority,
    payload: {
      ...(opts.payload ?? {}),
      changedFields: opts.changedFields,
      triggeredBy:   opts.triggerEvent,
    },
  }));
}

// ── Display helpers ────────────────────────────────────────────────────────────

export const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
  [SyncStatus.PENDING]:        "Pendiente",
  [SyncStatus.SYNCED]:         "Sincronizado",
  [SyncStatus.FAILED]:         "Falló",
  [SyncStatus.OUTDATED]:       "Desactualizado",
  [SyncStatus.NOT_CONFIGURED]: "No configurado",
};

export const SYNC_CHANNEL_LABELS: Record<SyncChannel, string> = {
  [SyncChannel.SHOPIFY]:  "Shopify",
  [SyncChannel.CRM]:      "CRM",
  [SyncChannel.WHATSAPP]: "WhatsApp",
  [SyncChannel.CATALOG]:  "Catálogo",
  [SyncChannel.ADS]:      "Ads",
  [SyncChannel.LANDING]:  "Landing",
};
