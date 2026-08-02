/**
 * lib/products/commercial-taxonomy/commercial-taxonomy-types.ts
 *
 * Type definitions for the commercial taxonomy domain.
 * Accessory products (line=5) are classified into commercial families
 * for composition analysis in store inventory.
 */

export type CommercialFamilyKey =
  | "alimentacion"
  | "aseo"
  | "caminador"
  | "comedor"
  | "cuidado_dental"
  | "dormitorio"
  | "entretenimiento"
  | "jugueteria"
  | "lactancia"
  | "maletas"
  | "moto"
  | "organizador"
  | "peluche"
  | "seguridad"
  | "sillas"
  | "teteros"
  | "transporte"
  | "sin_clasificar";

export interface CommercialFamily {
  readonly key: CommercialFamilyKey;
  readonly label: string;
}

export type TaxonomyRuleType = "SUBGROUP_RULE" | "REFERENCE_OVERRIDE" | "SPLIT";

export interface TaxonomyResolverInput {
  readonly referenceCode: string;
  readonly subgrupoSag: string | null;
}

export interface TaxonomyResolverResult {
  readonly familyKey: CommercialFamilyKey;
  readonly ruleType: TaxonomyRuleType;
}
