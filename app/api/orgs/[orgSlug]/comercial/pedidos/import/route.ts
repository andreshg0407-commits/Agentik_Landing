/**
 * POST /api/orgs/[orgSlug]/comercial/pedidos/import
 *
 * SAG → Agentik order import endpoint.
 * Actions: import_single, import_batch, fetch_pending
 *
 * Sprint: COMERCIAL-PEDIDOS-HIBRIDO-SAG-AGENTIK
 */

import { NextRequest, NextResponse } from "next/server";
import {
  importSagOrder,
  importSagOrderBatch,
  fetchPendingSagOrders,
  normalizeSagOrderCandidate,
} from "@/lib/comercial/pedidos/sag-order-import-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;

  try {
    const body = await request.json();
    const action = body.action as string;

    switch (action) {
      case "import_single": {
        const candidate = normalizeSagOrderCandidate(body.order);
        if (!candidate) {
          return NextResponse.json(
            { error: "Datos de pedido SAG invalidos." },
            { status: 400 },
          );
        }
        const result = await importSagOrder(orgSlug, candidate);
        return NextResponse.json(result);
      }

      case "import_batch": {
        const orders = (body.orders ?? []) as unknown[];
        const candidates = orders
          .map(o => normalizeSagOrderCandidate(o))
          .filter((c): c is NonNullable<typeof c> => c !== null);

        if (candidates.length === 0) {
          return NextResponse.json(
            { error: "No se encontraron pedidos validos para importar." },
            { status: 400 },
          );
        }

        const results = await importSagOrderBatch(orgSlug, candidates);
        return NextResponse.json({
          total:    candidates.length,
          created:  results.filter(r => r.action === "created").length,
          merged:   results.filter(r => r.action === "merged").length,
          skipped:  results.filter(r => r.action === "skipped").length,
          results,
        });
      }

      case "fetch_pending": {
        const pending = await fetchPendingSagOrders(orgSlug);
        return NextResponse.json({ pending, count: pending.length });
      }

      default:
        return NextResponse.json(
          { error: `Accion no reconocida: ${action}` },
          { status: 400 },
        );
    }
  } catch {
    return NextResponse.json(
      { error: "Error interno al procesar importacion." },
      { status: 500 },
    );
  }
}
