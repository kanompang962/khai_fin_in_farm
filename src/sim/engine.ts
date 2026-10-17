import { DEFAULT_SETTINGS, DEFAULT_SETUP, type FarmSetup } from './defaults';
import { EGG_WEIGHT_SD, eggWeightMean, feedEffect, flockAgeWeeks, layRate } from './flock';
import { emptyGrades, GRADE_LABEL, gradeEggs, sumGrades, traysFor } from './grading';
import { normal, pickWeighted, rand, randInt, type Rng } from './rng';
import {
  dateOfDay,
  dayOf,
  fixedEventAfter,
  fmtClock,
  isManureDay,
  MIN_PER_DAY,
  type FixedEvent,
} from './schedule';
import {
  EXPENSE_CATS,
  GRADES,
  INCOME_CATS,
  type Customer,
  type DailyRecord,
  type Employee,
  type ExpenseCat,
  type Flock,
  type FlockDay,
  type Grade,
  type House,
  type IncomeCat,
  type SaleUnit,
  type Settings,
  type SimState,
} from './types';

export const SIM_VERSION = 3;
const START_MINUTE = 5 * 60 + 30;

// ---------- สร้าง state ----------

export function newRecord(s: Settings, day: number): DailyRecord {
  return {
    day,
    date: dateOfDay(s.startDate, day),
    hens: 0,
    deaths: 0,
    eggs: 0,
    eggsByGrade: emptyGrades(),
    traysPacked: 0,
    traysShipped: 0,
    trips: 0,
    eggsSold: 0,
    eggsSoldByGrade: emptyGrades(),
    traysSold: 0,
    eggsSoldSingle: 0,
    eggsWasted: 0,
    customers: 0,
    lostEggs: 0,
    feedKg: 0,
    manureKg: 0,
    income: Object.fromEntries(INCOME_CATS.map((c) => [c, 0])) as Record<IncomeCat, number>,
    expense: Object.fromEntries(EXPENSE_CATS.map((c) => [c, 0])) as Record<ExpenseCat, number>,
    flocks: {},
    reserveUsed: 0,
  };
}

export function createSim(settings: Settings = DEFAULT_SETTINGS, setup: FarmSetup = DEFAULT_SETUP): SimState {
  const s: Settings = structuredClone(settings);
  const sim: SimState = {
    version: SIM_VERSION,
    settings: s,
    time: START_MINUTE,
    lastFixedAt: START_MINUTE,
    rng: { state: s.seed },
    nextId: 1,
    houses: [],
    flocks: [],
    employees: [],
    collected: [],
    farmEggs: emptyGrades(),
    farmTrayShares: {},
    truck: null,
    store: [],
    customers: [],
    custIdx: 0,
    today: newRecord(s, 0),
    records: [],
    expansion: { rounds: 0, reserve: 0, anchorDay: null },
    log: [],
  };
  for (const e of setup.employees) addEmployee(sim, e);
  for (const h of setup.houses) addHouse(sim, { hens: h.hens, ageWeeks: h.ageWeeks, prepaid: true });
  sim.today.hens = totalHens(sim);
  log(sim, `เริ่มจำลองฟาร์ม "${s.farmName}"`);
  return sim;
}

function uid(sim: SimState, prefix: string): string {
  return `${prefix}${sim.nextId++}`;
}

export function log(sim: SimState, text: string, kind: 'info' | 'money' | 'warn' = 'info') {
  sim.log.push({ at: sim.time, text, kind });
  if (sim.log.length > 300) sim.log.splice(0, sim.log.length - 300);
}

const baht = (n: number) => '฿' + Math.round(n).toLocaleString('th-TH');

// ---------- helpers ----------

export function flockOf(sim: SimState, house: House): Flock | undefined {
  return house.flockId ? sim.flocks.find((f) => f.id === house.flockId && f.active) : undefined;
}

export function flockAge(sim: SimState, f: Flock, time = sim.time): number {
  return flockAgeWeeks(f.startAgeWeeks, f.startDay, time / MIN_PER_DAY);
}

export function totalHens(sim: SimState): number {
  return sim.flocks.reduce((s, f) => s + (f.active ? f.hens : 0), 0);
}

function fd(sim: SimState, flockId: string): FlockDay {
  return (sim.today.flocks[flockId] ??= { eggs: 0, hens: 0, feedKg: 0, income: 0, expense: 0 });
}

/** กระจายเงิน (รายรับ/รายจ่าย) เข้าแต่ละรุ่นตามน้ำหนัก */
function allocate(sim: SimState, amount: number, kind: 'income' | 'expense', weights: Record<string, number>) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total <= 0 || amount === 0) return;
  for (const [id, w] of Object.entries(weights)) fd(sim, id)[kind] += (amount * w) / total;
}

function expense(sim: SimState, cat: ExpenseCat, amount: number, weights: Record<string, number>) {
  sim.today.expense[cat] += amount;
  allocate(sim, amount, 'expense', weights);
}

function income(sim: SimState, cat: IncomeCat, amount: number, weights: Record<string, number>) {
  sim.today.income[cat] += amount;
  allocate(sim, amount, 'income', weights);
}

/** น้ำหนักสำหรับปันส่วนต้นทุนกลาง: ตามไข่ที่ผลิตวันนี้ ถ้าไม่มีใช้จำนวนไก่ */
function sharedWeights(sim: SimState): Record<string, number> {
  const w: Record<string, number> = {};
  for (const [id, v] of Object.entries(sim.today.flocks)) if (v.eggs > 0) w[id] = v.eggs;
  if (Object.keys(w).length) return w;
  for (const f of sim.flocks) if (f.active) w[f.id] = f.hens;
  return w;
}

// ---------- การจัดการฟาร์ม (เรียกจาก UI) ----------

export function addEmployee(sim: SimState, e: Omit<Employee, 'id'>): Employee {
  const emp = { ...e, id: uid(sim, 'e') };
  sim.employees.push(emp);
  return emp;
}

export function addHouse(
  sim: SimState,
  opts: { hens?: number; ageWeeks?: number; prepaid?: boolean; capacity?: number } = {},
): House {
  const hens = Math.max(0, Math.round(opts.hens ?? sim.settings.defaultHensPerHouse));
  const n = sim.houses.reduce((m, h) => Math.max(m, Number(h.name.replace(/\D/g, '')) || 0), 0) + 1;
  const house: House = {
    id: uid(sim, 'h'),
    name: `โรงเรือน ${n}`,
    capacity: Math.max(opts.capacity ?? hens, hens, 1),
    flockId: null,
    manureKg: 0,
    pendingEggs: 0,
    pendingMeanWeight: 0,
    feedKgToday: 0,
  };
  sim.houses.push(house);
  if (hens > 0) startFlock(sim, house, hens, opts.ageWeeks ?? sim.settings.defaultStartAgeWeeks, opts.prepaid);
  else log(sim, `เพิ่ม ${house.name} (ยังไม่มีไก่)`);
  return house;
}

export function removeHouse(sim: SimState, houseId: string) {
  const house = sim.houses.find((h) => h.id === houseId);
  if (!house) return;
  endFlock(sim, house, 'ปิดโรงเรือน');
  sim.houses = sim.houses.filter((h) => h.id !== houseId);
  log(sim, `ลบ ${house.name}`, 'warn');
}

export function startFlock(sim: SimState, house: House, hens: number, ageWeeks: number, prepaid = false, startDay?: number): Flock {
  if (flockOf(sim, house)) endFlock(sim, house, 'เปลี่ยนรุ่น');
  const flock: Flock = {
    id: uid(sim, 'f'),
    name: `รุ่นที่ ${sim.flocks.length + 1}`,
    houseId: house.id,
    startDay: startDay ?? dayOf(sim.time),
    startAgeWeeks: ageWeeks,
    initialHens: hens,
    hens,
    active: true,
    prepaid,
  };
  sim.flocks.push(flock);
  house.flockId = flock.id;
  house.capacity = Math.max(house.capacity, hens);
  fd(sim, flock.id).hens = hens;
  if (!prepaid) {
    const cost = hens * sim.settings.pulletPrice;
    expense(sim, 'pullet', cost, { [flock.id]: 1 });
    log(sim, `${house.name}: ลงไก่${flock.name} ${hens.toLocaleString()} ตัว อายุ ${ageWeeks} สัปดาห์ (${baht(cost)})`, 'money');
  } else {
    log(sim, `${house.name}: ${flock.name} ${hens.toLocaleString()} ตัว อายุ ${ageWeeks} สัปดาห์`);
  }
  return flock;
}

export function endFlock(sim: SimState, house: House, reason: string) {
  const f = flockOf(sim, house);
  if (!f) return;
  f.active = false;
  f.endDay = dayOf(sim.time);
  house.flockId = null;
  house.pendingEggs = 0;
  log(sim, `${house.name}: ${reason} — ${f.name} (${f.hens.toLocaleString()} ตัว)`, 'warn');
}

/** ปรับจำนวนไก่ในโรงเรือน — เพิ่มไก่คิดค่าไก่สาวตามจำนวนที่เพิ่ม */
export function setHouseHens(sim: SimState, houseId: string, hens: number) {
  const house = sim.houses.find((h) => h.id === houseId);
  if (!house) return;
  hens = Math.max(0, Math.round(hens));
  const f = flockOf(sim, house);
  if (!f) {
    if (hens > 0) startFlock(sim, house, hens, sim.settings.defaultStartAgeWeeks);
    return;
  }
  if (hens === 0) return endFlock(sim, house, 'ย้ายไก่ออกทั้งหมด');
  const diff = hens - f.hens;
  if (diff > 0) {
    const cost = diff * sim.settings.pulletPrice;
    expense(sim, 'pullet', cost, { [f.id]: 1 });
    f.initialHens += diff;
    log(sim, `${house.name}: เพิ่มไก่ ${diff.toLocaleString()} ตัว (${baht(cost)})`, 'money');
  } else if (diff < 0) {
    log(sim, `${house.name}: ลดไก่ ${(-diff).toLocaleString()} ตัว`);
  }
  f.hens = hens;
  house.capacity = Math.max(house.capacity, hens);
}

// ---------- events ----------

function onFeed(sim: SimState) {
  const s = sim.settings;
  let kg = 0;
  for (const house of sim.houses) {
    const f = flockOf(sim, house);
    house.feedKgToday = 0;
    if (!f) continue;
    const age = flockAge(sim, f);
    const feedKg = (f.hens * s.feedGramsPerHen) / 1000;
    const cost = feedKg * s.feedPricePerKg;
    kg += feedKg;
    house.feedKgToday = feedKg;
    sim.today.feedKg += feedKg;
    fd(sim, f.id).feedKg += feedKg;
    expense(sim, 'feed', cost, { [f.id]: 1 });

    const eff = feedEffect(s.feedGramsPerHen, age);
    const rate = layRate(age, s.layRate) * eff.layFactor;
    house.pendingEggs = Math.max(0, Math.round(f.hens * rate * (1 + normal(sim.rng, 0, 0.015))));
    house.pendingMeanWeight = eggWeightMean(age) + eff.weightDelta;
  }
  if (kg > 0) log(sim, `ให้อาหารไก่ที่รางอาหาร รวม ${kg.toLocaleString('th-TH', { maximumFractionDigits: 0 })} กก.`);
}

function onCollect(sim: SimState) {
  let total = 0;
  for (const house of sim.houses) {
    const f = flockOf(sim, house);
    if (!f || house.pendingEggs <= 0) continue;
    sim.collected.push({ flockId: f.id, houseId: house.id, eggs: house.pendingEggs, meanWeight: house.pendingMeanWeight });
    sim.today.eggs += house.pendingEggs;
    fd(sim, f.id).eggs += house.pendingEggs;
    total += house.pendingEggs;
    house.pendingEggs = 0;
  }
  log(sim, `เก็บไข่จากทุกโรงเรือน ได้ ${total.toLocaleString()} ฟอง`);
}

function onGrade(sim: SimState) {
  const s = sim.settings;
  const shares: Record<string, number> = {};
  const graded = emptyGrades();
  for (const lot of sim.collected) {
    const g = gradeEggs(lot.eggs, lot.meanWeight, EGG_WEIGHT_SD, s.gradeMinWeights, s.crackRate);
    for (const k of GRADES) {
      sim.today.eggsByGrade[k] += g[k];
      sim.farmEggs[k] += g[k];
      graded[k] += g[k];
    }
    shares[lot.flockId] = (shares[lot.flockId] ?? 0) + lot.eggs;
  }
  sim.collected = [];
  if (Object.keys(shares).length) sim.farmTrayShares = shares;
  const packed = sumGrades(traysFor(graded, s.traySize));
  sim.today.traysPacked += packed;
  expense(sim, 'tray', packed * s.trayCost, sim.farmTrayShares);
  if (packed > 0) log(sim, `คัดไข่ตามน้ำหนัก เรียงใส่แผงได้ ${packed.toLocaleString()} แผง (${sumGrades(graded).toLocaleString()} ฟอง)`);
}

function onShip(sim: SimState) {
  const s = sim.settings;
  const eggs = sumGrades(sim.farmEggs);
  if (eggs <= 0) {
    sim.truck = null;
    return;
  }
  const trays = sumGrades(traysFor(sim.farmEggs, s.traySize));
  const day = dayOf(sim.time);
  for (const g of GRADES) {
    if (sim.farmEggs[g] > 0) sim.store.push({ day, grade: g, eggs: sim.farmEggs[g], shares: { ...sim.farmTrayShares } });
  }
  sim.today.traysShipped += trays;
  if (s.salesMode === 'farm') {
    // ขายที่ฟาร์ม: ยกแผงไปวางที่จุดขาย ไม่มีรถ ไม่มีค่าขนส่ง
    sim.truck = null;
    sim.farmEggs = emptyGrades();
    log(sim, `นำไข่ ${eggs.toLocaleString()} ฟอง (${trays} แผง) ไปวางที่จุดขายหน้าฟาร์ม`);
    return;
  }
  const trips = Math.ceil(trays / Math.max(1, s.truckCapacityTrays));
  expense(sim, 'transport', trips * s.truckCostPerTrip, sim.farmTrayShares);
  sim.truck = { departAt: sim.time, trays, trips, byGrade: { ...sim.farmEggs } };
  sim.today.trips += trips;
  sim.farmEggs = emptyGrades();
  log(sim, `รถขนไข่ออกส่งหน้าร้าน ${trays.toLocaleString()} แผง (${trips} เที่ยว)`);
}

function priceFactor(s: Settings, g: Grade, unit: SaleUnit): number {
  const [mkt, price] = unit === 'tray' ? [s.marketPricePerTray[g], s.pricePerTray[g]] : [s.marketPricePerEgg[g], s.pricePerEgg[g]];
  return Math.pow(mkt / Math.max(0.01, price), 1.2);
}

/** ความต้องการแต่ละเบอร์ปรับตามราคา + ตัวคูณจำนวนลูกค้า */
function demandFor(s: Settings, unit: SaleUnit): { weights: Record<Grade, number>; factor: number } {
  const weights = {} as Record<Grade, number>;
  let wSum = 0;
  let fSum = 0;
  for (const g of GRADES) {
    weights[g] = s.gradeDemand[g] * priceFactor(s, g, unit);
    wSum += s.gradeDemand[g];
    fSum += weights[g];
  }
  return { weights, factor: Math.min(2.5, Math.max(0.1, wSum > 0 ? fSum / wSum : 1)) };
}

/** ลูกค้าซื้อเป็นฟอง: 6 / 10 / 12 / 15 / 20 ฟอง */
function eggQty(r: Rng): number {
  return Number(pickWeighted(r, { '6': 0.15, '10': 0.35, '12': 0.15, '15': 0.15, '20': 0.2 }));
}

function onOpen(sim: SimState) {
  const s = sim.settings;
  const r = sim.rng;
  const eggShare = Math.min(1, Math.max(0, s.eggBuyerShare));
  const byEgg = demandFor(s, 'egg');
  const byTray = demandFor(s, 'tray');
  const mean = s.customersPerDay * (eggShare * byEgg.factor + (1 - eggShare) * byTray.factor);
  const n = Math.max(0, Math.round(normal(r, mean, mean * 0.12)));
  const times: number[] = [];
  for (let i = 0; i < n; i++) times.push(sim.time + 2 + rand(r) * 350);
  times.sort((a, b) => a - b);
  const base = sim.nextId;
  sim.nextId += n;
  sim.customers = times.map<Customer>((at, i) => {
    const unit: SaleUnit = rand(r) < eggShare ? 'egg' : 'tray';
    const merchant = unit === 'tray' && rand(r) < s.merchantShare;
    return {
      id: base + i,
      at,
      merchant,
      unit,
      wantGrade: pickWeighted(r, unit === 'egg' ? byEgg.weights : byTray.weights),
      wantQty: unit === 'egg' ? eggQty(r) : merchant ? randInt(r, 5, 20) : retailTrays(rand(r)),
      boughtQty: 0,
      boughtEggs: 0,
      amount: 0,
      done: false,
    };
  });
  sim.custIdx = 0;
  log(sim, `${s.salesMode === 'farm' ? 'จุดขายหน้าฟาร์ม' : 'หน้าร้าน'}เปิดขาย มีไข่ ${storeStock(sim).toLocaleString()} ฟอง`);
}

/** ลูกค้าทั่วไป: 1 แผง 70% · 2 แผง 25% · 3 แผง 5% */
function retailTrays(u: number): number {
  return u < 0.7 ? 1 : u < 0.95 ? 2 : 3;
}

/** จำนวนไข่ (ฟอง) ที่วางขายอยู่ */
export function storeStock(sim: SimState, grade?: Grade): number {
  return sim.store.reduce((s, b) => s + (grade === undefined || b.grade === grade ? b.eggs : 0), 0);
}

/** ถ้าเบอร์ที่ต้องการหมด เลือกเบอร์ใกล้เคียง (±2) · คนที่ต้องการเบอร์เล็กยอมรับไข่คละ */
function substitutionOrder(want: Grade): Grade[] {
  if (want === 'M') return ['M', '3'];
  const sized = GRADES.filter((g) => g !== 'M');
  const wi = sized.indexOf(want);
  const order = sized
    .map((g, i) => ({ g, d: Math.abs(i - wi) }))
    .filter((x) => x.d <= 2)
    .sort((a, b) => a.d - b.d)
    .map((x) => x.g);
  return want === '2' || want === '3' ? [...order, 'M'] : order;
}

export function fmtQty(unit: SaleUnit, qty: number): string {
  return `${qty.toLocaleString()} ${unit === 'tray' ? 'แผง' : 'ฟอง'}`;
}

function processCustomer(sim: SimState, c: Customer) {
  const s = sim.settings;
  const size = c.unit === 'tray' ? s.traySize : 1;
  let remaining = c.wantQty;
  for (const g of substitutionOrder(c.wantGrade)) {
    if (remaining <= 0) break;
    const units = Math.min(remaining, Math.floor(storeStock(sim, g) / size));
    if (units <= 0) continue;
    const price = c.unit === 'tray' ? s.pricePerTray[g] : s.pricePerEgg[g];
    let need = units * size;
    for (const b of sim.store) {
      if (need <= 0) break;
      if (b.grade !== g || b.eggs <= 0) continue;
      const take = Math.min(need, b.eggs);
      b.eggs -= take;
      need -= take;
      income(sim, 'egg', (take * price) / size, b.shares);
    }
    remaining -= units;
    c.boughtQty += units;
    c.boughtEggs += units * size;
    c.amount += units * price;
    sim.today.eggsSoldByGrade[g] += units * size;
  }
  sim.store = sim.store.filter((b) => b.eggs > 0);
  c.done = true;
  const t = sim.today;
  t.customers++;
  t.eggsSold += c.boughtEggs;
  if (c.unit === 'tray') t.traysSold += c.boughtQty;
  else t.eggsSoldSingle += c.boughtEggs;
  t.lostEggs += remaining * size;
  if (c.merchant && c.boughtQty > 0) log(sim, `พ่อค้ารับไข่ ${fmtQty(c.unit, c.boughtQty)} ${baht(c.amount)}`, 'money');
  else if (c.boughtQty === 0) log(sim, `ลูกค้าต้องการไข่${GRADE_LABEL[c.wantGrade]} ${fmtQty(c.unit, c.wantQty)} แต่ไข่ไม่พอ`, 'warn');
}

function onManure(sim: SimState) {
  const s = sim.settings;
  if (!isManureDay(dayOf(sim.time), s.manureIntervalDays)) return;
  let total = 0;
  for (const house of sim.houses) {
    const f = flockOf(sim, house);
    const kg = house.manureKg;
    house.manureKg = 0;
    total += kg;
    if (kg > 0) income(sim, 'manure', kg * s.manurePricePerKg, f ? { [f.id]: 1 } : sharedWeights(sim));
  }
  sim.today.manureKg += total;
  if (total > 0) log(sim, `เก็บมูลไก่ ${Math.round(total).toLocaleString()} กก. ขายได้ ${baht(total * s.manurePricePerKg)}`, 'money');
}

function onClose(sim: SimState) {
  const t = sim.today;
  log(sim, `ปิดการขาย ลูกค้า ${t.customers} คน ขาย ${t.eggsSold.toLocaleString()} ฟอง รายได้ ${baht(t.income.egg)}`, 'money');
}

function onEndDay(sim: SimState) {
  const s = sim.settings;
  const day = dayOf(sim.time);
  const r = sim.rng;

  for (const house of sim.houses) {
    const f = flockOf(sim, house);
    if (!f) continue;
    const exp = f.hens * s.mortalityPerDay;
    const deaths = Math.min(f.hens, Math.max(0, Math.round(normal(r, exp, Math.sqrt(exp)))));
    f.hens -= deaths;
    sim.today.deaths += deaths;
    fd(sim, f.id).hens = f.hens;
    house.manureKg += f.hens * s.manureKgPerHenDay;
    expense(sim, 'utility', s.waterPowerPerHouseDay, { [f.id]: 1 });
  }

  const wages = sim.employees.reduce((a, e) => a + e.wage, 0);
  expense(sim, 'wage', wages, sharedWeights(sim));

  let wasted = 0;
  sim.store = sim.store.filter((b) => {
    if (day - b.day >= s.shelfLifeDays) {
      wasted += b.eggs;
      return false;
    }
    return true;
  });
  if (wasted > 0) log(sim, `ไข่ค้างเกิน ${s.shelfLifeDays} วัน ทิ้ง ${wasted} ฟอง`, 'warn');
  sim.today.eggsWasted += wasted;
  sim.today.hens = totalHens(sim);

  // ปลดระวางไก่ที่อายุครบ
  const culled: House[] = [];
  for (const house of sim.houses) {
    const f = flockOf(sim, house);
    if (f && flockAge(sim, f, (day + 1) * MIN_PER_DAY) >= s.cullAgeWeeks) {
      endFlock(sim, house, `ปลดระวางไก่อายุ ${s.cullAgeWeeks} สัปดาห์`);
      culled.push(house);
    }
  }

  // กันเงินซื้อไก่รอบขยายฟาร์มถัดไป: เฉลี่ยเท่า ๆ กันทุกวันจนถึงวันขยาย
  const ex = sim.expansion;
  if (s.autoExpand && ex.anchorDay === null) ex.anchorDay = day;
  if (!s.autoExpand) ex.anchorDay = null;
  const next = nextExpansionDay(sim);
  if (next !== null) {
    const need = expansionHenCost(s) - ex.reserve;
    if (need > 0) {
      const part = need / Math.max(1, next - day);
      expense(sim, 'reserve', part, sharedWeights(sim));
      ex.reserve += part;
    }
  }

  sim.records.push(sim.today);
  sim.today = newRecord(s, day + 1);
  for (const f of sim.flocks) if (f.active) fd(sim, f.id).hens = f.hens;

  if (next !== null && day + 1 >= next) runExpansion(sim, day + 1);

  if (s.autoRestock) {
    for (const house of culled) {
      const prev = sim.flocks.find((f) => f.houseId === house.id && f.endDay === day);
      startFlock(sim, house, prev?.initialHens ?? s.defaultHensPerHouse, s.defaultStartAgeWeeks, false, day + 1);
    }
  }
  sim.today.hens = totalHens(sim);
}

// ---------- ขยายฟาร์มอัตโนมัติ ----------

export function expansionHenCost(s: Settings): number {
  return Math.max(0, s.expandHens) * s.pulletPrice;
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  const dayOfMonth = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dayOfMonth, last));
  return d.toISOString().slice(0, 10);
}

function dayIndexOf(startDate: string, iso: string): number {
  return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z')) / 86400000);
}

/** วัน (index) ที่จะขยายฟาร์มรอบถัดไป — null ถ้าปิดอยู่หรือถึงจำนวนโรงเรือนสูงสุดแล้ว */
export function nextExpansionDay(sim: SimState): number | null {
  const s = sim.settings;
  const ex = sim.expansion;
  if (!s.autoExpand || sim.houses.length >= s.expandMaxHouses) return null;
  const anchor = ex.anchorDay ?? dayOf(sim.time);
  const months = Math.max(1, Math.round(s.expandEvery)) * (s.expandUnit === 'year' ? 12 : 1);
  return dayIndexOf(s.startDate, addMonths(dateOfDay(s.startDate, anchor), months));
}

function runExpansion(sim: SimState, day: number) {
  const s = sim.settings;
  const ex = sim.expansion;
  const house = addHouse(sim, { hens: 0, capacity: s.expandHens });
  const flock = startFlock(sim, house, s.expandHens, s.expandAgeWeeks, true, day);
  flock.prepaid = false;
  const cost = expansionHenCost(s);
  const fromReserve = Math.min(ex.reserve, cost);
  ex.reserve -= fromReserve;
  ex.rounds++;
  ex.anchorDay = day; // รอบถัดไปนับจากวันนี้
  sim.today.reserveUsed += fromReserve;
  if (cost - fromReserve > 0) expense(sim, 'pullet', cost - fromReserve, { [flock.id]: 1 });
  if (s.houseBuildCost > 0) expense(sim, 'house', s.houseBuildCost, { [flock.id]: 1 });
  log(
    sim,
    `🏗️ ขยายฟาร์มอัตโนมัติ: สร้าง${house.name} (${baht(s.houseBuildCost)}) ลงไก่ ${s.expandHens.toLocaleString()} ตัว ` +
      `ค่าไก่ ${baht(cost)} จ่ายจากเงินสำรอง ${baht(fromReserve)}`,
    'money',
  );
}

const HANDLERS: Record<FixedEvent, (sim: SimState) => void> = {
  feed: onFeed,
  collect: onCollect,
  grade: onGrade,
  ship: onShip,
  open: onOpen,
  manure: onManure,
  close: onClose,
  endday: onEndDay,
};

/** เดินเวลาจำลองไป `minutes` นาที ประมวลผลทุก event ที่ผ่าน คืนค่า true ถ้ามี event เกิดขึ้น */
export function tick(sim: SimState, minutes: number): boolean {
  const target = sim.time + Math.max(0, minutes);
  let fired = false;
  for (;;) {
    const fe = fixedEventAfter(sim.lastFixedAt);
    const c = sim.customers[sim.custIdx];
    const cAt = c && !c.done ? c.at : Infinity;
    const nextAt = Math.min(fe.at, cAt);
    if (nextAt > target) break;
    fired = true;
    if (cAt <= fe.at) {
      sim.time = cAt;
      processCustomer(sim, c);
      sim.custIdx++;
    } else {
      sim.time = fe.at;
      HANDLERS[fe.type](sim);
      sim.lastFixedAt = fe.at;
    }
  }
  sim.time = target;
  return fired;
}

export function fastForward(sim: SimState, days: number) {
  tick(sim, days * MIN_PER_DAY);
  log(sim, `ข้ามเวลา ${days} วัน → ${fmtClock(sim.time)}`);
}
