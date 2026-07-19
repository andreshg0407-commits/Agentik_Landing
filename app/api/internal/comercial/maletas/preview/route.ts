/**
 * app/api/internal/comercial/maletas/preview/route.ts
 *
 * Internal preview endpoint for the Maletas operational engine.
 * Server-only. Protected by INTERNAL_API_SECRET.
 *
 * GET /api/internal/comercial/maletas/preview?orgId=castillitos
 *
 * Returns: MaletasOperationalContext JSON (fully computed, ready for Copilot/David).
 *
 * Auth: Authorization: Bearer {INTERNAL_API_SECRET}
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-ENGINE-01
 */

import { type NextRequest, NextResponse } from "next/server";
import { loadMaletasExcelData } from "@/lib/comercial/maletas/maletas-excel-bootstrap";
import {
  getVendorRegistry,
  getDerroteroRules,
  buildAvailabilityMap,
} from "@/lib/comercial/maletas/maletas-normalizer";
import { buildMaletasOperationalContext } from "@/lib/comercial/maletas/maletas-engine";
import type { MaletasEngineInput } from "@/lib/comercial/maletas/maletas-types";

export const runtime = "nodejs"; // required — xlsx reads filesystem

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ── Auth check ─────────────────────────────────────────────────────────────
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "INTERNAL_API_SECRET not configured" },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  if (token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Org context ────────────────────────────────────────────────────────────
  const orgId = req.nextUrl.searchParams.get("orgId") ?? "castillitos";

  // ── Load Excel data ────────────────────────────────────────────────────────
  const excelData = await loadMaletasExcelData();

  if (!excelData) {
    return NextResponse.json(
      {
        error: "Excel files not found. Set MALETAS_EXCEL_PATH and DISPONIBLE_EXCEL_PATH env vars.",
        hint: "For local preview: MALETAS_EXCEL_PATH=/path/to/MALETAS.xlsx DISPONIBLE_EXCEL_PATH=/path/to/DISPONIBLE\\ PARA\\ MALETAS.xlsx",
      },
      { status: 422 },
    );
  }

  // ── Build engine input ─────────────────────────────────────────────────────
  const salesReps = getVendorRegistry(orgId);
  const rules = getDerroteroRules();
  const availMap = buildAvailabilityMap(excelData.availability);

  const engineInput: MaletasEngineInput = {
    orgId,
    salesReps,
    ltRows: excelData.ltRows,
    csRows: excelData.csRows,
    availability: availMap,
    rules,
  };

  // ── Run engine ─────────────────────────────────────────────────────────────
  const context = buildMaletasOperationalContext(engineInput);

  // ── Return ─────────────────────────────────────────────────────────────────
  return NextResponse.json(context, {
    headers: {
      "Cache-Control": "no-store",
      "X-Org-Id": orgId,
      "X-Generated-At": context.generatedAt,
    },
  });
}
