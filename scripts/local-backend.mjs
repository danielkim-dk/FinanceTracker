import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const cli = resolve("node_modules/.bin/supabase");
const excluded = "realtime,storage-api,imgproxy,edge-runtime,logflare,vector";

function run(args) {
  try {
    return execFileSync(cli, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  } catch (error) {
    const output = `${error.stderr ?? ""}\n${error.stdout ?? ""}`;
    console.error(output.replace(/"(?:SECRET_KEY|SERVICE_ROLE_KEY|JWT_SECRET)":"[^"]*"/g, '"private_key":"[redacted]"'));
    process.exit(1);
  }
}

if (process.argv.includes("--stop")) {
  run(["stop"]);
  console.log("Local Supabase stopped. Your database is preserved.");
} else {
  run(["start", "-x", excluded]);
  run(["migration", "up", "--local"]);
  const status = JSON.parse(run(["status", "-o", "json"]));
  const existing = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
  const lines = existing.split(/\r?\n/).filter((line) => line && !/^NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY|PUBLISHABLE_KEY)=/.test(line));
  const keyName = status.PUBLISHABLE_KEY ? "PUBLISHABLE_KEY" : "ANON_KEY";
  const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
  lines.push(`NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}`, `NEXT_PUBLIC_SUPABASE_${keyName}=${key}`);
  writeFileSync(".env.local", `${lines.join("\n")}\n`, { mode: 0o600 });
  console.log("Local Supabase is ready. Public app settings saved to .env.local.");
  console.log(`Database Studio is available at ${status.STUDIO_URL}.`);
  console.log("Run npm run dev, then open http://127.0.0.1:3100.");
}
