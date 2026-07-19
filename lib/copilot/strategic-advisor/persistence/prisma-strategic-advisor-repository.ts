// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 26: Prisma Repository
import "server-only";

import type { PrismaClient } from "@prisma/client";
import type { StrategicAdvisorRepository } from "../strategic-advisor-repository";
import type {
  StrategicAdvice, StrategicConcern, StrategicOpportunityAssessment,
  StrategicQuestion, StrategicRecommendation, StrategicAdvisorBriefing,
  StrategicAdvisorDigest, StrategicDomain, StrategicAdviceConfidence, StrategicAdvicePriority,
} from "../strategic-advisor-types";
import { confidenceSaFromScore } from "../strategic-advisor-types";

// ── Repository ────────────────────────────────────────────────────────────────

export class PrismaStrategicAdvisorRepository implements StrategicAdvisorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveAdvice(advice: StrategicAdvice): Promise<void> {
    await (this.prisma as any).strategicAdviceRecord.upsert({
      where:  { id: advice.id },
      create: _mapAdviceToRecord(advice),
      update: _mapAdviceToRecord(advice),
    });
  }

  async saveConcern(concern: StrategicConcern): Promise<void> {
    await (this.prisma as any).strategicConcernRecord.upsert({
      where:  { id: concern.id },
      create: _mapConcernToRecord(concern),
      update: _mapConcernToRecord(concern),
    });
  }

  async saveOpportunity(opp: StrategicOpportunityAssessment): Promise<void> {
    await (this.prisma as any).strategicOpportunityRecord.upsert({
      where:  { id: opp.id },
      create: _mapOppToRecord(opp),
      update: _mapOppToRecord(opp),
    });
  }

  async saveQuestion(q: StrategicQuestion): Promise<void> {
    await (this.prisma as any).strategicQuestionRecord.upsert({
      where:  { id: q.id },
      create: _mapQuestionToRecord(q),
      update: _mapQuestionToRecord(q),
    });
  }

  async saveRecommendation(rec: StrategicRecommendation): Promise<void> {
    await (this.prisma as any).strategicRecommendationRecord.upsert({
      where:  { id: rec.id },
      create: _mapRecToRecord(rec),
      update: _mapRecToRecord(rec),
    });
  }

  async saveBriefing(briefing: StrategicAdvisorBriefing): Promise<void> {
    await (this.prisma as any).strategicAdvisorBriefingRecord.upsert({
      where:  { id: briefing.id },
      create: _mapBriefingToRecord(briefing),
      update: _mapBriefingToRecord(briefing),
    });
  }

  async saveDigest(digest: StrategicAdvisorDigest): Promise<void> {
    await (this.prisma as any).strategicAdvisorDigestRecord.upsert({
      where:  { id: digest.id },
      create: _mapDigestToRecord(digest),
      update: _mapDigestToRecord(digest),
    });
  }

  async getLatestAdvice(orgSlug: string, limit = 10): Promise<StrategicAdvice[]> {
    const rows = await (this.prisma as any).strategicAdviceRecord.findMany({
      where: { orgSlug }, orderBy: { generatedAt: "desc" }, take: limit,
    });
    return rows.map(_recordToAdvice);
  }

  async getLatestConcerns(orgSlug: string, limit = 10): Promise<StrategicConcern[]> {
    const rows = await (this.prisma as any).strategicConcernRecord.findMany({
      where: { orgSlug }, orderBy: { detectedAt: "desc" }, take: limit,
    });
    return rows.map(_recordToConcern);
  }

  async getLatestOpportunities(orgSlug: string, limit = 10): Promise<StrategicOpportunityAssessment[]> {
    const rows = await (this.prisma as any).strategicOpportunityRecord.findMany({
      where: { orgSlug }, orderBy: { createdAt: "desc" }, take: limit,
    });
    return rows.map(_recordToOpp);
  }

  async getLatestQuestions(orgSlug: string, limit = 10): Promise<StrategicQuestion[]> {
    const rows = await (this.prisma as any).strategicQuestionRecord.findMany({
      where: { orgSlug }, orderBy: { createdAt: "desc" }, take: limit,
    });
    return rows.map(_recordToQuestion);
  }

  async getLatestRecommendations(orgSlug: string, limit = 10): Promise<StrategicRecommendation[]> {
    const rows = await (this.prisma as any).strategicRecommendationRecord.findMany({
      where: { orgSlug }, orderBy: { createdAt: "desc" }, take: limit,
    });
    return rows.map(_recordToRec);
  }

  async getLatestBriefing(orgSlug: string, type: StrategicAdvisorBriefing["type"]): Promise<StrategicAdvisorBriefing | null> {
    const row = await (this.prisma as any).strategicAdvisorBriefingRecord.findFirst({
      where: { orgSlug, type }, orderBy: { generatedAt: "desc" },
    });
    return row ? _recordToBriefing(row) : null;
  }

  async getLatestDigest(orgSlug: string, period: StrategicAdvisorDigest["period"]): Promise<StrategicAdvisorDigest | null> {
    const row = await (this.prisma as any).strategicAdvisorDigestRecord.findFirst({
      where: { orgSlug, period }, orderBy: { generatedAt: "desc" },
    });
    return row ? _recordToDigest(row) : null;
  }
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function _mapAdviceToRecord(a: StrategicAdvice) {
  return { id: a.id, orgSlug: a.orgSlug, title: a.title, body: a.body, summary: a.summary, domain: a.domain, priority: a.priority, confidence: a.confidence, confidenceScore: a.confidenceScore, traceable: a.traceable, evidenceIds: a.evidenceIds, metadata: a.metadata, generatedAt: new Date(a.generatedAt) };
}

function _mapConcernToRecord(c: StrategicConcern) {
  return { id: c.id, orgSlug: c.orgSlug, title: c.title, description: c.description, domain: c.domain, severity: c.severity, confidence: c.confidence, confidenceScore: c.confidenceScore, isEmergent: c.isEmergent, isLatent: c.isLatent, rationale: c.rationale, evidenceIds: c.evidenceIds, metadata: c.metadata, detectedAt: new Date(c.detectedAt) };
}

function _mapOppToRecord(o: StrategicOpportunityAssessment) {
  return { id: o.id, orgSlug: o.orgSlug, title: o.title, description: o.description, domain: o.domain, magnitude: o.magnitude, confidence: o.confidence, confidenceScore: o.confidenceScore, captureScore: o.captureScore, timeHorizon: o.timeHorizon, isIgnored: o.isIgnored, rationale: o.rationale, evidenceIds: o.evidenceIds, metadata: o.metadata };
}

function _mapQuestionToRecord(q: StrategicQuestion) {
  return { id: q.id, orgSlug: q.orgSlug, question: q.question, rationale: q.rationale, domain: q.domain, priority: q.priority, confidence: q.confidence, category: q.category, evidenceIds: q.evidenceIds, metadata: q.metadata };
}

function _mapRecToRecord(r: StrategicRecommendation) {
  return { id: r.id, orgSlug: r.orgSlug, title: r.title, description: r.description, rationale: r.rationale, domain: r.domain, priority: r.priority, confidence: r.confidence, confidenceScore: r.confidenceScore, expectedImpact: r.expectedImpact, associatedRisks: r.associatedRisks, evidenceIds: r.evidenceIds, playbookIds: r.playbookIds, metadata: r.metadata };
}

function _mapBriefingToRecord(b: StrategicAdvisorBriefing) {
  return { id: b.id, orgSlug: b.orgSlug, type: b.type, title: b.title, summary: b.summary, headline: b.headline, advisorScore: b.advisorScore, confidence: b.confidence, metadata: b.metadata, generatedAt: new Date(b.generatedAt) };
}

function _mapDigestToRecord(d: StrategicAdvisorDigest) {
  return { id: d.id, orgSlug: d.orgSlug, period: d.period, title: d.title, headline: d.headline, advisorScore: d.advisorScore, confidence: d.confidence, metadata: d.metadata, generatedAt: new Date(d.generatedAt) };
}

function _recordToAdvice(r: any): StrategicAdvice {
  return { ...r, generatedAt: r.generatedAt?.toISOString?.() ?? r.generatedAt };
}
function _recordToConcern(r: any): StrategicConcern {
  return { ...r, detectedAt: r.detectedAt?.toISOString?.() ?? r.detectedAt };
}
function _recordToOpp(r: any): StrategicOpportunityAssessment { return r; }
function _recordToQuestion(r: any): StrategicQuestion { return r; }
function _recordToRec(r: any): StrategicRecommendation { return { ...r, suggestedOnly: true as const }; }
function _recordToBriefing(r: any): StrategicAdvisorBriefing {
  return { ...r, generatedAt: r.generatedAt?.toISOString?.() ?? r.generatedAt, topConcerns: r.topConcerns ?? [], topOpportunities: r.topOpportunities ?? [], topRecommendations: r.topRecommendations ?? [], keyQuestions: r.keyQuestions ?? [], domains: r.domains ?? [] };
}
function _recordToDigest(r: any): StrategicAdvisorDigest {
  return { ...r, generatedAt: r.generatedAt?.toISOString?.() ?? r.generatedAt, topConcerns: r.topConcerns ?? [], topOpportunities: r.topOpportunities ?? [], topRecommendations: r.topRecommendations ?? [] };
}
