/**
 * lib/comercial/frontline/seller-user-mapping.ts
 *
 * AGENTIK-COMMERCIAL-FRONTLINE-CORE-01 — Phase 1
 *
 * Deterministic mapping: Agentik User → Organization → Business Seller.
 *
 * Resolution cascade:
 *   1. Membership.permissionsJson.sellerSlug (explicit admin assignment)
 *   2. User.email → CRM quote sellerName match (email-based inference)
 *   3. MANAGER/ORG_ADMIN → admin scope (not seller-scoped)
 *   4. Unmapped
 *
 * No display-name guessing. No cross-tenant access.
 * VendorCommercialBag.salesRepId uses the same sellerSlug.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { buildSellerDirectory } from "@/lib/comercial/foundation/seller-directory";
import { lookupSellerTerceroId, bootstrapSellerTerceroId } from "./seller-tercero-mapping";
import type {
  ResolvedSellerIdentity,
  SellerMappingSource,
  SellerScope,
  ScopeLevel,
  FrontlineProvenance,
} from "./frontline-types";

const db = prisma as any;

// ── Role hierarchy ──────────────────────────────────────────────────────────

const MANAGER_ROLES = new Set(["MANAGER", "ORG_ADMIN", "SUPER_ADMIN", "AGENTIK_ADMIN"]);
const SELLER_ROLES = new Set(["OPERATOR", "VIEWER"]);

function scopeLevel(role: string): ScopeLevel {
  if (role === "SUPER_ADMIN" || role === "AGENTIK_ADMIN") return "super_admin";
  if (role === "ORG_ADMIN") return "admin";
  if (role === "MANAGER") return "manager";
  return "seller";
}

// ── Resolve current seller ──────────────────────────────────────────────────

/**
 * Deterministic mapping: authenticated user → business seller identity.
 *
 * Used by: Seller App, Pedidos, Clientes, Maleta, alerts, permissions.
 */
export async function resolveCurrentSeller(input: {
  organizationId: string;
  userId: string;
}): Promise<ResolvedSellerIdentity> {
  const { organizationId, userId } = input;
  const now = new Date().toISOString();

  const provenance: FrontlineProvenance = {
    source: "seller-user-mapping",
    asOf: now,
  };

  // Step 1: Load membership
  const membership = await db.membership.findFirst({
    where: { organizationId, userId, status: "ACTIVE" },
    select: {
      role: true,
      permissionsJson: true,
      user: { select: { email: true, name: true } },
    },
  });

  if (!membership) {
    return {
      userId,
      organizationId,
      sellerId: null,
      sellerName: null,
      sellerSlug: null,
      sagSellerCode: null,
      role: "VIEWER",
      mappingSource: "unmapped",
      isSellerScoped: false,
      isManagerOrAbove: false,
      active: false,
      provenance: { ...provenance, limitations: ["No active membership found"] },
    };
  }

  const role = membership.role as string;
  const isManager = MANAGER_ROLES.has(role);
  const permissions = membership.permissionsJson as Record<string, unknown> | null;

  // Strategy 1: Explicit sellerSlug in permissionsJson
  const explicitSlug = permissions?.sellerSlug as string | undefined;
  if (explicitSlug) {
    const directory = await buildSellerDirectory(organizationId);
    const seller = directory.sellers.find(s => s.sellerSlug === explicitSlug);

    // Provisioned sellers have sellerTerceroId persisted in permissionsJson.
    // Fallback: slug-based lookup from CustomerOrderRecord (pre-provisioning era).
    const explicitTerceroId = permissions?.sellerTerceroId as number | undefined;
    const sagSellerCode = explicitTerceroId
      ? String(explicitTerceroId)
      : (await lookupSellerTerceroId(organizationId, explicitSlug) ??
         await bootstrapSellerTerceroId(organizationId, seller?.sellerName ?? null));

    return {
      userId,
      organizationId,
      sellerId: explicitSlug,
      sellerName: seller?.sellerName ?? null,
      sellerSlug: explicitSlug,
      sagSellerCode,
      role,
      mappingSource: "membership_seller_slug",
      isSellerScoped: !isManager,
      isManagerOrAbove: isManager,
      active: true,
      provenance,
    };
  }

  // Strategy 2: Manager/Admin — not seller-scoped
  if (isManager) {
    return {
      userId,
      organizationId,
      sellerId: null,
      sellerName: null,
      sellerSlug: null,
      sagSellerCode: null,
      role,
      mappingSource: "admin_scope",
      isSellerScoped: false,
      isManagerOrAbove: true,
      active: true,
      provenance,
    };
  }

  // Strategy 3: Email match to CRM seller
  const userEmail = membership.user?.email as string | undefined;
  if (userEmail) {
    const directory = await buildSellerDirectory(organizationId);
    // Check if any seller name matches the email local part
    const emailLocal = userEmail.split("@")[0].toLowerCase();
    const match = directory.sellers.find(s => {
      const slug = s.sellerSlug.toLowerCase();
      return slug === emailLocal;
    });

    if (match) {
      const sagCode =
        await lookupSellerTerceroId(organizationId, match.sellerSlug) ??
        await bootstrapSellerTerceroId(organizationId, match.sellerName);
      return {
        userId,
        organizationId,
        sellerId: match.sellerSlug,
        sellerName: match.sellerName,
        sellerSlug: match.sellerSlug,
        sagSellerCode: sagCode,
        role,
        mappingSource: "email_crm_match",
        isSellerScoped: true,
        isManagerOrAbove: false,
        active: true,
        provenance: {
          ...provenance,
          limitations: ["Email-based match — confirm with admin assignment for production use"],
        },
      };
    }
  }

  // No mapping found
  return {
    userId,
    organizationId,
    sellerId: null,
    sellerName: null,
    sellerSlug: null,
    sagSellerCode: null,
    role,
    mappingSource: "unmapped",
    isSellerScoped: false,
    isManagerOrAbove: false,
    active: true,
    provenance: {
      ...provenance,
      limitations: [
        "No sellerSlug in permissionsJson",
        "No email match to CRM seller",
        "Set Membership.permissionsJson.sellerSlug for deterministic mapping",
      ],
    },
  };
}

// ── Derive seller scope ─────────────────────────────────────────────────────

/**
 * Given a resolved seller identity, derive access scope.
 * Used for server-side authorization (not React).
 */
export function deriveSellerScope(identity: ResolvedSellerIdentity): SellerScope {
  const level = scopeLevel(identity.role);
  const canAccessAll = level !== "seller";

  return {
    level,
    sellerId: identity.sellerId,
    sellerSlug: identity.sellerSlug,
    canAccessAllSellers: canAccessAll,
    canAccessAllCustomers: canAccessAll,
    canAccessAllOrders: canAccessAll,
    canAccessAllPortfolios: canAccessAll,
    canAccessAllAlerts: canAccessAll,
  };
}

// ── Scope filter helpers ────────────────────────────────────────────────────

/**
 * Build a Prisma WHERE clause fragment that enforces seller scope.
 * For seller-scoped users, restricts to their sellerSlug.
 * For managers/admins, returns empty object (no restriction).
 */
export function sellerScopeFilter(
  scope: SellerScope,
  field: string = "sellerSlug",
): Record<string, unknown> {
  if (scope.canAccessAllSellers || !scope.sellerSlug) return {};
  return { [field]: scope.sellerSlug };
}

/**
 * Build a customer scope filter.
 * Seller-scoped users see only customers assigned to them.
 */
export function customerScopeFilter(
  scope: SellerScope,
): Record<string, unknown> {
  if (scope.canAccessAllCustomers || !scope.sellerSlug) return {};
  return { sellerSlug: scope.sellerSlug };
}

/**
 * Build an order scope filter.
 * Seller-scoped users see only orders they created.
 */
export function orderScopeFilter(
  scope: SellerScope,
): Record<string, unknown> {
  if (scope.canAccessAllOrders || !scope.sellerSlug) return {};
  return { sellerName: scope.sellerSlug };
}

/**
 * Build a portfolio (maleta) scope filter.
 * Seller-scoped users see only their portfolio.
 */
export function portfolioScopeFilter(
  scope: SellerScope,
): Record<string, unknown> {
  if (scope.canAccessAllPortfolios || !scope.sellerSlug) return {};
  return { salesRepId: scope.sellerSlug };
}
