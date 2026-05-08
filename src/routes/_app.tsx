 import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
 import { useAuth } from '@/core/auth/hooks/useAuth';
 import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
 import { AppSidebar } from '@/design-system/components/AppSidebar';
 import { Topbar } from '@/design-system/components/Topbar';
 
 export const Route = createFileRoute('/_app')({
   beforeLoad: ({ context }) => {
     // In a real app, we'd check auth here
     // For now, let's just let it pass or redirect to login if not authenticated
     // But since we are using a mock, it's easier to handle in the component
   },
   component: AppLayout,
 });
 
 function AppLayout() {
   const { isAuthenticated, isLoading } = useAuth();
 
   if (isLoading) {
     return <div className="flex h-screen items-center justify-center">Loading...</div>;
   }
 
   if (!isAuthenticated) {
     throw redirect({ to: '/login' });
   }
 
   return (
     <SidebarProvider>
       <AppSidebar />
       <SidebarInset>
         <div className="flex flex-col h-screen">
           <Topbar />
           <main className="flex-1 overflow-auto p-6">
             <Outlet />
           </main>
         </div>
       </SidebarInset>
     </SidebarProvider>
   );
 }