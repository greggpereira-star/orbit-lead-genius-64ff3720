import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * Etiquetas que existem de verdade no WhatsApp da empresa.
 *
 * O campo de etiqueta era texto livre, e isso fazia a pessoa digitar no escuro:
 * a Evolution não CRIA etiqueta, só associa uma existente. Quem escrevesse
 * "qualificado" onde o aparelho tem "Qualificado" não via nada acontecer, e o
 * motivo só aparecia depois, no registro de um card movido.
 */
export const listarEtiquetasDaEmpresa = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const admin = supabaseAdmin as any;

    const { data: mem } = await admin
      .from('memberships').select('company_id').eq('user_id', context.userId).limit(1).maybeSingle();
    if (!mem?.company_id) return { ok: false as const, motivo: 'sem empresa', etiquetas: [] };

    const { data: inst } = await admin
      .from('whatsapp_instances')
      .select('instance_name, status')
      .eq('company_id', mem.company_id)
      .maybeSingle();

    // Sem instância não há etiqueta para listar — e dizer isso é melhor que
    // devolver lista vazia, que a tela leria como "esta conta não tem etiqueta".
    if (!inst?.instance_name) {
      return { ok: false as const, motivo: 'WhatsApp não conectado', etiquetas: [] };
    }

    const { listarEtiquetas } = await import('@/lib/evolution.server');
    const r = await listarEtiquetas(inst.instance_name);
    if (!r.ok) return { ok: false as const, motivo: r.error ?? 'falha ao consultar', etiquetas: [] };

    return {
      ok: true as const,
      motivo: null,
      etiquetas: (r.data ?? []).map((e) => e.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    };
  });
