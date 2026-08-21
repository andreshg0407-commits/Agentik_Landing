/**
 * app/api/orgs/[orgSlug]/copilot/chat/route.ts
 *
 * Copilot Core — Chat API Route
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C
 *
 * Tenant-scoped. Stateless. Production hard-blocked.
 *
 * Route handler order:
 *   1. Production block (VERCEL_ENV=production → 404)
 *   2. Feature flag (COPILOT_COMMERCIAL_PREVIEW_ENABLED → 404)
 *   3. Body validation (message: string, length ≤ 4000)
 *   4. buildCopilotEnvelope (auth + role gate + module check)
 *   5. Rate limit (organizationId:userId → 429)
 *   6. handleCopilotMessage (intent → adapter → mock)
 *   7. Return CopilotChatResponse with requestId
 */

import { NextResponse } from "next/server";
import { buildCopilotEnvelope } from "@/lib/copilot-core/copilot-core-envelope-builder";
import { handleCopilotMessage } from "@/lib/copilot-core/copilot-core-chat-runtime";
import { checkRateLimit } from "@/lib/copilot-core/copilot-core-rate-limiter";

const MAX_MESSAGE_LENGTH = 4000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  // Step 1: Production hard block
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Step 2: Feature flag
  if (process.env.COPILOT_COMMERCIAL_PREVIEW_ENABLED !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Step 3: Body validation
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (body == null || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { message } = body as Record<string, unknown>;
  if (typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message exceeds ${MAX_MESSAGE_LENGTH} characters` },
      { status: 400 },
    );
  }

  const { orgSlug } = await params;

  // Step 4: Build envelope (auth + role gate + module check)
  let envelope;
  try {
    envelope = await buildCopilotEnvelope({
      orgSlug,
      serverSurface: "desktop",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      msg === "ACCESS_DENIED" ||
      msg === "COPILOT_ROLE_BLOCKED" ||
      msg === "ACCESS_DENIED_SELLER_CONFINED"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (msg === "ORG_NOT_FOUND") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (
      msg === "COPILOT_MODULE_NOT_ENABLED" ||
      msg === "ORG_INACTIVE"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Unknown error — don't leak details
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Step 5: Rate limit
  const rateResult = checkRateLimit(envelope.organizationId, envelope.userId);
  if (!rateResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: rateResult.retryAfterMs
          ? { "Retry-After": String(Math.ceil(rateResult.retryAfterMs / 1000)) }
          : undefined,
      },
    );
  }

  // Step 6: Handle message
  try {
    const response = await handleCopilotMessage({
      envelope,
      userMessage: message.trim(),
    });

    // Step 7: Return response
    return NextResponse.json({
      requestId: response.requestId,
      answer: {
        answerId: response.answer.answerId,
        text: response.answer.text,
        truthState: response.answer.truthState,
        asOf: response.answer.asOf,
        capabilityId: response.answer.capabilityId,
        warnings: response.answer.warnings,
        facts: response.answer.facts.map((f) => ({
          source: f.source,
          truthState: f.truthState,
          confidence: f.confidence,
          sourceUpdatedAt: f.sourceUpdatedAt,
        })),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}
