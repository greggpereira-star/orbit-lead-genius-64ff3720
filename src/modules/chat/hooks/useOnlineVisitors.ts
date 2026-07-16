import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface OnlineVisitor {
  visitor_id: string;
  page_url: string;
  visitor_name?: string | null;
  online_at: string;
}

/**
 * Presence channel key per company. Visitors join with their metadata,
 * agents subscribe read-only to see who is currently browsing.
 */
export function useOnlineVisitors(companyId: string | undefined) {
  const [visitors, setVisitors] = useState<OnlineVisitor[]>([]);

  useEffect(() => {
    if (!companyId) return;
    const channel = supabase.channel(`presence_visitors_${companyId}`, {
      config: { presence: { key: 'agent' } },
    });

    const sync = () => {
      const state = channel.presenceState() as Record<string, OnlineVisitor[]>;
      const flat: OnlineVisitor[] = [];
      for (const key of Object.keys(state)) {
        if (key === 'agent') continue;
        for (const meta of state[key]) flat.push(meta);
      }
      // dedupe by visitor_id keeping the newest
      const map = new Map<string, OnlineVisitor>();
      for (const v of flat) {
        const prev = map.get(v.visitor_id);
        if (!prev || new Date(v.online_at) > new Date(prev.online_at)) map.set(v.visitor_id, v);
      }
      setVisitors(Array.from(map.values()));
    };

    channel
      .on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await channel.track({ role: 'agent' });
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  return visitors;
}
