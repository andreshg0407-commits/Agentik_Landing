import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { runId: string } }
) {
  try {
    const runId = params.runId;

    const run = await prisma.run.findUnique({
      where: { id: runId },
      select: {
        id: true,
        organizationId: true,
        projectId: true,
        agentId: true,
        channelId: true,
        workflowId: true,
        conversationId: true,

        type: true,
        status: true,
        idempotencyKey: true,
        attempt: true,
        maxAttempts: true,
        traceId: true,

        inputJson: true,
        outputJson: true,
        errorJson: true,

        createdAt: true,
        queuedAt: true,
        startedAt: true,
        endedAt: true,
        updatedAt: true,
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, run });
  } catch (e) {
    console.error("Fetch run failed:", e);
    return NextResponse.json({ error: "Failed to fetch run" }, { status: 500 });
  }
}