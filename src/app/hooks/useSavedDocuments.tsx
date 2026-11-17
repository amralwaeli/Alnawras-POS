import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { fmt } from '../../lib/currency';
import { friendlyError } from '../../lib/errors';
import { usePOS } from '../context/POSContext';

export type DocKind = 'invoice' | 'quotation';
export interface SavedDoc { id: string; number: string; customer_name: string | null; total: number; created_at: string; data: any }

/**
 * Invoices/quotations are saved on the server with the branch's next number
 * (INV-0001, QUO-0001 — migration 0035). Printing the same content again does
 * not save a second copy; printing after a change saves a new numbered document.
 */
export function useSavedDocuments(kind: DocKind) {
  const { currentUser } = usePOS();
  const [recent, setRecent] = useState<SavedDoc[]>([]);
  const savedContent = useRef<string | null>(null);
  const savedNumber = useRef<string | null>(null);
  const inFlight = useRef<Promise<string | null> | null>(null);

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('documents')
      .select('id, number, customer_name, total, created_at, data')
      .eq('kind', kind).order('created_at', { ascending: false }).limit(30);
    setRecent((data ?? []) as SavedDoc[]);
  }, [kind]);
  useEffect(() => { if (currentUser) refresh(); }, [currentUser?.branchId, refresh]);

  /** The number for this content: the existing one if unchanged, else a newly saved one; null if saving failed. */
  const save = (content: object): Promise<string | null> => {
    // A double-click on Print must not save two numbered copies.
    if (!inFlight.current) inFlight.current = doSave(content).finally(() => { inFlight.current = null; });
    return inFlight.current;
  };
  const doSave = async (content: object): Promise<string | null> => {
    const key = JSON.stringify(content);
    if (key === savedContent.current && savedNumber.current) return savedNumber.current;
    if (!currentUser) return null;
    const { data, error } = await supabase.rpc('save_document', {
      p_branch_id: currentUser.branchId, p_kind: kind, p_data: content,
      p_created_by: currentUser.id, p_created_by_name: currentUser.name,
    });
    if (error || !data?.number) {
      toast.error(friendlyError(error?.message, `Could not save the ${kind}. Check the connection and try again.`));
      return null;
    }
    savedContent.current = key;
    savedNumber.current = data.number;
    refresh();
    return data.number as string;
  };

  /** After loading a saved document into the form: reprinting it must not save a copy. */
  const markSaved = (content: object, number: string) => {
    savedContent.current = JSON.stringify(content);
    savedNumber.current = number;
  };

  const isSaved = (content: object) => savedContent.current === JSON.stringify(content);

  return { recent, save, markSaved, isSaved };
}

export function SavedDocumentsList({ title, docs, onOpen }: { title: string; docs: SavedDoc[]; onOpen: (d: SavedDoc) => void }) {
  if (docs.length === 0) return null;
  return (
    <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-sm">
      <h2 className="text-base sm:text-lg font-semibold mb-3 text-gray-800">{title}</h2>
      <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
        {docs.map(d => (
          <li key={d.id}>
            <button type="button" onClick={() => onOpen(d)}
              className="w-full flex items-center justify-between gap-3 py-2 text-left text-sm hover:bg-gray-50 rounded px-1">
              <span className="font-mono font-semibold text-gray-900 shrink-0">{d.number}</span>
              <span className="flex-1 truncate text-gray-600">{d.customer_name || '—'}</span>
              <span className="text-gray-900 shrink-0">{fmt(Number(d.total))}</span>
              <span className="text-gray-400 text-xs shrink-0">{new Date(d.created_at).toLocaleDateString('en-GB')}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
