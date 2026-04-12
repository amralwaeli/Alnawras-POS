import { useState } from 'react';
import { RouterProvider } from 'react-router';
import { POSProvider, usePOS } from './context/POSContext';
import { router } from './routes';
import { LoginView } from './views/LoginView';

function AppContent() {
  const { currentUser } = usePOS();
  const [hasLoggedIn, setHasLoggedIn] = useState(false);

  if (!currentUser && !hasLoggedIn) {
    return <LoginView onLoginSuccess={() => setHasLoggedIn(true)} />;
  }

  if (!currentUser) {
    return <LoginView onLoginSuccess={() => setHasLoggedIn(true)} />;
  }

  return <RouterProvider router={router} />;
}

export default function App() {
  return (
    <POSProvider>
      <AppContent />
    </POSProvider>
  );
}