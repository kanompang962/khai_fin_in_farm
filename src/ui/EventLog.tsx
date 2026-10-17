import { useState } from 'react';
import { useSim } from '../state/useSimStore';
import { stamp } from './format';

export function EventLog() {
  const sim = useSim();
  const [expanded, setExpanded] = useState(false);
  const items = sim.log.slice(expanded ? -60 : -5).reverse();
  return (
    <div className="panel pointer-events-auto absolute bottom-2 left-2 z-20 hidden w-[420px] max-w-[calc(100vw-16px)] p-2.5 sm:bottom-3 sm:left-3 md:block">
      <button className="flex w-full items-center justify-between text-sm font-semibold" onClick={() => setExpanded(!expanded)}>
        <span>📝 บันทึกเหตุการณ์</span>
        <span className="muted text-xs">{expanded ? 'ย่อ ▾' : 'ดูทั้งหมด ▴'}</span>
      </button>
      <div className={'scroll-thin mt-1.5 space-y-0.5 overflow-y-auto text-xs ' + (expanded ? 'max-h-[40vh]' : '')}>
        {items.map((e, i) => (
          <div key={sim.log.length - i} className="flex gap-2">
            <span className="muted num shrink-0">{stamp(sim, e.at)}</span>
            <span style={{ color: e.kind === 'money' ? '#7fdca0' : e.kind === 'warn' ? '#f2b37a' : 'var(--ink-2)' }}>{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
