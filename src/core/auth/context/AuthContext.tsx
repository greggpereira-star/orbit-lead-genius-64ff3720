 import React, { createContext, useContext, useState, useEffect } from 'react';
 
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
   login: (email: string) => Promise<void>;
  signup: (email: string, companyName: string) => Promise<void>;
   logout: () => void;
   switchCompany: (companyId: string) => void;
 }
 
 const AuthContext = createContext<AuthContextType | undefined>(undefined);
 
 export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
   const [user, setUser] = useState<User | null>(null);
   const [company, setCompany] = useState<Company | null>(null);
   const [isLoading, setIsLoading] = useState(true);
 
   useEffect(() => {
     // Check local storage or session for mock user
     const storedUser = localStorage.getItem('mock_user');
     if (storedUser) {
       setUser(JSON.parse(storedUser));
       setCompany({ id: '1', name: 'Default Enterprise', slug: 'default' });
     }
     setIsLoading(false);
   }, []);
 
   const login = async (email: string) => {
     setIsLoading(true);
     // Mock login delay
     await new Promise(resolve => setTimeout(resolve, 1000));
     const mockUser = { id: 'u1', email, name: email.split('@')[0] };
     setUser(mockUser);
     setCompany({ id: '1', name: 'Default Enterprise', slug: 'default' });
     localStorage.setItem('mock_user', JSON.stringify(mockUser));
     setIsLoading(false);
   };
 
  const signup = async (email: string, companyName: string) => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    const mockUser = { id: 'u1', email, name: email.split('@')[0] };
    setUser(mockUser);
    setCompany({ id: '1', name: companyName, slug: companyName.toLowerCase().replace(/\s+/g, '-') });
    localStorage.setItem('mock_user', JSON.stringify(mockUser));
    setIsLoading(false);
  };

   const logout = () => {
     setUser(null);
     setCompany(null);
     localStorage.removeItem('mock_user');
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