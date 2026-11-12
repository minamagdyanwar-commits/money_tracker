import { useState } from 'react';
import { PALETTE, useApp } from './store.jsx';
import { fmt } from './logic.js';
import { DEFAULT_ACCOUNT_NAMES } from './i18n.js';
import { SETUP_TYPES } from './AccountBits.jsx';
import { Field, Icon, numericOnly, parseAmount } from './ui.jsx';

// First-run screen: the user states what each account holds today. Those starting
// balances are the base that every later entry builds on.
export default function Setup() {
  const { state, dispatch, t, lang } = useApp();
  const [currency, setCurrency] = useState(state.settings.currency);
  const [rows, setRows] = useState([{ name: DEFAULT_ACCOUNT_NAMES['acc-main'][lang === 'ar' ? 1 : 0], type: 'bank', amount: '', main: true }]);
  const cur = currency.trim() || 'EGP';

  const update = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const value = (r) => (parseAmount(r.amount) || 0) * (r.type === 'credit' ? -1 : 1);
  const total = rows.reduce((a, r) => a + value(r), 0);
  const valid = rows.length > 0 && rows.every((r) => r.name.trim());

  const addRow = (type) => setRows([...rows, { name: '', type, amount: '' }]);
  const start = () => {
    const accounts = rows.map((r, i) => {
      const isDefaultName = r.main && Object.values(DEFAULT_ACCOUNT_NAMES['acc-main']).includes(r.name.trim());
      return {
        name: isDefaultName ? DEFAULT_ACCOUNT_NAMES['acc-main'][0] : r.name.trim(),
        type: r.type,
        color: PALETTE[i % PALETTE.length],
        openingBalance: value(r),
        useDefaultId: !!r.main,
        ...(r.type === 'credit' && parseAmount(r.limit) > 0 ? { creditLimit: parseAmount(r.limit) } : {}),
      };
    });
    dispatch({ type: 'setup/complete', accounts, currency: cur });
  };

  return (
    <div className="app">
      <div className="screen">
        <div className="row between">
          <div className="muted bold">{t('setup.welcome')}</div>
          <div className="seg lang-seg" role="group" aria-label={t('set.language')}>
            {[['ar', 'العربية'], ['en', 'English']].map(([k, label]) => (
              <button key={k} className={lang === k ? 'on' : ''} onClick={() => dispatch({ type: 'settings', settings: { lang: k } })}>{label}</button>
            ))}
          </div>
        </div>
        <h1 className="h1 big-title">{t('setup.title')}</h1>
        <div className="muted">{t('setup.intro')}</div>

        {rows.map((r, i) => (
          <div className="card" key={i}>
            <div className="row between">
              <h3>{t('setup.account', { n: i + 1 })}</h3>
              {rows.length > 1 && (
                <button className="iconbtn" aria-label={t('setup.remove')} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Icon name="close" size={20} /></button>
              )}
            </div>
            <Field label={t('acc.name')}>
              <input type="text" placeholder={t('acc.namePh')} value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
            </Field>
            <div className="chips">
              {SETUP_TYPES.map((k) => <button key={k} className={'chip' + (r.type === k ? ' on' : '')} onClick={() => update(i, { type: k })}>{t('acc.type.' + k)}</button>)}
            </div>
            <Field label={t(r.type === 'credit' ? 'acc.openingOwed' : 'acc.opening', { cur })}>
              <input inputMode="decimal" placeholder="0" aria-label={t('acc.opening', { cur })} value={r.amount} onChange={(e) => update(i, { amount: numericOnly(e.target.value) })} />
            </Field>
            {r.type === 'credit' && (
              <>
                <div className="muted small">{t('setup.cardHint')}</div>
                <Field label={t('acc.limit', { cur })}>
                  <input inputMode="decimal" placeholder="—" aria-label={t('acc.limit', { cur })} value={r.limit || ''} onChange={(e) => update(i, { limit: numericOnly(e.target.value) })} />
                </Field>
                <div className="muted small">{t('acc.limitHint')}</div>
              </>
            )}
          </div>
        ))}

        <button className="chip dash" style={{ alignSelf: 'flex-start' }} onClick={() => addRow('cash')}>+ {t('setup.addMore')}</button>

        <Field label={t('setup.currency')}>
          <input value={currency} maxLength={5} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </Field>

        <div className="hero">
          <div className="label">{t('setup.total')}</div>
          <div className="big"><span dir="ltr">{total < 0 ? '− ' : ''}{fmt(Math.abs(total))}</span> <small>{cur}</small></div>
        </div>
        <div className="muted small">{t('setup.note')}</div>
        <button className="btn block" disabled={!valid} onClick={start}>{t('setup.start')}</button>
      </div>
    </div>
  );
}
