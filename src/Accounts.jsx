import { useState } from 'react';
import { PALETTE, useApp } from './store.jsx';
import { accountInUse, accountSummary, deleteCerts, firstActiveAccount, fmt, isoDate } from './logic.js';
import AddSheet from './AddSheet.jsx';
import AccountPage from './AccountPage.jsx';
import { ACCOUNT_TYPES, BalanceText, CertAccountInfo, CreditMeter } from './AccountBits.jsx';
import { BulkCertSheet, BulkEditSheet, CertDetail, CertForm, RedeemSheet } from './CertSheets.jsx';
import { Field, Icon, Sheet, numericOnly, parseAmount } from './ui.jsx';

function AccountForm({ acc, onClose }) {
  const { state, dispatch, t, toast } = useApp();
  const editing = !!acc;
  const [name, setName] = useState(acc?.name ?? '');
  const [type, setType] = useState(acc?.type ?? 'bank');
  const [color, setColor] = useState(acc?.color ?? PALETTE[state.accounts.length % PALETTE.length]);
  const initial = acc ? (acc.type === 'credit' ? Math.max(-(acc.openingBalance || 0), 0) : acc.openingBalance || 0) : 0;
  const [opening, setOpening] = useState(initial ? String(initial) : '');
  const [limit, setLimit] = useState(acc?.creditLimit ? String(acc.creditLimit) : '');
  const credit = type === 'credit';
  const cert = type === 'certificate';
  const used = editing && accountInUse(acc.id, state.transactions, state.transfers, state.recurring);
  const cur = state.settings.currency;

  const save = () => {
    const amount = parseAmount(opening) || 0;
    const next = { ...(acc || { archived: false }), name: name.trim(), type, color, openingBalance: credit ? -amount : amount };
    const cardLimit = parseAmount(limit);
    if (credit && cardLimit > 0) next.creditLimit = cardLimit;
    else delete next.creditLimit;
    if (cert) {
      // a certificates account is valued by its certificates: their opening amounts make up its opening balance
      next.certs = acc?.certs ?? [];
      next.openingBalance = next.certs.length ? acc.openingBalance : amount;
    } else {
      delete next.certs;
    }
    delete next.interest;
    dispatch({ type: 'acc/save', acc: next });
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
      {!(cert && acc?.certs?.length) && (
        <>
          <Field label={t(credit ? 'acc.openingOwed' : editing ? 'acc.openingEdit' : 'acc.opening', { cur })}>
            <input inputMode="decimal" placeholder="0" value={opening} onChange={(e) => setOpening(numericOnly(e.target.value))} />
          </Field>
          <div className="muted small">{t(credit ? 'acc.openingHintCredit' : 'acc.openingHint')}</div>
        </>
      )}
      {credit && (
        <>
          <Field label={t('acc.limit', { cur })}>
            <input inputMode="decimal" placeholder="—" value={limit} onChange={(e) => setLimit(numericOnly(e.target.value))} />
          </Field>
          <div className="muted small">{t('acc.limitHint')}</div>
        </>
      )}
      <div className="muted small bold">{t('cat.colour')}</div>
      <div className="chips">
        {PALETTE.map((c) => (
          <button key={c} aria-label={`${t('cat.colour')} ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} style={{ width: 44, height: 44, borderRadius: 12, background: c, border: color === c ? '3px solid var(--ink)' : '3px solid transparent' }} />
        ))}
      </div>
      <button className="btn block" disabled={!name.trim()} onClick={save}>{t('common.save')}</button>
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

export default function Accounts() {
  const { state, dispatch, t, toast, accName } = useApp();
  const [asOf, setAsOf] = useState(isoDate());
  const [detail, setDetail] = useState(null); // account id
  const [form, setForm] = useState(undefined); // undefined closed, null new, object edit
  const [transfer, setTransfer] = useState(undefined); // undefined closed, {} new, {transfer} edit, {fromId,toId}
  const [editTx, setEditTx] = useState(null);
  const [addFor, setAddFor] = useState(null); // account id for a new entry
  const [certForm, setCertForm] = useState(null); // { accId, cert|null }
  const [bulkAdd, setBulkAdd] = useState(null); // account id
  const [bulkEdit, setBulkEdit] = useState(null); // { accId, ids, done }
  const [certView, setCertView] = useState(null); // { accId, certId }
  const [redeem, setRedeem] = useState(null); // { accId, cert }
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
        <CertAccountInfo acc={r.acc} cur={cur} />
      </span>
      <b><BalanceText acc={r.acc} balance={r.balance} cur={cur} /></b>
    </button>
  );

  const sheets = (
    <>
      {form !== undefined && <AccountForm acc={form} onClose={() => setForm(undefined)} />}
      {transfer !== undefined && <TransferSheet {...transfer} onClose={() => setTransfer(undefined)} />}
      {certView && (
        <CertDetail
          accId={certView.accId}
          certId={certView.certId}
          onClose={() => setCertView(null)}
          onEdit={() => setCertForm({ accId: certView.accId, cert: state.accounts.find((a) => a.id === certView.accId)?.certs?.find((c) => c.id === certView.certId) })}
          onRedeem={() => setRedeem({ accId: certView.accId, cert: state.accounts.find((a) => a.id === certView.accId)?.certs?.find((c) => c.id === certView.certId) })}
          onEditTx={setEditTx}
        />
      )}
      {bulkAdd && <BulkCertSheet accId={bulkAdd} onClose={() => setBulkAdd(null)} />}
      {bulkEdit && <BulkEditSheet accId={bulkEdit.accId} certIds={bulkEdit.ids} onClose={() => setBulkEdit(null)} onDone={() => { bulkEdit.done(); setBulkEdit(null); }} />}
      {certForm && <CertForm accId={certForm.accId} cert={certForm.cert} onClose={() => setCertForm(null)} />}
      {redeem && <RedeemSheet accId={redeem.accId} cert={redeem.cert} onClose={() => setRedeem(null)} />}
      {editTx && <AddSheet tx={editTx} onClose={() => setEditTx(null)} />}
      {addFor && <AddSheet preset={{ accountId: addFor }} onClose={() => setAddFor(null)} />}
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
          onAddCert={() => setCertForm({ accId: detailAcc.id, cert: null })}
          onAddMany={() => setBulkAdd(detailAcc.id)}
          onBulkEdit={(ids, done) => setBulkEdit({ accId: detailAcc.id, ids, done })}
          onBulkDelete={(ids, done) => {
            if (!window.confirm(t('cert.confirmDeleteMany', { n: ids.length }))) return;
            const { deleted, kept } = deleteCerts(state, detailAcc.id, ids);
            dispatch({ type: 'cert/deleteMany', accountId: detailAcc.id, certIds: ids });
            toast(t('cert.bulkDeleted', { n: deleted }) + (kept ? t('cert.deleteKept', { n: kept }) : ''));
            done();
          }}
          onOpenCert={(c) => setCertView({ accId: detailAcc.id, certId: c.id })}
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
