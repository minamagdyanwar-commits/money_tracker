import { useRef, useState } from 'react';
import { PALETTE, useApp } from './store.jsx';
import { isValidBackup, isoDate, toCsv } from './logic.js';
import { Field, Icon, Sheet, download, numericOnly, parseAmount } from './ui.jsx';
import { RecurringList } from './Payments.jsx';
import { exportBackup } from './backup.js';

function CategoryForm({ cat, catType, onClose }) {
  const { state, dispatch, t } = useApp();
  const [name, setName] = useState(cat?.name ?? '');
  const [color, setColor] = useState(cat?.color ?? PALETTE[state.categories.filter((c) => c.type === catType).length % PALETTE.length]);
  const [budget, setBudget] = useState(cat?.budget ? String(cat.budget) : '');
  const isExpense = (cat?.type ?? catType) === 'expense';

  const save = () => {
    const b = parseAmount(budget);
    const next = { ...(cat || { type: catType }), name: name.trim(), color };
    if (isExpense && b > 0) next.budget = b;
    else delete next.budget;
    dispatch({ type: 'cat/save', cat: next });
    onClose();
  };

  return (
    <Sheet title={cat ? t('cat.edit') : t('cat.new', { type: t('cat.' + catType) })} onClose={onClose}>
      <Field label={t('cat.name')}><input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} /></Field>
      {isExpense && (
        <>
          <Field label={t('cat.budget', { cur: state.settings.currency })}>
            <input inputMode="decimal" placeholder="—" value={budget} onChange={(e) => setBudget(numericOnly(e.target.value))} />
          </Field>
          <div className="muted small">{t('cat.budgetHint')}</div>
        </>
      )}
      <div className="muted small bold">{t('cat.colour')}</div>
      <div className="chips">
        {PALETTE.map((c) => (
          <button key={c} aria-label={`${t('cat.colour')} ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} style={{ width: 44, height: 44, borderRadius: 12, background: c, border: color === c ? '3px solid var(--ink)' : '3px solid transparent' }} />
        ))}
      </div>
      <button className="btn block" disabled={!name.trim()} onClick={save}>{t('common.save')}</button>
      {cat && (
        <button className="btn secondary" onClick={() => { dispatch({ type: 'cat/archive', id: cat.id, archived: !cat.archived }); onClose(); }}>
          {cat.archived ? t('cat.restore') : t('cat.archive')}
        </button>
      )}
      {cat && !cat.archived && <div className="muted small">{t('cat.archiveHint')}</div>}
    </Sheet>
  );
}

function Choice({ value, options, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([k, text]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{text}</button>)}
    </div>
  );
}

// Drops the service worker and its cached files, then reloads. Entries live in IndexedDB and are untouched.
async function updateApp() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map((r) => r.unregister()));
    await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch {
    /* reload anyway */
  }
  window.location.reload();
}

export default function Settings() {
  const { state, dispatch, persisted, t, toast, catName, lang } = useApp();
  const [catType, setCatType] = useState('expense');
  const [editing, setEditing] = useState(undefined); // undefined closed, null new, object edit
  const [recOpen, setRecOpen] = useState(false);
  const fileRef = useRef(null);
  const list = state.categories.filter((c) => c.type === catType);

  const importFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!isValidBackup(data)) throw new Error('bad');
      if (!window.confirm(t('set.confirmImport'))) return;
      dispatch({ type: 'import', data });
      toast(t('set.restored'));
    } catch {
      toast(t('set.badFile'));
    }
  };

  return (
    <div className="screen">
      <div className="h1">{t('set.title')}</div>

      <div className="muted small bold">{t('set.general')}</div>
      <div className="card">
        <div className="muted small">{t('set.language')}</div>
        <Choice label={t('set.language')} value={lang} onChange={(v) => dispatch({ type: 'settings', settings: { lang: v } })} options={[['ar', 'العربية'], ['en', 'English']]} />
        <div className="muted small">{t('set.theme')}</div>
        <Choice label={t('set.theme')} value={state.settings.theme} onChange={(v) => dispatch({ type: 'settings', settings: { theme: v } })} options={[['system', t('set.themeSystem')], ['light', t('set.themeLight')], ['dark', t('set.themeDark')]]} />
        <div className="row between">
          <span>{t('set.currency')}</span>
          <input className="cur-input" aria-label={t('set.currency')} value={state.settings.currency} maxLength={5} onChange={(e) => dispatch({ type: 'settings', settings: { currency: e.target.value.toUpperCase() } })} />
        </div>
      </div>

      <div className="muted small bold">{t('set.categories')}</div>
      <Choice label={t('set.catType')} value={catType} onChange={setCatType} options={[['expense', t('common.expense')], ['income', t('common.incomeOne')]]} />
      <div className="card" style={{ padding: '4px 16px' }}>
        <div className="list">
          {list.map((c, i) => (
            <div key={c.id} className="item" style={{ opacity: c.archived ? 0.5 : 1 }}>
              <button className="iconbtn" style={{ width: 36 }} aria-label={t('set.up', { name: catName(c.id) })} disabled={i === 0} onClick={() => dispatch({ type: 'cat/move', id: c.id, catType, dir: -1 })}><Icon name="up" size={18} /></button>
              <button className="iconbtn" style={{ width: 36 }} aria-label={t('set.down', { name: catName(c.id) })} disabled={i === list.length - 1} onClick={() => dispatch({ type: 'cat/move', id: c.id, catType, dir: 1 })}><Icon name="down" size={18} /></button>
              <span className="dot" style={{ background: c.color }} />
              <span className="grow">
                {catName(c.id)}{c.archived ? ' ' + t('set.archived') : ''}
                {c.budget > 0 && <div className="muted small">{c.budget.toLocaleString('en-US')} {state.settings.currency}</div>}
              </span>
              <button className="btn secondary small" onClick={() => setEditing(c)}>{t('common.edit')}</button>
            </div>
          ))}
          <button className="item add-item" onClick={() => setEditing(null)}><Icon name="plus" size={20} /> {t('set.addCat')}</button>
        </div>
      </div>

      <div className="card" style={{ padding: '0 16px', gap: 0 }}>
        <button className="item" onClick={() => setRecOpen(true)}>
          <span className="grow">{t('set.recurring')}</span>
          <span className="muted small">{state.recurring.length}</span>
        </button>
      </div>

      <div className="muted small bold">{t('set.backup')}</div>
      <div className="card">
        <div className="muted small">{t('set.backupHint')}</div>
        <div className="small bold">{state.settings.lastBackup ? t('set.lastBackup', { date: state.settings.lastBackup }) : t('set.noBackup')}</div>
        <button className="btn" onClick={() => { exportBackup(state, dispatch); toast(t('set.backupDone')); }}>{t('set.exportJson')}</button>
        <button className="btn secondary" onClick={() => { download(`expenses-${isoDate()}.csv`, toCsv(state.transactions, state.categories, state.accounts), 'text/csv'); toast(t('set.csvDone')); }}>{t('set.exportCsv')}</button>
        <button className="btn secondary" onClick={() => fileRef.current?.click()}>{t('set.import')}</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importFile} />
        <div className="muted small">{persisted ? t('set.persisted') : t('set.tip')}</div>
        <button className="btn danger" onClick={() => { if (window.confirm(t('set.confirmReset'))) { dispatch({ type: 'reset' }); toast(t('set.reset')); } }}>{t('set.deleteAll')}</button>
      </div>

      <div className="muted small bold">{t('set.about')}</div>
      <div className="card" style={{ padding: '0 16px', gap: 0 }}>
        {[['set.version', 'v' + __APP_VERSION__], ['set.commit', __BUILD_COMMIT__], ['set.build', __BUILD_TIME__]].map(([k, v]) => (
          <div key={k} className="item" style={{ cursor: 'default' }}>
            <span className="grow">{t(k)}</span>
            <span className="muted" dir="ltr">{v}</span>
          </div>
        ))}
        <div className="item" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch', padding: '12px 0' }}>
          <button className="btn secondary" onClick={updateApp}>{t('set.update')}</button>
          <div className="muted small" style={{ marginTop: 6 }}>{t('set.updateHint')}</div>
        </div>
      </div>

      {editing !== undefined && <CategoryForm cat={editing} catType={catType} onClose={() => setEditing(undefined)} />}
      {recOpen && <RecurringList onClose={() => setRecOpen(false)} />}
    </div>
  );
}
