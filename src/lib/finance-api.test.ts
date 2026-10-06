import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function browserConfig(values: Record<string, string>) {
  const env = { ...process.env };
  delete env.NEXT_PUBLIC_SUPABASE_URL;
  delete env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  Object.assign(env, values);
  const output = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    globalThis.fetch = async (url, options) => {
      console.log(JSON.stringify({ url: String(url), key: new Headers(options.headers).get("apikey") }));
      return new Response("[]", { headers: { "Content-Type": "application/json" } });
    };
    const { createBrowserClient } = await import("./src/lib/finance-api.ts");
    const client = createBrowserClient();
    if (client) await client.from("entries").select("id");
    else console.log(JSON.stringify({ configured: false }));
  `], { env, encoding: "utf8" });
  return JSON.parse(output.trim());
}

test("browser connects with only a publishable key and prefers it over the legacy key", () => {
  const values = {
    NEXT_PUBLIC_SUPABASE_URL: " https://ledger.example.test ",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: " sb_publishable_fixture ",
  };
  const expected = { url: "https://ledger.example.test/rest/v1/entries?select=id", key: "sb_publishable_fixture" };
  assert.deepEqual(browserConfig(values), expected);
  assert.deepEqual(browserConfig({ ...values, NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-fixture" }), expected);
});

test("browser retains legacy anon configuration and treats a blank publishable key as absent", () => {
  const values = {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-fixture",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "  ",
  };
  assert.deepEqual(browserConfig(values), {
    url: "http://127.0.0.1:54321/rest/v1/entries?select=id", key: "legacy-fixture",
  });
});

test("browser shows setup when its URL or public key is missing", () => {
  assert.deepEqual(browserConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://ledger.example.test" }), { configured: false });
  assert.deepEqual(browserConfig({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture" }), { configured: false });
});
