/**
 * lib/marketing-studio/social/runtime/social-executor.ts
 *
 * MS-16 — Social Publishing Execution Engine: Executor
 *
 * executeSocialPublication() — executes one publication through adapter pipeline
 * executeQueueBatch()        — processes multiple publications with failure isolation
 *
 * SERVER ONLY.
 */

import { publishToTikTok }     from "../adapters/tiktok-adapter";
import { publishToInstagram }  from "../adapters/instagram-adapter";
import { publishToFacebook }   from "../adapters/facebook-adapter";
import { publishToWhatsApp }   from "../adapters/whatsapp-adapter";
import {
  shouldRetryPublication,
  classifyPublicationFailure,
  buildUpdatedRetryState,
  computeNextRetryAt,
  deriveRetryPolicy,
} from "../social-retries";
import { detectPublicationBlockers } from "../social-queue";
import {
  SOCIAL_STATUS,
  SOCIAL_FAILURE_TYPE,
  type SocialPublication,
  type SocialExecutionResult,
  type SocialChannel,
} from "../social-types";
import { handleSocialEvent } from "./social-events";

// ── Execution result ───────────────────────────────────────────────────────────

export interface ExecutionStepResult {
  publicationId: string;
  success:       boolean;
  result:        SocialExecutionResult | null;
  errorMessage:  string | null;
  skipped:       boolean;
  skipReason:    string | null;
}

export interface BatchRunResult {
  processed:  number;
  succeeded:  number;
  failed:     number;
  skipped:    number;
  results:    ExecutionStepResult[];
}

// ── Single publication executor ────────────────────────────────────────────────

/**
 * Full pipeline for one publication:
 * 1. validate
 * 2. check blockers
 * 3. resolve adapter
 * 4. execute
 * 5. emit events
 * 6. update linked runtimes
 */
export async function executeSocialPublication(
  pub:            SocialPublication,
  accessTokens:   Record<string, string>,  // channel → token (never logged/returned)
): Promise<ExecutionStepResult> {

  // 1. Validate
  const validationErrors = validatePublication(pub);
  if (validationErrors.length > 0) {
    await handleSocialEvent({
      organizationId: pub.organizationId,
      eventType:      "publication.failed",
      publicationId:  pub.id,
      channel:        pub.channel,
      errorMessage:   validationErrors.join("; "),
      campaignId:     pub.campaignLink?.campaignId,
    });
    return {
      publicationId: pub.id,
      success:       false,
      result:        null,
      errorMessage:  validationErrors.join("; "),
      skipped:       false,
      skipReason:    null,
    };
  }

  // 2. Check blockers
  const blockers = detectPublicationBlockers({
    asset:   pub.asset,
    caption: pub.caption,
    channel: pub.channel,
    retry:   {
      failureType: pub.retry.failureType,
      retryCount:  pub.retry.retryCount,
      maxRetries:  pub.retry.maxRetries,
    },
  });

  if (blockers.length > 0) {
    return {
      publicationId: pub.id,
      success:       false,
      result:        null,
      errorMessage:  null,
      skipped:       true,
      skipReason:    blockers[0],
    };
  }

  // 3. Emit "started"
  await handleSocialEvent({
    organizationId: pub.organizationId,
    eventType:      "publication.started",
    publicationId:  pub.id,
    channel:        pub.channel,
    campaignId:     pub.campaignLink?.campaignId,
  });

  // 4. Execute via adapter
  const token  = accessTokens[pub.channel] ?? "";
  const result = await resolveAndExecute(pub, token);

  // 5. Emit result event
  if (result.success) {
    await handleSocialEvent({
      organizationId: pub.organizationId,
      eventType:      "publication.published",
      publicationId:  pub.id,
      channel:        pub.channel,
      platformPostId: result.platformPostId ?? undefined,
      campaignId:     pub.campaignLink?.campaignId,
    });
  } else {
    const canRetry = shouldRetryPublication({
      ...pub,
      retry: buildUpdatedRetryState(
        pub.retry,
        result.errorType ?? SOCIAL_FAILURE_TYPE.UNKNOWN,
        result.errorMessage ?? "",
      ),
    });

    await handleSocialEvent({
      organizationId: pub.organizationId,
      eventType:      canRetry ? "publication.retrying" : "publication.failed",
      publicationId:  pub.id,
      channel:        pub.channel,
      errorMessage:   result.errorMessage ?? undefined,
      campaignId:     pub.campaignLink?.campaignId,
    });
  }

  return {
    publicationId: pub.id,
    success:       result.success,
    result,
    errorMessage:  result.errorMessage,
    skipped:       false,
    skipReason:    null,
  };
}

// ── Batch executor ─────────────────────────────────────────────────────────────

/**
 * Concurrency-safe batch with failure isolation.
 * Each publication is executed independently — one failure does not stop others.
 */
export async function executeQueueBatch(
  publications:  SocialPublication[],
  accessTokens:  Record<string, string>,
  maxBatchSize:  number = 5,
): Promise<BatchRunResult> {
  const results: ExecutionStepResult[] = [];
  let succeeded = 0;
  let failed    = 0;
  let skipped   = 0;

  // Process in chunks for concurrency control
  const chunks = chunkArray(publications.slice(0, maxBatchSize * 2), maxBatchSize);

  for (const chunk of chunks) {
    const chunkResults = await Promise.allSettled(
      chunk.map(pub => executeSocialPublication(pub, accessTokens)),
    );

    for (const settled of chunkResults) {
      if (settled.status === "fulfilled") {
        const r = settled.value;
        results.push(r);
        if (r.skipped)       skipped++;
        else if (r.success)  succeeded++;
        else                 failed++;
      } else {
        // Unexpected executor crash — mark as failed
        failed++;
        results.push({
          publicationId: "unknown",
          success:       false,
          result:        null,
          errorMessage:  settled.reason instanceof Error ? settled.reason.message : "Executor crash",
          skipped:       false,
          skipReason:    null,
        });
      }
    }
  }

  return {
    processed: results.length,
    succeeded,
    failed,
    skipped,
    results,
  };
}

// ── Adapter resolution ─────────────────────────────────────────────────────────

async function resolveAndExecute(
  pub:   SocialPublication,
  token: string,
): Promise<SocialExecutionResult> {
  const assetUrl = pub.asset?.assetUrl ?? "";
  const caption  = pub.caption ?? "";
  const baseInput = {
    organizationId: pub.organizationId,
    publicationId:  pub.id,
    assetUrl,
    caption,
    accessToken:    token,
  };

  switch (pub.channel as SocialChannel) {
    case "tiktok":
      return publishToTikTok({ ...baseInput, privacy: "public_to_everyone" });

    case "instagram": {
      const mediaType = pub.contentType === "carousel" ? "CAROUSEL"
        : pub.contentType === "story"   ? "STORIES"
        : pub.contentType === "reel"    ? "REELS"
        : "IMAGE";
      return publishToInstagram({ ...baseInput, mediaType });
    }

    case "facebook":
      return publishToFacebook({
        ...baseInput,
        pageId:    pub.organizationId, // real pageId would come from integration config
        mediaType: "photo",
      });

    case "whatsapp":
      return publishToWhatsApp({
        ...baseInput,
        phoneNumberId: pub.organizationId,
        mediaType:     "image",
        assetUrl,
        caption,
      });

    default: {
      // youtube or unknown — return pending_external result
      const now = new Date().toISOString();
      return {
        publicationId:  pub.id,
        channel:        pub.channel,
        success:        false,
        platformPostId: null,
        platformUrl:    null,
        errorType:      SOCIAL_FAILURE_TYPE.UNKNOWN,
        errorMessage:   `Canal ${pub.channel} aún no soportado en ejecución directa`,
        durationMs:     0,
        executedAt:     now,
      };
    }
  }
}

// ── Validation ─────────────────────────────────────────────────────────────────

function validatePublication(pub: SocialPublication): string[] {
  const errors: string[] = [];
  if (!pub.id)             errors.push("Publication ID faltante");
  if (!pub.channel)        errors.push("Canal no especificado");
  if (!pub.organizationId) errors.push("OrganizationId faltante");
  return errors;
}

// ── Utility ────────────────────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
