-- Anexos por lead (proposta, contrato, documento).
--
-- Bucket PRIVADO de propósito: proposta comercial com valores não pode ficar
-- acessível por quem descobrir a URL. O acesso é sempre por URL assinada de
-- curta duração, gerada na hora do clique.
--
-- O caminho é {company_id}/{lead_id}/{uuid}.{ext} — o primeiro nível ser a
-- empresa é o que permite a política de storage isolar um cliente do outro.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'lead-attachments',
    'lead-attachments',
    false,
    10485760, -- 10 MB
    ARRAY[
        'application/pdf',
        'image/jpeg', 'image/png', 'image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
)
ON CONFLICT (id) DO UPDATE
    SET file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types,
        public = false;

-- Políticas de storage: a pasta raiz do caminho é o company_id, então basta
-- conferir se quem pede é membro daquela empresa.
DROP POLICY IF EXISTS "Membros leem anexos da empresa" ON storage.objects;
CREATE POLICY "Membros leem anexos da empresa" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'lead-attachments'
        AND (storage.foldername(name))[1] IN (
            SELECT company_id::text FROM public.memberships WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Membros enviam anexos da empresa" ON storage.objects;
CREATE POLICY "Membros enviam anexos da empresa" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'lead-attachments'
        AND (storage.foldername(name))[1] IN (
            SELECT company_id::text FROM public.memberships WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Membros apagam anexos da empresa" ON storage.objects;
CREATE POLICY "Membros apagam anexos da empresa" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'lead-attachments'
        AND (storage.foldername(name))[1] IN (
            SELECT company_id::text FROM public.memberships WHERE user_id = auth.uid()
        )
    );

-- Metadados do anexo. O arquivo vive no storage; aqui fica o que a tela
-- precisa listar sem ter que consultar o storage a cada render.
CREATE TABLE IF NOT EXISTS public.lead_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,

    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    uploaded_by_name TEXT,

    storage_path TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    mime_type TEXT,
    size_bytes BIGINT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_attachments_lead_idx
    ON public.lead_attachments (lead_id, created_at DESC);

ALTER TABLE public.lead_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem anexos" ON public.lead_attachments;
CREATE POLICY "Membros leem anexos" ON public.lead_attachments
    FOR SELECT USING (
        auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = lead_attachments.company_id)
    );

DROP POLICY IF EXISTS "Membros registram anexos" ON public.lead_attachments;
CREATE POLICY "Membros registram anexos" ON public.lead_attachments
    FOR INSERT WITH CHECK (
        auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = lead_attachments.company_id)
    );

-- Apagar anexo é diferente de apagar anotação: qualquer membro pode remover,
-- porque um documento errado anexado ao lead precisa sair mesmo que quem
-- subiu não esteja disponível.
DROP POLICY IF EXISTS "Membros apagam anexos" ON public.lead_attachments;
CREATE POLICY "Membros apagam anexos" ON public.lead_attachments
    FOR DELETE USING (
        auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = lead_attachments.company_id)
    );
