# Run Penny locally

Penny tracks manual income, expenses, and investment contributions in USD. It uses Next.js, React, TanStack Query, shadcn UI, and a local Supabase database with email and password authentication.

## Start the app

Use Node.js 22 or newer and a running Docker Desktop or compatible Docker runtime.

1. Install the dependencies.

   ```sh
   npm install
   ```

2. Start Supabase and apply the ledger migration.

   ```sh
   npm run setup:local
   ```

   The first run downloads Supabase container images. The script saves the local public URL and anon key in the ignored `.env.local` file. It preserves other environment settings.

3. Start Next.js.

   ```sh
   npm run dev
   ```

4. Open [Penny at 127.0.0.1:3100](http://127.0.0.1:3100) and create an account. Local signup does not require email confirmation.

Use [Supabase Studio](http://127.0.0.1:54323) to inspect the local database. Stop the backend with `npm run backend:stop`. Stopping preserves the database. Restart it with `npm run setup:local`.

## Record transactions

Choose a date, category, description, and amount in the quick-entry row. The category determines whether the entry is income, an expense, or an investment contribution. Press Enter or select the save button. The ledger supports editing, deletion, month navigation, search, type filters, and CSV export.

Use the paste control to preview tab-separated rows copied from a spreadsheet. Follow the column order displayed in the dialog. Saving the preview stores the rows together. Invalid rows and failed saves retain the draft.

Open Account & settings to preview and add synthetic sample entries to your signed-in local account. New accounts otherwise start empty.

Income, expenses, and contributions are separate totals. Cash remaining equals recorded income minus expenses minus contributions. These totals describe recorded flows. They do not represent account balances, portfolio values, or investment returns. Categories are presets. The MVP uses one currency and manual entry.

## Run checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run verify:db
```

The database check requires the running local Supabase stack. It creates disposable accounts, exercises real authentication and row-level policies, and removes its own fixtures. It refuses a remote Supabase URL.

The browser uses only the public anon key. The database enforces ownership for reads, inserts, edits, and deletes. Entries use integer cents and calendar dates. Creates preserve IDs through retries. Concurrent edits use the last successful save.

Password recovery, external email delivery, bank connections, automatic imports, shared accounts, and deployment are outside this local MVP. Local email confirmation is disabled in `supabase/config.toml`. Configure email delivery and confirmation before using a hosted environment.
# FinanceTracker
