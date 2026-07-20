import { supabase } from '../../lib/supabase';
import { Branch } from '../models/types';
import { mapBranch } from '../models/mappers';

export interface BranchAccess {
  branch: Branch | null;
  /** True when the branch is active AND its contract hasn't expired. When
   *  false, staff login is blocked and customer ordering shows unavailable. */
  allowed: boolean;
  reason?: 'suspended' | 'expired' | 'not-found';
}

/** Local-date string (YYYY-MM-DD) in the browser's timezone — the contract
 *  boundary is a calendar date, so compare on the local day, not a UTC
 *  instant, to avoid locking out a few hours early near midnight. */
function todayLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export class BranchController {
  /**
   * Load a branch and decide whether it may currently operate. A branch is
   * locked out if it's suspended by the super-admin, or its contract_end has
   * passed (auto-lock the moment the date rolls over).
   */
  static async getAccess(branchId: string): Promise<BranchAccess> {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('id', branchId)
        .maybeSingle();

      // If the branches table doesn't exist yet (migration 0018 not applied),
      // fail OPEN — never lock out a running single-tenant deployment just
      // because the tenant tables haven't landed. Multi-tenant enforcement
      // only kicks in once the registry exists.
      if (error) {
        console.warn('[BranchController] branches lookup failed (migration 0018 applied?)', error.message);
        return { branch: null, allowed: true };
      }
      if (!data) {
        // Branch id has no registry row. Also fail open (single-tenant / legacy
        // branch not yet registered) — the super-admin panel is where a real
        // branch gets locked, not an unregistered id.
        return { branch: null, allowed: true, reason: 'not-found' };
      }

      const branch = mapBranch(data);
      if (branch.status === 'suspended') return { branch, allowed: false, reason: 'suspended' };
      if (branch.contractEnd && branch.contractEnd < todayLocal()) {
        return { branch, allowed: false, reason: 'expired' };
      }
      return { branch, allowed: true };
    } catch (err: any) {
      console.warn('[BranchController] getAccess error — failing open', err?.message);
      return { branch: null, allowed: true };
    }
  }
}
