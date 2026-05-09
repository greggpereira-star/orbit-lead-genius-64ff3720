 import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
 import { getSupabase } from '@/lib/supabase';
 import { User as SupabaseUser } from '@supabase/supabase-js';
import { logger } from '@/core/observability/logger';
import { toast } from 'sonner';
  import { AuthState, UserProfile, Company, Membership } from '../types/index';
  import { WorkspaceOrchestrator } from '../services/WorkspaceOrchestrator';

interface AuthContextType {
  state: AuthState;
   user: UserProfile | null;
   company: Company | null;
    membership: Membership | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  traceId: string;
   login: (email: string, password?: string, retryCount?: number) => Promise<any>;
    signup: (email: string, password: string, companyName: string) => Promise<any>;
    resendVerificationEmail: (email: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithMeta: () => Promise<void>;
  logout: () => Promise<void>;
  refreshContext: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

 export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
   const [envError, setEnvError] = useState<string | null>(null);
   const [state, setState] = useState<AuthState>('IDLE');
   const [user, setUser] = useState<UserProfile | null>(null);
   const [company, setCompany] = useState<Company | null>(null);
    const [membership, setMembership] = useState<Membership | null>(null);
  const [error, setError] = useState<string | null>(null);
  const traceId = useMemo(() => {
    if (typeof window !== 'undefined' && (window as any)._traceId) return (window as any)._traceId;
    const id = Math.random().toString(36).substring(2, 15);
    if (typeof window !== 'undefined') (window as any)._traceId = id;
    return id;
  }, []);
    const orchestratorRef = useRef<WorkspaceOrchestrator | null>(null);
    const isOrchestrating = useRef<string | null>(null);

    const SCHEMA_VERSION = 'v1';
    const CACHE_KEY = 'workspace_readiness_snapshot';

    const checkWorkspaceReadiness = useCallback((tenantId?: string) => {
      if (typeof window === 'undefined') return false;
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return false;
      
      try {
        const snapshot = JSON.parse(cached);
        if (snapshot.version !== SCHEMA_VERSION) return false;
        if (tenantId && snapshot.tenant_id !== tenantId) return false;
        if (snapshot.expires_at && Date.now() > snapshot.expires_at) return false;
        return snapshot.workspace_ready === true;
      } catch {
        return false;
      }
    }, [SCHEMA_VERSION]);

    const markWorkspaceAsReady = useCallback((userId: string, tenant_id: string, membership_id: string) => {
      if (typeof window === 'undefined') return;
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        user_id: userId,
        tenant_id,
        membership_id,
        workspace_ready: true,
        onboarding_completed: true,
        permissions_ready: true,
        validated_at: Date.now(),
        expires_at: Date.now() + (1000 * 60 * 60 * 24 * 7), // 7 days
        version: SCHEMA_VERSION
      }));
    }, [SCHEMA_VERSION]);

    const clearWorkspaceReady = useCallback(() => {
      if (typeof window === 'undefined') return;
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem('workspace_ready_v1');
    }, []);

  const handleAuthFailure = useCallback((msg: string, logError = true) => {
    if (logError) logger.error(msg, { traceId });
    setError(msg);
    setState('UNAUTHENTICATED');
    setUser(null);
    setCompany(null);
  }, [traceId]);

    const loadTenantContext = useCallback(async (supabaseUser: SupabaseUser) => {
      if (isOrchestrating.current === supabaseUser.id) {
        logger.info('AuthTrace: Orchestration already in progress for user, skipping.', { userId: supabaseUser.id });
        return;
      }

      const client = getSupabase();
      if (!orchestratorRef.current) {
        orchestratorRef.current = new WorkspaceOrchestrator(client, traceId);
      }
 
      try {
        isOrchestrating.current = supabaseUser.id;
        // Determine if we should show the full bootstrap UI
        const isReadyCache = checkWorkspaceReadiness();
        
        if (isReadyCache) {
          logger.info('WorkspaceReadinessCache: Hit. Skipping blocking bootstrap UI.', { traceId });
          setState('AUTHENTICATED');
        } else {
          setState('TENANT_VALIDATING');
        }

        const result = await (orchestratorRef.current as any).validateAndRepair(
          supabaseUser.id,
          supabaseUser.email || "",
          supabaseUser.user_metadata || {},
          (newState: AuthState) => setState(newState)
        );
 
        if (result.state === 'ERROR') {
          // Enhanced forensic logging for RLS failures
          if (result.error?.includes('row-level security policy') || result.error?.includes('schema cache')) {
             logger.fatal('Security Infrastructure Fault', { error: result.error, traceId });
          }
          
          // If we have a cache hit but orchestration failed, check if we should show recovery or onboarding
          const hasWorkspaceEvidence = checkWorkspaceReadiness() || result.membership !== null;
          
          if (hasWorkspaceEvidence) {
            logger.warn('Orchestration failed but workspace evidence exists. Entering Recovery Mode.', { traceId });
            setState('RECOVERY_MODE');
            setError(result.error);
          } else {
            logger.info('No workspace found after validation. Requiring onboarding.', { traceId });
            setState('ONBOARDING_REQUIRED');
          }
          return;
        }
 
        if (result.company?.id && result.user?.id && result.membership?.id) {
          markWorkspaceAsReady(result.user.id, result.company.id, result.membership.id);
        }

        setUser(result.user);
        setCompany(result.company);
        setMembership(result.membership);
        setState('READY');
       
       logger.info('Auth lifecycle complete: READY', { companyId: result.company?.id, traceId });
     } catch (err: any) {
       logger.error('Failed to orchestrate workspace', { error: err.message, traceId });
       setError(`Workspace bootstrap failed: ${err.message}`);
       setState('ERROR');
     }
   }, [traceId]);

  useEffect(() => {
    let mounted = true;
    
      const initSession = async () => {
        setState('BOOTSTRAP_START');
        try {
          const supabaseClient = getSupabase();
          
          // Optimized: Use enterprise-auth-v1 key to skip heavy session checks for cold starts
          const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('enterprise-auth-v1');
          
          if (!hasToken) {
            logger.info('AuthTrace: Cold start, skipping initial session check', { traceId });
            if (mounted) setState('UNAUTHENTICATED');
            return;
          }

          logger.info('AuthTrace: Auth token detected, initializing bootstrap', { traceId });
          setState('SESSION_LOADING');
          
          const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
          
          if (sessionError) {
            logger.error('AuthTrace: Session error', { error: sessionError.message, traceId });
            throw sessionError;
          }
          
          if (session?.user && mounted) {
            logger.info('AuthTrace: Session found, loading tenant', { userId: session.user.id, traceId });
            await loadTenantContext(session.user);
          } else if (mounted) {
            logger.info('AuthTrace: No active session', { traceId });
            setState('UNAUTHENTICATED');
          }
       } catch (err: any) {
         logger.error('AuthTrace: Initialization failed', { error: err.message, traceId });
         if (err.message.includes('configuration missing') || err.message.includes('required')) {
           setEnvError('Supabase configuration is missing. Please check your project settings and environment variables.');
           setState('ERROR');
         } else {
           handleAuthFailure(`Initialization error: ${err.message}`);
         }
       }
     };

    initSession();

    const supabaseClient = getSupabase();
    let subscription: any = null;
    
    const { data: { subscription: authSubscription } } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
      logger.info('Supabase Auth Event', { event, traceId });
      if (!mounted) return;

      switch (event) {
        case 'SIGNED_IN':
        case 'TOKEN_REFRESHED':
          if (session?.user) {
            await loadTenantContext(session.user);
          }
          break;
        case 'SIGNED_OUT':
          clearWorkspaceReady();
          setUser(null);
          setCompany(null);
          setMembership(null);
          setState('UNAUTHENTICATED');
          break;
        case 'USER_UPDATED':
          if (session?.user) await loadTenantContext(session.user);
          break;
      }
    });
    subscription = authSubscription;

    return () => {
      mounted = false;
       if (subscription) subscription.unsubscribe();
    };
  }, [loadTenantContext, handleAuthFailure, traceId]);

   const login = async (email: string, password?: string): Promise<any> => {
     setState('AUTHENTICATING');
     const loadingToast = toast.loading('Autenticando credenciais...');
     
     try {
       const { data, error } = await getSupabase().auth.signInWithPassword({
         email,
         password: password || '',
       });
       
       if (error) {
         if (error.message.includes('Email not confirmed')) {
           toast.info('E-mail ainda não confirmado. Verifique sua caixa de entrada.', { id: loadingToast });
           setState('EMAIL_SENT');
           // Set the user email for the verify screen even if not logged in
           setUser({ id: '', email, name: email.split('@')[0] });
           throw error;
         }
         toast.error(error.message, { id: loadingToast });
         throw error;
       }
       
       logger.info('AuthTrace: Login successful', { email, traceId });
       toast.success('Acesso liberado!', { id: loadingToast });
       return data;
     } catch (err: any) {
       if (err.message.includes('Email not confirmed')) {
         throw err;
       }
       handleAuthFailure(err.message, false);
       throw err;
     }
   };

   const signup = async (email: string, password: string, companyName: string): Promise<any> => {
     setState('CREATING_ACCOUNT');
     const loadingToast = toast.loading('Iniciando seu workspace enterprise...');
     
     try {
       logger.info('AuthTrace: Initiating signup sequence', { email, companyName, traceId });
       
       const { data, error } = await getSupabase().auth.signUp({
         email,
         password,
         options: {
           data: {
             full_name: email.split('@')[0],
             company_name: companyName,
           },
           emailRedirectTo: window.location.origin + '/auth/verify-email',
         }
       });
       
       if (error) {
         logger.error('AuthTrace: Signup failed', { error: error.message, traceId });
         toast.error(error.message, { id: loadingToast });
         setState('ERROR');
         throw error;
       }
       
       logger.info('AuthTrace: Signup success', { 
         userId: data.user?.id, 
         session: !!data.session,
         traceId 
       });
 
        if (data.session) {
          toast.success('Conta criada com sucesso!', { id: loadingToast });
          setState('EMAIL_CONFIRMED');
          await loadTenantContext(data.user!);
        } else {
         toast.success('Verifique seu e-mail para continuar', { id: loadingToast });
         setState('EMAIL_SENT');
       }
       
       return data;
     } catch (err: any) {
       handleAuthFailure(err.message, false);
       throw err;
     }
   };
 
   const resendVerificationEmail = async (email: string) => {
     logger.info('AuthTrace: Resending verification email', { email, traceId });
     try {
       const { error } = await getSupabase().auth.resend({
         type: 'signup',
         email,
       });
       if (error) throw error;
       toast.success('E-mail de verificação reenviado!');
     } catch (err: any) {
       logger.error('AuthTrace: Resend failed', { error: err.message, traceId });
       toast.error(`Falha ao reenviar: ${err.message}`);
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
        clearWorkspaceReady();
        await getSupabase().auth.signOut();
        toast.success('Signed out successfully', { id: loadingToast });
      } catch (err: any) {
        toast.error('Sign out error', { id: loadingToast });
      }
  };

  const refreshContext = async () => {
    const supabaseClient = getSupabase();
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.user) await loadTenantContext(session.user);
  };

  const value = {
    state,
    user,
     company,
     membership,
    isAuthenticated: ['READY', 'WORKSPACE_READY', 'DASHBOARD_BOOTSTRAP', 'AUTHENTICATED', 'RECOVERY_MODE', 'TENANT_VALIDATING'].includes(state as string),
    isReady: ['READY', 'AUTHENTICATED', 'RECOVERY_MODE', 'WORKSPACE_READY'].includes(state as string),
    isLoading: [
      'BOOTSTRAP_START',
      'INITIALIZING',
      'SESSION_LOADING',
      'AUTHENTICATING',
      'PROFILE_LOADING',
    ].includes(state as string),
    error: envError || error,
    traceId,
     login,
     signup,
     resendVerificationEmail,
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
