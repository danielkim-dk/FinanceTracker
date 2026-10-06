"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Download,
  LayoutDashboard,
  Leaf,
  LoaderCircle,
  LogOut,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import {
  createBrowserClient,
  createCategory,
  deleteEntry,
  fetchCategories,
  fetchEntries,
  insertEntries,
  renameCategory,
  setCategoryArchived,
  updateEntry,
} from "@/lib/finance-api";
import {
  categoryBreakdown,
  entriesCSV,
  filterEntries,
  kindLabels,
  money,
  monthLabel,
  monthlySummary,
  paginateEntries,
  parseDraft,
  parseCategoryLabel,
  parseTSV,
  shiftMonth,
  summarize,
  today,
  type Category,
  type Entry,
  type EntryDraft,
  type EntryInput,
  type EntryKind,
  type PastedRow,
} from "@/lib/finance";

const kinds: EntryKind[] = ["income", "expense", "investment"];
const summaryPeriods = [
  { value: 1, label: "1 month" },
  { value: "ytd", label: "YTD" },
] as const;
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";

export function FinanceApp() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000 },
          mutations: { retry: false },
        },
      }),
  );
  const [client] = useState(createBrowserClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate client={client} />
      <Toaster theme="light" position="bottom-right" richColors />
    </QueryClientProvider>
  );
}

function Logo() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Leaf size={21} strokeWidth={1.8} />
      </span>
      <span>
        penny<span className="brand-period">.</span>
      </span>
    </div>
  );
}

function AuthGate({ client }: { client: SupabaseClient | null }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const lastUid = useRef<string | null>(null);
  useEffect(() => {
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      const uid = next?.user.id ?? null;
      if (lastUid.current !== uid) {
        queryClient.clear();
        lastUid.current = uid;
      }
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, [client, queryClient]);
  if (!client)
    return (
      <div className="setup-page">
        <Logo />
        <h1>
          A little setup,
          <br />
          then a little clarity.
        </h1>
        <p>
          Start the local Supabase backend and add its public connection details
          to <code>.env.local</code>. Penny will be ready when you restart the
          app.
        </p>
        <p className="muted">
          Run <code>npm run setup:local</code> from this project. Your ledger is
          stored in the local database.
        </p>
      </div>
    );
  if (session === undefined)
    return (
      <div className="boot-state">
        <Logo />
        <LoaderCircle className="spin" />
        <p>Getting your space ready…</p>
      </div>
    );
  return session ? (
    <Workspace key={session.user.id} client={client} session={session} />
  ) : (
    <AuthForm client={client} />
  );
}

function AuthForm({ client }: { client: SupabaseClient }) {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = signup
        ? await client.auth.signUp({ email: email.trim(), password })
        : await client.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
      if (result.error) throw result.error;
      if (signup && !result.data.session)
        setMessage(
          "Account created. Check your email for a confirmation link, then sign in.",
        );
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="auth-shell">
      <section className="auth-story">
        <Logo />
        <div className="auth-story-content">
          <div className="eyebrow">MAKE ROOM FOR WHAT MATTERS</div>
          <h1>
            A little clarity.
            <br />A lot of possibility.
          </h1>
          <p>
            Bring your income, spending, and investments into focus. One entry
            at a time.
          </p>
          <div className="auth-art" aria-hidden="true">
            <div className="art-orbit" />
            <div className="art-card">
              <Leaf size={30} />
              <span>
                Small steps.
                <br />
                <strong>Brighter futures.</strong>
              </span>
              <div className="art-bars">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className="art-stamp">
              <Sparkles size={20} />
              <span>Mindful money</span>
            </div>
          </div>
        </div>
        <span className="auth-footnote">A calmer way to keep track.</span>
      </section>
      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <span className="small-label">YOUR MONEY, YOUR SPACE</span>
          <h2>{signup ? "Start a fresh chapter." : "Welcome back."}</h2>
          <p className="muted">
            {signup
              ? "Create your account and make yourself at home."
              : "Sign in to see the bigger picture."}
          </p>
          <form onSubmit={submit} className="auth-form">
            <label htmlFor="email">Email address</label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
            />
            <label htmlFor="password">Password</label>
            <Input
              id="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              placeholder={
                signup ? "At least 8 characters" : "Enter your password"
              }
              required
              minLength={signup ? 8 : 1}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={pending}
            />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="form-success" role="status">
                {message}
              </p>
            )}
            <Button
              type="submit"
              className="primary-button auth-submit"
              disabled={pending}
            >
              {pending ? (
                <LoaderCircle className="spin" />
              ) : (
                <>
                  {signup ? "Create account" : "Sign in"}
                  <ArrowRight />
                </>
              )}
            </Button>
          </form>
          <div className="auth-switch">
            {signup ? "Already have an account?" : "New to Penny?"}
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setSignup(!signup);
                setError("");
                setMessage("");
              }}
            >
              {signup ? "Sign in" : "Create an account"}
            </button>
          </div>
          <div className="privacy-note">
            <ShieldCheck size={18} />
            <span>Your private ledger is saved in your local database.</span>
          </div>
        </div>
      </section>
    </div>
  );
}

type View = "overview" | "transactions" | "investments";

function Workspace({
  client,
  session,
}: {
  client: SupabaseClient;
  session: Session;
}) {
  const uid = session.user.id;
  const queryClient = useQueryClient();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [view, setView] = useState<View>("overview");
  const [typeFilter, setTypeFilter] = useState<EntryKind | "all">("all");
  const [search, setSearch] = useState("");
  const [dateScope, setDateScope] = useState<"month" | "all">("month");
  const [page, setPage] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [importPending, setImportPending] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const [breakdownKind, setBreakdownKind] = useState<EntryKind>("expense");
  const [sample, setSample] = useState<EntryInput[] | null>(null);
  const quickEntry = useRef<HTMLDivElement>(null);
  const categoriesQuery = useQuery({
    queryKey: ["categories", uid],
    queryFn: ({ signal }) => fetchCategories(client, uid, signal),
    staleTime: Infinity,
  });
  const entriesQuery = useQuery({
    queryKey: ["entries", uid, month, "ytd"],
    queryFn: ({ signal }) =>
      fetchEntries(
        client,
        uid,
        `${month.slice(0, 4)}-01-01`,
        `${shiftMonth(month, 1)}-01`,
        signal,
      ),
  });
  const allEntriesQuery = useQuery({
    queryKey: ["entries", uid, "all"],
    queryFn: ({ signal }) => fetchEntries(client, uid, null, null, signal),
    enabled: dateScope === "all",
  });
  const categories = categoriesQuery.data ?? [];
  const activeCategories = categories.filter((category) => !category.archived);
  const entries = entriesQuery.data ?? [];
  const current = entries.filter((entry) => entry.date.startsWith(month));
  const totals = summarize(current);
  const ledgerQuery = dateScope === "all" ? allEntriesQuery : entriesQuery;
  const ledgerLoading = ledgerQuery.isPending;
  const ledgerFailure = ledgerQuery.error;
  const ledgerSource = ledgerQuery.data ?? [];
  const scopedEntries = dateScope === "all" ? ledgerSource : current;
  const filtered = filterEntries(ledgerSource, {
    month: dateScope === "month" ? month : null,
    kind: view === "investments" ? "investment" : typeFilter,
    search,
  });
  const paginated = paginateEntries(filtered, page);
  const breakdown = categoryBreakdown(current, breakdownKind);
  const breakdownTotal = breakdown.reduce((sum, item) => sum + item.value, 0);
  const loading = categoriesQuery.isPending || entriesQuery.isPending;
  const failure = categoriesQuery.error ?? entriesQuery.error;
  const mutation = useMutation({
    mutationFn: async (
      operation:
        | { type: "create"; entries: EntryInput[] }
        | { type: "edit"; entry: EntryInput }
        | { type: "delete"; id: string },
    ) => {
      if (operation.type === "create")
        await insertEntries(client, uid, operation.entries);
      else if (operation.type === "edit")
        await updateEntry(client, uid, operation.entry);
      else await deleteEntry(client, uid, operation.id);
    },
    onSuccess: async () => {
      if (active.current)
        await queryClient.invalidateQueries({ queryKey: ["entries", uid] });
    },
  });
  const categoryMutation = useMutation({
    mutationFn: async (operation: CategoryOperation) => {
      if (operation.type === "create")
        await createCategory(client, uid, operation.category);
      else if (operation.type === "rename")
        await renameCategory(client, uid, operation.id, operation.label);
      else
        await setCategoryArchived(
          client,
          uid,
          operation.id,
          operation.archived,
        );
    },
    onSuccess: async () => {
      if (active.current) {
        setSample(null);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["categories", uid] }),
          queryClient.invalidateQueries({ queryKey: ["entries", uid] }),
        ]);
      }
    },
  });
  async function save(entries: EntryInput[]) {
    await mutation.mutateAsync({ type: "create", entries });
    if (active.current) {
      setPage(0);
      toast.success(
        entries.length === 1
          ? "Entry saved. A little more clarity."
          : `${entries.length} entries saved.`,
      );
    }
  }
  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error && active.current) toast.error(error.message);
  }
  function navigate(next: View) {
    setView(next);
    setTypeFilter("all");
    setSearch("");
    setPage(0);
  }
  function selectMonth(next: string) {
    setMonth(next);
    setPage(0);
  }
  function focusEntry() {
    quickEntry.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    quickEntry.current
      ?.querySelector<HTMLInputElement>('input[name="description"]')
      ?.focus({ preventScroll: true });
  }
  function exportCSV() {
    const url = URL.createObjectURL(
      new Blob([entriesCSV(filtered)], { type: "text/csv;charset=utf-8;" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `penny-${dateScope === "all" ? "all-dates" : month}${view === "investments" ? "-investments" : ""}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} entries from the current view.`);
  }
  function prepareSample() {
    const next: EntryInput[] = [];
    for (let index = 0; index < 6; index++) {
      const dateMonth = shiftMonth(month, index - 5);
      if (dateMonth < "1900-01") continue;
      for (const [label, kind, amount, day] of [
        ["Salary", "income", 620000 + index * 10000, "01"],
        ["Housing", "expense", 185000, "02"],
        ["Groceries", "expense", 38450 + index * 2400, "05"],
        ["Food & dining", "expense", 21200 + index * 1600, "06"],
        ["Transport", "expense", 9650, "08"],
        ["Brokerage", "investment", 65000, "09"],
        ["Retirement", "investment", 35000, "10"],
        ["Subscriptions", "expense", 4900, "12"],
      ] as const) {
        const category =
          activeCategories.find(
            (item) => item.label === label && item.kind === kind,
          ) ?? activeCategories.find((item) => item.kind === kind);
        if (category)
          next.push({
            id: crypto.randomUUID(),
            date: `${dateMonth}-${day}`,
            amountCents: amount,
            categoryId: category.id,
            description: "Synthetic sample · not real financial data",
          });
      }
    }
    setSample(next);
  }
  const email = session.user.email ?? "Your account";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <div className="sidebar-section-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={view === "overview" ? "nav-item selected" : "nav-item"}
            onClick={() => navigate("overview")}
          >
            <LayoutDashboard size={19} />
            Overview
            <span className="nav-dot" />
          </button>
          <button
            className={
              view === "transactions" ? "nav-item selected" : "nav-item"
            }
            onClick={() => navigate("transactions")}
          >
            <Wallet size={19} />
            Transactions
          </button>
          <button
            className={
              view === "investments" ? "nav-item selected" : "nav-item"
            }
            onClick={() => navigate("investments")}
          >
            <TrendingUp size={19} />
            Investments
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="note-icon">
            <SproutIcon />
          </span>
          <h3>Small steps add up.</h3>
          <p>
            A minute of tracking today.
            <br />
            More clarity for tomorrow.
          </p>
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setAccountOpen(true)}>
            <Settings2 size={19} />
            Account & settings
          </button>
          <button
            className="account-button"
            onClick={() => setAccountOpen(true)}
          >
            <span className="avatar">{email[0].toUpperCase()}</span>
            <span>
              <strong>Your personal space</strong>
              <small>{email}</small>
            </span>
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <strong>
              {view === "overview"
                ? "Overview"
                : view === "transactions"
                  ? "Transactions"
                  : "Investments"}
            </strong>
          </span>
          <span className="local-badge">
            <span />
            Local workspace · USD
          </span>
        </header>
        <div className="page-content">
          <h1 className="sr-only">
            {view === "overview" ? "Overview" : view === "transactions" ? "Transactions" : "Investments"}
          </h1>
          <div className="period-row">
            <div className="month-switcher">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous month"
                disabled={month <= "1900-01"}
                onClick={() => selectMonth(shiftMonth(month, -1))}
              >
                <ChevronLeft />
              </Button>
              <label className="month-label">
                <CalendarDays size={17} />
                <span>{monthLabel(month)}</span>
                <input
                  aria-label="Select month"
                  type="month"
                  min="1900-01"
                  max="2100-12"
                  value={month}
                  onChange={(event) => {
                    if (
                      /^(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(
                        event.target.value,
                      )
                    )
                      selectMonth(event.target.value);
                  }}
                />
              </label>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next month"
                disabled={month >= "2100-12"}
                onClick={() => selectMonth(shiftMonth(month, 1))}
              >
                <ChevronRight />
              </Button>
            </div>
            <span className="period-note">
              {entriesQuery.isFetching && !loading
                ? "Updating your entries…"
                : "Your month in focus"}
            </span>
          </div>
          {failure && (
            <div className="error-panel" role="alert">
              <h2>
                {categoriesQuery.error
                  ? "We couldn’t load your workspace categories."
                  : "We couldn’t load your monthly totals."}
              </h2>
              <p>{errorMessage(failure)}</p>
              <Button
                variant="outline"
                onClick={() => {
                  void categoriesQuery.refetch();
                  void entriesQuery.refetch();
                }}
              >
                Try again
              </Button>
            </div>
          )}
          {loading && (
            <div className="workspace-loading" role="status">
              <LoaderCircle className="spin" />
              <p>
                {categoriesQuery.isPending
                  ? "Getting your workspace ready…"
                  : "Loading your monthly totals…"}
              </p>
            </div>
          )}
          <div hidden={categoriesQuery.isPending || !!categoriesQuery.error}>
            <div hidden={entriesQuery.isPending || !!entriesQuery.error}>
              <section className="summary-grid" aria-label="Monthly summary">
                <SummaryCard
                  label="Income"
                  value={totals.income}
                  note="Everything coming in"
                  kind="income"
                  icon={<ArrowDownLeft size={19} />}
                />
                <SummaryCard
                  label="Expenses"
                  value={totals.expense}
                  note="Your everyday spending"
                  kind="expense"
                  icon={<ArrowUpRight size={19} />}
                />
                <SummaryCard
                  label="Investments"
                  value={totals.investment}
                  note="Contributions to your future"
                  kind="investment"
                  icon={<TrendingUp size={19} />}
                />
                <SummaryCard
                  label="Remaining cash"
                  value={totals.remaining}
                  note="Income − expenses − investments"
                  kind="remaining"
                  icon={<Wallet size={19} />}
                />
              </section>
              {view === "overview" && (
                <section className="charts-grid">
                  <Card className="chart-panel cashflow-panel">
                    <Tabs defaultValue="ytd" className="monthly-summary-tabs">
                      <TabsList aria-label="Table period" className="monthly-period-tabs">
                        {summaryPeriods.map((period) => (
                          <TabsTrigger key={period.value} value={period.value}>
                            {period.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      {summaryPeriods.map((period) => (
                        <TabsContent key={period.value} value={period.value}>
                          <div
                            className="monthly-summary-wrap"
                            tabIndex={0}
                            role="region"
                            aria-label="Monthly totals, scroll horizontally for all columns"
                          >
                            <table className="monthly-summary-table">
                              <caption className="sr-only">
                                Income, investments, expenses, expenses excluding
                                housing and utilities, and net cash for{" "}
                                {period.value === "ytd" ? "year to date" : "1 month"}, ending{" "}
                                {monthLabel(month)}
                              </caption>
                              <colgroup>
                                <col className="monthly-month-column" />
                                <col span={5} className="monthly-amount-column" />
                              </colgroup>
                              <thead>
                                <tr>
                                  <th scope="col">Month</th>
                                  <th scope="col">Income</th>
                                  <th scope="col">Investment</th>
                                  <th scope="col">Expense</th>
                                  <th scope="col"><abbr title="Expenses less housing and utilities">ELH</abbr></th>
                                  <th scope="col">Net</th>
                                </tr>
                              </thead>
                              <tbody>
                                {monthlySummary(entries, month, period.value).map((row) => (
                                  <tr key={row.month} aria-current={row.month === month ? "date" : undefined}>
                                    <th scope="row">{monthLabel(row.month)}</th>
                                    <td>{money(row.income)}</td>
                                    <td>{money(row.investment)}</td>
                                    <td>{money(row.expense)}</td>
                                    <td>{money(row.expenseExcludingHousingUtilities)}</td>
                                    <td className="monthly-net">{money(row.remaining)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </TabsContent>
                      ))}
                    </Tabs>
                    <p className="monthly-summary-note">
                      ELH = expenses less housing &amp; utilities. Excludes categories
                      named Housing, Utilities, or Housing &amp; Utilities.
                      <br />
                      Net = income − expense − investment.
                    </p>
                  </Card>
                  <Card className="chart-panel category-panel" aria-label="Category breakdown">
                    <div className="breakdown-controls">
                      <select
                        className="compact-select"
                        aria-label="Breakdown type"
                        value={breakdownKind}
                        onChange={(event) =>
                          setBreakdownKind(event.target.value as EntryKind)
                        }
                      >
                        {kinds.map((kind) => (
                          <option key={kind} value={kind}>
                            {kindLabels[kind]}
                          </option>
                        ))}
                      </select>
                    </div>
                    {breakdown.length ? (
                      <>
                        <div className="donut-wrap">
                          <div className="donut-center">
                            <span>{kindLabels[breakdownKind]}</span>
                            <strong>{money(breakdownTotal, false)}</strong>
                          </div>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={breakdown}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={65}
                                outerRadius={83}
                                paddingAngle={3}
                                stroke="none"
                              >
                                {breakdown.map((item) => (
                                  <Cell key={item.id} fill={item.color} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="category-legend">
                          {breakdown.map((item) => (
                            <div key={item.id}>
                              <span>
                                <i style={{ background: item.color }} />
                                {item.name}
                              </span>
                              <strong>
                                {Math.round((item.value / breakdownTotal) * 100)}%
                                <small>{money(item.value)}</small>
                              </strong>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="chart-empty">
                        <Leaf size={29} />
                        <h3>A fresh start.</h3>
                        <p>
                          Your {kindLabels[breakdownKind].toLowerCase()} will
                          appear here as you add entries.
                        </p>
                      </div>
                    )}
                  </Card>
                </section>
              )}
            </div>
            <section className="ledger-section">
              <div className="section-heading">
                <div>
                  <h2>
                    {view === "investments"
                      ? "Your contributions"
                      : "Your transactions"}
                    <span className="count-badge">
                      {ledgerLoading || ledgerFailure ? "—" : filtered.length}
                    </span>
                  </h2>
                  <p>A place for every penny. Add, edit, and keep moving.</p>
                </div>
                <div className="section-actions">
                  <Button variant="outline" onClick={() => setImportOpen(true)}>
                    <ClipboardPaste />
                    Paste rows
                  </Button>
                  <Button
                    variant="outline"
                    disabled={ledgerLoading || !!ledgerFailure || !filtered.length}
                    onClick={exportCSV}
                  >
                    <Download />
                    Export CSV
                  </Button>
                </div>
              </div>
              <div ref={quickEntry}>
                <QuickEntry
                  categories={categories}
                  month={month}
                  defaultKind={
                    view === "investments" ? "investment" : "expense"
                  }
                  save={save}
                  openSettings={() => setAccountOpen(true)}
                />
              </div>
              <div className="ledger-toolbar">
                <div className="filter-tabs" aria-label="Filter transactions">
                  {view !== "investments" &&
                    (["all", ...kinds] as const).map((kind) => (
                      <button
                        key={kind}
                        className={typeFilter === kind ? "active" : ""}
                        onClick={() => {
                          setTypeFilter(kind);
                          setPage(0);
                        }}
                      >
                        {kind === "all" ? "All types" : kindLabels[kind]}
                      </button>
                    ))}
                </div>
                <select
                  className="ledger-date-scope"
                  aria-label="Transaction date range"
                  value={dateScope}
                  onChange={(event) => {
                    setDateScope(event.target.value === "all" ? "all" : "month");
                    setPage(0);
                  }}
                >
                  <option value="month">Selected month · {monthLabel(month)}</option>
                  <option value="all">All dates</option>
                </select>
                <label className="search-field">
                  <Search size={16} />
                  <Input
                    aria-label="Search entries"
                    placeholder="Search your entries…"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(0);
                    }}
                  />
                </label>
              </div>
              {ledgerLoading && (
                <div className="ledger-loading" role="status">
                  <LoaderCircle className="spin" size={18} />
                  Loading your transaction history…
                </div>
              )}
              {ledgerFailure && (
                <div className="error-panel" role="alert">
                  <h3>We couldn’t load your transaction history.</h3>
                  <p>{errorMessage(ledgerFailure)}</p>
                  <Button variant="outline" onClick={() => void ledgerQuery.refetch()}>
                    Try again
                  </Button>
                </div>
              )}
              <div hidden={ledgerLoading || !!ledgerFailure}>
                <div className="table-wrap">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Category</th>
                        <th>Type</th>
                        <th className="amount-cell">Amount</th>
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.entries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="date-cell">
                            {new Intl.DateTimeFormat("en-US", {
                              month: "short",
                              day: "numeric",
                              ...(dateScope === "all" ? { year: "numeric" as const } : {}),
                              timeZone: "UTC",
                            }).format(new Date(`${entry.date}T12:00:00Z`))}
                          </td>
                          <td className="description-cell">
                            <span
                              className={`transaction-icon ${entry.category.kind}`}
                            >
                              {entry.category.kind === "income" ? (
                                <ArrowDownLeft size={15} />
                              ) : entry.category.kind === "investment" ? (
                                <TrendingUp size={15} />
                              ) : (
                                <ArrowUpRight size={15} />
                              )}
                            </span>
                            <span>
                              {entry.description || entry.category.label}
                            </span>
                          </td>
                          <td>
                            <span className="category-label">
                              <i style={{ background: entry.category.color }} />
                              {entry.category.label}
                            </span>
                          </td>
                          <td>
                            <span className={`type-badge ${entry.category.kind}`}>
                              {entry.category.kind === "expense"
                                ? "Expense"
                                : entry.category.kind === "investment"
                                  ? "Investment"
                                  : "Income"}
                            </span>
                          </td>
                          <td
                            className={`amount-cell ${entry.category.kind === "income" ? "positive" : ""}`}
                          >
                            {entry.category.kind === "income" ? "+" : "−"}
                            {money(entry.amountCents)}
                          </td>
                          <td>
                            <div className="row-actions">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Edit ${entry.description || entry.category.label}`}
                                onClick={() => setEditing(entry)}
                              >
                                <Pencil size={14} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Delete ${entry.description || entry.category.label}`}
                                onClick={() => {
                                  mutation.reset();
                                  setDeleting(entry);
                                }}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!filtered.length && (
                    <div className="ledger-empty">
                      <span className="empty-icon">
                        <Wallet size={25} />
                      </span>
                      <h3>
                        {scopedEntries.length
                          ? "No entries match this view."
                          : "A fresh page for your money."}
                      </h3>
                      <p>
                        {scopedEntries.length
                          ? "Try another type or search term to find what you’re looking for."
                          : "Add your first entry above. A little tracking goes a long way."}
                      </p>
                      {!scopedEntries.length && (
                        <Button variant="link" onClick={focusEntry}>
                          Add your first entry
                          <ArrowRight />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div className="ledger-footer">
                  <span aria-live="polite">
                    Showing {paginated.start}–{paginated.end} of {paginated.total} ·{" "}
                    {dateScope === "all" ? "All dates" : monthLabel(month)}
                    {search || typeFilter !== "all" ? " · filtered view" : ""}
                  </span>
                  <nav className="ledger-pagination" aria-label="Transaction pages">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label="Previous page"
                      disabled={paginated.page === 0}
                      onClick={() => setPage(paginated.page - 1)}
                    >
                      <ChevronLeft size={14} />
                      Previous
                    </Button>
                    <span>Page {paginated.page + 1} of {paginated.pageCount}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label="Next page"
                      disabled={paginated.page + 1 >= paginated.pageCount}
                      onClick={() => setPage(paginated.page + 1)}
                    >
                      Next
                      <ChevronRight size={14} />
                    </Button>
                  </nav>
                  <span className="ledger-storage-note">
                    <ShieldCheck size={14} />
                    Saved to your local database
                  </span>
                </div>
              </div>
            </section>
            <footer className="page-footer">
              <Leaf size={14} />
              <span>Progress, one penny at a time.</span>
              <span>
                All amounts in USD. Investments are contributions, not
                valuations.
              </span>
            </footer>
          </div>
        </div>
      </main>
      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          if (!importPending) setImportOpen(open);
        }}
      >
        <DialogContent className="wide-dialog" showCloseButton={!importPending}>
          <ImportEntries
            categories={activeCategories}
            save={save}
            close={() => setImportOpen(false)}
            pending={importPending}
            setPending={setImportPending}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setEditing(null);
        }}
      >
        <DialogContent
          className="edit-dialog"
          showCloseButton={!mutation.isPending}
        >
          {editing && (
            <EditEntry
              key={editing.id}
              entry={editing}
              categories={categories}
              pending={mutation.isPending}
              save={async (entry) => {
                await mutation.mutateAsync({ type: "edit", entry });
                if (active.current) {
                  setEditing(null);
                  toast.success("Entry updated.");
                }
              }}
              close={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setDeleting(null);
        }}
      >
        <DialogContent showCloseButton={!mutation.isPending}>
          <DialogHeader>
            <DialogTitle>Delete this entry?</DialogTitle>
            <DialogDescription>
              {deleting &&
                `${deleting.description || deleting.category.label} · ${money(deleting.amountCents)}`}
              . This removes the entry permanently.
            </DialogDescription>
          </DialogHeader>
          {mutation.error && (
            <p className="form-error" role="alert">
              {errorMessage(mutation.error)}
            </p>
          )}
          <div className="dialog-actions">
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setDeleting(null)}
            >
              Keep entry
            </Button>
            <Button
              variant="destructive"
              disabled={mutation.isPending}
              onClick={async () => {
                if (!deleting) return;
                try {
                  await mutation.mutateAsync({
                    type: "delete",
                    id: deleting.id,
                  });
                  if (active.current) {
                    setDeleting(null);
                    toast.success("Entry deleted.");
                  }
                } catch {}
              }}
            >
              {mutation.isPending ? (
                <LoaderCircle className="spin" />
              ) : (
                <Trash2 />
              )}
              Delete entry
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={accountOpen}
        onOpenChange={(open) => {
          if (!mutation.isPending && !categoryMutation.isPending) {
            setAccountOpen(open);
            if (!open) setSample(null);
          }
        }}
      >
        <DialogContent
          className="account-dialog"
          showCloseButton={!mutation.isPending && !categoryMutation.isPending}
        >
          <DialogHeader>
            <DialogTitle>Your personal space</DialogTitle>
            <DialogDescription>Signed in as {email}</DialogDescription>
          </DialogHeader>
          <div className="account-details">
            <ShieldCheck size={19} />
            <p>
              Only your account can read or change your entries. This workspace
              uses your local Supabase database.
            </p>
          </div>
          <CategorySettings
            categories={categories}
            pending={categoryMutation.isPending || mutation.isPending}
            save={(operation) => categoryMutation.mutateAsync(operation)}
          />
          <div className="sample-section">
            <h3>Explore with sample entries</h3>
            <p>
              Add up to 48 clearly labeled synthetic entries across six months.
              They are saved to your account and can be edited or deleted like
              any entry.
            </p>
            {sample ? (
              <>
                <p className="sample-warning">
                  Ready to add {sample.length} sample entries, ending in{" "}
                  {monthLabel(month)}. This will change your totals.
                </p>
                <div className="dialog-actions">
                  <Button
                    variant="outline"
                    disabled={mutation.isPending || categoryMutation.isPending}
                    onClick={() => setSample(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={
                      mutation.isPending ||
                      categoryMutation.isPending ||
                      !sample.length
                    }
                    onClick={async () => {
                      try {
                        await save(sample);
                        if (active.current) {
                          setSample(null);
                          setAccountOpen(false);
                        }
                      } catch (error) {
                        if (active.current) toast.error(errorMessage(error));
                      }
                    }}
                  >
                    {mutation.isPending ? (
                      <LoaderCircle className="spin" />
                    ) : (
                      <Sparkles />
                    )}
                    Add synthetic entries
                  </Button>
                </div>
              </>
            ) : (
              <Button
                variant="outline"
                disabled={
                  !activeCategories.length ||
                  !!failure ||
                  categoryMutation.isPending
                }
                onClick={prepareSample}
              >
                <Sparkles />
                Preview sample data
              </Button>
            )}
          </div>
          <Button
            variant="outline"
            disabled={mutation.isPending || categoryMutation.isPending}
            onClick={signOut}
          >
            <LogOut />
            Sign out
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SproutIcon() {
  return <Leaf size={21} strokeWidth={1.5} />;
}

function SummaryCard({
  label,
  value,
  note,
  kind,
  icon,
}: {
  label: string;
  value: number;
  note: string;
  kind: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className={`summary-card ${kind}`}>
      <div className="summary-card-top">
        <span>{label}</span>
        <span className="summary-icon">{icon}</span>
      </div>
      <strong>{money(value)}</strong>
      <span className="summary-note">{note}</span>
    </Card>
  );
}

type CategoryOperation =
  | { type: "create"; category: { id: string; label: string; kind: EntryKind } }
  | { type: "rename"; id: string; label: string }
  | { type: "archive"; id: string; archived: boolean };

function CategorySettings({
  categories,
  pending,
  save,
}: {
  categories: Category[];
  pending: boolean;
  save: (operation: CategoryOperation) => Promise<void>;
}) {
  const [newCategory, setNewCategory] = useState(() => ({
    id: crypto.randomUUID(),
    label: "",
    kind: "expense" as EntryKind,
  }));
  const [renaming, setRenaming] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const [error, setError] = useState("");
  async function submit(operation: CategoryOperation) {
    setError("");
    try {
      if (operation.type === "create")
        operation = {
          ...operation,
          category: {
            ...operation.category,
            label: parseCategoryLabel(operation.category.label),
          },
        };
      if (operation.type === "rename")
        operation = {
          ...operation,
          label: parseCategoryLabel(operation.label),
        };
      await save(operation);
      if (operation.type === "create")
        setNewCategory({
          id: crypto.randomUUID(),
          label: "",
          kind: newCategory.kind,
        });
      if (operation.type === "rename") setRenaming(null);
      toast.success(
        operation.type === "archive"
          ? operation.archived
            ? "Category removed. Your history is preserved."
            : "Category restored."
          : "Category saved.",
      );
    } catch (failure) {
      setError(errorMessage(failure));
      toast.error(errorMessage(failure));
    }
  }
  return (
    <section className="category-settings" aria-label="Category settings">
      <h3>Categories</h3>
      <p>
        Make categories your own. Types stay fixed. Removing a category keeps
        every historical entry; you can restore it anytime.
      </p>
      <form
        className="category-add-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit({ type: "create", category: newCategory });
        }}
      >
        <label>
          Name
          <Input
            aria-label="New category name"
            value={newCategory.label}
            maxLength={60}
            required
            disabled={pending}
            placeholder="e.g. Travel"
            onChange={(event) =>
              setNewCategory({ ...newCategory, label: event.target.value })
            }
          />
        </label>
        <label>
          Type
          <select
            aria-label="New category type"
            value={newCategory.kind}
            disabled={pending}
            onChange={(event) =>
              setNewCategory({
                ...newCategory,
                kind: event.target.value as EntryKind,
              })
            }
          >
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {kindLabels[kind]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={pending || !newCategory.label.trim()}>
          <Plus />
          Add
        </Button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <label className="show-removed">
        <input
          type="checkbox"
          checked={showRemoved}
          onChange={(event) => setShowRemoved(event.target.checked)}
        />
        Show removed categories
      </label>
      {kinds.map((kind) => (
        <div className="category-group" key={kind}>
          <h4>{kindLabels[kind]}</h4>
          {!categories.some(
            (category) =>
              category.kind === kind && (!category.archived || showRemoved),
          ) && <p>No categories yet.</p>}
          {categories
            .filter(
              (category) =>
                category.kind === kind && (!category.archived || showRemoved),
            )
            .map((category) => (
              <div className="category-setting-row" key={category.id}>
                {renaming?.id === category.id ? (
                  <form
                    className="category-rename-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submit({ type: "rename", ...renaming });
                    }}
                  >
                    <Input
                      aria-label={`Rename ${category.label}`}
                      maxLength={60}
                      required
                      autoFocus
                      disabled={pending}
                      value={renaming.label}
                      onChange={(event) =>
                        setRenaming({ ...renaming, label: event.target.value })
                      }
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={pending || !renaming.label.trim()}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setRenaming(null)}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="category-setting-name">
                      {category.label}
                      {category.archived && <small>Removed</small>}
                    </span>
                    <div className="category-setting-actions">
                      <Button
                        variant="ghost"
                        disabled={pending}
                        aria-label={`Rename ${category.label}`}
                        onClick={() => {
                          setError("");
                          setRenaming({
                            id: category.id,
                            label: category.label,
                          });
                        }}
                      >
                        Rename
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={pending}
                        aria-label={`${category.archived ? "Restore" : "Remove"} ${category.label}`}
                        onClick={() =>
                          void submit({
                            type: "archive",
                            id: category.id,
                            archived: !category.archived,
                          })
                        }
                      >
                        {category.archived ? "Restore" : "Remove"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
        </div>
      ))}
      {pending && (
        <p className="category-pending" role="status">
          <LoaderCircle className="spin" size={14} />
          Saving categories…
        </p>
      )}
    </section>
  );
}

function CategoryOptions({ categories }: { categories: Category[] }) {
  return (
    <>
      {kinds.map((kind) => (
        <optgroup key={kind} label={kindLabels[kind]}>
          {categories
            .filter((category) => category.kind === kind)
            .map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
                {category.archived ? " (removed)" : ""}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
}

function QuickEntry({
  categories,
  month,
  defaultKind,
  save,
  openSettings,
}: {
  categories: Category[];
  month: string;
  defaultKind: EntryKind;
  save: (entries: EntryInput[]) => Promise<void>;
  openSettings: () => void;
}) {
  const activeCategories = categories.filter((category) => !category.archived);
  const [draft, setDraft] = useState<EntryDraft>(() => ({
    id: crypto.randomUUID(),
    date: today().startsWith(month) ? today() : `${month}-01`,
    categoryId:
      activeCategories.find((category) => category.kind === defaultKind)?.id ??
      activeCategories[0]?.id ??
      "",
    amount: "",
    description: "",
  }));
  const [customDefaults, setCustomDefaults] = useState(false);
  const context = `${month}/${defaultKind}`;
  const [draftContext, setDraftContext] = useState(context);
  function changeDraft(next: EntryDraft) {
    setDraft(next);
    setDraftContext(context);
  }
  const displayDraft =
    draft.amount ||
    draft.description ||
    (customDefaults && draftContext === context)
      ? draft
      : {
          ...draft,
          date: today().startsWith(month) ? today() : `${month}-01`,
          categoryId:
            activeCategories.find((category) => category.kind === defaultKind)
              ?.id ??
            activeCategories[0]?.id ??
            "",
        };
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError("");
    setPending(true);
    try {
      await save([parseDraft(displayDraft, categories)]);
      changeDraft({
        ...displayDraft,
        id: crypto.randomUUID(),
        description: "",
        amount: "",
      });
      setCustomDefaults(true);
      requestAnimationFrame(() => amountRef.current?.focus());
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  const selectedCategory = categories.find(
    (category) => category.id === displayDraft.categoryId,
  );
  const unavailableCategory = !selectedCategory || selectedCategory.archived;
  return (
    <div className="quick-entry">
      <form onSubmit={submit}>
        <div className="quick-entry-heading">
          <Plus size={16} />
          <span>Quick add</span>
          <small>Enter to save</small>
        </div>
        <label className="quick-date">
          <span className="sr-only">Entry date</span>
          <input
            type="date"
            min="1900-01-01"
            max="2100-12-31"
            value={displayDraft.date}
            required
            disabled={pending}
            onChange={(event) => {
              setCustomDefaults(true);
              changeDraft({ ...displayDraft, date: event.target.value });
            }}
          />
        </label>
        <Input
          name="description"
          aria-label="Entry description"
          placeholder="What was it for?"
          maxLength={240}
          value={displayDraft.description}
          disabled={pending}
          onChange={(event) =>
            changeDraft({ ...displayDraft, description: event.target.value })
          }
        />
        <select
          aria-label="Entry category"
          className="entry-category-select"
          value={displayDraft.categoryId}
          disabled={pending || !activeCategories.length}
          onChange={(event) => {
            setCustomDefaults(true);
            changeDraft({ ...displayDraft, categoryId: event.target.value });
          }}
        >
          {unavailableCategory && (
            <option value={displayDraft.categoryId}>
              {selectedCategory
                ? `${selectedCategory.label} (removed)`
                : "Choose a category"}
            </option>
          )}
          <CategoryOptions categories={activeCategories} />
        </select>
        <label className="quick-amount">
          <span>$</span>
          <Input
            ref={amountRef}
            aria-label="Entry amount in USD"
            placeholder="0.00"
            inputMode="decimal"
            required
            value={displayDraft.amount}
            disabled={pending}
            onChange={(event) =>
              changeDraft({ ...displayDraft, amount: event.target.value })
            }
          />
        </label>
        <Button
          type="submit"
          className="quick-save"
          aria-label="Save entry"
          disabled={pending || unavailableCategory}
        >
          {pending ? <LoaderCircle className="spin" /> : <Plus />}
        </Button>
      </form>
      {(!activeCategories.length || unavailableCategory) && (
        <p className="draft-date-note">
          {!activeCategories.length
            ? "Add or restore a category to save entries."
            : "Your selected category was removed. Choose an active category to save this draft."}{" "}
          <button type="button" onClick={openSettings}>
            Manage categories
          </button>
        </p>
      )}
      {displayDraft.date && !displayDraft.date.startsWith(month) && (
        <p className="draft-date-note">
          This entry will be saved in{" "}
          {monthLabel(displayDraft.date.slice(0, 7))}, outside the month you are
          viewing.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function EditEntry({
  entry,
  categories,
  save,
  close,
  pending,
}: {
  entry: Entry;
  categories: Category[];
  save: (entry: EntryInput) => Promise<void>;
  close: () => void;
  pending: boolean;
}) {
  const [draft, setDraft] = useState<EntryDraft>({
    id: entry.id,
    date: entry.date,
    categoryId: entry.category.id,
    description: entry.description,
    amount: (entry.amountCents / 100).toFixed(2),
  });
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await save(parseDraft(draft, categories, entry.category.id));
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit entry</DialogTitle>
        <DialogDescription>
          Keep the details up to date. The most recent save takes effect.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="edit-form">
        <label>
          Date
          <input
            type="date"
            min="1900-01-01"
            max="2100-12-31"
            required
            disabled={pending}
            value={draft.date}
            onChange={(event) =>
              setDraft({ ...draft, date: event.target.value })
            }
          />
        </label>
        <label>
          Description
          <Input
            placeholder="What was it for?"
            disabled={pending}
            maxLength={240}
            value={draft.description}
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
          />
        </label>
        <label>
          Category
          <select
            disabled={pending}
            value={draft.categoryId}
            onChange={(event) =>
              setDraft({ ...draft, categoryId: event.target.value })
            }
          >
            <CategoryOptions
              categories={categories.filter(
                (category) =>
                  !category.archived || category.id === entry.category.id,
              )}
            />
          </select>
        </label>
        <label>
          Amount (USD)
          <Input
            inputMode="decimal"
            required
            disabled={pending}
            value={draft.amount}
            onChange={(event) =>
              setDraft({ ...draft, amount: event.target.value })
            }
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={close}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <LoaderCircle className="spin" /> : <Check />}Save
            changes
          </Button>
        </div>
      </form>
    </>
  );
}

function ImportEntries({
  categories,
  save,
  close,
  pending,
  setPending,
}: {
  categories: Category[];
  save: (entries: EntryInput[]) => Promise<void>;
  close: () => void;
  pending: boolean;
  setPending: (pending: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<PastedRow[] | null>(null);
  const [error, setError] = useState("");
  const valid = rows?.flatMap((row) => (row.entry ? [row.entry] : [])) ?? [];
  const hasErrors = rows?.some((row) => row.error);
  async function importRows() {
    setError("");
    setPending(true);
    try {
      await save(valid);
      close();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Bring your rows along.</DialogTitle>
        <DialogDescription>
          Copy cells from a spreadsheet and paste them here. Review everything
          before saving.
        </DialogDescription>
      </DialogHeader>
      <div className="import-format">
        <strong>Date → Category → Amount → Description</strong>
        <span>
          Tab-separated · YYYY-MM-DD · positive USD amounts · optional
          description
        </span>
        <code>
          2026-10-06{String.fromCharCode(9)}Groceries{String.fromCharCode(9)}
          42.50{String.fromCharCode(9)}Weekly shop
        </code>
      </div>
      <details className="import-categories">
        <summary>Available category names</summary>
        <p>{categories.map((category) => category.label).join(" · ")}</p>
      </details>
      <Textarea
        aria-label="Spreadsheet rows"
        placeholder="Paste your spreadsheet rows here…"
        rows={7}
        className="import-textarea"
        disabled={pending || !!rows}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {rows && (
        <div className="import-preview">
          <div className="preview-heading">
            <strong>
              {valid.length} valid {valid.length === 1 ? "entry" : "entries"}
              {hasErrors
                ? " · Fix the highlighted rows before saving"
                : " · Ready to save"}
            </strong>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setRows(null);
                setError("");
              }}
            >
              <Pencil />
              Revise paste
            </Button>
          </div>
          {rows.map((row) => (
            <div
              key={row.line}
              className={row.error ? "preview-row invalid" : "preview-row"}
            >
              <span>Row {row.line}</span>
              {row.entry ? (
                <>
                  <span>
                    {row.entry.date} ·{" "}
                    {
                      categories.find(
                        (category) => category.id === row.entry?.categoryId,
                      )?.label
                    }
                    <small>{row.entry.description}</small>
                  </span>
                  <strong>{money(row.entry.amountCents)}</strong>
                </>
              ) : (
                <span>{row.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <Button variant="outline" disabled={pending} onClick={close}>
          Cancel
        </Button>
        {rows ? (
          <Button
            disabled={pending || !!hasErrors || !valid.length}
            onClick={importRows}
          >
            {pending ? <LoaderCircle className="spin" /> : <Check />}Save{" "}
            {valid.length} entries
          </Button>
        ) : (
          <Button
            disabled={!text.trim()}
            onClick={() => {
              const parsed = parseTSV(text, categories);
              setRows(parsed);
              if (!parsed.length) setError("Paste at least one data row.");
            }}
          >
            Review rows
            <ArrowRight />
          </Button>
        )}
      </div>
    </>
  );
}
