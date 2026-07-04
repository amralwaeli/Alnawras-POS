
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { OfflineSyncEngine } from './app/services/OfflineSyncEngine';
  import { initSentry, AppErrorBoundary } from './lib/sentry';
  import { toast } from 'sonner';

  // Initialise error tracking before anything renders (no-op without a DSN).
  initSentry();

  // Start the offline sync background process
  OfflineSyncEngine.start();

  createRoot(document.getElementById("root")!).render(
    <AppErrorBoundary>
      <App />
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
  