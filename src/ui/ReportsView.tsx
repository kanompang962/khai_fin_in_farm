import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GRADE_COLOR, GRADE_LABEL } from '../sim/grading';
import {
  EXPENSE_LABEL,
  flockCSV,
  INCOME_LABEL,
  summarize,
  summarizeFlocks,
  summaryCSV,
  type Period,
  type SummaryRow,
} from '../sim/ledger';
import { EXPENSE_CATS, GRADES, INCOME_CATS } from '../sim/types';
import { useSim, useSimStore } from '../state/useSimStore';
import { baht, compactBaht, downloadText, num, pct, thaiDate } from './format';

type View = Period | 'flock';
const VIEWS: { id: View; label: string }[] = [
  { id: 'day', label: 'รายวัน' },
  { id: 'month', label: 'รายเดือน' },
  { id: 'year', label: 'รายปี' },
  { id: 'flock', label: 'รายรุ่น (ไก่แต่ละรุ่น)' },
];
const DAY_RANGES = [
  { n: 14, label: '14 วัน' },
  { n: 30, label: '30 วัน' },
  { n: 90, label: '90 วัน' },
  { n: 365, label: '1 ปี' },
  { n: 0, label: 'ทั้งหมด' },
];

const C_INCOME = '#3987e5';
const C_EXPENSE = '#d95926';
const C_PROFIT = '#199e70';
const C_NEG = '#e66767';

const tooltipStyle = {
  contentStyle: { background: '#141c26', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 },
  labelStyle: { color: '#f0efec', fontWeight: 600 },
  itemStyle: { padding: 0 },
  cursor: { fill: 'rgba(255,255,255,0.05)' },
};

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl bg-white/[0.05] px-3 py-2">
      <div className="muted text-[11px]">{label}</div>
      <div className="num text-lg font-semibold" style={{ color: tone === 'good' ? '#3ecf6e' : tone === 'bad' ? C_NEG : undefined }}>
        {value}
      </div>
      {sub && <div className="ink2 num text-[11px]">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children, height = 240 }: { title: string; children: React.ReactElement; height?: number }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ReportsView() {
  const sim = useSim();
  const close = () => useSimStore.getState().set({ reportsOpen: false });
  const [view, setView] = useState<View>('month');
  const [includeToday, setIncludeToday] = useState(true);
  const [dayRange, setDayRange] = useState(30);

  // สร้าง array ใหม่ทุกครั้ง: sim ถูก mutate ในที่ จึงใช้ identity เป็น dependency ไม่ได้
  const records = includeToday ? [...sim.records, sim.today] : [...sim.records];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-2 sm:p-5" onClick={close}>
      <div className="panel flex h-full max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden !bg-[var(--panel-solid)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
          <div className="mr-2">
            <div className="font-semibold">📊 สรุปรายงาน — {sim.settings.farmName}</div>
            <div className="muted text-[11px]">
              {records.length ? `${thaiDate(records[0].date)} – ${thaiDate(records[records.length - 1].date)} · ${records.length} วัน` : 'ยังไม่มีข้อมูล'}
            </div>
          </div>
          <div className="flex gap-1 rounded-lg bg-black/25 p-1">
            {VIEWS.map((v) => (
              <button key={v.id} className={'tab whitespace-nowrap ' + (view === v.id ? 'tab-on' : '')} onClick={() => setView(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
          <label className="ink2 flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={includeToday} onChange={(e) => setIncludeToday(e.target.checked)} />
            รวมวันนี้ (ยังไม่จบวัน)
          </label>
          <button className="btn ml-auto" onClick={close}>
            ✕
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
          {view === 'flock' ? (
            <FlockReport records={records} />
          ) : (
            <PeriodReport records={records} period={view} dayRange={dayRange} setDayRange={setDayRange} />
          )}
        </div>
      </div>
    </div>
  );
}

function PeriodReport({
  records,
  period,
  dayRange,
  setDayRange,
}: {
  records: ReturnType<typeof useSim>['records'];
  period: Period;
  dayRange: number;
  setDayRange: (n: number) => void;
}) {
  const allRows = useMemo(() => summarize(records, period), [records, period]);
  const rows = period === 'day' && dayRange > 0 ? allRows.slice(-dayRange) : allRows;
  const tot = useMemo(() => sumRows(rows), [rows]);
  const chartData = rows.map((r) => ({
    label: period === 'day' ? thaiDate(r.key, { day: 'numeric', month: 'short' }) : r.label,
    รายรับ: Math.round(r.incomeTotal),
    รายจ่าย: Math.round(r.expenseTotal),
    กำไร: Math.round(r.profit),
    ...Object.fromEntries(GRADES.map((g) => [GRADE_LABEL[g], r.eggsByGrade[g]])),
  }));
  const expenseData = EXPENSE_CATS.map((c) => ({ name: EXPENSE_LABEL[c], value: Math.round(tot.expense[c]) }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const periodName = period === 'day' ? 'วัน' : period === 'month' ? 'เดือน' : 'ปี';

  if (!rows.length) return <div className="muted p-10 text-center">ยังไม่มีข้อมูล — ลองเดินเวลาหรือกด “ข้ามเวลา”</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {period === 'day' && (
          <div className="flex gap-1">
            {DAY_RANGES.map((r) => (
              <button key={r.n} className={'btn btn-sm ' + (dayRange === r.n ? 'btn-on' : '')} onClick={() => setDayRange(r.n)}>
                {r.label}
              </button>
            ))}
          </div>
        )}
        <span className="muted text-xs">
          {rows.length} {periodName} · {tot.days} วัน
        </span>
        <button className="btn btn-sm ml-auto" onClick={() => downloadText(`egg-farm-${period}.csv`, summaryCSV(rows))}>
          ⬇️ ดาวน์โหลด CSV
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <Tile label="ไข่ทั้งหมด" value={`${num(tot.eggs)} ฟอง`} sub={`เฉลี่ย ${num(tot.eggs / Math.max(1, tot.days))}/วัน`} />
        <Tile label="จำนวนไก่ (ล่าสุด)" value={`${num(tot.hensEnd)} ตัว`} sub={`ตาย ${num(tot.deaths)} ตัว`} />
        <Tile label="ไข่ที่ขาย" value={`${num(tot.eggsSold)} ฟอง`} sub={`แผง ${num(tot.traysSold)} · ฟอง ${num(tot.eggsSoldSingle)} · ลูกค้า ${num(tot.customers)}`} />
        <Tile label="รายรับ" value={compactBaht(tot.incomeTotal)} sub={baht(tot.incomeTotal)} />
        <Tile label="รายจ่าย" value={compactBaht(tot.expenseTotal)} sub={baht(tot.expenseTotal)} />
        <Tile label="กำไร" value={compactBaht(tot.profit)} sub={tot.incomeTotal ? `อัตรากำไร ${pct(tot.profit / tot.incomeTotal)}` : undefined} tone={tot.profit >= 0 ? 'good' : 'bad'} />
        <Tile label="ต้นทุนต่อฟอง" value={tot.eggs ? `${(tot.expenseTotal / tot.eggs).toFixed(2)} ฿` : '—'} sub={tot.eggsSold ? `ขายเฉลี่ย ${(tot.income.egg / tot.eggsSold).toFixed(2)} ฿/ฟอง` : undefined} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title={`รายรับ · รายจ่าย · กำไร ต่อ${periodName} (บาท)`}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 4, bottom: 0 }} barGap={2}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#383835' }} minTickGap={12} />
            <YAxis tickFormatter={(v) => compactBaht(v)} tickLine={false} axisLine={false} width={58} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => baht(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="#383835" />
            <Bar dataKey="รายรับ" fill={C_INCOME} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="รายจ่าย" fill={C_EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Line dataKey="กำไร" stroke={C_PROFIT} strokeWidth={2} dot={rows.length < 40 ? { r: 3, strokeWidth: 0, fill: C_PROFIT } : false} />
          </ComposedChart>
        </ChartCard>
        <ChartCard title={`จำนวนไข่แยกเบอร์ ต่อ${periodName} (ฟอง)`}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#383835' }} minTickGap={12} />
            <YAxis tickFormatter={(v) => num(v)} tickLine={false} axisLine={false} width={58} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => `${num(v)} ฟอง`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {GRADES.map((g, i) => (
              <Bar
                key={g}
                dataKey={GRADE_LABEL[g]}
                stackId="eggs"
                fill={GRADE_COLOR[g]}
                stroke="#141c26"
                strokeWidth={1}
                maxBarSize={28}
                radius={i === GRADES.length - 1 ? [4, 4, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
        <ChartCard title="สัดส่วนรายจ่ายรวม (บาท)" height={210}>
          <BarChart data={expenseData} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => compactBaht(v)} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" width={92} tickLine={false} axisLine={false} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => [`${baht(v)} (${pct(v / Math.max(1, tot.expenseTotal))})`, 'รายจ่าย']} />
            <Bar dataKey="value" fill={C_EXPENSE} radius={[0, 4, 4, 0]} maxBarSize={18} />
          </BarChart>
        </ChartCard>
        <div className="rounded-xl bg-white/[0.03] p-3 text-xs">
          <div className="mb-2 text-sm font-semibold">รายละเอียดรวม</div>
          <div className="num grid grid-cols-2 gap-x-6 gap-y-0.5 sm:grid-cols-3">
            {INCOME_CATS.map((c) => (
              <Pair key={c} k={`รายรับ: ${INCOME_LABEL[c]}`} v={baht(tot.income[c])} />
            ))}
            {EXPENSE_CATS.map((c) => (
              <Pair key={c} k={`รายจ่าย: ${EXPENSE_LABEL[c]}`} v={baht(tot.expense[c])} />
            ))}
            <Pair k="อาหารที่ใช้" v={`${num(tot.feedKg)} กก.`} />
            <Pair k="มูลไก่ที่ขาย" v={`${num(tot.manureKg)} กก.`} />
            <Pair k="ไข่ที่ขายเป็นแผง" v={`${num(tot.traysSold)} แผง`} />
            <Pair k="ไข่ที่ขายเป็นฟอง" v={`${num(tot.eggsSoldSingle)} ฟอง`} />
            <Pair k="ไข่ไม่พอขาย" v={`${num(tot.lostEggs)} ฟอง`} />
            <Pair k="ไข่ที่ทิ้ง (ค้างนาน)" v={`${num(tot.eggsWasted)} ฟอง`} />
            {GRADES.map((g) => (
              <Pair key={g} k={`ไข่${GRADE_LABEL[g]}`} v={`${num(tot.eggsByGrade[g])} ฟอง`} />
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white/[0.03]">
        <table className="num w-full min-w-[820px] text-xs">
          <thead>
            <tr className="muted border-b border-white/10 text-[11px]">
              {['ช่วงเวลา', 'ไก่ (ตัว)', 'ไข่ (ฟอง)', 'ขาย (ฟอง)', 'ลูกค้า', 'อาหาร (กก.)', 'รายรับ', 'รายจ่าย', 'กำไร'].map((h, i) => (
                <th key={h} className={'px-3 py-2 font-normal ' + (i ? 'text-right' : 'text-left')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows
              .slice()
              .reverse()
              .map((r) => (
                <tr key={r.key} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="px-3 py-1.5">{period === 'day' ? thaiDate(r.key, { day: 'numeric', month: 'short', year: '2-digit' }) : r.label}</td>
                  <td className="px-3 text-right">{num(r.hensEnd)}</td>
                  <td className="px-3 text-right">{num(r.eggs)}</td>
                  <td className="px-3 text-right">{num(r.eggsSold)}</td>
                  <td className="px-3 text-right">{num(r.customers)}</td>
                  <td className="px-3 text-right">{num(r.feedKg)}</td>
                  <td className="px-3 text-right">{baht(r.incomeTotal)}</td>
                  <td className="px-3 text-right">{baht(r.expenseTotal)}</td>
                  <td className="px-3 text-right font-semibold" style={{ color: r.profit >= 0 ? '#3ecf6e' : C_NEG }}>
                    {baht(r.profit)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-white/5 py-0.5">
      <span className="muted">{k}</span>
      <span>{v}</span>
    </div>
  );
}

function sumRows(rows: SummaryRow[]) {
  const t = {
    days: 0,
    eggs: 0,
    hensEnd: rows.length ? rows[rows.length - 1].hensEnd : 0,
    deaths: 0,
    eggsSold: 0,
    traysSold: 0,
    eggsSoldSingle: 0,
    eggsWasted: 0,
    lostEggs: 0,
    customers: 0,
    feedKg: 0,
    manureKg: 0,
    incomeTotal: 0,
    expenseTotal: 0,
    profit: 0,
    income: Object.fromEntries(INCOME_CATS.map((c) => [c, 0])) as SummaryRow['income'],
    expense: Object.fromEntries(EXPENSE_CATS.map((c) => [c, 0])) as SummaryRow['expense'],
    eggsByGrade: Object.fromEntries(GRADES.map((g) => [g, 0])) as SummaryRow['eggsByGrade'],
  };
  for (const r of rows) {
    t.days += r.days;
    t.eggs += r.eggs;
    t.deaths += r.deaths;
    t.eggsSold += r.eggsSold;
    t.traysSold += r.traysSold;
    t.eggsSoldSingle += r.eggsSoldSingle;
    t.eggsWasted += r.eggsWasted;
    t.lostEggs += r.lostEggs;
    t.customers += r.customers;
    t.feedKg += r.feedKg;
    t.manureKg += r.manureKg;
    t.incomeTotal += r.incomeTotal;
    t.expenseTotal += r.expenseTotal;
    for (const c of INCOME_CATS) t.income[c] += r.income[c];
    for (const c of EXPENSE_CATS) t.expense[c] += r.expense[c];
    for (const g of GRADES) t.eggsByGrade[g] += r.eggsByGrade[g];
  }
  t.profit = t.incomeTotal - t.expenseTotal;
  return t;
}

function FlockReport({ records }: { records: ReturnType<typeof useSim>['records'] }) {
  const sim = useSim();
  const rows = useMemo(() => summarizeFlocks(records, sim.flocks, sim.houses), [records, sim.flocks, sim.houses]);
  const data = rows.map((r) => ({ name: `${r.flock.name}`, กำไร: Math.round(r.profit) }));
  const dateOf = (day: number) => thaiDate(records.find((x) => x.day === day)?.date ?? sim.today.date, { day: 'numeric', month: 'short', year: '2-digit' });

  if (!rows.length) return <div className="muted p-10 text-center">ยังไม่มีไก่รุ่นใด</div>;
  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <span className="muted text-xs">
          {rows.length} รุ่น · กำลังเลี้ยง {rows.filter((r) => r.flock.active).length} รุ่น · ต้นทุนส่วนกลาง (ค่าแรง ขนส่ง แผง) ปันส่วนตามสัดส่วนไข่
        </span>
        <button className="btn btn-sm ml-auto" onClick={() => downloadText('egg-farm-flocks.csv', flockCSV(rows))}>
          ⬇️ ดาวน์โหลด CSV
        </button>
      </div>
      <ChartCard title="กำไรสะสมของแต่ละรุ่น (บาท)" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: '#383835' }} />
          <YAxis tickFormatter={(v) => compactBaht(v)} tickLine={false} axisLine={false} width={58} />
          <Tooltip {...tooltipStyle} formatter={(v: number) => baht(v)} />
          <ReferenceLine y={0} stroke="#555" />
          <Bar dataKey="กำไร" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.กำไร >= 0 ? C_INCOME : C_NEG} />
            ))}
          </Bar>
        </BarChart>
      </ChartCard>
      <div className="overflow-x-auto rounded-xl bg-white/[0.03]">
        <table className="num w-full min-w-[980px] text-xs">
          <thead>
            <tr className="muted border-b border-white/10 text-[11px]">
              {['รุ่น', 'โรงเรือน', 'สถานะ', 'เริ่ม', 'ไก่เริ่ม → ปัจจุบัน', 'วัน', 'ไข่ (ฟอง)', 'อัตราไข่เฉลี่ย', 'ไข่/แม่ไก่', 'อาหาร (กก.)', 'รายรับ', 'รายจ่าย', 'กำไร', 'ต้นทุน/ฟอง'].map((h, i) => (
                <th key={h} className={'px-2.5 py-2 font-normal ' + (i > 4 ? 'text-right' : 'text-left')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.flock.id} className="whitespace-nowrap border-b border-white/5 hover:bg-white/[0.03]">
                <td className="px-2.5 py-1.5 font-semibold">{r.flock.name}</td>
                <td className="px-2.5">{r.houseName}</td>
                <td className="px-2.5">{r.flock.active ? '🟢 กำลังเลี้ยง' : '⚪ ปลดแล้ว'}</td>
                <td className="px-2.5">
                  {dateOf(r.flock.startDay)}
                  <span className="muted"> ({r.flock.startAgeWeeks} สัปดาห์{r.flock.prepaid ? ', รุ่นตั้งต้น' : ''})</span>
                </td>
                <td className="px-2.5">
                  {num(r.flock.initialHens)} → {num(r.flock.hens)}
                </td>
                <td className="px-2.5 text-right">{num(r.days)}</td>
                <td className="px-2.5 text-right">{num(r.eggs)}</td>
                <td className="px-2.5 text-right">{pct(r.avgLayRate)}</td>
                <td className="px-2.5 text-right">{r.eggsPerHen.toFixed(0)}</td>
                <td className="px-2.5 text-right">{num(r.feedKg)}</td>
                <td className="px-2.5 text-right">{baht(r.income)}</td>
                <td className="px-2.5 text-right">{baht(r.expense)}</td>
                <td className="px-2.5 text-right font-semibold" style={{ color: r.profit >= 0 ? '#3ecf6e' : C_NEG }}>
                  {baht(r.profit)}
                </td>
                <td className="px-2.5 text-right">{r.eggs ? r.costPerEgg.toFixed(2) + ' ฿' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
