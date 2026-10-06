import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createCategory, fetchCategories, fetchEntries, insertEntries, renameCategory, setCategoryArchived } from "../src/lib/finance-api.ts";

const status = JSON.parse(execFileSync(resolve("node_modules/.bin/supabase"), ["status", "-o", "json"], { encoding: "utf8" }));
assert.equal(new URL(status.API_URL).hostname, "127.0.0.1", "Only the disposable local stack may be tested.");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const anonymous = createClient(status.API_URL, status.ANON_KEY, options);
const users = [];

async function account() {
  const client = createClient(status.API_URL, status.ANON_KEY, options);
  const { data, error } = await client.auth.signUp({
    email: `verify-${randomUUID()}@example.test`,
    password: `Local-${randomUUID()}!`,
  });
  assert.equal(error, null, "Local email/password signup succeeds.");
  assert.ok(data.session, "Local signup returns a session without an email provider.");
  users.push(data.user.id);
  return { client, id: data.user.id };
}

try {
  const a = await account();
  const b = await account();
  const { data: categories, error: categoryError } = await a.client.from("categories").select("*").order("sort_order");
  assert.equal(categoryError, null);
  const salary = categories.find((category) => category.label === "Salary");
  const row = { id: randomUUID(), occurred_on: "2026-10-06", category_id: salary.id, amount_cents: 10025, description: "Isolation fixture" };
  const insert = await a.client.from("entries").insert(row).select().single();
  assert.equal(insert.error, null);
  assert.equal(insert.data.user_id, a.id, "Ownership comes from the authenticated database default.");
  assert.equal(insert.data.amount_cents, 10025);

  const own = await a.client.from("entries").select("*, category:categories(*)").eq("id", row.id).single();
  assert.equal(own.data.category.label, "Salary");
  const foreign = await b.client.from("entries").select("*").eq("id", row.id);
  assert.deepEqual(foreign.data, [], "Another user cannot read the entry.");
  const foreignUpdate = await b.client.from("entries").update({ amount_cents: 1 }).eq("id", row.id).select();
  assert.deepEqual(foreignUpdate.data, [], "Another user cannot update the entry.");
  const foreignDelete = await b.client.from("entries").delete().eq("id", row.id).select();
  assert.deepEqual(foreignDelete.data, [], "Another user cannot delete the entry.");
  const foreignInsert = await b.client.from("entries").insert({ ...row, id: randomUUID(), user_id: a.id });
  assert.ok(foreignInsert.error, "A forged owner is rejected.");
  const reassignment = await a.client.from("entries").update({ user_id: b.id }).eq("id", row.id);
  assert.ok(reassignment.error, "An owner cannot reassign the row to another user.");
  const anonymousRead = await anonymous.from("entries").select("*");
  assert.ok(anonymousRead.error, "Anonymous database access is rejected.");
  await renameCategory(a.client, a.id, salary.id, "Paycheck");
  assert.equal((await a.client.from("entries").select("category:categories(label)").eq("id", row.id).single()).data.category.label, "Paycheck", "Renames update historical entry labels.");
  assert.equal((await b.client.from("categories").select("*").eq("id", salary.id)).data.length, 0, "Categories are private to their account.");
  const foreignCategoryUpdate = await b.client.from("categories").update({ label: "Hijacked" }).eq("id", salary.id).select();
  assert.deepEqual(foreignCategoryUpdate.data, [], "Another account cannot rename a category.");
  assert.equal((await b.client.from("categories").select("label").eq("kind", "income").eq("label", "Salary").single()).data.label, "Salary", "Default categories are independent per account.");
  assert.ok((await a.client.from("categories").update({ kind: "expense" }).eq("id", salary.id)).error, "The category's fixed type cannot be changed.");
  assert.ok((await a.client.from("categories").insert({ label: "Paycheck", kind: "income", user_id: b.id })).error, "A category cannot be created for another account.");
  const aSession = (await a.client.auth.getSession()).data.session;
  const bSession = (await b.client.auth.getSession()).data.session;
  const switchedRequest = createClient(status.API_URL, status.ANON_KEY, {
    ...options,
    global: {
      fetch: async (input, init) => {
        const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
        if (url.pathname === "/rest/v1/categories" && init?.method === "POST") {
          const headers = new Headers(init.headers);
          headers.set("Authorization", `Bearer ${bSession.access_token}`);
          return fetch(input, { ...init, headers });
        }
        return fetch(input, init);
      },
    },
  });
  await switchedRequest.auth.setSession({ access_token: aSession.access_token, refresh_token: aSession.refresh_token });
  const switchId = randomUUID();
  await assert.rejects(createCategory(switchedRequest, a.id, { id: switchId, label: "Switched account fixture", kind: "expense" }));
  assert.deepEqual((await b.client.from("categories").select("id").eq("id", switchId)).data, [], "A delayed create authenticated as another user cannot land in that user's account.");
  assert.ok((await a.client.from("entries").insert({ ...row, id: randomUUID(), category_id: (await b.client.from("categories").select("id").eq("label", "Salary").single()).data.id })).error, "Cross-owner category assignment is rejected at the database boundary.");

  const customInput = { id: randomUUID(), label: "Travel", kind: "expense" };
  await createCategory(a.client, a.id, customInput);
  await createCategory(a.client, a.id, customInput);
  await assert.rejects(createCategory(a.client, a.id, { ...customInput, label: "Different" }), /different details/);
  const custom = await a.client.from("categories").select("*").eq("id", customInput.id).single();
  assert.equal(custom.error, null, "Owners can add categories with valid defaults.");
  assert.equal(custom.data.archived, false);
  assert.equal(custom.data.color, "#9ab391");
  assert.ok((await a.client.from("categories").insert({ label: "travel", kind: "income" })).error, "Category names are unique without regard to case or type.");
  assert.ok((await a.client.from("categories").insert({ label: " ", kind: "expense" })).error, "Blank category names are rejected.");
  const historyId = randomUUID();
  assert.equal((await a.client.from("entries").insert({ ...row, id: historyId, category_id: custom.data.id })).error, null);
  await setCategoryArchived(a.client, a.id, custom.data.id, true);
  assert.ok((await a.client.from("entries").insert({ ...row, id: randomUUID(), category_id: custom.data.id })).error, "Removed categories cannot be assigned to new entries.");
  assert.ok((await a.client.from("entries").update({ category_id: custom.data.id }).eq("id", row.id)).error, "Removed categories cannot be newly assigned during an edit.");
  assert.equal((await a.client.from("entries").update({ amount_cents: 25 }).eq("id", historyId)).error, null, "An existing removed category can remain while other fields are edited.");
  const history = await a.client.from("entries").select("amount_cents,category:categories(label,archived)").eq("id", historyId).single();
  assert.equal(history.data.amount_cents, 25);
  assert.deepEqual(history.data.category, { label: "Travel", archived: true }, "Removing a category preserves linked history.");
  assert.ok((await a.client.from("categories").delete().eq("id", custom.data.id)).error, "Category removal cannot hard-delete history.");
  const allCategories = await fetchCategories(a.client, a.id, new AbortController().signal);
  assert.equal(allCategories.find((category) => category.id === custom.data.id).archived, true, "Category gateway retains removed definitions for history and settings.");
  await setCategoryArchived(a.client, a.id, custom.data.id, false);
  assert.equal((await a.client.from("entries").delete().eq("id", historyId)).error, null);

  const duplicate = await a.client.from("entries").insert(row);
  assert.equal(duplicate.error.code, "23505", "Retry cannot duplicate an entry or overwrite it.");
  const input = { id: row.id, date: row.occurred_on, categoryId: row.category_id, amountCents: row.amount_cents, description: row.description };
  await insertEntries(a.client, a.id, [input]);
  await assert.rejects(insertEntries(a.client, a.id, [{ ...input, amountCents: 1 }]), /different details/);
  assert.equal((await a.client.from("entries").select("amount_cents").eq("id", row.id).single()).data.amount_cents, 10025, "A changed retry cannot overwrite the saved entry.");
  const goodId = randomUUID();
  const badBatch = await a.client.from("entries").insert([
    { ...row, id: goodId },
    { ...row, id: randomUUID(), amount_cents: -1 },
  ]);
  assert.ok(badBatch.error, "Invalid amounts fail at the database boundary.");
  const afterRollback = await a.client.from("entries").select("*").eq("id", goodId);
  assert.deepEqual(afterRollback.data, [], "A malformed batch rolls back the entire insert.");

  const many = Array.from({ length: 1005 }, () => ({ ...row, id: randomUUID(), amount_cents: 1, description: "Pagination fixture" }));
  assert.equal((await a.client.from("entries").insert(many)).error, null);
  const oldRow = { ...row, id: randomUUID(), occurred_on: "2024-09-01", amount_cents: 1000, description: "History fixture" };
  assert.equal((await a.client.from("entries").insert(oldRow)).error, null);
  const newestRow = { ...row, id: "00000000-0000-4000-8000-000000000001", amount_cents: 1, description: "Newest same-date input fixture" };
  assert.equal((await a.client.from("entries").insert(newestRow)).error, null);
  const bSalary = (await b.client.from("categories").select("id").eq("label", "Salary").single()).data.id;
  const bRow = { ...oldRow, id: randomUUID(), category_id: bSalary, amount_cents: 733 };
  assert.equal((await b.client.from("entries").insert(bRow)).error, null);
  const rows = await fetchEntries(a.client, a.id, "2026-10-01", "2026-11-01", new AbortController().signal);
  assert.equal(rows.length, 1007, "All pages are required above the API response limit.");
  assert.equal(rows[0].id, newestRow.id, "The newest same-date input comes first even with a lower UUID.");
  assert.equal(rows.at(-1).id, row.id, "The oldest same-date input remains last across pages.");
  assert.equal(rows.reduce((total, entry) => total + entry.amountCents, 0), 11031);
  const allRows = await fetchEntries(a.client, a.id, null, null, new AbortController().signal);
  assert.equal(allRows.length, 1008, "All dates includes paginated history beyond the dashboard's twelve-month range.");
  assert.equal(allRows.at(-1).id, oldRow.id, "A newly input backdated entry remains below entries with a later transaction date.");
  assert.equal(allRows.reduce((total, entry) => total + entry.amountCents, 0), 12031);
  assert.deepEqual(allRows.map((entry) => entry.id), [...rows.map((entry) => entry.id), oldRow.id], "History preserves descending date and input order across pages.");
  const beforeMonth = await fetchEntries(a.client, a.id, null, "2026-10-01", new AbortController().signal);
  assert.deepEqual(beforeMonth.map((entry) => entry.id), [oldRow.id], "An upper bound remains exclusive when the lower bound is absent.");
  const afterMonth = await fetchEntries(a.client, a.id, "2026-10-01", null, new AbortController().signal);
  assert.deepEqual(afterMonth.map((entry) => entry.id), rows.map((entry) => entry.id), "A lower bound remains inclusive when the upper bound is absent.");
  const bRows = await fetchEntries(b.client, b.id, null, null, new AbortController().signal);
  assert.deepEqual(bRows.map((entry) => [entry.id, entry.amountCents]), [[bRow.id, 733]], "All-dates retrieval stays private to the current user.");
  assert.deepEqual(await fetchEntries(b.client, a.id, null, null, new AbortController().signal), [], "Another user's history remains inaccessible through the gateway.");
  const adminRows = await fetchEntries(admin, b.id, null, null, new AbortController().signal);
  assert.deepEqual(adminRows.map((entry) => entry.id), [bRow.id], "The gateway applies its explicit owner filter even when the database client bypasses RLS.");
  assert.equal((await a.client.from("entries").update({ amount_cents: 1025 }).eq("id", row.id)).error, null);
  assert.equal((await a.client.from("entries").select("amount_cents").eq("id", row.id).single()).data.amount_cents, 1025);
  assert.equal((await a.client.from("entries").delete().eq("id", row.id)).error, null);
  assert.deepEqual((await a.client.from("entries").select("*").eq("id", row.id)).data, []);
  await a.client.auth.signOut();
  assert.ok((await a.client.from("entries").select("*")).error, "Signout removes authenticated access.");
  console.log("PASS. Local auth, ledger CRUD, category creation/rename/removal/restore, private defaults, fixed types, RLS/FK isolation, atomic batches, retry safety, descending date and input order, 1,007-row month pagination and 1,008-row private all-dates history.");
} finally {
  for (const id of users) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
}
