-- Cria o bucket quiz-media, que faltava.
--
-- A migration 20260716160124 criou as QUATRO políticas de storage para
-- 'quiz-media', mas nunca o bucket em si — ele tinha sido criado à mão pelo
-- painel do Supabase hospedado e, por isso, não estava versionado. Ao migrar
-- para o Supabase self-hosted as políticas vieram junto e o bucket não,
-- deixando todo upload de mídia do Alt Quiz falhando com "Bucket not found".
--
-- Mesmo padrão do fix do cron do Meta que se perdeu: o que é feito no painel
-- e não vira migration não sobrevive a uma troca de infraestrutura.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'quiz-media',
    'quiz-media',
    -- Privado: as políticas já existentes restringem acesso aos membros da
    -- empresa. O player público funciona mesmo assim porque o mediaService
    -- serve por URL assinada, que é validada pelo storage sem passar por RLS.
    false,
    20971520, -- 20 MB: o maior limite que o mediaService aceita (vídeo)
    ARRAY[
        'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
        'video/mp4', 'video/webm', 'video/quicktime',
        'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mp4'
    ]
)
ON CONFLICT (id) DO UPDATE
    SET file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;
