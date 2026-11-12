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

const accOf = (extra = {}) => ({ id: 'c', type: 'certificate', name: 'Cert', openingBalance: 100000, ...extra });

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

test('accrueInterest credits due interest once and is idempotent', () => {
  const cert = accOf({ interest: { rate: 12, every: 'monthly', firstDate: '2026-09-01', payoutAccountId: 'bank', paid: [] } });
  const data = { accounts: [cert, { id: 'bank', type: 'bank', openingBalance: 0 }], transactions: [], transfers: [] };
  const a = L.accrueInterest(data, '2026-10-05');
  assert.equal(a.transactions.length, 2);
  assert.ok(a.transactions.every((t) => t.type === 'income' && t.amount === 1000 && t.accountId === 'bank' && t.categoryId === 'i-interest'));
  assert.deepEqual(a.accounts[0].interest.paid, ['2026-09-01', '2026-10-01']);
  assert.equal(L.accrueInterest(a, '2026-10-05'), a); // nothing new -> same object
  assert.equal(L.accrueInterest(a, '2026-11-01').transactions.length, 3);
  // deleting a generated entry does not bring it back
  const deleted = { ...a, transactions: [] };
  assert.equal(L.accrueInterest(deleted, '2026-10-05').transactions.length, 0);
});

test('accrueInterest into the certificate itself compounds', () => {
  const cert = accOf({ openingBalance: 1200, interest: { rate: 12, every: 'monthly', firstDate: '2026-09-01', payoutAccountId: 'c', paid: [] } });
  const a = L.accrueInterest({ accounts: [cert], transactions: [], transfers: [] }, '2026-10-05');
  assert.deepEqual(a.transactions.map((t) => t.amount), [12, 12.12]);
});

test('nextInterest estimates the coming payout', () => {
  const cert = accOf({ interest: { rate: 12, every: 'monthly', firstDate: '2026-09-15', paid: [] } });
  assert.deepEqual(L.nextInterest(cert, 100000, '2026-10-20'), { date: '2026-11-15', amount: 1000 });
  assert.equal(L.nextInterest({ ...cert, interest: { ...cert.interest, maturityDate: '2026-10-31' } }, 100000, '2026-10-20'), null);
});

test('redeemCertificate: full redemption with extra interest and with penalty', () => {
  const base = () => ({ accounts: [accOf({ interest: { rate: 10, every: 'monthly', firstDate: '2026-09-01', paid: [] } }), { id: 'bank', type: 'bank', openingBalance: 0 }], transactions: [], transfers: [] });
  const more = L.redeemCertificate(base(), { accountId: 'c', principal: 100000, received: 101000, toId: 'bank', date: '2026-10-10' });
  assert.equal(more.transfers[0].amount, 100000);
  assert.equal(more.transactions[0].amount, 1000);
  assert.equal(more.accounts[0].archived, true);
  assert.equal(more.accounts[0].interest.closed, true);
  assert.equal(L.accountBalance(more.accounts[0], more.transactions, more.transfers, '2026-10-10'), 0);
  assert.equal(L.accountBalance(more.accounts[1], more.transactions, more.transfers, '2026-10-10'), 101000);
  const less = L.redeemCertificate(base(), { accountId: 'c', principal: 100000, received: 98000, toId: 'bank', date: '2026-10-10' });
  assert.equal(less.transfers[0].amount, 98000);
  assert.equal(less.transactions[0].type, 'expense');
  assert.equal(L.accountBalance(less.accounts[0], less.transactions, less.transfers, '2026-10-10'), 0);
  const part = L.redeemCertificate(base(), { accountId: 'c', principal: 40000, received: 40000, toId: 'bank', date: '2026-10-10' });
  assert.equal(part.accounts[0].archived, undefined);
  assert.equal(L.accountBalance(part.accounts[0], part.transactions, part.transfers, '2026-10-10'), 60000);
});
