import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { chatService, type ChatConversation, type ChatMessage } from '@/modules/chat/services/chatService';
import { supabase } from '@/lib/supabase';
import { createChatVisitorClient } from '@/lib/supabase-visitor';
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
  const visitorClient = useMemo(() => createChatVisitorClient(visitorId), [visitorId]);
  const [conversation, setConversation] = useState<ChatConversation | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [started, setStarted] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [visitorEmail, setVisitorEmail] = useState('');
  const [domainAllowed, setDomainAllowed] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = new URLSearchParams(window.location.search);
        const pageUrl = qs.get('lf_page') || document.referrer || '';
        let domain = '';
        try { domain = pageUrl ? new URL(pageUrl).hostname : ''; } catch { /* noop */ }
        const { data, error } = await supabase.rpc('is_chat_domain_allowed' as never, { p_company_id: companyId, p_domain: domain } as never);
        if (cancelled) return;
        setDomainAllowed(error ? true : !!data);
      } catch {
        if (!cancelled) setDomainAllowed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  // Auto-open existing conversation (or one just created by an agent proactively)
  useEffect(() => {
    if (started || !companyId) return;
    let cancelled = false;
    (async () => {
      const existing = await chatService.findOpenByVisitor(companyId, visitorId);
      if (!cancelled && existing) {
        setConversation(existing);
        setVisitorName(existing.visitor_name ?? '');
        setStarted(true);
      }
    })();
    const channel = supabase
      .channel(`visitor_conv_${visitorId}`)
      .on(
        'postgres_changes' as never,
        { event: 'INSERT', schema: 'public', table: 'chat_conversations', filter: `visitor_id=eq.${visitorId}` } as never,
        (payload: { new: ChatConversation }) => {
          if (payload.new.company_id !== companyId) return;
          setConversation(payload.new);
          setVisitorName(payload.new.visitor_name ?? '');
          setStarted(true);
        },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [companyId, visitorId, started]);


  useEffect(() => {
    if (!conversation) return;
    chatService.listMessages(conversation.id).then(setMessages);
    const offMsg = chatService.subscribeToMessages(conversation.id, (m) => {
      setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
    });
    const offConv = chatService.subscribeToConversations(conversation.company_id, async () => {
      const list = await chatService.listConversations(conversation.company_id);
      const current = list.find((c) => c.id === conversation.id);
      if (current) setConversation(current);
    });
    return () => { offMsg(); offConv(); };
  }, [conversation]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  // Presence: announce this visitor while the widget is open
  useEffect(() => {
    if (!companyId) return;
    const qs = new URLSearchParams(window.location.search);
    const pageUrl = qs.get('lf_page') || document.referrer || window.location.href;
    const channel = supabase.channel(`presence_visitors_${companyId}`, {
      config: { presence: { key: visitorId } },
    });
    channel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          visitor_id: visitorId,
          page_url: pageUrl,
          visitor_name: visitorName || null,
          online_at: new Date().toISOString(),
        });
      }
    });
    return () => { supabase.removeChannel(channel); };
  }, [companyId, visitorId, visitorName]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!visitorName.trim()) return;
    const qs = new URLSearchParams(window.location.search);
    const trackingKeys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','fbc','fbp','gclid','gbraid','wbraid'];
    const tracking: Record<string, string | null> = {};
    for (const k of trackingKeys) { const v = qs.get(k); if (v) tracking[k] = v; }
    const parentUrl = qs.get('lf_page') || document.referrer || window.location.href;
    const parentReferrer = qs.get('lf_ref') || document.referrer || '';
    const conv = await chatService.getOrCreateConversation({
      companyId,
      visitorId,
      visitorName: visitorName.trim(),
      visitorEmail: visitorEmail.trim() || undefined,
      pageUrl: parentUrl,
      referrer: parentReferrer,
      tracking,
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

  if (domainAllowed === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center">
        <div className="max-w-sm space-y-2">
          <h2 className="text-base font-semibold">Chat indisponível</h2>
          <p className="text-sm text-muted-foreground">Este site não está autorizado a usar o chat.</p>
        </div>
      </div>
    );
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
      {conversation?.status === 'closed' ? (
        <RatingBar conversation={conversation} onRated={(c) => setConversation(c)} />
      ) : (
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
      )}
    </div>
  );
}

function RatingBar({ conversation, onRated }: { conversation: ChatConversation; onRated: (c: ChatConversation) => void }) {
  const [rating, setRating] = useState<number | null>(conversation.rating);
  const [hover, setHover] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const alreadyRated = !!conversation.rating;

  async function submit(value: number) {
    if (alreadyRated || submitting) return;
    setSubmitting(true);
    try {
      await chatService.rateConversation(conversation.id, value, comment.trim() || undefined);
      onRated({ ...conversation, rating: value, rating_comment: comment.trim() || null, rated_at: new Date().toISOString() });
    } finally {
      setSubmitting(false);
    }
  }

  if (alreadyRated) {
    return (
      <div className="border-t p-4 bg-card text-center text-sm text-muted-foreground">
        Obrigado pela sua avaliação! ⭐ {conversation.rating}/5
      </div>
    );
  }

  return (
    <div className="border-t p-4 bg-card space-y-2">
      <div className="text-sm font-medium">Como foi o atendimento?</div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(null)}
            className="text-2xl leading-none transition-transform hover:scale-110"
            aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
          >
            <span className={cn((hover ?? rating ?? 0) >= n ? 'text-amber-500' : 'text-muted-foreground/40')}>★</span>
          </button>
        ))}
      </div>
      <textarea
        className="w-full border rounded-md px-2 py-1.5 text-xs bg-background resize-none"
        placeholder="Comentário (opcional)"
        rows={2}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <button
        type="button"
        className="w-full bg-primary text-primary-foreground rounded-md py-1.5 text-xs font-medium disabled:opacity-50"
        disabled={!rating || submitting}
        onClick={() => rating && submit(rating)}
      >
        {submitting ? 'Enviando…' : 'Enviar avaliação'}
      </button>
    </div>
  );
}

