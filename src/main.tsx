
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import { LicenseGate } from "./app/components/LicenseGate";
  import "./styles/index.css";
  import { OfflineSyncEngine } from './app/services/OfflineSyncEngine';
  import { initSentry, AppErrorBoundary } from './lib/sentry';
  import { toast } from 'sonner';

  // Initialise error tracking before anything renders (no-op without a DSN).
  initSentry();

  // Start the offline sync background process
  OfflineSyncEngine.start();

  // Never run inside another site's frame (click-jacking); GitHub Pages can't send
  // the X-Frame-Options header, so the page refuses here instead.
  if (window.top !== window.self) throw new Error('SmartPos cannot be shown inside another page.');

  createRoot(document.getElementById("root")!).render(
    <AppErrorBoundary>
      <LicenseGate><App /></LicenseGate>
    </AppErrorBoundary>
  );

  // Register Service Worker for offline resilience + automatic updates.
  // Use BASE_URL so the path is correct under the GitHub Pages sub-path
  // (e.g. /Alnawras-POS/sw.js); '/sw.js' would 404 there and never register.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = `${import.meta.env.BASE_URL}sw.js`;
      // Was the page already controlled? If so, a later controllerchange means
      // an UPDATE took over (reload to apply). On first install there is no
      // prior controller, so we must not reload (avoids a needless refresh).
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register(swUrl).then(reg => {
        // Check for a newer service worker on every launch so updates roll out
        // without a reinstall.
        reg.update();
        // Keep every screen on the device for offline use (see sw.js 'precache').
        const keepOffline = () => {
          if (!navigator.onLine) return;
          const current = (document.querySelector('script[type="module"][src]') as HTMLScriptElement | null)?.src;
          navigator.serviceWorker.ready.then(r => r.active?.postMessage({ type: 'precache', current }));
        };
        keepOffline();
        window.addEventListener('online', keepOffline);

        // Tablets stay open for days and never reload, so they kept printing with old code.
        // Every 10 minutes (and when the app comes back to the screen) look for a newer build;
        // load it when the app reopens/returns to the screen, or after 5 idle minutes — never
        // while someone is using the screen, so an order being entered isn't lost.
        const scriptPath = (src?: string | null) => (src ? new URL(src, location.href).pathname : '');
        const running = scriptPath((document.querySelector('script[type="module"][src]') as HTMLScriptElement | null)?.src);
        let updateReady = false;
        let lastTouch = Date.now();
        ['pointerdown', 'keydown'].forEach(e => window.addEventListener(e, () => { lastTouch = Date.now(); }, { passive: true }));
        const checkForUpdate = async () => {
          if (updateReady || !navigator.onLine || !running) return;
          try {
            const html = await (await fetch(`${import.meta.env.BASE_URL}index.html`, { cache: 'no-store' })).text();
            const latest = scriptPath(/<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(html)?.[1]);
            if (latest && latest !== running) {
              updateReady = true;
              keepOffline();   // download the new build's screens now
              toast('A new version is ready', {
                description: 'It loads by itself when the screen is idle.',
                action: { label: 'Update now', onClick: () => window.location.reload() },
                duration: Infinity,
              });
            }
          } catch { /* offline or GitHub unreachable: try again later */ }
        };
        const busy = () => Date.now() - lastTouch < 5 * 60_000
          || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '');
        setInterval(() => {
          void checkForUpdate();
          if (updateReady && !busy()) window.location.reload();
        }, 60_000 * 10);
        setInterval(() => { if (updateReady && !busy()) window.location.reload(); }, 60_000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible') return;
          if (updateReady) window.location.reload(); else void checkForUpdate();
        });
        let prompted = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          // A new version took over. Do NOT auto-reload — that would wipe an
          // in-progress order/payment. Prompt the user to refresh when ready.
          if (prompted || !hadController) return;
          prompted = true;
          toast('A new version is available', {
            description: 'Finish any open order, then refresh to update.',
            action: { label: 'Refresh now', onClick: () => window.location.reload() },
            duration: Infinity,
          });
        });
      }).catch(err => {
        console.error('ServiceWorker registration failed: ', err);
      });
    });
  }
  