import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_EMPLOYEES, DEFAULT_SETTINGS, ROLE_LABEL } from '../sim/defaults';
import { addEmployee, addHouse, expansionHenCost, flockOf, nextExpansionDay, removeHouse, setHouseHens, totalHens } from '../sim/engine';
import { dateOfDay, dayOf } from '../sim/schedule';
import { GRADE_COLOR, GRADE_LABEL } from '../sim/grading';
import { GRADES, type Role, type SalesMode, type Settings, type SimState } from '../sim/types';
import { saveSim, useSim, useSimStore } from '../state/useSimStore';
import { baht, downloadText, num, thaiDate } from './format';

type SectionId = 'farm' | 'flock' | 'expand' | 'feed' | 'grade' | 'price' | 'store' | 'transport' | 'staff' | 'data';
const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'farm', label: '🏡 ฟาร์ม & เวลา' },
  { id: 'flock', label: '🐔 ไก่ & โรงเรือน' },
  { id: 'expand', label: '🏗️ ขยายฟาร์มอัตโนมัติ' },
  { id: 'feed', label: '🌾 อาหาร น้ำ ไฟ' },
  { id: 'grade', label: '⚖️ คัดเบอร์ & แผง' },
  { id: 'price', label: '💰 ราคาขาย (แผง/ฟอง)' },
  { id: 'store', label: '🏪 การขาย & ลูกค้า' },
  { id: 'transport', label: '🚚 ขนส่ง & มูลไก่' },
  { id: 'staff', label: '👷 พนักงาน' },
  { id: 'data', label: '💾 ข้อมูล' },
];

/** ค่าตั้งของแต่ละหมวด — ใช้คืนค่าเริ่มต้นเฉพาะหมวด */
const SECTION_KEYS: Record<Exclude<SectionId, 'staff' | 'data'>, (keyof Settings)[]> = {
  farm: ['farmName', 'secondsPerDay'],
  flock: ['layRate', 'defaultHensPerHouse', 'defaultStartAgeWeeks', 'pulletPrice', 'cullAgeWeeks', 'mortalityPerDay', 'autoRestock'],
  expand: ['autoExpand', 'expandEvery', 'expandUnit', 'expandHens', 'expandAgeWeeks', 'expandMaxHouses', 'houseBuildCost'],
  feed: ['feedGramsPerHen', 'feedPricePerKg', 'waterPowerPerHouseDay'],
  grade: ['gradeMinWeights', 'traySize', 'trayCost', 'crackRate'],
  price: ['pricePerTray', 'pricePerEgg', 'marketPricePerTray', 'marketPricePerEgg'],
  store: ['salesMode', 'customersPerDay', 'merchantShare', 'eggBuyerShare', 'shelfLifeDays', 'gradeDemand'],
  transport: ['truckCapacityTrays', 'truckCostPerTrip', 'manureKgPerHenDay', 'manurePricePerKg', 'manureIntervalDays'],
};

const sameJSON = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function isSectionDefault(sim: SimState, id: SectionId): boolean {
  if (id === 'data') return true;
  if (id === 'staff')
    return sameJSON(
      sim.employees.map(({ name, role, wage }) => ({ name, role, wage })),
      DEFAULT_EMPLOYEES,
    );
  return SECTION_KEYS[id].every((k) => sameJSON(sim.settings[k], DEFAULT_SETTINGS[k]));
}

function resetSection(sim: SimState, id: SectionId) {
  if (id === 'data') return;
  if (id === 'staff') {
    sim.employees = [];
    for (const e of DEFAULT_EMPLOYEES) addEmployee(sim, e);
    return;
  }
  const target = sim.settings as unknown as Record<string, unknown>;
  for (const k of SECTION_KEYS[id]) target[k] = structuredClone(DEFAULT_SETTINGS[k]);
}

function SectionHeader({ sim, id }: { sim: SimState; id: SectionId }) {
  const label = SECTIONS.find((x) => x.id === id)!.label;
  const isDefault = isSectionDefault(sim, id);
  return (
    <div className="mb-3 flex items-center justify-between gap-2 border-b border-white/10 pb-2">
      <div className="font-semibold">{label}</div>
      {id !== 'data' && (
        <button
          className="btn btn-sm"
          disabled={isDefault}
          style={isDefault ? { opacity: 0.45, cursor: 'default' } : undefined}
          title={isDefault ? 'หมวดนี้ใช้ค่าเริ่มต้นอยู่แล้ว' : 'คืนค่าเริ่มต้นเฉพาะหมวดนี้'}
          onClick={() =>
            confirm(`คืนค่าเริ่มต้นหมวด "${label}"?${id === 'staff' ? '\nรายชื่อพนักงานจะกลับเป็นค่าเริ่มต้น' : id === 'flock' ? '\n(โรงเรือนและไก่ที่เลี้ยงอยู่ไม่เปลี่ยน)' : ''}`) &&
            useSimStore.getState().mutate((x) => resetSection(x, id))
          }
        >
          ↺ คืนค่าเริ่มต้นหมวดนี้
        </button>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  suffix,
  hint,
  scale = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  hint?: ReactNode;
  scale?: number; // แสดงผลคูณ scale (เช่น % = 100)
}) {
  const shown = +(value * scale).toFixed(6);
  const [text, setText] = useState(String(shown));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(shown));
  }, [shown]);
  const commit = (t: string) => {
    const v = parseFloat(t);
    if (Number.isFinite(v)) onChange(Math.min(max ?? Infinity, Math.max(min, v)) / scale);
  };
  return (
    <label className="block text-xs">
      <span className="ink2">{label}</span>
      <div className="mt-0.5 flex items-center gap-1.5">
        <input
          className="field"
          type="number"
          step={step}
          min={min}
          max={max}
          value={text}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            setText(String(shown));
          }}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value);
          }}
        />
        {suffix && <span className="muted shrink-0 text-[11px]">{suffix}</span>}
      </div>
      {hint && <span className="muted mt-0.5 block text-[10.5px]">{hint}</span>}
    </label>
  );
}

function Grid({ children, cols = 2 }: { children: ReactNode; cols?: number }) {
  return <div className={`grid gap-3 ${cols === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>{children}</div>;
}

function H({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 mt-4 text-sm font-semibold first:mt-0">{children}</h3>;
}

export function SettingsDialog() {
  const sim = useSim();
  const st = useSimStore.getState();
  const [section, setSection] = useState<SectionId>('farm');
  const s = sim.settings;
  const upd = <K extends keyof Settings>(k: K, v: Settings[K]) => st.mutate((x) => void (x.settings[k] = v));
  const updRec = <K extends 'pricePerTray' | 'pricePerEgg' | 'marketPricePerTray' | 'marketPricePerEgg' | 'gradeDemand' | 'gradeMinWeights'>(k: K, g: string, v: number) =>
    st.mutate((x) => void ((x.settings[k] as Record<string, number>)[g] = v));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-6" onClick={() => st.set({ settingsOpen: false })}>
      <div className="panel flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden !bg-[var(--panel-solid)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <div className="font-semibold">⚙️ ตั้งค่าการจำลอง</div>
            <div className="muted text-[11px]">การเปลี่ยนค่ามีผลทันทีตั้งแต่ event ถัดไป</div>
          </div>
          <button className="btn" onClick={() => st.set({ settingsOpen: false })}>
            ✕
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav className="scroll-thin flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 p-2 sm:w-48 sm:flex-col sm:border-b-0 sm:border-r">
            {SECTIONS.map((x) => (
              <button key={x.id} className={'tab shrink-0 text-left sm:flex-none ' + (section === x.id ? 'tab-on' : '')} onClick={() => setSection(x.id)}>
                {x.label}
              </button>
            ))}
          </nav>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
            <SectionHeader sim={sim} id={section} />
            {section === 'farm' && (
              <>
                <H>ฟาร์ม</H>
                <Grid>
                  <label className="block text-xs">
                    <span className="ink2">ชื่อฟาร์ม</span>
                    <input className="field mt-0.5" value={s.farmName} onChange={(e) => upd('farmName', e.target.value)} />
                  </label>
                  <NumField
                    label="ความยาว 1 วันจำลอง (ที่ความเร็ว 1×)"
                    value={s.secondsPerDay}
                    min={10}
                    max={3600}
                    step={10}
                    suffix="วินาที"
                    onChange={(v) => upd('secondsPerDay', v)}
                  />
                </Grid>
                <H>ตารางงานประจำวัน</H>
                <div className="ink2 grid grid-cols-[60px_1fr] gap-y-1 text-xs">
                  <b>06:00</b> <span>พนักงานให้อาหารไก่ที่รางอาหารทุกโรงเรือน</span>
                  <b>09:00</b> <span>เก็บไข่ (ไข่กลิ้งมาที่รางรับไข่หน้ากรง)</span>
                  <b>11:00</b> <span>คัดไข่แยกเบอร์ตามน้ำหนัก เรียงใส่แผง</span>
                  {s.salesMode === 'farm' ? (
                    <>
                      <b>13:00</b> <span>นำแผงไข่ไปวางที่จุดขายหน้าฟาร์ม</span>
                      <b>14:00</b> <span>ลูกค้ามาซื้อไข่ที่ฟาร์ม (ถึง 20:00)</span>
                    </>
                  ) : (
                    <>
                      <b>13:00</b> <span>ขนแผงขึ้นรถ ส่งไปหน้าร้าน</span>
                      <b>14:00</b> <span>หน้าร้านขายไข่ให้ลูกค้า (ถึง 20:00)</span>
                    </>
                  )}
                  <b>16:00</b> <span>เก็บมูลไก่ใต้กรง (ทุก {s.manureIntervalDays} วัน)</span>
                  <b>23:59</b> <span>สรุปยอด คิดค่าแรง ค่าน้ำไฟ ไก่ตาย ปลดระวาง</span>
                </div>
              </>
            )}

            {section === 'flock' && <FlockSection sim={sim} upd={upd} />}

            {section === 'expand' && <ExpandSection sim={sim} upd={upd} />}

            {section === 'feed' && (
              <>
                <H>อาหารไก่</H>
                <Grid>
                  <NumField
                    label="ปริมาณอาหารต่อตัวต่อวัน"
                    value={s.feedGramsPerHen}
                    min={0}
                    max={200}
                    suffix="กรัม/ตัว/วัน"
                    onChange={(v) => upd('feedGramsPerHen', v)}
                    hint={
                      s.feedGramsPerHen < 110 ? (
                        <span style={{ color: '#f2b37a' }}>⚠ ต่ำกว่าความต้องการ (~110 ก.) ไก่จะไข่น้อยลงและฟองเล็กลง</span>
                      ) : (
                        'ไก่ไข่ระยะให้ผลผลิตต้องการ ~110 กรัม/ตัว/วัน'
                      )
                    }
                  />
                  <NumField label="ราคาอาหาร" value={s.feedPricePerKg} step={0.5} suffix="บาท/กก." onChange={(v) => upd('feedPricePerKg', v)} />
                </Grid>
                <div className="ink2 num mt-2 rounded-lg bg-white/[0.04] p-2 text-xs">
                  ใช้อาหารรวม ~{num((totalHens(sim) * s.feedGramsPerHen) / 1000)} กก./วัน · ค่าอาหาร ~
                  {baht(((totalHens(sim) * s.feedGramsPerHen) / 1000) * s.feedPricePerKg)}/วัน
                </div>
                <H>น้ำ (nipple drinker) และไฟฟ้า</H>
                <Grid>
                  <NumField label="ค่าน้ำ + ไฟ ต่อโรงเรือน" value={s.waterPowerPerHouseDay} step={10} suffix="บาท/วัน" onChange={(v) => upd('waterPowerPerHouseDay', v)} />
                </Grid>
              </>
            )}

            {section === 'grade' && (
              <>
                <H>เกณฑ์น้ำหนักขั้นต่ำแต่ละเบอร์ (มาตรฐานไทย)</H>
                <Grid cols={2}>
                  {(['0', '1', '2', '3'] as const).map((g) => (
                    <NumField key={g} label={GRADE_LABEL[g]} value={s.gradeMinWeights[g]} suffix="กรัมขึ้นไป" onChange={(v) => updRec('gradeMinWeights', g, v)} />
                  ))}
                </Grid>
                <div className="muted mt-1 text-[11px]">
                  เบอร์ 0 ≥{s.gradeMinWeights['0']} ก. · เบอร์ 1 {s.gradeMinWeights['1']}–{s.gradeMinWeights['0'] - 1} · เบอร์ 2 {s.gradeMinWeights['2']}–
                  {s.gradeMinWeights['1'] - 1} · เบอร์ 3 {s.gradeMinWeights['3']}–{s.gradeMinWeights['2'] - 1} · น้ำหนักต่ำกว่าเบอร์ 3 หรือไข่บุบ/แตก = คละ
                </div>
                <H>การแพ็กแผง</H>
                <Grid cols={3}>
                  <NumField label="ไข่ต่อแผง" value={s.traySize} min={1} suffix="ฟอง" onChange={(v) => upd('traySize', Math.round(v))} />
                  <NumField label="ค่าแผงไข่" value={s.trayCost} step={0.5} suffix="บาท/แผง" onChange={(v) => upd('trayCost', v)} />
                  <NumField label="ไข่บุบ/แตก" value={s.crackRate} scale={100} step={0.5} max={50} suffix="%" onChange={(v) => upd('crackRate', v)} />
                </Grid>
              </>
            )}

            {section === 'price' && (
              <>
                <H>ราคาขาย แยกตามเบอร์ — ขายเป็นแผง ({s.traySize} ฟอง) หรือขายเป็นฟอง</H>
                <div className="muted mb-2 text-[11px]">ถ้าตั้งราคาสูงกว่าราคาตลาด ลูกค้าจะน้อยลง · ถ้าถูกกว่า ลูกค้าจะมากขึ้น</div>
                <div className="overflow-x-auto">
                  <table className="num w-full min-w-[560px] text-xs">
                    <thead>
                      <tr className="muted">
                        <th className="text-left font-normal">เบอร์</th>
                        <th className="px-1.5 text-left font-normal">ราคา/แผง</th>
                        <th className="px-1.5 text-left font-normal">ราคา/ฟอง</th>
                        <th className="px-1.5 text-left font-normal">ตลาด/แผง</th>
                        <th className="px-1.5 text-left font-normal">ตลาด/ฟอง</th>
                        <th className="text-right font-normal">ส่วนต่าง*</th>
                      </tr>
                    </thead>
                    <tbody>
                      {GRADES.map((g) => (
                        <tr key={g}>
                          <td className="py-1">
                            <span className="flex items-center gap-1.5 whitespace-nowrap">
                              <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GRADE_COLOR[g] }} />
                              {GRADE_LABEL[g]}
                            </span>
                          </td>
                          <td className="px-1.5">
                            <NumField label="" value={s.pricePerTray[g]} step={5} onChange={(v) => updRec('pricePerTray', g, v)} />
                          </td>
                          <td className="px-1.5">
                            <NumField label="" value={s.pricePerEgg[g]} step={0.25} onChange={(v) => updRec('pricePerEgg', g, v)} />
                          </td>
                          <td className="px-1.5">
                            <NumField label="" value={s.marketPricePerTray[g]} step={5} onChange={(v) => updRec('marketPricePerTray', g, v)} />
                          </td>
                          <td className="px-1.5">
                            <NumField label="" value={s.marketPricePerEgg[g]} step={0.25} onChange={(v) => updRec('marketPricePerEgg', g, v)} />
                          </td>
                          <td className="text-right">{(s.pricePerEgg[g] - s.pricePerTray[g] / s.traySize).toFixed(2)} ฿</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="muted mt-1 text-[11px]">* ราคาต่อฟองเทียบกับซื้อยกแผง (ราคาแผง ÷ {s.traySize})</div>
              </>
            )}

            {section === 'store' && (
              <>
                <H>รูปแบบการขาย</H>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      { v: 'farm', title: '🏡 ลูกค้ามาซื้อที่ฟาร์ม', desc: 'ไม่มีหน้าร้าน ไม่มีรถขนส่ง วางแผงขายที่จุดขายหน้าฟาร์ม พนักงานขายเองช่วงบ่าย' },
                      { v: 'store', title: '🚚 ส่งรถไปขายที่หน้าร้าน', desc: 'รถขนแผงไข่ไปหน้าร้านทุกวัน มีค่าขนส่งต่อเที่ยว' },
                    ] as { v: SalesMode; title: string; desc: string }[]
                  ).map((o) => (
                    <button
                      key={o.v}
                      className={'rounded-lg border p-2.5 text-left ' + (s.salesMode === o.v ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]')}
                      onClick={() => upd('salesMode', o.v)}
                    >
                      <div className="text-sm font-semibold">{o.title}</div>
                      <div className="muted text-[11px]">{o.desc}</div>
                    </button>
                  ))}
                </div>
                <H>ลูกค้า</H>
                <Grid cols={3}>
                  <NumField label="ลูกค้าเฉลี่ยต่อวัน" value={s.customersPerDay} suffix="คน" onChange={(v) => upd('customersPerDay', v)} />
                  <NumField
                    label="สัดส่วนพ่อค้า (ซื้อ 5–20 แผง)"
                    value={s.merchantShare}
                    scale={100}
                    max={100}
                    suffix="%"
                    onChange={(v) => upd('merchantShare', v)}
                    hint="ลูกค้าทั่วไปซื้อ 1–3 แผง"
                  />
                  <NumField
                    label="ลูกค้าที่ซื้อเป็นฟอง"
                    value={s.eggBuyerShare}
                    scale={100}
                    max={100}
                    suffix="%"
                    onChange={(v) => upd('eggBuyerShare', v)}
                    hint="ซื้อครั้งละ 6–20 ฟอง ที่เหลือซื้อเป็นแผง"
                  />
                  <NumField label="อายุไข่บนชั้นขาย" value={s.shelfLifeDays} min={1} suffix="วัน" onChange={(v) => upd('shelfLifeDays', v)} />
                </Grid>
                <H>ความต้องการแต่ละเบอร์ (สัดส่วน)</H>
                <Grid cols={3}>
                  {GRADES.map((g) => (
                    <NumField key={g} label={GRADE_LABEL[g]} value={s.gradeDemand[g]} scale={100} suffix="%" onChange={(v) => updRec('gradeDemand', g, v)} />
                  ))}
                </Grid>
                <div className="muted mt-1 text-[11px]">ถ้าเบอร์ที่ต้องการหมด ลูกค้าจะเลือกเบอร์ใกล้เคียง (±2 เบอร์) · คนที่ต้องการเบอร์ 2–3 ยอมรับไข่คละ</div>
              </>
            )}

            {section === 'transport' && (
              <>
                <H>รถขนไข่</H>
                {s.salesMode === 'farm' && (
                  <div className="mb-2 rounded-lg bg-amber-400/10 p-2 text-[11px] text-amber-200">
                    ตอนนี้ขายที่ฟาร์ม จึงไม่ใช้รถและไม่มีค่าขนส่ง — ค่าด้านล่างมีผลเมื่อเปลี่ยนเป็น “ส่งรถไปขายที่หน้าร้าน”
                  </div>
                )}
                <Grid>
                  <NumField label="ความจุรถ" value={s.truckCapacityTrays} min={1} suffix="แผง/เที่ยว" onChange={(v) => upd('truckCapacityTrays', Math.round(v))} />
                  <NumField label="ค่าขนส่ง (น้ำมัน)" value={s.truckCostPerTrip} step={10} suffix="บาท/เที่ยว" onChange={(v) => upd('truckCostPerTrip', v)} />
                </Grid>
                <H>มูลไก่</H>
                <Grid cols={3}>
                  <NumField label="มูลไก่ต่อตัวต่อวัน" value={s.manureKgPerHenDay} step={0.01} suffix="กก." onChange={(v) => upd('manureKgPerHenDay', v)} />
                  <NumField label="ราคาขายมูลไก่" value={s.manurePricePerKg} step={0.1} suffix="บาท/กก." onChange={(v) => upd('manurePricePerKg', v)} />
                  <NumField label="เก็บมูลทุก" value={s.manureIntervalDays} min={1} suffix="วัน" onChange={(v) => upd('manureIntervalDays', Math.round(v))} />
                </Grid>
              </>
            )}

            {section === 'staff' && <StaffSection sim={sim} />}

            {section === 'data' && <DataSection sim={sim} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function FlockSection({ sim, upd }: { sim: SimState; upd: <K extends keyof Settings>(k: K, v: Settings[K]) => void }) {
  const st = useSimStore.getState();
  const s = sim.settings;
  return (
    <>
      <H>การให้ไข่</H>
      <Grid cols={3}>
        <NumField
          label="อัตราการไข่"
          value={s.layRate}
          scale={100}
          step={1}
          max={100}
          suffix="%"
          onChange={(v) => upd('layRate', v)}
          hint={`ไก่ ${num(totalHens(sim))} ตัว ≈ ${num(totalHens(sim) * s.layRate)} ฟอง/วัน · ไก่สาวเริ่มไข่ 18 สัปดาห์ ถึงอัตรานี้ที่ 21 สัปดาห์`}
        />
      </Grid>
      <H>ค่าเริ่มต้นเมื่อลงไก่รุ่นใหม่</H>
      <Grid cols={3}>
        <NumField label="จำนวนไก่ต่อโรงเรือน" value={s.defaultHensPerHouse} step={100} suffix="ตัว" onChange={(v) => upd('defaultHensPerHouse', Math.round(v))} />
        <NumField label="อายุไก่สาวที่ซื้อเข้า" value={s.defaultStartAgeWeeks} min={1} max={60} suffix="สัปดาห์" onChange={(v) => upd('defaultStartAgeWeeks', v)} />
        <NumField label="ราคาไก่สาว" value={s.pulletPrice} step={5} suffix="บาท/ตัว" onChange={(v) => upd('pulletPrice', v)} />
        <NumField label="ปลดระวางเมื่ออายุ" value={s.cullAgeWeeks} min={20} max={120} suffix="สัปดาห์" onChange={(v) => upd('cullAgeWeeks', v)} />
        <NumField label="อัตราไก่ตาย" value={s.mortalityPerDay} scale={100} step={0.01} max={5} suffix="%/วัน" onChange={(v) => upd('mortalityPerDay', v)} />
        <label className="flex items-center gap-2 self-end pb-1.5 text-xs">
          <input type="checkbox" checked={s.autoRestock} onChange={(e) => upd('autoRestock', e.target.checked)} />
          ลงไก่รุ่นใหม่อัตโนมัติหลังปลดระวาง
        </label>
      </Grid>
      <H>โรงเรือน ({sim.houses.length})</H>
      <div className="space-y-1.5">
        {sim.houses.map((h) => {
          const f = flockOf(sim, h);
          return (
            <div key={h.id} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 rounded-lg bg-white/[0.04] p-2">
              <div className="text-xs">
                <b>{h.name}</b>
                <div className="muted">{f ? f.name : 'ว่าง'}</div>
              </div>
              <NumField label="จำนวนไก่" value={f?.hens ?? 0} step={100} onChange={(v) => st.mutate((x) => setHouseHens(x, h.id, v))} />
              <NumField
                label="ความจุโรงเรือน"
                value={h.capacity}
                step={100}
                min={100}
                onChange={(v) => st.mutate((x) => void (x.houses.find((y) => y.id === h.id)!.capacity = Math.round(v)))}
              />
              <button className="btn btn-sm btn-danger mb-0.5" onClick={() => confirm(`ลบ ${h.name}?`) && st.mutate((x) => removeHouse(x, h.id))}>
                ลบ
              </button>
            </div>
          );
        })}
        <button className="btn btn-primary w-full" onClick={() => st.mutate((x) => addHouse(x))}>
          ➕ เพิ่มโรงเรือน ({num(s.defaultHensPerHouse)} ตัว · {baht(s.defaultHensPerHouse * s.pulletPrice)})
        </button>
        <div className="muted text-[11px]">การเพิ่มจำนวนไก่จะคิดค่าไก่สาวตามจำนวนที่เพิ่ม</div>
      </div>
    </>
  );
}

function ExpandSection({ sim, upd }: { sim: SimState; upd: <K extends keyof Settings>(k: K, v: Settings[K]) => void }) {
  const s = sim.settings;
  const next = nextExpansionDay(sim);
  const cost = expansionHenCost(s);
  const intervalDays = Math.round(Math.max(1, s.expandEvery) * (s.expandUnit === 'year' ? 365 : 30.4));
  return (
    <>
      <button
        className={'mb-3 flex w-full items-center gap-3 rounded-lg border p-3 text-left ' + (s.autoExpand ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 bg-white/[0.03]')}
        onClick={() => upd('autoExpand', !s.autoExpand)}
      >
        <span className={'relative h-6 w-11 shrink-0 rounded-full transition-colors ' + (s.autoExpand ? 'bg-amber-400' : 'bg-white/20')}>
          <span className={'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ' + (s.autoExpand ? 'left-[22px]' : 'left-0.5')} />
        </span>
        <span>
          <span className="block text-sm font-semibold">{s.autoExpand ? 'เปิด: สร้างโรงเรือนและเพิ่มไก่อัตโนมัติ' : 'ปิดอยู่ — กดเพื่อเปิดการขยายฟาร์มอัตโนมัติ'}</span>
          <span className="muted block text-[11px]">ทุกรอบจะสร้างโรงเรือนใหม่ 1 หลังพร้อมลงไก่ และกันเงินซื้อไก่รอบถัดไปไว้ทุกวัน</span>
        </span>
      </button>
      <H>รอบการขยาย</H>
      <Grid cols={3}>
        <NumField label="ทุก ๆ" value={s.expandEvery} min={1} max={120} onChange={(v) => upd('expandEvery', Math.max(1, Math.round(v)))} />
        <label className="block text-xs">
          <span className="ink2">หน่วย</span>
          <div className="mt-0.5 flex gap-1">
            {(['month', 'year'] as const).map((u) => (
              <button key={u} className={'btn btn-sm flex-1 ' + (s.expandUnit === u ? 'btn-on' : '')} onClick={() => upd('expandUnit', u)}>
                {u === 'month' ? 'เดือน' : 'ปี'}
              </button>
            ))}
          </div>
        </label>
        <NumField label="โรงเรือนสูงสุด" value={s.expandMaxHouses} min={1} max={40} suffix="หลัง" onChange={(v) => upd('expandMaxHouses', Math.round(v))} />
      </Grid>
      <H>ต่อรอบ</H>
      <Grid cols={3}>
        <NumField label="จำนวนไก่ที่ลง" value={s.expandHens} step={50} min={1} suffix="ตัว" onChange={(v) => upd('expandHens', Math.round(v))} />
        <NumField label="อายุไก่สาวที่ซื้อ" value={s.expandAgeWeeks} min={1} max={60} suffix="สัปดาห์" onChange={(v) => upd('expandAgeWeeks', v)} />
        <NumField label="ค่าสร้างโรงเรือน" value={s.houseBuildCost} step={1000} suffix="บาท/หลัง" onChange={(v) => upd('houseBuildCost', v)} hint="ใส่ 0 ถ้าไม่คิดค่าก่อสร้าง" />
      </Grid>
      <div className="num mt-3 grid gap-1 rounded-lg bg-white/[0.04] p-3 text-xs sm:grid-cols-2">
        <div className="flex justify-between gap-2">
          <span className="muted">🐣 ค่าไก่ต่อรอบ</span>
          <span>
            {num(s.expandHens)} × {baht(s.pulletPrice)} = <b>{baht(cost)}</b>
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="muted">🏦 กันเงินไว้ประมาณ</span>
          <b>{baht(cost / intervalDays)}/วัน</b>
        </div>
        <div className="flex justify-between gap-2">
          <span className="muted">🏦 เงินสำรองตอนนี้</span>
          <b>{baht(sim.expansion.reserve)}</b>
        </div>
        <div className="flex justify-between gap-2">
          <span className="muted">📅 รอบถัดไป</span>
          <b>
            {next !== null
              ? `${thaiDate(dateOfDay(s.startDate, next), { day: 'numeric', month: 'short', year: 'numeric' })} (อีก ${next - dayOf(sim.time)} วัน)`
              : s.autoExpand
                ? `ครบ ${s.expandMaxHouses} โรงเรือนแล้ว`
                : '—'}
          </b>
        </div>
        <div className="flex justify-between gap-2">
          <span className="muted">🏗️ ขยายไปแล้ว</span>
          <b>{sim.expansion.rounds} รอบ</b>
        </div>
      </div>
      <div className="muted mt-2 text-[11px]">
        เงินที่กันไว้จะลงบัญชีเป็นรายจ่าย “กันเงินซื้อไก่รอบถัดไป” ทุกวัน แล้วนำไปจ่ายค่าไก่ตอนขยายฟาร์ม (ไม่นับเป็นรายจ่ายซ้ำ) ถ้าเงินสำรองไม่พอ
        ส่วนที่ขาดจะคิดเป็นค่าไก่สาวในวันนั้น · ราคาไก่สาวตั้งได้ที่หมวด “ไก่ & โรงเรือน”
      </div>
    </>
  );
}

function StaffSection({ sim }: { sim: SimState }) {
  const st = useSimStore.getState();
  const edit = (id: string, patch: Partial<SimState['employees'][number]>) =>
    st.mutate((x) => Object.assign(x.employees.find((e) => e.id === id)!, patch));
  return (
    <>
      <H>พนักงาน ({sim.employees.length} คน)</H>
      <div className="muted mb-2 text-[11px]">
        พนักงานเลี้ยงไก่จะแบ่งโรงเรือนกันดูแล (ให้อาหาร เก็บไข่ เก็บมูล) · คนขับรถช่วยคัดไข่และส่งไข่ · พนักงานหน้าร้านขายไข่
      </div>
      <div className="space-y-1.5">
        {sim.employees.map((e) => (
          <div key={e.id} className="grid grid-cols-[1fr_1fr_100px_auto] items-end gap-2 rounded-lg bg-white/[0.04] p-2">
            <label className="block text-xs">
              <span className="ink2">ชื่อ</span>
              <input className="field mt-0.5" value={e.name} onChange={(ev) => edit(e.id, { name: ev.target.value })} />
            </label>
            <label className="block text-xs">
              <span className="ink2">หน้าที่</span>
              <select className="field mt-0.5" value={e.role} onChange={(ev) => edit(e.id, { role: ev.target.value as Role })}>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <NumField label="ค่าแรง/วัน" value={e.wage} step={10} onChange={(v) => edit(e.id, { wage: v })} />
            <button
              className="btn btn-sm btn-danger mb-0.5"
              onClick={() => st.mutate((x) => void (x.employees = x.employees.filter((y) => y.id !== e.id)))}
            >
              ลบ
            </button>
          </div>
        ))}
        <button className="btn btn-primary w-full" onClick={() => st.mutate((x) => void addEmployee(x, { name: `พนักงาน ${x.employees.length + 1}`, role: 'farm', wage: 400 }))}>
          ➕ เพิ่มพนักงาน
        </button>
      </div>
    </>
  );
}

function DataSection({ sim }: { sim: SimState }) {
  const st = useSimStore.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [startDate, setStartDate] = useState(sim.settings.startDate);
  return (
    <>
      <H>ส่งออก / นำเข้า ค่าตั้ง</H>
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={() => downloadText('egg-farm-settings.json', JSON.stringify(sim.settings, null, 2), 'application/json')}>
          ⬇️ ส่งออกค่าตั้ง (JSON)
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          ⬆️ นำเข้าค่าตั้ง
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const parsed = JSON.parse(await file.text());
              st.mutate((x) => void (x.settings = { ...structuredClone(DEFAULT_SETTINGS), ...x.settings, ...parsed }));
              alert('นำเข้าค่าตั้งเรียบร้อย');
            } catch {
              alert('ไฟล์ไม่ถูกต้อง');
            }
            e.target.value = '';
          }}
        />
        <button className="btn" onClick={() => downloadText('egg-farm-save.json', JSON.stringify(sim), 'application/json')}>
          ⬇️ ส่งออกข้อมูลจำลองทั้งหมด
        </button>
      </div>
      <H>เริ่มจำลองใหม่</H>
      <div className="muted mb-2 text-[11px]">ข้อมูลจำลองบันทึกอัตโนมัติในเบราว์เซอร์ทุก 5 วินาที</div>
      <div className="flex flex-wrap gap-2">
        <label className="block text-xs">
          <span className="ink2">วันที่เริ่มจำลอง (มีผลเมื่อเริ่มใหม่)</span>
          <input className="field mt-0.5" type="date" value={startDate} onChange={(e) => e.target.value && setStartDate(e.target.value)} />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn btn-danger" onClick={() => confirm('เริ่มจำลองใหม่ด้วยค่าตั้งปัจจุบัน? ข้อมูลเดิมจะหายทั้งหมด') && st.reset(
              { ...sim.settings, startDate },
              {
                houses: [{ hens: sim.settings.defaultHensPerHouse, ageWeeks: 24 }],
                employees: sim.employees.map(({ name, role, wage }) => ({ name, role, wage })),
              },
            )}>
          🔄 เริ่มใหม่ (ใช้ค่าตั้งปัจจุบัน)
        </button>
        <button className="btn btn-danger" onClick={() => confirm('เริ่มใหม่ด้วยค่าเริ่มต้นทั้งหมด?') && st.reset({ ...DEFAULT_SETTINGS, startDate })}>
          ↺ คืนค่าเริ่มต้นทั้งหมด
        </button>
        <button className="btn" onClick={() => (saveSim(), alert('บันทึกแล้ว'))}>
          💾 บันทึกตอนนี้
        </button>
      </div>
    </>
  );
}
