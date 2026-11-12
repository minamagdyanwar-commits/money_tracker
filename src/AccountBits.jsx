import { useApp } from './store.jsx';
import { certSummary, creditStatus, fmt, isoDate } from './logic.js';

export const ACCOUNT_TYPES = ['bank', 'cash', 'credit', 'savings', 'certificate'];
// The first-run setup only asks for plain accounts; certificates are added later from Accounts.
export const SETUP_TYPES = ['bank', 'cash', 'credit', 'savings'];

// Balance text: credit cards show what is owed, everything else the signed balance.
export function BalanceText({ acc, balance, cur }) {
  const { t } = useApp();
  if (acc.type === 'credit' && balance < 0) return <span className="bad-text">{t('acc.owedNow', { amt: fmt(-balance) })} {cur}</span>;
  return <span className={balance < 0 ? 'bad-text' : ''} dir="ltr">{balance < 0 ? '−' : ''}{fmt(Math.abs(balance))} {cur}</span>;
}

// Used / available against the card limit (renders nothing for non-cards or cards without a limit).
export function CreditMeter({ acc, balance, cur }) {
  const { t } = useApp();
  const c = creditStatus(acc, balance);
  if (!c) return null;
  return (
    <div className="credit">
      <div className={'meter ' + c.level} role="progressbar" aria-valuenow={Math.round(c.ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: Math.min(100, c.ratio * 100) + '%' }} />
      </div>
      <div className={'small ' + (c.level === 'over' ? 'bad-text bold' : 'muted')}>
        {c.level === 'over'
          ? t('acc.overLimit', { amt: fmt(-c.available) + ' ' + cur })
          : `${t('acc.availableOf', { avail: fmt(c.available), limit: fmt(c.limit) })} ${cur} · ${t('acc.used', { pct: Math.round(c.ratio * 100) })}`}
      </div>
    </div>
  );
}

// One line under a certificate account in lists: how many certificates and the interest coming in 30 days.
export function CertAccountInfo({ acc, cur }) {
  const { t, state } = useApp();
  if (acc.type !== 'certificate') return null;
  const sum = certSummary(acc, state.transactions, state.transfers, isoDate());
  const active = sum.rows.filter((r) => !r.cert.closed).length;
  if (active === 0) return null;
  return <div className="small muted" style={{ marginTop: 4 }}>{t('cert.accountLine', { n: active, amt: fmt(sum.next30) + ' ' + cur })}</div>;
}

// Rate and schedule of one certificate, e.g. "18% per year · every month".
export const certRateLine = (t, cert) => t('cert.rateLine', { rate: cert.rate, every: t('cert.' + cert.every) });
