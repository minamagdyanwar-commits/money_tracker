import { useEffect } from 'react';
import { useApp } from './store.jsx';
import { addMonths } from './logic.js';

const SVG = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const PATHS = {
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  pay: 'M4 5h16v15H4z M4 10h16 M8 3v4 M16 3v4 M9 15l2 2 4-4',
  chart: 'M4 20V10 M10 20V4 M16 20v-8 M22 20H2',
  gear: 'M4 7h10 M18 7h2 M4 17h2 M10 17h10 M14 5v4 M6 15v4',
  plus: 'M12 5v14 M5 12h14',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  close: 'M6 6l12 12 M18 6L6 18',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  repeat: 'M17 2l4 4-4 4 M3 11v-1a4 4 0 0 1 4-4h14 M7 22l-4-4 4-4 M21 13v1a4 4 0 0 1-4 4H3',
  check: 'M5 12l5 5 9-10',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 7l12-3v3 M16 14h2',
  swap: 'M7 4L3 8l4 4 M3 8h14 M17 20l4-4-4-4 M21 16H7',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-5-5',
};

export const Icon = ({ name, size = 24, sw = 2, className }) => (
  <svg {...SVG} width={size} height={size} strokeWidth={sw} className={className}>
    <path d={PATHS[name]} />
  </svg>
);

export function Sheet({ title, onClose, children }) {
  const { t } = useApp();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2 className="h1">{title}</h2>
          <button className="iconbtn" aria-label={t('common.close')} onClick={onClose}>
            <Icon name="close" size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function MonthNav({ month, onChange }) {
  const { t, monthLabel } = useApp();
  return (
    <div className="row between">
      <button className="iconbtn" aria-label={t('month.prev')} onClick={() => onChange(addMonths(month, -1))}>
        <Icon name="left" size={22} className="flip" />
      </button>
      <div className="h1">{monthLabel(month)}</div>
      <button className="iconbtn" aria-label={t('month.next')} onClick={() => onChange(addMonths(month, 1))}>
        <Icon name="right" size={22} className="flip" />
      </button>
    </div>
  );
}

export const Field = ({ label, children }) => (
  <label className="field">
    <span>{label}</span>
    {children}
  </label>
);

export function download(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const numericOnly = (v) => v.replace(/[^0-9.,]/g, '');
export const parseAmount = (s) => parseFloat(String(s).replace(/,/g, ''));

// ---- charts (always laid out left-to-right so time reads oldest -> newest) ----

export function Donut({ slices, size = 120, label }) {
  const circ = 2 * Math.PI * 40;
  const sum = slices.reduce((a, s) => a + s.share, 0);
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={label} style={{ flex: 'none', transform: 'rotate(-90deg)' }}>
      <circle cx="50" cy="50" r="40" fill="none" style={{ stroke: 'var(--line)' }} strokeWidth="16" />
      {sum > 0 &&
        slices.map((s, i) => {
          const len = (s.share / sum) * circ;
          const el = <circle key={i} cx="50" cy="50" r="40" fill="none" stroke={s.color} strokeWidth="16" strokeDasharray={`${len} ${circ}`} strokeDashoffset={-offset} />;
          offset += len;
          return el;
        })}
    </svg>
  );
}

export function LineChart({ months, values, color = '#1F6F5C' }) {
  const { t, monthShort, state } = useApp();
  const W = 330;
  const pad = 20;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const lo = min > 0 ? min * 0.8 : 0;
  const span = max - lo || 1;
  const x = (i) => (months.length === 1 ? W / 2 : pad + (i * (W - pad * 2)) / (months.length - 1));
  const y = (v) => 14 + (1 - (v - lo) / span) * 118;
  const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const step = Math.ceil(months.length / 7);
  const last = values.length - 1;
  return (
    <svg viewBox="0 0 330 160" width="100%" role="img" aria-label="Monthly trend" style={{ direction: 'ltr' }} data-cur={state.settings.currency}>
      <line x1="10" x2="325" y1={y(avg)} y2={y(avg)} style={{ stroke: 'var(--faint)' }} strokeWidth="1.5" strokeDasharray="5 4" />
      <text x="325" y={y(avg) - 6} fontSize="10" textAnchor="end" style={{ fill: 'var(--muted)' }}>
        {t('stats.avgLabel', { amt: Math.round(avg).toLocaleString('en-US') })}
      </text>
      <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={i === last ? 6 : 4.5} fill={color} style={i === last ? { stroke: 'var(--card)' } : undefined} strokeWidth={i === last ? 2 : 0} />
      ))}
      {months.map((m, i) =>
        i % step === 0 || i === last ? (
          <text key={m} x={x(i)} y="152" fontSize="11" textAnchor="middle" fontWeight={i === last ? 700 : 400} style={{ fill: i === last ? 'var(--ink)' : 'var(--muted)' }}>
            {monthShort(m)}
          </text>
        ) : null
      )}
    </svg>
  );
}

export function BarChart({ months, income, expense }) {
  const { monthShort } = useApp();
  const max = Math.max(...income, ...expense, 1);
  const slot = 310 / months.length;
  const w = Math.min(14, slot / 2.6);
  const h = (v) => (v / max) * 118;
  const step = Math.ceil(months.length / 8);
  return (
    <svg viewBox="0 0 330 150" width="100%" role="img" aria-label="Income versus expenses per month" style={{ direction: 'ltr' }}>
      {months.map((m, i) => {
        const cx = 10 + slot * i + slot / 2;
        return (
          <g key={m}>
            <rect x={cx - w - 1} y={126 - h(income[i])} width={w} height={h(income[i])} rx="3" style={{ fill: 'var(--chart-income)' }} />
            <rect x={cx + 1} y={126 - h(expense[i])} width={w} height={h(expense[i])} rx="3" style={{ fill: 'var(--chart-expense)' }} />
            {(i % step === 0 || i === months.length - 1) && (
              <text x={cx} y="142" fontSize="11" textAnchor="middle" style={{ fill: 'var(--muted)' }}>
                {monthShort(m)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Balance over time. `points` are { date, value }; negative balances draw below a zero line.
export function TrendChart({ points, color = '#1F6F5C', label }) {
  const { dayLabel } = useApp();
  if (points.length === 0) return null;
  const W = 330;
  const padX = 12;
  const values = points.map((p) => p.value);
  const hi = Math.max(...values, 0);
  const lo = Math.min(...values, 0);
  const span = hi - lo || 1;
  const x = (i) => (points.length === 1 ? W / 2 : padX + (i * (W - padX * 2)) / (points.length - 1));
  const y = (v) => 12 + (1 - (v - lo) / span) * 110;
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const area = `${x(0)},${y(0)} ${line} ${x(points.length - 1)},${y(0)}`;
  const ticks = points.length <= 5 ? points.map((_, i) => i) : [0, Math.round((points.length - 1) / 4), Math.round((points.length - 1) / 2), Math.round(((points.length - 1) * 3) / 4), points.length - 1];
  const last = points.length - 1;
  return (
    <svg viewBox="0 0 330 150" width="100%" role="img" aria-label={label} style={{ direction: 'ltr' }}>
      <line x1={padX} x2={W - padX} y1={y(0)} y2={y(0)} style={{ stroke: 'var(--faint)' }} strokeWidth="1" strokeDasharray="4 4" />
      <polygon points={area} fill={color} opacity="0.12" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(points[last].value)} r="5" fill={color} style={{ stroke: 'var(--card)' }} strokeWidth="2" />
      {[...new Set(ticks)].map((i) => (
        <text key={i} x={x(i)} y="145" fontSize="10" textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} style={{ fill: 'var(--muted)' }}>
          {dayLabel(points[i].date)}
        </text>
      ))}
    </svg>
  );
}
