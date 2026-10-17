import { dateOfDay, dayOf, fmtClock } from '../sim/schedule';
import type { SimState } from '../sim/types';

export const baht = (n: number) => (n < -0.5 ? '-฿' : '฿') + Math.abs(Math.round(n)).toLocaleString('th-TH');
export const num = (n: number, digits = 0) => n.toLocaleString('th-TH', { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const pct = (n: number, digits = 1) => (n * 100).toFixed(digits) + '%';

export function compactBaht(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e6) return `${sign}฿${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e3) return `${sign}฿${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
  return `${sign}฿${Math.round(a)}`;
}

export function thaiDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('th-TH', { ...opts, timeZone: 'UTC' });
}

export function simDate(sim: SimState, t = sim.time) {
  return dateOfDay(sim.settings.startDate, dayOf(t));
}

export function stamp(sim: SimState, t: number) {
  return `${thaiDate(simDate(sim, t), { day: 'numeric', month: 'short' })} ${fmtClock(t)}`;
}

export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
