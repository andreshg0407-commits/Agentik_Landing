import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export const runtime = "nodejs" // ✅ Prisma + pg

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    const organizationId = searchParams.get("organizationId") ?? undefined
    const projectId = searchParams.get("projectId") ?? undefined
    const agentId = searchParams.get("agentId") ?? undefined
    const take = Math.min(Number(searchParams.get("take") ?? 20), 100)

    const where: any = {}
    if (organizationId) where.organizationId = organizationId
    if (projectId) where.projectId = projectId
    if (agentId) where.agentId = agentId

    const runs = await prisma.run.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        organizationId: true,
        projectId: true,
        agentId: true,
        type: true,
        status: true,
        createdAt: true,
        startedAt: true,
        endedAt: true,
      },
    })

    return NextResponse.json({ ok: true, runs })
  } catch (error) {
    console.error("Fetch runs failed:", error)
    return NextResponse.json({ error: "Failed to fetch runs" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const organizationId = body.organizationId as string | undefined
    const projectId = body.projectId as string | undefined
    const agentId = body.agentId as string | undefined
    const type = body.type as string | undefined
    const input = body.input ?? {}

    if (!organizationId || !type) {
      return NextResponse.json(
        { error: "Missing required fields: organizationId, type" },
        { status: 400 }
      )
    }

    // 1) Validar Organization existe
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    })
    if (!org) {
      return NextResponse.json({ error: "Invalid organizationId" }, { status: 400 })
    }

    // 2) Validar Project (si viene)
    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, organizationId },
        select: { id: true },
      })
      if (!project) {
        return NextResponse.json(
          { error: "Invalid projectId (not found or not in organization)" },
          { status: 400 }
        )
      }
    }

    // 3) Validar Agent (si viene)
    if (agentId) {
      const agent = await prisma.agent.findFirst({
        where: {
          id: agentId,
          organizationId,
          ...(projectId ? { projectId } : {}),
        },
        select: { id: true },
      })
      if (!agent) {
        return NextResponse.json(
          { error: "Invalid agentId (not found / not in org / not in project)" },
          { status: 400 }
        )
      }
    }

    // 4) Crear Run
    const run = await prisma.run.create({
      data: {
        organizationId,
        projectId: projectId ?? null,
        agentId: agentId ?? null,
        type,
        status: "QUEUED",
        inputJson: input,
      },
      select: { id: true },
    })

    return NextResponse.json({ ok: true, runId: run.id })
  } catch (error: any) {
    console.error("Run creation failed:", error)
    return NextResponse.json(
      {
        error: "Run creation failed",
        hint:
          error?.code === "P2003"
            ? "Foreign key constraint (verify organizationId/projectId/agentId exist)."
            : undefined,
      },
      { status: 500 }
    )
  }
}