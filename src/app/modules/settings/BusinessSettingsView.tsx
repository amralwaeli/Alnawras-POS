import { useEffect, useState } from 'react';
import { Percent, Tag, Plus, Trash2, Save, Loader2, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { usePOS } from '../../context/POSContext';
import { useBranch } from '../../context/BranchContext';
import { SettingsController } from '../../controllers/SettingsController';
import { BranchSettings, DiscountPreset, DEFAULT_BRANCH_SETTINGS } from '../../models/types';

const uid = () => `d-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export function BusinessSettingsView() {
  const { currentUser } = usePOS();
  const { reloadSettings } = useBranch();
  const [s, setS] = useState<BranchSettings>(DEFAULT_BRANCH_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!currentUser?.branchId) return;
    SettingsController.getSettings(currentUser.branchId).then(loaded => {
      setS(loaded);
      setLoading(false);
    });
  }, [currentUser?.branchId]);

  if (!currentUser) return null;

  const set = <K extends keyof BranchSettings>(key: K, value: BranchSettings[K]) =>
    setS(prev => ({ ...prev, [key]: value }));

  const addPreset = () =>
    setS(prev => ({ ...prev, discountPresets: [...prev.discountPresets, { id: uid(), label: '', type: 'percentage', value: 0 }] }));

  const updatePreset = (id: string, patch: Partial<DiscountPreset>) =>
    setS(prev => ({ ...prev, discountPresets: prev.discountPresets.map(p => p.id === id ? { ...p, ...patch } : p) }));

  const removePreset = (id: string) =>
    setS(prev => ({ ...prev, discountPresets: prev.discountPresets.filter(p => p.id !== id) }));

  const save = async () => {
    // Validate presets
    for (const p of s.discountPresets) {
      if (!p.label.trim()) { toast.error('Every discount needs a name'); return; }
      if (!(p.value > 0)) { toast.error(`"${p.label || 'Discount'}" needs a value above 0`); return; }
      if (p.type === 'percentage' && p.value > 100) { toast.error(`"${p.label}" percentage can't exceed 100%`); return; }
    }
    if (s.taxEnabled && !(s.taxRate >= 0)) { toast.error('Enter a valid tax rate'); return; }

    setSaving(true);
    const res = await SettingsController.saveSettings(currentUser.branchId, s);
    setSaving(false);
    if (res.success) { toast.success('Settings saved'); reloadSettings(); }
    else toast.error(res.error || 'Failed to save');
  };

  if (loading) {
    return <div className="h-full flex items-center justify-center bg-gray-50"><Loader2 className="size-8 text-gray-400 animate-spin" /></div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tax &amp; Discounts</h1>
          <p className="text-gray-500 text-sm mt-0.5">Set the tax and quick-discount buttons applied at payment.</p>
        </div>

        {/* ── Tax ── */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Receipt className="size-4 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Tax</h2>
          </div>
          <div className="p-5 space-y-4">
            <label className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Charge tax on bills</span>
              <input type="checkbox" checked={s.taxEnabled} onChange={e => set('taxEnabled', e.target.checked)}
                className="size-5 rounded border-gray-300 text-gray-900 focus:ring-gray-800" />
            </label>

            {s.taxEnabled && (
              <div className="space-y-4 pt-1">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Tax rate (%)</label>
                    <div className="relative">
                      <input type="number" min={0} step="0.01" value={s.taxRate}
                        onChange={e => set('taxRate', Number(e.target.value))}
                        className="w-full pl-3 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                      <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Label on receipt</label>
                    <input type="text" value={s.taxLabel} onChange={e => set('taxLabel', e.target.value)}
                      placeholder="Tax / SST / VAT"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => set('taxInclusive', false)}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-xs font-semibold ${!s.taxInclusive ? 'border-gray-900 bg-gray-50 text-gray-900' : 'border-gray-200 text-gray-500'}`}>
                    Add tax on top of prices
                  </button>
                  <button onClick={() => set('taxInclusive', true)}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-xs font-semibold ${s.taxInclusive ? 'border-gray-900 bg-gray-50 text-gray-900' : 'border-gray-200 text-gray-500'}`}>
                    Prices already include tax
                  </button>
                </div>
                <p className="text-xs text-gray-400">
                  {s.taxInclusive
                    ? 'Menu prices are treated as tax-inclusive; the receipt shows the tax portion within the total.'
                    : `Tax is added to the bill: a ${s.taxRate || 0}% line appears on top of the subtotal.`}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Quick discounts ── */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="size-4 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Quick Discounts</h2>
            </div>
            <button onClick={addPreset} className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900 px-2.5 py-1.5 rounded-lg hover:bg-gray-100">
              <Plus className="size-3.5" /> Add
            </button>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-xs text-gray-400 -mt-1">One-tap buttons the cashier can apply at payment (e.g. a 10% Student discount).</p>
            {s.discountPresets.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No quick discounts yet.</p>
            ) : s.discountPresets.map(p => (
              <div key={p.id} className="flex items-center gap-2">
                <input value={p.label} onChange={e => updatePreset(p.id, { label: e.target.value })} placeholder="Name (e.g. Student)"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                <select value={p.type} onChange={e => updatePreset(p.id, { type: e.target.value as DiscountPreset['type'] })}
                  className="w-28 px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
                  <option value="percentage">Percent %</option>
                  <option value="fixed">Fixed RM</option>
                </select>
                <input type="number" min={0} step="0.01" value={p.value} onChange={e => updatePreset(p.id, { value: Number(e.target.value) })}
                  className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                <button onClick={() => removePreset(p.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl font-semibold text-sm hover:bg-black disabled:opacity-50">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
