
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { OfflineSyncEngine } from './app/services/OfflineSyncEngine';

  // Start the offline sync background process
  OfflineSyncEngine.start();

  createRoot(document.getElementById("root")!).render(<App />);

  // Register Service Worker for Offline Resilience
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.error('ServiceWorker registration failed: ', err);
      });
    });
  }
  