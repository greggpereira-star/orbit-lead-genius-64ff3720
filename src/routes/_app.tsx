import { Outlet, createFileRoute, redirect, useRouter } from '@tanstack/react-router';
 import { useEffect } from 'react';
 import { useAuth } from '@/core/auth/hooks/useAuth';
 import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
 import { AppSidebar } from '@/design-system/components/AppSidebar';
 import { Topbar } from '@/design-system/components/Topbar';
 import { CommandPalette } from '@/design-system/components/CommandPalette';
 import { tracker } from '@/core/tracking/tracker';
 
 export const Route = createFileRoute('/_app')({
   beforeLoad: ({ context }) => {
     // In a real app, we'd check auth here
     // For now, let's just let it pass or redirect to login if not authenticated
     // But since we are using a mock, it's easier to handle in the component
   },
   component: AppLayout,
 });
 
function AppLayout() {
  const { isAuthenticated, isLoading, company } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated && company) {
      tracker.init(company.id);
    }
  }, [isAuthenticated, company?.id]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-muted-foreground italic">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    throw redirect({ to: '/login' });
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex flex-col h-screen overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-auto p-6 bg-background/50">
            <Outlet />
          </main>
        </div>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  );
}