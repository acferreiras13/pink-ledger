# Pink Ledger — version 2

Latest update: Cards & cash → New card supports additional credit cards, editable names/limits and opening balances. New cards are available in expense forms, recurring bills, payments, activity filters, and backups. Android source and a GitHub Actions cloud build are included. See `android/BUILD.md` for building an APK without Android Studio. The cloud build has not yet run, and phone verification remains required.

Open `index.html` in a modern desktop browser. The file is self-contained and needs no network access.

## Using it

- **Income:** set a recurring monthly amount and its first month. It is included automatically once per month. Use Extra income for additional money. Edit an AUTO entry to change only that month.
- **Expenses:** enter one-off expenses using a dedicated form. Optionally choose a savings goal as the funding source.
- **Cards & cash:** Capital One Savor ($2,000 limit), Chase Disney Visa Rewards ($2,500), AFCU Credit Card ($500), and Cash. Expense forms include a payment selector and a separate merchant field. Fixed bills can also be assigned a card. Card balances need an opening balance/date; only charges/payments from that date through today affect the balance. Earlier transactions remain in spending history. Card payments reduce debt without adding another expense. Available credit and utilization are tracked estimates, not bank-connected values. Cash tracks spending only, not cash on hand. Limits are editable.
- **Budgets & bills:** create recurring fixed bills and category spending limits. Bills count as spending; category limits are targets, not another charge.
- **Goals & savings:** create goals, contribute, spend, withdraw, and see each goal's history. Opening savings do not reduce current income.
- **Dashboard:** choose Month, Year, or All time. All time ends at the current calendar month. Year includes scheduled entries for all twelve months.
- **All activity:** opens on All time and supports text, category, and movement filters, plus CSV export.
- **Settings:** download/restore JSON backups, restore skipped recurring entries, or explore a separate sample ledger.

## Data and accounting

Amounts are integer cents and displayed in USD. Available money is income minus spending minus net contributions to goals. Net contributions are contributions minus withdrawals minus expenses paid from goals. This prevents a purchase from being deducted twice after funds were already set aside.

Recurring entries are computed once for each rule/month. Refreshing does not append duplicate records. Changes to a recurring amount have an effective month and preserve earlier amounts. Individual-month overrides are separate. Scheduled recurring amounts are included even when viewing future months; this is not a bank-connected cash balance.

The app saves to browser localStorage under `lele-pink-ledger-v2`. Version 1 data is read and migrated if the new key does not exist. A saved old planned-income amount becomes recurring income when no recurring income sources already exist. Matching old manual recurring charges suppress their automatic occurrence to avoid duplication. Old data in a different file/browser origin requires export from the old version and restore in the new version. Original v1 storage is not deleted.

Use backup/restore when moving between files or devices. Browser storage can be cleared. Sample mode does not overwrite the personal ledger.

## Source

- `engine.mjs`: accounting, recurrence, validation, migration.
- `ui.js`: dedicated pages and forms.
- `style.css`: responsive pink interface.
- `shell.html`: document shell.
- `build.mjs`: bundles these into the standalone `index.html`.
- `test.mjs`: financial behavior and UI-render smoke checks.

Build: `node build.mjs`

Test: `node --test test.mjs`

Validation performed: recurring income, extra income, repeat reads/reload, monthly overrides, effective dates, ending recurring schedules, short/leap months, savings spending/withdrawals, budget history, all-time ranges, v1 migration, malformed backups, all page/form rendering with a simulated DOM. A real-browser visual or device test was not available in the build environment.
