 import { Outlet, createFileRoute, Link } from '@tanstack/react-router';
 import { Card, CardContent } from '@/components/ui/card';
 import { User, Building, Shield, Bell, Share2, Zap } from 'lucide-react';
 
 export const Route = createFileRoute('/_app/settings')({
   component: SettingsLayout,
 });
 
 const settingsNav = [
    { title: 'Profile', icon: User, to: '/settings/' },
    { title: 'Company', icon: Building, to: '/settings/company' },
    { title: 'Integrations', icon: Share2, to: '/settings/integrations' },
   { title: 'Automations', icon: Zap, to: '/settings/automations' },
   { title: 'Security', icon: Shield, to: '/settings/security' },
   { title: 'Notifications', icon: Bell, to: '/settings/notifications' },
 ];
 
 function SettingsLayout() {
   return (
     <div className="space-y-6">
       <div>
         <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
         <p className="text-muted-foreground text-sm">Manage your account and platform preferences.</p>
       </div>
 
       <div className="flex flex-col lg:flex-row gap-8">
         <aside className="w-full lg:w-64 shrink-0">
           <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
             {settingsNav.map((item) => (
               <Link
                 key={item.title}
                 to={item.to as any}
                 className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors hover:bg-muted data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                 activeProps={{ 'data-state': 'active' }}
               >
                 <item.icon className="h-4 w-4" />
                 {item.title}
               </Link>
             ))}
           </nav>
         </aside>
 
         <div className="flex-1 max-w-4xl">
           <Outlet />
         </div>
       </div>
     </div>
   );
 }