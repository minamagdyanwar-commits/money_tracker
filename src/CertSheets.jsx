import { useState } from 'react';
import { useApp } from './store.jsx';
import { addDays, addMonthsToDate, certBalance, certSummary, fmt, isoDate, newId } from './logic.js';
import { Field, Sheet, numericOnly, parseAmount } from './ui.jsx';
import { certRateLine } from './AccountBits.jsx';

const EVERY = ['monthly', 'quarterly', 'semiannual', 'yearly', 'maturity'];

// Add or edit one certificate inside a certificates account.
export function CertForm({ accId, cert, onClose }) {
  const { state, dispatch, t, toast, accName } = useApp();
  const editing = !!cert;
  const today = isoDate();
  const acc = state.accounts.find((a) => a.id === accId);
  const cur = state.settings.currency;
  const others = state.accounts.filter((a) => !a.archived && a.id !== accId && a.type !== 'certificate');
  const [name, setName] = useState(cert?.name ?? '');
  const [amount, setAmount] = useState(cert?.openingAmount ? String(cert.openingAmount) : '');
  const [rate, setRate] = useState(cert?.rate ? String(cert.rate) : '');
  const [every, setEvery] = useState(cert?.every ?? 'monthly');
  const [firstDate, setFirstDate] = useState(cert?.firstDate ?? addMonthsToDate(today, 1));
  const [startDate, setStartDate] = useState(cert?.startDate ?? today);
  const [maturityDate, setMaturityDate] = useState(cert?.maturityDate ?? '');
  const [payTo, setPayTo] = useState(editing ? cert.payoutAccountId || 'self' : others[0]?.id ?? 'self');
  const [fundFrom, setFundFrom] = useState('');
  const value = parseAmount(amount) || 0;
  const rateValue = parseAmount(rate);
  const datesOk = every === 'maturity' ? startDate && maturityDate && maturityDate > startDate : firstDate;
  const valid = name.trim() && rateValue > 0 && datesOk && (editing || value > 0);

  const save = () => {
    const id = cert?.id ?? newId();
    const funded = !editing && fundFrom && value > 0;
    dispatch({
      type: 'cert/save',
      accountId: accId,
      cert: {
        ...(cert || {}),
        id,
        name: name.trim(),
        openingAmount: funded ? 0 : value,
        rate: rateValue,
        every,
        firstDate: every === 'maturity' ? undefined : firstDate,
        startDate: every === 'maturity' ? startDate : undefined,
        maturityDate: maturityDate || undefined,
        payoutAccountId: payTo === 'self' ? '' : payTo,
        paid: cert?.paid ?? [],
      },
    });
    if (funded) dispatch({ type: 'transfer/save', transfer: { fromId: fundFrom, toId: accId, amount: value, date: today, note: name.trim(), certId: id } });
    toast(t('acc.saved'));
    onClose();
  };
  const used = editing && (state.transactions.some((x) => x.certId === cert.id) || state.transfers.some((x) => x.certId === cert.id));
  const remove = () => {
    if (!window.confirm(t('cert.confirmDelete'))) return;
    dispatch({ type: 'cert/delete', accountId: accId, certId: cert.id });
    onClose();
  };

  return (
    <Sheet title={editing ? t('cert.editTitle') : t('cert.newTitle')} onClose={onClose}>
      <div className="muted small">{accName(acc.id)}</div>
      <Field label={t('cert.name')}><input type="text" placeholder={t('cert.namePh')} value={name} autoFocus={!editing} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={t(editing ? 'cert.openingValue' : 'cert.amount', { cur })}>
        <input inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(numericOnly(e.target.value))} />
      </Field>
      <div className="muted small">{t('cert.valueHint')}</div>
      {!editing && others.length > 0 && (
        <>
          <Field label={t('cert.fundFrom')}>
            <select value={fundFrom} onChange={(e) => setFundFrom(e.target.value)}>
              <option value="">{t('cert.fundNone')}</option>
              {others.map((a) => <option key={a.id} value={a.id}>{accName(a.id)}</option>)}
            </select>
          </Field>
          <div className="muted small">{t('cert.fundHint')}</div>
        </>
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
        <select value={payTo} onChange={(e) => setPayTo(e.target.value)}>
          <option value="self">{t('cert.reinvest')}</option>
          {others.map((a) => <option key={a.id} value={a.id}>{accName(a.id)}</option>)}
        </select>
      </Field>
      <div className="muted small">{t('cert.pastHint')}</div>
      <div className="muted small">{t('cert.autoHint')}</div>
      <button className="btn block" disabled={!valid} onClick={save}>{t('common.save')}</button>
      {editing && !used && <button className="btn danger" onClick={remove}>{t('cert.deleteBtn')}</button>}
      {used && <div className="muted small">{t('cert.hasEntries')}</div>}
    </Sheet>
  );
}

// Breaking one certificate: how much leaves it, how much actually arrived and where.
export function RedeemSheet({ accId, cert, onClose }) {
  const { state, dispatch, t, toast, accName } = useApp();
  const cur = state.settings.currency;
  const today = isoDate();
  const acc = state.accounts.find((a) => a.id === accId);
  const balance = Math.max(Math.round(certBalance(acc, cert, state.transactions, state.transfers, today) * 100) / 100, 0);
  const targets = state.accounts.filter((a) => !a.archived && a.id !== accId && a.type !== 'certificate');
  const preferred = targets.find((a) => a.id === cert.payoutAccountId) || targets[0];
  const [principal, setPrincipal] = useState(String(balance));
  const [received, setReceived] = useState(String(balance));
  const [touched, setTouched] = useState(false);
  const [toId, setToId] = useState(preferred?.id ?? '');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const p = parseAmount(principal);
  const r = parseAmount(received);
  const valid = p > 0 && r >= 0 && toId && date;

  const save = () => {
    dispatch({ type: 'cert/redeem', redeem: { accountId: accId, certId: cert.id, principal: p, received: r, toId, date, note: note.trim() } });
    toast(t('cert.redeemDone', { amt: fmt(r), cur }));
    onClose();
  };

  return (
    <Sheet title={t('cert.redeemTitle', { name: cert.name })} onClose={onClose}>
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

// One certificate on its own: value, rate, what it has paid, what it will pay next.
export function CertDetail({ accId, certId, onClose, onEdit, onRedeem, onEditTx }) {
  const { state, t, accName, dayLabel } = useApp();
  const acc = state.accounts.find((a) => a.id === accId);
  const cert = acc?.certs?.find((c) => c.id === certId);
  if (!cert) return null;
  const cur = state.settings.currency;
  const today = isoDate();
  const row = certSummary({ ...acc, certs: [cert] }, state.transactions, state.transfers, today).rows[0];
  const payouts = state.transactions.filter((x) => x.certId === cert.id && x.autoInterest).sort((a, b) => b.date.localeCompare(a.date));
  const matured = !cert.closed && cert.maturityDate && cert.maturityDate <= today;

  return (
    <Sheet title={cert.name} onClose={onClose}>
      <div className="card">
        <div className="muted small">{t('cert.value')}{cert.closed ? ` · ${t('cert.closed')}` : ''}</div>
        <div className="big-num" dir="ltr">{fmt(row.balance)} {cur}</div>
        <div className="small muted">{certRateLine(t, cert)}</div>
        {matured && <span className="tag mid" style={{ alignSelf: 'flex-start' }}>{t('cert.matured')}</span>}
        {cert.maturityDate && <div className="small muted">{t('cert.maturityDate')}: {cert.maturityDate}</div>}
        <div className="small muted">{t('cert.paidInto', { name: cert.payoutAccountId ? accName(cert.payoutAccountId) : t('cert.reinvest') })}</div>
      </div>
      <div className="stats">
        <div className="stat"><div>{t('cert.earned')}</div><div dir="ltr">{fmt(row.earned)}</div></div>
        <div className="stat"><div>{t('cert.yearlyInterest')}</div><div dir="ltr">{fmt(row.yearly)}</div></div>
        <div className="stat"><div>{t('cert.next30')}</div><div dir="ltr">{fmt(row.upcoming.filter((u) => u.date <= addDays(today, 30)).reduce((a, u) => a + u.amount, 0))}</div></div>
      </div>
      <div className="pair" style={{ gap: 10 }}>
        <button className="btn secondary" onClick={onEdit}>{t('common.edit')}</button>
        {!cert.closed && <button className="btn" onClick={onRedeem}>{t('cert.redeem')}</button>}
      </div>
      {row.upcoming.length > 0 && (
        <div className="card">
          <h3>{t('cert.upcoming')}</h3>
          <div className="list">
            {row.upcoming.map((u) => (
              <div key={u.date} className="item" style={{ cursor: 'default' }}>
                <span className="grow">{dayLabel(u.date)} {u.date.slice(0, 4)}</span>
                <b dir="ltr">≈ {fmt(u.amount)} {cur}</b>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="card">
        <h3>{t('cert.payouts')} <span className="muted small">({payouts.length})</span></h3>
        {payouts.length === 0 ? <div className="empty">{t('cert.noPayouts')}</div> : (
          <div className="list">
            {payouts.map((p) => (
              <button key={p.id} className="item" onClick={() => onEditTx(p)}>
                <span className="grow">
                  <div>{dayLabel(p.date)} {p.date.slice(0, 4)}</div>
                  <div className="muted small">{t('cert.paidInto', { name: accName(p.accountId) })}</div>
                </span>
                <span className="amount-in" dir="ltr">+{fmt(p.amount)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
