import { useEffect, useState } from 'react';
import { HardDrive, Download } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { friendlyError } from '../../../lib/errors';

/**
 * Supabase Free plan use (database 500 MB, files 1 GB) and the archived months
 * (migration 0039). Above 80% the database archives months older than the last 6
 * automatically each month; each archived month can be downloaded here.
 */
interface Usage { db_bytes: number; db_limit: number; storage_bytes: number; storage_limit: number }
interface ArchivedMonth { month: string; order_count: number; revenue: number }

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB`;

export function FreePlanUsage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [months, setMonths] = useState<ArchivedMonth[]>([]);

  useEffect(() => {
    supabase.rpc('db_usage').then(({ data }) => { if (data) setUsage(data as Usage); });
    supabase.from('order_archive').select('month, order_count, revenue').order('month', { ascending: false })
      .then(({ data }) => setMonths((data ?? []) as ArchivedMonth[]));
  }, []);

  const download = async (month: string) => {
    const { data, error } = await supabase.from('order_archive').select('data').eq('month', month).single();
    if (error || !data) { toast.error(friendlyError(error, 'Could not download that month')); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data.data, null, 1)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `orders-${month.slice(0, 7)}.json` });
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!usage) return null;
  const dbPct = Math.round((usage.db_bytes / usage.db_limit) * 100);
  const filePct = Math.round((usage.storage_bytes / usage.storage_limit) * 100);
  const warn = dbPct >= 80 || filePct >= 80;

  return (
    <div className={`rounded-2xl p-4 border ${warn ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="flex items-center gap-2 font-bold text-gray-800"><HardDrive className="size-4" /> Free plan use</span>
        <span className={dbPct >= 80 ? 'text-amber-700 font-semibold' : 'text-gray-600'}>Database {mb(usage.db_bytes)} of {mb(usage.db_limit)} ({dbPct}%)</span>
        <span className={filePct >= 80 ? 'text-amber-700 font-semibold' : 'text-gray-600'}>Files {mb(usage.storage_bytes)} of 1 GB ({filePct}%)</span>
      </div>
      {warn && (
        <p className="text-xs text-amber-800 mt-2">
          Close to the free limit. Paid bills older than 6 months are archived automatically on the 1st of each month; download them below.
        </p>
      )}
      {months.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {months.map(m => (
            <button key={m.month} onClick={() => download(m.month)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50">
              <Download className="size-3.5" /> {m.month.slice(0, 7)} · {m.order_count} bills
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
