import { dayOf, isManureDay, minuteOfDay, WINDOWS } from '../sim/schedule';
import type { SimState } from '../sim/types';

export interface Phase {
  label: string;
  icon: string;
}

export function currentPhase(sim: SimState): Phase {
  const m = minuteOfDay(sim.time);
  const w = WINDOWS;
  if (m < 330) return { icon: '🌙', label: 'กลางคืน · ไก่พักผ่อน' };
  if (m < w.feed[0]) return { icon: '🌅', label: 'พนักงานเตรียมงาน' };
  if (m < w.feed[1]) return { icon: '🌾', label: 'ให้อาหารไก่ที่รางอาหาร' };
  if (m < w.collect[0]) return { icon: '🐔', label: 'ไก่กินอาหาร ออกไข่' };
  if (m < w.collect[1]) return { icon: '🧺', label: 'เก็บไข่จากโรงเรือน' };
  if (m < w.grade[0]) return { icon: '🚶', label: 'ขนไข่ไปจุดคัด' };
  if (m < w.grade[1]) return { icon: '⚖️', label: 'คัดไข่แยกเบอร์ตามน้ำหนัก · เรียงแผง' };
  const farm = sim.settings.salesMode === 'farm';
  if (farm && m < w.sales[0]) return { icon: '📦', label: 'นำแผงไข่ไปวางที่จุดขายหน้าฟาร์ม' };
  if (m < w.truckGo[0]) return { icon: '📦', label: 'ขนแผงไข่ขึ้นรถ' };
  if (m < w.truckUnload[1]) return { icon: '🚚', label: 'รถส่งไข่ไปหน้าร้าน' };
  if (m >= w.manure[0] && m < w.manure[1] && isManureDay(dayOf(sim.time), sim.settings.manureIntervalDays))
    return { icon: '💩', label: farm ? 'เก็บมูลไก่ใต้กรง (จุดขายพักชั่วคราว)' : 'เก็บมูลไก่ใต้กรง · หน้าร้านขายไข่' };
  if (m < w.sales[1]) return { icon: '🏪', label: farm ? 'ลูกค้ามาซื้อไข่ที่ฟาร์ม' : 'หน้าร้านขายไข่ให้ลูกค้า' };
  return { icon: '🧾', label: 'ปิดการขาย สรุปยอดประจำวัน' };
}
