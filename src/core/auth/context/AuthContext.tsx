import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { logger } from '@/core/observability/logger';
import { toast } from 'sonner';

export type AuthState = 
  | 'INITIALIZING'
  | 'UNAUTHENTICATED'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED'
  | 'TENANT_LOADING'
  | 'READY'
  | 'ERROR';

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
}

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface AuthContextType {
  state: AuthState;
  user: User | null;
  company: Company | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  traceId: string;
  login: (email: string, password?: string) => Promise<void>;
  signup: (email: string, password?: string, companyName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshContext: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>('INITIALIZING');
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState<string | null>(null);
  const traceId = useMemo(() => Math.random().toString(36).substring(2, 15), []);

  const handleAuthFailure = useCallback((msg: string, logError = true) => {
    if (logError) logger.error(msg, { traceId });
    setError(msg);
    setState('UNAUTHENTICATED');
    setUser(null);
    setCompany(null);
  }, [traceId]);

  const loadTenantContext = useCallback(async (supabaseUser: SupabaseUser) => {
    setState('TENANT_LOADING');
    const requestId = Math.random().toString(36).substring(2, 7);
    
    try {
      logger.info('Loading tenant context', { userId: supabaseUser.id, traceId, requestId });
      
      // 1. Profiles
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', supabaseUser.id)
        .maybeSingle();

      if (profileError) throw profileError;

      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        name: profile?.full_name || supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'User',
        avatar_url: profile?.avatar_url || supabaseUser.user_metadata?.avatar_url
      });

      // 2. Memberships + Companies
      const { data: membership, error: membershipError } = await supabase
        .from('memberships')
        .select('*, companies(*)')
        .eq('user_id', supabaseUser.id)
        .limit(1)
        .maybeSingle();

      if (membershipError) throw membershipError;

      if (!membership || !membership.companies) {
        logger.warn('User has no company membership', { userId: supabaseUser.id, traceId });
        setState('READY'); // User is authenticated but has no tenant. UI handles this.
        return;
      }

      setCompany({
        id: membership.companies.id,
        name: membership.companies.name,
        slug: membership.companies.slug
      });

      setState('READY');
      logger.info('Auth lifecycle complete: READY', { companyId: membership.companies.id, traceId });
    } catch (err: any) {
      logger.error('Failed to load tenant context', { error: err.message, traceId });
      setError(`Context load failed: ${err.message}`);
      setState('ERROR');
    }
  }, [traceId]);

  useEffect(() => {
    let mounted = true;
    
    if (!supabase) {
      setState('ERROR');
      setError('Supabase configuration missing');
      return;
    }

    const initSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        
        if (session?.user && mounted) {
          await loadTenantContext(session.user);
        } else if (mounted) {
          setState('UNAUTHENTICATED');
        }
      } catch (err: any) {
        handleAuthFailure(`Initialization error: ${err.message}`);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: any, session: any) => {
      logger.info('Supabase Auth Event', { event, traceId });
      if (!mounted) return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) await loadTenantContext(session.user);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setCompany(null);
        setState('UNAUTHENTICATED');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadTenantContext, handleAuthFailure, traceId]);

  const login = async (email: string, password?: string) => {
    setState('AUTHENTICATING');
    const loadingToast = toast.loading('Authenticating credentials...');
    
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: password || '',
      });
      
      if (error) {
        toast.error(error.message, { id: loadingToast });
        throw error;
      }
      
      toast.success('Successfully signed in', { id: loadingToast });
    } catch (err: any) {
      handleAuthFailure(err.message, false);
      throw err;
    }
  };

  const signup = async (email: string, password?: string, companyName?: string) => {
    setState('AUTHENTICATING');
    const loadingToast = toast.loading('Creating enterprise account...');
    
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password: password || '',
        options: {
          data: {
            full_name: email.split('@')[0],
            company_name: companyName,
          },
          emailRedirectTo: window.location.origin + '/dashboard',
        }
      });
      
      if (error) {
        toast.error(error.message, { id: loadingToast });
        throw error;
      }
      
      toast.success('Account created. Please check your email.', { id: loadingToast });
      setState('UNAUTHENTICATED'); // Wait for verification
    } catch (err: any) {
      handleAuthFailure(err.message, false);
      throw err;
    }
  };

  const logout = async () => {
    const loadingToast = toast.loading('Terminating session...');
    try {
      await supabase.auth.signOut();
      toast.success('Signed out successfully', { id: loadingToast });
    } catch (err: any) {
      toast.error('Sign out error', { id: loadingToast });
    }
  };

  const refreshContext = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) await loadTenantContext(session.user);
  };

  const value = {
    state,
    user,
    company,
    isAuthenticated: state === 'AUTHENTICATED' || state === 'TENANT_LOADING' || state === 'READY',
    isReady: state === 'READY',
    isLoading: state === 'INITIALIZING' || state === 'AUTHENTICATING' || state === 'TENANT_LOADING',
    error,
    traceId,
    login,
    signup,
    logout,
    refreshContext
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
