import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { RefreshCw, TrendingUp, ClipboardCheck } from 'lucide-react';
import { usePOS } from '../../../context/POSContext';
import { PerformanceController } from '../../../controllers/PerformanceController';
import { PerformanceObservation, roleLabel } from '../../../models/types';
import { EmployeePerformanceSummary, MetricKey } from '../../../models/performance';
import {
  AdvisoryBanner, PeriodPicker, PeriodKey, periodRange, ObservationList, AddObservationButton, pct,
} from './performanceUi';

/** HR dashboard → Performance: team indicators + the AI observation review queue. */
export function PerformanceView() {
  const { currentUser } = usePOS();
  const navigate = useNavigate();
  const branchId = currentUser?.branchId ?? 'branch-1';
  const reviewer = currentUser ? { id: currentUser.id, role: currentUser.role } : undefined;

  const [period, setPeriod] = useState<PeriodKey>('this-month');
  const [team, setTeam] = useState<EmployeePerformanceSummary[]>([]);
  const [queue, setQueue] = useState<PerformanceObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [t, q] = await Promise.all([
      PerformanceController.getTeamPerformance(branchId, periodRange(period)),
      PerformanceController.listObservations({ branchId, status: 'pending' }),
    ]);
    if (t.success === false) setError(t.error); else setTeam(t.data);
    if (q.success === false) { const msg = q.error; setError(prev => prev || msg); } else setQueue(q.data);
    setLoading(false);
  }, [branchId, period]);

  useEffect(() => { load(); }, [load]);

  const employees = useMemo(() => team.map(t => t.employee), [team]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="size-5 text-amber-500" /> Performance
          </h1>
          <p className="text-sm text-gray-500">Indicators built from attendance, POS activity and reviewed observations.</p>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} />
        <button onClick={load} className="p-2 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50" aria-label="Refresh">
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <AddObservationButton employees={employees} reviewer={reviewer} onSaved={load} />
      </div>

      <AdvisoryBanner />

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* ── Review queue ── */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
          <ClipboardCheck className="size-4 text-amber-500" />
          Awaiting review <span className="text-gray-400 font-medium">({queue.length})</span>
        </h2>
        <ObservationList
          observations={queue}
          employees={employees}
          reviewer={reviewer}
          onChanged={load}
          emptyMessage="Nothing to review. New AI camera observations will appear here."
        />
      </section>

      {/* ── Team indicators ── */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Employee', 'Days present', 'Punctuality', 'Orders / tables', 'Payments', 'Feedback', 'Evaluation', 'Pending'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {!loading && team.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">No active employees in this branch.</td></tr>
              )}
              {team.map(s => <TeamRow key={s.employee.employeeId} s={s} onOpen={() => navigate(`/workforce/employees/${s.employee.employeeId}`)} />)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TeamRow({ s, onOpen }: { s: EmployeePerformanceSummary; onOpen: () => void }) {
  const has = (m: MetricKey) => s.metrics.includes(m);
  const na = <span className="text-gray-300">n/a</span>;
  const notLinked = <span className="text-xs text-gray-400" title="No POS login is linked to this employee">not linked</span>;
  const o = s.observations;
  return (
    <tr className="hover:bg-gray-50 cursor-pointer" onClick={onOpen}>
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-gray-900">{s.employee.fullName}</p>
        <p className="text-xs text-gray-500">{roleLabel(s.employee.role)} · {s.employee.employeeNumber ?? s.employee.employeeId}</p>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">{s.attendance.daysPresent}</td>
      <td className="px-4 py-3 text-sm text-gray-700">
        {pct(s.attendance.punctualityRate)}
        {s.attendance.lateArrivals > 0 && <span className="text-xs text-amber-600 ml-1">({s.attendance.lateArrivals} late)</span>}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">
        {!has('ordersHandled') ? na : !s.posLinked ? notLinked : `${s.orders.ordersHandled} / ${s.orders.tablesServed}`}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">
        {!has('paymentsProcessed') ? na : !s.posLinked ? notLinked : s.paymentsProcessed}
      </td>
      <td className="px-4 py-3 text-sm">
        {!has('customerFeedback') ? na : (
          <>
            <span className="text-emerald-600">+{o.compliments}</span>
            <span className="text-gray-300 mx-1">/</span>
            <span className="text-red-600">−{o.complaints}</span>
          </>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">
        {o.avgEvaluation === null ? '—' : `${o.avgEvaluation}/5`}
      </td>
      <td className="px-4 py-3 text-sm">
        {o.pending > 0 ? <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">{o.pending}</span> : <span className="text-gray-300">0</span>}
      </td>
    </tr>
  );
}
