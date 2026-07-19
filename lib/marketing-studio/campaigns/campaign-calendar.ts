/**
 * lib/marketing-studio/campaigns/campaign-calendar.ts
 *
 * MS-15 — Campaign Operating System: Editorial calendar engine
 *
 * buildEditorialCalendar() — generates daily/weekly publication slots
 * across campaigns with collision detection and cadence spacing.
 *
 * Pure computation. No Prisma. No async.
 */

import {
  CAMPAIGN_STATUS,
  type CampaignEntity,
  type CampaignCalendarEvent,
  type CampaignLaunchWindow,
  type ContentType,
  type ChannelType,
  type CampaignPriority,
  type LaunchPhase,
} from "./campaign-types";
import { randomUUID } from "crypto";

// ── Calendar modes ─────────────────────────────────────────────────────────────

export type CalendarMode = "weekly" | "monthly" | "launch" | "campaign";

export interface CalendarDay {
  date:         string;         // ISO date (YYYY-MM-DD)
  dayLabel:     string;
  isToday:      boolean;
  isWeekend:    boolean;
  events:       CampaignCalendarEvent[];
  hasConflict:  boolean;
  totalSlots:   number;
  readySlots:   number;
}

export interface EditorialCalendar {
  mode:        CalendarMode;
  startDate:   string;
  endDate:     string;
  days:        CalendarDay[];
  totalEvents: number;
  readyEvents: number;
  conflicts:   { date: string; channel: ChannelType; count: number }[];
}

// ── Max posts per channel per day (to detect overposting) ─────────────────────

const MAX_DAILY_POSTS: Record<ChannelType, number> = {
  instagram: 3,
  tiktok:    2,
  facebook:  2,
  whatsapp:  1,
  shopify:   5,
  landing:   2,
  ads:       5,
  email:     1,
};

// ── Builder ────────────────────────────────────────────────────────────────────

export function buildEditorialCalendar(opts: {
  campaigns:  CampaignEntity[];
  mode:       CalendarMode;
  anchorDate: string; // ISO — center of the calendar view
}): EditorialCalendar {
  const { campaigns, mode, anchorDate } = opts;

  const anchor = new Date(anchorDate);
  const { startDate, endDate } = getDateRange(anchor, mode);

  // Generate base calendar events from campaign content slots + launch windows
  const events: CampaignCalendarEvent[] = [];

  for (const campaign of campaigns) {
    if (campaign.status === CAMPAIGN_STATUS.COMPLETED ||
        campaign.status === CAMPAIGN_STATUS.FAILED) continue;

    // Generate events from scheduled content slots
    for (const slot of campaign.contentSlots) {
      if (!slot.scheduledAt) {
        // Auto-assign based on phase + campaign start
        const slotDate = deriveSlotDate(campaign.startDate, slot.phase);
        if (!slotDate) continue;

        events.push({
          id:           slot.id,
          campaignId:   campaign.id,
          campaignName: campaign.name,
          contentType:  slot.contentType,
          channel:      slot.channel,
          phase:        slot.phase,
          scheduledAt:  slotDate,
          isReady:      slot.isReady,
          priority:     campaign.priority,
        });
      } else {
        events.push({
          id:           slot.id,
          campaignId:   campaign.id,
          campaignName: campaign.name,
          contentType:  slot.contentType,
          channel:      slot.channel,
          phase:        slot.phase,
          scheduledAt:  slot.scheduledAt,
          isReady:      slot.isReady,
          priority:     campaign.priority,
        });
      }
    }
  }

  // Filter events to window
  const windowStart = new Date(startDate).getTime();
  const windowEnd   = new Date(endDate).getTime();
  const windowedEvents = events.filter(e => {
    const t = new Date(e.scheduledAt).getTime();
    return t >= windowStart && t <= windowEnd;
  });

  // Build calendar days
  const days = buildCalendarDays(startDate, endDate, windowedEvents);

  // Detect conflicts
  const conflicts = detectConflicts(windowedEvents);

  return {
    mode,
    startDate,
    endDate,
    days,
    totalEvents: windowedEvents.length,
    readyEvents: windowedEvents.filter(e => e.isReady).length,
    conflicts,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getDateRange(
  anchor: Date,
  mode:   CalendarMode,
): { startDate: string; endDate: string } {
  const start = new Date(anchor);
  const end   = new Date(anchor);

  if (mode === "weekly") {
    // Sunday of anchor week
    start.setDate(anchor.getDate() - anchor.getDay());
    end.setDate(start.getDate() + 6);
  } else if (mode === "monthly" || mode === "campaign") {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1);
    end.setDate(0);
  } else {
    // launch mode: -7 to +30 days
    start.setDate(anchor.getDate() - 7);
    end.setDate(anchor.getDate() + 30);
  }

  return {
    startDate: start.toISOString().split("T")[0],
    endDate:   end.toISOString().split("T")[0],
  };
}

function buildCalendarDays(
  startDate: string,
  endDate:   string,
  events:    CampaignCalendarEvent[],
): CalendarDay[] {
  const days: CalendarDay[] = [];
  const today    = new Date().toISOString().split("T")[0];
  const current  = new Date(startDate);
  const end      = new Date(endDate);

  while (current <= end) {
    const dateStr = current.toISOString().split("T")[0];
    const dayEvents = events.filter(e => e.scheduledAt.startsWith(dateStr));

    // Detect overposting per channel
    const channelCounts: Record<string, number> = {};
    for (const ev of dayEvents) {
      channelCounts[ev.channel] = (channelCounts[ev.channel] ?? 0) + 1;
    }
    const hasConflict = Object.entries(channelCounts).some(
      ([ch, count]) => count > (MAX_DAILY_POSTS[ch as ChannelType] ?? 5),
    );

    days.push({
      date:        dateStr,
      dayLabel:    current.toLocaleDateString("es-CO", { weekday: "short", day: "numeric" }),
      isToday:     dateStr === today,
      isWeekend:   current.getDay() === 0 || current.getDay() === 6,
      events:      dayEvents,
      hasConflict,
      totalSlots:  dayEvents.length,
      readySlots:  dayEvents.filter(e => e.isReady).length,
    });

    current.setDate(current.getDate() + 1);
  }

  return days;
}

function detectConflicts(
  events: CampaignCalendarEvent[],
): { date: string; channel: ChannelType; count: number }[] {
  const conflicts: { date: string; channel: ChannelType; count: number }[] = [];
  const map: Record<string, number> = {};

  for (const ev of events) {
    const key = `${ev.scheduledAt.split("T")[0]}:${ev.channel}`;
    map[key] = (map[key] ?? 0) + 1;
  }

  for (const [key, count] of Object.entries(map)) {
    const [date, channel] = key.split(":");
    const max = MAX_DAILY_POSTS[channel as ChannelType] ?? 5;
    if (count > max) {
      conflicts.push({ date, channel: channel as ChannelType, count });
    }
  }

  return conflicts;
}

/**
 * Derive an ISO date for a content slot based on campaign start + phase offset.
 */
function deriveSlotDate(
  campaignStart: string | null,
  phase:         LaunchPhase,
): string | null {
  if (!campaignStart) return null;

  const PHASE_OFFSETS: Record<LaunchPhase, number> = {
    teaser:        -7,
    reveal:        -3,
    launch:        0,
    reinforcement: 3,
    urgency:       8,
    retention:     14,
  };

  const offset = PHASE_OFFSETS[phase] ?? 0;
  const base   = new Date(campaignStart);
  base.setDate(base.getDate() + offset);
  return base.toISOString();
}

// ── Launch windows ─────────────────────────────────────────────────────────────

export function buildLaunchWindows(
  campaigns: CampaignEntity[],
): CampaignLaunchWindow[] {
  const now = new Date();
  const windows: CampaignLaunchWindow[] = [];

  for (const campaign of campaigns) {
    if (!campaign.startDate) continue;
    if (campaign.status === CAMPAIGN_STATUS.COMPLETED ||
        campaign.status === CAMPAIGN_STATUS.FAILED) continue;

    const launchDate   = new Date(campaign.startDate);
    const msToLaunch   = launchDate.getTime() - now.getTime();
    const daysToLaunch = Math.round(msToLaunch / (1000 * 60 * 60 * 24));
    const isOverdue    = msToLaunch < 0;
    const isLive       = campaign.status === CAMPAIGN_STATUS.ACTIVE;

    // Find the launch phase in sequences
    const launchSeq = campaign.sequences.find(s => s.phase === "launch");

    windows.push({
      campaignId:   campaign.id,
      campaignName: campaign.name,
      phase:        "launch",
      startsAt:     campaign.startDate,
      endsAt:       campaign.endDate,
      channels:     launchSeq?.channels ?? campaign.channels,
      isLive,
      isOverdue:    isOverdue && !isLive,
      daysToLaunch: isOverdue ? null : daysToLaunch,
    });
  }

  return windows.sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    const aD = a.startsAt ?? "";
    const bD = b.startsAt ?? "";
    return aD.localeCompare(bD);
  });
}
