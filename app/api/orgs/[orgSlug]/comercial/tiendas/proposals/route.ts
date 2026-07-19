/**
 * POST /api/orgs/[orgSlug]/comercial/tiendas/proposals
 *
 * Actions:
 *   create             — create proposal from suggestions
 *   list               — list all proposals
 *   get                — get single proposal
 *   update_line         — update a proposal line
 *   submit_for_review   — submit for review
 *   approve            — approve proposal
 *   reject             — reject proposal
 *   return_to_draft    — return to borrador
 *   prepare_for_sag    — mark prepared for SAG
 *   archive            — archive proposal
 *   check_duplicate    — check for duplicate active proposal
 *
 * Sprint: COMERCIAL-TIENDAS-TRANSFERENCIAS-04
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  createProposalFromSuggestions,
  getProposal,
  listProposals,
  updateProposalLine,
  submitProposalForReview,
  approveProposal,
  rejectProposal,
  returnToDraft,
  markPreparedForSag,
  archiveProposal,
  checkDuplicateProposal,
} from "@/lib/comercial/tiendas/store-transfer-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const body = await req.json();
  const action = body.action as string;

  switch (action) {
    case "create": {
      const proposal = await createProposalFromSuggestions(orgId, {
        storeId:             body.storeId,
        storeName:           body.storeName,
        sourceWarehouseCode: body.sourceWarehouseCode,
        sourceWarehouseName: body.sourceWarehouseName,
        targetWarehouseCode: body.targetWarehouseCode,
        suggestions:         body.suggestions,
        createdBy:           body.createdBy ?? "usuario",
      });
      return NextResponse.json({ proposal });
    }

    case "list": {
      const proposals = await listProposals(orgId);
      return NextResponse.json({ proposals });
    }

    case "get": {
      const proposal = await getProposal(orgId, body.proposalId);
      return NextResponse.json({ proposal });
    }

    case "update_line": {
      const proposal = await updateProposalLine(orgId, body.proposalId, body.lineId, {
        transferUnits:   body.transferUnits,
        productionUnits: body.productionUnits,
        comment:         body.comment,
        removed:         body.removed,
      });
      return NextResponse.json({ proposal });
    }

    case "submit_for_review": {
      const proposal = await submitProposalForReview(orgId, body.proposalId);
      return NextResponse.json({ proposal });
    }

    case "approve": {
      const proposal = await approveProposal(orgId, body.proposalId);
      return NextResponse.json({ proposal });
    }

    case "reject": {
      const proposal = await rejectProposal(orgId, body.proposalId);
      return NextResponse.json({ proposal });
    }

    case "return_to_draft": {
      const proposal = await returnToDraft(orgId, body.proposalId);
      return NextResponse.json({ proposal });
    }

    case "prepare_for_sag": {
      const proposal = await markPreparedForSag(orgId, body.proposalId);
      return NextResponse.json({ proposal });
    }

    case "archive": {
      const proposal = await archiveProposal(orgId, body.proposalId);
      return NextResponse.json({ proposal });
    }

    case "check_duplicate": {
      const result = await checkDuplicateProposal(orgId, body.storeId);
      return NextResponse.json(result);
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
