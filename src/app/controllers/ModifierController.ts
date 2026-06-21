/**
 * ModifierController.ts
 *
 * CRUD for shared Modifier Groups and their options, plus the product links
 * that decide which products offer which groups. See migration 0009_modifiers.
 *
 * A group owns its options (modifier_options) and is linked to many products
 * (product_modifier_groups). Ordering surfaces call `getGroupsForProducts` to
 * find, for a set of products, which option groups to offer the customer.
 */
import { supabase } from '../../lib/supabase';
import type { ModifierGroup } from '../models/types';
import { mapModifierGroup } from '../models/mappers';

export interface ModifierOptionInput {
  name: string;
  addOnPrice: number;
  isDefault: boolean;
}

export interface ModifierGroupInput {
  name: string;
  type: 'single' | 'multiple';
  branchId: string;
  options: ModifierOptionInput[];
  /** Product ids to link this group to. */
  productIds: string[];
}

const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export class ModifierController {
  /** List all groups for a branch, with their options and linked product ids. */
  static async getGroups(branchId: string): Promise<{ success: boolean; groups?: ModifierGroup[]; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('modifier_groups')
        .select('*, modifier_options(*), product_modifier_groups(product_id)')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const groups = (data ?? []).map((row: any) => {
        const g = mapModifierGroup(row);
        g.linkedProductCount = row.product_modifier_groups?.length ?? 0;
        return g;
      });
      return { success: true, groups };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /** Create a group, its options, and product links in one go. */
  static async createGroup(input: ModifierGroupInput): Promise<{ success: boolean; group?: ModifierGroup; error?: string }> {
    try {
      const groupId = uid('mg');
      const { error: gErr } = await supabase.from('modifier_groups').insert({
        id: groupId,
        name: input.name.trim(),
        type: input.type,
        branch_id: input.branchId,
        is_active: true,
      });
      if (gErr) throw gErr;

      await ModifierController.replaceOptions(groupId, input.options);
      await ModifierController.replaceLinks(groupId, input.productIds);

      return ModifierController.getGroup(groupId);
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /** Update a group's name/type and fully replace its options + product links. */
  static async updateGroup(groupId: string, input: ModifierGroupInput): Promise<{ success: boolean; group?: ModifierGroup; error?: string }> {
    try {
      const { error: gErr } = await supabase
        .from('modifier_groups')
        .update({ name: input.name.trim(), type: input.type })
        .eq('id', groupId);
      if (gErr) throw gErr;

      await ModifierController.replaceOptions(groupId, input.options);
      await ModifierController.replaceLinks(groupId, input.productIds);

      return ModifierController.getGroup(groupId);
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async deleteGroup(groupId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // options + links cascade-delete via FK ON DELETE CASCADE.
      const { error } = await supabase.from('modifier_groups').delete().eq('id', groupId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /** Fetch a single group with options + links. */
  static async getGroup(groupId: string): Promise<{ success: boolean; group?: ModifierGroup; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('modifier_groups')
        .select('*, modifier_options(*), product_modifier_groups(product_id)')
        .eq('id', groupId)
        .single();
      if (error) throw error;
      const g = mapModifierGroup(data);
      g.linkedProductCount = data.product_modifier_groups?.length ?? 0;
      return { success: true, group: g };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * For a set of product ids, return a map of productId → the modifier groups
   * (with options) that apply to it. Used by every ordering surface.
   */
  static async getGroupsForProducts(productIds: string[]): Promise<Record<string, ModifierGroup[]>> {
    const result: Record<string, ModifierGroup[]> = {};
    if (!productIds.length) return result;
    try {
      const { data, error } = await supabase
        .from('product_modifier_groups')
        .select('product_id, display_order, modifier_groups(*, modifier_options(*))')
        .in('product_id', productIds);
      if (error) throw error;
      for (const link of data ?? []) {
        const raw = (link as any).modifier_groups;
        if (!raw || raw.is_active === false) continue;
        const group = mapModifierGroup(raw);
        const pid = (link as any).product_id;
        (result[pid] ||= []).push(group);
      }
    } catch (err) {
      console.warn('[ModifierController] getGroupsForProducts failed', err);
    }
    return result;
  }

  // ── internals ──────────────────────────────────────────────────────────────
  private static async replaceOptions(groupId: string, options: ModifierOptionInput[]) {
    await supabase.from('modifier_options').delete().eq('group_id', groupId);
    const clean = options.filter(o => o.name.trim());
    if (!clean.length) return;
    const rows = clean.map((o, i) => ({
      id: uid('mo'),
      group_id: groupId,
      name: o.name.trim(),
      add_on_price: Number.isFinite(o.addOnPrice) ? o.addOnPrice : 0,
      is_default: !!o.isDefault,
      display_order: i,
    }));
    const { error } = await supabase.from('modifier_options').insert(rows);
    if (error) throw error;
  }

  private static async replaceLinks(groupId: string, productIds: string[]) {
    await supabase.from('product_modifier_groups').delete().eq('group_id', groupId);
    const unique = Array.from(new Set(productIds));
    if (!unique.length) return;
    const rows = unique.map((pid, i) => ({ product_id: pid, group_id: groupId, display_order: i }));
    const { error } = await supabase.from('product_modifier_groups').insert(rows);
    if (error) throw error;
  }
}
