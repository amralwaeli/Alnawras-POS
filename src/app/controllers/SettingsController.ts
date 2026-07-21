import { supabase } from '../../lib/supabase';
import { BranchSettings, DEFAULT_BRANCH_SETTINGS } from '../models/types';
import { mapBranchSettings } from '../models/mappers';

/**
 * Per-branch business settings (tax + quick-discount presets) that the tenant's
 * own admin controls. Stored in `branch_settings` (migration 0020).
 */
export class SettingsController {
  /** Load a branch's settings. Falls back to safe defaults (tax off, no
   *  presets) if the row or table is absent, so the app runs unchanged before
   *  0020 is applied. */
  static async getSettings(branchId: string): Promise<BranchSettings> {
    try {
      const { data, error } = await supabase
        .from('branch_settings')
        .select('*')
        .eq('branch_id', branchId)
        .maybeSingle();
      if (error) {
        console.warn('[SettingsController] branch_settings lookup failed (migration 0020 applied?)', error.message);
        return { ...DEFAULT_BRANCH_SETTINGS };
      }
      return mapBranchSettings(data);
    } catch (err: any) {
      console.warn('[SettingsController] getSettings error — using defaults', err?.message);
      return { ...DEFAULT_BRANCH_SETTINGS };
    }
  }

  /** Upsert a branch's settings (tenant admin only surface calls this). */
  static async saveSettings(branchId: string, s: BranchSettings): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.from('branch_settings').upsert({
        branch_id: branchId,
        tax_enabled: s.taxEnabled,
        tax_rate: s.taxRate,
        tax_label: s.taxLabel.trim() || 'Tax',
        tax_inclusive: s.taxInclusive,
        discount_presets: s.discountPresets,
        loyalty: s.loyalty,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'branch_id' });
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
