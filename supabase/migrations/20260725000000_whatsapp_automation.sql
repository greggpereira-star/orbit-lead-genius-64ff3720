-- Automação de WhatsApp via Evolution API.
--
-- Contexto: o projeto tinha "whatsapp" em vários lugares, mas nada que enviasse
-- mensagem — só rastreio de clique (whatsapp_click_events) e Conversions API
-- (whatsapp_capi_dlq). Estas tabelas dão suporte ao envio real: uma conexão de
-- número por empresa, as configurações das mensagens automáticas e o log de
-- tudo que sai/entra.

-- Conexão do número com a Evolution API (pareamento por QR code).
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    instance_name TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'disconnected',
    phone_number TEXT,
    last_connected_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uma conexão por empresa: evita duas instâncias disputando o mesmo número.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_instances_company_uniq
    ON public.whatsapp_instances (company_id);

-- Configurações das duas mensagens automáticas.
CREATE TABLE IF NOT EXISTS public.whatsapp_automation_settings (
    company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,

    -- Saudação enviada ao próprio lead
    greeting_enabled BOOLEAN NOT NULL DEFAULT false,
    greeting_template TEXT NOT NULL DEFAULT
        'Olá {{nome}}! 👋 Recebemos seu contato e um consultor já vai falar com você por aqui.',

    -- Alerta enviado ao corretor
    broker_alert_enabled BOOLEAN NOT NULL DEFAULT false,
    broker_alert_phone TEXT,
    broker_alert_template TEXT NOT NULL DEFAULT
        E'🔔 Novo lead: {{nome}}\nTelefone: {{telefone}}\nCampanha: {{campanha}}\nAbrir conversa: {{link}}',

    -- Proteções contra banimento: só envia dentro da janela e com intervalo.
    quiet_hours_start SMALLINT NOT NULL DEFAULT 8,
    quiet_hours_end SMALLINT NOT NULL DEFAULT 21,
    min_interval_seconds INTEGER NOT NULL DEFAULT 8,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Log de mensagens. Serve de auditoria, base pra retentativa e, na Fase 2,
-- vira o histórico da caixa de entrada.
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
    kind TEXT NOT NULL DEFAULT 'greeting'
        CHECK (kind IN ('greeting', 'broker_alert', 'manual', 'reply')),
    to_phone TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'received')),
    provider_message_id TEXT,
    error_message TEXT,
    skipped_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_messages_company_created_idx
    ON public.whatsapp_messages (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_messages_lead_idx
    ON public.whatsapp_messages (lead_id);

-- Evita mandar duas saudações pro mesmo lead se o webhook do Meta reprocessar
-- o mesmo leadgen_id (o processador é idempotente, mas o envio precisa ser também).
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_lead_kind_uniq
    ON public.whatsapp_messages (lead_id, kind)
    WHERE lead_id IS NOT NULL AND direction = 'outbound' AND status IN ('sent', 'pending');

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros gerenciam a conexao da empresa" ON public.whatsapp_instances;
CREATE POLICY "Membros gerenciam a conexao da empresa" ON public.whatsapp_instances
    FOR ALL USING (
        auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = whatsapp_instances.company_id)
    ) WITH CHECK (
        auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = whatsapp_instances.company_id)
    );

DROP POLICY IF EXISTS "Membros gerenciam as configuracoes da empresa" ON public.whatsapp_automation_settings;
CREATE POLICY "Membros gerenciam as configuracoes da empresa" ON public.whatsapp_automation_settings
    FOR ALL USING (
        auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = whatsapp_automation_settings.company_id)
    ) WITH CHECK (
        auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = whatsapp_automation_settings.company_id)
    );

DROP POLICY IF EXISTS "Membros veem as mensagens da empresa" ON public.whatsapp_messages;
CREATE POLICY "Membros veem as mensagens da empresa" ON public.whatsapp_messages
    FOR SELECT USING (
        auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = whatsapp_messages.company_id)
    );
