import { storeStock } from '../sim/engine';
import { GRADE_COLOR, GRADE_LABEL, sumGrades } from '../sim/grading';
import { EXPENSE_ICON, EXPENSE_LABEL, INCOME_ICON, INCOME_LABEL } from '../sim/ledger';
import { dayOf, fmtClock } from '../sim/schedule';
import { EXPENSE_CATS, GRADES, INCOME_CATS, type DailyRecord } from '../sim/types';
import { useSim, useSimStore } from '../state/useSimStore';
import { baht, num, pct, thaiDate } from './format';

const incomeOf = (r: DailyRecord) => INCOME_CATS.reduce((a, c) => a + r.income[c], 0);
const expenseOf = (r: DailyRecord) => EXPENSE_CATS.reduce((a, c) => a + r.expense[c], 0);

/** เทียบกับเมื่อวาน — `higherIsGood=false` สำหรับรายจ่าย */
function Delta({ cur, prev, money, higherIsGood = true }: { cur: number; prev?: number; money?: boolean; higherIsGood?: boolean }) {
  if (prev === undefined) return null;
  const d = cur - prev;
  if (Math.abs(d) < 0.5) return <span className="muted text-[11px]">เท่าเมื่อวาน</span>;
  const good = d > 0 === higherIsGood;
  return (
    <span className="num text-[11px]" style={{ color: good ? '#3ecf6e' : 'var(--bad)' }}>
      {d > 0 ? '▲' : '▼'} {money ? baht(Math.abs(d)) : num(Math.abs(d))} จากเมื่อวาน
    </span>
  );
}

function Tile({ label, value, children, tone }: { label: string; value: string; children?: React.ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl bg-white/[0.05] px-3 py-2">
      <div className="muted text-[11px]">{label}</div>
      <div className="num text-xl font-semibold leading-tight" style={{ color: tone === 'good' ? '#3ecf6e' : tone === 'bad' ? 'var(--bad)' : undefined }}>
        {value}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/5 py-0.5">
      <span className="muted">{k}</span>
      <span className={'num ' + (strong ? 'font-semibold' : '')}>{v}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 text-xs">
      <div className="mb-1.5 text-sm font-semibold">{title}</div>
      {children}
    </div>
  );
}

export function DaySummary({ day }: { day: number }) {
  const sim = useSim();
  const st = useSimStore.getState();
  const showDaySummary = useSimStore((s) => s.showDaySummary);
  const r = sim.records.find((x) => x.day === day);
  if (!r) return null;
  const prev = sim.records.find((x) => x.day === day - 1);

  const inc = incomeOf(r);
  const exp = expenseOf(r);
  const profit = inc - exp;
  const henDays = r.hens + r.deaths;
  let cumInc = 0;
  let cumExp = 0;
  for (const x of sim.records) {
    if (x.day > day) break;
    cumInc += incomeOf(x);
    cumExp += expenseOf(x);
  }
  const graded = sumGrades(r.eggsByGrade);
  const events = sim.log.filter((e) => dayOf(e.at) === day);
  const farmSales = sim.settings.salesMode === 'farm';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-2 sm:p-5">
      <div className="panel flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden !bg-[var(--panel-solid)]">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <div className="text-lg font-semibold">🌙 สรุปประจำวัน — วันที่ {day + 1}</div>
            <div className="ink2 text-xs">{thaiDate(r.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
          <button className="btn" onClick={st.closeDaySummary} title="ปิดและเริ่มวันใหม่ (Esc)">
            ✕
          </button>
        </div>

        <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Tile label="ไข่ที่เก็บได้" value={`${num(r.eggs)} ฟอง`}>
              <Delta cur={r.eggs} prev={prev?.eggs} />
            </Tile>
            <Tile label="ขายได้" value={`${num(r.eggsSold)} ฟอง`}>
              <Delta cur={r.eggsSold} prev={prev?.eggsSold} />
            </Tile>
            <Tile label="รายรับ" value={baht(inc)}>
              <Delta cur={inc} prev={prev && incomeOf(prev)} money />
            </Tile>
            <Tile label="รายจ่าย" value={baht(exp)}>
              <Delta cur={exp} prev={prev && expenseOf(prev)} money higherIsGood={false} />
            </Tile>
            <Tile label="กำไรวันนี้" value={baht(profit)} tone={profit >= 0 ? 'good' : 'bad'}>
              <Delta cur={profit} prev={prev && incomeOf(prev) - expenseOf(prev)} money />
            </Tile>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Section title="🐔 การผลิต">
              <Row k="จำนวนไก่" v={`${num(r.hens)} ตัว${r.deaths ? ` (ตาย ${r.deaths})` : ''}`} />
              <Row k="อัตราการไข่" v={henDays ? pct(r.eggs / henDays) : '—'} />
              <Row k="อาหารที่ให้" v={`${num(r.feedKg, 1)} กก. (${henDays ? num((r.feedKg * 1000) / henDays) : 0} ก./ตัว)`} />
              <Row k="แผงไข่ที่ใช้" v={`${num(r.traysPacked)} แผง`} />
              <Row k="เก็บมูลไก่" v={r.manureKg > 0 ? `${num(r.manureKg)} กก.` : 'ยังไม่ถึงรอบเก็บ'} />
              {graded > 0 && (
                <div className="mt-2">
                  <div className="muted mb-1">ไข่แยกเบอร์</div>
                  <div className="flex h-3 gap-[2px] overflow-hidden rounded">
                    {GRADES.map((g) =>
                      r.eggsByGrade[g] > 0 ? (
                        <div key={g} title={`${GRADE_LABEL[g]}: ${num(r.eggsByGrade[g])} ฟอง`} style={{ flex: r.eggsByGrade[g], background: GRADE_COLOR[g] }} />
                      ) : null,
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {GRADES.map((g) => (
                      <span key={g} className="ink2 num flex items-center gap-1">
                        <i className="inline-block h-2 w-2 rounded-sm" style={{ background: GRADE_COLOR[g] }} />
                        {GRADE_LABEL[g]} {num(r.eggsByGrade[g])}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            <Section title={farmSales ? '🏪 การขายที่ฟาร์ม' : '🏪 การขายหน้าร้าน'}>
              <Row k="ลูกค้า" v={`${num(r.customers)} คน`} />
              <Row k="ขายเป็นแผง" v={`${num(r.traysSold)} แผง`} />
              <Row k="ขายเป็นฟอง" v={`${num(r.eggsSoldSingle)} ฟอง`} />
              <Row k="ไข่ไม่พอขาย" v={`${num(r.lostEggs)} ฟอง`} />
              {r.eggsWasted > 0 && <Row k="ไข่ค้างนาน ทิ้ง" v={`${num(r.eggsWasted)} ฟอง`} />}
              {!farmSales && <Row k="ส่งไข่ด้วยรถ" v={`${num(r.traysShipped)} แผง (${r.trips} เที่ยว)`} />}
              <table className="num mt-2 w-full">
                <thead>
                  <tr className="muted">
                    <th className="text-left font-normal">เบอร์</th>
                    <th className="text-right font-normal">ผลิต</th>
                    <th className="text-right font-normal">ขาย</th>
                    <th className="text-right font-normal">คงเหลือ</th>
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
                      <td className="text-right">{num(r.eggsByGrade[g])}</td>
                      <td className="text-right">{num(r.eggsSoldByGrade[g])}</td>
                      <td className="text-right">{num(storeStock(sim, g))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="💰 รายรับ – รายจ่าย">
              {INCOME_CATS.map((c) => (
                <Row key={c} k={`${INCOME_ICON[c]} ${INCOME_LABEL[c]}`} v={`+${baht(r.income[c])}`} />
              ))}
              {EXPENSE_CATS.filter((c) => r.expense[c] > 0).map((c) => (
                <Row key={c} k={`${EXPENSE_ICON[c]} ${EXPENSE_LABEL[c]}`} v={`−${baht(r.expense[c])}`} />
              ))}
              <Row k="รายรับรวม" v={baht(inc)} strong />
              <Row k="รายจ่ายรวม" v={baht(exp)} strong />
              <div className="mt-1 flex justify-between text-sm font-semibold">
                <span>กำไรวันนี้</span>
                <span className="num" style={{ color: profit >= 0 ? '#3ecf6e' : 'var(--bad)' }}>
                  {baht(profit)}
                </span>
              </div>
              {(r.expense.reserve > 0 || r.reserveUsed > 0 || sim.expansion.reserve > 0) && (
                <div className="mt-2 rounded-lg bg-amber-400/10 p-2">
                  <Row k="🏦 เงินสำรองซื้อไก่ (คงเหลือ)" v={baht(sim.expansion.reserve)} />
                  {r.reserveUsed > 0 && <Row k="🐣 ใช้ซื้อไก่ขยายฟาร์มวันนี้" v={baht(r.reserveUsed)} />}
                </div>
              )}
              <div className="mt-2 rounded-lg bg-white/[0.04] p-2">
                <div className="muted mb-0.5">สะสมตั้งแต่เริ่ม ({day + 1} วัน)</div>
                <Row k="รายรับ" v={baht(cumInc)} />
                <Row k="รายจ่าย" v={baht(cumExp)} />
                <div className="flex justify-between font-semibold">
                  <span>กำไรสะสม</span>
                  <span className="num" style={{ color: cumInc - cumExp >= 0 ? '#3ecf6e' : 'var(--bad)' }}>
                    {baht(cumInc - cumExp)}
                  </span>
                </div>
              </div>
            </Section>

            <Section title="📝 เหตุการณ์วันนี้">
              <div className="scroll-thin max-h-56 space-y-0.5 overflow-y-auto">
                {events.map((e, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="muted num shrink-0">{fmtClock(e.at)}</span>
                    <span style={{ color: e.kind === 'money' ? '#7fdca0' : e.kind === 'warn' ? '#f2b37a' : 'var(--ink-2)' }}>{e.text}</span>
                  </div>
                ))}
                {!events.length && <div className="muted">ไม่มีเหตุการณ์</div>}
              </div>
            </Section>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3">
          <label className="ink2 flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={showDaySummary} onChange={(e) => st.setShowDaySummary(e.target.checked)} />
            แสดงสรุปนี้ทุกครั้งที่จบวัน
          </label>
          <div className="ml-auto flex gap-2">
            <button className="btn" onClick={() => st.set({ reportsOpen: true })}>
              📊 ดูรายงานทั้งหมด
            </button>
            <button className="btn btn-primary" onClick={st.closeDaySummary}>
              เริ่มวันใหม่ ▶
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
