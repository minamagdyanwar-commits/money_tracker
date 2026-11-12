// Pure calculation helpers (no DOM, no React) so they can be unit tested with node --test.

export const pad2 = (n) => String(n).padStart(2, '0');
export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const monthOf = (date) => date.slice(0, 7);
export const currentMonth = (d = new Date()) => monthOf(isoDate(d));

export function addMonths(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}`;
}

export function monthRange(from, to) {
  const out = [];
  let m = from;
  while (m <= to && out.length < 600) {
    out.push(m);
    m = addMonths(m, 1);
  }
  return out;
}

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function totals(txs, month) {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (monthOf(t.date) !== month) continue;
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, net: income - expense };
}

export function categoryShares(txs, month, type = 'expense') {
  const map = new Map();
  let sum = 0;
  for (const t of txs) {
    if (t.type !== type || monthOf(t.date) !== month) continue;
    map.set(t.categoryId, (map.get(t.categoryId) || 0) + t.amount);
    sum += t.amount;
  }
  return [...map.entries()]
    .map(([categoryId, total]) => ({ categoryId, total, share: sum ? total / sum : 0 }))
    .sort((a, b) => b.total - a.total);
}

// ---- recurring payments -------------------------------------------------

export const payKey = (recId, month) => `${recId}|${month}`;

export function recurringStatus(rec, month, payments, nowMonth) {
  if (month < rec.startMonth || (rec.endMonth && month > rec.endMonth)) return 'none';
  if (payments[payKey(rec.id, month)]) return 'paid';
  return month <= nowMonth ? 'unpaid' : 'upcoming';
}

export function yearPlan(recurring, payments, txs, year, nowMonth) {
  let planned = 0;
  let paid = 0;
  for (const rec of recurring) {
    for (let m = 1; m <= 12; m++) {
      const month = `${year}-${pad2(m)}`;
      const status = recurringStatus(rec, month, payments, nowMonth);
      if (status === 'none') continue;
      planned += rec.amount;
      if (status === 'paid') {
        const tx = txs.find((t) => t.id === payments[payKey(rec.id, month)].txId);
        paid += tx ? tx.amount : rec.amount;
      }
    }
  }
  return { planned, paid };
}

export function unpaidForMonth(recurring, payments, month, nowMonth) {
  return recurring
    .filter((rec) => recurringStatus(rec, month, payments, nowMonth) === 'unpaid')
    .map((rec) => ({ rec, overdue: month < nowMonth }));
}

// How urgent an unpaid payment is: overdue (past month or past its due day),
// soon (due within 7 days) or later.
export function dueBucket(rec, month, nowMonth, today) {
  if (month < nowMonth) return 'overdue';
  const todayDay = Number(today.slice(8, 10));
  const due = Math.min(rec.dueDay || 1, 28);
  if (due < todayDay) return 'overdue';
  if (due - todayDay <= 7) return 'soon';
  return 'later';
}

export const BUCKET_ORDER = { overdue: 0, soon: 1, later: 2 };

// ---- analytics ----------------------------------------------------------

export function monthlySeries(txs, months, type, categoryId = 'all') {
  const idx = new Map(months.map((m, i) => [m, i]));
  const out = months.map(() => 0);
  for (const t of txs) {
    if (t.type !== type) continue;
    if (categoryId !== 'all' && t.categoryId !== categoryId) continue;
    const i = idx.get(monthOf(t.date));
    if (i !== undefined) out[i] += t.amount;
  }
  return out;
}

export function describe(values) {
  if (!values.length) return { avg: 0, min: 0, max: 0, std: 0 };
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length);
  return { avg, min: Math.min(...values), max: Math.max(...values), std };
}

export function repeatability(values) {
  const total = values.length;
  const nonZero = values.filter((v) => v > 0);
  const present = nonZero.length;
  const stats = describe(nonZero);
  const cv = stats.avg ? stats.std / stats.avg : 0;
  const presence = total ? present / total : 0;
  let label = 'No data';
  if (present > 0) {
    if (presence >= 0.8 && cv <= 0.25) label = 'Regular';
    else if (presence < 0.5) label = 'Occasional';
    else label = 'Irregular';
  }
  return { present, total, presence, cv, label };
}

// ---- home dashboard -----------------------------------------------------

// Percentage change from prev to cur, or null when there is nothing to compare with.
export function pctChange(cur, prev) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

// Share of income that was kept (0..100). null when there is no income.
export function savingsRate(income, expense) {
  if (!(income > 0)) return null;
  return Math.round(((income - expense) / income) * 100);
}

// Daily average and end-of-month forecast. Only meaningful for the running month.
export function spendPace(expense, month, today) {
  if (monthOf(today) !== month || !(expense > 0)) return null;
  const day = Number(today.slice(8, 10));
  const dim = daysInMonth(month);
  const daily = expense / day;
  return { daily, forecast: expense + daily * (dim - day), daysLeft: dim - day };
}

// Entries grouped by date, newest first, with per-day income / expense totals.
export function groupByDate(txs) {
  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
  const groups = [];
  for (const t of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.date === t.date) last.items.push(t);
    else groups.push({ date: t.date, items: [t], income: 0, expense: 0 });
    const g = groups[groups.length - 1];
    if (t.type === 'income') g.income += t.amount;
    else g.expense += t.amount;
  }
  return groups;
}

// Most used categories over the last `days` days, for one-tap quick add.
export function frequentCategories(txs, type, today, days = 90, n = 4) {
  const since = isoDate(new Date(new Date(today + 'T00:00:00').getTime() - days * 86400000));
  const count = new Map();
  for (const t of txs) {
    if (t.type !== type || t.date < since) continue;
    const c = count.get(t.categoryId) || { n: 0, last: '' };
    c.n += 1;
    if (t.date > c.last) c.last = t.date;
    count.set(t.categoryId, c);
  }
  return [...count.entries()]
    .sort((a, b) => b[1].n - a[1].n || b[1].last.localeCompare(a[1].last))
    .slice(0, n)
    .map(([categoryId]) => categoryId);
}

export function lastEntry(txs) {
  let best = null;
  for (const t of txs) if (!best || t.date >= best.date) best = t;
  return best;
}

// Spend against each category's monthly budget. level: ok < 80%, warn < 100%, over >= 100%.
export function budgetStatus(categories, txs, month) {
  const spent = new Map();
  for (const t of txs) {
    if (t.type === 'expense' && monthOf(t.date) === month) {
      spent.set(t.categoryId, (spent.get(t.categoryId) || 0) + t.amount);
    }
  }
  return categories
    .filter((c) => c.type === 'expense' && c.budget > 0)
    .map((cat) => {
      const s = spent.get(cat.id) || 0;
      const ratio = s / cat.budget;
      return { cat, budget: cat.budget, spent: s, ratio, level: ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok' };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

// Whole days since the last backup, or null when never backed up.
export function daysSince(date, today) {
  if (!date) return null;
  return Math.floor((new Date(today + 'T00:00:00') - new Date(date + 'T00:00:00')) / 86400000);
}

// ---- backup / export ----------------------------------------------------

export function isValidBackup(data) {
  if (!data || typeof data !== 'object') return false;
  return (
    ['categories', 'transactions', 'recurring', 'payments'].every((k) => k in data) &&
    Array.isArray(data.categories) &&
    Array.isArray(data.transactions) &&
    Array.isArray(data.recurring) &&
    typeof data.payments === 'object'
  );
}

export function toCsv(txs, categories, accounts = []) {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const accNames = new Map(accounts.map((a) => [a.id, a.name]));
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['date', 'type', 'category', 'amount', 'note', 'account'].join(',')];
  [...txs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((t) => rows.push([t.date, t.type, q(names.get(t.categoryId) || ''), t.amount, q(t.note), q(accNames.get(t.accountId) || '')].join(',')));
  return rows.join('\n');
}

// ---- accounts -----------------------------------------------------------
// An account's balance = opening balance + its income - its expenses
// + transfers in - transfers out, counted up to and including `asOf`.
// Credit cards are ordinary accounts whose balance is negative while money is owed.
// Transfers are not income or expenses, so reports are unaffected by them.

export function accountBalance(acc, txs, transfers, asOf) {
  let balance = acc.openingBalance || 0;
  for (const t of txs) {
    if (t.accountId !== acc.id || t.date > asOf) continue;
    balance += t.type === 'income' ? t.amount : -t.amount;
  }
  for (const tr of transfers) {
    if (tr.date > asOf) continue;
    if (tr.toId === acc.id) balance += tr.amount;
    if (tr.fromId === acc.id) balance -= tr.amount;
  }
  return balance;
}

// Credit card against its limit: how much is owed, how much can still be used.
// available = limit + balance, so a card with a credit balance (overpaid) has more than its limit.
// Returns null for accounts that are not credit cards or have no limit set.
export function creditStatus(acc, balance) {
  const limit = acc.type === 'credit' ? acc.creditLimit || 0 : 0;
  if (!(limit > 0)) return null;
  const owed = Math.max(-balance, 0);
  const ratio = owed / limit;
  return { limit, owed, available: limit + balance, ratio, level: ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok' };
}

// Balances of the active (non-archived) accounts plus the totals.
export function accountSummary(accounts, txs, transfers, asOf) {
  const rows = accounts.map((acc) => ({ acc, balance: accountBalance(acc, txs, transfers, asOf) }));
  const active = rows.filter((r) => !r.acc.archived);
  const assets = active.reduce((a, r) => a + Math.max(r.balance, 0), 0);
  const owed = active.reduce((a, r) => a + Math.max(-r.balance, 0), 0);
  const cards = active.map((r) => creditStatus(r.acc, r.balance)).filter(Boolean);
  return {
    rows,
    total: active.reduce((a, r) => a + r.balance, 0),
    assets,
    owed,
    hasLimits: cards.length > 0,
    availableCredit: cards.reduce((a, c) => a + Math.max(c.available, 0), 0),
  };
}

// Everything that moved money in or out of one account, newest first.
export function accountActivity(accId, txs, transfers) {
  const items = [];
  for (const t of txs) {
    if (t.accountId === accId) items.push({ kind: 'tx', id: t.id, date: t.date, delta: t.type === 'income' ? t.amount : -t.amount, tx: t });
  }
  for (const tr of transfers) {
    if (tr.toId === accId) items.push({ kind: 'transfer', id: tr.id, date: tr.date, delta: tr.amount, transfer: tr, otherId: tr.fromId });
    if (tr.fromId === accId) items.push({ kind: 'transfer', id: tr.id, date: tr.date, delta: -tr.amount, transfer: tr, otherId: tr.toId });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

export function accountInUse(accId, txs, transfers, recurring = []) {
  return txs.some((t) => t.accountId === accId) || transfers.some((t) => t.fromId === accId || t.toId === accId) || recurring.some((r) => r.accountId === accId);
}

export const firstActiveAccount = (accounts) => (accounts.find((a) => !a.archived) || accounts[0] || {}).id;

// ---- account ledger (history of one account) ------------------------------

const dayMs = 86400000;
export const parseDay = (d) => new Date(d + 'T00:00:00');
export const addDays = (date, n) => isoDate(new Date(parseDay(date).getTime() + n * dayMs));
export const diffDays = (a, b) => Math.round((parseDay(b) - parseDay(a)) / dayMs);

// Every entry and transfer that touched the account between `from` and `to` (inclusive, '' = open ended),
// oldest first, each with the account balance right after it. `opening` is the balance before `from`.
export function accountLedger(acc, txs, transfers, from = '', to = '') {
  const all = accountActivity(acc.id, txs, transfers).reverse(); // oldest first (stable for same-day items)
  let running = acc.openingBalance || 0;
  const rows = [];
  let opening = running;
  for (const it of all) {
    if (from && it.date < from) {
      running += it.delta;
      opening = running;
      continue;
    }
    if (to && it.date > to) break;
    running += it.delta;
    rows.push({ ...it, balanceAfter: running });
  }
  const inTotal = rows.reduce((a, r) => a + (r.delta > 0 ? r.delta : 0), 0);
  const outTotal = rows.reduce((a, r) => a + (r.delta < 0 ? -r.delta : 0), 0);
  return { rows, opening, closing: opening + inTotal - outTotal, inTotal, outTotal };
}

// Balance over time for a chart: daily up to ~2 months, weekly up to ~13 months, monthly beyond.
export function balanceSeries(ledger, from, to) {
  if (!from || !to || from > to) return [];
  const span = diffDays(from, to);
  const step = span <= 62 ? 1 : span <= 400 ? 7 : 30;
  const points = [];
  let i = 0;
  let balance = ledger.opening;
  for (let d = from; ; d = addDays(d, step)) {
    const end = d > to ? to : d;
    while (i < ledger.rows.length && ledger.rows[i].date <= end) balance = ledger.rows[i++].balanceAfter;
    points.push({ date: end, value: balance });
    if (end >= to) break;
  }
  return points;
}

// Money in / out per month for a list of ledger rows.
export function monthlyFlow(rows, months) {
  const idx = new Map(months.map((m, i) => [m, i]));
  const inn = months.map(() => 0);
  const out = months.map(() => 0);
  for (const r of rows) {
    const i = idx.get(monthOf(r.date));
    if (i === undefined) continue;
    if (r.delta > 0) inn[i] += r.delta;
    else out[i] += -r.delta;
  }
  return { income: inn, expense: out };
}

// Start of the period for a preset ('month' | '3m' | '6m' | 'year' | 'all').
export function periodRange(preset, today) {
  const m = monthOf(today);
  if (preset === 'month') return { from: `${m}-01`, to: today };
  if (preset === '3m') return { from: `${addMonths(m, -2)}-01`, to: today };
  if (preset === '6m') return { from: `${addMonths(m, -5)}-01`, to: today };
  if (preset === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return { from: '', to: '' };
}

// ---- certificates and scheduled interest -----------------------------------
// A deposit account (type 'certificate') holds any number of certificates in `acc.certs`:
//   { id, name, openingAmount, rate (% per year), every: 'monthly'|'quarterly'|'semiannual'|'yearly'|'maturity',
//     firstDate (first payout), startDate (for 'maturity'), maturityDate?, payoutAccountId ('' = reinvest into the
//     certificate), paid: [dates], closed? }
// Each certificate is valued on its own: openingAmount plus the entries and transfers tagged with its `certId`
// (purchase, reinvested interest, redemption), so interest is calculated per certificate. The account balance
// is the ledger balance as usual (its opening balance is the sum of the certificates' opening amounts).
// Interest is credited as income entries, so it shows up in history, charts and analytics.

export const INTEREST_CATEGORY = 'i-interest';
export const EVERY_MONTHS = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };

// Same day of month n months later, clamped to the length of that month (31 Jan + 1 month = 28 Feb).
export function addMonthsToDate(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const target = addMonths(`${y}-${pad2(m)}`, n);
  return `${target}-${pad2(Math.min(d, daysInMonth(target)))}`;
}

export function monthsBetween(a, b) {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma) + (db - da) / 30;
}

export const round2 = (n) => Math.round(n * 100) / 100;

// Value of one certificate up to and including `asOf`.
export function certBalance(acc, cert, txs, transfers, asOf) {
  let balance = cert.openingAmount || 0;
  for (const t of txs) {
    if (t.certId !== cert.id || t.accountId !== acc.id || t.date > asOf) continue;
    balance += t.type === 'income' ? t.amount : -t.amount;
  }
  for (const tr of transfers) {
    if (tr.certId !== cert.id || tr.date > asOf) continue;
    if (tr.toId === acc.id) balance += tr.amount;
    if (tr.fromId === acc.id) balance -= tr.amount;
  }
  return balance;
}

// Payout dates that are due (<= today) and not paid yet, oldest first.
export function dueInterestDates(cert, today) {
  if (!cert || cert.closed || !(cert.rate > 0)) return [];
  const paid = new Set(cert.paid || []);
  const out = [];
  if (cert.every === 'maturity') {
    if (cert.maturityDate && cert.maturityDate <= today && !paid.has(cert.maturityDate)) out.push(cert.maturityDate);
    return out;
  }
  const step = EVERY_MONTHS[cert.every];
  if (!step || !cert.firstDate) return [];
  for (let k = 0; k < 240; k++) {
    const d = addMonthsToDate(cert.firstDate, k * step);
    if (d > today || (cert.maturityDate && d > cert.maturityDate)) break;
    if (!paid.has(d)) out.push(d);
  }
  return out;
}

export function interestFor(cert, balance, date) {
  const months = cert.every === 'maturity' ? monthsBetween(cert.startDate || date, date) : EVERY_MONTHS[cert.every];
  return round2((Math.max(balance, 0) * cert.rate * months) / 1200);
}

// The next `n` payouts after `today`, estimated on `balance` (no compounding).
export function upcomingInterest(cert, balance, today, n = 6) {
  if (!cert || cert.closed || !(cert.rate > 0)) return [];
  const out = [];
  if (cert.every === 'maturity') {
    if (cert.maturityDate && cert.maturityDate > today) out.push({ date: cert.maturityDate, amount: interestFor(cert, balance, cert.maturityDate) });
    return out;
  }
  const step = EVERY_MONTHS[cert.every];
  if (!step || !cert.firstDate) return [];
  for (let k = 0; k < 480 && out.length < n; k++) {
    const d = addMonthsToDate(cert.firstDate, k * step);
    if (cert.maturityDate && d > cert.maturityDate) break;
    if (d > today) out.push({ date: d, amount: interestFor(cert, balance, d) });
  }
  return out;
}

export const nextInterest = (cert, balance, today) => upcomingInterest(cert, balance, today, 1)[0] || null;

// Every certificate of a deposit account valued on its own, plus the totals across all of them.
export function certSummary(acc, txs, transfers, today) {
  const horizon = addDays(today, 30);
  const rows = (acc.certs || []).map((cert) => {
    const balance = certBalance(acc, cert, txs, transfers, today);
    let earned = 0;
    for (const t of txs) if (t.certId === cert.id && t.autoInterest && t.date <= today) earned += t.amount;
    const upcoming = cert.closed ? [] : upcomingInterest(cert, balance, today, 6);
    return { cert, balance, earned, upcoming, next: upcoming[0] || null, yearly: cert.closed ? 0 : (balance * (cert.rate || 0)) / 100 };
  });
  const active = rows.filter((r) => !r.cert.closed);
  return {
    rows,
    value: active.reduce((a, r) => a + r.balance, 0),
    earned: rows.reduce((a, r) => a + r.earned, 0),
    yearly: active.reduce((a, r) => a + r.yearly, 0),
    next30: active.reduce((a, r) => a + r.upcoming.filter((u) => u.date <= horizon).reduce((x, u) => x + u.amount, 0), 0),
  };
}

// Credits all interest that has come due, certificate by certificate. Returns the same object when nothing
// was due, so callers can skip saving. Interest paid into the certificate itself compounds it.
export function accrueInterest(data, today) {
  let txs = data.transactions;
  let changed = false;
  const accounts = data.accounts.map((acc) => {
    if (acc.type !== 'certificate' || !acc.certs?.length) return acc;
    const certs = acc.certs.map((cert) => {
      const dates = dueInterestDates(cert, today);
      if (!dates.length) return cert;
      const paid = [...(cert.paid || [])];
      for (const d of dates) {
        const amount = interestFor(cert, certBalance(acc, cert, txs, data.transfers, d), d);
        if (amount > 0) {
          txs = [...txs, { id: newId(), type: 'income', amount, categoryId: INTEREST_CATEGORY, date: d, note: cert.name, accountId: cert.payoutAccountId || acc.id, certId: cert.id, sourceId: acc.id, autoInterest: true }];
        }
        paid.push(d);
      }
      changed = true;
      return { ...cert, paid };
    });
    return { ...acc, certs };
  });
  return changed ? { ...data, accounts, transactions: txs } : data;
}

// Adds or updates a certificate; the account's opening balance follows the certificates' opening amounts.
export function saveCert(data, accountId, cert) {
  const accounts = data.accounts.map((acc) => {
    if (acc.id !== accountId) return acc;
    const list = acc.certs || [];
    const certs = list.some((c) => c.id === cert.id) ? list.map((c) => (c.id === cert.id ? cert : c)) : [...list, cert];
    return { ...acc, certs, openingBalance: certs.reduce((a, c) => a + (c.openingAmount || 0), 0) };
  });
  return { ...data, accounts };
}

export function deleteCert(data, accountId, certId) {
  const used = data.transactions.some((t) => t.certId === certId) || data.transfers.some((t) => t.certId === certId);
  if (used) return data;
  const accounts = data.accounts.map((acc) => {
    if (acc.id !== accountId) return acc;
    const certs = (acc.certs || []).filter((c) => c.id !== certId);
    return { ...acc, certs, openingBalance: certs.reduce((a, c) => a + (c.openingAmount || 0), 0) };
  });
  return { ...data, accounts };
}

// Redeeming one certificate (fully or partly): `principal` leaves it, `received` lands in `toId`.
// More received than released is extra interest (income); less is a penalty (expense on the certificate).
export function redeemCertificate(data, { accountId, certId, principal, received, toId, date, note }) {
  const acc = data.accounts.find((a) => a.id === accountId);
  const cert = acc?.certs?.find((c) => c.id === certId);
  if (!cert || !(principal > 0) || !(received >= 0)) return data;
  const balance = certBalance(acc, cert, data.transactions, data.transfers, date);
  const released = Math.min(principal, Math.max(balance, 0));
  const closing = released >= balance - 0.005;
  const transfers = [...data.transfers];
  const txs = [...data.transactions];
  const moved = Math.min(received, released);
  if (toId !== accountId && moved > 0) transfers.push({ id: newId(), date, fromId: accountId, toId, amount: moved, certId, note: note || cert.name });
  if (received > released) txs.push({ id: newId(), type: 'income', amount: round2(received - released), categoryId: INTEREST_CATEGORY, date, note: note || cert.name, accountId: toId });
  if (received < released) txs.push({ id: newId(), type: 'expense', amount: round2(released - received), categoryId: 'c-other', date, note: note || cert.name, accountId, certId });
  const accounts = data.accounts.map((a) => (a.id === accountId ? { ...a, certs: a.certs.map((c) => (c.id === certId && closing ? { ...c, closed: true } : c)) } : a));
  return { ...data, accounts, transfers, transactions: txs };
}

// Older data kept a single certificate's terms on the account (`acc.interest`). Turn that into one
// certificate inside the account and tag the account's entries with it. Safe to run repeatedly.
export function migrateCertificates(data) {
  let changed = false;
  let txs = data.transactions;
  let transfers = data.transfers || [];
  const accounts = data.accounts.map((acc) => {
    if (acc.type !== 'certificate' || acc.certs) return acc;
    changed = true;
    const it = acc.interest;
    const { interest, ...rest } = acc;
    if (!it) return { ...rest, certs: [] };
    const certId = `${acc.id}-c1`;
    const cert = {
      id: certId, name: acc.name, openingAmount: acc.openingBalance || 0, rate: it.rate, every: it.every, firstDate: it.firstDate,
      startDate: it.startDate, maturityDate: it.maturityDate, payoutAccountId: !it.payoutAccountId || it.payoutAccountId === acc.id ? '' : it.payoutAccountId,
      paid: it.paid || [], closed: !!it.closed,
    };
    txs = txs.map((t) => (t.accountId === acc.id || t.sourceId === acc.id ? { ...t, certId } : t));
    transfers = transfers.map((t) => (t.fromId === acc.id || t.toId === acc.id ? { ...t, certId } : t));
    return { ...rest, certs: [cert] };
  });
  return changed ? { ...data, accounts, transactions: txs, transfers } : data;
}
