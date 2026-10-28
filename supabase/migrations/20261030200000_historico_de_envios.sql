-- Histórico de envios de conversão: leitura só para administradores e reenvio com trilha.
--
-- Estado antes desta migration (medido em produção):
--   * `conversion_dispatches` guarda cada conversão enviada à Meta e ao Google, mas nenhuma tela a lia;
--   * uma conversão que falha fica em `failed` PARA SEMPRE: o despachante só reserva `pending`, então
--     um erro de rede ou de configuração perdia a venda para a mídia sem ninguém ver;
--   * a política de leitura deixava qualquer membro (inclusive visualizador) ler os resultados,
--     que trazem o corpo enviado à Meta (contato em hash) e o `ctwa_clid`.
--
-- O que muda:
--   1. leitura só de dono/administrador;
--   2. `reenviar_conversoes(p_ids)`: devolve para a fila as conversões com falha (ou em ensaio),
--      zera as tentativas, conta o reenvio e deixa registro em `audit_logs`.
--      Meta e Google deduplicam pelo mesmo `event_id`, então reenviar um evento que já chegou
--      a um dos destinos não o conta duas vezes.

ALTER TABLE public.conversion_dispatches
  ADD COLUMN IF NOT EXISTS reenvios integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reenviado_em timestamptz,
  ADD COLUMN IF NOT EXISTS reenviado_por uuid;

DROP POLICY IF EXISTS conv_dispatch_membro ON public.conversion_dispatches;
DROP POLICY IF EXISTS conv_dispatch_admin ON public.conversion_dispatches;
CREATE POLICY conv_dispatch_admin ON public.conversion_dispatches
  FOR SELECT TO authenticated USING (public.eh_admin_da_empresa(company_id));

CREATE OR REPLACE FUNCTION public.reenviar_conversoes(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n integer;
BEGIN
  IF p_ids IS NULL OR coalesce(array_length(p_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;
  IF array_length(p_ids, 1) > 50 THEN
    RAISE EXCEPTION 'no máximo 50 conversões por vez' USING ERRCODE = '22023';
  END IF;

  WITH alvo AS (
    SELECT d.id
      FROM public.conversion_dispatches d
     WHERE d.id = ANY (p_ids)
       AND d.status IN ('failed', 'rehearsal')
       AND (public.chamada_de_servidor() OR public.eh_admin_da_empresa(d.company_id))
     FOR UPDATE
  ), mudou AS (
    UPDATE public.conversion_dispatches d
       SET status = 'pending',
           attempts = 0,
           reservado_ate = NULL,
           reenvios = d.reenvios + 1,
           reenviado_em = now(),
           reenviado_por = auth.uid()
      FROM alvo
     WHERE d.id = alvo.id
    RETURNING d.id, d.company_id
  ), trilha AS (
    INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, changes)
    SELECT m.company_id, auth.uid(), 'conversao_reenviada', 'conversao', m.id, '{}'::jsonb
      FROM mudou m
  )
  SELECT count(*) INTO v_n FROM mudou;

  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.reenviar_conversoes(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reenviar_conversoes(uuid[]) TO authenticated, service_role;
