import { useMemo, useState } from 'react';

export type Period = 'today' | 'week' | 'month' | 'custom';

/** [from, to) in local time for a period button; custom dates are inclusive days. */
export function periodRange(period: Period, customFrom: string, customTo: string): { from: Date; to: Date } {
  const now = new Date();
  if (period === 'today') {
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    const to = new Date(from); to.setDate(to.getDate() + 1);
    return { from, to };
  }
  if (period === 'week') {
    const from = new Date(now); from.setDate(from.getDate() - 7); from.setHours(0, 0, 0, 0);
    const to = new Date(now); to.setDate(to.getDate() + 1); to.setHours(0, 0, 0, 0);
    return { from, to };
  }
  if (period === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { from, to };
  }
  const from = customFrom ? new Date(customFrom + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = customTo ? new Date(customTo + 'T23:59:59.999') : now;
  return { from, to };
}

export function usePeriod(initial: Period = 'today') {
  const [period, setPeriod] = useState<Period>(initial);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const range = useMemo(() => periodRange(period, customFrom, customTo), [period, customFrom, customTo]);
  return { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, range };
}

const LABEL: Record<Period, string> = { today: 'Today', week: 'Last 7 Days', month: 'This Month', custom: 'Custom' };

/** Period buttons (+ date inputs for Custom), shared by Reports and Accounting. */
export function PeriodPicker({ p }: { p: ReturnType<typeof usePeriod> }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Period">
        {(Object.keys(LABEL) as Period[]).map(k => (
          <button
            key={k}
            onClick={() => p.setPeriod(k)}
            aria-pressed={p.period === k}
            className={`min-h-11 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
              p.period === k ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {LABEL[k]}
          </button>
        ))}
      </div>
      {p.period === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" aria-label="From date" value={p.customFrom} onChange={e => p.setCustomFrom(e.target.value)}
            className="min-h-11 min-w-0 flex-1 sm:flex-none border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <span className="text-gray-500 text-sm">to</span>
          <input type="date" aria-label="To date" value={p.customTo} onChange={e => p.setCustomTo(e.target.value)}
            className="min-h-11 min-w-0 flex-1 sm:flex-none border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      )}
    </div>
  );
}
