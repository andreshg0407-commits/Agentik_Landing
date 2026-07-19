/**
 * lib/integrations/connection-diagnostics.ts
 *
 * MARKETING-CONNECTIONS-HARDENING-01 — Phase 4: Operational Diagnostics
 *
 * Derives a per-provider operational health status from DB state.
 * No external API calls — pure DB reads. Safe for frequent polling.
 *
 * SERVER ONLY — never import in client components.
 *
 * SECURITY:
 * - Never exposes token values, secrets, or encrypted fields.
 * - organizationId always comes from server context.
 */

import "server-only";

import { prisma } from "@/lib/prisma";

// ── Diagnostic types ──────────────────────────────────────────────────────────

export type DiagnosticStatus =
  | "operativa"              // All connections healthy, tokens valid, resources discovered
  | "requiere_configuracion" // Connected but no resources selected yet
  | "requiere_atencion"      // One or more warnings (expiring tokens, partial health)
  | "reconexion_necesaria"   // Token expired / revoked, must reconnect
  | "error"                  // Critical failure
  | "no_conectada";          // No connection exists

export interface DiagnosticCheck {
  label:   string;
  passed:  boolean;
  detail?: string;
}

export interface ProviderDiagnostic {
  provider:       string;
  status:         DiagnosticStatus;
  checks:         DiagnosticCheck[];
  connectionIds:  string[];
  resourceCount:  number;
  selectedCount:  number;
  nextRenewalAt:  string | null;
  checkedAt:      string;
}

export interface OrgDiagnosticsResult {
  organizationId: string;
  providers:      ProviderDiagnostic[];
  overallHealthy: boolean;
  checkedAt:      string;
}

// ── Token expiry window ────────────────────────────────────────────────────────

const WARNING_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

function tokenExpiryStatus(expiresAt: Date | null): "ok" | "expiring_soon" | "expired" | "unknown" {
  if (!expiresAt) return "unknown";
  const remaining = expiresAt.getTime() - Date.now();
  if (remaining < 0)                    return "expired";
  if (remaining < WARNING_THRESHOLD_MS) return "expiring_soon";
  return "ok";
}

// ── Provider diagnostic ───────────────────────────────────────────────────────

async function diagnoseProvider(
  organizationId: string,
  provider:       string,
  providerKeys:   string[],
): Promise<ProviderDiagnostic> {
  const now = new Date().toISOString();

  const connections = await prisma.integrationConnection.findMany({
    where: {
      organizationId,
      provider: { in: providerKeys },
    },
    orderBy: { createdAt: "desc" },
  });

  const checks: DiagnosticCheck[] = [];

  // Check 1: Has connection
  const hasConnection = connections.length > 0;
  checks.push({ label: "Conexión registrada", passed: hasConnection, detail: hasConnection ? undefined : "No hay IntegrationConnection para este provider" });

  if (!hasConnection) {
    return {
      provider,
      status:        "no_conectada",
      checks,
      connectionIds: [],
      resourceCount: 0,
      selectedCount: 0,
      nextRenewalAt: null,
      checkedAt:     now,
    };
  }

  const connectedConns = connections.filter(c => c.status === "connected");
  const connectionIds  = connections.map(c => c.id);

  // Check 2: At least one connected
  checks.push({
    label:  "Al menos una conexión activa",
    passed: connectedConns.length > 0,
    detail: connectedConns.length === 0 ? "Todas las conexiones están desconectadas" : undefined,
  });

  // Check 3: Health status
  const criticalConns = connections.filter(c => c.health === "critical");
  const warningConns  = connections.filter(c => c.health === "warning");
  checks.push({
    label:  "Salud de conexiones",
    passed: criticalConns.length === 0,
    detail: criticalConns.length > 0
      ? `${criticalConns.length} conexión(es) en estado crítico`
      : warningConns.length > 0
        ? `${warningConns.length} conexión(es) con advertencias`
        : undefined,
  });

  // Check 4: Token expiry
  const accessSecrets = await prisma.integrationSecret.findMany({
    where: {
      organizationId,
      connectionId: { in: connectionIds },
      secretType:   "access_token",
      revokedAt:    null,
    },
    orderBy: { expiresAt: "asc" },
  });

  let nextRenewalAt: string | null = null;
  let tokenStatus: "ok" | "expiring_soon" | "expired" | "unknown" = "unknown";

  if (accessSecrets.length > 0) {
    // Find the soonest-expiring token
    const soonest = accessSecrets.find(s => s.expiresAt !== null);
    if (soonest?.expiresAt) {
      nextRenewalAt = soonest.expiresAt.toISOString();
      tokenStatus   = tokenExpiryStatus(soonest.expiresAt);
    } else {
      tokenStatus = "ok"; // Page tokens with no expiry are long-lived
    }
  }

  const tokenOk = tokenStatus === "ok" || tokenStatus === "unknown";
  checks.push({
    label:  "Token de acceso válido",
    passed: tokenStatus !== "expired",
    detail: tokenStatus === "expired"
      ? "Token expirado — se requiere reconexión"
      : tokenStatus === "expiring_soon"
        ? `Expira pronto: ${nextRenewalAt ?? "desconocido"}`
        : undefined,
  });

  // Check 5: Resources discovered
  const resources = await (prisma as any).integrationResource.findMany({
    where: {
      organizationId,
      provider: { in: providerKeys },
    },
    select: { id: true, selected: true },
  });

  const resourceCount = resources.length;
  const selectedCount = resources.filter((r: any) => r.selected).length;

  checks.push({
    label:  "Recursos descubiertos",
    passed: resourceCount > 0,
    detail: resourceCount === 0 ? "No se han descubierto recursos aún" : `${resourceCount} recurso(s) encontrado(s)`,
  });

  checks.push({
    label:  "Recursos seleccionados",
    passed: selectedCount > 0,
    detail: selectedCount === 0 ? "No hay recursos seleccionados para publicación" : `${selectedCount} recurso(s) activo(s)`,
  });

  // ── Derive overall status ─────────────────────────────────────────────────

  let status: DiagnosticStatus;

  if (connectedConns.length === 0) {
    status = "no_conectada";
  } else if (tokenStatus === "expired" || criticalConns.length > 0) {
    // Check if has error message indicating reconnect
    const hasReconnectError = connections.some(c =>
      c.errorMessage?.toLowerCase().includes("reconex") ||
      c.errorMessage?.toLowerCase().includes("revoked") ||
      c.errorMessage?.toLowerCase().includes("expired"),
    );
    status = hasReconnectError ? "reconexion_necesaria" : "error";
  } else if (tokenStatus === "expiring_soon" || warningConns.length > 0) {
    status = "requiere_atencion";
  } else if (selectedCount === 0) {
    status = "requiere_configuracion";
  } else {
    status = "operativa";
  }

  return {
    provider,
    status,
    checks,
    connectionIds,
    resourceCount,
    selectedCount,
    nextRenewalAt,
    checkedAt: now,
  };
}

// ── Provider key registry ──────────────────────────────────────────────────────

const PROVIDER_GROUPS: Record<string, string[]> = {
  meta:     ["meta_facebook", "meta_instagram", "meta_ads", "meta", "meta_whatsapp"],
  tiktok:   ["tiktok"],
  shopify:  ["shopify"],
  youtube:  ["youtube"],
  google:   ["google"],
  whatsapp: ["meta_whatsapp"],
};

// ── Org-level diagnostics ──────────────────────────────────────────────────────

/**
 * Runs diagnostics for all connected providers for an org.
 * Skips providers with no connections at all.
 */
export async function runOrgDiagnostics(
  organizationId: string,
): Promise<OrgDiagnosticsResult> {
  const now = new Date().toISOString();

  // Find all unique provider groups that have connections
  const connections = await prisma.integrationConnection.findMany({
    where:  { organizationId },
    select: { provider: true },
  });

  const activeGroups = new Set<string>();
  for (const conn of connections) {
    for (const [group, keys] of Object.entries(PROVIDER_GROUPS)) {
      if (keys.includes(conn.provider)) {
        activeGroups.add(group);
        break;
      }
    }
  }

  const providers = await Promise.all(
    Array.from(activeGroups).map(group =>
      diagnoseProvider(organizationId, group, PROVIDER_GROUPS[group] ?? [group]),
    ),
  );

  const overallHealthy = providers.every(
    p => p.status === "operativa" || p.status === "requiere_configuracion",
  );

  return { organizationId, providers, overallHealthy, checkedAt: now };
}

/**
 * Runs diagnostics for a specific provider group.
 */
export async function runProviderDiagnostic(
  organizationId: string,
  provider:       string,
): Promise<ProviderDiagnostic> {
  const providerKeys = PROVIDER_GROUPS[provider] ?? [provider];
  return diagnoseProvider(organizationId, provider, providerKeys);
}
