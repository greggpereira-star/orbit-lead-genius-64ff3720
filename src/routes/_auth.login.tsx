import { SocialLogin } from '@/components/auth/SocialLogin';
  import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
 import * as React from 'react';
  import { useState } from 'react';
  import { toast } from 'sonner';
 import { useAuth } from '@/core/auth/hooks/useAuth';
import { erroContem } from '@/core/auth/lib/mensagemDoErro';
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
      const isLoading = ['AUTHENTICATING', 'INITIALIZING', 'TENANT_VALIDATING', 'TENANT_RECOVERING'].includes(state as string);
   
     const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
       console.log('Login: Form submitted');
       e.preventDefault();
       
       if (isLoading) {
         console.log('Login: Still loading, ignoring submit');
         return;
       }
   
        try {
          await login(email, password);
          navigate({ to: '/dashboard' });
        } catch (error: any) {
          /* `erroContem` em vez de ler o campo de texto do erro direto: sem
             esse campo, o próprio `catch` lançava `TypeError` e a causa
             original se perdia antes de chegar à tela. */
          if (erroContem(error, 'Email not confirmed')) {
            navigate({ to: '/verify-email' });
            return;
          }
          setRetryCount(prev => prev + 1);
        }
     };
 
   return (
     <Card className="border-none shadow-xl">
       <CardHeader className="space-y-1">
         <CardTitle className="text-2xl font-bold">Entrar</CardTitle>
         <CardDescription>
           Use o e-mail da sua conta
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
                placeholder="voce@suaempresa.com.br" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                <Link 
                  to="/forgot-password" 
                  className="text-xs text-primary hover:underline"
                >
                  Esqueci minha senha
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
                {isLoading ? 'Entrando...' : 'Entrar'}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Ainda não tem conta?{' '}
                <Link to="/register" className="text-primary hover:underline font-medium">
                  Criar agora
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
              ou entre com SSO corporativo
            </span>
          </div>
        </div>
        <SocialLogin />
      </div>
     </Card>
   );
 }