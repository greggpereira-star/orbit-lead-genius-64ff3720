import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { chatService, type ChatConversation, type ChatMessage } from '@/modules/chat/services/chatService';
import { cn } from '@/lib/utils';
import { Send } from 'lucide-react';

export const Route = createFileRoute('/chat-embed/$companyId')({
  component: EmbedChat,
  ssr: false,
});

function getVisitorId(companyId: string): string {
  const key = `altchat_vid_${companyId}`;
  let v = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
  if (!v) {
    v = `v_${crypto.randomUUID()}`;
    localStorage.setItem(key, v);
  }
  return v;
}

function EmbedChat() {
  const { companyId } = Route.useParams();
  const visitorId = useMemo(() => getVisitorId(companyId), [companyId]);
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [started, setStarted] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [visitorEmail, setVisitorEmail] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversation) return;
    chatService.listMessages(conversation.id).then(setMessages);
    return chatService.subscribeToMessages(conversation.id, (m) => {
      setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
    });
  }, [conversation]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!visitorName.trim()) return;
    const conv = await chatService.getOrCreateConversation({
      companyId,
      visitorId,
      visitorName: visitorName.trim(),
      visitorEmail: visitorEmail.trim() || undefined,
      pageUrl: document.referrer || window.location.href,
    });
    setConversation(conv);
    setStarted(true);
  }

  async function send() {
    if (!text.trim() || !conversation) return;
    const content = text.trim();
    setText('');
    await chatService.sendVisitorMessage({
      conversationId: conversation.id,
      companyId,
      content,
    });
  }

  if (!started) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <form onSubmit={start} className="w-full max-w-sm space-y-3 bg-card p-6 rounded-lg border">
          <h2 className="text-lg font-semibold">Como podemos ajudar?</h2>
          <p className="text-sm text-muted-foreground">Preencha seus dados para iniciar a conversa.</p>
          <input
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            placeholder="Seu nome *"
            value={visitorName}
            onChange={(e) => setVisitorName(e.target.value)}
            required
          />
          <input
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            placeholder="E-mail (opcional)"
            type="email"
            value={visitorEmail}
            onChange={(e) => setVisitorEmail(e.target.value)}
          />
          <button className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium" type="submit">
            Iniciar conversa
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="border-b px-4 py-3 bg-card">
        <div className="font-semibold text-sm">Atendimento</div>
        <div className="text-xs text-muted-foreground">Normalmente respondemos em instantes</div>
      </header>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((m) => (
          <div key={m.id} className={cn('flex', m.sender_type === 'visitor' ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              'px-3 py-2 rounded-lg max-w-[80%] text-sm',
              m.sender_type === 'visitor' ? 'bg-primary text-primary-foreground' : 'bg-muted',
            )}>
              <div className="whitespace-pre-wrap break-words">{m.content}</div>
              <div className={cn('text-[10px] mt-1', m.sender_type === 'visitor' ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t p-2 flex gap-2 bg-card">
        <input
          className="flex-1 border rounded-md px-3 py-2 text-sm bg-background"
          placeholder="Escreva uma mensagem…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="bg-primary text-primary-foreground rounded-md px-3" disabled={!text.trim()}>
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
