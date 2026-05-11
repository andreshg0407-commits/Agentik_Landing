/**
 * lib/activation/connector-provisioner.ts
 *
 * Sprint TA-04 — Phase E: Connector Provisioning Service.
 *
 * Reusable service that creates or updates a Connector row for any provider,
 * stores activation progress in OnboardingChecklist, and returns a structured
 * diagnostic report.
 *
 * Contract:
 *   provisionConnector(input) → ProvisionResult
 *
 * This service is the single authoritative path for connector creation.
 * Admin scripts and future UI flows should call this instead of writing
 * prisma.connector.create() directly.
 *
 * Responsibilities:
 *   1. Validate provider (known source)
 *   2. Optionally validate credentials (validation pipeline)
 *   3. Normalize connector config (merge credentials + metadata + fuentesMap)
 *   4. Create or update the Connector DB row (upsert by org+source+name)
 *   5. Update OnboardingChecklist (erpConnected, erpSampleVerified flags)
 *   6. Return ProvisionResult with full diagnostics
 *
 * Rules:
 *   - Never hardcodes tenant assumptions.
 *   - Never breaks existing connectors — pure upsert semantics.
 *   - Never triggers a sync — provisioning is setup-only.
 *   - TypeScript-clean, server-safe (no browser APIs).
 *   - Org-scoped: organizationId is always required.
 */

import { prisma }                from "@/lib/prisma";
import type { Prisma }           from "@prisma/client";
import { validateConnector }     from "./connector-validator";
import type {
  ActivationDiagnostic,
  ActivationStep,
  ProvisionConnectorInput,
  ProvisionResult,
} from "./types";
import {
  PROVIDER_DEFAULT_MODULES,
  PROVIDER_NEEDS_FUENTES,
} from "./types";

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Provisions (creates or updates) a connector for an organization.
 *
 * On success:
 *   - Connector row exists in DB with status = ACTIVE
 *   - OnboardingChecklist.erpConnected = true
 *   - OnboardingChecklist.erpSampleVerified = true (when validation passed)
 *
 * On failure:
 *   - No connector row is created/modified
 *   - Diagnostics explain the failure step and remediation path
 */
export async function provisionConnector(
  input: ProvisionConnectorInput,
): Promise<ProvisionResult> {
  const diagnostics: ActivationDiagnostic[] = [];
  const warnings:    string[] = [];
  const errors:      string[] = [];

  // ── Step 0: Verify org exists ──────────────────────────────────────────────
  const org = await prisma.organization.findUnique({
    where:  { id: input.organizationId },
    select: { id: true, slug: true },
  });

  if (!org) {
    errors.push(`Organization not found: ${input.organizationId}`);
    diagnostics.push(makeDiagnostic(false, "erp_connected", {
      reason:          "org_not_found",
      message:         `No organization with id=${input.organizationId}`,
      recommendations: ["Create the organization before provisioning connectors"],
    }));
    return { ok: false, diagnostics, warnings, errors };
  }

  // ── Step 1: Validate provider ──────────────────────────────────────────────
  const knownProviders = Object.keys(PROVIDER_DEFAULT_MODULES);
  if (!knownProviders.includes(input.provider)) {
    errors.push(`Unknown provider: ${input.provider}`);
    diagnostics.push(makeDiagnostic(false, "erp_connected", {
      reason:          "unsupported_provider",
      message:         `Provider "${input.provider}" is not registered. Known: ${knownProviders.join(", ")}`,
      recommendations: [`Add "${input.provider}" to PROVIDER_DEFAULT_MODULES in types.ts`],
    }));
    return { ok: false, diagnostics, warnings, errors };
  }

  // ── Step 2: Credential validation (optional) ───────────────────────────────
  let validationPassed = false;
  let companyName: string | undefined;

  if (!input.skipValidation) {
    const vr = await validateConnector({
      provider:    input.provider,
      credentials: input.credentials,
    });

    // Merge validation warnings into top-level warnings
    warnings.push(...vr.warnings);

    if (!vr.ok) {
      errors.push(...vr.errors);
      diagnostics.push(makeDiagnostic(false, "erp_validated", {
        reason:  vr.errors.some(e => e.includes("Authentication")) ? "authentication_failed" : "connectivity_failed",
        message: vr.errors.join("; "),
        metadata: { validationStep: vr.step, validationMetadata: vr.metadata },
        recommendations: [
          "Verify the token is correct and has not expired",
          "Verify the endpoint URL is reachable from this server",
          "Verify the database name (a_s_bd) matches the company",
        ],
      }));
      return { ok: false, diagnostics, warnings, errors };
    }

    validationPassed = true;
    companyName      = vr.companyName;

    diagnostics.push(makeDiagnostic(true, "erp_validated", {
      metadata: {
        step:             vr.step,
        companyName:      vr.companyName,
        sampleRowCount:   vr.sampleRowCount,
        detectedDatabase: vr.detectedDatabase,
      },
    }));
  }

  // ── Step 3: Build connector config ────────────────────────────────────────
  const modules = input.modules ?? PROVIDER_DEFAULT_MODULES[input.provider];

  // Merge credentials + metadata + fuentesMap into config blob.
  // fuentesMap keys are stored as strings in JSON (TA-03 contract).
  const fuentesMapStr: Record<string, string> | undefined =
    input.fuentesMap && Object.keys(input.fuentesMap).length > 0
      ? Object.fromEntries(
          Object.entries(input.fuentesMap).map(([k, v]) => [String(k), v])
        )
      : undefined;

  const connectorConfig: Record<string, unknown> = {
    ...input.credentials,
    ...(input.metadata ?? {}),
    ...(fuentesMapStr ? { fuentesMap: fuentesMapStr } : {}),
    // Traceability: record when and what provisioned this connector
    _provisionedAt: new Date().toISOString(),
    _provider:      input.provider,
    ...(companyName ? { _detectedCompanyName: companyName } : {}),
  };

  // ── Step 4: Upsert Connector row ──────────────────────────────────────────
  let connectorId: string;

  try {
    const connector = await prisma.connector.upsert({
      where: {
        organizationId_source_name: {
          organizationId: org.id,
          source:         input.provider,
          name:           input.name,
        },
      },
      create: {
        organizationId: org.id,
        source:         input.provider,
        name:           input.name,
        modules,
        status:         "ACTIVE",
        config:         connectorConfig as Prisma.InputJsonValue,
      },
      update: {
        modules,
        status:    "ACTIVE",
        config:    connectorConfig as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    connectorId = connector.id;

    diagnostics.push(makeDiagnostic(true, "erp_connected", {
      metadata: { connectorId, source: input.provider, modules },
    }));
  } catch (e) {
    const msg = (e as Error).message;
    errors.push(`Failed to create/update connector: ${msg}`);
    diagnostics.push(makeDiagnostic(false, "erp_connected", {
      reason:  "connector_create_failed",
      message: msg,
      recommendations: ["Check DB connectivity and Prisma schema migration status"],
    }));
    return { ok: false, diagnostics, warnings, errors };
  }

  // ── Step 5: Update OnboardingChecklist ────────────────────────────────────
  // Use (prisma as any) because the model was added in TA-02 migration and
  // may not yet be reflected in the Prisma client type exports.
  try {
    await (prisma as any).onboardingChecklist.upsert({
      where:  { organizationId: org.id },
      create: {
        organizationId:   org.id,
        erpConnected:     true,
        erpSampleVerified: validationPassed,
      },
      update: {
        erpConnected:     true,
        erpSampleVerified: validationPassed,
        updatedAt:         new Date(),
      },
    });
  } catch (e) {
    // Checklist update failure is non-fatal — connector is already created.
    const msg = (e as Error).message;
    warnings.push(`OnboardingChecklist update failed (non-fatal): ${msg}`);
    diagnostics.push(makeDiagnostic(false, "erp_validated", {
      reason:  "checklist_update_failed",
      message: msg,
      recommendations: [
        "Run the TA-02 migration (20260506010000_org_group_onboarding_marketing_config) to create the OnboardingChecklist table",
      ],
    }));
  }

  // ── Step 6: FUENTES discovery flag ───────────────────────────────────────
  // Report whether FUENTES map was supplied (we do not auto-discover here —
  // that is a deliberate caller responsibility per Phase D contract).
  if (PROVIDER_NEEDS_FUENTES[input.provider]) {
    if (fuentesMapStr && Object.keys(fuentesMapStr).length > 0) {
      diagnostics.push(makeDiagnostic(true, "fuentes_verified", {
        metadata: { fuenteCount: Object.keys(fuentesMapStr).length },
      }));
    } else {
      warnings.push(
        `fuentesMap not supplied for ${input.provider}. ` +
        `The adapter will fall back to Castillitos FUENTES rules, which may produce ` +
        `incorrect comprobanteCode values for this company. ` +
        `Run discoverFuentesMap() and pass the result as fuentesMap.`
      );
    }
  }

  return {
    ok:          true,
    connectorId,
    diagnostics,
    warnings,
    errors,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function makeDiagnostic(
  success: boolean,
  step:    ActivationStep,
  opts: {
    reason?:         ActivationDiagnostic["reason"];
    message?:        string;
    warnings?:       string[];
    recommendations?: string[];
    metadata?:       Record<string, unknown>;
  } = {},
): ActivationDiagnostic {
  return {
    success,
    step,
    reason:          opts.reason,
    message:         opts.message,
    warnings:        opts.warnings        ?? [],
    recommendations: opts.recommendations ?? [],
    metadata:        opts.metadata        ?? {},
  };
}
