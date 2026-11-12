import { useState } from 'react';
import { useApp } from './store.jsx';
import { addDays, addMonthsToDate, bulkEditCerts, buildCert, certBalance, certSummary, dueInterestDates, fmt, isoDate, newId, parseCertLines } from './logic.js';
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
  const [includePast, setIncludePast] = useState(false);
  const value = parseAmount(amount) || 0;
  const rateValue = parseAmount(rate);
  const datesOk = every === 'maturity' ? startDate && maturityDate && maturityDate > startDate : firstDate;
  const valid = name.trim() && rateValue > 0 && datesOk && (editing || value > 0);

  const save = () => {
    const id = cert?.id ?? newId();
    const funded = !editing && fundFrom && value > 0;
    const next = {
      ...(cert || {}),
      id,
      name: name.trim(),
      openingAmount: funded ? 0 : value,
      rate: rateValue,
      every,
      firstDate: every === 'maturity' ? undefined : firstDate,
      startDate: every === 'maturity' ? startDate : cert?.startDate,
      maturityDate: maturityDate || undefined,
      payoutAccountId: payTo === 'self' ? '' : payTo,
      paid: cert?.paid ?? [],
    };
    // A new certificate does not backfill interest that came due before today unless asked to.
    if (!editing && !includePast) next.paid = dueInterestDates(next, today);
    dispatch({ type: 'cert/save', accountId: accId, cert: next });
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
      {!editing && (
        <>
          <Field label={t('cert.includePast')}><input type="checkbox" checked={includePast} onChange={(e) => setIncludePast(e.target.checked)} /></Field>
          <div className="muted small">{t('cert.includePastHint')}</div>
        </>
      )}
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

const blankRow = (patch = {}) => ({ key: newId(), name: '', value: '', rate: '', startDate: isoDate(), every: 'monthly', maturityDate: '', ...patch });
const rowBlank = (r) => !r.value && !r.rate && !r.name;
const rowValid = (r) => parseAmount(r.value) > 0 && parseAmount(r.rate) > 0 && r.startDate && (r.every !== 'maturity' || r.maturityDate > r.startDate) && (!r.maturityDate || r.maturityDate > r.startDate);

// Add many certificates at once: one row each (value, rate, date placed, payout frequency), or paste a list.
export function BulkCertSheet({ accId, onClose }) {
  const { state, dispatch, t, toast, accName } = useApp();
  const today = isoDate();
  const cur = state.settings.currency;
  const others = state.accounts.filter((a) => !a.archived && a.id !== accId && a.type !== 'certificate');
  const [rows, setRows] = useState([blankRow(), blankRow()]);
  const [payTo, setPayTo] = useState(others[0]?.id ?? 'self');
  const [includePast, setIncludePast] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteMsg, setPasteMsg] = useState('');

  const update = (key, patch) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => {
    const last = rows[rows.length - 1];
    setRows([...rows, blankRow(last ? { rate: last.rate, startDate: last.startDate, every: last.every, maturityDate: last.maturityDate } : {})]);
  };
  const dupRow = (r) => setRows(rows.flatMap((x) => (x.key === r.key ? [x, { ...r, key: newId() }] : [x])));
  const removeRow = (key) => setRows(rows.length > 1 ? rows.filter((r) => r.key !== key) : [blankRow()]);
  const setAllEvery = (every) => every && setRows(rows.map((r) => ({ ...r, every })));
  const importPaste = () => {
    const { rows: parsed, skipped } = parseCertLines(pasteText, today);
    if (parsed.length) {
      const fresh = parsed.map((p) => blankRow({ value: String(p.value), rate: String(p.rate), startDate: p.startDate, every: p.every, maturityDate: p.maturityDate }));
      setRows([...rows.filter((r) => !rowBlank(r)), ...fresh]);
      setPasteText('');
    }
    setPasteMsg([parsed.length ? t('cert.pasted', { n: parsed.length }) : '', skipped ? t('cert.pasteSkipped', { n: skipped }) : ''].filter(Boolean).join(' · '));
  };

  const filled = rows.filter((r) => !rowBlank(r));
  const valid = filled.length > 0 && filled.every(rowValid);
  const total = filled.reduce((a, r) => a + (parseAmount(r.value) || 0), 0);
  const yearly = filled.reduce((a, r) => a + ((parseAmount(r.value) || 0) * (parseAmount(r.rate) || 0)) / 100, 0);

  const save = () => {
    const certs = filled.map((r) => {
      const value = parseAmount(r.value);
      const rate = parseAmount(r.rate);
      return buildCert(
        { name: r.name.trim() || `${fmt(value)} · ${r.startDate}`, value, rate, every: r.every, startDate: r.startDate, maturityDate: r.maturityDate, payoutAccountId: payTo === 'self' ? '' : payTo },
        today,
        includePast
      );
    });
    dispatch({ type: 'cert/saveMany', accountId: accId, certs });
    toast(t('cert.bulkDone', { n: certs.length }));
    onClose();
  };

  return (
    <Sheet title={t('cert.bulkTitle')} onClose={onClose}>
      <Field label={t('cert.payTo')}>
        <select value={payTo} onChange={(e) => setPayTo(e.target.value)}>
          <option value="self">{t('cert.reinvest')}</option>
          {others.map((a) => <option key={a.id} value={a.id}>{accName(a.id)}</option>)}
        </select>
      </Field>
      <Field label={t('cert.allEvery')}>
        <select value="" onChange={(e) => setAllEvery(e.target.value)}>
          <option value="">—</option>
          {EVERY.map((k) => <option key={k} value={k}>{t('cert.' + k)}</option>)}
        </select>
      </Field>
      <Field label={t('cert.includePast')}><input type="checkbox" checked={includePast} onChange={(e) => setIncludePast(e.target.checked)} /></Field>
      <div className="muted small">{t('cert.includePastHint')}</div>

      <button className="chip dash" style={{ alignSelf: 'flex-start' }} onClick={() => setPasteOpen(!pasteOpen)}>{t('cert.paste')}</button>
      {pasteOpen && (
        <div className="card">
          <div className="muted small">{t('cert.pasteHint')}</div>
          <textarea className="paste" rows={4} dir="ltr" placeholder={t('cert.pastePh')} value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
          <button className="btn small secondary" disabled={!pasteText.trim()} onClick={importPaste}>{t('cert.pasteBtn')}</button>
          {pasteMsg && <div className="small muted">{pasteMsg}</div>}
        </div>
      )}

      {rows.map((r, i) => (
        <div className="card bulk-row" key={r.key}>
          <div className="row between">
            <h3>{t('cert.rowTitle', { n: i + 1 })}</h3>
            <span className="row" style={{ gap: 4 }}>
              <button className="btn small secondary" onClick={() => dupRow(r)}>{t('cert.dupRow')}</button>
              <button className="iconbtn" aria-label={t('cert.removeRow')} onClick={() => removeRow(r.key)}>✕</button>
            </span>
          </div>
          <div className="bulk-grid">
            <label className="mini"><span>{t('cert.value')} ({cur})</span><input inputMode="decimal" placeholder="0" value={r.value} onChange={(e) => update(r.key, { value: numericOnly(e.target.value) })} /></label>
            <label className="mini"><span>{t('cert.rateShort')}</span><input inputMode="decimal" placeholder="0" value={r.rate} onChange={(e) => update(r.key, { rate: numericOnly(e.target.value) })} /></label>
            <label className="mini"><span>{t('cert.startDate')}</span><input type="date" value={r.startDate} onChange={(e) => update(r.key, { startDate: e.target.value })} /></label>
            <label className="mini"><span>{t('cert.every')}</span>
              <select value={r.every} onChange={(e) => update(r.key, { every: e.target.value })}>{EVERY.map((k) => <option key={k} value={k}>{t('cert.' + k)}</option>)}</select>
            </label>
            <label className="mini wide"><span>{t(r.every === 'maturity' ? 'cert.maturityDate' : 'cert.maturityOpt')}</span><input type="date" value={r.maturityDate} onChange={(e) => update(r.key, { maturityDate: e.target.value })} /></label>
            <label className="mini wide"><span>{t('cert.nameOpt')}</span><input type="text" value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} /></label>
          </div>
        </div>
      ))}
      <button className="chip dash" style={{ alignSelf: 'flex-start' }} onClick={addRow}>{t('cert.addRow')}</button>

      {filled.length > 0 && <div className="muted small bold">{t('cert.bulkSummary', { n: filled.length, total: fmt(total) + ' ' + cur, yearly: fmt(yearly) + ' ' + cur })}</div>}
      {filled.length > 0 && !valid && <div className="small bad-text">{t('cert.bulkNeed')}</div>}
      <button className="btn block" disabled={!valid} onClick={save}>{t('cert.bulkSave', { n: filled.length })}</button>
    </Sheet>
  );
}

// Change the terms of the selected certificates in one go; anything left on "no change" stays as it is.
export function BulkEditSheet({ accId, certIds, onClose, onDone }) {
  const { state, dispatch, t, toast, accName } = useApp();
  const others = state.accounts.filter((a) => !a.archived && a.id !== accId && a.type !== 'certificate');
  const [rate, setRate] = useState('');
  const [every, setEvery] = useState('');
  const [payTo, setPayTo] = useState('');
  const [maturity, setMaturity] = useState('');
  const [clearMaturity, setClearMaturity] = useState(false);
  const rateValue = parseAmount(rate);
  const changes = {};
  if (rateValue > 0) changes.rate = rateValue;
  if (every) changes.every = every;
  if (payTo) changes.payoutAccountId = payTo === 'self' ? '' : payTo;
  if (clearMaturity) changes.maturityDate = '';
  else if (maturity) changes.maturityDate = maturity;
  const any = Object.keys(changes).length > 0;

  const apply = () => {
    const { edited, skipped } = bulkEditCerts(state, accId, certIds, changes, isoDate());
    dispatch({ type: 'cert/bulkEdit', accountId: accId, certIds, changes });
    toast(t('cert.bulkEdited', { n: edited }) + (skipped ? t('cert.bulkSkipped', { n: skipped }) : ''));
    onDone();
  };

  return (
    <Sheet title={t('cert.bulkEditTitle', { n: certIds.length })} onClose={onClose}>
      <div className="muted small">{t('cert.bulkEditHint')}</div>
      <Field label={t('cert.newRate')}><input inputMode="decimal" placeholder={t('cert.keep')} value={rate} onChange={(e) => setRate(numericOnly(e.target.value))} /></Field>
      <Field label={t('cert.every')}>
        <select value={every} onChange={(e) => setEvery(e.target.value)}>
          <option value="">{t('cert.keep')}</option>
          {EVERY.map((k) => <option key={k} value={k}>{t('cert.' + k)}</option>)}
        </select>
      </Field>
      <Field label={t('cert.payTo')}>
        <select value={payTo} onChange={(e) => setPayTo(e.target.value)}>
          <option value="">{t('cert.keep')}</option>
          <option value="self">{t('cert.reinvest')}</option>
          {others.map((a) => <option key={a.id} value={a.id}>{accName(a.id)}</option>)}
        </select>
      </Field>
      <Field label={t('cert.maturityDate')}><input type="date" disabled={clearMaturity} value={maturity} onChange={(e) => setMaturity(e.target.value)} /></Field>
      <Field label={t('cert.clearMaturity')}><input type="checkbox" checked={clearMaturity} onChange={(e) => setClearMaturity(e.target.checked)} /></Field>
      <button className="btn block" disabled={!any} onClick={apply}>{t('cert.applyEdit', { n: certIds.length })}</button>
    </Sheet>
  );
}
