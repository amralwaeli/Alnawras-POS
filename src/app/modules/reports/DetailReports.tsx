import { useEffect, useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { fmt } from '../../../lib/currency';
import { downloadCsv } from '../../../lib/csv';
import { friendlyError } from '../../../lib/errors';
import { ReportsController } from '../../controllers/ReportsController';
import { usePeriod, PeriodPicker } from './period';

/** The detailed report sections (migration 0047), one tab each, sharing this loader. */
function useDetail(branchId: string) {
  const p = usePeriod('today');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ReportsController.getDetailReport(branchId, p.range.from, p.range.to).then(res => {
      if (cancelled) return;
      if (res.success) { setData(res.data); setError(''); } else setError(friendlyError(res.error, 'Could not load the report'));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [branchId, p.range]);
  return { p, data, loading, error };
}

const day = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true });
const where = (r: any) => r.type === 'takeaway' ? `Takeaway${r.bill ? ` #${r.bill}` : ''}` : r.type === 'pickup' ? `Pickup${r.bill ? ` #${r.bill}` : ''}` : `Table ${r.table}`;
const stamp = () => new Date().toISOString().slice(0, 10);

interface Col { label: string; get: (r: any) => ReactNode; csv?: (r: any) => unknown; right?: boolean }

/** A titled table with a CSV download; long names wrap, wide tables scroll sideways on phones. */
export function Table({ title, note, cols, rows, file, empty = 'Nothing in this period' }: {
  title: string; note?: string; cols: Col[]; rows: any[]; file: string; empty?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-gray-100">
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          {note && <p className="text-xs text-gray-500 mt-0.5">{note}</p>}
        </div>
        <button onClick={() => downloadCsv(`${file}-${stamp()}.csv`, [cols.map(c => c.label), ...rows.map(r => cols.map(c => (c.csv ?? c.get)(r)))])}
          disabled={!rows.length}
          className="min-h-10 inline-flex items-center gap-1.5 px-3 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
          <Download className="size-3.5" /> CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr className="bg-gray-50 text-left">
              {cols.map(c => <th key={c.label} className={`px-4 sm:px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${c.right ? 'text-right' : ''}`}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {cols.map(c => <td key={c.label} dir="auto" className={`px-4 sm:px-5 py-2.5 text-sm text-gray-800 ${c.right ? 'text-right whitespace-nowrap font-semibold' : 'break-words'}`}>{c.get(r)}</td>)}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={cols.length} className="px-5 py-10 text-center text-sm text-gray-500">{empty}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Shell({ d, children }: { d: ReturnType<typeof useDetail>; children: ReactNode }) {
  return (
    <div className="space-y-5">
      <PeriodPicker p={d.p} />
      {d.error && <p className="text-sm text-red-600" role="alert">{d.error}</p>}
      <div className={`space-y-5 ${d.loading ? 'opacity-50' : ''}`}>{d.data && children}</div>
    </div>
  );
}

function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 min-w-0">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-0.5 break-words ${tone}`}>{value}</p>
    </div>
  );
}

/** Horizontal bars (share of the biggest value) for quick reading. */
function Bars({ rows, label, value, format }: { rows: any[]; label: (r: any) => string; value: (r: any) => number; format: (n: number) => string }) {
  const max = Math.max(1, ...rows.map(value));
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[6rem_1fr_auto] sm:grid-cols-[9rem_1fr_auto] items-center gap-2 text-sm">
          <span className="truncate text-gray-600" dir="auto">{label(r)}</span>
          <div className="h-3 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-orange-500" style={{ width: `${(value(r) / max) * 100}%` }} /></div>
          <span className="font-semibold text-gray-800 whitespace-nowrap">{format(value(r))}</span>
        </div>
      ))}
      {!rows.length && <p className="text-sm text-gray-500 text-center py-6">Nothing in this period</p>}
    </div>
  );
}

const n = Number;

export function CategoriesTab({ branchId }: { branchId: string }) {
  const d = useDetail(branchId);
  const rows = d.data?.by_category ?? [];
  return (
    <Shell d={d}>
      <Bars rows={rows} label={r => r.category} value={r => n(r.revenue)} format={fmt} />
      <Table title="Sales by category" note="Item sales before tax and discounts" file="sales-by-category" rows={rows} cols={[
        { label: 'Category', get: r => r.category },
        { label: 'Items sold', get: r => n(r.units), right: true },
        { label: 'Sales', get: r => fmt(n(r.revenue)), csv: r => n(r.revenue), right: true },
      ]} />
    </Shell>
  );
}

export function HoursTab({ branchId }: { branchId: string }) {
  const d = useDetail(branchId);
  const rows = d.data?.by_hour ?? [];
  const label = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? 'am' : 'pm'}`;
  const busiest = [...rows].sort((a, b) => n(b.orders) - n(a.orders))[0];
  return (
    <Shell d={d}>
      {busiest && <p className="text-sm text-gray-600">Busiest hour: <b>{label(n(busiest.hour))}</b> ({n(busiest.orders)} bills, {fmt(n(busiest.revenue))})</p>}
      <Bars rows={rows} label={r => label(n(r.hour))} value={r => n(r.revenue)} format={fmt} />
      <Table title="Sales by hour" note="When bills were paid" file="sales-by-hour" rows={rows} cols={[
        { label: 'Hour', get: r => label(n(r.hour)) },
        { label: 'Bills', get: r => n(r.orders), right: true },
        { label: 'Revenue', get: r => fmt(n(r.revenue)), csv: r => n(r.revenue), right: true },
        { label: 'Average bill', get: r => fmt(n(r.revenue) / Math.max(1, n(r.orders))), csv: r => (n(r.revenue) / Math.max(1, n(r.orders))).toFixed(2), right: true },
      ]} />
    </Shell>
  );
}

export function StaffTab({ branchId }: { branchId: string }) {
  const d = useDetail(branchId);
  return (
    <Shell d={d}>
      <Table title="Sales by waiter / staff" note="Items each person added to bills that were paid" file="sales-by-staff" rows={d.data?.by_waiter ?? []} cols={[
        { label: 'Staff', get: r => r.name },
        { label: 'Bills', get: r => n(r.bills), right: true },
        { label: 'Items', get: r => n(r.items), right: true },
        { label: 'Sales', get: r => fmt(n(r.revenue)), csv: r => n(r.revenue), right: true },
      ]} />
      <Table title="Payments taken by cashier" file="payments-by-cashier" rows={d.data?.by_cashier ?? []} cols={[
        { label: 'Cashier', get: r => r.name },
        { label: 'Payments', get: r => n(r.payments), right: true },
        { label: 'Amount', get: r => fmt(n(r.amount)), csv: r => n(r.amount), right: true },
      ]} />
    </Shell>
  );
}

export function TablesTab({ branchId }: { branchId: string }) {
  const d = useDetail(branchId);
  return (
    <Shell d={d}>
      <Table title="Sales by table" note="Dine-in bills paid" file="sales-by-table" rows={d.data?.by_table ?? []} cols={[
        { label: 'Table', get: r => `Table ${r.table}` },
        { label: 'Bills', get: r => n(r.bills), right: true },
        { label: 'Revenue', get: r => fmt(n(r.revenue)), csv: r => n(r.revenue), right: true },
        { label: 'Average bill', get: r => fmt(n(r.revenue) / Math.max(1, n(r.bills))), csv: r => (n(r.revenue) / Math.max(1, n(r.bills))).toFixed(2), right: true },
      ]} />
    </Shell>
  );
}

export function DiscountsTab({ branchId }: { branchId: string }) {
  const d = useDetail(branchId);
  const x = d.data?.discounts;
  return (
    <Shell d={d}>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Bills with a discount" value={n(x?.bills ?? 0)} />
        <Stat label="Total discount given" value={fmt(n(x?.total ?? 0))} tone="text-emerald-700" />
      </div>
      <Table title="Discounted bills" file="discounts" rows={x?.list ?? []} cols={[
        { label: 'Paid at', get: r => day(r.at) },
        { label: 'Bill', get: r => `#${r.bill ?? '—'}` },
        { label: 'Table / type', get: where },
        { label: 'Cashier', get: r => r.cashier ?? '—' },
        { label: 'Discount', get: r => fmt(n(r.discount)), csv: r => n(r.discount), right: true },
        { label: 'Bill total', get: r => fmt(n(r.total)), csv: r => n(r.total), right: true },
      ]} />
    </Shell>
  );
}

export function CancellationsTab({ branchId }: { branchId: string }) {
  const d = useDetail(branchId);
  const c = d.data?.cancellations;
  return (
    <Shell d={d}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Items cancelled" value={n(c?.units ?? 0)} tone="text-red-600" />
        <Stat label="Value cancelled" value={fmt(n(c?.value ?? 0))} tone="text-red-600" />
        <Stat label="Whole bills cancelled" value={n(c?.bills ?? 0)} />
        <Stat label="Value of those bills" value={fmt(n(c?.bills_value ?? 0))} />
      </div>
      <Table title="Cancelled items" note="Items cancelled after they were sent to the kitchen" file="cancelled-items" rows={c?.list ?? []} cols={[
        { label: 'When', get: r => day(r.at) },
        { label: 'Item', get: r => r.product },
        { label: 'Qty', get: r => n(r.units), right: true },
        { label: 'Value', get: r => fmt(n(r.value)), csv: r => n(r.value), right: true },
        { label: 'Table / type', get: where },
        { label: 'Ordered by', get: r => r.ordered_by ?? '—' },
        { label: 'Cancelled by', get: r => r.by ?? '—' },
        { label: 'Reason', get: r => r.reason ?? '—' },
      ]} />
      <div className="grid lg:grid-cols-2 gap-5">
        <Table title="Most cancelled items" file="cancelled-by-item" rows={c?.by_item ?? []} cols={[
          { label: 'Item', get: r => r.name },
          { label: 'Qty', get: r => n(r.units), right: true },
          { label: 'Value', get: r => fmt(n(r.value)), csv: r => n(r.value), right: true },
        ]} />
        <Table title="Cancellations by staff" file="cancelled-by-staff" rows={c?.by_staff ?? []} cols={[
          { label: 'Cancelled by', get: r => r.name },
          { label: 'Items', get: r => n(r.items), right: true },
          { label: 'Value', get: r => fmt(n(r.value)), csv: r => n(r.value), right: true },
        ]} />
      </div>
      <Table title="Cancelled bills" file="cancelled-bills" rows={c?.bill_list ?? []} cols={[
        { label: 'Opened', get: r => day(r.at) },
        { label: 'Bill', get: r => `#${r.bill ?? '—'}` },
        { label: 'Table / type', get: where },
        { label: 'Total', get: r => fmt(n(r.total)), csv: r => n(r.total), right: true },
      ]} />
      <Table title="Refunds" note={`${n(d.data?.refunds?.count ?? 0)} refunds · ${fmt(n(d.data?.refunds?.total ?? 0))}`} file="refunds" rows={d.data?.refunds?.list ?? []} cols={[
        { label: 'When', get: r => day(r.at) },
        { label: 'Bill', get: r => `#${r.bill ?? '—'}` },
        { label: 'Table / type', get: where },
        { label: 'Items', get: r => Array.isArray(r.items) ? r.items.join(', ') : (r.items ?? '—') },
        { label: 'Amount', get: r => fmt(n(r.amount)), csv: r => n(r.amount), right: true },
        { label: 'Method', get: r => String(r.method ?? '—').toUpperCase() },
        { label: 'By', get: r => r.by ?? '—' },
        { label: 'Reason', get: r => r.reason ?? '—' },
      ]} />
    </Shell>
  );
}
