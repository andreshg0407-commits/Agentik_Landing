import { prisma } from "@/lib/prisma";

async function main() {
  const c = await prisma.connector.findUnique({
    where: { id: "cmnhu4hky0000n4y50jlhkfib" },
    select: { id: true, source: true, status: true, config: true, modules: true, updatedAt: true },
  });
  if (!c) { console.log("NOT FOUND"); process.exit(1); }
  const cfg = c.config as Record<string, unknown>;
  const safe = {
    ...cfg,
    token: cfg.token ? `[SET-${String(cfg.token).length}chars]` : "(MISSING/EMPTY)",
  };
  console.log(JSON.stringify({ id: c.id, source: c.source, status: c.status, modules: c.modules, config: safe }, null, 2));
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
