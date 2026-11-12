# Expense Tracker

Personal expense and income tracker. Installable web app (PWA) that works offline. All data stays on your device (IndexedDB); nothing is sent anywhere.

## Features
- "Update to the latest version" button in Settings (clears cached app files, keeps your data)
- Account page: full history of one account for any period (entries and transfers with the balance after each, tap to edit), balance chart and in/out per month
- Certificates account: one deposit account holding any number of certificates, each with its own value, interest rate and payout schedule. Interest is calculated per certificate and added automatically as income (to another account or compounding), with totals across all certificates, per-certificate details and redemption with the amount actually received
- Credit card limits: owed amount, available credit and usage bar per card (warns near and over the limit)
- First-run setup: enter each account and its starting balance before anything else
- Multiple accounts (salary, cash, credit card, other banks) with transfers between them and the balance of each account as of any date
- Quick entry of expenses and income with editable categories (Settings → Categories: add, edit, reorder, archive)
- Recurring payments (installments, bills) with a 12-month paid / unpaid grid; marking a month paid creates the matching expense automatically
- Home dashboard: net with month-over-month comparison, savings rate, daily average and month-end forecast, quick add (frequent categories, repeat last entry), per-category monthly budgets, 6-month trend, unpaid payments with one-tap Pay, entries grouped by day with filter and search, backup reminder
- Arabic (RTL) and English UI, light / dark / auto theme (Settings → General)
- Analytics: variation of any category or income source over 3 / 6 / this year / custom range, repeatability (Regular / Irregular / Occasional), income vs expenses bars
- Backup and restore (JSON), CSV export

## Deploy to GitHub Pages
The production build is written to the repository root, which is what Pages serves (Settings → Pages → Deploy from a branch → `main` / root).
```
npm install
npm run build   # regenerates index.html + hashed assets in the repo root
git add -A && git commit -m "Build" && git push
```
Your app will be at `https://<you>.github.io/<repo>/`.

## Install on your phone
- **iPhone (Safari):** open the link → Share → Add to Home Screen
- **Android (Chrome):** open the link → menu → Install app / Add to Home screen

Open it once with internet so it can cache itself; after that it works offline.

## Your data
Data lives in the browser storage of the device where you use the app, so it is not shared between devices. Use **Settings → Export backup** regularly (and before changing phones or clearing browser data), then **Import backup** to restore.

## Develop
```
npm install
npm run dev     # local dev server (sources in src/)
npm test        # unit tests for the calculation logic
npm run build   # production build into the repo root
```

## Structure
- `src/logic.js` – pure calculation functions (totals, recurring status, analytics, dashboard helpers, budgets); covered by `tests/`
- `src/store.jsx`, `src/db.js` – state, reducer and IndexedDB persistence
- `src/i18n.js` – English / Arabic strings
- `src/Accounts.jsx`, `Home.jsx`, `Payments.jsx`, `Analytics.jsx`, `Settings.jsx`, `AddSheet.jsx`, `PaySheet.jsx` – screens
- `public/` – icons, manifest, service worker (copied to the root by the build)
