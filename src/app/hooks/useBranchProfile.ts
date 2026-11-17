import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { setCurrency } from '../../lib/currency';
import { setBranding } from '../../lib/branding';

/** Customer pages (no login): the restaurant's display name, and its currency
 *  applied to fmt(). Read through branch_profile() (migration 0034). */
export function useBranchProfile(branchId: string | null | undefined): string {
  const [name, setName] = useState('');
  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    supabase.rpc('branch_profile', { p_branch_id: branchId }).then(({ data }) => {
      if (cancelled || !data) return;
      setCurrency(data.currency);
      setBranding({ businessName: data.business_name });
      setName(data.business_name ?? '');
    });
    return () => { cancelled = true; };
  }, [branchId]);
  return name;
}
