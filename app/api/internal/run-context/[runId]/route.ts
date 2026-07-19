import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(
  req: Request,
  { params }: { params: { runId: string } }
) {
  try {
    const token = req.headers.get("x-agentik-token");
    const expectedToken = process.env.N8N_AGENTIK_TOKEN;

    // Seguridad básica para que solo n8n/worker puedan pedir contexto
    if (!expectedToken || token !== expectedToken) {
      return unauthorized();
    }

    const runId = params.runId;

    const run = await prisma.run.findUnique({
      where: { id: runId },
      select: {
        id: true,
        type: true,
        status: true,
        inputJson: true,
        outputJson: true,
        errorJson: true,
        traceId: true,
        attempt: true,
        maxAttempts: true,
        queuedAt: true,
        startedAt: true,
        endedAt: true,
        createdAt: true,
        updatedAt: true,

        organizationId: true,
        projectId: true,
        agentId: true,
        workflowId: true,
        channelId: true,
        conversationId: true,
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: run.organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        status: true,
        settingsJson: true,
      },
    });

    const project = run.projectId
      ? await prisma.project.findUnique({
          where: { id: run.projectId },
          select: {
            id: true,
            name: true,
            key: true,
            status: true,
            description: true,
            settingsJson: true,
            projectModules: {
              where: { enabled: true },
              select: {
                code: true,
                enabled: true,
                configJson: true,
              },
            },
          },
        })
      : null;

    const agent = run.agentId
      ? await prisma.agent.findUnique({
          where: { id: run.agentId },
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            modelProvider: true,
            modelName: true,
            temperature: true,
            topP: true,
            maxOutputTokens: true,
            configJson: true,
            activeVersion: {
              select: {
                id: true,
                version: true,
                label: true,
                systemPrompt: true,
                policyJson: true,
                toolsJson: true,
                behaviorJson: true,
                metadataJson: true,
              },
            },
          },
        })
      : null;

    const workflow = run.workflowId
      ? await prisma.workflow.findUnique({
          where: { id: run.workflowId },
          select: {
            id: true,
            name: true,
            provider: true,
            status: true,
            externalId: true,
            endpointUrl: true,
            configJson: true,
          },
        })
      : null;

    const channel = run.channelId
      ? await prisma.channel.findUnique({
          where: { id: run.channelId },
          select: {
            id: true,
            type: true,
            name: true,
            status: true,
            externalAccountId: true,
            externalPhoneId: true,
            externalPageId: true,
            settingsJson: true,
            integrationId: true,
          },
        })
      : null;

    // Integraciones relevantes a nivel organización / proyecto
    const integrations = await prisma.integration.findMany({
      where: {
        organizationId: run.organizationId,
        OR: [
          { projectId: run.projectId ?? undefined },
          { projectId: null },
        ],
      },
      select: {
        id: true,
        provider: true,
        name: true,
        status: true,
        lastSyncedAt: true,
        lastError: true,
        configJson: true,
        metaJson: true,
        // ❌ no devolvemos secretsJson por seguridad
      },
      orderBy: { updatedAt: "desc" },
    });

    const conversation = run.conversationId
      ? await prisma.conversation.findUnique({
          where: { id: run.conversationId },
          select: {
            id: true,
            status: true,
            externalThreadId: true,
            customerName: true,
            customerHandle: true,
            metadataJson: true,
          },
        })
      : null;

    return NextResponse.json({
      ok: true,
      context: {
        run,
        organization,
        project,
        agent,
        workflow,
        channel,
        conversation,
        integrations,
      },
    });
  } catch (error) {
    console.error("Fetch run context failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch run context" },
      { status: 500 }
    );
  }
}