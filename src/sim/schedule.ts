export const MIN_PER_DAY = 1440;

export type FixedEvent = 'feed' | 'collect' | 'grade' | 'ship' | 'open' | 'manure' | 'close' | 'endday';

export const FIXED_EVENTS: { m: number; type: FixedEvent }[] = [
  { m: 6 * 60, type: 'feed' },
  { m: 9 * 60, type: 'collect' },
  { m: 11 * 60, type: 'grade' },
  { m: 13 * 60, type: 'ship' },
  { m: 14 * 60, type: 'open' },
  { m: 16 * 60, type: 'manure' },
  { m: 20 * 60, type: 'close' },
  { m: 23 * 60 + 59, type: 'endday' },
];

/** ช่วงเวลางาน (นาทีของวัน) ใช้ร่วมกันระหว่าง engine กับ animation */
export const WINDOWS = {
  feed: [360, 450],
  collect: [540, 630],
  grade: [660, 750],
  load: [765, 795],
  truckGo: [795, 830],
  truckUnload: [830, 845],
  truckBack: [845, 880],
  store: [480, 1200],
  sales: [840, 1200],
  manure: [960, 1020],
} as const;

export function fixedEventAfter(t: number): { at: number; type: FixedEvent } {
  const day = Math.floor(t / MIN_PER_DAY);
  const mod = t - day * MIN_PER_DAY;
  for (const e of FIXED_EVENTS) if (e.m > mod) return { at: day * MIN_PER_DAY + e.m, type: e.type };
  return { at: (day + 1) * MIN_PER_DAY + FIXED_EVENTS[0].m, type: FIXED_EVENTS[0].type };
}

export function dayOf(t: number): number {
  return Math.floor(t / MIN_PER_DAY);
}

export function minuteOfDay(t: number): number {
  return ((t % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
}

export function isManureDay(day: number, interval: number): boolean {
  return interval <= 1 || day % interval === interval - 1;
}

export function fmtClock(t: number): string {
  const m = Math.floor(minuteOfDay(t));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function dateOfDay(startDate: string, day: number): string {
  const d = new Date(startDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().slice(0, 10);
}
