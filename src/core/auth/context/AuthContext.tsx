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
     const initAuth = async () => {
       const { data: { session } } = await supabase.auth.getSession();
       if (session?.user) {
         await handleUserSession(session.user);
       }
       setIsLoading(false);
     };
 
     initAuth();
 
     const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
       if (session?.user) {
         await handleUserSession(session.user);
       } else {
         setUser(null);
         setCompany(null);
       }
       setIsLoading(false);
     });
 
     return () => subscription.unsubscribe();
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
     setIsLoading(true);
     try {
       const { error } = await supabase.auth.signInWithPassword({
         email,
         password: password || 'password123', // Fallback for simple demo/mock
       });
       if (error) throw error;
     } finally {
       setIsLoading(false);
     }
   };
 
   const signup = async (email: string, password?: string, companyName?: string) => {
     setIsLoading(true);
     try {
       const { error } = await supabase.auth.signUp({
         email,
         password: password || 'password123',
         options: {
           data: {
             company_name: companyName,
           }
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