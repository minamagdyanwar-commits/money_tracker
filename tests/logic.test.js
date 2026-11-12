import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/logic.js';

const tx = (date, type, amount, categoryId = 'c1') => ({ id: date + amount + categoryId, date, type, amount, categoryId });

test('addMonths / monthRange cross year boundaries', () => {
  assert.equal(L.addMonths('2026-01', -1), '2025-12');
  assert.equal(L.addMonths('2026-12', 1), '2027-01');
  assert.deepEqual(L.monthRange('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
});

test('daysInMonth handles leap years', () => {
  assert.equal(L.daysInMonth('2024-02'), 29);
  assert.equal(L.daysInMonth('2026-02'), 28);
  assert.equal(L.daysInMonth('2026-10'), 31);
});

test('totals and categoryShares', () => {
  const txs = [tx('2026-10-01', 'income', 1000), tx('2026-10-02', 'expense', 300, 'a'), tx('2026-10-03', 'expense', 100, 'b'), tx('2026-09-03', 'expense', 50)];
  assert.deepEqual(L.totals(txs, '2026-10'), { income: 1000, expense: 400, net: 600 });
  const s = L.categoryShares(txs, '2026-10');
  assert.equal(s[0].categoryId, 'a');
  assert.equal(s[0].share, 0.75);
});

test('recurringStatus', () => {
  const rec = { id: 'r', startMonth: '2026-03', endMonth: '2026-12', amount: 10 };
  assert.equal(L.recurringStatus(rec, '2026-02', {}, '2026-10'), 'none');
  assert.equal(L.recurringStatus(rec, '2026-05', {}, '2026-10'), 'unpaid');
  assert.equal(L.recurringStatus(rec, '2026-05', { 'r|2026-05': { txId: 'x' } }, '2026-10'), 'paid');
  assert.equal(L.recurringStatus(rec, '2026-11', {}, '2026-10'), 'upcoming');
});

test('dueBucket', () => {
  const rec = { dueDay: 10 };
  assert.equal(L.dueBucket(rec, '2026-09', '2026-10', '2026-10-05'), 'overdue');
  assert.equal(L.dueBucket(rec, '2026-10', '2026-10', '2026-10-15'), 'overdue');
  assert.equal(L.dueBucket(rec, '2026-10', '2026-10', '2026-10-05'), 'soon');
  assert.equal(L.dueBucket({ dueDay: 28 }, '2026-10', '2026-10', '2026-10-05'), 'later');
});

test('repeatability labels', () => {
  assert.equal(L.repeatability([100, 100, 100, 100]).label, 'Regular');
  assert.equal(L.repeatability([0, 0, 0, 50]).label, 'Occasional');
  assert.equal(L.repeatability([0, 0, 0]).label, 'No data');
});

test('pctChange and savingsRate', () => {
  assert.equal(L.pctChange(120, 100), 20);
  assert.equal(L.pctChange(50, 100), -50);
  assert.equal(L.pctChange(50, 0), null);
  assert.equal(L.savingsRate(1000, 400), 60);
  assert.equal(L.savingsRate(1000, 1500), -50);
  assert.equal(L.savingsRate(0, 10), null);
});

test('spendPace only for the running month', () => {
  const p = L.spendPace(1000, '2026-10', '2026-10-10');
  assert.equal(p.daily, 100);
  assert.equal(p.forecast, 3100);
  assert.equal(p.daysLeft, 21);
  assert.equal(L.spendPace(1000, '2026-09', '2026-10-10'), null);
  assert.equal(L.spendPace(0, '2026-10', '2026-10-10'), null);
});

test('groupByDate sums per day, newest first', () => {
  const g = L.groupByDate([tx('2026-10-01', 'expense', 5), tx('2026-10-02', 'income', 50), tx('2026-10-02', 'expense', 7)]);
  assert.equal(g.length, 2);
  assert.equal(g[0].date, '2026-10-02');
  assert.equal(g[0].income, 50);
  assert.equal(g[0].expense, 7);
});

test('frequentCategories ranks by use inside the window', () => {
  const txs = [tx('2026-10-01', 'expense', 1, 'a'), tx('2026-10-02', 'expense', 1, 'b'), tx('2026-10-03', 'expense', 1, 'b'), tx('2025-01-01', 'expense', 1, 'old'), tx('2026-10-03', 'income', 1, 'i')];
  assert.deepEqual(L.frequentCategories(txs, 'expense', '2026-10-10'), ['b', 'a']);
});

test('budgetStatus levels', () => {
  const cats = [
    { id: 'a', type: 'expense', budget: 100 },
    { id: 'b', type: 'expense', budget: 100 },
    { id: 'c', type: 'expense', budget: 100 },
    { id: 'd', type: 'expense' },
  ];
  const txs = [tx('2026-10-01', 'expense', 50, 'a'), tx('2026-10-01', 'expense', 85, 'b'), tx('2026-10-01', 'expense', 120, 'c'), tx('2026-09-01', 'expense', 999, 'a')];
  const s = L.budgetStatus(cats, txs, '2026-10');
  assert.deepEqual(s.map((x) => [x.cat.id, x.level]), [['c', 'over'], ['b', 'warn'], ['a', 'ok']]);
});

test('daysSince', () => {
  assert.equal(L.daysSince('2026-10-01', '2026-10-31'), 30);
  assert.equal(L.daysSince(undefined, '2026-10-31'), null);
});

test('backup validation and csv', () => {
  assert.equal(L.isValidBackup({ categories: [], transactions: [], recurring: [], payments: {} }), true);
  assert.equal(L.isValidBackup({ categories: [] }), false);
  const csv = L.toCsv([{ date: '2026-10-01', type: 'expense', amount: 5, categoryId: 'a', note: 'say "hi"' }], [{ id: 'a', name: 'Food' }]);
  assert.equal(csv.split('\n')[1], '2026-10-01,expense,"Food",5,"say ""hi""",""');
});

test('accountBalance: opening, entries, transfers and as-of date', () => {
  const main = { id: 'm', openingBalance: 1000 };
  const card = { id: 'c', openingBalance: -500 };
  const txs = [
    { ...tx('2026-10-01', 'income', 5000), accountId: 'm' },
    { ...tx('2026-10-02', 'expense', 200), accountId: 'c' },
    { ...tx('2026-11-01', 'expense', 100), accountId: 'm' },
  ];
  const transfers = [{ id: 't', date: '2026-10-05', fromId: 'm', toId: 'c', amount: 700 }];
  assert.equal(L.accountBalance(main, txs, transfers, '2026-10-31'), 1000 + 5000 - 700);
  assert.equal(L.accountBalance(card, txs, transfers, '2026-10-31'), -500 - 200 + 700);
  assert.equal(L.accountBalance(main, txs, transfers, '2026-10-03'), 6000);
  assert.equal(L.accountBalance(main, txs, transfers, '2026-12-01'), 5200);
});

test('accountSummary totals ignore archived accounts and split assets / owed', () => {
  const accounts = [{ id: 'a', openingBalance: 300 }, { id: 'b', openingBalance: -100 }, { id: 'z', openingBalance: 999, archived: true }];
  const s = L.accountSummary(accounts, [], [], '2026-10-31');
  assert.equal(s.total, 200);
  assert.equal(s.assets, 300);
  assert.equal(s.owed, 100);
  assert.equal(s.rows.length, 3);
});

test('transfers never change income / expense totals', () => {
  const transfers = [{ id: 't', date: '2026-10-05', fromId: 'm', toId: 'c', amount: 700 }];
  assert.deepEqual(L.totals([], '2026-10'), { income: 0, expense: 0, net: 0 });
  assert.equal(L.accountActivity('c', [], transfers)[0].delta, 700);
  assert.equal(L.accountActivity('m', [], transfers)[0].delta, -700);
});

test('accountInUse / firstActiveAccount', () => {
  assert.equal(L.accountInUse('a', [{ accountId: 'a' }], [], []), true);
  assert.equal(L.accountInUse('a', [], [{ fromId: 'x', toId: 'a' }], []), true);
  assert.equal(L.accountInUse('a', [], [], []), false);
  assert.equal(L.firstActiveAccount([{ id: 'x', archived: true }, { id: 'y' }]), 'y');
});

test('creditStatus: owed, available and level against the limit', () => {
  const card = { type: 'credit', creditLimit: 10000 };
  assert.deepEqual(L.creditStatus(card, -2500), { limit: 10000, owed: 2500, available: 7500, ratio: 0.25, level: 'ok' });
  assert.equal(L.creditStatus(card, -8500).level, 'warn');
  const over = L.creditStatus(card, -11000);
  assert.equal(over.level, 'over');
  assert.equal(over.available, -1000);
  assert.equal(L.creditStatus(card, 500).available, 10500); // overpaid card
  assert.equal(L.creditStatus({ type: 'credit' }, -100), null); // no limit set
  assert.equal(L.creditStatus({ type: 'bank', creditLimit: 5000 }, -100), null); // not a card
});

test('accountSummary reports available credit across active cards', () => {
  const accounts = [
    { id: 'a', type: 'bank', openingBalance: 1000 },
    { id: 'c1', type: 'credit', creditLimit: 10000, openingBalance: -2000 },
    { id: 'c2', type: 'credit', creditLimit: 5000, openingBalance: -6000 },
    { id: 'c3', type: 'credit', creditLimit: 9000, openingBalance: 0, archived: true },
  ];
  const s = L.accountSummary(accounts, [], [], '2026-10-31');
  assert.equal(s.hasLimits, true);
  assert.equal(s.availableCredit, 8000); // 8000 + 0 (over-limit card counts as 0) ; archived ignored
  assert.equal(L.accountSummary([{ id: 'a', type: 'bank' }], [], [], '2026-10-31').hasLimits, false);
});

test('accountLedger: opening, running balance and totals for a period', () => {
  const acc = { id: 'a', openingBalance: 1000 };
  const txs = [
    { ...tx('2026-09-10', 'income', 500), accountId: 'a' },
    { ...tx('2026-10-05', 'expense', 200), accountId: 'a' },
    { ...tx('2026-10-20', 'income', 300), accountId: 'a' },
    { ...tx('2026-11-02', 'expense', 50), accountId: 'a' },
  ];
  const transfers = [{ id: 't', date: '2026-10-12', fromId: 'a', toId: 'b', amount: 400 }];
  const l = L.accountLedger(acc, txs, transfers, '2026-10-01', '2026-10-31');
  assert.equal(l.opening, 1500);
  assert.deepEqual(l.rows.map((r) => r.balanceAfter), [1300, 900, 1200]);
  assert.equal(l.inTotal, 300);
  assert.equal(l.outTotal, 600);
  assert.equal(l.closing, 1200);
  assert.equal(L.accountLedger(acc, txs, transfers).rows.length, 5);
  assert.equal(L.accountLedger(acc, txs, transfers).opening, 1000);
});

test('balanceSeries samples the running balance', () => {
  const acc = { id: 'a', openingBalance: 100 };
  const txs = [{ ...tx('2026-10-02', 'income', 50), accountId: 'a' }];
  const l = L.accountLedger(acc, txs, [], '2026-10-01', '2026-10-03');
  assert.deepEqual(L.balanceSeries(l, '2026-10-01', '2026-10-03'), [
    { date: '2026-10-01', value: 100 }, { date: '2026-10-02', value: 150 }, { date: '2026-10-03', value: 150 },
  ]);
  const long = L.accountLedger(acc, txs, [], '2026-01-01', '2026-12-31');
  assert.ok(L.balanceSeries(long, '2026-01-01', '2026-12-31').length < 60);
});

test('monthlyFlow splits money in and out per month', () => {
  const rows = [{ date: '2026-10-01', delta: 100 }, { date: '2026-10-02', delta: -30 }, { date: '2026-11-01', delta: -5 }];
  assert.deepEqual(L.monthlyFlow(rows, ['2026-10', '2026-11']), { income: [100, 0], expense: [30, 5] });
});

test('addMonthsToDate clamps to short months; monthsBetween', () => {
  assert.equal(L.addMonthsToDate('2026-01-31', 1), '2026-02-28');
  assert.equal(L.addMonthsToDate('2026-11-15', 3), '2027-02-15');
  assert.equal(L.monthsBetween('2026-01-15', '2027-01-15'), 12);
});

test('dueInterestDates: monthly schedule, paid dates and maturity are respected', () => {
  const it = { rate: 18, every: 'monthly', firstDate: '2026-08-15', paid: ['2026-08-15'] };
  assert.deepEqual(L.dueInterestDates(it, '2026-10-20'), ['2026-09-15', '2026-10-15']);
  assert.deepEqual(L.dueInterestDates({ ...it, maturityDate: '2026-09-30' }, '2026-10-20'), ['2026-09-15']);
  assert.deepEqual(L.dueInterestDates({ rate: 10, every: 'maturity', startDate: '2025-10-01', maturityDate: '2026-10-01' }, '2026-10-02'), ['2026-10-01']);
  assert.deepEqual(L.dueInterestDates({ ...it, closed: true }, '2026-10-20'), []);
});

test('interestFor: monthly, quarterly and at-maturity amounts', () => {
  assert.equal(L.interestFor({ rate: 18, every: 'monthly' }, 100000), 1500);
  assert.equal(L.interestFor({ rate: 12, every: 'quarterly' }, 100000), 3000);
  assert.equal(L.interestFor({ rate: 10, every: 'maturity', startDate: '2025-10-01' }, 100000, '2026-10-01'), 10000);
  assert.equal(L.interestFor({ rate: 10, every: 'monthly' }, -5), 0);
});


const certAcc = (certs, extra = {}) => ({ id: 'c', type: 'certificate', name: 'Deposits', openingBalance: certs.reduce((a, x) => a + (x.openingAmount || 0), 0), certs, ...extra });
const mkCert = (extra = {}) => ({ id: 'k1', name: 'Cert A', openingAmount: 100000, rate: 12, every: 'monthly', firstDate: '2026-09-01', payoutAccountId: 'bank', paid: [], ...extra });

test('certBalance values each certificate on its own', () => {
  const k1 = mkCert();
  const k2 = mkCert({ id: 'k2', openingAmount: 0, name: 'Cert B' });
  const acc = certAcc([k1, k2]);
  const transfers = [{ id: 't', date: '2026-10-01', fromId: 'bank', toId: 'c', amount: 5000, certId: 'k2' }, { id: 't2', date: '2026-10-05', fromId: 'c', toId: 'bank', amount: 2000, certId: 'k1' }];
  assert.equal(L.certBalance(acc, k1, [], transfers, '2026-10-31'), 98000);
  assert.equal(L.certBalance(acc, k2, [], transfers, '2026-10-31'), 5000);
  assert.equal(L.certBalance(acc, k2, [], transfers, '2026-09-30'), 0);
  assert.equal(L.accountBalance(acc, [], transfers, '2026-10-31'), 100000 + 5000 - 2000);
});

test('accrueInterest: several certificates, each at its own rate, once only', () => {
  const k1 = mkCert({ rate: 12 });
  const k2 = mkCert({ id: 'k2', name: 'Cert B', openingAmount: 50000, rate: 24, every: 'quarterly', firstDate: '2026-10-01' });
  const data = { accounts: [certAcc([k1, k2]), { id: 'bank', type: 'bank', openingBalance: 0 }], transactions: [], transfers: [] };
  const a = L.accrueInterest(data, '2026-10-05');
  const byCert = (id) => a.transactions.filter((t) => t.certId === id);
  assert.deepEqual(byCert('k1').map((t) => t.amount), [1000, 1000]); // 100000 * 12% / 12 for Sep 1 and Oct 1
  assert.deepEqual(byCert('k2').map((t) => t.amount), [3000]); // 50000 * 24% / 4
  assert.ok(a.transactions.every((t) => t.accountId === 'bank' && t.categoryId === 'i-interest' && t.autoInterest));
  assert.equal(L.accrueInterest(a, '2026-10-05'), a);
  assert.deepEqual(a.accounts[0].certs[1].paid, ['2026-10-01']);
});

test('accrueInterest reinvesting compounds that certificate only', () => {
  const k = mkCert({ openingAmount: 1200, payoutAccountId: '' });
  const other = mkCert({ id: 'k2', name: 'Other', openingAmount: 1200, payoutAccountId: 'bank' });
  const a = L.accrueInterest({ accounts: [certAcc([k, other]), { id: 'bank', type: 'bank' }], transactions: [], transfers: [] }, '2026-10-05');
  assert.deepEqual(a.transactions.filter((t) => t.certId === 'k1').map((t) => t.amount), [12, 12.12]);
  assert.deepEqual(a.transactions.filter((t) => t.certId === 'k2').map((t) => t.amount), [12, 12]);
  assert.equal(L.certBalance(a.accounts[0], a.accounts[0].certs[0], a.transactions, [], '2026-10-05'), 1224.12);
});

test('certSummary totals and upcoming payouts', () => {
  const k1 = mkCert({ rate: 12, firstDate: '2026-09-15', paid: ['2026-09-15', '2026-10-15'] });
  const k2 = mkCert({ id: 'k2', name: 'B', openingAmount: 50000, rate: 24, every: 'monthly', firstDate: '2026-09-20' });
  const k3 = mkCert({ id: 'k3', name: 'C', openingAmount: 7000, closed: true });
  const txs = [{ id: 'x', type: 'income', amount: 1000, certId: 'k1', autoInterest: true, accountId: 'bank', date: '2026-09-15' }];
  const s = L.certSummary(certAcc([k1, k2, k3]), txs, [], '2026-10-20');
  assert.equal(s.value, 150000);
  assert.equal(s.earned, 1000);
  assert.equal(s.yearly, 100000 * 0.12 + 50000 * 0.24);
  assert.deepEqual(s.rows[0].next, { date: '2026-11-15', amount: 1000 });
  assert.equal(s.rows[2].yearly, 0);
  assert.equal(s.next30, 1000); // only k1 (11-15) falls within 30 days of 10-20; k2's next payout is 11-20
  assert.equal(L.upcomingInterest(k1, 100000, '2026-10-20', 3).length, 3);
});

test('redeemCertificate redeems one certificate and leaves the others', () => {
  const k1 = mkCert();
  const k2 = mkCert({ id: 'k2', name: 'B', openingAmount: 20000 });
  const base = () => ({ accounts: [certAcc([k1, k2]), { id: 'bank', type: 'bank', openingBalance: 0 }], transactions: [], transfers: [] });
  const more = L.redeemCertificate(base(), { accountId: 'c', certId: 'k1', principal: 100000, received: 101000, toId: 'bank', date: '2026-10-10' });
  assert.equal(more.transfers[0].certId, 'k1');
  assert.equal(more.transfers[0].amount, 100000);
  assert.equal(more.transactions[0].amount, 1000);
  assert.equal(more.accounts[0].certs[0].closed, true);
  assert.equal(more.accounts[0].certs[1].closed, undefined);
  assert.equal(L.certBalance(more.accounts[0], more.accounts[0].certs[0], more.transactions, more.transfers, '2026-10-10'), 0);
  assert.equal(L.accountBalance(more.accounts[0], more.transactions, more.transfers, '2026-10-10'), 20000);
  const less = L.redeemCertificate(base(), { accountId: 'c', certId: 'k1', principal: 100000, received: 98000, toId: 'bank', date: '2026-10-10' });
  assert.equal(less.transactions[0].type, 'expense');
  assert.equal(L.certBalance(less.accounts[0], less.accounts[0].certs[0], less.transactions, less.transfers, '2026-10-10'), 0);
  const part = L.redeemCertificate(base(), { accountId: 'c', certId: 'k1', principal: 40000, received: 40000, toId: 'bank', date: '2026-10-10' });
  assert.equal(part.accounts[0].certs[0].closed, undefined);
  assert.equal(L.certBalance(part.accounts[0], part.accounts[0].certs[0], part.transactions, part.transfers, '2026-10-10'), 60000);
});

test('saveCert keeps the opening balance in step; deleteCert only when unused', () => {
  const data = { accounts: [certAcc([])], transactions: [], transfers: [] };
  const a = L.saveCert(data, 'c', mkCert({ openingAmount: 1000 }));
  const b = L.saveCert(a, 'c', mkCert({ id: 'k2', openingAmount: 500 }));
  assert.equal(b.accounts[0].openingBalance, 1500);
  assert.equal(L.saveCert(b, 'c', mkCert({ openingAmount: 2000 })).accounts[0].certs.length, 2);
  assert.equal(L.deleteCert(b, 'c', 'k2').accounts[0].openingBalance, 1000);
  const used = { ...b, transfers: [{ id: 't', certId: 'k2', fromId: 'x', toId: 'c', amount: 1, date: '2026-01-01' }] };
  assert.equal(L.deleteCert(used, 'c', 'k2'), used);
});

test('migrateCertificates turns the old single-interest account into one certificate', () => {
  const old = { id: 'c', type: 'certificate', name: 'NBE', openingBalance: 30000, interest: { rate: 18, every: 'monthly', firstDate: '2026-09-01', payoutAccountId: 'bank', paid: ['2026-09-01'] } };
  const reinv = { id: 'r', type: 'certificate', name: 'R', openingBalance: 1000, interest: { rate: 12, every: 'monthly', firstDate: '2026-09-01', payoutAccountId: 'r', paid: [] } };
  const data = {
    accounts: [old, reinv, { id: 'bank', type: 'bank' }],
    transactions: [{ id: 'a', accountId: 'bank', sourceId: 'c', type: 'income', amount: 450 }, { id: 'b', accountId: 'bank', type: 'income', amount: 5 }],
    transfers: [{ id: 't', fromId: 'bank', toId: 'c', amount: 10, date: '2026-01-01' }],
  };
  const m = L.migrateCertificates(data);
  assert.equal(m.accounts[0].interest, undefined);
  assert.deepEqual(m.accounts[0].certs[0], { id: 'c-c1', name: 'NBE', openingAmount: 30000, rate: 18, every: 'monthly', firstDate: '2026-09-01', startDate: undefined, maturityDate: undefined, payoutAccountId: 'bank', paid: ['2026-09-01'], closed: false });
  assert.equal(m.accounts[1].certs[0].payoutAccountId, '');
  assert.equal(m.transactions[0].certId, 'c-c1');
  assert.equal(m.transactions[1].certId, undefined);
  assert.equal(m.transfers[0].certId, 'c-c1');
  assert.equal(L.migrateCertificates(m), m);
});

test('i18n: no duplicate keys and both languages have the same keys', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
  for (const [name, start] of [['ar', 'const ar = {'], ['en', 'const en = {']]) {
    const from = src.indexOf(start);
    const body = src.slice(from, src.indexOf('\n};', from));
    const keys = [...body.matchAll(/'([a-zA-Z0-9_.\- ]+)':/g)].map((m) => m[1]);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    assert.deepEqual(dupes, [], `${name} has duplicate keys`);
  }
  const { DICT } = await import('../src/i18n.js');
  assert.deepEqual(Object.keys(DICT.ar).sort(), Object.keys(DICT.en).sort());
});

test('buildCert: first interest one period after the start date; past interest skipped unless asked', () => {
  const terms = { name: 'A', value: 100000, rate: 18, every: 'monthly', startDate: '2026-08-10', payoutAccountId: 'bank' };
  const skip = L.buildCert(terms, '2026-11-12');
  assert.equal(skip.firstDate, '2026-09-10');
  assert.deepEqual(skip.paid, ['2026-09-10', '2026-10-10', '2026-11-10']);
  assert.equal(skip.openingAmount, 100000);
  const incl = L.buildCert(terms, '2026-11-12', true);
  assert.deepEqual(incl.paid, []);
  const q = L.buildCert({ ...terms, every: 'quarterly' }, '2026-11-12');
  assert.equal(q.firstDate, '2026-11-10');
  assert.deepEqual(q.paid, ['2026-11-10']);
  const m = L.buildCert({ ...terms, every: 'maturity', maturityDate: '2027-08-10' }, '2026-11-12');
  assert.equal(m.firstDate, undefined);
  assert.deepEqual(m.paid, []);
});

test('buildCert then accrue: only future payouts are credited when past interest is skipped', () => {
  const c = L.buildCert({ name: 'A', value: 12000, rate: 12, every: 'monthly', startDate: '2026-08-10', payoutAccountId: 'bank' }, '2026-11-12');
  const data = { accounts: [{ id: 'c', type: 'certificate', openingBalance: 12000, certs: [c] }, { id: 'bank', type: 'bank' }], transactions: [], transfers: [] };
  assert.equal(L.accrueInterest(data, '2026-11-12'), data);
  const later = L.accrueInterest(data, '2026-12-11');
  assert.deepEqual(later.transactions.map((t) => [t.date, t.amount]), [['2026-12-10', 120]]);
});

test('saveCerts adds many at once and keeps the opening balance as their sum', () => {
  const base = { accounts: [{ id: 'c', type: 'certificate', certs: [] }], transactions: [], transfers: [] };
  const certs = [1, 2, 3].map((i) => L.buildCert({ name: 'C' + i, value: i * 1000, rate: 10, every: 'yearly', startDate: '2026-01-01' }, '2026-11-12'));
  const out = L.saveCerts(base, 'c', certs);
  assert.equal(out.accounts[0].certs.length, 3);
  assert.equal(out.accounts[0].openingBalance, 6000);
});

test('bulkEditCerts: rate and payout account for many; frequency re-anchors after today; skips what cannot', () => {
  const mk = (id, extra = {}) => ({ id, name: id, openingAmount: 1000, rate: 10, every: 'monthly', startDate: '2026-08-10', firstDate: '2026-09-10', payoutAccountId: 'bank', paid: [], ...extra });
  const data = { accounts: [{ id: 'c', type: 'certificate', certs: [mk('a'), mk('b'), mk('old', { startDate: undefined }), mk('closed', { closed: true })] }], transactions: [], transfers: [] };
  const r1 = L.bulkEditCerts(data, 'c', ['a', 'b', 'closed'], { rate: 15, payoutAccountId: '' }, '2026-11-12');
  assert.deepEqual(r1.data.accounts[0].certs.map((c) => [c.rate, c.payoutAccountId]), [[15, ''], [15, ''], [10, 'bank'], [10, 'bank']]);
  assert.equal(r1.edited, 2);
  const r2 = L.bulkEditCerts(data, 'c', ['a'], { every: 'quarterly' }, '2026-11-12');
  assert.equal(r2.data.accounts[0].certs[0].every, 'quarterly');
  assert.equal(r2.data.accounts[0].certs[0].firstDate, '2027-02-10'); // 08-10 +3,+6 (11-10 is past), next 2027-02-10? 
  const r3 = L.bulkEditCerts(data, 'c', ['a'], { every: 'maturity' }, '2026-11-12');
  assert.equal(r3.skipped, 1); // no maturity date to pay out on
  const r4 = L.bulkEditCerts(data, 'c', ['a', 'b'], { every: 'maturity', maturityDate: '2027-08-10' }, '2026-11-12');
  assert.equal(r4.data.accounts[0].certs[0].firstDate, undefined);
  assert.equal(r4.data.accounts[0].certs[0].maturityDate, '2027-08-10');
});

test('deleteCerts removes the unused ones only', () => {
  const data = { accounts: [{ id: 'c', type: 'certificate', certs: [{ id: 'a', openingAmount: 1 }, { id: 'b', openingAmount: 2 }] }], transactions: [{ id: 't', certId: 'b' }], transfers: [] };
  const r = L.deleteCerts(data, 'c', ['a', 'b']);
  assert.equal(r.deleted, 1);
  assert.equal(r.kept, 1);
  assert.deepEqual(r.data.accounts[0].certs.map((c) => c.id), ['b']);
});

test('parseEvery / parseDateText understand English, Arabic and spreadsheet formats', () => {
  assert.equal(L.parseEvery('شهري'), 'monthly');
  assert.equal(L.parseEvery('Quarterly'), 'quarterly');
  assert.equal(L.parseEvery('ربع سنوي'), 'quarterly');
  assert.equal(L.parseEvery('نصف سنوي'), 'semiannual');
  assert.equal(L.parseEvery('Annual'), 'yearly');
  assert.equal(L.parseEvery('في آخر المدة'), 'maturity');
  assert.equal(L.parseEvery('whenever'), null);
  assert.equal(L.parseDateText('2026-03-01'), '2026-03-01');
  assert.equal(L.parseDateText('01/05/2026'), '2026-05-01');
  assert.equal(L.parseDateText('١٥/٠٣/٢٠٢٦'), '2026-03-15');
  assert.equal(L.parseDateText('31/02/2026'), null);
  assert.equal(L.parseDateText('soon'), null);
});

test('parseCertLines reads pasted rows and counts the unreadable ones', () => {
  const text = ['100000, 18, 2026-03-01, شهري', '50,000\t21%\t01/05/2026\tربع سنوي', '٢٠٠٠٠;١٥;١٠/٠٦/٢٠٢٦;Annual', '75000 | 17 | 2026-02-01 | maturity | 2027-02-01', 'garbage line', '1000, 0, 2026-01-01, monthly', '30000, 19'].join('\n');
  const { rows, skipped } = L.parseCertLines(text, '2026-11-12');
  assert.equal(skipped, 2);
  assert.deepEqual(rows.map((r) => [r.value, r.rate, r.startDate, r.every, r.maturityDate]), [
    [100000, 18, '2026-03-01', 'monthly', ''],
    [50000, 21, '2026-05-01', 'quarterly', ''],
    [20000, 15, '2026-06-10', 'yearly', ''],
    [75000, 17, '2026-02-01', 'maturity', '2027-02-01'],
    [30000, 19, '2026-11-12', 'monthly', ''],
  ]);
});
