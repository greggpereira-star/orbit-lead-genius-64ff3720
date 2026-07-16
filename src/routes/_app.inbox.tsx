import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatService, type ChatConversation, type ChatMessage } from '@/modules/chat/services/chatService';
import { chatTeamService, type ChatDepartment, type ChatOperator } from '@/modules/chat/services/chatTeamService';
import { quickReplyService, type ChatQuickReply } from '@/modules/chat/services/quickReplyService';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Link } from '@tanstack/react-router';
import { Send, MessageCircle, Circle, CheckCheck, User, Zap, ArrowRightLeft } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const Route = createFileRoute('/_app/inbox')({
  component: InboxPage,
});

function InboxPage() {
  const { company, user } = useAuth();
  const companyId = company?.id;
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  const conversationsQuery = useQuery({
    queryKey: ['chat', 'conversations', companyId],
    queryFn: () => chatService.listConversations(companyId!),
    enabled: !!companyId,
  });

  useEffect(() => {
    if (!companyId) return;
    return chatService.subscribeToConversations(companyId, () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations', companyId] });
    });
  }, [companyId, queryClient]);

  const conversations = conversationsQuery.data ?? [];
  const active = useMemo(() => conversations.find((c) => c.id === activeId) ?? null, [conversations, activeId]);

  useEffect(() => {
    if (!activeId && conversations.length > 0) setActiveId(conversations[0].id);
  }, [conversations, activeId]);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <header className="px-6 py-4 border-b flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MessageCircle className="h-6 w-6" /> Chat ao vivo
          </h1>
          <p className="text-sm text-muted-foreground">Atenda visitantes do site em tempo real, capture leads e acompanhe toda a jornada de origem.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/chat-reports">Relatórios</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings/widgets">Instalar widget</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings/widgets">Configurar WhatsApp</Link>
          </Button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-[320px_1fr] overflow-hidden">
        <aside className="border-r overflow-y-auto">
          {conversationsQuery.isLoading && <div className="p-4 text-sm text-muted-foreground">Carregando…</div>}
          {conversations.length === 0 && !conversationsQuery.isLoading && (
            <div className="p-6 text-sm text-muted-foreground space-y-3">
              <p className="font-medium text-foreground">Nenhuma conversa ainda</p>
              <p>Instale o widget no seu site ou ative o botão de WhatsApp para começar a receber mensagens.</p>
              <Button size="sm" className="w-full" asChild>
                <Link to="/settings/widgets">Ver instruções</Link>
              </Button>
            </div>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={cn(
                'w-full text-left px-4 py-3 border-b hover:bg-muted/40 transition-colors',
                activeId === c.id && 'bg-muted',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">
                  {c.visitor_name || c.visitor_email || `Visitante ${c.visitor_id.slice(0, 6)}`}
                </span>
                {c.unread_agent > 0 && (
                  <Badge className="h-5 min-w-5 rounded-full px-1.5">{c.unread_agent}</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Circle className={cn('h-2 w-2 fill-current', c.status === 'open' ? 'text-emerald-500' : c.status === 'pending' ? 'text-amber-500' : 'text-muted-foreground')} />
                {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true, locale: ptBR })}
              </div>
            </button>
          ))}
        </aside>

        <section className="flex flex-col overflow-hidden">
          {active ? (
            <ConversationView key={active.id} conversation={active} agentId={user?.id ?? ''} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-8">
              <MessageCircle className="h-12 w-12 text-muted-foreground/40" />
              <div>
                <p className="font-medium">Nenhuma conversa ainda</p>
                <p className="text-sm text-muted-foreground max-w-md">
                  Instale o widget no seu site ou ative o botão de WhatsApp para começar a receber mensagens.
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" asChild>
                  <Link to="/settings/widgets">Instalar widget</Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/settings/widgets">Configurar WhatsApp</Link>
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ConversationView({ conversation, agentId }: { conversation: ChatConversation; agentId: string }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const messagesQuery = useQuery({
    queryKey: ['chat', 'messages', conversation.id],
    queryFn: () => chatService.listMessages(conversation.id),
  });
  const messages: ChatMessage[] = messagesQuery.data ?? [];

  const repliesQuery = useQuery({
    queryKey: ['chat', 'quick-replies', conversation.company_id],
    queryFn: () => quickReplyService.list(conversation.company_id),
  });
  const replies: ChatQuickReply[] = repliesQuery.data ?? [];

  const filteredReplies = useMemo(() => {
    if (!text.startsWith('/')) return [] as ChatQuickReply[];
    const q = text.slice(1).toLowerCase();
    return replies
      .filter((r) => r.shortcut.toLowerCase().includes(q) || r.content.toLowerCase().includes(q))
      .slice(0, 6);
  }, [text, replies]);

  useEffect(() => {
    setShowReplies(text.startsWith('/') && filteredReplies.length > 0);
  }, [text, filteredReplies.length]);

  useEffect(() => {
    chatService.markRead(conversation.id, 'agent');
  }, [conversation.id, messages.length]);

  useEffect(() => {
    return chatService.subscribeToMessages(conversation.id, () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', conversation.id] });
    });
  }, [conversation.id, queryClient]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  function applyReply(r: ChatQuickReply) {
    setText(r.content);
    setShowReplies(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function send() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await chatService.sendAgentMessage({
        conversationId: conversation.id,
        companyId: conversation.company_id,
        senderId: agentId,
        content,
      });
      setText('');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="px-6 py-3 border-b flex items-center justify-between">
        <div>
          <div className="font-medium">
            {conversation.visitor_name || conversation.visitor_email || `Visitante ${conversation.visitor_id.slice(0, 8)}`}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            {conversation.visitor_email && <span>{conversation.visitor_email}</span>}
            {conversation.page_url && <span className="truncate">· {conversation.page_url}</span>}
            {conversation.rating && (
              <span className="text-amber-500 font-medium">· ★ {conversation.rating}/5</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(conversation as ChatConversation & { lead_id?: string | null }).lead_id && (
            <Button variant="secondary" size="sm" asChild>
              <Link to="/leads/$id" params={{ id: (conversation as ChatConversation & { lead_id?: string | null }).lead_id! }}>
                <User className="h-4 w-4 mr-1" /> Ver lead
              </Link>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await chatService.closeConversation(conversation.id);
              queryClient.invalidateQueries({ queryKey: ['chat', 'conversations', conversation.company_id] });
            }}
          >
            Encerrar
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-6 space-y-3 max-h-full overflow-y-auto">
          {messages.map((m) => (
            <div key={m.id} className={cn('flex', m.sender_type === 'agent' ? 'justify-end' : 'justify-start')}>
              <Card className={cn(
                'px-3 py-2 max-w-[70%] text-sm',
                m.sender_type === 'agent' ? 'bg-primary text-primary-foreground' : 'bg-muted',
              )}>
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
                <div className={cn('text-[10px] mt-1 flex items-center gap-1', m.sender_type === 'agent' ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                  {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  {m.sender_type === 'agent' && m.read_at && <CheckCheck className="h-3 w-3" />}
                </div>
              </Card>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="border-t relative">
        {showReplies && (
          <div className="absolute bottom-full left-0 right-0 mb-1 mx-3 rounded-md border bg-popover shadow-lg max-h-64 overflow-y-auto z-10">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground border-b flex items-center gap-1">
              <Zap className="h-3 w-3" /> Respostas rápidas
            </div>
            {filteredReplies.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => applyReply(r)}
                className="w-full text-left px-3 py-2 hover:bg-muted/60 border-b last:border-b-0"
              >
                <div className="text-xs font-medium">
                  <code className="bg-muted px-1 rounded">/{r.shortcut}</code>
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{r.content}</div>
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="p-3 flex items-center gap-2"
        >
          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escreva uma resposta… ( / para atalhos)"
            disabled={sending || conversation.status === 'closed'}
            onKeyDown={(e) => {
              if (e.key === 'Tab' && filteredReplies.length > 0) {
                e.preventDefault();
                applyReply(filteredReplies[0]);
              } else if (e.key === 'Escape') {
                setShowReplies(false);
              }
            }}
          />
          <Button type="submit" disabled={sending || !text.trim() || conversation.status === 'closed'}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </>
  );
}
