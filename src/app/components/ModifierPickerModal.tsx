import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { ModifierGroup, SelectedModifier } from '../models/types';

/**
 * Self-contained modal (plain overlay, no app providers) so it can be used
 * from both customer-facing ordering pages and the staff POS. Presents the
 * modifier groups linked to a product and returns the chosen options plus the
 * total add-on price. Single-choice groups are required (radio); multiple are
 * optional (checkbox). Defaults are pre-selected.
 */
export function ModifierPickerModal({
  productName,
  groups,
  currency = 'RM',
  onConfirm,
  onClose,
}: {
  productName: string;
  groups: ModifierGroup[];
  currency?: string;
  onConfirm: (selected: SelectedModifier[], extraPrice: number) => void;
  onClose: () => void;
}) {
  // selected option ids, keyed by group id
  const [selected, setSelected] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const g of groups) {
      const set = new Set<string>();
      const defaults = g.options.filter(o => o.isDefault);
      if (g.type === 'single') {
        const pick = defaults[0] ?? g.options[0];
        if (pick) set.add(pick.id);
      } else {
        for (const o of defaults) set.add(o.id);
      }
      init[g.id] = set;
    }
    return init;
  });

  const pickSingle = (groupId: string, optionId: string) =>
    setSelected(prev => ({ ...prev, [groupId]: new Set([optionId]) }));

  const toggleMulti = (groupId: string, optionId: string) =>
    setSelected(prev => {
      const next = new Set(prev[groupId] ?? []);
      next.has(optionId) ? next.delete(optionId) : next.add(optionId);
      return { ...prev, [groupId]: next };
    });

  const { chosen, extra } = useMemo(() => {
    const out: SelectedModifier[] = [];
    let sum = 0;
    for (const g of groups) {
      for (const o of g.options) {
        if (selected[g.id]?.has(o.id)) {
          out.push({ groupId: g.id, groupName: g.name, optionId: o.id, optionName: o.name, price: o.addOnPrice });
          sum += o.addOnPrice;
        }
      }
    }
    return { chosen: out, extra: sum };
  }, [groups, selected]);

  // single-choice groups must have a selection
  const missing = groups.filter(g => g.type === 'single' && !(selected[g.id]?.size));
  const canConfirm = missing.length === 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-black text-lg text-gray-900 truncate pr-2">{productName}</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100"><X className="size-5 text-gray-500" /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5 flex-1">
          {groups.map(g => (
            <div key={g.id}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-gray-800">{g.name}</span>
                <span className="text-xs font-semibold text-gray-400">
                  {g.type === 'single' ? 'Pick one' : 'Pick any'}
                </span>
              </div>
              <div className="space-y-1.5">
                {g.options.map(o => {
                  const isOn = !!selected[g.id]?.has(o.id);
                  return (
                    <label key={o.id}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer ${isOn ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}>
                      <input
                        type={g.type === 'single' ? 'radio' : 'checkbox'}
                        name={`grp-${g.id}`}
                        checked={isOn}
                        onChange={() => g.type === 'single' ? pickSingle(g.id, o.id) : toggleMulti(g.id, o.id)}
                        className="size-4 accent-orange-500"
                      />
                      <span className="flex-1 text-sm text-gray-800">{o.name}</span>
                      {o.addOnPrice > 0 && (
                        <span className="text-sm font-semibold text-gray-600">+{currency} {o.addOnPrice.toFixed(2)}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-4 border-t">
          {!canConfirm && (
            <p className="text-xs text-red-500 mb-2">Please choose: {missing.map(g => g.name).join(', ')}</p>
          )}
          <button
            disabled={!canConfirm}
            onClick={() => onConfirm(chosen, extra)}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-xl py-3"
          >
            Add{extra > 0 ? ` · +${currency} ${extra.toFixed(2)}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
