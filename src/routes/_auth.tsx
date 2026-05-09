  import { Outlet, createFileRoute, redirect, Link, useNavigate } from '@tanstack/react-router';
  import { useAuth } from '../core/auth/hooks/useAuth';
  import { useEffect } from 'react';
 
 export const Route = createFileRoute('/_auth')({
   beforeLoad: ({ context }) => {
     // This is a bit tricky with TanStack Start because useAuth is a hook
     // Usually we check context.auth if we pass it to the router context
   },
   component: AuthLayout,
 });
 
 function AuthLayout() {
   return (
     <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Abstract background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -right-24 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 space-y-8">
        <Link to="/" className="flex items-center justify-center gap-2 group">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">
            L
          </div>
           <span className="font-bold text-2xl tracking-tight text-foreground">Lovable CRM</span>
        </Link>
         <Outlet />
       </div>
     </div>
   );
 }