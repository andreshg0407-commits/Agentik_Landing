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
  visibility?:     "platform" | "all";  // "platform" = SUPER_ADMIN/AGENTIK_ADMIN only; default = "all"
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
  hasProduction:     boolean;
  hasAgentik:        boolean;
  hasIntegrations:   boolean;
  hasRuns:           boolean;
  hasSettings:       boolean;
  showInternal:      boolean;
  showPlatformAdmin: boolean;
}

// ── Visibility filter ─────────────────────────────────────────────────────────

/**
 * Strips items that require platform-admin visibility when the user is not
 * a platform admin. Section headers are also removed if all their children
 * are stripped (avoids orphaned headers).
 */
function filterItemsByVisibility(items: NavItem[], isPlatformAdmin: boolean): NavItem[] {
  if (isPlatformAdmin) return items;

  const filtered: NavItem[] = [];
  let pendingHeader: NavItem | null = null;

  for (const item of items) {
    if (item.isSectionHeader) {
      // Hold the header — emit only if a visible child follows
      pendingHeader = item;
      continue;
    }
    if (item.visibility === "platform") continue;
    // Visible item — flush pending header first
    if (pendingHeader) {
      filtered.push(pendingHeader);
      pendingHeader = null;
    }
    filtered.push(item);
  }

  return filtered;
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
    items.push({ label: "Productividad", href: "#", isSectionHeader: true });
    items.push({ label: "Tareas",        href: `/${s}/tareas`,       indent: 1, accent: "#004AAD", pathMatches: ["tareas"]       });
    items.push({ label: "Aprobaciones",  href: `/${s}/aprobaciones`, indent: 1, accent: "#004AAD", pathMatches: ["aprobaciones"] });
    items.push({ label: "Ejecuciones",   href: `/${s}/ejecuciones`,  indent: 1, accent: "#004AAD", pathMatches: ["ejecuciones"]  });
    items.push({ label: "IA & Decisiones", href: "#", isSectionHeader: true });
    items.push({ label: "Decisiones IA",      href: "#", indent: 1, disabled: true });
    domains.push({
      id:        "gestion",
      label:     "Gestión",
      shortIcon: "G",
      iconKey:   "gestion",
      accent:    "#1e1e2e",
      pathKeys:  ["dashboard", "reports", "alerts", "tareas", "aprobaciones", "ejecuciones"],
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
      items.push({ label: "Tesorería Operativa",     href: `/${s}/finanzas/tesoreria`,   indent: 1 });
      items.push({ label: "Conciliación Inteligente", href: `/${s}/finanzas/conciliacion`, indent: 1 });
      items.push({ label: "Centro Documental",        href: `/${s}/finanzas/documentos`,  indent: 1 });
      items.push({ label: "Cierre Financiero",        href: `/${s}/finanzas/cierre`,      indent: 1 });
    }
    items.push({ label: "Estrategia", href: "#", isSectionHeader: true });
    if (opts.hasFinance)
      items.push({ label: "Planeación Financiera", href: `/${s}/finanzas/planeacion`, indent: 1 });
    else
      items.push({ label: "Planeación Financiera", href: "#", indent: 1, disabled: true });
    domains.push({
      id:        "finanzas",
      label:     "Finanzas",
      shortIcon: "Fn",
      iconKey:   "finanzas",
      accent:    "#1e40af",
      pathKeys:  [
        "executive", "finance", "reconciliation", "finanzas/torre-control",
        "finanzas/tesoreria", "finanzas/conciliacion", "finanzas/documentos", "finanzas/cierre", "finanzas/planeacion",
      ],
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
      pathKeys:  ["sales", "customer-360", "pipeline", "comercial/maletas", "comercial/inventario", "comercial/importaciones", "comercial/pedidos", "comercial/tiendas", "comercial/clientes", "comercial/vendedores", "comercial/control"],
      items: [
        // ── OPERACIÓN — lo que está ocurriendo ───────────────────────────────
        { label: "Operación",            href: "#", isSectionHeader: true },
        { label: "Maletas",              href: `/${s}/comercial/maletas`,       indent: 1, accent: "#0369a1", pathMatches: ["comercial/maletas"] },
        { label: "Inventario",           href: `/${s}/comercial/inventario`,    indent: 1, accent: "#0369a1", pathMatches: ["comercial/inventario"] },
        { label: "Importaciones",        href: `/${s}/comercial/importaciones`, indent: 1, accent: "#0369a1", pathMatches: ["comercial/importaciones"] },
        { label: "Pedidos",              href: `/${s}/comercial/pedidos`,       indent: 1, accent: "#0369a1", pathMatches: ["comercial/pedidos"] },
        { label: "Tiendas",              href: `/${s}/comercial/tiendas`,       indent: 1, accent: "#0369a1", pathMatches: ["comercial/tiendas"] },
        { label: "Clientes",             href: `/${s}/comercial/clientes`,      indent: 1, accent: "#0369a1", pathMatches: ["comercial/clientes"] },
        { label: "Vendedores",           href: `/${s}/comercial/vendedores`,    indent: 1, accent: "#0369a1", pathMatches: ["comercial/vendedores"] },
        // ── ESTRUCTURA COMERCIAL — cómo está organizado el negocio ───────────
        { label: "Estructura Comercial", href: "#", isSectionHeader: true },
        { label: "Canales",              href: `/${s}/sales/channels`,    indent: 1 },
        { label: "Sucursales",           href: `/${s}/sales/branches`,    indent: 1 },
        { label: "Líneas",               href: `/${s}/sales/lines`,       indent: 1 },
        // ── INTELIGENCIA — interpreta el sistema comercial ────────────────────
        { label: "Inteligencia",                  href: "#", isSectionHeader: true },
        { label: "Inteligencia Operacional",      href: `/${s}/comercial/inteligencia`, indent: 1, accent: "#0369a1", pathMatches: ["comercial/inteligencia"] },
        { label: "Control Comercial",             href: `/${s}/sales`,                  indent: 1, accent: "#0369a1" },
      ],
    });
  }

  // ── Producción — manufacturing operations ────────────────────────────────
  if (opts.hasProduction) {
    domains.push({
      id:        "produccion",
      label:     "Producción",
      shortIcon: "Pr",
      iconKey:   "produccion",
      accent:    "#b45309",
      pathKeys:  ["produccion"],
      items: [
        { label: "Panel",      href: `/${s}/produccion`,           badge: "↗", accent: "#b45309" },
        { label: "Operación",  href: "#", isSectionHeader: true },
        { label: "Órdenes",    href: `/${s}/produccion/ordenes`,   indent: 1, accent: "#b45309", pathMatches: ["produccion/ordenes"]   },
        { label: "Timeline",   href: `/${s}/produccion/timeline`,  indent: 1, accent: "#b45309", pathMatches: ["produccion/timeline"]  },
        { label: "Etapas",     href: `/${s}/produccion/etapas`,    indent: 1, accent: "#b45309", pathMatches: ["produccion/etapas"]    },
        { label: "Consumos",   href: `/${s}/produccion/consumos`,  indent: 1, accent: "#b45309", pathMatches: ["produccion/consumos"]  },
        { label: "Costos",     href: `/${s}/produccion/costos`,    indent: 1, accent: "#b45309", pathMatches: ["produccion/costos"]    },
        { label: "Alertas",    href: `/${s}/produccion/alertas`,   indent: 1, accent: "#b45309", pathMatches: ["produccion/alertas"]   },
      ],
    });
  }

  // ── Marketing Studio — creative + content + commerce ──────────────────────
  if (opts.hasMarketing) {
    const mItems: NavItem[] = [
      { label: "Hub",          href: `/${s}/agentik/marketing-studio`, badge: "↗", accent: "#7c2d92" },

      // ── CREACIÓN — tenant-visible ──────────────────────────────────────────
      { label: "Crear",        href: "#", isSectionHeader: true },
      { label: "Foto Estudio", href: `/${s}/agentik/marketing-studio/foto-estudio/new`, indent: 1, badge: "✨", accent: "#7c2d92" },
      { label: "Biblioteca",   href: `/${s}/agentik/marketing-studio/biblioteca`,       indent: 1 },
      { label: "Atributos",    href: `/${s}/agentik/marketing-studio/biblioteca/atributos`, indent: 2, accent: "#7c2d92" },

      // ── PUBLICAR — tenant-visible ──────────────────────────────────────────
      { label: "Publicar",     href: "#", isSectionHeader: true },
      { label: "Publicaciones", href: `/${s}/agentik/marketing-studio/redes`,     indent: 1 },
      { label: "Catálogos",    href: `/${s}/agentik/marketing-studio/catalogos`,  indent: 1 },
      { label: "Shopify",      href: `/${s}/agentik/marketing-studio/shopify`,                 indent: 1 },
      { label: "Estadísticas", href: `/${s}/agentik/marketing-studio/shopify/estadisticas`,  indent: 2 },
      { label: "Promociones",  href: `/${s}/agentik/marketing-studio/shopify/promociones`,   indent: 2 },
      { label: "Operaciones",  href: `/${s}/agentik/marketing-studio/shopify/operaciones`,   indent: 2 },
      { label: "WhatsApp",     href: "#",                                                      indent: 1, disabled: true },

      // ── CRECER — tenant-visible ────────────────────────────────────────────
      { label: "Crecer",       href: "#", isSectionHeader: true },
      { label: "Campañas",     href: `/${s}/agentik/marketing-studio/campaigns`,  indent: 1 },
      { label: "Pauta con IA", href: `/${s}/agentik/marketing-studio/pauta`,      indent: 1, badge: "IA", accent: "#7c3aed" },
      { label: "Analítica",    href: `/${s}/agentik/marketing-studio/analytics`,  indent: 1 },
      { label: "Conexiones",   href: `/${s}/agentik/marketing-studio/connections`, indent: 1 },

      // ── PLATAFORMA — platform-admin only ──────────────────────────────────
      { label: "Plataforma",            href: "#", isSectionHeader: true, visibility: "platform" },
      { label: "Orchestrator Runtime",  href: `/${s}/agentik/marketing-studio/orchestrator`,  indent: 1, badge: "⚡", accent: "#004AAD", visibility: "platform" },
      { label: "Automatizaciones",      href: `/${s}/agentik/marketing-studio/orchestration`, indent: 1, badge: "⚡", accent: "#004AAD", visibility: "platform" },
      { label: "Distribución Runtime",  href: `/${s}/agentik/marketing-studio/distribution`,  indent: 1, badge: "⚡", accent: "#004AAD", visibility: "platform" },
      { label: "Publishing Runtime",    href: `/${s}/agentik/marketing-studio/publishing`,    indent: 1, badge: "⚡", accent: "#004AAD", visibility: "platform" },
      { label: "Social Runtime",        href: `/${s}/agentik/marketing-studio/social`,         indent: 1, badge: "⚡", accent: "#E1306C", visibility: "platform" },
      { label: "Validación Operativa",  href: `/${s}/agentik/marketing-studio/review`,         indent: 1, badge: "↗", accent: "#004AAD", visibility: "platform" },
    ];
    if (opts.showInternal) {
      mItems.push({ label: "Administración",  href: "#", isSectionHeader: true, visibility: "platform" });
      mItems.push({ label: "Presets (admin)", href: `/${s}/agentik/marketing-studio/presets`, indent: 1, accent: "#9ca3af", visibility: "platform" });
      mItems.push({ label: "Tenants (admin)", href: `/${s}/agentik/marketing-studio/tenants`, indent: 1, accent: "#9ca3af", visibility: "platform" });
    }
    domains.push({
      id:        "marketing",
      label:     "Marketing",
      shortIcon: "Mk",
      iconKey:   "marketing",
      accent:    "#7c2d92",
      pathKeys:  ["agentik/marketing-studio"],
      items:     filterItemsByVisibility(mItems, opts.showInternal),
    });
  }

  // ── Agentik — AI OS hub (SUPER_ADMIN / AGENTIK_ADMIN only) ──────────────
  if (opts.showInternal && opts.hasAgentik) {
    domains.push({
      id:        "agentik",
      label:     "Agentik",
      shortIcon: "Ag",
      iconKey:   "agentik",
      accent:    "#4f46e5",
      pathKeys:  ["agentik/agentes", "agentik/configuracion", "agentik", "copilot/approval-center", "agentik/runtime-admin"],
      items: [
        { label: "Hub",              href: `/${s}/agentik`,                          badge: "↗", accent: "#4f46e5" },
        { label: "Sistema",          href: "#", isSectionHeader: true },
        { label: "Agentes",          href: `/${s}/agentik/agentes`,             indent: 1, accent: "#4f46e5",  pathMatches: ["agentik/agentes"]             },
        { label: "Configuración",    href: `/${s}/agentik/configuracion`,       indent: 1, accent: "#4f46e5",  pathMatches: ["agentik/configuracion"]       },
        { label: "Gobernanza",         href: "#", isSectionHeader: true, visibility: "platform" },
        { label: "Mapa Operacional",  href: `/${s}/agentik/operational-map`,     indent: 1, accent: "#004AAD", badge: "SAG",       visibility: "platform", pathMatches: ["agentik/operational-map"]       },
        { label: "SAG Contrato",      href: `/${s}/agentik/sag-contract-review`, indent: 1, accent: "#004AAD", badge: "CONTRATO", visibility: "platform", pathMatches: ["agentik/sag-contract-review"] },
        { label: "Auditoría Conex.",  href: `/${s}/agentik/connection-audit`,    indent: 1, accent: "#004AAD", badge: "AUDIT", visibility: "platform", pathMatches: ["agentik/connection-audit"] },
        { label: "Runtime",          href: "#", isSectionHeader: true, visibility: "platform" },
        { label: "Approval Center",  href: `/${s}/copilot/approval-center`,     indent: 1, accent: "#004AAD", badge: "⚡", visibility: "platform", pathMatches: ["copilot/approval-center"] },
        { label: "Runtime Admin",    href: `/${s}/agentik/runtime-admin`,        indent: 1, accent: "#004AAD", badge: "⚙",  visibility: "platform", pathMatches: ["agentik/runtime-admin"] },
      ],
    });
  }

  // ── Consola — advanced internal tooling (SUPER_ADMIN / AGENTIK_ADMIN only) ─
  if (opts.showInternal) {
    const intItems: NavItem[] = [];
    if (opts.hasRuns)
      intItems.push({ label: "Ejecuciones",     href: `/${s}/runs` });
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
      accent:    "#374151",
      pathKeys:  ["runs", "integrations", "settings", "sag"],
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
