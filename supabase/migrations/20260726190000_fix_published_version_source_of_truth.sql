-- Corrige o "Quiz não encontrado" no link público.
--
-- Havia DUAS fontes de verdade para "qual versão está no ar":
--
--   quiz_funnels.published_version_id  -> o que o app pede ao carregar
--   quiz_versions.is_published         -> o que o RLS deixa o anônimo ler
--
-- Elas podem desencontrar. `publish()` lê "a última versão", grava o ponteiro
-- no funil e depois marca a flag na versão — dois passos, sem transação. Com o
-- autosave criando versão nova entre um passo e outro, o ponteiro ficou na 49 e
-- a flag na 50. O app pedia a 49, o banco só liberava a 50: o visitante recebia
-- schema vazio e a tela de "Quiz não encontrado". Quem estava logado não via o
-- problema, porque a política de membro ignora a flag.
--
-- A correção tira a flag da decisão: o anônimo passa a enxergar exatamente a
-- versão para onde o funil aponta. Uma fonte de verdade só, impossível divergir.

-- 1) Sincroniza o estado atual (destrava o que está no ar agora).
UPDATE public.quiz_versions v
SET is_published = (v.id = q.published_version_id)
FROM public.quiz_funnels q
WHERE v.quiz_id = q.id
  AND v.is_published IS DISTINCT FROM (v.id = q.published_version_id);

-- 2) A política anônima passa a derivar do ponteiro do funil.
DROP POLICY IF EXISTS "quiz_versions public read published" ON public.quiz_versions;

CREATE POLICY "quiz_versions public read published"
  ON public.quiz_versions
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.quiz_funnels q
      WHERE q.id = quiz_versions.quiz_id
        AND q.status = 'published'
        AND q.published_version_id = quiz_versions.id
    )
  );

-- Índice para o EXISTS acima não virar seq scan em cada carregamento público.
CREATE INDEX IF NOT EXISTS idx_quiz_funnels_published_version
  ON public.quiz_funnels (published_version_id)
  WHERE published_version_id IS NOT NULL;
