import { flockOf } from '../sim/engine';
import { isManureDay, minuteOfDay, dayOf, WINDOWS } from '../sim/schedule';
import type { Customer, Employee, House, SimState } from '../sim/types';

export type V2 = [number, number]; // [x, z]

export const HOUSE_W = 10;
export const HOUSE_L = 26;
export const HOUSE_H = 3.4;
const GAP_X = 6;
const GAP_Z = 10;
const COLS = 4;

export const ROAD_Z = 9;
export const GRADING: V2 = [-17, -4];
export const GRADING_TABLE: V2 = [-17, -3];
export const DOCK: V2 = [-17, 3.5];
export const REST: V2 = [-8, 4];
export const STAFF_HOUSE: V2 = [-8, -2];
export const STORE: V2 = [-52, -4];
export const STORE_COUNTER: V2 = [-52, -0.8];
export const STORE_PARK: V2 = [-43.5, 2];
export const FARM_STALL: V2 = [-28, 1];
export const FARM_COUNTER: V2 = [-28, 2.4];
export const CUSTOMER_EXIT: V2 = [-34, 20];

const isFarmSales = (sim: SimState) => sim.settings.salesMode === 'farm';

export function salesCounter(sim: SimState): V2 {
  return isFarmSales(sim) ? FARM_COUNTER : STORE_COUNTER;
}

function customerSpawn(sim: SimState): V2 {
  return isFarmSales(sim) ? [-62, 16] : [-80, 16];
}

/** จุดศูนย์กลางและระยะกล้องสำหรับมุมมองภาพรวม */
export function overview(sim: SimState): { x: number; z: number; zoom: number } {
  const b = farmBounds(sim.houses.length);
  const minX = isFarmSales(sim) ? FARM_STALL[0] - 6 : STORE[0] - 8;
  const width = b.maxX - minX;
  const depth = ROAD_Z + 4 - b.minZ;
  return { x: (minX + b.maxX) / 2, z: (b.minZ + ROAD_Z) / 2, zoom: Math.max(40, Math.max(width, depth * 1.4) * 1.05) };
}

/** จุดกึ่งกลางโรงเรือน (x, z) — ด้านหน้า (ประตู) หันไปทาง +z */
export function housePos(i: number): V2 {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  return [col * (HOUSE_W + GAP_X), -row * (HOUSE_L + GAP_Z) - HOUSE_L / 2];
}

export function farmBounds(n: number): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const cols = Math.min(COLS, Math.max(1, n));
  const rows = Math.max(1, Math.ceil(n / COLS));
  return {
    minX: -HOUSE_W / 2 - 4,
    maxX: (cols - 1) * (HOUSE_W + GAP_X) + HOUSE_W / 2 + 4,
    minZ: -rows * (HOUSE_L + GAP_Z) + GAP_Z - 4,
    maxZ: 4,
  };
}

/** เส้นทางจากลานกลางไปหน้าประตูโรงเรือน ผ่านช่องว่างข้างโรงเรือน */
function routeToHouse(i: number): V2[] {
  const [x, cz] = housePos(i);
  const front = cz + HOUSE_L / 2;
  const gapX = x - HOUSE_W / 2 - GAP_X / 2;
  return [
    [gapX, 5],
    [gapX, front + 3],
    [x, front + 3],
    [x, front],
  ];
}

function houseLoop(i: number): V2[] {
  const [x, cz] = housePos(i);
  const front = cz + HOUSE_L / 2;
  const r = routeToHouse(i);
  return [...r, [x, front - HOUSE_L + 1.5], [x, front], ...r.slice().reverse()];
}

// ---------- path helpers ----------

export function pathLength(pts: V2[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/** ตำแหน่งบนเส้นทางตามสัดส่วน u ∈ [0,1] + ทิศที่หัน */
export function along(pts: V2[], u: number): { p: V2; heading: number } {
  u = Math.min(1, Math.max(0, u));
  const total = pathLength(pts);
  let d = u * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= seg || i === pts.length - 1) {
      const k = seg > 0 ? Math.min(1, d / seg) : 0;
      return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
    }
    d -= seg;
  }
  return { p: pts[pts.length - 1], heading: 0 };
}

function phase(m: number, w: readonly [number, number]): number {
  return (m - w[0]) / (w[1] - w[0]);
}

function inWin(m: number, w: readonly [number, number]): boolean {
  return m >= w[0] && m < w[1];
}

/** เดินไป-อยู่-เดินกลับ ระหว่าง a กับ b */
function dwell(a: V2, b: V2, u: number, walk = 0.12): { p: V2; heading: number; moving: boolean } {
  if (u < walk) return { ...along([a, b], u / walk), moving: true };
  if (u > 1 - walk) return { ...along([b, a], (u - (1 - walk)) / walk), moving: true };
  return { p: b, heading: Math.PI, moving: false };
}

// ---------- พนักงาน ----------

export type Carry = 'feed' | 'eggs' | 'manure' | 'trays' | null;

export type TaskKind = 'feed' | 'collect' | 'grade' | 'carry' | 'load' | 'drive' | 'sell' | 'manure' | 'rest' | 'home';

export const TASK_STYLE: Record<TaskKind, { icon: string; color: string }> = {
  feed: { icon: '🌾', color: '#e0a526' },
  collect: { icon: '🧺', color: '#e8b04a' },
  grade: { icon: '⚖️', color: '#5b9cf0' },
  carry: { icon: '📦', color: '#c9844f' },
  load: { icon: '📦', color: '#c9844f' },
  drive: { icon: '🚚', color: '#4b8fe0' },
  sell: { icon: '🏪', color: '#2fb866' },
  manure: { icon: '🧹', color: '#a07a52' },
  rest: { icon: '☕', color: '#8a8f98' },
  home: { icon: '🏠', color: '#6b7280' },
};

export interface Pose {
  visible: boolean;
  p: V2;
  heading: number;
  moving: boolean;
  kind: TaskKind;
  task: string;
  detail?: string; // เช่น โรงเรือนที่รับผิดชอบ / งานถัดไป
  progress: number | null; // ความคืบหน้างานปัจจุบัน 0–1
  carry: Carry;
}

/** คนที่ยืนขายไข่: พนักงานขาย ถ้าไม่มีและขายที่ฟาร์ม ให้พนักงานคนแรกขายเอง */
function sellerOf(sim: SimState): Employee | undefined {
  return sim.employees.find((e) => e.role === 'store') ?? (isFarmSales(sim) ? sim.employees[0] : undefined);
}

/** คนขนแผงไข่ไปจุดขาย (ขายที่ฟาร์ม) */
function carrierOf(sim: SimState): Employee | undefined {
  return sim.employees.find((e) => e.role === 'driver') ?? sim.employees.find((e) => e.role !== 'store');
}

export function employeePose(sim: SimState, emp: Employee, t: number): Pose {
  const m = minuteOfDay(t);
  const farmSales = isFarmSales(sim);
  const manureDay = isManureDay(dayOf(t), sim.settings.manureIntervalDays);
  const same = sim.employees.filter((e) => e.role === emp.role);
  const k = same.indexOf(emp);
  const offset: V2 = [REST[0] + (k % 3) * 1.4 - 1.4, REST[1] + Math.floor(k / 3) * 1.4];
  const counter = salesCounter(sim);
  const sellers = sim.employees.filter((e) => e.role === 'store');
  const isSeller = emp.role === 'store' || (!sellers.length && sellerOf(sim) === emp);
  const mine =
    emp.role === 'farm'
      ? sim.houses.map((h, i) => ({ h, i })).filter(({ h, i }) => i % Math.max(1, same.length) === k && flockOf(sim, h))
      : [];
  const houseNames = mine.map(({ h }) => h.name).join(', ');

  // งานถัดไปของพนักงานคนนี้ (แสดงตอนพัก)
  const upcoming: [number, string][] = [];
  if (mine.length) upcoming.push([WINDOWS.feed[0], 'ให้อาหารไก่'], [WINDOWS.collect[0], 'เก็บไข่']);
  if (emp.role !== 'store') upcoming.push([WINDOWS.grade[0], 'คัดไข่']);
  if ((farmSales && carrierOf(sim) === emp) || (!farmSales && emp.role === 'driver')) upcoming.push([WINDOWS.load[0], farmSales ? 'ยกแผงไปจุดขาย' : 'ขนไข่ขึ้นรถ']);
  if (isSeller) upcoming.push([emp.role === 'store' ? WINDOWS.store[0] : WINDOWS.sales[0], 'ขายไข่']);
  if (mine.length && manureDay) upcoming.push([WINDOWS.manure[0], 'เก็บมูลไก่']);
  const next = upcoming.filter(([at]) => at > m).sort((a, b) => a[0] - b[0])[0];
  const clock = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const nextText = next ? `ถัดไป ${clock(next[0])} ${next[1]}` : 'งานวันนี้เสร็จแล้ว';

  const idle: Pose = { visible: true, p: offset, heading: Math.PI, moving: false, kind: 'rest', task: 'พัก', detail: nextText, progress: null, carry: null };
  const home: Pose = { ...idle, visible: false, p: STAFF_HOUSE, kind: 'home', task: 'เลิกงาน / พักผ่อน', detail: next ? nextText : 'พรุ่งนี้ 06:00 เริ่มงาน' };
  const sellerSpot = (j: number, n: number): V2 => [counter[0] + (j - (n - 1) / 2) * 1.6, counter[1] - 1.6];
  const atCounter = (j: number, n: number, w: readonly [number, number]): Pose => ({
    visible: true,
    p: sellerSpot(j, n),
    heading: 0,
    moving: false,
    kind: 'sell',
    task: farmSales ? 'ขายไข่ที่จุดขายหน้าฟาร์ม' : 'ขายไข่หน้าร้าน',
    detail: `ลูกค้าวันนี้ ${sim.today.customers} คน`,
    progress: phase(m, w),
    carry: null,
  });

  if (emp.role === 'store') {
    if (inWin(m, WINDOWS.store)) return atCounter(sellers.indexOf(emp), sellers.length, WINDOWS.store);
    return home;
  }

  if (m < 330) return home;

  if (inWin(m, WINDOWS.grade)) {
    const all = sim.employees.filter((e) => e.role !== 'store');
    const j = all.indexOf(emp);
    const seat: V2 = [GRADING_TABLE[0] + (j - (all.length - 1) / 2) * 1.1, GRADING_TABLE[1] + 1.3];
    const d = dwell(offset, seat, phase(m, WINDOWS.grade));
    return { visible: true, ...d, kind: 'grade', task: 'คัดไข่แยกเบอร์ เรียงแผง', detail: 'ชั่งน้ำหนัก แยกเบอร์ 0–3 / คละ', progress: phase(m, WINDOWS.grade), carry: null };
  }

  // พนักงานเลี้ยงไก่: แบ่งโรงเรือนกันดูแล
  if (mine.length) {
    const loop = (): V2[] => [offset, ...mine.flatMap(({ i }) => houseLoop(i)), offset];
    const work = (w: readonly [number, number], kind: TaskKind, task: string, carry: Carry): Pose => {
      const r = along(loop(), phase(m, w));
      return { visible: true, ...r, moving: true, kind, task, detail: houseNames, progress: phase(m, w), carry };
    };
    if (inWin(m, WINDOWS.feed)) return work(WINDOWS.feed, 'feed', 'ให้อาหารไก่ที่รางอาหาร', 'feed');
    if (inWin(m, WINDOWS.collect)) return work(WINDOWS.collect, 'collect', 'เก็บไข่จากรางรับไข่', 'eggs');
    if (inWin(m, WINDOWS.manure) && manureDay) return work(WINDOWS.manure, 'manure', 'เก็บมูลไก่ใต้กรง', 'manure');
  }

  const today = sim.truck && dayOf(sim.truck.departAt) === dayOf(t);
  if (farmSales) {
    if (inWin(m, WINDOWS.load) && carrierOf(sim) === emp) {
      const r = along([offset, [GRADING[0] + 2.4, GRADING[1] + 4.2], [FARM_STALL[0] + 1, FARM_STALL[1] + 0.5], offset], phase(m, WINDOWS.load));
      return { visible: true, ...r, moving: true, kind: 'carry', task: 'ยกแผงไข่ไปวางที่จุดขาย', progress: phase(m, WINDOWS.load), carry: 'trays' };
    }
  } else if (emp.role === 'driver') {
    if (inWin(m, WINDOWS.load)) {
      const d = dwell(offset, [DOCK[0] + 2.4, DOCK[1] - 1], phase(m, WINDOWS.load), 0.2);
      return { visible: true, ...d, kind: 'load', task: 'ขนแผงไข่ขึ้นรถ', progress: phase(m, WINDOWS.load), carry: 'trays' };
    }
    if (m >= WINDOWS.truckGo[0] && m < WINDOWS.truckBack[1] && today) {
      const w = [WINDOWS.truckGo[0], WINDOWS.truckBack[1]] as const;
      return { ...idle, visible: false, kind: 'drive', task: 'ขับรถส่งไข่ไปหน้าร้าน', detail: `${sim.truck!.trays} แผง`, progress: phase(m, w) };
    }
  }

  if (isSeller && inWin(m, WINDOWS.sales)) return atCounter(0, 1, WINDOWS.sales);
  if (m >= 1080) return home;
  return idle;
}

export function employeePath(sim: SimState, emp: Employee): V2[] {
  const same = sim.employees.filter((e) => e.role === emp.role);
  const k = same.indexOf(emp);
  if (emp.role !== 'farm') return [];
  return sim.houses
    .map((h, i) => ({ h, i }))
    .filter(({ h, i }) => i % Math.max(1, same.length) === k && flockOf(sim, h))
    .flatMap(({ i }) => houseLoop(i));
}

// ---------- รถขนไข่ ----------

const TRUCK_ROUTE: V2[] = [DOCK, [DOCK[0], ROAD_Z - 1.5], [STORE_PARK[0], ROAD_Z - 1.5], STORE_PARK];

export interface TruckPose {
  p: V2;
  heading: number;
  load: number; // 0..1 แผงบนรถ
  status: string;
}

export function truckPose(sim: SimState, t: number): TruckPose {
  const m = minuteOfDay(t);
  const today = sim.settings.salesMode === 'store' && sim.truck && dayOf(sim.truck.departAt) === dayOf(t);
  const parked: TruckPose = { p: DOCK, heading: Math.PI, load: 0, status: 'จอดที่จุดคัดไข่' };
  if (!today) return parked;
  if (inWin(m, WINDOWS.load)) return { ...parked, load: phase(m, WINDOWS.load), status: 'กำลังขนแผงไข่ขึ้นรถ' };
  if (inWin(m, WINDOWS.truckGo)) {
    const r = along(TRUCK_ROUTE, phase(m, WINDOWS.truckGo));
    return { p: r.p, heading: r.heading, load: 1, status: 'กำลังวิ่งไปหน้าร้าน' };
  }
  if (inWin(m, WINDOWS.truckUnload))
    return { p: STORE_PARK, heading: -Math.PI / 2, load: 1 - phase(m, WINDOWS.truckUnload), status: 'ส่งไข่ลงหน้าร้าน' };
  if (inWin(m, WINDOWS.truckBack)) {
    const r = along(TRUCK_ROUTE.slice().reverse(), phase(m, WINDOWS.truckBack));
    return { p: r.p, heading: r.heading, load: 0, status: 'กำลังกลับฟาร์ม' };
  }
  return parked;
}

export const TRUCK_PATH = TRUCK_ROUTE;

// ---------- ลูกค้า ----------

export interface CustomerPose {
  c: Customer;
  p: V2;
  heading: number;
  moving: boolean;
  bubble: string | null;
}

const C_IN = 10;
const C_BUY = 4;
const C_OUT = 10;

export function customerPoses(sim: SimState, t: number): CustomerPose[] {
  const out: CustomerPose[] = [];
  const base = salesCounter(sim);
  const spawn = customerSpawn(sim);
  const counter = (c: Customer): V2 => [base[0] + ((c.id % 5) - 2) * 0.9, base[1] + 1.2];
  for (const c of sim.customers) {
    const dt = t - c.at;
    if (dt < -C_IN || dt > C_BUY + C_OUT) continue;
    const target = counter(c);
    if (dt < 0) {
      const r = along([spawn, [spawn[0] + 10, ROAD_Z + 4], [target[0], ROAD_Z + 4], target], 1 + dt / C_IN);
      out.push({ c, ...r, moving: true, bubble: null });
    } else if (dt < C_BUY) {
      const bubble = c.done ? (c.boughtQty > 0 ? `+฿${Math.round(c.amount).toLocaleString()}` : 'ไข่ไม่พอ!') : null;
      out.push({ c, p: target, heading: Math.PI, moving: false, bubble });
    } else {
      const r = along([target, [target[0] + 2, ROAD_Z + 4], CUSTOMER_EXIT], (dt - C_BUY) / C_OUT);
      out.push({ c, ...r, moving: true, bubble: null });
    }
  }
  return out;
}

// ---------- สถานะภายในโรงเรือน ----------

export function feedLevel(house: House, t: number): number {
  if (house.feedKgToday <= 0) return 0.05;
  const m = minuteOfDay(t);
  if (m < WINDOWS.feed[0]) return 0.08;
  return Math.max(0.12, 1 - (m - WINDOWS.feed[0]) / 760);
}

export function beltEggFraction(t: number): number {
  const m = minuteOfDay(t);
  return Math.min(1, Math.max(0, (m - WINDOWS.feed[0] + 60) / (WINDOWS.collect[0] - WINDOWS.feed[0] + 60)));
}

export function houseActivity(sim: SimState, i: number, t: number): string | null {
  const m = minuteOfDay(t);
  const house = sim.houses[i];
  if (!flockOf(sim, house)) return 'ว่าง';
  if (inWin(m, WINDOWS.feed)) return 'ให้อาหาร';
  if (inWin(m, WINDOWS.collect)) return 'เก็บไข่';
  if (inWin(m, WINDOWS.manure) && isManureDay(dayOf(t), sim.settings.manureIntervalDays)) return 'เก็บมูล';
  return null;
}
