import * as React from 'react';
import {
  LayoutDashboard,
  Users,
  GitPullRequest,
  FileText,
  BarChart3,
  Settings,
  Zap,
  Headset,
  Monitor,
  ShieldCheck,
  Sparkles,
  Share2,
  ChevronLeft,
  ChevronRight,
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
  SidebarRail,
  useSidebar,
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
import { WhatsAppIcon } from './WhatsAppIcon';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useInboxNotifications } from '@/modules/chat/hooks/useInboxNotifications';

interface MenuItem {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
  notify?: 'inbox';
}

/* `accent` virou vazio em todas as categorias e fica como campo para não
   espalhar a remoção por cinco lugares. Eram cinco matizes classificando
   ASSUNTO — sky para Principal, emerald para Atendimento, âmbar para
   Automação —, e a cor da sidebar tem um trabalho só: dizer onde a pessoa
   está. Pior: a regra era `active ? '' : accent`, ou seja, o item INATIVO
   recebia cor e o ativo não, deixando "onde estou" mais fraco que o ruído
   em volta. O estado ativo já é marcado em ui/sidebar.tsx:504. */
const menuGroups: { label: string; accent: string; items: MenuItem[] }[] = [
  {
    label: 'Principal',
    accent: '',
    items: [{ title: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' }],
  },
  {
    label: 'Captação & CRM',
    accent: '',
    items: [
      { title: 'Leads', icon: Users, to: '/leads' },
      { title: 'Pipeline', icon: GitPullRequest, to: '/pipeline' },
      { title: 'Forms', icon: FileText, to: '/forms' },
      { title: 'Alt Quiz', icon: Sparkles, to: '/quizzes' },
    ],
  },
  {
    label: 'Atendimento',
    accent: '',
    items: [
      { title: 'Chat ao vivo', icon: Headset, to: '/inbox', notify: 'inbox' },
      { title: 'WhatsApp', icon: WhatsAppIcon, to: '/whatsapp' },
    ],
  },
  {
    label: 'Automação',
    accent: '',
    items: [
      { title: 'Automations', icon: Zap, to: '/automations' },
      { title: 'Meta Lead Ads', icon: Share2, to: '/integrations/meta' },
    ],
  },
  {
    label: 'Inteligência',
    accent: '',
    items: [
      { title: 'Analytics', icon: BarChart3, to: '/analytics' },
      { title: 'TV Mode', icon: Monitor, to: '/analytics/tv' },
      { title: 'Observability', icon: ShieldCheck, to: '/observability' },
    ],
  },
];

/**
 * Alça para reduzir/ampliar o menu: um botão redondo no meio da borda direita, meio dentro e meio
 * fora do menu (o padrão do Linear e do Vercel). Antes era uma linha "Reduzir menu" no rodapé,
 * que disputava espaço com o usuário e parecia um item de navegação. O atalho Ctrl+B aparece na dica.
 * 22 px: a metade que invade o conteúdo (11 px) cabe no recuo das telas, sem cobrir nada.
 */
function AlcaDoMenu({ recolhido, onAlternar }: { recolhido: boolean; onAlternar: () => void }) {
  const rotulo = recolhido ? 'Ampliar menu' : 'Reduzir menu';
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onAlternar}
            aria-label={recolhido ? 'Ampliar menu' : 'Reduzir menu'}
            aria-expanded={!recolhido}
            className={cn(
              'absolute right-0 top-1/2 z-30 flex h-[22px] w-[22px] -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full',
              'border border-sidebar-border bg-background text-muted-foreground',
              'shadow-[0_1px_2px_rgb(15_23_42/0.06),0_6px_14px_-6px_rgb(15_23_42/0.18)]',
              'opacity-80 transition-all duration-200 ease-out',
              'hover:scale-110 hover:border-primary/40 hover:text-primary hover:opacity-100 hover:shadow-md',
              'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
              'active:scale-95',
            )}
          >
            {recolhido ? (
              <ChevronRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            ) : (
              <ChevronLeft className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={14} className="flex items-center gap-2">
          {rotulo}
          <kbd className="rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">Ctrl+B</kbd>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function isActivePath(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(to + '/');
}

export function AppSidebar() {
  const { company, user, logout } = useAuth();
  const { unreadCount } = useInboxNotifications(company?.id);
  const location = useLocation();
  const { state, toggleSidebar, isMobile } = useSidebar();
  const recolhido = state === 'collapsed';

  const initials = (company?.name || 'W').trim().slice(0, 1).toUpperCase();
  const userInitials = (user?.name || user?.email || 'U').trim().slice(0, 1).toUpperCase();

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="p-2 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* Recolhido, o botão vira um quadrado de 32 px (a largura dos itens do menu): antes ele
                mantinha o padding de 12 px, era espremido a 31 px e a caixa de 36 px da inicial
                transbordava do menu. O nome fica no aria-label porque o texto some. */}
            <button
              aria-label={`Empresa ${company?.name || 'Workspace'}`}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-sidebar-accent transition-colors text-left group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:!p-0"
            >
              <div className="relative shrink-0">
                {/* Neutro: um bloco de 36px de acento em TODAS as telas gastava, no shell,
                    a cor que pertence à página. A inicial já identifica a empresa. */}
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--superficie-tonal)] text-lg font-bold group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:text-base text-foreground">
                  {initials}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[var(--sucesso)] border-2 border-sidebar" />
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
          <SidebarGroup
            key={group.label}
            className="group-data-[collapsible=icon]:mt-1 group-data-[collapsible=icon]:border-t group-data-[collapsible=icon]:border-sidebar-border/60 group-data-[collapsible=icon]:pt-2 first:group-data-[collapsible=icon]:mt-0 first:group-data-[collapsible=icon]:border-t-0 first:group-data-[collapsible=icon]:pt-2"
          >
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

      <SidebarFooter className="gap-1 border-t border-sidebar-border/60 px-3 pb-3 pt-2 group-data-[collapsible=icon]:px-2">
        <SidebarMenu>
          <SidebarMenuItem>
            {/* `size="lg"` (48 px): com a altura padrão (32 px) as duas linhas de texto não cabiam e
                "Ver configurações" era cortada pelo overflow do botão. */}
            <SidebarMenuButton
              asChild
              size="lg"
              tooltip="Ver configurações"
              className="gap-3 rounded-lg px-2 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center"
            >
              <Link to="/settings" activeOptions={{ exact: false }}>
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-[var(--superficie-tonal)] text-xs font-semibold">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <p className="truncate text-sm font-medium leading-tight">{user?.name || user?.email}</p>
                  <p className="mt-0.5 truncate text-[11px] font-normal leading-tight text-muted-foreground">
                    Ver configurações
                  </p>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
      {!isMobile && <AlcaDoMenu recolhido={recolhido} onAlternar={toggleSidebar} />}
    </Sidebar>
  );
}
