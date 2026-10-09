import assert from "node:assert/strict";
import test from "node:test";
import {
  categoryBreakdown,
  entriesCSV,
  filterEntries,
  monthlySummary,
  paginateEntries,
  parseDate,
  parseDraft,
  parseMoney,
  parseCategoryLabel,
  parseTSV,
  shiftMonth,
  summarize,
  validateAmountCents,
  type Category,
  type Entry,
  type EntryKind,
} from "./finance";

const categories: Category[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    label: "Salary",
    kind: "income",
    color: "#245443",
    sortOrder: 1,
    archived: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    label: "Groceries",
    kind: "expense",
    color: "#abc123",
    sortOrder: 2,
    archived: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    label: "Brokerage",
    kind: "investment",
    color: "#aaaaaa",
    sortOrder: 3,
    archived: false,
  },
];
const id = "00000000-0000-4000-8000-000000000010";
const entry = (
  category: Category,
  amountCents: number,
  date = "2026-10-06",
  description = "",
): Entry => ({ id, date, amountCents, description, category });

test("USD input preserves decimal cents exactly and rejects rounding or coercion", () => {
  for (const kind of ["income", "expense", "investment"] as EntryKind[]) {
    assert.equal(parseMoney(" 10.29 ", kind), 1029);
    assert.equal(parseMoney("0.01", kind), 1);
    assert.equal(parseMoney("999999999.99", kind), 99_999_999_999);
  }
  assert.equal(parseMoney(" -12.30 ", "expense"), -1230);
  assert.equal(parseMoney("-0.01", "expense"), -1);
  assert.equal(parseMoney("-999999999.99", "expense"), -99_999_999_999);
  for (const kind of ["income", "investment"] as const)
    assert.throws(() => parseMoney("-0.01", kind), /must be positive/);
  for (const value of [
    "0",
    "0.00",
    "-0",
    "-0.00",
    "12.345",
    "-12.345",
    "1e2",
    "1,000.00",
    "Infinity",
    "1000000000",
    "-1000000000",
    "",
    ".5",
    "-.5",
    "+12.30",
    "--12.30",
  ])
    assert.throws(() => parseMoney(value, "expense"));
  for (const value of [NaN, Infinity, 0, -0, 1.5, 100_000_000_000, -100_000_000_000])
    assert.throws(() => validateAmountCents(value, "expense"));
});

test("calendar dates reject rollover and respect leap years and bounds", () => {
  assert.equal(parseDate("2024-02-29"), "2024-02-29");
  assert.equal(parseDate("2100-12-31"), "2100-12-31");
  for (const value of [
    "2023-02-29",
    "2026-04-31",
    "2026-00-01",
    "2026-13-01",
    "1899-12-31",
    "2101-01-01",
    "2026-1-01",
  ])
    assert.throws(() => parseDate(value));
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-10", 5), "2027-03");
});

test("manual entries infer type from a real category and trim description", () => {
  assert.deepEqual(
    parseDraft(
      {
        id,
        date: "2026-10-06",
        amount: "12.3",
        categoryId: categories[2].id,
        description: "  Transfer  ",
      },
      categories,
    ),
    {
      id,
      date: "2026-10-06",
      amountCents: 1230,
      categoryId: categories[2].id,
      description: "Transfer",
    },
  );
  assert.throws(
    () =>
      parseDraft(
        {
          id,
          date: "2026-10-06",
          amount: "12",
          categoryId: "unknown",
          description: "",
        },
        categories,
      ),
    /Choose a category/,
  );
  assert.throws(
    () =>
      parseDraft(
        {
          id,
          date: "2026-10-06",
          amount: "12",
          categoryId: categories[0].id,
          description: "x".repeat(241),
        },
        categories,
      ),
    /240 characters/,
  );
  const refundDraft = {
    id, date: "2026-10-06", amount: "-12.30",
    categoryId: categories[1].id, description: " Refund ",
  };
  assert.deepEqual(parseDraft(refundDraft, categories), {
    id, date: "2026-10-06", amountCents: -1230,
    categoryId: categories[1].id, description: "Refund",
  });
  for (const category of [categories[0], categories[2]])
    assert.throws(
      () => parseDraft({ ...refundDraft, categoryId: category.id }, categories),
      /must be positive/,
    );
});

test("TSV stages valid rows and names invalid spreadsheet rows without partial saving", () => {
  const rows = parseTSV(
    "Date\tCategory\tAmount\tDescription\r\n2026-10-06\tgroceries\t12.30\t Shop \r\n2026-02-30\tSalary\t25\tInvalid date\r\n2026-10-06\tMystery\t4\t\r\n2026-10-06\tBrokerage\t8.555\t\r\n2026-10-06\tGroceries\t-12.30\tRefund\r\n2026-10-06\tSalary\t-1\r\n2026-10-06\tBrokerage\t-1\r\n",
    categories,
    () => id,
  );
  assert.equal(rows.length, 7);
  assert.deepEqual(rows[0], {
    line: 2,
    entry: {
      id,
      date: "2026-10-06",
      categoryId: categories[1].id,
      amountCents: 1230,
      description: "Shop",
    },
  });
  assert.match(rows[1].error ?? "", /real calendar date/);
  assert.match(rows[2].error ?? "", /Unknown category/);
  assert.match(rows[3].error ?? "", /two decimal places/);
  assert.equal(rows[4].entry?.amountCents, -1230);
  assert.match(rows[5].error ?? "", /must be positive/);
  assert.match(rows[6].error ?? "", /must be positive/);
});

test("removed categories reject new entries and imports while existing edits can retain them", () => {
  const removed = { ...categories[1], archived: true };
  const available = [categories[0], removed];
  const draft = {
    id,
    date: "2026-10-06",
    amount: "12.30",
    categoryId: removed.id,
    description: "Updated details",
  };
  assert.throws(() => parseDraft(draft, available), /removed/);
  assert.equal(parseDraft(draft, available, removed.id).categoryId, removed.id);
  assert.equal(parseDraft({ ...draft, amount: "-12.30" }, available, removed.id).amountCents, -1230);
  const removedIncome = { ...categories[0], archived: true };
  assert.throws(
    () => parseDraft({ ...draft, amount: "-1", categoryId: removedIncome.id }, [removedIncome], removedIncome.id),
    /must be positive/,
  );
  assert.throws(
    () => parseDraft(draft, available, categories[0].id),
    /removed/,
  );
  assert.match(
    parseTSV("2026-10-06\tGroceries\t12.30", available, () => id)[0].error ??
      "",
    /Unknown category/,
  );
  assert.equal(summarize([entry(removed, 1230)]).expense, 1230);
  assert.equal(
    categoryBreakdown([entry(removed, 1230)], "expense")[0].name,
    removed.label,
  );
});

test("category names trim whitespace and enforce the shared length bounds", () => {
  assert.equal(parseCategoryLabel("  Weekend travel  "), "Weekend travel");
  assert.equal(parseCategoryLabel("x".repeat(60)), "x".repeat(60));
  assert.throws(() => parseCategoryLabel("   "), /1 and 60/);
  assert.throws(() => parseCategoryLabel("x".repeat(61)), /1 and 60/);
});

test("monthly summaries support one month and calendar YTD, exclusions, and negative net cash", () => {
  const entries = [
    entry(categories[0], 10001),
    entry(categories[1], 7001),
    entry(categories[2], 4000),
  ];
  assert.deepEqual(summarize(entries), {
    income: 10001, expense: 7001, investment: 4000, remaining: -1000,
  });
  const rows = monthlySummary([
    ...entries,
    entry(categories[0], 3333, "2026-05-01"),
    entry(categories[0], 9900, "2026-04-30"),
    entry(categories[0], 8800, "2025-12-31"),
    entry(categories[0], 7700, "2026-11-01"),
  ], "2026-10");
  assert.deepEqual(rows.map((row) => row.month), [
    "2026-01", "2026-02", "2026-03", "2026-04", "2026-05",
    "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
  ]);
  assert.deepEqual(rows[0], {
    month: "2026-01", income: 0, expense: 0, investment: 0,
    remaining: 0, expenseExcludingHousingUtilities: 0,
  });
  assert.equal(rows[3].income, 9900);
  assert.equal(rows[4].income, 3333);
  assert.deepEqual(rows[9], {
    month: "2026-10", income: 10001, expense: 7001, investment: 4000,
    remaining: -1000, expenseExcludingHousingUtilities: 7001,
  });
  assert.equal(rows.reduce((sum, row) => sum + row.income, 0), 23234);
  const housing = { ...categories[1], label: "Housing", archived: true };
  const utilities = { ...categories[1], label: " utilities " };
  const combined = { ...categories[1], label: "Housing & Utilities" };
  const combinedWords = { ...categories[1], label: "Housing and Utilities" };
  const housingRepairs = { ...categories[1], label: "Housing repairs" };
  const june = monthlySummary([
    entry(housing, 200000, "2026-05-01"),
    entry(utilities, 15999, "2026-05-02"),
    entry(combined, 30100, "2026-05-03"),
    entry(combinedWords, 40100, "2026-05-04"),
    entry(housingRepairs, 5075, "2026-05-05"),
    entry(categories[1], 7001, "2026-05-06"),
    entry({ ...housing, kind: "income" }, 100000, "2026-05-07"),
    entry(categories[2], 4000, "2026-05-08"),
    entry(categories[1], 999, "2026-06-01"),
    entry(categories[1], 888, "2025-07-31"),
  ], "2026-06", "ytd");
  assert.deepEqual(june[4], {
    month: "2026-05", income: 100000, expense: 298275, investment: 4000,
    remaining: -202275, expenseExcludingHousingUtilities: 12076,
  });
  assert.equal(june[5].expenseExcludingHousingUtilities, 999);
  assert.equal(june[0].expenseExcludingHousingUtilities, 0);
  assert.deepEqual(monthlySummary(entries, "2026-10", 1), [rows[9]]);
  const january = monthlySummary([
    entry(categories[1], 1234, "2026-01-01"),
    entry(categories[1], 5678, "2025-12-31"),
  ], "2026-01", "ytd");
  assert.deepEqual(january, [{
    month: "2026-01", income: 0, expense: 1234, investment: 0,
    remaining: -1234, expenseExcludingHousingUtilities: 1234,
  }]);
  const december = monthlySummary(entries, "2026-12", "ytd");
  assert.equal(december.length, 12);
  assert.equal(december[0].month, "2026-01");
  assert.equal(december[11].month, "2026-12");
  assert.deepEqual(december[9], rows[9]);
  assert.deepEqual(
    categoryBreakdown([...entries, entry(categories[1], 999)], "expense"),
    [
      {
        id: categories[1].id,
        name: "Groceries",
        color: "#abc123",
        value: 8000,
      },
    ],
  );
});

test("refunds reduce expenses in their recorded month and preserve zero and negative category nets", () => {
  const shopping = { ...categories[1], id: "00000000-0000-4000-8000-000000000004", label: "Shopping" };
  const refund = entry(categories[1], -1230, "2026-10-06", "Refund");
  const entries = [
    entry(categories[1], 1230, "2026-09-30"),
    refund,
    entry(shopping, 2000),
    entry(shopping, -2000),
  ];
  assert.deepEqual(summarize([refund]), {
    income: 0, expense: -1230, investment: 0, remaining: 1230,
  });
  const rows = monthlySummary(entries, "2026-10");
  assert.equal(rows[8].expense, 1230);
  assert.deepEqual(rows[9], {
    month: "2026-10", income: 0, expense: -1230, investment: 0,
    remaining: 1230, expenseExcludingHousingUtilities: -1230,
  });
  assert.equal(summarize(entries).expense, 0);
  assert.deepEqual(
    categoryBreakdown(entries.filter((entry) => entry.date.startsWith("2026-10")), "expense"),
    [
      { id: shopping.id, name: "Shopping", color: shopping.color, value: 0 },
      { id: categories[1].id, name: "Groceries", color: categories[1].color, value: -1230 },
    ],
  );
});

test("transaction filters include all history and compose month/type/search while preserving date and input order", () => {
  const history = entry({ ...categories[1], archived: true }, 1230, "2024-09-01", "Historic market");
  const salary = entry(categories[0], 620000, "2026-10-01", "Salary");
  const groceries = { ...entry(categories[1], 259200, "2026-10-06", "October groceries"), id: "009" };
  const refund = { ...entry(categories[0], 10000, "2026-10-06", "Refund"), id: "001" };
  const future = entry(categories[2], 100000, "2026-11-01", "Brokerage");
  const input = [future, refund, groceries, salary, history];
  assert.deepEqual(filterEntries(input, { month: null, kind: "all", search: "" }), [future, refund, groceries, salary, history]);
  assert.deepEqual(filterEntries(input, { month: "2026-10", kind: "all", search: "" }), [refund, groceries, salary]);
  assert.deepEqual(filterEntries(input, { month: null, kind: "expense", search: "" }), [groceries, history]);
  assert.deepEqual(filterEntries(input, { month: "2026-10", kind: "income", search: "salary" }), [refund, salary]);
  for (const search of [" HISTORIC ", "2024-09", "12.30"])
    assert.deepEqual(filterEntries(input, { month: null, kind: "all", search }), [history]);
  assert.deepEqual(filterEntries(input, { month: null, kind: "expense", search: "groceries" }), [groceries, history]);
  assert.deepEqual(filterEntries(input, { month: "2026-10", kind: "investment", search: "" }), []);
  assert.deepEqual(input, [future, refund, groceries, salary, history]);
});

test("transaction pages show 25 rows, clamp after removals, and leave full results available for totals and CSV", () => {
  const entries = Array.from({ length: 51 }, (_, index) => ({
    ...entry(categories[0], 100, "2026-10-06"), id: String(index).padStart(3, "0"),
  }));
  const filtered = filterEntries(entries, { month: null, kind: "all", search: "" });
  const first = paginateEntries(filtered, 0);
  assert.deepEqual(first, { entries: filtered.slice(0, 25), page: 0, pageCount: 3, total: 51, start: 1, end: 25 });
  assert.deepEqual(paginateEntries(filtered, 1), { entries: filtered.slice(25, 50), page: 1, pageCount: 3, total: 51, start: 26, end: 50 });
  assert.deepEqual(paginateEntries(filtered, 2), { entries: filtered.slice(50), page: 2, pageCount: 3, total: 51, start: 51, end: 51 });
  assert.deepEqual(paginateEntries(filtered.slice(0, 50), 2), { entries: filtered.slice(25, 50), page: 1, pageCount: 2, total: 50, start: 26, end: 50 });
  assert.deepEqual(paginateEntries([], 2), { entries: [], page: 0, pageCount: 1, total: 0, start: 0, end: 0 });
  assert.equal(summarize(filtered).income, 5100);
  assert.equal(entriesCSV(filtered).split("\r\n").length, 52);
  assert.equal(filtered.length, 51);
});

test("CSV escapes quotes and spreadsheet formulas while keeping signed amounts numeric", () => {
  assert.equal(
    entriesCSV([
      entry(categories[1], 1230, "2026-10-06", '=HYPERLINK("unsafe")'),
    ]),
    'Date,Type,Category,Amount (USD),Description\r\n"2026-10-06","expense","Groceries","12.30","\'=HYPERLINK(""unsafe"")"',
  );
  assert.equal(
    entriesCSV([entry({ ...categories[1], label: "-Special" }, -1230, "2026-10-06", "-Refund")]),
    'Date,Type,Category,Amount (USD),Description\r\n"2026-10-06","expense","\'-Special","-12.30","\'-Refund"',
  );
});
