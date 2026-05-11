/**
 * app/api/orgs/[orgSlug]/marketing-studio/sessions/[sessionId]/execute/route.ts
 *
 * POST — trigger n8n execution for an approved session.
 *
 * Steps:
 *   1. Load session + validate state
 *   2. Resolve workflow (Do Jeans strict path uses resolveDoJeansWorkflow)
 *   3. Build garment fingerprint + detail locks
 *   4. Create GeneratedAsset rows with per-asset prompts
 *   5. Build StudioExecutionPayload (with front/back refs + detail locks)
 *   6. Wrap as N8nWebhookPayload
 *   7. Dispatch via getExecutor() (stubbed until STUDIO_N8N_WEBHOOK_URL is set)
 *   8. Persist job ID + payload snapshot on session
 *   9. Return { jobId, stubbed, sessionId }
 *
 * POST body: {}  (no body required — session state drives everything)
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireOrgAccess }                         from "@/lib/auth/org-access";
import {
  getDbSession,
  updateDbSessionExecution,
  updateDbSessionFailed,
}                                                   from "@/lib/marketing-studio/session-service";
import {
  createDbAssetsForSession,
}                                                   from "@/lib/marketing-studio/asset-service";
import {
  buildN8nWebhookPayload,
  buildAssetRequests,
}                                                   from "@/lib/marketing-studio/execution-payload";
import type { StudioExecutionPayload }              from "@/lib/marketing-studio/execution-payload";
import { getExecutor }                              from "@/lib/marketing-studio/n8n-executor";
import {
  resolveWorkflow,
  computeGarmentFingerprint,
  getTenantConfig,
  getPreset,
}                                                   from "@/lib/marketing-studio";
import type { GarmentAttributes, FidelityMode }    from "@/lib/marketing-studio";
import type { UserObjective, MinimumInputFields }   from "@/lib/marketing-studio/guided-flow";
import {
  resolveDoJeansWorkflow,
  buildDoJeansAssetPrompts,
}                                                   from "@/lib/marketing-studio/do-jeans-workflow";
import { extractDetailLocks }                       from "@/lib/marketing-studio/do-jeans-intake";
import { validateDoJeansStrictIntake }              from "@/lib/marketing-studio/do-jeans-intake";

type RouteContext = { params: Promise<{ orgSlug: string; sessionId: string }> };

export async function POST(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug, sessionId } = await params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);

    // ── 1. Load session ──────────────────────────────────────────────────────
    const session = await getDbSession(sessionId);
    if (!session || session.organizationId !== organization.id) {
      return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
    }
    if (!session.objective) {
      return NextResponse.json({ error: "Session has no objective" }, { status: 422 });
    }
    if (session.status !== "APPROVED" && session.status !== "PUBLISHING") {
      return NextResponse.json(
        { error: `Session not ready for execution (status: ${session.status})` },
        { status: 422 },
      );
    }

    // ── 2a. Resolve tenant config (needed before workflow resolution) ─────────
    const tenantCfgEarly = getTenantConfig(session.tenantId);
    if (!tenantCfgEarly) {
      return NextResponse.json({ error: `Unknown tenantId: ${session.tenantId}` }, { status: 422 });
    }

    const isStrictMode = tenantCfgEarly.fidelityMode === "strict";
    const objective    = session.objective as UserObjective;
    const inputs          = (session.inputsJson ?? {}) as Partial<MinimumInputFields>;
    const productUpload   = {
      sku:          session.productSku    ?? "",
      imageUrl:     session.productImageUrl ?? "",
      backImageUrl: (session.inputsJson as Record<string, unknown> | null)?.backImageUrl as string | undefined,
    };

    // ── 2. Strict Do Jeans validation ────────────────────────────────────────
    if (isStrictMode && objective === "shopify_listing") {
      const check = validateDoJeansStrictIntake(productUpload, inputs);
      if (!check.valid) {
        return NextResponse.json({ error: "Strict intake validation failed", details: check.errors }, { status: 422 });
      }
    }

    // ── 3. Resolve workflow ──────────────────────────────────────────────────
    const workflow = isStrictMode && objective === "shopify_listing"
      ? resolveDoJeansWorkflow()
      : resolveWorkflow(objective);

    // ── 4. Garment fingerprint ───────────────────────────────────────────────
    const tenantCfg = tenantCfgEarly;

    const garmentAttrs: GarmentAttributes = {
      category:    inputs.category    ?? "other",
      colors:      inputs.colors      ?? [],
      gender:      "unisex",
      detailLocks: isStrictMode ? extractDetailLocks(inputs) : undefined,
    };

    const fingerprint  = computeGarmentFingerprint(
      session.tenantId,
      garmentAttrs,
      session.productSku ?? undefined,
    );

    const fidelityMode: FidelityMode = tenantCfg.fidelityMode ?? "standard";
    const preset                     = getPreset(workflow.presetId);
    if (!preset) {
      return NextResponse.json({ error: `Preset not found: ${workflow.presetId}` }, { status: 500 });
    }

    const detailLocks = isStrictMode ? extractDetailLocks(inputs) : undefined;

    // ── 5. Per-asset prompts ─────────────────────────────────────────────────
    const assetPrompts = isStrictMode && objective === "shopify_listing"
      ? buildDoJeansAssetPrompts(productUpload, inputs, fingerprint, preset)
      : workflow.assets.map((assetType) => ({
          assetType,
          prompt: preset.aiPromptHint ?? `Generate ${assetType} for ${inputs.category ?? "garment"}`,
          sourceImageUrl: undefined as string | undefined,
          angle: undefined as "front" | "back" | undefined,
        }));

    // ── 6. Create GeneratedAsset rows ────────────────────────────────────────
    const dbAssets = await createDbAssetsForSession(
      sessionId,
      assetPrompts.map((ap) => ({
        sessionId,
        assetType: ap.assetType,
        prompt:    ap.prompt,
      })),
    );

    // ── 7. Build execution payload ───────────────────────────────────────────
    const callbackSecret = process.env.STUDIO_N8N_WEBHOOK_SECRET;
    const callbackBase   = `${new URL(req.url).origin}/api/orgs/${orgSlug}/marketing-studio/sessions/${sessionId}/callback`;
    const callbackUrl    = callbackSecret
      ? `${callbackBase}?token=${encodeURIComponent(callbackSecret)}`
      : callbackBase;

    const executionPayload: StudioExecutionPayload = {
      sessionId,
      organizationId:  organization.id,
      tenantId:        session.tenantId,
      requestId:       `req_${sessionId}_${Date.now().toString(36)}`,
      mode:            "guided_workflow",
      objective,
      workflow,
      garment:         fingerprint,
      fidelityMode,
      preset,
      targetPlatforms: inputs.targetPlatform ? [inputs.targetPlatform] : tenantCfg.luca.defaultPlatforms,
      contentObjective: tenantCfg.luca.defaultObjective,
      contentTone:     tenantCfg.brandVoice.tones[0] ?? "casual",
      locale:          "es-CO",
      // Strict-mode fields: front/back source images and detail locks
      frontImageUrl:   isStrictMode ? productUpload.imageUrl : undefined,
      backImageUrl:    isStrictMode ? productUpload.backImageUrl : undefined,
      detailLocks,
      draftShopify:    workflow.createProductDraft,
      assets: buildAssetRequests(
        dbAssets.map((a, idx) => {
          const ap   = assetPrompts[idx];
          const meta = a.providerMeta as { prompt?: string } | null;
          return {
            id:              a.id,
            assetType:       a.assetType as Parameters<typeof buildAssetRequests>[0][number]["assetType"],
            prompt:          meta?.prompt ?? ap?.prompt,
            content:         a.content ?? undefined,
            sourceImageUrl:  ap && "sourceImageUrl" in ap ? ap.sourceImageUrl : undefined,
            angle:           ap && "angle" in ap ? ap.angle : undefined,
          };
        }),
      ),
      callbackUrl,
      schemaVersion: "1.0",
      createdAt:     new Date().toISOString(),
    };

    const webhookPayload = buildN8nWebhookPayload(executionPayload);

    // ── 8. Dispatch ──────────────────────────────────────────────────────────
    const executor = getExecutor();
    const result   = await executor.dispatch(webhookPayload);

    // ── 9. Persist ───────────────────────────────────────────────────────────
    await updateDbSessionExecution(sessionId, result.jobId, webhookPayload);

    return NextResponse.json({
      jobId:     result.jobId,
      stubbed:   result.stubbed,
      sessionId,
      // Surface asset IDs so the wizard can build the draft package client-side
      assetIds:  dbAssets.map((a) => ({ id: a.id, assetType: a.assetType })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });

    console.error("[marketing-studio/sessions/execute/POST]", err);

    try { await updateDbSessionFailed(sessionId, msg); } catch { /* ignore */ }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
