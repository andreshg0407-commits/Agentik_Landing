/**
 * lib/marketing-studio/preset-registry.ts
 *
 * Global photo preset registry — super admin authoritative source.
 *
 * ── Preset groups ─────────────────────────────────────────────────────────────
 *
 *  LEGACY (Do Jeans / generic fashion):
 *   studio_clean_white      Universal clean studio look.  E-commerce safe.
 *   editorial_urban         Urban outdoor editorial.  Street / denim brands.
 *   lookbook_neutral        Neutral gray lookbook.  Premium / multi-category.
 *   flat_lay_minimal        Flat lay on white.  Accessories, shirts.
 *   lifestyle_street        Golden-hour street lifestyle.  Casual / youth brands.
 *
 *  CATÁLOGO (Castillitos retail catalogue):
 *   catalogo_fondo_blanco   Fondo blanco estándar para catálogo ecommerce.
 *   catalogo_ecommerce      Ecommerce multi-ángulo con variantes.
 *   catalogo_promo_producto Producto con destaque visual + precio.
 *   catalogo_juguete        Juguete en primer plano sobre fondo neutro infantil.
 *
 *  REDES (social media content):
 *   redes_reel_tiktok       TikTok/Reels vertical 9:16, niños en movimiento.
 *   redes_promo_instagram   Instagram feed 4:5, colorido, llamada a la acción.
 *   redes_oferta_flash      Flash sale, urgencia, precio prominente.
 *   redes_combo_escolar     Combo de útiles escolares, back-to-school.
 *   redes_regreso_clases    Regreso a clases, vibrante, mochilas y útiles.
 *   redes_dia_nino          Día del niño, festivo, colores brillantes.
 *   redes_navidad           Navidad, cálido, regalos y espíritu familiar.
 *
 *  CAMPAÑAS (commercial campaigns):
 *   campana_lanzamiento     Lanzamiento de producto / colección nueva.
 *   campana_outlet          Outlet / descuentos, urgencia editorial.
 *   campana_mayoristas      Catálogo profesional B2B para mayoristas.
 *   campana_tienda_fisica   In-store feel, punto de venta, activación.
 *   campana_web             Digital-first, e-commerce web.
 *   campana_activacion      Activación comercial / evento presencial.
 */

import type { PhotoPreset, GarmentCategory } from "./types";

// ═════════════════════════════════════════════════════════════════════════════
// LEGACY — Fashion / Do Jeans (kept for backward compat)
// ═════════════════════════════════════════════════════════════════════════════

const STUDIO_CLEAN_WHITE: PhotoPreset = {
  id:          "studio_clean_white",
  name:        "Estudio limpio — fondo blanco",
  description: "Fondo blanco infinito, iluminación de anillo, ángulos estándar e-commerce. " +
               "Universal para todas las categorías.",
  applicableTo: [],   // universal
  presetCategory: "catalogo",
  background: {
    type:  "solid_color",
    value: "#ffffff",
    alternatives: ["#f5f5f5", "#fafafa"],
  },
  lighting: {
    setup:        "ring",
    temperature:  "neutral",
    shadowPolicy: "soft",
  },
  angles: [
    { angle: "front",         required: true,  frameHint: "Cuerpo completo, posición neutra" },
    { angle: "back",          required: true,  frameHint: "Cuerpo completo de espalda" },
    { angle: "side_left",     required: false, frameHint: "Perfil izquierdo" },
    { angle: "three_quarter", required: false, frameHint: "Tres cuartos frontal" },
    { angle: "detail",        required: true,  frameHint: "Detalle de tejido, costuras o etiqueta" },
  ],
  style:              "ecommerce_clean",
  defaultModelGender: "women",
  aiPromptHint:       "clean white studio, professional fashion photography, neutral background",
  tags:               ["e-commerce", "universal", "clean", "white"],
  overridePolicy: {
    background:  true,
    lighting:    false,
    angles:      true,
    style:       false,
    modelGender: true,
  },
};

const EDITORIAL_URBAN: PhotoPreset = {
  id:          "editorial_urban",
  name:        "Editorial urbano",
  description: "Entorno urbano exterior con luz natural y ángulos editoriales. " +
               "Ideal para denim, streetwear y colecciones juveniles.",
  applicableTo: ["jeans", "pants", "shorts", "jacket", "outerwear", "activewear"],
  presetCategory: "campanas",
  background: {
    type:  "outdoor",
    value: "urban street / wall / concrete",
    alternatives: ["brick wall", "graffiti backdrop", "city rooftop"],
  },
  lighting: {
    setup:        "natural",
    temperature:  "warm",
    shadowPolicy: "hard",
  },
  angles: [
    { angle: "front",         required: true,  frameHint: "Postura dinámica, fondo urbano" },
    { angle: "three_quarter", required: true,  frameHint: "Tres cuartos — movimiento o andando" },
    { angle: "detail",        required: true,  frameHint: "Detalle de bordado, wash o hardware" },
    { angle: "back",          required: false, frameHint: "De espaldas, contexto urbano" },
  ],
  style:              "street",
  defaultModelGender: "men",
  aiPromptHint:       "urban editorial, street fashion photography, natural light, city background",
  tags:               ["editorial", "urban", "street", "denim", "youth"],
  overridePolicy: {
    background:  true,
    lighting:    true,
    angles:      true,
    style:       true,
    modelGender: true,
  },
};

const LOOKBOOK_NEUTRAL: PhotoPreset = {
  id:          "lookbook_neutral",
  name:        "Lookbook neutral",
  description: "Fondo gris neutro con softbox difuso y ángulos editoriales múltiples. " +
               "Polivalente para marcas premium y catálogos de temporada.",
  applicableTo: [],   // universal
  presetCategory: "catalogo",
  background: {
    type:  "solid_color",
    value: "#e5e5e5",
    alternatives: ["#d1d5db", "#f3f4f6"],
  },
  lighting: {
    setup:        "softbox",
    temperature:  "neutral",
    shadowPolicy: "soft",
  },
  angles: [
    { angle: "front",         required: true,  frameHint: "Cuerpo completo — posición de editorial" },
    { angle: "three_quarter", required: true,  frameHint: "Tres cuartos con mirada lateral" },
    { angle: "back",          required: true,  frameHint: "Cuerpo completo de espalda" },
    { angle: "detail",        required: true,  frameHint: "Detalle de acabado o tejido premium" },
    { angle: "side_right",    required: false, frameHint: "Perfil para silueta limpia" },
  ],
  style:              "lookbook",
  defaultModelGender: "women",
  aiPromptHint:       "minimalist lookbook, neutral grey studio, softbox lighting, fashion editorial",
  tags:               ["lookbook", "premium", "neutral", "seasonal"],
  overridePolicy: {
    background:  true,
    lighting:    false,
    angles:      true,
    style:       false,
    modelGender: true,
  },
};

const FLAT_LAY_MINIMAL: PhotoPreset = {
  id:          "flat_lay_minimal",
  name:        "Flat lay minimalista",
  description: "Composición horizontal sobre fondo blanco con iluminación cenital. " +
               "Ideal para accesorios, camisas, prendas con detalle de estampado.",
  applicableTo: ["shirt", "blouse", "accessories", "footwear"],
  presetCategory: "catalogo",
  background: {
    type:  "solid_color",
    value: "#ffffff",
    alternatives: ["#f9fafb", "#f5f0eb"],
  },
  lighting: {
    setup:        "white_studio",
    temperature:  "neutral",
    shadowPolicy: "none",
  },
  angles: [
    { angle: "flat_lay",  required: true,  frameHint: "Vista aérea centrada, producto en foco" },
    { angle: "overhead",  required: true,  frameHint: "Plano cenital con composición limpia" },
    { angle: "detail",    required: false, frameHint: "Macro de tejido, bordado o estampado" },
  ],
  style:              "flat_lay",
  aiPromptHint:       "flat lay photography, overhead shot, white background, minimalist product",
  tags:               ["flat-lay", "overhead", "accessories", "minimal", "product"],
  overridePolicy: {
    background:  true,
    lighting:    false,
    angles:      false,
    style:       false,
    modelGender: false,
  },
};

const LIFESTYLE_STREET: PhotoPreset = {
  id:          "lifestyle_street",
  name:        "Lifestyle de calle",
  description: "Fotografía de estilo de vida en exterior dorado con ángulos dinámicos y candidatos. " +
               "Perfecta para marcas casuales y colecciones de temporada cálida.",
  applicableTo: ["jeans", "pants", "dress", "skirt", "shirt", "blouse", "activewear"],
  presetCategory: "campanas",
  background: {
    type:  "outdoor",
    value: "golden hour street, park or plaza",
    alternatives: ["beachfront", "rooftop terrace", "botanical garden"],
  },
  lighting: {
    setup:        "golden_hour",
    temperature:  "warm",
    shadowPolicy: "soft",
  },
  angles: [
    { angle: "front",         required: true,  frameHint: "Sonriendo o en movimiento, hora dorada" },
    { angle: "three_quarter", required: true,  frameHint: "Perfil con fondo difuminado (bokeh)" },
    { angle: "detail",        required: false, frameHint: "Accesorio o detalle de prenda" },
    { angle: "back",          required: false, frameHint: "Caminando de espaldas hacia la luz" },
  ],
  style:              "lifestyle",
  defaultModelGender: "women",
  aiPromptHint:       "golden hour lifestyle photography, warm light, candid fashion, outdoor street",
  tags:               ["lifestyle", "golden-hour", "casual", "outdoor", "warm"],
  overridePolicy: {
    background:  true,
    lighting:    true,
    angles:      true,
    style:       true,
    modelGender: true,
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// CATÁLOGO — Castillitos retail catalogue
// ═════════════════════════════════════════════════════════════════════════════

const CATALOGO_FONDO_BLANCO: PhotoPreset = {
  id:          "catalogo_fondo_blanco",
  name:        "Catálogo — Fondo blanco",
  description: "Fondo blanco puro, producto centrado. Estándar para fichas de catálogo ecommerce y " +
               "material impreso. Compatible con todos los productos Castillitos.",
  applicableTo: [],  // universal — all Castillitos categories
  presetCategory: "catalogo",
  background: {
    type:  "solid_color",
    value: "#ffffff",
    alternatives: ["#f8f8f8"],
  },
  lighting: {
    setup:        "white_studio",
    temperature:  "neutral",
    shadowPolicy: "none",
  },
  angles: [
    { angle: "front",    required: true,  frameHint: "Producto centrado, fondo blanco infinito" },
    { angle: "back",     required: false, frameHint: "Reverso del producto" },
    { angle: "detail",   required: false, frameHint: "Detalle o etiqueta" },
    { angle: "flat_lay", required: false, frameHint: "Producto extendido sobre fondo blanco" },
  ],
  style:         "ecommerce_clean",
  aiPromptHint:  "pure white background, product photography, clean studio, no shadows, centered composition, ecommerce ready",
  tags:          ["catálogo", "fondo-blanco", "ecommerce", "producto-limpio"],
  overridePolicy: {
    background:  false,
    lighting:    false,
    angles:      true,
    style:       false,
    modelGender: false,
  },
};

const CATALOGO_ECOMMERCE: PhotoPreset = {
  id:          "catalogo_ecommerce",
  name:        "Catálogo — Ecommerce completo",
  description: "Sesión ecommerce multi-ángulo: frente, reverso, detalle y flat lay. " +
               "Produce el set completo para publicar producto en tienda web.",
  applicableTo: ["kids_clothing", "toy", "school_supplies", "baby", "accessories"],
  presetCategory: "catalogo",
  background: {
    type:  "solid_color",
    value: "#ffffff",
    alternatives: ["#f5f5f5"],
  },
  lighting: {
    setup:        "softbox",
    temperature:  "neutral",
    shadowPolicy: "soft",
  },
  angles: [
    { angle: "front",         required: true,  frameHint: "Frente — producto en foco completo" },
    { angle: "back",          required: true,  frameHint: "Reverso completo" },
    { angle: "three_quarter", required: true,  frameHint: "Tres cuartos para mostrar volumen" },
    { angle: "detail",        required: true,  frameHint: "Detalle de acabado, etiqueta o estampado" },
    { angle: "flat_lay",      required: false, frameHint: "Flat lay con accesorios complementarios" },
  ],
  style:              "ecommerce_clean",
  defaultModelGender: "kids",
  aiPromptHint:       "clean ecommerce product photography, white studio, multiple angles, kids product, professional lighting",
  tags:               ["ecommerce", "multi-ángulo", "set-completo", "catálogo"],
  overridePolicy: {
    background:  false,
    lighting:    false,
    angles:      true,
    style:       false,
    modelGender: true,
  },
};

const CATALOGO_PROMO_PRODUCTO: PhotoPreset = {
  id:          "catalogo_promo_producto",
  name:        "Catálogo — Promo producto",
  description: "Producto destacado con acento cromático suave. Indicado para fichas con " +
               "precio visible, combo o promoción especial. Fondo blanco con toque de color.",
  applicableTo: [],  // universal
  presetCategory: "catalogo",
  background: {
    type:  "gradient",
    value: "soft white-to-pastel gradient",
    alternatives: ["#ffffff to #FFF3E0", "#ffffff to #E3F2FD"],
  },
  lighting: {
    setup:        "ring",
    temperature:  "warm",
    shadowPolicy: "soft",
  },
  angles: [
    { angle: "front",   required: true,  frameHint: "Producto en tres cuartos, ligeramente inclinado" },
    { angle: "detail",  required: true,  frameHint: "Zoom en elemento diferenciador del producto" },
    { angle: "flat_lay",required: false, frameHint: "Composición flat con precio o etiqueta de promo" },
  ],
  style:         "studio_clean",
  aiPromptHint:  "product promo photo, soft gradient background, warm ring light, vibrant colors, retail promotional photography",
  tags:          ["promo", "oferta", "producto-destacado", "precio"],
  overridePolicy: {
    background:  true,
    lighting:    true,
    angles:      true,
    style:       false,
    modelGender: false,
  },
};

const CATALOGO_JUGUETE: PhotoPreset = {
  id:          "catalogo_juguete",
  name:        "Catálogo — Juguete destacado",
  description: "Juguete en primer plano sobre fondo neutro con props infantiles discretos. " +
               "Iluminación suave y cálida que transmite diversión y seguridad.",
  applicableTo: ["toy", "game", "seasonal_item"],
  presetCategory: "catalogo",
  background: {
    type:  "solid_color",
    value: "#f0f4ff",   // light blue-white, playful but clean
    alternatives: ["#fffdf0", "#f5f0ff"],
  },
  lighting: {
    setup:        "softbox",
    temperature:  "warm",
    shadowPolicy: "soft",
  },
  angles: [
    { angle: "front",    required: true,  frameHint: "Juguete centrado, perspectiva levemente elevada" },
    { angle: "overhead", required: false, frameHint: "Vista cenital — ideal para juegos de mesa" },
    { angle: "detail",   required: true,  frameHint: "Detalle de acabado, colores o piezas clave" },
    { angle: "three_quarter", required: false, frameHint: "Ángulo 3/4 mostrando profundidad del juguete" },
  ],
  style:         "studio_clean",
  aiPromptHint:  "toy photography, soft light background, child-friendly, colorful, playful studio, product shot, safe and fun aesthetic",
  tags:          ["juguete", "toy", "infantil", "catálogo", "juego"],
  overridePolicy: {
    background:  true,
    lighting:    false,
    angles:      true,
    style:       false,
    modelGender: false,
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// REDES — Social media content
// ═════════════════════════════════════════════════════════════════════════════

const REDES_REEL_TIKTOK: PhotoPreset = {
  id:          "redes_reel_tiktok",
  name:        "Redes — Reel / TikTok",
  description: "Formato vertical 9:16 optimizado para TikTok y Reels. " +
               "Niños o modelos en movimiento con fondo colorido y energético.",
  applicableTo: ["kids_clothing", "toy", "seasonal_item"],
  presetCategory: "redes",
  background: {
    type:  "lifestyle_set",
    value: "colorful indoor playroom or outdoor park, vibrant props",
    alternatives: ["bright classroom setting", "playground"],
  },
  lighting: {
    setup:        "natural",
    temperature:  "warm",
    shadowPolicy: "soft",
  },
  angles: [
    { angle: "front",   required: true,  frameHint: "Formato 9:16 vertical — niño en pose dinámica o jugando" },
    { angle: "detail",  required: false, frameHint: "Close-up de prenda o juguete en acción" },
  ],
  style:              "lifestyle",
  defaultModelGender: "kids",
  aiPromptHint:       "vertical 9:16 format, TikTok reel style, kids fashion, energetic and playful, bright colors, movement, candid lifestyle",
  tags:               ["tiktok", "reel", "vertical", "kids", "movimiento", "redes"],
  recommendedSeasons: ["normal", "regreso_clases", "navidad", "dia_nino"],
  recommendedChannels: ["web", "tiendas"],
  overridePolicy: {
    background:  true,
    lighting:    true,
    angles:      false,
    style:       true,
    modelGender: true,
  },
};

const REDES_PROMO_INSTAGRAM: PhotoPreset = {
  id:          "redes_promo_instagram",
  name:        "Redes — Promo Instagram",
  description: "Feed Instagram 4:5. Producto + modelo con paleta de colores vibrante, " +
               "llamada a la acción visual implícita. Equilibrio estético y comercial.",
  applicableTo: ["kids_clothing", "toy", "school_supplies", "accessories"],
  presetCategory: "redes",
  background: {
    type:  "lifestyle_set",
    value: "bright studio or outdoor — consistent brand color palette",
    alternatives: ["pastel indoor set", "white studio with color accent"],
  },
  lighting: {
    setup:        "softbox",
    temperature:  "warm",
    shadowPolicy: "soft",
  },
  angles: [
    { angle: "front",         required: true,  frameHint: "Composición 4:5 — sujeto en centro, fondo equilibrado" },
    { angle: "three_quarter", required: false, frameHint: "Tres cuartos — dinamismo con fondo visible" },
    { angle: "detail",        required: false, frameHint: "Detalle de producto para carousel" },
  ],
  style:              "lifestyle",
  defaultModelGender: "kids",
  aiPromptHint:       "Instagram feed photography, 4:5 aspect, vibrant brand colors, kids fashion, clean composition, commercial lifestyle",
  tags:               ["instagram", "feed", "4:5", "promo", "colorido", "redes"],
  recommendedSeasons: ["normal", "dia_nino", "navidad"],
  recommendedChannels: ["web", "tiendas"],
  overridePolicy: {
    background:  true,
    lighting:    true,
    angles:      true,
    style:       true,
    modelGender: true,
  },
};

const REDES_OFERTA_FLASH: PhotoPreset = {
  id:          "redes_oferta_flash",
  name:        "Redes — Oferta flash",
  description: "Visual de urgencia: producto en primer plano, precio prominente, " +
               "colores saturados que comunican acción inmediata. Stories y feed.",
  applicableTo: [],  // universal — any product on flash sale
  presetCategory: "redes",
  background: {
    type:  "solid_color",
    value: "#FF4444",   // urgent red — can be overridden
    alternatives: ["#FF6B00", "#FFD600", "#1565C0"],
  },
  lighting: {
    setup:        "ring",
    temperature:  "neutral",
    shadowPolicy: "none",
  },
  angles: [
    { angle: "front",   required: true,  frameHint: "Producto centrado, espacio para texto de precio/oferta" },
    { angle: "detail",  required: false, frameHint: "Close-up de etiqueta de precio o elemento promo" },
  ],
  style:         "studio_clean",
  aiPromptHint:  "flash sale product photo, bold bright background, clean product shot, commercial retail urgency, price tag visible",
  tags:          ["oferta", "flash", "descuento", "urgencia", "precio", "redes"],
  recommendedSeasons: ["normal"],
  recommendedChannels: ["all"],
  overridePolicy: {
    background:  true,
    lighting:    false,
    angles:      true,
    style:       false,
    modelGender: false,
  },
};

const REDES_COMBO_ESCOLAR: PhotoPreset = {
  id:          "redes_combo_escolar",
  name:        "Redes — Combo escolar",
  description: "Composición de combo: múltiples productos escolares agrupados " +
               "con paleta regreso-a-clases (azul/amarillo/verde). Flat lay o set minimalista.",
  applicableTo: ["school_supplies", "kids_clothing", "accessories"],
  presetCategory: "redes",
  background: {
    type:  "solid_color",
    value: "#EFF6FF",    // light school-blue
    alternatives: ["#FFFDE7", "#F0FFF4"],
  },
  lighting: {
    setup:        "white_studio",
    temperature:  "neutral",
    shadowPolicy: "none",
  },
  angles: [
    { angle: "flat_lay", required: true,  frameHint: "Flat lay de combo de productos — útiles + ropa" },
    { angle: "overhead", required: false, frameHint: "Cenital con composición de combo escolar" },
    { angle: "front",    required: false, frameHint: "Producto principal del combo en frente" },
  ],
  style:         "flat_lay",
  aiPromptHint:  "back to school combo flat lay, school supplies and kids clothing, light blue background, organized composition, clean retail photography",
  tags:          ["combo", "escolar", "back-to-school", "útiles", "redes"],
  recommendedSeasons: ["regreso_clases"],
  recommendedChannels: ["web", "tiendas", "empresa"],
  overridePolicy: {
    background:  true,
    lighting:    false,
    angles:      true,
    style:       false,
    modelGender: false,
  },
};

const REDES_REGRESO_CLASES: PhotoPreset = {
  id:          "redes_regreso_clases",
  name:        "Redes — Regreso a clases",
  description: "Campaña back-to-school: niños con mochilas y útiles, paleta vibrante, " +
               "energía positiva de inicio de año. TikTok, Instagram, Stories.",
  applicableTo: ["kids_clothing", "school_supplies", "accessories"],
  presetCategory: "redes",
  background: {
    type:  "lifestyle_set",
    value: "school corridor, classroom entrance, or bright outdoor with backpack",
    alternatives: ["colorful staircase", "school gate with sunshine"],
  },
  lighting: {
    setup:        "natural",
    temperature:  "warm",
    shadowPolicy: "soft",
  },
  angles: [
    { angle: "front",         required: true,  frameHint: "Niño con mochila, sonrisa, listo para ir al colegio" },
    { angle: "three_quarter", required: false, frameHint: "Niño caminando con mochila — movimiento" },
    { angle: "detail",        required: false, frameHint: "Detalle de mochila, útiles o accesorio escolar" },
  ],
  style:              "lifestyle",
  defaultModelGender: "kids",
  aiPromptHint:       "back to school lifestyle photography, happy child with backpack, bright colors, school setting, warm natural light, vibrant kids fashion",
  tags:               ["regreso-a-clases", "back-to-school", "kids", "colegio", "mochila", "redes"],
  recommendedSeasons: ["regreso_clases"],
  recommendedChannels: ["web", "tiendas", "empresa"],
  overridePolicy: {
    background:  true,
    lighting:    true,
    angles:      true,
    style:       true,
    modelGender: true,
  },
};

const REDES_DIA_NINO: PhotoPreset = {
  id:          "redes_dia_nino",
  name:        "Redes — Día del niño",
  description: "Celebración festiva: colores brillantes, globos, confetti, alegría. " +
               "Comunicación emocional y lúdica. Formato stories y feed.",
  applicableTo: ["kids_clothing", "toy", "seasonal_item", "game"],
  presetCategory: "redes",
  background: {
    type:  "lifestyle_set",
    value: "festive indoor set with balloons, confetti, colorful streamers",
    alternatives: ["party backdrop with children", "colorful outdoor birthday-style set"],
  },
  lighting: {
    setup:        "softbox",
    temperature:  "warm",
    shadowPolicy: "soft",
  },
  angles: [
    { angle: "front",   required: true,  frameHint: "Niño feliz con producto o juguete, fondo festivo" },
    { angle: "detail",  required: false, frameHint: "Detalle del juguete o prenda entre globos" },
    { angle: "overhead",required: false, frameHint: "Vista cenital de productos entre decoración festiva" },
  ],
  style:              "lifestyle",
  defaultModelGender: "kids",
  aiPromptHint:       "children's day celebration photography, colorful balloons and confetti, happy child, festive indoor setting, bright joyful colors, kids toy or clothing",
  tags:               ["día-del-niño", "celebración", "globos", "festivo", "kids", "redes"],
  recommendedSeasons: ["dia_nino"],
  recommendedChannels: ["all"],
  overridePolicy: {
    background:  true,
    lighting:    true,
    angles:      true,
    style:       true,
    modelGender: true,
  },
};

const REDES_NAVIDAD: PhotoPreset = {
  id:          "redes_navidad",
  name:        "Redes — Navidad",
  description: "Navidad familiar y cálida: árbol, regalos, luces, noche buena. " +
               "Paleta rojo/verde/dorado. Emoción de temporada navideña.",
  applicableTo: ["kids_clothing", "toy", "seasonal_item", "game"],
  presetCategory: "redes",
  background: {
    type:  "lifestyle_set",
    value: "Christmas living room setting — tree, lights, gifts, warm glow",
    alternatives: ["snowy outdoor scene", "fireplace with stockings"],
  },
  lighting: {
    setup:        "golden_hour",
    temperature:  "warm",
    shadowPolicy: "soft",
  },
  angles: [
    { angle: "front",   required: true,  frameHint: "Niño o producto con árbol navideño al fondo" },
    { angle: "detail",  required: false, frameHint: "Detalle del producto envuelto como regalo" },
    { angle: "flat_lay",required: false, frameHint: "Flat lay de producto entre decoración navideña" },
  ],
  style:              "lifestyle",
  defaultModelGender: "kids",
  aiPromptHint:       "Christmas product photography, warm holiday setting, Christmas tree, golden lights, red and green palette, gift wrapping, kids toys and clothing, festive joyful",
  tags:               ["navidad", "christmas", "regalo", "árbol", "temporada", "redes"],
  recommendedSeasons: ["navidad"],
  recommendedChannels: ["all"],
  overridePolicy: {
    background:  true,
    lighting:    true,
    angles:      true,
    style:       true,
    modelGender: true,
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// CAMPAÑAS — Commercial campaigns
// ═════════════════════════════════════════════════════════════════════════════

const CAMPANA_LANZAMIENTO: PhotoPreset = {
  id:          "campana_lanzamiento",
  name:        "Campaña — Lanzamiento",
  description: "Lanzamiento de colección o producto nuevo: impacto visual, emoción, " +
               "producto como protagonista absoluto. Alta producción.",
  applicableTo: [],  // universal
  presetCategory: "campanas",
  background: {
    type:  "gradient",
    value: "dark-to-light diagonal gradient, brand colors",
    alternatives: ["pure black", "premium dark studio"],
  },
  lighting: {
    setup:        "dramatic",
    temperature:  "cool",
    shadowPolicy: "hard",
  },
  angles: [
    { angle: "front",         required: true,  frameHint: "Producto o modelo como protagonista, iluminación dramática" },
    { angle: "three_quarter", required: true,  frameHint: "Ángulo de lanzamiento — movimiento, dynamismo" },
    { angle: "detail",        required: true,  frameHint: "Close-up del detalle diferenciador del nuevo producto" },
  ],
  style:              "editorial",
  defaultModelGender: "kids",
  aiPromptHint:       "product launch campaign photography, dramatic lighting, bold visual impact, new collection reveal, high production value, cinematic",
  tags:               ["lanzamiento", "campaña", "nuevo", "colección", "impacto"],
  recommendedSeasons: ["normal", "regreso_clases", "navidad"],
  recommendedChannels: ["all"],
  overridePolicy: {
    background:  true,
    lighting:    true,
    angles:      true,
    style:       true,
    modelGender: true,
  },
};

const CAMPANA_OUTLET: PhotoPreset = {
  id:          "campana_outlet",
  name:        "Campaña — Outlet / Descuentos",
  description: "Visual de descuentos con urgencia editorial: etiquetas de precio visibles, " +
               "composición energética. Outlet, liquidación, temporada baja.",
  applicableTo: [],  // universal
  presetCategory: "campanas",
  background: {
    type:  "solid_color",
    value: "#FFF9C4",   // warm yellow — clearance feel
    alternatives: ["#FFE0E0", "#E8F5E9"],
  },
  lighting: {
    setup:        "white_studio",
    temperature:  "neutral",
    shadowPolicy: "soft",
  },
  angles: [
    { angle: "front",   required: true,  frameHint: "Producto prominente con tag de precio visible" },
    { angle: "flat_lay",required: false, frameHint: "Flat lay de varios artículos de outlet" },
    { angle: "detail",  required: false, frameHint: "Detalle de etiqueta de descuento o precio" },
  ],
  style:         "ecommerce_clean",
  aiPromptHint:  "outlet sale product photography, clearance deal, bright clean background, price tag visible, multiple products, high-contrast promotional retail",
  tags:          ["outlet", "descuento", "liquidación", "oferta", "campaña"],
  recommendedSeasons: ["normal"],
  recommendedChannels: ["tiendas", "web"],
  overridePolicy: {
    background:  true,
    lighting:    false,
    angles:      true,
    style:       false,
    modelGender: false,
  },
};

const CAMPANA_MAYORISTAS: PhotoPreset = {
  id:          "campana_mayoristas",
  name:        "Campaña — Mayoristas",
  description: "Catálogo profesional B2B para distribuidores y mayoristas. " +
               "Fondo neutro, múltiples ángulos técnicos, calidad de impresión.",
  applicableTo: [],  // universal
  presetCategory: "campanas",
  background: {
    type:  "solid_color",
    value: "#f0f0f0",   // neutral gray — professional B2B feel
    alternatives: ["#e8e8e8", "#ffffff"],
  },
  lighting: {
    setup:        "softbox",
    temperature:  "neutral",
    shadowPolicy: "soft",
  },
  angles: [
    { angle: "front",         required: true,  frameHint: "Frente técnico — todas las referencias claras" },
    { angle: "back",          required: true,  frameHint: "Reverso técnico" },
    { angle: "detail",        required: true,  frameHint: "Etiqueta, código de producto, talla o referencia" },
    { angle: "three_quarter", required: false, frameHint: "Ángulo adicional para catálogo impreso" },
    { angle: "flat_lay",      required: false, frameHint: "Flat lay del surtido de la referencia" },
  ],
  style:         "ecommerce_clean",
  aiPromptHint:  "B2B wholesale catalogue photography, neutral gray background, professional product documentation, clean technical photography, multiple angles, reference codes visible",
  tags:          ["mayoristas", "B2B", "catálogo-técnico", "distribuidores", "campaña"],
  recommendedSeasons: ["normal"],
  recommendedChannels: ["mayoristas", "empresa"],
  overridePolicy: {
    background:  false,
    lighting:    false,
    angles:      true,
    style:       false,
    modelGender: false,
  },
};

const CAMPANA_TIENDA_FISICA: PhotoPreset = {
  id:          "campana_tienda_fisica",
  name:        "Campaña — Tienda física",
  description: "Activación de punto de venta: ambiente in-store, displays, maniquíes, " +
               "interacción del cliente. Material para señalización y redes.",
  applicableTo: ["kids_clothing", "toy", "accessories"],
  presetCategory: "campanas",
  background: {
    type:  "lifestyle_set",
    value: "retail store interior — clothing racks, display shelves, bright store lighting",
    alternatives: ["fitting room background", "store entrance with product display"],
  },
  lighting: {
    setup:        "white_studio",
    temperature:  "warm",
    shadowPolicy: "soft",
  },
  angles: [
    { angle: "front",   required: true,  frameHint: "Modelo o maniquí en ambiente de tienda" },
    { angle: "detail",  required: false, frameHint: "Display o exhibición del producto en tienda" },
    { angle: "lifestyle_set", required: false, frameHint: "Cliente interactuando con producto en tienda" } as any,
  ],
  style:              "lifestyle",
  defaultModelGender: "kids",
  aiPromptHint:       "retail store photography, kids clothing store interior, bright display, in-store activation, warm store lighting, natural customer interaction",
  tags:               ["tienda-física", "in-store", "punto-de-venta", "activación", "campaña"],
  recommendedSeasons: ["regreso_clases", "navidad", "dia_nino"],
  recommendedChannels: ["tiendas"],
  overridePolicy: {
    background:  true,
    lighting:    true,
    angles:      true,
    style:       true,
    modelGender: true,
  },
};

const CAMPANA_WEB: PhotoPreset = {
  id:          "campana_web",
  name:        "Campaña — Web / E-commerce",
  description: "Digital-first: optimizado para web y app. Producto limpio, colores fieles, " +
               "carga rápida. Banner, hero, grid de productos.",
  applicableTo: [],  // universal
  presetCategory: "campanas",
  background: {
    type:  "solid_color",
    value: "#ffffff",
    alternatives: ["#f8fafc", "#f0f9ff"],
  },
  lighting: {
    setup:        "ring",
    temperature:  "neutral",
    shadowPolicy: "none",
  },
  angles: [
    { angle: "front",         required: true,  frameHint: "Hero shot — producto o modelo centrado, formato banner web" },
    { angle: "three_quarter", required: false, frameHint: "Variante para grid de productos" },
    { angle: "detail",        required: false, frameHint: "Zoom para hover o galería secundaria" },
  ],
  style:              "ecommerce_clean",
  defaultModelGender: "kids",
  aiPromptHint:       "web ecommerce product photography, clean white background, digital-first, optimized colors, banner hero image, kids product or clothing, professional",
  tags:               ["web", "ecommerce", "digital", "banner", "hero", "campaña"],
  recommendedSeasons: ["normal", "regreso_clases", "navidad"],
  recommendedChannels: ["web"],
  overridePolicy: {
    background:  true,
    lighting:    false,
    angles:      true,
    style:       false,
    modelGender: true,
  },
};

const CAMPANA_ACTIVACION: PhotoPreset = {
  id:          "campana_activacion",
  name:        "Campaña — Activación comercial",
  description: "Evento o activación presencial: energía, movimiento, gente interactuando. " +
               "Pop-up, feria, evento de temporada. Material dinámico y emocional.",
  applicableTo: ["kids_clothing", "toy", "seasonal_item"],
  presetCategory: "campanas",
  background: {
    type:  "outdoor",
    value: "event venue, plaza, or commercial fair with branded backdrop",
    alternatives: ["pop-up store setup", "outdoor market activation"],
  },
  lighting: {
    setup:        "natural",
    temperature:  "warm",
    shadowPolicy: "soft",
  },
  angles: [
    { angle: "front",         required: true,  frameHint: "Momento del evento — gente, producto, energía" },
    { angle: "three_quarter", required: false, frameHint: "Ángulo dinámico del stand o activación" },
    { angle: "detail",        required: false, frameHint: "Detalle de material de merchandising o producto en evento" },
  ],
  style:              "lifestyle",
  defaultModelGender: "kids",
  aiPromptHint:       "commercial activation photography, event atmosphere, outdoor fair or pop-up, brand presence, people interacting with products, energetic and warm",
  tags:               ["activación", "evento", "pop-up", "feria", "presencial", "campaña"],
  recommendedSeasons: ["dia_nino", "navidad", "regreso_clases"],
  recommendedChannels: ["tiendas", "empresa"],
  overridePolicy: {
    background:  true,
    lighting:    true,
    angles:      true,
    style:       true,
    modelGender: true,
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// Registry
// ═════════════════════════════════════════════════════════════════════════════

export const ALL_PRESETS: readonly PhotoPreset[] = [
  // Legacy / Do Jeans
  STUDIO_CLEAN_WHITE,
  EDITORIAL_URBAN,
  LOOKBOOK_NEUTRAL,
  FLAT_LAY_MINIMAL,
  LIFESTYLE_STREET,
  // Catálogo
  CATALOGO_FONDO_BLANCO,
  CATALOGO_ECOMMERCE,
  CATALOGO_PROMO_PRODUCTO,
  CATALOGO_JUGUETE,
  // Redes
  REDES_REEL_TIKTOK,
  REDES_PROMO_INSTAGRAM,
  REDES_OFERTA_FLASH,
  REDES_COMBO_ESCOLAR,
  REDES_REGRESO_CLASES,
  REDES_DIA_NINO,
  REDES_NAVIDAD,
  // Campañas
  CAMPANA_LANZAMIENTO,
  CAMPANA_OUTLET,
  CAMPANA_MAYORISTAS,
  CAMPANA_TIENDA_FISICA,
  CAMPANA_WEB,
  CAMPANA_ACTIVACION,
] as const;

export const PRESET_REGISTRY: ReadonlyMap<string, PhotoPreset> = new Map(
  ALL_PRESETS.map(p => [p.id, p]),
);

// ── Lookups ────────────────────────────────────────────────────────────────────

/** Returns a preset by id, or null if not found. */
export function getPreset(id: string): PhotoPreset | null {
  return PRESET_REGISTRY.get(id) ?? null;
}

/** Returns all presets applicable to a given GarmentCategory. */
export function getPresetsForCategory(category: GarmentCategory): PhotoPreset[] {
  return ALL_PRESETS.filter(
    p => p.applicableTo.length === 0 || p.applicableTo.includes(category),
  );
}

/** Returns presets that a tenant is allowed to use, ordered by registry position. */
export function getTenantPresets(allowedIds: string[]): PhotoPreset[] {
  const allowed = new Set(allowedIds);
  return ALL_PRESETS.filter(p => allowed.has(p.id));
}

/** Returns all presets in a given category group. */
export function getPresetsByCategory(category: import("./types").PresetCategory): PhotoPreset[] {
  return ALL_PRESETS.filter(p => p.presetCategory === category);
}

/** Returns presets recommended for a given retail season. */
export function getPresetsForSeason(season: import("./types").RetailSeason): PhotoPreset[] {
  return ALL_PRESETS.filter(p =>
    !p.recommendedSeasons || p.recommendedSeasons.includes(season),
  );
}

/** Returns presets recommended for a given campaign channel. */
export function getPresetsForChannel(channel: import("./types").CampaignChannel): PhotoPreset[] {
  return ALL_PRESETS.filter(p =>
    !p.recommendedChannels ||
    p.recommendedChannels.includes(channel) ||
    p.recommendedChannels.includes("all"),
  );
}
