import { useState, type ReactNode } from 'react';
import { expansionHenCost, flockOf, nextExpansionDay, storeStock, totalHens } from '../sim/engine';
import { GRADE_COLOR, GRADE_LABEL } from '../sim/grading';
import { EXPENSE_ICON, EXPENSE_LABEL, INCOME_ICON, INCOME_LABEL } from '../sim/ledger';
import { dateOfDay, dayOf, minuteOfDay, WINDOWS } from '../sim/schedule';
import { EXPENSE_CATS, GRADES, INCOME_CATS, type ExpenseCat, type SimState } from '../sim/types';
import { useSim } from '../state/useSimStore';
import { baht, compactBaht, num, thaiDate } from './format';

const C = {
  egg: '#f5b942',
  stock: '#7fb8ff',
  income: '#3ecf6e',
  expense: '#ff8a7a',
  people: '#c9a7ff',
};

function Card({ icon, title, color, right, children }: { icon: string; title: string; color?: string; right?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color }}>
          <span className="text-sm">{icon}</span>
          {title}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Big({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <div className="num text-lg font-semibold leading-tight" style={{ color }}>
      {children}
    </div>
  );
}

/** รายจ่ายที่จะคิดภายหลังในวันนี้ (ประมาณการ) */
function pendingExpenses(sim: SimState): Partial<Record<ExpenseCat, number>> {
  const s = sim.settings;
  const t = sim.today;
  const m = minuteOfDay(sim.time);
  const out: Partial<Record<ExpenseCat, number>> = {};
  const activeHouses = sim.houses.filter((h) => flockOf(sim, h)).length;
  if (m < WINDOWS.feed[0]) out.feed = ((totalHens(sim) * s.feedGramsPerHen) / 1000) * s.feedPricePerKg;
  if (t.expense.wage === 0) out.wage = sim.employees.reduce((a, e) => a + e.wage, 0);
  if (t.expense.utility === 0) out.utility = activeHouses * s.waterPowerPerHouseDay;
  const next = nextExpansionDay(sim);
  if (next !== null && t.expense.reserve === 0) {
    const need = expansionHenCost(s) - sim.expansion.reserve;
    if (need > 0) out.reserve = need / Math.max(1, next - dayOf(sim.time));
  }
  return out;
}

export function StatsPanel() {
  const sim = useSim();
  const [open, setOpen] = useState(() => window.innerWidth >= 768);
  const t = sim.today;
  const s = sim.settings;
  const farmSales = s.salesMode === 'farm';
  const inc = INCOME_CATS.reduce((a, c) => a + t.income[c], 0);
  const exp = EXPENSE_CATS.reduce((a, c) => a + t.expense[c], 0);
  const profit = inc - exp;
  let cumInc = inc;
  let cumExp = exp;
  for (const r of sim.records) {
    for (const c of INCOME_CATS) cumInc += r.income[c];
    for (const c of EXPENSE_CATS) cumExp += r.expense[c];
  }
  const pendingEggs = sim.houses.reduce((a, h) => a + h.pendingEggs, 0);
  const pending = pendingExpenses(sim);
  const pendingTotal = Object.values(pending).reduce((a, b) => a + (b ?? 0), 0);

  const stock = GRADES.map((g) => {
    const eggs = storeStock(sim, g);
    return { g, eggs, trays: Math.floor(eggs / s.traySize), rest: eggs % s.traySize };
  });
  const stockEggs = stock.reduce((a, x) => a + x.eggs, 0);
  const stockTrays = stock.reduce((a, x) => a + x.trays, 0);
  const stockRest = stock.reduce((a, x) => a + x.rest, 0);

  const nextEx = nextExpansionDay(sim);
  const exTarget = expansionHenCost(s);

  return (
    <div className="panel pointer-events-auto absolute left-2 top-[124px] z-20 flex max-h-[calc(100vh-300px)] w-[300px] max-w-[calc(100vw-16px)] flex-col p-2.5 sm:left-3 sm:top-[84px] md:max-h-[calc(100vh-270px)]">
      <button className="flex w-full items-center justify-between text-left text-sm font-semibold" onClick={() => setOpen(!open)}>
        <span>📈 ภาพรวมวันนี้</span>
        <span className="muted text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="scroll-thin mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5 text-xs">
          <div className="grid grid-cols-2 gap-1.5">
            <Card icon="🐔" title="ไก่ทั้งหมด">
              <Big>{num(totalHens(sim))} ตัว</Big>
              <div className="muted">{sim.houses.length} โรงเรือน</div>
            </Card>
            <Card icon="🥚" title="ไข่วันนี้" color={C.egg}>
              <Big color={C.egg}>{num(t.eggs || pendingEggs)} ฟอง</Big>
              <div className="muted">{t.eggs ? `เก็บแล้ว · ${num(t.traysPacked)} แผง` : pendingEggs ? 'ไก่กำลังออกไข่ รอเก็บ 09:00' : 'รอให้อาหาร 06:00'}</div>
            </Card>
          </div>

          <Card
            icon="🏪"
            title={farmSales ? 'ไข่วางขายหน้าฟาร์ม' : 'ไข่ในสต็อกหน้าร้าน'}
            color={C.stock}
            right={<span className="muted">ขายแล้ว {num(t.eggsSold)} ฟอง</span>}
          >
            <Big color={C.stock}>
              {num(stockTrays)} แผง {stockRest ? `+ ${num(stockRest)} ฟอง` : ''}
            </Big>
            <div className="muted mb-1">รวม {num(stockEggs)} ฟอง</div>
            {stockEggs > 0 ? (
              <table className="num w-full">
                <thead>
                  <tr className="muted text-[10.5px]">
                    <th className="text-left font-normal">เบอร์</th>
                    <th className="text-right font-normal">แผง</th>
                    <th className="text-right font-normal">+ฟอง</th>
                    <th className="text-right font-normal">รวม (ฟอง)</th>
                  </tr>
                </thead>
                <tbody>
                  {stock
                    .filter((x) => x.eggs > 0)
                    .map((x) => (
                      <tr key={x.g} className="border-t border-white/5">
                        <td className="py-0.5">
                          <span className="flex items-center gap-1.5">
                            <i className="inline-block h-2 w-2 rounded-sm" style={{ background: GRADE_COLOR[x.g] }} />
                            {GRADE_LABEL[x.g]}
                          </span>
                        </td>
                        <td className="text-right">{x.trays}</td>
                        <td className="text-right">{x.rest}</td>
                        <td className="text-right font-semibold">{num(x.eggs)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <div className="muted">ยังไม่มีไข่วางขาย — นำไข่มาวางตอน 13:00</div>
            )}
          </Card>

          <Card icon="👥" title="ลูกค้าวันนี้" color={C.people} right={<b className="num" style={{ color: C.people }}>{num(t.customers)} คน</b>}>
            <div className="ink2">
              ซื้อเป็นแผง {num(t.traysSold)} แผง · เป็นฟอง {num(t.eggsSoldSingle)} ฟอง
            </div>
            {t.lostEggs > 0 && <div style={{ color: '#f2b37a' }}>⚠️ ไข่ไม่พอขาย {num(t.lostEggs)} ฟอง</div>}
          </Card>

          <Card icon="💰" title="รายรับวันนี้" color={C.income} right={<b className="num text-sm" style={{ color: C.income }}>{baht(inc)}</b>}>
            {INCOME_CATS.map((c) => (
              <div key={c} className="num flex justify-between">
                <span className="ink2">
                  {INCOME_ICON[c]} {INCOME_LABEL[c]}
                </span>
                <span style={{ color: t.income[c] ? C.income : undefined }} className={t.income[c] ? '' : 'muted'}>
                  {baht(t.income[c])}
                </span>
              </div>
            ))}
          </Card>

          <Card icon="💸" title="รายจ่ายวันนี้" color={C.expense} right={<b className="num text-sm" style={{ color: C.expense }}>{baht(exp)}</b>}>
            {EXPENSE_CATS.filter((c) => t.expense[c] > 0 || pending[c]).map((c) => (
              <div key={c} className="num flex justify-between">
                <span className="ink2">
                  {EXPENSE_ICON[c]} {EXPENSE_LABEL[c]}
                </span>
                {t.expense[c] > 0 ? (
                  <span style={{ color: C.expense }}>{baht(t.expense[c])}</span>
                ) : (
                  <span className="muted" title="ยังไม่ได้จ่าย จะคิดภายหลังในวันนี้">
                    ⏳ ~{baht(pending[c] ?? 0)}
                  </span>
                )}
              </div>
            ))}
            {pendingTotal > 0 && <div className="muted mt-0.5 text-[10.5px]">⏳ = ยังไม่ได้จ่าย (ค่าแรง ค่าน้ำไฟ เงินสำรอง คิดตอนสิ้นวัน)</div>}
          </Card>

          <Card icon={profit >= 0 ? '📈' : '📉'} title="กำไรวันนี้ (ถึงตอนนี้)" color={profit >= 0 ? C.income : C.expense}>
            <Big color={profit >= 0 ? C.income : C.expense}>{baht(profit)}</Big>
            {pendingTotal > 0 && <div className="muted">คาดว่าจบวัน ~{baht(profit - pendingTotal)}</div>}
            <div className="num mt-1 flex justify-between border-t border-white/5 pt-1">
              <span className="muted">สะสม {sim.records.length + 1} วัน</span>
              <span style={{ color: C.income }}>+{compactBaht(cumInc)}</span>
              <span style={{ color: C.expense }}>−{compactBaht(cumExp)}</span>
              <b style={{ color: cumInc - cumExp >= 0 ? C.income : C.expense }}>{compactBaht(cumInc - cumExp)}</b>
            </div>
          </Card>

          {(s.autoExpand || sim.expansion.reserve > 0) && (
            <Card icon="🏗️" title="ขยายฟาร์มอัตโนมัติ" color="#e0a526">
              {nextEx !== null ? (
                <>
                  <div className="ink2">
                    รอบถัดไป {thaiDate(dateOfDay(s.startDate, nextEx), { day: 'numeric', month: 'short', year: '2-digit' })} (อีก {nextEx - dayOf(sim.time)} วัน)
                  </div>
                  <div className="ink2">
                    สร้างโรงเรือน + ไก่ {num(s.expandHens)} ตัว
                  </div>
                </>
              ) : (
                <div className="muted">{s.autoExpand ? `ครบ ${s.expandMaxHouses} โรงเรือนแล้ว` : 'ปิดอยู่'}</div>
              )}
              <div className="num mt-1 flex justify-between">
                <span className="muted">🏦 เงินสำรองซื้อไก่</span>
                <span>
                  {baht(sim.expansion.reserve)}
                  {nextEx !== null && <span className="muted"> / {baht(exTarget)}</span>}
                </span>
              </div>
              {nextEx !== null && (
                <div className="mt-1 h-1.5 overflow-hidden rounded bg-white/10">
                  <div className="h-full rounded" style={{ width: `${Math.min(100, (sim.expansion.reserve / Math.max(1, exTarget)) * 100)}%`, background: '#e0a526' }} />
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
