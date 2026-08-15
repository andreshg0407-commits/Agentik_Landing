/**
 * /[orgSlug]/manager — Manager Home.
 *
 * Sprint: AGENTIK-MANAGER-FABLE-INTEGRATION-M1
 *
 * Executive cockpit: personalized greeting, executive pulse, attention, modules.
 *
 * PERFORMANCE: Does NOT call loadControlComercial (120–600s DB payload).
 * Home PA only needs: user identity, alerts, modules, timestamp.
 * Full commercial intelligence loads on-demand in sub-routes.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { getCurrentUser } from "@/lib/auth/auth";
import { getEnabledModules } from "@/lib/tenant/modules";
import { filterModulesByRole } from "@/lib/auth/module-access";
import { listBusinessAlerts } from "@/lib/alerts/queries";
import { assembleGlobalAttention, wrapProviderCall, computeEffectiveManagerModules, MANAGER_MODULE_DEFS } from "@/lib/comercial/manager/manager-commercial-adapter";
import type { ManagerHomePA, ManagerExecutiveStatePA, ManagerAttentionItem, SourceAvailability } from "@/lib/comercial/manager/manager-commercial-types";
import { ManagerHomeClient } from "./manager-home-client";

// ── Lightweight Home PA (no loadControlComercial) ────────────────────────────

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const DIAS = [
  "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
];

function currentDateLabel(): string {
  // Use Bogota timezone to match client locale (avoids hydration mismatch)
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

function serverGreeting(userName: string | null): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const hour = d.getHours();
  const saludo = (hour >= 5 && hour < 12) ? "Buenos días" : (hour >= 12 && hour < 19) ? "Buenas tardes" : "Buenas noches";
  return userName ? `${saludo},\n${userName}` : saludo;
}

function buildLightHomePA(input: {
  orgName: string;
  userName: string | null;
  attention: ManagerAttentionItem[];
}): ManagerHomePA {
  const { orgName, userName, attention } = input;
  const now = new Date().toISOString();
  const unresolvedCount = attention.length;

  let executiveState: ManagerExecutiveStatePA;

  if (unresolvedCount > 0) {
    executiveState = {
      state: "REQUIRES_ATTENTION",
      reason: `${unresolvedCount} ${unresolvedCount === 1 ? "asunto requiere" : "asuntos requieren"} atencion`,
      participatingSources: 4,
      certifiedSources: 4,
      unresolvedAttentionCount: unresolvedCount,
      asOf: now,
    };
  } else {
    executiveState = {
      state: "STABLE",
      reason: "4 fuentes activas",
      participatingSources: 4,
      certifiedSources: 4,
      unresolvedAttentionCount: 0,
      asOf: now,
    };
  }

  return {
    orgName,
    userName,
    greeting: "",
    currentDate: currentDateLabel(),
    executiveState,
    attention,
    asOf: now,
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ManagerHomePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization, membership } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  // Parallel: user identity + modules + alerts (all lightweight queries)
  const [user, orgMods, alertsResult] = await Promise.all([
    getCurrentUser(),
    getEnabledModules(orgId),
    wrapProviderCall("business_alerts", () => listBusinessAlerts(orgId)),
  ]);

  const userName = user?.name?.split(" ")[0] ?? null;
  const mods = filterModulesByRole(orgMods, membership.role);

  // Effective Manager module set: tenant-entitled ∩ role-permitted ∩ Manager-ready.
  const effectiveModules = computeEffectiveManagerModules(mods);

  // Assemble global attention from real alerts.
  const attention = alertsResult.status === "OK"
    ? assembleGlobalAttention({ alerts: alertsResult.items, orgSlug, effectiveModules })
    : [];

  // Build lightweight Home PA — no loadControlComercial dependency
  const homePA = buildLightHomePA({
    orgName: organization.name,
    userName,
    attention,
  });

  // Server-computed greeting avoids hydration mismatch
  homePA.greeting = serverGreeting(userName);

  // Build module cards from canonical Manager module defs (single source)
  const moduleCards = MANAGER_MODULE_DEFS
    .filter(def => mods.has(def.moduleKey as Parameters<typeof mods.has>[0]))
    .map(def => ({
      id:          def.moduleKey,
      label:       def.label,
      description: def.description,
      accent:      def.accent,
      icon:        def.icon,
      href:        `/${orgSlug}/manager/${def.routeSlug}`,
      attentionCount: attention.filter(a => a.module === def.moduleKey).length,
    }));

  return (
    <ManagerHomeClient
      orgSlug={orgSlug}
      homePA={homePA}
      modules={moduleCards}
    />
  );
}
