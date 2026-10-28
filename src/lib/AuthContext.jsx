import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44, enableDemoMode, signIn, DEMO_ONLY, isSharedSandbox } from '@/api/base44Client';
import { seedDemo } from '@/lib/demoSeed';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }
  const [isDemo, setIsDemo] = useState(false);

  // Demo mode: a visitor without an account gets a sandbox in their own browser.
  const enterDemo = async () => {
    enableDemoMode();
    if (!isSharedSandbox()) {
      // The shared sandbox is seeded by the server job; a private one is seeded here.
      try {
        await seedDemo(base44);
      } catch (err) {
        console.warn('Demo seed skipped:', err?.message || err);
      }
    }
    setIsDemo(true);
    setUser(null);
    setIsAuthenticated(false);
    setAuthError(null);
    setIsLoadingAuth(false);
    setIsLoadingPublicSettings(false);
  };

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    if (DEMO_ONLY) {
      await enterDemo();
      return;
    }
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      // First, check app public settings (with token if available)
      // This will tell us if auth is required, user not registered, etc.
      const appClient = createAxiosClient({
        baseURL: `/api/apps/public`,
        headers: {
          'X-App-Id': appParams.appId
        },
        token: appParams.token, // Include token if available
        interceptResponses: true
      });
      
      try {
        const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
        setAppPublicSettings(publicSettings);
        
        // If we got the app public settings successfully, check if user is authenticated
        if (appParams.token) {
          await checkUserAuth();
          setIsLoadingPublicSettings(false);
        } else {
          await enterDemo();
        }
      } catch (appError) {
        console.error('App state check failed:', appError);
        
        // Handle app-level errors
        const reason = appError.status === 403 ? appError.data?.extra_data?.reason : null;
        if (reason === 'user_not_registered') {
          setAuthError({
            type: 'user_not_registered',
            message: 'User not registered for this app'
          });
          setIsLoadingPublicSettings(false);
          setIsLoadingAuth(false);
        } else {
          // auth_required, a missing token, or an unreachable backend all lead to the demo.
          await enterDemo();
        }
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      
      // An expired or invalid token is treated like no token: demo mode, with Sign in in the banner.
      if (error.status === 401 || error.status === 403) {
        await enterDemo();
      }
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    // Always the real Base44 login, even while the app runs in demo mode.
    signIn();
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      isDemo,
      logout,
      navigateToLogin,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
