import { supabase } from '@/lib/supabase';

export interface ChatConversation {
  id: string;
  company_id: string;
  visitor_id: string;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  status: 'open' | 'pending' | 'closed';
  assigned_to: string | null;
  department_id: string | null;
  page_url: string | null;
  metadata: Record<string, unknown>;
  last_message_at: string;
  unread_agent: number;
  unread_visitor: number;
  lead_id: string | null;
  rating: number | null;
  rating_comment: string | null;
  rated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  company_id: string;
  sender_type: 'visitor' | 'agent' | 'system';
  sender_id: string | null;
  content: string;
  attachments: unknown[];
  read_at: string | null;
  created_at: string;
}

const CONV = 'chat_conversations' as never;
const MSG = 'chat_messages' as never;

export const chatService = {
  async listConversations(companyId: string, status?: 'open' | 'pending' | 'closed'): Promise<ChatConversation[]> {
    let q = supabase.from(CONV).select('*').eq('company_id' as never, companyId as never).order('last_message_at' as never, { ascending: false });
    if (status) q = q.eq('status' as never, status as never);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as ChatConversation[];
  },

  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from(MSG)
      .select('*')
      .eq('conversation_id' as never, conversationId as never)
      .order('created_at' as never, { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as ChatMessage[];
  },

  async sendAgentMessage(input: { conversationId: string; companyId: string; senderId: string; content: string }): Promise<void> {
    const { error } = await supabase.from(MSG).insert({
      conversation_id: input.conversationId,
      company_id: input.companyId,
      sender_type: 'agent',
      sender_id: input.senderId,
      content: input.content,
    } as never);
    if (error) throw error;
  },

  async sendVisitorMessage(input: { conversationId: string; companyId: string; content: string }): Promise<void> {
    const { error } = await supabase.from(MSG).insert({
      conversation_id: input.conversationId,
      company_id: input.companyId,
      sender_type: 'visitor',
      content: input.content,
    } as never);
    if (error) throw error;
  },

  async getOrCreateConversation(input: {
    companyId: string;
    visitorId: string;
    visitorName?: string;
    visitorEmail?: string;
    pageUrl?: string;
    referrer?: string;
    tracking?: Record<string, string | null>;
  }): Promise<ChatConversation> {
    const { data: existing } = await supabase
      .from(CONV)
      .select('*')
      .eq('company_id' as never, input.companyId as never)
      .eq('visitor_id' as never, input.visitorId as never)
      .neq('status' as never, 'closed' as never)
      .order('last_message_at' as never, { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) return existing as unknown as ChatConversation;

    const { data, error } = await supabase
      .from(CONV)
      .insert({
        company_id: input.companyId,
        visitor_id: input.visitorId,
        visitor_name: input.visitorName ?? null,
        visitor_email: input.visitorEmail ?? null,
        page_url: input.pageUrl ?? null,
        referrer: input.referrer ?? null,
        tracking: input.tracking ?? {},
      } as never)
      .select('*')
      .single();
    if (error) throw error;
    return data as unknown as ChatConversation;
  },


  async markRead(conversationId: string, side: 'agent' | 'visitor'): Promise<void> {
    const patch = side === 'agent' ? { unread_agent: 0 } : { unread_visitor: 0 };
    await supabase.from(CONV).update(patch as never).eq('id' as never, conversationId as never);
  },

  async closeConversation(conversationId: string): Promise<void> {
    await supabase.from(CONV).update({ status: 'closed' } as never).eq('id' as never, conversationId as never);
  },

  async rateConversation(conversationId: string, rating: number, comment?: string): Promise<void> {
    const { error } = await supabase
      .from(CONV)
      .update({ rating, rating_comment: comment ?? null, rated_at: new Date().toISOString() } as never)
      .eq('id' as never, conversationId as never);
    if (error) throw error;
  },

  subscribeToConversations(companyId: string, onChange: () => void) {
    const channel = supabase
      .channel(`chat_conv_${companyId}`)
      .on('postgres_changes' as never, { event: '*', schema: 'public', table: 'chat_conversations', filter: `company_id=eq.${companyId}` } as never, onChange)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  },

  subscribeToMessages(conversationId: string, onInsert: (msg: ChatMessage) => void) {
    const channel = supabase
      .channel(`chat_msg_${conversationId}`)
      .on('postgres_changes' as never, { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` } as never, (payload: { new: ChatMessage }) => onInsert(payload.new))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  },
};
