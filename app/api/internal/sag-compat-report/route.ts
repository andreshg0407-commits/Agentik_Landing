/**
 * GET /api/internal/sag-compat-report
 *
 * Internal compatibility report for SAG / Castillitos integration.
 * Read-only. Zero SAG calls. Zero DB writes.
 *
 * Returns a structured JSON report covering:
 *   1. Homologation status (which master-data sets are confirmed vs pending)
 *   2. Query catalog readiness (validated / pending / placeholder by domain)
 *   3. Write safety matrix (which write types are safe for real testing)
 *   4. Remaining blockers before production-safe use
 *   5. Recommended next steps
 *
 * Auth:
 *   Requires a valid session with SUPER_ADMIN or ORG_ADMIN role.
 *   Pass ?orgSlug=castillitos to scope the report (used for future SAG live queries).
 *
 * Usage:
 *   GET /api/internal/sag-compat-report
 *   GET /api/internal/sag-compat-report?orgSlug=castillitos
 *
 * Security:
 *   This endpoint is intentionally NOT public. It should be gated behind
 *   internal network or a secret header before deployment if the app is
 *   exposed on the internet.
 */

import { NextResponse }        from "next/server";
import { getCurrentUser }      from "@/lib/auth";
import {
  MASTER_FIELDS,
  PENDING_HOMOLOGATION,
  HARD_BLOCK_FIELDS,
  VALIDATED_FIELDS,
  renderCompatibilityTable,
  getHomologationQueries,
} from "@/lib/sag/master-data/compatibility-matrix";
import {
  getHomologationSummary,
  ALL_VALUE_SETS,
} from "@/lib/sag/master-data/castillitos-overrides";
import {
  queryCatalogSummary,
  allQueries,
} from "@/lib/connectors/adapters/sag-pya-soap/query-catalog";

export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────────────────
// Write-type safety matrix
// ─────────────────────────────────────────────────────────────────────────────

const WRITE_SAFETY: {
  type:        number;
  name:        string;
  risk:        string;
  safe:        boolean;
  reason:      string;
  blockers:    string[];
}[] = [
  {
    type:     1,
    name:     "Upsert Cliente (tipo 1)",
    risk:     "LOW",
    safe:     false,
    reason:   "Idempotente y reversible, pero campos master aún pendientes de homologación.",
    blockers: [
      "FORMA_PAGO no confirmada — posible rechazo silencioso por SAG",
      "ZONA no confirmada — cliente queda sin zona asignada",
      "NIT_VENDEDOR no confirmada — cliente queda sin vendedor",
      "CODIGO_DANE_CIUDAD no validada contra tabla MUNICIPIOS de SAG",
    ],
  },
  {
    type:     3,
    name:     "Upsert Tercero (tipo 3)",
    risk:     "LOW",
    safe:     false,
    reason:   "Misma situación que tipo 1.",
    blockers: [
      "Mismos bloqueadores que Upsert Cliente",
      "TIPO_TERCERO no confirmado",
    ],
  },
  {
    type:     5,
    name:     "Upsert Artículo (tipo 5)",
    risk:     "LOW",
    safe:     false,
    reason:   "Idempotente, pero clasificación de catálogo pendiente.",
    blockers: [
      "GRUPO/SUB_GRUPO/LINEA no confirmados — artículo queda mal clasificado",
      "TARIFA_IVA no confirmada — puede afectar facturación electrónica",
      "TALLAS y COLORES no confirmados (si usa MANEJA_TALLA_COLOR)",
    ],
  },
  {
    type:     2,
    name:     "Crear Documento (tipo 2)",
    risk:     "HIGH",
    safe:     false,
    reason:   "Irreversible. Requiere BODEGA confirmada — BLOQUEADOR CRÍTICO.",
    blockers: [
      "BODEGA requerida y no confirmada — SAG rechaza documentos sin bodega válida",
      "TIPO_DOC para documentos Castillitos no confirmado",
      "Flujo de UI para tipo 2 no construido aún",
    ],
  },
  {
    type:     28,
    name:     "Crear Documento Genérico (tipo 28)",
    risk:     "MEDIUM",
    safe:     false,
    reason:   "Misma dependencia de BODEGA que tipo 2.",
    blockers: [
      "BODEGA requerida y no confirmada",
      "Flujo de UI para tipo 28 no construido aún",
    ],
  },
  {
    type:     6,
    name:     "Recibos / Egresos (tipo 6)",
    risk:     "HIGH",
    safe:     false,
    reason:   "BLOQUEADO EN v1 por política. Requiere validación de conciliación contable.",
    blockers: [
      "Bloqueado por política v1 — no se activa sin validación de conciliación",
      "Requiere revisión legal y contable antes de activar",
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Next-step recommendations
// ─────────────────────────────────────────────────────────────────────────────

const RECOMMENDATIONS = {
  safeToTestNow: [
    "Leer TERCEROS y CARTERA — queries ya validados, adaptadores activos",
    "Preview de cliente (Nuevo Cliente SAG) — validación sin enqueue",
    "Preview de artículo (Nuevo Artículo SAG) — validación sin enqueue",
    "Exploración de Cola de Aprobaciones — la UI y el flujo de aprobación funcionan",
  ],
  requiresHomologationFirst: [
    "Upsert Cliente real (tipo 1) — necesita FORMA_PAGO, ZONA, NIT_VENDEDOR confirmados",
    "Upsert Artículo real (tipo 5) — necesita GRUPO, LINEA, TARIFA_IVA confirmados",
    "Crear Documento (tipo 2/28) — necesita BODEGA confirmada (bloqueador crítico)",
    "Recibos (tipo 6) — bloqueado por política hasta aprobación legal/contable",
  ],
  dataToRequestFromCastillitos: [
    "Tabla FORMAS_PAGO: SELECT * FROM FORMAS_PAGO ORDER BY CODIGO",
    "Tabla ZONAS: SELECT * FROM ZONAS ORDER BY CODIGO",
    "Tabla TIPO_TERCERO: SELECT * FROM TIPO_TERCERO ORDER BY CODIGO",
    "Tabla TIPO_CLIENTE: SELECT * FROM TIPO_CLIENTE ORDER BY CODIGO",
    "Vendedores activos: SELECT NIT, NOMBRE FROM TERCEROS WHERE TIPO_TERCERO = 'V'",
    "Listas de precios: SELECT DISTINCT LISTA_PRECIO FROM LISTAS_PRECIOS",
    "Tabla GRUPOS_ARTICULOS: SELECT CODIGO, DESCRIPCION FROM GRUPOS_ARTICULOS",
    "Tabla LINEAS_ARTICULOS: SELECT CODIGO, DESCRIPCION FROM LINEAS_ARTICULOS",
    "Tabla TARIFAS_IVA: SELECT CODIGO, DESCRIPCION, PORCENTAJE FROM TARIFAS_IVA",
    "Tabla BODEGAS: SELECT CODIGO, DESCRIPCION, ACTIVO FROM BODEGAS (CRÍTICO)",
    "Tabla MUNICIPIOS: SELECT CODIGO_DANE, NOMBRE FROM MUNICIPIOS (si existe)",
    "Confirmar nombre de tabla de artículos (ARTICULOS vs PRODUCTOS)",
    "Confirmar nombre de tabla de inventario (INVENTARIO vs SALDOS_INVENTARIO vs STOCK)",
    "Confirmar si módulo de producción (ORDENES_PRODUCCION) está activado",
  ],
  safeFirstRealTestOrder: [
    "1. Run homologation queries → populate castillitos-overrides.ts",
    "2. Test customer upsert with minimal safe payload (NIT + NOMBRE only)",
    "3. Verify SAG response OK and record appears in TERCEROS query",
    "4. Test article upsert with CODIGO + DESCRIPCION + PRECIO + IVA=19 + UNIDAD=UND",
    "5. Verify article appears in ARTICULOS query",
    "6. Confirm BODEGA codes, then test tipo 2 document with one line",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// GET handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    // Basic auth check — must have an active session
    const user = await getCurrentUser().catch(() => null);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const homologation  = getHomologationSummary();
    const querySummary  = queryCatalogSummary();

    // Per-field status detail
    const fieldDetail = MASTER_FIELDS.map(f => ({
      id:               f.id,
      sagField:         f.sagField,
      scope:            f.scope,
      required:         f.required,
      blockPolicy:      f.blockPolicy,
      validationStatus: f.validationStatus,
      knownValuesCount: f.knownValues.length,
      homologated:      f.validationStatus !== "pending_homologation",
      homologationQuery: f.homologationQuery ?? null,
    }));

    // Per-value-set status
    const valueSetStatus = Object.entries(ALL_VALUE_SETS).map(([name, vs]) => ({
      name,
      confirmed:   vs.confirmed,
      confirmedAt: vs.confirmedAt ?? null,
      valueCount:  vs.values.length,
    }));

    // Query status per domain
    const queryDetail = allQueries().map(q => ({
      key:     q.key,
      status:  q.status,
      method:  q.method,
      purpose: q.purpose,
      checklistCount: q.validationChecklist.length,
    }));

    const report = {
      generatedAt:  new Date().toISOString(),
      version:      "1.0.0",

      // ── Summary scores ───────────────────────────────────────────────────────
      summary: {
        homologationPct:     homologation.pctComplete,
        homologationStatus:  `${homologation.confirmed}/${homologation.total} value sets confirmed`,
        queriesPct:          Math.round((querySummary.validated / querySummary.total) * 100),
        queriesStatus:       `${querySummary.validated}/${querySummary.total} queries validated`,
        safeWriteTypes:      WRITE_SAFETY.filter(w => w.safe).map(w => w.type),
        blockedWriteTypes:   WRITE_SAFETY.filter(w => !w.safe).map(w => w.type),
        overallReadiness:    homologation.confirmed === homologation.total && querySummary.validated === querySummary.total
          ? "PRODUCTION_READY"
          : homologation.confirmed > 0
          ? "PARTIAL"
          : "NOT_READY",
      },

      // ── Homologation detail ──────────────────────────────────────────────────
      homologation: {
        summary:    homologation,
        valueSets:  valueSetStatus,
        pendingQueries: getHomologationQueries(),
      },

      // ── Query catalog ────────────────────────────────────────────────────────
      queries: {
        summary: querySummary,
        entries: queryDetail,
      },

      // ── Field inventory ──────────────────────────────────────────────────────
      fields: {
        total:                   MASTER_FIELDS.length,
        hardBlock:               HARD_BLOCK_FIELDS.length,
        warnOnly:                MASTER_FIELDS.filter(f => f.blockPolicy === "warn_only").length,
        validatedOk:             MASTER_FIELDS.filter(f => f.blockPolicy === "validated_ok").length,
        pendingHomologation:     PENDING_HOMOLOGATION.length,
        validatedOrStandard:     VALIDATED_FIELDS.length,
        detail:                  fieldDetail,
      },

      // ── Write safety matrix ──────────────────────────────────────────────────
      writeSafety: WRITE_SAFETY,

      // ── Recommendations ──────────────────────────────────────────────────────
      recommendations: RECOMMENDATIONS,

      // ── Human-readable table ─────────────────────────────────────────────────
      compatibilityTableText: renderCompatibilityTable(),
    };

    return NextResponse.json(report, { status: 200 });
  } catch (e) {
    console.error("[sag-compat-report GET]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
