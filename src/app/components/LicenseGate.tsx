import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getSavedServer, switchServer } from '../../lib/serverConfig';
import { verifyLicense, projectRef, type SignedLicense } from '../../lib/license';

/**
 * A device on a one-time customer's own server only runs when that server holds a genuine
 * licence for that exact project (lib/license). The last good licence is remembered, so a
 * licensed device keeps working offline. Devices on the main SmartPos server skip this.
 */
export function LicenseGate({ children }: { children: ReactNode }) {
  const own = getSavedServer();
  const [state, setState] = useState<'checking' | 'ok' | 'unlicensed' | 'offline'>(own ? 'checking' : 'ok');

  useEffect(() => {
    if (!own) return;
    const ref = projectRef(own.url);
    const cacheKey = `smartpos_license_${ref}`;
    const cached = (() => { try { return JSON.parse(localStorage.getItem(cacheKey) || 'null') as SignedLicense | null; } catch { return null; } })();
    (async () => {
      const { data, error } = await supabase.from('smartpos_license').select('payload, sig').maybeSingle();
      if (error) {
        // Couldn't ask the server (offline): trust the last licence this device verified.
        setState(await verifyLicense(cached, ref) ? 'ok' : 'offline');
        return;
      }
      if (await verifyLicense(data as SignedLicense | null, ref)) {
        try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch { /* ignore */ }
        setState('ok');
      } else {
        try { localStorage.removeItem(cacheKey); } catch { /* ignore */ }
        setState('unlicensed');
      }
    })();
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'ok') return <>{children}</>;
  if (state === 'checking') {
    return <div className="min-h-dvh flex items-center justify-center bg-[#0B0E14]"><Loader2 className="size-8 text-orange-500 animate-spin" /></div>;
  }
  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#0B0E14] p-4">
      <div className="w-full max-w-sm bg-[#161B22] border border-gray-800 rounded-2xl p-6 text-center space-y-4">
        <ShieldAlert className="size-10 text-orange-500 mx-auto" />
        <h1 className="text-lg font-black text-white">
          {state === 'offline' ? 'Connect to the internet once' : 'This copy of SmartPos is not licensed'}
        </h1>
        <p className="text-sm text-gray-400">
          {state === 'offline'
            ? 'This device needs to check its SmartPos licence once. Connect to the internet and open the app again.'
            : 'The server this device is connected to has no valid SmartPos licence. Please contact SmartPos.'}
        </p>
        <button onClick={() => { switchServer(null); window.location.reload(); }}
          className="w-full min-h-11 rounded-xl border border-gray-700 text-gray-300 text-sm">
          Use the SmartPos server
        </button>
      </div>
    </div>
  );
}
