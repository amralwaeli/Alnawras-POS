import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { usePOS } from '../../../context/POSContext';
import { PerformanceController } from '../../../controllers/PerformanceController';
import { WorkforceController } from '../../../controllers/WorkforceController';
import { Employee, PerformanceObservation } from '../../../models/types';
import { EmployeePerformanceSummary, TrendPoint, MetricKey, METRIC_LABELS } from '../../../models/performance';
import {
  AdvisoryBanner, PeriodPicker, PeriodKey, periodRange, ObservationList, AddObservationButton, pct,
} from './performanceUi';
import { friendlyError } from '../../../../lib/errors';

/** "Performance" tab inside the existing employee profile. */
export function EmployeePerformanceTab({ employee }: { employee: Employee }) {
  const { currentUser } = usePOS();
  const reviewer = currentUser ? { id: currentUser.id, role: currentUser.role } : undefined;
  const [period, setPeriod] = useState<PeriodKey>('this-month');
  const [summary, setSummary] = useState<EmployeePerformanceSummary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [observations, setObservations] = useState<PerformanceObservation[]>([]);
  const [branchEmployees, setBranchEmployees] = useState<Employee[]>([employee]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const r = await PerformanceController.getEmployeePerformance(employee, periodRange(period));
    if (r.success === false) setError(friendlyError(r.error));
    else { setSummary(r.data.summary); setTrend(r.data.trend); setObservations(r.data.observations); }
    setLoading(false);
  }, [employee, period]);

  useEffect(() => { load(); }, [load]);

  // Same-branch colleagues, for "correct employee" on a mis-attributed observation.
  useEffect(() => {
    WorkforceController.getEmployees({ status: 'active' }).then(r => {
      if (r.success) setBranchEmployees(r.data.filter(e => e.branchId === employee.branchId));
    });
  }, [employee.branchId]);

  if (loading && !summary) {
    return <div className="flex justify-center py-12"><RefreshCw className="size-5 text-amber-500 animate-spin" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-gray-500 flex-1 min-w-0">
          Only indicators relevant to the <strong>{employee.role}</strong> role are shown.
        </p>
        <PeriodPicker value={period} onChange={setPeriod} />
        <AddObservationButton employees={branchEmployees} fixedEmployee={employee} reviewer={reviewer} onSaved={load} />
      </div>

      <AdvisoryBanner />
      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

      {summary && <KpiGrid s={summary} />}

      {trend.length > 0 && <TrendTable trend={trend} showOrders={!!summary?.posLinked && summary.metrics.includes('ordersHandled')} />}

      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-3">Observations</h3>
        <ObservationList
          observations={observations}
          employees={branchEmployees}
          reviewer={reviewer}
          onChanged={load}
          emptyMessage="No observations in this period."
        />
      </div>
    </div>
  );
}

function KpiGrid({ s }: { s: EmployeePerformanceSummary }) {
  const o = s.observations;
  const posMissing = 'No POS login linked';
  const cards: { key: MetricKey; value: string; hint?: string }[] = [
    {
      key: 'attendance',
      value: `${s.attendance.daysPresent} days · ${pct(s.attendance.punctualityRate)} on time`,
      hint: s.attendance.lateArrivals ? `${s.attendance.lateArrivals} late (avg ${s.attendance.avgLateMinutes} min)` : undefined,
    },
    { key: 'ordersHandled', value: s.posLinked ? String(s.orders.ordersHandled) : '—', hint: s.posLinked ? undefined : posMissing },
    { key: 'itemsEntered', value: s.posLinked ? String(s.orders.itemsEntered) : '—', hint: s.posLinked ? undefined : posMissing },
    { key: 'tablesServed', value: s.posLinked ? String(s.orders.tablesServed) : '—', hint: s.posLinked ? 'Dine-in orders' : posMissing },
    { key: 'paymentsProcessed', value: s.posLinked ? String(s.paymentsProcessed) : '—', hint: s.posLinked ? undefined : posMissing },
    { key: 'serviceResponse', value: o.avgServiceResponseSec === null ? '—' : `${o.avgServiceResponseSec}s avg`, hint: 'Verified observations' },
    { key: 'tableVisits', value: String(o.tableVisits), hint: 'Verified observations' },
    { key: 'tableCleaning', value: o.avgTableCleaningMin === null ? '—' : `${o.avgTableCleaningMin} min avg`, hint: 'Verified observations' },
    { key: 'customerFeedback', value: `+${o.compliments} / −${o.complaints}`, hint: 'Compliments / complaints' },
    { key: 'managerEvaluation', value: o.avgEvaluation === null ? '—' : `${o.avgEvaluation}/5`, hint: o.evaluationCount ? `${o.evaluationCount} evaluation(s)` : undefined },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {cards.filter(c => s.metrics.includes(c.key)).map(c => (
        <div key={c.key} className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs text-gray-500">{METRIC_LABELS[c.key]}</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{c.value}</p>
          {c.hint && <p className="text-[11px] text-gray-400 mt-0.5">{c.hint}</p>}
        </div>
      ))}
      {o.pending > 0 && (
        <div className="bg-amber-50 rounded-xl p-4">
          <p className="text-xs text-amber-700">Awaiting review</p>
          <p className="text-lg font-bold text-amber-800 mt-1">{o.pending}</p>
          <p className="text-[11px] text-amber-600 mt-0.5">Not counted until verified</p>
        </div>
      )}
    </div>
  );
}

function TrendTable({ trend, showOrders }: { trend: TrendPoint[]; showOrders: boolean }) {
  const maxDays = Math.max(1, ...trend.map(t => t.daysPresent));
  return (
    <div className="overflow-x-auto">
      <h3 className="text-sm font-bold text-gray-900 mb-3">Weekly trend</h3>
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100">
            {['Week of', 'Days present', 'Late', ...(showOrders ? ['Orders'] : []), 'Compliments', 'Complaints'].map(h => (
              <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {trend.map(t => (
            <tr key={t.weekStart}>
              <td className="px-3 py-2 text-sm text-gray-900">{t.weekStart}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${(t.daysPresent / maxDays) * 100}%` }} />
                  </div>
                  <span className="text-sm text-gray-700">{t.daysPresent}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-sm text-amber-600">{t.lateArrivals || <span className="text-gray-300">0</span>}</td>
              {showOrders && <td className="px-3 py-2 text-sm text-gray-700">{t.ordersHandled}</td>}
              <td className="px-3 py-2 text-sm text-emerald-600">{t.compliments || <span className="text-gray-300">0</span>}</td>
              <td className="px-3 py-2 text-sm text-red-600">{t.complaints || <span className="text-gray-300">0</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
