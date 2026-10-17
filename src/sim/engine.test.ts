import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type FarmSetup } from './defaults';
import { addHouse, createSim, fastForward, setHouseHens, tick, totalHens } from './engine';
import { eggWeightMean, feedEffect, layRate } from './flock';
import { gradeEggs, sumGrades } from './grading';
import { summarize, summarizeFlocks } from './ledger';
import { MIN_PER_DAY } from './schedule';
import { EXPENSE_CATS, GRADES, INCOME_CATS } from './types';

describe('flock curves', () => {
  it('lay rate ramps up from 18 weeks then holds at the target', () => {
    expect(layRate(16, 0.78)).toBe(0);
    expect(layRate(19.5, 0.78)).toBeCloseTo(0.39, 5);
    expect(layRate(24, 0.78)).toBe(0.78);
    expect(layRate(70, 0.78)).toBe(0.78);
  });
  it('egg weight increases with age', () => {
    expect(eggWeightMean(20)).toBeLessThan(eggWeightMean(40));
    expect(eggWeightMean(70)).toBeLessThan(66);
  });
  it('underfeeding reduces laying and egg weight', () => {
    expect(feedEffect(110, 30).layFactor).toBe(1);
    const low = feedEffect(80, 30);
    expect(low.layFactor).toBeLessThan(0.8);
    expect(low.weightDelta).toBeLessThan(0);
  });
});

describe('grading', () => {
  it('graded counts always sum to total eggs', () => {
    for (const mean of [48, 55, 62, 68]) {
      const g = gradeEggs(1234, mean, 4.5, DEFAULT_SETTINGS.gradeMinWeights, 0.02);
      expect(sumGrades(g)).toBe(1234);
    }
  });
  it('heavier eggs shift toward lower grade numbers', () => {
    const light = gradeEggs(10000, 52, 4.5, DEFAULT_SETTINGS.gradeMinWeights, 0);
    const heavy = gradeEggs(10000, 64, 4.5, DEFAULT_SETTINGS.gradeMinWeights, 0);
    expect(heavy['0'] + heavy['1']).toBeGreaterThan(light['0'] + light['1']);
    expect(light['3'] + light.M).toBeGreaterThan(heavy['3'] + heavy.M);
  });
});

/** ฟาร์มขนาดใหญ่ ส่งรถไปขายหน้าร้าน — ใช้ทดสอบกลไกทั้งหมด */
const BIG_SETTINGS = { ...DEFAULT_SETTINGS, salesMode: 'store' as const, customersPerDay: 35, merchantShare: 0.15, eggBuyerShare: 0, defaultHensPerHouse: 2000 };
const BIG_SETUP: FarmSetup = {
  houses: [
    { hens: 2000, ageWeeks: 24 },
    { hens: 2000, ageWeeks: 46 },
  ],
  employees: [
    { name: 'A', role: 'farm', wage: 400 },
    { name: 'B', role: 'farm', wage: 400 },
    { name: 'C', role: 'driver', wage: 450 },
    { name: 'D', role: 'store', wage: 380 },
  ],
};
const big = (over: Partial<typeof BIG_SETTINGS> = {}) => createSim({ ...BIG_SETTINGS, ...over }, BIG_SETUP);

describe('defaults (ฟาร์มเล็ก ขายที่ฟาร์ม)', () => {
  it('starts with 1 house, 100 hens, 1 employee, selling at the farm', () => {
    const sim = createSim();
    expect(sim.houses.length).toBe(1);
    expect(totalHens(sim)).toBe(100);
    expect(sim.employees.length).toBe(1);
    expect(sim.settings.salesMode).toBe('farm');
  });
  it('sells at the farm without truck or transport cost', () => {
    const sim = createSim();
    fastForward(sim, 10);
    const sum = (k: 'eggsSold' | 'eggsSoldSingle' | 'traysSold' | 'trips') => sim.records.reduce((a, r) => a + r[k], 0);
    expect(sum('eggsSold')).toBeGreaterThan(500);
    expect(sum('eggsSoldSingle')).toBeGreaterThan(0);
    expect(sum('traysSold')).toBeGreaterThan(0);
    expect(sum('trips')).toBe(0);
    expect(sim.records.every((r) => r.expense.transport === 0)).toBe(true);
    expect(sim.truck).toBeNull();
  });
});

describe('engine', () => {
  it('is deterministic for the same seed', () => {
    const a = big();
    const b = big();
    fastForward(a, 30);
    fastForward(b, 30);
    expect(a.records).toEqual(b.records);
  });

  it('runs the daily cycle: feed → collect → grade → ship → sell', () => {
    const sim = big();
    tick(sim, MIN_PER_DAY); // ครบวันแรก
    const d0 = sim.records[0];
    expect(d0.feedKg).toBeCloseTo((totalHens(sim) + d0.deaths) * 0.11, -1);
    expect(d0.eggs).toBeGreaterThan(3000);
    expect(sumGrades(d0.eggsByGrade)).toBe(d0.eggs);
    expect(d0.traysPacked).toBeGreaterThanOrEqual(Math.ceil(d0.eggs / 30));
    expect(d0.traysPacked).toBeLessThanOrEqual(Math.ceil(d0.eggs / 30) + GRADES.length);
    expect(d0.traysShipped).toBe(d0.traysPacked);
    expect(d0.trips).toBeGreaterThan(0);
    expect(d0.expense.transport).toBeGreaterThan(0);
    expect(d0.eggsSold).toBeGreaterThan(0);
    expect(d0.eggsSold).toBe(sumGrades(d0.eggsSoldByGrade));
    expect(d0.income.egg).toBeGreaterThan(0);
    expect(d0.expense.feed).toBeGreaterThan(0);
    expect(d0.expense.wage).toBe(400 + 400 + 450 + 380);
  });

  it('collects manure every 2 days', () => {
    const sim = big();
    fastForward(sim, 6);
    const kg = sim.records.map((r) => r.manureKg);
    expect(kg[0]).toBe(0);
    expect(kg[1]).toBeGreaterThan(0);
    expect(kg[2]).toBe(0);
    expect(kg[3]).toBeGreaterThan(0);
  });

  it('underfeeding lowers production', () => {
    const normal = big();
    const hungry = big({ feedGramsPerHen: 75 });
    fastForward(normal, 10);
    fastForward(hungry, 10);
    const eggs = (s: typeof normal) => s.records.reduce((a, r) => a + r.eggs, 0);
    expect(eggs(hungry)).toBeLessThan(eggs(normal) * 0.7);
  });

  it('adding a house adds hens and charges pullets', () => {
    const sim = big();
    const before = totalHens(sim);
    addHouse(sim, { hens: 1500, ageWeeks: 18 });
    expect(totalHens(sim)).toBe(before + 1500);
    expect(sim.today.expense.pullet).toBe(1500 * DEFAULT_SETTINGS.pulletPrice);
    setHouseHens(sim, sim.houses[2].id, 1600);
    expect(sim.today.expense.pullet).toBe(1600 * DEFAULT_SETTINGS.pulletPrice);
  });

  it('culls old flocks and restocks automatically', () => {
    const sim = big();
    fastForward(sim, 7 * 36); // โรงเรือน 2 เริ่มที่ 46 สัปดาห์ → ครบ 80 สัปดาห์
    const h2 = sim.houses[1];
    const flocks = sim.flocks.filter((f) => f.houseId === h2.id);
    expect(flocks.length).toBe(2);
    expect(flocks[0].active).toBe(false);
    expect(flocks[1].active).toBe(true);
    expect(sim.records.some((r) => r.expense.pullet > 0)).toBe(true);
  });
});

describe('lay rate setting', () => {
  it('produces ~78% of hens per day by default', () => {
    const sim = createSim();
    fastForward(sim, 30);
    const eggs = sim.records.reduce((a, r) => a + r.eggs, 0);
    const henDays = sim.records.reduce((a, r) => a + r.hens + r.deaths, 0);
    expect(eggs / henDays).toBeGreaterThan(0.75);
    expect(eggs / henDays).toBeLessThan(0.81);
  });
});

describe('auto expansion', () => {
  const settings = { ...DEFAULT_SETTINGS, autoExpand: true, expandEvery: 1, expandUnit: 'month' as const, expandMaxHouses: 3 };
  it('builds a house with hens every interval up to the max', () => {
    const sim = createSim(settings);
    fastForward(sim, 100);
    expect(sim.houses.length).toBe(3);
    expect(sim.expansion.rounds).toBe(2);
    expect(totalHens(sim)).toBeGreaterThan(290);
  });
  it('sets money aside daily so the next hens are paid from the reserve', () => {
    const sim = createSim(settings);
    fastForward(sim, 100);
    const cost = settings.expandHens * settings.pulletPrice;
    const reserveIn = sim.records.reduce((a, r) => a + r.expense.reserve, 0);
    const reserveUsed = sim.records.reduce((a, r) => a + r.reserveUsed, 0) + sim.today.reserveUsed;
    const pullet = sim.records.reduce((a, r) => a + r.expense.pullet, 0) + sim.today.expense.pullet;
    expect(reserveUsed).toBeCloseTo(2 * cost, 4);
    expect(pullet).toBeCloseTo(0, 4); // จ่ายจากเงินสำรองทั้งหมด ไม่นับซ้ำ
    expect(reserveIn).toBeCloseTo(reserveUsed + sim.expansion.reserve, 4);
    expect(sim.records.filter((r) => r.expense.house > 0).length).toBe(2);
    expect(sim.records[0].expense.reserve).toBeGreaterThan(0);
  });
  it('stops setting money aside once the max houses is reached', () => {
    const sim = createSim(settings);
    fastForward(sim, 100);
    expect(sim.records[sim.records.length - 1].expense.reserve).toBe(0);
  });
});

describe('per-egg sales', () => {
  it('sells partial trays by the egg and never sells more than stock', () => {
    const sim = createSim({ ...DEFAULT_SETTINGS, eggBuyerShare: 1, customersPerDay: 6 });
    fastForward(sim, 20);
    let produced = 0;
    let gone = 0;
    for (const r of sim.records) {
      produced += r.eggs;
      gone += r.eggsSold + r.eggsWasted;
      expect(r.traysSold).toBe(0);
      expect(r.eggsSoldSingle).toBe(r.eggsSold);
    }
    expect(gone).toBeGreaterThan(0);
    expect(gone).toBeLessThanOrEqual(produced);
  });
  it('egg income equals units × price', () => {
    const s = { ...DEFAULT_SETTINGS, eggBuyerShare: 1, customersPerDay: 6 };
    const sim = createSim(s);
    fastForward(sim, 15);
    const expected = sim.records.reduce((a, r) => a + GRADES.reduce((b, g) => b + r.eggsSoldByGrade[g] * s.pricePerEgg[g], 0), 0);
    const actual = sim.records.reduce((a, r) => a + r.income.egg, 0);
    expect(actual).toBeCloseTo(expected, 4);
  });
});

describe('ledger', () => {
  it('monthly/yearly/flock totals match daily totals', () => {
    const sim = big();
    fastForward(sim, 400);
    const daily = summarize(sim.records, 'day');
    const monthly = summarize(sim.records, 'month');
    const yearly = summarize(sim.records, 'year');
    const tot = (rows: typeof daily, k: 'eggs' | 'incomeTotal' | 'expenseTotal') => rows.reduce((a, r) => a + r[k], 0);
    for (const k of ['eggs', 'incomeTotal', 'expenseTotal'] as const) {
      expect(tot(monthly, k)).toBeCloseTo(tot(daily, k), 4);
      expect(tot(yearly, k)).toBeCloseTo(tot(daily, k), 4);
    }
    expect(yearly.length).toBe(2);
    expect(monthly.length).toBe(14);

    const flocks = summarizeFlocks(sim.records, sim.flocks, sim.houses);
    const fEggs = flocks.reduce((a, f) => a + f.eggs, 0);
    expect(fEggs).toBe(tot(daily, 'eggs'));
    const fIncome = flocks.reduce((a, f) => a + f.income, 0);
    expect(fIncome).toBeCloseTo(tot(daily, 'incomeTotal'), 2);
    const fExpense = flocks.reduce((a, f) => a + f.expense, 0);
    expect(fExpense).toBeCloseTo(tot(daily, 'expenseTotal'), 2);
  });

  it('categories are all present', () => {
    const sim = createSim();
    fastForward(sim, 3);
    for (const c of INCOME_CATS) expect(sim.records[0].income[c]).toBeTypeOf('number');
    for (const c of EXPENSE_CATS) expect(sim.records[0].expense[c]).toBeTypeOf('number');
    for (const g of GRADES) expect(sim.records[0].eggsByGrade[g]).toBeTypeOf('number');
  });
});

