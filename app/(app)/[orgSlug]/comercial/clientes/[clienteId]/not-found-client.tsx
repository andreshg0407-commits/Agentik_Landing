"use client";

/**
 * not-found-client.tsx
 *
 * CLIENTES-360-01 — Not found state for invalid clienteId.
 */

import { C, T, S, R, E } from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { EmptyOperationalState } from "@/components/shell/operational-primitives";

export function NotFoundClient({ orgSlug }: { orgSlug: string }) {
  return (
    <div style={{ padding: S[6], maxWidth: 1200 }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Comercial", href: `/${orgSlug}/comercial/maletas` },
          { label: "Clientes", href: `/${orgSlug}/comercial/clientes` },
          { label: "No encontrado" },
        ]}
        title="Cliente no encontrado"
        status="warning"
        statusLabel="No existe"
      />
      <EmptyOperationalState
        message="El cliente solicitado no existe o no pertenece a esta organizacion"
        detail="Verifique el ID del cliente o regrese al directorio."
        action={{
          label: "Volver a Clientes",
          href: `/${orgSlug}/comercial/clientes`,
        }}
      />
    </div>
  );
}
