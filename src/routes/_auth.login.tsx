  import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
 import * as React from 'react';
  import { useState } from 'react';
  import { toast } from 'sonner';
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
   const [password, setPassword] = useState('');
   const [isLoading, setIsLoading] = useState(false);
 
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log('!!! Login form handleSubmit triggered !!!');
    
    if (isLoading) {
      console.log('Login already in progress, skipping');
      return;
    }

    setIsLoading(true);
    
    // Use a self-executing async function to handle the async login
    (async () => {
      try {
        console.log('Attempting login with:', email);
        await login(email, password);
        console.log('Login successful, navigating...');
        toast.success('Successfully signed in');
        navigate({ to: '/dashboard' });
      } catch (error: any) {
        console.error('Login error:', error);
        toast.error(error.message || 'Invalid email or password');
      } finally {
        setIsLoading(false);
      }
    })();
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
                name="email"
                type="email" 
                placeholder="name@company.com" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link 
                  to="/forgot-password" 
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input 
                id="password" 
                name="password"
                type="password" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </CardContent>
         <CardFooter>
            <div className="w-full space-y-4">
              <Button 
                className="w-full h-11 text-base font-bold shadow-lg hover:shadow-xl transition-all" 
                type="submit" 
                disabled={isLoading}
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Don't have an account?{' '}
                <Link to="/register" className="text-primary hover:underline font-medium">
                  Create one
                </Link>
              </p>
            </div>
         </CardFooter>
       </form>
     </Card>
   );
 }