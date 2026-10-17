import { emptyGrades, GRADE_LABEL } from './grading';
import {
  EXPENSE_CATS,
  GRADES,
  INCOME_CATS,
  type DailyRecord,
  type ExpenseCat,
  type Flock,
  type GradeCounts,
  type House,
  type IncomeCat,
} from './types';

export type Period = 'day' | 'month' | 'year';

export interface SummaryRow {
  key: string;
  label: string;
  days: number;
  hensEnd: number;
  deaths: number;
  eggs: number;
  eggsByGrade: GradeCounts;
  eggsSold: number;
  eggsSoldByGrade: GradeCounts;
  traysSold: number;
  eggsSoldSingle: number;
  eggsWasted: number;
  lostEggs: number;
  customers: number;
  feedKg: number;
  manureKg: number;
  income: Record<IncomeCat, number>;
  expense: Record<ExpenseCat, number>;
  incomeTotal: number;
  expenseTotal: number;
  profit: number;
}

export const INCOME_LABEL: Record<IncomeCat, string> = { egg: 'ขายไข่', manure: 'ขายมูลไก่' };
export const INCOME_ICON: Record<IncomeCat, string> = { egg: '🥚', manure: '🌱' };
export const EXPENSE_ICON: Record<ExpenseCat, string> = {
  feed: '🌾',
  wage: '👷',
  utility: '💡',
  transport: '🚚',
  tray: '📦',
  pullet: '🐣',
  house: '🏗️',
  reserve: '🏦',
};
export const EXPENSE_LABEL: Record<ExpenseCat, string> = {
  feed: 'ค่าอาหารไก่',
  wage: 'ค่าแรงพนักงาน',
  utility: 'ค่าน้ำ/ไฟ',
  transport: 'ค่าขนส่ง',
  tray: 'ค่าแผงไข่',
  pullet: 'ค่าไก่สาว',
  house: 'ค่าสร้างโรงเรือน',
  reserve: 'กันเงินซื้อไก่รอบถัดไป',
};

function periodKey(date: string, p: Period): string {
  return p === 'day' ? date : p === 'month' ? date.slice(0, 7) : date.slice(0, 4);
}

export function periodLabel(key: string, p: Period): string {
  if (p === 'year') return `พ.ศ. ${Number(key) + 543}`;
  const d = new Date((p === 'month' ? key + '-01' : key) + 'T00:00:00Z');
  return d.toLocaleDateString(
    'th-TH',
    p === 'month'
      ? { month: 'short', year: 'numeric', timeZone: 'UTC' }
      : { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' },
  );
}

const zeroIncome = () => Object.fromEntries(INCOME_CATS.map((c) => [c, 0])) as Record<IncomeCat, number>;
const zeroExpense = () => Object.fromEntries(EXPENSE_CATS.map((c) => [c, 0])) as Record<ExpenseCat, number>;

export function summarize(records: DailyRecord[], period: Period): SummaryRow[] {
  const map = new Map<string, SummaryRow>();
  for (const r of records) {
    const key = periodKey(r.date, period);
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        label: periodLabel(key, period),
        days: 0,
        hensEnd: 0,
        deaths: 0,
        eggs: 0,
        eggsByGrade: emptyGrades(),
        eggsSold: 0,
        eggsSoldByGrade: emptyGrades(),
        traysSold: 0,
        eggsSoldSingle: 0,
        eggsWasted: 0,
        lostEggs: 0,
        customers: 0,
        feedKg: 0,
        manureKg: 0,
        income: zeroIncome(),
        expense: zeroExpense(),
        incomeTotal: 0,
        expenseTotal: 0,
        profit: 0,
      };
      map.set(key, row);
    }
    row.days++;
    row.hensEnd = r.hens;
    row.deaths += r.deaths;
    row.eggs += r.eggs;
    row.eggsSold += r.eggsSold;
    row.traysSold += r.traysSold;
    row.eggsSoldSingle += r.eggsSoldSingle;
    row.eggsWasted += r.eggsWasted;
    row.lostEggs += r.lostEggs;
    row.customers += r.customers;
    row.feedKg += r.feedKg;
    row.manureKg += r.manureKg;
    for (const g of GRADES) {
      row.eggsByGrade[g] += r.eggsByGrade[g];
      row.eggsSoldByGrade[g] += r.eggsSoldByGrade[g];
    }
    for (const c of INCOME_CATS) {
      row.income[c] += r.income[c];
      row.incomeTotal += r.income[c];
    }
    for (const c of EXPENSE_CATS) {
      row.expense[c] += r.expense[c];
      row.expenseTotal += r.expense[c];
    }
    row.profit = row.incomeTotal - row.expenseTotal;
  }
  return [...map.values()];
}

export interface FlockSummary {
  flock: Flock;
  houseName: string;
  days: number;
  eggs: number;
  henDays: number;
  avgLayRate: number;
  feedKg: number;
  income: number;
  expense: number;
  profit: number;
  costPerEgg: number;
  eggsPerHen: number;
}

export function summarizeFlocks(records: DailyRecord[], flocks: Flock[], houses: House[]): FlockSummary[] {
  const acc = new Map<string, FlockSummary>();
  for (const f of flocks) {
    acc.set(f.id, {
      flock: f,
      houseName: houses.find((h) => h.id === f.houseId)?.name ?? '(ลบแล้ว)',
      days: 0,
      eggs: 0,
      henDays: 0,
      avgLayRate: 0,
      feedKg: 0,
      income: 0,
      expense: 0,
      profit: 0,
      costPerEgg: 0,
      eggsPerHen: 0,
    });
  }
  for (const r of records) {
    for (const [id, v] of Object.entries(r.flocks)) {
      const a = acc.get(id);
      if (!a) continue;
      if (v.hens > 0) a.days++;
      a.eggs += v.eggs;
      a.henDays += v.hens;
      a.feedKg += v.feedKg;
      a.income += v.income;
      a.expense += v.expense;
    }
  }
  for (const a of acc.values()) {
    a.profit = a.income - a.expense;
    a.avgLayRate = a.henDays > 0 ? a.eggs / a.henDays : 0;
    a.costPerEgg = a.eggs > 0 ? a.expense / a.eggs : 0;
    a.eggsPerHen = a.flock.initialHens > 0 ? a.eggs / a.flock.initialHens : 0;
  }
  return [...acc.values()];
}

function csvCell(v: string | number): string {
  const s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(header: string[], rows: (string | number)[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

export function summaryCSV(rows: SummaryRow[]): string {
  const header = [
    'ช่วงเวลา',
    'จำนวนวัน',
    'ไก่ (ตัว)',
    'ไก่ตาย',
    'ไข่ (ฟอง)',
    ...GRADES.map((g) => `ไข่${GRADE_LABEL[g]}`),
    'ขายรวม (ฟอง)',
    'ขายเป็นแผง (แผง)',
    'ขายเป็นฟอง (ฟอง)',
    'ไข่ไม่พอขาย (ฟอง)',
    'ไข่ทิ้ง (ฟอง)',
    'ลูกค้า',
    'อาหาร (กก.)',
    'มูลไก่ (กก.)',
    ...INCOME_CATS.map((c) => INCOME_LABEL[c]),
    ...EXPENSE_CATS.map((c) => EXPENSE_LABEL[c]),
    'รายรับรวม',
    'รายจ่ายรวม',
    'กำไร',
  ];
  const body = rows.map((r) => [
    r.key,
    r.days,
    r.hensEnd,
    r.deaths,
    r.eggs,
    ...GRADES.map((g) => r.eggsByGrade[g]),
    r.eggsSold,
    r.traysSold,
    r.eggsSoldSingle,
    r.lostEggs,
    r.eggsWasted,
    r.customers,
    r.feedKg,
    r.manureKg,
    ...INCOME_CATS.map((c) => r.income[c]),
    ...EXPENSE_CATS.map((c) => r.expense[c]),
    r.incomeTotal,
    r.expenseTotal,
    r.profit,
  ]);
  return toCSV(header, body);
}

export function flockCSV(rows: FlockSummary[]): string {
  const header = ['รุ่น', 'โรงเรือน', 'สถานะ', 'ไก่เริ่ม', 'ไก่ปัจจุบัน', 'จำนวนวัน', 'ไข่ (ฟอง)', 'อัตราไข่เฉลี่ย %', 'ไข่/แม่ไก่', 'อาหาร (กก.)', 'รายรับ', 'รายจ่าย', 'กำไร', 'ต้นทุน/ฟอง'];
  const body = rows.map((r) => [
    r.flock.name,
    r.houseName,
    r.flock.active ? 'กำลังเลี้ยง' : 'ปลดแล้ว',
    r.flock.initialHens,
    r.flock.hens,
    r.days,
    r.eggs,
    r.avgLayRate * 100,
    r.eggsPerHen,
    r.feedKg,
    r.income,
    r.expense,
    r.profit,
    r.costPerEgg,
  ]);
  return toCSV(header, body);
}
