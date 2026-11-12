import { useMemo, useState } from 'react';
import { useApp } from './store.jsx';
import {
  BUCKET_ORDER, accountSummary, addMonths, budgetStatus, categoryShares, creditStatus, currentMonth, daysSince, dueBucket, fmt, frequentCategories,
  groupByDate, isoDate, lastEntry, monthOf, monthRange, monthlySeries, pctChange, savingsRate, spendPace, totals, unpaidForMonth,
} from './logic.js';
import { BarChart, Donut, Icon, MonthNav } from './ui.jsx';
import AddSheet from './AddSheet.jsx';
import { BalanceText } from './AccountBits.jsx';
import PaySheet, { defaultPayDate } from './PaySheet.jsx';
import { exportBackup } from './backup.js';

const PAGE = 20;

// "▲ 12%" style chip; `badWhenUp` flips which direction is shown as good.
function Delta({ pct, badWhenUp }) {
  if (pct === null) return null;
  if (pct === 0) return <span className="delta">＝</span>;
  const up = pct > 0;
  const good = badWhenUp ? !up : up;
  return <span className={'delta ' + (good ? 'good' : 'bad')}>{up ? '▲' : '▼'} {Math.abs(pct)}%</span>;
}

export default function Home({ go }) {
  const { state, dispatch, t, toast, catName, accName, catColor, monthLabel, monthShort, dayLabel } = useApp();
  const today = isoDate();
  const nowMonth = currentMonth();
  const [month, setMonth] = useState(nowMonth);
  const [edit, setEdit] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [add, setAdd] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const cur = state.settings.currency;
  const txs = state.transactions;
  const prevMonth = addMonths(month, -1);

  const now = totals(txs, month);
  const prev = totals(txs, prevMonth);
  const hasPrev = prev.income > 0 || prev.expense > 0;
  const rate = savingsRate(now.income, now.expense);
  const pace = spendPace(now.expense, month, today);

  const shares = categoryShares(txs, month, 'expense');
  const top = shares.slice(0, 4);
  const restShare = shares.slice(4).reduce((a, s) => a + s.share, 0);
  const slices = [
    ...top.map((s) => ({ color: catColor(s.categoryId), share: s.share, total: s.total, label: catName(s.categoryId) })),
    ...(restShare > 0 ? [{ color: '#7A7F85', share: restShare, total: shares.slice(4).reduce((a, s) => a + s.total, 0), label: t('common.other') }] : []),
  ];

  const accSummary = accountSummary(state.accounts, txs, state.transfers, today);
  const activeAccounts = accSummary.rows.filter((r) => !r.acc.archived);

  const budgets = budgetStatus(state.categories, txs, month);

  const trendMonths = monthRange(addMonths(month, -5), month);
  const trendIncome = monthlySeries(txs, trendMonths, 'income');
  const trendExpense = monthlySeries(txs, trendMonths, 'expense');
  const hasTrend = [...trendIncome, ...trendExpense].some((v) => v > 0);

  const unpaid = useMemo(() => {
    const months = month === nowMonth ? Array.from({ length: 12 }, (_, i) => addMonths(nowMonth, -i)) : [month];
    const out = [];
    for (const m of months) {
      for (const u of unpaidForMonth(state.recurring, state.payments, m, nowMonth)) {
        out.push({ ...u, month: m, bucket: dueBucket(u.rec, m, nowMonth, today) });
      }
    }
    return out.sort((a, b) => BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket] || a.month.localeCompare(b.month) || a.rec.dueDay - b.rec.dueDay);
  }, [state.recurring, state.payments, month, nowMonth, today]);
  const unpaidTotal = unpaid.reduce((a, u) => a + u.rec.amount, 0);

  const quickPay = (u) => {
    dispatch({ type: 'pay/mark', rec: u.rec, month: u.month, amount: u.rec.amount, date: defaultPayDate(u.rec, u.month) });
    toast(t('home.paidToast', { name: u.rec.name, amt: fmt(u.rec.amount), cur }));
  };

  // quick add helpers
  const frequent = frequentCategories(txs, 'expense', today).filter((id) => state.categories.some((c) => c.id === id && !c.archived));
  const last = lastEntry(txs);
  const open = (type, preset) => setAdd({ type, preset });

  // entries list
  const q = query.trim().toLowerCase();
  const monthTxs = txs.filter((x) => monthOf(x.date) === month);
  const filtered = monthTxs.filter((x) => (filter === 'all' || x.type === filter) && (!q || (x.note || '').toLowerCase().includes(q) || catName(x.categoryId).toLowerCase().includes(q)));
  const allGroups = groupByDate(filtered);
  const groups = [];
  let count = 0;
  for (const g of allGroups) {
    if (count >= limit) break;
    groups.push(g);
    count += g.items.length;
  }
  const yesterday = isoDate(new Date(Date.now() - 86400000));
  const dayTitle = (d) => (d === today ? t('home.today') : d === yesterday ? t('home.yesterday') : dayLabel(d));

  const backupAge = daysSince(state.settings.lastBackup, today);
  const needsBackup = txs.length >= 5 && (backupAge === null || backupAge > 30);
  const isNew = txs.length === 0 && state.recurring.length === 0;

  return (
    <div className="screen">
      <MonthNav month={month} onChange={(m) => { setMonth(m); setLimit(PAGE); }} />

      {isNew && (
        <div className="card welcome">
          <h3>{t('home.welcome')}</h3>
          <ol>
            <li>{t('home.welcome1')}</li>
            <li>{t('home.welcome2')}</li>
            <li>{t('home.welcome3')}</li>
          </ol>
        </div>
      )}

      <div className="hero">
        <div className="label">{t('home.net')}</div>
        <div className="big">
          <span dir="ltr">{now.net >= 0 ? '+ ' : '− '}{fmt(Math.abs(now.net))}</span> <small>{cur}</small>
        </div>
        <div className="pair">
          <div>
            <span className="label">{t('common.income')}</span>
            <b style={{ color: 'var(--income)' }}>{fmt(now.income)}</b>
            {hasPrev && <Delta pct={pctChange(now.income, prev.income)} />}
          </div>
          <div>
            <span className="label">{t('common.expenses')}</span>
            <b style={{ color: 'var(--expense)' }}>{fmt(now.expense)}</b>
            {hasPrev && <Delta pct={pctChange(now.expense, prev.expense)} badWhenUp />}
          </div>
        </div>
        {hasPrev && <div className="label small">{t('home.vsPrev', { month: monthShort(prevMonth) })}</div>}
        {rate !== null && (
          <div className="savings">
            <div className="row between">
              <span className="label">{t('home.savings')}</span>
              <b dir="ltr">{rate}%</b>
            </div>
            <div className="bar"><i style={{ width: Math.max(0, Math.min(100, rate)) + '%' }} /></div>
            {rate < 0 && <div className="label small" style={{ color: 'var(--expense)' }}>{t('home.overspent')}</div>}
          </div>
        )}
        {pace && (
          <>
            <div className="pair">
              <div><span className="label">{t('home.daily')}</span><b>{fmt(pace.daily)}</b></div>
              <div><span className="label">{t('home.forecast')}</span><b>{fmt(pace.forecast)}</b></div>
            </div>
            <div className="label small">{t('home.forecastNote', { amt: fmt(pace.forecast), cur })}</div>
          </>
        )}
      </div>

      {activeAccounts.length > 1 ? (
        <button className="card account-card" onClick={() => go('accounts')}>
          <div className="row between">
            <h3>{t('home.accounts')}</h3>
            <span className="bold" dir="ltr">{accSummary.total < 0 ? '−' : ''}{fmt(Math.abs(accSummary.total))} {cur}</span>
          </div>
          <div className="acc-list">
            {activeAccounts.slice(0, 5).map((r) => (
              <div key={r.acc.id} className="acc-row">
                <span className="dot" style={{ background: r.acc.color, width: 10, height: 10 }} />
                <span className="grow">
                  {accName(r.acc.id)}
                  {creditStatus(r.acc, r.balance) && (
                    <span className={'muted small ' + (creditStatus(r.acc, r.balance).level === 'over' ? 'bad-text' : '')}> · {t('acc.availableShort', { amt: fmt(Math.max(creditStatus(r.acc, r.balance).available, 0)) })}</span>
                  )}
                </span>
                <b><BalanceText acc={r.acc} balance={r.balance} cur="" /></b>
              </div>
            ))}
          </div>
        </button>
      ) : (
        txs.length > 0 && (
          <div className="card notice">
            <div>{t('home.accountsCta')}</div>
            <button className="btn secondary small" onClick={() => go('accounts')}>{t('home.accountsBtn')}</button>
          </div>
        )
      )}

      <div className="card">
        <h3>{t('home.quick')}</h3>
        <div className="pair" style={{ gap: 10 }}>
          <button className="btn" onClick={() => open('expense')}>{t('home.addExpense')}</button>
          <button className="btn secondary" onClick={() => open('income')}>{t('home.addIncome')}</button>
        </div>
        {frequent.length > 0 && (
          <div className="chips">
            {frequent.map((id) => (
              <button key={id} className="chip" onClick={() => open('expense', { type: 'expense', categoryId: id })}>
                <span className="dot" style={{ background: catColor(id), display: 'inline-block', marginInlineEnd: 8, verticalAlign: -1 }} />
                {catName(id)}
              </button>
            ))}
          </div>
        )}
        {last && (
          <button className="chip dash repeat" onClick={() => open(last.type, { type: last.type, categoryId: last.categoryId, amount: last.amount, note: last.note, accountId: last.accountId })}>
            <Icon name="repeat" size={16} /> {t('home.repeat')}: {t('home.repeatLabel', { cat: catName(last.categoryId), amt: fmt(last.amount) })}
          </button>
        )}
      </div>

      {needsBackup && (
        <div className="card notice">
          <div>{backupAge === null ? t('home.backupNever') : t('home.backupOld', { n: backupAge })}</div>
          <button className="btn small" onClick={() => { exportBackup(state, dispatch); toast(t('set.backupDone')); }}>{t('home.backupBtn')}</button>
        </div>
      )}

      {budgets.length > 0 ? (
        <div className="card">
          <h3>{t('home.budgets')}</h3>
          {budgets.slice(0, 5).map((b) => (
            <div key={b.cat.id} className="budget">
              <div className="row between">
                <span className="row" style={{ gap: 8 }}>
                  <span className="dot" style={{ background: b.cat.color, width: 10, height: 10 }} />
                  {catName(b.cat.id)}
                </span>
                <span className="small muted">{t('home.budgetOf', { spent: fmt(b.spent), budget: fmt(b.budget) })}</span>
              </div>
              <div className={'meter ' + b.level} role="progressbar" aria-valuenow={Math.round(b.ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
                <i style={{ width: Math.min(100, b.ratio * 100) + '%' }} />
              </div>
              <div className={'small ' + (b.level === 'over' ? 'bad-text bold' : 'muted')}>
                {b.level === 'over' ? t('home.budgetOver', { amt: fmt(b.spent - b.budget) }) : t('home.budgetLeft', { amt: fmt(b.budget - b.spent) })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        txs.length > 0 && (
          <div className="card notice">
            <div>{t('home.budgetsCta')}</div>
            <button className="btn secondary small" onClick={() => go('settings')}>{t('home.budgetsBtn')}</button>
          </div>
        )
      )}

      <div className="card">
        <h3>{t('home.byCat')}</h3>
        {slices.length === 0 ? (
          <div className="empty">{t('home.noExpenses', { month: monthLabel(month) })}</div>
        ) : (
          <div className="row" style={{ gap: 18 }}>
            <Donut slices={slices} label={t('home.byCat')} />
            <div className="grow legend-list">
              {slices.map((s, i) => (
                <div key={i} className="row" style={{ gap: 8 }}>
                  <span className="dot" style={{ background: s.color, width: 10, height: 10 }} />
                  <span className="grow">{s.label}</span>
                  <b>{Math.round(s.share * 100)}%</b>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {hasTrend && (
        <div className="card">
          <h3>{t('home.trend')}</h3>
          <BarChart months={trendMonths} income={trendIncome} expense={trendExpense} />
          <div className="legend">
            <span><i style={{ background: 'var(--chart-income)' }} />{t('common.income')}</span>
            <span><i style={{ background: 'var(--chart-expense)' }} />{t('common.expenses')}</span>
          </div>
        </div>
      )}

      {unpaid.length > 0 && (
        <div className="card">
          <div className="row between">
            <h3>{t('home.unpaid')} <span className="muted small">({unpaid.length})</span></h3>
            <span className="muted small bold">{t('home.unpaidTotal', { amt: fmt(unpaidTotal), cur })}</span>
          </div>
          <div className="list">
            {unpaid.map((u) => (
              <div key={u.rec.id + u.month} className="item">
                <button className="grow unstyled" onClick={() => setPayFor({ rec: u.rec, month: u.month })}>
                  <div>{u.rec.name} · <b>{fmt(u.rec.amount)}</b></div>
                  <div className="row" style={{ gap: 6, marginTop: 2 }}>
                    <span className={'tag ' + (u.bucket === 'overdue' ? 'warn' : u.bucket === 'soon' ? 'mid' : 'plain')}>{t('home.' + u.bucket)}</span>
                    <span className="small muted">{u.month < nowMonth ? monthShort(u.month) : t('home.dueDay', { day: u.rec.dueDay })}</span>
                  </div>
                </button>
                <button className="btn small" onClick={() => quickPay(u)}>{t('home.payNow')}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3>{t('home.entries', { month: monthLabel(month) })}</h3>
        {monthTxs.length > 0 && (
          <>
            <div className="seg" role="group">
              {[['all', t('home.filterAll')], ['expense', t('common.expenses')], ['income', t('common.income')]].map(([k, label]) => (
                <button key={k} className={filter === k ? 'on' : ''} onClick={() => { setFilter(k); setLimit(PAGE); }}>{label}</button>
              ))}
            </div>
            <label className="search">
              <Icon name="search" size={18} />
              <input type="search" placeholder={t('home.search')} aria-label={t('home.search')} value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} />
            </label>
          </>
        )}
        {monthTxs.length === 0 ? (
          <div className="empty">{t('home.nothing')}</div>
        ) : groups.length === 0 ? (
          <div className="empty">{t('home.noMatch')}</div>
        ) : (
          <div className="list">
            {groups.map((g) => {
              const net = g.income - g.expense;
              return (
                <div key={g.date} className="day">
                  <div className="row between day-head">
                    <span>{dayTitle(g.date)}</span>
                    <span dir="ltr">{net >= 0 ? '+' : '−'}{fmt(Math.abs(net))}</span>
                  </div>
                  {g.items.map((x) => (
                    <button key={x.id} className="item" onClick={() => setEdit(x)}>
                      <span className="dot" style={{ background: catColor(x.categoryId) }} />
                      <span className="grow">
                        <div>{catName(x.categoryId)}</div>
                        {(x.note || activeAccounts.length > 1) && (
                          <div className="muted small">{[activeAccounts.length > 1 ? accName(x.accountId) : '', x.note].filter(Boolean).join(' · ')}</div>
                        )}
                      </span>
                      <span className={x.type === 'income' ? 'amount-in' : 'amount-out'} dir="ltr">{x.type === 'income' ? '+' : '−'}{fmt(x.amount)}</span>
                    </button>
                  ))}
                </div>
              );
            })}
            {groups.length < allGroups.length && (
              <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => setLimit(limit + PAGE)}>{t('home.more')}</button>
            )}
          </div>
        )}
      </div>

      {edit && <AddSheet tx={edit} onClose={() => setEdit(null)} />}
      {add && <AddSheet defaultType={add.type} preset={add.preset} onClose={() => setAdd(null)} />}
      {payFor && <PaySheet rec={payFor.rec} month={payFor.month} onClose={() => setPayFor(null)} />}
    </div>
  );
}
