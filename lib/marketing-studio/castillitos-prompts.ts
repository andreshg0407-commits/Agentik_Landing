/**
 * lib/marketing-studio/castillitos-prompts.ts
 *
 * Castillitos Retail Prompt Engine — Sprint M1.
 *
 * Replaces the denim-fidelity prompt logic for the Castillitos tenant.
 * Covers: kids clothing, toys, school supplies, seasonal campaigns.
 *
 * ── Architecture ──────────────────────────────────────────────────────────────
 *
 *   buildCastillitosPrompt()      Main entry — routes to category-specific builder.
 *   buildCatalogoPrompt()         CATÁLOGO preset group prompts.
 *   buildRedesPrompt()            REDES social media prompts.
 *   buildCampanaPrompt()          CAMPAÑAS commercial campaign prompts.
 *   buildCastillitosHashtags()    Hashtag engine for kids/toys/retail/seasons.
 *   buildCastillitosCopy()        Copy suggestion engine (season + channel aware).
 *
 * All functions are pure — no DB calls, no HTTP. Safe for server + edge.
 */

import type {
  GarmentCategory,
  GarmentFingerprint,
  TenantMarketingConfig,
  RetailSeason,
  CampaignChannel,
  MarketingBusinessLine,
  PresetCategory,
} from "./types";
import type { PhotoPreset } from "./types";

// ── Context types ─────────────────────────────────────────────────────────────

export interface CastillitosPromptContext {
  fingerprint:   GarmentFingerprint;
  preset:        PhotoPreset;
  config:        TenantMarketingConfig;
  season?:       RetailSeason;
  channel?:      CampaignChannel;
  businessLine?: MarketingBusinessLine;
  /** Free-text product title / nombre del producto */
  productTitle?: string;
}

// ── Category label helpers ────────────────────────────────────────────────────

const CATEGORY_PHRASES: Partial<Record<GarmentCategory, string>> = {
  kids_clothing:    "kids clothing, children's fashion",
  toy:              "children's toy",
  school_supplies:  "school supplies and accessories",
  baby:             "baby clothing and accessories",
  game:             "board game / children's game",
  seasonal_item:    "seasonal children's item",
  accessories:      "children's accessories",
  footwear:         "children's footwear",
  other:            "product",
  // Legacy (Do Jeans backward compat — not used in Castillitos path)
  jeans:    "jeans",
  pants:    "pants",
  shorts:   "shorts",
  shirt:    "shirt",
  blouse:   "blouse",
  dress:    "dress",
  skirt:    "skirt",
  jacket:   "jacket",
  outerwear:"outerwear",
  activewear:"activewear",
};

function categoryPhrase(category: GarmentCategory): string {
  return CATEGORY_PHRASES[category] ?? "product";
}

const SEASON_PHRASES: Record<RetailSeason, string> = {
  regreso_clases: "back to school season",
  navidad:        "Christmas holiday season",
  dia_nino:       "Children's Day celebration",
  halloween:      "Halloween season",
  san_valentin:   "Valentine's Day",
  dia_madre:      "Mother's Day",
  normal:         "",
};

const BUSINESS_LINE_PHRASES: Record<MarketingBusinessLine, string> = {
  castillitos: "Castillitos brand",
  latin_kids:  "Latin Kids brand",
  importacion: "imported collection",
  pets:        "pet accessories collection",
};

const CHANNEL_AUDIENCE_PHRASES: Record<CampaignChannel, string> = {
  empresa:    "B2B institutional buyers, school uniform buyers",
  mayoristas: "wholesale distributors, resellers",
  tiendas:    "retail store customers, families shopping in-store",
  web:        "online shoppers, digital-first parents",
  all:        "broad retail audience",
};

// ── Core prompt builder ───────────────────────────────────────────────────────

/**
 * Main prompt builder for Castillitos.
 * Routes to the appropriate sub-builder based on preset category.
 */
export function buildCastillitosPrompt(ctx: CastillitosPromptContext): string {
  const category = ctx.preset.presetCategory;
  switch (category) {
    case "catalogo":  return buildCatalogoPrompt(ctx);
    case "redes":     return buildRedesPrompt(ctx);
    case "campanas":  return buildCampanaPrompt(ctx);
    default:          return buildGenericCastillitosPrompt(ctx);
  }
}

/**
 * CATÁLOGO — Product catalogue prompts.
 * Priority: clean product identity, ecommerce fidelity, color accuracy.
 */
function buildCatalogoPrompt(ctx: CastillitosPromptContext): string {
  const { fingerprint, preset, config } = ctx;
  const { attributes } = fingerprint;
  const parts: string[] = [];

  // Product core
  const colors = attributes.colors.join(" and ");
  const cat    = categoryPhrase(attributes.category);
  parts.push(`${colors} ${cat}`);

  if (attributes.pattern && attributes.pattern !== "solid") {
    parts.push(`with ${attributes.pattern} pattern`);
  }

  // Product title if given
  if (ctx.productTitle) {
    parts.push(`— "${ctx.productTitle}"`);
  }

  // Preset visual treatment
  if (preset.aiPromptHint) {
    parts.push(preset.aiPromptHint);
  } else {
    const bg = preset.background.value ?? preset.background.type;
    parts.push(`${bg} background`);
    parts.push(`${preset.lighting.setup} lighting`);
  }

  // Catalogue-specific requirements
  parts.push("product photography");
  parts.push("accurate color reproduction");
  parts.push("clean edges, no shadows on background");
  parts.push("ecommerce ready, print ready");

  // Brand context
  const line = ctx.businessLine ? BUSINESS_LINE_PHRASES[ctx.businessLine] : null;
  if (line) parts.push(`for ${line}`);

  return parts.join(", ") + ". High resolution, professional product photography.";
}

/**
 * REDES — Social media content prompts.
 * Priority: emotional engagement, season relevance, channel format.
 */
function buildRedesPrompt(ctx: CastillitosPromptContext): string {
  const { fingerprint, preset, config } = ctx;
  const { attributes } = fingerprint;
  const parts: string[] = [];

  // Subject
  const colors  = attributes.colors.join(" and ");
  const cat     = categoryPhrase(attributes.category);
  parts.push(`${colors} ${cat}`);

  // Product title
  if (ctx.productTitle) {
    parts.push(`"${ctx.productTitle}"`);
  }

  // Kid/model context
  if (attributes.gender === "kids" || attributes.gender === "baby") {
    parts.push("with happy child model, ages 3-12");
  }

  // Preset visual treatment
  if (preset.aiPromptHint) {
    parts.push(preset.aiPromptHint);
  } else {
    parts.push(`${preset.lighting.setup} lighting`);
    parts.push(`${preset.style.replace(/_/g, " ")} photography`);
  }

  // Season context
  const season = ctx.season ?? "normal";
  const seasonPhrase = SEASON_PHRASES[season];
  if (seasonPhrase) parts.push(seasonPhrase);

  // Channel / audience
  if (ctx.channel && ctx.channel !== "all") {
    const audience = CHANNEL_AUDIENCE_PHRASES[ctx.channel];
    if (audience) parts.push(`targeting ${audience}`);
  }

  // Brand voice adjectives (max 2)
  const adj = config.brandVoice.adjectives.slice(0, 2).join(", ");
  if (adj) parts.push(`${adj} aesthetic`);

  // Business line
  const line = ctx.businessLine ? BUSINESS_LINE_PHRASES[ctx.businessLine] : null;
  if (line) parts.push(line);

  // Social content markers
  parts.push("vibrant colors, engaging social media photography");
  parts.push("Colombian retail brand");

  return parts.join(", ") + ". High resolution.";
}

/**
 * CAMPAÑAS — Commercial campaign prompts.
 * Priority: commercial impact, call-to-action, brand presence.
 */
function buildCampanaPrompt(ctx: CastillitosPromptContext): string {
  const { fingerprint, preset, config } = ctx;
  const { attributes } = fingerprint;
  const parts: string[] = [];

  // Campaign hero subject
  const colors  = attributes.colors.join(" and ");
  const cat     = categoryPhrase(attributes.category);
  parts.push(`commercial campaign featuring ${colors} ${cat}`);

  // Product title
  if (ctx.productTitle) {
    parts.push(`product: "${ctx.productTitle}"`);
  }

  // Preset visual treatment
  if (preset.aiPromptHint) {
    parts.push(preset.aiPromptHint);
  } else {
    const bg = preset.background.value ?? preset.background.type;
    parts.push(`${bg} background`);
    parts.push(`${preset.lighting.setup} lighting`);
    parts.push(`${preset.style.replace(/_/g, " ")} style`);
  }

  // Season impact
  const season = ctx.season ?? "normal";
  const seasonPhrase = SEASON_PHRASES[season];
  if (seasonPhrase) parts.push(`${seasonPhrase} campaign`);

  // Channel context
  const channel = ctx.channel ?? "all";
  if (channel !== "all") {
    parts.push(`for ${CHANNEL_AUDIENCE_PHRASES[channel]}`);
  }

  // Business line
  const line = ctx.businessLine ? BUSINESS_LINE_PHRASES[ctx.businessLine] : null;
  if (line) parts.push(line);

  // Campaign-specific brand voice
  const adj = config.brandVoice.adjectives.slice(0, 3).join(", ");
  if (adj) parts.push(`${adj} brand aesthetic`);

  parts.push("commercial retail campaign photography");
  parts.push("high visual impact");
  parts.push("Colombian kids retail");

  return parts.join(", ") + ". Professional campaign photography, high resolution.";
}

/**
 * Generic fallback prompt — used when preset has no presetCategory.
 */
function buildGenericCastillitosPrompt(ctx: CastillitosPromptContext): string {
  const { fingerprint, preset, config } = ctx;
  const { attributes } = fingerprint;
  const colors = attributes.colors.join(" and ");
  const cat    = categoryPhrase(attributes.category);
  const bg     = preset.aiPromptHint ?? (preset.background.value ?? preset.background.type) + " background";
  const adj    = config.brandVoice.adjectives.slice(0, 2).join(", ");
  return `${colors} ${cat}, ${bg}, ${adj} aesthetic. Professional retail photography, Colombia, high resolution.`;
}

// ── Hashtag engine ────────────────────────────────────────────────────────────

/**
 * Season-specific hashtag pools.
 */
const SEASON_HASHTAGS: Record<RetailSeason, string[]> = {
  regreso_clases: [
    "#RegresoAClases", "#BackToSchool", "#UtilesEscolares",
    "#VueltaAlColegio", "#Mochila", "#ModaEscolar",
  ],
  navidad: [
    "#NavidadCastillitos", "#RegaloNavidad", "#NavidadFamiliar",
    "#RegalosParaNiños", "#SeasonalGifts", "#NocheBuena",
  ],
  dia_nino: [
    "#DiadelNiño", "#DiaNino", "#FelizDiaNiños",
    "#CelebrandoNiños", "#JuguetesColombia",
  ],
  halloween: ["#Halloween", "#DisfracesColombia", "#HalloweenKids"],
  san_valentin: ["#SanValentin", "#DiaDelAmor", "#RegalosAmor"],
  dia_madre: ["#DiaDelaMadre", "#FelizDiaMama", "#RegalosParaMama"],
  normal: [],
};

/**
 * Channel-specific hashtags.
 */
const CHANNEL_HASHTAGS: Record<CampaignChannel, string[]> = {
  empresa:    ["#VentasInstitucionales", "#UniformesEscolares", "#ComprasPorMayor"],
  mayoristas: ["#Mayoristas", "#DistribuidoresColombia", "#CompraAlPorMayor"],
  tiendas:    ["#TiendaFisica", "#VisitaNuestra", "#PuntoDeVenta"],
  web:        ["#CompraOnline", "#TiendaOnline", "#EcommerceNiños"],
  all:        [],
};

/**
 * Business line hashtags.
 */
const BUSINESS_LINE_HASHTAGS: Record<MarketingBusinessLine, string[]> = {
  castillitos: ["#Castillitos", "#CastillitosKids"],
  latin_kids:  ["#LatinKids", "#LatinKidsColombia"],
  importacion: ["#RopaImportada", "#ColecciónImportada"],
  pets:        ["#CastillitosPets", "#MascotasColombia"],
};

/**
 * Category hashtags for kids/toys.
 */
const CATEGORY_HASHTAGS: Partial<Record<GarmentCategory, string[]>> = {
  kids_clothing:   ["#ModaInfantil", "#RopaParaNiños", "#NiñosFashion"],
  toy:             ["#Juguetes", "#JuguetesColombia", "#JuguetesParaNiños"],
  school_supplies: ["#UtilesEscolares", "#MaterialEscolar", "#ColegioColombia"],
  baby:            ["#ropabebé", "#BebéModa", "#BabyFashion"],
  game:            ["#JuegosDeMesa", "#JuegosNiños"],
  accessories:     ["#AccesoriosInfantiles", "#NiñosAccesorios"],
};

/**
 * Builds a hashtag list for a Castillitos content piece.
 * Combines brand + category + season + channel + businessLine hashtags.
 */
export function buildCastillitosHashtags(
  fingerprint:   GarmentFingerprint,
  config:        TenantMarketingConfig,
  season?:       RetailSeason,
  channel?:      CampaignChannel,
  businessLine?: MarketingBusinessLine,
  maxCount       = 15,
): string[] {
  const tags = new Set<string>();

  // 1. Tenant signature hashtags (highest priority — always first)
  config.brandVoice.signatureHashtags.slice(0, 5).forEach(t => tags.add(t));

  // 2. Business line hashtags
  const blTags = BUSINESS_LINE_HASHTAGS[businessLine ?? "castillitos"] ?? [];
  blTags.forEach(t => tags.add(t));

  // 3. Season hashtags (max 4)
  const sTags = SEASON_HASHTAGS[season ?? "normal"] ?? [];
  sTags.slice(0, 4).forEach(t => tags.add(t));

  // 4. Category hashtags
  const catTags = CATEGORY_HASHTAGS[fingerprint.attributes.category] ?? [];
  catTags.slice(0, 3).forEach(t => tags.add(t));

  // 5. Channel hashtags (max 2)
  const chTags = CHANNEL_HASHTAGS[channel ?? "all"] ?? [];
  chTags.slice(0, 2).forEach(t => tags.add(t));

  // 6. Color hashtags (max 1 — avoid pollution)
  const mainColor = fingerprint.attributes.colors[0];
  if (mainColor) tags.add("#" + mainColor.charAt(0).toUpperCase() + mainColor.slice(1));

  // 7. Generic retail
  tags.add("#TiendaInfantil");
  tags.add("#HechoEnColombia");

  return Array.from(tags).slice(0, maxCount);
}

// ── Copy suggestion engine ────────────────────────────────────────────────────

/**
 * Season-specific copy openers (Spanish — Colombia).
 */
const SEASON_COPY_OPENERS: Record<RetailSeason, string[]> = {
  regreso_clases: [
    "¡Regreso a clases listo con Castillitos!",
    "Arranca el año con el mejor estilo.",
    "Todo lo que tu niño necesita para el colegio, en un solo lugar.",
    "Porque el primer día merece el mejor look.",
  ],
  navidad: [
    "El regalo perfecto ya llegó a Castillitos.",
    "Esta Navidad, sorprende con algo especial.",
    "Navidad es tiempo de magia — y de los mejores regalos.",
    "Regalos que van a encantar a los peques en casa.",
  ],
  dia_nino: [
    "¡Hoy celebramos a los protagonistas de casa!",
    "Día del niño, sonrisas infinitas.",
    "Para ese pequeño que lo merece todo.",
    "El Día del Niño llega con las mejores sorpresas.",
  ],
  halloween: [
    "¿Truco o trato? Disfraces épicos para los más creativos.",
    "Este Halloween, el mejor disfraz.",
  ],
  san_valentin: [
    "Amor y moda infantil — la combinación perfecta.",
    "Un regalo con mucho estilo y más amor.",
  ],
  dia_madre: [
    "Para la mamá que lo da todo — y a sus niños también.",
    "Celebra a mamá con estilo.",
  ],
  normal: [
    "Para los pequeños grandes aventureros.",
    "Tu niño, su estilo.",
    "Colores que cuentan historias.",
    "Calidad que los papás confían.",
    "Diversión garantizada desde el primer uso.",
  ],
};

/**
 * Channel-specific copy closers.
 */
const CHANNEL_COPY_CLOSERS: Record<CampaignChannel, string> = {
  empresa:    "Solicita tu cotización institucional.",
  mayoristas: "Contáctanos para pedidos al por mayor.",
  tiendas:    "Encuéntranos en nuestros puntos de venta.",
  web:        "Compra en línea y recibe en casa.",
  all:        "Visítanos o compra en línea.",
};

/**
 * Builds a copy (caption / post text) suggestion for Castillitos content.
 * Season + channel aware.
 */
export function buildCastillitosCopy(
  fingerprint:   GarmentFingerprint,
  config:        TenantMarketingConfig,
  season?:       RetailSeason,
  channel?:      CampaignChannel,
  businessLine?: MarketingBusinessLine,
): string {
  const resolvedSeason  = season  ?? "normal";
  const resolvedChannel = channel ?? "all";

  // Pick opener based on season + category hash for variety
  const openers = SEASON_COPY_OPENERS[resolvedSeason];
  const idx     = fingerprint.attributes.category.length % openers.length;
  const opener  = openers[idx] ?? openers[0];

  // Product descriptor
  const color  = fingerprint.attributes.colors.slice(0, 1).join(" y ");
  const cat    = categoryPhrase(fingerprint.attributes.category);
  const productLine = businessLine === "latin_kids" ? "Latin Kids" :
                      businessLine === "pets"       ? "Mascotas"   : "Castillitos";

  // Channel closer
  const closer = CHANNEL_COPY_CLOSERS[resolvedChannel];

  return `${opener} Nuevo ${cat}${color ? ` en ${color}` : ""} — ${productLine}. ${closer}`;
}
