 import * as React from 'react';
 import { 
   LayoutDashboard, 
   Users, 
   GitPullRequest, 
   FileText, 
   BarChart3, 
   Settings, 
   Zap,
   MessageSquare
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
   { title: 'WhatsApp', icon: MessageSquare, to: '/whatsapp' },
   { title: 'Automations', icon: Zap, to: '/automations' },
   { title: 'Analytics', icon: BarChart3, to: '/analytics' },
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
               <Link to="/settings" as={any}>
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
 
 *** Add File: src/design-system/components/Topbar.tsx
 import * as React from 'react';
 import { Search, Bell, User } from 'lucide-react';
 import { Input } from '@/components/ui/input';
 import { Button } from '@/components/ui/button';
 import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
 } from '@/components/ui/dropdown-menu';
 import { useAuth } from '@/core/auth/hooks/useAuth';
 import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
 
 export function Topbar() {
   const { user, logout } = useAuth();
 
   return (
     <header className="h-16 border-b bg-background flex items-center justify-between px-6 sticky top-0 z-10">
       <div className="flex items-center flex-1 max-w-md relative">
         <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
         <Input 
           placeholder="Search leads, deals, tasks... (⌘K)" 
           className="pl-10 h-9 bg-muted/50 border-none focus-visible:ring-1"
         />
       </div>
       <div className="flex items-center gap-4">
         <Button variant="ghost" size="icon" className="relative">
           <Bell className="h-5 w-5 text-muted-foreground" />
           <span className="absolute top-2 right-2 h-2 w-2 bg-destructive rounded-full border-2 border-background" />
         </Button>
         <DropdownMenu>
           <DropdownMenuTrigger asChild>
             <Button variant="ghost" className="flex items-center gap-2 p-1 pl-2">
               <span className="text-sm font-medium hidden sm:inline-block">{user?.name}</span>
               <Avatar className="h-8 w-8">
                 <AvatarFallback className="bg-primary/10 text-primary">
                   {user?.name?.charAt(0).toUpperCase()}
                 </AvatarFallback>
               </Avatar>
             </Button>
           </DropdownMenuTrigger>
           <DropdownMenuContent align="end" className="w-56">
             <DropdownMenuLabel>My Account</DropdownMenuLabel>
             <DropdownMenuSeparator />
             <DropdownMenuItem>Profile</DropdownMenuItem>
             <DropdownMenuItem>Billing</DropdownMenuItem>
             <DropdownMenuItem>Team</DropdownMenuItem>
             <DropdownMenuSeparator />
             <DropdownMenuItem onClick={() => logout()} className="text-destructive">
               Logout
             </DropdownMenuItem>
           </DropdownMenuContent>
         </DropdownMenu>
       </div>
     </header>
   );
 }