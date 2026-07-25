-- Recebimento de mensagens (preparação da Fase 2).
--
-- O envio da Fase 1 já funciona; aqui entra o caminho de volta. Duas coisas:
-- registrar quem pediu pra parar de receber (o que protege o número de ser
-- denunciado, principal caminho pro banimento) e saber a data da última
-- resposta de cada contato.

-- Quem mandou "SAIR"/"PARAR" nunca mais recebe mensagem automática.
-- Guardado por telefone, não por lead: o mesmo número pode voltar como lead
-- novo depois, e a vontade dele continua valendo.
CREATE TABLE IF NOT EXISTS public.whatsapp_optouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_optouts_company_phone_uniq
    ON public.whatsapp_optouts (company_id, phone);

ALTER TABLE public.whatsapp_optouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros veem os optouts da empresa" ON public.whatsapp_optouts;
CREATE POLICY "Membros veem os optouts da empresa" ON public.whatsapp_optouts
    FOR SELECT USING (
        auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = whatsapp_optouts.company_id)
    );

-- O índice único da Fase 1 cobria só envios ('sent'/'pending') e mensagens de
-- saída. Mensagens recebidas não têm lead_id garantido nem devem colidir com
-- ele, então nada muda aqui — só registramos que 'received' já é um status
-- válido em whatsapp_messages (definido na migration anterior).

-- Índice pra achar rápido a conversa de um telefone (base da caixa de entrada).
CREATE INDEX IF NOT EXISTS whatsapp_messages_company_phone_idx
    ON public.whatsapp_messages (company_id, to_phone, created_at DESC);
