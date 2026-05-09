import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { logger } from '@/core/observability/logger';
import { toast } from 'sonner';

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
  user: User | null;
  company: Company | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  configError: string | null;
  login: (email: string, password?: string) => Promise<void>;
  signup: (email: string, password?: string, companyName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const handleUserSession = useCallback(async (supabaseUser: SupabaseUser | null) => {
    if (!supabaseUser) {
      setUser(null);
      setCompany(null);
      return;
    }

    try {
      logger.info('Syncing user session with database', { userId: supabaseUser.id });
      
      // 1. Fetch Profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();

      if (profileError) {
        logger.warn('Profile not found, user may be new or sync failed', { error: profileError });
      }

      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        name: profile?.full_name || supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'User',
        avatar_url: profile?.avatar_url || supabaseUser.user_metadata?.avatar_url
      });

      // 2. Fetch primary membership and company
      const { data: membership, error: membershipError } = await supabase
        .from('memberships')
        .select('*, companies(*)')
        .eq('user_id', supabaseUser.id)
        .limit(1)
        .single();

      if (membershipError) {
        logger.warn('No membership found for user', { userId: supabaseUser.id, error: membershipError });
        setCompany(null);
      } else if (membership?.companies) {
        setCompany({
          id: membership.companies.id,
          name: membership.companies.name,
          slug: membership.companies.slug
        });
        logger.info('Company context loaded', { companyId: membership.companies.id });
      }
    } catch (err: any) {
      logger.error('Critical failure in handleUserSession', { error: err.message, stack: err.stack });
    }
  }, []);

  const refreshSession = useCallback(async () => {
    if (!supabase) return;
    setIsLoading(true);
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      await handleUserSession(session?.user || null);
    } catch (err: any) {
      logger.error('Session refresh failed', { error: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [handleUserSession]);

  useEffect(() => {
    let mounted = true;
    
    if (!supabase) {
      logger.warn('Supabase client missing - check environment variables');
      setConfigError('Supabase credentials missing. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      // Mock for sandbox stability if needed, but the user requested no fake fallbacks
      // We will show the error state instead.
      setIsLoading(false);
      return;
    }

    const init = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (mounted) {
          await handleUserSession(session?.user || null);
        }
      } catch (err: any) {
        logger.error('Auth initialization failed', { error: err.message });
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      logger.info('Auth state changed', { event });
      if (mounted) {
        if (session?.user) {
          await handleUserSession(session.user);
        } else {
          setUser(null);
          setCompany(null);
        }
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [handleUserSession]);

  const login = async (email: string, password?: string) => {
    logger.info('Login attempt', { email });
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: password || '',
      });
      if (error) throw error;
      logger.info('Login successful');
    } catch (err: any) {
      logger.error('Login failed', { email, error: err.message });
      toast.error(err.message || 'Invalid credentials');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (email: string, password?: string, companyName?: string) => {
    logger.info('Signup attempt', { email, companyName });
    setIsLoading(true);
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
      if (error) throw error;
      logger.info('Signup request sent');
      toast.success('Registration successful. Please verify your email.');
    } catch (err: any) {
      logger.error('Signup failed', { email, error: err.message });
      toast.error(err.message || 'Signup failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    logger.info('Logout requested');
    try {
      await supabase.auth.signOut();
      setUser(null);
      setCompany(null);
      logger.info('Logout successful');
    } catch (err: any) {
      logger.error('Logout error', { error: err.message });
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      company, 
      isAuthenticated: !!user, 
      isLoading, 
      configError,
      login, 
      signup,
      logout,
      refreshSession
    }}>
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
