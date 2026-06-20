/**
 * AlertService.ts
 *
 * In-app, attention-grabbing alerts that stay on screen and BEEP until a staff
 * member acknowledges them (used for waiter calls and new pickup orders).
 * No system-tray notification, no native plugin — a full-screen overlay plus a
 * Web-Audio beep loop.
 */
import { useEffect, useReducer } from 'react';

export interface AppAlert {
  id: string;                 // stable id, e.g. `table-<id>` — used to de-dupe
  kind: 'table' | 'pickup';
  title: string;
  body: string;
  tableId?: string;           // for table calls — cleared on acknowledge
}

let alerts: AppAlert[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const AlertService = {
  push(a: AppAlert) {
    if (alerts.some(x => x.id === a.id)) return; // already showing this one
    alerts = [...alerts, a];
    emit();
  },
  dismiss(id: string) {
    if (!alerts.some(x => x.id === id)) return;
    alerts = alerts.filter(a => a.id !== id);
    emit();
  },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

/** React hook returning the live list of active alerts. */
export function useAlerts(): AppAlert[] {
  const [, force] = useReducer(x => x + 1, 0);
  useEffect(() => AlertService.subscribe(force), []);
  return alerts;
}

// ── Beeper (Web Audio — no sound file needed) ──────────────────────────────────
let audioCtx: any = null;
let beepTimer: any = null;

/** Create/resume the audio context. Browsers need a prior user gesture, so this
 *  is also wired to the first tap (see AlertOverlay) to "unlock" audio. */
export function unlockAudio() {
  try {
    if (!audioCtx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* ignore */ }
}

function beepOnce() {
  unlockAudio();
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.value = 880;
    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + 0.32);
  } catch { /* ignore */ }
}

export function startBeeping() {
  if (beepTimer) return;
  beepOnce();
  beepTimer = setInterval(beepOnce, 1100);
}

export function stopBeeping() {
  if (beepTimer) { clearInterval(beepTimer); beepTimer = null; }
}
