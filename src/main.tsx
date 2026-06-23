
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { OfflineSyncEngine } from './app/services/OfflineSyncEngine';
  import { initSentry, AppErrorBoundary } from './lib/sentry';

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
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing || !hadController) return;
          refreshing = true;
          window.location.reload();
        });
      }).catch(err => {
        console.error('ServiceWorker registration failed: ', err);
      });
    });
  }
  