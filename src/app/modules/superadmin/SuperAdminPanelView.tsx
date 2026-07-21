import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  ShieldCheck, LogOut, Plus, Building2, Store, Loader2, X,
  Save, Ban, CheckCircle2, AlertTriangle, Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { SuperAdminController, OrgWithBranches } from '../../controllers/SuperAdminController';
import { Branch, BranchFeatures, BranchFeatureKey, FEATURE_LABELS } from '../../models/types';

const FEATURE_KEYS = Object.keys(FEATURE_LABELS) as BranchFeatureKey[];

function todayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

// ─── Branch card (edit contract + features + status) ─────────────────────────
function BranchCard({ branch, onChanged }: { branch: Branch; onChanged: () => void }) {
  const [name, setName] = useState(branch.name);
  const [contractStart, setContractStart] = useState(branch.contractStart ?? '');
  const [contractEnd, setContractEnd] = useState(branch.contractEnd ?? '');
  const [features, setFeatures] = useState<BranchFeatures>(branch.features);
  const [saving, setSaving] = useState(false);

  const expired = branch.status === 'expired' || (!!contractEnd && contractEnd < todayStr());
  const dirty = name !== branch.name || contractStart !== (branch.contractStart ?? '') ||
    contractEnd !== (branch.contractEnd ?? '') ||
    JSON.stringify(features) !== JSON.stringify(branch.features);

  const save = async () => {
    setSaving(true);
    const res = await SuperAdminController.updateBranch(branch.id, {
      name, contractStart: contractStart || null, contractEnd: contractEnd || null, features,
    });
    setSaving(false);
    if (res.success) { toast.success('Branch updated'); onChanged(); }
    else toast.error(res.error || 'Update failed');
  };

  const toggleStatus = async () => {
    const next = branch.status === 'suspended' ? 'active' : 'suspended';
    const res = await SuperAdminController.updateBranch(branch.id, { status: next });
    if (res.success) { toast.success(next === 'suspended' ? 'Branch suspended' : 'Branch reactivated'); onChanged(); }
    else toast.error(res.error || 'Update failed');
  };

  const statusBadge = branch.status === 'active'
    ? (expired ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700')
    : branch.status === 'suspended' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  const statusLabel = branch.status === 'active' ? (expired ? 'Contract Expired' : 'Active') : branch.status === 'suspended' ? 'Suspended' : 'Expired';

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Store className="size-4 text-indigo-500 shrink-0" />
          <input
            value={name} onChange={e => setName(e.target.value)}
            className="font-semibold text-gray-900 text-sm bg-transparent border-b border-transparent hover:border-gray-200 focus:border-indigo-400 focus:outline-none min-w-0"
          />
        </div>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${statusBadge}`}>{statusLabel}</span>
      </div>

      <p className="text-[11px] text-gray-400 font-mono mb-3">branch_id: {branch.id}</p>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Contract Start</label>
          <input type="date" value={contractStart} onChange={e => setContractStart(e.target.value)}
            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Contract End</label>
          <input type="date" value={contractEnd} onChange={e => setContractEnd(e.target.value)}
            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400" />
        </div>
      </div>

      {expired && branch.status === 'active' && (
        <div className="flex items-center gap-1.5 text-[11px] text-red-600 mb-3">
          <AlertTriangle className="size-3.5" /> Contract end has passed — staff login is auto-blocked for this branch.
        </div>
      )}

      <div className="mb-3">
        <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Enabled Modules</label>
        <div className="grid grid-cols-2 gap-1.5">
          {FEATURE_KEYS.map(key => (
            <label key={key} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox" checked={features[key] !== false}
                onChange={e => setFeatures(f => ({ ...f, [key]: e.target.checked }))}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              {FEATURE_LABELS[key]}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={save} disabled={!dirty || saving}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save
        </button>
        <button
          onClick={toggleStatus}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
            branch.status === 'suspended' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
          }`}
        >
          {branch.status === 'suspended' ? <><CheckCircle2 className="size-3.5" /> Reactivate</> : <><Ban className="size-3.5" /> Suspend</>}
        </button>
      </div>
    </div>
  );
}

// ─── Add-branch inline form ──────────────────────────────────────────────────
function AddBranchForm({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [contractStart, setContractStart] = useState(todayStr());
  const [contractEnd, setContractEnd] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) { toast.error('Branch name is required'); return; }
    setSaving(true);
    const res = await SuperAdminController.createBranch({
      orgId, name, id: id || undefined, contractStart: contractStart || undefined, contractEnd: contractEnd || undefined,
    });
    setSaving(false);
    if (res.success) { toast.success('Branch created'); onDone(); }
    else toast.error(res.error || 'Failed to create branch');
  };

  return (
    <div className="border border-dashed border-indigo-200 rounded-xl p-4 bg-indigo-50/40 space-y-2.5">
      <p className="text-xs font-semibold text-indigo-700">New Branch</p>
      <div className="grid grid-cols-2 gap-2.5">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Branch name"
          className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400" />
        <input value={id} onChange={e => setId(e.target.value)} placeholder="branch_id (optional)"
          className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:border-indigo-400" />
        <input type="date" value={contractStart} onChange={e => setContractStart(e.target.value)}
          className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400" />
        <input type="date" value={contractEnd} onChange={e => setContractEnd(e.target.value)}
          className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400" />
      </div>
      <div className="flex gap-2">
        <button onClick={create} disabled={saving} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40">
          {saving ? 'Creating…' : 'Create Branch'}
        </button>
        <button onClick={onDone} className="px-3 py-1.5 text-gray-500 rounded-lg text-xs font-semibold hover:bg-gray-100">Cancel</button>
      </div>
      <p className="text-[10px] text-gray-400">Leave branch_id blank for a new branch. To register an existing restaurant already using a branch_id, enter that exact id.</p>
    </div>
  );
}

// ─── Copyable read-only field (invite result) ────────────────────────────────
function FieldCopy({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input readOnly value={value} onFocus={e => e.currentTarget.select()}
          className={`flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs bg-gray-50 ${mono ? 'font-mono' : ''}`} />
        <button onClick={() => { navigator.clipboard?.writeText(value); toast.success('Copied'); }}
          className="px-2.5 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600" title="Copy">
          <Copy className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Add-tenant modal (creates org + branch + admin login, emails the invite) ─
type InviteResult = { email: string; tempPassword: string; setPasswordUrl: string; emailSent: boolean };

function AddTenantModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [contractEnd, setContractEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);

  const create = async () => {
    if (!name.trim()) { toast.error('Tenant name is required'); return; }
    if (!email.trim()) { toast.error('Admin email is required'); return; }
    setSaving(true);
    const res = await SuperAdminController.inviteTenant({
      tenantName: name.trim(), email: email.trim(),
      contractStart: todayStr(), contractEnd: contractEnd || undefined,
    });
    setSaving(false);
    if (res.success && res.data) { setResult(res.data); onDone(); }
    else toast.error(res.error || 'Failed to create tenant');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-bold text-gray-900">{result ? 'Tenant created' : 'Add Tenant'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="size-4 text-gray-400" /></button>
        </div>

        {!result ? (
          <>
            <div className="p-5 space-y-3">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Restaurant / business name *" autoFocus
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400" />
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Tenant admin email *"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400" />
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Contract end (optional)</label>
                <input type="date" value={contractEnd} onChange={e => setContractEnd(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400" />
              </div>
              <p className="text-[11px] text-gray-400">Creates the organization, one branch, and the admin's login, then emails them a link to set their password.</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={create} disabled={saving} className="px-4 py-2 text-sm rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Creating…' : 'Create & Invite'}
              </button>
            </div>
          </>
        ) : (
          <div className="p-5 space-y-3">
            <div className={`text-xs font-semibold px-3 py-2 rounded-lg ${result.emailSent ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {result.emailSent ? `✓ Invite email sent to ${result.email}` : '⚠ Email could not be sent — share the details below with the tenant.'}
            </div>
            <FieldCopy label="Email" value={result.email} />
            <FieldCopy label="Temporary password" value={result.tempPassword} mono />
            <FieldCopy label="Set-password link" value={result.setPasswordUrl} mono />
            <p className="text-[11px] text-gray-400">The tenant can click the link to set their own password, or sign in with the temporary password and change it later.</p>
            <button onClick={onClose} className="w-full px-4 py-2.5 text-sm rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────
export function SuperAdminPanelView() {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<OrgWithBranches[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [addingBranchFor, setAddingBranchFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await SuperAdminController.listOrganizations();
    if (res.success) setOrgs(res.data!);
    else toast.error(res.error || 'Failed to load tenants');
    setLoading(false);
  }, []);

  useEffect(() => {
    SuperAdminController.isSuperAdmin().then(ok => {
      if (!ok) { navigate('/superadmin/login', { replace: true }); return; }
      void load();
    });
  }, [navigate, load]);

  const handleLogout = async () => {
    await SuperAdminController.logout();
    navigate('/superadmin/login', { replace: true });
  };

  const toggleOrgStatus = async (org: OrgWithBranches) => {
    const next = org.status === 'suspended' ? 'active' : 'suspended';
    const res = await SuperAdminController.setOrganizationStatus(org.id, next);
    if (res.success) { toast.success(`Organization ${next}`); void load(); }
    else toast.error(res.error || 'Update failed');
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="size-8 text-indigo-500 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-950 text-white">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-indigo-500 flex items-center justify-center"><ShieldCheck className="size-5" /></div>
            <div>
              <h1 className="font-black tracking-tight leading-none">Super Admin</h1>
              <p className="text-[11px] text-slate-400 mt-0.5">Tenant &amp; contract management</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/10">
            <LogOut className="size-4" /> Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Organizations</h2>
            <p className="text-sm text-gray-500">{orgs.length} tenant{orgs.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => setShowAddTenant(true)} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700">
            <Plus className="size-4" /> Add Tenant
          </button>
        </div>

        {orgs.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <Building2 className="size-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No tenants yet. Add your first organization to get started.</p>
          </div>
        ) : orgs.map(org => (
          <div key={org.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0"><Building2 className="size-4 text-indigo-600" /></div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{org.name}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {org.ownerName || '—'}{org.ownerEmail ? ` · ${org.ownerEmail}` : ''} · {org.branches.length} branch{org.branches.length !== 1 ? 'es' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${org.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {org.status === 'active' ? 'Active' : 'Suspended'}
                </span>
                <button onClick={() => toggleOrgStatus(org)} className="text-xs font-semibold text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-100">
                  {org.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                </button>
              </div>
            </div>

            <div className="p-5 space-y-3">
              {org.branches.map(b => <BranchCard key={b.id} branch={b} onChanged={load} />)}

              {addingBranchFor === org.id ? (
                <AddBranchForm orgId={org.id} onDone={() => { setAddingBranchFor(null); void load(); }} />
              ) : (
                <button onClick={() => setAddingBranchFor(org.id)} className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
                  <Plus className="size-4" /> Add Branch
                </button>
              )}
            </div>
          </div>
        ))}
      </main>

      {showAddTenant && <AddTenantModal onClose={() => setShowAddTenant(false)} onDone={() => { void load(); }} />}
    </div>
  );
}
