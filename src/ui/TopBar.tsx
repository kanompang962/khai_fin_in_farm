import { dayOf, fmtClock } from '../sim/schedule';
import { useSimFrame, useSimStore } from '../state/useSimStore';
import { simDate, thaiDate } from './format';
import { currentPhase } from './phase';

const SPEEDS = [1, 3, 8, 30, 120];
const SKIPS = [
  { d: 1, label: '+1 วัน' },
  { d: 7, label: '+7 วัน' },
  { d: 30, label: '+30 วัน' },
  { d: 365, label: '+1 ปี' },
];

export function TopBar() {
  const sim = useSimFrame();
  const speed = useSimStore((s) => s.speed);
  const paused = useSimStore((s) => s.paused);
  const set = useSimStore((s) => s.set);
  const skipDays = useSimStore((s) => s.skipDays);
  const phase = currentPhase(sim);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-wrap items-start gap-2 p-2 sm:p-3">
      <div className="panel pointer-events-auto flex items-center gap-3 px-3 py-2">
        <div className="text-2xl leading-none">🥚</div>
        <div>
          <div className="text-sm font-semibold leading-tight">{sim.settings.farmName}</div>
          <div className="muted text-[11px] leading-tight">Egg Farm 3D Simulation</div>
        </div>
      </div>

      <div className="panel pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <div className="num min-w-[150px]">
          <div className="text-[11px] muted leading-tight">
            วันที่ {dayOf(sim.time) + 1} · {thaiDate(simDate(sim))}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-semibold leading-tight">{fmtClock(sim.time)}</span>
            <span className="ink2 truncate text-xs">
              {phase.icon} {phase.label}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className={'btn ' + (paused ? 'btn-on' : '')} onClick={() => set({ paused: !paused })} title="หยุด/เล่น (Space)">
            {paused ? '▶︎' : '⏸'}
          </button>
          {SPEEDS.map((s) => (
            <button key={s} className={'btn btn-sm ' + (speed === s && !paused ? 'btn-on' : '')} onClick={() => set({ speed: s, paused: false })}>
              {s}×
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="muted text-[11px]">ข้ามเวลา</span>
          {SKIPS.map((k) => (
            <button key={k.d} className="btn btn-sm" onClick={() => skipDays(k.d)}>
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel pointer-events-auto ml-auto flex items-center gap-1 px-2 py-2">
        <button className="btn" onClick={() => set({ reportsOpen: true })}>
          📊 <span className="hidden sm:inline">สรุปรายงาน</span>
        </button>
        <button className="btn" onClick={() => set({ settingsOpen: true })}>
          ⚙️ <span className="hidden sm:inline">ตั้งค่า</span>
        </button>
      </div>
    </div>
  );
}
