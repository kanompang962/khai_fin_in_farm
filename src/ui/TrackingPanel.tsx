import { useEffect, useState } from 'react';
import { ROLE_LABEL } from '../sim/defaults';
import { addHouse, flockAge, flockOf, fmtQty, removeHouse, setHouseHens, startFlock, storeStock } from '../sim/engine';
import { layRate } from '../sim/flock';
import { GRADE_COLOR, GRADE_LABEL } from '../sim/grading';
import { GRADES, type House } from '../sim/types';
import { housePos, employeePose, TASK_STYLE, truckPose } from '../scene/layout';
import { useSim, useSimFrame, useSimStore } from '../state/useSimStore';
import { baht, num, pct } from './format';

type Tab = 'houses' | 'staff' | 'truck' | 'store';
function tabsFor(farmSales: boolean): { id: Tab; label: string }[] {
  return [
    { id: 'houses', label: '🏠 โรงเรือน' },
    { id: 'staff', label: '👷 พนักงาน' },
    { id: 'truck', label: farmSales ? '⚖️ คัดไข่' : '🚚 รถ/คัด' },
    { id: 'store', label: farmSales ? '🏪 จุดขาย' : '🏪 ร้าน' },
  ];
}

export function TrackingPanel() {
  const selected = useSimStore((s) => s.selected);
  const [tab, setTab] = useState<Tab>('houses');
  const [open, setOpen] = useState(() => window.innerWidth >= 768);
  const farmSales = useSimStore((s) => s.sim.settings.salesMode === 'farm');

  useEffect(() => {
    if (!selected) return;
    const map = { house: 'houses', employee: 'staff', truck: 'truck', grading: 'truck', store: 'store' } as const;
    setTab(map[selected.kind]);
    setOpen(true);
  }, [selected]);

  return (
    <div className="panel pointer-events-auto absolute right-2 top-[124px] z-20 flex max-h-[calc(100vh-190px)] w-[330px] max-w-[calc(100vw-16px)] flex-col p-2.5 sm:right-3 sm:top-[84px]">
      <button className="flex w-full items-center justify-between text-sm font-semibold" onClick={() => setOpen(!open)}>
        <span>🔎 ติดตาม</span>
        <span className="muted text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          <div className="mt-2 flex gap-1 rounded-lg bg-black/20 p-1">
            {tabsFor(farmSales).map((t) => (
              <button key={t.id} className={'tab whitespace-nowrap px-1 ' + (tab === t.id ? 'tab-on' : '')} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="scroll-thin mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
            {tab === 'houses' && <HousesTab />}
            {tab === 'staff' && <StaffTab />}
            {tab === 'truck' && <TruckTab />}
            {tab === 'store' && <StoreTab />}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- โรงเรือน ----------

function HousesTab() {
  const sim = useSim();
  const mutate = useSimStore((s) => s.mutate);
  const [hens, setHens] = useState(sim.settings.defaultHensPerHouse);
  const [age, setAge] = useState(sim.settings.defaultStartAgeWeeks);
  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-dashed border-white/15 p-2">
        <div className="mb-1.5 text-xs font-semibold">➕ เพิ่มโรงเรือนใหม่</div>
        <div className="flex items-end gap-1.5">
          <label className="flex-1 text-[11px] muted">
            จำนวนไก่
            <input className="field" type="number" min={0} step={100} value={hens} onChange={(e) => setHens(+e.target.value)} />
          </label>
          <label className="w-20 text-[11px] muted">
            อายุ (สัปดาห์)
            <input className="field" type="number" min={1} max={90} value={age} onChange={(e) => setAge(+e.target.value)} />
          </label>
          <button className="btn btn-primary btn-sm h-[30px]" onClick={() => mutate((s) => addHouse(s, { hens, ageWeeks: age }))}>
            เพิ่ม
          </button>
        </div>
        <div className="muted mt-1 text-[10.5px]">ค่าไก่สาว {baht(hens * sim.settings.pulletPrice)} ({baht(sim.settings.pulletPrice)}/ตัว)</div>
      </div>
      {sim.houses.map((h, i) => (
        <HouseCard key={h.id} house={h} index={i} />
      ))}
      {!sim.houses.length && <div className="muted text-center text-xs">ยังไม่มีโรงเรือน</div>}
    </div>
  );
}

function HouseCard({ house, index }: { house: House; index: number }) {
  const sim = useSim();
  const st = useSimStore.getState();
  const selected = useSimStore((s) => s.selected?.kind === 'house' && s.selected.id === house.id);
  const [editing, setEditing] = useState(false);
  const f = flockOf(sim, house);
  const [hens, setHens] = useState(f?.hens ?? 0);
  const age = f ? flockAge(sim, f) : 0;
  const fd = f ? sim.today.flocks[f.id] : undefined;
  const eggsToday = (fd?.eggs ?? 0) + house.pendingEggs;
  const focus = () => {
    const [x, z] = housePos(index);
    st.set({ selected: { kind: 'house', id: house.id } });
    st.focusOn(x, z, 30);
  };

  return (
    <div className={'rounded-lg p-2 ' + (selected ? 'bg-amber-400/10 ring-1 ring-amber-400/50' : 'bg-white/[0.04]')}>
      <div className="flex items-center justify-between">
        <button className="text-sm font-semibold hover:underline" onClick={focus}>
          {house.name}
        </button>
        <div className="flex gap-1">
          <button className="btn btn-sm" title="ไปที่โรงเรือน" onClick={focus}>
            📍
          </button>
          <button
            className="btn btn-sm"
            title="แก้จำนวนไก่"
            onClick={() => {
              setHens(f?.hens ?? 0);
              setEditing(!editing);
            }}
          >
            ✏️
          </button>
          <button
            className="btn btn-sm btn-danger"
            title="ลบโรงเรือน"
            onClick={() => confirm(`ลบ ${house.name}? ไก่ในโรงเรือนจะถูกย้ายออก`) && st.mutate((s) => removeHouse(s, house.id))}
          >
            🗑
          </button>
        </div>
      </div>
      {f ? (
        <div className="num mt-1 grid grid-cols-2 gap-x-3 text-xs">
          <span className="muted">รุ่น</span>
          <span className="text-right">{f.name}</span>
          <span className="muted">จำนวนไก่</span>
          <span className="text-right">
            {num(f.hens)} / {num(house.capacity)}
          </span>
          <span className="muted">อายุ</span>
          <span className="text-right">{age.toFixed(1)} สัปดาห์</span>
          <span className="muted">อัตราไข่</span>
          <span className="text-right">{pct(layRate(age, sim.settings.layRate))}</span>
          <span className="muted">ไข่วันนี้</span>
          <span className="text-right">{num(eggsToday)} ฟอง</span>
          <span className="muted">อาหารวันนี้</span>
          <span className="text-right">{num(house.feedKgToday)} กก.</span>
          <span className="muted">มูลสะสม</span>
          <span className="text-right">{num(house.manureKg)} กก.</span>
          <span className="muted">ปลดระวางใน</span>
          <span className="text-right">{Math.max(0, sim.settings.cullAgeWeeks - age).toFixed(0)} สัปดาห์</span>
        </div>
      ) : (
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="muted">ว่าง ยังไม่มีไก่</span>
          <button
            className="btn btn-sm btn-primary"
            onClick={() =>
              st.mutate((s) => {
                const h = s.houses.find((x) => x.id === house.id);
                if (h) startFlock(s, h, s.settings.defaultHensPerHouse, s.settings.defaultStartAgeWeeks);
              })
            }
          >
            🐣 ลงไก่รุ่นใหม่
          </button>
        </div>
      )}
      {editing && (
        <div className="mt-2 flex items-end gap-1.5 border-t border-white/10 pt-2">
          <label className="flex-1 text-[11px] muted">
            จำนวนไก่ใหม่
            <input className="field" type="number" min={0} step={100} value={hens} onChange={(e) => setHens(+e.target.value)} />
          </label>
          <button
            className="btn btn-primary btn-sm h-[30px]"
            onClick={() => {
              st.mutate((s) => setHouseHens(s, house.id, hens));
              setEditing(false);
            }}
          >
            บันทึก
          </button>
          {f && (
            <button
              className="btn btn-sm h-[30px]"
              title="ปลดไก่รุ่นนี้และลงรุ่นใหม่"
              onClick={() => {
                if (!confirm(`ปลด${f.name}แล้วลงไก่รุ่นใหม่ ${num(hens)} ตัว?`)) return;
                st.mutate((s) => {
                  const h = s.houses.find((x) => x.id === house.id);
                  if (h) startFlock(s, h, hens, s.settings.defaultStartAgeWeeks);
                });
                setEditing(false);
              }}
            >
              🐣 รุ่นใหม่
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- พนักงาน ----------

function StaffTab() {
  const sim = useSimFrame();
  const selectedId = useSimStore((s) => (s.selected?.kind === 'employee' ? s.selected.id : null));
  const wages = sim.employees.reduce((a, e) => a + e.wage, 0);
  return (
    <div className="space-y-1.5">
      {sim.employees.map((e) => {
        const pose = employeePose(sim, e, sim.time);
        return (
          <button
            key={e.id}
            className={'w-full rounded-lg p-2 text-left ' + (selectedId === e.id ? 'bg-amber-400/10 ring-1 ring-amber-400/50' : 'bg-white/[0.04]')}
            onClick={() => {
              useSimStore.getState().set({ selected: { kind: 'employee', id: e.id } });
              if (pose.visible) useSimStore.getState().focusOn(pose.p[0], pose.p[1], 16);
            }}
          >
            <div className="flex justify-between text-sm">
              <b>{e.name}</b>
              <span className="muted num text-xs">{baht(e.wage)}/วัน</span>
            </div>
            <div className="muted text-[11px]">{ROLE_LABEL[e.role]}</div>
            <div className="text-xs font-semibold" style={{ color: TASK_STYLE[pose.kind].color }}>
              {TASK_STYLE[pose.kind].icon} {pose.task}
            </div>
            {pose.detail && <div className="ink2 text-[11px]">{pose.detail}</div>}
            {pose.progress !== null && (
              <div className="mt-1 h-1 overflow-hidden rounded bg-white/10">
                <div className="h-full rounded" style={{ width: `${Math.round(pose.progress * 100)}%`, background: TASK_STYLE[pose.kind].color }} />
              </div>
            )}
          </button>
        );
      })}
      <div className="muted num pt-1 text-xs">
        ค่าแรงรวม {baht(wages)}/วัน · แก้ไขพนักงานได้ที่ ⚙️ ตั้งค่า
      </div>
    </div>
  );
}

// ---------- รถ / จุดคัดไข่ ----------

function TruckTab() {
  const sim = useSimFrame();
  const farmSales = sim.settings.salesMode === 'farm';
  const pose = truckPose(sim, sim.time);
  const tr = sim.truck;
  const t = sim.today;
  return (
    <div className="space-y-2 text-xs">
      {farmSales ? (
        <div className="ink2 rounded-lg bg-white/[0.04] p-2">
          ลูกค้ามาซื้อที่ฟาร์ม (เป็นแผงหรือเป็นฟอง) — ไม่มีรถขนส่ง แผงไข่ที่คัดแล้วนำไปวางที่จุดขายหน้าฟาร์มตอน 13:00 (เปลี่ยนได้ที่ ⚙️ ตั้งค่า › การขาย)
        </div>
      ) : (
      <div className="rounded-lg bg-white/[0.04] p-2">
        <div className="text-sm font-semibold">🚚 รถขนไข่</div>
        <div className="ink2">สถานะ: {pose.status}</div>
        <div className="num mt-1 grid grid-cols-2 gap-x-3">
          <span className="muted">ความจุ</span>
          <span className="text-right">{num(sim.settings.truckCapacityTrays)} แผง/เที่ยว</span>
          <span className="muted">ส่งวันนี้</span>
          <span className="text-right">
            {num(t.traysShipped)} แผง ({t.trips} เที่ยว)
          </span>
          <span className="muted">ค่าขนส่งวันนี้</span>
          <span className="text-right">{baht(t.expense.transport)}</span>
        </div>
        {tr && (
          <div className="mt-1.5">
            <div className="muted mb-0.5">เที่ยวล่าสุดแยกเบอร์</div>
            <GradeRows values={tr.byGrade} unit="ฟอง" />
          </div>
        )}
      </div>
      )}
      <div className="rounded-lg bg-white/[0.04] p-2">
        <div className="text-sm font-semibold">⚖️ จุดคัดไข่ / แพ็กแผง</div>
        <div className="num mt-1 grid grid-cols-2 gap-x-3">
          <span className="muted">ไข่รอคัด</span>
          <span className="text-right">{num(sim.collected.reduce((a, l) => a + l.eggs, 0))} ฟอง</span>
          <span className="muted">แพ็กวันนี้</span>
          <span className="text-right">{num(t.traysPacked)} แผง</span>
          <span className="muted">{farmSales ? 'รอวางขาย' : 'รอขึ้นรถ'}</span>
          <span className="text-right">{num(GRADES.reduce((a, g) => a + sim.farmEggs[g], 0))} ฟอง</span>
          <span className="muted">ค่าแผงไข่วันนี้</span>
          <span className="text-right">{baht(t.expense.tray)}</span>
        </div>
        <div className="muted mt-1.5 mb-0.5">เกณฑ์น้ำหนัก (กรัม)</div>
        <div className="num grid grid-cols-3 gap-1">
          {GRADES.map((g) => (
            <span key={g} className="flex items-center gap-1">
              <i className="inline-block h-2 w-2 rounded-sm" style={{ background: GRADE_COLOR[g] }} />
              {g === 'M' ? `คละ <${sim.settings.gradeMinWeights['3']} / บุบ` : `${g}: ≥${sim.settings.gradeMinWeights[g]}`}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- หน้าร้าน ----------

function StoreTab() {
  const sim = useSim();
  const t = sim.today;
  const recent = sim.customers.filter((c) => c.done).slice(-8).reverse();
  return (
    <div className="space-y-2 text-xs">
      <table className="num w-full">
        <thead>
          <tr className="muted text-[11px]">
            <th className="text-left font-normal">เบอร์</th>
            <th className="text-right font-normal">฿/แผง</th>
            <th className="text-right font-normal">฿/ฟอง</th>
            <th className="text-right font-normal">คงเหลือ</th>
            <th className="text-right font-normal">ขายวันนี้</th>
          </tr>
        </thead>
        <tbody>
          {GRADES.map((g) => (
            <tr key={g} className="border-t border-white/5">
              <td className="py-0.5">
                <span className="flex items-center gap-1.5">
                  <i className="inline-block h-2 w-2 rounded-sm" style={{ background: GRADE_COLOR[g] }} />
                  {GRADE_LABEL[g]}
                </span>
              </td>
              <td className="text-right">{num(sim.settings.pricePerTray[g])}</td>
              <td className="text-right">{num(sim.settings.pricePerEgg[g], 2)}</td>
              <td className="text-right">{num(storeStock(sim, g))}</td>
              <td className="text-right">{num(t.eggsSoldByGrade[g])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="num grid grid-cols-2 gap-x-3 rounded-lg bg-white/[0.04] p-2">
        <span className="muted">ลูกค้าวันนี้</span>
        <span className="text-right">
          {t.customers} / ~{sim.customers.length} คน
        </span>
        <span className="muted">ขายได้</span>
        <span className="text-right">{num(t.eggsSold)} ฟอง</span>
        <span className="muted">· เป็นแผง / เป็นฟอง</span>
        <span className="text-right">
          {num(t.traysSold)} แผง / {num(t.eggsSoldSingle)} ฟอง
        </span>
        <span className="muted">ไข่ไม่พอขาย</span>
        <span className="text-right">{num(t.lostEggs)} ฟอง</span>
        <span className="muted">รายได้ขายไข่</span>
        <span className="text-right font-semibold">{baht(t.income.egg)}</span>
      </div>
      {recent.length > 0 && (
        <div>
          <div className="muted mb-0.5">ลูกค้าล่าสุด</div>
          {recent.map((c) => (
            <div key={c.id} className="num flex justify-between border-t border-white/5 py-0.5">
              <span>
                {c.merchant ? '🧑‍💼 พ่อค้า' : '🙂 ลูกค้า'} · {GRADE_LABEL[c.wantGrade]} × {fmtQty(c.unit, c.wantQty)}
              </span>
              <span style={{ color: c.boughtQty ? '#7fdca0' : 'var(--bad)' }}>{c.boughtQty ? baht(c.amount) : 'ไข่ไม่พอ'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GradeRows({ values, unit }: { values: Record<string, number>; unit: string }) {
  return (
    <div className="num grid grid-cols-2 gap-x-3">
      {GRADES.filter((g) => values[g] > 0).map((g) => (
        <span key={g} className="flex justify-between">
          <span className="flex items-center gap-1">
            <i className="inline-block h-2 w-2 rounded-sm" style={{ background: GRADE_COLOR[g] }} />
            {GRADE_LABEL[g]}
          </span>
          <span>
            {num(values[g])} {unit}
          </span>
        </span>
      ))}
    </div>
  );
}
