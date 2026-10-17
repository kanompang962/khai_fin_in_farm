/** อัตราการไข่ (0–1): เริ่มไข่ 18 สัปดาห์ ค่อย ๆ เพิ่มจนถึงอัตราเป้าหมายที่ 21 สัปดาห์ แล้วคงที่ */
export function layRate(ageWeeks: number, target: number): number {
  if (ageWeeks < 18) return 0;
  if (ageWeeks < 21) return (target * (ageWeeks - 18)) / 3;
  return target;
}

/** น้ำหนักไข่เฉลี่ย (กรัม) ตามอายุ */
export function eggWeightMean(ageWeeks: number): number {
  if (ageWeeks < 18) return 0;
  return 48 + 16 * (1 - Math.exp(-(ageWeeks - 18) / 18));
}

export const EGG_WEIGHT_SD = 4.5;

/** ความต้องการอาหาร (กรัม/ตัว/วัน) ตามอายุ */
export function feedRequirement(ageWeeks: number): number {
  if (ageWeeks < 18) return 85;
  if (ageWeeks < 22) return 100;
  return 110;
}

/** ผลของอาหาร: ถ้าให้น้อยกว่าที่ต้องการ ไข่ลดลงและฟองเล็กลง */
export function feedEffect(givenGrams: number, ageWeeks: number): { layFactor: number; weightDelta: number } {
  const ratio = givenGrams / feedRequirement(ageWeeks);
  if (ratio >= 1) return { layFactor: 1, weightDelta: 0 };
  const r = Math.max(0, ratio);
  return { layFactor: Math.pow(r, 1.6), weightDelta: -(1 - r) * 8 };
}

export function flockAgeWeeks(startAgeWeeks: number, startDay: number, day: number): number {
  return startAgeWeeks + (day - startDay) / 7;
}
