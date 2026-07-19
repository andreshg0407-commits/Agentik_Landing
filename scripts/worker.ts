import { prismaWorker as prisma } from "./prisma-worker";

const SLEEP_MS = Number(process.env.WORKER_SLEEP_MS ?? 1500);
const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE ?? 5);
const MAX_ATTEMPTS = Number(process.env.WORKER_MAX_ATTEMPTS ?? 3);

const N8N_AGENTIK_TOKEN = process.env.N8N_AGENTIK_TOKEN;

// Webhooks por tipo
const WEBHOOKS: Record<string, string | undefined> = {
  "marketing.image_to_video": process.env.N8N_WEBHOOK_MARKETING_IMAGE_TO_VIDEO,
  "marketing.photo_to_catalog": process.env.N8N_WEBHOOK_MARKETING_PHOTO_TO_CATALOG,
  "shopify.product_upload": process.env.N8N_WEBHOOK_SHOPIFY_PRODUCT_UPLOAD,
  "whatsapp.auto_reply": process.env.N8N_WEBHOOK_WHATSAPP_AUTO_REPLY,
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function claimQueuedRuns() {
  const queued = await prisma.run.findMany({
    where: {
      status: "QUEUED",
      attempt: { lt: MAX_ATTEMPTS },
    },
    orderBy: { queuedAt: "asc" },
    take: BATCH_SIZE,
    select: { id: true },
  });

  if (queued.length === 0) return [];

  const claimed: string[] = [];

  for (const r of queued) {
    const updated = await prisma.run.updateMany({
      where: { id: r.id, status: "QUEUED" },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
      },
    });

    if (updated.count === 1) claimed.push(r.id);
  }

  return claimed;
}

async function executeRun(runId: string) {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: {
      id: true,
      type: true,
      inputJson: true,
      organizationId: true,
      projectId: true,
      agentId: true,
      attempt: true,
      maxAttempts: true,
    },
  });

  if (!run) return;

  const webhookUrl = WEBHOOKS[run.type];

  if (!webhookUrl) {
    throw new Error(`No webhook configured for run.type="${run.type}"`);
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(N8N_AGENTIK_TOKEN
        ? { "x-agentik-token": N8N_AGENTIK_TOKEN }
        : {}),
    },
    body: JSON.stringify({
      runId: run.id,
      type: run.type,
      organizationId: run.organizationId,
      projectId: run.projectId,
      agentId: run.agentId,
      contexturl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/internal/run-context/${run.id}`,
      input: run.inputJson ?? {},
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Webhook failed: ${res.status} ${txt}`);
  }

  const output = await res.json().catch(() => ({}));

  await prisma.run.update({
    where: { id: run.id },
    data: {
      status: "SUCCEEDED",
      outputJson: output,
      endedAt: new Date(),
    },
  });
}

async function failRun(runId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  const current = await prisma.run.findUnique({
    where: { id: runId },
    select: { attempt: true, maxAttempts: true },
  });

  const nextAttempt = (current?.attempt ?? 0) + 1;
  const maxAttempts = current?.maxAttempts ?? MAX_ATTEMPTS;

  await prisma.run.update({
    where: { id: runId },
    data: {
      attempt: nextAttempt,
      status: nextAttempt >= maxAttempts ? "FAILED" : "QUEUED",
      errorJson: {
        message,
        attempt: nextAttempt,
        at: new Date().toISOString(),
      },
      endedAt: nextAttempt >= maxAttempts ? new Date() : undefined,
    },
  });
}

async function loop() {
  console.log("🧠 Agentik worker started");
  console.log({
    sleepMs: SLEEP_MS,
    batchSize: BATCH_SIZE,
    maxAttempts: MAX_ATTEMPTS,
    configuredTypes: Object.keys(WEBHOOKS).filter((k) => WEBHOOKS[k]),
  });

  while (true) {
    try {
      const claimed = await claimQueuedRuns();

      for (const runId of claimed) {
        try {
          await executeRun(runId);
        } catch (e) {
          console.error(`❌ Run failed: ${runId}`, e);
          await failRun(runId, e);
        }
      }
    } catch (e) {
      console.error("Worker loop error:", e);
    }

    await sleep(SLEEP_MS);
  }
}

loop()
  .catch((e) => {
    console.error("❌ Worker fatal:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });