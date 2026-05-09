import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { getSupabase, safeDb } from '@/lib/supabase';
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
   membership: any | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  traceId: string;
  login: (email: string, password?: string) => Promise<any>;
  signup: (email: string, password?: string, companyName?: string) => Promise<any>;
  loginWithGoogle: () => Promise<void>;
  loginWithMeta: () => Promise<void>;
  logout: () => Promise<void>;
  refreshContext: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>('INITIALIZING');
  const [user, setUser] = useState<User | null>(null);
   const [company, setCompany] = useState<Company | null>(null);
   const [membership, setMembership] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const traceId = useMemo(() => Math.random().toString(36).substring(2, 15), []);

  const handleAuthFailure = useCallback((msg: string, logError = true) => {
    if (logError) logger.error(msg, { traceId });
    setError(msg);
    setState('UNAUTHENTICATED');
    setUser(null);
    setCompany(null);
  }, [traceId]);

  const ensureTenantContext = useCallback(async (supabaseUser: SupabaseUser, supabaseClient = getSupabase()) => {
    logger.info('AuthTrace: Self-healing tenant context', { userId: supabaseUser.id, traceId });
    
    try {
      const compName = supabaseUser.user_metadata?.company_name || 'My Enterprise';
      const compSlug = `workspace-${supabaseUser.id.substring(0, 5)}-${Math.floor(Math.random() * 1000)}`;
      
      const { data: companyData, error: companyError } = await supabaseClient
        .from('companies')
        .insert({ name: compName, slug: compSlug })
        .select()
        .single();

      if (companyError) {
        const { data: existingMemb } = await supabaseClient.from('memberships').select('company_id').eq('user_id', supabaseUser.id).maybeSingle();
        if (existingMemb) return true;
        throw companyError;
      }

      const { error: memberError } = await supabaseClient
        .from('memberships')
        .insert({
          company_id: companyData.id,
          user_id: supabaseUser.id,
          role: 'owner'
        });

      if (memberError) throw memberError;

      logger.info('AuthTrace: Self-healing complete', { companyId: companyData.id, traceId });
      return true;
    } catch (err: any) {
      logger.error('AuthTrace: Self-healing failed', { error: err.message, traceId });
      return false;
    }
  }, [traceId]);

  const loadTenantContext = useCallback(async (supabaseUser: SupabaseUser, supabaseClient = getSupabase()) => {
    setState('TENANT_LOADING');
    const requestId = Math.random().toString(36).substring(2, 7);
    
    try {
      logger.info('Loading tenant context', { userId: supabaseUser.id, traceId, requestId });
      
      // 1. Profiles
      logger.info('AuthTrace: Fetching profile', { userId: supabaseUser.id, traceId, requestId });
      const { data: profile, error: profileError } = await supabaseClient
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
      logger.info('AuthTrace: Fetching membership', { userId: supabaseUser.id, traceId, requestId });
      const { data: membership, error: membershipError } = await supabaseClient
        .from('memberships')
        .select('*, companies(*)')
        .eq('user_id', supabaseUser.id)
        .limit(1)
        .maybeSingle();

      if (membershipError) throw membershipError;

      if (!membership || !membership.companies || (Array.isArray(membership.companies) && membership.companies.length === 0)) {
        logger.warn('AuthTrace: No membership found, attempting self-healing', { userId: supabaseUser.id, traceId });
        
        const healed = await ensureTenantContext(supabaseUser, supabaseClient);
        if (healed) {
          // Retry once
          const { data: retryMemb } = await supabaseClient
            .from('memberships')
            .select('*, companies(*)')
            .eq('user_id', supabaseUser.id)
            .limit(1)
            .maybeSingle();
            
          if (retryMemb?.companies) {
            setCompany({
              id: retryMemb.companies.id,
              name: retryMemb.companies.name,
              slug: retryMemb.companies.slug
            });
            setState('READY');
            return;
          }
        }

        logger.error('AuthTrace: User authenticated but no tenant context even after healing', { userId: supabaseUser.id, traceId });
        setState('READY'); // Let the UI handle company === null
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
    
    const initSession = async () => {
      try {
        const supabaseClient = getSupabase();
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError) throw sessionError;
        
        if (session?.user && mounted) {
          await loadTenantContext(session.user, supabaseClient);
        } else if (mounted) {
          setState('UNAUTHENTICATED');
        }
      } catch (err: any) {
        handleAuthFailure(`Initialization error: ${err.message}`);
      }
    };

    initSession();

    const supabaseClient = getSupabase();
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(async (event: any, session: any) => {
      logger.info('Supabase Auth Event', { event, traceId });
      if (!mounted) return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) await loadTenantContext(session.user, supabaseClient);
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

  const login = async (email: string, password?: string): Promise<any> => {
    setState('AUTHENTICATING');
    const loadingToast = toast.loading('Authenticating credentials...');
    
    try {
      const { data, error } = await getSupabase().auth.signInWithPassword({
        email,
        password: password || '',
      });
      
      if (error) {
        toast.error(error.message, { id: loadingToast });
        throw error;
      }
      
      logger.info('AuthTrace: Login successful', { email, traceId });
      toast.success('Successfully signed in', { id: loadingToast });
      return data;
    } catch (err: any) {
      handleAuthFailure(err.message, false);
      throw err;
    }
  };

  const signup = async (email: string, password?: string, companyName?: string): Promise<any> => {
    setState('AUTHENTICATING');
    const loadingToast = toast.loading('Creating enterprise account...');
    
    try {
      const { data, error } = await getSupabase().auth.signUp({
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
      
      logger.info('AuthTrace: Signup successful', { email, traceId });
      toast.success('Account created successfully', { id: loadingToast });
      
      if (data.session) {
        await loadTenantContext(data.user!, getSupabase());
      } else {
        setState('UNAUTHENTICATED');
      }
      return data;
    } catch (err: any) {
      handleAuthFailure(err.message, false);
      throw err;
    }
  };

  const loginWithGoogle = async () => {
    setState('AUTHENTICATING');
    try {
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/dashboard',
          queryParams: { access_type: 'offline', prompt: 'consent' }
        }
      });
      if (error) throw error;
    } catch (err: any) {
      handleAuthFailure(`Google OAuth failed: ${err.message}`);
    }
  };

  const loginWithMeta = async () => {
    setState('AUTHENTICATING');
    try {
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          redirectTo: window.location.origin + '/dashboard'
        }
      });
      if (error) throw error;
    } catch (err: any) {
      handleAuthFailure(`Meta OAuth failed: ${err.message}`);
    }
  };

  const logout = async () => {
    const loadingToast = toast.loading('Terminating session...');
    try {
      await getSupabase().auth.signOut();
      toast.success('Signed out successfully', { id: loadingToast });
    } catch (err: any) {
      toast.error('Sign out error', { id: loadingToast });
    }
  };

  const refreshContext = async () => {
    const supabaseClient = getSupabase();
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.user) await loadTenantContext(session.user, supabaseClient);
  };

  const value = {
    state,
    user,
     company,
     membership,
   isAuthenticated: state === 'AUTHENTICATED' || state === 'TENANT_LOADING' || state === 'READY',
   isReady: state === 'READY',
   isLoading: state === 'INITIALIZING' || state === 'AUTHENTICATING' || state === 'TENANT_LOADING',
    error,
    traceId,
    login,
    signup,
    loginWithGoogle,
    loginWithMeta,
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
