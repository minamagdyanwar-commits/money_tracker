import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react';
import { loadState, requestPersistence, saveState } from './db.js';
import { INTEREST_CATEGORY, accountInUse, accrueInterest, bulkEditCerts, deleteCert, deleteCerts, firstActiveAccount, isValidBackup, isoDate, migrateCertificates, monthOf, newId, payKey, redeemCertificate, saveCert, saveCerts } from './logic.js';
import { DEFAULT_ACCOUNT_NAMES, DEFAULT_CATEGORY_NAMES, MONTHS, MONTHS_SHORT, detectLang, translate } from './i18n.js';

export const DEFAULT_ACCOUNT_ID = 'acc-main';
export const PALETTE = ['#1F6F5C', '#D98E04', '#2F5D9E', '#8A4F7D', '#7A7F85', '#B0361B', '#2A8FA3', '#6B7D2A', '#C2569B', '#4B4EA8'];

const cat = (id, name, type, color) => ({ id, name, type, color, archived: false });

export const initialState = () => ({
  version: 1,
  categories: [
    cat('c-inst', 'Installments', 'expense', PALETTE[0]),
    cat('c-bills', 'Monthly bills', 'expense', PALETTE[2]),
    cat('c-food', 'Food', 'expense', PALETTE[3]),
    cat('c-groc', 'Groceries', 'expense', PALETTE[1]),
    cat('c-trans', 'Transport', 'expense', PALETTE[4]),
    cat('c-health', 'Health', 'expense', PALETTE[5]),
    cat('c-edu', 'Education', 'expense', PALETTE[6]),
    cat('c-family', 'Family', 'expense', PALETTE[8]),
    cat('c-fun', 'Entertainment', 'expense', PALETTE[9]),
    cat('c-other', 'Other', 'expense', PALETTE[7]),
    cat('i-salary', 'Salary', 'income', PALETTE[0]),
    cat('i-bonus', 'Bonus', 'income', PALETTE[1]),
    cat('i-side', 'Side income', 'income', PALETTE[2]),
    cat('i-other', 'Other', 'income', PALETTE[4]),
    cat(INTEREST_CATEGORY, 'Interest', 'income', PALETTE[6]),
  ],
  accounts: [{ id: DEFAULT_ACCOUNT_ID, name: 'Main account', type: 'bank', color: PALETTE[0], openingBalance: 0, archived: false }],
  transactions: [],
  transfers: [],
  recurring: [],
  payments: {},
  settings: { currency: 'EGP', lang: detectLang(), theme: 'system', lastBackup: null, lastAccountId: null, onboarded: false },
});

const upsert = (list, item) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]);

export function reducer(state, action) {
  switch (action.type) {
    case 'load':
      return action.state;
    case 'tx/save': {
      const tx = action.tx.id ? action.tx : { ...action.tx, id: newId() };
      const accountId = tx.accountId || firstActiveAccount(state.accounts);
      return {
        ...state,
        transactions: upsert(state.transactions, { ...tx, accountId }),
        settings: { ...state.settings, lastAccountId: accountId },
      };
    }
    case 'acc/save': {
      const acc = action.acc.id ? action.acc : { ...action.acc, id: newId(), archived: false };
      return { ...state, accounts: upsert(state.accounts, acc) };
    }
    case 'acc/archive':
      return { ...state, accounts: state.accounts.map((a) => (a.id === action.id ? { ...a, archived: action.archived } : a)) };
    case 'acc/delete':
      if (accountInUse(action.id, state.transactions, state.transfers, state.recurring) || state.accounts.length <= 1) return state;
      return { ...state, accounts: state.accounts.filter((a) => a.id !== action.id) };
    case 'transfer/save': {
      const tr = action.transfer.id ? action.transfer : { ...action.transfer, id: newId() };
      return { ...state, transfers: upsert(state.transfers, tr) };
    }
    case 'transfer/delete':
      return { ...state, transfers: state.transfers.filter((x) => x.id !== action.id) };
    case 'tx/delete': {
      const payments = { ...state.payments };
      for (const k of Object.keys(payments)) if (payments[k].txId === action.id) delete payments[k];
      return { ...state, transactions: state.transactions.filter((t) => t.id !== action.id), payments };
    }
    case 'cat/save': {
      const c = action.cat.id ? action.cat : { ...action.cat, id: newId(), archived: false };
      return { ...state, categories: upsert(state.categories, c) };
    }
    case 'cat/archive':
      return { ...state, categories: state.categories.map((c) => (c.id === action.id ? { ...c, archived: action.archived } : c)) };
    case 'cat/move': {
      const same = state.categories.filter((c) => c.type === action.catType);
      const i = same.findIndex((c) => c.id === action.id);
      const j = i + action.dir;
      if (i < 0 || j < 0 || j >= same.length) return state;
      const next = [...same];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...state, categories: [...state.categories.filter((c) => c.type !== action.catType), ...next] };
    }
    case 'rec/save': {
      const rec = action.rec.id ? action.rec : { ...action.rec, id: newId() };
      return { ...state, recurring: upsert(state.recurring, rec) };
    }
    case 'rec/delete': {
      const payments = { ...state.payments };
      for (const k of Object.keys(payments)) if (k.startsWith(action.id + '|')) delete payments[k];
      const transactions = state.transactions.map((t) => (t.recurringId === action.id ? { ...t, recurringId: undefined } : t));
      return { ...state, recurring: state.recurring.filter((r) => r.id !== action.id), payments, transactions };
    }
    case 'pay/mark': {
      const { rec, month, amount, date } = action;
      const key = payKey(rec.id, month);
      const prev = state.payments[key];
      const kept = prev ? state.transactions.filter((t) => t.id !== prev.txId) : state.transactions;
      const accountId = action.accountId || rec.accountId || state.settings.lastAccountId || firstActiveAccount(state.accounts);
      const tx = { id: newId(), type: 'expense', amount, categoryId: rec.categoryId, date, note: rec.name, recurringId: rec.id, month, accountId };
      return { ...state, transactions: [...kept, tx], payments: { ...state.payments, [key]: { txId: tx.id } } };
    }
    case 'pay/unmark': {
      const key = payKey(action.recId, action.month);
      const prev = state.payments[key];
      if (!prev) return state;
      const payments = { ...state.payments };
      delete payments[key];
      return { ...state, payments, transactions: state.transactions.filter((t) => t.id !== prev.txId) };
    }
    case 'setup/complete': {
      // First-run setup: the accounts the user typed in, each with its starting balance.
      const accounts = action.accounts.map((a, i) => ({ ...a, id: i === 0 && a.useDefaultId ? DEFAULT_ACCOUNT_ID : newId(), archived: false, useDefaultId: undefined }));
      return {
        ...state,
        accounts,
        settings: { ...state.settings, currency: action.currency || state.settings.currency, onboarded: true, lastAccountId: accounts[0].id },
      };
    }
    case 'interest/accrue':
      return accrueInterest(state, action.today);
    case 'cert/save':
      return saveCert(state, action.accountId, action.cert);
    case 'cert/saveMany':
      return saveCerts(state, action.accountId, action.certs);
    case 'cert/bulkEdit':
      return bulkEditCerts(state, action.accountId, action.certIds, action.changes, isoDate()).data;
    case 'cert/deleteMany':
      return deleteCerts(state, action.accountId, action.certIds).data;
    case 'cert/delete':
      return deleteCert(state, action.accountId, action.certId);
    case 'cert/redeem':
      return redeemCertificate(state, action.redeem);
    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.settings } };
    case 'import':
      return isValidBackup(action.data) ? mergeLoaded(action.data) : state;
    case 'reset':
      return { ...initialState(), settings: { ...initialState().settings, lang: state.settings.lang, theme: state.settings.theme } };
    default:
      return state;
  }
}

// Fill in anything an older backup / saved state does not have (new settings, etc).
// Data saved before accounts existed gets one default account that owns every entry.
export function mergeLoaded(saved) {
  const base = initialState();
  const merged = { ...base, ...saved, settings: { ...base.settings, ...(saved.settings || {}) } };
  // Anyone who saved data before the setup screen existed is already set up.
  if (saved.settings?.onboarded === undefined) merged.settings.onboarded = true;
  if (!Array.isArray(merged.accounts) || merged.accounts.length === 0) merged.accounts = base.accounts;
  if (!Array.isArray(merged.transfers)) merged.transfers = [];
  if (!merged.categories.some((c) => c.id === INTEREST_CATEGORY)) merged.categories = [...merged.categories, base.categories.find((c) => c.id === INTEREST_CATEGORY)];
  const fallback = firstActiveAccount(merged.accounts);
  if (merged.transactions.some((t) => !t.accountId)) {
    merged.transactions = merged.transactions.map((t) => (t.accountId ? t : { ...t, accountId: fallback }));
  }
  return migrateCertificates(merged);
}

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function Provider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, initialState);
  const [ready, setReady] = useState(false);
  const [persisted, setPersisted] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    (async () => {
      const saved = await loadState();
      if (saved && isValidBackup(saved)) dispatch({ type: 'load', state: mergeLoaded(saved) });
      setPersisted(await requestPersistence());
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (ready) saveState(state);
  }, [state, ready]);

  // Credit interest that has come due: whenever accounts change (a new or edited certificate) and
  // when the app is brought back to the front (a new day). It does nothing when nothing is due.
  useEffect(() => {
    if (ready) dispatch({ type: 'interest/accrue', today: isoDate() });
  }, [ready, state.accounts]);
  useEffect(() => {
    if (!ready) return undefined;
    const onVisible = () => document.visibilityState === 'visible' && dispatch({ type: 'interest/accrue', today: isoDate() });
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [ready]);

  const { lang, theme } = state.settings;
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    else delete root.dataset.theme;
    const dark = theme === 'dark' || (theme !== 'light' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0F1514' : '#14201F');
  }, [theme]);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastMsg(''), 2200);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);

  const catName = (id) => {
    const c = state.categories.find((x) => x.id === id);
    if (!c) return t('common.deleted');
    const def = DEFAULT_CATEGORY_NAMES[c.id];
    return def && c.name === def[0] ? def[lang === 'ar' ? 1 : 0] : c.name;
  };
  const accName = (id) => {
    const a = state.accounts.find((x) => x.id === id);
    if (!a) return t('acc.deleted');
    const def = DEFAULT_ACCOUNT_NAMES[a.id];
    return def && a.name === def[0] ? def[lang === 'ar' ? 1 : 0] : a.name;
  };
  const catColor = (id) => state.categories.find((x) => x.id === id)?.color ?? '#7A7F85';
  const monthLabel = (m) => `${MONTHS[lang][Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
  const monthShort = (m) => MONTHS_SHORT[lang][Number(m.slice(5, 7)) - 1];
  const dayLabel = (date) => `${Number(date.slice(8, 10))} ${monthShort(monthOf(date))}`;

  return (
    <Ctx.Provider value={{ state, dispatch, ready, persisted, lang, t, toast, toastMsg, catName, accName, catColor, monthLabel, monthShort, dayLabel }}>
      {children}
    </Ctx.Provider>
  );
}
