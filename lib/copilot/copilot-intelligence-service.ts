/**
 * lib/copilot/copilot-intelligence-service.ts
 *
 * Agentik — Copilot Intelligence — Orchestration Service
 * Sprint: AGENTIK-COPILOT-INTELLIGENCE-01
 *
 * Main entry point for Copilot Intelligence.
 * Orchestrates the full pipeline:
 *
 *   1.  resolveProfile             — load tenant Copilot profile (non-blocking)
 *   1a. validateRequest            — reject empty orgSlug/message
 *   2.  resolveIntent              — classify business intent
 *   2b. retrieveMemory             — fetch strategic memory context (non-blocking)
 *   2c. extractPlanningSignals     — convert memory → planning signals (non-blocking)
 *   3.  selectAgents (base)        — resolve agents from Agent Runtime registry
 *   3b. applyMemoryAwareSelection  — add/adjust agents from memory signals (non-blocking)
 *   3c. calculatePlanPriority      — derive CRITICAL/HIGH/MEDIUM/LOW priority (non-blocking)
 *   4.  buildPlan                  — build CopilotExecutionPlan with planning metadata
 *   4b. buildPlanningContext       — package full planning context for observability
 *   5.  executePlan                — run agents (parallel or sequential)
 *   6.  aggregateResponse          — consolidate results + enrich with planning data
 *   7.  Return CopilotResponse
 *
 * Persona resolution (Phase 7) is embedded in the executor via
 * resolveAgentDisplayName() — users always see "Diego", "Luca", etc.
 *
 * SERVER-ONLY — orchestrates executeCopilotPlan which calls executeGoal (Prisma).
 */
import "server-only";

import type { CopilotRequest, CopilotResponse }          from "./copilot-types";
import { getProfile }                                     from "./profiles/copilot-profile-resolver";
import { resolveDisplayName, resolveExecutiveStyle }      from "./profiles/copilot-persona";
import { resolveCopilotIntent }                           from "./copilot-intent-resolver";
import { selectAgentsForIntent }                          from "./copilot-agent-selector";
import { buildCopilotExecutionPlan }                     from "./copilot-execution-plan";
import { executeCopilotPlan }                            from "./copilot-agent-executor";
import { aggregateCopilotResponse }                      from "./copilot-response-aggregator";
import { getStrategicContext }                           from "./memory/server";
import { getRelevantPlaybooks }                         from "./playbooks/playbook-retrieval";
import { defaultExecutiveBrainService }                 from "./executive-brain/executive-brain-service";
import { isContextNonEmpty }                            from "./executive-brain/executive-context-builder";
import { extractPlanningSignals }                        from "./memory-planning/memory-signal-extractor";
import { applyMemoryAwareSelection }                     from "./memory-planning/memory-aware-agent-selector";
import { calculatePlanPriority }                         from "./memory-planning/copilot-plan-priority";
import { buildPlanningContext }                          from "./memory-planning/planning-context";
import {
  CopilotAuditLog,
  auditRequestReceived,
  auditIntentResolved,
  auditAgentsSelected,
  auditPlanCreated,
  auditExecutionStarted,
  auditExecutionCompleted,
}                                                        from "./copilot-audit";
import { buildContext }                                  from "./intelligence/reasoning/cross-domain-context";
import { runReasoningPipeline }                          from "./intelligence/reasoning/reasoning-pipeline";
import { memoryToReasoningSignals, memoryToContextSummary }         from "./intelligence/reasoning/integrations/reasoning-memory";
import { playbookToReasoningSignals, playbookToContextSummary }     from "./intelligence/reasoning/integrations/reasoning-playbooks";
import { executiveBrainToReasoningSignals, executiveBrainToContextSummary } from "./intelligence/reasoning/integrations/reasoning-executive-brain";
import type { ReasoningConclusion }                      from "./intelligence/reasoning";

// ── ID generator ───────────────────────────────────────────────────────────────

let _reqCounter = 0;

function generateRequestId(): string {
  _reqCounter = (_reqCounter + 1) % 1_000_000;
  return `cpi-${Date.now()}-${String(_reqCounter).padStart(6, "0")}`;
}

// ── Service ────────────────────────────────────────────────────────────────────

export const copilotIntelligenceService = {
  /**
   * Execute a Copilot request through the full intelligence pipeline.
   *
   * Never throws — returns CopilotResponse with success=false and errors[] on failure.
   *
   * @param request  The user's request with orgSlug and userMessage.
   * @returns        CopilotResponse with consolidated results and audit trail.
   */
  async executeCopilotRequest(request: CopilotRequest): Promise<CopilotResponse> {
    const requestId = request.id ?? generateRequestId();
    const enriched  = { ...request, id: requestId };
    const audit     = new CopilotAuditLog();
    const startedAt = Date.now();

    // ── Step 1: Resolve tenant profile ────────────────────────────────────────
    // Non-blocking — always returns a valid profile (fallback on failure).
    let copilotProfile;
    try {
      copilotProfile = await getProfile(request.orgSlug);
    } catch {
      // Profile resolution failure is non-fatal — pipeline uses default persona
      copilotProfile = undefined;
    }

    // ── Step 1a: Validate ─────────────────────────────────────────────────────
    if (!request.orgSlug || !request.userMessage?.trim()) {
      const plan = buildCopilotExecutionPlan("GENERAL", ["finance_agent"]);
      return {
        id:                  requestId,
        orgSlug:             request.orgSlug ?? "",
        intent:              "GENERAL",
        plan,
        agentResults:        [],
        consolidatedSummary: "Solicitud inválida: se requiere orgSlug y mensaje de usuario.",
        participatingAgents: [],
        success:             false,
        errors:              ["orgSlug and userMessage are required"],
        createdAt:           new Date().toISOString(),
        durationMs:          Date.now() - startedAt,
      };
    }

    // ── Step 2: Intent resolution ─────────────────────────────────────────────
    audit.push(auditRequestReceived(requestId, request.orgSlug, request.userMessage));

    const intent = resolveCopilotIntent(request.userMessage);

    audit.push(auditIntentResolved(requestId, intent, request.userMessage));

    // ── Step 2b: Retrieve strategic memory context ────────────────────────────
    // Non-blocking — if retrieval fails, pipeline continues without context.
    let memoryContext;
    try {
      memoryContext = await getStrategicContext(request.orgSlug, intent);
    } catch {
      // Memory retrieval failure is non-fatal — pipeline degrades gracefully
      memoryContext = undefined;
    }

    // ── Step 2c: Retrieve relevant playbooks ──────────────────────────────────
    // Non-blocking — if retrieval fails, pipeline continues without playbooks.
    let playbookContext;
    try {
      const pbCtx = await getRelevantPlaybooks(request.orgSlug, intent);
      playbookContext = pbCtx.playbooks.length > 0 ? pbCtx : undefined;
    } catch {
      playbookContext = undefined;
    }

    // ── Step 2e: Build Executive Brain context ────────────────────────────────
    // Non-blocking — if Executive Brain fails, pipeline continues without it.
    let executiveContext;
    try {
      const ebInput = {
        orgSlug: request.orgSlug,
        intent,
        memoryEntries: memoryContext?.entries.map(e => ({
          id:         e.id,
          type:       e.type,
          importance: e.importance,
          title:      e.title,
          content:    e.content,
          tags:       e.tags,
          source:     e.source,
        })),
        playbooks: playbookContext?.playbooks.map(p => ({
          id:       p.id,
          title:    p.title,
          category: p.category,
          priority: p.priority,
          status:   p.status,
          tags:     p.tags,
        })),
      };
      const ebCtx = await defaultExecutiveBrainService.buildContext(ebInput);
      executiveContext = isContextNonEmpty(ebCtx) ? ebCtx : undefined;
    } catch {
      executiveContext = undefined;
    }

    // ── Step 2g: Run reasoning pipeline ──────────────────────────────────────
    // Non-blocking — if reasoning fails, pipeline continues without conclusion.
    // Aggregates signals from memory, playbooks, and executive brain into a
    // multi-domain reasoning conclusion (insights, hypotheses, evidence).
    let reasoningConclusion: ReasoningConclusion | undefined;
    try {
      const reasoningQueryId = `rq_${requestId}`;

      // Collect signals from each integration layer
      const reasoningSignals = [
        ...(memoryContext && memoryContext.entries.length > 0
          ? memoryToReasoningSignals({
              orgSlug:  request.orgSlug,
              queryId:  reasoningQueryId,
              entries:  memoryContext.entries.map(e => ({
                id:         e.id,
                type:       e.type,
                importance: e.importance,
                title:      e.title,
                content:    e.content,
                tags:       e.tags,
                source:     e.source,
              })),
            })
          : []),
        ...(playbookContext && playbookContext.playbooks.length > 0
          ? playbookToReasoningSignals({
              orgSlug:   request.orgSlug,
              queryId:   reasoningQueryId,
              playbooks: playbookContext.playbooks.map(p => ({
                id:       p.id,
                title:    p.title,
                category: p.category,
                priority: p.priority,
                status:   p.status,
                tags:     p.tags,
              })),
            })
          : []),
        ...(executiveContext && executiveContext.signals.length > 0
          ? executiveBrainToReasoningSignals({
              orgSlug: request.orgSlug,
              queryId: reasoningQueryId,
              signals: executiveContext.signals.map(s => ({
                id:          s.id,
                title:       s.title,
                description: s.description,
                category:    s.category,
                severity:    s.severity,
                direction:   s.direction,
                confidence:  s.confidence,
                source:      s.source,
              })),
            })
          : []),
      ];

      // Only run reasoning if there are signals to reason over
      if (reasoningSignals.length > 0) {
        const reasoningContext = buildContext(
          request.orgSlug,
          reasoningQueryId,
          reasoningSignals,
          {
            memoryContext: memoryContext && memoryContext.entries.length > 0
              ? memoryToContextSummary({
                  orgSlug:  request.orgSlug,
                  queryId:  reasoningQueryId,
                  entries:  memoryContext.entries.map(e => ({
                    id:         e.id,
                    type:       e.type,
                    importance: e.importance,
                    title:      e.title,
                    content:    e.content,
                    tags:       e.tags,
                    source:     e.source,
                  })),
                })
              : undefined,
            playbookContext: playbookContext && playbookContext.playbooks.length > 0
              ? playbookToContextSummary({
                  orgSlug:   request.orgSlug,
                  queryId:   reasoningQueryId,
                  playbooks: playbookContext.playbooks.map(p => ({
                    id:       p.id,
                    title:    p.title,
                    category: p.category,
                    priority: p.priority,
                    status:   p.status,
                    tags:     p.tags,
                  })),
                })
              : undefined,
            executiveBrainContext: executiveContext && executiveContext.signals.length > 0
              ? executiveBrainToContextSummary({
                  orgSlug: request.orgSlug,
                  queryId: reasoningQueryId,
                  signals: executiveContext.signals.map(s => ({
                    id:          s.id,
                    title:       s.title,
                    description: s.description,
                    category:    s.category,
                    severity:    s.severity,
                    direction:   s.direction,
                    confidence:  s.confidence,
                    source:      s.source,
                  })),
                })
              : undefined,
          },
        );

        const { conclusion } = runReasoningPipeline(reasoningContext);
        // Only attach when pipeline produced meaningful evidence
        if (conclusion.evidence.length > 0) {
          reasoningConclusion = conclusion;
        }
      }
    } catch {
      // Reasoning failure is non-fatal — pipeline continues without conclusion
      reasoningConclusion = undefined;
    }

    // ── Step 2f: Extract planning signals from memory ─────────────────────────
    // Non-blocking — if extraction fails, signals default to empty array.
    let planningSignals: ReturnType<typeof extractPlanningSignals> = [];
    try {
      if (memoryContext && memoryContext.entries.length > 0) {
        planningSignals = extractPlanningSignals(memoryContext);
      }
    } catch {
      // Signal extraction failure is non-fatal
      planningSignals = [];
    }

    // ── Step 3: Agent selection (base) ────────────────────────────────────────
    const selectedAgents = selectAgentsForIntent(intent);
    const baseAgentIds   = selectedAgents.map(a => a.id);

    // ── Step 3b: Memory-aware agent selection ─────────────────────────────────
    // Non-blocking — if selection fails, base agents are used unchanged.
    let finalAgentIds   = baseAgentIds;
    let addedFromMemory: typeof baseAgentIds = [];
    let planningReasons: string[]           = [];
    let warnings:        string[]           = [];
    let suggestedActions: string[]          = [];

    try {
      if (planningSignals.length > 0) {
        const selection = applyMemoryAwareSelection(
          intent,
          baseAgentIds,
          planningSignals,
          request.orgSlug,
        );
        finalAgentIds    = selection.finalAgents;
        addedFromMemory  = selection.addedAgents;
        planningReasons  = selection.reasons;
        warnings         = selection.warnings;
        suggestedActions = selection.suggestedActions;
      }
    } catch {
      // Memory-aware selection failure is non-fatal — use base agents
      finalAgentIds = baseAgentIds;
    }

    audit.push(auditAgentsSelected(requestId, intent, finalAgentIds));

    // ── Step 3c: Calculate plan priority ──────────────────────────────────────
    // Non-blocking — defaults to MEDIUM on failure.
    let planPriority: ReturnType<typeof calculatePlanPriority> = "MEDIUM";
    try {
      planPriority = calculatePlanPriority(intent, planningSignals);
    } catch {
      planPriority = "MEDIUM";
    }

    // ── Step 4: Build execution plan (with planning metadata) ─────────────────
    const plan = buildCopilotExecutionPlan(intent, finalAgentIds, {
      priority:              planPriority,
      planningReasons:       planningReasons.length > 0 ? planningReasons : undefined,
      memorySignalCount:     planningSignals.length > 0 ? planningSignals.length : undefined,
      addedAgentsFromMemory: addedFromMemory.length > 0 ? addedFromMemory : undefined,
    });

    audit.push(auditPlanCreated(requestId, plan.id, finalAgentIds, plan.parallelizable));

    // ── Step 4b: Build planning context ───────────────────────────────────────
    // Only built when memory signals were present — otherwise omitted.
    const planningContext = planningSignals.length > 0
      ? buildPlanningContext(
          requestId,
          request.orgSlug,
          intent,
          planningSignals,
          baseAgentIds,
          finalAgentIds,
          addedFromMemory,
          warnings,
          suggestedActions,
          planningReasons,
          planPriority,
          memoryContext,
        )
      : undefined;

    // ── Step 5: Execute agents ────────────────────────────────────────────────
    audit.push(auditExecutionStarted(requestId, plan.id, finalAgentIds));

    let agentResults;
    try {
      agentResults = await executeCopilotPlan(plan, {
        ...enriched,
        metadata: { ...request.metadata, intent },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      audit.push(auditExecutionCompleted(requestId, plan.id, false, Date.now() - startedAt, [msg]));
      return {
        id:                  requestId,
        orgSlug:             request.orgSlug,
        intent,
        plan,
        agentResults:        [],
        consolidatedSummary: `Error de ejecución: ${msg}`,
        participatingAgents: [],
        success:             false,
        errors:              [msg],
        createdAt:           new Date().toISOString(),
        durationMs:          Date.now() - startedAt,
      };
    }

    // ── Step 6: Aggregate response (with enrichment) ──────────────────────────
    const response = aggregateCopilotResponse(
      requestId,
      request.orgSlug,
      plan,
      agentResults,
      startedAt,
      // Enrichment: only when planning context was built
      planningContext ? {
        planningContext,
        warnings:        warnings.length > 0        ? warnings        : undefined,
        suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
        priority:        planPriority !== "MEDIUM"  ? planPriority    : undefined,
      } : undefined,
    );

    audit.push(auditExecutionCompleted(
      requestId,
      plan.id,
      response.success,
      response.durationMs,
      response.errors,
    ));

    // Attach memory context when present (non-empty entries only)
    const withMemory = (memoryContext && memoryContext.entries.length > 0)
      ? { ...response, memoryContext }
      : response;

    // Attach playbook context when present (non-empty playbooks only)
    const withPlaybooks = playbookContext
      ? { ...withMemory, playbookContext }
      : withMemory;

    // Attach executive context when present (non-empty signals/insights only)
    const withExecutive = executiveContext
      ? { ...withPlaybooks, executiveContext }
      : withPlaybooks;

    // Attach reasoning conclusion when reasoning pipeline produced evidence
    const withReasoning = reasoningConclusion
      ? { ...withExecutive, reasoningConclusion }
      : withExecutive;

    // Attach tenant profile (always — profile resolver always returns a value)
    if (copilotProfile) {
      return {
        ...withReasoning,
        copilotProfile,
        copilotDisplayName: resolveDisplayName(copilotProfile),
        executiveStyle:     resolveExecutiveStyle(copilotProfile),
      };
    }

    return withReasoning;
  },
};
