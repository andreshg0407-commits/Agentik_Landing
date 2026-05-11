/**
 * components/shell/module-nav-config.ts
 *
 * Config-driven navigation for the Agentik Workspace Shell.
 *
 * Navigation hierarchy:
 *   Level 1 — DomainDef[]      → System Rail (primary rail icon strip)
 *   Level 2 — NavItem[]        → Context Sidebar (workspace/tool items)
 *   Level 3 — Operational pages → Breadcrumbs + workspace header (not in sidebar)
 *
 * NavItem variants:
 *   - Standard item      → { label, href, indent?, accent?, badge?, disabled?, pathMatches? }
 *   - Section header     → { label, href: "#", isSectionHeader: true }  — non-clickable group label
 *
 * pathMatches[]:
 *   Extra pathname substrings that also trigger active state for this item.
 *   Example: Torre de Control should be active both on /executive AND on
 *   /finanzas/torre-control/* detail workspaces.
 *
 * iconKey:
 *   Serializable string key resolved to a lucide-react icon in WorkspaceShellClient.
 *   Must be a plain string — this config crosses the RSC boundary as a prop.
 *
 * Usage:
 *   1. Call buildNavDomains(opts) from the server layout to get filtered DomainDef[]
 *   2. Pass the array as a prop to WorkspaceShellClient
 *   3. Shell uses inferActiveDomain(pathname, domains) for Level 1 active state
 *   4. Shell uses isNavItemActive(item, pathname) for Level 2 active state
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type NavItem = {
  label:           string;
  href:            string;
  indent?:         1 | 2;
  accent?:         string;
  badge?:          string;
  disabled?:       boolean;
  isSectionHeader?: boolean;    // renders as a non-clickable section group label
  pathMatches?:    string[];    // additional pathname substrings that trigger active state
};

export type DomainDef = {
  id:        string;
  label:     string;
  shortIcon: string;    // fallback label for tooltip/aria — kept for compatibility
  iconKey:   string;    // serializable key → resolved to LucideIcon in the client shell
  accent:    string;    // domain brand color
  pathKeys:  string[];  // URL substrings that identify this domain as active (Level 1)
  items:     NavItem[];
};

export interface NavBuildOptions {
  orgSlug:           string;
  hasDashboard:      boolean;
  hasTorreControl:   boolean;
  hasFinance:        boolean;
  hasCollections:    boolean;
  hasSales:          boolean;
  hasMarketing:      boolean;
  hasAlerts:         boolean;
  hasDocuments:      boolean;   // retained — no longer gates an Ops domain
  hasKnowledge:      boolean;   // retained — no longer gates an Ops domain
  hasAgentik:        boolean;
  hasIntegrations:   boolean;
  hasRuns:           boolean;
  hasSettings:       boolean;
  showInternal:      boolean;
  showPlatformAdmin: boolean;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildNavDomains(opts: NavBuildOptions): DomainDef[] {
  const s = opts.orgSlug;
  const domains: DomainDef[] = [];

  // ── Gestión — executive/management layer ──────────────────────────────────
  if (opts.hasDashboard || opts.hasSales || opts.hasAlerts) {
    const items: NavItem[] = [];
    if (opts.hasDashboard)
      items.push({ label: "Gerencia", href: `/${s}/dashboard`, badge: "↗" });
    items.push({ label: "Estrategia", href: "#", isSectionHeader: true });
    if (opts.hasSales)
      items.push({ label: "Informes Inteligentes", href: `/${s}/reports`, indent: 1, badge: "✨", accent: "#7c3aed" });
    if (opts.hasAlerts)
      items.push({ label: "Alertas y Tareas", href: `/${s}/alerts`, indent: 1 });
    items.push({ label: "IA & Decisiones", href: "#", isSectionHeader: true });
    items.push({ label: "Decisiones IA",      href: "#", indent: 1, disabled: true });
    items.push({ label: "Tareas Gerenciales", href: "#", indent: 1, disabled: true });
    domains.push({
      id:        "gestion",
      label:     "Gestión",
      shortIcon: "G",
      iconKey:   "gestion",
      accent:    "#1e1e2e",
      pathKeys:  ["dashboard", "reports", "alerts"],
      items,
    });
  }

  // ── Finanzas — financial operations ──────────────────────────────────────
  if (opts.hasFinance || opts.hasTorreControl) {
    const items: NavItem[] = [];
    if (opts.hasTorreControl)
      items.push({
        label:        "Torre de Control",
        href:         `/${s}/executive`,
        badge:        "↗",
        accent:       "#1e40af",
        pathMatches:  ["executive", "finanzas/torre-control"],
      });
    items.push({ label: "Operaciones", href: "#", isSectionHeader: true });
    if (opts.hasFinance) {
      items.push({ label: "Tesorería",               href: `/${s}/finance`,         indent: 1 });
      items.push({ label: "Conciliación Inteligente", href: `/${s}/reconciliation`,  indent: 1 });
    }
    items.push({ label: "Próximamente", href: "#", isSectionHeader: true });
    items.push({ label: "Flujo de Caja",    href: "#", indent: 1, disabled: true });
    items.push({ label: "Presupuestos",     href: "#", indent: 1, disabled: true });
    items.push({ label: "Bancos y Créditos", href: "#", indent: 1, disabled: true });
    items.push({ label: "Forecast",         href: "#", indent: 1, disabled: true });
    domains.push({
      id:        "finanzas",
      label:     "Finanzas",
      shortIcon: "Fn",
      iconKey:   "finanzas",
      accent:    "#1e40af",
      pathKeys:  ["executive", "finance", "reconciliation", "finanzas/torre-control"],
      items,
    });
  }

  // ── Cobranza — AR recovery and collection operations ──────────────────────
  if (opts.hasCollections) {
    domains.push({
      id:        "cobranza",
      label:     "Cobranza",
      shortIcon: "C",
      iconKey:   "cobranza",
      accent:    "#7c3aed",
      pathKeys:  ["collections", "control-center/cobranza"],
      items: [
        { label: "Cartera",          href: `/${s}/control-center/cobranza`,             badge: "↗", accent: "#7c3aed" },
        { label: "Operaciones",      href: "#", isSectionHeader: true },
        { label: "Cobranza",         href: `/${s}/collections`,                          indent: 1, accent: "#7c3aed" },
        { label: "Campañas de Cobro", href: `/${s}/collections/campaigns`,               indent: 1 },
        { label: "Rendimiento",      href: `/${s}/collections/performance`,              indent: 1 },
        { label: "Clientes Críticos", href: `/${s}/customer-360?hasOverdue=true`,        indent: 1 },
        { label: "IA & Automatización", href: "#", isSectionHeader: true },
        { label: "IA Cobranza",      href: "#", indent: 1, disabled: true },
      ],
    });
  }

  // ── Comercial — commercial growth system ─────────────────────────────────
  if (opts.hasSales) {
    domains.push({
      id:        "comercial",
      label:     "Comercial",
      shortIcon: "Cm",
      iconKey:   "comercial",
      accent:    "#0369a1",
      pathKeys:  ["sales", "customer-360", "pipeline"],
      items: [
        { label: "Cliente 360",      href: `/${s}/customer-360`,   badge: "↗", accent: "#0369a1" },
        { label: "Análisis",         href: "#", isSectionHeader: true },
        { label: "Pedidos",          href: `/${s}/pipeline`,        indent: 1 },
        { label: "Vendedores",       href: `/${s}/sales/vendors`,   indent: 1 },
        { label: "Canales",          href: `/${s}/sales/channels`,  indent: 1 },
        { label: "Sucursales",       href: `/${s}/sales/branches`,  indent: 1 },
        { label: "Líneas",           href: `/${s}/sales/lines`,     indent: 1 },
        { label: "Control Comercial", href: `/${s}/sales`,           indent: 1, accent: "#9ca3af" },
      ],
    });
  }

  // ── Marketing Studio — creative + content + commerce ──────────────────────
  if (opts.hasMarketing) {
    const mItems: NavItem[] = [
      { label: "Hub",               href: `/${s}/agentik/marketing-studio`,                   badge: "↗", accent: "#7c2d92" },
      { label: "Creación",          href: "#", isSectionHeader: true },
      { label: "Foto Estudio",      href: `/${s}/agentik/marketing-studio/foto-estudio/new`,  indent: 1, badge: "✨", accent: "#7c2d92" },
      { label: "Biblioteca",        href: `/${s}/agentik/marketing-studio/biblioteca`,         indent: 1 },
      { label: "Distribución",      href: "#", isSectionHeader: true },
      { label: "Redes Sociales",    href: `/${s}/agentik/marketing-studio/redes`,              indent: 1 },
      { label: "WhatsApp",          href: "#",                                                  indent: 1, disabled: true },
      { label: "Shopify",           href: `/${s}/agentik/marketing-studio/shopify`,            indent: 1 },
      { label: "IA & Pauta",        href: "#", isSectionHeader: true },
      { label: "AI Ads",            href: "#", indent: 1, disabled: true },
      { label: "IA Marketing",      href: "#", indent: 1, disabled: true },
    ];
    if (opts.showInternal) {
      mItems.push({ label: "Administración",  href: "#", isSectionHeader: true });
      mItems.push({ label: "Presets (admin)", href: `/${s}/agentik/marketing-studio/presets`, indent: 1, accent: "#9ca3af" });
      mItems.push({ label: "Tenants (admin)", href: `/${s}/agentik/marketing-studio/tenants`, indent: 1, accent: "#9ca3af" });
    }
    domains.push({
      id:        "marketing",
      label:     "Marketing",
      shortIcon: "Mk",
      iconKey:   "marketing",
      accent:    "#7c2d92",
      pathKeys:  ["agentik/marketing-studio"],
      items:     mItems,
    });
  }

  // ── Consola Interna — SUPER_ADMIN / AGENTIK_ADMIN only ───────────────────
  if (opts.showInternal) {
    const intItems: NavItem[] = [];
    if (opts.hasAgentik)
      intItems.push({ label: "Agentik",         href: `/${s}/agentik`, badge: "↗", accent: "#4f46e5" });
    if (opts.hasRuns)
      intItems.push({ label: "Ejecuciones",     href: `/${s}/runs`, indent: 1 });
    if (opts.hasIntegrations) {
      intItems.push({ label: "Integraciones",    href: "#", isSectionHeader: true });
      intItems.push({ label: "Conectores",       href: `/${s}/integrations` });
      intItems.push({ label: "Aprobaciones SAG", href: `/${s}/sag/write`,               indent: 1 });
      intItems.push({ label: "Nuevo Cliente",    href: `/${s}/sag/clientes/nuevo`,       indent: 2, accent: "#9ca3af" });
      intItems.push({ label: "Nuevo Artículo",   href: `/${s}/sag/articulos/nuevo`,      indent: 2, accent: "#9ca3af" });
    }
    intItems.push({ label: "Sistema",            href: "#", isSectionHeader: true });
    if (opts.hasSettings)
      intItems.push({ label: "Configuración",   href: `/${s}/settings` });
    if (opts.showPlatformAdmin)
      intItems.push({ label: "Admin Plataforma", href: `/${s}/agentik/marketing-studio/tenants`, accent: "#b45309" });
    domains.push({
      id:        "internal",
      label:     "Consola",
      shortIcon: "∷",
      iconKey:   "internal",
      accent:    "#4f46e5",
      pathKeys:  ["agentik", "runs", "integrations", "settings", "sag"],
      items:     intItems,
    });
  }

  return domains;
}

// ── Active domain detection ───────────────────────────────────────────────────

/**
 * Infers the active domain from the current pathname.
 * Prefers the domain whose pathKey has the longest match — handles specificity
 * (e.g. "agentik/marketing-studio" wins over "agentik" on marketing pages,
 *  "finanzas/torre-control" wins over "executive" on drilldown workspaces).
 */
export function inferActiveDomain(pathname: string, domains: DomainDef[]): string {
  let bestId     = domains[0]?.id ?? "";
  let bestLength = 0;

  for (const domain of domains) {
    for (const key of domain.pathKeys) {
      if (pathname.includes(key) && key.length > bestLength) {
        bestId     = domain.id;
        bestLength = key.length;
      }
    }
  }

  return bestId;
}
