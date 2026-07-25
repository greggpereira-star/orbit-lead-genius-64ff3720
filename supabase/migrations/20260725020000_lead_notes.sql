-- Anotações e agendamentos por lead.
--
-- O corretor precisa registrar o que foi negociado e marcar a visita ao
-- empreendimento. São a mesma coisa com uma diferença: o agendamento tem data
-- futura. Por isso uma tabela só, com scheduled_for opcional — evita duas
-- estruturas quase iguais e deixa o histórico do lead em ordem cronológica
-- única, que é como o corretor lê.
--
-- Generaliza fora do mercado imobiliário: visita vira consulta numa clínica,
-- entrevista numa escola. O que muda é a palavra, não o dado.
CREATE TABLE IF NOT EXISTS public.lead_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,

    -- Quem escreveu. ON DELETE SET NULL: se o usuário sair da empresa, a
    -- anotação continua valendo — o histórico do lead não pode sumir junto.
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    author_name TEXT,

    body TEXT NOT NULL CHECK (length(trim(body)) > 0),

    -- Preenchido = compromisso marcado. Vazio = só anotação.
    scheduled_for TIMESTAMPTZ,
    done BOOLEAN NOT NULL DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_notes_lead_created_idx
    ON public.lead_notes (lead_id, created_at DESC);

-- Índice parcial: a consulta "próximos compromissos" só olha os que têm data
-- e ainda não foram concluídos, então não vale indexar o resto.
CREATE INDEX IF NOT EXISTS lead_notes_upcoming_idx
    ON public.lead_notes (company_id, scheduled_for)
    WHERE scheduled_for IS NOT NULL AND done = false;

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem anotacoes da empresa" ON public.lead_notes;
CREATE POLICY "Membros leem anotacoes da empresa" ON public.lead_notes
    FOR SELECT USING (
        auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = lead_notes.company_id)
    );

DROP POLICY IF EXISTS "Membros criam anotacoes na empresa" ON public.lead_notes;
CREATE POLICY "Membros criam anotacoes na empresa" ON public.lead_notes
    FOR INSERT WITH CHECK (
        auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = lead_notes.company_id)
    );

-- Editar e apagar só o que a própria pessoa escreveu: anotação é registro de
-- quem atendeu, não documento coletivo.
DROP POLICY IF EXISTS "Autor edita a propria anotacao" ON public.lead_notes;
CREATE POLICY "Autor edita a propria anotacao" ON public.lead_notes
    FOR UPDATE USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Autor apaga a propria anotacao" ON public.lead_notes;
CREATE POLICY "Autor apaga a propria anotacao" ON public.lead_notes
    FOR DELETE USING (auth.uid() = author_id);

-- ------------------------------------------------------------------
-- Etiquetas: a tabela já existia (criada pelo captureService), mas sem
-- company_id nem RLS — qualquer usuário autenticado leria as tags de
-- qualquer empresa. Como está vazia, dá pra corrigir sem migrar dado.
-- ------------------------------------------------------------------
ALTER TABLE public.lead_tags
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Preenche company_id a partir do lead, para linhas que existirem.
UPDATE public.lead_tags t
   SET company_id = l.company_id
  FROM public.leads l
 WHERE t.lead_id = l.id AND t.company_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS lead_tags_lead_tag_uniq
    ON public.lead_tags (lead_id, tag_name);

ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros gerenciam etiquetas da empresa" ON public.lead_tags;
CREATE POLICY "Membros gerenciam etiquetas da empresa" ON public.lead_tags
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.leads l
            JOIN public.memberships m ON m.company_id = l.company_id
            WHERE l.id = lead_tags.lead_id AND m.user_id = auth.uid()
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.leads l
            JOIN public.memberships m ON m.company_id = l.company_id
            WHERE l.id = lead_tags.lead_id AND m.user_id = auth.uid()
        )
    );
