/**
 * AlertOverlay.tsx
 *
 * Full-screen, beeping in-app alert. Mounted once at the app root; renders
 * nothing until an alert is pushed (waiter call / new pickup order). Beeps until
 * a staff member taps Acknowledge.
 */
import { useEffect } from 'react';
import { Bell, Package, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { AlertService, useAlerts, startBeeping, stopBeeping, unlockAudio, AppAlert } from '../services/AlertService';

export function AlertOverlay() {
  const alerts = useAlerts();

  // Beep while any alert is active.
  useEffect(() => {
    if (alerts.length > 0) startBeeping(); else stopBeeping();
  }, [alerts.length]);

  // Unlock audio on the first user interaction so the beep can play later.
  useEffect(() => {
    const unlock = () => unlockAudio();
    document.addEventListener('pointerdown', unlock);
    return () => document.removeEventListener('pointerdown', unlock);
  }, []);

  if (alerts.length === 0) return null;

  const acknowledge = async (a: AppAlert) => {
    // Acknowledging a table call also clears the table's "needs waiter" flag.
    if (a.kind === 'table' && a.tableId) {
      try { await supabase.from('tables').update({ needs_waiter: false }).eq('id', a.tableId); } catch { /* ignore */ }
    }
    AlertService.dismiss(a.id);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-3 max-h-[90vh] overflow-y-auto">
        {alerts.map(a => (
          <div key={a.id} className="bg-white rounded-3xl shadow-2xl p-6 text-center border-4 border-orange-400 animate-pulse">
            <div className="mx-auto mb-3 size-16 rounded-full bg-orange-100 flex items-center justify-center animate-bounce">
              {a.kind === 'table' ? <Bell className="size-8 text-orange-600" /> : <Package className="size-8 text-orange-600" />}
            </div>
            <h2 className="text-2xl font-black text-gray-900">{a.title}</h2>
            <p className="text-gray-600 mt-1 mb-5">{a.body}</p>
            <button
              onClick={() => acknowledge(a)}
              className="w-full py-3.5 bg-orange-500 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-2 active:scale-95 hover:bg-orange-600 transition-colors"
            >
              <Check className="size-5" /> Acknowledge
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
