import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { POSProvider, usePOS } from './context/POSContext';
import { router } from './routes';
import { LoginView } from './modules/auth';
import { checkSupabaseConnection } from '../lib/supabase';

function AppContent() {
  const { currentUser } = usePOS();
  if (!currentUser) return <LoginView onLoginSuccess={() => {}} />;
  return <RouterProvider router={router} />;
}

export default function App() {
  const [supabaseOk, setSupabaseOk] = useState<boolean | null>(null);

  useEffect(() => {
    checkSupabaseConnection().then(setSupabaseOk);
  }, []);

  return (
    <POSProvider>
      {supabaseOk === false && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: '#f59e0b', color: '#1c1917', padding: '6px 16px',
          fontSize: '13px', textAlign: 'center',
        }}>
          ⚠️ Supabase connection failed — check your API key in .env and rebuild.
        </div>
      )}
      <AppContent />
    </POSProvider>
  );
}
