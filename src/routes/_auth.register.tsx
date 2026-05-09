import { SocialLogin } from '@/components/auth/SocialLogin';
  import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
 import * as React from 'react';
  import { useState, useMemo } from 'react';
  import { toast } from 'sonner';
 import { useAuth } from '@/core/auth/hooks/useAuth';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Label } from '@/components/ui/label';
 import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
 import { CheckCircle2 } from 'lucide-react';
 
 export const Route = createFileRoute('/_auth/register')({
   component: SignupPage,
 });
 
 function SignupPage() {
   const { signup } = useAuth();
   const navigate = useNavigate();
   const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [companyName, setCompanyName] = useState('');
   const [isLoading, setIsLoading] = useState(false);
 
    const passwordStrength = useMemo(() => {
      if (!password) return null;
      let strength = 0;
      if (password.length >= 8) strength++;
      if (/[A-Z]/.test(password)) strength++;
      if (/[0-9]/.test(password)) strength++;
      if (/[^A-Za-z0-9]/.test(password)) strength++;
      return strength;
    }, [password]);

   const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log('!!! Register form handleSubmit triggered !!!', { email, companyName });
    
    if (isLoading) {
      console.log('Registration already in progress, skipping');
      return;
    }

    if (passwordStrength !== null && passwordStrength < 2) {
      console.log('Password too weak');
      toast.error('Please choose a stronger password');
      return;
    }
    
    setIsLoading(true);
    
    try {
      console.log('AuthTrace: Calling signup service', { email, companyName });
      const result = await signup(email, password, companyName);
      console.log('AuthTrace: Signup response received', result);
      
      if (result?.session) {
        toast.success('Account created! Entering workspace...');
        navigate({ to: '/dashboard' });
      } else {
        toast.success('Enterprise account pending verification. Check your email.');
        // Stay on page or redirect to a "check email" page if we had one
      }
    } catch (error: any) {
      console.error('AuthTrace: CRITICAL Registration error:', error);
      toast.error(error.message || 'Failed to initialize enterprise account');
    } finally {
      setIsLoading(false);
    }
  };
 
   return (
     <div className="space-y-6">
       <Card className="border-none shadow-xl">
         <CardHeader className="space-y-1">
           <CardTitle className="text-2xl font-bold">Create an account</CardTitle>
           <CardDescription>
             Start your 14-day free trial. No credit card required.
           </CardDescription>
         </CardHeader>
         <form onSubmit={handleSubmit}>
           <CardContent className="space-y-4">
             <div className="space-y-2">
               <Label htmlFor="company">Company Name</Label>
               <Input 
                 id="company" 
                name="company"
                 placeholder="Acme Inc" 
                 required 
                 value={companyName}
                 onChange={(e) => setCompanyName(e.target.value)}
               />
             </div>
              <div className="space-y-2">
                <Label htmlFor="email">Work Email</Label>
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
                <Label htmlFor="password">Password</Label>
                <Input 
                  id="password" 
                name="password"
                  type="password" 
                  placeholder="••••••••" 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {passwordStrength !== null && (
                  <div className="flex gap-1 mt-1">
                    {[1, 2, 3, 4].map((s) => (
                      <div 
                        key={s} 
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          s <= passwordStrength 
                            ? passwordStrength <= 1 ? 'bg-rose-500' : passwordStrength <= 2 ? 'bg-amber-500' : 'bg-emerald-500'
                            : 'bg-muted'
                        }`} 
                      />
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Min. 8 characters with numbers and symbols
                </p>
              </div>
             <div className="space-y-3 pt-2">
               {[
                 'Lead intelligence & scoring',
                 'Meta CAPI & Pixel integration',
                 'Automated sales workflows'
               ].map((feature) => (
                 <div key={feature} className="flex items-center gap-2 text-xs text-muted-foreground">
                   <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                   {feature}
                 </div>
               ))}
             </div>
           </CardContent>
            <CardFooter className="flex flex-col gap-4 pt-4">
              <button
                className="w-full h-11 text-base font-bold shadow-lg hover:shadow-xl transition-all bg-primary text-primary-foreground rounded-md flex items-center justify-center disabled:opacity-50 cursor-pointer"
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? 'Creating account...' : 'Get Started Free'}
              </button>
             <p className="text-xs text-center text-muted-foreground">
               Already have an account?{' '}
               <Link to="/login" className="text-primary hover:underline font-medium">
                 Sign in
               </Link>
             </p>
           </CardFooter>
      </form>
      <div className="px-6 pb-6 space-y-4">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or register with enterprise identity
            </span>
          </div>
        </div>
        <SocialLogin />
      </div>
       </Card>
       <p className="text-[10px] text-center text-muted-foreground px-6 leading-relaxed">
         By clicking "Get Started Free", you agree to our Terms of Service and Privacy Policy.
       </p>
     </div>
   );
 }