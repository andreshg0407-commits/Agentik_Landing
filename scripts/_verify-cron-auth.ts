import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const secret = process.env.INTERNAL_CRON_SECRET ?? "";
  console.log("INTERNAL_CRON_SECRET set:", secret.length > 0 ? `YES (${secret.length} chars)` : "NO");
  
  // Check if Vercel deployment URL is available
  const vercelUrl = process.env.VERCEL_URL ?? process.env.NEXT_PUBLIC_URL ?? "";
  console.log("VERCEL_URL:", vercelUrl || "NOT SET");
  
  // Check what Vercel Cron would send
  console.log("\nVercel Cron sends: Authorization: Bearer <CRON_SECRET>");
  console.log("Our code checks: x-internal-cron-secret header OR ?secret= query param");
  console.log("Mismatch? Vercel uses 'Authorization' header, NOT 'x-internal-cron-secret'");
  
  // Check if data-sync and inventory-refresh use the same auth
  console.log("\nBUT data-sync works (Jul 6 success) with the same auth code.");
  console.log("So either: 1) Vercel uses ?secret= query param, or 2) something else handles auth");
  
  // The real question: does the vercel.json path include secret?
  const fs = require("fs");
  const vercelJson = JSON.parse(fs.readFileSync("vercel.json", "utf-8"));
  console.log("\nvercel.json cron paths:");
  for (const c of vercelJson.crons) {
    const hasSecret = c.path.includes("secret");
    console.log(`  ${c.path} → schedule: ${c.schedule} ${hasSecret ? "HAS SECRET" : "NO SECRET IN PATH"}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
