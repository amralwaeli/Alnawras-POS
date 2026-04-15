import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { supabase } from '../../lib/supabase';
import { Spinner } from 'lucide-react';

export function TableRedirectView() {
  const { tableNumber, tableSlug } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const redirect = async () => {
      const slug = tableNumber ?? tableSlug ?? '';
      const numeric = Number(slug.toString().replace(/^table[-_]?/i, ''));
      if (!numeric || Number.isNaN(numeric)) {
        setError('Invalid table link.');
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('tables')
        .select('id')
        .eq('number', numeric)
        .single();

      if (fetchError || !data) {
        setError('Table not found for this QR link.');
        return;
      }

      navigate(`/table/${data.id}`, { replace: true });
    };

    void redirect();
  }, [navigate, tableNumber, tableSlug]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-3xl bg-white p-8 shadow-lg text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Link Redirect Failed</h1>
          <p className="text-sm text-slate-500 mb-6">{error}</p>
          <button onClick={() => navigate('/')} className="rounded-full bg-orange-500 px-5 py-3 text-sm font-bold text-white hover:bg-orange-600 transition">Go Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="inline-flex items-center gap-3 rounded-3xl bg-white px-8 py-6 shadow-lg">
        <Spinner className="size-6 text-orange-500 animate-spin" />
        <span className="text-slate-700 font-semibold">Redirecting to your table…</span>
      </div>
    </div>
  );
}
