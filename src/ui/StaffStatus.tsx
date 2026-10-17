import { employeePose, TASK_STYLE } from '../scene/layout';
import { useSimFrame, useSimStore } from '../state/useSimStore';

const MAX_SHOWN = 4;

/** แถบสถานะพนักงาน: กำลังทำอะไร คืบหน้าแค่ไหน งานถัดไป */
export function StaffStatus() {
  const sim = useSimFrame();
  const selectedId = useSimStore((s) => (s.selected?.kind === 'employee' ? s.selected.id : null));
  const shown = sim.employees.slice(0, MAX_SHOWN);
  if (!shown.length) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-[124px] z-20 hidden -translate-x-1/2 gap-2 sm:top-[84px] lg:flex">
      {shown.map((e) => {
        const pose = employeePose(sim, e, sim.time);
        const style = TASK_STYLE[pose.kind];
        return (
          <button
            key={e.id}
            className="panel pointer-events-auto flex w-[230px] items-center gap-2.5 px-2.5 py-2 text-left"
            style={{ borderColor: selectedId === e.id ? style.color : undefined, boxShadow: `inset 3px 0 0 ${style.color}` }}
            onClick={() => {
              const st = useSimStore.getState();
              st.set({ selected: { kind: 'employee', id: e.id } });
              if (pose.visible) st.focusOn(pose.p[0], pose.p[1], 16);
            }}
            title="คลิกเพื่อดูพนักงานในฉาก"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg" style={{ background: style.color + '33', border: `2px solid ${style.color}` }}>
              {style.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="muted block text-[11px] leading-tight">👷 {e.name}</span>
              <span className="block truncate text-sm font-semibold leading-tight" style={{ color: style.color }}>
                {pose.task}
              </span>
              {pose.detail && <span className="ink2 block truncate text-[11px] leading-tight">{pose.detail}</span>}
              {pose.progress !== null && (
                <span className="mt-1 block h-1 overflow-hidden rounded bg-white/10">
                  <span className="block h-full rounded" style={{ width: `${Math.round(pose.progress * 100)}%`, background: style.color }} />
                </span>
              )}
            </span>
          </button>
        );
      })}
      {sim.employees.length > MAX_SHOWN && (
        <div className="panel muted pointer-events-auto flex items-center px-3 text-xs">+{sim.employees.length - MAX_SHOWN} คน</div>
      )}
    </div>
  );
}
