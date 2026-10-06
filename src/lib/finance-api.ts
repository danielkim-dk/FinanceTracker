import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  kindSchema,
  parseDate,
  parseCategoryLabel,
  type Category,
  type Entry,
  type EntryInput,
  type EntryKind,
} from "./finance";

let browserClient: SupabaseClient | null = null;

export function createBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  browserClient ??= createClient(url, key);
  return browserClient;
}

const categoryRow = z.object({
  id: z.uuid(),
  label: z.string(),
  kind: kindSchema,
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  sort_order: z.number().int(),
  archived: z.boolean(),
});
const entryRow = z.object({
  id: z.uuid(),
  occurred_on: z.string().transform(parseDate),
  amount_cents: z.number().int().positive().max(99_999_999_999),
  description: z.string().max(240),
  category: categoryRow,
});

function decodeCategory(raw: z.infer<typeof categoryRow>): Category {
  return {
    id: raw.id,
    label: raw.label,
    kind: raw.kind,
    color: raw.color,
    sortOrder: raw.sort_order,
    archived: raw.archived,
  };
}

function decodeEntry(raw: unknown): Entry {
  const row = entryRow.parse(raw);
  return {
    id: row.id,
    date: row.occurred_on,
    amountCents: row.amount_cents,
    description: row.description,
    category: decodeCategory(row.category),
  };
}

export async function fetchCategories(
  client: SupabaseClient,
  uid: string,
  signal: AbortSignal,
): Promise<Category[]> {
  const categories: Category[] = [];
  const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await client
      .from("categories")
      .select("*")
      .eq("user_id", uid)
      .order("sort_order")
      .order("id")
      .range(start, start + pageSize - 1)
      .abortSignal(signal);
    if (error) throw new Error(error.message);
    const rows = z.array(categoryRow).parse(data ?? []);
    categories.push(...rows.map(decodeCategory));
    if (rows.length < pageSize) return categories;
  }
}

function categoryError(error: { code?: string; message: string }): Error {
  return new Error(
    error.code === "23505"
      ? "That category name already exists, including removed categories. Restore or rename the existing category."
      : error.message,
  );
}

export async function createCategory(
  client: SupabaseClient,
  uid: string,
  input: { id: string; label: string; kind: EntryKind },
): Promise<void> {
  const payload = {
    id: z.uuid().parse(input.id),
    user_id: uid,
    label: parseCategoryLabel(input.label),
    kind: kindSchema.parse(input.kind),
  };
  await assertUser(client, uid);
  const { error } = await client.from("categories").insert(payload);
  if (!error) return;
  // A lost response can follow a committed insert. Retry the same ID safely.
  await assertUser(client, uid);
  const { data, error: readError } = await client
    .from("categories")
    .select("id, user_id, label, kind, archived")
    .eq("user_id", uid)
    .eq("id", payload.id);
  if (!readError && data?.length === 1) {
    const existing = data[0];
    if (
      existing.user_id === uid &&
      existing.label === payload.label &&
      existing.kind === payload.kind &&
      !existing.archived
    )
      return;
    throw new Error(
      "This category ID already exists with different details. Review your categories before trying again.",
    );
  }
  throw categoryError(error);
}

async function updateCategory(
  client: SupabaseClient,
  uid: string,
  id: string,
  change: { label: string } | { archived: boolean },
): Promise<void> {
  await assertUser(client, uid);
  const { data, error } = await client
    .from("categories")
    .update(change)
    .eq("user_id", uid)
    .eq("id", id)
    .select("id");
  if (error) throw categoryError(error);
  if (data?.length !== 1)
    throw new Error(
      "This category is no longer available. Refresh your categories.",
    );
}

export async function renameCategory(
  client: SupabaseClient,
  uid: string,
  id: string,
  label: string,
): Promise<void> {
  await updateCategory(client, uid, id, { label: parseCategoryLabel(label) });
}

export async function setCategoryArchived(
  client: SupabaseClient,
  uid: string,
  id: string,
  archived: boolean,
): Promise<void> {
  await updateCategory(client, uid, id, { archived });
}

export async function fetchEntries(
  client: SupabaseClient,
  uid: string,
  from: string | null,
  until: string | null,
  signal: AbortSignal,
): Promise<Entry[]> {
  const entries: Entry[] = [];
  const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    let query = client
      .from("entries")
      .select("*, category:categories(*)")
      .eq("user_id", uid);
    if (from !== null) query = query.gte("occurred_on", from);
    if (until !== null) query = query.lt("occurred_on", until);
    const { data, error } = await query
      .order("occurred_on", { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + pageSize - 1)
      .abortSignal(signal);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    entries.push(...rows.map(decodeEntry));
    if (rows.length < pageSize) return entries;
  }
}

async function assertUser(client: SupabaseClient, uid: string) {
  const { data, error } = await client.auth.getSession();
  if (error || data.session?.user.id !== uid)
    throw new Error("Your session changed. Sign in again before saving.");
}

function storagePayload(entry: EntryInput, uid: string) {
  return {
    id: entry.id,
    user_id: uid,
    occurred_on: entry.date,
    category_id: entry.categoryId,
    amount_cents: entry.amountCents,
    description: entry.description,
  };
}

export async function insertEntries(
  client: SupabaseClient,
  uid: string,
  entries: EntryInput[],
): Promise<void> {
  await assertUser(client, uid);
  const payload = entries.map((entry) => storagePayload(entry, uid));
  const { error } = await client.from("entries").insert(payload);
  if (!error) return;
  await assertUser(client, uid);
  const existing: ReturnType<typeof storagePayload>[] = [];
  for (let start = 0; start < payload.length; start += 100) {
    const { data, error: readError } = await client
      .from("entries")
      .select(
        "id, user_id, occurred_on, category_id, amount_cents, description",
      )
      .eq("user_id", uid)
      .in(
        "id",
        payload.slice(start, start + 100).map((entry) => entry.id),
      );
    if (readError) throw new Error(error.message);
    existing.push(...(data ?? []));
  }
  if (
    existing.length === payload.length &&
    payload.every((entry) =>
      existing.some(
        (row) =>
          row.id === entry.id &&
          row.user_id === uid &&
          row.occurred_on === entry.occurred_on &&
          row.category_id === entry.category_id &&
          row.amount_cents === entry.amount_cents &&
          row.description === entry.description,
      ),
    )
  )
    return;
  if (existing.length)
    throw new Error(
      "These entry IDs already exist with different details. Refresh and review them before trying again. No existing entries were overwritten.",
    );
  throw new Error(error.message);
}

export async function updateEntry(
  client: SupabaseClient,
  uid: string,
  entry: EntryInput,
): Promise<void> {
  await assertUser(client, uid);
  const { data, error } = await client
    .from("entries")
    .update(storagePayload(entry, uid))
    .eq("user_id", uid)
    .eq("id", entry.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (data?.length !== 1)
    throw new Error(
      "This entry is no longer available. Refresh to see current entries.",
    );
}

export async function deleteEntry(
  client: SupabaseClient,
  uid: string,
  id: string,
): Promise<void> {
  await assertUser(client, uid);
  const { error } = await client
    .from("entries")
    .delete()
    .eq("user_id", uid)
    .eq("id", id);
  if (error) throw new Error(error.message);
}
