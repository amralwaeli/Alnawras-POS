import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Star, Search, Plus, Edit2, Trash2, TrendingUp,
  RotateCcw, ChevronRight, X, ArrowUpCircle, ArrowDownCircle,
  Settings2, AlertCircle, Gift,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { usePOS } from '../../context/POSContext';
import { LoyaltyController } from '../../controllers/LoyaltyController';
import { loadLoyaltySettings, saveLoyaltySettings, DEFAULT_LOYALTY_SETTINGS } from '../../models/types';
import type { Customer, LoyaltyTransaction, LoyaltySettings } from '../../models/types';
import { fmt } from '../../../lib/currency';

// ── Customer Form Dialog ──────────────────────────────────────────────────────
function CustomerDialog({
  open, customer, branchId, onClose, onSaved,
}: {
  open: boolean;
  customer: Customer | null;
  branchId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (customer) {
      setName(customer.name);
      setPhone(customer.phone);
      setEmail(customer.email ?? '');
    } else {
      setName(''); setPhone(''); setEmail('');
    }
  }, [customer, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) { toast.error('Name and phone are required'); return; }
    setLoading(true);
    try {
      if (customer) {
        const res = await LoyaltyController.updateCustomer(customer.id, { name: name.trim(), email: email.trim() || undefined });
        if (!res.success) throw new Error(res.error);
        toast.success('Customer updated');
      } else {
        const res = await LoyaltyController.createCustomer({ name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, branchId });
        if (!res.success) throw new Error(res.error);
        toast.success('Customer created');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save customer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{customer ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Full Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Customer name" required />
          </div>
          <div>
            <Label>Phone Number *</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 000 0000" disabled={!!customer} required />
            {customer && <p className="text-xs text-gray-400 mt-1">Phone cannot be changed after creation</p>}
          </div>
          <div>
            <Label>Email (optional)</Label>
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="customer@email.com" type="email" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Saving…' : customer ? 'Update' : 'Add'} Customer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Adjust Points Dialog ──────────────────────────────────────────────────────
function AdjustPointsDialog({
  open, customer, branchId, settings, onClose, onSaved,
}: {
  open: boolean;
  customer: Customer | null;
  branchId: string;
  settings: LoyaltySettings;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [points, setPoints] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (open) { setPoints(''); setDescription(''); } }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pts = parseInt(points);
    if (!pts || !description.trim()) { toast.error('Enter points and a reason'); return; }
    if (!customer) return;
    setLoading(true);
    try {
      const res = await LoyaltyController.adjustPoints({ customerId: customer.id, points: pts, description: description.trim(), branchId });
      if (!res.success) throw new Error(res.error);
      toast.success(`${pts > 0 ? 'Added' : 'Deducted'} ${Math.abs(pts)} ${settings.pointsLabel}`);
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Adjustment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust {settings.pointsLabel} — {customer?.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="text-center py-2">
            <p className="text-3xl font-bold text-amber-600">{customer?.pointsBalance ?? 0}</p>
            <p className="text-sm text-gray-500">current balance</p>
          </div>
          <div>
            <Label>Points to add (negative to deduct)</Label>
            <Input type="number" value={points} onChange={e => setPoints(e.target.value)} placeholder="e.g. 50 or -25" required />
          </div>
          <div>
            <Label>Reason *</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Compensation, correction…" required />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Apply Adjustment'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Customer Detail Panel ─────────────────────────────────────────────────────
function CustomerDetail({
  customer, settings, onClose, onEdit, onAdjust,
}: {
  customer: Customer;
  settings: LoyaltySettings;
  onClose: () => void;
  onEdit: () => void;
  onAdjust: () => void;
}) {
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    LoyaltyController.getTransactions(customer.id, 30).then(res => {
      if (res.success) setTransactions(res.transactions ?? []);
      setLoading(false);
    });
  }, [customer.id]);

  const pointsValue = (customer.pointsBalance / settings.redemptionRate).toFixed(2);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="font-bold text-lg">{customer.name}</h2>
            <p className="text-sm text-gray-500">{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100"><X className="size-5" /></button>
        </div>

        <div className="px-6 py-4 grid grid-cols-3 gap-3 border-b">
          <div className="text-center">
            <p className="text-2xl font-bold text-amber-600">{customer.pointsBalance}</p>
            <p className="text-xs text-gray-500">{settings.pointsLabel}</p>
            <p className="text-xs text-gray-400">≈ {fmt(Number(pointsValue))}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-800">{customer.totalVisits}</p>
            <p className="text-xs text-gray-500">Visits</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-800">{fmt(customer.totalSpent)}</p>
            <p className="text-xs text-gray-500">Total Spent</p>
          </div>
        </div>

        <div className="flex gap-2 px-6 py-3 border-b">
          <Button size="sm" variant="outline" onClick={onEdit} className="flex-1">
            <Edit2 className="size-3.5 mr-1" /> Edit
          </Button>
          <Button size="sm" variant="outline" onClick={onAdjust} className="flex-1">
            <RotateCcw className="size-3.5 mr-1" /> Adjust {settings.pointsLabel}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Transaction History</p>
          {loading && <p className="text-sm text-gray-400 text-center py-4">Loading…</p>}
          {!loading && transactions.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No transactions yet</p>
          )}
          <div className="space-y-2">
            {transactions.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className={`shrink-0 ${tx.type === 'earn' ? 'text-emerald-500' : tx.type === 'redeem' ? 'text-red-400' : 'text-blue-400'}`}>
                  {tx.type === 'earn' ? <ArrowUpCircle className="size-4" /> : tx.type === 'redeem' ? <ArrowDownCircle className="size-4" /> : <RotateCcw className="size-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{tx.description}</p>
                  <p className="text-xs text-gray-400">{new Date(tx.createdAt).toLocaleString()}</p>
                </div>
                <span className={`text-sm font-bold ${tx.points > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {tx.points > 0 ? '+' : ''}{tx.points}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Settings Panel ────────────────────────────────────────────────────────────
function SettingsPanel() {
  const [settings, setSettings] = useState<LoyaltySettings>(loadLoyaltySettings);
  const [saved, setSaved] = useState(false);

  const save = () => {
    saveLoyaltySettings(settings);
    setSaved(true);
    toast.success('Loyalty settings saved');
    setTimeout(() => setSaved(false), 2000);
  };

  const dollarValue = (1 / settings.redemptionRate).toFixed(3);
  const minDollar = (settings.minimumRedemption / settings.redemptionRate).toFixed(2);

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50">
        <label className="flex items-center gap-3 cursor-pointer w-full">
          <div className="relative">
            <input type="checkbox" className="sr-only" checked={settings.enabled} onChange={e => setSettings(p => ({ ...p, enabled: e.target.checked }))} />
            <div className={`w-11 h-6 rounded-full transition-colors ${settings.enabled ? 'bg-amber-500' : 'bg-gray-300'}`} />
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.enabled ? 'translate-x-5' : ''}`} />
          </div>
          <div>
            <p className="font-semibold text-sm">Loyalty Program Enabled</p>
            <p className="text-xs text-gray-500">Cashiers will see the customer lookup at checkout</p>
          </div>
        </label>
      </div>

      <div>
        <Label>Points Label</Label>
        <Input value={settings.pointsLabel} onChange={e => setSettings(p => ({ ...p, pointsLabel: e.target.value }))} placeholder="Points, Stars, Coins…" className="mt-1" />
        <p className="text-xs text-gray-400 mt-1">What to call the currency in the UI</p>
      </div>

      <div>
        <Label>Points Earned per RM 1 Spent</Label>
        <Input type="number" min="0.1" step="0.1" value={settings.pointsPerDollar} onChange={e => setSettings(p => ({ ...p, pointsPerDollar: parseFloat(e.target.value) || 1 }))} className="mt-1" />
        <p className="text-xs text-gray-400 mt-1">Customer earns {settings.pointsPerDollar} {settings.pointsLabel.toLowerCase()} for every RM 1 spent</p>
      </div>

      <div>
        <Label>{settings.pointsLabel} Needed for RM 1 Discount</Label>
        <Input type="number" min="1" step="1" value={settings.redemptionRate} onChange={e => setSettings(p => ({ ...p, redemptionRate: parseInt(e.target.value) || 100 }))} className="mt-1" />
        <p className="text-xs text-gray-400 mt-1">{settings.redemptionRate} {settings.pointsLabel.toLowerCase()} = RM 1 discount (1 point ≈ RM {dollarValue})</p>
      </div>

      <div>
        <Label>Minimum {settings.pointsLabel} to Redeem</Label>
        <Input type="number" min="0" step="10" value={settings.minimumRedemption} onChange={e => setSettings(p => ({ ...p, minimumRedemption: parseInt(e.target.value) || 0 }))} className="mt-1" />
        <p className="text-xs text-gray-400 mt-1">Customer needs at least {settings.minimumRedemption} {settings.pointsLabel.toLowerCase()} (≈ RM {minDollar}) to redeem</p>
      </div>

      <Button onClick={save} className={saved ? 'bg-emerald-600 hover:bg-emerald-700' : ''}>
        {saved ? '✓ Saved' : 'Save Settings'}
      </Button>
    </div>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────
export function LoyaltyManagementView() {
  const { currentUser } = usePOS();
  const branchId = currentUser?.branchId ?? 'branch-1';
  const settings = loadLoyaltySettings();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [adjustingCustomer, setAdjustingCustomer] = useState<Customer | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    const res = await LoyaltyController.getCustomers(branchId);
    if (res.success) setCustomers(res.customers ?? []);
    else toast.error('Failed to load customers');
    setLoading(false);
  }, [branchId]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const handleDelete = async (id: string) => {
    const res = await LoyaltyController.deleteCustomer(id);
    if (res.success) { toast.success('Customer deleted'); loadCustomers(); }
    else toast.error(res.error || 'Delete failed');
  };

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  const totalPoints = customers.reduce((s, c) => s + c.pointsBalance, 0);
  const totalSpent  = customers.reduce((s, c) => s + c.totalSpent, 0);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Loyalty Program</h1>
          <p className="text-gray-500">Manage customers, points, and loyalty settings</p>
        </div>
        {!settings.enabled && (
          <Badge className="bg-amber-100 text-amber-700 flex items-center gap-1">
            <AlertCircle className="size-3" /> Program disabled — enable in Settings
          </Badge>
        )}
      </div>

      <Tabs defaultValue="customers">
        <TabsList>
          <TabsTrigger value="customers" className="flex items-center gap-1.5">
            <Users className="size-3.5" /> Customers
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-1.5">
            <Settings2 className="size-3.5" /> Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="mt-6 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <Users className="size-8 text-blue-500 shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{customers.length}</p>
                  <p className="text-xs text-gray-500">Members</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <Star className="size-8 text-amber-500 shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{totalPoints.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">{settings.pointsLabel} in Circulation</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <TrendingUp className="size-8 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{fmt(totalSpent)}</p>
                  <p className="text-xs text-gray-500">Member Revenue</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Toolbar */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
              <Input className="pl-9" placeholder="Search by name or phone…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Button onClick={() => setIsAddOpen(true)}>
              <Plus className="size-4 mr-1" /> Add Customer
            </Button>
          </div>

          {/* Customer List */}
          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading customers…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Gift className="size-12 text-gray-300 mx-auto mb-3" />
              <p className="font-medium text-gray-600">{search ? 'No customers match your search' : 'No loyalty members yet'}</p>
              {!search && <Button className="mt-3" onClick={() => setIsAddOpen(true)}><Plus className="size-4 mr-1" /> Add First Member</Button>}
            </div>
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">{settings.pointsLabel}</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Visits</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Total Spent</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50 cursor-pointer" onClick={() => setDetailCustomer(c)}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-amber-600">{c.pointsBalance.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{c.totalVisits}</td>
                      <td className="px-4 py-3 text-right font-medium">{fmt(c.totalSpent)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => { setAdjustingCustomer(c); }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50"
                            title="Adjust points"
                          >
                            <RotateCcw className="size-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingCustomer(c)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                            title="Edit"
                          >
                            <Edit2 className="size-3.5" />
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                                <Trash2 className="size-3.5" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Customer</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Remove {c.name} and all their loyalty history? This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(c.id)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <ChevronRight className="size-4 text-gray-300 ml-1" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <SettingsPanel />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <CustomerDialog
        open={isAddOpen}
        customer={null}
        branchId={branchId}
        onClose={() => setIsAddOpen(false)}
        onSaved={loadCustomers}
      />
      <CustomerDialog
        open={!!editingCustomer}
        customer={editingCustomer}
        branchId={branchId}
        onClose={() => setEditingCustomer(null)}
        onSaved={loadCustomers}
      />
      <AdjustPointsDialog
        open={!!adjustingCustomer}
        customer={adjustingCustomer}
        branchId={branchId}
        settings={settings}
        onClose={() => setAdjustingCustomer(null)}
        onSaved={loadCustomers}
      />
      {detailCustomer && (
        <CustomerDetail
          customer={detailCustomer}
          settings={settings}
          onClose={() => setDetailCustomer(null)}
          onEdit={() => { setEditingCustomer(detailCustomer); setDetailCustomer(null); }}
          onAdjust={() => { setAdjustingCustomer(detailCustomer); setDetailCustomer(null); }}
        />
      )}
    </div>
  );
}
