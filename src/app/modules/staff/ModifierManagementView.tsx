import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Edit, Trash2, Layers } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';
import { ModifierController } from '../../controllers/ModifierController';
import type { ModifierGroup } from '../../models/types';

interface OptionRow { name: string; addOnPrice: string; isDefault: boolean }

const emptyOption = (): OptionRow => ({ name: '', addOnPrice: '0', isDefault: false });

export function ModifierManagementView() {
  const { products, currentUser } = usePOS();
  const branchId = currentUser?.branchId || 'branch-1';

  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ModifierGroup | null>(null);
  const [activeTab, setActiveTab] = useState('group');

  // form state
  const [name, setName] = useState('');
  const [type, setType] = useState<'single' | 'multiple'>('single');
  const [options, setOptions] = useState<OptionRow[]>([emptyOption()]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [productSearch, setProductSearch] = useState('');

  const load = async () => {
    setLoading(true);
    const res = await ModifierController.getGroups(branchId);
    if (res.success && res.groups) setGroups(res.groups);
    else toast.error(res.error || 'Failed to load modifier groups');
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [branchId]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setType('single');
    setOptions([emptyOption()]);
    setLinkedIds(new Set());
    setProductSearch('');
    setActiveTab('group');
    setDialogOpen(true);
  };

  const openEdit = (g: ModifierGroup) => {
    setEditing(g);
    setName(g.name);
    setType(g.type);
    setOptions(g.options.length
      ? g.options.map(o => ({ name: o.name, addOnPrice: String(o.addOnPrice), isDefault: o.isDefault }))
      : [emptyOption()]);
    setLinkedIds(new Set(g.productIds ?? []));
    setProductSearch('');
    setActiveTab('group');
    setDialogOpen(true);
  };

  const setOption = (i: number, patch: Partial<OptionRow>) =>
    setOptions(prev => prev.map((o, idx) => idx === i ? { ...o, ...patch } : o));

  const toggleDefault = (i: number) =>
    setOptions(prev => prev.map((o, idx) => {
      if (idx !== i) return type === 'single' ? { ...o, isDefault: false } : o; // single = only one default
      return { ...o, isDefault: !o.isDefault };
    }));

  const addOption = () => setOptions(prev => [...prev, emptyOption()]);
  const removeOption = (i: number) => setOptions(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);

  const toggleProduct = (id: string) =>
    setLinkedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase().trim();
    if (!q) return products;
    return products.filter(p => p.name.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q));
  }, [products, productSearch]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Modifier group name is required'); setActiveTab('group'); return; }
    const cleanOptions = options.filter(o => o.name.trim());
    if (cleanOptions.length === 0) { toast.error('Add at least one option'); setActiveTab('group'); return; }

    setSaving(true);
    const input = {
      name: name.trim(),
      type,
      branchId,
      options: cleanOptions.map(o => ({
        name: o.name.trim(),
        addOnPrice: parseFloat(o.addOnPrice) || 0,
        isDefault: o.isDefault,
      })),
      productIds: Array.from(linkedIds),
    };
    const res = editing
      ? await ModifierController.updateGroup(editing.id, input)
      : await ModifierController.createGroup(input);
    setSaving(false);

    if (res.success) {
      toast.success(editing ? 'Modifier group updated' : 'Modifier group created');
      setDialogOpen(false);
      load();
    } else {
      toast.error(res.error || 'Failed to save modifier group');
    }
  };

  const handleDelete = async (g: ModifierGroup) => {
    const res = await ModifierController.deleteGroup(g.id);
    if (res.success) { toast.success('Modifier group deleted'); load(); }
    else toast.error(res.error || 'Failed to delete');
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Modifier Groups</h1>
          <p className="text-gray-600">Reusable option sets (e.g. Chicken → Leg / Chest) you can link to products</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4 mr-2" />
          Create Modifier Group
        </Button>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left font-bold px-4 py-3">Group Name</th>
              <th className="text-left font-bold px-4 py-3">Type</th>
              <th className="text-left font-bold px-4 py-3">Modifiers</th>
              <th className="text-right font-bold px-4 py-3">Linked Products</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
            )}
            {!loading && groups.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                <Layers className="size-10 text-gray-300 mx-auto mb-3" />
                No modifier groups yet. Create one to start offering options on your products.
              </td></tr>
            )}
            {!loading && groups.map(g => (
              <tr key={g.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-semibold text-gray-900">{g.name}</div>
                  <div className="text-xs text-gray-400">{g.options.length} modifier(s)</div>
                </td>
                <td className="px-4 py-3 text-gray-700">{g.type === 'single' ? 'Single Choice' : 'Multiple Choice'}</td>
                <td className="px-4 py-3 text-gray-600">{g.options.map(o => o.name).join(', ')}</td>
                <td className="px-4 py-3 text-right text-gray-700">{g.linkedProductCount ?? g.productIds?.length ?? 0}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(g)}>
                      <Edit className="size-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700">
                          <Trash2 className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Modifier Group</AlertDialogTitle>
                          <AlertDialogDescription>
                            Delete "{g.name}"? It will be removed from all linked products. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(g)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Modifier Group' : 'Create Modifier Group'}</DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="group">Modifier Group</TabsTrigger>
              <TabsTrigger value="products">Add Products{linkedIds.size > 0 ? ` (${linkedIds.size})` : ''}</TabsTrigger>
            </TabsList>

            {/* ── Tab 1: group details ── */}
            <TabsContent value="group" className="space-y-5 pt-2">
              <div>
                <Label htmlFor="mg-name">Modifier Group Name</Label>
                <Input id="mg-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Chicken, Rice type" />
                <p className="text-xs text-gray-500 mt-1">A name easily recognizable by you or your staff</p>
              </div>

              <div>
                <Label>Type of Modifier</Label>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <button type="button" onClick={() => setType('single')}
                    className={`text-left border rounded-lg p-3 ${type === 'single' ? 'border-orange-500 ring-2 ring-orange-200' : 'border-gray-200'}`}>
                    <div className="font-semibold text-sm">Single choice</div>
                    <div className="text-xs text-gray-500">Pick exactly one option</div>
                  </button>
                  <button type="button" onClick={() => setType('multiple')}
                    className={`text-left border rounded-lg p-3 ${type === 'multiple' ? 'border-orange-500 ring-2 ring-orange-200' : 'border-gray-200'}`}>
                    <div className="font-semibold text-sm">Multiple choice</div>
                    <div className="text-xs text-gray-500">Pick more than one option</div>
                  </button>
                </div>
              </div>

              <div>
                <Label>Modifier Options</Label>
                <div className="mt-1 space-y-2">
                  <div className="grid grid-cols-[1fr_84px_52px_32px] sm:grid-cols-[1fr_120px_70px_36px] gap-2 text-xs font-semibold text-gray-500 px-1">
                    <span>Option Name</span>
                    <span>Add-on Price</span>
                    <span className="text-center">Default</span>
                    <span></span>
                  </div>
                  {options.map((o, i) => (
                    <div key={i} className="grid grid-cols-[1fr_84px_52px_32px] sm:grid-cols-[1fr_120px_70px_36px] gap-2 items-center">
                      <Input value={o.name} onChange={e => setOption(i, { name: e.target.value })} placeholder="e.g. Leg" />
                      <Input type="number" step="0.01" value={o.addOnPrice}
                        onChange={e => setOption(i, { addOnPrice: e.target.value })} />
                      <div className="flex justify-center">
                        <input type="checkbox" className="size-4 accent-orange-500"
                          checked={o.isDefault} onChange={() => toggleDefault(i)} />
                      </div>
                      <Button type="button" size="sm" variant="ghost" className="text-red-500" onClick={() => removeOption(i)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="ghost" className="text-orange-600 mt-2 px-1" onClick={addOption}>
                  <Plus className="size-4 mr-1" /> Add More Option
                </Button>
              </div>
            </TabsContent>

            {/* ── Tab 2: link products ── */}
            <TabsContent value="products" className="space-y-3 pt-2">
              <p className="text-sm text-gray-600">Select which products offer this modifier group when ordered.</p>
              <Input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search products…" />
              <div className="border rounded-lg max-h-72 overflow-y-auto divide-y">
                {filteredProducts.length === 0 && (
                  <div className="p-4 text-sm text-gray-400 text-center">No products found.</div>
                )}
                {filteredProducts.map(p => (
                  <label key={p.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" className="size-4 accent-orange-500"
                      checked={linkedIds.has(p.id)} onChange={() => toggleProduct(p.id)} />
                    <span className="flex-1 text-sm">{p.name}</span>
                    <Badge variant="secondary" className="text-xs">{p.category}</Badge>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500">{linkedIds.size} product(s) selected</p>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Group'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
