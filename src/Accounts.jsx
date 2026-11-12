import { useState } from 'react';
import { PALETTE, useApp } from './store.jsx';
import { accountBalance, accountInUse, accountSummary, addMonthsToDate, firstActiveAccount, fmt, isoDate, newId } from './logic.js';
import AddSheet from './AddSheet.jsx';
import AccountPage from './AccountPage.jsx';
import { ACCOUNT_TYPES, BalanceText, CertInfo, CreditMeter } from './AccountBits.jsx';
import { Field, Icon, Sheet, numericOnly, parseAmount } from './ui.jsx';

const EVERY = ['monthly', 'quarterly', 'semiannual', 'yearly', 'maturity'];

function AccountForm({ acc, onClose }) {
  const { state, dispatch, t, toast, accName } = useApp();
  const editing = !!acc;
  const today = isoDate();
  const it = acc?.interest;
  const [name, setName] = useState(acc?.name ?? '');
  const [type, setType] = useState(acc?.type ?? 'bank');
  const [color, setColor] = useState(acc?.color ?? PALETTE[state.accounts.length % PALETTE.length]);
  const initial = acc ? (acc.type === 'credit' ? Math.max(-(acc.openingBalance || 0), 0) : acc.openingBalance || 0) : 0;
  const [opening, setOpening] = useState(initial ? String(initial) : '');
  const [limit, setLimit] = useState(acc?.creditLimit ? String(acc.creditLimit) : '');
  const [rate, setRate] = useState(it?.rate ? String(it.rate) : '');
  const [every, setEvery] = useState(it?.every ?? 'monthly');
  const [firstDate, setFirstDate] = useState(it?.firstDate ?? addMonthsToDate(today, 1));
  const [startDate, setStartDate] = useState(it?.startDate ?? today);
  const [maturityDate, setMaturityDate] = useState(it?.maturityDate ?? '');
  const [payTo, setPayTo] = useState(it?.payoutAccountId ?? '');
  const [fundFrom, setFundFrom] = useState('');
  const credit = type === 'credit';
  const cert = type === 'certificate';
  const used = editing && accountInUse(acc.id, state.transactions, state.transfers, state.recurring);
  const cur = state.settings.currency;
  const others = state.accounts.filter((a) => !a.archived && a.id !== acc?.id && a.type !== 'certificate');
  const rateValue = parseAmount(rate);
  const certValid = !cert || (rateValue > 0 && (every === 'maturity' ? startDate && maturityDate && maturityDate > startDate : firstDate));
  const valid = name.trim() && certValid;

  const save = () => {
    const amount = parseAmount(opening) || 0;
    const id = acc?.id ?? newId();
    const funded = !editing && cert && fundFrom && amount > 0;
    const next = { ...(acc || { archived: false }), id, name: name.trim(), type, color, openingBalance: funded ? 0 : credit ? -amount : amount };
    const cardLimit = parseAmount(limit);
    if (credit && cardLimit > 0) next.creditLimit = cardLimit;
    else delete next.creditLimit;
    if (cert) {
      next.interest = {
        ...(it || {}),
        rate: rateValue,
        every,
        firstDate: every === 'maturity' ? undefined : firstDate,
        startDate: every === 'maturity' ? startDate : undefined,
        maturityDate: maturityDate || undefined,
        payoutAccountId: payTo === '' || payTo === 'self' ? id : payTo,
        paid: it?.paid ?? [],
      };
    } else delete next.interest;
    dispatch({ type: 'acc/save', acc: next });
    if (funded) dispatch({ type: 'transfer/save', transfer: { fromId: fundFrom, toId: id, amount, date: today, note: next.name } });
    toast(t('acc.saved'));
    onClose();
  };
  const remove = () => {
    if (!window.confirm(t('acc.confirmDelete'))) return;
    dispatch({ type: 'acc/delete', id: acc.id });
    onClose();
  };

  return (
    <Sheet title={editing ? t('acc.editTitle') : t('acc.newTitle')} onClose={onClose}>
      <Field label={t('acc.name')}><input type="text" placeholder={t('acc.namePh')} value={name} autoFocus={!editing} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="muted small bold">{t('acc.type')}</div>
      <div className="chips">
        {ACCOUNT_TYPES.map((k) => <button key={k} className={'chip' + (type === k ? ' on' : '')} onClick={() => setType(k)}>{t('acc.type.' + k)}</button>)}
      </div>
      <Field label={t(credit ? 'acc.openingOwed' : editing ? 'acc.openingEdit' : 'acc.opening', { cur })}>
        <input inputMode="decimal" placeholder="0" value={opening} onChange={(e) => setOpening(numericOnly(e.target.value))} />
      </Field>
      <div className="muted small">{t(credit ? 'acc.openingHintCredit' : 'acc.openingHint')}</div>
      {credit && (
        <>
          <Field label={t('acc.limit', { cur })}>
            <input inputMode="decimal" placeholder="—" value={limit} onChange={(e) => setLimit(numericOnly(e.target.value))} />
          </Field>
          <div className="muted small">{t('acc.limitHint')}</div>
        </>
      )}
      {cert && (
        <>
          {!editing && others.length > 0 && (
            <Field label={t('cert.fundFrom')}>
              <select value={fundFrom} onChange={(e) => setFundFrom(e.target.value)}>
                <option value="">{t('cert.fundNone')}</option>
                {others.map((a) => <option key={a.id} value={a.id}>{accName(a.id)}</option>)}
              </select>
            </Field>
          )}
          <div className="muted small bold">{t('cert.section')}</div>
          <Field label={t('cert.rate')}>
            <input inputMode="decimal" placeholder="0" value={rate} onChange={(e) => setRate(numericOnly(e.target.value))} />
          </Field>
          <div className="muted small">{t('cert.every')}</div>
          <div className="chips">
            {EVERY.map((k) => <button key={k} className={'chip' + (every === k ? ' on' : '')} onClick={() => setEvery(k)}>{t('cert.' + k)}</button>)}
          </div>
          {every === 'maturity' ? (
            <>
              <Field label={t('cert.start')}><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
              <Field label={t('cert.maturityDate')}><input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} /></Field>
            </>
          ) : (
            <>
              <Field label={t('cert.first')}><input type="date" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} /></Field>
              <Field label={t('cert.maturityOpt')}><input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} /></Field>
            </>
          )}
          <Field label={t('cert.payTo')}>
            <select value={payTo === '' ? 'self' : payTo} onChange={(e) => setPayTo(e.target.value)}>
              <option value="self">{t('cert.reinvest')}</option>
              {others.map((a) => <option key={a.id} value={a.id}>{accName(a.id)}</option>)}
            </select>
          </Field>
          <div className="muted small">{t('cert.pastHint')}</div>
          <div className="muted small">{t('cert.autoHint')}</div>
        </>
      )}
      <div className="muted small bold">{t('cat.colour')}</div>
      <div className="chips">
        {PALETTE.map((c) => (
          <button key={c} aria-label={`${t('cat.colour')} ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} style={{ width: 44, height: 44, borderRadius: 12, background: c, border: color === c ? '3px solid var(--ink)' : '3px solid transparent' }} />
        ))}
      </div>
      <button className="btn block" disabled={!valid} onClick={save}>{t('common.save')}</button>
      {editing && (
        <button className="btn secondary" onClick={() => { dispatch({ type: 'acc/archive', id: acc.id, archived: !acc.archived }); onClose(); }}>
          {acc.archived ? t('acc.restore') : t('acc.archive')}
        </button>
      )}
      {editing && !used && state.accounts.length > 1 && <button className="btn danger" onClick={remove}>{t('acc.delete')}</button>}
      {used && <div className="muted small">{t('acc.inUse')}</div>}
    </Sheet>
  );
}

export function TransferSheet({ transfer, fromId, toId, onClose }) {
  const { state, dispatch, t, toast, accName } = useApp();
  const editing = !!transfer;
  const accounts = state.accounts.filter((a) => !a.archived || a.id === transfer?.fromId || a.id === transfer?.toId);
  const firstId = fromId ?? transfer?.fromId ?? state.settings.lastAccountId ?? firstActiveAccount(state.accounts);
  const [from, setFrom] = useState(firstId);
  const [to, setTo] = useState(toId ?? transfer?.toId ?? accounts.find((a) => a.id !== firstId)?.id ?? '');
  const [amount, setAmount] = useState(transfer ? String(transfer.amount) : '');
  const [date, setDate] = useState(transfer?.date ?? isoDate());
  const [note, setNote] = useState(transfer?.note ?? '');
  const value = parseAmount(amount);
  const same = from === to;
  const valid = value > 0 && from && to && !same && date;
  const cur = state.settings.currency;

  const save = () => {
    dispatch({ type: 'transfer/save', transfer: { ...(transfer || {}), fromId: from, toId: to, amount: value, date, note: note.trim() } });
    toast(t('acc.transferDone', { amt: fmt(value), cur }));
    onClose();
  };
  const remove = () => {
    if (!window.confirm(t('tr.confirmDelete'))) return;
    dispatch({ type: 'transfer/delete', id: transfer.id });
    toast(t('acc.transferDeleted'));
    onClose();
  };
  const options = accounts.map((a) => <option key={a.id} value={a.id}>{accName(a.id)}</option>);

  return (
    <Sheet title={editing ? t('tr.edit') : t('tr.title')} onClose={onClose}>
      <Field label={t('tr.from')}><select value={from} onChange={(e) => setFrom(e.target.value)}>{options}</select></Field>
      <Field label={t('tr.to')}><select value={to} onChange={(e) => setTo(e.target.value)}>{options}</select></Field>
      {same && <div className="small bad-text">{t('tr.sameAcc')}</div>}
      <div style={{ textAlign: 'center' }}>
        <div className="muted small">{t('add.amount', { cur })}</div>
        <input className="amount-input" inputMode="decimal" placeholder="0" aria-label={t('add.amount', { cur: '' })} autoFocus={!editing} value={amount} onChange={(e) => setAmount(numericOnly(e.target.value))} />
      </div>
      <Field label={t('add.date')}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label={t('add.note')}><input type="text" placeholder={t('add.optional')} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="muted small">{t('tr.hint')}</div>
      <button className="btn block" disabled={!valid} onClick={save}>{t('tr.save')}</button>
      {editing && <button className="btn danger" onClick={remove}>{t('tr.delete')}</button>}
    </Sheet>
  );
}

// Breaking a certificate: how much leaves it, how much actually arrived and where.
function RedeemSheet({ acc, onClose }) {
  const { state, dispatch, t, toast, accName } = useApp();
  const cur = state.settings.currency;
  const today = isoDate();
  const balance = accountBalance(acc, state.transactions, state.transfers, today);
  const targets = state.accounts.filter((a) => !a.archived && a.id !== acc.id && a.type !== 'certificate');
  const preferred = targets.find((a) => a.id === acc.interest?.payoutAccountId) || targets[0];
  const [principal, setPrincipal] = useState(String(Math.max(Math.round(balance * 100) / 100, 0)));
  const [received, setReceived] = useState(String(Math.max(Math.round(balance * 100) / 100, 0)));
  const [touched, setTouched] = useState(false);
  const [toId, setToId] = useState(preferred?.id ?? '');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const p = parseAmount(principal);
  const r = parseAmount(received);
  const valid = p > 0 && r >= 0 && toId && date;

  const save = () => {
    dispatch({ type: 'cert/redeem', redeem: { accountId: acc.id, principal: p, received: r, toId, date, note: note.trim() } });
    toast(t('cert.redeemDone', { amt: fmt(r), cur }));
    onClose();
  };

  return (
    <Sheet title={t('cert.redeemTitle', { name: accName(acc.id) })} onClose={onClose}>
      <div className="muted">{t('cert.balanceNow', { amt: fmt(balance), cur })}</div>
      <Field label={t('cert.principalOut', { cur })}>
        <input inputMode="decimal" value={principal} onChange={(e) => { setPrincipal(numericOnly(e.target.value)); if (!touched) setReceived(numericOnly(e.target.value)); }} />
      </Field>
      <Field label={t('cert.received', { cur })}>
        <input inputMode="decimal" value={received} onChange={(e) => { setReceived(numericOnly(e.target.value)); setTouched(true); }} />
      </Field>
      <Field label={t('cert.receiveIn')}>
        <select value={toId} onChange={(e) => setToId(e.target.value)}>{targets.map((a) => <option key={a.id} value={a.id}>{accName(a.id)}</option>)}</select>
      </Field>
      <Field label={t('add.date')}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label={t('add.note')}><input type="text" placeholder={t('add.optional')} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="muted small">{t('cert.redeemHint')}</div>
      <button className="btn block" disabled={!valid} onClick={save}>{t('cert.redeem')}</button>
    </Sheet>
  );
}

export default function Accounts() {
  const { state, t, accName } = useApp();
  const [asOf, setAsOf] = useState(isoDate());
  const [detail, setDetail] = useState(null); // account id
  const [form, setForm] = useState(undefined); // undefined closed, null new, object edit
  const [transfer, setTransfer] = useState(undefined); // undefined closed, {} new, {transfer} edit, {fromId,toId}
  const [editTx, setEditTx] = useState(null);
  const [addFor, setAddFor] = useState(null); // account id for a new entry
  const [redeem, setRedeem] = useState(null);
  const cur = state.settings.currency;
  const summary = accountSummary(state.accounts, state.transactions, state.transfers, asOf);
  const active = summary.rows.filter((r) => !r.acc.archived);
  const archived = summary.rows.filter((r) => r.acc.archived);
  const savings = active.filter((r) => r.acc.type === 'savings' || r.acc.type === 'certificate').reduce((a, r) => a + r.balance, 0);
  const hasSavings = active.some((r) => r.acc.type === 'savings' || r.acc.type === 'certificate');
  const recent = [...state.transfers].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const detailAcc = detail && state.accounts.find((a) => a.id === detail);

  const Row = ({ r }) => (
    <button className="card account" style={{ opacity: r.acc.archived ? 0.55 : 1 }} onClick={() => setDetail(r.acc.id)}>
      <span className="dot" style={{ background: r.acc.color }} />
      <span className="grow">
        <div className="bold">{accName(r.acc.id)} {r.acc.archived && <span className="muted small">{t('acc.archivedTag')}</span>}</div>
        <div className="muted small">{t('acc.type.' + r.acc.type)}</div>
        <CreditMeter acc={r.acc} balance={r.balance} cur={cur} />
        <CertInfo acc={r.acc} balance={r.balance} cur={cur} />
      </span>
      <b><BalanceText acc={r.acc} balance={r.balance} cur={cur} /></b>
    </button>
  );

  const sheets = (
    <>
      {form !== undefined && <AccountForm acc={form} onClose={() => setForm(undefined)} />}
      {transfer !== undefined && <TransferSheet {...transfer} onClose={() => setTransfer(undefined)} />}
      {editTx && <AddSheet tx={editTx} onClose={() => setEditTx(null)} />}
      {addFor && <AddSheet preset={{ accountId: addFor }} onClose={() => setAddFor(null)} />}
      {redeem && <RedeemSheet acc={redeem} onClose={() => setRedeem(null)} />}
    </>
  );

  if (detailAcc) {
    return (
      <>
        <AccountPage
          acc={detailAcc}
          onBack={() => setDetail(null)}
          onEdit={() => setForm(detailAcc)}
          onTransfer={() => setTransfer({ fromId: detailAcc.id })}
          onAdd={() => setAddFor(detailAcc.id)}
          onEditTx={setEditTx}
          onEditTransfer={(tr) => setTransfer({ transfer: tr })}
          onRedeem={() => setRedeem(detailAcc)}
        />
        {sheets}
      </>
    );
  }

  return (
    <div className="screen">
      <div className="h1">{t('acc.title')}</div>
      <div className="hero">
        <div className="label">{t('acc.total')}</div>
        <div className="big"><span dir="ltr">{summary.total < 0 ? '− ' : ''}{fmt(Math.abs(summary.total))}</span> <small>{cur}</small></div>
        <div className="pair">
          <div><span className="label">{t('acc.assets')}</span><b style={{ color: 'var(--income)' }}>{fmt(summary.assets)}</b></div>
          <div><span className="label">{t('acc.owed')}</span><b style={{ color: 'var(--expense)' }}>{fmt(summary.owed)}</b></div>
        </div>
        {hasSavings && (
          <div className="row between">
            <span className="label">{t('acc.savings')}</span>
            <b>{fmt(savings)} {cur}</b>
          </div>
        )}
        {summary.hasLimits && (
          <div className="row between">
            <span className="label">{t('acc.availableCredit')}</span>
            <b>{fmt(summary.availableCredit)} {cur}</b>
          </div>
        )}
      </div>
      <Field label={t('acc.asOf')}><input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value || isoDate())} /></Field>

      <div className="pair" style={{ gap: 10 }}>
        <button className="btn" disabled={active.length < 2} onClick={() => setTransfer({})}><Icon name="swap" size={18} /> {t('acc.transfer').replace('⇄ ', '')}</button>
        <button className="btn secondary" onClick={() => setForm(null)}>{t('acc.add')}</button>
      </div>

      {active.length <= 1 && <div className="card"><div className="empty">{t('acc.empty')}</div></div>}
      {active.map((r) => <Row key={r.acc.id} r={r} />)}
      {archived.map((r) => <Row key={r.acc.id} r={r} />)}

      {recent.length > 0 && (
        <div className="card">
          <h3>{t('acc.recentTransfers')}</h3>
          <div className="list">
            {recent.map((tr) => (
              <button key={tr.id} className="item" onClick={() => setTransfer({ transfer: tr })}>
                <span className="grow">
                  <div>{t('tr.label', { from: accName(tr.fromId), to: accName(tr.toId) })}</div>
                  <div className="muted small">{tr.date}{tr.note ? ` · ${tr.note}` : ''}</div>
                </span>
                <b dir="ltr">{fmt(tr.amount)}</b>
              </button>
            ))}
          </div>
        </div>
      )}
      {sheets}
    </div>
  );
}
