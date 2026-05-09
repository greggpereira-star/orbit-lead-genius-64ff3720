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
  const traceId = useMemo(() => Math.random().toString(36).substring(2, 15), []);
   const orchestratorRef = useRef<WorkspaceOrchestrator | null>(null);

  const handleAuthFailure = useCallback((msg: string, logError = true) => {
    if (logError) logger.error(msg, { traceId });
    setError(msg);
    setState('UNAUTHENTICATED');
    setUser(null);
    setCompany(null);
  }, [traceId]);

   const loadTenantContext = useCallback(async (supabaseUser: SupabaseUser) => {
     const client = getSupabase();
     if (!orchestratorRef.current) {
       orchestratorRef.current = new WorkspaceOrchestrator(client, traceId);
     }
 
     setState('TENANT_VALIDATING');
     
     try {
        const result = await (orchestratorRef.current as any).validateAndRepair(
          supabaseUser.id,
          supabaseUser.email || "",
          supabaseUser.user_metadata || {},
          (newState: AuthState) => setState(newState)
        );
 
       if (result.state === 'ERROR') {
         setError(result.error);
         setState('ERROR');
         return;
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
       try {
         logger.info('AuthTrace: Initializing session', { traceId });
          console.log('DEBUG [Auth]: getSupabase() call start');
          const supabaseClient = getSupabase();
          console.log('DEBUG [Auth]: getSupabase() call end');

          console.log('DEBUG [Auth]: auth.getSession() call start');
          const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
          console.log('DEBUG [Auth]: auth.getSession() call end', { session: !!session, error: !!sessionError });
          
          if (sessionError) {
            logger.error('AuthTrace: Session error', { error: sessionError.message, traceId });
            throw sessionError;
          }
          
           if (session?.user && mounted) {
             logger.info('AuthTrace: Session found, loading tenant', { userId: session.user.id, traceId });
             await loadTenantContext(session.user);
           } else if (mounted) {
            logger.info('AuthTrace: No session found', { traceId });
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
     try {
       const res = supabaseClient.auth.onAuthStateChange(async (event: any, session: any) => {
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
       subscription = res.data.subscription;
     } catch (e) {
       logger.error('AuthTrace: Failed to setup auth listener', { traceId });
     }

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
   isAuthenticated: ['READY', 'WORKSPACE_READY', 'DASHBOARD_BOOTSTRAP'].includes(state as string),
   isReady: state === 'READY',
   isLoading: ['INITIALIZING', 'AUTHENTICATING', 'TENANT_VALIDATING', 'TENANT_RECOVERING', 'MEMBERSHIP_RECOVERING'].includes(state as string),
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
