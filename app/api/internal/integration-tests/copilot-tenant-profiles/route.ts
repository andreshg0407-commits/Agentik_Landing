/**
 * app/api/internal/integration-tests/copilot-tenant-profiles/route.ts
 *
 * Agentik — AGENTIK-COPILOT-TENANT-PROFILES-01
 * Integration Test Harness — Copilot Tenant Profiles
 *
 * Security: dev-only + ENABLE_INTERNAL_INTEGRATION_TESTS + token guard.
 * POST /api/internal/integration-tests/copilot-tenant-profiles
 *
 * Tests:
 *   1.  agentik org → Yumeko (displayName) + STRATEGIC (style)
 *   2.  castillitos org → Asistente Castillitos + OPERATIONAL
 *   3.  Unknown org → Copilot fallback + ANALYTICAL
 *   4.  Profile displayName can be overridden at runtime
 *   5.  Profile executiveStyle can be overridden at runtime
 *   6.  Disabled profile → falls back to default
 *   7.  Branding — hasBrandingOverrides() works correctly
 *   8.  Memory policy — isMemoryTypeAllowed() per type
 *   9.  Autonomy policy — isRiskLevelPermitted() per level
 *   10. Fallback chain — unknown org always returns valid profile
 */

import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const token    = request.headers.get("x-agentik-integration-token");
  const expected = process.env.AGENTIK_INTEGRATION_TOKEN ?? "dev-integration-token";
  if (token !== expected) {
    return NextResponse.json({ error: "Forbidden — invalid token" }, { status: 403 });
  }

  if (!process.env.ENABLE_INTERNAL_INTEGRATION_TESTS) {
    return NextResponse.json({ error: "Integration tests not enabled" }, { status: 403 });
  }

  // ── Test runner ─────────────────────────────────────────────────────────────

  const results: Record<string, unknown>[] = [];
  let passed = 0;
  let failed = 0;

  function record(name: string, ok: boolean, detail?: unknown): void {
    results.push({ test: name, status: ok ? "PASS" : "FAIL", detail });
    if (ok) passed++; else failed++;
  }

  // ── Imports ──────────────────────────────────────────────────────────────────

  const { getProfile, getProfileSync }         = await import("@/lib/copilot/profiles/copilot-profile-resolver");
  const { resolveDisplayName, resolveExecutiveStyle, resolveTone } = await import("@/lib/copilot/profiles/copilot-persona");
  const { hasBrandingOverrides, buildBranding } = await import("@/lib/copilot/profiles/copilot-branding");
  const { isMemoryTypeAllowed }                  = await import("@/lib/copilot/profiles/copilot-memory-policy");
  const { isRiskLevelPermitted }                 = await import("@/lib/copilot/profiles/copilot-autonomy-policy");
  const { InMemoryCopilotProfileRepository }     = await import("@/lib/copilot/profiles/in-memory-copilot-profile-repository");
  const { buildProfileId }                       = await import("@/lib/copilot/profiles/copilot-tenant-profile");

  // ── Test 1: agentik → Yumeko + STRATEGIC ───────────────────────────────────

  try {
    const profile = await getProfile("agentik");
    const name    = resolveDisplayName(profile);
    const eStyle  = resolveExecutiveStyle(profile);
    record(
      "Test 1 - agentik org → Yumeko, STRATEGIC",
      name === "Yumeko" && eStyle === "STRATEGIC",
      { displayName: name, executiveStyle: eStyle, id: profile.id },
    );
  } catch (err) {
    record("Test 1 - agentik org → Yumeko, STRATEGIC", false, { error: String(err) });
  }

  // ── Test 2: castillitos → Asistente Castillitos + OPERATIONAL ───────────────

  try {
    const profile = await getProfile("castillitos");
    const name    = resolveDisplayName(profile);
    const eStyle  = resolveExecutiveStyle(profile);
    record(
      "Test 2 - castillitos org → Asistente Castillitos, OPERATIONAL",
      name === "Asistente Castillitos" && eStyle === "OPERATIONAL",
      { displayName: name, executiveStyle: eStyle },
    );
  } catch (err) {
    record("Test 2 - castillitos org → Asistente Castillitos, OPERATIONAL", false, { error: String(err) });
  }

  // ── Test 3: Unknown org → Copilot fallback + ANALYTICAL ──────────────────────

  try {
    const profile = await getProfile("unknown-org-xyz");
    const name    = resolveDisplayName(profile);
    const eStyle  = resolveExecutiveStyle(profile);
    record(
      "Test 3 - unknown org → Copilot fallback, ANALYTICAL",
      name === "Copilot" && eStyle === "ANALYTICAL",
      { displayName: name, executiveStyle: eStyle },
    );
  } catch (err) {
    record("Test 3 - unknown org → Copilot fallback, ANALYTICAL", false, { error: String(err) });
  }

  // ── Test 4: Override displayName at runtime ────────────────────────────────

  try {
    const testRepo = new InMemoryCopilotProfileRepository();
    const profileId = buildProfileId("test-override-org");
    await testRepo.saveProfile({
      id:             profileId,
      orgSlug:        "test-override-org",
      enabled:        true,
      displayName:    "Mi Copilot Personalizado",
      tone:           "DIRECT",
      language:       "es",
      executiveStyle: "OPERATIONAL",
      branding:       {},
      enabledAgents:  [],
      memoryPolicy:   { allowStrategicMemory: true, allowOperationalMemory: true, allowLearningMemory: false, allowPreferenceMemory: false, maxMemories: 50 },
      autonomyPolicy: { allowAutonomousGoals: false, allowAutonomousExecution: false, allowAutonomousApprovals: false, maxRiskLevel: "LOW" },
    });
    const profile = await getProfile("test-override-org", testRepo);
    const name    = resolveDisplayName(profile);
    record(
      "Test 4 - displayName override at runtime",
      name === "Mi Copilot Personalizado",
      { displayName: name },
    );
  } catch (err) {
    record("Test 4 - displayName override at runtime", false, { error: String(err) });
  }

  // ── Test 5: Override executiveStyle at runtime ─────────────────────────────

  try {
    const testRepo = new InMemoryCopilotProfileRepository();
    await testRepo.saveProfile({
      id:             "test-style-org_copilot",
      orgSlug:        "test-style-org",
      enabled:        true,
      displayName:    "StyleBot",
      tone:           "TECHNICAL",
      language:       "en",
      executiveStyle: "COACH",
      branding:       {},
      enabledAgents:  [],
      memoryPolicy:   { allowStrategicMemory: true, allowOperationalMemory: true, allowLearningMemory: true, allowPreferenceMemory: false, maxMemories: 100 },
      autonomyPolicy: { allowAutonomousGoals: false, allowAutonomousExecution: false, allowAutonomousApprovals: false, maxRiskLevel: "LOW" },
    });
    const profile = await getProfile("test-style-org", testRepo);
    const eStyle  = resolveExecutiveStyle(profile);
    record(
      "Test 5 - executiveStyle COACH override at runtime",
      eStyle === "COACH",
      { executiveStyle: eStyle },
    );
  } catch (err) {
    record("Test 5 - executiveStyle COACH override at runtime", false, { error: String(err) });
  }

  // ── Test 6: Disabled profile → fallback ────────────────────────────────────

  try {
    const testRepo = new InMemoryCopilotProfileRepository();
    await testRepo.saveProfile({
      id:             "disabled-org_copilot",
      orgSlug:        "disabled-org",
      enabled:        false,              // DISABLED
      displayName:    "Disabled Bot",
      tone:           "FORMAL",
      language:       "es",
      executiveStyle: "OPERATIONAL",
      branding:       {},
      enabledAgents:  [],
      memoryPolicy:   { allowStrategicMemory: false, allowOperationalMemory: false, allowLearningMemory: false, allowPreferenceMemory: false, maxMemories: 0 },
      autonomyPolicy: { allowAutonomousGoals: false, allowAutonomousExecution: false, allowAutonomousApprovals: false, maxRiskLevel: "LOW" },
    });
    const profile = await getProfile("disabled-org", testRepo);
    // Since disabled-org is not in default registry, should get FALLBACK
    const name = resolveDisplayName(profile);
    record(
      "Test 6 - disabled profile → fallback (not disabled bot)",
      name !== "Disabled Bot",
      { displayName: name },
    );
  } catch (err) {
    record("Test 6 - disabled profile → fallback", false, { error: String(err) });
  }

  // ── Test 7: Branding — hasBrandingOverrides() ──────────────────────────────

  try {
    const emptyBranding = {};
    const customBranding = buildBranding({ primaryColor: "#004AAD" });
    const noOverrides = !hasBrandingOverrides(emptyBranding);
    const hasOverride  =  hasBrandingOverrides(customBranding);
    record(
      "Test 7 - branding: hasBrandingOverrides() works",
      noOverrides && hasOverride,
      { noOverrides, hasOverride },
    );
  } catch (err) {
    record("Test 7 - branding: hasBrandingOverrides()", false, { error: String(err) });
  }

  // ── Test 8: Memory policy — isMemoryTypeAllowed() ─────────────────────────

  try {
    const policy = { allowStrategicMemory: true, allowOperationalMemory: false, allowLearningMemory: true, allowPreferenceMemory: false, maxMemories: 100 };
    const strategic   = isMemoryTypeAllowed(policy, "STRATEGIC");
    const operational = isMemoryTypeAllowed(policy, "OPERATIONAL");
    const learning    = isMemoryTypeAllowed(policy, "LEARNING");
    const preference  = isMemoryTypeAllowed(policy, "PREFERENCE");
    record(
      "Test 8 - memory policy: isMemoryTypeAllowed() per type",
      strategic && !operational && learning && !preference,
      { strategic, operational, learning, preference },
    );
  } catch (err) {
    record("Test 8 - memory policy: isMemoryTypeAllowed()", false, { error: String(err) });
  }

  // ── Test 9: Autonomy policy — isRiskLevelPermitted() ──────────────────────

  try {
    const lowPolicy    = { allowAutonomousGoals: false, allowAutonomousExecution: false, allowAutonomousApprovals: false, maxRiskLevel: "LOW" as const };
    const mediumPolicy = { allowAutonomousGoals: true, allowAutonomousExecution: true, allowAutonomousApprovals: false, maxRiskLevel: "MEDIUM" as const };
    const lowAllowed   = isRiskLevelPermitted(lowPolicy, "LOW");
    const medDenied    = isRiskLevelPermitted(lowPolicy, "MEDIUM");
    const medAllowed   = isRiskLevelPermitted(mediumPolicy, "MEDIUM");
    const highDenied   = isRiskLevelPermitted(mediumPolicy, "HIGH");
    record(
      "Test 9 - autonomy policy: isRiskLevelPermitted() per level",
      lowAllowed && !medDenied === false && medAllowed && !highDenied,
      { lowAllowed, medDenied, medAllowed, highDenied },
    );
  } catch (err) {
    record("Test 9 - autonomy policy: isRiskLevelPermitted()", false, { error: String(err) });
  }

  // ── Test 10: Fallback chain — always valid ─────────────────────────────────

  try {
    const orgs    = ["agentik", "castillitos", "new-tenant-xyz", "", "____"];
    const results = await Promise.all(orgs.map(o => getProfile(o)));
    const allValid = results.every(p =>
      typeof p.id === "string" && p.id.length > 0 &&
      typeof p.displayName === "string" && p.displayName.length > 0 &&
      typeof p.executiveStyle === "string" &&
      p.enabled === true,
    );
    record(
      "Test 10 - fallback chain: all orgs return valid enabled profile",
      allValid,
      { orgs, names: results.map(p => p.displayName) },
    );
  } catch (err) {
    record("Test 10 - fallback chain: all orgs return valid profile", false, { error: String(err) });
  }

  // ── Response ──────────────────────────────────────────────────────────────────

  return NextResponse.json({
    sprint:  "AGENTIK-COPILOT-TENANT-PROFILES-01",
    passed,
    failed,
    total:   passed + failed,
    status:  failed === 0 ? "ALL_PASS" : "SOME_FAIL",
    results,
  });
}
