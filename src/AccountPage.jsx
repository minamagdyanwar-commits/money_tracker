import { useMemo, useState } from 'react';
import { useApp } from './store.jsx';
import { accountLedger, addMonths, balanceSeries, certSummary, fmt, isoDate, monthOf, monthRange, monthlyFlow, periodRange } from './logic.js';
import { BarChart, Field, Icon, TrendChart } from './ui.jsx';
import { BalanceText, CreditMeter, certRateLine } from './AccountBits.jsx';

const PRESETS = ['month', '3m', '6m', 'year', 'all', 'custom'];
const PAGE = 25;

// One account in full: balance, certificate / card details, a period selector with summary and charts,
// and the complete history (entries and transfers) with the balance after each, tap to edit.
export default function AccountPage({ acc, onBack, onEdit, onTransfer, onAdd, onEditTx, onEditTransfer, onAddCert, onOpenCert }) {
  const { state, t, catName, catColor, accName, dayLabel } = useApp();
  const today = isoDate();
  const cur = state.settings.currency;
  const [preset, setPreset] = useState('3m');
  const [customFrom, setCustomFrom] = useState(`${addMonths(monthOf(today), -2)}-01`);
  const [customTo, setCustomTo] = useState(today);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [certFilter, setCertFilter] = useState('all');

  const range = preset === 'custom' ? { from: customFrom, to: customTo } : periodRange(preset, today);
  const validRange = !range.from || !range.to || range.from <= range.to;
  const full = useMemo(() => accountLedger(acc, state.transactions, state.transfers), [acc, state.transactions, state.transfers]);
  const ledger = useMemo(
    () => (validRange ? accountLedger(acc, state.transactions, state.transfers, range.from, range.to) : { rows: [], opening: 0, closing: 0, inTotal: 0, outTotal: 0 }),
    [acc, state.transactions, state.transfers, range.from, range.to, validRange]
  );
  const nowBalance = full.closing;

  const chartFrom = range.from || full.rows[0]?.date || today;
  const chartTo = range.to || today;
  const series = useMemo(() => (validRange ? balanceSeries(ledger, chartFrom, chartTo) : []), [ledger, chartFrom, chartTo, validRange]);
  const months = useMemo(() => {
    if (!validRange) return [];
    const all = monthRange(monthOf(chartFrom), monthOf(chartTo));
    return all.slice(-24);
  }, [chartFrom, chartTo, validRange]);
  const flow = monthlyFlow(ledger.rows, months);

  const q = query.trim().toLowerCase();
  const label = (r) => (r.kind === 'tx' ? catName(r.tx.categoryId) : t(r.delta > 0 ? 'tr.in' : 'tr.out', { name: accName(r.otherId) }));
  const noteOf = (r) => (r.kind === 'tx' ? r.tx.note : r.transfer.note);
  const certOf = (r) => (r.kind === 'tx' ? r.tx.certId : r.transfer.certId);
  const rows = [...ledger.rows]
    .reverse()
    .filter((r) => (certFilter === 'all' || certOf(r) === certFilter) && (filter === 'all' || (filter === 'in' && r.delta > 0) || (filter === 'out' && r.delta < 0) || (filter === 'transfer' && r.kind === 'transfer')) && (!q || label(r).toLowerCase().includes(q) || (noteOf(r) || '').toLowerCase().includes(q)));
  const groups = [];
  let shown = 0;
  for (const r of rows) {
    if (shown >= limit) break;
    const g = groups[groups.length - 1];
    if (g && g.date === r.date) g.items.push(r);
    else groups.push({ date: r.date, items: [r] });
    shown += 1;
  }

  const isCert = acc.type === 'certificate';
  const summary = isCert ? certSummary(acc, state.transactions, state.transfers, today) : null;
  const stat = (key, value) => (
    <div className="stat"><div>{t(key)}</div><div dir="ltr">{value}</div></div>
  );

  return (
    <div className="screen">
      <div className="row between">
        <button className="iconbtn" aria-label={t('acc.back')} onClick={onBack}><Icon name="left" size={22} className="flip" /></button>
        <div className="h1 grow" style={{ textAlign: 'center' }}>{accName(acc.id)}</div>
        <span style={{ width: 44 }} />
      </div>

      <div className="card">
        <div className="muted small">{t('acc.balance')} · {t('acc.type.' + acc.type)}{acc.archived ? ' ' + t('acc.archivedTag') : ''}</div>
        <div className="big-num"><BalanceText acc={acc} balance={nowBalance} cur={cur} /></div>
        <CreditMeter acc={acc} balance={nowBalance} cur={cur} />
      </div>

      <div className="chips">
        <button className="btn small" onClick={onAdd}>{t('acc.addEntry')}</button>
        <button className="btn small secondary" onClick={onTransfer}>{t('acc.transfer')}</button>
        {isCert && <button className="btn small secondary" onClick={onAddCert}>{t('cert.add')}</button>}
        <button className="btn small secondary" onClick={onEdit}>{t('common.edit')}</button>
      </div>

      {isCert && (
        <div className="card">
          <h3>{t('cert.title')} <span className="muted small">({summary.rows.length})</span></h3>
          {summary.rows.length === 0 ? (
            <div className="empty">{t('cert.noCerts')}</div>
          ) : (
            <>
              <div className="stats four">
                <div className="stat"><div>{t('cert.totalValue')}</div><div dir="ltr">{fmt(summary.value)}</div></div>
                <div className="stat"><div>{t('cert.yearlyInterest')}</div><div dir="ltr">{fmt(summary.yearly)}</div></div>
                <div className="stat"><div>{t('cert.next30')}</div><div dir="ltr">{fmt(summary.next30)}</div></div>
                <div className="stat"><div>{t('cert.earned')}</div><div dir="ltr">{fmt(summary.earned)}</div></div>
              </div>
              <div className="list">
                {summary.rows.map((r) => (
                  <button key={r.cert.id} className="item" style={{ opacity: r.cert.closed ? 0.55 : 1 }} onClick={() => onOpenCert(r.cert)}>
                    <span className="grow">
                      <div className="bold">{r.cert.name} {r.cert.closed && <span className="tag plain">{t('cert.closed')}</span>}</div>
                      <div className="muted small">{certRateLine(t, r.cert)}</div>
                      {r.next && <div className="small">{t('cert.next', { date: dayLabel(r.next.date), amt: fmt(r.next.amount) + ' ' + cur })}</div>}
                    </span>
                    <b dir="ltr">{fmt(r.balance)}</b>
                  </button>
                ))}
              </div>
            </>
          )}
          <button className="btn secondary" onClick={onAddCert}>{t('cert.add')}</button>
        </div>
      )}

      <div className="chips" role="group" aria-label={t('acc.period')}>
        {PRESETS.map((p) => (
          <button key={p} className={'chip dark' + (preset === p ? ' on' : '')} onClick={() => { setPreset(p); setLimit(PAGE); }}>{t('acc.p.' + p)}</button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="pair" style={{ gap: 8 }}>
          <Field label={t('acc.from')}><input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></Field>
          <Field label={t('acc.to')}><input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></Field>
        </div>
      )}
      {!validRange && <div className="small bad-text">{t('stats.invalid')}</div>}

      <div className="stats four">
        {stat('acc.openBal', fmt(ledger.opening))}
        {stat('acc.moneyIn', '+' + fmt(ledger.inTotal))}
        {stat('acc.moneyOut', '−' + fmt(ledger.outTotal))}
        {stat('acc.closeBal', fmt(ledger.closing))}
      </div>

      {series.length > 1 && (
        <div className="card">
          <h3>{t('acc.balanceChart')}</h3>
          <TrendChart points={series} color={acc.color} label={t('acc.balanceChart')} />
        </div>
      )}
      {months.length > 0 && ledger.rows.length > 0 && (
        <div className="card">
          <h3>{t('acc.flowChart')} ({cur})</h3>
          <BarChart months={months} income={flow.income} expense={flow.expense} />
          <div className="legend">
            <span><i style={{ background: 'var(--chart-income)' }} />{t('acc.in')}</span>
            <span><i style={{ background: 'var(--chart-expense)' }} />{t('acc.out')}</span>
          </div>
        </div>
      )}

      <div className="card">
        <h3>{t('acc.history')} <span className="muted small">({rows.length})</span></h3>
        <div className="seg" role="group">
          {[['all', 'acc.filterAll'], ['in', 'acc.filterIn'], ['out', 'acc.filterOut'], ['transfer', 'acc.filterTransfers']].map(([k, key]) => (
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => { setFilter(k); setLimit(PAGE); }}>{t(key)}</button>
          ))}
        </div>
        <label className="search">
          <Icon name="search" size={18} />
          <input type="search" placeholder={t('acc.search')} aria-label={t('acc.search')} value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} />
        </label>
        {isCert && summary.rows.length > 0 && (
          <Field label="">
            <select aria-label={t('cert.title')} value={certFilter} onChange={(e) => { setCertFilter(e.target.value); setLimit(PAGE); }}>
              <option value="all">{t('cert.allCerts')}</option>
              {summary.rows.map((r) => <option key={r.cert.id} value={r.cert.id}>{r.cert.name}</option>)}
            </select>
          </Field>
        )}
        {rows.length === 0 ? (
          <div className="empty">{t('acc.noRows')}</div>
        ) : (
          <div className="list">
            {groups.map((g) => (
              <div key={g.date} className="day">
                <div className="day-head">{g.date === today ? t('home.today') : `${dayLabel(g.date)} ${g.date.slice(0, 4)}`}</div>
                {g.items.map((r) => (
                  <button key={r.kind + r.id + r.delta} className="item" onClick={() => (r.kind === 'tx' ? onEditTx(r.tx) : onEditTransfer(r.transfer))}>
                    <span className="dot" style={{ background: r.kind === 'tx' ? catColor(r.tx.categoryId) : 'var(--muted)' }} />
                    <span className="grow">
                      <div>{label(r)}</div>
                      <div className="muted small">
                        {r.kind === 'tx' && r.tx.autoInterest && <span className="tag ok" style={{ marginInlineEnd: 6 }}>{t('acc.auto')}</span>}
                        {noteOf(r)}
                      </div>
                    </span>
                    <span style={{ textAlign: 'end' }}>
                      <div className={r.delta > 0 ? 'amount-in' : 'amount-out'} dir="ltr">{r.delta > 0 ? '+' : '−'}{fmt(Math.abs(r.delta))}</div>
                      <div className="muted small" dir="ltr">{fmt(r.balanceAfter)}</div>
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {shown < rows.length && <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => setLimit(limit + PAGE)}>{t('acc.more')}</button>}
          </div>
        )}
        {rows.length > 0 && <div className="muted small">{t('acc.tapToEdit')}</div>}
      </div>
    </div>
  );
}
