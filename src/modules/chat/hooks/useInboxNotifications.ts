import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatService, type ChatMessage } from '@/modules/chat/services/chatService';
import { supabase } from '@/lib/supabase';

const NOTIF_SOUND_URL =
  'data:audio/wav;base64,UklGRlQFAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YTAFAAAAAAgAEAAXAB4AJAApAC0AMAAxADEAMAAtACkAJAAeABcAEAAIAAAA+P/w/+n/4v/c/9f/0//Q/8//z//Q/9P/1//c/+L/6f/w//j/AAAIABAAFwAeACQAKQAtADAAMQAxADAALQApACQAHgAXABAACAAAAPj/8P/p/+L/3P/X/9P/0P/P/8//0P/T/9f/3P/i/+n/8P/4/wAA';

function playChime() {
  try {
    const audio = new Audio(NOTIF_SOUND_URL);
    audio.volume = 0.4;
    void audio.play().catch(() => {});
  } catch {
    // ignore
  }
}

function showDesktopNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '/favicon.ico', tag: 'inbox-chat' });
    } catch {
      // ignore
    }
  }
}

export function useInboxNotifications(companyId: string | undefined) {
  const queryClient = useQueryClient();
  const seenMessageIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  const conversationsQuery = useQuery({
    queryKey: ['chat', 'conversations', companyId],
    queryFn: () => chatService.listConversations(companyId!),
    enabled: !!companyId,
    refetchOnWindowFocus: true,
  });

  const unreadCount = useMemo(() => {
    return (conversationsQuery.data ?? []).reduce((sum, c) => sum + (c.unread_agent || 0), 0);
  }, [conversationsQuery.data]);

  // Request desktop notification permission once
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Global realtime subscription: any new visitor message across the company
  useEffect(() => {
    if (!companyId) return;
    initialized.current = false;
    seenMessageIds.current = new Set();

    const channel = supabase
      .channel(`inbox_notify_${companyId}`)
      .on(
        'postgres_changes' as never,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `company_id=eq.${companyId}`,
        } as never,
        (payload: { new: ChatMessage }) => {
          const msg = payload.new;
          if (!msg || msg.sender_type !== 'visitor') return;
          if (seenMessageIds.current.has(msg.id)) return;
          seenMessageIds.current.add(msg.id);

          queryClient.invalidateQueries({ queryKey: ['chat', 'conversations', companyId] });
          queryClient.invalidateQueries({ queryKey: ['chat', 'messages', msg.conversation_id] });

          const isInboxOpen = typeof window !== 'undefined' && window.location.pathname.startsWith('/inbox');
          if (!isInboxOpen) {
            playChime();
            showDesktopNotification('Nova mensagem no Inbox', msg.content.slice(0, 120));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, queryClient]);

  return { unreadCount };
}
