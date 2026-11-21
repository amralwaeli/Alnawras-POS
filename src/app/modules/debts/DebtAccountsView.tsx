import React, { useState, useEffect, useCallback } from 'react';
import { HandCoins, AlertTriangle, Search, Plus, Edit2, ChevronRight, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { Card, CardContent } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { usePOS } from '../../context/POSContext';
import { DebtController, DebtAccount, DebtEntry, DebtTerms, DebtPayMethod } from '../../controllers/DebtController';
import { fmt } from '../../../lib/currency';
import { friendlyError } from '../../../lib/errors';

const TERMS: Record<DebtTerms, string> = { weekly: 'Weekly', monthly: 'Monthly', flexible: 'Flexible' };
const METHODS: Record<DebtPayMethod, string> = { cash: 'Cash', card: 'Card', qr: 'QR', transfer: 'Bank transfer' };
const KINDS: Record<DebtEntry['kind'], string> = { charge: 'Bill on account', payment: 'Payment', adjustment: 'Correction' };
const selectCls = 'w-full h-9 px-3 border border-gray-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300';
const textareaCls = 'w-full text-sm border border-gray-200 rounded-md p-2.5 resize-none outline-none focus:ring-2 focus:ring-orange-300';

// due_date is a plain DATE ('YYYY-MM-DD'); parse as local midnight so it never shifts a day.
const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString() : '—');

// ── New / Edit Account Dialog ─────────────────────────────────────────────────
function AccountDialog({
  open, account, branchId, onClose, onSaved,
}: {
  open: boolean;
  account: DebtAccount | null;
  branchId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [terms, setTerms] = useState<DebtTerms>('flexible');
  const [limit, setLimit] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? '');
    setPhone(account?.phone ?? '');
    setTerms(account?.terms ?? 'flexible');
    setLimit(account?.creditLimit == null ? '' : String(account.creditLimit));
    setNotes(account?.notes ?? '');
    setIsActive(account?.isActive ?? true);
  }, [account, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Enter the customer name'); return; }
    const creditLimit = limit.trim() === '' ? null : Number(limit);
    if (creditLimit != null && (!Number.isFinite(creditLimit) || creditLimit < 0)) { toast.error('Credit limit must be 0 or more'); return; }
    setLoading(true);
    const res = await DebtController.save(branchId, { id: account?.id, name, phone, terms, creditLimit, notes, isActive });
    setLoading(false);
    if (!res.success) { toast.error(friendlyError(res.error, 'Could not save the account')); return; }
    toast.success(account ? 'Account updated' : 'Account created');
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{account ? 'Edit Account' : 'New Account'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="debt-name">Customer name *</Label>
            <Input id="debt-name" value={name} onChange={e => setName(e.target.value)} placeholder="Customer name" maxLength={120} required />
          </div>
          <div>
            <Label htmlFor="debt-phone">Phone</Label>
            <Input id="debt-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Optional" maxLength={40} />
          </div>
          <div>
            <Label htmlFor="debt-terms">Pays</Label>
            <select id="debt-terms" value={terms} onChange={e => setTerms(e.target.value as DebtTerms)} className={selectCls}>
              {(Object.keys(TERMS) as DebtTerms[]).map(t => <option key={t} value={t}>{TERMS[t]}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="debt-limit">Credit limit</Label>
            <Input id="debt-limit" type="number" inputMode="decimal" min="0" step="0.01" value={limit} onChange={e => setLimit(e.target.value)} placeholder="Empty = no limit" />
          </div>
          <div>
            <Label htmlFor="debt-notes">Notes</Label>
            <textarea id="debt-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} maxLength={500} className={textareaCls} />
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl border">
            <Switch id="debt-active" checked={isActive} onCheckedChange={setIsActive} className="mt-0.5" />
            <Label htmlFor="debt-active" className="block cursor-pointer">
              <span className="block text-sm font-semibold">Account open</span>
              <span className="block text-xs font-normal text-gray-500">Closing stops new bills going on this account. An account with history can't be deleted.</span>
            </Label>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Saving…' : account ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Account Details Dialog ────────────────────────────────────────────────────
function AccountDetail({
  account, branchId, canCorrect, by, onClose, onEdit, onChanged,
}: {
  account: DebtAccount;
  branchId: string;
  canCorrect: boolean;
  by: { id: string; name: string };
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [entries, setEntries] = useState<DebtEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<DebtPayMethod>('cash');
  const [payNote, setPayNote] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjNote, setAdjNote] = useState('');

  const loadEntries = useCallback(async () => {
    const res = await DebtController.entries(account.id);
    if (res.success) setEntries(res.data ?? []);
    else toast.error(friendlyError(res.error, 'Could not load the account history'));
    setLoading(false);
  }, [account.id]);

  useEffect(() => { setLoading(true); loadEntries(); }, [loadEntries]);
  useEffect(() => { setPayAmount(account.balance > 0 ? account.balance.toFixed(2) : ''); }, [account.id, account.balance]);

  const afterChange = () => { loadEntries(); onChanged(); };

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error('Enter an amount above zero'); return; }
    setBusy(true);
    const res = await DebtController.recordPayment(branchId, account.id, amount, payMethod, payNote.trim(), by);
    setBusy(false);
    if (!res.success) { toast.error(friendlyError(res.error, 'Could not record the payment')); return; }
    toast.success(`Payment of ${fmt(amount)} recorded — still owes ${fmt(res.data ?? 0)}`);
    setPayNote('');
    afterChange();
  };

  const adjust = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(adjAmount);
    if (!Number.isFinite(amount) || amount === 0) { toast.error('Enter an amount (negative to reduce the debt)'); return; }
    if (!adjNote.trim()) { toast.error('Write the reason for the correction'); return; }
    setBusy(true);
    const res = await DebtController.adjust(branchId, account.id, amount, adjNote.trim(), by);
    setBusy(false);
    if (!res.success) { toast.error(friendlyError(res.error, 'Could not save the correction')); return; }
    toast.success(`Correction saved — now owes ${fmt(res.data ?? 0)}`);
    setAdjAmount(''); setAdjNote('');
    afterChange();
  };

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {account.name}
            {account.overdue && <Badge className="bg-red-100 text-red-700">Overdue</Badge>}
            {!account.isActive && <Badge className="bg-gray-100 text-gray-600">Closed</Badge>}
          </DialogTitle>
          <p className="text-sm text-gray-500">{[account.phone, `Pays ${TERMS[account.terms].toLowerCase()}`].filter(Boolean).join(' · ')}</p>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 py-2 border-y">
          <div className="text-center">
            <p className={`text-2xl font-bold ${account.balance > 0 ? 'text-red-600' : 'text-gray-800'}`}>{fmt(account.balance)}</p>
            <p className="text-xs text-gray-500">Owes</p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-bold ${account.overdue ? 'text-red-600' : 'text-gray-800'}`}>{fmtDate(account.dueDate)}</p>
            <p className="text-xs text-gray-500">Due</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-800">{account.creditLimit == null ? 'No limit' : fmt(account.creditLimit)}</p>
            <p className="text-xs text-gray-500">Credit limit</p>
          </div>
        </div>

        {account.notes && <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{account.notes}</p>}

        <Button size="sm" variant="outline" onClick={onEdit} className="w-fit">
          <Edit2 className="size-3.5 mr-1" /> Edit account
        </Button>

        <form onSubmit={recordPayment} className="space-y-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50/50">
          <p className="font-semibold text-sm">Record payment</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pay-amount">Amount</Label>
              <Input id="pay-amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pay-method">Method</Label>
              <select id="pay-method" value={payMethod} onChange={e => setPayMethod(e.target.value as DebtPayMethod)} className={selectCls}>
                {(Object.keys(METHODS) as DebtPayMethod[]).map(m => <option key={m} value={m}>{METHODS[m]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="pay-note">Note (optional)</Label>
            <Input id="pay-note" value={payNote} onChange={e => setPayNote(e.target.value)} maxLength={300} />
          </div>
          <Button type="submit" disabled={busy || account.balance <= 0} className="w-full sm:w-auto">
            {busy ? 'Saving…' : 'Record payment'}
          </Button>
        </form>

        {canCorrect && (
          <form onSubmit={adjust} className="space-y-3 p-4 rounded-xl border border-amber-200 bg-amber-50/50">
            <p className="font-semibold text-sm">Correction</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="adj-amount">Amount (negative reduces the debt)</Label>
                <Input id="adj-amount" type="number" inputMode="decimal" step="0.01" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} placeholder="e.g. 10 or -5" />
              </div>
              <div>
                <Label htmlFor="adj-note">Reason *</Label>
                <Input id="adj-note" value={adjNote} onChange={e => setAdjNote(e.target.value)} maxLength={300} placeholder="Why is this changed?" />
              </div>
            </div>
            <Button type="submit" variant="outline" disabled={busy} className="w-full sm:w-auto">
              {busy ? 'Saving…' : 'Save correction'}
            </Button>
          </form>
        )}

        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">History</p>
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No history yet</p>
          ) : (
            <div className="rounded-xl border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Type</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Amount</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Method</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Note</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">By</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(en => {
                    // Payments lower the debt; charges and positive corrections raise it.
                    const signed = en.kind === 'payment' ? -en.amount : en.amount;
                    return (
                      <tr key={en.id} className="border-b last:border-0">
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">{new Date(en.createdAt).toLocaleString()}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{KINDS[en.kind]}</td>
                        <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${signed < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {signed < 0 ? '−' : '+'}{fmt(Math.abs(signed))}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">{en.method ? METHODS[en.method as DebtPayMethod] ?? en.method : '—'}</td>
                        <td className="px-3 py-2 text-gray-600 min-w-40">{en.note || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">{en.createdByName || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────
type Filter = 'all' | 'owing' | 'overdue';

export function DebtAccountsView() {
  const { currentUser } = usePOS();
  const branchId = currentUser?.branchId ?? 'branch-1';
  const by = { id: currentUser?.id ?? '', name: currentUser?.name ?? '' };
  const canCorrect = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const [accounts, setAccounts] = useState<DebtAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editing, setEditing] = useState<DebtAccount | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await DebtController.list(branchId);
    if (res.success) setAccounts(res.data ?? []);
    else toast.error(friendlyError(res.error, 'Could not load customer accounts'));
    setLoading(false);
  }, [branchId]);

  useEffect(() => { load(); }, [load]);

  // Look the open account up in the list so a reload refreshes its balance too.
  const detail = accounts.find(a => a.id === detailId) ?? null;
  const owing = (a: DebtAccount) => a.balance > 0.005;
  const totalOwed = accounts.reduce((s, a) => s + (owing(a) ? a.balance : 0), 0);
  const overdueCount = accounts.filter(a => a.overdue).length;

  const q = search.trim().toLowerCase();
  const filtered = accounts.filter(a =>
    (filter === 'all' || (filter === 'owing' ? owing(a) : a.overdue)) &&
    (!q || a.name.toLowerCase().includes(q) || (a.phone ?? '').includes(q))
  );

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Customer Debts</h1>
          <p className="text-gray-500">Customers who pay later, and money collected from them</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="size-4 mr-1" /> New account
        </Button>
      </div>

      <div className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <HandCoins className="size-8 text-orange-500 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{fmt(totalOwed)}</p>
                <p className="text-xs text-gray-500">Total owed by customers</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <AlertTriangle className={`size-8 shrink-0 ${overdueCount ? 'text-red-500' : 'text-gray-300'}`} />
              <div>
                <p className="text-2xl font-bold">{overdueCount}</p>
                <p className="text-xs text-gray-500">Overdue accounts</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <Input className="pl-9" placeholder="Search by name or phone…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search accounts" />
          </div>
          <Tabs value={filter} onValueChange={v => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="owing">Owing</TabsTrigger>
              <TabsTrigger value="overdue">Overdue</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Account list */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading accounts…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Wallet className="size-12 text-gray-300 mx-auto mb-3" />
            <p className="font-medium text-gray-600">{accounts.length ? 'No accounts match' : 'No customer accounts yet'}</p>
            {!accounts.length && <Button className="mt-3" onClick={() => setIsAddOpen(true)}><Plus className="size-4 mr-1" /> Add first account</Button>}
          </div>
        ) : (
          <div className="bg-white rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Terms</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Balance</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Credit limit</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Due</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id} className={`border-b last:border-0 hover:bg-gray-50 cursor-pointer ${a.isActive ? '' : 'opacity-50'}`} onClick={() => setDetailId(a.id)}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{a.name}{!a.isActive && <span className="ml-2 text-xs font-normal text-gray-500">(closed)</span>}</p>
                      <p className="text-xs text-gray-400">{a.phone || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{TERMS[a.terms]}</td>
                    <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${owing(a) ? 'text-red-600' : 'text-gray-500'}`}>{fmt(a.balance)}</td>
                    <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{a.creditLimit == null ? 'No limit' : fmt(a.creditLimit)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-gray-600">{fmtDate(a.dueDate)}</span>
                      {a.overdue && <Badge className="ml-2 bg-red-100 text-red-700">Overdue</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); setEditing(a); }}
                          className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                          title="Edit" aria-label={`Edit ${a.name}`}
                        >
                          <Edit2 className="size-4" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setDetailId(a.id); }}
                          className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                          aria-label={`Open ${a.name}`}
                        >
                          <ChevronRight className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <AccountDialog open={isAddOpen} account={null} branchId={branchId} onClose={() => setIsAddOpen(false)} onSaved={load} />
      <AccountDialog open={!!editing} account={editing} branchId={branchId} onClose={() => setEditing(null)} onSaved={load} />
      {detail && !editing && (
        <AccountDetail
          account={detail}
          branchId={branchId}
          canCorrect={canCorrect}
          by={by}
          onClose={() => setDetailId(null)}
          onEdit={() => setEditing(detail)}
          onChanged={load}
        />
      )}
    </div>
  );
}
