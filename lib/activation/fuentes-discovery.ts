/**
 * lib/activation/fuentes-discovery.ts
 *
 * Sprint TA-04 — Phase D: FUENTES Discovery Utility.
 *
 * Queries the SAG FUENTES table and builds a normalised fuentesMap
 * suitable for storage in connector.config.fuentesMap (TA-03 contract).
 *
 * This utility is CRITICAL for multi-company SAG support:
 *   - Each PYA company has its own FUENTES registry with different kaNiFuente codes.
 *   - Without discovery, comprobanteCode derivation falls back to Castillitos rules
 *     (wrong for any other company).
 *
 * Contract:
 *   discoverFuentesMap(config) → FuentesDiscoveryResult
 *
 * Rules:
 *   - NEVER writes to DB.
 *   - Only calls SELECT on FUENTES table — no writes.
 *   - Returns typed rows + ready-to-store fuentesMap.
 *   - Tolerates partial FUENTES schemas (missing optional columns).
 *   - Safe to call from onboarding scripts or admin APIs.
 *
 * Usage:
 *   const result = await discoverFuentesMap({ token, database, endpointUrl });
 *   if (result.ok) {
 *     // Store result.fuentesMap in connector.config.fuentesMap
 *   }
 *
 * Powers (future):
 *   - Onboarding wizard FUENTES step
 *   - ERP diagnostics panel
 *   - Reconciliation logic validation
 *   - Financial normalisation audits
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { FuenteRow, FuentesDiscoveryResult } from "./types";

// ── SAG FUENTES query ─────────────────────────────────────────────────────────
//
// Confirmed column names from SAG PYA (2026-04-11):
//   ka_ni_fuente       — integer PK
//   k_sc_codigo_fuente — short code string ("FE", "R1", "PD", etc.)
//   sc_descripcion     — human label (may be absent in some installations)
//   sc_cobrar_pagar    — 'C' (AR) | 'P' (AP) — from FUENTES JOIN
//   k_n_clase_fuente   — 4 = customer order (PD), else invoice/payment
//
// We SELECT all rows without TOP — FUENTES is a small metadata table
// (typically 20–100 rows per company). No pagination needed.
//
// Fallback: if SELECT * fails (NullReferenceException on some SAG versions
// when FUENTES has nullable columns), retry with explicit column list.

const FUENTES_QUERY_FULL =
  "SELECT ka_ni_fuente, k_sc_codigo_fuente, sc_descripcion, sc_cobrar_pagar, k_n_clase_fuente FROM FUENTES ORDER BY ka_ni_fuente";

const FUENTES_QUERY_MINIMAL =
  "SELECT ka_ni_fuente, k_sc_codigo_fuente, sc_cobrar_pagar FROM FUENTES ORDER BY ka_ni_fuente";

// ── Public entry point ────────────────────────────────────────────────────────

export interface FuentesDiscoveryConfig {
  token:        string;
  database?:    string;
  endpointUrl?: string;
}

/**
 * Queries the SAG FUENTES table and returns a fully typed discovery result.
 *
 * @param config — SAG PYA connection credentials (token, database, endpointUrl).
 */
export async function discoverFuentesMap(
  config: FuentesDiscoveryConfig,
): Promise<FuentesDiscoveryResult> {
  const warnings: string[] = [];
  const errors:   string[] = [];

  const DEFAULT_ENDPOINT =
    process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "https://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  const pyaConfig = {
    token:       config.token,
    database:    config.database,
    endpointUrl: config.endpointUrl ?? DEFAULT_ENDPOINT,
  };

  // ── Query FUENTES (full schema first, minimal fallback) ───────────────────
  let rawRows: Array<Record<string, unknown>> = [];
  let usedFallback = false;

  try {
    rawRows = (await consultaSagJson(pyaConfig, FUENTES_QUERY_FULL)) as Array<Record<string, unknown>>;
  } catch (e) {
    const msg = (e as Error).message;
    warnings.push(`Full FUENTES query failed (${msg}), retrying with minimal columns`);

    try {
      rawRows = (await consultaSagJson(pyaConfig, FUENTES_QUERY_MINIMAL)) as Array<Record<string, unknown>>;
      usedFallback = true;
    } catch (e2) {
      const msg2 = (e2 as Error).message;
      errors.push(`FUENTES query failed: ${msg2}`);
      return emptyResult(errors, warnings);
    }
  }

  if (usedFallback) {
    warnings.push("Used minimal FUENTES query — sc_descripcion and k_n_clase_fuente may be absent");
  }

  if (rawRows.length === 0) {
    warnings.push("FUENTES table returned 0 rows — company may use a non-standard FUENTES schema");
    return emptyResult(errors, warnings);
  }

  // ── Normalise rows ────────────────────────────────────────────────────────
  const rows: FuenteRow[] = [];
  const fuentesMap: Record<number, string> = {};

  for (const r of rawRows) {
    const kaNiFuente = extractInt(r, "ka_ni_fuente");
    const codigoRaw  = extractStr(r, "k_sc_codigo_fuente");

    if (kaNiFuente === null || !codigoRaw) {
      warnings.push(`Skipping FUENTES row with missing ka_ni_fuente or k_sc_codigo_fuente: ${JSON.stringify(r)}`);
      continue;
    }

    const codigoFuente = codigoRaw.trim().toUpperCase();
    const descripcion  = extractStr(r, "sc_descripcion") ?? undefined;
    const cobrarPagar  = extractStr(r, "sc_cobrar_pagar") ?? undefined;
    const claseRaw     = extractInt(r, "k_n_clase_fuente");
    const claseFuente  = claseRaw !== null ? claseRaw : undefined;

    rows.push({ kaNiFuente, codigoFuente, descripcion, cobrarPagar, claseFuente });
    fuentesMap[kaNiFuente] = codigoFuente;
  }

  if (rows.length === 0) {
    errors.push("No valid FUENTES rows found after normalisation — check ka_ni_fuente and k_sc_codigo_fuente columns");
    return emptyResult(errors, warnings);
  }

  // ── Build summary ─────────────────────────────────────────────────────────
  const arCodes    = rows.filter(r => r.cobrarPagar === "C").map(r => r.codigoFuente);
  const apCodes    = rows.filter(r => r.cobrarPagar === "P").map(r => r.codigoFuente);
  const orderCodes = rows.filter(r => r.claseFuente === 4).map(r => r.codigoFuente);

  // Warn if AR codes are suspiciously few (may indicate missing data)
  if (arCodes.length === 0) {
    warnings.push("No AR codes found (sc_cobrar_pagar='C') — comprobanteCode channel derivation will default to OTRO for all movements");
  }

  // Warn if no PD/order codes found
  if (orderCodes.length === 0 && rows.some(r => r.codigoFuente === "PD")) {
    warnings.push("PD code present but k_n_clase_fuente=4 not detected — order filtering may not work");
  }

  return {
    ok: true,
    rows,
    fuentesMap,
    warnings,
    errors,
    summary: {
      total:      rows.length,
      arCodes,
      apCodes,
      orderCodes,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractInt(row: Record<string, unknown>, key: string): number | null {
  const v = row[key] ?? row[key.toUpperCase()] ?? row[key.toLowerCase()];
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return isFinite(n) ? n : null;
}

function extractStr(row: Record<string, unknown>, key: string): string | null {
  const v = row[key] ?? row[key.toUpperCase()] ?? row[key.toLowerCase()];
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function emptyResult(
  errors: string[],
  warnings: string[],
): FuentesDiscoveryResult {
  return {
    ok:         false,
    rows:       [],
    fuentesMap: {},
    warnings,
    errors,
    summary:    { total: 0, arCodes: [], apCodes: [], orderCodes: [] },
  };
}
