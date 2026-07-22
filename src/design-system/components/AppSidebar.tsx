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
  Sparkles,
  Share2,
  ChevronsUpDown,
  Building2,
  LogOut,
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
import { Link, useLocation } from '@tanstack/react-router';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useInboxNotifications } from '@/modules/chat/hooks/useInboxNotifications';

interface MenuItem {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
  notify?: 'inbox';
}

const menuGroups: { label: string; accent: string; items: MenuItem[] }[] = [
  {
    label: 'Principal',
    accent: 'text-sky-600',
    items: [{ title: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' }],
  },
  {
    label: 'Captação & CRM',
    accent: 'text-primary',
    items: [
      { title: 'Leads', icon: Users, to: '/leads' },
      { title: 'Pipeline', icon: GitPullRequest, to: '/pipeline' },
      { title: 'Forms', icon: FileText, to: '/forms' },
      { title: 'Alt Quiz', icon: Sparkles, to: '/quizzes' },
    ],
  },
  {
    label: 'Atendimento',
    accent: 'text-emerald-600',
    items: [
      { title: 'Chat ao vivo', icon: MessageSquare, to: '/inbox', notify: 'inbox' },
      { title: 'WhatsApp', icon: MessageSquare, to: '/whatsapp' },
    ],
  },
  {
    label: 'Automação',
    accent: 'text-amber-600',
    items: [
      { title: 'Automations', icon: Zap, to: '/automations' },
      { title: 'Meta Lead Ads', icon: Share2, to: '/integrations/meta' },
    ],
  },
  {
    label: 'Inteligência',
    accent: 'text-violet-600',
    items: [
      { title: 'Analytics', icon: BarChart3, to: '/analytics' },
      { title: 'TV Mode', icon: Monitor, to: '/analytics/tv' },
      { title: 'Observability', icon: ShieldCheck, to: '/observability' },
    ],
  },
];

function isActivePath(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(to + '/');
}

export function AppSidebar() {
  const { company, user, logout } = useAuth();
  const { unreadCount } = useInboxNotifications(company?.id);
  const location = useLocation();

  const initials = (company?.name || 'W').trim().slice(0, 1).toUpperCase();
  const userInitials = (user?.name || user?.email || 'U').trim().slice(0, 1).toUpperCase();

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-sidebar-accent transition-colors text-left">
              <div className="relative shrink-0">
                <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
                  {initials}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-sidebar" />
              </div>
              <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <p className="font-semibold text-sm truncate">{company?.name || 'Workspace'}</p>
                <p className="text-xs text-muted-foreground">Workspace</p>
              </div>
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0 group-data-[collapsible=icon]:hidden" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="truncate">{company?.name || 'Workspace'}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings/company" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Configurações da empresa
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" /> Configurações gerais
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void logout()} className="flex items-center gap-2 text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent>
        {menuGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isActivePath(location.pathname, item.to);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild tooltip={item.title} isActive={active}>
                        <Link to={item.to as any}>
                          <item.icon className={`h-4 w-4 ${active ? '' : group.accent}`} />
                          <span className="flex-1">{item.title}</span>
                          {item.notify === 'inbox' && unreadCount > 0 && (
                            <Badge className="h-5 min-w-5 rounded-full px-1.5 text-[10px]">
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Ver configurações">
              <Link to="/settings" activeOptions={{ exact: false }}>
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px]">{userInitials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <p className="text-sm font-medium truncate">{user?.name || user?.email}</p>
                  <p className="text-xs text-muted-foreground truncate">Ver configurações</p>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
