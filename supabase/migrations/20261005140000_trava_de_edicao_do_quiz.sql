-- Trava de edição do quiz, com pedido de controle.
--
-- Hoje dois editores no mesmo quiz se sobrescrevem EM SILÊNCIO: cada aba tem o
-- seu `schema` em memória e o autosave de 1,2s grava o estado inteiro: quem
-- salvar por último apaga o trabalho do outro sem nenhum aviso aos dois.
--
-- Não é edição simultânea (CRDT) — é posse exclusiva com transferência. Uma aba
-- segura a edição e bate o coração periodicamente; as outras ficam em leitura e
-- podem PEDIR o controle. O dono vê o pedido e entrega, ou a trava vence sozinha
-- se a aba dona sumiu (fechou o navegador, caiu a rede, dormiu a máquina).

CREATE TABLE IF NOT EXISTS public.quiz_edit_locks (
  quiz_id uuid PRIMARY KEY REFERENCES quiz_funnels(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  holder_user_id uuid NOT NULL,
  holder_name text,
  -- Duas abas do MESMO usuário também disputam: o conflito é entre abas, não
  -- entre pessoas, e foi assim que o inlead nomeou ("em uso por outra aba").
  holder_tab_id text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  requester_user_id uuid,
  requester_name text,
  requester_tab_id text,
  requested_at timestamptz
);

ALTER TABLE public.quiz_edit_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quiz_edit_locks membros" ON public.quiz_edit_locks;
CREATE POLICY "quiz_edit_locks membros" ON public.quiz_edit_locks
  FOR ALL TO authenticated
  USING (check_membership(company_id))
  WITH CHECK (check_membership(company_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_edit_locks TO authenticated;

-- 75 segundos: o coração bate a cada 25s, então a trava só vence depois de três
-- batidas perdidas. Um número menor derrubaria o editor de quem só ficou uns
-- segundos sem rede.
CREATE OR REPLACE FUNCTION public.quiz_lock_expirou(p_heartbeat timestamptz)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_heartbeat < now() - interval '75 seconds';
$$;

/**
 * Tenta tomar/renovar a trave. Devolve a linha vigente, seja ela sua ou não —
 * quem chama decide o que mostrar comparando `holder_tab_id` com o próprio.
 *
 * `p_forcar` só é aceito quando houve pedido de controle dessa mesma aba e o
 * dono teve tempo de responder; isso vive na chamada, não aqui, porque a regra
 * de cortesia é de interface. O que o banco garante é a exclusão mútua.
 */
CREATE OR REPLACE FUNCTION public.quiz_lock_adquirir(
  p_quiz_id uuid,
  p_tab_id text,
  p_nome text DEFAULT NULL,
  p_forcar boolean DEFAULT false
)
RETURNS public.quiz_edit_locks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_lock quiz_edit_locks;
BEGIN
  SELECT company_id INTO v_company_id FROM quiz_funnels WHERE id = p_quiz_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'quiz inexistente';
  END IF;
  IF NOT check_membership(v_company_id) THEN
    RAISE EXCEPTION 'sem acesso a este quiz';
  END IF;

  -- Serializa as tentativas concorrentes do mesmo quiz. Sem isto, duas abas
  -- que abrem no mesmo instante leem "livre" as duas e as duas inserem.
  PERFORM pg_advisory_xact_lock(hashtextextended('quiz_lock:' || p_quiz_id::text, 0));

  SELECT * INTO v_lock FROM quiz_edit_locks WHERE quiz_id = p_quiz_id;

  IF v_lock.quiz_id IS NULL THEN
    INSERT INTO quiz_edit_locks (quiz_id, company_id, holder_user_id, holder_name, holder_tab_id)
    VALUES (p_quiz_id, v_company_id, auth.uid(), p_nome, p_tab_id)
    RETURNING * INTO v_lock;
    RETURN v_lock;
  END IF;

  -- Já é minha: renova o coração e nada mais muda.
  IF v_lock.holder_tab_id = p_tab_id THEN
    UPDATE quiz_edit_locks SET heartbeat_at = now()
     WHERE quiz_id = p_quiz_id
     RETURNING * INTO v_lock;
    RETURN v_lock;
  END IF;

  -- De outra aba: só assume se ela sumiu, ou se o controle foi pedido por mim
  -- e a interface já esperou o dono responder.
  IF quiz_lock_expirou(v_lock.heartbeat_at)
     OR (p_forcar AND v_lock.requester_tab_id = p_tab_id) THEN
    UPDATE quiz_edit_locks SET
      holder_user_id = auth.uid(),
      holder_name = p_nome,
      holder_tab_id = p_tab_id,
      acquired_at = now(),
      heartbeat_at = now(),
      requester_user_id = NULL,
      requester_name = NULL,
      requester_tab_id = NULL,
      requested_at = NULL
    WHERE quiz_id = p_quiz_id
    RETURNING * INTO v_lock;
  END IF;

  RETURN v_lock;
END;
$$;

/** Registra "quero o controle". O dono vê na próxima batida do coração. */
CREATE OR REPLACE FUNCTION public.quiz_lock_pedir(
  p_quiz_id uuid,
  p_tab_id text,
  p_nome text DEFAULT NULL
)
RETURNS public.quiz_edit_locks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lock quiz_edit_locks;
BEGIN
  SELECT l.* INTO v_lock
    FROM quiz_edit_locks l
    JOIN quiz_funnels q ON q.id = l.quiz_id
   WHERE l.quiz_id = p_quiz_id
     AND check_membership(q.company_id);
  IF v_lock.quiz_id IS NULL THEN
    RAISE EXCEPTION 'sem trava para este quiz';
  END IF;

  UPDATE quiz_edit_locks SET
    requester_user_id = auth.uid(),
    requester_name = p_nome,
    requester_tab_id = p_tab_id,
    requested_at = now()
  WHERE quiz_id = p_quiz_id
  RETURNING * INTO v_lock;

  RETURN v_lock;
END;
$$;

/** Entrega a edição: só a aba dona solta, e só ela. */
CREATE OR REPLACE FUNCTION public.quiz_lock_soltar(p_quiz_id uuid, p_tab_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM quiz_edit_locks l
   USING quiz_funnels q
   WHERE l.quiz_id = p_quiz_id
     AND q.id = l.quiz_id
     AND l.holder_tab_id = p_tab_id
     AND check_membership(q.company_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.quiz_lock_adquirir(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quiz_lock_pedir(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quiz_lock_soltar(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quiz_lock_expirou(timestamptz) TO authenticated;
