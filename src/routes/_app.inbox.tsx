import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatService, type ChatConversation, type ChatMessage } from '@/modules/chat/services/chatService';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Link } from '@tanstack/react-router';
import { Send, MessageCircle, Circle, CheckCheck, User } from 'lucide-react';
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
      <header className="px-6 py-4 border-b">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <MessageCircle className="h-6 w-6" /> Inbox
        </h1>
        <p className="text-sm text-muted-foreground">Chat ao vivo com visitantes do site em tempo real.</p>
      </header>

      <div className="flex-1 grid grid-cols-[320px_1fr] overflow-hidden">
        <aside className="border-r overflow-y-auto">
          {conversationsQuery.isLoading && <div className="p-4 text-sm text-muted-foreground">Carregando…</div>}
          {conversations.length === 0 && !conversationsQuery.isLoading && (
            <div className="p-6 text-sm text-muted-foreground">
              Nenhuma conversa ainda. Instale o widget no seu site para começar a receber mensagens.
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
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Selecione uma conversa
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const messagesQuery = useQuery({
    queryKey: ['chat', 'messages', conversation.id],
    queryFn: () => chatService.listMessages(conversation.id),
  });
  const messages: ChatMessage[] = messagesQuery.data ?? [];

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
          <div className="text-xs text-muted-foreground">
            {conversation.visitor_email && <span>{conversation.visitor_email} · </span>}
            {conversation.page_url && <span className="truncate">{conversation.page_url}</span>}
          </div>
        </div>
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

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="border-t p-3 flex items-center gap-2"
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva uma resposta…"
          disabled={sending || conversation.status === 'closed'}
        />
        <Button type="submit" disabled={sending || !text.trim() || conversation.status === 'closed'}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </>
  );
}
