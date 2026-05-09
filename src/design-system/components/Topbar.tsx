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
      <header className="h-16 border-b border-border/80 bg-card flex items-center justify-between px-6 sticky top-0 z-10 shadow-sm backdrop-blur-md">
         <div className="flex items-center flex-1 max-w-md relative group">
           <Search className="absolute left-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
           <div 
             className="flex items-center w-full pl-10 pr-3 h-9 bg-background rounded-md border border-input hover:border-border-foreground/20 focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all cursor-pointer"
             onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
           >
             <span className="text-sm text-muted-foreground flex-1 font-medium">Search or jump to...</span>
             <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-bold text-foreground opacity-100">
               <span className="text-xs">⌘</span>K
             </kbd>
           </div>
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