import { useShallow } from 'zustand/react/shallow';
import { overview } from '../scene/layout';
import { useSimStore } from '../state/useSimStore';

const TOGGLES = [
  { key: 'showLabels', label: 'ป้ายชื่อ' },
  { key: 'showRoof', label: 'หลังคา' },
  { key: 'showPaths', label: 'เส้นทาง' },
  { key: 'shadows', label: 'เงา' },
  { key: 'autoRotate', label: 'หมุนอัตโนมัติ' },
] as const;

export function ViewToggles() {
  const st = useSimStore(
    useShallow((s) => ({
      showLabels: s.showLabels,
      showRoof: s.showRoof,
      showPaths: s.showPaths,
      shadows: s.shadows,
      autoRotate: s.autoRotate,
      panelsHidden: s.panelsHidden,
      showDaySummary: s.showDaySummary,
      setShowDaySummary: s.setShowDaySummary,
      set: s.set,
      focusOn: s.focusOn,
    })),
  );
  return (
    <div className="panel pointer-events-auto absolute bottom-2 right-2 z-20 flex flex-wrap items-center gap-1 p-1.5 sm:bottom-3 sm:right-3">
      {TOGGLES.map((t) => (
        <button key={t.key} className={'btn btn-sm ' + (st[t.key] ? 'btn-on' : '')} onClick={() => st.set({ [t.key]: !st[t.key] })}>
          {t.label}
        </button>
      ))}
      <button
        className={'btn btn-sm ' + (st.showDaySummary ? 'btn-on' : '')}
        onClick={() => st.setShowDaySummary(!st.showDaySummary)}
        title="แสดง popup สรุปเมื่อจบแต่ละวัน"
      >
        สรุปสิ้นวัน
      </button>
      <button className="btn btn-sm" onClick={() => {
          const o = overview(useSimStore.getState().sim);
          st.focusOn(o.x, o.z, o.zoom);
        }} title="มุมมองภาพรวม">
        🎯 ภาพรวม
      </button>
      <button className="btn btn-sm" onClick={() => st.set({ panelsHidden: !st.panelsHidden })} title="ซ่อน/แสดงแผง (H)">
        {st.panelsHidden ? 'แสดงแผง' : 'ซ่อนแผง'} <kbd className="muted">H</kbd>
      </button>
    </div>
  );
}
