 import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
 import * as React from 'react';
 import { useState } from 'react';
 import { useAuth } from '@/core/auth/hooks/useAuth';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Label } from '@/components/ui/label';
 import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
 import { CheckCircle2 } from 'lucide-react';
 
 export const Route = createFileRoute('/_auth/signup')({
   component: SignupPage,
 });
 
 function SignupPage() {
   const { signup } = useAuth();
   const navigate = useNavigate();
   const [email, setEmail] = useState('');
   const [companyName, setCompanyName] = useState('');
   const [isLoading, setIsLoading] = useState(false);
 
   const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
     e.preventDefault();
     setIsLoading(true);
     try {
       // Mock signup
       await signup(email, companyName);
       navigate({ to: '/dashboard' });
     } catch (error) {
       console.error(error);
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
                 type="email" 
                 placeholder="name@company.com" 
                 required 
                 value={email}
                 onChange={(e) => setEmail(e.target.value)}
               />
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
           <CardFooter className="flex flex-col gap-4">
             <Button className="w-full" type="submit" disabled={isLoading}>
               {isLoading ? 'Creating account...' : 'Get Started Free'}
             </Button>
             <p className="text-xs text-center text-muted-foreground">
               Already have an account?{' '}
               <Link to="/login" className="text-primary hover:underline font-medium">
                 Sign in
               </Link>
             </p>
           </CardFooter>
         </form>
       </Card>
       <p className="text-[10px] text-center text-muted-foreground px-6 leading-relaxed">
         By clicking "Get Started Free", you agree to our Terms of Service and Privacy Policy.
       </p>
     </div>
   );
 }