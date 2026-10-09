import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { fetchEntries } from "./finance-api";

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

test("fetchEntries decodes refunds and rejects amounts outside the joined category contract", async () => {
  const row = {
    id: "00000000-0000-4000-8000-000000000010",
    occurred_on: "2026-10-06",
    amount_cents: -1230,
    description: "Refund",
    category: {
      id: "00000000-0000-4000-8000-000000000002",
      label: "Groceries", kind: "expense", color: "#abc123",
      sort_order: 2, archived: false,
    },
  };
  let responseRow = row;
  const client = createClient("https://ledger.example.test", "anon-fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async () => new Response(JSON.stringify([responseRow]), {
        headers: { "Content-Type": "application/json" },
      }),
    },
  });
  const read = () => fetchEntries(client, "fixture-user", null, null, new AbortController().signal);
  assert.deepEqual(await read(), [{
    id: row.id, date: row.occurred_on, amountCents: -1230, description: "Refund",
    category: {
      id: row.category.id, label: "Groceries", kind: "expense",
      color: "#abc123", sortOrder: 2, archived: false,
    },
  }]);
  for (const kind of ["income", "investment"]) {
    responseRow = { ...row, category: { ...row.category, kind } };
    await assert.rejects(read(), /must be positive/);
  }
  for (const amount_cents of [0, 1.5, 100_000_000_000, -100_000_000_000]) {
    responseRow = { ...row, amount_cents };
    await assert.rejects(read(), /nonzero and at most/);
  }
});
