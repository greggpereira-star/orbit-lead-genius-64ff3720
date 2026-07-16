
-- Membros da empresa podem enviar arquivos na pasta da empresa
CREATE POLICY "quiz_media_insert_company_members"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'quiz-media'
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.company_id::text = (storage.foldername(name))[1]
  )
);

-- Membros da empresa podem atualizar arquivos da pasta da empresa
CREATE POLICY "quiz_media_update_company_members"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'quiz-media'
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.company_id::text = (storage.foldername(name))[1]
  )
);

-- Membros da empresa podem apagar arquivos da pasta da empresa
CREATE POLICY "quiz_media_delete_company_members"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'quiz-media'
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.company_id::text = (storage.foldername(name))[1]
  )
);

-- Membros podem ler os próprios arquivos (leitura pública é via signed URLs)
CREATE POLICY "quiz_media_select_company_members"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'quiz-media'
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.company_id::text = (storage.foldername(name))[1]
  )
);
