/**
 * scripts/validate-approvals.ts
 *
 * Agentik — Approval System End-to-End Validation
 * Sprint: AGENTIK-APPROVAL-VALIDATION-01
 *
 * Validates the complete Approval persistence stack via approvalService.
 * Does NOT access Prisma directly. All operations go through the service layer.
 *
 * Usage:
 *   npx tsx --conditions react-server scripts/validate-approvals.ts
 *
 * The --conditions react-server flag loads server-only's empty.js instead of
 * the throwing index.js, allowing the server-side service to run in Node.js.
 */

import { approvalService }           from "../lib/approvals/approval-service";
import {
  createApprovalRequest,
  createApprovalActor,
  DIEGO_APPROVER,
  LUCA_APPROVER,
  MILA_APPROVER,
  SYSTEM_APPROVER,
}                                    from "../lib/approvals/approval-factory";
import type {
  ApprovalDecisionInput,
} from "../lib/approvals/approval-types";

// ── Config ────────────────────────────────────────────────────────────────────

const ORG_SLUG = process.env.ORG_SLUG ?? "castillitos";

// ── Console colours ───────────────────────────────────────────────────────────

const CLR = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  dim:    "\x1b[2m",
};

function ok(msg: string)   { console.log(`${CLR.green}  ✓${CLR.reset} ${msg}`); }
function fail(msg: string) { console.log(`${CLR.red}  ✗${CLR.reset} ${msg}`); }
function info(msg: string) { console.log(`${CLR.dim}    ${msg}${CLR.reset}`); }
function section(msg: string) {
  console.log(`\n${CLR.cyan}${CLR.bold}── ${msg}${CLR.reset}`);
}

// ── Validation tracking ───────────────────────────────────────────────────────

const results: Record<string, boolean> = {};

function assert(key: string, condition: boolean, description: string): void {
  results[key] = condition;
  if (condition) ok(description);
  else           fail(description);
}

// ── Test request builders ─────────────────────────────────────────────────────

const MANAGER = createApprovalActor("manager_finanzas", "USER", "Gerencia Financiera");

function buildConciliacionRequest() {
  return createApprovalRequest({
    title:       "Marcar 14 movimientos como conciliados",
    description: "Diego detectó 14 movimientos bancarios que coinciden con registros internos.",
    priority:    "HIGH",
    source:      "COPILOT",
    category:    "FINANCIAL",
    requestor:   DIEGO_APPROVER,
    approver:    MANAGER,
    context: {
      orgSlug:          ORG_SLUG,
      module:           "conciliacion",
      sourceAgentId:    "diego",
      sourceAgentName:  "Diego",
      entityType:       "bank_movement_batch",
      entityId:         `fixture_conciliacion_${Date.now()}`,
      navigationTarget: `/${ORG_SLUG}/finanzas/conciliacion`,
      impactSummary:    "$4.250.000 pendientes de validación",
      recommendation:   "Aprobar conciliación sugerida",
    },
  });
}

function buildTesoreriaRequest() {
  return createApprovalRequest({
    title:       "Autorizar pago extraordinario",
    description: "Luca identificó un pago urgente que requiere autorización.",
    priority:    "CRITICAL",
    source:      "AGENT",
    category:    "FINANCIAL",
    requestor:   LUCA_APPROVER,
    approver:    MANAGER,
    context: {
      orgSlug:          ORG_SLUG,
      module:           "tesoreria",
      sourceAgentId:    "luca",
      sourceAgentName:  "Luca",
      entityType:       "extraordinary_payment",
      entityId:         `fixture_tesoreria_${Date.now()}`,
      navigationTarget: `/${ORG_SLUG}/finanzas/tesoreria`,
      impactSummary:    "$12.500.000 por desembolsar",
      recommendation:   "Validar posición bancaria antes de autorizar",
    },
  });
}

function buildCarteraRequest() {
  return createApprovalRequest({
    title:       "Castigar saldo vencido",
    description: "Saldo con mora superior a 180 días cumple criterios de castigo.",
    priority:    "HIGH",
    source:      "AGENT",
    category:    "COLLECTIONS",
    requestor:   DIEGO_APPROVER,
    approver:    MANAGER,
    context: {
      orgSlug:          ORG_SLUG,
      module:           "cobranza",
      sourceAgentId:    "diego",
      sourceAgentName:  "Diego",
      entityType:       "portfolio_balance",
      entityId:         `fixture_cartera_${Date.now()}`,
      navigationTarget: `/${ORG_SLUG}/finanzas/cartera`,
      impactSummary:    "$1.900.000 con mora superior a 180 días",
      recommendation:   "Castigar saldo según política interna",
    },
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${CLR.bold}APPROVAL VALIDATION REPORT${CLR.reset}`);
  console.log(`${CLR.dim}org: ${ORG_SLUG}  |  ts: ${new Date().toISOString()}${CLR.reset}`);

  let approvalId1 = "";
  let approvalId2 = "";
  let approvalId3 = "";

  // ────────────────────────────────────────────────────────────────────────────
  section("Phase 2 — Create Approval");
  // ────────────────────────────────────────────────────────────────────────────

  const req1    = buildConciliacionRequest();
  const create1 = await approvalService.createApprovalFromRequest(req1);

  assert("create.success",   create1.success,                              "createApprovalFromRequest returns success=true");
  assert("create.id",        !!create1.approval?.id,                       "Approval ID generated");
  assert("create.status",    create1.approval?.status === "PENDING",       "Initial status is PENDING");
  assert("create.title",     create1.approval?.title === req1.title,       "Title persisted correctly");
  assert("create.orgSlug",   create1.approval?.context.orgSlug === ORG_SLUG, "orgSlug in context");

  if (create1.approval) {
    approvalId1 = create1.approval.id;
    info(`id: ${approvalId1}`);
    info(`status: ${create1.approval.status}`);
    info(`priority: ${create1.approval.priority}`);
  } else {
    console.error(`${CLR.red}  FATAL: approval not returned — aborting${CLR.reset}`);
    console.error(`  message: ${create1.message}`);
    if (create1.errors) create1.errors.forEach(e => console.error(`  error: ${e}`));
    process.exit(1);
  }

  // ────────────────────────────────────────────────────────────────────────────
  section("Phase 3 — Read Approval");
  // ────────────────────────────────────────────────────────────────────────────

  const read1 = await approvalService.getApproval(approvalId1);

  assert("read.success",  read1.success,                              "getApproval returns success=true");
  assert("read.found",    read1.approval !== null,                    "Record found in database");
  assert("read.id",       read1.approval?.id === approvalId1,        "ID matches");
  assert("read.title",    read1.approval?.title === req1.title,      "Title matches");
  assert("read.status",   read1.approval?.status === "PENDING",      "Status is PENDING");
  assert("read.context",  !!read1.approval?.context.impactSummary,   "Context.impactSummary persisted");
  assert("read.nav",      !!read1.approval?.context.navigationTarget, "Context.navigationTarget persisted");

  info(`impactSummary: ${read1.approval?.context.impactSummary}`);
  info(`navigationTarget: ${read1.approval?.context.navigationTarget}`);

  // ────────────────────────────────────────────────────────────────────────────
  section("Phase 4 — Approve Approval");
  // ────────────────────────────────────────────────────────────────────────────

  const approveInput: ApprovalDecisionInput = {
    status:    "APPROVED",
    decidedBy: MANAGER,
    comment:   "Movimientos validados. Se autoriza conciliación.",
  };

  const approve1 = await approvalService.approveApproval(approvalId1, approveInput);

  assert("approve.success",    approve1.success,                            "approveApproval returns success=true");
  assert("approve.status",     approve1.approval?.status === "APPROVED",   "Status changed to APPROVED");
  assert("approve.decision",   !!approve1.decision,                        "Decision object present");
  assert("approve.decidedAt",  !!approve1.decision?.decidedAt,             "decidedAt set");
  assert("approve.decidedBy",  approve1.decision?.decidedBy.id === MANAGER.id, "decidedBy matches");
  assert("approve.audit",
    (approve1.approval?.auditTrail.length ?? 0) >= 2,                      "Audit trail has creation + approval events");

  info(`decision.status: ${approve1.decision?.status}`);
  info(`decision.decidedAt: ${approve1.decision?.decidedAt}`);
  info(`auditTrail.length: ${approve1.approval?.auditTrail.length}`);

  // ────────────────────────────────────────────────────────────────────────────
  section("Phase 5+6 — Create Second Approval → Reject");
  // ────────────────────────────────────────────────────────────────────────────

  const req2    = buildTesoreriaRequest();
  const create2 = await approvalService.createApprovalFromRequest(req2);

  assert("create2.success", create2.success,             "Second approval created");
  assert("create2.pending", create2.approval?.status === "PENDING", "Second approval is PENDING");

  approvalId2 = create2.approval?.id ?? "";
  info(`id: ${approvalId2}`);

  const rejectInput: ApprovalDecisionInput = {
    status:    "REJECTED",
    decidedBy: MANAGER,
    comment:   "Información insuficiente",
  };

  const reject1 = await approvalService.rejectApproval(approvalId2, rejectInput);

  assert("reject.success",   reject1.success,                           "rejectApproval returns success=true");
  assert("reject.status",    reject1.approval?.status === "REJECTED",  "Status changed to REJECTED");
  assert("reject.decision",  !!reject1.decision,                       "Decision object present");
  assert("reject.comment",   reject1.decision?.comment === "Información insuficiente", "Comment persisted");
  assert("reject.decidedAt", !!reject1.decision?.decidedAt,            "decidedAt set");
  assert("reject.audit",
    (reject1.approval?.auditTrail.length ?? 0) >= 2,                   "Audit trail has creation + rejection events");

  info(`decision.status: ${reject1.decision?.status}`);
  info(`comment: ${reject1.decision?.comment}`);

  // ────────────────────────────────────────────────────────────────────────────
  section("Phase 7+8 — Create Third Approval → Cancel");
  // ────────────────────────────────────────────────────────────────────────────

  const req3    = buildCarteraRequest();
  const create3 = await approvalService.createApprovalFromRequest(req3);

  assert("create3.success", create3.success,                            "Third approval created");
  assert("create3.pending", create3.approval?.status === "PENDING",     "Third approval is PENDING");

  approvalId3 = create3.approval?.id ?? "";
  info(`id: ${approvalId3}`);

  const cancel1 = await approvalService.cancelApproval(
    approvalId3,
    SYSTEM_APPROVER,
    "Solicitud cancelada por revisión de proceso",
  );

  assert("cancel.success",  cancel1.success,                             "cancelApproval returns success=true");
  assert("cancel.status",   cancel1.approval?.status === "CANCELLED",   "Status changed to CANCELLED");
  assert("cancel.audit",
    (cancel1.approval?.auditTrail.length ?? 0) >= 2,                     "Audit trail has creation + cancellation events");

  info(`status: ${cancel1.approval?.status}`);
  info(`auditTrail.length: ${cancel1.approval?.auditTrail.length}`);

  // ────────────────────────────────────────────────────────────────────────────
  section("Phase 9 — Invalid Transition Protection");
  // ────────────────────────────────────────────────────────────────────────────

  // APPROVED → REJECTED (should fail)
  const badReject = await approvalService.rejectApproval(approvalId1, {
    status: "REJECTED", decidedBy: MANAGER, comment: "Invalid attempt",
  });
  assert("transition.approved_to_rejected",
    !badReject.success,
    "APPROVED → REJECTED correctly blocked");
  info(`message: ${badReject.message}`);

  // REJECTED → APPROVED (should fail)
  const badApprove = await approvalService.approveApproval(approvalId2, {
    status: "APPROVED", decidedBy: MANAGER,
  });
  assert("transition.rejected_to_approved",
    !badApprove.success,
    "REJECTED → APPROVED correctly blocked");
  info(`message: ${badApprove.message}`);

  // CANCELLED → APPROVED (should fail)
  const badApproveFromCancelled = await approvalService.approveApproval(approvalId3, {
    status: "APPROVED", decidedBy: MANAGER,
  });
  assert("transition.cancelled_to_approved",
    !badApproveFromCancelled.success,
    "CANCELLED → APPROVED correctly blocked");
  info(`message: ${badApproveFromCancelled.message}`);

  // HIGH priority reject without comment (should fail)
  const req4 = buildConciliacionRequest(); // HIGH priority
  const create4 = await approvalService.createApprovalFromRequest(req4);
  const badRejectNoComment = await approvalService.rejectApproval(
    create4.approval!.id,
    { status: "REJECTED", decidedBy: MANAGER },
  );
  assert("transition.high_reject_no_comment",
    !badRejectNoComment.success,
    "HIGH priority reject without comment correctly blocked");
  info(`message: ${badRejectNoComment.message}`);
  // Clean up the temp approval
  await approvalService.cancelApproval(create4.approval!.id, SYSTEM_APPROVER, "cleanup");

  // ────────────────────────────────────────────────────────────────────────────
  section("Phase 10 — List Approvals");
  // ────────────────────────────────────────────────────────────────────────────

  const list1 = await approvalService.listApprovals(ORG_SLUG);

  assert("list.success",   list1.success,            "listApprovals returns success=true");
  assert("list.nonempty",  list1.approvals.length > 0, "Returns at least one approval");
  assert("list.total",     list1.totalCount > 0,      "totalCount > 0");

  const listIds = list1.approvals.map(a => a.id);
  assert("list.contains_1", listIds.includes(approvalId1), "List contains approval 1 (APPROVED)");
  assert("list.contains_2", listIds.includes(approvalId2), "List contains approval 2 (REJECTED)");
  assert("list.contains_3", listIds.includes(approvalId3), "List contains approval 3 (CANCELLED)");

  info(`total in list: ${list1.totalCount}`);

  // Filter by status PENDING
  const listPending = await approvalService.listApprovals(ORG_SLUG, { status: ["PENDING"] });
  assert("list.filter_pending", listPending.success, "Filter by PENDING works");
  const allPending = listPending.approvals.every(a => a.status === "PENDING");
  assert("list.filter_pending_clean", allPending, "Filtered results are all PENDING");
  info(`pending count: ${listPending.totalCount}`);

  // Filter by category FINANCIAL
  const listFinancial = await approvalService.listApprovals(ORG_SLUG, { category: ["FINANCIAL"] });
  assert("list.filter_financial", listFinancial.success, "Filter by FINANCIAL works");
  const allFinancial = listFinancial.approvals.every(a => a.category === "FINANCIAL");
  assert("list.filter_financial_clean", allFinancial, "Filtered results are all FINANCIAL");
  info(`financial count: ${listFinancial.totalCount}`);

  // ────────────────────────────────────────────────────────────────────────────
  section("Phase 11 — Audit Trail Verification");
  // ────────────────────────────────────────────────────────────────────────────

  // Re-query approval 1 from DB to verify audit trail persisted
  const reread1 = await approvalService.getApproval(approvalId1);
  const trail1  = reread1.approval?.auditTrail ?? [];
  assert("audit.approved_has_created",
    trail1.some(e => e.type === "created"),
    "APPROVED approval has 'created' audit event");
  assert("audit.approved_has_approved",
    trail1.some(e => e.type === "approved"),
    "APPROVED approval has 'approved' audit event");
  info(`trail events: ${trail1.map(e => e.type).join(", ")}`);

  // Re-query approval 2 from DB to verify audit trail persisted
  const reread2 = await approvalService.getApproval(approvalId2);
  const trail2  = reread2.approval?.auditTrail ?? [];
  assert("audit.rejected_has_rejected",
    trail2.some(e => e.type === "rejected"),
    "REJECTED approval has 'rejected' audit event");

  // Re-query approval 3 from DB to verify audit trail persisted
  const reread3 = await approvalService.getApproval(approvalId3);
  const trail3  = reread3.approval?.auditTrail ?? [];
  assert("audit.cancelled_has_cancelled",
    trail3.some(e => e.type === "cancelled"),
    "CANCELLED approval has 'cancelled' audit event");

  // ────────────────────────────────────────────────────────────────────────────
  section("Phase 12 — Full Persistence Validation");
  // ────────────────────────────────────────────────────────────────────────────

  const final1 = await approvalService.getApproval(approvalId1);
  assert("persist.approval1.status",   final1.approval?.status === "APPROVED",  "Approval 1 status persisted: APPROVED");
  assert("persist.approval1.decision", !!final1.approval?.decision,             "Approval 1 decision persisted");
  assert("persist.approval1.audit",    (final1.approval?.auditTrail.length ?? 0) >= 2, "Approval 1 audit trail persisted");
  assert("persist.approval1.context",  !!final1.approval?.context.impactSummary, "Approval 1 context persisted");

  const final2 = await approvalService.getApproval(approvalId2);
  assert("persist.approval2.status",   final2.approval?.status === "REJECTED",  "Approval 2 status persisted: REJECTED");
  assert("persist.approval2.decision", !!final2.approval?.decision,             "Approval 2 decision persisted");
  assert("persist.approval2.comment",
    final2.approval?.decision?.comment === "Información insuficiente",           "Approval 2 comment persisted");

  const final3 = await approvalService.getApproval(approvalId3);
  assert("persist.approval3.status",   final3.approval?.status === "CANCELLED", "Approval 3 status persisted: CANCELLED");
  assert("persist.approval3.audit",    (final3.approval?.auditTrail.length ?? 0) >= 2, "Approval 3 audit trail persisted");

  // ────────────────────────────────────────────────────────────────────────────
  section("Phase 13 — Final Report");
  // ────────────────────────────────────────────────────────────────────────────

  const CHECKS: Array<[string, string]> = [
    ["Create Approval",                 ["create.success", "create.id", "create.status"].every(k => results[k]) ? "pass" : "fail"],
    ["Read Approval",                   ["read.success", "read.found", "read.context"].every(k => results[k]) ? "pass" : "fail"],
    ["Approve Approval",                ["approve.success", "approve.status", "approve.decision"].every(k => results[k]) ? "pass" : "fail"],
    ["Reject Approval",                 ["reject.success", "reject.status", "reject.comment"].every(k => results[k]) ? "pass" : "fail"],
    ["Cancel Approval",                 ["cancel.success", "cancel.status"].every(k => results[k]) ? "pass" : "fail"],
    ["Invalid Transition Protection",   ["transition.approved_to_rejected", "transition.rejected_to_approved", "transition.cancelled_to_approved", "transition.high_reject_no_comment"].every(k => results[k]) ? "pass" : "fail"],
    ["List Approvals",                  ["list.success", "list.nonempty", "list.filter_pending"].every(k => results[k]) ? "pass" : "fail"],
    ["Audit Trail",                     ["audit.approved_has_created", "audit.approved_has_approved", "audit.rejected_has_rejected", "audit.cancelled_has_cancelled"].every(k => results[k]) ? "pass" : "fail"],
    ["Persistence Validation",          ["persist.approval1.status", "persist.approval2.comment", "persist.approval3.status"].every(k => results[k]) ? "pass" : "fail"],
  ];

  console.log("");
  let allPassed = true;
  for (const [label, status] of CHECKS) {
    const passed = status === "pass";
    if (!passed) allPassed = false;
    const icon = passed ? `${CLR.green}✓` : `${CLR.red}✗`;
    console.log(`  ${icon} ${label}${CLR.reset}`);
  }

  const failedCount = Object.values(results).filter(v => !v).length;
  const passedCount = Object.values(results).filter(v => v).length;

  console.log("");
  if (allPassed) {
    console.log(`${CLR.bold}${CLR.green}RESULT: APPROVAL SYSTEM READY${CLR.reset}`);
  } else {
    console.log(`${CLR.bold}${CLR.red}RESULT: ${failedCount} assertion(s) failed — review output above${CLR.reset}`);
  }
  console.log(`${CLR.dim}${passedCount} passed · ${failedCount} failed · ${passedCount + failedCount} total${CLR.reset}\n`);

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error(`\n${CLR.red}${CLR.bold}UNHANDLED ERROR:${CLR.reset}`, err);
  process.exit(1);
});
