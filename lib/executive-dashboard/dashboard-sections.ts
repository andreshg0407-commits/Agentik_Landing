/**
 * dashboard-sections.ts
 *
 * EXECUTIVE-OPERATIONAL-DASHBOARD-04
 * Section definitions for the Executive Control Center.
 *
 * No Prisma. No React. No server-only. Pure domain types.
 */

// -- Section ID ---------------------------------------------------------------

/** All dashboard section identifiers. */
export type DashboardSectionId =
  | "executive_summary"
  | "business_health"
  | "signals"
  | "events_timeline"
  | "rules_applied"
  | "recommended_plans"
  | "recommended_decisions"
  | "pending_actions"
  | "executive_timeline"
  | "ask_david";

// -- Section Definition -------------------------------------------------------

/** A dashboard section definition. */
export interface DashboardSection {
  id: DashboardSectionId;
  title: string;
  subtitle: string;
  order: number;
  collapsible: boolean;
  defaultExpanded: boolean;
}

// -- Section Registry ---------------------------------------------------------

/** All dashboard sections in display order. */
export const DASHBOARD_SECTIONS: DashboardSection[] = [
  {
    id: "executive_summary",
    title: "Resumen Ejecutivo",
    subtitle: "Vista general del dia",
    order: 1,
    collapsible: false,
    defaultExpanded: true,
  },
  {
    id: "business_health",
    title: "Salud del Negocio",
    subtitle: "Estado general",
    order: 2,
    collapsible: true,
    defaultExpanded: true,
  },
  {
    id: "signals",
    title: "Signals Activos",
    subtitle: "Condiciones que requieren atencion",
    order: 3,
    collapsible: true,
    defaultExpanded: true,
  },
  {
    id: "events_timeline",
    title: "Timeline de Eventos",
    subtitle: "Cronologia de transiciones",
    order: 4,
    collapsible: true,
    defaultExpanded: true,
  },
  {
    id: "rules_applied",
    title: "Reglas Aplicadas",
    subtitle: "Politicas que se activaron",
    order: 5,
    collapsible: true,
    defaultExpanded: true,
  },
  {
    id: "recommended_plans",
    title: "Planes Recomendados",
    subtitle: "Alternativas evaluadas por Agentik",
    order: 6,
    collapsible: true,
    defaultExpanded: true,
  },
  {
    id: "recommended_decisions",
    title: "Decisiones Recomendadas",
    subtitle: "Que recomienda Agentik y por que",
    order: 7,
    collapsible: true,
    defaultExpanded: true,
  },
  {
    id: "pending_actions",
    title: "Acciones Pendientes",
    subtitle: "Acciones preparadas por el motor de ejecucion",
    order: 8,
    collapsible: true,
    defaultExpanded: true,
  },
  {
    id: "executive_timeline",
    title: "Timeline Ejecutivo",
    subtitle: "Resumen del dia en lenguaje de negocio",
    order: 9,
    collapsible: true,
    defaultExpanded: false,
  },
  {
    id: "ask_david",
    title: "Preguntar a David",
    subtitle: "David consume inteligencia — nunca la inventa",
    order: 10,
    collapsible: true,
    defaultExpanded: false,
  },
];
