import { supabase } from '@/lib/supabase';

export interface ChatReportSummary {
  total: number;
  open: number;
  pending: number;
  closed: number;
  messagesTotal: number;
  messagesFromAgents: number;
  messagesFromVisitors: number;
  avgMessagesPerConversation: number;
  leadsCaptured: number;
  conversionRate: number;
  avgRating: number | null;
  ratingCount: number;
  byDay: { date: string; conversations: number; messages: number }[];
  topPages: { url: string; count: number }[];
}

const CONV = 'chat_conversations' as never;
const MSG = 'chat_messages' as never;

export const chatReportsService = {
  async summary(companyId: string, days = 30): Promise<ChatReportSummary> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: convs } = await supabase
      .from(CONV)
      .select('id,status,page_url,lead_id,created_at,rating')
      .eq('company_id' as never, companyId as never)
      .gte('created_at' as never, since as never);

    const { data: msgs } = await supabase
      .from(MSG)
      .select('id,sender_type,created_at')
      .eq('company_id' as never, companyId as never)
      .gte('created_at' as never, since as never);

    const conversations = (convs ?? []) as Array<{ id: string; status: string; page_url: string | null; lead_id: string | null; created_at: string; rating: number | null }>;
    const messages = (msgs ?? []) as Array<{ id: string; sender_type: string; created_at: string }>;

    const open = conversations.filter((c) => c.status === 'open').length;
    const pending = conversations.filter((c) => c.status === 'pending').length;
    const closed = conversations.filter((c) => c.status === 'closed').length;
    const leadsCaptured = conversations.filter((c) => !!c.lead_id).length;
    const total = conversations.length;

    const messagesFromAgents = messages.filter((m) => m.sender_type === 'agent').length;
    const messagesFromVisitors = messages.filter((m) => m.sender_type === 'visitor').length;

    const dayMap = new Map<string, { conversations: number; messages: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      dayMap.set(d, { conversations: 0, messages: 0 });
    }
    conversations.forEach((c) => {
      const d = c.created_at.slice(0, 10);
      const entry = dayMap.get(d);
      if (entry) entry.conversations++;
    });
    messages.forEach((m) => {
      const d = m.created_at.slice(0, 10);
      const entry = dayMap.get(d);
      if (entry) entry.messages++;
    });

    const pageCounts = new Map<string, number>();
    conversations.forEach((c) => {
      if (!c.page_url) return;
      try {
        const url = new URL(c.page_url);
        const key = url.host + url.pathname;
        pageCounts.set(key, (pageCounts.get(key) ?? 0) + 1);
      } catch {
        pageCounts.set(c.page_url, (pageCounts.get(c.page_url) ?? 0) + 1);
      }
    });
    const topPages = Array.from(pageCounts.entries())
      .map(([url, count]) => ({ url, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      total,
      open,
      pending,
      closed,
      messagesTotal: messages.length,
      messagesFromAgents,
      messagesFromVisitors,
      avgMessagesPerConversation: total > 0 ? messages.length / total : 0,
      leadsCaptured,
      conversionRate: total > 0 ? (leadsCaptured / total) * 100 : 0,
      byDay: Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v })),
      topPages,
    };
  },
};
