import { supabase } from '../../lib/supabase';
import { Organization, Branch, BranchFeatures, ALL_FEATURES_ON } from '../models/types';
import { mapOrganization, mapBranch } from '../models/mappers';

const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export interface OrgWithBranches extends Organization {
  branches: Branch[];
}

/**
 * SuperAdminController — the tenant-management surface. Uses a real Supabase
 * Auth session (email+password) separate from staff PIN auth, and confirms the
 * signed-in user is a registered super-admin before any panel is shown.
 */
export class SuperAdminController {
  // ── Auth ───────────────────────────────────────────────────────────────────
  static async login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };
    const ok = await SuperAdminController.isSuperAdmin();
    if (!ok) {
      await supabase.auth.signOut();
      return { success: false, error: 'This account is not a super-admin.' };
    }
    return { success: true };
  }

  static async logout(): Promise<void> {
    await supabase.auth.signOut();
  }

  /** Is there a current Supabase Auth session that belongs to a super-admin? */
  static async isSuperAdmin(): Promise<boolean> {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return false;
    const { data, error } = await supabase.rpc('is_current_user_super_admin');
    if (error) return false;
    return data === true;
  }

  // ── Organizations ──────────────────────────────────────────────────────────
  static async listOrganizations(): Promise<{ success: boolean; data?: OrgWithBranches[]; error?: string }> {
    try {
      const [{ data: orgs, error: orgErr }, { data: branches, error: brErr }] = await Promise.all([
        supabase.from('organizations').select('*').order('created_at', { ascending: true }),
        supabase.from('branches').select('*').order('created_at', { ascending: true }),
      ]);
      if (orgErr) throw orgErr;
      if (brErr) throw brErr;

      const branchesByOrg = new Map<string, Branch[]>();
      (branches ?? []).forEach((row: any) => {
        const b = mapBranch(row);
        const list = branchesByOrg.get(b.orgId) ?? [];
        list.push(b);
        branchesByOrg.set(b.orgId, list);
      });

      const data: OrgWithBranches[] = (orgs ?? []).map((row: any) => ({
        ...mapOrganization(row),
        branches: branchesByOrg.get(row.id) ?? [],
      }));
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async createOrganization(input: {
    name: string; ownerName?: string; ownerEmail?: string; ownerPhone?: string;
  }): Promise<{ success: boolean; data?: Organization; error?: string }> {
    try {
      const { data, error } = await supabase.from('organizations').insert({
        id: uid('org'),
        name: input.name.trim(),
        owner_name: input.ownerName?.trim() || null,
        owner_email: input.ownerEmail?.trim() || null,
        owner_phone: input.ownerPhone?.trim() || null,
        status: 'active',
      }).select().single();
      if (error) throw error;
      return { success: true, data: mapOrganization(data) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async setOrganizationStatus(orgId: string, status: 'active' | 'suspended'): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.from('organizations').update({ status }).eq('id', orgId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ── Branches (super-admin only — a tenant never self-serves a branch) ───────
  static async createBranch(input: {
    orgId: string; id?: string; name: string;
    contractStart?: string; contractEnd?: string; features?: Partial<BranchFeatures>;
  }): Promise<{ success: boolean; data?: Branch; error?: string }> {
    try {
      const { data, error } = await supabase.from('branches').insert({
        // Allow an explicit id so a real, already-in-use branch_id can be
        // registered; otherwise generate one for a brand-new branch.
        id: input.id?.trim() || uid('branch'),
        org_id: input.orgId,
        name: input.name.trim(),
        contract_start: input.contractStart || null,
        contract_end: input.contractEnd || null,
        status: 'active',
        enabled_features: { ...ALL_FEATURES_ON, ...(input.features ?? {}) },
      }).select().single();
      if (error) throw error;
      return { success: true, data: mapBranch(data) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async updateBranch(branchId: string, updates: {
    name?: string; contractStart?: string | null; contractEnd?: string | null;
    status?: 'active' | 'suspended' | 'expired'; features?: BranchFeatures;
  }): Promise<{ success: boolean; data?: Branch; error?: string }> {
    try {
      const payload: Record<string, any> = {};
      if (updates.name !== undefined) payload.name = updates.name.trim();
      if (updates.contractStart !== undefined) payload.contract_start = updates.contractStart || null;
      if (updates.contractEnd !== undefined) payload.contract_end = updates.contractEnd || null;
      if (updates.status !== undefined) payload.status = updates.status;
      if (updates.features !== undefined) payload.enabled_features = updates.features;

      const { data, error } = await supabase.from('branches').update(payload).eq('id', branchId).select().single();
      if (error) throw error;
      return { success: true, data: mapBranch(data) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
