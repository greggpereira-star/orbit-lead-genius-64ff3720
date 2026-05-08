 import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
 import { useAuth } from '../core/auth/hooks/useAuth';
 
 export const Route = createFileRoute('/_auth')({
   beforeLoad: ({ context }) => {
     // This is a bit tricky with TanStack Start because useAuth is a hook
     // Usually we check context.auth if we pass it to the router context
   },
   component: AuthLayout,
 });
 
 function AuthLayout() {
   return (
     <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
       <div className="w-full max-w-md">
         <Outlet />
       </div>
     </div>
   );
 }