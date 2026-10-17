import { Outlet, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { Logo } from '@/modules/landing/Logo';

export function AuthLayout() {
  const { state } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (state === 'READY') {
      navigate({ to: '/dashboard' });
    }
  }, [state, navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Abstract background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -right-24 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 space-y-8">
        <Link to="/" className="flex items-center justify-center rounded-lg" aria-label="ALT Leadflow">
          <Logo fundo="claro" tamanho="h-10 w-10" className="text-2xl" />
        </Link>
        <Outlet />
      </div>
    </div>
  );
}
