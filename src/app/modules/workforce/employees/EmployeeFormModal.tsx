import { useState } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { WorkforceController } from '../../../controllers/WorkforceController';
import { Employee, CreateEmployeeInput, UserRole } from '../../../models/types';

const ROLES: { value: Exclude<UserRole, 'admin'>; label: string }[] = [
  { value: 'cashier', label: 'Cashier' },
  { value: 'waiter',  label: 'Waiter' },
  { value: 'kitchen', label: 'Kitchen Staff' },
  { value: 'hr',      label: 'HR' },
];

interface Props {
  initial?: Employee;
  branchId: string;
  onSave: (employee: Employee) => void;
  onClose: () => void;
}

export function EmployeeFormModal({ initial, branchId, onSave, onClose }: Props) {
  const isEdit = !!initial;

  const [form, setForm] = useState<CreateEmployeeInput>({
    fullName:      initial?.fullName  ?? '',
    email:         initial?.email     ?? '',
    phone:         initial?.phone     ?? '',
    role:          (initial?.role as Exclude<UserRole, 'admin'>) ?? 'waiter',
    pin:           '',
    monthlySalary: initial?.monthlySalary ?? 0,
    shiftStart:    initial?.shiftStart ?? '09:00',
    shiftEnd:      initial?.shiftEnd   ?? '18:00',
    hireDate:      initial?.hireDate   ?? new Date().toISOString().split('T')[0],
    branchId,
    notes:         initial?.notes ?? '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const set = (key: keyof CreateEmployeeInput, value: any) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!form.fullName.trim())  { setError('Full name is required'); return; }
    if (!form.email.trim())     { setError('Email is required'); return; }
    if (!isEdit && !form.pin.trim()) { setError('PIN is required'); return; }
    if (!isEdit && form.pin.length < 4) { setError('PIN must be at least 4 digits'); return; }

    setLoading(true);
    setError('');

    try {
      if (isEdit && initial) {
        const result = await WorkforceController.updateEmployee(initial.employeeId, form);
        if (!result.success) { setError(result.error); return; }
        onSave(result.data);
      } else {
        const result = await WorkforceController.createEmployee(form);
        if (!result.success) { setError(result.error); return; }
        onSave(result.data);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">
              {isEdit ? 'Edit Employee' : 'Add Employee'}
            </h2>
            {!isEdit && (
              <p className="text-xs text-gray-500 mt-0.5">
                Creates a POS login account and HR record automatically.
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="size-5 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">

            {/* Full Name */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Full Name *</label>
              <input
                type="text"
                value={form.fullName}
                onChange={e => set('fullName', e.target.value)}
                placeholder="e.g. Ahmed Al-Salem"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="ahmed@restaurant.com"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
              <input
                type="tel"
                value={form.phone ?? ''}
                onChange={e => set('phone', e.target.value)}
                placeholder="+966 50 000 0000"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Role *</label>
              <select
                value={form.role}
                onChange={e => set('role', e.target.value as Exclude<UserRole, 'admin'>)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              >
                {ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* PIN (only on create) */}
            {!isEdit && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">PIN * (4–6 digits)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={form.pin}
                  onChange={e => set('pin', e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            )}

            {/* Monthly Salary */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Monthly Salary</label>
              <input
                type="number"
                min={0}
                value={form.monthlySalary}
                onChange={e => set('monthlySalary', Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Hire Date */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Hire Date</label>
              <input
                type="date"
                value={form.hireDate}
                onChange={e => set('hireDate', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Shift Start */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Shift Start</label>
              <input
                type="time"
                value={form.shiftStart}
                onChange={e => set('shiftStart', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Shift End */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Shift End</label>
              <input
                type="time"
                value={form.shiftEnd}
                onChange={e => set('shiftEnd', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Notes */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
              <textarea
                value={form.notes ?? ''}
                onChange={e => set('notes', e.target.value)}
                rows={2}
                placeholder="Optional notes about this employee"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-5 py-2 text-sm rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Employee'}
          </button>
        </div>
      </div>
    </div>
  );
}
