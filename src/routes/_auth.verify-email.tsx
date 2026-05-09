import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, ArrowRight, RefreshCw, MailOpen, LogOut, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_auth/verify-email')({
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { state, user, resendVerificationEmail, logout, refreshContext } = useAuth();
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    // If user becomes authenticated and ready, redirect to dashboard
    if (state === 'READY') {
      navigate({ to: '/dashboard' });
    }
  }, [state, navigate]);

  // Polling to check if email has been verified
  useEffect(() => {
    const interval = setInterval(async () => {
      if (state === 'EMAIL_SENT' || state === 'WAITING_EMAIL_CONFIRMATION') {
        await refreshContext();
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [state, refreshContext]);

  const handleResend = async () => {
    if (user?.email) {
      await resendVerificationEmail(user.email);
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      toast.error('Não foi possível identificar seu e-mail.');
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshContext();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const getEmailProviderLink = () => {
    if (!user?.email) return null;
    const domain = user.email.split('@')[1].toLowerCase();
    if (domain.includes('gmail')) return 'https://mail.google.com';
    if (domain.includes('outlook') || domain.includes('hotmail')) return 'https://outlook.live.com';
    if (domain.includes('yahoo')) return 'https://mail.yahoo.com';
    return null;
  };

  const providerLink = getEmailProviderLink();

  return (
    <div className="max-w-md w-full mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <Card className="border-none shadow-2xl bg-background/60 backdrop-blur-xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center animate-bounce-subtle">
            <Mail className="h-10 w-10 text-primary" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl font-black tracking-tight uppercase">Check your inbox</CardTitle>
            <CardDescription className="text-base">
              We sent a confirmation link to <span className="font-bold text-foreground">{user?.email || 'your email'}</span>
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed text-center">
              Confirm your email to activate your workspace and access the CRM dashboard.
            </p>
          </div>

          <div className="grid gap-3">
            {providerLink ? (
              <Button asChild className="w-full h-12 font-bold uppercase tracking-wider shadow-lg shadow-primary/20">
                <a href={providerLink} target="_blank" rel="noopener noreferrer">
                  Open {user?.email?.split('@')[1].split('.')[0]} <MailOpen className="ml-2 h-4 w-4" />
                </a>
              </Button>
            ) : (
              <Button onClick={handleRefresh} disabled={isRefreshing} className="w-full h-12 font-bold uppercase tracking-wider">
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                I've verified my email
              </Button>
            )}
            
            <Button variant="outline" onClick={handleResend} disabled={countdown > 0} className="w-full h-12 font-bold uppercase tracking-wider">
              {countdown > 0 ? `Resend in ${countdown}s` : 'Resend link'}
            </Button>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 border-t pt-6 bg-muted/30">
          <div className="flex items-center justify-between w-full text-xs text-muted-foreground">
            <button onClick={() => navigate({ to: '/register' })} className="hover:text-primary transition-colors flex items-center gap-1">
              Wrong email? <ArrowRight className="h-3 w-3" />
            </button>
            <button onClick={logout} className="hover:text-destructive transition-colors flex items-center gap-1 font-semibold uppercase">
              Logout <LogOut className="h-3 w-3" />
            </button>
          </div>
        </CardFooter>
      </Card>

      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">
          <div className="h-[1px] w-8 bg-current opacity-20" />
          Waiting for verification
          <div className="h-[1px] w-8 bg-current opacity-20" />
        </div>
        <div className="flex gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse [animation-delay:0.2s]" />
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse [animation-delay:0.4s]" />
        </div>
      </div>
    </div>
  );
}
