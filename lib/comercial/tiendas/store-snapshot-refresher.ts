/**
 * lib/comercial/tiendas/store-snapshot-refresher.ts
 *
 * AGENTIK-STORES-TRUTH-AUDIT-01 — F3A.1: refetch posterior a escrituras.
 *
 * Fábrica PURA (sin React, sin fetch propio) de la única función de refresco
 * del StoreSnapshot en el cliente. Ley:
 *
 *   - single-flight: jamás dos lecturas concurrentes; un refresh() durante un
 *     vuelo marca UN refresco pendiente (coalescido) que corre al terminar —
 *     así una escritura solapada nunca se pierde ni duplica solicitudes;
 *   - las respuestas se aplican en serie y con guardia de secuencia: una
 *     respuesta vieja no puede sobrescribir una más nueva;
 *   - fallo ⇒ NO se aplica nada: el snapshot visible anterior se conserva
 *     (el loading es un indicador, nunca borra el estado);
 *   - el estado "refreshing" cubre todo el drenaje (incluido el pendiente).
 *
 * Certificación: __tests__/store-snapshot-refetch.test.ts
 */

export interface SnapshotRefresherDeps<S> {
  /** Lee el snapshot; null/throw = fallo (se conserva el visible). */
  readonly fetchSnapshot: () => Promise<S | null>;
  readonly onSnapshot: (snapshot: S) => void;
  readonly onRefreshingChange?: (refreshing: boolean) => void;
}

export interface SnapshotRefresher {
  /** Idempotente bajo concurrencia: segura de invocar tras CADA escritura exitosa. */
  readonly refresh: () => Promise<void>;
  readonly isInFlight: () => boolean;
}

export function createSnapshotRefresher<S>(deps: SnapshotRefresherDeps<S>): SnapshotRefresher {
  let inFlight = false;
  let pending = false;
  let seq = 0;

  async function refresh(): Promise<void> {
    if (inFlight) {
      pending = true;                       // coalescido: un solo refresco trailing
      return;
    }
    inFlight = true;
    deps.onRefreshingChange?.(true);
    try {
      do {
        pending = false;
        const mySeq = ++seq;
        let snapshot: S | null = null;
        try {
          snapshot = await deps.fetchSnapshot();
        } catch {
          snapshot = null;                  // fallo ⇒ conservar el snapshot visible
        }
        if (snapshot !== null && mySeq === seq) {
          deps.onSnapshot(snapshot);        // jamás una respuesta vieja sobre una nueva
        }
      } while (pending);
    } finally {
      inFlight = false;
      deps.onRefreshingChange?.(false);
    }
  }

  return { refresh, isInFlight: () => inFlight };
}
