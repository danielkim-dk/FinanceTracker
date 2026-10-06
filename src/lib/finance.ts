import { z } from "zod";

export const kindSchema = z.enum(["income", "expense", "investment"]);
export type EntryKind = z.infer<typeof kindSchema>;
export type Category = {
  id: string;
  label: string;
  kind: EntryKind;
  color: string;
  sortOrder: number;
  archived: boolean;
};
export type Entry = {
  id: string;
  date: string;
  amountCents: number;
  description: string;
  category: Category;
};
export type EntryInput = {
  id: string;
  date: string;
  amountCents: number;
  description: string;
  categoryId: string;
};
export type EntryDraft = {
  id: string;
  date: string;
  amount: string;
  description: string;
  categoryId: string;
};
export const kindLabels: Record<EntryKind, string> = {
  income: "Income",
  expense: "Expenses",
  investment: "Investments",
};

export function parseMoney(raw: string): number {
  const value = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error(
      "Enter a positive USD amount with up to two decimal places.",
    );
  }
  const [dollars, decimals = ""] = value.split(".");
  const cents = Number(dollars) * 100 + Number(decimals.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 99_999_999_999) {
    throw new Error("Amount must be between $0.01 and $999,999,999.99.");
  }
  return cents;
}

export function parseDate(raw: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error("Use a calendar date in YYYY-MM-DD format.");
  }
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 ||
    year > 2100 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Enter a real calendar date between 1900 and 2100.");
  }
  return raw;
}

export function parseDraft(
  draft: EntryDraft,
  categories: Category[],
  retainedCategoryId?: string,
): EntryInput {
  const category = categories.find(
    (category) => category.id === draft.categoryId,
  );
  if (!category) {
    throw new Error("Choose a category.");
  }
  if (category.archived && category.id !== retainedCategoryId)
    throw new Error("This category was removed. Choose an active category.");
  const description = draft.description.trim();
  if (description.length > 240)
    throw new Error("Description must be 240 characters or fewer.");
  return {
    id: z.uuid().parse(draft.id),
    date: parseDate(draft.date),
    amountCents: parseMoney(draft.amount),
    description,
    categoryId: draft.categoryId,
  };
}

export function parseCategoryLabel(raw: string): string {
  const label = raw.trim();
  if (!label || label.length > 60)
    throw new Error("Category names must be between 1 and 60 characters.");
  return label;
}

export function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function shiftMonth(month: string, offset: number): string {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string, short = false): string {
  return new Intl.DateTimeFormat("en-US", {
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
}

export function money(cents: number, decimals = true): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(cents / 100);
}

export function summarize(entries: Entry[]) {
  const totals = { income: 0, expense: 0, investment: 0 };
  for (const entry of entries) totals[entry.category.kind] += entry.amountCents;
  return {
    ...totals,
    remaining: totals.income - totals.expense - totals.investment,
  };
}

export function monthlySummary(
  entries: Entry[],
  month: string,
  period: 1 | "ytd" = "ytd",
) {
  const months = period === "ytd" ? Number(month.slice(5, 7)) : 1;
  const excludedCategories = new Set([
    "housing",
    "utilities",
    "housing & utilities",
    "housing and utilities",
  ]);
  return Array.from({ length: months }, (_, index) => {
    const key = shiftMonth(month, index - months + 1);
    const monthlyEntries = entries.filter((entry) => entry.date.startsWith(key));
    const totals = summarize(monthlyEntries);
    const expenseExcludingHousingUtilities = monthlyEntries.reduce(
      (total, entry) =>
        entry.category.kind === "expense" &&
        !excludedCategories.has(entry.category.label.trim().toLowerCase())
          ? total + entry.amountCents
          : total,
      0,
    );
    return { month: key, ...totals, expenseExcludingHousingUtilities };
  });
}

export function filterEntries(
  entries: Entry[],
  filters: { month: string | null; kind: EntryKind | "all"; search: string },
) {
  const search = filters.search.trim().toLowerCase();
  return entries
    .filter(
      (entry) =>
        (!filters.month || entry.date.startsWith(filters.month)) &&
        (filters.kind === "all" || entry.category.kind === filters.kind) &&
        `${entry.description} ${entry.category.label} ${entry.date} ${money(entry.amountCents)}`
          .toLowerCase()
          .includes(search),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export function paginateEntries(entries: Entry[], requestedPage: number) {
  const pageSize = 25;
  const total = entries.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(0, Math.min(requestedPage, pageCount - 1));
  const offset = page * pageSize;
  return {
    entries: entries.slice(offset, offset + pageSize),
    page,
    pageCount,
    total,
    start: total ? offset + 1 : 0,
    end: Math.min(offset + pageSize, total),
  };
}

export function categoryBreakdown(entries: Entry[], kind: EntryKind) {
  const values = new Map<
    string,
    { id: string; name: string; color: string; value: number }
  >();
  for (const entry of entries) {
    if (entry.category.kind !== kind) continue;
    const { id, label: name, color } = entry.category;
    const current = values.get(id);
    if (current) current.value += entry.amountCents;
    else values.set(id, { id, name, color, value: entry.amountCents });
  }
  return [...values.values()].sort(
    (a, b) => b.value - a.value || a.name.localeCompare(b.name),
  );
}

export type PastedRow = { line: number } & (
  | { entry: EntryInput; error?: never }
  | { error: string; entry?: never }
);

export function parseTSV(
  text: string,
  categories: Category[],
  makeId: () => string = () => crypto.randomUUID(),
): PastedRow[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return lines.flatMap<PastedRow>((line, index) => {
    if (!line.trim()) return [];
    const columns = line.split("\t");
    if (index === 0 && columns[0].trim().toLowerCase() === "date") return [];
    try {
      if (columns.length < 3 || columns.length > 4)
        throw new Error(
          "Expected Date, Category, Amount, and optional Description, separated by tabs.",
        );
      const [date, categoryLabel, amount, description = ""] = columns;
      const category = categories.find(
        (item) =>
          !item.archived &&
          item.label.toLowerCase() === categoryLabel.trim().toLowerCase(),
      );
      if (!category)
        throw new Error(
          `Unknown category “${categoryLabel.trim()}”. Use a category listed in Penny.`,
        );
      const entry = parseDraft(
        {
          id: makeId(),
          date: date.trim(),
          amount,
          description,
          categoryId: category.id,
        },
        categories,
      );
      return [{ line: index + 1, entry }];
    } catch (error) {
      return [
        {
          line: index + 1,
          error: error instanceof Error ? error.message : "Invalid row.",
        },
      ];
    }
  });
}

export function entriesCSV(entries: Entry[]): string {
  const quote = (value: string) => {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const rows = entries.map((entry) =>
    [
      entry.date,
      entry.category.kind,
      entry.category.label,
      (entry.amountCents / 100).toFixed(2),
      entry.description,
    ]
      .map(quote)
      .join(","),
  );
  return ["Date,Type,Category,Amount (USD),Description", ...rows].join("\r\n");
}
