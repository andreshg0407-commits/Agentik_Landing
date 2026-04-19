import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!org) {
    return NextResponse.json({ error: "Org not found" }, { status: 404 });
  }

  // Main project: el que marcaste en seed con settingsJson.isMain = true
  const project = await prisma.project.findFirst({
    where: {
      organizationId: org.id,
      OR: [
        { key: "agentik-main" },
        { settingsJson: { path: ["isMain"], equals: true } as any },
      ],
    },
    select: { id: true, key: true },
  });

  if (!project) {
    return NextResponse.json(
      { error: "Main project not found for org" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    organizationId: org.id,
    projectId: project.id,
    projectKey: project.key,
  });
}