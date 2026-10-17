import { create } from 'zustand';
import { DEFAULT_SETTINGS, type FarmSetup } from '../sim/defaults';
import { createSim, fastForward, SIM_VERSION, tick } from '../sim/engine';
import { MIN_PER_DAY } from '../sim/schedule';
import { EXPENSE_CATS, type Settings, type SimState } from '../sim/types';

const STORAGE_KEY = 'khai-fin-in-farm/sim';
const PREF_SUMMARY_KEY = 'khai-fin-in-farm/showDaySummary';

function loadPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

export type Selection = { kind: 'house' | 'employee' | 'truck' | 'store' | 'grading'; id?: string } | null;

interface Store {
  sim: SimState;
  frame: number; // เพิ่มทุกเฟรมที่เวลาเดิน
  rev: number; // เพิ่มเมื่อมี event หรือข้อมูลเปลี่ยน
  speed: number;
  paused: boolean;
  showLabels: boolean;
  showRoof: boolean;
  showPaths: boolean;
  shadows: boolean;
  autoRotate: boolean;
  panelsHidden: boolean;
  settingsOpen: boolean;
  reportsOpen: boolean;
  selected: Selection;
  focus: { x: number; z: number; zoom?: number; n: number } | null;
  showDaySummary: boolean; // แสดง popup สรุปเมื่อจบวัน
  daySummary: number | null; // วันที่กำลังแสดงสรุป


  advance: (dtSeconds: number) => void;
  mutate: (fn: (sim: SimState) => void) => void;
  skipDays: (days: number) => void;
  reset: (settings?: Settings, setup?: FarmSetup) => void;
  set: (patch: Partial<Store>) => void;
  focusOn: (x: number, z: number, zoom?: number) => void;
  setShowDaySummary: (on: boolean) => void;
  closeDaySummary: () => void;
}

function loadSim(): SimState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const sim = JSON.parse(raw) as SimState;
      if (sim.version === SIM_VERSION && sim.today && Array.isArray(sim.houses)) {
        sim.settings = { ...structuredClone(DEFAULT_SETTINGS), ...sim.settings };
        // ข้อมูลที่บันทึกก่อนมีหมวดรายจ่ายใหม่ / ระบบขยายฟาร์ม
        for (const r of [...sim.records, sim.today]) {
          for (const c of EXPENSE_CATS) r.expense[c] ??= 0;
          r.reserveUsed ??= 0;
        }
        sim.expansion ??= { rounds: 0, reserve: 0, anchorDay: null };
        return sim;
      }
    }
  } catch {
    /* ไม่มีข้อมูลหรืออ่านไม่ได้ → เริ่มใหม่ */
  }
  return createSim();
}

export function saveSim() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(useSimStore.getState().sim));
  } catch {
    /* storage เต็มหรือถูกปิด */
  }
}

export const useSimStore = create<Store>((set, get) => ({
  sim: loadSim(),
  frame: 0,
  rev: 0,
  speed: 1,
  paused: false,
  showLabels: true,
  showRoof: true,
  showPaths: false,
  shadows: true,
  autoRotate: false,
  panelsHidden: false,
  settingsOpen: false,
  reportsOpen: false,
  selected: null,
  focus: null,
  showDaySummary: loadPref(PREF_SUMMARY_KEY, true),
  daySummary: null,

  advance: (dt) => {
    const { sim, speed, paused, frame, rev } = get();
    if (paused) return;
    const minutes = (Math.min(dt, 0.1) * speed * MIN_PER_DAY) / Math.max(1, sim.settings.secondsPerDay);
    const daysBefore = sim.records.length;
    const fired = tick(sim, minutes);
    // จบวัน → หยุดเวลาและแสดงสรุปประจำวัน
    if (sim.records.length > daysBefore && get().showDaySummary) {
      saveSim();
      set({ frame: frame + 1, rev: rev + 1, paused: true, daySummary: sim.records[sim.records.length - 1].day, reportsOpen: false, settingsOpen: false });
      return;
    }
    set({ frame: frame + 1, rev: fired ? rev + 1 : rev });
  },
  mutate: (fn) => {
    fn(get().sim);
    set((s) => ({ rev: s.rev + 1, frame: s.frame + 1 }));
  },
  skipDays: (days) => {
    fastForward(get().sim, days);
    set((s) => ({ rev: s.rev + 1, frame: s.frame + 1 }));
    saveSim();
  },
  reset: (settings, setup) => {
    set((s) => ({ sim: createSim(settings ?? s.sim.settings, setup), rev: s.rev + 1, frame: s.frame + 1, selected: null, daySummary: null }));
    saveSim();
  },
  set: (patch) => set(patch),
  focusOn: (x, z, zoom) => set((s) => ({ focus: { x, z, zoom, n: (s.focus?.n ?? 0) + 1 } })),
  setShowDaySummary: (on) => {
    try {
      localStorage.setItem(PREF_SUMMARY_KEY, on ? '1' : '0');
    } catch {
      /* storage ถูกปิด */
    }
    set({ showDaySummary: on });
  },
  closeDaySummary: () => set({ daySummary: null, paused: false }),
}));

/** อ่าน sim และ re-render เมื่อข้อมูลเปลี่ยน (event) */
export function useSim(): SimState {
  useSimStore((s) => s.rev);
  return useSimStore.getState().sim;
}

/** อ่าน sim และ re-render ทุกเฟรม (สำหรับนาฬิกา/ตัวเลขที่ต้องขยับตลอด) */
export function useSimFrame(): SimState {
  useSimStore((s) => s.frame);
  return useSimStore.getState().sim;
}

let lastSaved = -1;
setInterval(() => {
  const { frame } = useSimStore.getState();
  if (frame !== lastSaved) {
    lastSaved = frame;
    saveSim();
  }
}, 5000);
window.addEventListener('pagehide', saveSim);
