import { useApp } from './store.jsx';
import { creditStatus, fmt, isoDate, nextInterest } from './logic.js';

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

// Interest terms of a certificate and when the next payout is due.
export function CertInfo({ acc, balance, cur }) {
  const { t, dayLabel } = useApp();
  const it = acc.interest;
  if (acc.type !== 'certificate' || !it) return null;
  const today = isoDate();
  const next = nextInterest(acc, balance, today);
  const matured = !it.closed && it.maturityDate && it.maturityDate <= today;
  return (
    <div className="credit">
      <div className="small muted">{t('cert.rateLine', { rate: it.rate, every: t('cert.' + it.every) })}</div>
      {it.closed ? (
        <span className="tag plain" style={{ alignSelf: 'flex-start' }}>{t('cert.closed')}</span>
      ) : (
        <>
          {next && <div className="small bold">{t('cert.next', { date: dayLabel(next.date), amt: fmt(next.amount) + ' ' + cur })}</div>}
          {matured && <span className="tag mid" style={{ alignSelf: 'flex-start' }}>{t('cert.matured')}</span>}
        </>
      )}
    </div>
  );
}
