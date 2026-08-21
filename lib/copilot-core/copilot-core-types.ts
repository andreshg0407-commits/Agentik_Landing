/**
 * lib/copilot-core/copilot-core-types.ts
 *
 * Copilot Core Foundation — Canonical Type Contracts
 * Sprint: COPILOT-CORE-FOUNDATION-01B1
 *
 * Pure types. No runtime, no Prisma, no SDK, no side effects.
 *
 * ROLE ALIGNMENT:
 *   MembershipRole mirrors Prisma enum Role (schema.prisma:35–43):
 *     SUPER_ADMIN | AGENTIK_ADMIN | ORG_ADMIN | MANAGER | OPERATOR | VIEWER | BILLING
 *
 *   PlatformRole is a separate dimension from MembershipRole.
 *   Only SUPER_ADMIN and AGENTIK_ADMIN have platform privileges.
 *   Regular users have platformRole = null (not "USER").
 *
 *   Seller is NOT a role — it is an operational binding (actorScope + sellerId).
 *   See lib/comercial/frontline/frontline-types.ts for canonical seller identity.
 */

// ── Actor Scope ──────────────────────────────────────────────────────────────

/**
 * Scope of the actor making a copilot request.
 *
 * INVARIANT: actorScope is determined server-side from session data.
 * If actorScope is "seller", the actor is confined to their certified
 * sellerId. No field — platformRole, membershipRole, capability, module,
 * or input parameter — can override this confinement. To act with
 * organization scope, a separate envelope must be derived server-side
 * for an actor with organizational authority.
 */
export type ActorScope =
  | "organization"   // org-wide visibility (ORG_ADMIN, MANAGER with org access)
  | "seller"         // confined to a single certified sellerId
  | "self";          // confined to the requesting user only

// ── Roles ────────────────────────────────────────────────────────────────────

/**
 * Platform-level role. Derived from User model, not Membership.
 * Only AGENTIK_ADMIN and SUPER_ADMIN have platform privileges.
 * Regular users have platformRole = null.
 */
export type PlatformRole =
  | "SUPER_ADMIN"
  | "AGENTIK_ADMIN";

/**
 * Membership role — mirrors Prisma enum Role exactly.
 * Source: prisma/schema.prisma:35–43
 *
 * These are the ONLY valid values. Copilot Core does not invent roles.
 * A seller is identified by actorScope="seller" + sellerId binding,
 * NOT by a role called "SELLER".
 */
export type MembershipRole =
  | "SUPER_ADMIN"
  | "AGENTIK_ADMIN"
  | "ORG_ADMIN"
  | "MANAGER"
  | "OPERATOR"
  | "VIEWER"
  | "BILLING";

// ── Surface ──────────────────────────────────────────────────────────────────

/** Where the copilot request originates. */
export type CopilotSurface =
  | "desktop"
  | "manager"
  | "seller"
  | "api";

// ── Seller Binding ───────────────────────────────────────────────────────────

/**
 * How the seller identity was resolved.
 *
 * CERTIFICATION RULES:
 *   - "membership_seller_slug" is the ONLY CERTIFIED source.
 *     Derived from Membership.permissionsJson.sellerSlug, set by admin.
 *   - All other sources are UNVERIFIED and CANNOT produce actorScope="seller".
 *   - "unmapped" and "ambiguous" always fail closed.
 *
 * See: lib/comercial/frontline/frontline-types.ts SellerMappingSource
 */
export type SellerBindingSource =
  | "membership_seller_slug"   // CERTIFIED — admin-assigned slug on Membership
  | "email_crm_match"          // UNVERIFIED — email matched a CRM seller record
  | "name_match"               // UNVERIFIED — name fuzzy-matched a seller
  | "unmapped"                 // no seller identity found
  | "ambiguous";               // multiple matches, cannot determine

/**
 * Authoritative check: is a seller binding source certified?
 *
 * This function is the SINGLE AUTHORITY used by envelope validation
 * and scope resolver. No other path should check certification.
 * No collection of sources is exported — the function IS the contract.
 *
 * Only "membership_seller_slug" returns true. This is a compile-time
 * decision, not a runtime-configurable list. No consumer can add,
 * remove, or modify certified sources.
 */
export function isCertifiedSellerSource(
  source: SellerBindingSource,
): boolean {
  return source === "membership_seller_slug";
}

/**
 * Server-certified seller identity attached to the envelope.
 * Derived from Membership + CRM data, never from client input.
 *
 * When present, the actor is confined to this seller only.
 * See: lib/comercial/frontline/frontline-types.ts ResolvedSellerIdentity
 *
 * IDENTITY_UNSTABLE: sellerSlug is name-derived and mutable.
 * See: lib/comercial/manager/manager-commercial-types.ts:392
 */
export interface SellerBinding {
  readonly sellerId:       string;  // seller slug (e.g. "juan-perez")
  readonly sellerName:     string;
  readonly sellerSlug:     string;  // canonical slug, same as sellerId currently
  readonly source:         SellerBindingSource;
  readonly confidence:     number;  // 0–1, only 1.0 for CERTIFIED
  readonly organizationId: string;  // tenant the binding belongs to
}

// ── Copilot Envelope ─────────────────────────────────────────────────────────
/**
 * Server-derived trust context for every copilot interaction.
 *
 * INVARIANTS:
 * - organizationId MUST come from the authenticated session, never from user text.
 * - The client CANNOT send systemHints, assign roles, or select arbitrary sellerId.
 * - Missing identity or membership MUST invalidate the envelope.
 * - The future builder MUST execute server-side (requireOrgAccess or equivalent).
 * - sellerBinding is present IFF actorScope === "seller".
 * - When actorScope === "seller", requestedResourceScope MUST target
 *   exactly the sellerId in sellerBinding. Organization scope is denied.
 * - platformRole is null for regular users (not "USER").
 */
export interface CopilotEnvelope {
  readonly organizationId:         string;
  readonly orgSlug:                string;
  readonly userId:                 string;
  readonly membershipId:           string;
  readonly platformRole:           PlatformRole | null;
  readonly membershipRole:         MembershipRole;
  readonly moduleKey:              string;
  readonly surface:                CopilotSurface;
  readonly entitlementSet:         ReadonlySet<string>;
  readonly actorScope:             ActorScope;
  readonly sellerBinding:          SellerBinding | null;
  readonly requestedResourceScope: ResourceScope;
  readonly requestId:              string;
  readonly generatedAt:            string; // ISO 8601
}

/** Resource scope attached to a copilot request. */
export interface ResourceScope {
  readonly kind:           "organization" | "seller" | "self";
  readonly organizationId: string;
  readonly sellerId?:      string;
  readonly customerId?:    string;
}

// ── Envelope Validation ──────────────────────────────────────────────────────

export interface EnvelopeValidationResult {
  readonly valid:   boolean;
  readonly errors:  readonly string[];
}

// ── Risk Class ───────────────────────────────────────────────────────────────

export type RiskClass =
  | "READ"
  | "GENERATE"
  | "PROPOSE"
  | "WRITE"
  | "EXTERNAL";

// ── Truth Requirements ───────────────────────────────────────────────────────

export interface TruthRequirement {
  readonly source:   string;       // e.g. "sag_cartera", "crm_quotes"
  readonly required: boolean;
  readonly label:    string;
}

// ── Capability Definition ────────────────────────────────────────────────────

export interface CopilotCapability {
  readonly capabilityId:              string;
  readonly moduleKey:                 string;
  readonly description:               string;
  readonly riskClass:                 RiskClass;
  readonly requiredEntitlement:       string;
  readonly allowedRoles:              readonly MembershipRole[];
  readonly allowedActorScopes:        readonly ActorScope[];
  readonly requiresResourceOwnership: boolean;
  readonly enabled:                   boolean;
  readonly truthRequirements:         readonly TruthRequirement[];
}

// ── Authorization Result ─────────────────────────────────────────────────────

export type DenialReason =
  | "INVALID_ENVELOPE"
  | "UNKNOWN_CAPABILITY"
  | "CAPABILITY_DISABLED"
  | "ENTITLEMENT_DISABLED"
  | "ROLE_DENIED"
  | "MODULE_DENIED"
  | "ACTOR_SCOPE_DENIED"
  | "SELLER_SCOPE_REQUIRED"
  | "RESOURCE_OWNERSHIP_DENIED"
  | "CROSS_TENANT_DENIED";

export interface AuthorizationResult {
  readonly allowed:        boolean;
  readonly capabilityId:   string;
  readonly riskClass:      RiskClass | null;
  readonly denialReason:   DenialReason | null;
  readonly evaluatedScope: ResourceScope | null;
}

// ── Truth State ──────────────────────────────────────────────────────────────

export type TruthState =
  | "VERIFIED"
  | "PARTIAL"
  | "DATA_UNVERIFIED";

// ── Fact Reference ───────────────────────────────────────────────────────────

export interface FactRef {
  readonly source:           string;
  readonly sourceRecordId:   string;
  readonly sourceUpdatedAt:  string; // ISO 8601
  readonly organizationId:   string;
  readonly confidence:       number; // 0–1
  readonly truthState:       TruthState;
}

// ── Copilot Warning ──────────────────────────────────────────────────────────

export type CopilotWarningCode =
  | "NO_FACTS"
  | "LOW_CONFIDENCE"
  | "STALE_DATA"
  | "PARTIAL_COVERAGE"
  | "TRUTH_DEGRADED";

export interface CopilotWarning {
  readonly code:    CopilotWarningCode;
  readonly message: string;
}

// ── Copilot Answer ───────────────────────────────────────────────────────────
/**
 * Canonical copilot response envelope.
 *
 * INVARIANTS:
 * - A response with zero FactRef entries CANNOT have truthState = "VERIFIED".
 * - Every FactRef.organizationId MUST match the answer's organizationId.
 */
export interface CopilotAnswer {
  readonly answerId:       string;
  readonly text:           string;
  readonly truthState:     TruthState;
  readonly asOf:           string; // ISO 8601
  readonly facts:          readonly FactRef[];
  readonly warnings:       readonly CopilotWarning[];
  readonly capabilityId:   string;
  readonly organizationId: string;
  readonly requestId:      string;
}

// ── Scope Resolver Types ─────────────────────────────────────────────────────

/**
 * Input for resolveCopilotActorScope().
 * All fields are server-derived — none come from client input.
 */
export interface AuthorityInput {
  readonly platformRole:            PlatformRole | null;
  readonly membershipRole:          MembershipRole;
  readonly membershipStatus:        "ACTIVE" | "SUSPENDED" | "REMOVED";
  readonly organizationStatus:      "ACTIVE" | "SUSPENDED";
  readonly enabledModules:          ReadonlySet<string>;
  readonly resolvedSellerIdentity:  ResolvedSellerInput | null;
  readonly requestedModuleKey:      string;
}

/**
 * Server-resolved seller identity input.
 * Source: resolveCurrentSeller() in lib/comercial/frontline/seller-user-mapping.ts
 */
export interface ResolvedSellerInput {
  readonly sellerSlug:      string;
  readonly sellerName:      string;
  readonly source:          SellerBindingSource;
  readonly confidence:      number; // 0–1
  readonly organizationId:  string;
}

/** Warning emitted during scope resolution. */
export interface ScopeResolutionWarning {
  readonly code:    string;
  readonly message: string;
}

/**
 * Result of resolveCopilotActorScope().
 * Determines what actorScope, sellerBinding, and resourceScope
 * should be set on the CopilotEnvelope.
 */
export interface ScopeResolutionResult {
  readonly resolved:        boolean;
  readonly actorScope:      ActorScope | null;
  readonly sellerBinding:   SellerBinding | null;
  readonly resourceScope:   ResourceScope | null;
  readonly denialReason:    DenialReason | null;
  readonly warnings:        readonly ScopeResolutionWarning[];
}
