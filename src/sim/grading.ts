import { normCdf } from './rng';
import { GRADES, type GradeCounts, type SizedGrade } from './types';

export function emptyGrades(): GradeCounts {
  return { '0': 0, '1': 0, '2': 0, '3': 0, M: 0 };
}

export function sumGrades(g: GradeCounts): number {
  return GRADES.reduce((s, k) => s + g[k], 0);
}

export function addGrades(a: GradeCounts, b: GradeCounts): GradeCounts {
  const out = emptyGrades();
  for (const k of GRADES) out[k] = a[k] + b[k];
  return out;
}

/** สัดส่วนไข่แต่ละเบอร์ จากการกระจายน้ำหนักแบบปกติ */
export function gradeProbabilities(
  mean: number,
  sd: number,
  minWeights: Record<SizedGrade, number>,
  crackRate: number,
): GradeCounts {
  const p = emptyGrades();
  const sized: SizedGrade[] = ['0', '1', '2', '3'];
  let upperCdf = 1;
  for (const g of sized) {
    const cdf = normCdf((minWeights[g] - mean) / sd);
    p[g] = Math.max(0, upperCdf - cdf) * (1 - crackRate);
    upperCdf = Math.min(upperCdf, cdf);
  }
  p.M = upperCdf * (1 - crackRate) + crackRate;
  return p;
}

/** แบ่งจำนวนไข่เป็นจำนวนเต็มตามสัดส่วน (largest remainder) ให้ผลรวมตรงพอดี */
export function gradeEggs(
  eggs: number,
  mean: number,
  sd: number,
  minWeights: Record<SizedGrade, number>,
  crackRate: number,
): GradeCounts {
  const p = gradeProbabilities(mean, sd, minWeights, crackRate);
  const out = emptyGrades();
  const rem: { g: (typeof GRADES)[number]; r: number }[] = [];
  let assigned = 0;
  for (const g of GRADES) {
    const exact = eggs * p[g];
    out[g] = Math.floor(exact);
    assigned += out[g];
    rem.push({ g, r: exact - out[g] });
  }
  rem.sort((a, b) => b.r - a.r);
  for (let i = 0; assigned < eggs; i++, assigned++) out[rem[i % rem.length].g]++;
  return out;
}

export const GRADE_LABEL: Record<(typeof GRADES)[number], string> = {
  '0': 'เบอร์ 0',
  '1': 'เบอร์ 1',
  '2': 'เบอร์ 2',
  '3': 'เบอร์ 3',
  M: 'คละ',
};

/** ชื่อสั้นสำหรับกราฟ/ป้าย */
export const GRADE_SHORT: Record<(typeof GRADES)[number], string> = { '0': '0', '1': '1', '2': '2', '3': '3', M: 'คละ' };

/** จำนวนแผงที่ใช้ใส่ไข่ (แผงสุดท้ายอาจไม่เต็ม) */
export function traysFor(eggs: GradeCounts, traySize: number): GradeCounts {
  const out = emptyGrades();
  for (const g of GRADES) out[g] = Math.ceil(eggs[g] / Math.max(1, traySize));
  return out;
}

export const GRADE_COLOR: Record<(typeof GRADES)[number], string> = {
  '0': '#3987e5',
  '1': '#d95926',
  '2': '#199e70',
  '3': '#c98500',
  M: '#898781',
};
