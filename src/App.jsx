import { Toaster } from "@/components/ui/toaster"
import { Toaster as Sonner } from "sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { DEMO_ONLY } from '@/api/base44Client';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

/**
 * Routing. Visitors without an account get the app in demo mode (AuthContext
 * decides that before anything renders). The auth pages exist for the owner
 * only: nothing links to them and there is no register page, so nobody can
 * create an account from the UI.
 */
const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError?.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  return (
    <Routes>
      {!DEMO_ONLY && <Route path="/login" element={<Login />} />}
      {!DEMO_ONLY && <Route path="/forgot-password" element={<ForgotPassword />} />}
      {!DEMO_ONLY && <Route path="/reset-password" element={<ResetPassword />} />}
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <Sonner position="top-right" theme="dark" />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
