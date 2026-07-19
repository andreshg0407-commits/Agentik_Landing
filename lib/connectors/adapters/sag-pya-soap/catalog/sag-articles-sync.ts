/**
 * lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-sync.ts
 *
 * Sync service: SAG ARTICULOS → ProductEntity (commercial only).
 *
 * Pattern: follows storage.ts (batch upsert, row-by-row fallback).
 * Identity: externalSource="sag" + externalId=CODIGO (idempotent upsert).
 * Filter: isCommercialArticle() from CATALOG_FILTER_DECISION.md §7 Rule R2.
 * Audit: creates ConnectorRun record for every sync execution.
 *
 * Sprint: SAG-CATALOG-FULL-SYNC-03
 */

import { prisma } from "@/lib/prisma";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import { fetchSagArticles } from "./sag-articles-client";
import { normalizeArticles } from "./sag-articles-normalizer";
import { isCommercialArticle } from "@/lib/comercial/catalog/is-commercial-article";
import { syncSagMasterLookups, resolveSubgroupName, resolveGroupName, resolveLineName } from "./sag-master-lookups-sync";
import type { SagLookupMaps } from "./sag-master-lookups-types";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import type {
  SagArticleSyncOptions,
  SagArticleSyncResult,
  SagArticleNormalized,
} from "./sag-articles-types";

const BATCH_SIZE = 200;

// ── Main sync function ──────────────────────────────────────────────────────

export async function syncSagArticlesToProductEntity(
  orgId: string,
  config: PyaApiConfig,
  options: SagArticleSyncOptions = {},
): Promise<SagArticleSyncResult> {
  const t0 = Date.now();
  const { dryRun = false, limit, activeOnly = false } = options;

  try {
    // 1. Fetch master lookups (for subgroup name resolution)
    let lookupMaps: SagLookupMaps | null = null;
    try {
      const { maps } = await syncSagMasterLookups(config);
      lookupMaps = maps;
    } catch (e) {
      console.error("[SAG-CATALOG] Master lookups failed (subgrupo names unavailable):", (e as Error).message);
    }

    // 2a. Fetch handling unit lookup from v_articulos view
    // IMPORT-SIZECLASS-FROM-SAG-01: sc_unidad lives in v_articulos, not ARTICULOS table.
    // Values: PEQUEÑO, MEDIANO, GRANDE (size classes) + UNIDAD, METROS, PESOS (non-size).
    let handlingUnitLookup = new Map<string, string>();
    try {
      const vRows = await consultaSagJson(config, "SELECT * FROM v_articulos");
      for (const r of vRows) {
        const code = String((r as any).k_sc_codigo_articulo ?? "").toUpperCase().trim();
        const unidad = String((r as any).sc_unidad ?? "").trim();
        if (code && unidad) handlingUnitLookup.set(code, unidad);
      }
      console.log(`[SAG-CATALOG] v_articulos loaded: ${handlingUnitLookup.size} codes with sc_unidad`);
    } catch (e) {
      console.error("[SAG-CATALOG] v_articulos fetch failed (handlingUnit unavailable):", (e as Error).message);
    }

    // 2b. Fetch from SAG ARTICULOS table
    const rawRows = await fetchSagArticles(config, { activeOnly });

    // 3. Normalize
    const { normalized, errors } = normalizeArticles(rawRows);

    const totalRows = rawRows.length;
    const invalidRows = errors.length;

    // 4. Apply commercial filter (CATALOG_FILTER_DECISION.md §7 Rule R2)
    const commercial = normalized.filter(isCommercialArticle);
    const excluded = normalized.length - commercial.length;

    if (commercial.length === 0) {
      return {
        status: "empty",
        totalRows,
        validRows: 0,
        invalidRows,
        excluded,
        created: 0,
        updated: 0,
        skipped: 0,
        durationMs: Date.now() - t0,
        dryRun,
        validationErrors: errors,
      };
    }

    // 5. Apply limit if specified
    const toProcess = limit ? commercial.slice(0, limit) : commercial;

    if (dryRun) {
      return {
        status: "dry_run",
        totalRows,
        validRows: toProcess.length,
        invalidRows,
        excluded,
        created: 0,
        updated: 0,
        skipped: 0,
        durationMs: Date.now() - t0,
        dryRun: true,
        validationErrors: errors,
      };
    }

    // 6. Upsert into ProductEntity
    const { created, updated, skipped } = await upsertArticles(orgId, toProcess, lookupMaps, handlingUnitLookup);

    const status = invalidRows > 0 && commercial.length > 0 ? "partial" : "success";

    return {
      status,
      totalRows,
      validRows: toProcess.length,
      invalidRows,
      excluded,
      created,
      updated,
      skipped,
      durationMs: Date.now() - t0,
      dryRun: false,
      validationErrors: errors,
    };
  } catch (e) {
    return {
      status: "error",
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      excluded: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      durationMs: Date.now() - t0,
      dryRun,
      validationErrors: [],
      error: (e as Error).message,
    };
  }
}

// ── Upsert logic ────────────────────────────────────────────────────────────

async function upsertArticles(
  orgId: string,
  articles: SagArticleNormalized[],
  lookupMaps: SagLookupMaps | null,
  handlingUnitLookup: Map<string, string>,
): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);

    for (const art of batch) {
      try {
        // Resolve lookups from SAG master data
        const grupoId = art.grupo ? parseInt(art.grupo, 10) || null : null;
        const grupoSag = grupoId != null && lookupMaps
          ? resolveGroupName(lookupMaps, String(grupoId))
          : null;
        const subgrupoId = art.subGrupo ? parseInt(art.subGrupo, 10) || null : null;
        const subgrupoSag = subgrupoId != null && lookupMaps
          ? resolveSubgroupName(lookupMaps, String(subgrupoId))
          : null;
        const lineaId = art.linea ? parseInt(art.linea, 10) || null : null;
        const lineaSag = lineaId != null && lookupMaps
          ? resolveLineName(lookupMaps, String(lineaId))
          : null;

        // Normalize handling unit from v_articulos.sc_unidad (IMPORT-SIZECLASS-FROM-SAG-01)
        const rawUnidad = handlingUnitLookup.get(art.codigo) ?? "";
        const handlingUnit = normalizeHandlingUnit(rawUnidad);

        // Parse SAG dates
        const lastModifiedSag = art.fechaModificacion ? new Date(art.fechaModificacion) : null;
        const createdAtSag = art.fechaCreacion ? new Date(art.fechaCreacion) : null;
        const lastPurchaseSag = art.ultimaCompra ? new Date(art.ultimaCompra) : null;
        const lastSaleSag = art.ultimaVenta ? new Date(art.ultimaVenta) : null;

        // Build the complete data payload
        const dataPayload = {
          name:             art.descripcion,
          sku:              art.codigo,
          category:         art.grupo || null,
          productLine:      art.linea || null,
          price:            art.precio || null,
          grupoId,
          grupoSag:         grupoSag || null,
          subgrupoId,
          subgrupoSag:      subgrupoSag || null,
          lineaId,
          lineaSag:         lineaSag || null,
          costo:            art.costo || null,
          manejaTallaColor: art.manejaTallaColor,
          lastModifiedSag,
          createdAtSag,
          lastPurchaseSag,
          lastSaleSag,
          barcode:          art.codigoBarras || null,
          description2:     art.descripcion2 || null,
          handlingUnit:     handlingUnit || null,
          description:      buildDescription(art),
          commercialStatus: art.activo && !art.bloqueado ? "active" : "discontinued",
          status:           "approved",
        };

        const existing = await (prisma as any).productEntity.findFirst({
          where: {
            organizationId: orgId,
            externalSource: "sag",
            externalId: art.codigo,
          },
          select: { id: true, name: true, price: true, category: true, productLine: true, subgrupoId: true, handlingUnit: true, grupoId: true, lineaId: true, costo: true, manejaTallaColor: true },
        });

        if (existing) {
          // Check if core fields changed (skip if nothing meaningful changed)
          const unchanged =
            existing.name === art.descripcion &&
            existing.price === (art.precio || null) &&
            existing.category === (art.grupo || null) &&
            existing.productLine === (art.linea || null) &&
            existing.subgrupoId === subgrupoId &&
            existing.handlingUnit === (handlingUnit || null) &&
            existing.grupoId === grupoId &&
            existing.lineaId === lineaId &&
            existing.costo === (art.costo || null) &&
            existing.manejaTallaColor === art.manejaTallaColor;

          if (unchanged) {
            skipped++;
            continue;
          }

          await (prisma as any).productEntity.update({
            where: { id: existing.id },
            data: dataPayload,
          });
          updated++;
        } else {
          await (prisma as any).productEntity.create({
            data: {
              organizationId:   orgId,
              ...dataPayload,
              currency:         "COP",
              externalSource:   "sag",
              externalId:       art.codigo,
            },
          });
          created++;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`[SAG-CATALOG] Failed to upsert article ${art.codigo}:`, (e as Error).message);
        // Count as skipped — don't abort the batch
        skipped++;
      }
    }
  }

  return { created, updated, skipped };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// ── Handling unit normalization (IMPORT-SIZECLASS-FROM-SAG-01) ────────────────
// Normalizes v_articulos.sc_unidad to canonical size class.
// Source: v_articulos view (not ARTICULOS table — sc_unidad_manejo does NOT exist).
// Values observed: PEQUEÑO, MEDIANO, GRANDE (size classes) + UNIDAD, METROS, PESOS (non-size).
// Non-size values (UNIDAD, METROS, PESOS, etc.) → null (no size classification).
// Handles accents (PEQUEÑO→PEQUENO), extra whitespace, case variations.

// Values that are units of measure, NOT size classes — return null for these.
const NON_SIZE_UNITS = new Set([
  "UNIDAD", "METROS", "PESOS", "TONELADAS", "HORAS",
  "KILOGRAMOS", "LITROS", "GALONES", "CAJAS",
]);

function normalizeHandlingUnit(raw: string): string | null {
  if (!raw) return null;
  const normalized = raw
    .toUpperCase()
    .trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/\s+/g, "_"); // collapse whitespace

  // Skip non-size units of measure
  if (NON_SIZE_UNITS.has(normalized)) return null;

  if (normalized === "PEQUENO" || normalized === "PEQ" || normalized === "SMALL" || normalized === "CHICO") return "PEQUENO";
  if (normalized === "MEDIANO" || normalized === "MED" || normalized === "MEDIUM") return "MEDIANO";
  if (normalized === "GRANDE" || normalized === "GDE" || normalized === "LARGE" || normalized === "GR") return "GRANDE";

  // Return raw value for diagnostics — will be classified as SIZECLASS_UNMAPPED downstream
  return raw.trim().toUpperCase();
}

function buildDescription(art: SagArticleNormalized): string {
  const parts: string[] = [];
  if (art.marca) parts.push(`Marca: ${art.marca}`);
  if (art.grupo) parts.push(`Grupo: ${art.grupo}`);
  if (art.subGrupo) parts.push(`SubGrupo: ${art.subGrupo}`);
  if (art.linea) parts.push(`Línea: ${art.linea}`);
  if (art.descripcion2) parts.push(`Desc2: ${art.descripcion2}`);
  if (art.unidad) parts.push(`Unidad: ${art.unidad}`);
  if (art.tarifaIva) parts.push(`IVA: ${art.tarifaIva}%`);
  if (art.costo) parts.push(`Costo: $${art.costo}`);
  if (art.manejaTallaColor) parts.push("Talla/Color: Sí");
  if (art.manejaKardex) parts.push("Kardex: Sí");
  if (art.manejaLote) parts.push("Lote: Sí");
  return parts.join(" | ") || null as unknown as string;
}
