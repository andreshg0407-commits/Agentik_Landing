/**
 * lib/marketing-studio/distribution/distribution-scheduler.ts
 *
 * MS-14 — Distribution Runtime: Scheduler
 *
 * resolveScheduledDrops()  — finds drops due for execution
 * scheduleDistributionDrop() — creates a DistributionSchedule record
 *
 * SERVER ONLY.
 */

import {
  listDistributionSchedules,
  createDistributionSchedule,
  updateScheduleStatus,
} from "./distribution-repository";
import { executePipelineStage, buildPipelineStages } from "./distribution-pipelines";
import { createDistributionPipeline } from "./distribution-repository";
import type { DistributionScheduleDTO } from "./distribution-types";

// ── Scheduled drop resolution ──────────────────────────────────────────────────

/**
 * Find all pending schedules that are due (scheduledAt <= now).
 */
export async function resolveScheduledDrops(
  organizationId: string,
): Promise<DistributionScheduleDTO[]> {
  const pending = await listDistributionSchedules(organizationId, ["pending", "queued"]);
  const now = new Date();

  return pending.filter(s => {
    if (!s.scheduledAt) return false;
    return new Date(s.scheduledAt) <= now;
  });
}

/**
 * Execute a due schedule: create pipeline + dispatch jobs.
 * Marks schedule as completed on success, failed on error.
 */
export async function executeDueSchedule(
  schedule:       DistributionScheduleDTO,
  organizationId: string,
): Promise<{ success: boolean; pipelineId?: string; error?: string }> {
  try {
    // Build pipeline for the channel
    const stages = buildPipelineStages([schedule.channel], schedule.slotType);

    const pipeline = await createDistributionPipeline({
      organizationId,
      name:        schedule.label,
      pipelineType: "whatsapp_drop",
      channels:    [schedule.channel],
      productIds:  schedule.productIds,
      stages,
    });

    // Execute first stage (readiness_check)
    const firstStage = stages[0];
    if (firstStage) {
      await executePipelineStage({
        organizationId,
        pipelineId:  pipeline.id,
        stage:       firstStage,
        productIds:  schedule.productIds,
        catalogId:   null,
      });
    }

    await updateScheduleStatus(schedule.id, organizationId, "published");

    return { success: true, pipelineId: pipeline.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateScheduleStatus(schedule.id, organizationId, "failed");
    return { success: false, error: message };
  }
}

// ── Schedule creation ──────────────────────────────────────────────────────────

export interface CreateDropScheduleInput {
  organizationId: string;
  label:          string;
  channel:        string;
  scheduledAt:    string | null;
  productIds:     string[];
  timezone?:      string;
  notes?:         string | null;
}

export async function scheduleDistributionDrop(
  input: CreateDropScheduleInput,
): Promise<DistributionScheduleDTO> {
  return createDistributionSchedule({
    organizationId: input.organizationId,
    label:          input.label,
    slotType:       input.scheduledAt ? "scheduled" : "immediate",
    channel:        input.channel,
    timezone:       input.timezone ?? "America/Bogota",
    scheduledAt:    input.scheduledAt,
    productIds:     input.productIds,
    notes:          input.notes ?? null,
  });
}

// ── Cron worker entrypoint ─────────────────────────────────────────────────────

/**
 * Process all due drops for a single organization.
 * Called from internal worker cron.
 */
export async function processAllDueDrops(
  organizationId: string,
): Promise<{ processed: number; failed: number }> {
  const due = await resolveScheduledDrops(organizationId);
  let processed = 0;
  let failed    = 0;

  for (const schedule of due) {
    const result = await executeDueSchedule(schedule, organizationId);
    if (result.success) {
      processed++;
    } else {
      failed++;
    }
  }

  return { processed, failed };
}
