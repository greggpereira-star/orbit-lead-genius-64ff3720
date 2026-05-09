 import React, { createContext, useContext, useState, useEffect } from 'react';
 import { supabase } from '@/lib/supabase';
 import { User as SupabaseUser } from '@supabase/supabase-js';
 
 interface User {
   id: string;
   email: string;
   name: string;
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
    login: (email: string, password?: string) => Promise<void>;
   signup: (email: string, password?: string, companyName?: string) => Promise<void>;
   logout: () => void;
   switchCompany: (companyId: string) => void;
 }
 
 const AuthContext = createContext<AuthContextType | undefined>(undefined);
 
 export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
   const [user, setUser] = useState<User | null>(null);
   const [company, setCompany] = useState<Company | null>(null);
   const [isLoading, setIsLoading] = useState(true);
 
  useEffect(() => {
    let mounted = true;
    
    // Ensure we are in a browser environment
    if (typeof window === 'undefined') {
      setIsLoading(false);
      return;
    }

    if (!supabase || !supabase.auth) {
      console.warn('Supabase not fully initialized. Falling back to mock auth.');
      // Use mock session for development/preview if supabase is unavailable
      if (process.env.NODE_ENV === 'development') {
        setUser({ id: 'mock-user', email: 'test@example.com', name: 'Test User' });
        setCompany({ id: 'mock-company', name: 'Mock Company', slug: 'mock-company' });
      }
      setIsLoading(false);
      return;
    }

    const initAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        
        if (session?.user && mounted) {
          await handleUserSession(session.user);
        }
      } catch (err: any) {
        console.warn('Auth initialization failed:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event: any, session: any) => {
      if (!mounted) return;
      
      if (session?.user) {
        await handleUserSession(session.user);
      } else {
        setUser(null);
        setCompany(null);
      }
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);
 
   const handleUserSession = async (supabaseUser: SupabaseUser) => {
     // Fetch membership and company
     const { data: membership } = await supabase
       .from('memberships')
       .select('*, companies(*)')
       .eq('user_id', supabaseUser.id)
       .single();
 
     setUser({
       id: supabaseUser.id,
       email: supabaseUser.email || '',
       name: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'User'
     });
 
     if (membership?.companies) {
       setCompany({
         id: membership.companies.id,
         name: membership.companies.name,
         slug: membership.companies.slug
       });
     }
   };
 
    const login = async (email: string, password?: string) => {
      if (!supabase || !supabase.auth) {
        console.warn('Supabase not configured. Using mock login.');
        setIsLoading(true);
        await new Promise(resolve => setTimeout(resolve, 1000));
        setUser({ id: 'mock-user', email, name: email.split('@')[0] });
        setCompany({ id: 'mock-company', name: 'Mock Company', slug: 'mock-company' });
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: password || '',
        });
        if (error) throw error;
      } finally {
        setIsLoading(false);
      }
    };
 
    const signup = async (email: string, password?: string, companyName?: string) => {
      console.log('Signup initiated in AuthContext', { email, companyName });
      
      if (!supabase || !supabase.auth) {
        console.warn('Supabase not configured. Using mock signup.');
        setIsLoading(true);
        await new Promise(resolve => setTimeout(resolve, 1000));
        setUser({ id: 'mock-user', email, name: email.split('@')[0] });
        setCompany({ id: 'mock-company', name: companyName || 'Mock Company', slug: 'mock-company' });
        setIsLoading(false);
        return;
      }
      
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
      } finally {
        setIsLoading(false);
      }
    };
 
   const logout = async () => {
     await supabase.auth.signOut();
     setUser(null);
     setCompany(null);
   };
 
   const switchCompany = (companyId: string) => {
     // In a real app, this would fetch the company details and update the session
     setCompany({ id: companyId, name: `Company ${companyId}`, slug: `company-${companyId}` });
   };
 
   return (
     <AuthContext.Provider value={{ 
       user, 
       company, 
       isAuthenticated: !!user, 
       isLoading, 
       login, 
      signup,
       logout,
       switchCompany 
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