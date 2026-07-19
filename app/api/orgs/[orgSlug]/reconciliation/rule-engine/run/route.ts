/**
 * POST /api/orgs/[orgSlug]/reconciliation/rule-engine/run
 *
 * AGENTIK-RECON-RULES-WIRING-01
 * Execute the rule engine against real records for two reconciliation sources.
 *
 * Request body:
 *   {
 *     sourceAType: string            — e.g. "sag_orders"
 *     sourceBType: string            — e.g. "sag_sales"
 *     period:      string            — YYYYMM, e.g. "202605"
 *     rules:       ReconciliationRule[]
 *     sessionId?:  string            — optional: link governance snapshots to a session
 *   }
 *
 * Response shapes:
 *
 *   { status: "pending_source", reason, sourceAReadiness, sourceBReadiness }
 *     — One or both sources are not "available". No engine run.
 *
 *   { status: "unsupported_combination", reason }
 *     — Source pair has no adapter. No engine run.
 *
 *   { status: "no_records", reason }
 *     — Adapter returned empty arrays for the given period.
 *
 *   { status: "ok", summary, pairResults, governanceRef }
 *     — Engine ran. Summary + per-pair verdicts + governance snapshot count.
 *
 * Rules:
 *   - organizationId isolation: always enforced
 *   - Only sag_orders × sag_sales is supported (only wired adapter)
 *   - All other combos return "pending_source" or "unsupported_combination"
 *   - Rule engine runs on each A×B pair (N×M). Max 500 pairs per run.
 *   - Governance snapshots are emitted as audit events (no new Prisma model needed).
 *   - NO SAG writes, NO DIAN calls, NO financial side effects.
 *
 * IMPORTANT: Backend-only API route.
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireOrgAccess }             from "@/lib/auth/org-access";
import { RECONCILIATION_SOURCES }       from "@/lib/reconciliation/source-contract";
import { loadBothSides }                from "@/lib/reconciliation/loader/record-loader-registry";
import { executeRuleSet }               from "@/lib/reconciliation/rules/rule-engine";
import { classifyConflict }             from "@/lib/reconciliation/rules/rule-conflict-classifier";
import { buildRuleExplanation }         from "@/lib/reconciliation/rules/rule-explainability";
import { buildGovernanceSnapshot }      from "@/lib/reconciliation/rules/rule-governance";
import { emitReconEvent }               from "@/lib/reconciliation/audit-trail";
import { buildExecutionReport }         from "@/lib/reconciliation/observability/execution-report";
import { createExecution }             from "@/lib/reconciliation/executions/execution-repository";
import { createReviewItemsFromExecution } from "@/lib/reconciliation/review/review-repository";
import { REVIEWABLE_VERDICTS, LOW_CONFIDENCE_SCORE_THRESHOLD } from "@/lib/reconciliation/review/review-types";
import type { ReconciliationRule }      from "@/lib/reconciliation/rules/rule-types";
import type { ReconciliationSourceType } from "@/lib/reconciliation/source-contract";
import type { RuleBreakdownEntry }      from "@/lib/reconciliation/observability/execution-report";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_PAIRS = 500;

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  req:     NextRequest,
  context: { params: Promise<{ orgSlug: string }> },
): Promise<NextResponse> {
  const { orgSlug } = await context.params;

  const startedAtMs = Date.now();

  try {
    const { organization } = await requireOrgAccess(orgSlug);
    const organizationId = organization.id;

    const body = await req.json() as {
      sourceAType?: unknown;
      sourceBType?: unknown;
      period?:      unknown;
      rules?:       unknown;
      sessionId?:   unknown;
    };

    // ── Validate inputs ──────────────────────────────────────────────────────
    const sourceAType = typeof body.sourceAType === "string" ? body.sourceAType : null;
    const sourceBType = typeof body.sourceBType === "string" ? body.sourceBType : null;
    const period      = typeof body.period      === "string" ? body.period      : null;
    const sessionId   = typeof body.sessionId   === "string" ? body.sessionId   : null;
    const rules       = Array.isArray(body.rules) ? (body.rules as ReconciliationRule[]) : [];

    if (!sourceAType || !sourceBType || !period) {
      return NextResponse.json(
        { error: "sourceAType, sourceBType, and period are required" },
        { status: 400 },
      );
    }

    if (!/^\d{6}$/.test(period)) {
      return NextResponse.json(
        { error: "period must be YYYYMM format" },
        { status: 400 },
      );
    }

    // ── Source readiness check ───────────────────────────────────────────────
    const contractA = RECONCILIATION_SOURCES[sourceAType as keyof typeof RECONCILIATION_SOURCES] ?? null;
    const contractB = RECONCILIATION_SOURCES[sourceBType as keyof typeof RECONCILIATION_SOURCES] ?? null;

    if (!contractA || !contractB) {
      return NextResponse.json({
        status: "unsupported_combination",
        reason: `Tipo de fuente desconocido: ${!contractA ? sourceAType : sourceBType}`,
      });
    }

    const sourceAReadiness = contractA.readiness;
    const sourceBReadiness = contractB.readiness;

    if (sourceAReadiness !== "available" || sourceBReadiness !== "available") {
      const blockers: string[] = [];
      if (sourceAReadiness !== "available") blockers.push(`${contractA.label}: ${contractA.readinessNote}`);
      if (sourceBReadiness !== "available") blockers.push(`${contractB.label}: ${contractB.readinessNote}`);
      return NextResponse.json({
        status:           "pending_source",
        reason:           `Una o ambas fuentes no están disponibles para conciliar.`,
        blockers,
        sourceAReadiness,
        sourceBReadiness,
        sourceALabel:     contractA.label,
        sourceBLabel:     contractB.label,
      });
    }

    // ── Load and normalize records via loader registry ───────────────────────
    // Each source type resolves to its dedicated loader.
    // Loaders always return a LoadResult — they never throw on empty sources.
    const [loadA, loadB] = await loadBothSides(
      sourceAType as ReconciliationSourceType,
      sourceBType as ReconciliationSourceType,
      organizationId,
      period,
    );

    const recordsA = loadA.records;
    const recordsB = loadB.records;

    if (recordsA.length === 0 && recordsB.length === 0) {
      return NextResponse.json({
        status: "no_records",
        reason: `Sin registros en SAG para el período ${period}. Verificar que la importación esté completa.`,
        sourceALabel: contractA.label,
        sourceBLabel: contractB.label,
      });
    }

    // ── Rule engine: A×B pairs ───────────────────────────────────────────────
    const totalPairs = recordsA.length * recordsB.length;
    const capped     = totalPairs > MAX_PAIRS;

    // For sag_orders vs sag_sales: the match key is documentNumber (= externalId = composite key).
    // We run the rule engine on every A-B pair where documentNumber matches — this is the meaningful
    // cross-section. Running all A×B blindly would be O(n²) with low signal.
    //
    // Strategy: for each record in A, find all records in B with the same documentNumber (exact key),
    // run rule engine on those pairs. Remaining unmatched records get a "no_candidate" entry.

    const indexedB = new Map<string, typeof recordsB[number][]>();
    for (const r of recordsB) {
      const key = r.documentNumber ?? r.externalId;
      if (!indexedB.has(key)) indexedB.set(key, []);
      indexedB.get(key)!.push(r);
    }

    type PairResult = {
      recordAId:    string;
      recordAKey:   string;
      recordAAmount: number;
      recordBId:    string | null;
      recordBKey:   string | null;
      recordBAmount: number | null;
      score:        number;
      confidence:   "high" | "medium" | "low";
      verdict:      string;
      verdictLabel: string;
      requiresAction: boolean;
      severity:     "ok" | "watch" | "elevated" | "critical";
      headline:     string;
      reasons:      string[];
      rulesPassed:  number;
      rulesEvaluated: number;
    };

    const pairResults: PairResult[] = [];
    let governanceCount = 0;
    const governanceSnapshots: unknown[] = [];
    // Rule breakdown accumulator — keyed by ruleId, for Phase 3 observability
    const ruleBreakdownMap = new Map<string, Omit<RuleBreakdownEntry, "passRate">>();
    const pairScores: number[] = [];

    for (const recA of recordsA) {
      const keyA      = recA.documentNumber ?? recA.externalId;
      const candidates = indexedB.get(keyA) ?? [];

      if (candidates.length === 0) {
        // No candidate in B — record A is unmatched
        pairResults.push({
          recordAId:     recA.id,
          recordAKey:    keyA,
          recordAAmount: recA.amount,
          recordBId:     null,
          recordBKey:    null,
          recordBAmount: null,
          score:         0,
          confidence:    "low",
          verdict:       "mismatch",
          verdictLabel:  "Sin contrapartida",
          requiresAction: false,
          severity:      "watch",
          headline:      `"${keyA}" no tiene registro equivalente en ${contractB.shortLabel}`,
          reasons:       [`Sin candidato en ${contractB.shortLabel} para la clave "${keyA}"`],
          rulesPassed:   0,
          rulesEvaluated: 0,
        });
        continue;
      }

      for (const recB of candidates) {
        if (rules.length === 0) {
          // No rules configured — return informational result
          pairResults.push({
            recordAId:     recA.id,
            recordAKey:    keyA,
            recordAAmount: recA.amount,
            recordBId:     recB.id,
            recordBKey:    recB.documentNumber ?? recB.externalId,
            recordBAmount: recB.amount,
            score:         0,
            confidence:    "low",
            verdict:       "pending_review",
            verdictLabel:  "Sin reglas configuradas",
            requiresAction: true,
            severity:      "watch",
            headline:      "No hay reglas activas — configurar al menos una regla antes de ejecutar.",
            reasons:       ["Sin reglas activas en el conjunto de reglas"],
            rulesPassed:   0,
            rulesEvaluated: 0,
          });
          continue;
        }

        const ruleSetResult = executeRuleSet(rules, recA, recB);
        const verdictMeta   = classifyConflict(ruleSetResult, contractA.shortLabel, contractB.shortLabel);
        const explanation   = buildRuleExplanation(ruleSetResult, contractA.shortLabel, contractB.shortLabel);

        // Accumulate per-rule breakdown for observability
        pairScores.push(ruleSetResult.score.total);
        for (const ruleResult of ruleSetResult.ruleResults) {
          const entry = ruleBreakdownMap.get(ruleResult.ruleId) ?? {
            ruleId:    ruleResult.ruleId,
            ruleLabel: ruleResult.ruleLabel,
            group:     ruleResult.group,
            evaluated: 0,
            passed:    0,
            partial:   0,
            failed:    0,
          };
          entry.evaluated++;
          if (ruleResult.outcome === "passed")  entry.passed++;
          else if (ruleResult.outcome === "partial") entry.partial++;
          else if (ruleResult.outcome === "failed")  entry.failed++;
          ruleBreakdownMap.set(ruleResult.ruleId, entry);
        }

        const snapshot = buildGovernanceSnapshot(ruleSetResult, verdictMeta, explanation, {
          organizationId,
          sessionId,
          sourceAType,
          sourceBType,
          sourceALabel: contractA.shortLabel,
          sourceBLabel: contractB.shortLabel,
          recordAId:    recA.id,
          recordBId:    recB.id,
        });

        governanceSnapshots.push(snapshot);
        governanceCount++;

        pairResults.push({
          recordAId:      recA.id,
          recordAKey:     keyA,
          recordAAmount:  recA.amount,
          recordBId:      recB.id,
          recordBKey:     recB.documentNumber ?? recB.externalId,
          recordBAmount:  recB.amount,
          score:          ruleSetResult.score.total,
          confidence:     explanation.confidence,
          verdict:        verdictMeta.verdict,
          verdictLabel:   verdictMeta.label,
          requiresAction: verdictMeta.requiresAction,
          severity:       verdictMeta.severity,
          headline:       explanation.headline,
          reasons:        explanation.reasons.slice(0, 3),
          rulesPassed:    ruleSetResult.rulesPassed,
          rulesEvaluated: ruleSetResult.rulesEvaluated,
        });
      }
    }

    // ── Aggregate summary ────────────────────────────────────────────────────
    const evaluated   = pairResults.filter(p => p.rulesEvaluated > 0);
    const reconciled  = evaluated.filter(p => p.verdict === "reconciled").length;
    const partial     = evaluated.filter(p => p.verdict === "partial").length;
    const pending     = evaluated.filter(p => p.verdict === "pending_review").length;
    const mismatches  = evaluated.filter(p => p.verdict === "mismatch").length;
    const suspicious  = evaluated.filter(p => p.verdict === "suspicious").length;
    const noCandidate = pairResults.filter(p => p.rulesEvaluated === 0 && p.verdict === "mismatch").length;
    const avgScore    = evaluated.length > 0
      ? Math.round(evaluated.reduce((s, p) => s + p.score, 0) / evaluated.length)
      : 0;

    // ── Build execution report (observability) ───────────────────────────────
    const executionReport = buildExecutionReport({
      startedAtMs,
      sessionId,
      period,
      loadA,
      loadB,
      contractA,
      contractB,
      totalRules:    rules.length,
      enabledRules:  rules.filter(r => r.enabled).length,
      ruleBreakdown: ruleBreakdownMap,
      pairScores,
      pipeline: {
        recordsA:         recordsA.length,
        recordsB:         recordsB.length,
        pairsEvaluated:   evaluated.length,
        pairsReconciled:  reconciled,
        pairsPartial:     partial,
        pairsMismatch:    mismatches,
        pairsSuspicious:  suspicious,
        pairsPending:     pending,
        pairsNoCandidate: noCandidate,
        capped,
      },
    });

    // ── Persist execution record (Phase 3) ──────────────────────────────────
    const finishedAt = new Date();
    createExecution({
      organizationId,
      sessionId:           sessionId ?? null,
      triggeredBy:         "system",
      startedAt:           new Date(startedAtMs),
      finishedAt,
      durationMs:          executionReport.durationMs,
      sourceAType,
      sourceBType,
      sourceALabel:        contractA.label,
      sourceBLabel:        contractB.label,
      period,
      loaderA:             loadA.loaderUsed,
      loaderB:             loadB.loaderUsed,
      normalizationVersion: loadA.normalizationVersion,
      recordsA:            recordsA.length,
      recordsB:            recordsB.length,
      pairsEvaluated:      evaluated.length,
      pairsReconciled:     reconciled,
      pairsPartial:        partial,
      pairsMismatch:       mismatches,
      pairsSuspicious:     suspicious,
      pairsPending:        pending,
      pairsNoCandidate:    noCandidate,
      avgScore,
      maxScore:            executionReport.rules.maxScore,
      minScore:            executionReport.rules.minScore,
      matchRate:           executionReport.pipeline.matchRate,
      rulesTotal:          rules.length,
      rulesEnabled:        rules.filter(r => r.enabled).length,
      status:              "completed",
      executionReport,
    }).catch(() => {
      // Persistence failure must not break the response
    });

    // ── Persist review items (AGENTIK-RECON-REVIEW-CENTER-01 Phase 2) ────────
    // Create items for every non-reconciled pair that needs human review.
    // reconciled pairs are included only when score is below the confidence floor.
    const reviewInputs = pairResults
      .filter(p =>
        REVIEWABLE_VERDICTS.has(p.verdict) ||
        (p.verdict === "reconciled" && p.score < LOW_CONFIDENCE_SCORE_THRESHOLD),
      )
      .map(p => ({
        organizationId: organizationId,
        executionId:    executionReport.executionId,
        sessionId:      sessionId ?? null,
        sourceAType,
        sourceBType,
        recordAKey:     p.recordAKey,
        recordBKey:     p.recordBKey ?? null,
        score:          p.score,
        verdict:        p.verdict,
        verdictLabel:   p.verdictLabel,
        headline:       p.headline,
        explanationJson: { reasons: p.reasons, rulesPassed: p.rulesPassed, rulesEvaluated: p.rulesEvaluated } as object,
      }));
    createReviewItemsFromExecution(reviewInputs).catch(() => {
      // Review persistence failure must not break the response
    });

    // ── Persist governance to audit trail (Phase 6) ──────────────────────────
    if (sessionId && governanceCount > 0) {
      await emitReconEvent({
        organizationId,
        sessionId,
        eventType: "rule_engine_completed",
        message:   `Motor de reglas ejecutado — ${governanceCount} pares evaluados · ${reconciled} conciliados · ${pending} pendientes · ${suspicious} sospechosos`,
        actorType: "system",
        metadata: {
          executionId:    executionReport.executionId,
          rulesUsed:      rules.map(r => r.ruleId),
          pairsEvaluated: governanceCount,
          avgScore,
          reconciled,
          partial,
          pending,
          mismatches,
          suspicious,
          sourceAType,
          sourceBType,
          period,
          capped,
          durationMs:     executionReport.durationMs,
          loaderA:        executionReport.loaderA.loaderUsed,
          loaderB:        executionReport.loaderB.loaderUsed,
          normalizationVersion: executionReport.loaderA.normalizationVersion,
          ruleBreakdown:  executionReport.rules.ruleBreakdown.map(r => ({
            ruleId: r.ruleId, evaluated: r.evaluated, passed: r.passed, passRate: r.passRate,
          })),
        },
      }).catch(() => {
        // Audit trail failure must not break the response
      });
    }

    return NextResponse.json({
      status: "ok",
      summary: {
        period,
        sourceALabel:        contractA.label,
        sourceBLabel:        contractB.label,
        recordsA:            recordsA.length,
        recordsB:            recordsB.length,
        pairsEvaluated:      evaluated.length,
        noCandidate,
        reconciled,
        partial,
        pending,
        mismatches,
        suspicious,
        avgScore,
        capped,
        cappedNote:          capped ? `Par A×B excedía ${MAX_PAIRS} combinaciones — truncado` : null,
        governanceSnapshots: governanceCount,
      },
      pairResults,
      rulesUsed:       rules.map(r => ({ ruleId: r.ruleId, label: r.label, group: r.group, enabled: r.enabled })),
      executionReport,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    if (msg === "ACCESS_DENIED" || msg === "ORG_NOT_FOUND" || msg === "ORG_INACTIVE") {
      return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    }
    console.error("[RULE_ENGINE_RUN]", msg);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
