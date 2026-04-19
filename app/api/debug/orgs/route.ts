import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// 👇 Solo dev (seguridad). En prod devuelve 404.
function assertDev() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}

export async function GET(req: Request) {
  const notAllowed = assertDev();
  if (notAllowed) return notAllowed;

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug") ?? undefined;
  const take = Math.min(Number(searchParams.get("take") ?? 50), 200);

  const orgs = await prisma.organization.findMany({
    where: slug ? { slug } : undefined,
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      type: true,
      createdAt: true,
      projects: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          name: true,
          key: true,
          status: true,
          createdAt: true,
          agents: {
            orderBy: { createdAt: "desc" },
            take: 20,
            select: { id: true, name: true, type: true, status: true, createdAt: true },
          },
        },
      },
      members: {
        take: 20,
        select: {
          id: true,
          role: true,
          status: true,
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
  });

  return NextResponse.json({ ok: true, orgs });
}