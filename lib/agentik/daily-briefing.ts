import { getOrganizationBusinessStatus } from "./org-activity-engine";
import type { OperationalStatus } from "./business-status";

interface DailyBriefingParams {
  organizationId: string;
  organizationName: string;
  firstName?: string;
}

interface DailyBriefing {
  headline: string;
  message: string;
  status: OperationalStatus;
}

export async function generateOrganizationDailyBriefing(
  params: DailyBriefingParams
): Promise<DailyBriefing> {
  const { organizationId, organizationName, firstName } = params;
  const name = organizationName;
  const greeting = firstName ? `, ${firstName}` : "";

  const { businessStatus } = await getOrganizationBusinessStatus(organizationId);

  switch (businessStatus.status) {
    case "stable":
      return {
        headline: `Todo en marcha en ${name} hoy${greeting}.`,
        message: "Revisa el avance cuando quieras.",
        status: "stable",
      };

    case "attention":
      return {
        headline: `Hoy necesitamos tu atención en ${name}${greeting}.`,
        message: businessStatus.reason,
        status: "attention",
      };

    case "critical":
      return {
        headline: `Hay un punto crítico en la operación de ${name}${greeting}.`,
        message: businessStatus.reason,
        status: "critical",
      };

    case "unknown":
      return {
        headline: `Aún no tengo suficiente actividad reciente para evaluar ${name}.`,
        message: "",
        status: "unknown",
      };
  }
}
