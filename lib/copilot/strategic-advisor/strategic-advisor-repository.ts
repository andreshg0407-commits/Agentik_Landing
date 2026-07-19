// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 25: Repository Contract

import type {
  StrategicAdvice, StrategicConcern, StrategicOpportunityAssessment,
  StrategicQuestion, StrategicRecommendation, StrategicAdvisorBriefing,
  StrategicAdvisorDigest,
} from "./strategic-advisor-types";

export interface StrategicAdvisorRepository {
  saveAdvice(advice: StrategicAdvice): Promise<void>;
  saveConcern(concern: StrategicConcern): Promise<void>;
  saveOpportunity(opportunity: StrategicOpportunityAssessment): Promise<void>;
  saveQuestion(question: StrategicQuestion): Promise<void>;
  saveRecommendation(recommendation: StrategicRecommendation): Promise<void>;
  saveBriefing(briefing: StrategicAdvisorBriefing): Promise<void>;
  saveDigest(digest: StrategicAdvisorDigest): Promise<void>;

  getLatestAdvice(orgSlug: string, limit?: number): Promise<StrategicAdvice[]>;
  getLatestConcerns(orgSlug: string, limit?: number): Promise<StrategicConcern[]>;
  getLatestOpportunities(orgSlug: string, limit?: number): Promise<StrategicOpportunityAssessment[]>;
  getLatestQuestions(orgSlug: string, limit?: number): Promise<StrategicQuestion[]>;
  getLatestRecommendations(orgSlug: string, limit?: number): Promise<StrategicRecommendation[]>;
  getLatestBriefing(orgSlug: string, type: StrategicAdvisorBriefing["type"]): Promise<StrategicAdvisorBriefing | null>;
  getLatestDigest(orgSlug: string, period: StrategicAdvisorDigest["period"]): Promise<StrategicAdvisorDigest | null>;
}
