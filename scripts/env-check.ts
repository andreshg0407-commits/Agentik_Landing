import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });

console.log("DATABASE_URL exists?", Boolean(process.env.DATABASE_URL));
console.log("DIRECT_URL exists?", Boolean(process.env.DIRECT_URL));

if (process.env.DIRECT_URL) {
  console.log("DIRECT_URL starts:", process.env.DIRECT_URL.slice(0, 35) + "...");
}