import { createFileRoute, useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getRecoveryClient } from '@/lib/recovery-client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export const Route = createFileRoute('/_auth/reset-password')({
  component: ResetPasswordPage,
});

// Capture the link hash as early as possible, before any client can strip it.
const initialHash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';

function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Recovery link must produce a session before updateUser can work.
  const [linkState, setLinkState] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const clientRef = React.useRef<SupabaseClient>(supabase);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const hash = new URLSearchParams(initialHash || window.location.hash.slice(1));
    const code = new URL(window.location.href).searchParams.get('code');

    (async () => {
      if (hash.get('error_description')) { setLinkState('invalid'); return; }

      // Implicit-flow link: tokens are in the URL hash.
      const access_token = hash.get('access_token');
      const refresh_token = hash.get('refresh_token');
      if (access_token && refresh_token) {
        const rc = getRecoveryClient();
        const { error } = await rc.auth.setSession({ access_token, refresh_token });
        if (!active) return;
        if (!error) {
          clientRef.current = rc;
          window.history.replaceState(null, '', window.location.pathname);
          setLinkState('ready');
          return;
        }
      }

      // Legacy PKCE link (only works in the same browser).
      if (code) await supabase.auth.exchangeCodeForSession(code).catch(() => null);
      for (let i = 0; i < 5 && active; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) { clientRef.current = supabase; setLinkState('ready'); return; }
        await new Promise((r) => setTimeout(r, 300));
      }
      if (active) setLinkState('invalid');
    })();

    return () => { active = false; };
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
      const { error } = await clientRef.current.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Senha atualizada! Faça login com a nova senha.');
      await clientRef.current.auth.signOut();
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
