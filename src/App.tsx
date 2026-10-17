import { useEffect } from 'react';
import { FarmScene } from './scene/FarmScene';
import { useSimStore } from './state/useSimStore';
import { EventLog } from './ui/EventLog';
import { DaySummary } from './ui/DaySummary';
import { ReportsView } from './ui/ReportsView';
import { SettingsDialog } from './ui/SettingsDialog';
import { StaffStatus } from './ui/StaffStatus';
import { StatsPanel } from './ui/StatsPanel';
import { TopBar } from './ui/TopBar';
import { TrackingPanel } from './ui/TrackingPanel';
import { ViewToggles } from './ui/ViewToggles';

export function App() {
  const panelsHidden = useSimStore((s) => s.panelsHidden);
  const settingsOpen = useSimStore((s) => s.settingsOpen);
  const reportsOpen = useSimStore((s) => s.reportsOpen);
  const daySummary = useSimStore((s) => s.daySummary);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const st = useSimStore.getState();
      if (e.key === 'h' || e.key === 'H') st.set({ panelsHidden: !st.panelsHidden });
      else if (e.key === 'Escape') {
        if (st.daySummary !== null) st.closeDaySummary();
        st.set({ selected: null, settingsOpen: false, reportsOpen: false });
      }
      else if (e.key === ' ') {
        e.preventDefault();
        st.set({ paused: !st.paused });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0">
        <FarmScene />
      </div>
      <TopBar />
      {!panelsHidden && (
        <>
          <StatsPanel />
          <StaffStatus />
          <TrackingPanel />
          <EventLog />
        </>
      )}
      <ViewToggles />
      {settingsOpen && <SettingsDialog />}
      {reportsOpen && <ReportsView />}
      {daySummary !== null && !reportsOpen && <DaySummary day={daySummary} />}
    </div>
  );
}
