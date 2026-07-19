import { NextResponse } from "next/server";
import { syncPyaProducts } from "@/lib/sync/pya/sync-products";
import { syncPyaOrders } from "@/lib/sync/pya/sync-orders";

export async function GET() {
  try {
    const integrationId = "pya_castillitos_sandbox";
    const organizationId = "cmmpwstuf000dp5y58kj1daaj";

    const products = await syncPyaProducts({ integrationId, organizationId });
    const orders = await syncPyaOrders({ integrationId, organizationId });

    return NextResponse.json({
      success: true,
      products,
      orders,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}