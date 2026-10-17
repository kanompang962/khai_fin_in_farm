import type { Employee, GradeCounts, Settings } from './types';

const trayPrices: GradeCounts = { '0': 150, '1': 140, '2': 130, '3': 120, M: 105 };
const eggPrices: GradeCounts = { '0': 5.5, '1': 5, '2': 4.75, '3': 4.5, M: 4 };

export const DEFAULT_SETTINGS: Settings = {
  farmName: 'ไข่ฟินอินฟาร์ม',
  startDate: '2026-01-01',
  seed: 20260101,
  secondsPerDay: 300,
  salesMode: 'farm',
  feedGramsPerHen: 110,
  feedPricePerKg: 14,
  gradeMinWeights: { '0': 70, '1': 65, '2': 60, '3': 55 },
  traySize: 30,
  pricePerTray: { ...trayPrices },
  pricePerEgg: { ...eggPrices },
  marketPricePerTray: { ...trayPrices },
  marketPricePerEgg: { ...eggPrices },
  trayCost: 2.5,
  pulletPrice: 180,
  layRate: 0.78,
  defaultHensPerHouse: 100,
  defaultStartAgeWeeks: 18,
  cullAgeWeeks: 80,
  autoRestock: true,
  autoExpand: false,
  expandEvery: 6,
  expandUnit: 'month',
  expandHens: 100,
  expandAgeWeeks: 18,
  expandMaxHouses: 8,
  houseBuildCost: 20000,
  mortalityPerDay: 0.0003,
  crackRate: 0.02,
  waterPowerPerHouseDay: 30,
  truckCapacityTrays: 150,
  truckCostPerTrip: 300,
  manureKgPerHenDay: 0.1,
  manurePricePerKg: 1,
  manureIntervalDays: 2,
  customersPerDay: 3.5,
  merchantShare: 0,
  eggBuyerShare: 0.5,
  gradeDemand: { '0': 0.1, '1': 0.2, '2': 0.25, '3': 0.25, M: 0.2 },
  shelfLifeDays: 21,
};

export const DEFAULT_EMPLOYEES: Omit<Employee, 'id'>[] = [{ name: 'สมชาย', role: 'farm', wage: 400 }];

/** โรงเรือนตั้งต้น (ไก่อายุ 24 สัปดาห์ กำลังให้ไข่) */
export const DEFAULT_HOUSES: { hens: number; ageWeeks: number }[] = [{ hens: 100, ageWeeks: 24 }];

export interface FarmSetup {
  houses: { hens: number; ageWeeks: number }[];
  employees: Omit<Employee, 'id'>[];
}

export const DEFAULT_SETUP: FarmSetup = { houses: DEFAULT_HOUSES, employees: DEFAULT_EMPLOYEES };

export const ROLE_LABEL: Record<Employee['role'], string> = {
  farm: 'พนักงานเลี้ยงไก่',
  driver: 'คนขับรถ/ขนไข่',
  store: 'พนักงานขาย',
};
