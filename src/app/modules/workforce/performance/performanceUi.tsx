import { useState } from 'react';
import { CheckCircle, XCircle, UserCog, Camera, ShieldAlert, X, Plus } from 'lucide-react';
import {
  Employee, PerformanceObservation, ObservationCategory, ROLE_PERMISSIONS, UserRole,
} from '../../../models/types';
import {
  CATEGORY_LABELS, isCategoryRelevant, validateObservationDraft,
} from '../../../models/performance';
import { PerformanceController, PeriodRange, Reviewer } from '../../../controllers/PerformanceController';

// ─── Period ────────────────────────────────────────────────────────────────────
export type PeriodKey = 'this-month' | 'last-month' | 'last-30';

export function periodRange(key: PeriodKey, now = new Date()): PeriodRange {
  if (key === 'last-month') {
    return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0) };
  }
  if (key === 'last-30') {
    const from = new Date(now); from.setDate(from.getDate() - 29);
    return { from, to: now };
  }
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
}

export function PeriodPicker({ value, onChange }: { value: PeriodKey; onChange: (k: PeriodKey) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as PeriodKey)}
      className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white text-gray-700"
      aria-label="Period"
    >
      <option value="this-month">This month</option>
      <option value="last-month">Last month</option>
      <option value="last-30">Last 30 days</option>
    </select>
  );
}

export const canReviewPerformance = (role?: string) =>
  !!role && !!ROLE_PERMISSIONS[role as UserRole]?.canManageStaff;

// ─── Advisory notice (shown wherever indicators appear) ────────────────────────
export function AdvisoryBanner() {
  return (
    <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-800">
      <ShieldAlert className="size-4 shrink-0 mt-0.5" />
      <p>
        Performance indicators are <strong>advisory</strong>. AI camera observations only count after a manager
        verifies them, and nothing here changes payroll or triggers disciplinary action automatically.
      </p>
    </div>
  );
}

// ─── Formatting ────────────────────────────────────────────────────────────────
export const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
const fmtDateTime = (d: Date) =>
  d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function formatMetric(o: PerformanceObservation): string | null {
  if (o.metricValue === undefined) return null;
  switch (o.metricUnit) {
    case 'seconds': return `${o.metricValue}s`;
    case 'minutes': return `${o.metricValue} min`;
    case 'rating': return `${o.metricValue}/5`;
    default: return String(o.metricValue);
  }
}

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  ai_cctv: { label: 'AI camera', cls: 'bg-purple-100 text-purple-700' },
  manager: { label: 'Manager', cls: 'bg-gray-100 text-gray-700' },
  customer: { label: 'Customer', cls: 'bg-teal-100 text-teal-700' },
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  verified: 'bg-emerald-100 text-emerald-700',
  corrected: 'bg-blue-100 text-blue-700',
  dismissed: 'bg-gray-100 text-gray-500',
};

function attributionReason(o: PerformanceObservation): string | undefined {
  const a = (o.evidence as any)?.attribution;
  return typeof a?.reason === 'string' ? a.reason : undefined;
}

function evidenceEntries(o: PerformanceObservation): [string, string][] {
  return Object.entries(o.evidence ?? {})
    .filter(([k]) => k !== 'attribution')
    .map(([k, v]) => [k.replace(/_/g, ' '), typeof v === 'object' ? JSON.stringify(v) : String(v)]);
}

// ─── Observation list with review actions ──────────────────────────────────────
export function ObservationList({
  observations, employees, reviewer, onChanged, emptyMessage,
}: {
  observations: PerformanceObservation[];
  /** Same-branch employees: used for names and the "assign / correct" picker. */
  employees: Employee[];
  reviewer?: Reviewer;
  onChanged: () => void;
  emptyMessage: string;
}) {
  const nameOf = (id?: string) => employees.find(e => e.employeeId === id)?.fullName ?? id;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const allowed = canReviewPerformance(reviewer?.role);

  const act = async (o: PerformanceObservation, action: 'verify' | 'correct' | 'dismiss') => {
    if (!reviewer) return;
    setBusy(o.id); setError('');
    const r = await PerformanceController.reviewObservation(o.id, {
      action, reviewer, note, correctedEmployeeId: action === 'correct' ? target : undefined,
    });
    setBusy(null);
    if (r.success === false) { setError(r.error); return; }
    setCorrecting(null); setTarget(''); setNote('');
    onChanged();
  };

  if (observations.length === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-700">{error}</div>}
      {observations.map(o => {
        const src = SOURCE_BADGE[o.source] ?? SOURCE_BADGE.manager;
        const metric = formatMetric(o);
        const reason = attributionReason(o);
        // Only offer people whose role this category is part of.
        const candidates = employees.filter(e => isCategoryRelevant(e.role, o.category));
        return (
          <div key={o.id} className="border border-gray-100 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-gray-900">{CATEGORY_LABELS[o.category]}</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${src.cls}`}>
                {o.source === 'ai_cctv' && <Camera className="inline size-3 mr-1 -mt-0.5" />}{src.label}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[o.reviewStatus]}`}>
                {o.reviewStatus}
              </span>
              {metric && <span className="text-xs font-medium text-gray-700">{metric}</span>}
              <span className="text-xs text-gray-400 ml-auto">{fmtDateTime(o.observedAt)}</span>
            </div>
            <p className="text-sm text-gray-700">{o.summary}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>
                Employee: {o.employeeId
                  ? <strong className="text-gray-800">{nameOf(o.employeeId)}</strong>
                  : <strong className="text-amber-700">Unattributed</strong>}
              </span>
              {o.originalEmployeeId && <span>AI originally: {nameOf(o.originalEmployeeId)}</span>}
              {o.confidence !== undefined && <span>Confidence: {Math.round(o.confidence * 100)}%</span>}
              {evidenceEntries(o).map(([k, v]) => <span key={k}>{k}: {v}</span>)}
            </div>
            {reason && o.reviewStatus === 'pending' && (
              <p className="mt-1 text-xs text-gray-400">Attribution: {reason}</p>
            )}
            {o.reviewNote && <p className="mt-1 text-xs text-gray-500 italic">Review note: {o.reviewNote}</p>}

            {allowed && o.reviewStatus === 'pending' && (
              <div className="mt-3 space-y-2">
                {correcting === o.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={target}
                      onChange={e => setTarget(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
                      aria-label="Correct employee"
                    >
                      <option value="">Select employee…</option>
                      {candidates.map(e => <option key={e.employeeId} value={e.employeeId}>{e.fullName} ({e.role})</option>)}
                    </select>
                    <input
                      value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)"
                      className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg flex-1 min-w-32"
                    />
                    <button disabled={!target || busy === o.id} onClick={() => act(o, 'correct')}
                      className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">Save</button>
                    <button onClick={() => { setCorrecting(null); setTarget(''); }}
                      className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600">Cancel</button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {o.employeeId && (
                      <button disabled={busy === o.id} onClick={() => act(o, 'verify')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                        <CheckCircle className="size-4" /> Verify
                      </button>
                    )}
                    <button disabled={busy === o.id} onClick={() => { setCorrecting(o.id); setNote(''); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                      <UserCog className="size-4" /> {o.employeeId ? 'Correct employee' : 'Assign employee'}
                    </button>
                    <button disabled={busy === o.id} onClick={() => act(o, 'dismiss')}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                      <XCircle className="size-4" /> Dismiss
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Add manager observation ───────────────────────────────────────────────────
const MANUAL_CATEGORIES: ObservationCategory[] = [
  'manager_evaluation', 'customer_compliment', 'customer_complaint',
  'service_response', 'table_attendance', 'table_cleaning', 'other',
];

export function AddObservationButton({
  employees, fixedEmployee, reviewer, onSaved,
}: {
  employees: Employee[];
  fixedEmployee?: Employee;
  reviewer?: Reviewer;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!canReviewPerformance(reviewer?.role)) return null;
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm bg-amber-500 text-white rounded-xl hover:bg-amber-600">
        <Plus className="size-4" /> Add observation
      </button>
      {open && (
        <AddObservationModal
          employees={employees} fixedEmployee={fixedEmployee} reviewer={reviewer!}
          onClose={() => setOpen(false)} onSaved={() => { setOpen(false); onSaved(); }}
        />
      )}
    </>
  );
}

function AddObservationModal({
  employees, fixedEmployee, reviewer, onClose, onSaved,
}: {
  employees: Employee[];
  fixedEmployee?: Employee;
  reviewer: Reviewer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(fixedEmployee?.employeeId ?? '');
  const employee = fixedEmployee ?? employees.find(e => e.employeeId === employeeId);
  const categories = employee ? MANUAL_CATEGORIES.filter(c => isCategoryRelevant(employee.role, c)) : MANUAL_CATEGORIES;
  const [category, setCategory] = useState<ObservationCategory>('manager_evaluation');
  const [value, setValue] = useState('');
  const [summary, setSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const needsValue = category === 'manager_evaluation' || category === 'service_response' || category === 'table_cleaning';
  const valueLabel = category === 'manager_evaluation' ? 'Rating (1–5)'
    : category === 'service_response' ? 'Response time (seconds)' : 'Turnaround (minutes)';

  const save = async () => {
    if (!employee) { setError('Choose an employee.'); return; }
    if (!categories.includes(category)) { setError('That category is not part of this employee\'s role.'); return; }
    const metricValue = needsValue && value !== '' ? Number(value) : undefined;
    const invalid = validateObservationDraft({ category, summary, metricValue });
    if (invalid) { setError(invalid); return; }
    setSaving(true); setError('');
    const r = await PerformanceController.recordObservation({
      employee,
      source: category === 'customer_complaint' || category === 'customer_compliment' ? 'customer' : 'manager',
      category, summary, metricValue, reviewer,
    });
    setSaving(false);
    if (r.success === false) { setError(r.error); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Add observation</h2>
          <button onClick={onClose} aria-label="Close"><X className="size-5 text-gray-400" /></button>
        </div>

        {!fixedEmployee && (
          <label className="block text-sm">
            <span className="text-gray-600">Employee</span>
            <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl">
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.employeeId} value={e.employeeId}>{e.fullName} ({e.role})</option>)}
            </select>
          </label>
        )}

        <label className="block text-sm">
          <span className="text-gray-600">Type</span>
          <select value={category} onChange={e => { setCategory(e.target.value as ObservationCategory); setValue(''); }}
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl">
            {categories.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </label>

        {needsValue && (
          <label className="block text-sm">
            <span className="text-gray-600">{valueLabel}</span>
            <input type="number" value={value} onChange={e => setValue(e.target.value)}
              min={category === 'manager_evaluation' ? 1 : 0} max={category === 'manager_evaluation' ? 5 : undefined}
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl" />
          </label>
        )}

        <label className="block text-sm">
          <span className="text-gray-600">Description</span>
          <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3}
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl" />
        </label>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-600">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm bg-amber-500 text-white rounded-xl disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
