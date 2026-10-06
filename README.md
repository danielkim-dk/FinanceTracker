# Penny

Penny tracks manual income, expenses, and investment contributions in USD. It uses Next.js, React, TanStack Query, shadcn UI, and Supabase with email and password authentication. Connect your own hosted Supabase project or use the optional local backend.

## Connect your Supabase project

Copy your Project URL and publishable key from the Supabase project’s Connect panel. For local development, add these to the ignored `.env.local` file and restart `npm run dev`.

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` variable is also accepted. If both keys are set, the publishable key takes precedence. Use only a publishable or legacy anon key; the app does not need a secret or service-role key.

For Vercel, add these two variables to the Production environment, and Preview if needed, before deploying. Redeploy after changing them because Next.js embeds public variables at build time. The deployed app connects directly to the Supabase project configured by that URL.

Apply both migrations to that project in order before using the app:

1. `supabase/migrations/20261006183000_create_ledger.sql`
2. `supabase/migrations/20261006185000_owned_categories.sql`

These create the tables, per-account categories, and row-level security policies. Environment variables alone do not install the database schema. In Supabase Auth URL Configuration, set Site URL to your deployed app URL and add the local URL or preview URLs you intend to use to the allowed redirect URLs. Configure hosted email confirmation and delivery for your project. Local accounts and entries remain in the local database; connecting a hosted project does not copy them.

See the [Supabase Next.js setup](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs), [Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), and [Vercel environment variables](https://vercel.com/docs/environment-variables).

## Start with the optional local backend

Use Node.js 22 or newer and a running Docker Desktop or compatible Docker runtime.

1. Install the dependencies.

   ```sh
   npm install
   ```

2. Start Supabase and apply the database migrations.

   ```sh
   npm run setup:local
   ```

   The first run downloads Supabase container images. This command deliberately switches `.env.local` to the local backend, replacing its Supabase URL and public key settings while preserving unrelated settings. Do not run it when you want to keep using your hosted project.

3. Start Next.js.

   ```sh
   npm run dev
   ```

4. Open [Penny at 127.0.0.1:3100](http://127.0.0.1:3100) and create an account. Local signup does not require email confirmation.

Use [Supabase Studio](http://127.0.0.1:54323) to inspect the local database. Stop the backend with `npm run backend:stop`. Stopping preserves the database. Restart it with `npm run setup:local`.

## Record transactions

Choose a date, category, description, and amount in the quick-entry row. The category determines whether the entry is income, an expense, or an investment contribution. Press Enter or select the save button. The ledger supports editing, deletion, month navigation, search, type filters, and CSV export.

Choose Selected month or All dates above the transaction table. All dates includes your entire history. The table shows 25 entries per page; search and type filters apply before pagination, and CSV export includes every matching entry. The dashboard totals and breakdown remain tied to the month selected at the top.

The overview table switches between 1 month and YTD. YTD shows monthly rows from January through the selected month of that year.

Use the paste control to preview tab-separated rows copied from a spreadsheet. Follow the column order displayed in the dialog. Saving the preview stores the rows together. Invalid rows and failed saves retain the draft.

Open Account & settings to preview and add synthetic sample entries to your signed-in account. New accounts otherwise start empty.

Income, expenses, and contributions are separate totals. Cash remaining equals recorded income minus expenses minus contributions. These totals describe recorded flows. They do not represent account balances, portfolio values, or investment returns. The MVP uses one currency and manual entry.

In Account & settings, add categories under the fixed Income, Expenses, or Investments types. Rename a category to update its label throughout your history. Remove hides it from new entry choices and imports while retaining linked entries. Enable Show removed categories to restore it. Category names are unique within your account, including removed categories. A category's type stays fixed after creation.

## Run checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run verify:db
```

The database check requires the running local Supabase stack. It creates disposable accounts, exercises real authentication and row-level policies, and removes its own fixtures. It refuses a remote Supabase URL.

The browser uses only a public publishable or legacy anon key and the signed-in user’s session. The database migrations enforce ownership for reads, inserts, edits, and deletes. Categories are private to each account. New accounts start with independent default categories. Entries use integer cents and calendar dates. Creates preserve IDs through retries. Concurrent edits use the last successful save.

The production build uses Next.js's supported webpack option. The local sandbox blocked a Turbopack CSS subprocess from binding its internal port.

Password recovery, bank connections, automatic imports, and shared accounts are outside this MVP. Local email confirmation is disabled in `supabase/config.toml`; hosted email settings are managed in your Supabase project. Configuring the app does not apply remote migrations or deploy it automatically.
# FinanceTracker
