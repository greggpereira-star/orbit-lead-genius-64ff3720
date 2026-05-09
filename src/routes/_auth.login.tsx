import { SocialLogin } from '@/components/auth/SocialLogin';
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
     const navigate = useNavigate();
     const [email, setEmail] = useState('');
     const [password, setPassword] = useState('');
     const [retryCount, setRetryCount] = useState(0);
     const { login, state, error: authError } = useAuth();
     const isLoading = state === 'AUTHENTICATING' || state === 'TENANT_LOADING';
   
    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      
      if (isLoading) return;
  
      (async () => {
        try {
          await login(email, password, retryCount);
          navigate({ to: '/dashboard' });
        } catch (error: any) {
          setRetryCount(prev => prev + 1);
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
      <div className="px-6 pb-6 space-y-4">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or continue with enterprise SSO
            </span>
          </div>
        </div>
        <SocialLogin />
      </div>
     </Card>
   );
 }