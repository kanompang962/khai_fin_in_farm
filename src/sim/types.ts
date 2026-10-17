/** เบอร์ 0–3 คัดตามน้ำหนัก · M = คละ (เล็กกว่าเบอร์ 3 หรือบุบ/แตก) */
export const GRADES = ['0', '1', '2', '3', 'M'] as const;
export type Grade = (typeof GRADES)[number];
export type SizedGrade = Exclude<Grade, 'M'>;

/** หน่วยที่ลูกค้าซื้อ */
export type SaleUnit = 'tray' | 'egg';
export type GradeCounts = Record<Grade, number>;

export const INCOME_CATS = ['egg', 'manure'] as const;
export type IncomeCat = (typeof INCOME_CATS)[number];
export const EXPENSE_CATS = ['feed', 'wage', 'utility', 'transport', 'tray', 'pullet', 'house', 'reserve'] as const;
export type ExpenseCat = (typeof EXPENSE_CATS)[number];

export type Role = 'farm' | 'driver' | 'store';

/** farm = ลูกค้ามาซื้อที่ฟาร์ม · store = ส่งรถไปขายที่หน้าร้าน */
export type SalesMode = 'farm' | 'store';

export type ExpandUnit = 'month' | 'year';

export interface Employee {
  id: string;
  name: string;
  role: Role;
  wage: number; // บาท/วัน
}

export interface Settings {
  farmName: string;
  startDate: string; // YYYY-MM-DD
  seed: number;
  secondsPerDay: number; // วินาทีจริงต่อ 1 วันจำลอง ที่ความเร็ว 1×
  salesMode: SalesMode;
  feedGramsPerHen: number;
  feedPricePerKg: number;
  gradeMinWeights: Record<SizedGrade, number>;
  traySize: number;
  pricePerTray: GradeCounts;
  pricePerEgg: GradeCounts;
  marketPricePerTray: GradeCounts;
  marketPricePerEgg: GradeCounts;
  trayCost: number;
  pulletPrice: number;
  layRate: number; // อัตราการไข่ (สัดส่วนแม่ไก่ที่ไข่ต่อวัน)
  defaultHensPerHouse: number;
  defaultStartAgeWeeks: number;
  cullAgeWeeks: number;
  autoRestock: boolean;
  // ขยายฟาร์มอัตโนมัติ: สร้างโรงเรือนใหม่พร้อมลงไก่ ทุก expandEvery เดือน/ปี
  autoExpand: boolean;
  expandEvery: number;
  expandUnit: ExpandUnit;
  expandHens: number;
  expandAgeWeeks: number;
  expandMaxHouses: number;
  houseBuildCost: number;
  mortalityPerDay: number;
  crackRate: number;
  waterPowerPerHouseDay: number;
  truckCapacityTrays: number;
  truckCostPerTrip: number;
  manureKgPerHenDay: number;
  manurePricePerKg: number;
  manureIntervalDays: number;
  customersPerDay: number;
  merchantShare: number; // สัดส่วนลูกค้าพ่อค้าที่ซื้อจำนวนมาก
  eggBuyerShare: number; // สัดส่วนลูกค้าที่ซื้อเป็นฟอง
  gradeDemand: GradeCounts; // น้ำหนักความต้องการแต่ละเบอร์
  shelfLifeDays: number;
}

export interface Flock {
  id: string;
  name: string;
  houseId: string;
  startDay: number;
  startAgeWeeks: number;
  initialHens: number;
  hens: number;
  active: boolean;
  endDay?: number;
  prepaid?: boolean; // รุ่นตั้งต้น ซื้อมาก่อนเริ่มจำลอง (ไม่คิดค่าไก่สาว)
}

export interface House {
  id: string;
  name: string;
  capacity: number;
  flockId: string | null;
  manureKg: number;
  pendingEggs: number; // ไข่ที่ออกวันนี้ ยังไม่ได้เก็บ
  pendingMeanWeight: number;
  feedKgToday: number;
}

export interface CollectedLot {
  flockId: string;
  houseId: string;
  eggs: number;
  meanWeight: number;
}

export interface StoreBatch {
  day: number;
  grade: Grade;
  eggs: number;
  shares: Record<string, number>; // flockId -> สัดส่วน
}

export interface Customer {
  id: number;
  at: number; // นาทีสัมบูรณ์ที่มาถึงร้าน
  merchant: boolean;
  unit: SaleUnit;
  wantGrade: Grade;
  wantQty: number; // จำนวนแผง หรือ จำนวนฟอง ตาม unit
  boughtQty: number;
  boughtEggs: number;
  amount: number;
  done: boolean;
}

export interface TruckTrip {
  departAt: number;
  trays: number;
  trips: number;
  byGrade: GradeCounts; // จำนวนฟองแยกเบอร์
}

export interface FlockDay {
  eggs: number;
  hens: number;
  feedKg: number;
  income: number;
  expense: number;
}

export interface DailyRecord {
  day: number;
  date: string;
  hens: number;
  deaths: number;
  eggs: number;
  eggsByGrade: GradeCounts;
  traysPacked: number;
  traysShipped: number;
  trips: number;
  eggsSold: number;
  eggsSoldByGrade: GradeCounts;
  traysSold: number; // ขายเป็นแผง (จำนวนแผง)
  eggsSoldSingle: number; // ขายเป็นฟอง (จำนวนฟอง)
  eggsWasted: number;
  customers: number;
  lostEggs: number;
  feedKg: number;
  manureKg: number;
  income: Record<IncomeCat, number>;
  expense: Record<ExpenseCat, number>;
  flocks: Record<string, FlockDay>;
  reserveUsed: number; // เงินสำรองที่ใช้ซื้อไก่รอบขยายฟาร์ม
}

export interface Expansion {
  rounds: number; // ขยายไปแล้วกี่รอบ
  reserve: number; // เงินสำรองซื้อไก่รอบถัดไป (สะสม)
  anchorDay: number | null; // วันที่เปิดใช้ หรือวันที่ขยายครั้งล่าสุด (null = ปิดอยู่)
}

export interface LogEntry {
  at: number;
  text: string;
  kind: 'info' | 'money' | 'warn';
}

export interface SimState {
  version: number;
  settings: Settings;
  time: number; // นาทีตั้งแต่เริ่มจำลอง
  lastFixedAt: number;
  rng: { state: number };
  nextId: number;
  houses: House[];
  flocks: Flock[];
  employees: Employee[];
  collected: CollectedLot[];
  farmEggs: GradeCounts; // ไข่ที่คัดและเรียงแผงแล้ว รอวางขาย/รอรถ (ฟอง)
  farmTrayShares: Record<string, number>;
  truck: TruckTrip | null;
  store: StoreBatch[];
  customers: Customer[];
  custIdx: number;
  today: DailyRecord;
  records: DailyRecord[];
  expansion: Expansion;
  log: LogEntry[];
}
