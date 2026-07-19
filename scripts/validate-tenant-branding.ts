/**
 * scripts/validate-tenant-branding.ts
 *
 * Validates tenant branding foundation.
 *
 * Run: npx tsx scripts/validate-tenant-branding.ts
 *
 * Sprint: TENANT-BRANDING-FOUNDATION-01
 */

import {
  getOrganizationBranding,
  getOrganizationBrandingBySlug,
  upsertOrganizationBranding,
} from "../lib/tenant/branding";
import type { OrganizationBrandingData } from "../lib/tenant/branding";

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}

async function main() {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  Validate Tenant Branding Foundation");
  console.log("══════════════════════════════════════════════════════════════\n");

  // 1. getOrganizationBrandingBySlug never returns null
  console.log("── By Slug ──────────────────────────────────────────────────");
  const castillitos = await getOrganizationBrandingBySlug("castillitos");
  check("getOrganizationBrandingBySlug returns object", castillitos != null);
  check("commercialName is non-empty", castillitos.commercialName.length > 0);
  check("country is non-empty", castillitos.country.length > 0);
  check("documentFooter is non-empty", castillitos.documentFooter.length > 0);

  // 2. Fallback for unknown slug
  console.log("\n── Fallback ─────────────────────────────────────────────────");
  const unknown = await getOrganizationBrandingBySlug("nonexistent-org-xyz");
  check("Unknown slug returns fallback (not null)", unknown != null);
  check("Fallback has commercialName", unknown.commercialName.length > 0);
  check("Fallback has primaryColor", HEX_RE.test(unknown.primaryColor));

  // 3. getOrganizationBranding by ID
  if (castillitos.organizationId) {
    console.log("\n── By ID ────────────────────────────────────────────────────");
    const byId = await getOrganizationBranding(castillitos.organizationId);
    check("getOrganizationBranding returns object", byId != null);
    check("Same commercialName as slug lookup", byId.commercialName === castillitos.commercialName);
  }

  // 4. Color validation
  console.log("\n── Color Format ─────────────────────────────────────────────");
  const colors: (keyof OrganizationBrandingData)[] = ["primaryColor", "secondaryColor", "accentColor"];
  for (const c of colors) {
    const val = castillitos[c] as string;
    if (val && val.length > 0) {
      check(`${c} is valid hex (${val})`, HEX_RE.test(val));
    } else {
      check(`${c} is empty (ok — optional)`, true);
    }
  }

  // 5. Upsert round-trip (if castillitos has real org ID)
  if (castillitos.organizationId) {
    console.log("\n── Upsert Round-Trip ────────────────────────────────────────");
    const testPhone = `+57-TEST-${Date.now()}`;
    const updated = await upsertOrganizationBranding(castillitos.organizationId, {
      phone: testPhone,
    });
    check("Upsert returns object", updated != null);
    check("Phone updated", updated.phone === testPhone);
    check("commercialName preserved", updated.commercialName === castillitos.commercialName);

    // Restore original
    await upsertOrganizationBranding(castillitos.organizationId, {
      phone: castillitos.phone,
    });
  }

  // Summary
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log(`  ${pass} PASS, ${fail} FAIL`);
  console.log("══════════════════════════════════════════════════════════════\n");

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
