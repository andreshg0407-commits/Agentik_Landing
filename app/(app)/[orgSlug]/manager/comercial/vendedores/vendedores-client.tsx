/**
 * Vendedores Surface Client.
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 */
"use client";

import { useRouter } from "next/navigation";
import { C, T, S, R } from "@/lib/ui/tokens";
import type { ManagerVendedoresPA, ManagerSellerCard } from "@/lib/comercial/manager/manager-commercial-types";
import { ManagerSurfaceClient, type SurfaceListItem } from "../manager-surface-client";

function fmtCOP(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString("es-CO")}`;
}

const STATUS_COLORS: Record<string, string> = {
  activo:   "#16a34a",
  atencion: "#d97706",
  inactivo: "#9ca3af",
};

export function VendedoresSurfaceClient({ vendedoresPA }: { vendedoresPA: ManagerVendedoresPA }) {
  const router = useRouter();

  const sellerItems: SurfaceListItem[] = vendedoresPA.sellers.map(s => ({
    id:          s.sellerId,
    primary:     s.sellerName,
    secondary:   `${s.customerCount} clientes · ${s.crmQuoteCount} pedidos`,
    meta:        fmtCOP(s.totalCrmAmount),
    href:        s.href,
    statusColor: STATUS_COLORS[s.activityStatus] ?? "#9ca3af",
  }));

  return (
    <ManagerSurfaceClient
      title="Vendedores"
      facts={vendedoresPA.facts}
      attentionStatus={vendedoresPA.attentionStatus}
      listTitle="Equipo activo"
      listItems={sellerItems}
      onItemTap={(item) => {
        const seller = vendedoresPA.sellers.find(s => s.sellerId === item.id);
        if (seller?.href) router.push(seller.href);
      }}
      freshness={vendedoresPA.asOf}
    />
  );
}
