import * as React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  GitPullRequest, 
  FileText, 
  BarChart3, 
  Settings, 
   Zap,
   MessageSquare,
   Monitor,
   ShieldCheck,
   Sparkles
} from 'lucide-react';
 import {
   Sidebar,
   SidebarContent,
   SidebarGroup,
   SidebarGroupContent,
   SidebarGroupLabel,
   SidebarHeader,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
   SidebarFooter,
 } from '@/components/ui/sidebar';
 import { Link } from '@tanstack/react-router';
 import { useAuth } from '@/core/auth/hooks/useAuth';
 
 const menuItems = [
    { title: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
    { title: 'Leads', icon: Users, to: '/leads' },
    { title: 'Pipeline', icon: GitPullRequest, to: '/pipeline' },
   { title: 'Forms', icon: FileText, to: '/forms' },
   { title: 'Alt Quiz', icon: Sparkles, to: '/quizzes' },
    { title: 'WhatsApp', icon: MessageSquare, to: '/whatsapp' },
     { title: 'Automations', icon: Zap, to: '/automations' },
    { title: 'Analytics', icon: BarChart3, to: '/analytics' },
    { title: 'TV Mode', icon: Monitor, to: '/analytics/tv' },
    { title: 'Observability', icon: ShieldCheck, to: '/observability' },
 ];
 
 export function AppSidebar() {
   const { company } = useAuth();
 
   return (
     <Sidebar collapsible="icon" className="border-r">
       <SidebarHeader className="h-16 flex items-center px-6">
         <div className="flex items-center gap-3">
           <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl">
             L
           </div>
           <span className="font-semibold text-lg truncate group-data-[collapsible=icon]:hidden">
             {company?.name || 'CRM Enterprise'}
           </span>
         </div>
       </SidebarHeader>
       <SidebarContent>
         <SidebarGroup>
           <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">Main Menu</SidebarGroupLabel>
           <SidebarGroupContent>
             <SidebarMenu>
               {menuItems.map((item) => (
                 <SidebarMenuItem key={item.title}>
                   <SidebarMenuButton asChild tooltip={item.title}>
                     <Link to={item.to as any}>
                       <item.icon className="h-4 w-4" />
                       <span>{item.title}</span>
                     </Link>
                   </SidebarMenuButton>
                 </SidebarMenuItem>
               ))}
             </SidebarMenu>
           </SidebarGroupContent>
         </SidebarGroup>
       </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Settings">
                <Link to="/settings" activeOptions={{ exact: false }}>
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
     </Sidebar>
   );
 }