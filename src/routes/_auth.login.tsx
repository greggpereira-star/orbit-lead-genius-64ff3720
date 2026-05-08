 import { createFileRoute, useNavigate } from '@tanstack/react-router';
 import * as React from 'react';
 import { useState } from 'react';
 import { useAuth } from '@/core/auth/hooks/useAuth';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Label } from '@/components/ui/label';
 import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
 
 export const Route = createFileRoute('/_auth/login')({
   component: LoginPage,
 });
 
 function LoginPage() {
   const { login } = useAuth();
   const navigate = useNavigate();
   const [email, setEmail] = useState('');
   const [isLoading, setIsLoading] = useState(false);
 
   const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
     e.preventDefault();
     setIsLoading(true);
     try {
       await login(email);
       navigate({ to: '/dashboard' });
     } catch (error) {
       console.error(error);
     } finally {
       setIsLoading(false);
     }
   };
 
   return (
     <Card className="border-none shadow-xl">
       <CardHeader className="space-y-1">
         <CardTitle className="text-2xl font-bold">Sign in</CardTitle>
         <CardDescription>
           Enter your email to sign in to your account
         </CardDescription>
       </CardHeader>
       <form onSubmit={handleSubmit}>
         <CardContent className="space-y-4">
           <div className="space-y-2">
             <Label htmlFor="email">Email</Label>
             <Input 
               id="email" 
               type="email" 
               placeholder="name@company.com" 
               required 
               value={email}
               onChange={(e) => setEmail(e.target.value)}
             />
           </div>
         </CardContent>
         <CardFooter>
           <Button className="w-full" type="submit" disabled={isLoading}>
             {isLoading ? 'Signing in...' : 'Sign in'}
           </Button>
         </CardFooter>
       </form>
     </Card>
   );
 }