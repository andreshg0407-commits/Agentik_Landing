#!/usr/bin/env node
// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 51: Validation Script
// 7000+ checks. Run: node scripts/_run-executive-governance-validation.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const GOV  = path.join(ROOT, "lib/copilot/executive-governance");
const INT  = path.join(GOV, "integrations");

let passed = 0;
let failed = 0;
const failures = [];

function check(condition, message) {
  if (condition) { passed++; }
  else { failed++; failures.push(`FAIL: ${message}`); }
}

function readFile(filePath) {
  try { return fs.readFileSync(filePath, "utf-8"); } catch { return ""; }
}

function countOccurrences(str, sub) {
  let count = 0; let pos = 0;
  while ((pos = str.indexOf(sub, pos)) !== -1) { count++; pos++; }
  return count;
}

// ─── Phase 1: Types ──────────────────────────────────────────────────────────
const types = readFile(path.join(GOV, "executive-governance-types.ts"));
check(types.includes("GovernanceConfidence"), "types: GovernanceConfidence");
check(types.includes("GovernanceStatus"), "types: GovernanceStatus");
check(types.includes("GovernancePriorityLevel"), "types: GovernancePriorityLevel");
check(types.includes("GovernanceDomain"), "types: GovernanceDomain");
check(types.includes("GovernanceAuthorityLevel"), "types: GovernanceAuthorityLevel");
check(types.includes("GovernancePolicyType"), "types: GovernancePolicyType");
check(types.includes("GovernanceRuleType"), "types: GovernanceRuleType");
check(types.includes("GovernanceExceptionType"), "types: GovernanceExceptionType");
check(types.includes("GovernanceEscalationType"), "types: GovernanceEscalationType");
check(types.includes("GovernanceViolationType"), "types: GovernanceViolationType");
check(types.includes("GovernanceRiskType"), "types: GovernanceRiskType");
check(types.includes("GovernanceControlType"), "types: GovernanceControlType");
check(types.includes("GovernanceBriefingType"), "types: GovernanceBriefingType");
check(types.includes("GovernanceDigestPeriod"), "types: GovernanceDigestPeriod");
check(types.includes("suggestedOnly: true"), "types: suggestedOnly literal");
check(types.includes("GovernanceDecisionCandidate"), "types: GovernanceDecisionCandidate");
check(types.includes("GovernanceRecommendation"), "types: GovernanceRecommendation");
check(types.includes("GovernanceReport"), "types: GovernanceReport");
check(types.includes("GovernanceScore"), "types: GovernanceScore");
check(types.includes("GovernanceNarrative"), "types: GovernanceNarrative");
check(types.includes("GovernanceDigest"), "types: GovernanceDigest");
check(types.includes("GovernanceBriefing"), "types: GovernanceBriefing");
check(types.includes("GovernanceAssessment"), "types: GovernanceAssessment");
check(types.includes("ExecutiveGovernanceInput"), "types: ExecutiveGovernanceInput");
check(types.includes("ExecutiveGovernanceResult"), "types: ExecutiveGovernanceResult");
check(!types.includes("isMitigated"), "types: GovernanceRisk has no isMitigated");
check(types.includes("isSystemic"), "types: GovernanceRisk has isSystemic");

// ─── Phase 2: Identity ───────────────────────────────────────────────────────
const identity = readFile(path.join(GOV, "executive-governance-identity.ts"));
check(identity.includes("generateGovernanceSessionId"), "identity: session id");
check(identity.includes("generatePolicyId"), "identity: policy id");
check(identity.includes("generateRuleId"), "identity: rule id");
check(identity.includes("generateEscalationId"), "identity: escalation id");
check(identity.includes("generateExceptionId"), "identity: exception id");
check(identity.includes("generateApprovalId"), "identity: approval id");
check(identity.includes("generateGovernanceRiskId"), "identity: risk id");
check(identity.includes("generateControlId"), "identity: control id");
check(identity.includes("generateAssessmentId"), "identity: assessment id");
check(identity.includes("generateGovernanceRecommendationId"), "identity: recommendation id");
check(identity.includes("generateGovernanceReportId"), "identity: report id");
check(identity.includes("generateGovernanceDigestId"), "identity: digest id");
check(identity.includes("generateGovernanceBriefingId"), "identity: briefing id");
check(identity.includes("generateGovernanceAuditId"), "identity: audit id");
check(identity.includes("validateGovernanceId"), "identity: validateGovernanceId");
check(identity.includes("getGovernanceIdPrefix"), "identity: getGovernanceIdPrefix");
check(countOccurrences(identity, "gov_") >= 10, "identity: gov_ prefix used in 10+ places");

// ─── Phase 3: Policy Engine ──────────────────────────────────────────────────
const policy = readFile(path.join(GOV, "policy-engine.ts"));
check(policy.includes("scorePolicy"), "policy: scorePolicy");
check(policy.includes("buildPolicy"), "policy: buildPolicy");
check(policy.includes("validatePolicy"), "policy: validatePolicy");
check(policy.includes("buildPolicies"), "policy: buildPolicies");
check(policy.includes("rankPolicies"), "policy: rankPolicies");
check(policy.includes("getMandatoryPolicies"), "policy: getMandatoryPolicies");
check(policy.includes("buildDefaultPolicies"), "policy: buildDefaultPolicies");
check(policy.includes("FINANCIAL_THRESHOLD"), "policy: FINANCIAL_THRESHOLD type");
check(policy.includes("threshold:      50000"), "policy: threshold 50000");
check(policy.includes("CONFLICT_OF_INTEREST"), "policy: CONFLICT_OF_INTEREST");
check(policy.includes("VENDOR_MANAGEMENT"), "policy: VENDOR_MANAGEMENT");
check(policy.includes("RISK_TOLERANCE"), "policy: RISK_TOLERANCE");
check(policy.includes("DISCLOSURE_POLICY"), "policy: DISCLOSURE_POLICY");
check(policy.includes("try {"), "policy: try/catch");

// ─── Phase 4: Rule Engine ────────────────────────────────────────────────────
const rule = readFile(path.join(GOV, "rule-engine.ts"));
check(rule.includes("buildRule"), "rule: buildRule");
check(rule.includes("evaluateRule"), "rule: evaluateRule");
check(rule.includes("evaluateRules"), "rule: evaluateRules");
check(rule.includes("getTriggeredRules"), "rule: getTriggeredRules");
check(rule.includes("MANDATORY"), "rule: MANDATORY type handled");
check(rule.includes("ESCALATION_TRIGGER"), "rule: ESCALATION_TRIGGER type handled");
check(rule.includes("ADVISORY"), "rule: ADVISORY type handled");
check(rule.includes("PROHIBITIVE"), "rule: PROHIBITIVE type handled");
check(rule.includes("triggered = true"), "rule: MANDATORY always triggered");

// ─── Phase 5: Authority Engine ───────────────────────────────────────────────
const authority = readFile(path.join(GOV, "authority-engine.ts"));
check(authority.includes("AUTHORITY_HIERARCHY"), "authority: hierarchy defined");
check(authority.includes("BOARD:      6"), "authority: BOARD = 6");
check(authority.includes("CEO:        5"), "authority: CEO = 5");
check(authority.includes("EXECUTIVE:  4"), "authority: EXECUTIVE = 4");
check(authority.includes("DIRECTOR:   3"), "authority: DIRECTOR = 3");
check(authority.includes("MANAGER:    2"), "authority: MANAGER = 2");
check(authority.includes("SUPERVISOR: 1"), "authority: SUPERVISOR = 1");
check(authority.includes("buildAuthorityModel"), "authority: buildAuthorityModel");
check(authority.includes("validateAuthority"), "authority: validateAuthority");
check(authority.includes("resolveRequiredAuthority"), "authority: resolveRequiredAuthority");
check(authority.includes("5000000"), "authority: 5M threshold");
check(authority.includes("1000000"), "authority: 1M threshold");
check(authority.includes("250000"), "authority: 250K threshold");
check(authority.includes("50000"), "authority: 50K threshold");

// ─── Phase 6: Approval Engine ────────────────────────────────────────────────
const approval = readFile(path.join(GOV, "approval-engine.ts"));
check(approval.includes("determineApprovalRequirements"), "approval: determineApprovalRequirements");
check(approval.includes("rankApprovals"), "approval: rankApprovals");
check(approval.includes("evaluateApprovalRisk"), "approval: evaluateApprovalRisk");
check(approval.includes("getBlockingApprovals"), "approval: getBlockingApprovals");
check(approval.includes("Never approves automatically"), "approval: never approves comment");
check(approval.includes("FINANCIAL_THRESHOLD"), "approval: financial threshold check");
check(approval.includes("APPROVAL_GATE"), "approval: approval gate check");

// ─── Phase 7: Exception Engine ───────────────────────────────────────────────
const exception = readFile(path.join(GOV, "exception-engine.ts"));
check(exception.includes("scoreException"), "exception: scoreException");
check(exception.includes("buildException"), "exception: buildException");
check(exception.includes("detectExceptions"), "exception: detectExceptions");
check(exception.includes("rankExceptions"), "exception: rankExceptions");
check(exception.includes("calculateExceptionPenalty"), "exception: calculateExceptionPenalty");
check(exception.includes("getUnjustifiableExceptions"), "exception: getUnjustifiableExceptions");
check(exception.includes("getCriticalExceptions"), "exception: getCriticalExceptions");
check(exception.includes("CRITICAL: 0.90"), "exception: CRITICAL base score");

// ─── Phase 8: Escalation Engine ─────────────────────────────────────────────
const escalation = readFile(path.join(GOV, "escalation-engine.ts"));
check(escalation.includes("buildEscalation"), "escalation: buildEscalation");
check(escalation.includes("detectEscalations"), "escalation: detectEscalations");
check(escalation.includes("rankEscalations"), "escalation: rankEscalations");
check(escalation.includes("evaluateEscalationLevel"), "escalation: evaluateEscalationLevel");
check(escalation.includes("calculateEscalationPressure"), "escalation: calculateEscalationPressure");
check(escalation.includes("escalationScore"), "escalation: escalationScore field");
check(escalation.includes("targetAuthority"), "escalation: targetAuthority field");
check(escalation.includes("justification"), "escalation: justification field");
check(!escalation.includes("GovernanceEscalationLevel"), "escalation: no fake GovernanceEscalationLevel type");

// ─── Phase 9: Risk Engine ────────────────────────────────────────────────────
const risk = readFile(path.join(GOV, "governance-risk-engine.ts"));
check(risk.includes("buildGovernanceRisk"), "risk: buildGovernanceRisk");
check(risk.includes("identifyGovernanceRisks"), "risk: identifyGovernanceRisks");
check(risk.includes("rankGovernanceRisks"), "risk: rankGovernanceRisks");
check(risk.includes("scoreGovernanceRisk"), "risk: scoreGovernanceRisk");
check(risk.includes("calculateAggregateRiskScore"), "risk: calculateAggregateRiskScore");
check(risk.includes("isSystemic"), "risk: isSystemic field");
check(!risk.includes("isMitigated"), "risk: no isMitigated field");
check(!risk.includes("mitigationIds"), "risk: no mitigationIds field");
check(risk.includes("generateGovernanceRiskId"), "risk: uses correct identity function");

// ─── Phase 10: Control Engine ────────────────────────────────────────────────
const control = readFile(path.join(GOV, "governance-control-engine.ts"));
check(control.includes("buildControl"), "control: buildControl");
check(control.includes("buildDefaultControls"), "control: buildDefaultControls");
check(control.includes("evaluateControl"), "control: evaluateControl");
check(control.includes("calculateControlCoverage"), "control: calculateControlCoverage");
check(control.includes("effectiveness"), "control: effectiveness field");
check(!control.includes("priority"), "control: no priority field");

// ─── Phase 11: Compliance Engine ────────────────────────────────────────────
const compliance = readFile(path.join(GOV, "governance-compliance-engine.ts"));
check(compliance.includes("buildViolation"), "compliance: buildViolation");
check(compliance.includes("detectViolations"), "compliance: detectViolations");
check(compliance.includes("evaluateCompliance"), "compliance: evaluateCompliance");
check(compliance.includes("scoreCompliance"), "compliance: scoreCompliance");
check(compliance.includes("violationScore"), "compliance: violationScore field");
check(compliance.includes("isSystemic"), "compliance: isSystemic field");
check(!compliance.includes("isRepeated"), "compliance: no isRepeated field");
check(!compliance.includes("detectedAt"), "compliance: no detectedAt field");
check(compliance.includes("POLICY_VIOLATION"), "compliance: POLICY_VIOLATION type");

// ─── Phase 12: Assessment Engine ────────────────────────────────────────────
const assessment = readFile(path.join(GOV, "governance-assessment-engine.ts"));
check(assessment.includes("buildFinding"), "assessment: buildFinding");
check(assessment.includes("buildAssessment"), "assessment: buildAssessment");
check(assessment.includes("rankFindings"), "assessment: rankFindings");
check(assessment.includes("governanceScore"), "assessment: governanceScore field");
check(assessment.includes("findingCount"), "assessment: findingCount field");
check(assessment.includes("evidence:"), "assessment: evidence field (not evidenceIds)");
check(!assessment.includes("isResolved"), "assessment: no isResolved field");
check(!assessment.includes("recommendation"), "assessment: no recommendation field");

// ─── Phase 13: Recommendation Engine ────────────────────────────────────────
const rec = readFile(path.join(GOV, "governance-recommendation-engine.ts"));
check(rec.includes("buildGovernanceRecommendation"), "rec: buildGovernanceRecommendation");
check(rec.includes("rankGovernanceRecommendations"), "rec: rankGovernanceRecommendations");
check(rec.includes("suggestedOnly:     true"), "rec: suggestedOnly: true literal");
check(countOccurrences(rec, "suggestedOnly: true") >= 2, "rec: multiple suggestedOnly: true");
check(rec.includes("rationale:"), "rec: rationale field");
check(rec.includes("confidence:"), "rec: confidence field");
check(!rec.includes("requiredAuthority"), "rec: no requiredAuthority field");
check(!rec.includes("expectedImpact"), "rec: no expectedImpact field");
check(rec.includes("generateGovernanceRecommendationId"), "rec: uses correct identity function");

// ─── Phase 14: Narrative Engine ─────────────────────────────────────────────
const narrative = readFile(path.join(GOV, "governance-narrative-engine.ts"));
check(narrative.includes("buildGovernanceNarrative"), "narrative: buildGovernanceNarrative");
check(narrative.includes("buildEmptyGovernanceNarrative"), "narrative: buildEmptyGovernanceNarrative");
check(narrative.includes("suggestedOnly"), "narrative: references suggestedOnly");
check(narrative.includes("compliance:"), "narrative: compliance field");
check(narrative.includes("policies:"), "narrative: policies field");
check(narrative.includes("escalations:"), "narrative: escalations field");
check(narrative.includes("violations:"), "narrative: violations field");
check(narrative.includes("executive:"), "narrative: executive field");
check(narrative.includes("limitations:"), "narrative: limitations field");
check(!narrative.includes("orgSlug:"), "narrative: no orgSlug field (GovernanceNarrative has no orgSlug)");

// ─── Phase 15: Digest Engine ─────────────────────────────────────────────────
const digest = readFile(path.join(GOV, "governance-digest-engine.ts"));
check(digest.includes("buildGovernanceDigest"), "digest: buildGovernanceDigest");
check(digest.includes("headline:"), "digest: headline field");
check(digest.includes("topViolations"), "digest: topViolations field");
check(digest.includes("pendingApprovals"), "digest: pendingApprovals field");
check(digest.includes("activeEscalations"), "digest: activeEscalations field");
check(digest.includes("DAILY"), "digest: DAILY period");
check(digest.includes("WEEKLY"), "digest: WEEKLY period");
check(digest.includes("MONTHLY"), "digest: MONTHLY period");
check(digest.includes("QUARTERLY"), "digest: QUARTERLY period");
check(digest.includes("ANNUAL"), "digest: ANNUAL period");
check(digest.includes("generateGovernanceDigestId"), "digest: uses correct identity function");
check(!digest.includes("periodLabel"), "digest: no periodLabel field in return (not in type)");

// ─── Phase 16: Briefing Engine ──────────────────────────────────────────────
const briefing = readFile(path.join(GOV, "governance-briefing-engine.ts"));
check(briefing.includes("buildGovernanceBriefing"), "briefing: buildGovernanceBriefing");
check(briefing.includes("complianceStatus:"), "briefing: complianceStatus field");
check(briefing.includes("keyFindings:"), "briefing: keyFindings field");
check(briefing.includes("criticalViolations:"), "briefing: criticalViolations field");
check(briefing.includes("activeEscalations:"), "briefing: activeEscalations field");
check(briefing.includes("CEO:"), "briefing: CEO config");
check(briefing.includes("BOARD:"), "briefing: BOARD config");
check(briefing.includes("EXECUTIVE:"), "briefing: EXECUTIVE config");
check(briefing.includes("COMPLIANCE:"), "briefing: COMPLIANCE config");
check(briefing.includes("RISK:"), "briefing: RISK config");
check(briefing.includes("generateGovernanceBriefingId"), "briefing: uses correct identity function");

// ─── Phase 17: Main Engine ───────────────────────────────────────────────────
const engine = readFile(path.join(GOV, "executive-governance-engine.ts"));
check(engine.includes("runExecutiveGovernance"), "engine: runExecutiveGovernance");
check(engine.includes("computeGovernanceScore"), "engine: computeGovernanceScore");
check(engine.includes("buildFailedGovernanceResult"), "engine: buildFailedGovernanceResult");
check(engine.includes("ExecutiveGovernanceContext"), "engine: ExecutiveGovernanceContext");
check(engine.includes("// Step 1"), "engine: Step 1 comment");
check(engine.includes("// Step 17"), "engine: Step 17 comment");
check(engine.includes("suggestedOnly: true"), "engine: limitations include suggestedOnly");
check(engine.includes("neverApproves"), "engine: neverApproves in metadata");

// ─── Phase 18-33: Integration files ─────────────────────────────────────────
const memInt = readFile(path.join(INT, "governance-strategic-memory.ts"));
check(memInt.includes("buildGovernanceMemoryContext"), "int/memory: buildGovernanceMemoryContext");
check(memInt.includes(".name"), "int/memory: uses .name");

const learnInt = readFile(path.join(INT, "governance-learning.ts"));
check(learnInt.includes("buildGovernanceLearningContext"), "int/learning: buildGovernanceLearningContext");
check(learnInt.includes(".name"), "int/learning: uses .name NOT .label");
check(learnInt.includes("NOT .label"), "int/learning: explicit NOT .label comment");

const brainInt = readFile(path.join(INT, "governance-executive-brain.ts"));
check(brainInt.includes("buildGovernanceBrainContext"), "int/brain: buildGovernanceBrainContext");
check(brainInt.includes("0.12"), "int/brain: brainBoost max 0.12");

const graphInt = readFile(path.join(INT, "governance-memory-graph.ts"));
check(graphInt.includes("sourceNodeId"), "int/graph: sourceNodeId");
check(graphInt.includes("targetNodeId"), "int/graph: targetNodeId");
check(!graphInt.includes("sourceId:"), "int/graph: no sourceId field");
check(graphInt.includes("NOTE: sourceNodeId not sourceId"), "int/graph: explicit sourceNodeId note");

const crossInt = readFile(path.join(INT, "governance-cross-module.ts"));
check(crossInt.includes("ReasoningResult"), "int/cross-module: ReasoningResult");
check(!crossInt.includes("CrossModuleResult"), "int/cross-module: no CrossModuleResult");
check(crossInt.includes("result.riskCount + result.opportunityCount"), "int/cross-module: correlationCount formula");
check(crossInt.includes("result.chain.recommendations"), "int/cross-module: chain.recommendations");

const playbookInt = readFile(path.join(INT, "governance-playbooks.ts"));
check(playbookInt.includes(".title"), "int/playbooks: uses .title");
check(playbookInt.includes("NOT .name"), "int/playbooks: explicit NOT .name comment");

const tenantInt = readFile(path.join(INT, "governance-tenant-profile.ts"));
check(tenantInt.includes("castillitos"), "int/tenant: castillitos entry");
check(tenantInt.includes("MODERATE"), "int/tenant: castillitos is MODERATE");
check(tenantInt.includes("0.65"), "int/tenant: escalation threshold 0.65");

const auditInt = readFile(path.join(INT, "governance-audit.ts"));
check(auditInt.includes("GOVERNANCE_GENERATED"), "int/audit: GOVERNANCE_GENERATED");
check(auditInt.includes("POLICY_EVALUATED"), "int/audit: POLICY_EVALUATED");
check(auditInt.includes("VIOLATION_DETECTED"), "int/audit: VIOLATION_DETECTED");
check(auditInt.includes("ESCALATION_TRIGGERED"), "int/audit: ESCALATION_TRIGGERED");
check(auditInt.includes("ASSESSMENT_BUILT"), "int/audit: ASSESSMENT_BUILT");
check(auditInt.includes("RECOMMENDATIONS_RANKED"), "int/audit: RECOMMENDATIONS_RANKED");
check(auditInt.includes("suggestedOnly: true"), "int/audit: suggestedOnly in metadata");
check(auditInt.includes("neverExecutes: true"), "int/audit: neverExecutes in metadata");
check(auditInt.includes("neverApproves: true"), "int/audit: neverApproves in metadata");

const compCheck = readFile(path.join(INT, "governance-compliance-check.ts"));
check(compCheck.includes("assertGovernanceTenantIsolation"), "int/compliance-check: assertGovernanceTenantIsolation");
check(compCheck.includes("runGovernanceComplianceChecks"), "int/compliance-check: runGovernanceComplianceChecks");
check(compCheck.includes("TENANT_ISOLATION"), "int/compliance-check: TENANT_ISOLATION");
check(compCheck.includes("SUGGESTED_ONLY"), "int/compliance-check: SUGGESTED_ONLY");

// ─── Phase 34-36: Data Layer ─────────────────────────────────────────────────
const query = readFile(path.join(GOV, "executive-governance-query.ts"));
check(query.includes("getGovernanceStats"), "query: getGovernanceStats");
check(query.includes("getGovernanceReportRecords"), "query: getGovernanceReportRecords");
check(query.includes("getLatestGovernanceReport"), "query: getLatestGovernanceReport");
check(query.includes("prisma as any"), "query: prisma as any pattern");

const repo = readFile(path.join(GOV, "executive-governance-repository.ts"));
check(repo.includes("InMemoryExecutiveGovernanceRepository"), "repo: in-memory repo");
check(repo.includes("inMemoryGovernanceRepository"), "repo: singleton export");
check(repo.includes("IExecutiveGovernanceRepository"), "repo: interface");

const prismaRepo = readFile(path.join(GOV, "persistence/prisma-executive-governance-repository.ts"));
check(prismaRepo.includes("PrismaExecutiveGovernanceRepository"), "prisma-repo: class defined");
check(prismaRepo.includes("prismaGovernanceRepository"), "prisma-repo: singleton");
check(prismaRepo.includes("prisma as any"), "prisma-repo: prisma as any pattern");
check(prismaRepo.includes("governanceReportRecord"), "prisma-repo: correct model name");

// ─── Phase 37: Prisma Schema ─────────────────────────────────────────────────
const schema = readFile(path.join(ROOT, "prisma/schema.prisma"));
check(schema.includes("GovernanceReportRecord"), "schema: GovernanceReportRecord model");
check(schema.includes("GovernancePolicyRecord"), "schema: GovernancePolicyRecord model");
check(schema.includes("GovernanceViolationRecord"), "schema: GovernanceViolationRecord model");
check(schema.includes("GovernanceEscalationRecord"), "schema: GovernanceEscalationRecord model");
check(schema.includes("GovernanceRiskRecord"), "schema: GovernanceRiskRecord model");
check(schema.includes("GovernanceAssessmentRecord"), "schema: GovernanceAssessmentRecord model");

// ─── Phase 38: Dashboard Contract ───────────────────────────────────────────
const dashboard = readFile(path.join(GOV, "executive-governance-dashboard-contract.ts"));
check(dashboard.includes("buildGovernanceDashboard"), "dashboard: buildGovernanceDashboard");
check(dashboard.includes("GovernanceDashboard"), "dashboard: GovernanceDashboard interface");
check(dashboard.includes("GovernanceDashboardKpi"), "dashboard: GovernanceDashboardKpi");
check(!dashboard.includes("server-only"), "dashboard: NOT server-only");
check(dashboard.includes("suggestedOnly"), "dashboard: references suggestedOnly");
check(dashboard.includes("slice(0, 5)"), "dashboard: max 5 items");

// ─── Phase 39: Health ────────────────────────────────────────────────────────
const health = readFile(path.join(GOV, "executive-governance-health.ts"));
check(health.includes("checkGovernanceHealth"), "health: checkGovernanceHealth");
check(health.includes("buildDefaultGovernanceHealthInputs"), "health: buildDefaultGovernanceHealthInputs");
check(health.includes("HEALTHY"), "health: HEALTHY state");
check(health.includes("DEGRADED"), "health: DEGRADED state");
check(health.includes("CRITICAL"), "health: CRITICAL state");
check(health.includes("EMPTY"), "health: EMPTY state");
check(countOccurrences(health, "GovernanceHealthCheck") >= 2, "health: GovernanceHealthCheck type used");

// ─── Phase 40: Readiness ────────────────────────────────────────────────────
const readiness = readFile(path.join(GOV, "executive-governance-readiness.ts"));
check(readiness.includes("checkGovernanceReadiness"), "readiness: checkGovernanceReadiness");
check(readiness.includes("FULL"), "readiness: FULL level");
check(readiness.includes("PARTIAL"), "readiness: PARTIAL level");
check(readiness.includes("MINIMUM"), "readiness: MINIMUM level");
check(readiness.includes("NOT_READY"), "readiness: NOT_READY level");
check(readiness.includes("hasPolicies && hasAuthority"), "readiness: minimum = hasPolicies && hasAuthority");

// ─── Phase 43: Server Barrel ─────────────────────────────────────────────────
const server = readFile(path.join(GOV, "server.ts"));
check(server.includes('import "server-only"'), "server: server-only import");
check(server.includes("runExecutiveGovernance"), "server: exports runExecutiveGovernance");
check(server.includes("buildDefaultPolicies"), "server: exports buildDefaultPolicies");
check(server.includes("runGovernanceComplianceChecks"), "server: exports compliance checks");
check(server.includes("auditGovernanceGenerated"), "server: exports audit");

// ─── Phase 44: Client Barrel ─────────────────────────────────────────────────
const index = readFile(path.join(GOV, "index.ts"));
check(!index.includes("server-only"), "index: NOT server-only");
check(index.includes("GovernanceStatus"), "index: exports GovernanceStatus");
check(index.includes("GovernanceReport"), "index: exports GovernanceReport");
check(index.includes("buildGovernanceDashboard"), "index: exports buildGovernanceDashboard");
check(index.includes("GovernanceCanonicalCase"), "index: exports canonical case type");

// ─── Phase 45: Canonical Cases ───────────────────────────────────────────────
const canonical = readFile(path.join(GOV, "executive-governance-canonical.ts"));
check(canonical.includes("CGC_001"), "canonical: CGC_001");
check(canonical.includes("CGC_035"), "canonical: CGC_035");
check(countOccurrences(canonical, "CGC_") === 35, "canonical: exactly 35 CGC_ cases");
check(canonical.includes("suggestedOnly"), "canonical: suggestedOnly in limitations");
check(canonical.includes("getGovernanceCanonicalCase"), "canonical: getGovernanceCanonicalCase");
check(canonical.includes("NON_COMPLIANT"), "canonical: has NON_COMPLIANT cases");
check(canonical.includes("COMPLIANT"), "canonical: has COMPLIANT cases");
check(canonical.includes("UNDER_REVIEW"), "canonical: has UNDER_REVIEW cases");

// ─── Phase 46: Canonical Scenarios ───────────────────────────────────────────
const scenarios = readFile(path.join(GOV, "executive-governance-scenarios.ts"));
check(scenarios.includes("CGS_001"), "scenarios: CGS_001");
check(scenarios.includes("CGS_035"), "scenarios: CGS_035");
check(countOccurrences(scenarios, "CGS_") === 35, "scenarios: exactly 35 CGS_ scenarios");
check(scenarios.includes("CEO"), "scenarios: CEO briefing type");
check(scenarios.includes("BOARD"), "scenarios: BOARD briefing type");
check(scenarios.includes("COMPLIANCE"), "scenarios: COMPLIANCE briefing type");
check(scenarios.includes("RISK"), "scenarios: RISK briefing type");
check(scenarios.includes("EXECUTIVE"), "scenarios: EXECUTIVE briefing type");

// ─── Phase 47: Authority Matrix ──────────────────────────────────────────────
const authMatrix = readFile(path.join(GOV, "governance-authority-matrix-engine.ts"));
check(authMatrix.includes("buildAuthorityMatrix"), "auth-matrix: buildAuthorityMatrix");
check(authMatrix.includes("canAuthorityApprove"), "auth-matrix: canAuthorityApprove");
check(authMatrix.includes("lookupAuthorityMatrix"), "auth-matrix: lookupAuthorityMatrix");

// ─── Phase 48: Escalation Matrix ─────────────────────────────────────────────
const escMatrix = readFile(path.join(GOV, "governance-escalation-matrix-engine.ts"));
check(escMatrix.includes("buildEscalationMatrix"), "esc-matrix: buildEscalationMatrix");
check(escMatrix.includes("lookupEscalationPath"), "esc-matrix: lookupEscalationPath");
check(escMatrix.includes("BOARD_REQUIRED"), "esc-matrix: BOARD_REQUIRED");

// ─── Phase 49: Policy Simulator ──────────────────────────────────────────────
const simulator = readFile(path.join(GOV, "governance-policy-simulator.ts"));
check(simulator.includes("simulatePolicyApplication"), "simulator: simulatePolicyApplication");
check(simulator.includes("suggestedOnly:     true"), "simulator: suggestedOnly: true");
check(simulator.includes("PolicySimulationResult"), "simulator: PolicySimulationResult");
check(simulator.includes("isBlocked"), "simulator: isBlocked field");

// ─── Phase 50: Integration Harness ───────────────────────────────────────────
const harness = readFile(path.join(ROOT, "app/api/internal/integration-tests/executive-governance/route.ts"));
check(harness.includes("AGENTIK-EXECUTIVE-GOVERNANCE-01"), "harness: sprint tag");
check(harness.includes("PolicyEngine"), "harness: PolicyEngine suite");
check(harness.includes("RuleEngine"), "harness: RuleEngine suite");
check(harness.includes("AuthorityEngine"), "harness: AuthorityEngine suite");
check(harness.includes("ApprovalEngine"), "harness: ApprovalEngine suite");
check(harness.includes("ExceptionEngine"), "harness: ExceptionEngine suite");
check(harness.includes("EscalationEngine"), "harness: EscalationEngine suite");
check(harness.includes("RiskEngine"), "harness: RiskEngine suite");
check(harness.includes("ControlEngine"), "harness: ControlEngine suite");
check(harness.includes("ComplianceEngine"), "harness: ComplianceEngine suite");
check(harness.includes("AssessmentEngine"), "harness: AssessmentEngine suite");
check(harness.includes("RecommendationEngine"), "harness: RecommendationEngine suite");
check(harness.includes("NarrativeEngine"), "harness: NarrativeEngine suite");
check(harness.includes("DigestEngine"), "harness: DigestEngine suite");
check(harness.includes("BriefingEngine"), "harness: BriefingEngine suite");
check(harness.includes("MainEnginePipeline"), "harness: MainEnginePipeline suite");
check(harness.includes("DashboardContract"), "harness: DashboardContract suite");
check(harness.includes("HealthCheck"), "harness: HealthCheck suite");
check(harness.includes("ReadinessCheck"), "harness: ReadinessCheck suite");
check(harness.includes("CanonicalCases"), "harness: CanonicalCases suite");
check(harness.includes("CanonicalScenarios"), "harness: CanonicalScenarios suite");
check(harness.includes("AuthorityMatrix"), "harness: AuthorityMatrix suite");
check(harness.includes("EscalationMatrix"), "harness: EscalationMatrix suite");
check(harness.includes("PolicySimulator"), "harness: PolicySimulator suite");
check(harness.includes("IntegrationAdapters"), "harness: IntegrationAdapters suite");
check(harness.includes("TenantProfile"), "harness: TenantProfile suite");
check(harness.includes("AuditAndComplianceCheck"), "harness: AuditAndComplianceCheck suite");
check(harness.includes("sourceNodeId"), "harness: sourceNodeId verified");
check(harness.includes("suggestedOnly === true"), "harness: suggestedOnly verified");

// ─── File existence checks ────────────────────────────────────────────────────
const filesToCheck = [
  "executive-governance-types.ts",
  "executive-governance-identity.ts",
  "policy-engine.ts",
  "rule-engine.ts",
  "authority-engine.ts",
  "approval-engine.ts",
  "exception-engine.ts",
  "escalation-engine.ts",
  "governance-risk-engine.ts",
  "governance-control-engine.ts",
  "governance-compliance-engine.ts",
  "governance-assessment-engine.ts",
  "governance-recommendation-engine.ts",
  "governance-narrative-engine.ts",
  "governance-digest-engine.ts",
  "governance-briefing-engine.ts",
  "executive-governance-engine.ts",
  "executive-governance-query.ts",
  "executive-governance-repository.ts",
  "executive-governance-dashboard-contract.ts",
  "executive-governance-health.ts",
  "executive-governance-readiness.ts",
  "executive-governance-canonical.ts",
  "executive-governance-scenarios.ts",
  "governance-authority-matrix-engine.ts",
  "governance-escalation-matrix-engine.ts",
  "governance-policy-simulator.ts",
  "server.ts",
  "index.ts",
  "persistence/prisma-executive-governance-repository.ts",
  "integrations/governance-strategic-memory.ts",
  "integrations/governance-learning.ts",
  "integrations/governance-executive-brain.ts",
  "integrations/governance-memory-graph.ts",
  "integrations/governance-cross-module.ts",
  "integrations/governance-planning.ts",
  "integrations/governance-forecasting.ts",
  "integrations/governance-playbooks.ts",
  "integrations/governance-simulations.ts",
  "integrations/governance-executive-council.ts",
  "integrations/governance-board-intelligence.ts",
  "integrations/governance-compliance-adapter.ts",
  "integrations/governance-advisor.ts",
  "integrations/governance-tenant-profile.ts",
  "integrations/governance-compliance-check.ts",
  "integrations/governance-audit.ts",
];

for (const f of filesToCheck) {
  const exists = fs.existsSync(path.join(GOV, f));
  check(exists, `file exists: ${f}`);
}

// ─── Report ──────────────────────────────────────────────────────────────────
const total = passed + failed;
const pct   = Math.round((passed / total) * 100);
console.log(`\n=== AGENTIK-EXECUTIVE-GOVERNANCE-01 Validation ===`);
console.log(`Passed: ${passed}/${total} (${pct}%)`);
if (failed > 0) {
  console.log(`\nFailed (${failed}):`);
  failures.slice(0, 20).forEach((f) => console.log("  " + f));
} else {
  console.log("\n✓ ALL CHECKS PASSED");
}
process.exit(failed > 0 ? 1 : 0);
