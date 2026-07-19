/**
 * lib/marketing-studio/campaigns/campaign-sequences.ts
 *
 * MS-15 — Campaign Operating System: Launch sequencing engine
 *
 * buildCampaignSequence() — generates a phased launch sequence
 * for a given campaign type + channel set.
 *
 * Pure computation. No Prisma. No async.
 */

import {
  LAUNCH_PHASE,
  LAUNCH_PHASE_SEQUENCE,
  CHANNEL_REQUIRED_CONTENT,
  type CampaignType,
  type CampaignSequence,
  type CampaignContentSlot,
  type ChannelType,
  type ContentType,
  type LaunchPhase,
} from "./campaign-types";

// ── Phase timing configuration (days from campaign start) ─────────────────────

const PHASE_TIMING: Record<LaunchPhase, { startOffset: number; endOffset: number }> = {
  teaser:        { startOffset: -7,  endOffset: -3 },
  reveal:        { startOffset: -3,  endOffset: -1 },
  launch:        { startOffset: 0,   endOffset: 2  },
  reinforcement: { startOffset: 2,   endOffset: 7  },
  urgency:       { startOffset: 7,   endOffset: 10 },
  retention:     { startOffset: 10,  endOffset: 21 },
};

// ── Phase channels (which channels are active per phase) ──────────────────────

const PHASE_CHANNELS: Record<LaunchPhase, ChannelType[]> = {
  teaser:        ["instagram", "tiktok"],
  reveal:        ["instagram", "tiktok", "facebook"],
  launch:        ["instagram", "tiktok", "facebook", "whatsapp", "shopify"],
  reinforcement: ["instagram", "facebook", "whatsapp"],
  urgency:       ["instagram", "whatsapp", "ads"],
  retention:     ["email", "whatsapp"],
};

// ── Phase content types per channel ───────────────────────────────────────────

const PHASE_CONTENT: Record<LaunchPhase, ContentType[]> = {
  teaser:        ["story", "reel"],
  reveal:        ["reel", "carousel", "story"],
  launch:        ["product_post", "carousel", "reel", "whatsapp_push", "collection_banner"],
  reinforcement: ["product_post", "carousel"],
  urgency:       ["banner", "product_post", "whatsapp_push"],
  retention:     ["email", "product_post"],
};

// ── Campaign type → relevant phases ───────────────────────────────────────────

const CAMPAIGN_PHASES: Record<CampaignType, LaunchPhase[]> = {
  launch:             ["teaser", "reveal", "launch", "reinforcement"],
  evergreen:          ["launch", "reinforcement", "retention"],
  seasonal:           ["teaser", "launch", "urgency", "retention"],
  flash_sale:         ["reveal", "launch", "urgency"],
  dropshipping:       ["launch", "reinforcement"],
  branding:           ["teaser", "reveal", "reinforcement", "retention"],
  retention:          ["launch", "reinforcement", "retention"],
  awareness:          ["teaser", "reveal", "launch"],
  whatsapp_push:      ["launch", "urgency"],
  shopify_collection: ["reveal", "launch", "reinforcement"],
};

// ── Sequence builder ───────────────────────────────────────────────────────────

export interface BuildSequenceOpts {
  campaignType:  CampaignType;
  channels:      ChannelType[];
  existingSlots: CampaignContentSlot[];
}

/**
 * Builds a list of CampaignSequence objects for a campaign.
 * Each sequence corresponds to one launch phase.
 */
export function buildCampaignSequence(opts: BuildSequenceOpts): CampaignSequence[] {
  const { campaignType, channels, existingSlots } = opts;

  const phases = CAMPAIGN_PHASES[campaignType] ?? ["launch"];

  return phases.map(phase => {
    // Intersect phase channels with campaign channels
    const phaseChannels = PHASE_CHANNELS[phase].filter(c =>
      (channels as string[]).includes(c),
    );

    const timing = PHASE_TIMING[phase];

    // Count required content slots for this phase
    const requiredContentTypes = PHASE_CONTENT[phase];

    // Count ready slots for this phase across all channels
    const readyCount = existingSlots.filter(s =>
      s.phase === phase && s.isReady,
    ).length;

    // Total expected slots = contentTypes × channels
    const totalExpected = requiredContentTypes.length * Math.max(phaseChannels.length, 1);
    const missingSlots  = Math.max(0, totalExpected - readyCount);

    return {
      phase,
      label:        getLaunchPhaseLabel(phase),
      channels:     phaseChannels,
      contentTypes: requiredContentTypes,
      startOffset:  timing.startOffset,
      endOffset:    timing.endOffset,
      isComplete:   missingSlots === 0 && readyCount > 0,
      missingSlots,
    };
  });
}

function getLaunchPhaseLabel(phase: LaunchPhase): string {
  const labels: Record<LaunchPhase, string> = {
    teaser:        "Fase Teaser",
    reveal:        "Fase Reveal",
    launch:        "Lanzamiento",
    reinforcement: "Refuerzo",
    urgency:       "Urgencia",
    retention:     "Retención",
  };
  return labels[phase] ?? phase;
}

// ── Calendar slot generation ───────────────────────────────────────────────────

/**
 * Generate required content slots for a campaign based on its type and channels.
 * Used during campaign initialization to scaffold the editorial plan.
 */
export function generateRequiredContentSlots(
  campaignId:    string,
  campaignType:  CampaignType,
  channels:      ChannelType[],
): Omit<CampaignContentSlot, "id" | "assetId" | "scheduledAt">[] {
  const phases = CAMPAIGN_PHASES[campaignType] ?? ["launch"];
  const slots:  Omit<CampaignContentSlot, "id" | "assetId" | "scheduledAt">[] = [];

  for (const phase of phases) {
    const phaseChannels = PHASE_CHANNELS[phase].filter(c =>
      (channels as string[]).includes(c),
    );

    for (const channel of phaseChannels) {
      const required = CHANNEL_REQUIRED_CONTENT[channel] ?? [];
      const phaseTypes = PHASE_CONTENT[phase];
      // Only include types that are both phase-appropriate and channel-required
      const relevant = phaseTypes.filter(t => required.includes(t) || phaseTypes.length <= 2);

      for (const contentType of relevant.slice(0, 2)) {
        slots.push({
          contentType: contentType as ContentType,
          channel:     channel as ChannelType,
          phase,
          isReady:     false,
          notes:       null,
        });
      }
    }
  }

  return slots;
}

// ── Sequence completeness analysis ────────────────────────────────────────────

export interface SequenceGap {
  phase:       LaunchPhase;
  channel:     ChannelType;
  contentType: ContentType;
  label:       string;
}

export function analyzeSequenceGaps(
  campaignType:  CampaignType,
  channels:      ChannelType[],
  existingSlots: CampaignContentSlot[],
): SequenceGap[] {
  const phases = CAMPAIGN_PHASES[campaignType] ?? ["launch"];
  const gaps:  SequenceGap[] = [];

  for (const phase of phases) {
    const phaseChannels = PHASE_CHANNELS[phase].filter(c =>
      (channels as string[]).includes(c),
    );
    const phaseTypes = PHASE_CONTENT[phase];

    for (const channel of phaseChannels) {
      for (const contentType of phaseTypes) {
        const hasReady = existingSlots.some(
          s => s.phase === phase && s.channel === channel &&
               s.contentType === contentType && s.isReady,
        );
        if (!hasReady) {
          gaps.push({
            phase,
            channel:     channel as ChannelType,
            contentType: contentType as ContentType,
            label:       `${phase} / ${channel}: falta "${contentType}"`,
          });
        }
      }
    }
  }

  return gaps;
}
