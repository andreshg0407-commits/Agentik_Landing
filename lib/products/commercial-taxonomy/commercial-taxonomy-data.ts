/**
 * lib/products/commercial-taxonomy/commercial-taxonomy-data.ts
 *
 * Canonical commercial taxonomy data: family definitions, subgroup→family mapping,
 * and reference-level overrides for SPLIT subgroups.
 *
 * Version is incremented when mappings change — used for cache invalidation
 * and audit trail in store snapshots.
 */

import type { CommercialFamily, CommercialFamilyKey } from "./commercial-taxonomy-types";

export const COMMERCIAL_TAXONOMY_VERSION = 1;

/**
 * All commercial families with human-readable labels.
 * Used by presentation assembler for display.
 */
export const COMMERCIAL_FAMILIES: readonly CommercialFamily[] = [
  { key: "alimentacion", label: "ALIMENTACIÓN" },
  { key: "aseo", label: "ASEO" },
  { key: "caminador", label: "CAMINADOR" },
  { key: "comedor", label: "COMEDOR" },
  { key: "cuidado_dental", label: "CUIDADO DENTAL" },
  { key: "dormitorio", label: "DORMITORIO" },
  { key: "entretenimiento", label: "ENTRETENIMIENTO" },
  { key: "jugueteria", label: "JUGUETERÍA" },
  { key: "lactancia", label: "LACTANCIA" },
  { key: "maletas", label: "MALETAS" },
  { key: "moto", label: "MOTO" },
  { key: "organizador", label: "ORGANIZADOR" },
  { key: "peluche", label: "PELUCHE" },
  { key: "seguridad", label: "SEGURIDAD" },
  { key: "sillas", label: "SILLAS" },
  { key: "teteros", label: "TETEROS" },
  { key: "transporte", label: "TRANSPORTE" },
  { key: "sin_clasificar", label: "SIN CLASIFICAR" },
] as const;

/**
 * Direct subgroup→family mapping (SUBGROUP_RULE).
 * Key: SAG subgroup name UPPERCASED.
 * These subgroups map 1:1 to a family — no ambiguity.
 */
export const SUBGROUP_FAMILY_MAP: Record<string, CommercialFamilyKey> = {
  // alimentacion
  "ALIMENTACIÓN": "alimentacion",
  "ALIMENTACION": "alimentacion",
  "TERMOS": "alimentacion",
  "VASOS": "alimentacion",
  "PLATO": "alimentacion",
  "LONCHERA": "alimentacion",
  "BABERO": "alimentacion",

  // aseo
  "ASEO": "aseo",
  "VACENILLA": "aseo",
  "BAÑERA": "aseo",
  "LIMA": "aseo",

  // caminador
  "CAMINADOR": "caminador",
  "PASEADOR": "caminador",

  // comedor
  "COMEDOR": "comedor",

  // cuidado dental
  "CUIDADO DENTAL": "cuidado_dental",
  "CHUPO": "cuidado_dental",
  "RASCA ENCIAS": "cuidado_dental",
  "ENTRETENEDOR": "cuidado_dental",

  // dormitorio
  "DORMITORIO": "dormitorio",
  "CUNA": "dormitorio",
  "ALMOHADA": "dormitorio",

  // entretenimiento
  "JUEGOS DIDACTICOS": "entretenimiento",
  "GIMNASIO": "entretenimiento",
  "FLOTADORES": "entretenimiento",

  // jugueteria
  "JUGUETERÍA": "jugueteria",
  "JUGUETERIA": "jugueteria",
  "COCINAS": "jugueteria",
  "CAMARAS": "jugueteria",

  // lactancia
  "BOLSAS": "lactancia",
  "BOLSOS": "lactancia",
  "EXTRACTOR": "lactancia",
  "PAÑALERAS": "lactancia",

  // maletas
  "MALETA": "maletas",
  "ACCESORIOS NIÑA": "maletas",

  // moto
  "MOTO": "moto",
  "CUATRIMOTOS": "moto",
  "PATINETA": "moto",
  "TRICICLO": "moto",

  // organizador
  "ORGANIZADOR": "organizador",
  "KITS": "organizador",

  // peluche
  "PELUCHE": "peluche",

  // seguridad
  "PORTADORES": "seguridad",
  "SUJETADOR": "seguridad",
  "ESCALERA": "seguridad",

  // sillas
  "SILLAS": "sillas",
  "SILLA": "sillas",

  // teteros
  "TETERO": "teteros",
  "TETEROS": "teteros",

  // transporte
  "TRASNPORTE": "transporte",    // SAG typo preserved
  "TRANSPORTE": "transporte",
  "COCHES": "transporte",

  // accesorios genérico → sin_clasificar (needs ref-level)
  "ACCESORIOS": "sin_clasificar",
};

/**
 * SPLIT subgroups: subgroups that contain refs from multiple families.
 * These require reference-level overrides to classify correctly.
 * Unknown refs in SPLIT subgroups → sin_clasificar (safe fallback).
 */
export const SPLIT_SUBGROUPS = new Set<string>([
  "MOVILES",
  "CEPILLO",
  "COSAS VARIAS BEBE",
  "SETS",
]);

/**
 * Reference-level overrides for SPLIT subgroups and explicit reclassifications.
 * Key: referenceCode UPPERCASED.
 */
export const REFERENCE_OVERRIDES: Record<string, CommercialFamilyKey> = {
  // MOVILES split: some are transporte, rest are sin_clasificar
  "C3-QW-F6": "transporte",
  "C6-QW-F6": "transporte",
  "C7-QW-F6": "transporte",

  // CEPILLO split: some are aseo
  "34869-3": "aseo",
  "34869-1": "aseo",
  "34869-2": "aseo",

  // Explicit sin_clasificar overrides
  "YJ-7PCS": "sin_clasificar",
};
