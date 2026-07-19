"use client";

/**
 * hooks/use-operational-inventory.ts
 *
 * The single hook Comercial uses for all inventory access.
 *
 * ─── V1 → V2 MIGRATION ───────────────────────────────────────────────────────
 * V1: Derives inventory synchronously from MaletasOperationalContext.
 *     Used when no orgSlug is provided (fallback path).
 *
 * V2: Fetches from /api/orgs/[orgSlug]/comercial/operational-inventory.
 *     Reads CommercialCoverageSnapshot directly + applies Agentik reservations.
 *     This is the correct path — context.items (case assignments) may be empty
 *     even when the coverage snapshot has real inventory data.
 *     Activated when orgSlug is passed as second argument.
 *
 * ─── WHY V2 IS NECESSARY ─────────────────────────────────────────────────────
 * The V1 path derives inventory from context.items (CommercialCaseItem rows).
 * CommercialCaseItem represents vendor assignments — a separate concept from
 * CommercialCoverageSnapshot (inventory availability). When no case assignments
 * exist, context.items = [] and the search returns nothing, even when the org
 * has real inventory data in CommercialCoverageSnapshot.
 *
 * V2 reads CommercialCoverageSnapshot directly — the correct, primary source.
 *
 * Sprint: AGENTIK-SALES-PORTFOLIO-REFERENCE-SOURCE-01
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import type { MaletasOperationalContext }             from "@/lib/comercial/maletas/maletas-types";
import { deriveSagInventoryFromContext }              from "@/lib/comercial/maletas/sag-inventory-adapter";
import { mapSagInventoryToOperational }               from "@/lib/operational-inventory/sag-to-operational-mapper";
import type {
  OperationalInventoryItem,
  OperationalInventorySource,
}                                                     from "@/lib/operational-inventory/operational-inventory-types";

// ─── Result interface ─────────────────────────────────────────────────────────

export interface UseOperationalInventoryResult {
  /** All inventory items in Agentik's operational format */
  inventory:   OperationalInventoryItem[];
  /** True while API fetch is in flight */
  loading:     boolean;
  /** Error message if fetch failed */
  error:       string | null;
  /** Data provenance */
  source:      OperationalInventorySource;
  /** ISO timestamp of the coverage snapshot used, if available */
  snapshotAt:  string | null;
  /** Whether the org has any coverage snapshot at all */
  hasSnapshot: boolean;
  /** Trigger a refresh */
  refresh:     () => Promise<void>;
}

// ─── API response shape ───────────────────────────────────────────────────────

interface OperationalInventoryApiResponse {
  ok:          boolean;
  items:       OperationalInventoryItem[];
  snapshotAt:  string | null;
  refCount:    number;
  hasSnapshot: boolean;
  error?:      string;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Provides operational inventory for the Sales Portfolio module.
 *
 * @param context  MaletasOperationalContext from the page server component (V1 fallback).
 * @param orgSlug  When provided, activates V2 API fetch path (recommended).
 */
export function useOperationalInventory(
  context: MaletasOperationalContext | null,
  orgSlug?: string,
): UseOperationalInventoryResult {
  // V1 path: synchronous derivation from context (fallback / optimistic initial data)
  const contextInventory = useMemo((): OperationalInventoryItem[] => {
    if (!context) return [];
    const sagItems = deriveSagInventoryFromContext(context);
    return mapSagInventoryToOperational(sagItems, "sag_excel_import");
  }, [context]);

  // V2 path: API fetch state
  const [apiItems,     setApiItems]     = useState<OperationalInventoryItem[] | null>(null);
  const [snapshotAt,   setSnapshotAt]   = useState<string | null>(null);
  const [hasSnapshot,  setHasSnapshot]  = useState<boolean>(false);
  const [loading,      setLoading]      = useState<boolean>(false);
  const [error,        setError]        = useState<string | null>(null);

  const fetchInventory = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/orgs/${orgSlug}/comercial/operational-inventory`);
      const json = await res.json() as OperationalInventoryApiResponse;
      if (json.ok) {
        setApiItems(json.items);
        setSnapshotAt(json.snapshotAt);
        setHasSnapshot(json.hasSnapshot);
      } else {
        setError(json.error ?? "Error cargando inventario operacional");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  // Fetch on mount when orgSlug is available
  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  // Inventory: V2 API result when available, fall back to V1 context derivation
  const inventory = apiItems ?? contextInventory;
  const source: OperationalInventorySource =
    inventory.length > 0 ? "sag_excel_import" : "mock";

  return {
    inventory,
    loading,
    error,
    source,
    snapshotAt:  snapshotAt,
    hasSnapshot: hasSnapshot || inventory.length > 0,
    refresh:     fetchInventory,
  };
}
