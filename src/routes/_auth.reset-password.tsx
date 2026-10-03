import { createFileRoute, useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export const Route = createFileRoute('/_auth/reset-password')({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Recovery link must produce a session before updateUser can work.
  const [linkState, setLinkState] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const hashError = new URLSearchParams(window.location.hash.slice(1)).get('error_description');

    const { data: sub } = supabase.auth.onAuthStateChange((event: string, session: unknown) => {
      if (!active) return;
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) setLinkState('ready');
    });

    (async () => {
      if (hashError) { setLinkState('invalid'); return; }
      if (code) {
        // Exchange explicitly in case auto-detection did not run yet.
        await supabase.auth.exchangeCodeForSession(code).catch(() => null);
      }
      // Give auto-detection a moment, then check for a session.
      for (let i = 0; i < 10 && active; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) { setLinkState('ready'); return; }
        await new Promise((r) => setTimeout(r, 300));
      }
      if (active) setLinkState((s) => (s === 'ready' ? s : 'invalid'));
    })();

    return () => { active = false; sub?.subscription?.unsubscribe(); };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }
    if (password.length < 8) {
      toast.error('A senha precisa ter pelo menos 8 caracteres');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Senha atualizada! Faça login com a nova senha.');
      await supabase.auth.signOut();
      navigate({ to: '/login' });
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Falha ao atualizar a senha');
    } finally {
      setIsLoading(false);
    }
  };

  if (linkState !== 'ready') {
    return (
      <Card className="border-none shadow-xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">
            {linkState === 'checking' ? 'Validando link...' : 'Link inválido ou expirado'}
          </CardTitle>
          <CardDescription>
            {linkState === 'checking'
              ? 'Aguarde um instante.'
              : 'Solicite um novo link e abra-o no mesmo navegador em que fez o pedido.'}
          </CardDescription>
        </CardHeader>
        {linkState === 'invalid' && (
          <CardFooter>
            <Button className="w-full" onClick={() => navigate({ to: '/forgot-password' })}>
              Pedir novo link
            </Button>
          </CardFooter>
        )}
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-xl">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">New password</CardTitle>
        <CardDescription>
          Enter your new password below
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <Input 
              id="password" 
              type="password" 
              placeholder="••••••••" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input 
              id="confirmPassword" 
              type="password" 
              placeholder="••••••••" 
              required 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full" type="submit" disabled={isLoading}>
            {isLoading ? 'Updating...' : 'Update password'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
